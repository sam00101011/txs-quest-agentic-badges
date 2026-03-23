import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  defineChain,
  http,
  recoverMessageAddress,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { DEFAULT_ORACLE_EVENT_PROOF_TTL, signOracle8183ProofPackage } from "../web/unlockAdapters.js";
import {
  agenticBadgeRegistryAbi,
  identityRegistryAbi
} from "../web/contractAbis.js";
import {
  DEFAULT_PAYMENT_8183_SCHEMA,
  PAYMENT_HISTORY_CRITERIA_KIND,
  DEFAULT_X402_8183_SCHEMA,
  buildPaymentContextLabel,
  buildPaymentCriteriaHash,
  buildPaymentWalletAuthorizationDigest,
  evaluatePaymentHistory,
  formatPaymentEvaluationSummary,
  normalizePaymentCriteria,
  buildX402ContextLabel,
  buildX402CriteriaHash,
  buildX402WalletAuthorizationDigest,
  evaluateX402History,
  formatX402EvaluationSummary,
  normalizeAddress
} from "../web/x402History.js";
import { decodeUnlockAdapterConfig } from "../web/unlockAdapters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const deploymentPath =
  process.env.X402_DEPLOYMENT_PATH ??
  process.env.DEPLOYMENT_PATH ??
  join(projectRoot, "web", "public", "local", "anvil-deployment.json");
const historyPath = join(projectRoot, "config", "x402-history.sample.json");
const paymentBackendConfigPath = join(projectRoot, "config", "payment-backend.json");
const backendConfigPath = join(projectRoot, "config", "x402-backend.json");

const DEFAULT_HOST = process.env.X402_HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number(process.env.X402_PORT ?? "8788");
const DEFAULT_RPC_URL = process.env.X402_RPC_URL ?? "";
const DEFAULT_CHAIN_ID = Number(process.env.X402_CHAIN_ID ?? "31337");
const DEFAULT_PROOF_TTL = Number(
  process.env.X402_PROOF_TTL ?? DEFAULT_ORACLE_EVENT_PROOF_TTL
);
const DEFAULT_SIGNER_PRIVATE_KEY =
  process.env.X402_PROOF_PRIVATE_KEY ??
  process.env.EVENT_SIGNER_PRIVATE_KEY ??
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const DEFAULT_HISTORY_SOURCE =
  process.env.PAYMENT_HISTORY_SOURCE ??
  process.env.X402_HISTORY_SOURCE ??
  "";
const DEFAULT_HISTORY_URL =
  process.env.PAYMENT_HISTORY_URL ??
  process.env.X402_HISTORY_URL ??
  "";
const DEFAULT_HISTORY_HEALTH_URL =
  process.env.PAYMENT_HISTORY_HEALTH_URL ??
  process.env.X402_HISTORY_HEALTH_URL ??
  "";
const DEFAULT_HISTORY_TIMEOUT_MS = Number(
  process.env.PAYMENT_HISTORY_TIMEOUT ??
    process.env.X402_HISTORY_TIMEOUT ??
    "8000"
);
const DEFAULT_HISTORY_AUTH_TOKEN =
  process.env.PAYMENT_HISTORY_AUTH_TOKEN ??
  process.env.X402_HISTORY_AUTH_TOKEN ??
  "";
const MAX_RECENT_DECISIONS = 24;

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
    name: `Agentic x402 ${chainId}`,
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

function normalizeHistorySource(value) {
  return String(value ?? "").trim().toLowerCase() === "http" ? "http" : "file";
}

function normalizeUrl(value) {
  return String(value ?? "").trim().replace(/\/$/, "");
}

