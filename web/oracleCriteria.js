import { encodePacked, keccak256, stringToHex } from "viem";

export const DEFAULT_ORACLE_PROOF_AUTH_TTL = 60 * 5;
export const ORACLE_PROOF_WALLET_AUTH_KIND = "agentic-poap.oracle-proof.auth.v1";

export const DEFAULT_WALLET_AGE_8183_SCHEMA = "agentic-poap.wallet-age-activity.v1";
export const DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA = "agentic-poap.protocol-activity.v1";
export const DEFAULT_PORTFOLIO_STATE_8183_SCHEMA = "agentic-poap.portfolio-state.v1";
export const DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA =
  "agentic-poap.internal-service-activity.v1";

export const WALLET_AGE_ACTIVITY_CRITERIA_KIND =
  "agentic-poap.wallet-age-activity.criteria.v1";
export const PROTOCOL_ACTIVITY_CRITERIA_KIND =
  "agentic-poap.protocol-activity.criteria.v1";
export const PORTFOLIO_STATE_CRITERIA_KIND =
  "agentic-poap.portfolio-state.criteria.v1";
export const INTERNAL_SERVICE_ACTIVITY_CRITERIA_KIND =
  "agentic-poap.internal-service-activity.criteria.v1";

const COLLECTION_MATCH_OPTIONS = new Set(["ANY", "ALL"]);
const INTERNAL_MATCH_MODE_OPTIONS = new Set(["ANY", "ALL"]);
const INTERNAL_ACTIVITY_RAIL_OPTIONS = new Set(["MPP", "X402", "APP", "EVM"]);
const INTERNAL_SUBJECT_TYPE_OPTIONS = new Set(["ANY", "AGENT", "HUMAN"]);

const ORACLE_ADAPTER_METADATA = Object.freeze({
  WALLET_AGE_ACTIVITY: {
    criteriaKind: WALLET_AGE_ACTIVITY_CRITERIA_KIND,
    schemaId: DEFAULT_WALLET_AGE_8183_SCHEMA,
    title: "Wallet Age Activity Proof"
  },
  PROTOCOL_ACTIVITY: {
    criteriaKind: PROTOCOL_ACTIVITY_CRITERIA_KIND,
    schemaId: DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA,
    title: "Protocol Activity Proof"
  },
  PORTFOLIO_STATE: {
    criteriaKind: PORTFOLIO_STATE_CRITERIA_KIND,
    schemaId: DEFAULT_PORTFOLIO_STATE_8183_SCHEMA,
    title: "Portfolio State Proof"
  },
  INTERNAL_SERVICE_ACTIVITY: {
    criteriaKind: INTERNAL_SERVICE_ACTIVITY_CRITERIA_KIND,
    schemaId: DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA,
    title: "Internal Service Activity Proof"
  }
});

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function normalizePositiveIntegerString(value, fallback = "0") {
  const numeric = Number.parseInt(String(value ?? fallback).trim(), 10);
  return Number.isFinite(numeric) && numeric >= 0 ? String(numeric) : fallback;
}

function normalizePositiveNumberString(value, fallback = "0") {
  const numeric = Number(String(value ?? fallback).trim());
  return Number.isFinite(numeric) && numeric >= 0 ? String(numeric) : fallback;
}

function normalizeUnixTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function normalizeHash(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed : "";
}

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStringList(value, normalizer = normalizeSlug) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

  return [...new Set(rawValues.map(normalizer).filter(Boolean))];
}

function normalizeUpperList(value, options) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

  return [
    ...new Set(
      rawValues
        .map((entry) => String(entry).trim().toUpperCase())
        .filter((entry) => options.has(entry))
    )
  ];
}

function normalizeCollectionMatch(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return COLLECTION_MATCH_OPTIONS.has(normalized) ? normalized : "ANY";
}

function normalizeInternalMatchMode(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return INTERNAL_MATCH_MODE_OPTIONS.has(normalized) ? normalized : "ALL";
}

function normalizeInternalSubjectType(value, fallback = "ANY") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return INTERNAL_SUBJECT_TYPE_OPTIONS.has(normalized) ? normalized : fallback;
}

function normalizeOracleProofAuthKind(value) {
  return String(value ?? "").trim() === ORACLE_PROOF_WALLET_AUTH_KIND
    ? ORACLE_PROOF_WALLET_AUTH_KIND
    : ORACLE_PROOF_WALLET_AUTH_KIND;
}

function normalizeChainMetrics(raw = {}, chainId = "") {
  const normalizedChain = normalizeSlug(raw.chainId ?? chainId);
  return {
    chainId: normalizedChain,
    firstActivityAt: normalizeUnixTimestamp(raw.firstActivityAt),
    txCount: Number(raw.txCount ?? 0) || 0,
    gasSpentUsd: Number(raw.gasSpentUsd ?? 0) || 0
  };
}

