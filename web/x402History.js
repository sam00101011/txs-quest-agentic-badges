import { encodePacked, keccak256, stringToHex } from "viem";

export const DEFAULT_X402_8183_SCHEMA = "agentic-poap.x402-history.v1";
export const DEFAULT_PAYMENT_8183_SCHEMA = "agentic-poap.payment-history.v1";
export const X402_HISTORY_CRITERIA_KIND = "agentic-poap.x402-history.criteria.v1";
export const PAYMENT_HISTORY_CRITERIA_KIND = "agentic-poap.payment-history.criteria.v1";
export const X402_WALLET_AUTH_KIND = "agentic-poap.x402-history.auth.v1";
export const PAYMENT_WALLET_AUTH_KIND = "agentic-poap.payment-history.auth.v1";
export const DEFAULT_X402_AUTH_TTL = 60 * 5;
export const DEFAULT_PAYMENT_AUTH_TTL = DEFAULT_X402_AUTH_TTL;

export const PAYMENT_HISTORY_METRIC_OPTIONS = [
  { value: "paid_requests", label: "Paid Requests" },
  { value: "total_amount", label: "Total Spend (USDC)" },
  { value: "distinct_services", label: "Distinct Paid Services" }
];
export const X402_METRIC_OPTIONS = PAYMENT_HISTORY_METRIC_OPTIONS;

export const PAYMENT_HISTORY_RAIL_MODE_OPTIONS = [
  { value: "ANY", label: "MPP or x402" },
  { value: "BOTH", label: "Require MPP + x402" },
  { value: "MPP_ONLY", label: "MPP Only" },
  { value: "X402_ONLY", label: "x402 Only" }
];

export const PAYMENT_HISTORY_IDENTITY_MODE_OPTIONS = [
  { value: "WALLET_ONLY", label: "Wallet Only" },
  { value: "OPTIONAL_8004", label: "Optional 8004 Enrichment" }
];
export const X402_IDENTITY_MODE_OPTIONS = PAYMENT_HISTORY_IDENTITY_MODE_OPTIONS;

export function normalizePaymentMetric(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "paid_requests" ||
    normalized === "total_amount" ||
    normalized === "distinct_services"
  ) {
    return normalized;
  }

  return "paid_requests";
}

export function normalizeX402Metric(value) {
  return normalizePaymentMetric(value);
}

export function normalizePaymentIdentityMode(value) {
  return String(value ?? "").trim().toUpperCase() === "OPTIONAL_8004"
    ? "OPTIONAL_8004"
    : "WALLET_ONLY";
}

export function normalizeX402IdentityMode(value) {
  return normalizePaymentIdentityMode(value);
}

export function normalizePaymentRailMode(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "ANY" ||
    normalized === "BOTH" ||
    normalized === "MPP_ONLY" ||
    normalized === "X402_ONLY"
  ) {
    return normalized;
  }

  return "ANY";
}

export function normalizeX402Origins(value) {
  return normalizePaymentOrigins(value);
}

export function normalizePaymentOrigins(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

  return [...new Set(rawValues.map(normalizeOrigin).filter(Boolean))];
}

export function normalizePaymentCriteria(raw = {}) {
  const metric = normalizePaymentMetric(raw.metric ?? raw.unlockMetric);
  const thresholdValue = Number(raw.threshold ?? raw.unlockThreshold ?? 1);
  const windowDaysValue = Number(raw.windowDays ?? raw.unlockWindowDays ?? 365);

  return {
    kind: PAYMENT_HISTORY_CRITERIA_KIND,
    metric,
    threshold: String(
      Number.isFinite(thresholdValue) && thresholdValue > 0
        ? thresholdValue
        : 1
    ),
    origins: normalizePaymentOrigins(raw.origins ?? raw.unlockOrigins),
    windowDays: String(
      Number.isFinite(windowDaysValue) && windowDaysValue >= 0 ? windowDaysValue : 365
    ),
    identityMode: normalizePaymentIdentityMode(raw.identityMode ?? raw.unlockIdentityMode),
    railMode: normalizePaymentRailMode(raw.railMode ?? raw.unlockRailMode),
    note: String(raw.note ?? raw.unlockNote ?? "").trim()
  };
}

