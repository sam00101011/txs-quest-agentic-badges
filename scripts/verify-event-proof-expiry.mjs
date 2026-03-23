import { readFile } from "node:fs/promises";

import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  http,
  parseSignature
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import { signOracleEventProofPackage } from "../web/unlockAdapters.js";

const DEFAULT_EVENT_SIGNER_PRIVATE_KEY =
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";

function createChainConfig(chainId, rpcUrl) {
  return defineChain({
    id: Number(chainId),
    name: `Agentic Local ${chainId}`,
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

async function main() {
  const deployment = JSON.parse(await readFile(DEFAULT_DEPLOYMENT_PATH, "utf8"));
  const definitionId = Number(deployment?.seeded?.eventProofDefinitionId);
  const badgeRegistryAddress = deployment.badgeRegistryAddress;
  const agent = deployment.deployer;

  if (!Number.isInteger(definitionId)) {
    throw new Error("Could not resolve the seeded event badge definition from the local deployment.");
  }

  const publicClient = createPublicClient({
    chain: createChainConfig(deployment.chainId, deployment.rpcUrl),
    transport: http(deployment.rpcUrl)
  });
  const signerAccount = privateKeyToAccount(DEFAULT_EVENT_SIGNER_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const expiredProofPackage = await signOracleEventProofPackage({
    badgeRegistryAddress,
    definitionId,
    agent,
    account: signerAccount,
    eventSlug: "expired-proof-check",
    note: "Expired proof regression check",
    issuedAt: now - 7200,
    expiresAt: now - 3600
  });
  const { r, s, v } = parseSignature(expiredProofPackage.signature);
  const encodedProof = encodeAbiParameters(
    [
      { type: "uint64" },
      { type: "uint64" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint8" }
    ],
    [expiredProofPackage.issuedAt, expiredProofPackage.expiresAt, r, s, v]
  );

  try {
    await publicClient.simulateContract({
      account: agent,
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "claim",
      args: [BigInt(definitionId), encodedProof]
    });
  } catch (error) {
    const shortMessage =
      error?.shortMessage || error?.cause?.shortMessage || error?.message || "Unknown failure";
    const detailText = [
      shortMessage,
      error?.details,
      error?.cause?.details,
      error?.cause?.data,
      error?.data
    ]
      .filter(Boolean)
      .join(" ");
    process.stdout.write(
      `${JSON.stringify(
        {
          badgeRegistryAddress,
          definitionId,
          agent,
          shortMessage
        },
        null,
        2
      )}\n`
    );

    if (/expired/i.test(detailText) || detailText.includes("0x06c09405")) {
      return;
    }

    throw error;
  }

  throw new Error("Expected the expired oracle event proof to fail onchain simulation.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
