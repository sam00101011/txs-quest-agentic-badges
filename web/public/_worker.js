import { createClient as createQuickAuthClient } from "@farcaster/quick-auth";
import {
  createPublicClient,
  decodeAbiParameters,
  defineChain,
  encodePacked,
  http
} from "viem";
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const FARCASTER_MANIFEST_PATH = "/.well-known/farcaster.json";
const FARCASTER_PLACEHOLDER_MARKERS = [
  "REPLACE_WITH_DOMAIN_HEADER",
  "REPLACE_WITH_DOMAIN_PAYLOAD",
  "REPLACE_WITH_DOMAIN_SIGNATURE"
];
const DEFAULT_PROOF_RPC_URL = "https://rpc.moderato.tempo.xyz";
const DEFAULT_PROOF_CHAIN_ID = 42431;
const DEFAULT_PROOF_BADGE_REGISTRY_ADDRESS = "0x1916584df2c1971d93a17967d8ef3b6047ec35f3";
const DEFAULT_QUICK_AUTH_ORIGIN = "https://auth.farcaster.xyz";
const DEFAULT_ORACLE_EVENT_PROOF_TTL = 60 * 60 * 24 * 7;
const ORACLE_8183_PROOF_KIND = "oracle_event_attendance_8183_v1";
const FARCASTER_CRITERIA_KIND = "farcaster_account";
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

const POLICY_RULE_NAMES = {
  0: "NONE",
  1: "ONCHAIN_STATE",
  2: "MERKLE",
  3: "ORACLE_8183",
  4: "AGENT_8183"
};

const NONCE_SCOPE_NAMES = {
  0: "NONE",
  1: "GLOBAL",
  2: "PER_ISSUER",
  3: "PER_SUBJECT"
};

const BADGE_POLICY_PARAMETER = [
  {
    type: "tuple",
    components: [
      { name: "ruleKind", type: "uint8" },
      {
        name: "identity",
        type: "tuple",
        components: [
          { name: "requireRegisteredAgent", type: "bool" },
          { name: "requirePrimaryWallet", type: "bool" },
          { name: "uniquePerAgent", type: "bool" },
          { name: "minSubjectReputation", type: "uint64" },
          { name: "minIssuerReputation", type: "uint64" }
        ]
      },
      {
        name: "evidence",
        type: "tuple",
        components: [
          { name: "schemaId", type: "bytes32" },
          { name: "contextId", type: "bytes32" },
          { name: "requiredIssuer", type: "address" },
          { name: "maxAge", type: "uint64" },
          { name: "requireExpiry", type: "bool" },
          { name: "nonceScope", type: "uint8" }
        ]
      },
      {
        name: "scarcity",
        type: "tuple",
        components: [
          { name: "startsAt", type: "uint64" },
          { name: "endsAt", type: "uint64" },
          { name: "maxClaims", type: "uint32" }
        ]
      },
      {
        name: "onchain",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "threshold", type: "uint256" }
        ]
      },
      { name: "merkleRoot", type: "bytes32" }
    ]
  }
];

const agenticBadgeRegistryAbi = [
  {
    type: "function",
    name: "definitions",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "assetId", type: "uint256" },
      { name: "badgeType", type: "uint8" },
      { name: "verificationType", type: "uint8" },
      { name: "verificationData", type: "bytes" },
      { name: "creator", type: "address" },
      { name: "maxClaims", type: "uint256" },
      { name: "claimCount", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
      { name: "active", type: "bool" },
      { name: "advancedPolicy", type: "bytes" }
    ]
  }
];

let proofStatePromise = null;

function normalizeBytes32(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

function normalizeHex(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]*$/.test(trimmed) ? trimmed : "0x";
}

