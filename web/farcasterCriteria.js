import { keccak256, stringToHex } from "viem";

export const FARCASTER_CRITERIA_KIND = "farcaster_account";

function normalizeFidValue(value) {
  const numeric = Number.parseInt(String(value ?? "0").trim(), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function normalizeFarcasterCriteria(raw = {}) {
  const minFid = normalizeFidValue(raw.minFid ?? raw.fidThreshold ?? raw.unlockThreshold);
  const maxFid = normalizeFidValue(raw.maxFid);
  return {
    kind: FARCASTER_CRITERIA_KIND,
    minFid,
    maxFid,
    note: String(raw.note ?? "").trim()
  };
}

export function isFarcasterCriteria(value) {
  return value?.kind === FARCASTER_CRITERIA_KIND;
}

export function buildFarcasterCriteriaJson(raw = {}) {
  return JSON.stringify(normalizeFarcasterCriteria(raw));
}

export function buildFarcasterCriteriaHash(raw = {}) {
  return keccak256(stringToHex(buildFarcasterCriteriaJson(raw)));
}

export function formatFarcasterCriteriaRequirement(raw = {}) {
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

export function buildFarcasterContextLabel(raw = {}) {
  const criteria = normalizeFarcasterCriteria(raw);
  const requirement = formatFarcasterCriteriaRequirement(criteria);
  return criteria.note
    ? `${requirement} · ${criteria.note}`
    : requirement;
}

export function matchesFarcasterCriteria(fid, raw = {}) {
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

export function describeFarcasterCriteria(raw = {}) {
  const criteria = normalizeFarcasterCriteria(raw);
  return {
    title: "Farcaster Account",
    summary: "Claim requires a Farcaster Quick Auth session from the same wallet that is claiming the badge.",
    detailLines: [
      "Connection: Open in Farcaster and authenticate with Quick Auth.",
      `Requirement: ${formatFarcasterCriteriaRequirement(criteria)}.`,
      criteria.note || "No extra Farcaster filter is configured for this badge."
    ]
  };
}
