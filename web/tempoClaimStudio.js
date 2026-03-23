import {
  buildUnlockAdapterPayload,
  decodeUnlockAdapterConfig,
  unlockAdapterDefaults
} from "./unlockAdapters.js";
import {
  advancedPolicyDefaults,
  buildAdvancedPolicyPayload,
  decodeAdvancedPolicyConfig
} from "./badgePolicies.js";
import {
  BADGE_CATALOG,
  SAMPLE_PIN_OPTIONS,
  buildCatalogDefinitions,
  getPinAsset
} from "./badgeCatalog.js";

export { SAMPLE_PIN_OPTIONS } from "./badgeCatalog.js";

const STORAGE_KEY = "agentic-poap-registry-v4";
const STATE_VERSION = 4;

export const BADGE_TYPE_OPTIONS = [
  { value: "EVENT", label: "Event" },
  { value: "ACHIEVEMENT", label: "Achievement" },
  { value: "CUSTOM", label: "Custom" }
];

export const VERIFICATION_TYPE_OPTIONS = [
  { value: "ONCHAIN_STATE", label: "Onchain State" },
  { value: "MERKLE_PROOF", label: "Merkle Proof" },
  { value: "ORACLE_ATTESTATION", label: "Oracle Attestation" },
  { value: "AGENT_ATTESTATION", label: "Agent Attestation" }
];

export const DEFAULT_CREATOR = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1";
export const DEFAULT_AGENT = "0x1234567890abcdef1234567890abcdef12345678";

export function createEmptyRegistryState() {
  return {
    version: STATE_VERSION,
    nextDefinitionId: 1,
    nextClaimId: 1,
    definitions: [],
    claims: []
  };
}

export function badgeTypeLabel(value) {
  return findOptionLabel(BADGE_TYPE_OPTIONS, value, "Custom");
}

export function verificationTypeLabel(value) {
  return findOptionLabel(VERIFICATION_TYPE_OPTIONS, value, "Custom");
}