function normalizeWalletAgeSnapshot(raw = {}) {
  const chainEntries = Array.isArray(raw.chains)
    ? raw.chains
    : raw.chains && typeof raw.chains === "object"
      ? Object.entries(raw.chains).map(([chainId, value]) => ({
          ...(value && typeof value === "object" ? value : {}),
          chainId
        }))
      : [];
  const chains = chainEntries
    .map((entry) => normalizeChainMetrics(entry, entry.chainId))
    .filter((entry) => entry.chainId);
  const firstActivityAt =
    normalizeUnixTimestamp(raw.firstActivityAt) ||
    chains
      .map((entry) => entry.firstActivityAt)
      .filter(Boolean)
      .sort((first, second) => first - second)[0] ||
    0;
  const txCount =
    Number(raw.txCount ?? 0) ||
    chains.reduce((sum, entry) => sum + (Number(entry.txCount) || 0), 0);
  const gasSpentUsd =
    Number(raw.gasSpentUsd ?? 0) ||
    chains.reduce((sum, entry) => sum + (Number(entry.gasSpentUsd) || 0), 0);

  return {
    walletAddress: normalizeAddress(raw.walletAddress ?? raw.wallet ?? raw.agent),
    firstActivityAt,
    txCount,
    gasSpentUsd,
    chains
  };
}

function normalizeProtocolInteraction(raw = {}) {
  const interactionCount = Number(raw.interactionCount ?? raw.interactions ?? raw.count ?? 1);
  return {
    protocolId: normalizeSlug(raw.protocolId ?? raw.protocol ?? raw.name),
    chainId: normalizeSlug(raw.chainId ?? raw.chain),
    timestamp: normalizeUnixTimestamp(raw.timestamp ?? raw.createdAt ?? raw.firstSeenAt),
    txHash: normalizeHash(raw.txHash),
    interactionCount: Number.isFinite(interactionCount) && interactionCount > 0 ? interactionCount : 1
  };
}

function normalizeProtocolActivitySnapshot(raw = {}) {
  const interactionInputs = Array.isArray(raw.interactions)
    ? raw.interactions
    : Array.isArray(raw.protocols)
      ? raw.protocols
      : [];
  const interactions = interactionInputs
    .map((entry) => normalizeProtocolInteraction(entry))
    .filter((entry) => entry.protocolId);
  return {
    walletAddress: normalizeAddress(raw.walletAddress ?? raw.wallet ?? raw.agent),
    interactions
  };
}

function normalizeCollectionPosition(raw = {}) {
  const balance = Number(raw.balance ?? raw.quantity ?? 0);
  const valueUsd = Number(raw.valueUsd ?? raw.usdValue ?? 0);
  return {
    collectionId: normalizeSlug(raw.collectionId ?? raw.collection ?? raw.slug ?? raw.name),
    balance: Number.isFinite(balance) && balance > 0 ? balance : 0,
    valueUsd: Number.isFinite(valueUsd) && valueUsd > 0 ? valueUsd : 0
  };
}

function normalizeDefiPosition(raw = {}) {
  const valueUsd = Number(raw.valueUsd ?? raw.usdValue ?? raw.balanceUsd ?? 0);
  return {
    protocolId: normalizeSlug(raw.protocolId ?? raw.protocol ?? raw.name),
    chainId: normalizeSlug(raw.chainId ?? raw.chain),
    valueUsd: Number.isFinite(valueUsd) && valueUsd > 0 ? valueUsd : 0
  };
}

function normalizePortfolioStateSnapshot(raw = {}) {
  const collections = Array.isArray(raw.collections)
    ? raw.collections
        .map((entry) => normalizeCollectionPosition(entry))
        .filter((entry) => entry.collectionId)
    : [];
  const positions = Array.isArray(raw.positions)
    ? raw.positions
        .map((entry) => normalizeDefiPosition(entry))
        .filter((entry) => entry.protocolId || entry.valueUsd > 0)
    : [];
  const tokenUsd = Number(raw.tokenUsd ?? raw.tokensUsd ?? 0);
  const nftUsd =
    Number(raw.nftUsd ?? raw.nftsUsd ?? 0) ||
    collections.reduce((sum, entry) => sum + entry.valueUsd, 0);
  const defiUsd =
    Number(raw.defiUsd ?? raw.deFiUsd ?? 0) ||
    positions.reduce((sum, entry) => sum + entry.valueUsd, 0);
  return {
    walletAddress: normalizeAddress(raw.walletAddress ?? raw.wallet ?? raw.agent),
    tokenUsd: Number.isFinite(tokenUsd) && tokenUsd > 0 ? tokenUsd : 0,
    nftUsd: Number.isFinite(nftUsd) && nftUsd > 0 ? nftUsd : 0,
    defiUsd: Number.isFinite(defiUsd) && defiUsd > 0 ? defiUsd : 0,
    totalUsd:
      Number(raw.totalUsd ?? raw.portfolioUsd ?? 0) ||
      (Number.isFinite(tokenUsd) && tokenUsd > 0 ? tokenUsd : 0) +
        (Number.isFinite(nftUsd) && nftUsd > 0 ? nftUsd : 0) +
        (Number.isFinite(defiUsd) && defiUsd > 0 ? defiUsd : 0),
    collections,
    positions
  };
}

