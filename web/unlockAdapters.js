import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  parseSignature,
  recoverMessageAddress,
  stringToHex,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEFAULT_AGENT_8183_SCHEMA,
  DEFAULT_FARCASTER_8183_SCHEMA,
  DEFAULT_ORACLE_8183_SCHEMA,
  DEFAULT_PAYMENT_8183_SCHEMA,
  DEFAULT_X402_8183_SCHEMA,
  isAgent8183PolicyEnabled,
  isOracle8183PolicyEnabled
} from "./badgePolicies.js";
import {
  buildFarcasterContextLabel,
  buildFarcasterCriteriaHash,
  buildFarcasterCriteriaJson,
  describeFarcasterCriteria,
  isFarcasterCriteria,
  normalizeFarcasterCriteria
} from "./farcasterCriteria.js";
import { requestFarcasterProof } from "./farcasterProofClient.js";
import {
  PAYMENT_HISTORY_IDENTITY_MODE_OPTIONS,
  PAYMENT_HISTORY_METRIC_OPTIONS,
  PAYMENT_HISTORY_RAIL_MODE_OPTIONS,
  buildPaymentContextLabel,
  buildPaymentCriteriaHash,
  buildPaymentCriteriaJson,
  describePaymentCriteria,
  isPaymentHistoryCriteria,
  normalizePaymentCriteria,
  X402_IDENTITY_MODE_OPTIONS,
  X402_METRIC_OPTIONS,
  buildX402ContextLabel,
  buildX402CriteriaHash,
  buildX402CriteriaJson,
  describeX402Criteria,
  isX402Criteria,
  normalizeX402Criteria
} from "./x402History.js";
import { requestPaymentHistoryProof } from "./x402ProofClient.js";
import {
  buildReusableOracleContextLabel,
  buildReusableOracleCriteriaHash,
  buildReusableOracleCriteriaJson,
  describeReusableOracleCriteria,
  getReusableOracleSchema,
  isReusableOracleAdapter,
  normalizeReusableOracleCriteria,
  resolveReusableOracleAdapterTypeFromCriteria
} from "./oracleCriteria.js";
import { requestOracleCriteriaProof } from "./oracleProofClient.js";

export const LOCAL_DEV_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const LOCAL_DEV_ACCOUNT = privateKeyToAccount(LOCAL_DEV_PRIVATE_KEY);
export const LEGACY_ORACLE_EVENT_PROOF_KIND = "oracle_event_attendance_v1";
export const ORACLE_EVENT_PROOF_KIND = "oracle_event_attendance_v2";
export const ORACLE_8183_PROOF_KIND = "oracle_event_attendance_8183_v1";
export const AGENT_8183_PROOF_KIND = "agent_attestation_8183_v1";
export const DEFAULT_ORACLE_EVENT_PROOF_TTL = 60 * 60 * 24 * 7;

const SINGLE_ADDRESS_FUNCTION_ABI = [
  {
    type: "function",
    name: "getAgentBadgeCount",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "count", type: "uint256" }]
  }
];

const TOKEN_BALANCE_FUNCTION_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  }
];

const BADGE_COUNT_CALL_PREFIX = encodeFunctionData({
  abi: SINGLE_ADDRESS_FUNCTION_ABI,
  functionName: "getAgentBadgeCount",
  args: [zeroAddress]
}).slice(0, 34);

const TOKEN_BALANCE_CALL_PREFIX = encodeFunctionData({
  abi: TOKEN_BALANCE_FUNCTION_ABI,
  functionName: "balanceOf",
  args: [zeroAddress]
}).slice(0, 34);

export const UNLOCK_ADAPTER_OPTIONS = [
  { value: "MANUAL_ATTESTOR", label: "Manual Attestor Approval" },
  { value: "BADGE_COUNT", label: "Badge Count Check" },
  { value: "TOKEN_BALANCE", label: "Token Balance Check" },
  { value: "ORACLE_EVENT", label: "Oracle Attendance Attestation" },
  { value: "FARCASTER_ACCOUNT", label: "Farcaster Account" },
  { value: "WALLET_AGE_ACTIVITY", label: "Wallet Age Activity" },
  { value: "PROTOCOL_ACTIVITY", label: "Protocol Activity" },
  { value: "PORTFOLIO_STATE", label: "Portfolio State" },
  { value: "INTERNAL_SERVICE_ACTIVITY", label: "Internal Service Activity" },
  { value: "AGENT_REP", label: "Agent Reputation Attestation" },
  { value: "PAYMENT_HISTORY", label: "Payment History (MPP + x402)" },
  { value: "X402_HISTORY", label: "x402 Payment History" }
];
export {
  PAYMENT_HISTORY_IDENTITY_MODE_OPTIONS,
  PAYMENT_HISTORY_METRIC_OPTIONS,
  PAYMENT_HISTORY_RAIL_MODE_OPTIONS,
  X402_IDENTITY_MODE_OPTIONS,
  X402_METRIC_OPTIONS
};

