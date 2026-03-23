import { sdk as farcasterSdk } from "@farcaster/miniapp-sdk";
import { createLightClient } from "@farcaster/quick-auth/light";
import { decodeJwt } from "@farcaster/quick-auth/decodeJwt";
import * as Siwe from "ox/Siwe";

const DEFAULT_PUBLIC_BASE_URL = "https://txs.quest";
const DEFAULT_CANONICAL_DOMAIN = "txs.quest";
const FARCASTER_WEB_COMPOSE_URL = "https://farcaster.xyz/~/compose";

let farcasterState = {
  checked: false,
  ready: false,
  isMiniApp: false,
  connected: false,
  token: "",
  fid: 0,
  username: "",
  displayName: "",
  pfpUrl: "",
  authAddress: "",
  authMethod: "",
  clientFid: 0,
  capabilities: [],
  error: ""
};

let preparePromise = null;

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

function getPublicBaseUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_PUBLIC_BASE_URL;
}

function buildClaimUrl(target = "") {
  const url = new URL("/claim", getPublicBaseUrl());
  url.searchParams.set("farcaster", "1");

  const trimmed = String(target ?? "").trim();
  const normalizedAddress = normalizeAddress(trimmed);
  if (normalizedAddress) {
    url.searchParams.set("address", normalizedAddress);
  } else if (/^[^\s]+\.eth$/i.test(trimmed)) {
    url.searchParams.set("ens", trimmed);
  }

  return url.toString();
}