function normalizeServiceActivityRecord(raw = {}) {
  const activityCount = Number(raw.activityCount ?? raw.count ?? raw.events ?? 1);
  const paidRequests = Number(raw.paidRequests ?? raw.requests ?? 0);
  const spendUsd = Number(raw.spendUsd ?? raw.amountUsd ?? raw.amount ?? raw.usdc ?? 0);
  const subjectId = String(raw.subjectId ?? raw.agentId ?? raw.agentSlug ?? "").trim();
  const subjectType = normalizeInternalSubjectType(
    raw.subjectType ?? raw.actorType ?? raw.entityType ?? raw.subject,
    "ANY"
  );
  return {
    serviceId: normalizeSlug(raw.serviceId ?? raw.service ?? raw.origin ?? raw.name),
    rail: normalizeUpperList([raw.rail ?? raw.mode ?? raw.kind ?? raw.source], INTERNAL_ACTIVITY_RAIL_OPTIONS)[0] || "",
    activityCount: Number.isFinite(activityCount) && activityCount > 0 ? activityCount : 1,
    paidRequests: Number.isFinite(paidRequests) && paidRequests > 0 ? paidRequests : 0,
    spendUsd: Number.isFinite(spendUsd) && spendUsd > 0 ? spendUsd : 0,
    timestamp: normalizeUnixTimestamp(raw.timestamp ?? raw.createdAt ?? raw.lastSeenAt),
    subjectType: subjectType === "ANY" && subjectId ? "AGENT" : subjectType,
    subjectId
  };
}

function normalizeInternalServiceChainSummary(raw = {}, chainId = "") {
  const txCount = Number(raw.txCount ?? raw.transactions ?? raw.activityCount ?? 0) || 0;
  const subjectId = String(raw.subjectId ?? raw.agentId ?? raw.agentSlug ?? "").trim();
  const subjectType = normalizeInternalSubjectType(
    raw.subjectType ?? raw.actorType ?? raw.entityType ?? raw.subject,
    "ANY"
  );
  const agentTxCount =
    Number(raw.agentTxCount ?? raw.qualifyingTxCount ?? raw.verifiedAgentTxCount ?? 0) ||
    (subjectType === "AGENT" ? txCount : 0);
  return {
    chainId: normalizeSlug(raw.chainId ?? chainId),
    txCount,
    agentTxCount: agentTxCount > 0 ? agentTxCount : 0,
    subjectType: subjectType === "ANY" && (subjectId || agentTxCount > 0) ? "AGENT" : subjectType,
    subjectId,
    lastSeenAt: normalizeUnixTimestamp(raw.lastSeenAt ?? raw.timestamp)
  };
}

function normalizeInternalServiceActivitySnapshot(raw = {}) {
  const activities = Array.isArray(raw.activities)
    ? raw.activities
        .map((entry) => normalizeServiceActivityRecord(entry))
        .filter((entry) => entry.serviceId || entry.rail)
    : [];
  const chainEntries = Array.isArray(raw.evmChains)
    ? raw.evmChains
    : Array.isArray(raw.evmActivity?.chains)
      ? raw.evmActivity.chains
    : raw.evmActivity?.chains && typeof raw.evmActivity.chains === "object"
      ? Object.entries(raw.evmActivity.chains).map(([chainId, value]) => ({
          ...(value && typeof value === "object" ? value : {}),
          chainId
        }))
      : [];
  const evmChains = chainEntries
    .map((entry) => normalizeInternalServiceChainSummary(entry, entry.chainId))
    .filter((entry) => entry.chainId);
  return {
    walletAddress: normalizeAddress(raw.walletAddress ?? raw.wallet ?? raw.agent),
    activities,
    evmChains
  };
}

export function isReusableOracleAdapter(adapterType = "") {
  return Boolean(ORACLE_ADAPTER_METADATA[adapterType]);
}

export function getReusableOracleSchema(adapterType = "") {
  return ORACLE_ADAPTER_METADATA[adapterType]?.schemaId || "";
}

export function getReusableOracleTitle(adapterType = "") {
  return ORACLE_ADAPTER_METADATA[adapterType]?.title || "Oracle Proof";
}

export function normalizeWalletAgeCriteria(raw = {}) {
  return {
    kind: WALLET_AGE_ACTIVITY_CRITERIA_KIND,
    minWalletAgeDays: normalizePositiveIntegerString(raw.minWalletAgeDays, "0"),
    minTransactionCount: normalizePositiveIntegerString(raw.minTransactionCount, "0"),
    minGasUsd: normalizePositiveNumberString(raw.minGasUsd, "0"),
    chains: normalizeStringList(raw.chains ?? raw.evmChains),
    note: String(raw.note ?? raw.unlockNote ?? "").trim()
  };
}

export function normalizeProtocolActivityCriteria(raw = {}) {
  return {
    kind: PROTOCOL_ACTIVITY_CRITERIA_KIND,
    protocolIds: normalizeStringList(raw.protocolIds ?? raw.protocols),
    chains: normalizeStringList(raw.chains),
    minInteractionCount: normalizePositiveIntegerString(raw.minInteractionCount, "1"),
    minDistinctProtocols: normalizePositiveIntegerString(raw.minDistinctProtocols, "0"),
    minDistinctChains: normalizePositiveIntegerString(raw.minDistinctChains, "0"),
    windowDays: normalizePositiveIntegerString(raw.windowDays, "0"),
    note: String(raw.note ?? raw.unlockNote ?? "").trim()
  };
}

export function normalizePortfolioStateCriteria(raw = {}) {
  return {
    kind: PORTFOLIO_STATE_CRITERIA_KIND,
    requiredCollections: normalizeStringList(raw.requiredCollections ?? raw.collections),
    collectionMatch: normalizeCollectionMatch(raw.collectionMatch),
    minCollectionBalance: normalizePositiveNumberString(raw.minCollectionBalance, "1"),
    minDefiUsd: normalizePositiveNumberString(raw.minDefiUsd, "0"),
    minTokenUsd: normalizePositiveNumberString(raw.minTokenUsd, "0"),
    minNftUsd: normalizePositiveNumberString(raw.minNftUsd, "0"),
    minTotalUsd: normalizePositiveNumberString(raw.minTotalUsd, "0"),
    note: String(raw.note ?? raw.unlockNote ?? "").trim()
  };
}