export function unlockAdapterDefaults(
  adapterType = "MANUAL_ATTESTOR",
  { targetAddress = "", signerAddress = LOCAL_DEV_ACCOUNT.address } = {}
) {
  switch (adapterType) {
    case "BADGE_COUNT":
      return {
        unlockAdapterType: "BADGE_COUNT",
        unlockTargetAddress: targetAddress,
        unlockThreshold: "1",
        unlockSignerAddress: "",
        unlockNote: "Agents can self-claim after they already hold a minimum badge count."
      };
    case "TOKEN_BALANCE":
      return {
        unlockAdapterType: "TOKEN_BALANCE",
        unlockTargetAddress: targetAddress,
        unlockThreshold: "100",
        unlockSignerAddress: "",
        unlockNote: "Agents can self-claim once the connected wallet holds the required token balance."
      };
    case "ORACLE_EVENT":
      return {
        unlockAdapterType: "ORACLE_EVENT",
        unlockTargetAddress: "",
        unlockThreshold: "0",
        unlockSignerAddress: signerAddress,
        unlockNote: "A trusted signer attests event attendance for each claim."
      };
    case "FARCASTER_ACCOUNT":
      return {
        unlockAdapterType: "FARCASTER_ACCOUNT",
        unlockTargetAddress: "",
        unlockThreshold: "0",
        unlockSignerAddress: signerAddress,
        unlockNote:
          "Agents open txs.quest inside Farcaster, connect with Quick Auth, and request an 8183 proof only when they actively claim. Set a minimum FID if this badge is meant for later-wave Farcaster accounts."
      };
    case "WALLET_AGE_ACTIVITY":
      return {
        unlockAdapterType: "WALLET_AGE_ACTIVITY",
        unlockTargetAddress: "",
        unlockThreshold: "0",
        unlockSignerAddress: signerAddress,
        oracleCriteriaJson: buildReusableOracleCriteriaJson("WALLET_AGE_ACTIVITY", {
          minWalletAgeDays: "1460",
          minTransactionCount: "0",
          minGasUsd: "0",
          chains: ["ethereum"],
          note: "Issue a proof only when the wallet has the required wallet age or transaction history."
        }),
        unlockNote:
          "An oracle verifies long-running wallet activity and only returns an 8183 proof when the connected wallet actively claims."
      };
    case "PROTOCOL_ACTIVITY":
      return {
        unlockAdapterType: "PROTOCOL_ACTIVITY",
        unlockTargetAddress: "",
        unlockThreshold: "1",
        unlockSignerAddress: signerAddress,
        oracleCriteriaJson: buildReusableOracleCriteriaJson("PROTOCOL_ACTIVITY", {
          protocolIds: ["bao-finance"],
          minInteractionCount: "1",
          minDistinctProtocols: "0",
          minDistinctChains: "0",
          note: "Issue a proof only when the wallet has already interacted with the listed protocol set."
        }),
        unlockNote:
          "An oracle verifies indexed protocol interactions and only returns an 8183 proof when the connected wallet actively claims."
      };
    case "PORTFOLIO_STATE":
      return {
        unlockAdapterType: "PORTFOLIO_STATE",
        unlockTargetAddress: "",
        unlockThreshold: "0",
        unlockSignerAddress: signerAddress,
        oracleCriteriaJson: buildReusableOracleCriteriaJson("PORTFOLIO_STATE", {
          requiredCollections: [],
          collectionMatch: "ANY",
          minCollectionBalance: "1",
          minDefiUsd: "0",
          minTokenUsd: "0",
          minNftUsd: "0",
          minTotalUsd: "0",
          note: "Issue a proof only when the wallet currently holds the required NFT collection or portfolio state."
        }),
        unlockNote:
          "An oracle verifies portfolio state and only returns an 8183 proof when the connected wallet actively claims."
      };
    case "INTERNAL_SERVICE_ACTIVITY":
      return {
        unlockAdapterType: "INTERNAL_SERVICE_ACTIVITY",
        unlockTargetAddress: "",
        unlockThreshold: "1",
        unlockSignerAddress: signerAddress,
        oracleCriteriaJson: buildReusableOracleCriteriaJson("INTERNAL_SERVICE_ACTIVITY", {
          services: [],
          rails: [],
          matchMode: "ALL",
          requirementMatchMode: "ANY",
          windowDays: "0",
          minActivityCount: "0",
          minPaidRequests: "0",
          minSpendUsd: "0",
          minDistinctServices: "0",
          evmChains: [],
          minEvmTransactionCount: "0",
          requiredSubjectType: "ANY",
          activityRequirements: [
            {
              label: "x402 agent",
              rails: ["X402"],
              minPaidRequests: "1",
              requiredSubjectType: "AGENT"
            },
            {
              label: "mpp agent",
              rails: ["MPP"],
              minPaidRequests: "1",
              requiredSubjectType: "AGENT"
            },
            {
              label: "openclaw agent",
              rails: ["APP"],
              services: ["openclaw"],
              minActivityCount: "1",
              requiredSubjectType: "AGENT"
            },
            {
              label: "moltbook agent",
              rails: ["APP"],
              services: ["moltbook"],
              minActivityCount: "1",
              requiredSubjectType: "AGENT"
            }
          ],
          note:
            "Issue a proof only when indexed agent activity already clears one of the configured x402, MPP, OpenClaw, or Moltbook paths."
        }),
        unlockNote:
          "An oracle verifies indexed agent activity and only returns an 8183 proof when the connected wallet actively claims."
      };
    case "AGENT_REP":
      return {
        unlockAdapterType: "AGENT_REP",
        unlockTargetAddress: "",
        unlockThreshold: "1",
        unlockSignerAddress: "",
        unlockNote: "A reputable agent signs the claim proof."
      };
    case "X402_HISTORY":
      return {
        unlockAdapterType: "X402_HISTORY",
        unlockTargetAddress: "",
        unlockThreshold: "1",
        unlockSignerAddress: signerAddress,
        unlockMetric: "paid_requests",
        unlockOrigins: "",
        unlockWindowDays: "365",
        unlockIdentityMode: "WALLET_ONLY",
        unlockNote:
          "An oracle issues an 8183 proof on demand only when the connected wallet actively claims and already meets the configured x402 history threshold."
      };
    case "PAYMENT_HISTORY":
      return {
        unlockAdapterType: "PAYMENT_HISTORY",
        unlockTargetAddress: "",
        unlockThreshold: "1",
        unlockSignerAddress: signerAddress,
        unlockMetric: "paid_requests",
        unlockOrigins: "",
        unlockWindowDays: "365",
        unlockIdentityMode: "WALLET_ONLY",
        unlockRailMode: "ANY",
        unlockNote:
          "An oracle issues an 8183 proof on demand only when the connected agent wallet actively claims and the authorized MPP and x402 rails already meet the configured history threshold."
      };
    default:
      return {
        unlockAdapterType: "MANUAL_ATTESTOR",
        unlockTargetAddress: "",
        unlockThreshold: "0",
        unlockSignerAddress: "",
        unlockNote: "An authorized attestor records claims directly for pilot badge programs."
      };
  }
}

export function verificationTypeForAdapter(adapterType = "MANUAL_ATTESTOR") {
  switch (adapterType) {
    case "BADGE_COUNT":
    case "TOKEN_BALANCE":
      return "ONCHAIN_STATE";
    case "ORACLE_EVENT":
    case "FARCASTER_ACCOUNT":
    case "WALLET_AGE_ACTIVITY":
    case "PROTOCOL_ACTIVITY":
    case "PORTFOLIO_STATE":
    case "INTERNAL_SERVICE_ACTIVITY":
    case "X402_HISTORY":
    case "PAYMENT_HISTORY":
      return "ORACLE_ATTESTATION";
    case "AGENT_REP":
      return "AGENT_ATTESTATION";
    default:
      return "ONCHAIN_STATE";
  }
}

export function normalizeUnlockAdapterConfig(raw = {}) {
  const fallback = unlockAdapterDefaults(raw.unlockAdapterType);
  return {
    unlockAdapterType: raw.unlockAdapterType || fallback.unlockAdapterType,
    unlockTargetAddress: normalizeAddress(raw.unlockTargetAddress) || fallback.unlockTargetAddress,
    unlockThreshold: String(raw.unlockThreshold ?? fallback.unlockThreshold).trim() || fallback.unlockThreshold,
    unlockSignerAddress: normalizeAddress(raw.unlockSignerAddress) || fallback.unlockSignerAddress,
    unlockMetric: raw.unlockMetric || fallback.unlockMetric || "paid_requests",
    unlockOrigins:
      Array.isArray(raw.unlockOrigins) ? raw.unlockOrigins.join(", ") : String(raw.unlockOrigins ?? fallback.unlockOrigins ?? ""),
    unlockWindowDays:
      String(raw.unlockWindowDays ?? fallback.unlockWindowDays ?? "365").trim() || (fallback.unlockWindowDays ?? "365"),
    unlockIdentityMode: String(raw.unlockIdentityMode ?? fallback.unlockIdentityMode ?? "WALLET_ONLY").trim() || "WALLET_ONLY",
    unlockRailMode: String(raw.unlockRailMode ?? fallback.unlockRailMode ?? "ANY").trim() || "ANY",
    farcasterCriteriaHash: normalizeBytes32(raw.farcasterCriteriaHash) || "",
    paymentCriteriaHash: normalizeBytes32(raw.paymentCriteriaHash) || "",
    x402CriteriaHash: normalizeBytes32(raw.x402CriteriaHash) || "",
    oracleCriteriaHash: normalizeBytes32(raw.oracleCriteriaHash) || "",
    oracleCriteriaKind: String(raw.oracleCriteriaKind ?? fallback.oracleCriteriaKind ?? "").trim(),
    oracleCriteriaJson:
      String(raw.oracleCriteriaJson ?? fallback.oracleCriteriaJson ?? "").trim(),
    unlockNote: raw.unlockNote?.trim?.() ?? fallback.unlockNote
  };
}