function normalizeChainId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function randomBytes32Hex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeFidValue(value) {
  const numeric = Number.parseInt(String(value ?? "0").trim(), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeFarcasterCriteria(raw = {}) {
  const minFid = normalizeFidValue(raw.minFid ?? raw.fidThreshold ?? raw.unlockThreshold);
  const maxFid = normalizeFidValue(raw.maxFid);
  return {
    kind: FARCASTER_CRITERIA_KIND,
    minFid,
    maxFid,
    note: String(raw.note ?? "").trim()
  };
}

function isFarcasterCriteria(value) {
  return value?.kind === FARCASTER_CRITERIA_KIND;
}

function buildFarcasterCriteriaJson(raw = {}) {
  return JSON.stringify(normalizeFarcasterCriteria(raw));
}

function buildFarcasterCriteriaHash(raw = {}) {
  return keccak256(stringToHex(buildFarcasterCriteriaJson(raw)));
}

function formatFarcasterCriteriaRequirement(raw = {}) {
  const criteria = normalizeFarcasterCriteria(raw);
  if (criteria.minFid && criteria.maxFid) {
    return `Farcaster FID between ${criteria.minFid} and ${criteria.maxFid}`;
  }
  if (criteria.minFid) {
    return `Farcaster FID at least ${criteria.minFid}`;
  }
  if (criteria.maxFid) {
    return `Farcaster FID at most ${criteria.maxFid}`;
  }
  return "Any verified Farcaster account";
}

function buildFarcasterContextLabel(raw = {}) {
  const criteria = normalizeFarcasterCriteria(raw);
  const requirement = formatFarcasterCriteriaRequirement(criteria);
  return criteria.note ? `${requirement} · ${criteria.note}` : requirement;
}

function matchesFarcasterCriteria(fid, raw = {}) {
  const numericFid = normalizeFidValue(fid);
  const criteria = normalizeFarcasterCriteria(raw);
  if (!numericFid) {
    return false;
  }
  if (criteria.minFid && numericFid < criteria.minFid) {
    return false;
  }
  if (criteria.maxFid && numericFid > criteria.maxFid) {
    return false;
  }
  return true;
}

function advancedPolicyDefaults({ requiredIssuer = "" } = {}) {
  return {
    enabled: false,
    ruleKind: "ORACLE_8183",
    schemaInput: ZERO_BYTES32,
    schemaId: ZERO_BYTES32,
    contextInput: "",
    contextId: "",
    requiredIssuer: normalizeAddress(requiredIssuer),
    minIssuerReputation: "0",
    maxAge: "0",
    requireExpiry: true,
    nonceScope: "GLOBAL"
  };
}

function decodeAdvancedPolicyConfig(advancedPolicy, { requiredIssuer = "" } = {}) {
  const normalizedPolicy = normalizeHex(advancedPolicy);
  if (!normalizedPolicy || normalizedPolicy === "0x") {
    return advancedPolicyDefaults({ requiredIssuer });
  }

  try {
    const [policy] = decodeAbiParameters(BADGE_POLICY_PARAMETER, normalizedPolicy);
    const ruleKind = POLICY_RULE_NAMES[Number(policy.ruleKind)] ?? "NONE";
    const nonceScope = NONCE_SCOPE_NAMES[Number(policy.evidence.nonceScope)] ?? "GLOBAL";
    return {
      enabled: ruleKind !== "NONE",
      ruleKind,
      schemaInput: policy.evidence.schemaId,
      schemaId: policy.evidence.schemaId,
      contextInput: policy.evidence.contextId,
      contextId: policy.evidence.contextId,
      requiredIssuer: normalizeAddress(policy.evidence.requiredIssuer),
      minIssuerReputation: policy.identity.minIssuerReputation?.toString?.() ?? "0",
      maxAge: policy.evidence.maxAge?.toString?.() ?? "0",
      requireExpiry: Boolean(policy.evidence.requireExpiry),
      nonceScope
    };
  } catch {
    return advancedPolicyDefaults({ requiredIssuer });
  }
}

function buildOracle8183ProofDigest({
  badgeRegistryAddress,
  chainId,
  schemaId,
  definitionId,
  agent,
  contextId,
  nonce,
  issuedAt,
  expiresAt
}) {
  const normalizedSchemaId = normalizeBytes32(schemaId) || keccak256(stringToHex(String(schemaId)));
  const normalizedChainId = normalizeChainId(chainId);
  if (!normalizedSchemaId) {
    throw new Error("Oracle 8183 proofs require a 32-byte schema id.");
  }
  if (!normalizedChainId) {
    throw new Error("Oracle 8183 proofs require a numeric chain id.");
  }

  return keccak256(
    encodePacked(
      ["address", "uint256", "bytes32", "string", "uint256", "address", "bytes32", "bytes32", "uint64", "uint64"],
      [
        badgeRegistryAddress,
        BigInt(normalizedChainId),
        normalizedSchemaId,
        "ORACLE_8183",
        BigInt(definitionId),
        agent,
        normalizeBytes32(contextId),
        normalizeBytes32(nonce),
        BigInt(Number(issuedAt) || 0),
        BigInt(Number(expiresAt) || 0)
      ]
    )
  );
}

async function signOracle8183ProofPackage({
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  account,
  contextId,
  contextLabel = "",
  schemaId = ZERO_BYTES32,
  nonce = randomBytes32Hex(),
  note = "",
  issuedAt = Math.floor(Date.now() / 1000),
  expiresAt = issuedAt + DEFAULT_ORACLE_EVENT_PROOF_TTL
}) {
  const normalizedIssuedAt = Number(issuedAt) || 0;
  const normalizedExpiresAt = Number(expiresAt) || 0;
  const normalizedContextId = normalizeBytes32(contextId);
  const normalizedNonce = normalizeBytes32(nonce);
  const normalizedSchemaId = normalizeBytes32(schemaId) || keccak256(stringToHex(String(schemaId)));
  const normalizedChainId = normalizeChainId(chainId);
  if (!normalizedContextId || !normalizedNonce || !normalizedChainId) {
    throw new Error("Oracle 8183 proofs require valid context, nonce, and chain id.");
  }
  if (!normalizedIssuedAt || !normalizedExpiresAt || normalizedExpiresAt <= normalizedIssuedAt) {
    throw new Error("Oracle 8183 proofs require a valid issuedAt/expiresAt range.");
  }

  const digest = buildOracle8183ProofDigest({
    badgeRegistryAddress,
    chainId: normalizedChainId,
    schemaId: normalizedSchemaId,
    definitionId,
    agent,
    contextId: normalizedContextId,
    nonce: normalizedNonce,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedExpiresAt
  });
  const signature = await account.signMessage({
    message: {
      raw: digest
    }
  });

  return {
    kind: ORACLE_8183_PROOF_KIND,
    badgeRegistryAddress,
    chainId: normalizedChainId,
    definitionId: Number(definitionId),
    agent,
    signerAddress: account.address,
    schemaId: normalizedSchemaId,
    contextId: normalizedContextId,
    contextLabel: contextLabel?.trim?.() ?? "",
    nonce: normalizedNonce,
    note,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedExpiresAt,
    signature
  };
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    ...extra
  };
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: corsHeaders({
      "content-type": "application/json; charset=utf-8",
      ...headers
    })
  });
}