function normalizeInternalServiceRule(raw = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    label: String(raw.label ?? raw.name ?? "").trim(),
    services: normalizeStringList(raw.services),
    rails: normalizeUpperList(raw.rails, INTERNAL_ACTIVITY_RAIL_OPTIONS),
    matchMode: normalizeInternalMatchMode(raw.matchMode),
    minActivityCount: normalizePositiveIntegerString(raw.minActivityCount, "0"),
    minPaidRequests: normalizePositiveIntegerString(raw.minPaidRequests, "0"),
    minSpendUsd: normalizePositiveNumberString(raw.minSpendUsd, "0"),
    minDistinctServices: normalizePositiveIntegerString(raw.minDistinctServices, "0"),
    evmChains: normalizeStringList(raw.evmChains),
    minEvmTransactionCount: normalizePositiveIntegerString(raw.minEvmTransactionCount, "0"),
    requiredSubjectType: normalizeInternalSubjectType(
      raw.requiredSubjectType ?? raw.subjectType ?? raw.requireSubjectType,
      "ANY"
    )
  };
}

export function normalizeInternalServiceActivityCriteria(raw = {}) {
  const activityRequirements = Array.isArray(raw.activityRequirements)
    ? raw.activityRequirements.map((entry) => normalizeInternalServiceRule(entry)).filter(Boolean)
    : [];
  return {
    kind: INTERNAL_SERVICE_ACTIVITY_CRITERIA_KIND,
    services: normalizeStringList(raw.services),
    rails: normalizeUpperList(raw.rails, INTERNAL_ACTIVITY_RAIL_OPTIONS),
    matchMode: normalizeInternalMatchMode(raw.matchMode),
    requirementMatchMode: normalizeInternalMatchMode(
      raw.requirementMatchMode ?? raw.ruleMatchMode ?? raw.activityRequirementMatchMode
    ),
    windowDays: normalizePositiveIntegerString(raw.windowDays, "0"),
    minActivityCount: normalizePositiveIntegerString(raw.minActivityCount, "0"),
    minPaidRequests: normalizePositiveIntegerString(raw.minPaidRequests, "0"),
    minSpendUsd: normalizePositiveNumberString(raw.minSpendUsd, "0"),
    minDistinctServices: normalizePositiveIntegerString(raw.minDistinctServices, "0"),
    evmChains: normalizeStringList(raw.evmChains),
    minEvmTransactionCount: normalizePositiveIntegerString(raw.minEvmTransactionCount, "0"),
    requiredSubjectType: normalizeInternalSubjectType(
      raw.requiredSubjectType ?? raw.subjectType ?? raw.requireSubjectType,
      "ANY"
    ),
    activityRequirements,
    note: String(raw.note ?? raw.unlockNote ?? "").trim()
  };
}

export function normalizeReusableOracleCriteria(adapterType = "", raw = {}) {
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY":
      return normalizeWalletAgeCriteria(raw);
    case "PROTOCOL_ACTIVITY":
      return normalizeProtocolActivityCriteria(raw);
    case "PORTFOLIO_STATE":
      return normalizePortfolioStateCriteria(raw);
    case "INTERNAL_SERVICE_ACTIVITY":
      return normalizeInternalServiceActivityCriteria(raw);
    default:
      throw new Error(`Unsupported oracle criteria adapter: ${adapterType || "unset"}.`);
  }
}

export function resolveReusableOracleAdapterTypeFromCriteria(value) {
  const kind = String(value?.kind ?? "").trim();
  return (
    Object.entries(ORACLE_ADAPTER_METADATA).find(
      ([, metadata]) => metadata.criteriaKind === kind
    )?.[0] || ""
  );
}

export function buildReusableOracleCriteriaJson(adapterType = "", raw = {}) {
  return JSON.stringify(normalizeReusableOracleCriteria(adapterType, raw));
}

export function buildReusableOracleCriteriaHash(adapterType = "", raw = {}) {
  return keccak256(stringToHex(buildReusableOracleCriteriaJson(adapterType, raw)));
}

export function buildWalletAgeContextLabel(raw = {}) {
  const criteria = normalizeWalletAgeCriteria(raw);
  const chainLabel = criteria.chains.length ? criteria.chains.join("+") : "all-chains";
  return `wallet-age:${criteria.minWalletAgeDays}d:${criteria.minTransactionCount}tx:${criteria.minGasUsd}usd:${chainLabel}`;
}

export function buildProtocolActivityContextLabel(raw = {}) {
  const criteria = normalizeProtocolActivityCriteria(raw);
  const protocolLabel = criteria.protocolIds.length ? criteria.protocolIds.join("+") : "any-protocol";
  const chainLabel = criteria.chains.length ? criteria.chains.join("+") : "any-chain";
  return `protocol:${protocolLabel}:${criteria.minInteractionCount}i:${criteria.minDistinctProtocols}p:${criteria.minDistinctChains}c:${chainLabel}`;
}

