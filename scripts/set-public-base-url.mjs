import { readFile, writeFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { badgeAssetRegistryAbi, agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import { BADGE_CATALOG } from "../web/badgeCatalog.js";

const DEFAULT_DEPLOYMENT_PATH = "web/public/networks/tempo-moderato.json";

function readArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function normalizePrivateKey(value) {
  if (!value) {
    throw new Error("Add --private-key or PRIVATE_KEY.");
  }

  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizeBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error("Add --base-url or PUBLIC_APP_URL.");
  }

  return trimmed.replace(/\/$/, "");
}

function normalizeAddress(value, label) {
  const trimmed = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`Add a valid ${label} address.`);
  }

  return trimmed;
}

function createChain(chainId, rpcUrl, networkName = "agentic") {
  return defineChain({
    id: Number(chainId),
    name: networkName,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    }
  });
}

function deriveDeploymentUrl(deploymentPath, deployment) {
  if (deployment?.deploymentProfileUrl) {
    return deployment.deploymentProfileUrl;
  }

  const normalizedPath = String(deploymentPath).replace(/\\/g, "/");
  const absoluteMarker = "/web/public/";
  const relativeMarker = "web/public/";
  const markerIndex = normalizedPath.includes(absoluteMarker)
    ? normalizedPath.indexOf(absoluteMarker)
    : normalizedPath.indexOf(relativeMarker);
  const markerLength = normalizedPath.includes(absoluteMarker)
    ? absoluteMarker.length
    : relativeMarker.length;
  if (markerIndex === -1) {
    return "";
  }

  return `/${normalizedPath.slice(markerIndex + markerLength)}`;
}

function normalizeClaimPageBaseUri(value, baseUrl, deploymentUrl) {
  const trimmed = String(value ?? "").trim();
  if (trimmed) {
    return trimmed;
  }

  return buildClaimPageBaseUri(baseUrl, deploymentUrl);
}

function buildClaimPageBaseUri(baseUrl, deploymentUrl) {
  const url = new URL("/", `${baseUrl}/`);
  if (deploymentUrl) {
    url.searchParams.set("deployment", deploymentUrl);
  }
  return url.toString();
}

function buildDetailUri(baseUrl, deploymentUrl, slug) {
  const url = new URL("/", `${baseUrl}/`);
  if (deploymentUrl) {
    url.searchParams.set("deployment", deploymentUrl);
  }
  url.searchParams.set("badge", slug);
  return url.toString();
}

async function loadDeployment(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const deploymentPath = String(args.deployment ?? DEFAULT_DEPLOYMENT_PATH);
  const deployment = await loadDeployment(deploymentPath);
  const baseUrl = normalizeBaseUrl(
    args["base-url"] ?? process.env.PUBLIC_APP_URL ?? deployment.viewerBaseUrl
  );
  const deploymentUrl = String(
    args["deployment-url"] ?? deriveDeploymentUrl(deploymentPath, deployment)
  );
  const claimPageBaseUri = normalizeClaimPageBaseUri(
    args["claim-page-base-uri"],
    baseUrl,
    deploymentUrl
  );
  const privateKey = normalizePrivateKey(args["private-key"] ?? process.env.PRIVATE_KEY);
  const badgeRegistryAddress = normalizeAddress(
    deployment.badgeRegistryAddress,
    "badge registry"
  );
  const assetRegistryAddress = normalizeAddress(
    deployment.assetRegistryAddress,
    "asset registry"
  );
  const rpcUrl = String(deployment.rpcUrl ?? "").trim();
  const chainId = Number(deployment.chainId ?? 31337);
  const networkName = String(deployment.network?.name ?? deployment.networkName ?? "agentic");
  const account = privateKeyToAccount(privateKey);
  const chain = createChain(chainId, rpcUrl, networkName);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });

  const currentClaimPageBaseUri = await publicClient.readContract({
    address: badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "claimPageBaseUri"
  });

  let claimPageUpdated = false;
  let claimPageTxHash = "";
  if (currentClaimPageBaseUri !== claimPageBaseUri) {
    claimPageTxHash = await walletClient.writeContract({
      account,
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "setClaimPageBaseUri",
      args: [claimPageBaseUri]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: claimPageTxHash });
    if (receipt.status !== "success") {
      throw new Error("Claim page base URI update reverted.");
    }
    claimPageUpdated = true;
  }

  const nameToSlug = new Map(
    BADGE_CATALOG.map((entry) => [entry.name.trim().toLowerCase(), entry.slug])
  );
  const nextDefinitionId = Number(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "nextDefinitionId"
    })
  );

  const assetUpdateResults = [];
  const seenAssetIds = new Set();

  for (let index = 0; index < nextDefinitionId; index += 1) {
    const definition = await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "definitions",
      args: [BigInt(index)]
    });
    const assetId = Number(definition[3]);
    if (seenAssetIds.has(assetId)) {
      continue;
    }
    seenAssetIds.add(assetId);

    const slug = nameToSlug.get(String(definition[1] ?? "").trim().toLowerCase());
    if (!slug) {
      assetUpdateResults.push({
        definitionId: index,
        assetId,
        action: "skipped",
        reason: "no-known-slug"
      });
      continue;
    }

    const asset = await publicClient.readContract({
      address: assetRegistryAddress,
      abi: badgeAssetRegistryAbi,
      functionName: "getAsset",
      args: [BigInt(assetId)]
    });
    const nextDetailUri = buildDetailUri(baseUrl, deploymentUrl, slug);
    if (asset.detailUri === nextDetailUri) {
      assetUpdateResults.push({
        definitionId: index,
        assetId,
        action: "unchanged",
        detailUri: nextDetailUri
      });
      continue;
    }

    const txHash = await walletClient.writeContract({
      account,
      address: assetRegistryAddress,
      abi: badgeAssetRegistryAbi,
      functionName: "updateAsset",
      args: [
        BigInt(assetId),
        {
          videoUri: asset.videoUri,
          posterUri: asset.posterUri,
          detailUri: nextDetailUri,
          videoHash: asset.videoHash,
          posterHash: asset.posterHash,
          edition: asset.edition,
          loopSeconds: Number(asset.loopSeconds)
        }
      ]
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`Asset update reverted for asset ${assetId}.`);
    }

    assetUpdateResults.push({
      definitionId: index,
      assetId,
      action: "updated",
      detailUri: nextDetailUri,
      txHash
    });
  }

  const nextDeployment = {
    ...deployment,
    claimPageBaseUri,
    viewerBaseUrl: baseUrl,
    services: {
      ...(deployment.services ?? {}),
      viewer: {
        ...(deployment.services?.viewer ?? {}),
        baseUrl,
        claimPageBaseUri
      }
    }
  };

  await writeFile(deploymentPath, `${JSON.stringify(nextDeployment, null, 2)}\n`);

  process.stdout.write(
    `${JSON.stringify(
      {
        deploymentPath,
        baseUrl,
        deploymentUrl,
        claimPageBaseUri,
        claimPageUpdated,
        claimPageTxHash,
        assetUpdates: assetUpdateResults
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
