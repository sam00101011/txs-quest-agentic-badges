import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient as createQuickAuthClient } from "@farcaster/quick-auth";
import {
  createPublicClient,
  decodeAbiParameters,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  DEFAULT_ORACLE_EVENT_PROOF_TTL,
  signOracle8183ProofPackage
} from "../web/unlockAdapters.js";
import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import { decodeAdvancedPolicyConfig } from "../web/badgePolicies.js";
import {
  buildFarcasterContextLabel,
  formatFarcasterCriteriaRequirement,
  buildFarcasterCriteriaHash,
  isFarcasterCriteria,
  matchesFarcasterCriteria,
  normalizeFarcasterCriteria
} from "../web/farcasterCriteria.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const DEFAULT_HOST = process.env.HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT ?? process.env.FARCASTER_PROOF_PORT ?? "8791");
const DEFAULT_PRIVATE_KEY =
  process.env.FARCASTER_PROOF_PRIVATE_KEY ??
  process.env.PROOF_SIGNER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_QUICK_AUTH_ORIGIN = process.env.FARCASTER_QUICK_AUTH_ORIGIN ?? "https://auth.farcaster.xyz";

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

function normalizeUrl(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed.replace(/\/$/, "") : "";
}

async function readDeploymentProfile(pathname = "") {
  if (!pathname) {
    return {};
  }
  const resolved = pathname.startsWith("/")
    ? pathname
    : join(projectRoot, pathname);
  return JSON.parse(await readFile(resolved, "utf8"));
}

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: Number(chainId),
    name: "farcaster-proof",
    nativeCurrency: {
      name: "ETH",
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

function decodeVerificationData(data = "0x") {
  if (!data || data === "0x") {
    return null;
  }

  try {
    const [signerAddress, criteriaHash, criteriaJson] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "string" }],
      data
    );
    return {
      signerAddress: normalizeAddress(signerAddress),
      criteriaHash: String(criteriaHash).toLowerCase(),
      criteria: JSON.parse(criteriaJson)
    };
  } catch {
    return null;
  }
}

async function buildServerState() {
  const deploymentPath =
    process.env.DEPLOYMENT_PROFILE ??
    process.env.FARCASTER_DEPLOYMENT_PROFILE ??
    join(projectRoot, "web", "public", "local", "anvil-deployment.json");
  const deployment = await readDeploymentProfile(deploymentPath);
  const rpcUrl = normalizeUrl(
    process.env.RPC_URL ?? deployment.rpcUrl ?? deployment.network?.rpcUrl ?? ""
  );
  const chainId = Number(process.env.CHAIN_ID ?? deployment.chainId ?? deployment.network?.chainId ?? 0);
  const badgeRegistryAddress = normalizeAddress(
    process.env.BADGE_REGISTRY_ADDRESS ??
      deployment.badgeRegistryAddress ??
      deployment.contracts?.agenticBadgeRegistry ??
      ""
  );
  if (!rpcUrl || !chainId || !badgeRegistryAddress) {
    throw new Error("Add DEPLOYMENT_PROFILE or RPC_URL / CHAIN_ID / BADGE_REGISTRY_ADDRESS before running the Farcaster proof server.");
  }

  const account = privateKeyToAccount(DEFAULT_PRIVATE_KEY);
  const publicClient = createPublicClient({
    chain: createChain(chainId, rpcUrl),
    transport: http(rpcUrl)
  });
  const quickAuthClient = createQuickAuthClient({
    origin: DEFAULT_QUICK_AUTH_ORIGIN
  });

  return {
    deploymentPath,
    rpcUrl,
    chainId,
    badgeRegistryAddress,
    account,
    publicClient,
    quickAuthClient
  };
}

const statePromise = buildServerState();

async function handleHealth() {
  const state = await statePromise;
  return jsonResponse({
    ok: true,
    badgeRegistryAddress: state.badgeRegistryAddress,
    chainId: state.chainId,
    signerAddress: state.account.address,
    quickAuthOrigin: DEFAULT_QUICK_AUTH_ORIGIN,
    flow: [
      "Open txs.quest inside Farcaster.",
      "Use Farcaster Connect in the claim assistant.",
      "Try to claim a Farcaster-only badge.",
      "The proof service verifies the Quick Auth token and returns an 8183 proof."
    ]
  });
}