export function buildUnlockAdapterPayload(input = {}, { fallbackTargetAddress = "" } = {}) {
  const requestedType = input.unlockAdapterType || "MANUAL_ATTESTOR";
  const normalizedConfig = normalizeUnlockAdapterConfig({
    ...unlockAdapterDefaults(requestedType, {
      targetAddress: fallbackTargetAddress
    }),
    ...input,
    unlockTargetAddress: input.unlockTargetAddress || fallbackTargetAddress
  });

  switch (normalizedConfig.unlockAdapterType) {
    case "BADGE_COUNT": {
      if (!normalizedConfig.unlockTargetAddress) {
        throw new Error("Add a registry target before using the badge-count unlock adapter.");
      }

      return {
        verificationType: "ONCHAIN_STATE",
        verificationData: encodeAbiParameters(
          [
            { type: "address" },
            { type: "bytes" },
            { type: "bytes" }
          ],
          [
            normalizedConfig.unlockTargetAddress,
            BADGE_COUNT_CALL_PREFIX,
            encodeAbiParameters(
              [{ type: "uint256" }],
              [BigInt(Number(normalizedConfig.unlockThreshold) || 0)]
            )
          ]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: normalizedConfig
      };
    }
    case "TOKEN_BALANCE": {
      if (!normalizedConfig.unlockTargetAddress) {
        throw new Error("Add a token contract address before using the token-balance unlock adapter.");
      }

      return {
        verificationType: "ONCHAIN_STATE",
        verificationData: encodeAbiParameters(
          [
            { type: "address" },
            { type: "bytes" },
            { type: "bytes" }
          ],
          [
            normalizedConfig.unlockTargetAddress,
            TOKEN_BALANCE_CALL_PREFIX,
            encodeAbiParameters(
              [{ type: "uint256" }],
              [BigInt(Number(normalizedConfig.unlockThreshold) || 0)]
            )
          ]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: normalizedConfig
      };
    }
    case "ORACLE_EVENT": {
      if (!normalizedConfig.unlockSignerAddress) {
        throw new Error("Add an oracle signer address for attendance attestations.");
      }

      return {
        verificationType: "ORACLE_ATTESTATION",
        verificationData: encodeAbiParameters(
          [{ type: "address" }],
          [normalizedConfig.unlockSignerAddress]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: normalizedConfig
      };
    }
    case "FARCASTER_ACCOUNT": {
      if (!normalizedConfig.unlockSignerAddress) {
        throw new Error("Add a Farcaster proof signer address before defining this badge.");
      }

      const criteria = normalizeFarcasterCriteria({
        minFid: normalizedConfig.unlockThreshold,
        note: normalizedConfig.unlockNote
      });
      const criteriaHash = buildFarcasterCriteriaHash(criteria);
      const criteriaJson = buildFarcasterCriteriaJson(criteria);

      return {
        verificationType: "ORACLE_ATTESTATION",
        verificationData: encodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }, { type: "string" }],
          [normalizedConfig.unlockSignerAddress, criteriaHash, criteriaJson]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: {
          ...normalizedConfig,
          farcasterCriteriaHash: criteriaHash,
          farcasterCriteriaJson: criteriaJson,
          farcasterCriteria: criteria
        }
      };
    }
    case "WALLET_AGE_ACTIVITY":
    case "PROTOCOL_ACTIVITY":
    case "PORTFOLIO_STATE":
    case "INTERNAL_SERVICE_ACTIVITY": {
      if (!normalizedConfig.unlockSignerAddress) {
        throw new Error("Add an oracle proof signer address before defining this badge.");
      }

      let parsedCriteriaInput = normalizedConfig.oracleCriteriaJson;
      if (parsedCriteriaInput) {
        try {
          parsedCriteriaInput = JSON.parse(parsedCriteriaInput);
        } catch (error) {
          throw new Error(
            `The oracle criteria JSON is not valid: ${error instanceof Error ? error.message : "invalid JSON"}.`
          );
        }
      }

      const criteria = normalizeReusableOracleCriteria(
        normalizedConfig.unlockAdapterType,
        {
          ...(parsedCriteriaInput && typeof parsedCriteriaInput === "object"
            ? parsedCriteriaInput
            : {}),
          note:
            normalizedConfig.unlockNote ||
            (parsedCriteriaInput &&
            typeof parsedCriteriaInput === "object" &&
            typeof parsedCriteriaInput.note === "string"
              ? parsedCriteriaInput.note
              : "")
        }
      );
      const criteriaHash = buildReusableOracleCriteriaHash(
        normalizedConfig.unlockAdapterType,
        criteria
      );
      const criteriaJson = buildReusableOracleCriteriaJson(
        normalizedConfig.unlockAdapterType,
        criteria
      );

      return {
        verificationType: "ORACLE_ATTESTATION",
        verificationData: encodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }, { type: "string" }],
          [normalizedConfig.unlockSignerAddress, criteriaHash, criteriaJson]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: {
          ...normalizedConfig,
          unlockNote: criteria.note || normalizedConfig.unlockNote,
          oracleCriteriaHash: criteriaHash,
          oracleCriteriaKind: criteria.kind,
          oracleCriteriaJson: criteriaJson,
          oracleCriteria: criteria
        }
      };
    }
    case "X402_HISTORY": {
      if (!normalizedConfig.unlockSignerAddress) {
        throw new Error("Add an x402 oracle signer address before defining this badge.");
      }

      const criteria = normalizeX402Criteria({
        metric: normalizedConfig.unlockMetric,
        threshold: normalizedConfig.unlockThreshold,
        origins: normalizedConfig.unlockOrigins,
        windowDays: normalizedConfig.unlockWindowDays,
        identityMode: normalizedConfig.unlockIdentityMode,
        note: normalizedConfig.unlockNote
      });
      const criteriaHash = buildX402CriteriaHash(criteria);
      const criteriaJson = buildX402CriteriaJson(criteria);

      return {
        verificationType: "ORACLE_ATTESTATION",
        verificationData: encodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }, { type: "string" }],
          [normalizedConfig.unlockSignerAddress, criteriaHash, criteriaJson]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: {
          ...normalizedConfig,
          unlockOrigins: criteria.origins.join(", "),
          unlockThreshold: criteria.threshold,
          unlockWindowDays: criteria.windowDays,
          unlockIdentityMode: criteria.identityMode,
          unlockRailMode: criteria.railMode,
          x402CriteriaHash: criteriaHash,
          x402CriteriaJson: criteriaJson,
          x402Criteria: criteria
        }
      };
    }
    case "PAYMENT_HISTORY": {
      if (!normalizedConfig.unlockSignerAddress) {
        throw new Error("Add a payment proof signer address before defining this badge.");
      }

      const criteria = normalizePaymentCriteria({
        metric: normalizedConfig.unlockMetric,
        threshold: normalizedConfig.unlockThreshold,
        origins: normalizedConfig.unlockOrigins,
        windowDays: normalizedConfig.unlockWindowDays,
        identityMode: normalizedConfig.unlockIdentityMode,
        railMode: normalizedConfig.unlockRailMode,
        note: normalizedConfig.unlockNote
      });
      const criteriaHash = buildPaymentCriteriaHash(criteria);
      const criteriaJson = buildPaymentCriteriaJson(criteria);

      return {
        verificationType: "ORACLE_ATTESTATION",
        verificationData: encodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }, { type: "string" }],
          [normalizedConfig.unlockSignerAddress, criteriaHash, criteriaJson]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: {
          ...normalizedConfig,
          unlockOrigins: criteria.origins.join(", "),
          unlockThreshold: criteria.threshold,
          unlockWindowDays: criteria.windowDays,
          unlockIdentityMode: criteria.identityMode,
          unlockRailMode: criteria.railMode,
          paymentCriteriaHash: criteriaHash,
          paymentCriteriaJson: criteriaJson,
          paymentCriteria: criteria
        }
      };
    }
    case "AGENT_REP":
      return {
        verificationType: "AGENT_ATTESTATION",
        verificationData: encodeAbiParameters(
          [{ type: "uint256" }],
          [BigInt(Number(normalizedConfig.unlockThreshold) || 0)]
        ),
        unlockAdapterType: normalizedConfig.unlockAdapterType,
        unlockAdapterConfig: normalizedConfig
      };
    default:
      return {
        verificationType: "ONCHAIN_STATE",
        verificationData: "0x",
        unlockAdapterType: "MANUAL_ATTESTOR",
        unlockAdapterConfig: normalizeUnlockAdapterConfig({
          ...normalizedConfig,
          unlockAdapterType: "MANUAL_ATTESTOR"
        })
      };
  }
}

