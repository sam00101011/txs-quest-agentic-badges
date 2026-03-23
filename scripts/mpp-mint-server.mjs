import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Mppx, tempo as tempoMethod } from "mppx/server";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const deploymentPath =
  process.env.MINT_DEPLOYMENT_PATH ??
  process.env.DEPLOYMENT_PATH ??
  join(projectRoot, "web", "public", "local", "anvil-deployment.json");
const DEFAULT_HOST = process.env.MINT_HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number(process.env.MINT_PORT ?? "8787");
const DEFAULT_AMOUNT = process.env.MPP_MINT_AMOUNT ?? "0.05";
const DEFAULT_CURRENCY =
  process.env.MPP_CURRENCY ?? "0x20c000000000000000000000b9537d11c60e8b50";
const DEFAULT_RECIPIENT = process.env.MPP_RECIPIENT ?? "";
const DEFAULT_TESTNET = process.env.MPP_TESTNET === "true";
const DEFAULT_SECRET_KEY =
  process.env.MPP_SECRET_KEY ??
  process.env.MINT_SECRET_KEY ??
  "agentic-poap-local-mpp-secret";
const DEFAULT_PRIVATE_KEY =
  process.env.MINT_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

function jsonResponse(payload, init = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  return withCors(
    new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(init.headers ?? {})
      },
      status: init.status ?? 200
    })
  );
}

function decodeClaimUri(claimUri) {
  const commaIndex = claimUri.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid claim URI returned by the registry.");
  }

  const payload = claimUri.slice(commaIndex + 1).replace(/ /g, "+");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

async function readLocalDeployment() {
  try {
    const raw = await readFile(deploymentPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTempoRecipient() {
  const result = spawnSync("tempo", ["wallet", "-j", "whoami"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return "";
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return typeof parsed.wallet === "string" ? parsed.wallet : "";
  } catch {
    return "";
  }
}

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: chainId,
    name: `Agentic Mint ${chainId}`,
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

function readBodyNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function createServer() {
  const deployment = await readLocalDeployment();
  const signer = privateKeyToAccount(DEFAULT_PRIVATE_KEY);
  const recipient = DEFAULT_RECIPIENT || readTempoRecipient() || deployment?.deployer || signer.address;

  const payment = Mppx.create({
    secretKey: DEFAULT_SECRET_KEY,
    methods: [
      tempoMethod({
        currency: DEFAULT_CURRENCY,
        recipient,
        testnet: DEFAULT_TESTNET
      })
    ]
  });

  return Bun.serve({
    hostname: DEFAULT_HOST,
    port: DEFAULT_PORT,
    async fetch(request) {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/mint/health") {
        return jsonResponse({
          amount: DEFAULT_AMOUNT,
          currency: DEFAULT_CURRENCY,
          defaultBadgeRegistryAddress: deployment?.badgeRegistryAddress ?? "",
          defaultChainId: deployment?.chainId ?? "",
          defaultRpcUrl: deployment?.rpcUrl ?? "",
          recipient,
          status: "ok",
          testnet: DEFAULT_TESTNET
        });
      }

      if (request.method !== "POST" || url.pathname !== "/api/mint/claim") {
        return jsonResponse({ detail: "Not found." }, { status: 404 });
      }

      let payload;
      try {
        payload = await request.clone().json();
      } catch {
        return jsonResponse({ detail: "Invalid JSON body." }, { status: 400 });
      }

      const rpcUrl = String(payload.rpcUrl ?? deployment?.rpcUrl ?? "");
      const badgeRegistryAddress = String(
        payload.badgeRegistryAddress ?? deployment?.badgeRegistryAddress ?? ""
      );
      const definitionId = readBodyNumber(payload.definitionId, Number.NaN);
      const agent = String(payload.agent ?? "");
      const chainId = readBodyNumber(payload.chainId ?? deployment?.chainId, 31337);

      if (!rpcUrl || !badgeRegistryAddress) {
        return jsonResponse(
          { detail: "Mint service is missing an RPC URL or badge registry address." },
          { status: 400 }
        );
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(agent)) {
        return jsonResponse(
          { detail: "Mint request requires a valid 0x agent address." },
          { status: 400 }
        );
      }
      if (!Number.isFinite(definitionId)) {
        return jsonResponse(
          { detail: "Mint request requires a numeric definitionId." },
          { status: 400 }
        );
      }

      const chain = createChain(chainId, rpcUrl);
      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });

      try {
        const definition = await publicClient.readContract({
          abi: agenticBadgeRegistryAbi,
          address: badgeRegistryAddress,
          functionName: "definitions",
          args: [BigInt(definitionId)]
        });

        if (
          Number(definition.verificationType) !== 0 ||
          definition.verificationData !== "0x" ||
          definition.advancedPolicy !== "0x"
        ) {
          return jsonResponse(
            {
              detail: "MPP minting only supports manual attestor badges."
            },
            { status: 400 }
          );
        }
      } catch (error) {
        return jsonResponse(
          {
            detail:
              error instanceof Error
                ? error.message
                : "Could not validate the requested badge definition."
          },
          { status: 400 }
        );
      }

      const chargeAmount = String(payload.amount ?? DEFAULT_AMOUNT);
      const description =
        payload.description ??
        `Mint agent badge #${payload.definitionId ?? "?"} for ${payload.agent ?? "unknown agent"}`;

      const paymentResult = await payment.charge({
        amount: chargeAmount,
        description
      })(request);

      if (paymentResult.status === 402) {
        return withCors(paymentResult.challenge);
      }

      try {
        const walletClient = createWalletClient({
          account: signer,
          chain,
          transport: http(rpcUrl)
        });

        const txHash = await walletClient.writeContract({
          abi: agenticBadgeRegistryAbi,
          account: signer,
          address: badgeRegistryAddress,
          functionName: "attestAndRecord",
          args: [BigInt(definitionId), agent]
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });

        const claimUri = await publicClient.readContract({
          abi: agenticBadgeRegistryAbi,
          address: badgeRegistryAddress,
          functionName: "claimURI",
          args: [agent, BigInt(definitionId)]
        });

        return withCors(
          paymentResult.withReceipt(
            jsonResponse({
              agent,
              claim: decodeClaimUri(claimUri),
              claimUri,
              definitionId,
              mintedBy: signer.address,
              txHash
            })
          )
        );
      } catch (error) {
        return jsonResponse(
          {
            detail: error instanceof Error ? error.message : "Mint failed."
          },
          { status: 500 }
        );
      }
    }
  });
}

const server = await createServer();
console.log(
  `MPP mint server listening on http://${server.hostname}:${server.port}/api/mint/claim`
);