export function normalizeX402Criteria(raw = {}) {
  const criteria = normalizePaymentCriteria({
    ...raw,
    railMode: "X402_ONLY"
  });
  return {
    ...criteria,
    kind: X402_HISTORY_CRITERIA_KIND,
    railMode: "X402_ONLY"
  };
}

export function isPaymentHistoryCriteria(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return String(value.kind ?? "").trim() === PAYMENT_HISTORY_CRITERIA_KIND;
}

export function isX402Criteria(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return String(value.kind ?? "").trim() === X402_HISTORY_CRITERIA_KIND;
}

export function buildPaymentCriteriaJson(raw = {}) {
  const criteria = normalizePaymentCriteria(raw);
  return JSON.stringify({
    kind: criteria.kind,
    metric: criteria.metric,
    threshold: criteria.threshold,
    origins: criteria.origins,
    windowDays: criteria.windowDays,
    identityMode: criteria.identityMode,
    railMode: criteria.railMode,
    note: criteria.note
  });
}

export function buildX402CriteriaJson(raw = {}) {
  const criteria = normalizeX402Criteria(raw);
  return JSON.stringify({
    kind: criteria.kind,
    metric: criteria.metric,
    threshold: criteria.threshold,
    origins: criteria.origins,
    windowDays: criteria.windowDays,
    identityMode: criteria.identityMode,
    railMode: criteria.railMode,
    note: criteria.note
  });
}

export function buildPaymentCriteriaHash(raw = {}) {
  return keccak256(stringToHex(buildPaymentCriteriaJson(raw)));
}

export function buildX402CriteriaHash(raw = {}) {
  return keccak256(stringToHex(buildX402CriteriaJson(raw)));
}

export function describePaymentCriteria(raw = {}) {
  const criteria = normalizePaymentCriteria(raw);
  const threshold = Number(criteria.threshold) || 0;
  const windowDays = Number(criteria.windowDays) || 0;
  const metricLabel =
    criteria.metric === "total_amount"
      ? `Spend ${threshold} USDC`
      : criteria.metric === "distinct_services"
        ? `Use ${threshold} distinct paid service${threshold === 1 ? "" : "s"}`
        : `Complete ${threshold} paid request${threshold === 1 ? "" : "s"}`;

  const detailLines = [
    `Metric: ${metricLabel}`,
    `Window: ${windowDays === 0 ? "all time" : `${windowDays} day${windowDays === 1 ? "" : "s"}`}`,
    `Origins: ${criteria.origins.length ? criteria.origins.join(", ") : "any paid service"}`,
    `Rails: ${describeRailMode(criteria.railMode)}`,
    `Identity: ${criteria.identityMode === "OPTIONAL_8004" ? "wallet + optional 8004 enrichment" : "wallet only"}`
  ];

  return {
    title: "Payment History Proof",
    summary:
      "An on-demand oracle issues an 8183 proof only when the connected agent wallet actively claims and the authorized payment rails already satisfy the configured spend or usage criteria.",
    shortSummary: metricLabel,
    detailLines
  };
}

export function describeX402Criteria(raw = {}) {
  const described = describePaymentCriteria({
    ...raw,
    railMode: "X402_ONLY"
  });
  return {
    ...described,
    title: "x402 History Proof"
  };
}

export function buildPaymentContextLabel(raw = {}) {
  const criteria = normalizePaymentCriteria(raw);
  const threshold = Number(criteria.threshold) || 0;
  const originsLabel = criteria.origins.length ? criteria.origins.join("+") : "all-services";
  return `payment:${criteria.railMode.toLowerCase()}:${criteria.metric}:${threshold}:${originsLabel}:${criteria.windowDays}d`;
}

export function buildX402ContextLabel(raw = {}) {
  return buildPaymentContextLabel({
    ...raw,
    railMode: "X402_ONLY"
  }).replace(/^payment:/, "x402:");
}

