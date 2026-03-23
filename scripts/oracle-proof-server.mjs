import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import axios from "axios";
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, defineChain, http, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { agenticBadgeRegistryAbi } from "../web/contractAbis.js";
import {
  buildOracleProofAuthorizationDigest,
  buildReusableOracleContextLabel,
  evaluateReusableOracleCriteria,
  formatReusableOracleEvaluationSummary,
  getReusableOracleSchema,
  isReusableOracleAdapter,
  normalizeReusableOracleCriteria
} from "../web/oracleCriteria.js";
import {
  DEFAULT_ORACLE_EVENT_PROOF_TTL,
  decodeUnlockAdapterConfig,
  signOracle8183ProofPackage
} from "../web/unlockAdapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const deploymentPath =
  process.env.ORACLE_DEPLOYMENT_PATH ??
  process.env.DEPLOYMENT_PATH ??
  join(projectRoot, "web", "public", "local", "anvil-deployment.json");
const databasePath = join(projectRoot, "config", "oracle-proof.sample.json");
const backendConfigPath = join(projectRoot, "config", "oracle-backend.json");

const DEFAULT_HOST = process.env.ORACLE_HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number(process.env.ORACLE_PORT ?? "8789");
const DEFAULT_RPC_URL = process.env.ORACLE_RPC_URL ?? "";
const DEFAULT_CHAIN_ID = Number(process.env.ORACLE_CHAIN_ID ?? "31337");
const DEFAULT_PROOF_TTL = Number(
  process.env.ORACLE_PROOF_TTL ?? DEFAULT_ORACLE_EVENT_PROOF_TTL
);
const DEFAULT_SIGNER_PRIVATE_KEY =
  process.env.ORACLE_PROOF_PRIVATE_KEY ??
  process.env.EVENT_SIGNER_PRIVATE_KEY ??
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const DEFAULT_BACKEND_MODE = process.env.ORACLE_BACKEND_MODE ?? "";
const DEFAULT_BACKEND_URL = process.env.ORACLE_BACKEND_URL ?? "";
const DEFAULT_BACKEND_HEALTH_URL = process.env.ORACLE_BACKEND_HEALTH_URL ?? "";
const DEFAULT_BACKEND_TIMEOUT_MS = Number(process.env.ORACLE_BACKEND_TIMEOUT ?? "8000");
const DEFAULT_BACKEND_AUTH_TOKEN = process.env.ORACLE_BACKEND_AUTH_TOKEN ?? "";
const DEFAULT_ZAPPER_API_URL = process.env.ORACLE_ZAPPER_API_URL ?? "https://public.zapper.xyz/graphql";
const DEFAULT_ZAPPER_X402_URL = process.env.ORACLE_ZAPPER_X402_URL ?? "https://public.zapper.xyz/x402";
const DEFAULT_ZAPPER_API_KEY = process.env.ORACLE_ZAPPER_API_KEY ?? "";
const DEFAULT_ZAPPER_X402_PAYER_PRIVATE_KEY =
  process.env.ORACLE_ZAPPER_X402_PAYER_PRIVATE_KEY ?? "";
const DEFAULT_ZAPPER_X402_PAYER_ENV_FILE =
  process.env.ORACLE_ZAPPER_X402_PAYER_ENV_FILE ?? "";
const DEFAULT_ZAPPER_X402_PAYER_ENV_KEY =
  process.env.ORACLE_ZAPPER_X402_PAYER_ENV_KEY ?? "DEPLOYER_PRIVATE_KEY";
const DEFAULT_ZAPPER_X402_RPC_URL =
  process.env.ORACLE_ZAPPER_X402_RPC_URL ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const DEFAULT_ZAPPER_PAGE_SIZE = Number(process.env.ORACLE_ZAPPER_PAGE_SIZE ?? "100");
const DEFAULT_ZAPPER_MAX_PAGES = Number(process.env.ORACLE_ZAPPER_MAX_PAGES ?? "100");
const DEFAULT_ZAPPER_CHAIN_IDS = process.env.ORACLE_ZAPPER_CHAIN_IDS ?? "";
const MAX_RECENT_DECISIONS = 24;
const DEFAULT_SUPPORTED_ZAPPER_CHAIN_IDS = Object.freeze([
  1,
  10,
  56,
  100,
  137,
  250,
  8453,
  42161,
  43114,
  42220,
  59144,
  534352,
  7777777,
  81457
]);
const CHAIN_ALIAS_TO_ID = Object.freeze({
  ethereum: 1,
  mainnet: 1,
  optimism: 10,
  op: 10,
  bsc: 56,
  binance: 56,
  gnosis: 100,
  xdai: 100,
  polygon: 137,
  fantom: 250,
  base: 8453,
  arbitrum: 42161,
  avalanche: 43114,
  celo: 42220,
  linea: 59144,
  scroll: 534352,
  zora: 7777777,
  blast: 81457
});
const CHAIN_ID_TO_SLUG = Object.freeze(
  Object.fromEntries(
    Object.entries(CHAIN_ALIAS_TO_ID).map(([slug, chainId]) => [chainId, slug])
  )
);
const DEFAULT_ZAPPER_PROTOCOL_ALIASES = Object.freeze({
  aave: ["aave", "aave-v2", "aave-v3"],
  aerodrome: ["aerodrome", "aerodrome-slipstream"],
  "bao-finance": ["bao-finance", "bao-swap", "bao"],
  balancer: ["balancer"],
  beefy: ["beefy", "beefy-finance"],
  compound: ["compound", "compound-v2", "compound-v3"],
  convex: ["convex", "convex-finance"],
  curve: ["curve", "curve-finance"],
  pendle: ["pendle"],
  sushiswap: ["sushiswap", "sushi"],
  uniswap: ["uniswap", "uniswap-v2", "uniswap-v3"],
  velodrome: ["velodrome", "velodrome-v2"],
  yearn: ["yearn", "yearn-finance"]
});
const ZAPPER_VARIANT_CACHE = new Map();
const ZAPPER_X402_CLIENT_CACHE = new WeakMap();

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
  return withCors(
    new Response(`${JSON.stringify(payload, null, 2)}\n`, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(init.headers ?? {})
      },
      status: init.status ?? 200,
      statusText: init.statusText
    })
  );
}

async function loadJson(pathname, fallback = null) {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: chainId,
    name: `Agentic Oracle ${chainId}`,
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

function normalizeBodyNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "http") {
    return "http";
  }
  if (normalized === "zapper") {
    return "zapper";
  }
  if (normalized === "zapper-x402" || normalized === "x402-zapper" || normalized === "zapper_rest") {
    return "zapper-x402";
  }
  return "file";
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function normalizeNumberList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
  return [
    ...new Set(
      rawValues
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.floor(entry))
    )
  ];
}

function normalizeProtocolAliasMap(value = {}) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_ZAPPER_PROTOCOL_ALIASES };
  }

  const aliases = { ...DEFAULT_ZAPPER_PROTOCOL_ALIASES };
  for (const [protocolId, entries] of Object.entries(value)) {
    const normalizedProtocolId = normalizeSlug(protocolId);
    if (!normalizedProtocolId) {
      continue;
    }
    const rawEntries = Array.isArray(entries)
      ? entries
      : String(entries ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
    aliases[normalizedProtocolId] = [
      ...new Set([normalizedProtocolId, ...rawEntries.map((entry) => normalizeSlug(entry)).filter(Boolean)])
    ];
  }

  return aliases;
}

function canonicalizeProtocolId(backend, value) {
  const normalized = normalizeSlug(value);
  if (!normalized) {
    return "";
  }

  for (const [protocolId, aliases] of Object.entries(backend?.protocolAliases ?? {})) {
    if (protocolId === normalized) {
      return protocolId;
    }
    if (Array.isArray(aliases) && aliases.includes(normalized)) {
      return protocolId;
    }
  }

  return normalized;
}

function resolveChainId(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  return CHAIN_ALIAS_TO_ID[normalizeSlug(value)] ?? 0;
}

function resolveChainSlug(value) {
  const raw = String(value ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return CHAIN_ID_TO_SLUG[Math.floor(numeric)] ?? `chain-${Math.floor(numeric)}`;
    }
  }
  const normalized = normalizeSlug(value);
  if (normalized) {
    return normalized;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return CHAIN_ID_TO_SLUG[Math.floor(numeric)] ?? `chain-${Math.floor(numeric)}`;
  }
  return "";
}

function normalizeZapperChainIds(value) {
  const numericValues = normalizeNumberList(value);
  if (numericValues.length > 0) {
    return numericValues;
  }
  return [...DEFAULT_SUPPORTED_ZAPPER_CHAIN_IDS];
}

function buildBackendHeaders(backend) {
  if (backend.mode === "zapper") {
    return {
      "content-type": "application/json",
      ...(backend.apiKey ? { "x-zapper-api-key": backend.apiKey } : {}),
      ...backend.headers
    };
  }

  return {
    "content-type": "application/json",
    ...(backend.authToken
      ? {
          [backend.authHeaderName]:
            backend.authHeaderName.toLowerCase() === "authorization"
              ? `Bearer ${backend.authToken}`
              : backend.authToken
        }
      : {}),
    ...backend.headers
  };
}

