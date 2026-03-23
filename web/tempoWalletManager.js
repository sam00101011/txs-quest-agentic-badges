import {
  ConnectorAlreadyConnectedError,
  connect,
  createConfig,
  createStorage,
  disconnect,
  getAccount,
  getConnectors,
  getWalletClient,
  http,
  noopStorage,
  reconnect,
  switchChain
} from "@wagmi/core";
import { KeyManager, webAuthn } from "@wagmi/core/tempo";
import { defineChain } from "viem";
import {
  tempo,
  tempoAndantino,
  tempoDevnet,
  tempoLocalnet,
  tempoModerato,
  tempoTestnet
} from "viem/chains";

const KNOWN_TEMPO_CHAINS = [
  tempo,
  tempoAndantino,
  tempoDevnet,
  tempoLocalnet,
  tempoModerato,
  tempoTestnet
];

function createWalletStorage(storageKey) {
  const storage =
    typeof window !== "undefined" && window.localStorage ? window.localStorage : noopStorage;
  return createStorage({
    key: storageKey,
    storage
  });
}

function resolveTempoChainDefinition({ chainId, rpcUrl }) {
  const normalizedChainId = Number(chainId) || 0;
  const chain = KNOWN_TEMPO_CHAINS.find((entry) => entry.id === normalizedChainId);

  if (!chain) {
    throw new Error("Tempo Connect only supports Tempo networks.");
  }

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

export function createTempoWalletManager({ storageKey }) {
  let config = null;
  let connector = null;
  let signature = "";

  async function ensureConfig({ chainId, rpcUrl }) {
    const nextSignature = JSON.stringify({
      chainId: Number(chainId) || 0,
      rpcUrl
    });

    if (config && signature === nextSignature) {
      return {
        config,
        connector
      };
    }

    const chain = resolveTempoChainDefinition({ chainId, rpcUrl });
    config = createConfig({
      chains: [chain],
      connectors: [
        webAuthn({
          keyManager: KeyManager.localStorage({
            key: `${storageKey}-keys`
          })
        })
      ],
      storage: createWalletStorage(storageKey),
      transports: {
        [chain.id]: http(rpcUrl || chain.rpcUrls.default.http[0])
      }
    });
    signature = nextSignature;
    connector = getConnectors(config)[0] ?? null;

    try {
      await reconnect(config);
    } catch {
      // Let the app prompt explicitly on connect.
    }

    return {
      config,
      connector
    };
  }

  async function resolveConnector(context) {
    const ensured = await ensureConfig(context);
    if (!ensured.connector) {
      throw new Error("Tempo Connect is unavailable in this browser.");
    }

    return ensured.connector;
  }

  return {
    async getSession(context) {
      await ensureConfig(context);
      const account = getAccount(config);
      if (!account.address || account.status !== "connected") {
        return {
          address: "",
          chainId: null,
          status: "disconnected"
        };
      }

      return {
        address: account.address ?? "",
        chainId: Number(account.chainId ?? 0) || null,
        status: account.status ?? "disconnected"
      };
    },
    async connect(context) {
      const normalizedChainId = Number(context.chainId) || 0;
      const resolvedConnector = await resolveConnector(context);
      try {
        const result = await connect(config, {
          connector: resolvedConnector,
          chainId: normalizedChainId
        });
        const account = result.accounts?.[0];
        return typeof account === "object" ? account.address : account;
      } catch (error) {
        const accountState = getAccount(config);
        if (error instanceof ConnectorAlreadyConnectedError && accountState.address) {
          if (accountState.chainId !== normalizedChainId) {
            await switchChain(config, {
              connector: resolvedConnector,
              chainId: normalizedChainId
            });
          }

          return accountState.address;
        }

        throw error;
      }
    },
    async disconnect(context) {
      await resolveConnector(context);
      await disconnect(config);
    },
    async getWalletClient(context) {
      const normalizedChainId = Number(context.chainId) || 0;
      const resolvedConnector = await resolveConnector(context);
      const accountState = getAccount(config);

      if (accountState.status !== "connected" || !accountState.address) {
        await connect(config, {
          connector: resolvedConnector,
          chainId: normalizedChainId
        });
      } else if (accountState.chainId !== normalizedChainId) {
        await switchChain(config, {
          connector: resolvedConnector,
          chainId: normalizedChainId
        });
      }

      return getWalletClient(config, {
        connector: resolvedConnector,
        chainId: normalizedChainId
      });
    }
  };
}
