import { Mppx, tempo as tempoMethod } from "mppx/client";
import { Receipt } from "mppx";
import { createWalletClient, custom, defineChain } from "viem";
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

function resolveTempoChain(chainId) {
  return KNOWN_TEMPO_CHAINS.find((chain) => chain.id === chainId) ?? null;
}

function createFallbackChain(chainId) {
  return defineChain({
    id: chainId,
    name: `Tempo ${chainId}`,
    nativeCurrency: {
      name: "Tempo",
      symbol: "TEMPO",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: ["https://rpc.tempo.xyz"]
      }
    }
  });
}

function resolveWalletChain(chainId) {
  return resolveTempoChain(chainId) ?? createFallbackChain(chainId);
}

export async function mintClaimViaMpp({
  mode = "push",
  provider,
  walletClient = null,
  serviceUrl,
  walletAddress,
  payload
}) {
  const injectedPayerAddress =
    provider && typeof provider.request === "function"
      ? await provider
          .request({
            method: "eth_requestAccounts"
          })
          .then((accounts) => (Array.isArray(accounts) ? accounts[0] : ""))
      : "";
  const payerAddress =
    walletAddress ||
    walletClient?.account?.address ||
    injectedPayerAddress;

  if (!payerAddress) {
    throw new Error("Could not resolve the payer wallet address.");
  }

  const makeWalletClient = (chainId) => {
    if (walletClient) {
      const connectedChainId = Number(walletClient.chain?.id ?? 0) || null;
      if (!chainId || !connectedChainId || connectedChainId === chainId) {
        return walletClient;
      }
    }

    if (!provider || typeof provider.request !== "function") {
      throw new Error("This payer wallet cannot create an MPP transport for the requested chain.");
    }

    return createWalletClient({
      account: payerAddress,
      chain: resolveWalletChain(chainId),
      transport: custom(provider)
    });
  };

  const mppx = Mppx.create({
    polyfill: false,
    methods: [
      tempoMethod.charge({
        getClient: ({ chainId }) => makeWalletClient(chainId ?? tempo.id),
        mode
      })
    ]
  });

  const response = await mppx.fetch(serviceUrl, {
    body: JSON.stringify(payload),
    context: {
      account: payerAddress,
      mode
    },
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `MPP mint failed with ${response.status}.`);
  }

  const data = await response.json();
  let receipt = null;

  try {
    receipt = Receipt.fromResponse(response);
  } catch {
    receipt = null;
  }

  return {
    data,
    receipt
  };
}