export function normalizePaymentHistoryRecord(raw = {}) {
  const payer = normalizeAddress(raw.payer ?? raw.wallet ?? raw.agent);
  const origin = normalizeOrigin(raw.origin ?? raw.service ?? raw.serviceOrigin ?? raw.url);
  const amount = Number(raw.amount ?? raw.usdc ?? raw.value ?? 0);
  const timestamp = Number(raw.timestamp ?? raw.createdAt ?? raw.paidAt ?? 0);

  return {
    payer,
    origin,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
    txHash: normalizeHash(raw.txHash),
    rail: normalizePaymentRail(raw.rail ?? raw.mode ?? raw.kind ?? raw.source),
    description: String(raw.description ?? "").trim()
  };
}

export function normalizeX402HistoryRecord(raw = {}) {
  return {
    ...normalizePaymentHistoryRecord({
      ...raw,
      rail: "X402"
    }),
    rail: "X402"
  };
}

export function evaluatePaymentHistory(
  rawCriteria = {},
  records = [],
  { walletAddress = "", walletAddresses = [], now = Date.now() } = {}
) {
  const criteria = normalizePaymentCriteria(rawCriteria);
  const normalizedWallets = [...new Set(
    [walletAddress, ...(Array.isArray(walletAddresses) ? walletAddresses : [])]
      .map(normalizeAddress)
      .filter(Boolean)
  )];
  const nowSeconds = Math.floor(Number(now) / 1000);
  const windowDays = Number(criteria.windowDays) || 0;
  const cutoff = windowDays > 0 ? nowSeconds - windowDays * 24 * 60 * 60 : 0;
  const requiredOrigins = new Set(criteria.origins);
  const allowedRails = railModeToSet(criteria.railMode);

  const scopedRecords = records
    .map(normalizePaymentHistoryRecord)
    .filter((record) => normalizedWallets.includes(record.payer))
    .filter((record) => !cutoff || record.timestamp >= cutoff)
    .filter((record) => !requiredOrigins.size || requiredOrigins.has(record.origin))
    .filter((record) => allowedRails.has(record.rail));

  const totalAmount = scopedRecords.reduce((sum, record) => sum + record.amount, 0);
  const distinctOrigins = [...new Set(scopedRecords.map((record) => record.origin).filter(Boolean))];
  const matchedRails = [...new Set(scopedRecords.map((record) => record.rail).filter(Boolean))];
  const threshold = Number(criteria.threshold) || 0;

  const metricValue =
    criteria.metric === "total_amount"
      ? totalAmount
      : criteria.metric === "distinct_services"
        ? distinctOrigins.length
        : scopedRecords.length;

  const railRequirementMet =
    criteria.railMode !== "BOTH" ||
    (matchedRails.includes("MPP") && matchedRails.includes("X402"));

  const perRail = {
    X402: summarizeRail(scopedRecords, "X402"),
    MPP: summarizeRail(scopedRecords, "MPP")
  };

  return {
    criteria,
    walletAddress: normalizeAddress(walletAddress),
    walletAddresses: normalizedWallets,
    eligible: metricValue >= threshold && railRequirementMet,
    metricValue,
    totalAmount,
    paidRequests: scopedRecords.length,
    distinctServices: distinctOrigins.length,
    origins: distinctOrigins,
    recordsMatched: scopedRecords.length,
    cutoff,
    latestTimestamp: scopedRecords.reduce(
      (latest, record) => (record.timestamp > latest ? record.timestamp : latest),
      0
    ),
    txHashes: scopedRecords.map((record) => record.txHash).filter(Boolean),
    matchedRails,
    railRequirementMet,
    perRail,
    records: scopedRecords
  };
}

export function evaluateX402History(rawCriteria = {}, records = [], { walletAddress = "", now = Date.now() } = {}) {
  const evaluation = evaluatePaymentHistory(
    {
      ...rawCriteria,
      railMode: "X402_ONLY"
    },
    records,
    {
      walletAddress,
      walletAddresses: [walletAddress],
      now
    }
  );
  return {
    ...evaluation,
    criteria: {
      ...evaluation.criteria,
      kind: X402_HISTORY_CRITERIA_KIND,
      railMode: "X402_ONLY"
    }
  };
}

