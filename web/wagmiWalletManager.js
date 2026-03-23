import {
  ConnectorAlreadyConnectedError,
  connect,
  createConfig,
  createStorage,
  disconnect,
  getAccount,
  getWalletClient,
  getConnectors,
  http,
  injected,
  noopStorage,
  reconnect,
  switchChain
} from "@wagmi/core";
import { defineChain } from "viem";

function createChainDefinition({ chainId, rpcUrl }) {
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

function createWalletStorage(storageKey) {
  const storage =
    typeof window !== "undefined" && window.localStorage ? window.localStorage : noopStorage;
  return createStorage({
    key: storageKey,
    storage
  });
}

function buildConnectorFactory(wallet) {
  return injected({
    shimDisconnect: true,
    target: {
      id: wallet.id,
      name: wallet.name,
      provider: () => wallet.provider
    }
  });
}

export function createWagmiWalletManager({ storageKey }) {
  let config = null;
  let connectorMap = new Map();
  let signature = "";

  async function ensureConfig({ wallet = null, wallets = [], chainId, rpcUrl }) {
    const injectedWallets = (wallets.length > 0 ? wallets : wallet ? [wallet] : []).filter(
      (entry) => entry?.provider && !entry.isLocalDev
    );
    const nextSignature = JSON.stringify({
      chainId: Number(chainId) || 31337,
      rpcUrl,
      walletIds: injectedWallets.map((entry) => entry.id).sort()
    });

    if (config && signature === nextSignature) {
      return {
        config,
        connectorMap
      };
    }

    const chain = createChainDefinition({ chainId, rpcUrl });
    const connectorFactories = injectedWallets.map(buildConnectorFactory);
    config = createConfig({
      chains: [chain],
      connectors: connectorFactories,
      multiInjectedProviderDiscovery: false,
      storage: createWalletStorage(storageKey),
      transports: {
        [chain.id]: http(rpcUrl)
      }
    });
    signature = nextSignature;
    connectorMap = new Map(getConnectors(config).map((connector) => [connector.id, connector]));

    try {
      await reconnect(config);
    } catch {
      // Ignore reconnect failures and let the app prompt explicitly on connect.
    }

    return {
      config,
      connectorMap
    };
  }

  async function resolveConnector(context) {
    const { connectorMap } = await ensureConfig(context);
    const connector = connectorMap.get(context.wallet?.id ?? "");
    if (!connector) {
      throw new Error("The selected wallet is unavailable.");
    }

    return connector;
  }

  return {
    async getSession(context) {
      await ensureConfig(context);
      const account = getAccount(config);
      if (account.connector?.id !== context.wallet?.id) {
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
      const normalizedChainId = Number(context.chainId) || 31337;
      const connector = await resolveConnector(context);
      try {
        const result = await connect(config, {
          connector,
          chainId: normalizedChainId
        });
        const account = result.accounts?.[0];
        return typeof account === "object" ? account.address : account;
      } catch (error) {
        const accountState = getAccount(config);
        if (
          error instanceof ConnectorAlreadyConnectedError &&
          accountState.connector?.id === connector.id &&
          accountState.address
        ) {
          if (accountState.chainId !== normalizedChainId) {
            await switchChain(config, {
              connector,
              chainId: normalizedChainId
            });
          }

          return accountState.address;
        }

        throw error;
      }
    },
    async disconnect(context) {
      const connector = await resolveConnector(context);
      await disconnect(config, { connector });
    },
    async getConnectedAddress(context) {
      const session = await this.getSession(context);
      return session.address;
    },
    async getWalletClient(context) {
      const normalizedChainId = Number(context.chainId) || 31337;
      const connector = await resolveConnector(context);
      const accountState = getAccount(config);

      if (accountState.connector?.id !== connector.id || accountState.status !== "connected") {
        await connect(config, {
          connector,
          chainId: normalizedChainId
        });
      } else if (accountState.chainId !== normalizedChainId) {
        await switchChain(config, {
          connector,
          chainId: normalizedChainId
        });
      }

      return getWalletClient(config, {
        connector,
        chainId: normalizedChainId
      });
    }
  };
}