export function decodeUnlockAdapterConfig(verificationType, verificationData = "0x") {
  const normalizedData = normalizeHex(verificationData);

  try {
    if (verificationType === "ORACLE_ATTESTATION") {
      try {
        const [signerAddress, criteriaHash, criteriaJson] = decodeAbiParameters(
          [{ type: "address" }, { type: "bytes32" }, { type: "string" }],
          normalizedData
        );
        const parsedCriteria = JSON.parse(criteriaJson);
        if (isX402Criteria(parsedCriteria)) {
          const normalizedCriteria = normalizeX402Criteria(parsedCriteria);
          return normalizeUnlockAdapterConfig({
            unlockAdapterType: "X402_HISTORY",
            unlockSignerAddress: signerAddress,
            unlockMetric: normalizedCriteria.metric,
            unlockThreshold: normalizedCriteria.threshold,
            unlockOrigins: normalizedCriteria.origins.join(", "),
            unlockWindowDays: normalizedCriteria.windowDays,
            unlockIdentityMode: normalizedCriteria.identityMode,
            unlockRailMode: normalizedCriteria.railMode,
            unlockNote: normalizedCriteria.note,
            x402CriteriaHash: criteriaHash
          });
        }
        if (isFarcasterCriteria(parsedCriteria)) {
          const normalizedCriteria = normalizeFarcasterCriteria(parsedCriteria);
          return normalizeUnlockAdapterConfig({
            unlockAdapterType: "FARCASTER_ACCOUNT",
            unlockSignerAddress: signerAddress,
            unlockThreshold: normalizedCriteria.minFid ? String(normalizedCriteria.minFid) : "0",
            unlockNote: normalizedCriteria.note,
            farcasterCriteriaHash: criteriaHash
          });
        }
        const reusableOracleAdapterType =
          resolveReusableOracleAdapterTypeFromCriteria(parsedCriteria);
        if (reusableOracleAdapterType) {
          const normalizedCriteria = normalizeReusableOracleCriteria(
            reusableOracleAdapterType,
            parsedCriteria
          );
          return normalizeUnlockAdapterConfig({
            unlockAdapterType: reusableOracleAdapterType,
            unlockSignerAddress: signerAddress,
            unlockNote: normalizedCriteria.note,
            oracleCriteriaHash: criteriaHash,
            oracleCriteriaKind: normalizedCriteria.kind,
            oracleCriteriaJson: buildReusableOracleCriteriaJson(
              reusableOracleAdapterType,
              normalizedCriteria
            )
          });
        }
        if (isPaymentHistoryCriteria(parsedCriteria)) {
          const normalizedCriteria = normalizePaymentCriteria(parsedCriteria);
          return normalizeUnlockAdapterConfig({
            unlockAdapterType: "PAYMENT_HISTORY",
            unlockSignerAddress: signerAddress,
            unlockMetric: normalizedCriteria.metric,
            unlockThreshold: normalizedCriteria.threshold,
            unlockOrigins: normalizedCriteria.origins.join(", "),
            unlockWindowDays: normalizedCriteria.windowDays,
            unlockIdentityMode: normalizedCriteria.identityMode,
            unlockRailMode: normalizedCriteria.railMode,
            unlockNote: normalizedCriteria.note,
            paymentCriteriaHash: criteriaHash
          });
        }
      } catch {
        // Ignore extended x402 decoding errors and fall back to standard oracle decoding.
      }

      const [signerAddress] = decodeAbiParameters([{ type: "address" }], normalizedData);
      return normalizeUnlockAdapterConfig({
        unlockAdapterType: "ORACLE_EVENT",
        unlockSignerAddress: signerAddress
      });
    }

    if (verificationType === "AGENT_ATTESTATION") {
      const [minimumReputation] = decodeAbiParameters([{ type: "uint256" }], normalizedData);
      return normalizeUnlockAdapterConfig({
        unlockAdapterType: "AGENT_REP",
        unlockThreshold: String(Number(minimumReputation))
      });
    }

    if (verificationType === "MERKLE_PROOF") {
      return normalizeUnlockAdapterConfig({
        unlockAdapterType: "MANUAL_ATTESTOR",
        unlockNote: "Merkle proofs are contract-ready, but the browser generator is still pending."
      });
    }

    if (!normalizedData || normalizedData === "0x") {
      return normalizeUnlockAdapterConfig({
        unlockAdapterType: "MANUAL_ATTESTOR"
      });
    }

    const [targetAddress, callData, expected] = decodeAbiParameters(
      [
        { type: "address" },
        { type: "bytes" },
        { type: "bytes" }
      ],
      normalizedData
    );

    if (normalizeHex(callData) === normalizeHex(BADGE_COUNT_CALL_PREFIX)) {
      const [minimumCount] = decodeAbiParameters([{ type: "uint256" }], expected);
      return normalizeUnlockAdapterConfig({
        unlockAdapterType: "BADGE_COUNT",
        unlockTargetAddress: targetAddress,
        unlockThreshold: String(Number(minimumCount))
      });
    }

    if (normalizeHex(callData) === normalizeHex(TOKEN_BALANCE_CALL_PREFIX)) {
      const [minimumBalance] = decodeAbiParameters([{ type: "uint256" }], expected);
      return normalizeUnlockAdapterConfig({
        unlockAdapterType: "TOKEN_BALANCE",
        unlockTargetAddress: targetAddress,
        unlockThreshold: String(Number(minimumBalance))
      });
    }
  } catch {
    // Fall through to manual defaults below when the config cannot be decoded cleanly.
  }

  return normalizeUnlockAdapterConfig({
    unlockAdapterType: "MANUAL_ATTESTOR",
    unlockNote: "Custom verification data loaded. Use manual attestor issuance if self-claim is unavailable."
  });
}

export function summarizeUnlockAdapter(definitionLike = {}) {
  const unlockAdapterConfig =
    definitionLike.unlockAdapterConfig ??
    decodeUnlockAdapterConfig(definitionLike.verificationType, definitionLike.verificationData);
  const adapterType = unlockAdapterConfig.unlockAdapterType;

  if (adapterType === "BADGE_COUNT") {
    return {
      title: "Badge Count Check",
      summary: "Agents can self-claim once their badge count clears the configured threshold.",
      detailLines: [
        `Target registry: ${unlockAdapterConfig.unlockTargetAddress || "unset"}`,
        `Minimum count: ${unlockAdapterConfig.unlockThreshold || "0"}`
      ],
      manualOnly: false,
      requiresProof: false,
      executionHint: "Direct self-claim supported."
    };
  }

  if (adapterType === "TOKEN_BALANCE") {
    return {
      title: "Token Balance Check",
      summary: "Agents can self-claim once the connected wallet balance clears the configured onchain threshold.",
      detailLines: [
        `Token contract: ${unlockAdapterConfig.unlockTargetAddress || "unset"}`,
        `Minimum balance: ${unlockAdapterConfig.unlockThreshold || "0"}`
      ],
      manualOnly: false,
      requiresProof: false,
      executionHint: "Direct self-claim supported."
    };
  }

  if (adapterType === "ORACLE_EVENT") {
    return {
      title: "Oracle Attendance Attestation",
      summary: "A trusted signer must produce an attendance proof for each claiming agent.",
      detailLines: [
        `Oracle signer: ${unlockAdapterConfig.unlockSignerAddress || "unset"}`
      ],
      manualOnly: false,
      requiresProof: true,
      executionHint: "Direct self-claim supported when the signer proof is available."
    };
  }

  if (adapterType === "FARCASTER_ACCOUNT") {
    const farcasterSummary = describeFarcasterCriteria({
      minFid: unlockAdapterConfig.unlockThreshold,
      note: unlockAdapterConfig.unlockNote
    });
    return {
      title: farcasterSummary.title,
      summary: farcasterSummary.summary,
      detailLines: [
        ...farcasterSummary.detailLines,
        `Proof issuer: ${unlockAdapterConfig.unlockSignerAddress || "unset"}`
      ],
      manualOnly: false,
      requiresProof: true,
      executionHint:
        "Direct self-claim requests a fresh 8183 Farcaster proof after the agent connects with Farcaster Quick Auth."
    };
  }

  if (isReusableOracleAdapter(adapterType)) {
    const parsedCriteria = (() => {
      if (unlockAdapterConfig.oracleCriteriaJson) {
        try {
          return JSON.parse(unlockAdapterConfig.oracleCriteriaJson);
        } catch {
          return {};
        }
      }
      return {};
    })();
    const criteriaSummary = describeReusableOracleCriteria(adapterType, {
      ...parsedCriteria,
      note: parsedCriteria.note ?? unlockAdapterConfig.unlockNote
    });
    return {
      title: criteriaSummary.title,
      summary: criteriaSummary.summary,
      detailLines: [
        ...criteriaSummary.detailLines,
        `Proof issuer: ${unlockAdapterConfig.unlockSignerAddress || "unset"}`
      ],
      manualOnly: false,
      requiresProof: true,
      executionHint:
        "Direct self-claim requests a fresh 8183 oracle proof for the connected wallet only."
    };
  }

  if (adapterType === "X402_HISTORY") {
    const x402Summary = describeX402Criteria({
      metric: unlockAdapterConfig.unlockMetric,
      threshold: unlockAdapterConfig.unlockThreshold,
      origins: unlockAdapterConfig.unlockOrigins,
      windowDays: unlockAdapterConfig.unlockWindowDays,
      identityMode: unlockAdapterConfig.unlockIdentityMode,
      note: unlockAdapterConfig.unlockNote
    });
    return {
      title: x402Summary.title,
      summary: x402Summary.summary,
      detailLines: [
        ...x402Summary.detailLines,
        `Proof issuer: ${unlockAdapterConfig.unlockSignerAddress || "unset"}`
      ],
      manualOnly: false,
      requiresProof: true,
      executionHint:
        "Direct self-claim requests a fresh 8183 x402 history proof for the connected wallet only."
    };
  }

  if (adapterType === "PAYMENT_HISTORY") {
    const paymentSummary = describePaymentCriteria({
      metric: unlockAdapterConfig.unlockMetric,
      threshold: unlockAdapterConfig.unlockThreshold,
      origins: unlockAdapterConfig.unlockOrigins,
      windowDays: unlockAdapterConfig.unlockWindowDays,
      identityMode: unlockAdapterConfig.unlockIdentityMode,
      railMode: unlockAdapterConfig.unlockRailMode,
      note: unlockAdapterConfig.unlockNote
    });
    return {
      title: paymentSummary.title,
      summary: paymentSummary.summary,
      detailLines: [
        ...paymentSummary.detailLines,
        `Proof issuer: ${unlockAdapterConfig.unlockSignerAddress || "unset"}`
      ],
      manualOnly: false,
      requiresProof: true,
      executionHint:
        "Direct self-claim requests a fresh 8183 payment history proof and can include the connected MPP payer wallet."
    };
  }

  if (adapterType === "AGENT_REP") {
    return {
      title: "Agent Reputation Attestation",
      summary: "A reputable agent signs the unlock proof before the agent can self-claim.",
      detailLines: [
        `Minimum reputation: ${unlockAdapterConfig.unlockThreshold || "0"}`
      ],
      manualOnly: false,
      requiresProof: true,
      executionHint: "Direct self-claim supported when a qualified attestation proof is available."
    };
  }

  return {
    title: "Manual Attestor Approval",
    summary: "Claims are recorded by an authorized attestor, which is ideal for early pilots and curated cohorts.",
    detailLines: [unlockAdapterConfig.unlockNote || "Uses the attestor path instead of a self-claim proof."],
    manualOnly: true,
    requiresProof: false,
    executionHint: "Use the attestor claim path."
  };
}

