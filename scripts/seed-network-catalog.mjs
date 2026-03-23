import { readFile, writeFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { agenticBadgeRegistryAbi, badgeAssetRegistryAbi } from "../web/contractAbis.js";
import { buildCatalogDefinitions } from "../web/badgeCatalog.js";
import { buildAdvancedPolicyPayload } from "../web/badgePolicies.js";
import { buildUnlockAdapterPayload } from "../web/unlockAdapters.js";

const DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";

const BADGE_TYPE_ENUMS = {
  EVENT: 0,
  ACHIEVEMENT: 1,
  CUSTOM: 2
};

const VERIFICATION_TYPE_ENUMS = {
  ONCHAIN_STATE: 0,
  MERKLE_PROOF: 1,
  ORACLE_ATTESTATION: 2,
  AGENT_ATTESTATION: 3
};
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

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

function normalizeAddress(value, label) {
  const trimmed = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`Add a valid ${label} address.`);
  }

  return trimmed;
}

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: Number(chainId),
    name: `Agentic Chain ${chainId}`,
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

function createRpcFetch() {
  if (typeof Bun === "undefined") {
    return undefined;
  }

  return async (url, args = {}) =>
    fetch(String(url), {
      method: args.method,
      headers: args.headers,
      body: args.body
    });
}

function deriveDeploymentUrl(deploymentPath, deployment) {
  if (deployment?.deploymentProfileUrl) {
    return deployment.deploymentProfileUrl;
  }

  const marker = "/web/public/";
  const normalizedPath = String(deploymentPath).replace(/\\/g, "/");
  const markerIndex = normalizedPath.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  return `/${normalizedPath.slice(markerIndex + marker.length)}`;
}

function normalizeDefinitionRecord(definition) {
  if (!Array.isArray(definition)) {
    return definition;
  }

  return {
    id: Number(definition[0]),
    name: String(definition[1] ?? ""),
    description: String(definition[2] ?? "")
  };
}

function findEventArg({ abi, receipt, eventName, argName }) {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics
      });
      if (decoded.eventName === eventName) {
        return decoded.args[argName];
      }
    } catch {
      // Ignore unrelated logs.
    }
  }

  throw new Error(`Could not find ${eventName} in the transaction receipt.`);
}

