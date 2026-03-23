import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  stringToHex,
  zeroAddress
} from "viem";
import {
  DEFAULT_PAYMENT_8183_SCHEMA,
  DEFAULT_X402_8183_SCHEMA
} from "./x402History.js";
import {
  DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA,
  DEFAULT_PORTFOLIO_STATE_8183_SCHEMA,
  DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA,
  DEFAULT_WALLET_AGE_8183_SCHEMA
} from "./oracleCriteria.js";

export const DEFAULT_ORACLE_8183_SCHEMA = "agentic-poap.oracle-event.v1";
export const DEFAULT_AGENT_8183_SCHEMA = "agentic-poap.agent-attestation.v1";
export const DEFAULT_FARCASTER_8183_SCHEMA = "agentic-poap.farcaster-account.v1";
export {
  DEFAULT_PAYMENT_8183_SCHEMA,
  DEFAULT_X402_8183_SCHEMA
} from "./x402History.js";
export {
  DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA,
  DEFAULT_PORTFOLIO_STATE_8183_SCHEMA,
  DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA,
  DEFAULT_WALLET_AGE_8183_SCHEMA
} from "./oracleCriteria.js";
export const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const ZERO_SELECTOR = "0x00000000";

const POLICY_RULE_ENUMS = {
  NONE: 0,
  ONCHAIN_STATE: 1,
  MERKLE: 2,
  ORACLE_8183: 3,
  AGENT_8183: 4
};

const POLICY_RULE_NAMES = Object.fromEntries(
  Object.entries(POLICY_RULE_ENUMS).map(([name, value]) => [value, name])
);

const NONCE_SCOPE_ENUMS = {
  NONE: 0,
  GLOBAL: 1,
  PER_ISSUER: 2,
  PER_SUBJECT: 3
};

const NONCE_SCOPE_NAMES = Object.fromEntries(
  Object.entries(NONCE_SCOPE_ENUMS).map(([name, value]) => [value, name])
);

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

export function advancedPolicyDefaults({
  requiredIssuer = "",
  ruleKind = "ORACLE_8183",
  schemaInput = ""
} = {}) {
  const normalizedRuleKind = normalizeRuleKind(ruleKind);
  const defaultSchema =
    schemaInput ||
    (normalizedRuleKind === "AGENT_8183"
      ? DEFAULT_AGENT_8183_SCHEMA
      : DEFAULT_ORACLE_8183_SCHEMA);
  return {
    enabled: false,
    ruleKind: normalizedRuleKind === "NONE" ? "ORACLE_8183" : normalizedRuleKind,
    schemaInput: defaultSchema,
    schemaId: hashPolicyText(defaultSchema),
    contextInput: "",
    contextId: "",
    requiredIssuer: normalizeAddress(requiredIssuer),
    minIssuerReputation: "0",
    maxAge: "0",
    requireExpiry: true,
    nonceScope: "GLOBAL"
  };
}

export function normalizeAdvancedPolicyConfig(raw = {}, { requiredIssuer = "", ruleKind = "ORACLE_8183" } = {}) {
  const defaults = advancedPolicyDefaults({
    requiredIssuer,
    ruleKind,
    schemaInput: raw.schemaInput
  });
  const normalizedRuleKind = normalizeRuleKind(raw.ruleKind ?? defaults.ruleKind);
  const normalizedNonceScope = normalizeNonceScope(raw.nonceScope ?? defaults.nonceScope);
  const normalizedSchema = normalizeBytes32(raw.schemaId) || hashPolicyText(raw.schemaInput) || defaults.schemaId;
  const normalizedContextId =
    normalizeBytes32(raw.contextId) || hashPolicyText(raw.contextInput) || "";

  return {
    enabled: Boolean(raw.enabled) && normalizedRuleKind !== "NONE",
    ruleKind: normalizedRuleKind,
    schemaInput:
      raw.schemaInput?.trim?.() ?? (normalizeBytes32(raw.schemaId) ? raw.schemaId : defaults.schemaInput),
    schemaId: normalizedSchema,
    contextInput:
      raw.contextInput?.trim?.() ?? (normalizeBytes32(raw.contextId) ? raw.contextId : ""),
    contextId: normalizedContextId,
    requiredIssuer: normalizeAddress(raw.requiredIssuer) || defaults.requiredIssuer,
    minIssuerReputation:
      String(raw.minIssuerReputation ?? defaults.minIssuerReputation).trim() || defaults.minIssuerReputation,
    maxAge: String(raw.maxAge ?? defaults.maxAge).trim() || defaults.maxAge,
    requireExpiry: raw.requireExpiry ?? defaults.requireExpiry,
    nonceScope: normalizedNonceScope
  };
}