function decodeJwtPayload(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length < 2 || typeof atob !== "function") {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function buildSessionFromContext(context) {
  return {
    ...farcasterState,
    checked: true,
    ready: farcasterState.ready,
    isMiniApp: farcasterState.isMiniApp,
    fid: Number(context?.user?.fid ?? farcasterState.fid ?? 0) || 0,
    username: String(context?.user?.username ?? farcasterState.username ?? ""),
    displayName: String(context?.user?.displayName ?? farcasterState.displayName ?? ""),
    pfpUrl: String(context?.user?.pfpUrl ?? farcasterState.pfpUrl ?? ""),
    clientFid: Number(context?.client?.clientFid ?? farcasterState.clientFid ?? 0) || 0
  };
}

export function getFarcasterSession() {
  return { ...farcasterState };
}

export function getFarcasterLaunchUrl({ target = "" } = {}) {
  const launchUrl = new URL(FARCASTER_WEB_COMPOSE_URL);
  launchUrl.searchParams.append("embeds[]", buildClaimUrl(target));
  return launchUrl.toString();
}

export function openFarcasterClaim(options = {}) {
  const launchUrl = getFarcasterLaunchUrl(options);
  if (typeof window === "undefined") {
    return launchUrl;
  }

  const opened = window.open(launchUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(launchUrl);
  }
  return launchUrl;
}

export async function prepareFarcasterConnect() {
  if (preparePromise) {
    return preparePromise;
  }

  preparePromise = (async () => {
    let isMiniApp = false;
    try {
      isMiniApp = await farcasterSdk.isInMiniApp();
    } catch {
      isMiniApp = false;
    }
    farcasterState = {
      ...farcasterState,
      checked: true,
      isMiniApp
    };
    if (!isMiniApp) {
      return getFarcasterSession();
    }

    try {
      await farcasterSdk.actions.ready();
    } catch {}
    let context = null;
    let capabilities = [];
    try {
      context = await farcasterSdk.context;
    } catch {
      context = null;
    }
    try {
      capabilities = await farcasterSdk.getCapabilities();
    } catch {
      capabilities = [];
    }
    farcasterState = {
      ...buildSessionFromContext(context),
      ready: true,
      isMiniApp: true,
      checked: true,
      capabilities
    };
    return getFarcasterSession();
  })();

  try {
    return await preparePromise;
  } finally {
    preparePromise = null;
  }
}

export async function connectFarcaster({ force = false } = {}) {
  const initial = await prepareFarcasterConnect();
  if (!initial.isMiniApp) {
    throw new Error("Farcaster connect is only available inside a Farcaster Mini App.");
  }

  const quickAuthClient = createLightClient({
    origin: "https://auth.farcaster.xyz"
  });
  const { nonce } = await quickAuthClient.generateNonce();
  const signInResult = await farcasterSdk.actions.signIn({
    nonce,
    acceptAuthAddress: true
  });
  const parsedSiwe = Siwe.parseMessage(signInResult.message);
  if (!parsedSiwe.domain) {
    throw new Error("Farcaster Quick Auth did not provide a valid SIWE domain.");
  }
  const verifyResult = await quickAuthClient.verifySiwf({
    domain: parsedSiwe.domain,
    message: signInResult.message,
    signature: signInResult.signature
  });
  const token = verifyResult.token;
  const payload = decodeJwtPayload(token) ?? decodeJwt(token) ?? {};
  let context = null;
  try {
    context = await farcasterSdk.context;
  } catch {
    context = null;
  }
  const parsedAddress = normalizeAddress(parsedSiwe.address);
  const payloadAddress = normalizeAddress(payload.address);
  farcasterState = {
    ...buildSessionFromContext(context),
    checked: true,
    ready: true,
    isMiniApp: true,
    connected: true,
    token,
    fid: Number(payload.sub ?? context?.user?.fid ?? 0) || 0,
    authAddress: parsedAddress || payloadAddress,
    authMethod: String(signInResult.authMethod ?? ""),
    error: ""
  };
  return getFarcasterSession();
}

export async function getFarcasterEthereumProvider() {
  const session = await prepareFarcasterConnect().catch(() => getFarcasterSession());
  if (!session.isMiniApp) {
    return null;
  }

  try {
    return (await farcasterSdk.wallet.getEthereumProvider()) ?? null;
  } catch {
    return null;
  }
}

export async function signFarcasterManifest({ domain = DEFAULT_CANONICAL_DOMAIN } = {}) {
  const session = await prepareFarcasterConnect();
  if (!session.isMiniApp) {
    throw new Error("Open txs.quest inside Farcaster before generating the Mini App domain signature.");
  }
  let capabilities = [];
  try {
    capabilities = await farcasterSdk.getCapabilities();
  } catch {
    capabilities = [];
  }
  if (capabilities.length > 0 && !capabilities.includes("experimental.signManifest")) {
    throw new Error(
      "This Farcaster client does not expose Mini App manifest signing yet. Try the latest Farcaster client or Warpcast."
    );
  }
  if (!farcasterSdk.experimental?.signManifest) {
    throw new Error("This Farcaster client does not support Mini App manifest signing yet.");
  }

  const normalizedDomain = String(domain ?? "").trim().toLowerCase();
  if (!normalizedDomain) {
    throw new Error("Missing Mini App domain.");
  }

  const result = await farcasterSdk.experimental.signManifest({
    domain: normalizedDomain
  });

  return {
    domain: normalizedDomain,
    header: String(result?.header ?? "").trim(),
    payload: String(result?.payload ?? "").trim(),
    signature: String(result?.signature ?? "").trim()
  };
}

export function describeFarcasterSession(session = farcasterState) {
  if (!session.checked) {
    return "Farcaster not checked yet";
  }
  if (!session.isMiniApp) {
    return "Open txs.quest inside Farcaster to connect";
  }
  if (!session.connected) {
    return "Farcaster Mini App detected";
  }

  const handle = session.username ? `@${session.username}` : `fid ${session.fid}`;
  const authAddress = session.authAddress
    ? `${session.authAddress.slice(0, 6)}...${session.authAddress.slice(-4)}`
    : session.authMethod === "custody"
      ? "custody signer"
      : session.authMethod === "authAddress"
        ? "auth signer"
        : "no auth address";
  return `${handle} · ${authAddress}`;
}