export function shortAddress(value) {
  if (!value || value.length < 12) {
    return value || "";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function clearRegistryState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function saveRegistryState(state) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadRegistryState() {
  if (typeof window === "undefined") {
    return createEmptyRegistryState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyRegistryState();
    }

    return normalizeRegistryState(JSON.parse(raw));
  } catch (error) {
    console.error("Could not load registry state", error);
    return createEmptyRegistryState();
  }
}

export async function ensureSeedRegistryState({ sampleClaimUrl }) {
  const existingState = loadRegistryState();
  if (existingState.definitions.length > 0 || existingState.claims.length > 0) {
    return existingState;
  }

  try {
    const response = await fetch(sampleClaimUrl);
    if (!response.ok) {
      throw new Error(`Seed claim request failed with ${response.status}`);
    }

    const claim = await response.json();
    const seededState = await createSeedState(claim);
    saveRegistryState(seededState);
    return seededState;
  } catch (error) {
    console.warn("Could not seed registry state", error);
    return existingState;
  }
}

export function definitionInputDefaults(samplePinId = "pin1") {
  const trailblazer =
    buildCatalogDefinitions().find((entry) => entry.slug === "trailblazer") ??
    buildCatalogDefinitions()[0];
  const sampleAsset = {
    ...(trailblazer?.asset ?? getPinAsset(samplePinId)),
    ...getPinAsset(samplePinId)
  };
  const unlockDefaults = unlockAdapterDefaults("MANUAL_ATTESTOR");

  return {
    name: trailblazer?.name ?? "Trailblazer",
    description: trailblazer?.description ?? "Awarded to early agent contributors and first-wave builders.",
    creator: DEFAULT_CREATOR,
    badgeType: trailblazer?.badgeType ?? "ACHIEVEMENT",
    verificationType: trailblazer?.verificationType ?? "ONCHAIN_STATE",
    advancedPolicyEnabled: false,
    advancedPolicyConfig: advancedPolicyDefaults(),
    ...unlockDefaults,
    maxClaims: 0,
    ...sampleAsset
  };
}

export function assetDraftFromVideoSource(videoSource = {}) {
  return sanitizeAssetDraft(videoSource);
}

export function assetDraftFromClaim(claim) {
  const properties = claim.properties ?? {};
  const videoAsset =
    claim.assets?.find?.(
      (entry) => entry.mimeType === "video/mp4" || entry.mime_type === "video/mp4"
    ) ?? null;

  return sanitizeAssetDraft({
    assetId: Number(properties.asset_id ?? properties.assetId ?? 0) || 0,
    videoUri:
      videoAsset?.uri ??
      properties.video_uri ??
      properties.videoUri ??
      claim.animation_url ??
      claim.animationUrl ??
      "",
    posterUri: claim.image ?? "",
    detailUri:
      properties.detail_uri ??
      properties.detailUri ??
      claim.external_url ??
      claim.externalUrl ??
      "",
    edition: properties.edition ?? properties.finish ?? "",
    loopSeconds: Number(properties.loop_seconds ?? properties.loopSeconds ?? 0) || 0,
    videoHash: properties.video_hash ?? properties.videoHash ?? "",
    posterHash: properties.poster_hash ?? properties.posterHash ?? ""
  });
}

export function createDefinition(state, input) {
  const nextState = normalizeRegistryState(state);
  const name = input.name?.trim();
  const description = input.description?.trim() ?? "";
  const creator = normalizeAddress(input.creator) || DEFAULT_CREATOR;
  const badgeType = normalizeEnumValue(input.badgeType, BADGE_TYPE_OPTIONS, "ACHIEVEMENT");
  const verificationType = normalizeEnumValue(
    input.verificationType,
    VERIFICATION_TYPE_OPTIONS,
    "ONCHAIN_STATE"
  );
  const maxClaims = toNumber(input.maxClaims);
  const asset = sanitizeAssetDraft(input);
  const unlockPayload = buildUnlockAdapterPayload(input);
  const advancedPolicyPayload = buildAdvancedPolicyPayload({
    ...input,
    unlockSignerAddress: unlockPayload.unlockAdapterConfig?.unlockSignerAddress,
    unlockAdapterType: unlockPayload.unlockAdapterType
  });

  if (!name) {
    throw new Error("Badge name is required.");
  }

  if (!asset.videoUri) {
    throw new Error("Provide a looping video URI before defining a badge.");
  }

  const definition = {
    id: nextState.nextDefinitionId,
    name,
    description,
    creator,
    badgeType,
    verificationType: unlockPayload.verificationType || verificationType,
    verificationData: unlockPayload.verificationData,
    unlockAdapterConfig: unlockPayload.unlockAdapterConfig,
    advancedPolicy: advancedPolicyPayload.advancedPolicy,
    advancedPolicyConfig: advancedPolicyPayload.advancedPolicyConfig,
    maxClaims,
    claimCount: 0,
    active: true,
    createdAt: Math.floor(Date.now() / 1000),
    asset
  };

  nextState.nextDefinitionId += 1;
  nextState.definitions = [definition, ...nextState.definitions];
  return {
    state: nextState,
    definition
  };
}

export async function issueClaim(state, input) {
  const nextState = normalizeRegistryState(state);
  const definitionId = toNumber(input.definitionId);
  const agent = normalizeAddress(input.agent);
  const proofNote = input.proofNote?.trim() ?? "";
  const issuedBy = normalizeAddress(input.issuedBy) || DEFAULT_CREATOR;
  const definition = nextState.definitions.find((entry) => entry.id === definitionId);

  if (!definition) {
    throw new Error("Choose a badge definition before issuing a claim.");
  }

  if (!agent) {
    throw new Error("Enter a valid 0x agent address.");
  }

  if (!definition.active) {
    throw new Error("That badge definition is inactive.");
  }

  if (
    nextState.claims.some(
      (entry) =>
        entry.definitionId === definitionId && entry.agent.toLowerCase() === agent.toLowerCase()
    )
  ) {
    throw new Error("That agent already has this badge.");
  }

  if (definition.maxClaims > 0 && definition.claimCount >= definition.maxClaims) {
    throw new Error("That badge has already reached its max claims.");
  }

  const claimId = nextState.nextClaimId;
  const claimedAt = Math.floor(Date.now() / 1000);
  const proofHash = await sha256Hex(
    `${definitionId}:${agent.toLowerCase()}:${proofNote}:${claimedAt}:${issuedBy.toLowerCase()}`
  );
  const claim = buildClaimMetadata({
    definition,
    agent,
    claimId,
    claimedAt,
    issuedBy,
    proofHash
  });
  const claimUri = buildClaimUri(claim);

  const claimEntry = {
    id: claimId,
    definitionId,
    agent,
    claimedAt,
    issuedBy,
    proofHash,
    evidenceSummary: deriveDefinitionEvidenceSummary(definition, proofHash),
    claimUri,
    claim
  };

  nextState.nextClaimId += 1;
  nextState.claims = [claimEntry, ...nextState.claims];
  nextState.definitions = nextState.definitions.map((entry) =>
    entry.id === definitionId
      ? {
          ...entry,
          claimCount: entry.claimCount + 1
        }
      : entry
  );

  return {
    state: nextState,
    claimEntry
  };
}

function normalizeRegistryState(rawState) {
  const state = createEmptyRegistryState();
  const definitions = Array.isArray(rawState?.definitions)
    ? rawState.definitions
        .map((entry) => normalizeDefinition(entry))
        .filter(Boolean)
        .sort((first, second) => second.id - first.id)
    : [];
  const claims = Array.isArray(rawState?.claims)
    ? rawState.claims
        .map((entry) => normalizeClaimEntry(entry))
        .filter(Boolean)
        .sort((first, second) => second.claimedAt - first.claimedAt || second.id - first.id)
    : [];

  state.definitions = definitions;
  state.claims = claims;
  state.nextDefinitionId = Math.max(rawState?.nextDefinitionId ?? 1, maxId(definitions) + 1);
  state.nextClaimId = Math.max(rawState?.nextClaimId ?? 1, maxId(claims) + 1);
  return state;
}

function normalizeDefinition(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    id: toNumber(entry.id),
    name: entry.name?.trim?.() ?? "",
    description: entry.description?.trim?.() ?? "",
    claimCondition: entry.claimCondition?.trim?.() ?? "",
    samplePinId: entry.samplePinId?.trim?.() ?? "",
    catalogBadgeTypeLabel: entry.catalogBadgeTypeLabel?.trim?.() ?? "",
    creator: normalizeAddress(entry.creator) || DEFAULT_CREATOR,
    badgeType: normalizeEnumValue(entry.badgeType, BADGE_TYPE_OPTIONS, "ACHIEVEMENT"),
    verificationType: normalizeEnumValue(
      entry.verificationType,
      VERIFICATION_TYPE_OPTIONS,
      "ONCHAIN_STATE"
    ),
    verificationData: entry.verificationData?.trim?.() ?? "0x",
    unlockAdapterConfig: decodeUnlockAdapterConfig(
      normalizeEnumValue(entry.verificationType, VERIFICATION_TYPE_OPTIONS, "ONCHAIN_STATE"),
      entry.verificationData?.trim?.() ?? "0x"
    ),
    advancedPolicy: entry.advancedPolicy?.trim?.() ?? "0x",
    advancedPolicyConfig: decodeAdvancedPolicyConfig(entry.advancedPolicy?.trim?.() ?? "0x", {
      requiredIssuer: decodeUnlockAdapterConfig(
        normalizeEnumValue(entry.verificationType, VERIFICATION_TYPE_OPTIONS, "ONCHAIN_STATE"),
        entry.verificationData?.trim?.() ?? "0x"
      )?.unlockSignerAddress
    }),
    maxClaims: toNumber(entry.maxClaims),
    claimCount: toNumber(entry.claimCount),
    active: entry.active !== false,
    createdAt: toNumber(entry.createdAt),
    asset: sanitizeAssetDraft(entry.asset ?? {})
  };
}

function normalizeClaimEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  return {
    id: toNumber(entry.id),
    definitionId: toNumber(entry.definitionId),
    agent: normalizeAddress(entry.agent) || "",
    claimedAt: toNumber(entry.claimedAt),
    issuedBy: normalizeAddress(entry.issuedBy) || DEFAULT_CREATOR,
    proofHash: entry.proofHash?.trim?.() ?? "",
    evidenceSummary: entry.evidenceSummary ?? null,
    claimUri: entry.claimUri?.trim?.() ?? "",
    claim: entry.claim ?? null
  };
}

function deriveDefinitionEvidenceSummary(definition, proofHash) {
  if (!definition?.advancedPolicyConfig?.enabled) {
    return null;
  }

  return {
    issuer: definition.advancedPolicyConfig.requiredIssuer || "",
    contextId: definition.advancedPolicyConfig.contextId || "",
    expiresAt: 0,
    nonceHash: "",
    proofHash
  };
}

function sanitizeAssetDraft(input) {
  return {
    assetId: toNumber(input.assetId),
    videoUri: input.videoUri?.trim?.() ?? "",
    posterUri: input.posterUri?.trim?.() ?? "",
    detailUri: input.detailUri?.trim?.() ?? "",
    edition: input.edition?.trim?.() ?? "",
    loopSeconds: toNumber(input.loopSeconds),
    videoHash: input.videoHash?.trim?.() ?? "",
    posterHash: input.posterHash?.trim?.() ?? ""
  };
}