async function resolveHistorySourceConfig(options = {}) {
  const preferredConfigPath =
    options.backendConfigPath ??
    process.env.PAYMENT_BACKEND_CONFIG ??
    process.env.X402_BACKEND_CONFIG ??
    paymentBackendConfigPath;
  const backendConfig =
    (await loadJson(preferredConfigPath, null)) ??
    (preferredConfigPath === paymentBackendConfigPath
      ? await loadJson(backendConfigPath, null)
      : null);
  const resolvedConfigPath = backendConfig
    ? (await loadJson(preferredConfigPath, null))
      ? preferredConfigPath
      : backendConfigPath
    : "";
  const configuredSource =
    options.historySource ||
    DEFAULT_HISTORY_SOURCE ||
    backendConfig?.source ||
    backendConfig?.mode ||
    (backendConfig?.url ? "http" : "");
  const authTokenEnv = String(backendConfig?.authTokenEnv ?? "").trim();
  const authHeaderName = String(backendConfig?.authHeader ?? "authorization").trim() || "authorization";
  const extraHeaders = backendConfig?.headers && typeof backendConfig.headers === "object"
    ? backendConfig.headers
    : {};

  return {
    mode: normalizeHistorySource(configuredSource),
    url: normalizeUrl(
      options.historySourceUrl || DEFAULT_HISTORY_URL || backendConfig?.url || ""
    ),
    healthUrl: normalizeUrl(
      options.historySourceHealthUrl || DEFAULT_HISTORY_HEALTH_URL || backendConfig?.healthUrl || ""
    ),
    timeoutMs: normalizeBodyNumber(
      options.historySourceTimeoutMs || DEFAULT_HISTORY_TIMEOUT_MS || backendConfig?.timeoutMs,
      8000
    ),
    requestShape:
      String(
        options.historySourceRequestShape ||
          backendConfig?.requestShape ||
          "agentic-poap.payment-history.v1"
      ).trim() || "agentic-poap.payment-history.v1",
    authToken: String(
      options.historySourceAuthToken ||
        DEFAULT_HISTORY_AUTH_TOKEN ||
        (authTokenEnv ? process.env[authTokenEnv] : "") ||
        backendConfig?.authToken ||
        ""
    ).trim(),
    authHeaderName,
    headers: extraHeaders,
    configPath: resolvedConfigPath
  };
}

function buildSourceSummary(historySource, historyDatabase) {
  return {
    mode: historySource.mode,
    url: historySource.url || "",
    healthUrl: historySource.healthUrl || "",
    timeoutMs: historySource.timeoutMs,
    requestShape: historySource.requestShape || "",
    configPath: historySource.configPath || "",
    historyRecords:
      historySource.mode === "file"
        ? Array.isArray(historyDatabase?.records)
          ? historyDatabase.records.length
          : 0
        : undefined
  };
}

function buildClaimFlowSummary() {
  return {
    mode: "on-demand",
    description:
      "The proof service only evaluates x402 and optional MPP history when the connected agent actively starts a badge claim.",
    steps: [
      "The agent opens txs.quest and starts a claim for a payment-backed badge.",
      "The connected wallet signs a short-lived authorization for its own history.",
      "If present, the connected MPP payer wallet signs a second authorization.",
      "The proof service reads payment history only for those authorized wallets.",
      "If the configured criteria pass, the service returns a signed 8183 proof package.",
      "The agent submits that proof onchain to record the badge claim."
    ],
    guarantees: [
      "No global precomputation of payment badge eligibility.",
      "No paid proof generation until an agent actively tries to claim.",
      "Proof issuance is bound to the connected and authorized wallets only."
    ]
  };
}