async function handleProof(request) {
  const state = await statePromise;
  const body = await request.json().catch(() => null);
  const badgeRegistryAddress = normalizeAddress(body?.badgeRegistryAddress);
  const agent = normalizeAddress(body?.agent);
  const token = String(body?.token ?? "").trim();
  const domain = String(body?.domain ?? "").trim();
  const definitionId = Number(body?.definitionId);
  const chainId = Number(body?.chainId);

  if (!badgeRegistryAddress || !agent || !token || !domain || !Number.isFinite(definitionId) || !chainId) {
    return jsonResponse(
      {
        detail: "badgeRegistryAddress, chainId, definitionId, agent, domain, and token are required."
      },
      { status: 400 }
    );
  }
  if (badgeRegistryAddress !== state.badgeRegistryAddress || chainId !== state.chainId) {
    return jsonResponse({ detail: "This proof service is configured for a different badge registry or chain." }, { status: 400 });
  }

  const jwtPayload = await state.quickAuthClient.verifyJwt({
    token,
    domain
  }).catch((error) => {
    throw new Error(error?.message || "The Farcaster session token could not be verified.");
  });

  const authAddress = normalizeAddress(jwtPayload?.address);
  const fid = Number(jwtPayload?.sub ?? 0);
  if (!authAddress || authAddress !== agent) {
    return jsonResponse({ detail: "The verified Farcaster auth address must match the wallet claiming the badge." }, { status: 400 });
  }
  if (!fid) {
    return jsonResponse({ detail: "The Farcaster session did not include a valid fid." }, { status: 400 });
  }

  const definition = await state.publicClient.readContract({
    address: state.badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "definitions",
    args: [BigInt(definitionId)]
  });
  const verificationData = decodeVerificationData(definition[6]);
  const advancedPolicyConfig = decodeAdvancedPolicyConfig(definition[12], {
    requiredIssuer: verificationData?.signerAddress
  });
  if (!verificationData || !isFarcasterCriteria(verificationData.criteria)) {
    return jsonResponse({ detail: "This badge is not configured for Farcaster claims." }, { status: 400 });
  }
  const criteria = normalizeFarcasterCriteria(verificationData.criteria);
  const expectedHash = buildFarcasterCriteriaHash(criteria);
  if (verificationData.criteriaHash !== expectedHash) {
    return jsonResponse({ detail: "The badge's Farcaster criteria hash does not match its JSON criteria." }, { status: 400 });
  }
  if (!matchesFarcasterCriteria(fid, criteria)) {
    return jsonResponse(
      {
        detail: `This badge requires ${formatFarcasterCriteriaRequirement(criteria)}. Verified fid: ${fid}.`
      },
      { status: 400 }
    );
  }
  if (!advancedPolicyConfig.enabled || !advancedPolicyConfig.contextId || !advancedPolicyConfig.schemaId) {
    return jsonResponse({ detail: "This badge requires an ORACLE_8183 advanced policy before Farcaster claims are allowed." }, { status: 400 });
  }
  if (
    advancedPolicyConfig.requiredIssuer &&
    normalizeAddress(advancedPolicyConfig.requiredIssuer) !== normalizeAddress(state.account.address)
  ) {
    return jsonResponse({ detail: "This badge expects a different Farcaster proof issuer than this service is using." }, { status: 400 });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + DEFAULT_ORACLE_EVENT_PROOF_TTL;
  const proofPackage = await signOracle8183ProofPackage({
    badgeRegistryAddress: state.badgeRegistryAddress,
    chainId: state.chainId,
    schemaId: advancedPolicyConfig.schemaId,
    definitionId,
    agent,
    account: state.account,
    contextId: advancedPolicyConfig.contextId,
    contextLabel: buildFarcasterContextLabel(criteria),
    note: `Verified Farcaster fid ${fid}`,
    issuedAt,
    expiresAt
  });

  return jsonResponse({
    ok: true,
    agent,
    fid,
    authAddress,
    proofPackage
  });
}

const server = Bun.serve({
  hostname: DEFAULT_HOST,
  port: DEFAULT_PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/farcaster/health") {
      return handleHealth();
    }
    if (request.method === "POST" && url.pathname === "/api/farcaster/proof") {
      return handleProof(request);
    }
    return jsonResponse({ detail: "Not found." }, { status: 404 });
  }
});

console.log(`Farcaster proof server listening on http://${server.hostname}:${server.port}`);