function buildNotConfiguredResponse() {
  return jsonResponse(
    {
      error: "farcaster_domain_association_not_configured",
      detail: "Generate the txs.quest accountAssociation signature inside Farcaster, then redeploy."
    },
    {
      status: 404,
      headers: {
        "x-robots-tag": "noindex"
      }
    }
  );
}

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

function normalizePrivateKey(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: Number(chainId),
    name: "txs.quest-farcaster-proof",
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

async function getProofState(env) {
  if (!proofStatePromise) {
    proofStatePromise = (async () => {
      const privateKey = normalizePrivateKey(env.FARCASTER_PROOF_PRIVATE_KEY);
      if (!privateKey) {
        return {
          configured: false,
          detail: "FARCASTER_PROOF_PRIVATE_KEY is not configured."
        };
      }

      const rpcUrl = String(env.FARCASTER_PROOF_RPC_URL || DEFAULT_PROOF_RPC_URL).trim();
      const chainId = Number(env.FARCASTER_PROOF_CHAIN_ID || DEFAULT_PROOF_CHAIN_ID);
      const badgeRegistryAddress = normalizeAddress(
        env.FARCASTER_PROOF_BADGE_REGISTRY_ADDRESS || DEFAULT_PROOF_BADGE_REGISTRY_ADDRESS
      );
      if (!rpcUrl || !chainId || !badgeRegistryAddress) {
        return {
          configured: false,
          detail: "Farcaster proof worker is missing rpc, chainId, or badge registry configuration."
        };
      }

      const account = privateKeyToAccount(privateKey);
      const publicClient = createPublicClient({
        chain: createChain(chainId, rpcUrl),
        transport: http(rpcUrl)
      });
      const quickAuthClient = createQuickAuthClient({
        origin: String(env.FARCASTER_QUICK_AUTH_ORIGIN || DEFAULT_QUICK_AUTH_ORIGIN).trim() || DEFAULT_QUICK_AUTH_ORIGIN
      });

      return {
        configured: true,
        rpcUrl,
        chainId,
        badgeRegistryAddress,
        account,
        publicClient,
        quickAuthClient
      };
    })().catch((error) => ({
      configured: false,
      detail: error?.message || "Could not initialize Farcaster proof worker."
    }));
  }

  return proofStatePromise;
}

async function handleFarcasterHealth(env) {
  const state = await getProofState(env);
  return jsonResponse({
    ok: Boolean(state.configured),
    chainId: state.configured ? state.chainId : Number(env.FARCASTER_PROOF_CHAIN_ID || DEFAULT_PROOF_CHAIN_ID),
    badgeRegistryAddress: state.configured ? state.badgeRegistryAddress : normalizeAddress(env.FARCASTER_PROOF_BADGE_REGISTRY_ADDRESS || DEFAULT_PROOF_BADGE_REGISTRY_ADDRESS),
    signerAddress: state.configured ? state.account.address : "",
    detail: state.configured ? "Farcaster proof worker is ready." : state.detail,
    flow: [
      "Open txs.quest inside Farcaster.",
      "Connect with Quick Auth in the claim assistant.",
      "Claim a Farcaster-only badge.",
      "txs.quest verifies the Farcaster token and returns an 8183 proof."
    ]
  });
}

async function handleFarcasterProof(request, env) {
  const state = await getProofState(env);
  if (!state.configured) {
    return jsonResponse({ detail: state.detail }, { status: 503 });
  }

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
    return jsonResponse(
      {
        detail: "This proof service is configured for a different badge registry or chain."
      },
      { status: 400 }
    );
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
    return jsonResponse(
      {
        detail: "The verified Farcaster auth address must match the wallet claiming the badge."
      },
      { status: 400 }
    );
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
    return jsonResponse(
      {
        detail: "The badge's Farcaster criteria hash does not match its JSON criteria."
      },
      { status: 400 }
    );
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
    return jsonResponse(
      {
        detail: "This badge requires an ORACLE_8183 advanced policy before Farcaster claims are allowed."
      },
      { status: 400 }
    );
  }
  if (
    advancedPolicyConfig.requiredIssuer &&
    normalizeAddress(advancedPolicyConfig.requiredIssuer) !== normalizeAddress(state.account.address)
  ) {
    return jsonResponse(
      {
        detail: "This badge expects a different Farcaster proof issuer than txs.quest is configured to use."
      },
      { status: 400 }
    );
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/farcaster/")) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method === "GET" && url.pathname === "/api/farcaster/health") {
      return handleFarcasterHealth(env);
    }

    if (request.method === "POST" && url.pathname === "/api/farcaster/proof") {
      try {
        return await handleFarcasterProof(request, env);
      } catch (error) {
        return jsonResponse(
          {
            detail: error?.message || "Farcaster proof request failed."
          },
          { status: 500 }
        );
      }
    }

    if (url.pathname === FARCASTER_MANIFEST_PATH) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (!assetResponse.ok) {
        return assetResponse;
      }

      const manifestText = await assetResponse.text();
      const hasPlaceholder = FARCASTER_PLACEHOLDER_MARKERS.some((marker) =>
        manifestText.includes(marker)
      );

      if (hasPlaceholder) {
        return buildNotConfiguredResponse();
      }

      return new Response(manifestText, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: assetResponse.headers
      });
    }

    return env.ASSETS.fetch(request);
  }
};