export function buildAdvancedPolicyPayload(input = {}) {
  const inferredRuleKind =
    input.unlockAdapterType === "AGENT_REP"
        ? "AGENT_8183"
        : input.unlockAdapterType === "ORACLE_EVENT" ||
          input.unlockAdapterType === "FARCASTER_ACCOUNT" ||
          input.unlockAdapterType === "WALLET_AGE_ACTIVITY" ||
          input.unlockAdapterType === "PROTOCOL_ACTIVITY" ||
          input.unlockAdapterType === "PORTFOLIO_STATE" ||
          input.unlockAdapterType === "INTERNAL_SERVICE_ACTIVITY" ||
          input.unlockAdapterType === "X402_HISTORY" ||
          input.unlockAdapterType === "PAYMENT_HISTORY"
        ? "ORACLE_8183"
        : "NONE";
  const defaultSchemaInput =
    input.unlockAdapterType === "FARCASTER_ACCOUNT"
      ? DEFAULT_FARCASTER_8183_SCHEMA
      : input.unlockAdapterType === "WALLET_AGE_ACTIVITY"
        ? DEFAULT_WALLET_AGE_8183_SCHEMA
      : input.unlockAdapterType === "PROTOCOL_ACTIVITY"
        ? DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA
      : input.unlockAdapterType === "PORTFOLIO_STATE"
        ? DEFAULT_PORTFOLIO_STATE_8183_SCHEMA
      : input.unlockAdapterType === "INTERNAL_SERVICE_ACTIVITY"
        ? DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA
      :
    input.unlockAdapterType === "PAYMENT_HISTORY"
      ? DEFAULT_PAYMENT_8183_SCHEMA
      : input.unlockAdapterType === "X402_HISTORY"
      ? DEFAULT_X402_8183_SCHEMA
      : inferredRuleKind === "AGENT_8183"
        ? DEFAULT_AGENT_8183_SCHEMA
        : DEFAULT_ORACLE_8183_SCHEMA;
  const rawConfig = {
    ...(input.advancedPolicyConfig ?? {}),
    enabled: input.advancedPolicyEnabled ?? input.advancedPolicyConfig?.enabled ?? false,
    ruleKind:
      input.advancedPolicyRuleKind ??
      input.advancedPolicyConfig?.ruleKind ??
      inferredRuleKind,
    requiredIssuer:
      input.advancedPolicyRequiredIssuer ??
      input.advancedPolicyConfig?.requiredIssuer ??
      input.unlockSignerAddress ??
      "",
    contextInput:
      input.advancedPolicyContext ??
      input.advancedPolicyConfig?.contextInput ??
      input.advancedPolicyConfig?.contextId ??
      "",
    schemaInput:
      input.advancedPolicySchema ??
      input.advancedPolicyConfig?.schemaInput ??
      input.advancedPolicyConfig?.schemaId ??
      defaultSchemaInput,
    maxAge:
      input.advancedPolicyMaxAge ??
      input.advancedPolicyConfig?.maxAge ??
      "0",
    minIssuerReputation:
      input.advancedPolicyMinIssuerReputation ??
      input.advancedPolicyConfig?.minIssuerReputation ??
      input.unlockThreshold ??
      "0",
   requireExpiry:
      input.advancedPolicyRequireExpiry ??
      input.advancedPolicyConfig?.requireExpiry ??
      true,
    nonceScope:
      input.advancedPolicyNonceScope ??
      input.advancedPolicyConfig?.nonceScope ??
      "GLOBAL"
  };

  const config = normalizeAdvancedPolicyConfig(rawConfig, {
    requiredIssuer: input.unlockSignerAddress,
    ruleKind: inferredRuleKind
  });

  if (
    config.ruleKind === "AGENT_8183" &&
    (config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA || config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA))
  ) {
    config.schemaInput = DEFAULT_AGENT_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_AGENT_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "FARCASTER_ACCOUNT" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_FARCASTER_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_FARCASTER_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "PAYMENT_HISTORY" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_PAYMENT_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_PAYMENT_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "WALLET_AGE_ACTIVITY" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_WALLET_AGE_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_WALLET_AGE_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "PROTOCOL_ACTIVITY" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "PORTFOLIO_STATE" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_PORTFOLIO_STATE_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_PORTFOLIO_STATE_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "INTERNAL_SERVICE_ACTIVITY" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA);
  }
  if (
    config.ruleKind === "ORACLE_8183" &&
    input.unlockAdapterType === "X402_HISTORY" &&
    (
      config.schemaInput === DEFAULT_ORACLE_8183_SCHEMA ||
      config.schemaId === hashPolicyText(DEFAULT_ORACLE_8183_SCHEMA)
    )
  ) {
    config.schemaInput = DEFAULT_X402_8183_SCHEMA;
    config.schemaId = hashPolicyText(DEFAULT_X402_8183_SCHEMA);
  }

  if (!config.enabled) {
    return {
      advancedPolicy: "0x",
      advancedPolicyConfig: config
    };
  }

  if (config.ruleKind === "ORACLE_8183") {
    if (
      input.unlockAdapterType &&
      input.unlockAdapterType !== "ORACLE_EVENT" &&
      input.unlockAdapterType !== "FARCASTER_ACCOUNT" &&
      input.unlockAdapterType !== "WALLET_AGE_ACTIVITY" &&
      input.unlockAdapterType !== "PROTOCOL_ACTIVITY" &&
      input.unlockAdapterType !== "PORTFOLIO_STATE" &&
      input.unlockAdapterType !== "INTERNAL_SERVICE_ACTIVITY" &&
      input.unlockAdapterType !== "X402_HISTORY" &&
      input.unlockAdapterType !== "PAYMENT_HISTORY"
    ) {
      throw new Error("Advanced criteria require an oracle-backed unlock method for ORACLE_8183.");
    }
    if (!config.requiredIssuer) {
      throw new Error("Advanced oracle criteria require an issuer address.");
    }
    if (!config.contextId) {
      throw new Error("Advanced oracle criteria require an event context or context hash.");
    }
  } else if (config.ruleKind === "AGENT_8183") {
    if (input.unlockAdapterType && input.unlockAdapterType !== "AGENT_REP") {
      throw new Error("Advanced criteria require the Agent Reputation unlock method for AGENT_8183.");
    }
    if (!config.contextId) {
      throw new Error("Advanced agent criteria require an attestation context or context hash.");
    }
  } else {
    throw new Error("Only ORACLE_8183 and AGENT_8183 advanced criteria are implemented right now.");
  }

  return {
    advancedPolicy: encodeAbiParameters(BADGE_POLICY_PARAMETER, [
      {
        ruleKind: POLICY_RULE_ENUMS[config.ruleKind],
        identity: {
          requireRegisteredAgent: false,
          requirePrimaryWallet: false,
          uniquePerAgent: false,
          minSubjectReputation: 0n,
          minIssuerReputation:
            config.ruleKind === "AGENT_8183"
              ? BigInt(Math.max(0, Number(config.minIssuerReputation) || 0))
              : 0n
        },
        evidence: {
          schemaId: config.schemaId || ZERO_BYTES32,
          contextId: config.contextId,
          requiredIssuer: config.requiredIssuer || zeroAddress,
          maxAge: BigInt(Math.max(0, Number(config.maxAge) || 0)),
          requireExpiry: Boolean(config.requireExpiry),
          nonceScope: NONCE_SCOPE_ENUMS[config.nonceScope] ?? NONCE_SCOPE_ENUMS.GLOBAL
        },
        scarcity: {
          startsAt: 0n,
          endsAt: 0n,
          maxClaims: 0
        },
        onchain: {
          target: zeroAddress,
          selector: ZERO_SELECTOR,
          threshold: 0n
        },
        merkleRoot: ZERO_BYTES32
      }
    ]),
    advancedPolicyConfig: config
  };
}

