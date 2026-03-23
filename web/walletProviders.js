import { getFarcasterEthereumProvider } from "./farcasterConnect.js";

export const LOCAL_DEV_WALLET_ID = "local-dev:anvil";
export const TEMPO_CONNECT_WALLET_ID = "tempo:webauthn";
export const FARCASTER_MINIAPP_WALLET_ID = "farcaster:miniapp";
const TEMPO_CHAIN_IDS = new Set([1337, 4217, 42431, 42432, 42515]);

export function isTempoChainId(chainId) {
  return TEMPO_CHAIN_IDS.has(Number(chainId) || 0);
}

function supportsTempoConnect() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";

  return Boolean(window.PublicKeyCredential) && (window.isSecureContext || isLocalhost);
}

function createTempoConnectWallet() {
  return {
    id: TEMPO_CONNECT_WALLET_ID,
    index: -1,
    kind: "tempo-connect",
    isLocalDev: false,
    isTempo: true,
    isTempoConnect: true,
    name: "Tempo Connect",
    provider: null,
    rdns: "xyz.tempo.connect",
    source: "webauthn"
  };
}

function inferProviderName(provider, info = {}) {
  if (info.name) {
    return info.name;
  }

  if (provider?.isFarcasterMiniApp) {
    return "Farcaster Wallet";
  }
  if (provider?.isTempo) {
    return "Tempo Wallet";
  }
  if (provider?.isMetaMask) {
    return "MetaMask";
  }
  if (provider?.isCoinbaseWallet) {
    return "Coinbase Wallet";
  }
  if (provider?.isRabby) {
    return "Rabby";
  }

  return "Injected Wallet";
}

function inferProviderRdns(provider, info = {}) {
  if (info.rdns) {
    return info.rdns;
  }

  if (provider?.isFarcasterMiniApp) {
    return "xyz.farcaster.miniapp";
  }
  if (provider?.isTempo) {
    return "xyz.tempo.wallet";
  }
  if (provider?.isMetaMask) {
    return "io.metamask";
  }
  if (provider?.isCoinbaseWallet) {
    return "com.coinbase.wallet";
  }
  if (provider?.isRabby) {
    return "io.rabby";
  }

  return "";
}

function normalizeWallet(provider, meta = {}) {
  const name = inferProviderName(provider, meta.info);
  const rdns = inferProviderRdns(provider, meta.info);
  const uuid = meta.info?.uuid?.trim?.() ?? "";
  const source = meta.source ?? "window.ethereum";
  const index = Number(meta.index ?? 0);
  const id = uuid || `${rdns || "wallet"}:${name}:${source}:${index}`;
  const isTempo =
    provider?.isTempo === true ||
    /tempo/i.test(name) ||
    /tempo/i.test(rdns) ||
    /tempo/i.test(meta.info?.name ?? "") ||
    /tempo/i.test(meta.info?.rdns ?? "");
  const isFarcasterMiniApp =
    provider?.isFarcasterMiniApp === true ||
    /farcaster/i.test(name) ||
    /farcaster/i.test(rdns) ||
    meta.source === "farcaster-miniapp";

  return {
    id,
    index,
    kind: "injected",
    isFarcasterMiniApp,
    isTempo,
    isTempoConnect: false,
    isLocalDev: false,
    name,
    provider,
    rdns,
    source
  };
}

function shouldExposeLocalDevWallet() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function createLocalDevWallet() {
  return {
    id: LOCAL_DEV_WALLET_ID,
    index: Number.MAX_SAFE_INTEGER,
    kind: "local-dev",
    isLocalDev: true,
    isTempo: false,
    isTempoConnect: false,
    name: "Local Dev Wallet",
    provider: null,
    rdns: "local.anvil",
    source: "local"
  };
}