async function readBackendHealth(historySource) {
  if (historySource.mode !== "http" || !historySource.healthUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(historySource.timeoutMs, 5000));
  try {
    const response = await fetch(historySource.healthUrl, {
      method: "GET",
      headers: {
        ...(historySource.authToken
          ? {
              [historySource.authHeaderName]:
                historySource.authHeaderName.toLowerCase() === "authorization"
                  ? `Bearer ${historySource.authToken}`
                  : historySource.authToken
            }
          : {}),
        ...historySource.headers
      },
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
      error: error instanceof Error ? error.message : "Health request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readIdentitySummary(publicClient, badgeRegistryAddress, agent) {
  try {
    const identityRegistryAddress = normalizeAddress(
      await publicClient.readContract({
        address: badgeRegistryAddress,
        abi: agenticBadgeRegistryAbi,
        functionName: "identityRegistry"
      })
    );
    if (!identityRegistryAddress || identityRegistryAddress === zeroAddress) {
      return {
        mode: "unavailable",
        identityRegistryAddress: "",
        registered: false,
        primaryWallet: ""
      };
    }

    const registered = Boolean(
      await publicClient.readContract({
        address: identityRegistryAddress,
        abi: identityRegistryAbi,
        functionName: "isRegistered",
        args: [agent]
      })
    );
    const primaryWallet = registered
      ? normalizeAddress(
          await publicClient.readContract({
            address: identityRegistryAddress,
            abi: identityRegistryAbi,
            functionName: "getAgentWallet",
            args: [agent]
          })
        )
      : "";

    return {
      mode: "optional_8004",
      identityRegistryAddress,
      registered,
      primaryWallet
    };
  } catch {
    return {
      mode: "unavailable",
      identityRegistryAddress: "",
      registered: false,
      primaryWallet: ""
    };
  }
}

function ensureWalletAuthorization({
  badgeRegistryAddress,
  chainId,
  definitionId,
  walletAddress,
  criteriaHash,
  authorization
}) {
  const issuedAt = Number(authorization?.issuedAt ?? 0);
  const expiresAt = Number(authorization?.expiresAt ?? 0);
  const signature = String(authorization?.signature ?? "").trim();
  if (!issuedAt || !expiresAt || expiresAt <= issuedAt || !signature) {
    throw new Error("Payment proof requests require a valid wallet authorization signature.");
  }
  if (Math.floor(Date.now() / 1000) > expiresAt) {
    throw new Error("The wallet authorization has expired.");
  }

  const digest = buildPaymentWalletAuthorizationDigest({
    badgeRegistryAddress,
    chainId,
    definitionId,
    walletAddress,
    criteriaHash,
    issuedAt,
    expiresAt
  });

  return recoverMessageAddress({
    message: {
      raw: digest
    },
    signature
  });
}

function ensureAuthorization({ badgeRegistryAddress, chainId, definitionId, agent, criteriaHash, authorization }) {
  return ensureWalletAuthorization({
    badgeRegistryAddress,
    chainId,
    definitionId,
    walletAddress: agent,
    criteriaHash,
    authorization
  });
}

function recordDecision(recentDecisions, decision) {
  recentDecisions.unshift(decision);
  if (recentDecisions.length > MAX_RECENT_DECISIONS) {
    recentDecisions.length = MAX_RECENT_DECISIONS;
  }
}

async function resolveRemoteEvaluation({
  historySource,
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  walletAddresses,
  criteria,
  criteriaHash,
  authorization,
  linkedAuthorizations,
  identitySummary
}) {
  if (!historySource.url) {
    throw new Error(
      "The payment proof server is configured for HTTP history mode, but no backend URL is set."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), historySource.timeoutMs);
  let response;
  try {
    response = await fetch(historySource.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(historySource.authToken
          ? {
              [historySource.authHeaderName]:
                historySource.authHeaderName.toLowerCase() === "authorization"
                  ? `Bearer ${historySource.authToken}`
                  : historySource.authToken
            }
          : {}),
        ...historySource.headers
      },
      body: JSON.stringify({
        requestShape: historySource.requestShape,
        walletAddress: agent,
        walletAddresses,
        agent,
        badgeRegistryAddress,
        chainId,
        definitionId,
        criteriaHash,
        criteria,
        authorization,
        linkedAuthorizations,
        identitySummary
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
    throw new Error(payload?.detail || `Remote payment history request failed with ${response.status}.`);
  }

  if (Array.isArray(payload?.records)) {
    return {
      evaluation:
        String(criteria?.kind ?? "").trim() === PAYMENT_HISTORY_CRITERIA_KIND
          ? evaluatePaymentHistory(criteria, payload.records, {
              walletAddress: agent,
              walletAddresses
            })
          : evaluateX402History(criteria, payload.records, {
              walletAddress: agent
            }),
      requestId: String(payload?.requestId ?? payload?.decisionId ?? "").trim()
    };
  }

  if (payload?.evaluation && typeof payload.evaluation === "object") {
    return {
      evaluation: {
        criteria,
        walletAddress: agent,
        eligible: Boolean(payload.evaluation.eligible),
        metricValue: Number(payload.evaluation.metricValue ?? 0),
        totalAmount: Number(payload.evaluation.totalAmount ?? 0),
        paidRequests: Number(payload.evaluation.paidRequests ?? 0),
        distinctServices: Number(payload.evaluation.distinctServices ?? 0),
        origins: Array.isArray(payload.evaluation.origins) ? payload.evaluation.origins : [],
        recordsMatched: Number(payload.evaluation.recordsMatched ?? 0),
        cutoff: Number(payload.evaluation.cutoff ?? 0),
        latestTimestamp: Number(payload.evaluation.latestTimestamp ?? 0),
        txHashes: Array.isArray(payload.evaluation.txHashes) ? payload.evaluation.txHashes : [],
        matchedRails: Array.isArray(payload.evaluation.matchedRails) ? payload.evaluation.matchedRails : [],
        railRequirementMet: Boolean(payload.evaluation.railRequirementMet ?? true),
        perRail:
          payload.evaluation.perRail && typeof payload.evaluation.perRail === "object"
            ? payload.evaluation.perRail
            : undefined,
        records: Array.isArray(payload.evaluation.records) ? payload.evaluation.records : []
      },
      requestId: String(payload?.requestId ?? payload?.decisionId ?? "").trim()
    };
  }

  throw new Error(
    "Remote payment history responses must return either records or an evaluation object."
  );
}

export async function createServer(options = {}) {
  if (typeof Bun === "undefined") {
    throw new Error("Run the x402 proof server with Bun.");
  }

  const deployment = await loadJson(options.deploymentPath ?? deploymentPath, null);
  const signerAccount = privateKeyToAccount(DEFAULT_SIGNER_PRIVATE_KEY);
  const historyDatabase = await loadJson(options.historyPath ?? historyPath, { records: [] });
  const historySource = await resolveHistorySourceConfig(options);
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

      if (request.method === "GET" && url.pathname === "/api/x402/health") {
        const backendHealth = await readBackendHealth(historySource);
        return jsonResponse({
          status: "ok",
          badgeRegistryAddress: defaultBadgeRegistryAddress,
          chainId: defaultChainId,
          rpcUrl: defaultRpcUrl,
          signerAddress: signerAccount.address,
          schemaId: DEFAULT_PAYMENT_8183_SCHEMA,
          supportedSchemas: [DEFAULT_PAYMENT_8183_SCHEMA, DEFAULT_X402_8183_SCHEMA],
          source: buildSourceSummary(historySource, historyDatabase),
          flow: buildClaimFlowSummary(),
          flowUrl: "/api/x402/flow",
          backendHealth,
          recentDecisions: recentDecisions.length
        });
      }

      if (request.method === "GET" && url.pathname === "/api/x402/flow") {
        return jsonResponse({
          status: "ok",
          flow: buildClaimFlowSummary()
        });
      }

      if (request.method === "GET" && url.pathname === "/api/x402/admin/config") {
        return jsonResponse({
          status: "ok",
          source: buildSourceSummary(historySource, historyDatabase)
        });
      }

      if (request.method === "GET" && url.pathname === "/api/x402/admin/decisions") {
        const limit = Math.max(
          1,
          Math.min(50, normalizeBodyNumber(url.searchParams.get("limit"), 20))
        );
        return jsonResponse({
          status: "ok",
          decisions: recentDecisions.slice(0, limit)
        });
      }

      if (request.method !== "POST" || url.pathname !== "/api/x402/proof") {
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
      if (adapterType !== "X402_HISTORY" && adapterType !== "PAYMENT_HISTORY") {
        return jsonResponse(
          { detail: "This badge is not configured for payment-history proofs." },
          { status: 400 }
        );
      }

      const criteria =
        adapterType === "PAYMENT_HISTORY"
          ? normalizePaymentCriteria({
              metric: unlockAdapterConfig.unlockMetric,
              threshold: unlockAdapterConfig.unlockThreshold,
              origins: unlockAdapterConfig.unlockOrigins,
              windowDays: unlockAdapterConfig.unlockWindowDays,
              identityMode: unlockAdapterConfig.unlockIdentityMode,
              railMode: unlockAdapterConfig.unlockRailMode,
              note: unlockAdapterConfig.unlockNote
            })
          : {
              ...normalizePaymentCriteria({
                metric: unlockAdapterConfig.unlockMetric,
                threshold: unlockAdapterConfig.unlockThreshold,
                origins: unlockAdapterConfig.unlockOrigins,
                windowDays: unlockAdapterConfig.unlockWindowDays,
                identityMode: unlockAdapterConfig.unlockIdentityMode,
                railMode: "X402_ONLY",
                note: unlockAdapterConfig.unlockNote
              }),
              kind: "agentic-poap.x402-history.criteria.v1",
              railMode: "X402_ONLY"
            };
      const criteriaHash =
        adapterType === "PAYMENT_HISTORY"
          ? unlockAdapterConfig.paymentCriteriaHash || buildPaymentCriteriaHash(criteria)
          : unlockAdapterConfig.x402CriteriaHash || buildX402CriteriaHash(criteria);

      let recoveredSigner = "";
      try {
        recoveredSigner = normalizeAddress(
          await ensureAuthorization({
            badgeRegistryAddress,
            chainId,
            definitionId,
            agent,
            criteriaHash,
            authorization: payload.authorization
          })
        );
      } catch (error) {
        return jsonResponse(
          {
            detail:
              error instanceof Error
                ? error.message
                : "Invalid wallet authorization."
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

      const identitySummary =
        unlockAdapterConfig.unlockIdentityMode === "OPTIONAL_8004"
          ? await readIdentitySummary(publicClient, badgeRegistryAddress, agent)
          : {
              mode: "wallet_only",
              identityRegistryAddress: "",
              registered: false,
              primaryWallet: ""
            };

      const decisionBase = {
        id: crypto.randomUUID(),
        requestedAt: new Date().toISOString(),
        badgeRegistryAddress,
        chainId,
        definitionId,
        agent,
        sourceMode: historySource.mode,
        criteriaHash,
        metric: unlockAdapterConfig.unlockMetric,
        threshold: unlockAdapterConfig.unlockThreshold,
        origins: unlockAdapterConfig.unlockOrigins ?? [],
        railMode: unlockAdapterConfig.unlockRailMode ?? (adapterType === "PAYMENT_HISTORY" ? "ANY" : "X402_ONLY"),
        identityMode: unlockAdapterConfig.unlockIdentityMode,
        identityRegistered: Boolean(identitySummary?.registered),
        primaryWallet: identitySummary?.primaryWallet ?? "",
        authorizedWallets
      };

      let evaluation;
      let backendRequestId = "";
      try {
        if (historySource.mode === "http") {
          const remote = await resolveRemoteEvaluation({
            historySource,
            badgeRegistryAddress,
            chainId,
            definitionId,
            agent,
            walletAddresses: authorizedWallets,
            criteria,
            criteriaHash,
            authorization: payload.authorization,
            linkedAuthorizations,
            identitySummary
          });
          evaluation = remote.evaluation;
          backendRequestId = remote.requestId;
        } else {
          evaluation =
            adapterType === "PAYMENT_HISTORY"
              ? evaluatePaymentHistory(criteria, historyDatabase?.records ?? [], {
                  walletAddress: agent,
                  walletAddresses: authorizedWallets
                })
              : evaluateX402History(criteria, historyDatabase?.records ?? [], {
                  walletAddress: agent
                });
        }
      } catch (error) {
        recordDecision(recentDecisions, {
          ...decisionBase,
          eligible: false,
          backendRequestId,
          detail: error instanceof Error ? error.message : "Could not evaluate payment history."
        });
        return jsonResponse(
          {
            detail:
              error instanceof Error ? error.message : "Could not evaluate payment history.",
            criteriaHash,
            identitySummary,
            source: buildSourceSummary(historySource, historyDatabase)
          },
          { status: 502 }
        );
      }

      if (!evaluation.eligible) {
        recordDecision(recentDecisions, {
          ...decisionBase,
          eligible: false,
          backendRequestId,
          detail:
            adapterType === "PAYMENT_HISTORY"
              ? formatPaymentEvaluationSummary(evaluation)
              : formatX402EvaluationSummary(evaluation)
        });
        return jsonResponse(
          {
            detail:
              adapterType === "PAYMENT_HISTORY"
                ? "The connected wallet does not yet meet this payment history requirement."
                : "The connected wallet does not yet meet this x402 history requirement.",
            criteriaHash,
            criteria: evaluation.criteria,
            evaluation: {
              ...evaluation,
              records: undefined
            },
            identitySummary,
            source: buildSourceSummary(historySource, historyDatabase),
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
        schemaId:
          adapterType === "PAYMENT_HISTORY"
            ? DEFAULT_PAYMENT_8183_SCHEMA
            : DEFAULT_X402_8183_SCHEMA,
        contextId: criteriaHash,
        contextLabel:
          adapterType === "PAYMENT_HISTORY"
            ? buildPaymentContextLabel(criteria)
            : buildX402ContextLabel(criteria),
        note:
          adapterType === "PAYMENT_HISTORY"
            ? `payment eligible: ${formatPaymentEvaluationSummary(evaluation)}`
            : `x402 eligible: ${formatX402EvaluationSummary(evaluation)}`,
        issuedAt,
        expiresAt
      });

      recordDecision(recentDecisions, {
        ...decisionBase,
        eligible: true,
        backendRequestId,
        detail:
          adapterType === "PAYMENT_HISTORY"
            ? formatPaymentEvaluationSummary(evaluation)
            : formatX402EvaluationSummary(evaluation)
      });

      return jsonResponse({
        proofPackage,
        criteriaHash,
        criteria: evaluation.criteria,
        evaluation: {
          ...evaluation,
          records: undefined
        },
        identitySummary,
        source: buildSourceSummary(historySource, historyDatabase),
        backendRequestId
      });
    }
  });
}

if (import.meta.main) {
  const server = await createServer();
  console.log(
    `x402 proof server listening on http://${server.hostname}:${server.port}/api/x402/proof`
  );
}