async function loadDeployment(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function loadExistingDefinitionNames(publicClient, badgeRegistryAddress, nextDefinitionId) {
  const existingDefinitions = await Promise.all(
    Array.from({ length: nextDefinitionId }, (_, index) =>
      publicClient.readContract({
        address: badgeRegistryAddress,
        abi: agenticBadgeRegistryAbi,
        functionName: "definitions",
        args: [BigInt(index)]
      })
    )
  );

  return new Set(
    existingDefinitions
      .map((definition) => normalizeDefinitionRecord(definition).name.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const deploymentPath = String(args.deployment ?? DEFAULT_DEPLOYMENT_PATH);
  const deployment = await loadDeployment(deploymentPath);
  const rpcUrl = String(args["rpc-url"] ?? deployment.rpcUrl ?? "").trim();
  const chainId = Number(args["chain-id"] ?? deployment.chainId ?? 31337);
  const badgeRegistryAddress = normalizeAddress(
    args["badge-registry-address"] ?? deployment.badgeRegistryAddress,
    "badge registry"
  );
  const assetRegistryAddress = normalizeAddress(
    args["asset-registry-address"] ?? deployment.assetRegistryAddress,
    "asset registry"
  );
  const privateKey = normalizePrivateKey(
    args["private-key"] ?? process.env.PRIVATE_KEY ?? DEFAULT_PRIVATE_KEY
  );
  const account = privateKeyToAccount(privateKey);
  const viewerBaseUrl = String(
    args["viewer-base-url"] ?? deployment.viewerBaseUrl ?? deployment.services?.viewer?.baseUrl ?? ""
  ).replace(/\/$/, "");
  const deploymentUrl = String(args["deployment-url"] ?? deriveDeploymentUrl(deploymentPath, deployment));
  const detailBaseUrl = viewerBaseUrl || "";
  const oracleSignerAddress = normalizeAddress(
    args["event-signer-address"] ??
      deployment.eventSignerAddress ??
      deployment.deployer ??
      account.address,
    "event signer"
  );
  const tokenBalanceAddress = normalizeAddress(
    args["balance-token-address"] ??
      deployment.balanceTokenAddress ??
      deployment.tokens?.balanceToken ??
      badgeRegistryAddress,
    "balance token"
  );

  if (!rpcUrl) {
    throw new Error("Add --rpc-url or include rpcUrl in the deployment manifest.");
  }

  const chain = createChain(chainId, rpcUrl);
  const rpcFetch = createRpcFetch();
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, rpcFetch ? { fetchFn: rpcFetch } : {})
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl, rpcFetch ? { fetchFn: rpcFetch } : {})
  });

  const nextDefinitionId = Number(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "nextDefinitionId"
    })
  );
  const existingNames = await loadExistingDefinitionNames(
    publicClient,
    badgeRegistryAddress,
    nextDefinitionId
  );
  const catalogDefinitions = buildCatalogDefinitions({
    badgeRegistryAddress,
    oracleSignerAddress,
    tokenBalanceAddress
  });
  const seededDefinitions = [];
  const skippedDefinitions = [];

  for (const catalogDefinition of catalogDefinitions) {
    const normalizedName = catalogDefinition.name.trim().toLowerCase();
    if (existingNames.has(normalizedName)) {
      skippedDefinitions.push(catalogDefinition.name);
      continue;
    }

    const detailUri =
      detailBaseUrl && deploymentUrl
        ? `${detailBaseUrl}/index.html?deployment=${encodeURIComponent(deploymentUrl)}&badge=${catalogDefinition.slug}`
        : detailBaseUrl
          ? `${detailBaseUrl}/index.html?badge=${catalogDefinition.slug}`
          : catalogDefinition.asset.detailUri;

    const registerAssetHash = await walletClient.writeContract({
      account,
      address: assetRegistryAddress,
      abi: badgeAssetRegistryAbi,
      functionName: "registerAsset",
      args: [
        {
          ...catalogDefinition.asset,
          detailUri,
          videoHash: catalogDefinition.asset.videoHash || ZERO_BYTES32,
          posterHash: catalogDefinition.asset.posterHash || ZERO_BYTES32
        }
      ]
    });
    const registerAssetReceipt = await publicClient.waitForTransactionReceipt({
      hash: registerAssetHash
    });
    if (registerAssetReceipt.status !== "success") {
      throw new Error(`Asset registration reverted for ${catalogDefinition.name}.`);
    }

    const assetId = Number(
      findEventArg({
        abi: badgeAssetRegistryAbi,
        receipt: registerAssetReceipt,
        eventName: "AssetRegistered",
        argName: "assetId"
      })
    );
    const unlockPayload = buildUnlockAdapterPayload(
      {
        ...catalogDefinition,
        ...catalogDefinition.asset
      },
      {
        fallbackTargetAddress: badgeRegistryAddress
      }
    );
    const proofContext =
      unlockPayload.unlockAdapterConfig?.farcasterCriteriaHash ||
      unlockPayload.unlockAdapterConfig?.oracleCriteriaHash ||
      unlockPayload.unlockAdapterConfig?.paymentCriteriaHash ||
      unlockPayload.unlockAdapterConfig?.x402CriteriaHash ||
      "";
    const requiresAdvancedPolicy =
      catalogDefinition.verificationType === "ORACLE_ATTESTATION" &&
      catalogDefinition.unlockAdapterType !== "ORACLE_EVENT";
    const advancedPolicyPayload = catalogDefinition.advancedPolicy && catalogDefinition.advancedPolicy !== "0x"
      ? {
          advancedPolicy: catalogDefinition.advancedPolicy
        }
      : requiresAdvancedPolicy
      ? buildAdvancedPolicyPayload({
          ...catalogDefinition,
          ...unlockPayload.unlockAdapterConfig,
          unlockAdapterType: catalogDefinition.unlockAdapterType,
          advancedPolicyEnabled: true,
          advancedPolicyRequiredIssuer: unlockPayload.unlockAdapterConfig?.unlockSignerAddress ?? "",
          advancedPolicyContext: proofContext,
          advancedPolicyConfig: catalogDefinition.advancedPolicyConfig ?? {}
        })
      : { advancedPolicy: "0x" };

    const defineBadgeHash = await walletClient.writeContract({
      account,
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "defineBadge",
      args: [
        catalogDefinition.name,
        catalogDefinition.description,
        BigInt(assetId),
        BADGE_TYPE_ENUMS[catalogDefinition.badgeType] ?? BADGE_TYPE_ENUMS.CUSTOM,
        VERIFICATION_TYPE_ENUMS[unlockPayload.verificationType] ??
          VERIFICATION_TYPE_ENUMS.ONCHAIN_STATE,
        unlockPayload.verificationData,
        BigInt(Number(catalogDefinition.maxClaims) || 0),
        0n,
        advancedPolicyPayload.advancedPolicy
      ]
    });
    const defineBadgeReceipt = await publicClient.waitForTransactionReceipt({
      hash: defineBadgeHash
    });
    if (defineBadgeReceipt.status !== "success") {
      throw new Error(`Badge definition reverted for ${catalogDefinition.name}.`);
    }

    const definitionId = Number(
      findEventArg({
        abi: agenticBadgeRegistryAbi,
        receipt: defineBadgeReceipt,
        eventName: "BadgeDefined",
        argName: "defId"
      })
    );

    seededDefinitions.push({
      slug: catalogDefinition.slug,
      name: catalogDefinition.name,
      assetId,
      definitionId,
      assetTxHash: registerAssetHash,
      definitionTxHash: defineBadgeHash
    });
    existingNames.add(normalizedName);
  }

  const finalDefinitionCount = Number(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "nextDefinitionId"
    })
  );
  let activeDefinitionCount = 0;
  for (let index = 0; index < finalDefinitionCount; index += 1) {
    const definition = await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "definitions",
      args: [BigInt(index)]
    });
    if (definition[11]) {
      activeDefinitionCount += 1;
    }
  }
  const nextManifest = {
    ...deployment,
    seeded: {
      ...(deployment.seeded ?? {}),
      catalogSize: finalDefinitionCount,
      activeCatalogSize: activeDefinitionCount,
      seededAt: new Date().toISOString()
    }
  };
  await writeFile(deploymentPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  process.stdout.write(
    `${JSON.stringify(
      {
        deploymentPath,
        badgeRegistryAddress,
        assetRegistryAddress,
        seededCount: seededDefinitions.length,
        skippedCount: skippedDefinitions.length,
        finalDefinitionCount,
        activeDefinitionCount,
        seededDefinitions,
        skippedDefinitions
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