export function buildPortfolioStateContextLabel(raw = {}) {
  const criteria = normalizePortfolioStateCriteria(raw);
  const collectionLabel = criteria.requiredCollections.length
    ? criteria.requiredCollections.join("+")
    : "any-collection";
  return `portfolio:${collectionLabel}:${criteria.collectionMatch.toLowerCase()}:${criteria.minDefiUsd}defi:${criteria.minTotalUsd}total`;
}

export function buildInternalServiceActivityContextLabel(raw = {}) {
  const criteria = normalizeInternalServiceActivityCriteria(raw);
  const serviceLabel = criteria.services.length ? criteria.services.join("+") : "any-service";
  const railLabel = criteria.rails.length ? criteria.rails.join("+").toLowerCase() : "any-rail";
  const evmLabel = criteria.evmChains.length ? criteria.evmChains.join("+") : "no-evm";
  const requirementLabel = criteria.activityRequirements.length
    ? `rules-${criteria.activityRequirements.length}-${criteria.requirementMatchMode.toLowerCase()}`
    : "rules-0";
  return `internal:${serviceLabel}:${railLabel}:${criteria.requiredSubjectType.toLowerCase()}:${criteria.matchMode.toLowerCase()}:${criteria.minActivityCount}a:${criteria.minPaidRequests}p:${criteria.minEvmTransactionCount}evm:${evmLabel}:${requirementLabel}`;
}

export function buildReusableOracleContextLabel(adapterType = "", raw = {}) {
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY":
      return buildWalletAgeContextLabel(raw);
    case "PROTOCOL_ACTIVITY":
      return buildProtocolActivityContextLabel(raw);
    case "PORTFOLIO_STATE":
      return buildPortfolioStateContextLabel(raw);
    case "INTERNAL_SERVICE_ACTIVITY":
      return buildInternalServiceActivityContextLabel(raw);
    default:
      return "oracle-proof";
  }
}

export function describeWalletAgeCriteria(raw = {}) {
  const criteria = normalizeWalletAgeCriteria(raw);
  return {
    title: "Wallet Age Activity Proof",
    summary:
      "An oracle verifies long-running wallet activity and returns an 8183 proof only when the connected wallet claims the badge.",
    detailLines: [
      `Minimum wallet age: ${Number(criteria.minWalletAgeDays) > 0 ? `${criteria.minWalletAgeDays} day${criteria.minWalletAgeDays === "1" ? "" : "s"}` : "none"}`,
      `Minimum transactions: ${criteria.minTransactionCount}`,
      `Minimum gas spend: $${criteria.minGasUsd}`,
      `Chains: ${criteria.chains.length ? criteria.chains.join(", ") : "all supported chains"}`,
      criteria.note || "No extra wallet-age note is configured."
    ]
  };
}

export function describeProtocolActivityCriteria(raw = {}) {
  const criteria = normalizeProtocolActivityCriteria(raw);
  return {
    title: "Protocol Activity Proof",
    summary:
      "An oracle verifies historical protocol interactions and returns an 8183 proof only when the connected wallet claims the badge.",
    detailLines: [
      `Protocols: ${criteria.protocolIds.length ? criteria.protocolIds.join(", ") : "any indexed protocol"}`,
      `Minimum interactions: ${criteria.minInteractionCount}`,
      `Minimum distinct protocols: ${criteria.minDistinctProtocols}`,
      `Minimum distinct chains: ${criteria.minDistinctChains}`,
      `Chains: ${criteria.chains.length ? criteria.chains.join(", ") : "any indexed chain"}`,
      criteria.note || "No extra protocol-activity note is configured."
    ]
  };
}

export function describePortfolioStateCriteria(raw = {}) {
  const criteria = normalizePortfolioStateCriteria(raw);
  return {
    title: "Portfolio State Proof",
    summary:
      "An oracle verifies wallet portfolio state, NFT collection ownership, and DeFi exposure before issuing an 8183 proof.",
    detailLines: [
      `Collections: ${criteria.requiredCollections.length ? criteria.requiredCollections.join(", ") : "not required"}`,
      `Collection match: ${criteria.collectionMatch}`,
      `Minimum collection balance: ${criteria.minCollectionBalance}`,
      `Minimum DeFi USD: $${criteria.minDefiUsd}`,
      `Minimum total USD: $${criteria.minTotalUsd}`,
      criteria.note || "No extra portfolio-state note is configured."
    ]
  };
}

export function describeInternalServiceActivityCriteria(raw = {}) {
  const criteria = normalizeInternalServiceActivityCriteria(raw);
  const ruleLines = criteria.activityRequirements.map((rule, index) => {
    const railLabel = rule.rails.length ? rule.rails.join(", ") : "any rail";
    const serviceLabel = rule.services.length ? rule.services.join(", ") : "any service";
    return `Rule ${index + 1}${rule.label ? ` (${rule.label})` : ""}: ${rule.requiredSubjectType.toLowerCase()} subject, ${railLabel}, ${serviceLabel}, min ${rule.minActivityCount} activities, ${rule.minPaidRequests} paid requests, ${rule.minEvmTransactionCount} EVM tx`;
  });
  return {
    title: "Internal Service Activity Proof",
    summary:
      "An oracle verifies indexed service activity and can require explicit agent-qualified evidence before issuing an 8183 proof.",
    detailLines: [
      `Services: ${criteria.services.length ? criteria.services.join(", ") : "any indexed service"}`,
      `Rails: ${criteria.rails.length ? criteria.rails.join(", ") : "any"}`,
      `Match mode: ${criteria.matchMode}`,
      `Required subject type: ${criteria.requiredSubjectType}`,
      `Minimum activity count: ${criteria.minActivityCount}`,
      `Minimum paid requests: ${criteria.minPaidRequests}`,
      `Minimum spend USD: $${criteria.minSpendUsd}`,
      `EVM chains: ${criteria.evmChains.length ? criteria.evmChains.join(", ") : "none"}`,
      `Minimum EVM transactions: ${criteria.minEvmTransactionCount}`,
      `Requirement match mode: ${criteria.requirementMatchMode}`,
      ...ruleLines,
      criteria.note || "No extra internal-service note is configured."
    ]
  };
}