export function formatPaymentEvaluationSummary(evaluation) {
  const spend = Number(evaluation?.totalAmount ?? 0).toFixed(2);
  const rails = Array.isArray(evaluation?.matchedRails) && evaluation.matchedRails.length
    ? evaluation.matchedRails.join(" + ")
    : describeRailMode(evaluation?.criteria?.railMode);
  return [
    `${Number(evaluation?.paidRequests ?? 0)} paid request${Number(evaluation?.paidRequests ?? 0) === 1 ? "" : "s"}`,
    `${Number(evaluation?.distinctServices ?? 0)} service${Number(evaluation?.distinctServices ?? 0) === 1 ? "" : "s"}`,
    `${spend} USDC`,
    rails
  ].join(" · ");
}

export function formatX402EvaluationSummary(evaluation) {
  return [
    `${Number(evaluation?.paidRequests ?? 0)} paid request${Number(evaluation?.paidRequests ?? 0) === 1 ? "" : "s"}`,
    `${Number(evaluation?.distinctServices ?? 0)} service${Number(evaluation?.distinctServices ?? 0) === 1 ? "" : "s"}`,
    `${Number(evaluation?.totalAmount ?? 0).toFixed(2)} USDC`
  ].join(" · ");
}

export function buildPaymentWalletAuthorizationDigest({
  badgeRegistryAddress,
  chainId,
  definitionId,
  walletAddress,
  criteriaHash,
  issuedAt,
  expiresAt
}) {
  return keccak256(
    encodePacked(
      [
        "string",
        "address",
        "uint256",
        "uint256",
        "address",
        "bytes32",
        "uint64",
        "uint64"
      ],
      [
        PAYMENT_WALLET_AUTH_KIND,
        badgeRegistryAddress,
        BigInt(Number(chainId) || 0),
        BigInt(Number(definitionId) || 0),
        normalizeAddress(walletAddress),
        normalizeBytes32(criteriaHash),
        BigInt(Number(issuedAt) || 0),
        BigInt(Number(expiresAt) || 0)
      ]
    )
  );
}

export function buildX402WalletAuthorizationDigest({
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  criteriaHash,
  issuedAt,
  expiresAt
}) {
  return buildPaymentWalletAuthorizationDigest({
    badgeRegistryAddress,
    chainId,
    definitionId,
    walletAddress: agent,
    criteriaHash,
    issuedAt,
    expiresAt
  });
}

export function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

export function normalizeBytes32(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed : "";
}

function normalizeHash(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed : "";
}

function normalizeOrigin(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.host.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*/, "").toLowerCase();
  }
}

function normalizePaymentRail(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "MPP") {
    return "MPP";
  }
  if (normalized === "X402") {
    return "X402";
  }
  if (normalized === "X-402" || normalized === "PAYMENT_PROTOCOL_X402") {
    return "X402";
  }
  return "X402";
}

function describeRailMode(value) {
  const normalized = normalizePaymentRailMode(value);
  if (normalized === "BOTH") {
    return "both MPP and x402";
  }
  if (normalized === "MPP_ONLY") {
    return "MPP only";
  }
  if (normalized === "X402_ONLY") {
    return "x402 only";
  }
  return "MPP or x402";
}

function railModeToSet(value) {
  const normalized = normalizePaymentRailMode(value);
  if (normalized === "BOTH" || normalized === "ANY") {
    return new Set(["MPP", "X402"]);
  }
  if (normalized === "MPP_ONLY") {
    return new Set(["MPP"]);
  }
  return new Set(["X402"]);
}

function summarizeRail(records, rail) {
  const matching = records.filter((record) => record.rail === rail);
  return {
    paidRequests: matching.length,
    totalAmount: matching.reduce((sum, record) => sum + record.amount, 0),
    distinctServices: [...new Set(matching.map((record) => record.origin).filter(Boolean))].length
  };
}
