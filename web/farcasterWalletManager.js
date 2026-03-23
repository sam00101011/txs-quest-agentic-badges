import { createWalletClient, custom, defineChain } from "viem";
import {
  tempo,
  tempoAndantino,
  tempoDevnet,
  tempoLocalnet,
  tempoModerato,
  tempoTestnet
} from "viem/chains";

import { getFarcasterEthereumProvider } from "./farcasterConnect.js";

const KNOWN_TEMPO_CHAINS = [
  tempo,
  tempoAndantino,
  tempoDevnet,
  tempoLocalnet,
  tempoModerato,
  tempoTestnet
];

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function parseChainId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return Number(trimmed.startsWith("0x") ? BigInt(trimmed) : BigInt(trimmed));
  } catch {
    return null;
  }
}

function resolveKnownChain({ chainId, rpcUrl }) {
  const normalizedChainId = Number(chainId) || 31337;
  const chain = KNOWN_TEMPO_CHAINS.find((entry) => entry.id === normalizedChainId);
  if (chain) {
    if (!rpcUrl || chain.rpcUrls.default.http.includes(rpcUrl)) {
      return chain;
    }

    return defineChain({
      ...chain,
      rpcUrls: {
        ...chain.rpcUrls,
        default: {
          ...chain.rpcUrls.default,
          http: [rpcUrl]
        }
      }
    });
  }

  return null;
}

function createChainDefinition({ chainId, rpcUrl }) {
  const knownChain = resolveKnownChain({ chainId, rpcUrl });
  if (knownChain) {
    return knownChain;
  }

  const normalizedChainId = Number(chainId) || 31337;
  return defineChain({
    id: normalizedChainId,
    name: `Agentic Chain ${normalizedChainId}`,
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

function buildChainParams({ chainId, rpcUrl }) {
  const knownChain = resolveKnownChain({ chainId, rpcUrl });
  if (knownChain) {
    return {
      chainId: `0x${knownChain.id.toString(16)}`,
      chainName: knownChain.name,
      nativeCurrency: knownChain.nativeCurrency,
      rpcUrls: knownChain.rpcUrls.default.http,
      blockExplorerUrls: knownChain.blockExplorers?.default?.url
        ? [knownChain.blockExplorers.default.url]
        : undefined
    };
  }

  const normalizedChainId = Number(chainId) || 31337;
  return {
    chainId: `0x${normalizedChainId.toString(16)}`,
    chainName: `Agentic Chain ${normalizedChainId}`,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: [rpcUrl]
  };
}

async function ensureProvider() {
  const provider = await getFarcasterEthereumProvider();
  if (!provider || typeof provider.request !== "function") {
    throw new Error("Open txs.quest inside Farcaster mobile to connect the Mini App wallet.");
  }

  return provider;
}

async function getAccounts(provider, request = false) {
  const method = request ? "eth_requestAccounts" : "eth_accounts";
  const accounts = await provider.request({ method }).catch(() => []);
  return Array.isArray(accounts) ? accounts.map(normalizeAddress).filter(Boolean) : [];
}

async function ensureChain(provider, context) {
  const targetChainId = Number(context.chainId) || 31337;
  const currentChainId = parseChainId(
    await provider.request({ method: "eth_chainId" }).catch(() => null)
  );
  if (currentChainId === targetChainId) {
    return;
  }

  const params = buildChainParams(context);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: params.chainId }]
    });
    return;
  } catch (error) {
    const code = Number(error?.code ?? 0);
    const message = String(error?.message ?? "");
    const needsAdd =
      code === 4902 || /unknown chain|unrecognized chain|chain.*not added/i.test(message);

    if (!needsAdd) {
      if (code === 4200 || /not support|unsupported/i.test(message)) {
        throw new Error(
          "This Farcaster wallet cannot switch to the required network yet. Try again from the Mini App on a wallet that supports the target chain."
        );
      }
      throw new Error(
        "Farcaster verified your wallet, but the Mini App signer could not attach to this network yet."
      );
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [params]
    });
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: params.chainId }]
      });
    } catch {
      throw new Error(
        "Farcaster verified your wallet, but the Mini App signer could not switch to the txs.quest network yet."
      );
    }
  }
}

export function createFarcasterWalletManager() {
  return {
    async getSession() {
      const provider = await getFarcasterEthereumProvider();
      if (!provider || typeof provider.request !== "function") {
        return {
          address: "",
          chainId: null,
          status: "disconnected"
        };
      }
      const accounts = await getAccounts(provider, false);
      const address = accounts[0] ?? "";
      const chainId = parseChainId(
        await provider.request({ method: "eth_chainId" }).catch(() => null)
      );

      return {
        address,
        chainId,
        status: address ? "connected" : "disconnected"
      };
    },
    async connect(context) {
      const provider = await ensureProvider();
      const accounts = await getAccounts(provider, true);
      const address = accounts[0] ?? "";
      if (!address) {
        throw new Error("The Farcaster Mini App wallet did not return an EVM address.");
      }

      await ensureChain(provider, context);
      return address;
    },
    async disconnect() {
      return;
    },
    async getConnectedAddress() {
      const session = await this.getSession();
      return session.address;
    },
    async getWalletClient(context) {
      const provider = await ensureProvider();
      const existingAccounts = await getAccounts(provider, false);
      const address = existingAccounts[0] ?? (await this.connect(context));

      if (!address) {
        throw new Error("The Farcaster Mini App wallet did not return an EVM address.");
      }

      await ensureChain(provider, context);
      return createWalletClient({
        account: address,
        chain: createChainDefinition(context),
        transport: custom(provider)
      });
    }
  };
}