function resolveBackendEntry(raw = {}, fallback = {}) {
  const mode = normalizeMode(raw.mode ?? raw.source ?? fallback.mode);
  const authTokenEnv = String(raw.authTokenEnv ?? "").trim();
  const apiKeyEnv = String(raw.apiKeyEnv ?? raw.zapperApiKeyEnv ?? "").trim();
  const payerPrivateKeyEnv = String(
    raw.payerPrivateKeyEnv ?? raw.x402PayerPrivateKeyEnv ?? ""
  ).trim();
  const payerEnvFileEnv = String(raw.payerEnvFileEnv ?? raw.x402PayerEnvFileEnv ?? "").trim();
  const authHeaderName =
    String(raw.authHeader ?? fallback.authHeaderName ?? "authorization").trim() ||
    "authorization";
  const headers = {
    ...(fallback.headers && typeof fallback.headers === "object" ? fallback.headers : {}),
    ...(raw.headers && typeof raw.headers === "object" ? raw.headers : {})
  };
  const configuredUrl =
    raw.url ??
    raw.apiUrl ??
    fallback.url ??
    (mode === "zapper"
      ? DEFAULT_ZAPPER_API_URL
      : mode === "zapper-x402"
        ? DEFAULT_ZAPPER_X402_URL
        : "");
  const configuredGraphqlUrl =
    raw.graphqlUrl ??
    raw.graphqlApiUrl ??
    fallback.graphqlUrl ??
    (mode === "zapper-x402" ? DEFAULT_ZAPPER_API_URL : "");
  const configuredRpcUrl =
    raw.rpcUrl ??
    raw.baseRpcUrl ??
    fallback.rpcUrl ??
    (mode === "zapper-x402" ? DEFAULT_ZAPPER_X402_RPC_URL : "");

  return {
    mode,
    url: normalizeUrl(configuredUrl),
    graphqlUrl: normalizeUrl(configuredGraphqlUrl),
    healthUrl: normalizeUrl(raw.healthUrl ?? fallback.healthUrl ?? ""),
    timeoutMs: normalizeBodyNumber(
      raw.timeoutMs ?? fallback.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS,
      8000
    ),
    requestShape:
      String(
        raw.requestShape ?? fallback.requestShape ?? "agentic-poap.oracle-proof.v1"
      ).trim() || "agentic-poap.oracle-proof.v1",
    authToken: String(
      (authTokenEnv ? process.env[authTokenEnv] : "") ||
        raw.authToken ||
        fallback.authToken ||
        ""
    ).trim(),
    authHeaderName,
    headers,
    apiKey: String(
      (apiKeyEnv ? process.env[apiKeyEnv] : "") ||
        raw.apiKey ||
        fallback.apiKey ||
        (mode === "zapper" ? DEFAULT_ZAPPER_API_KEY : "")
    ).trim(),
    payerPrivateKey: String(
      (payerPrivateKeyEnv ? process.env[payerPrivateKeyEnv] : "") ||
        raw.payerPrivateKey ||
        raw.x402PayerPrivateKey ||
        fallback.payerPrivateKey ||
        (mode === "zapper-x402" ? DEFAULT_ZAPPER_X402_PAYER_PRIVATE_KEY : "")
    ).trim(),
    payerEnvFile: String(
      (payerEnvFileEnv ? process.env[payerEnvFileEnv] : "") ||
        raw.payerEnvFile ||
        raw.x402PayerEnvFile ||
        fallback.payerEnvFile ||
        (mode === "zapper-x402" ? DEFAULT_ZAPPER_X402_PAYER_ENV_FILE : "")
    ).trim(),
    payerEnvKey: String(
      raw.payerEnvKey ??
        raw.x402PayerEnvKey ??
        fallback.payerEnvKey ??
        DEFAULT_ZAPPER_X402_PAYER_ENV_KEY
    ).trim(),
    rpcUrl: normalizeUrl(configuredRpcUrl),
    pageSize: clampNumber(
      raw.pageSize ?? raw.zapperPageSize ?? fallback.pageSize ?? DEFAULT_ZAPPER_PAGE_SIZE,
      1,
      250
    ),
    maxPages: clampNumber(
      raw.maxPages ?? raw.zapperMaxPages ?? fallback.maxPages ?? DEFAULT_ZAPPER_MAX_PAGES,
      1,
      100
    ),
    chainIds: normalizeZapperChainIds(raw.chainIds ?? fallback.chainIds ?? DEFAULT_ZAPPER_CHAIN_IDS),
    protocolAliases: normalizeProtocolAliasMap(
      raw.protocolAliases ?? fallback.protocolAliases
    )
  };
}

async function resolveBackendConfig(options = {}) {
  const backendConfig =
    (await loadJson(options.backendConfigPath ?? backendConfigPath, null)) ?? {};
  const topLevel = resolveBackendEntry(
    {
      ...backendConfig,
      mode:
        options.backendMode ||
        DEFAULT_BACKEND_MODE ||
        backendConfig?.mode ||
        backendConfig?.source,
      url:
        options.backendUrl ||
        DEFAULT_BACKEND_URL ||
        backendConfig?.url ||
        backendConfig?.apiUrl,
      healthUrl:
        options.backendHealthUrl ||
        DEFAULT_BACKEND_HEALTH_URL ||
        backendConfig?.healthUrl,
      timeoutMs:
        options.backendTimeoutMs ||
        DEFAULT_BACKEND_TIMEOUT_MS ||
        backendConfig?.timeoutMs,
      requestShape:
        options.backendRequestShape ||
        backendConfig?.requestShape ||
        "agentic-poap.oracle-proof.v1",
      authToken:
        options.backendAuthToken ||
        DEFAULT_BACKEND_AUTH_TOKEN ||
        backendConfig?.authToken,
      apiKey:
        options.backendApiKey ||
        DEFAULT_ZAPPER_API_KEY ||
        backendConfig?.apiKey,
      pageSize:
        options.zapperPageSize ||
        backendConfig?.pageSize ||
        backendConfig?.zapperPageSize ||
        DEFAULT_ZAPPER_PAGE_SIZE,
      maxPages:
        options.zapperMaxPages ||
        backendConfig?.maxPages ||
        backendConfig?.zapperMaxPages ||
        DEFAULT_ZAPPER_MAX_PAGES,
      chainIds:
        options.zapperChainIds || backendConfig?.chainIds || DEFAULT_ZAPPER_CHAIN_IDS
    },
    {}
  );

  const rawAdapterBackends =
    backendConfig?.adapterBackends && typeof backendConfig.adapterBackends === "object"
      ? backendConfig.adapterBackends
      : backendConfig?.backends && typeof backendConfig.backends === "object"
        ? backendConfig.backends
        : {};
  const adapterBackends = Object.fromEntries(
    Object.entries(rawAdapterBackends)
      .filter(([, value]) => value && typeof value === "object")
      .map(([adapterType, value]) => [String(adapterType).trim().toUpperCase(), resolveBackendEntry(value, topLevel)])
  );

  return {
    ...topLevel,
    adapterBackends
  };
}

function buildBackendSummaryEntry(backend, database) {
  const walletAgeCount = Object.keys(database?.walletAgeActivity ?? {}).length;
  const protocolCount = Object.keys(database?.protocolActivity ?? {}).length;
  const portfolioCount = Object.keys(database?.portfolioState ?? {}).length;
  const internalCount = Object.keys(database?.internalServiceActivity ?? {}).length;
  return {
    mode: backend.mode,
    url: backend.url || "",
    healthUrl: backend.healthUrl || "",
    timeoutMs: backend.timeoutMs,
    requestShape: backend.requestShape || "",
    provider:
      backend.mode === "zapper" || backend.mode === "zapper-x402"
        ? {
            name: backend.mode === "zapper-x402" ? "zapper-x402" : "zapper",
            graphqlUrl: backend.graphqlUrl || "",
            rpcUrl: backend.rpcUrl || "",
            hasApiKey: Boolean(backend.apiKey),
            hasPayerKey: Boolean(backend.payerPrivateKey || backend.payerEnvFile),
            pageSize: backend.pageSize,
            maxPages: backend.maxPages,
            chainIds: backend.chainIds
          }
        : undefined,
    fileSnapshots:
      backend.mode === "file"
        ? {
            walletAgeActivity: walletAgeCount,
            protocolActivity: protocolCount,
            portfolioState: portfolioCount,
            internalServiceActivity: internalCount
          }
        : undefined
  };
}

function buildSourceSummary(backend, database) {
  return {
    ...buildBackendSummaryEntry(backend, database),
    adapterBackends:
      backend.adapterBackends && Object.keys(backend.adapterBackends).length > 0
        ? Object.fromEntries(
            Object.entries(backend.adapterBackends).map(([adapterType, entry]) => [
              adapterType,
              buildBackendSummaryEntry(entry, database)
            ])
          )
        : undefined
  };
}

function normalizePrivateKey(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed : "";
}

async function readEnvStyleFileValue(pathname, key) {
  const normalizedPath = String(pathname ?? "").trim();
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedPath || !normalizedKey) {
    return "";
  }

  const source = await readFile(normalizedPath, "utf8");
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) {
      continue;
    }
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== normalizedKey) {
      continue;
    }
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }

  return "";
}

async function resolveZapperX402PayerPrivateKey(backend) {
  const direct = normalizePrivateKey(backend?.payerPrivateKey);
  if (direct) {
    return direct;
  }

  const fromFile = normalizePrivateKey(
    await readEnvStyleFileValue(backend?.payerEnvFile, backend?.payerEnvKey)
  );
  if (fromFile) {
    return fromFile;
  }

  return "";
}

function buildZapperGraphqlBackend(backend) {
  return {
    ...backend,
    mode: "zapper",
    url: normalizeUrl(backend?.graphqlUrl || DEFAULT_ZAPPER_API_URL)
  };
}

function recordDecision(recentDecisions, decision) {
  recentDecisions.unshift({
    ...decision,
    createdAt: decision.createdAt ?? new Date().toISOString()
  });
  if (recentDecisions.length > MAX_RECENT_DECISIONS) {
    recentDecisions.length = MAX_RECENT_DECISIONS;
  }
}