function buildClaimMetadata({ definition, agent, claimId, claimedAt, issuedBy, proofHash }) {
  const animationUrl = definition.asset.videoUri;
  const externalUrl = buildExternalUrl(claimId);

  return {
    name: definition.name,
    description: definition.description,
    image: definition.asset.posterUri,
    animation_url: animationUrl,
    external_url: externalUrl,
    assets: definition.asset.videoUri
      ? [
          {
            uri: definition.asset.videoUri,
            mime_type: "video/mp4"
          }
        ]
      : [],
    properties: {
      record_type: "tempo-badge-claim",
      agent,
      definition_id: String(definition.id),
      asset_id: String(definition.asset.assetId || 0),
      video_uri: definition.asset.videoUri,
      detail_uri: definition.asset.detailUri,
      video_hash: definition.asset.videoHash,
      poster_hash: definition.asset.posterHash,
      edition: definition.asset.edition || "launch",
      loop_seconds: definition.asset.loopSeconds || 5,
      issuer: issuedBy,
      proof_hash: proofHash
    },
    attributes: [
      {
        trait_type: "Badge Type",
        value: badgeTypeLabel(definition.badgeType)
      },
      {
        trait_type: "Verification",
        value: verificationTypeLabel(definition.verificationType)
      },
      {
        trait_type: "Claimed At",
        display_type: "date",
        value: claimedAt
      }
    ]
  };
}

function buildClaimUri(claim) {
  const json = JSON.stringify(claim);
  const bytes = new TextEncoder().encode(json);
  return `data:application/json;base64,${bytesToBase64(bytes)}`;
}

async function createSeedState(claim) {
  const seededDefinitions = buildCatalogDefinitions().map((entry, index) => {
    const unlockPayload = buildUnlockAdapterPayload(entry);
    const verificationType = normalizeEnumValue(
      unlockPayload.verificationType,
      VERIFICATION_TYPE_OPTIONS,
      "ONCHAIN_STATE"
    );
    return {
      id: index + 1,
      name: entry.name,
      description: entry.description,
      claimCondition: entry.claimCondition ?? "",
      samplePinId: entry.samplePinId ?? "",
      catalogBadgeTypeLabel: entry.catalogBadgeTypeLabel ?? "",
      creator: DEFAULT_CREATOR,
      badgeType: normalizeEnumValue(entry.badgeType, BADGE_TYPE_OPTIONS, "ACHIEVEMENT"),
      verificationType,
      verificationData: unlockPayload.verificationData,
      unlockAdapterConfig: unlockPayload.unlockAdapterConfig,
      advancedPolicy: entry.advancedPolicy ?? "0x",
      advancedPolicyConfig: entry.advancedPolicyConfig ?? advancedPolicyDefaults(),
      maxClaims: 0,
      claimCount: 0,
      active: true,
      createdAt: 1774022715 + index,
      asset: sanitizeAssetDraft(entry.asset)
    };
  });

  let seededState = {
    version: STATE_VERSION,
    nextDefinitionId: BADGE_CATALOG.length + 1,
    nextClaimId: 1,
    definitions: seededDefinitions,
    claims: []
  };

  const trailblazerDefinition = seededDefinitions.find((entry) => entry.name === "Trailblazer");
  const onchainDefinition = seededDefinitions.find((entry) => entry.name === "Onchain");
  const seededClaimPlans = [
    trailblazerDefinition
      ? {
          definitionId: trailblazerDefinition.id,
          agent: normalizeAddress(claim.properties?.agent) || DEFAULT_AGENT,
          proofNote: "Early qualifying activity",
          issuedBy: DEFAULT_CREATOR
        }
      : null,
    onchainDefinition
      ? {
          definitionId: onchainDefinition.id,
          agent: DEFAULT_CREATOR,
          proofNote: "Sample high-activity wallet",
          issuedBy: DEFAULT_CREATOR
        }
      : null
  ].filter(Boolean);

  for (const plan of seededClaimPlans) {
    const result = await issueClaim(seededState, plan);
    seededState = result.state;
  }

  return seededState;
}

function buildExternalUrl(claimId) {
  if (typeof window === "undefined") {
    return `?localClaim=${claimId}`;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("localClaim", String(claimId));
  url.searchParams.delete("claim");
  url.searchParams.delete("deployment");
  url.searchParams.delete("claimAgent");
  url.searchParams.delete("claimDef");
  url.searchParams.delete("samplePin");
  return url.toString();
}

async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(buffer);
  return `0x${[...bytes].map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function readTraitValue(claim, traitType) {
  const trait = claim.attributes?.find?.((entry) => entry.trait_type === traitType);
  return trait?.value ?? "";
}

function normalizeHumanLabel(value, options, fallback) {
  const compact = value?.toString?.().toUpperCase?.().replace?.(/[^A-Z0-9]+/g, "_") ?? "";
  return normalizeEnumValue(compact, options, fallback);
}

function normalizeEnumValue(value, options, fallback) {
  const candidate = value?.toString?.().trim?.().toUpperCase?.() ?? "";
  return options.some((entry) => entry.value === candidate) ? candidate : fallback;
}

function findOptionLabel(options, value, fallback) {
  return options.find((entry) => entry.value === value)?.label ?? fallback;
}

function normalizeAddress(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function maxId(entries) {
  return entries.reduce((highest, entry) => Math.max(highest, entry.id ?? 0), 0);
}