export function describeReusableOracleCriteria(adapterType = "", raw = {}) {
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY":
      return describeWalletAgeCriteria(raw);
    case "PROTOCOL_ACTIVITY":
      return describeProtocolActivityCriteria(raw);
    case "PORTFOLIO_STATE":
      return describePortfolioStateCriteria(raw);
    case "INTERNAL_SERVICE_ACTIVITY":
      return describeInternalServiceActivityCriteria(raw);
    default:
      return {
        title: getReusableOracleTitle(adapterType),
        summary: "This badge uses a reusable oracle proof service.",
        detailLines: []
      };
  }
}

export function evaluateWalletAgeActivity(rawCriteria = {}, snapshot = {}, { now = Date.now() } = {}) {
  const criteria = normalizeWalletAgeCriteria(rawCriteria);
  const normalizedSnapshot = normalizeWalletAgeSnapshot(snapshot);
  const selectedChains = criteria.chains.length
    ? normalizedSnapshot.chains.filter((entry) => criteria.chains.includes(entry.chainId))
    : normalizedSnapshot.chains;
  const firstActivityAt =
    (selectedChains.length
      ? selectedChains
          .map((entry) => entry.firstActivityAt)
          .filter(Boolean)
          .sort((first, second) => first - second)[0]
      : 0) || normalizedSnapshot.firstActivityAt;
  const txCount =
    selectedChains.length
      ? selectedChains.reduce((sum, entry) => sum + (Number(entry.txCount) || 0), 0)
      : normalizedSnapshot.txCount;
  const gasSpentUsd =
    selectedChains.length
      ? selectedChains.reduce((sum, entry) => sum + (Number(entry.gasSpentUsd) || 0), 0)
      : normalizedSnapshot.gasSpentUsd;
  const nowSeconds = Math.floor(Number(now) / 1000);
  const walletAgeDays = firstActivityAt ? Math.max(0, Math.floor((nowSeconds - firstActivityAt) / 86400)) : 0;
  const eligible =
    (!criteria.chains.length || selectedChains.length > 0) &&
    (Number(criteria.minWalletAgeDays) <= 0 || walletAgeDays >= Number(criteria.minWalletAgeDays)) &&
    (Number(criteria.minTransactionCount) <= 0 || txCount >= Number(criteria.minTransactionCount)) &&
    (Number(criteria.minGasUsd) <= 0 || gasSpentUsd >= Number(criteria.minGasUsd));

  return {
    criteria,
    walletAddress: normalizedSnapshot.walletAddress,
    eligible,
    firstActivityAt,
    walletAgeDays,
    txCount,
    gasSpentUsd,
    chainsMatched: selectedChains.map((entry) => entry.chainId)
  };
}

export function evaluateProtocolActivity(rawCriteria = {}, snapshot = {}, { now = Date.now() } = {}) {
  const criteria = normalizeProtocolActivityCriteria(rawCriteria);
  const normalizedSnapshot = normalizeProtocolActivitySnapshot(snapshot);
  const nowSeconds = Math.floor(Number(now) / 1000);
  const cutoff =
    Number(criteria.windowDays) > 0 ? nowSeconds - Number(criteria.windowDays) * 86400 : 0;
  const matchedInteractions = normalizedSnapshot.interactions.filter((entry) => {
    if (criteria.protocolIds.length && !criteria.protocolIds.includes(entry.protocolId)) {
      return false;
    }
    if (criteria.chains.length && !criteria.chains.includes(entry.chainId)) {
      return false;
    }
    if (cutoff && entry.timestamp && entry.timestamp < cutoff) {
      return false;
    }
    return true;
  });
  const interactionCount = matchedInteractions.reduce(
    (sum, entry) => sum + (Number(entry.interactionCount) || 0),
    0
  );
  const distinctProtocols = [...new Set(matchedInteractions.map((entry) => entry.protocolId).filter(Boolean))];
  const distinctChains = [...new Set(matchedInteractions.map((entry) => entry.chainId).filter(Boolean))];
  const eligible =
    interactionCount >= Number(criteria.minInteractionCount) &&
    distinctProtocols.length >= Number(criteria.minDistinctProtocols) &&
    distinctChains.length >= Number(criteria.minDistinctChains) &&
    (!criteria.protocolIds.length || matchedInteractions.length > 0);

  return {
    criteria,
    walletAddress: normalizedSnapshot.walletAddress,
    eligible,
    interactionCount,
    distinctProtocols,
    distinctChains,
    matchedInteractions
  };
}