async function readBackendHealth(backend) {
  if (backend.mode === "zapper-x402") {
    try {
      const payerPrivateKey = await resolveZapperX402PayerPrivateKey(backend);
      return {
        ok: Boolean(payerPrivateKey || backend.apiKey),
        status: payerPrivateKey || backend.apiKey ? 200 : 0,
        payload: {
          mode: backend.mode,
          url: backend.url || DEFAULT_ZAPPER_X402_URL,
          graphqlUrl: backend.graphqlUrl || DEFAULT_ZAPPER_API_URL,
          rpcUrl: backend.rpcUrl || DEFAULT_ZAPPER_X402_RPC_URL,
          apiKeyConfigured: Boolean(backend.apiKey),
          payerConfigured: Boolean(payerPrivateKey),
          payerAddress: payerPrivateKey ? privateKeyToAccount(payerPrivateKey).address : ""
        },
        error:
          payerPrivateKey || backend.apiKey
            ? undefined
            : "Missing x402 payer key and Zapper API key fallback."
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : "Backend health check failed."
      };
    }
  }

  if (backend.mode === "zapper") {
    if (!backend.apiKey) {
      return {
        ok: false,
        status: 0,
        error: "Missing Zapper API key."
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(backend.timeoutMs, 5000));
    try {
      const response = await fetch(backend.url || DEFAULT_ZAPPER_API_URL, {
        method: "POST",
        headers: buildBackendHeaders(backend),
        body: JSON.stringify({
          query: "query OracleZapperHealth { __typename }"
        }),
        signal: controller.signal
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      return {
        ok: response.ok && !payload?.errors,
        status: response.status,
        payload
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : "Backend health check failed."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  if (backend.mode !== "http" || !backend.healthUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(backend.timeoutMs, 5000));
  try {
    const response = await fetch(backend.healthUrl, {
      method: "GET",
      headers: buildBackendHeaders(backend),
      signal: controller.signal
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Backend health check failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readAdapterBackendHealth(backend) {
  if (!backend?.adapterBackends || typeof backend.adapterBackends !== "object") {
    return {};
  }

  const entries = await Promise.all(
    Object.entries(backend.adapterBackends).map(async ([adapterType, entry]) => [
      adapterType,
      await readBackendHealth(entry)
    ])
  );
  return Object.fromEntries(entries);
}

function resolveBackendForAdapter(backend, adapterType) {
  return backend?.adapterBackends?.[String(adapterType ?? "").trim().toUpperCase()] ?? backend;
}

function normalizeAuthorization(authorization = {}) {
  return {
    walletAddress: normalizeAddress(authorization.walletAddress),
    issuedAt: normalizeBodyNumber(authorization.issuedAt, 0),
    expiresAt: normalizeBodyNumber(authorization.expiresAt, 0),
    signature: String(authorization.signature ?? "").trim()
  };
}

async function ensureWalletAuthorization({
  badgeRegistryAddress,
  chainId,
  definitionId,
  walletAddress,
  criteriaHash,
  authorization
}) {
  const normalizedAuthorization = normalizeAuthorization(authorization);
  const normalizedWallet = normalizeAddress(walletAddress);
  if (
    !normalizedWallet ||
    normalizedAuthorization.walletAddress !== normalizedWallet ||
    !normalizedAuthorization.signature
  ) {
    throw new Error("The wallet authorization is missing required fields.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    normalizedAuthorization.issuedAt <= 0 ||
    normalizedAuthorization.expiresAt <= normalizedAuthorization.issuedAt ||
    normalizedAuthorization.expiresAt < now
  ) {
    throw new Error("The wallet authorization has expired.");
  }

  const digest = buildOracleProofAuthorizationDigest({
    badgeRegistryAddress,
    chainId,
    definitionId,
    walletAddress: normalizedWallet,
    criteriaHash,
    issuedAt: normalizedAuthorization.issuedAt,
    expiresAt: normalizedAuthorization.expiresAt
  });
  const recoveredSigner = await recoverMessageAddress({
    message: {
      raw: digest
    },
    signature: normalizedAuthorization.signature
  });
  return normalizeAddress(recoveredSigner);
}

function mergeWalletAgeSnapshots(snapshots = []) {
  const chains = new Map();
  let firstActivityAt = 0;
  let txCount = 0;
  let gasSpentUsd = 0;
  let walletAddress = "";

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }
    walletAddress = walletAddress || normalizeAddress(snapshot.walletAddress ?? snapshot.wallet);
    const valueFirstActivityAt = Number(snapshot.firstActivityAt ?? 0) || 0;
    if (valueFirstActivityAt && (!firstActivityAt || valueFirstActivityAt < firstActivityAt)) {
      firstActivityAt = valueFirstActivityAt;
    }
    txCount += Number(snapshot.txCount ?? 0) || 0;
    gasSpentUsd += Number(snapshot.gasSpentUsd ?? 0) || 0;
    const rawChains = Array.isArray(snapshot.chains)
      ? snapshot.chains
      : snapshot.chains && typeof snapshot.chains === "object"
        ? Object.entries(snapshot.chains).map(([chainId, value]) => ({
            ...(value && typeof value === "object" ? value : {}),
            chainId
          }))
        : [];
    for (const chain of rawChains) {
      const chainId = String(chain.chainId ?? "").trim().toLowerCase();
      if (!chainId) {
        continue;
      }
      const existing = chains.get(chainId) ?? {
        chainId,
        firstActivityAt: 0,
        txCount: 0,
        gasSpentUsd: 0
      };
      const chainFirstActivityAt = Number(chain.firstActivityAt ?? 0) || 0;
      if (
        chainFirstActivityAt &&
        (!existing.firstActivityAt || chainFirstActivityAt < existing.firstActivityAt)
      ) {
        existing.firstActivityAt = chainFirstActivityAt;
      }
      existing.txCount += Number(chain.txCount ?? 0) || 0;
      existing.gasSpentUsd += Number(chain.gasSpentUsd ?? 0) || 0;
      chains.set(chainId, existing);
    }
  }

  return {
    walletAddress,
    firstActivityAt,
    txCount,
    gasSpentUsd,
    chains: [...chains.values()]
  };
}

function buildWalletAgeSnapshotFromChains(walletAddress = "", chains = []) {
  return mergeWalletAgeSnapshots([
    {
      walletAddress,
      chains
    }
  ]);
}

function mergeProtocolSnapshots(snapshots = []) {
  return {
    walletAddress:
      snapshots
        .map((entry) => normalizeAddress(entry?.walletAddress ?? entry?.wallet))
        .find(Boolean) || "",
    interactions: snapshots.flatMap((entry) =>
      Array.isArray(entry?.interactions) ? entry.interactions : Array.isArray(entry?.protocols) ? entry.protocols : []
    )
  };
}

function mergePortfolioSnapshots(snapshots = []) {
  const collectionMap = new Map();
  const positionMap = new Map();
  let tokenUsd = 0;
  let nftUsd = 0;
  let defiUsd = 0;
  let totalUsd = 0;
  let walletAddress = "";

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }
    walletAddress = walletAddress || normalizeAddress(snapshot.walletAddress ?? snapshot.wallet);
    tokenUsd += Number(snapshot.tokenUsd ?? snapshot.tokensUsd ?? 0) || 0;
    nftUsd += Number(snapshot.nftUsd ?? snapshot.nftsUsd ?? 0) || 0;
    defiUsd += Number(snapshot.defiUsd ?? snapshot.deFiUsd ?? 0) || 0;
    totalUsd += Number(snapshot.totalUsd ?? snapshot.portfolioUsd ?? 0) || 0;

    for (const collection of Array.isArray(snapshot.collections) ? snapshot.collections : []) {
      const collectionId = String(
        collection.collectionId ?? collection.collection ?? collection.slug ?? collection.name ?? ""
      )
        .trim()
        .toLowerCase();
      if (!collectionId) {
        continue;
      }
      const existing = collectionMap.get(collectionId) ?? {
        collectionId,
        balance: 0,
        valueUsd: 0
      };
      existing.balance += Number(collection.balance ?? collection.quantity ?? 0) || 0;
      existing.valueUsd += Number(collection.valueUsd ?? collection.usdValue ?? 0) || 0;
      collectionMap.set(collectionId, existing);
    }

    for (const position of Array.isArray(snapshot.positions) ? snapshot.positions : []) {
      const protocolId = String(position.protocolId ?? position.protocol ?? position.name ?? "")
        .trim()
        .toLowerCase();
      const chainId = String(position.chainId ?? position.chain ?? "").trim().toLowerCase();
      const key = `${protocolId}:${chainId}`;
      if (!protocolId && !(Number(position.valueUsd ?? position.usdValue ?? 0) > 0)) {
        continue;
      }
      const existing = positionMap.get(key) ?? {
        protocolId,
        chainId,
        valueUsd: 0
      };
      existing.valueUsd += Number(position.valueUsd ?? position.usdValue ?? position.balanceUsd ?? 0) || 0;
      positionMap.set(key, existing);
    }
  }

  return {
    walletAddress,
    tokenUsd,
    nftUsd,
    defiUsd,
    totalUsd: totalUsd || tokenUsd + nftUsd + defiUsd,
    collections: [...collectionMap.values()],
    positions: [...positionMap.values()]
  };
}

function mergeInternalServiceSnapshots(snapshots = []) {
  const activities = [];
  const evmChains = new Map();
  let walletAddress = "";

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }
    walletAddress = walletAddress || normalizeAddress(snapshot.walletAddress ?? snapshot.wallet);
    activities.push(...(Array.isArray(snapshot.activities) ? snapshot.activities : []));
    const rawChains = Array.isArray(snapshot.evmChains)
      ? snapshot.evmChains
      : Array.isArray(snapshot.evmActivity?.chains)
        ? snapshot.evmActivity.chains
      : snapshot.evmActivity?.chains && typeof snapshot.evmActivity.chains === "object"
        ? Object.entries(snapshot.evmActivity.chains).map(([chainId, value]) => ({
            ...(value && typeof value === "object" ? value : {}),
            chainId
          }))
        : [];
    for (const chain of rawChains) {
      const chainId = String(chain.chainId ?? "").trim().toLowerCase();
      if (!chainId) {
        continue;
      }
      const existing = evmChains.get(chainId) ?? {
        chainId,
        txCount: 0,
        agentTxCount: 0,
        subjectType: "",
        subjectId: "",
        lastSeenAt: 0
      };
      existing.txCount += Number(chain.txCount ?? chain.transactions ?? chain.activityCount ?? 0) || 0;
      existing.agentTxCount +=
        Number(chain.agentTxCount ?? chain.qualifyingTxCount ?? chain.verifiedAgentTxCount ?? 0) || 0;
      existing.subjectType = existing.subjectType || String(chain.subjectType ?? "").trim().toUpperCase();
      existing.subjectId = existing.subjectId || String(chain.subjectId ?? chain.agentId ?? chain.agentSlug ?? "").trim();
      existing.lastSeenAt = Math.max(existing.lastSeenAt, Number(chain.lastSeenAt ?? chain.timestamp ?? 0) || 0);
      evmChains.set(chainId, existing);
    }
  }

  return {
    walletAddress,
    activities,
    evmChains: [...evmChains.values()]
  };
}

function resolveFileSnapshot(adapterType, database, walletAddresses) {
  const normalizedWallets = [...new Set(walletAddresses.map((entry) => normalizeAddress(entry)).filter(Boolean))];
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY":
      return mergeWalletAgeSnapshots(
        normalizedWallets.map((wallet) => database?.walletAgeActivity?.[wallet.toLowerCase()] ?? null)
      );
    case "PROTOCOL_ACTIVITY":
      return mergeProtocolSnapshots(
        normalizedWallets.map((wallet) => database?.protocolActivity?.[wallet.toLowerCase()] ?? null)
      );
    case "PORTFOLIO_STATE":
      return mergePortfolioSnapshots(
        normalizedWallets.map((wallet) => database?.portfolioState?.[wallet.toLowerCase()] ?? null)
      );
    case "INTERNAL_SERVICE_ACTIVITY":
      return mergeInternalServiceSnapshots(
        normalizedWallets.map((wallet) => database?.internalServiceActivity?.[wallet.toLowerCase()] ?? null)
      );
    default:
      throw new Error(`Unsupported oracle adapter type: ${adapterType || "unset"}.`);
  }
}

function formatGraphQLString(value) {
  return JSON.stringify(String(value ?? ""));
}

function formatGraphQLStringArray(values = []) {
  return `[${values.map((entry) => formatGraphQLString(entry)).join(", ")}]`;
}

function formatGraphQLNumberArray(values = []) {
  return `[${values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.floor(entry))
    .join(", ")}]`;
}

function extractZapperErrorDetail(payload, fallback = "Zapper query failed.") {
  const messages = Array.isArray(payload?.errors)
    ? payload.errors
        .map((entry) => String(entry?.message ?? "").trim())
        .filter(Boolean)
    : [];
  return messages.length ? messages.join(" ") : fallback;
}

function readGraphQLConnectionPage(connection, pageSize = 0) {
  const edges = Array.isArray(connection?.edges) ? connection.edges : [];
  const nodes = edges.length
    ? edges.map((entry) => entry?.node).filter(Boolean)
    : Array.isArray(connection?.nodes)
      ? connection.nodes.filter(Boolean)
      : [];
  const pageInfo = connection?.pageInfo && typeof connection.pageInfo === "object" ? connection.pageInfo : {};
  const endCursor = String(pageInfo.endCursor ?? edges[edges.length - 1]?.cursor ?? "").trim();
  const hasNextPage =
    typeof pageInfo.hasNextPage === "boolean"
      ? pageInfo.hasNextPage
      : Boolean(endCursor && pageSize > 0 && nodes.length >= pageSize);
  return {
    nodes,
    endCursor,
    hasNextPage
  };
}

function deriveCollectionIdsFromZapperCollection(collection = {}) {
  const identifiers = new Set();
  const type = String(collection.type ?? collection.collectionType ?? "").trim().toUpperCase();
  const nameSlug = normalizeSlug(collection.displayName ?? collection.name);
  const address = normalizeAddress(collection.address).toLowerCase();

  if (type === "ART_BLOCKS") {
    identifiers.add("artblocks");
  }
  if (nameSlug) {
    identifiers.add(nameSlug);
  }
  if (nameSlug.includes("art-blocks") || nameSlug === "artblocks") {
    identifiers.add("artblocks");
  }
  if (nameSlug.includes("cryptopunk")) {
    identifiers.add("cryptopunks");
  }
  if (address === "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb") {
    identifiers.add("cryptopunks");
  }

  return [...identifiers];
}

function deriveCollectionIdsFromZapperToken(token = {}) {
  const identifiers = new Set();
  const symbolSlug = normalizeSlug(token?.symbol ?? token?.token?.symbol);
  const nameSlug = normalizeSlug(token?.name ?? token?.token?.name);

  if (symbolSlug) {
    identifiers.add(symbolSlug);
  }
  if (nameSlug) {
    identifiers.add(nameSlug);
  }
  if (symbolSlug === "pepe" || nameSlug.includes("pepe")) {
    identifiers.add("pepe");
    identifiers.add("pepe-the-frog");
    identifiers.add("rare-pepe");
  }

  return [...identifiers];
}

function dedupeProtocolInteractions(interactions = []) {
  const interactionMap = new Map();
  for (const interaction of interactions) {
    const protocolId = normalizeSlug(interaction?.protocolId ?? interaction?.protocol ?? interaction?.name);
    if (!protocolId) {
      continue;
    }
    const chainId = resolveChainSlug(interaction?.chainId ?? interaction?.chain);
    const txHash = String(interaction?.txHash ?? "").trim().toLowerCase();
    const timestamp = Number(interaction?.timestamp ?? 0) || 0;
    const key = txHash ? `tx:${protocolId}:${chainId}:${txHash}` : `position:${protocolId}:${chainId}`;
    const existing = interactionMap.get(key) ?? {
      protocolId,
      chainId,
      timestamp,
      txHash,
      interactionCount: 0
    };
    existing.interactionCount += Number(interaction?.interactionCount ?? interaction?.count ?? 1) || 1;
    if (!existing.timestamp && timestamp) {
      existing.timestamp = timestamp;
    }
    if (!existing.txHash && txHash) {
      existing.txHash = txHash;
    }
    interactionMap.set(key, existing);
  }
  return [...interactionMap.values()];
}

function buildZapperPortfolioQuery(
  walletAddresses,
  chainIds,
  pageSize,
  mode = "direct",
  includeTokenDetails = true
) {
  const args = [
    `addresses: ${formatGraphQLStringArray(walletAddresses)}`,
    chainIds.length ? `chainIds: ${formatGraphQLNumberArray(chainIds)}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const argBlock =
    mode === "input"
      ? `input: { ${args} }`
      : args;
  return `
    query OracleZapperPortfolio {
      portfolioV2(${argBlock}) {
        tokenBalances {
          totalBalanceUSD
          ${includeTokenDetails
            ? `byToken(first: ${pageSize}) {
            edges {
              node {
                balance
                balanceUSD
                symbol
                name
                token {
                  address
                  symbol
                  name
                }
              }
            }
          }`
            : ""}
        }
        appBalances {
          totalBalanceUSD
          byApp(first: ${pageSize}) {
            edges {
              node {
                balanceUSD
                app {
                  slug
                }
                network {
                  slug
                  chainId
                }
              }
            }
          }
        }
        nftBalances {
          totalBalanceUSD
        }
      }
    }
  `.trim();
}

function buildZapperTransactionHistoryQuery({
  walletAddresses,
  chainIds,
  pageSize,
  after = "",
  mode = "direct",
  nodeMode = "flat",
  feeMode = "feeObject"
}) {
  const filters = chainIds.length
    ? `filters: { chainIds: ${formatGraphQLNumberArray(chainIds)} }`
    : "";
  const args = [
    `subjects: ${formatGraphQLStringArray(walletAddresses)}`,
    `first: ${pageSize}`,
    filters,
    after ? `after: ${formatGraphQLString(after)}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const argBlock = mode === "input" ? `input: { ${args} }` : args;
  const feeSelection =
    feeMode === "feeObject"
      ? "fee { valueUsd usdValue amountUsd }"
      : feeMode === "gasFeeObject"
        ? "gasFee { valueUsd usdValue amountUsd }"
        : feeMode === "feeScalar"
          ? "feeUsd"
          : feeMode === "gasFeeScalar"
            ? "gasFeeUsd"
            : "";
  const transactionFields = [
    "hash",
    "timestamp",
    feeSelection
  ]
    .filter(Boolean)
    .join("\n              ");
  const nodeSelection =
    nodeMode === "nested"
      ? `transaction {
              ${transactionFields}
            }`
      : transactionFields;

  return `
    query OracleZapperTransactionHistory {
      transactionHistoryV2(${argBlock}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ${nodeSelection}
          }
        }
      }
    }
  `.trim();
}

function buildZapperNftCollectionsQuery({
  walletAddresses,
  chainIds,
  pageSize,
  after = "",
  mode = "input",
  typeField = "type"
}) {
  const args = [
    `owners: ${formatGraphQLStringArray(walletAddresses)}`,
    chainIds.length ? `chainIds: ${formatGraphQLNumberArray(chainIds)}` : "",
    `first: ${pageSize}`,
    after ? `after: ${formatGraphQLString(after)}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const argBlock =
    mode === "direct"
      ? args
      : `input: { ${args} }`;
  return `
    query OracleZapperNftCollections {
      nftCollectionsForOwnersV2(${argBlock}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            address
            name
            ${typeField}
          }
        }
      }
    }
  `.trim();
}

function buildZapperAppTransactionsQuery({
  protocolSlug,
  chainId = 0,
  pageSize,
  after = "",
  mode = "direct"
}) {
  const args = [
    `slug: ${formatGraphQLString(protocolSlug)}`,
    chainId > 0 ? `chainId: ${Math.floor(chainId)}` : "",
    `first: ${pageSize}`,
    after ? `after: ${formatGraphQLString(after)}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  const argBlock =
    mode === "input"
      ? `input: { ${args} }`
      : args;
  return `
    query OracleZapperAppTransactions {
      transactionsForAppV2(${argBlock}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            app {
              slug
            }
            transaction {
              hash
              timestamp
              fromUser {
                address
              }
              toUser {
                address
              }
            }
          }
        }
      }
    }
  `.trim();
}

async function requestZapperGraphQL({ backend, query, operationName }) {
  if (backend.mode !== "zapper" || !backend.url) {
    throw new Error("Zapper-backed evaluations require a configured GraphQL endpoint.");
  }
  if (!backend.apiKey) {
    throw new Error("Set ORACLE_ZAPPER_API_KEY before using the Zapper oracle backend.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backend.timeoutMs);
  let response;
  try {
    response = await fetch(backend.url, {
      method: "POST",
      headers: buildBackendHeaders(backend),
      body: JSON.stringify({
        operationName,
        query
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      extractZapperErrorDetail(payload, `Zapper request failed with status ${response.status}.`)
    );
  }
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(extractZapperErrorDetail(payload));
  }

  return {
    data: payload?.data ?? {},
    requestId: String(
      response.headers.get("x-request-id") ?? response.headers.get("cf-ray") ?? ""
    ).trim()
  };
}

async function requestZapperGraphQLVariants({ backend, operationName, variants = [] }) {
  const cacheKey = `${backend.url || "zapper"}:${operationName}`;
  const preferredVariantLabel = ZAPPER_VARIANT_CACHE.get(cacheKey);
  const orderedVariants = preferredVariantLabel
    ? [
        ...variants.filter((entry) => entry.label === preferredVariantLabel),
        ...variants.filter((entry) => entry.label !== preferredVariantLabel)
      ]
    : variants;
  const errors = [];
  for (const variant of orderedVariants) {
    try {
      const result = await requestZapperGraphQL({
        backend,
        operationName,
        query: variant.query
      });
      ZAPPER_VARIANT_CACHE.set(cacheKey, variant.label);
      return {
        ...result,
        variantLabel: variant.label
      };
    } catch (error) {
      errors.push(
        `${variant.label}: ${error instanceof Error ? error.message : "Zapper query failed."}`
      );
    }
  }

  throw new Error(errors.join(" "));
}

function extractZapperRestErrorDetail(payload, fallback = "Zapper request failed.") {
  if (payload && typeof payload === "object") {
    const message = String(
      payload?.detail ??
        payload?.error ??
        payload?.message ??
        payload?.errors?.[0]?.message ??
        ""
    ).trim();
    if (message) {
      return message;
    }
  }
  return fallback;
}

function readRestConnectionNodes(connection) {
  const edges = Array.isArray(connection?.edges) ? connection.edges : [];
  return edges.length
    ? edges.map((entry) => entry?.node).filter(Boolean)
    : Array.isArray(connection?.nodes)
      ? connection.nodes.filter(Boolean)
      : [];
}

async function getZapperX402AxiosClient(backend) {
  const cached = ZAPPER_X402_CLIENT_CACHE.get(backend);
  if (cached) {
    return cached;
  }

  const payerPrivateKey = await resolveZapperX402PayerPrivateKey(backend);
  if (!payerPrivateKey) {
    throw new Error(
      "Set ORACLE_ZAPPER_X402_PAYER_PRIVATE_KEY or ORACLE_ZAPPER_X402_PAYER_ENV_FILE before using the Zapper x402 backend."
    );
  }

  const payerAccount = privateKeyToAccount(payerPrivateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: payerAccount,
    schemeOptions: {
      rpcUrl: backend.rpcUrl || DEFAULT_ZAPPER_X402_RPC_URL
    }
  });

  const paymentAxios = wrapAxiosWithPayment(
    axios.create({
      timeout: backend.timeoutMs,
      headers: {
        "content-type": "application/json",
        ...backend.headers
      }
    }),
    client
  );
  const context = {
    paymentAxios,
    payerAddress: payerAccount.address
  };
  ZAPPER_X402_CLIENT_CACHE.set(backend, context);
  return context;
}

async function requestZapperRest({ backend, path, body }) {
  if (backend.mode !== "zapper-x402" || !backend.url) {
    throw new Error("Zapper x402 evaluations require a configured REST endpoint.");
  }

  const errors = [];
  const endpointUrl = `${backend.url.replace(/\/$/, "")}/${String(path ?? "").replace(/^\//, "")}`;

  try {
    const { paymentAxios, payerAddress } = await getZapperX402AxiosClient(backend);
    const response = await paymentAxios.post(endpointUrl, body);
    return {
      data: response?.data ?? {},
      requestId: String(response?.headers?.["x-request-id"] ?? response?.headers?.["cf-ray"] ?? "").trim(),
      transport: "x402",
      payerAddress
    };
  } catch (error) {
    const message =
      error?.response?.data
        ? extractZapperRestErrorDetail(
            error.response.data,
            `Zapper x402 request to ${path} failed.`
          )
        : error instanceof Error
          ? error.message
          : `Zapper x402 request to ${path} failed.`;
    errors.push(`x402: ${message}`);
  }

  if (backend.apiKey) {
    try {
      const response = await axios.post(endpointUrl, body, {
        timeout: backend.timeoutMs,
        headers: {
          "content-type": "application/json",
          "x-zapper-api-key": backend.apiKey,
          ...backend.headers
        }
      });
      return {
        data: response?.data ?? {},
        requestId: String(response?.headers?.["x-request-id"] ?? response?.headers?.["cf-ray"] ?? "").trim(),
        transport: "api-key",
        payerAddress: ""
      };
    } catch (error) {
      const message =
        error?.response?.data
          ? extractZapperRestErrorDetail(
              error.response.data,
              `Zapper fallback request to ${path} failed.`
            )
          : error instanceof Error
            ? error.message
            : `Zapper fallback request to ${path} failed.`;
      errors.push(`api-key: ${message}`);
    }
  }

  throw new Error(errors.join(" "));
}

async function requestZapperRestVariants({ backend, operationName, variants = [] }) {
  const cacheKey = `${backend.url || "zapper-x402"}:${operationName}`;
  const preferredVariantLabel = ZAPPER_VARIANT_CACHE.get(cacheKey);
  const orderedVariants = preferredVariantLabel
    ? [
        ...variants.filter((entry) => entry.label === preferredVariantLabel),
        ...variants.filter((entry) => entry.label !== preferredVariantLabel)
      ]
    : variants;
  const errors = [];
  for (const variant of orderedVariants) {
    try {
      const result = await requestZapperRest({
        backend,
        path: variant.path,
        body: variant.body
      });
      ZAPPER_VARIANT_CACHE.set(cacheKey, variant.label);
      return {
        ...result,
        variantLabel: variant.label
      };
    } catch (error) {
      errors.push(
        `${variant.label}: ${error instanceof Error ? error.message : "Zapper request failed."}`
      );
    }
  }

  throw new Error(errors.join(" "));
}

function buildZapperRestBalanceBody(walletAddresses, chainIds, pageSize) {
  return {
    addresses: walletAddresses,
    ...(chainIds.length ? { chainIds } : {}),
    ...(pageSize > 0 ? { first: pageSize } : {})
  };
}

function buildZapperRestTransactionHistoryBody(walletAddresses, chainIds, pageSize, after = "") {
  return {
    subjects: walletAddresses,
    ...(chainIds.length ? { chainIds } : {}),
    ...(pageSize > 0 ? { first: pageSize } : {}),
    ...(after ? { after } : {})
  };
}

function mapZapperRestTokenSnapshot(data, walletAddresses) {
  const portfolio = data?.data?.portfolioV2 ?? data?.portfolioV2 ?? {};
  const tokenBalances = portfolio?.tokenBalances ?? {};
  const nodes = readRestConnectionNodes(tokenBalances?.byToken);
  const collections = nodes.flatMap((entry) => {
    const valueUsd = Number(entry?.balanceUSD ?? 0) || 0;
    const parsedBalance = Number(entry?.balance ?? entry?.quantity ?? 0);
    return deriveCollectionIdsFromZapperToken(entry).map((collectionId) => ({
      collectionId,
      balance:
        Number.isFinite(parsedBalance) && parsedBalance > 0 ? parsedBalance : valueUsd > 0 ? 1 : 0,
      valueUsd
    }));
  });

  return {
    walletAddress: walletAddresses.find(Boolean) ?? "",
    tokenUsd: Number(tokenBalances?.totalBalanceUSD ?? 0) || 0,
    collections
  };
}

function mapZapperRestNftSnapshot(data, walletAddresses) {
  const portfolio = data?.data?.portfolioV2 ?? data?.portfolioV2 ?? {};
  const nftBalances = portfolio?.nftBalances ?? {};
  const nodes = readRestConnectionNodes(nftBalances?.byToken);
  const collections = [];

  for (const entry of nodes) {
    const token = entry?.token ?? {};
    const collection = token?.collection ?? {};
    const valueUsd = Number(token?.estimatedValue?.valueUsd ?? entry?.valueUsd ?? 0) || 0;
    for (const collectionId of deriveCollectionIdsFromZapperCollection(collection)) {
      collections.push({
        collectionId,
        balance: 1,
        valueUsd
      });
    }
  }

  return {
    walletAddress: walletAddresses.find(Boolean) ?? "",
    nftUsd: Number(nftBalances?.totalBalanceUSD ?? 0) || 0,
    collections
  };
}

function mapZapperRestDefiSnapshot(data, walletAddresses, backend) {
  const portfolio = data?.data?.portfolioV2 ?? data?.portfolioV2 ?? {};
  const appBalances = portfolio?.appBalances ?? {};
  const nodes = readRestConnectionNodes(appBalances?.byApp);
  const positions = nodes
    .map((entry) => ({
      protocolId: canonicalizeProtocolId(backend, entry?.app?.slug),
      chainId: resolveChainSlug(entry?.network?.slug ?? entry?.network?.chainId),
      valueUsd: Number(entry?.balanceUSD ?? 0) || 0
    }))
    .filter((entry) => entry.protocolId || entry.valueUsd > 0);

  return {
    walletAddress: walletAddresses.find(Boolean) ?? "",
    defiUsd: Number(appBalances?.totalBalanceUSD ?? 0) || 0,
    positions
  };
}

function mapZapperPortfolioSnapshot(data, walletAddresses, backend) {
  const portfolio = data?.portfolioV2 ?? {};
  const tokenUsd = Number(portfolio?.tokenBalances?.totalBalanceUSD ?? 0) || 0;
  const nftUsd = Number(portfolio?.nftBalances?.totalBalanceUSD ?? 0) || 0;
  const defiUsd = Number(portfolio?.appBalances?.totalBalanceUSD ?? 0) || 0;
  const appPage = readGraphQLConnectionPage(portfolio?.appBalances?.byApp);
  const tokenPage = readGraphQLConnectionPage(portfolio?.tokenBalances?.byToken);
  const positions = appPage.nodes
    .map((entry) => ({
      protocolId: canonicalizeProtocolId(backend, entry?.app?.slug),
      chainId: resolveChainSlug(entry?.network?.slug ?? entry?.network?.chainId),
      valueUsd: Number(entry?.balanceUSD ?? 0) || 0
    }))
    .filter((entry) => entry.protocolId || entry.valueUsd > 0);
  const collections = tokenPage.nodes.flatMap((entry) => {
    const valueUsd = Number(entry?.balanceUSD ?? entry?.valueUsd ?? entry?.usdValue ?? 0) || 0;
    const parsedBalance = Number(entry?.balance ?? entry?.quantity ?? 0);
    return deriveCollectionIdsFromZapperToken(entry).map((collectionId) => ({
      collectionId,
      balance: Number.isFinite(parsedBalance) && parsedBalance > 0 ? parsedBalance : valueUsd > 0 ? 1 : 0,
      valueUsd
    }));
  });

  return {
    walletAddress: walletAddresses.find(Boolean) ?? "",
    tokenUsd,
    nftUsd,
    defiUsd,
    totalUsd: tokenUsd + nftUsd + defiUsd,
    collections,
    positions
  };
}

function mapZapperOwnedCollectionsToSnapshot(data, walletAddresses, existingSnapshot = {}) {
  const collectionPage = readGraphQLConnectionPage(data?.nftCollectionsForOwnersV2, 0);
  const delta = {
    walletAddress: existingSnapshot.walletAddress || walletAddresses.find(Boolean) || "",
    collections: []
  };

  for (const collection of collectionPage.nodes) {
    const balance =
      Number(
        collection?.balance ??
          collection?.quantity ??
          collection?.ownedTokenCount ??
          collection?.ownedNfts ??
          0
      ) || 0;
    const valueUsd =
      Number(
        collection?.valueUsd ??
          collection?.usdValue ??
          collection?.estimatedValueUsd ??
          collection?.floorPriceUsd ??
          collection?.floorPrice?.valueUsd ??
          0
      ) || 0;
    for (const collectionId of deriveCollectionIdsFromZapperCollection(collection)) {
      delta.collections.push({
        collectionId,
        balance: balance > 0 ? balance : 1,
        valueUsd
      });
    }
  }

  return {
    snapshot: mergePortfolioSnapshots([existingSnapshot, delta]),
    pageInfo: collectionPage
  };
}

function mapZapperAppTransactionsToInteractions(data, walletAddresses, requestedProtocolId, backend) {
  const walletSet = new Set(
    walletAddresses.map((entry) => normalizeAddress(entry).toLowerCase()).filter(Boolean)
  );
  const transactionPage = readGraphQLConnectionPage(data?.transactionsForAppV2, 0);
  const interactions = transactionPage.nodes
    .map((entry) => {
      const transaction = entry?.transaction ?? {};
      const fromAddress = normalizeAddress(transaction?.fromUser?.address).toLowerCase();
      const toAddress = normalizeAddress(transaction?.toUser?.address).toLowerCase();
      if (!walletSet.has(fromAddress) && !walletSet.has(toAddress)) {
        return null;
      }
      return {
        protocolId: canonicalizeProtocolId(backend, entry?.app?.slug ?? requestedProtocolId),
        chainId: resolveChainSlug(
          transaction?.chainId ??
            transaction?.network?.slug ??
            transaction?.network?.chainId ??
            entry?.chainId ??
            entry?.network?.slug
        ),
        timestamp: Number(transaction?.timestamp ?? entry?.timestamp ?? 0) || 0,
        txHash: String(transaction?.hash ?? entry?.hash ?? "").trim(),
        interactionCount: 1
      };
    })
    .filter(Boolean);

  return {
    interactions,
    pageInfo: transactionPage
  };
}

function mapZapperTransactionHistoryToEntries(data, chainIdHint = 0) {
  const transactionPage = readGraphQLConnectionPage(data?.transactionHistoryV2, 0);
  const entries = transactionPage.nodes
    .map((entry) => {
      const transaction =
        entry?.transaction && typeof entry.transaction === "object" ? entry.transaction : entry;
      const feeUsd =
        Number(
          transaction?.fee?.valueUsd ??
            transaction?.fee?.usdValue ??
            transaction?.fee?.amountUsd ??
            transaction?.gasFee?.valueUsd ??
            transaction?.gasFee?.usdValue ??
            transaction?.gasFee?.amountUsd ??
            transaction?.feeUsd ??
            transaction?.gasFeeUsd ??
            entry?.fee?.valueUsd ??
            entry?.fee?.usdValue ??
            entry?.gasFee?.valueUsd ??
            entry?.gasFee?.usdValue ??
            entry?.feeUsd ??
            entry?.gasFeeUsd ??
            0
        ) || 0;
      return {
        txHash: String(transaction?.hash ?? entry?.hash ?? "").trim().toLowerCase(),
        timestamp: Number(transaction?.timestamp ?? entry?.timestamp ?? 0) || 0,
        chainId: resolveChainSlug(
          chainIdHint ||
            transaction?.chainId ||
            transaction?.network?.slug ||
            transaction?.network?.chainId ||
            entry?.chainId ||
            entry?.network?.slug ||
            entry?.network?.chainId ||
            ""
        ),
        feeUsd
      };
    })
    .filter((entry) => entry.txHash || entry.timestamp);

  return {
    entries,
    pageInfo: transactionPage
  };
}

function walletAgeRequirementMet(criteria, snapshot) {
  return evaluateReusableOracleCriteria("WALLET_AGE_ACTIVITY", criteria, snapshot).eligible;
}

function resolveProtocolAliases(backend, protocolId) {
  const normalized = normalizeSlug(protocolId);
  return [
    ...new Set([normalized, ...(Array.isArray(backend.protocolAliases?.[normalized]) ? backend.protocolAliases[normalized] : [])])
  ].filter(Boolean);
}

async function resolveZapperPortfolioSnapshot({
  backend,
  walletAddresses,
  includeCollections = true
}) {
  if (backend.mode === "zapper-x402") {
    const normalizedWallets = [
      ...new Set(walletAddresses.map((entry) => normalizeAddress(entry)).filter(Boolean))
    ];
    if (!normalizedWallets.length) {
      throw new Error("Oracle requests need at least one authorized wallet address.");
    }

    const chainIds = normalizeZapperChainIds(backend.chainIds);
    const requestIds = new Set();
    const snapshots = [];

    if (includeCollections) {
      const tokenBalances = await requestZapperRest({
        backend,
        path: "token-balances",
        body: buildZapperRestBalanceBody(normalizedWallets, chainIds, backend.pageSize)
      });
      if (tokenBalances.requestId) {
        requestIds.add(tokenBalances.requestId);
      }
      snapshots.push(mapZapperRestTokenSnapshot(tokenBalances.data, normalizedWallets));

      const nftBalances = await requestZapperRest({
        backend,
        path: "nft-balances",
        body: buildZapperRestBalanceBody(normalizedWallets, chainIds, backend.pageSize)
      });
      if (nftBalances.requestId) {
        requestIds.add(nftBalances.requestId);
      }
      snapshots.push(mapZapperRestNftSnapshot(nftBalances.data, normalizedWallets));
    }

    const defiBalances = await requestZapperRestVariants({
      backend,
      operationName: "OracleZapperDefiBalances",
      variants: [
        {
          label: "defi-balances",
          path: "defi-balances",
          body: buildZapperRestBalanceBody(normalizedWallets, chainIds, backend.pageSize)
        },
        {
          label: "app-balances",
          path: "app-balances",
          body: buildZapperRestBalanceBody(normalizedWallets, chainIds, backend.pageSize)
        }
      ]
    });
    if (defiBalances.requestId) {
      requestIds.add(defiBalances.requestId);
    }
    snapshots.push(mapZapperRestDefiSnapshot(defiBalances.data, normalizedWallets, backend));

    return {
      snapshot: mergePortfolioSnapshots(snapshots),
      requestId: [...requestIds].join(",")
    };
  }

  const normalizedWallets = [
    ...new Set(walletAddresses.map((entry) => normalizeAddress(entry)).filter(Boolean))
  ];
  if (!normalizedWallets.length) {
    throw new Error("Oracle requests need at least one authorized wallet address.");
  }

  const chainIds = normalizeZapperChainIds(backend.chainIds);
  const requestIds = new Set();
  const portfolio = await requestZapperGraphQLVariants({
    backend,
    operationName: "OracleZapperPortfolio",
    variants: [
      {
        label: "portfolioV2 direct tokens",
        query: buildZapperPortfolioQuery(
          normalizedWallets,
          chainIds,
          backend.pageSize,
          "direct",
          true
        )
      },
      {
        label: "portfolioV2 input tokens",
        query: buildZapperPortfolioQuery(
          normalizedWallets,
          chainIds,
          backend.pageSize,
          "input",
          true
        )
      },
      {
        label: "portfolioV2 direct",
        query: buildZapperPortfolioQuery(
          normalizedWallets,
          chainIds,
          backend.pageSize,
          "direct",
          false
        )
      },
      {
        label: "portfolioV2 input",
        query: buildZapperPortfolioQuery(
          normalizedWallets,
          chainIds,
          backend.pageSize,
          "input",
          false
        )
      }
    ]
  });
  if (portfolio.requestId) {
    requestIds.add(portfolio.requestId);
  }

  let snapshot = mapZapperPortfolioSnapshot(portfolio.data, normalizedWallets, backend);
  if (!includeCollections) {
    return {
      snapshot,
      requestId: [...requestIds].join(",")
    };
  }

  let after = "";
  let previousCursor = "";
  for (let page = 0; page < backend.maxPages; page += 1) {
    const collections = await requestZapperGraphQLVariants({
      backend,
      operationName: "OracleZapperNftCollections",
      variants: [
        {
          label: "nftCollectionsForOwnersV2 input type",
          query: buildZapperNftCollectionsQuery({
            walletAddresses: normalizedWallets,
            chainIds,
            pageSize: backend.pageSize,
            after,
            mode: "input",
            typeField: "type"
          })
        },
        {
          label: "nftCollectionsForOwnersV2 direct type",
          query: buildZapperNftCollectionsQuery({
            walletAddresses: normalizedWallets,
            chainIds,
            pageSize: backend.pageSize,
            after,
            mode: "direct",
            typeField: "type"
          })
        },
        {
          label: "nftCollectionsForOwnersV2 input collectionType",
          query: buildZapperNftCollectionsQuery({
            walletAddresses: normalizedWallets,
            chainIds,
            pageSize: backend.pageSize,
            after,
            mode: "input",
            typeField: "collectionType"
          })
        },
        {
          label: "nftCollectionsForOwnersV2 direct collectionType",
          query: buildZapperNftCollectionsQuery({
            walletAddresses: normalizedWallets,
            chainIds,
            pageSize: backend.pageSize,
            after,
            mode: "direct",
            typeField: "collectionType"
          })
        }
      ]
    });
    if (collections.requestId) {
      requestIds.add(collections.requestId);
    }

    const mappedCollections = mapZapperOwnedCollectionsToSnapshot(
      collections.data,
      normalizedWallets,
      snapshot
    );
    snapshot = mappedCollections.snapshot;

    if (
      !mappedCollections.pageInfo.hasNextPage ||
      !mappedCollections.pageInfo.endCursor ||
      mappedCollections.pageInfo.endCursor === previousCursor
    ) {
      break;
    }
    previousCursor = mappedCollections.pageInfo.endCursor;
    after = mappedCollections.pageInfo.endCursor;
  }

  return {
    snapshot,
    requestId: [...requestIds].join(",")
  };
}

async function resolveZapperWalletAgeSnapshot({ backend, walletAddresses, criteria }) {
  if (backend.mode === "zapper-x402") {
    if (!backend.apiKey) {
      throw new Error(
        "WALLET_AGE_ACTIVITY currently needs ORACLE_ZAPPER_API_KEY fallback because Zapper's x402 transaction-history payload omits the timestamp/hash/fee fields this badge engine needs."
      );
    }
    return resolveZapperWalletAgeSnapshot({
      backend: buildZapperGraphqlBackend(backend),
      walletAddresses,
      criteria
    });
  }

  const normalizedWallets = [
    ...new Set(walletAddresses.map((entry) => normalizeAddress(entry)).filter(Boolean))
  ];
  if (!normalizedWallets.length) {
    throw new Error("Oracle requests need at least one authorized wallet address.");
  }

  const requestIds = new Set();
  const requestedChainIds =
    Array.isArray(criteria?.chains) && criteria.chains.length
      ? criteria.chains.map((entry) => resolveChainId(entry)).filter(Boolean)
      : normalizeZapperChainIds(backend.chainIds);
  const chainIds = requestedChainIds.length
    ? requestedChainIds
    : normalizeZapperChainIds(backend.chainIds);
  const chainMetrics = new Map();

  for (const chainId of chainIds) {
    const chainSlug = resolveChainSlug(chainId);
    if (!chainSlug) {
      continue;
    }

    const metrics = {
      chainId: chainSlug,
      firstActivityAt: 0,
      txCount: 0,
      gasSpentUsd: 0
    };
    chainMetrics.set(chainSlug, metrics);
    const seenTransactions = new Set();

    let after = "";
    let previousCursor = "";
    for (let page = 0; page < backend.maxPages; page += 1) {
      const transactionFeed = await requestZapperGraphQLVariants({
        backend,
        operationName: "OracleZapperTransactionHistory",
        variants: [
          {
            label: "transactionHistoryV2 direct fee object flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "direct",
              nodeMode: "flat",
              feeMode: "feeObject"
            })
          },
          {
            label: "transactionHistoryV2 input fee object flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "input",
              nodeMode: "flat",
              feeMode: "feeObject"
            })
          },
          {
            label: "transactionHistoryV2 direct gas fee object flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "direct",
              nodeMode: "flat",
              feeMode: "gasFeeObject"
            })
          },
          {
            label: "transactionHistoryV2 input gas fee object flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "input",
              nodeMode: "flat",
              feeMode: "gasFeeObject"
            })
          },
          {
            label: "transactionHistoryV2 direct fee scalar flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "direct",
              nodeMode: "flat",
              feeMode: "feeScalar"
            })
          },
          {
            label: "transactionHistoryV2 input fee scalar flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "input",
              nodeMode: "flat",
              feeMode: "feeScalar"
            })
          },
          {
            label: "transactionHistoryV2 direct no fee flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "direct",
              nodeMode: "flat",
              feeMode: "none"
            })
          },
          {
            label: "transactionHistoryV2 input no fee flat",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "input",
              nodeMode: "flat",
              feeMode: "none"
            })
          },
          {
            label: "transactionHistoryV2 direct no fee nested",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "direct",
              nodeMode: "nested",
              feeMode: "none"
            })
          },
          {
            label: "transactionHistoryV2 input no fee nested",
            query: buildZapperTransactionHistoryQuery({
              walletAddresses: normalizedWallets,
              chainIds: [chainId],
              pageSize: backend.pageSize,
              after,
              mode: "input",
              nodeMode: "nested",
              feeMode: "none"
            })
          }
        ]
      });
      if (transactionFeed.requestId) {
        requestIds.add(transactionFeed.requestId);
      }

      const mappedTransactions = mapZapperTransactionHistoryToEntries(transactionFeed.data, chainId);
      for (const entry of mappedTransactions.entries) {
        const dedupeKey = entry.txHash || [entry.timestamp, metrics.txCount, chainSlug].join(":");
        if (seenTransactions.has(dedupeKey)) {
          continue;
        }
        seenTransactions.add(dedupeKey);
        metrics.txCount += 1;
        metrics.gasSpentUsd += Number(entry.feeUsd ?? 0) || 0;
        if (entry.timestamp && (!metrics.firstActivityAt || entry.timestamp < metrics.firstActivityAt)) {
          metrics.firstActivityAt = entry.timestamp;
        }
      }

      const snapshot = buildWalletAgeSnapshotFromChains(
        normalizedWallets[0] ?? "",
        [...chainMetrics.values()]
      );
      if (walletAgeRequirementMet(criteria, snapshot)) {
        return {
          snapshot,
          requestId: [...requestIds].join(",")
        };
      }

      if (
        !mappedTransactions.pageInfo.hasNextPage ||
        !mappedTransactions.pageInfo.endCursor ||
        mappedTransactions.pageInfo.endCursor === previousCursor
      ) {
        break;
      }
      previousCursor = mappedTransactions.pageInfo.endCursor;
      after = mappedTransactions.pageInfo.endCursor;
    }
  }

  return {
    snapshot: buildWalletAgeSnapshotFromChains(normalizedWallets[0] ?? "", [...chainMetrics.values()]),
    requestId: [...requestIds].join(",")
  };
}

