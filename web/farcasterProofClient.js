import { connectFarcaster } from "./farcasterConnect.js";

function normalizeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/\/$/, "");
}

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

export async function requestFarcasterProof({
  serviceUrl,
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  force = false
}) {
  const normalizedServiceUrl = normalizeUrl(serviceUrl);
  const normalizedAgent = normalizeAddress(agent);
  if (!normalizedServiceUrl) {
    throw new Error("Add a Farcaster proof service URL before claiming this badge.");
  }
  if (!normalizedAgent) {
    throw new Error("Farcaster badge claims require a valid 0x agent wallet.");
  }

  const farcasterSession = await connectFarcaster({ force });
  if (!farcasterSession.token) {
    throw new Error("Could not acquire a Farcaster Quick Auth token.");
  }
  if (!farcasterSession.authAddress || farcasterSession.authAddress !== normalizedAgent) {
    throw new Error("The connected Farcaster auth address must match the wallet claiming the badge.");
  }

  const response = await fetch(normalizedServiceUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      badgeRegistryAddress,
      chainId: Number(chainId),
      definitionId: Number(definitionId),
      agent: normalizedAgent,
      domain: window.location.hostname,
      token: farcasterSession.token
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.detail || `Farcaster proof request failed with ${response.status}.`);
  }

  if (!payload?.proofPackage || typeof payload.proofPackage !== "object") {
    throw new Error("The Farcaster proof service did not return a valid 8183 proof package.");
  }

  return payload;
}
