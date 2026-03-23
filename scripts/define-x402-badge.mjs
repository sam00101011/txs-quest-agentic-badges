import { readFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  DEFAULT_PAYMENT_8183_SCHEMA,
  DEFAULT_X402_8183_SCHEMA,
  buildAdvancedPolicyPayload
} from "../web/badgePolicies.js";
import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import { buildUnlockAdapterPayload } from "../web/unlockAdapters.js";

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";

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
    id: chainId,
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

async function loadDeployment(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const deploymentPath = String(args.deployment ?? DEFAULT_DEPLOYMENT_PATH);
  const deployment = args["badge-registry-address"] ? null : await loadDeployment(deploymentPath);

  const rpcUrl = String(args["rpc-url"] ?? deployment?.rpcUrl ?? DEFAULT_RPC_URL);
  const chainId = Number(args["chain-id"] ?? deployment?.chainId ?? DEFAULT_CHAIN_ID);
  const badgeRegistryAddress = normalizeAddress(
    args["badge-registry-address"] ?? deployment?.badgeRegistryAddress,
    "badge registry"
  );
  const signerAddress = normalizeAddress(
    args["signer-address"] ?? deployment?.eventSignerAddress,
    "x402 signer"
  );
  const assetId = Number(args["asset-id"] ?? deployment?.seeded?.assetId ?? 0);
  const privateKey = normalizePrivateKey(
    args["private-key"] ?? process.env.PRIVATE_KEY ?? DEFAULT_PRIVATE_KEY
  );
  const account = privateKeyToAccount(privateKey);
  const chain = createChain(chainId, rpcUrl);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });
  const adapterType =
    String(args.adapter ?? args["unlock-adapter"] ?? "").trim().toUpperCase() === "PAYMENT_HISTORY"
      ? "PAYMENT_HISTORY"
      : "X402_HISTORY";

  const unlockPayload = buildUnlockAdapterPayload({
    unlockAdapterType: adapterType,
    unlockSignerAddress: signerAddress,
    unlockMetric: args.metric ?? "paid_requests",
    unlockThreshold: args.threshold ?? "2",
    unlockOrigins: args.origins ?? "",
    unlockWindowDays: args["window-days"] ?? "365",
    unlockIdentityMode: args["identity-mode"] ?? "WALLET_ONLY",
    unlockRailMode: args["rail-mode"] ?? (adapterType === "PAYMENT_HISTORY" ? "ANY" : "X402_ONLY"),
    unlockNote:
      args.note ??
      (adapterType === "PAYMENT_HISTORY"
        ? "Issued when the connected wallet meets the configured MPP + x402 payment history threshold."
        : "Issued when the connected wallet meets the configured x402 payment history threshold.")
  });

  const advancedPolicyPayload = buildAdvancedPolicyPayload({
    unlockAdapterType: adapterType,
    unlockSignerAddress: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
    advancedPolicyEnabled: true,
    advancedPolicyContext:
      unlockPayload.unlockAdapterConfig.paymentCriteriaHash ||
      unlockPayload.unlockAdapterConfig.x402CriteriaHash,
    advancedPolicySchema:
      adapterType === "PAYMENT_HISTORY"
        ? DEFAULT_PAYMENT_8183_SCHEMA
        : DEFAULT_X402_8183_SCHEMA,
    advancedPolicyRequiredIssuer: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
    advancedPolicyConfig: {
      enabled: true,
      contextInput:
        unlockPayload.unlockAdapterConfig.paymentCriteriaHash ||
        unlockPayload.unlockAdapterConfig.x402CriteriaHash,
      schemaInput:
        adapterType === "PAYMENT_HISTORY"
          ? DEFAULT_PAYMENT_8183_SCHEMA
          : DEFAULT_X402_8183_SCHEMA,
      requiredIssuer: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
      requireExpiry: true,
      nonceScope: "PER_SUBJECT",
      maxAge: "0"
    }
  });

  const nextDefinitionId = await publicClient.readContract({
    address: badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "nextDefinitionId"
  });

  const txHash = await walletClient.writeContract({
    account,
    address: badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "defineBadge",
    args: [
      String(args.name ?? (adapterType === "PAYMENT_HISTORY" ? "Cross-Rail Explorer" : "Paid Explorer")),
      String(
        args.description ??
          (adapterType === "PAYMENT_HISTORY"
            ? "Unlocked by wallets that meet a verified MPP + x402 payment history threshold."
            : "Unlocked by wallets that meet a verified x402 payment history threshold.")
      ),
      BigInt(assetId),
      BigInt(Number(args["badge-type"] ?? 1)),
      2n,
      unlockPayload.verificationData,
      BigInt(Number(args["max-claims"] ?? 0)),
      0n,
      advancedPolicyPayload.advancedPolicy
    ]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Payment-history badge definition transaction reverted.");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        txHash,
        definitionId: Number(nextDefinitionId),
        badgeRegistryAddress,
        assetId,
        signerAddress,
        adapterType,
        railMode: unlockPayload.unlockAdapterConfig.unlockRailMode || "",
        paymentCriteriaHash: unlockPayload.unlockAdapterConfig.paymentCriteriaHash || "",
        x402CriteriaHash: unlockPayload.unlockAdapterConfig.x402CriteriaHash,
        x402CriteriaJson: unlockPayload.unlockAdapterConfig.x402CriteriaJson,
        paymentCriteriaJson: unlockPayload.unlockAdapterConfig.paymentCriteriaJson || "",
        advancedSchema:
          adapterType === "PAYMENT_HISTORY"
            ? DEFAULT_PAYMENT_8183_SCHEMA
            : DEFAULT_X402_8183_SCHEMA
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