async function resolveZapperProtocolSnapshot({ backend, walletAddresses, criteria }) {
  const normalizedWallets = [
    ...new Set(walletAddresses.map((entry) => normalizeAddress(entry)).filter(Boolean))
  ];
  const requestIds = new Set();
  const protocolIds = Array.isArray(criteria?.protocolIds) ? criteria.protocolIds.map((entry) => normalizeSlug(entry)).filter(Boolean) : [];
  const chainIds = Array.isArray(criteria?.chains) && criteria.chains.length
    ? criteria.chains.map((entry) => resolveChainId(entry)).filter(Boolean)
    : [];
  const portfolio = await resolveZapperPortfolioSnapshot({
    backend,
    walletAddresses: normalizedWallets,
    includeCollections: false
  });
  if (portfolio.requestId) {
    requestIds.add(portfolio.requestId);
  }

  const baseInteractions = portfolio.snapshot.positions
    .filter(
      (entry) =>
        !protocolIds.length || protocolIds.includes(canonicalizeProtocolId(backend, entry.protocolId))
    )
    .map((entry) => ({
      protocolId: canonicalizeProtocolId(backend, entry.protocolId),
      chainId: resolveChainSlug(entry.chainId),
      timestamp: 0,
      txHash: "",
      interactionCount: 1
    }));

  let interactions = dedupeProtocolInteractions(baseInteractions);
  if (evaluateReusableOracleCriteria("PROTOCOL_ACTIVITY", criteria, {
    walletAddress: normalizedWallets[0] ?? "",
    interactions
  }).eligible) {
    return {
      snapshot: {
        walletAddress: normalizedWallets[0] ?? "",
        interactions
      },
      requestId: [...requestIds].join(",")
    };
  }

  const queryBackend = backend.mode === "zapper-x402" ? buildZapperGraphqlBackend(backend) : backend;
  if (queryBackend.mode !== "zapper") {
    return {
      snapshot: {
        walletAddress: normalizedWallets[0] ?? "",
        interactions
      },
      requestId: [...requestIds].join(",")
    };
  }
  if (!queryBackend.apiKey) {
    return {
      snapshot: {
        walletAddress: normalizedWallets[0] ?? "",
        interactions
      },
      requestId: [...requestIds].join(",")
    };
  }

  for (const protocolId of protocolIds) {
    const aliases = resolveProtocolAliases(backend, protocolId);
    const chainIdOptions = chainIds.length ? chainIds : [0];
    for (const alias of aliases) {
      for (const chainId of chainIdOptions) {
        let after = "";
        let previousCursor = "";
        for (let page = 0; page < backend.maxPages; page += 1) {
          const transactionFeed = await requestZapperGraphQLVariants({
            backend: queryBackend,
            operationName: "OracleZapperAppTransactions",
            variants: [
              {
                label: "transactionsForAppV2 direct",
                query: buildZapperAppTransactionsQuery({
                  protocolSlug: alias,
                  chainId,
                  pageSize: queryBackend.pageSize,
                  after,
                  mode: "direct"
                })
              },
              {
                label: "transactionsForAppV2 input",
                query: buildZapperAppTransactionsQuery({
                  protocolSlug: alias,
                  chainId,
                  pageSize: queryBackend.pageSize,
                  after,
                  mode: "input"
                })
              }
            ]
          });
          if (transactionFeed.requestId) {
            requestIds.add(transactionFeed.requestId);
          }

          const mappedTransactions = mapZapperAppTransactionsToInteractions(
            transactionFeed.data,
            normalizedWallets,
            protocolId,
            queryBackend
          );
          interactions = dedupeProtocolInteractions([
            ...interactions,
            ...mappedTransactions.interactions
          ]);

          if (evaluateReusableOracleCriteria("PROTOCOL_ACTIVITY", criteria, {
            walletAddress: normalizedWallets[0] ?? "",
            interactions
          }).eligible) {
            return {
              snapshot: {
                walletAddress: normalizedWallets[0] ?? "",
                interactions
              },
              requestId: [...requestIds].join(",")
            };
          }

          if (
            !mappedTransactions.pageInfo.hasNextPage ||
            !mappedTransactions.pageInfo.endCursor ||
            mappedTransactions.pageInfo.endCursor === previousCursor
          ) {
            break;
          }
          previousCursor = mappedTransactions.pageInfo.endCursor;
          after = mappedTransactions.pageInfo.endCursor;
        }
      }
    }
  }

  return {
    snapshot: {
      walletAddress: normalizedWallets[0] ?? "",
      interactions
    },
    requestId: [...requestIds].join(",")
  };
}