function mergeWalletEntries(current, incoming) {
  return {
    ...current,
    ...incoming,
    name: current.name !== "Injected Wallet" ? current.name : incoming.name,
    rdns: current.rdns || incoming.rdns,
    isFarcasterMiniApp: current.isFarcasterMiniApp || incoming.isFarcasterMiniApp,
    isTempo: current.isTempo || incoming.isTempo,
    isTempoConnect: current.isTempoConnect || incoming.isTempoConnect,
    source: current.source === "window.ethereum" ? current.source : incoming.source
  };
}

export async function discoverInjectedWallets({ timeoutMs = 180 } = {}) {
  if (typeof window === "undefined") {
    return [];
  }

  const wallets = new Map();
  const register = (provider, meta = {}) => {
    if (!provider || typeof provider.request !== "function") {
      return;
    }

    const normalized = normalizeWallet(provider, meta);
    const existing = wallets.get(normalized.id);
    wallets.set(normalized.id, existing ? mergeWalletEntries(existing, normalized) : normalized);
  };

  const handleAnnounce = (event) => {
    const detail = event.detail ?? {};
    register(detail.provider, {
      info: detail.info,
      source: "eip6963"
    });
  };

  window.addEventListener("eip6963:announceProvider", handleAnnounce);

  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // Some browsers do not support the EIP-6963 event path.
  }

  const legacyProviders = Array.isArray(window.ethereum?.providers)
    ? window.ethereum.providers
    : window.ethereum
      ? [window.ethereum]
      : [];

  legacyProviders.forEach((provider, index) => {
    register(provider, {
      index,
      source: "window.ethereum"
    });
  });

  const farcasterProvider = await getFarcasterEthereumProvider();
  if (farcasterProvider) {
    register(farcasterProvider, {
      index: -2,
      source: "farcaster-miniapp",
      info: {
        name: "Farcaster Wallet",
        rdns: "xyz.farcaster.miniapp",
        uuid: FARCASTER_MINIAPP_WALLET_ID
      }
    });
  }

  if (timeoutMs > 0) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    });
  }

  window.removeEventListener("eip6963:announceProvider", handleAnnounce);

  const entries = [...wallets.values()];
  if (supportsTempoConnect()) {
    entries.push(createTempoConnectWallet());
  }
  if (shouldExposeLocalDevWallet()) {
    entries.push(createLocalDevWallet());
  }

  return entries.sort((first, second) => {
    if (first.isLocalDev !== second.isLocalDev) {
      return first.isLocalDev ? 1 : -1;
    }
    if (first.isFarcasterMiniApp !== second.isFarcasterMiniApp) {
      return first.isFarcasterMiniApp ? -1 : 1;
    }
    if (first.isTempoConnect !== second.isTempoConnect) {
      return first.isTempoConnect ? -1 : 1;
    }
    if (first.isTempo !== second.isTempo) {
      return first.isTempo ? -1 : 1;
    }

    return first.name.localeCompare(second.name);
  });
}

export function getPreferredWalletId(wallets, currentId = "") {
  if (currentId && wallets.some((wallet) => wallet.id === currentId)) {
    return currentId;
  }

  return (
    wallets.find((wallet) => wallet.isFarcasterMiniApp)?.id ??
    wallets.find((wallet) => wallet.isTempoConnect)?.id ??
    wallets.find((wallet) => wallet.isTempo)?.id ??
    wallets.find((wallet) => !wallet.isLocalDev)?.id ??
    wallets.find((wallet) => wallet.isLocalDev)?.id ??
    ""
  );
}

export function findWalletById(wallets, walletId) {
  return wallets.find((wallet) => wallet.id === walletId) ?? null;
}

export function walletOptionLabel(wallet) {
  if (wallet.isFarcasterMiniApp) {
    return `${wallet.name} · Mini App`;
  }
  if (wallet.isTempoConnect) {
    return `${wallet.name} · Passkey`;
  }
  if (wallet.isLocalDev) {
    return `${wallet.name} · Localhost`;
  }

  return wallet.isTempo ? `${wallet.name} · Tempo` : wallet.name;
}