export function buildClaimProofDigest({ badgeRegistryAddress, definitionId, agent }) {
  return keccak256(
    encodePacked(
      ["address", "uint256", "address"],
      [badgeRegistryAddress, BigInt(definitionId), agent]
    )
  );
}

export function buildExpiringClaimProofDigest({
  badgeRegistryAddress,
  definitionId,
  agent,
  issuedAt,
  expiresAt
}) {
  return keccak256(
    encodePacked(
      ["address", "uint256", "address", "uint64", "uint64"],
      [
        badgeRegistryAddress,
        BigInt(definitionId),
        agent,
        BigInt(Number(issuedAt) || 0),
        BigInt(Number(expiresAt) || 0)
      ]
    )
  );
}

export function buildOracle8183ProofDigest({
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

export function buildAgent8183ProofDigest({
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
    throw new Error("Agent 8183 proofs require a 32-byte schema id.");
  }
  if (!normalizedChainId) {
    throw new Error("Agent 8183 proofs require a numeric chain id.");
  }
  return keccak256(
    encodePacked(
      ["address", "uint256", "bytes32", "string", "uint256", "address", "bytes32", "bytes32", "uint64", "uint64"],
      [
        badgeRegistryAddress,
        BigInt(normalizedChainId),
        normalizedSchemaId,
        "AGENT_8183",
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

export async function signOracleEventProofPackage({
  badgeRegistryAddress,
  definitionId,
  agent,
  account,
  walletClient,
  eventSlug = "",
  note = "",
  issuedAt = Math.floor(Date.now() / 1000),
  expiresAt = issuedAt + DEFAULT_ORACLE_EVENT_PROOF_TTL
}) {
  const normalizedIssuedAt = Number(issuedAt) || 0;
  const normalizedExpiresAt = Number(expiresAt) || 0;
  if (!normalizedIssuedAt || !normalizedExpiresAt || normalizedExpiresAt <= normalizedIssuedAt) {
    throw new Error("Oracle attendance proofs require a valid issuedAt/expiresAt range.");
  }

  const digest = buildExpiringClaimProofDigest({
    badgeRegistryAddress,
    definitionId,
    agent,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedExpiresAt
  });
  const signature = walletClient?.signMessage
    ? await walletClient.signMessage({
        account,
        message: {
          raw: digest
        }
      })
    : await account.signMessage({
        message: {
          raw: digest
        }
      });

  return {
    kind: ORACLE_EVENT_PROOF_KIND,
    badgeRegistryAddress,
    definitionId: Number(definitionId),
    agent,
    signerAddress: account?.address ?? account,
    eventSlug,
    note,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedExpiresAt,
    signature
  };
}

export async function signOracle8183ProofPackage({
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  account,
  walletClient,
  contextId,
  contextLabel = "",
  schemaId = DEFAULT_ORACLE_8183_SCHEMA,
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
  if (!normalizedContextId) {
    throw new Error("Oracle 8183 proofs require a 32-byte context id.");
  }
  if (!normalizedNonce) {
    throw new Error("Oracle 8183 proofs require a 32-byte nonce.");
  }
  if (!normalizedChainId) {
    throw new Error("Oracle 8183 proofs require a numeric chain id.");
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
  const signature = walletClient?.signMessage
    ? await walletClient.signMessage({
        account,
        message: {
          raw: digest
        }
      })
    : await account.signMessage({
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
    signerAddress: account?.address ?? account,
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

export async function signAgent8183ProofPackage({
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  account,
  walletClient,
  contextId,
  contextLabel = "",
  schemaId = DEFAULT_AGENT_8183_SCHEMA,
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
  if (!normalizedContextId) {
    throw new Error("Agent 8183 proofs require a 32-byte context id.");
  }
  if (!normalizedNonce) {
    throw new Error("Agent 8183 proofs require a 32-byte nonce.");
  }
  if (!normalizedChainId) {
    throw new Error("Agent 8183 proofs require a numeric chain id.");
  }
  if (!normalizedIssuedAt || !normalizedExpiresAt || normalizedExpiresAt <= normalizedIssuedAt) {
    throw new Error("Agent 8183 proofs require a valid issuedAt/expiresAt range.");
  }

  const digest = buildAgent8183ProofDigest({
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
  const signature = walletClient?.signMessage
    ? await walletClient.signMessage({
        account,
        message: {
          raw: digest
        }
      })
    : await account.signMessage({
        message: {
          raw: digest
        }
      });

  return {
    kind: AGENT_8183_PROOF_KIND,
    badgeRegistryAddress,
    chainId: normalizedChainId,
    definitionId: Number(definitionId),
    agent,
    signerAddress: account?.address ?? account,
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

export function parseOracleEventProofPackage(rawProof) {
  const parsed =
    typeof rawProof === "string"
      ? JSON.parse(rawProof)
      : rawProof && typeof rawProof === "object"
        ? rawProof
        : null;

  if (
    !parsed ||
    (
      parsed.kind !== ORACLE_EVENT_PROOF_KIND &&
      parsed.kind !== LEGACY_ORACLE_EVENT_PROOF_KIND &&
      parsed.kind !== ORACLE_8183_PROOF_KIND
    )
  ) {
    throw new Error("The proof package is not a supported event attendance proof.");
  }

  const badgeRegistryAddress = normalizeAddress(parsed.badgeRegistryAddress);
  const agent = normalizeAddress(parsed.agent);
  const signerAddress = normalizeAddress(parsed.signerAddress);
  const signature = parsed.signature?.trim?.() ?? "";
  const definitionId = Number(parsed.definitionId);

  if (!badgeRegistryAddress || !agent || !signerAddress || !signature || !Number.isFinite(definitionId)) {
    throw new Error("The proof package is missing required attendance fields.");
  }

  const issuedAt = Number(parsed.issuedAt ?? 0) || 0;
  const expiresAt = Number(parsed.expiresAt ?? 0) || 0;
  const chainId = normalizeChainId(parsed.chainId) || 0;
  const schemaId = normalizeBytes32(parsed.schemaId) || "";
  const contextId = normalizeBytes32(parsed.contextId) || "";
  const nonce = normalizeBytes32(parsed.nonce) || "";

  if (parsed.kind === ORACLE_EVENT_PROOF_KIND || parsed.kind === ORACLE_8183_PROOF_KIND) {
    if (!issuedAt || !expiresAt || expiresAt <= issuedAt) {
      throw new Error("The attendance proof package is missing a valid expiration window.");
    }
  }
  if (parsed.kind === ORACLE_8183_PROOF_KIND && (!contextId || !nonce)) {
    throw new Error("The 8183 proof package is missing a valid context or nonce.");
  }
  if (parsed.kind === ORACLE_8183_PROOF_KIND && !chainId) {
    throw new Error("The 8183 proof package is missing a valid chain id.");
  }

  return {
    kind: parsed.kind,
    badgeRegistryAddress,
    chainId,
    definitionId,
    agent,
    signerAddress,
    eventSlug: parsed.eventSlug?.trim?.() ?? "",
    schemaId,
    contextId,
    contextLabel: parsed.contextLabel?.trim?.() ?? "",
    nonce,
    note: parsed.note?.trim?.() ?? "",
    issuedAt,
    expiresAt,
    signature
  };
}

export function parseAgentAttestationProofPackage(rawProof) {
  const parsed =
    typeof rawProof === "string"
      ? JSON.parse(rawProof)
      : rawProof && typeof rawProof === "object"
        ? rawProof
        : null;

  if (!parsed || parsed.kind !== AGENT_8183_PROOF_KIND) {
    throw new Error("The proof package is not a supported agent attestation proof.");
  }

  const badgeRegistryAddress = normalizeAddress(parsed.badgeRegistryAddress);
  const agent = normalizeAddress(parsed.agent);
  const signerAddress = normalizeAddress(parsed.signerAddress);
  const signature = parsed.signature?.trim?.() ?? "";
  const definitionId = Number(parsed.definitionId);

  if (!badgeRegistryAddress || !agent || !signerAddress || !signature || !Number.isFinite(definitionId)) {
    throw new Error("The proof package is missing required agent attestation fields.");
  }

  const issuedAt = Number(parsed.issuedAt ?? 0) || 0;
  const expiresAt = Number(parsed.expiresAt ?? 0) || 0;
  const chainId = normalizeChainId(parsed.chainId) || 0;
  const schemaId = normalizeBytes32(parsed.schemaId) || "";
  const contextId = normalizeBytes32(parsed.contextId) || "";
  const nonce = normalizeBytes32(parsed.nonce) || "";

  if (!issuedAt || !expiresAt || expiresAt <= issuedAt) {
    throw new Error("The agent attestation proof package is missing a valid expiration window.");
  }
  if (!contextId || !nonce) {
    throw new Error("The agent attestation proof package is missing a valid context or nonce.");
  }
  if (!chainId) {
    throw new Error("The agent attestation proof package is missing a valid chain id.");
  }

  return {
    kind: parsed.kind,
    badgeRegistryAddress,
    chainId,
    definitionId,
    agent,
    signerAddress,
    schemaId,
    contextId,
    contextLabel: parsed.contextLabel?.trim?.() ?? "",
    nonce,
    note: parsed.note?.trim?.() ?? "",
    issuedAt,
    expiresAt,
    signature
  };
}

export function encode8183ProofPackageCalldata(proofPackage) {
  const { r, s, v } = parseSignature(proofPackage.signature);
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint64" },
      { type: "uint64" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint8" }
    ],
    [
      proofPackage.contextId,
      proofPackage.nonce,
      proofPackage.issuedAt,
      proofPackage.expiresAt,
      r,
      s,
      v
    ]
  );
}

async function validateOracle8183ProofPackage({
  proofPackage,
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  requiredIssuer,
  requiredContextId,
  requiredSchemaId,
  label = "8183 proof"
}) {
  if (proofPackage.kind !== ORACLE_8183_PROOF_KIND) {
    throw new Error(`This badge requires an 8183 proof package. Received ${proofPackage.kind || "unknown"}.`);
  }
  if (normalizeAddress(proofPackage.badgeRegistryAddress) !== normalizeAddress(badgeRegistryAddress)) {
    throw new Error(`The ${label} targets a different badge registry.`);
  }
  if (Number(proofPackage.definitionId) !== Number(definitionId)) {
    throw new Error(`The ${label} targets a different badge.`);
  }
  if (normalizeAddress(proofPackage.agent) !== normalizeAddress(agent)) {
    throw new Error(`The ${label} targets a different agent.`);
  }
  if (normalizeAddress(proofPackage.signerAddress) !== normalizeAddress(requiredIssuer)) {
    throw new Error(
      `This badge expects issuer ${requiredIssuer}, but the proof was signed by ${proofPackage.signerAddress || "unset"}.`
    );
  }
  if (proofPackage.contextId !== requiredContextId) {
    throw new Error(
      `This badge expects context ${requiredContextId}, but the proof used ${proofPackage.contextId || "unset"}.`
    );
  }
  if (proofPackage.schemaId !== requiredSchemaId) {
    throw new Error(
      `This badge expects schema ${requiredSchemaId}, but the proof used ${proofPackage.schemaId || "unset"}.`
    );
  }
  if (Number(proofPackage.chainId) !== Number(chainId)) {
    throw new Error(
      `This badge expects chain ${chainId}, but the proof targeted ${proofPackage.chainId || "unset"}.`
    );
  }
  if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error(`The ${label} has expired. Load a fresh proof package.`);
  }

  const recoveredSigner = await recoverMessageAddress({
    message: {
      raw: buildOracle8183ProofDigest({
        badgeRegistryAddress,
        chainId: proofPackage.chainId,
        schemaId: proofPackage.schemaId,
        definitionId,
        agent,
        contextId: proofPackage.contextId,
        nonce: proofPackage.nonce,
        issuedAt: proofPackage.issuedAt,
        expiresAt: proofPackage.expiresAt
      })
    },
    signature: proofPackage.signature
  });
  if (normalizeAddress(recoveredSigner) !== normalizeAddress(proofPackage.signerAddress)) {
    throw new Error(`The ${label} signature could not be verified.`);
  }

  return proofPackage;
}

export async function buildDirectClaimProof({
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  account,
  walletClient,
  paymentAccount = "",
  paymentWalletClient = null,
  unlockAdapterConfig,
  advancedPolicyConfig = null,
  providedProof = "",
  x402ServiceUrl = "",
  oracleServiceUrl = "",
  farcasterServiceUrl = ""
}) {
  const config = normalizeUnlockAdapterConfig(unlockAdapterConfig);

  if (
    config.unlockAdapterType === "MANUAL_ATTESTOR" ||
    config.unlockAdapterType === "BADGE_COUNT" ||
    config.unlockAdapterType === "TOKEN_BALANCE"
  ) {
    return "0x";
  }

  const digest = buildClaimProofDigest({
    badgeRegistryAddress,
    definitionId,
    agent
  });

  if (
    config.unlockAdapterType === "ORACLE_EVENT" ||
    config.unlockAdapterType === "FARCASTER_ACCOUNT" ||
    isReusableOracleAdapter(config.unlockAdapterType) ||
    config.unlockAdapterType === "X402_HISTORY" ||
    config.unlockAdapterType === "PAYMENT_HISTORY"
  ) {
    if (
      (
        config.unlockAdapterType === "FARCASTER_ACCOUNT" ||
        isReusableOracleAdapter(config.unlockAdapterType) ||
        config.unlockAdapterType === "X402_HISTORY" ||
        config.unlockAdapterType === "PAYMENT_HISTORY"
      ) &&
      !isOracle8183PolicyEnabled(advancedPolicyConfig)
    ) {
      throw new Error(
        config.unlockAdapterType === "FARCASTER_ACCOUNT"
          ? "Farcaster badges require the optional ORACLE_8183 advanced policy to stay criteria-bound."
          : isReusableOracleAdapter(config.unlockAdapterType)
            ? "Reusable oracle badges require the optional ORACLE_8183 advanced policy to stay criteria-bound."
          : "Payment-history badges require the optional ORACLE_8183 advanced policy to stay criteria-bound."
      );
    }

    if (isOracle8183PolicyEnabled(advancedPolicyConfig)) {
      const requiredIssuer = normalizeAddress(
        advancedPolicyConfig.requiredIssuer || config.unlockSignerAddress
      );
      const requiredContextId = normalizeBytes32(advancedPolicyConfig.contextId);
      const requiredSchemaId = normalizeBytes32(advancedPolicyConfig.schemaId);
      const requiredChainId = normalizeChainId(chainId);
      if (!requiredIssuer) {
        throw new Error("The advanced 8183 badge policy requires an oracle issuer.");
      }
      if (!requiredContextId) {
        throw new Error("The advanced 8183 badge policy requires a context id.");
      }
      if (!requiredSchemaId) {
        throw new Error("The advanced 8183 badge policy requires a schema id.");
      }
      if (!requiredChainId) {
        throw new Error("The advanced 8183 badge policy requires a chain id.");
      }

      let proofPackageRaw = providedProof?.trim?.() ?? "";
      if (
        !proofPackageRaw &&
        config.unlockAdapterType === "FARCASTER_ACCOUNT"
      ) {
        const proofResponse = await requestFarcasterProof({
          serviceUrl: farcasterServiceUrl,
          badgeRegistryAddress,
          chainId: requiredChainId,
          definitionId,
          agent
        });
        proofPackageRaw = JSON.stringify(proofResponse.proofPackage);
      }
      if (!proofPackageRaw && isReusableOracleAdapter(config.unlockAdapterType)) {
        const parsedCriteria = config.oracleCriteriaJson
          ? JSON.parse(config.oracleCriteriaJson)
          : {};
        const criteria = normalizeReusableOracleCriteria(
          config.unlockAdapterType,
          {
            ...parsedCriteria,
            note: parsedCriteria.note ?? config.unlockNote
          }
        );
        const criteriaHash =
          normalizeBytes32(config.oracleCriteriaHash) ||
          buildReusableOracleCriteriaHash(config.unlockAdapterType, criteria);
        const linkedWallets =
          config.unlockAdapterType === "INTERNAL_SERVICE_ACTIVITY" &&
          normalizeAddress(paymentAccount) &&
          normalizeAddress(paymentAccount) !== normalizeAddress(account)
            ? [
                {
                  label: "MPP payer wallet",
                  account: paymentAccount,
                  walletAddress: paymentAccount,
                  walletClient: paymentWalletClient
                }
              ]
            : [];
        const proofResponse = await requestOracleCriteriaProof({
          serviceUrl: oracleServiceUrl,
          badgeRegistryAddress,
          chainId: requiredChainId,
          definitionId,
          agent,
          criteriaHash,
          account,
          walletClient,
          linkedWallets
        });
        proofPackageRaw = JSON.stringify(proofResponse.proofPackage);
      }
      if (
        !proofPackageRaw &&
        (config.unlockAdapterType === "X402_HISTORY" ||
          config.unlockAdapterType === "PAYMENT_HISTORY")
      ) {
        const criteria =
          config.unlockAdapterType === "PAYMENT_HISTORY"
            ? normalizePaymentCriteria({
                metric: config.unlockMetric,
                threshold: config.unlockThreshold,
                origins: config.unlockOrigins,
                windowDays: config.unlockWindowDays,
                identityMode: config.unlockIdentityMode,
                railMode: config.unlockRailMode,
                note: config.unlockNote
              })
            : normalizeX402Criteria({
                metric: config.unlockMetric,
                threshold: config.unlockThreshold,
                origins: config.unlockOrigins,
                windowDays: config.unlockWindowDays,
                identityMode: config.unlockIdentityMode,
                note: config.unlockNote
              });
        const criteriaHash =
          config.unlockAdapterType === "PAYMENT_HISTORY"
            ? normalizeBytes32(config.paymentCriteriaHash) || buildPaymentCriteriaHash(criteria)
            : normalizeBytes32(config.x402CriteriaHash) || buildX402CriteriaHash(criteria);
        const linkedWallets =
          config.unlockAdapterType === "PAYMENT_HISTORY" &&
          normalizeAddress(paymentAccount) &&
          normalizeAddress(paymentAccount) !== normalizeAddress(account)
            ? [
                {
                  label: "MPP payer wallet",
                  account: paymentAccount,
                  walletAddress: paymentAccount,
                  walletClient: paymentWalletClient
                }
              ]
            : [];
        const proofResponse = await requestPaymentHistoryProof({
          serviceUrl: x402ServiceUrl,
          badgeRegistryAddress,
          chainId: requiredChainId,
          definitionId,
          agent,
          criteriaHash,
          account,
          walletClient,
          linkedWallets
        });
        proofPackageRaw = JSON.stringify(proofResponse.proofPackage);
      }

      if (proofPackageRaw) {
        const proofPackage = parseOracleEventProofPackage(proofPackageRaw);
        await validateOracle8183ProofPackage({
          proofPackage,
          badgeRegistryAddress,
          chainId: requiredChainId,
          definitionId,
          agent,
          requiredIssuer,
          requiredContextId,
          requiredSchemaId,
          label:
            config.unlockAdapterType === "FARCASTER_ACCOUNT"
              ? "Farcaster proof package"
              : isReusableOracleAdapter(config.unlockAdapterType)
                ? "oracle proof package"
              :
            config.unlockAdapterType === "PAYMENT_HISTORY"
              ? "payment history proof package"
              : config.unlockAdapterType === "X402_HISTORY"
                ? "x402 history proof package"
                : "attendance proof package"
        });
        return encode8183ProofPackageCalldata(proofPackage);
      }

      if (config.unlockAdapterType === "FARCASTER_ACCOUNT") {
        throw new Error(
          "This badge requires a configured Farcaster proof service and a Farcaster Quick Auth session."
        );
      }

      if (isReusableOracleAdapter(config.unlockAdapterType)) {
        throw new Error(
          "This badge requires a configured oracle proof service or a pasted 8183 oracle proof package."
        );
      }

      if (config.unlockAdapterType === "PAYMENT_HISTORY") {
        throw new Error(
          "This badge requires a configured payment proof service or a pasted 8183 payment proof package."
        );
      }

      if (config.unlockAdapterType === "X402_HISTORY") {
        throw new Error(
          "This badge requires a configured x402 proof service or a pasted 8183 x402 proof package."
        );
      }

      if (normalizeAddress(requiredIssuer) !== normalizeAddress(account)) {
        throw new Error(
          `This badge expects issuer ${requiredIssuer}. Connect that signer wallet or paste a matching 8183 proof package.`
        );
      }

      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + DEFAULT_ORACLE_EVENT_PROOF_TTL;
      const nonce = randomBytes32Hex();
      const signature = await walletClient.signMessage({
        account,
        message: {
          raw: buildOracle8183ProofDigest({
            badgeRegistryAddress,
            chainId: requiredChainId,
            schemaId: requiredSchemaId,
            definitionId,
            agent,
            contextId: requiredContextId,
            nonce,
            issuedAt,
            expiresAt
          })
        }
      });
      return encode8183ProofPackageCalldata({
        kind: ORACLE_8183_PROOF_KIND,
        badgeRegistryAddress,
        chainId: requiredChainId,
        definitionId: Number(definitionId),
        agent,
        signerAddress: account,
        schemaId: requiredSchemaId,
        contextId: requiredContextId,
        contextLabel:
          config.unlockAdapterType === "FARCASTER_ACCOUNT"
            ? buildFarcasterContextLabel({
                note: config.unlockNote
              })
            : isReusableOracleAdapter(config.unlockAdapterType)
              ? buildReusableOracleContextLabel(
                  config.unlockAdapterType,
                  config.oracleCriteriaJson ? JSON.parse(config.oracleCriteriaJson) : {}
                )
            :
          config.unlockAdapterType === "PAYMENT_HISTORY"
            ? buildPaymentContextLabel({
                metric: config.unlockMetric,
                threshold: config.unlockThreshold,
                origins: config.unlockOrigins,
                windowDays: config.unlockWindowDays,
                identityMode: config.unlockIdentityMode,
                railMode: config.unlockRailMode
              })
            : config.unlockAdapterType === "X402_HISTORY"
            ? buildX402ContextLabel({
                metric: config.unlockMetric,
                threshold: config.unlockThreshold,
                origins: config.unlockOrigins,
                windowDays: config.unlockWindowDays,
                identityMode: config.unlockIdentityMode
              })
            : "",
        nonce,
        note: "",
        issuedAt,
        expiresAt,
        signature
      });
    }

    if (providedProof?.trim?.()) {
      const proofPackage = parseOracleEventProofPackage(providedProof);
      if (normalizeAddress(proofPackage.badgeRegistryAddress) !== normalizeAddress(badgeRegistryAddress)) {
        throw new Error("The attendance proof package targets a different badge registry.");
      }
      if (Number(proofPackage.definitionId) !== Number(definitionId)) {
        throw new Error("The attendance proof package targets a different badge.");
      }
      if (normalizeAddress(proofPackage.agent) !== normalizeAddress(agent)) {
        throw new Error("The attendance proof package targets a different agent.");
      }
      if (normalizeAddress(proofPackage.signerAddress) !== normalizeAddress(config.unlockSignerAddress)) {
        throw new Error(
          `This badge expects signer ${config.unlockSignerAddress || "unset"}, but the proof was signed by ${proofPackage.signerAddress || "unset"}.`
        );
      }

      const now = Math.floor(Date.now() / 1000);
      const usesExpiringDigest = proofPackage.kind === ORACLE_EVENT_PROOF_KIND;
      if (usesExpiringDigest && proofPackage.expiresAt < now) {
        throw new Error("The attendance proof package has expired. Load a fresh proof package.");
      }

      const recoveredSigner = await recoverMessageAddress({
        message: {
          raw: usesExpiringDigest
            ? buildExpiringClaimProofDigest({
                badgeRegistryAddress,
                definitionId,
                agent,
                issuedAt: proofPackage.issuedAt,
                expiresAt: proofPackage.expiresAt
              })
            : digest
        },
        signature: proofPackage.signature
      });
      if (normalizeAddress(recoveredSigner) !== normalizeAddress(proofPackage.signerAddress)) {
        throw new Error("The attendance proof signature could not be verified.");
      }

      const { r, s, v } = parseSignature(proofPackage.signature);
      return usesExpiringDigest
        ? encodeAbiParameters(
            [
              { type: "uint64" },
              { type: "uint64" },
              { type: "bytes32" },
              { type: "bytes32" },
              { type: "uint8" }
            ],
            [proofPackage.issuedAt, proofPackage.expiresAt, r, s, v]
          )
        : encodeAbiParameters(
            [
              { type: "bytes32" },
              { type: "bytes32" },
              { type: "uint8" }
            ],
            [r, s, v]
          );
    }

    if (normalizeAddress(config.unlockSignerAddress) !== normalizeAddress(account)) {
      throw new Error(
        `This badge expects signer ${config.unlockSignerAddress || "unset"}. Connect that signer wallet or paste a matching attendance proof package.`
      );
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + DEFAULT_ORACLE_EVENT_PROOF_TTL;
    const signature = await walletClient.signMessage({
      account,
      message: {
        raw: buildExpiringClaimProofDigest({
          badgeRegistryAddress,
          definitionId,
          agent,
          issuedAt,
          expiresAt
        })
      }
    });
    const { r, s, v } = parseSignature(signature);
    return encodeAbiParameters(
      [
        { type: "uint64" },
        { type: "uint64" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint8" }
      ],
      [issuedAt, expiresAt, r, s, v]
    );
  }

  if (config.unlockAdapterType === "AGENT_REP") {
    if (isAgent8183PolicyEnabled(advancedPolicyConfig)) {
      const requiredIssuer = normalizeAddress(advancedPolicyConfig.requiredIssuer);
      const requiredContextId = normalizeBytes32(advancedPolicyConfig.contextId);
      const requiredSchemaId = normalizeBytes32(advancedPolicyConfig.schemaId);
      const requiredChainId = normalizeChainId(chainId);
      if (!requiredContextId) {
        throw new Error("The advanced agent 8183 badge policy requires a context id.");
      }
      if (!requiredSchemaId) {
        throw new Error("The advanced agent 8183 badge policy requires a schema id.");
      }
      if (!requiredChainId) {
        throw new Error("The advanced agent 8183 badge policy requires a chain id.");
      }

      if (providedProof?.trim?.()) {
        const proofPackage = parseAgentAttestationProofPackage(providedProof);
        if (normalizeAddress(proofPackage.badgeRegistryAddress) !== normalizeAddress(badgeRegistryAddress)) {
          throw new Error("The agent proof package targets a different badge registry.");
        }
        if (Number(proofPackage.definitionId) !== Number(definitionId)) {
          throw new Error("The agent proof package targets a different badge.");
        }
        if (normalizeAddress(proofPackage.agent) !== normalizeAddress(agent)) {
          throw new Error("The agent proof package targets a different agent.");
        }
        if (requiredIssuer && normalizeAddress(proofPackage.signerAddress) !== requiredIssuer) {
          throw new Error(
            `This badge expects issuer ${requiredIssuer}, but the proof was signed by ${proofPackage.signerAddress || "unset"}.`
          );
        }
        if (proofPackage.contextId !== requiredContextId) {
          throw new Error(
            `This badge expects context ${requiredContextId}, but the proof used ${proofPackage.contextId || "unset"}.`
          );
        }
        if (proofPackage.schemaId !== requiredSchemaId) {
          throw new Error(
            `This badge expects schema ${requiredSchemaId}, but the proof used ${proofPackage.schemaId || "unset"}.`
          );
        }
        if (Number(proofPackage.chainId) !== requiredChainId) {
          throw new Error(
            `This badge expects chain ${requiredChainId}, but the proof targeted ${proofPackage.chainId || "unset"}.`
          );
        }
        if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
          throw new Error("The agent attestation proof package has expired. Load a fresh proof package.");
        }

        const recoveredSigner = await recoverMessageAddress({
          message: {
            raw: buildAgent8183ProofDigest({
              badgeRegistryAddress,
              chainId: proofPackage.chainId,
              schemaId: proofPackage.schemaId,
              definitionId,
              agent,
              contextId: proofPackage.contextId,
              nonce: proofPackage.nonce,
              issuedAt: proofPackage.issuedAt,
              expiresAt: proofPackage.expiresAt
            })
          },
          signature: proofPackage.signature
        });
        if (normalizeAddress(recoveredSigner) !== normalizeAddress(proofPackage.signerAddress)) {
          throw new Error("The 8183 agent attestation proof signature could not be verified.");
        }

        const { r, s, v } = parseSignature(proofPackage.signature);
        return encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "uint64" },
            { type: "uint64" },
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "uint8" }
          ],
          [
            proofPackage.contextId,
            proofPackage.nonce,
            proofPackage.issuedAt,
            proofPackage.expiresAt,
            r,
            s,
            v
          ]
        );
      }

      if (requiredIssuer && normalizeAddress(requiredIssuer) !== normalizeAddress(account)) {
        throw new Error(
          `This badge expects issuer ${requiredIssuer}. Connect that signer wallet or paste a matching 8183 agent proof package.`
        );
      }

      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + DEFAULT_ORACLE_EVENT_PROOF_TTL;
      const nonce = randomBytes32Hex();
      const signature = await walletClient.signMessage({
        account,
        message: {
          raw: buildAgent8183ProofDigest({
            badgeRegistryAddress,
            chainId: requiredChainId,
            schemaId: requiredSchemaId,
            definitionId,
            agent,
            contextId: requiredContextId,
            nonce,
            issuedAt,
            expiresAt
          })
        }
      });
      const { r, s, v } = parseSignature(signature);
      return encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint64" },
          { type: "uint64" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint8" }
        ],
        [requiredContextId, nonce, issuedAt, expiresAt, r, s, v]
      );
    }

    const signature = await walletClient.signMessage({
      account,
      message: {
        raw: digest
      }
    });
    const { r, s, v } = parseSignature(signature);
    return encodeAbiParameters(
      [
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint8" }
      ],
      [account, r, s, v]
    );
  }

  return "0x";
}

function randomBytes32Hex() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeBytes32(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed : "";
}

function normalizeAddress(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function normalizeHex(value) {
  const trimmed = value?.trim?.() ?? "";
  if (!trimmed) {
    return "0x";
  }

  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function normalizeChainId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}
