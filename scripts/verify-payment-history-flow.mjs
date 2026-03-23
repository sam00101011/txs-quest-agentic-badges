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
  buildAdvancedPolicyPayload
} from "../web/badgePolicies.js";
import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import {
  buildDirectClaimProof,
  buildUnlockAdapterPayload
} from "../web/unlockAdapters.js";
import { createServer } from "./x402-proof-server.mjs";

const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";
const DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_MPP_PRIVATE_KEY =
  "0x2000000000000000000000000000000000000000000000000000000000000002";
const DEFAULT_HISTORY_PATH = "config/x402-history.sample.json";

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: Number(chainId),
    name: `Agentic Verify ${chainId}`,
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
  const seedHistory = JSON.parse(await readFile(DEFAULT_HISTORY_PATH, "utf8"));
  const account = privateKeyToAccount(DEFAULT_PRIVATE_KEY);
  const mppAccount = privateKeyToAccount(DEFAULT_MPP_PRIVATE_KEY);
  const chain = createChain(deployment.chainId, deployment.rpcUrl);
  const publicClient = createPublicClient({
    chain,
    transport: http(deployment.rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(deployment.rpcUrl)
  });
  const mppWalletClient = {
    async signMessage({ message }) {
      return mppAccount.signMessage({ message });
    }
  };

  const historyDatabase = {
    records: [
      {
        payer: account.address,
        rail: "x402",
        origin: "stableenrich.dev",
        amount: 0.07,
        timestamp: 1774156800,
        txHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
        description: "Connected wallet x402 call"
      },
      {
        payer: mppAccount.address,
        rail: "mpp",
        origin: "mint.agenticpoap.test",
        amount: 0.11,
        timestamp: 1774158600,
        txHash: "0x6666666666666666666666666666666666666666666666666666666666666666",
        description: "Linked MPP mint"
      },
      ...(Array.isArray(seedHistory.records) ? seedHistory.records : []).slice(0, 1)
    ]
  };

  const backendRequests = [];
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 8791,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/history/health") {
        return new Response(
          `${JSON.stringify({ status: "ok", records: historyDatabase.records.length }, null, 2)}\n`,
          {
            headers: {
              "content-type": "application/json; charset=utf-8"
            }
          }
        );
      }

      if (request.method !== "POST" || url.pathname !== "/api/history") {
        return new Response('{"detail":"Not found."}\n', {
          status: 404,
          headers: {
            "content-type": "application/json; charset=utf-8"
          }
        });
      }

      const payload = await request.json();
      backendRequests.push({
        walletAddress: payload.walletAddress,
        walletAddresses: payload.walletAddresses,
        criteriaHash: payload.criteriaHash
      });
      return new Response(
        `${JSON.stringify(
          {
            requestId: `payment-backend-${backendRequests.length}`,
            records: historyDatabase.records
          },
          null,
          2
        )}\n`,
        {
          headers: {
            "content-type": "application/json; charset=utf-8"
          }
        }
      );
    }
  });

  const server = await createServer({
    port: 8789,
    historySource: "http",
    historySourceUrl: `http://${backend.hostname}:${backend.port}/api/history`
  });

  try {
    const definitionId = Number(
      await publicClient.readContract({
        address: deployment.badgeRegistryAddress,
        abi: agenticBadgeRegistryAbi,
        functionName: "nextDefinitionId"
      })
    );

    const unlockPayload = buildUnlockAdapterPayload({
      unlockAdapterType: "PAYMENT_HISTORY",
      unlockSignerAddress: deployment.eventSignerAddress,
      unlockMetric: "paid_requests",
      unlockThreshold: "2",
      unlockOrigins: "",
      unlockWindowDays: "365",
      unlockIdentityMode: "OPTIONAL_8004",
      unlockRailMode: "BOTH",
      unlockNote: "Local combined payment-history badge"
    });

    const advancedPolicyPayload = buildAdvancedPolicyPayload({
      unlockAdapterType: "PAYMENT_HISTORY",
      unlockSignerAddress: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
      advancedPolicyEnabled: true,
      advancedPolicyContext: unlockPayload.unlockAdapterConfig.paymentCriteriaHash,
      advancedPolicySchema: DEFAULT_PAYMENT_8183_SCHEMA,
      advancedPolicyRequiredIssuer: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
      advancedPolicyConfig: {
        enabled: true,
        contextInput: unlockPayload.unlockAdapterConfig.paymentCriteriaHash,
        schemaInput: DEFAULT_PAYMENT_8183_SCHEMA,
        requiredIssuer: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
        requireExpiry: true,
        nonceScope: "PER_SUBJECT",
        maxAge: "0"
      }
    });

    const defineHash = await walletClient.writeContract({
      account,
      address: deployment.badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "defineBadge",
      args: [
        "Cross-Rail Explorer",
        "Verified from connected-wallet x402 history plus a linked MPP payer wallet.",
        BigInt(deployment.seeded?.assetId ?? 0),
        1n,
        2n,
        unlockPayload.verificationData,
        0n,
        0n,
        advancedPolicyPayload.advancedPolicy
      ]
    });
    const defineReceipt = await publicClient.waitForTransactionReceipt({ hash: defineHash });
    if (defineReceipt.status !== "success") {
      throw new Error("Payment-history badge definition reverted.");
    }

    const proof = await buildDirectClaimProof({
      badgeRegistryAddress: deployment.badgeRegistryAddress,
      chainId: Number(deployment.chainId),
      definitionId,
      agent: account.address,
      account: account.address,
      walletClient,
      paymentAccount: mppAccount.address,
      paymentWalletClient: mppWalletClient,
      unlockAdapterConfig: unlockPayload.unlockAdapterConfig,
      advancedPolicyConfig: advancedPolicyPayload.advancedPolicyConfig,
      x402ServiceUrl: `http://${server.hostname}:${server.port}/api/x402/proof`
    });

    const claimHash = await walletClient.writeContract({
      account,
      address: deployment.badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "claim",
      args: [BigInt(definitionId), proof]
    });
    const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash });
    if (claimReceipt.status !== "success") {
      throw new Error("Payment-history badge claim reverted.");
    }

    const claimUri = await publicClient.readContract({
      address: deployment.badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "claimURI",
      args: [account.address, BigInt(definitionId)]
    });

    const decisionsResponse = await fetch(
      `http://${server.hostname}:${server.port}/api/x402/admin/decisions?limit=5`
    );
    const decisionsPayload = await decisionsResponse.json();

    process.stdout.write(
      `${JSON.stringify(
        {
          status: "ok",
          definitionId,
          defineHash,
          claimHash,
          claimUri,
          linkedMppWallet: mppAccount.address,
          backendRequests: backendRequests.length,
          authorizedWallets:
            backendRequests[0]?.walletAddresses?.length ?? 0,
          proofDecisions: decisionsPayload?.decisions?.length ?? 0
        },
        null,
        2
      )}\n`
    );
  } finally {
    server.stop(true);
    backend.stop(true);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