export function decodeAdvancedPolicyConfig(advancedPolicy, { requiredIssuer = "" } = {}) {
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

export function summarizeAdvancedPolicy(definitionLike = {}) {
  const config =
    definitionLike.advancedPolicyConfig ??
    decodeAdvancedPolicyConfig(definitionLike.advancedPolicy, {
      requiredIssuer: definitionLike.unlockAdapterConfig?.unlockSignerAddress
    });

  if (!config.enabled || config.ruleKind === "NONE") {
    return null;
  }

  return {
    title:
      config.ruleKind === "AGENT_8183"
        ? "8183 Agent Evidence Policy"
        : "8183 Event Evidence Policy",
    detailLines: [
      `Issuer: ${config.requiredIssuer || "unset"}`,
      Number(config.minIssuerReputation || 0) > 0
        ? `Minimum issuer reputation: ${config.minIssuerReputation}`
        : "Minimum issuer reputation: adapter threshold",
      `Context: ${config.contextId || "unset"}`,
      `Schema: ${config.schemaId || ZERO_BYTES32}`,
      `Expiry required: ${config.requireExpiry ? "Yes" : "No"}`,
      `Nonce scope: ${config.nonceScope}`,
      Number(config.maxAge || 0) > 0 ? `Max age: ${config.maxAge}s` : "Max age: none"
    ]
  };
}

export function isOracle8183PolicyEnabled(config = {}) {
  return Boolean(config?.enabled) && normalizeRuleKind(config.ruleKind) === "ORACLE_8183";
}

export function isAgent8183PolicyEnabled(config = {}) {
  return Boolean(config?.enabled) && normalizeRuleKind(config.ruleKind) === "AGENT_8183";
}

export function hashPolicyText(value) {
  const trimmed = value?.trim?.() ?? "";
  if (!trimmed) {
    return "";
  }
  return normalizeBytes32(trimmed) || keccak256(stringToHex(trimmed));
}

function normalizeRuleKind(value) {
  const candidate = String(value ?? "").trim().toUpperCase();
  return Object.hasOwn(POLICY_RULE_ENUMS, candidate) ? candidate : "NONE";
}

function normalizeNonceScope(value) {
  const candidate = String(value ?? "").trim().toUpperCase();
  return Object.hasOwn(NONCE_SCOPE_ENUMS, candidate) ? candidate : "GLOBAL";
}

function normalizeAddress(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function normalizeBytes32(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed) ? trimmed : "";
}

function normalizeHex(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]*$/.test(trimmed) ? trimmed : "0x";
}
