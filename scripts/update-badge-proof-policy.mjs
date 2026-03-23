import { readFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildAdvancedPolicyPayload, decodeAdvancedPolicyConfig } from "../web/badgePolicies.js";
import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import { buildUnlockAdapterPayload, decodeUnlockAdapterConfig } from "../web/unlockAdapters.js";

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";

const VERIFICATION_TYPE_NAMES = {
  0: "ONCHAIN_STATE",
  1: "MERKLE_PROOF",
  2: "ORACLE_ATTESTATION",
  3: "AGENT_ATTESTATION"
};

const VERIFICATION_TYPE_ENUMS = {
  ONCHAIN_STATE: 0,
  MERKLE_PROOF: 1,
  ORACLE_ATTESTATION: 2,
  AGENT_ATTESTATION: 3
};

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
    throw new Error("Missing private key.");
  }

  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizeAddress(value, label) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
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

function createRpcFetch() {
  if (typeof Bun === "undefined") {
    throw new Error("Run this operator tool with Bun so it can reach the local Tempo/Anvil RPC cleanly.");
  }

  return async (url, args = {}) =>
    fetch(String(url), {
      method: args.method,
      headers: args.headers,
      body: args.body
    });
}

async function loadDeployment(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

function normalizeDefinitionRecord(definition) {
  if (!Array.isArray(definition)) {
    return definition;
  }

  return {
    id: definition[0],
    name: definition[1],
    description: definition[2],
    assetId: definition[3],
    badgeType: definition[4],
    verificationType: definition[5],
    verificationData: definition[6],
    creator: definition[7],
    maxClaims: definition[8],
    claimCount: definition[9],
    expiresAt: definition[10],
    active: definition[11],
    advancedPolicy: definition[12]
  };
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
  if (!badgeRegistryAddress) {
    throw new Error("Add a badge registry address.");
  }

  const definitionId = Number(args["definition-id"]);
  if (!Number.isInteger(definitionId) || definitionId < 0) {
    throw new Error("Add a valid --definition-id.");
  }

  const privateKey = normalizePrivateKey(
    args["private-key"] ?? process.env.PRIVATE_KEY ?? DEFAULT_PRIVATE_KEY
  );
  const account = privateKeyToAccount(privateKey);
  const chain = createChain(chainId, rpcUrl);
  const rpcFetch = createRpcFetch();
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl, { fetchFn: rpcFetch })
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl, { fetchFn: rpcFetch })
  });

  const definition = normalizeDefinitionRecord(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "definitions",
      args: [BigInt(definitionId)]
    })
  );

  const currentVerificationType =
    VERIFICATION_TYPE_NAMES[Number(definition.verificationType)] ?? "ONCHAIN_STATE";
  const currentUnlockAdapter = decodeUnlockAdapterConfig(
    currentVerificationType,
    definition.verificationData
  );
  const unlockAdapterType = args["unlock-adapter"] ?? currentUnlockAdapter.unlockAdapterType;
  if (unlockAdapterType !== "ORACLE_EVENT" && unlockAdapterType !== "AGENT_REP") {
    throw new Error("This tool currently rotates proof policy only for ORACLE_EVENT or AGENT_REP badges.");
  }

  const currentAdvancedPolicy = decodeAdvancedPolicyConfig(definition.advancedPolicy, {
    requiredIssuer: currentUnlockAdapter.unlockSignerAddress
  });
  const disableAdvanced = Boolean(args["disable-advanced"]);
  const requiredIssuer = args["clear-required-issuer"]
    ? ""
    : normalizeAddress(
        args["required-issuer"] ?? currentAdvancedPolicy.requiredIssuer,
        "required issuer"
      );

  const policyInput = {
    unlockAdapterType,
    unlockTargetAddress: currentUnlockAdapter.unlockTargetAddress,
    unlockThreshold: args.threshold ?? currentUnlockAdapter.unlockThreshold,
    unlockSignerAddress:
      unlockAdapterType === "ORACLE_EVENT"
        ? requiredIssuer || currentUnlockAdapter.unlockSignerAddress
        : currentUnlockAdapter.unlockSignerAddress,
    advancedPolicyEnabled: !disableAdvanced,
    advancedPolicyConfig: {
      ...currentAdvancedPolicy,
      enabled: !disableAdvanced,
      ruleKind: unlockAdapterType === "AGENT_REP" ? "AGENT_8183" : "ORACLE_8183",
      requiredIssuer,
      contextInput:
        args["context-id"] ??
        args.context ??
        currentAdvancedPolicy.contextId ??
        currentAdvancedPolicy.contextInput ??
        "",
      schemaInput:
        args["schema-id"] ??
        args.schema ??
        currentAdvancedPolicy.schemaId ??
        currentAdvancedPolicy.schemaInput ??
        "",
      maxAge: args["max-age"] ?? currentAdvancedPolicy.maxAge ?? "0",
      requireExpiry: args["no-expiry"] ? false : currentAdvancedPolicy.requireExpiry ?? true,
      nonceScope: args["nonce-scope"] ?? currentAdvancedPolicy.nonceScope ?? "GLOBAL"
    }
  };

  const unlockPayload = buildUnlockAdapterPayload(policyInput, {
    fallbackTargetAddress: badgeRegistryAddress
  });
  const advancedPolicyPayload = disableAdvanced
    ? { advancedPolicy: "0x", advancedPolicyConfig: policyInput.advancedPolicyConfig }
    : buildAdvancedPolicyPayload({
        ...policyInput,
        unlockSignerAddress: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
        unlockThreshold: unlockPayload.unlockAdapterConfig.unlockThreshold,
        unlockAdapterType: unlockPayload.unlockAdapterType
      });

  const txHash = await walletClient.writeContract({
    account,
    address: badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "updateBadgeVerification",
    args: [
      BigInt(definitionId),
      VERIFICATION_TYPE_ENUMS[unlockPayload.verificationType] ?? VERIFICATION_TYPE_ENUMS.ONCHAIN_STATE,
      unlockPayload.verificationData,
      advancedPolicyPayload.advancedPolicy
    ]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Badge verification update transaction reverted.");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        txHash,
        definitionId,
        unlockAdapterType: unlockPayload.unlockAdapterType,
        verificationType: unlockPayload.verificationType,
        requiredIssuer: advancedPolicyPayload.advancedPolicyConfig?.requiredIssuer ?? "",
        contextId: advancedPolicyPayload.advancedPolicyConfig?.contextId ?? "",
        schemaId: advancedPolicyPayload.advancedPolicyConfig?.schemaId ?? "",
        nonceScope: advancedPolicyPayload.advancedPolicyConfig?.nonceScope ?? "GLOBAL",
        maxAge: advancedPolicyPayload.advancedPolicyConfig?.maxAge ?? "0",
        advancedPolicyEnabled: !disableAdvanced
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