export function evaluatePortfolioState(rawCriteria = {}, snapshot = {}) {
  const criteria = normalizePortfolioStateCriteria(rawCriteria);
  const normalizedSnapshot = normalizePortfolioStateSnapshot(snapshot);
  const matchedCollections = normalizedSnapshot.collections.filter(
    (entry) =>
      criteria.requiredCollections.includes(entry.collectionId) &&
      entry.balance >= Number(criteria.minCollectionBalance)
  );
  const collectionRequirementMet =
    criteria.requiredCollections.length === 0
      ? true
      : criteria.collectionMatch === "ALL"
        ? criteria.requiredCollections.every((collectionId) =>
            matchedCollections.some((entry) => entry.collectionId === collectionId)
          )
        : matchedCollections.length > 0;
  const eligible =
    collectionRequirementMet &&
    normalizedSnapshot.defiUsd >= Number(criteria.minDefiUsd) &&
    normalizedSnapshot.tokenUsd >= Number(criteria.minTokenUsd) &&
    normalizedSnapshot.nftUsd >= Number(criteria.minNftUsd) &&
    normalizedSnapshot.totalUsd >= Number(criteria.minTotalUsd);

  return {
    criteria,
    walletAddress: normalizedSnapshot.walletAddress,
    eligible,
    tokenUsd: normalizedSnapshot.tokenUsd,
    nftUsd: normalizedSnapshot.nftUsd,
    defiUsd: normalizedSnapshot.defiUsd,
    totalUsd: normalizedSnapshot.totalUsd,
    matchedCollections: matchedCollections.map((entry) => entry.collectionId),
    collections: normalizedSnapshot.collections,
    positions: normalizedSnapshot.positions
  };
}

function matchesRequiredSubjectType(entry = {}, requiredSubjectType = "ANY") {
  if (requiredSubjectType === "ANY") {
    return true;
  }
  return normalizeInternalSubjectType(entry.subjectType, "ANY") === requiredSubjectType;
}

function evaluateInternalServiceRequirement(requirement = {}, normalizedSnapshot = {}, cutoff = 0) {
  const matchedActivities = normalizedSnapshot.activities.filter((entry) => {
    if (requirement.services.length && !requirement.services.includes(entry.serviceId)) {
      return false;
    }
    if (requirement.rails.length && entry.rail && !requirement.rails.includes(entry.rail)) {
      return false;
    }
    if (!matchesRequiredSubjectType(entry, requirement.requiredSubjectType)) {
      return false;
    }
    if (cutoff && entry.timestamp && entry.timestamp < cutoff) {
      return false;
    }
    return true;
  });
  const activityCount = matchedActivities.reduce(
    (sum, entry) => sum + (Number(entry.activityCount) || 0),
    0
  );
  const paidRequests = matchedActivities.reduce(
    (sum, entry) => sum + (Number(entry.paidRequests) || 0),
    0
  );
  const spendUsd = matchedActivities.reduce((sum, entry) => sum + (Number(entry.spendUsd) || 0), 0);
  const distinctServices = [...new Set(matchedActivities.map((entry) => entry.serviceId).filter(Boolean))];
  const matchedEvmChains = (requirement.evmChains.length
    ? normalizedSnapshot.evmChains.filter((entry) => requirement.evmChains.includes(entry.chainId))
    : []
  ).filter((entry) => matchesRequiredSubjectType(entry, requirement.requiredSubjectType));
  const evmTransactionCount = matchedEvmChains.reduce((sum, entry) => {
    if (requirement.requiredSubjectType === "AGENT") {
      return sum + (Number(entry.agentTxCount) || 0);
    }
    return sum + (Number(entry.txCount) || 0);
  }, 0);
  const checks = [
    Number(requirement.minActivityCount) > 0
      ? activityCount >= Number(requirement.minActivityCount)
      : null,
    Number(requirement.minPaidRequests) > 0
      ? paidRequests >= Number(requirement.minPaidRequests)
      : null,
    Number(requirement.minSpendUsd) > 0
      ? spendUsd >= Number(requirement.minSpendUsd)
      : null,
    Number(requirement.minDistinctServices) > 0
      ? distinctServices.length >= Number(requirement.minDistinctServices)
      : null,
    Number(requirement.minEvmTransactionCount) > 0
      ? evmTransactionCount >= Number(requirement.minEvmTransactionCount)
      : null
  ].filter((entry) => entry !== null);
  const eligible =
    checks.length === 0
      ? matchedActivities.length > 0 || evmTransactionCount > 0
      : requirement.matchMode === "ANY"
        ? checks.some(Boolean)
        : checks.every(Boolean);

  return {
    label: requirement.label || "",
    requiredSubjectType: requirement.requiredSubjectType,
    eligible,
    activityCount,
    paidRequests,
    spendUsd,
    distinctServices,
    evmTransactionCount,
    matchedActivities,
    matchedEvmChains: matchedEvmChains.map((entry) => entry.chainId),
    agentQualifiedActivityCount:
      requirement.requiredSubjectType === "AGENT" ? activityCount : 0,
    agentQualifiedPaidRequests:
      requirement.requiredSubjectType === "AGENT" ? paidRequests : 0
  };
}