async function resolveProviderEvaluation({ backend, adapterType, walletAddresses, criteria }) {
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY": {
      const walletAge = await resolveZapperWalletAgeSnapshot({
        backend,
        walletAddresses,
        criteria
      });
      return {
        evaluation: evaluateReusableOracleCriteria(adapterType, criteria, walletAge.snapshot),
        requestId: walletAge.requestId
      };
    }
    case "PORTFOLIO_STATE": {
      const portfolio = await resolveZapperPortfolioSnapshot({
        backend,
        walletAddresses,
        includeCollections: true
      });
      return {
        evaluation: evaluateReusableOracleCriteria(adapterType, criteria, portfolio.snapshot),
        requestId: portfolio.requestId
      };
    }
    case "PROTOCOL_ACTIVITY": {
      const protocolActivity = await resolveZapperProtocolSnapshot({
        backend,
        walletAddresses,
        criteria
      });
      return {
        evaluation: evaluateReusableOracleCriteria(adapterType, criteria, protocolActivity.snapshot),
        requestId: protocolActivity.requestId
      };
    }
    default:
      throw new Error(
        `The Zapper oracle backend does not support ${adapterType || "unset"} yet.`
      );
  }
}

async function resolveRemoteEvaluation({
  backend,
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  adapterType,
  walletAddresses,
  criteria,
  criteriaHash,
  authorization,
  linkedAuthorizations
}) {
  if (backend.mode !== "http" || !backend.url) {
    throw new Error("Remote oracle evaluation requires an HTTP backend URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backend.timeoutMs);
  let response;
  try {
    response = await fetch(backend.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(backend.authToken
          ? {
              [backend.authHeaderName]:
                backend.authHeaderName.toLowerCase() === "authorization"
                  ? `Bearer ${backend.authToken}`
                  : backend.authToken
            }
          : {}),
        ...backend.headers
      },
      body: JSON.stringify({
        requestShape: backend.requestShape,
        adapterType,
        walletAddress: agent,
        walletAddresses,
        agent,
        badgeRegistryAddress,
        chainId,
        definitionId,
        criteriaHash,
        criteria,
        authorization,
        linkedAuthorizations
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.detail || `Remote oracle evaluation failed with ${response.status}.`);
  }

  if (payload?.evaluation && typeof payload.evaluation === "object") {
    return {
      evaluation: payload.evaluation,
      requestId: String(payload?.requestId ?? payload?.decisionId ?? "").trim()
    };
  }

  if (payload?.snapshot && typeof payload.snapshot === "object") {
    return {
      evaluation: evaluateReusableOracleCriteria(adapterType, criteria, payload.snapshot),
      requestId: String(payload?.requestId ?? payload?.decisionId ?? "").trim()
    };
  }

  throw new Error("Remote oracle responses must return either an evaluation or snapshot payload.");
}

export async function createServer(options = {}) {
  if (typeof Bun === "undefined") {
    throw new Error("Run the oracle proof server with Bun.");
  }

  const deployment = await loadJson(options.deploymentPath ?? deploymentPath, null);
  const signerAccount = privateKeyToAccount(DEFAULT_SIGNER_PRIVATE_KEY);
  const database = await loadJson(options.databasePath ?? databasePath, {
    walletAgeActivity: {},
    protocolActivity: {},
    portfolioState: {},
    internalServiceActivity: {}
  });
  const backend = await resolveBackendConfig(options);
  const recentDecisions = [];

  const host = options.host ?? DEFAULT_HOST;
  const port = Number(options.port ?? DEFAULT_PORT);
  const defaultRpcUrl = options.rpcUrl ?? deployment?.rpcUrl ?? DEFAULT_RPC_URL;
  const defaultChainId = Number(options.chainId ?? deployment?.chainId ?? DEFAULT_CHAIN_ID);
  const defaultBadgeRegistryAddress = normalizeAddress(
    options.badgeRegistryAddress ?? deployment?.badgeRegistryAddress ?? ""
  );

  return Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/oracle/health") {
        const [backendHealth, adapterBackendHealth] = await Promise.all([
          readBackendHealth(backend),
          readAdapterBackendHealth(backend)
        ]);
        return jsonResponse({
          status: "ok",
          badgeRegistryAddress: defaultBadgeRegistryAddress,
          chainId: defaultChainId,
          rpcUrl: defaultRpcUrl,
          signerAddress: signerAccount.address,
          supportedSchemas: [
            getReusableOracleSchema("WALLET_AGE_ACTIVITY"),
            getReusableOracleSchema("PROTOCOL_ACTIVITY"),
            getReusableOracleSchema("PORTFOLIO_STATE"),
            getReusableOracleSchema("INTERNAL_SERVICE_ACTIVITY")
          ],
          source: buildSourceSummary(backend, database),
          backendHealth,
          adapterBackendHealth,
          recentDecisions: recentDecisions.length
        });
      }

      if (request.method === "GET" && url.pathname === "/api/oracle/admin/config") {
        return jsonResponse({
          status: "ok",
          source: buildSourceSummary(backend, database)
        });
      }

      if (request.method === "GET" && url.pathname === "/api/oracle/admin/decisions") {
        const limit = Math.max(1, Math.min(50, normalizeBodyNumber(url.searchParams.get("limit"), 20)));
        return jsonResponse({
          status: "ok",
          decisions: recentDecisions.slice(0, limit)
        });
      }

      if (request.method !== "POST" || url.pathname !== "/api/oracle/proof") {
        return jsonResponse({ detail: "Not found." }, { status: 404 });
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ detail: "Invalid JSON body." }, { status: 400 });
      }

      const badgeRegistryAddress = normalizeAddress(
        payload.badgeRegistryAddress ?? defaultBadgeRegistryAddress
      );
      const chainId = normalizeBodyNumber(payload.chainId, defaultChainId);
      const rpcUrl = String(payload.rpcUrl ?? defaultRpcUrl ?? "").trim();
      const definitionId = normalizeBodyNumber(payload.definitionId, Number.NaN);
      const agent = normalizeAddress(payload.agent);

      if (!badgeRegistryAddress || !rpcUrl || !Number.isFinite(definitionId) || !agent) {
        return jsonResponse(
          {
            detail:
              "Proof requests require badgeRegistryAddress, rpcUrl, chainId, definitionId, and agent."
          },
          { status: 400 }
        );
      }

      const publicClient = createPublicClient({
        chain: createChain(chainId, rpcUrl),
        transport: http(rpcUrl)
      });

      let definition;
      try {
        definition = await publicClient.readContract({
          address: badgeRegistryAddress,
          abi: agenticBadgeRegistryAbi,
          functionName: "definitions",
          args: [BigInt(definitionId)]
        });
      } catch (error) {
        return jsonResponse(
          {
            detail:
              error instanceof Error
                ? error.message
                : "Could not read the requested badge definition."
          },
          { status: 400 }
        );
      }

      const unlockAdapterConfig = decodeUnlockAdapterConfig("ORACLE_ATTESTATION", definition[6]);
      const adapterType = unlockAdapterConfig.unlockAdapterType;
      if (!isReusableOracleAdapter(adapterType)) {
        return jsonResponse(
          { detail: "This badge is not configured for the reusable oracle proof service." },
          { status: 400 }
        );
      }

      let criteria;
      try {
        criteria = normalizeReusableOracleCriteria(
          adapterType,
          unlockAdapterConfig.oracleCriteriaJson
            ? JSON.parse(unlockAdapterConfig.oracleCriteriaJson)
            : {}
        );
      } catch (error) {
        return jsonResponse(
          {
            detail:
              error instanceof Error
                ? error.message
                : "The stored oracle criteria JSON could not be parsed."
          },
          { status: 500 }
        );
      }
      const criteriaHash = unlockAdapterConfig.oracleCriteriaHash;

      let recoveredSigner = "";
      try {
        recoveredSigner = normalizeAddress(
          await ensureWalletAuthorization({
            badgeRegistryAddress,
            chainId,
            definitionId,
            walletAddress: agent,
            criteriaHash,
            authorization: payload.authorization
          })
        );
      } catch (error) {
        return jsonResponse(
          {
            detail:
              error instanceof Error ? error.message : "Invalid wallet authorization."
          },
          { status: 401 }
        );
      }

      if (recoveredSigner !== agent) {
        return jsonResponse(
          { detail: "The primary wallet authorization was not signed by the claiming wallet." },
          { status: 401 }
        );
      }

      const linkedAuthorizations = Array.isArray(payload.linkedAuthorizations)
        ? payload.linkedAuthorizations
        : [];
      const authorizedWallets = [agent];
      for (const linkedAuthorization of linkedAuthorizations) {
        const linkedWalletAddress = normalizeAddress(linkedAuthorization?.walletAddress);
        if (!linkedWalletAddress || linkedWalletAddress === agent) {
          continue;
        }

        let recoveredLinkedWallet = "";
        try {
          recoveredLinkedWallet = normalizeAddress(
            await ensureWalletAuthorization({
              badgeRegistryAddress,
              chainId,
              definitionId,
              walletAddress: linkedWalletAddress,
              criteriaHash,
              authorization: linkedAuthorization
            })
          );
        } catch (error) {
          return jsonResponse(
            {
              detail:
                error instanceof Error
                  ? error.message
                  : "Invalid linked wallet authorization."
            },
            { status: 401 }
          );
        }

        if (recoveredLinkedWallet !== linkedWalletAddress) {
          return jsonResponse(
            { detail: "A linked wallet authorization was not signed by the declared wallet." },
            { status: 401 }
          );
        }

        authorizedWallets.push(linkedWalletAddress);
      }

      if (normalizeAddress(unlockAdapterConfig.unlockSignerAddress) !== signerAccount.address) {
        return jsonResponse(
          {
            detail:
              `This badge expects issuer ${unlockAdapterConfig.unlockSignerAddress}, but the proof service signer is ${signerAccount.address}.`
          },
          { status: 500 }
        );
      }

      const resolvedBackend = resolveBackendForAdapter(backend, adapterType);

      const decisionBase = {
        id: crypto.randomUUID(),
        requestedAt: new Date().toISOString(),
        badgeRegistryAddress,
        chainId,
        definitionId,
        agent,
        adapterType,
        criteriaHash,
        authorizedWallets,
        sourceMode: resolvedBackend.mode
      };

      let evaluation;
      let backendRequestId = "";
      try {
        if (resolvedBackend.mode === "http") {
          const remote = await resolveRemoteEvaluation({
            backend: resolvedBackend,
            badgeRegistryAddress,
            chainId,
            definitionId,
            agent,
            adapterType,
            walletAddresses: authorizedWallets,
            criteria,
            criteriaHash,
            authorization: payload.authorization,
            linkedAuthorizations
          });
          evaluation = remote.evaluation;
          backendRequestId = remote.requestId;
        } else if (resolvedBackend.mode === "zapper") {
          const provider = await resolveProviderEvaluation({
            backend: resolvedBackend,
            adapterType,
            walletAddresses: authorizedWallets,
            criteria
          });
          evaluation = provider.evaluation;
          backendRequestId = provider.requestId;
        } else {
          const snapshot = resolveFileSnapshot(adapterType, database, authorizedWallets);
          evaluation = evaluateReusableOracleCriteria(adapterType, criteria, snapshot);
        }
      } catch (error) {
        recordDecision(recentDecisions, {
          ...decisionBase,
          eligible: false,
          backendRequestId,
          detail:
            error instanceof Error ? error.message : "Could not evaluate oracle criteria."
        });
        return jsonResponse(
          {
            detail:
              error instanceof Error ? error.message : "Could not evaluate oracle criteria.",
            criteriaHash,
            source: buildSourceSummary(backend, database)
          },
          { status: 502 }
        );
      }

      if (!evaluation.eligible) {
        recordDecision(recentDecisions, {
          ...decisionBase,
          eligible: false,
          backendRequestId,
          detail: formatReusableOracleEvaluationSummary(adapterType, evaluation)
        });
        return jsonResponse(
          {
            detail: "The connected wallet does not yet meet this oracle-backed requirement.",
            criteriaHash,
            criteria: evaluation.criteria,
            evaluation,
            source: buildSourceSummary(backend, database),
            backendRequestId
          },
          { status: 403 }
        );
      }

      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + DEFAULT_PROOF_TTL;
      const proofPackage = await signOracle8183ProofPackage({
        badgeRegistryAddress,
        chainId,
        definitionId,
        agent,
        account: signerAccount,
        schemaId: getReusableOracleSchema(adapterType),
        contextId: criteriaHash,
        contextLabel: buildReusableOracleContextLabel(adapterType, criteria),
        note: `${adapterType.toLowerCase()} eligible: ${formatReusableOracleEvaluationSummary(adapterType, evaluation)}`,
        issuedAt,
        expiresAt
      });

      recordDecision(recentDecisions, {
        ...decisionBase,
        eligible: true,
        backendRequestId,
        detail: formatReusableOracleEvaluationSummary(adapterType, evaluation)
      });

      return jsonResponse({
        proofPackage,
        criteriaHash,
        criteria: evaluation.criteria,
        evaluation,
        source: buildSourceSummary(backend, database),
        backendRequestId
      });
    }
  });
}

if (import.meta.main) {
  const server = await createServer();
  console.log(
    `oracle proof server listening on http://${server.hostname}:${server.port}/api/oracle/proof`
  );
}