export function evaluateInternalServiceActivity(rawCriteria = {}, snapshot = {}, { now = Date.now() } = {}) {
  const criteria = normalizeInternalServiceActivityCriteria(rawCriteria);
  const normalizedSnapshot = normalizeInternalServiceActivitySnapshot(snapshot);
  const nowSeconds = Math.floor(Number(now) / 1000);
  const cutoff =
    Number(criteria.windowDays) > 0 ? nowSeconds - Number(criteria.windowDays) * 86400 : 0;
  const baseEvaluation = evaluateInternalServiceRequirement(
    {
      label: "",
      services: criteria.services,
      rails: criteria.rails,
      matchMode: criteria.matchMode,
      minActivityCount: criteria.minActivityCount,
      minPaidRequests: criteria.minPaidRequests,
      minSpendUsd: criteria.minSpendUsd,
      minDistinctServices: criteria.minDistinctServices,
      evmChains: criteria.evmChains,
      minEvmTransactionCount: criteria.minEvmTransactionCount,
      requiredSubjectType: criteria.requiredSubjectType
    },
    normalizedSnapshot,
    cutoff
  );
  const requirementResults = criteria.activityRequirements.map((entry) =>
    evaluateInternalServiceRequirement(entry, normalizedSnapshot, cutoff)
  );
  const eligible =
    requirementResults.length > 0
      ? criteria.requirementMatchMode === "ANY"
        ? requirementResults.some((entry) => entry.eligible)
        : requirementResults.every((entry) => entry.eligible)
      : baseEvaluation.eligible;

  return {
    criteria,
    walletAddress: normalizedSnapshot.walletAddress,
    eligible,
    activityCount: baseEvaluation.activityCount,
    paidRequests: baseEvaluation.paidRequests,
    spendUsd: baseEvaluation.spendUsd,
    distinctServices: baseEvaluation.distinctServices,
    evmTransactionCount: baseEvaluation.evmTransactionCount,
    matchedActivities: baseEvaluation.matchedActivities,
    matchedEvmChains: baseEvaluation.matchedEvmChains,
    agentQualifiedActivityCount: baseEvaluation.agentQualifiedActivityCount,
    agentQualifiedPaidRequests: baseEvaluation.agentQualifiedPaidRequests,
    requirementResults
  };
}

export function evaluateReusableOracleCriteria(adapterType = "", criteria = {}, snapshot = {}, options = {}) {
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY":
      return evaluateWalletAgeActivity(criteria, snapshot, options);
    case "PROTOCOL_ACTIVITY":
      return evaluateProtocolActivity(criteria, snapshot, options);
    case "PORTFOLIO_STATE":
      return evaluatePortfolioState(criteria, snapshot, options);
    case "INTERNAL_SERVICE_ACTIVITY":
      return evaluateInternalServiceActivity(criteria, snapshot, options);
    default:
      throw new Error(`Unsupported oracle criteria adapter: ${adapterType || "unset"}.`);
  }
}

export function formatWalletAgeEvaluationSummary(evaluation = {}) {
  return `${evaluation.walletAgeDays || 0} days old, ${evaluation.txCount || 0} tx, $${Number(
    evaluation.gasSpentUsd || 0
  ).toFixed(2)} gas`;
}

export function formatProtocolActivityEvaluationSummary(evaluation = {}) {
  return `${evaluation.interactionCount || 0} interactions across ${evaluation.distinctProtocols?.length || 0} protocol(s)`;
}

export function formatPortfolioStateEvaluationSummary(evaluation = {}) {
  return `$${Number(evaluation.defiUsd || 0).toFixed(2)} DeFi, ${evaluation.matchedCollections?.length || 0} matched collection(s)`;
}

export function formatInternalServiceActivityEvaluationSummary(evaluation = {}) {
  const agentQualifiedLabel =
    evaluation.agentQualifiedActivityCount || evaluation.agentQualifiedPaidRequests
      ? `, ${evaluation.agentQualifiedActivityCount || 0} agent-qualified activities, ${evaluation.agentQualifiedPaidRequests || 0} agent-qualified paid requests`
      : "";
  return `${evaluation.activityCount || 0} activities, ${evaluation.paidRequests || 0} paid requests, ${evaluation.evmTransactionCount || 0} fallback EVM tx${agentQualifiedLabel}`;
}

export function formatReusableOracleEvaluationSummary(adapterType = "", evaluation = {}) {
  switch (adapterType) {
    case "WALLET_AGE_ACTIVITY":
      return formatWalletAgeEvaluationSummary(evaluation);
    case "PROTOCOL_ACTIVITY":
      return formatProtocolActivityEvaluationSummary(evaluation);
    case "PORTFOLIO_STATE":
      return formatPortfolioStateEvaluationSummary(evaluation);
    case "INTERNAL_SERVICE_ACTIVITY":
      return formatInternalServiceActivityEvaluationSummary(evaluation);
    default:
      return "eligible";
  }
}

export function buildOracleProofAuthorizationDigest({
  badgeRegistryAddress,
  chainId,
  definitionId,
  walletAddress,
  criteriaHash,
  authKind = ORACLE_PROOF_WALLET_AUTH_KIND,
  issuedAt,
  expiresAt
}) {
  const normalizedWallet = normalizeAddress(walletAddress);
  if (!normalizedWallet) {
    throw new Error("Oracle proof authorizations require a valid wallet address.");
  }
  return keccak256(
    encodePacked(
      [
        "address",
        "uint256",
        "uint256",
        "address",
        "bytes32",
        "string",
        "uint64",
        "uint64"
      ],
      [
        badgeRegistryAddress,
        BigInt(Number(chainId) || 0),
        BigInt(Number(definitionId) || 0),
        normalizedWallet,
        criteriaHash,
        normalizeOracleProofAuthKind(authKind),
        BigInt(Number(issuedAt) || 0),
        BigInt(Number(expiresAt) || 0)
      ]
    )
  );
}
