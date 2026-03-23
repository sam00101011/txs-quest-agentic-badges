import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  agenticBadgeRegistryAbi,
  badgeAssetRegistryAbi,
  identityRegistryAbi,
  reputationRegistryAbi
} from "./contractAbis.js";
import {
  buildAdvancedPolicyPayload,
  decodeAdvancedPolicyConfig
} from "./badgePolicies.js";
import {
  FARCASTER_MINIAPP_WALLET_ID,
  LOCAL_DEV_WALLET_ID,
  TEMPO_CONNECT_WALLET_ID
} from "./walletProviders.js";
import { createFarcasterWalletManager } from "./farcasterWalletManager.js";
import { createTempoWalletManager } from "./tempoWalletManager.js";
import { createWagmiWalletManager } from "./wagmiWalletManager.js";
import {
  LOCAL_DEV_PRIVATE_KEY,
  buildDirectClaimProof,
  buildUnlockAdapterPayload,
  decodeUnlockAdapterConfig
} from "./unlockAdapters.js";

const STORAGE_KEY = "agentic-poap-onchain-config-v1";
const contractWalletManager = createWagmiWalletManager({
  storageKey: "agentic-poap-wagmi-contract"
});
const paymentWalletManager = createWagmiWalletManager({
  storageKey: "agentic-poap-wagmi-mpp"
});
const tempoContractWalletManager = createTempoWalletManager({
  storageKey: "agentic-poap-tempo-contract"
});
const tempoPaymentWalletManager = createTempoWalletManager({
  storageKey: "agentic-poap-tempo-mpp"
});
const farcasterContractWalletManager = createFarcasterWalletManager();
const farcasterPaymentWalletManager = createFarcasterWalletManager();

const BADGE_TYPE_ENUMS = {
  EVENT: 0,
  ACHIEVEMENT: 1,
  CUSTOM: 2
};

const VERIFICATION_TYPE_ENUMS = {
  ONCHAIN_STATE: 0,
  MERKLE_PROOF: 1,
  ORACLE_ATTESTATION: 2,
  AGENT_ATTESTATION: 3
};

export const MODE_OPTIONS = [
  { value: "local", label: "Local Demo" },
  { value: "onchain", label: "Live Contract" }
];

export function defaultOnchainConfig() {
  return {
    mode: "local",
    networkName: "",
    deploymentProfileUrl: "",
    eventStartBlock: "",
    rpcUrl: "http://127.0.0.1:8545",
    chainId: "31337",
    badgeRegistryAddress: "",
    assetRegistryAddress: "",
    identityRegistryAddress: "",
    reputationRegistryAddress: "",
    balanceTokenAddress: "",
    walletProviderId: "",
    walletAddress: "",
    walletChainId: "",
    ownerAddress: "",
    isAttestor: false,
    isOwner: false,
    identityRegistered: false,
    identityPrimaryWallet: "",
    claimPageBaseUri: "",
    mppWalletProviderId: "",
    mppWalletAddress: "",
    mppWalletChainId: "",
    mppServiceUrl: "http://127.0.0.1:8787/api/mint/claim",
    oracleServiceUrl: "http://127.0.0.1:8789/api/oracle/proof",
    x402ServiceUrl: "http://127.0.0.1:8788/api/x402/proof",
    farcasterServiceUrl: "http://127.0.0.1:8791/api/farcaster/proof",
    mppPrice: "0.05"
  };
}

export function loadOnchainConfig() {
  if (typeof window === "undefined") {
    return defaultOnchainConfig();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultOnchainConfig();
    }

    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.error("Could not load onchain config", error);
    return defaultOnchainConfig();
  }
}

export function saveOnchainConfig(config) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
}

export function isOnchainConfigured(config) {
  return Boolean(config.rpcUrl && normalizeAddress(config.badgeRegistryAddress));
}

export async function connectWallet(config, provider) {
  if (!provider) {
    throw new Error("No wallet was selected.");
  }

  const normalizedConfig = normalizeConfig(config);
  const account =
    provider.kind === "local-dev" || provider.id === LOCAL_DEV_WALLET_ID
      ? (
          await getWalletContext(normalizedConfig, provider)
        ).account
      : await resolveWalletManager(provider, { payment: false }).connect({
          wallet: provider,
          chainId: normalizedConfig.chainId,
          rpcUrl: normalizedConfig.rpcUrl
        });

  return normalizeConfig({
    ...normalizedConfig,
    walletProviderId: provider.id ?? normalizedConfig.walletProviderId,
    walletAddress: account,
    walletChainId: normalizedConfig.chainId
  });
}

export async function connectPaymentWallet(config, provider) {
  if (!provider || provider.kind === "local-dev" || provider.id === LOCAL_DEV_WALLET_ID) {
    throw new Error("Connect a non-local wallet before using payer features.");
  }

  const normalizedConfig = normalizeConfig(config);
  const account = await resolveWalletManager(provider, { payment: true }).connect({
    wallet: provider,
    chainId: normalizedConfig.chainId,
    rpcUrl: normalizedConfig.rpcUrl
  });

  return normalizeConfig({
    ...normalizedConfig,
    mppWalletProviderId: provider.id ?? normalizedConfig.mppWalletProviderId,
    mppWalletAddress: account,
    mppWalletChainId: normalizedConfig.chainId
  });
}

export async function readOnchainRegistry(config) {
  const normalizedConfig = normalizeConfig(config);
  if (!isOnchainConfigured(normalizedConfig)) {
    throw new Error("Add an RPC URL and badge registry address first.");
  }

  const publicClient = createPublicClient({
    chain: createChain(normalizedConfig),
    transport: http(normalizedConfig.rpcUrl)
  });
  const badgeRegistryAddress = normalizedConfig.badgeRegistryAddress;
  const assetRegistryAddress =
    normalizedConfig.assetRegistryAddress ||
    (await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "assetRegistry"
    }));
  const identityRegistryAddress = normalizeAddress(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "identityRegistry"
    })
  );
  const reputationRegistryAddress = normalizeAddress(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "reputationRegistry"
    })
  );
  const claimPageBaseUri = await publicClient.readContract({
    address: badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "claimPageBaseUri"
  });
  const ownerAddress = await publicClient.readContract({
    address: badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "owner"
  });
  const nextDefinitionId = Number(
    await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "nextDefinitionId"
    })
  );

  const definitions = await Promise.all(
    [...Array(nextDefinitionId).keys()].map(async (index) => {
      const definitionResult = await publicClient.readContract({
        address: badgeRegistryAddress,
        abi: agenticBadgeRegistryAbi,
        functionName: "definitions",
        args: [BigInt(index)]
      });
      const definition = normalizeDefinitionRecord(definitionResult);
      const asset = await publicClient.readContract({
        address: assetRegistryAddress,
        abi: badgeAssetRegistryAbi,
        functionName: "getAsset",
        args: [definition.assetId]
      });

      return {
        id: Number(definition.id),
        name: definition.name,
        description: definition.description,
        creator: definition.creator,
        badgeType: badgeTypeFromEnum(definition.badgeType),
        verificationType: verificationTypeFromEnum(definition.verificationType),
        verificationData: definition.verificationData,
        unlockAdapterConfig: decodeUnlockAdapterConfig(
          verificationTypeFromEnum(definition.verificationType),
          definition.verificationData
        ),
        advancedPolicy: definition.advancedPolicy ?? "0x",
        advancedPolicyConfig: decodeAdvancedPolicyConfig(definition.advancedPolicy, {
          requiredIssuer: decodeUnlockAdapterConfig(
            verificationTypeFromEnum(definition.verificationType),
            definition.verificationData
          )?.unlockSignerAddress
        }),
        maxClaims: Number(definition.maxClaims),
        claimCount: Number(definition.claimCount),
        active: definition.active,
        createdAt: Number(asset.createdAt ?? 0),
        asset: {
          assetId: Number(asset.id),
          videoUri: asset.videoUri,
          posterUri: asset.posterUri,
          detailUri: asset.detailUri,
          edition: asset.edition,
          loopSeconds: Number(asset.loopSeconds),
          videoHash: asset.videoHash,
          posterHash: asset.posterHash
        }
      };
    })
  );
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const activeDefinitions = definitions.filter((definition) => definition.active !== false);
  const latestBlock = await publicClient.getBlockNumber();
  const eventStartBlock = resolveEventStartBlock(normalizedConfig.eventStartBlock, latestBlock);
  const claimLogs =
    nextDefinitionId === 0
      ? []
      : await getContractEventsInChunks({
          publicClient,
          address: badgeRegistryAddress,
          abi: agenticBadgeRegistryAbi,
          eventName: "BadgeClaimed",
          fromBlock: eventStartBlock,
          toBlock: latestBlock
        });
  const advancedEvidenceLogs =
    nextDefinitionId === 0
      ? []
      : await getContractEventsInChunks({
          publicClient,
          address: badgeRegistryAddress,
          abi: agenticBadgeRegistryAbi,
          eventName: "AdvancedEvidenceVerified",
          fromBlock: eventStartBlock,
          toBlock: latestBlock
        });
  const evidenceByClaimKey = new Map(
    advancedEvidenceLogs.map((log) => [
      buildEvidenceKey(log.args.defId, log.args.agent, log.args.proofHash),
      {
        issuer: log.args.issuer,
        contextId: log.args.contextId,
        expiresAt: Number(log.args.expiresAt),
        nonceHash: log.args.nonceHash,
        proofHash: log.args.proofHash
      }
    ])
  );

  const sortedLogs = [...claimLogs].sort((first, second) => {
    const blockDelta = Number((first.blockNumber ?? 0n) - (second.blockNumber ?? 0n));
    if (blockDelta !== 0) {
      return blockDelta;
    }

    return Number((first.logIndex ?? 0) - (second.logIndex ?? 0));
  });

  const uniqueAgents = [...new Set(sortedLogs.map((log) => log.args.agent.toLowerCase()))];
  const derivedCountsByAgent = sortedLogs.reduce((counts, log) => {
    const key = log.args.agent.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
  const reputationByAgent = new Map(
    await Promise.all(
      uniqueAgents.map(async (agent) => [
        agent,
        await readReputationSummary(publicClient, reputationRegistryAddress, agent)
      ])
    )
  );

  const claims = [];
  for (const [index, log] of sortedLogs.entries()) {
    const claimUri = await publicClient.readContract({
      address: badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "claimURI",
      args: [log.args.agent, log.args.defId]
    });
    const claim = parseClaimUri(claimUri);

    claims.unshift({
      id: index + 1,
      definitionId: Number(log.args.defId),
      agent: log.args.agent,
      claimedAt: Number(
        claim.attributes?.find?.((entry) => entry.trait_type === "Claimed At")?.value ?? 0
      ),
      issuedBy: "",
      proofHash: log.args.proofHash,
      claimUri,
      claim,
      evidenceSummary:
        evidenceByClaimKey.get(
          buildEvidenceKey(log.args.defId, log.args.agent, log.args.proofHash)
        ) ??
        deriveDefinitionEvidenceSummary(
          definitionsById.get(Number(log.args.defId)),
          log.args.proofHash
        ),
      reputationSummary:
        reputationByAgent.get(log.args.agent.toLowerCase()) ??
        deriveReputationSummary(derivedCountsByAgent.get(log.args.agent.toLowerCase()) ?? 0, claim)
    });
  }

  const walletAddress = normalizeAddress(normalizedConfig.walletAddress);
  const isAttestor = walletAddress
    ? await publicClient.readContract({
        address: badgeRegistryAddress,
        abi: agenticBadgeRegistryAbi,
        functionName: "attestors",
        args: [walletAddress]
      })
    : false;
  const isOwner =
    Boolean(walletAddress) && ownerAddress.toLowerCase() === walletAddress.toLowerCase();
  const identityRegistered =
    Boolean(walletAddress) && Boolean(identityRegistryAddress)
      ? Boolean(
          await publicClient.readContract({
            address: identityRegistryAddress,
            abi: identityRegistryAbi,
            functionName: "isRegistered",
            args: [walletAddress]
          })
        )
      : false;
  const identityPrimaryWallet =
    identityRegistered && identityRegistryAddress
      ? normalizeAddress(
          await publicClient.readContract({
            address: identityRegistryAddress,
            abi: identityRegistryAbi,
            functionName: "getAgentWallet",
            args: [walletAddress]
          })
        )
      : "";

  return {
    state: {
      version: 1,
      nextDefinitionId,
      nextClaimId: claims.length + 1,
      definitions: activeDefinitions.sort((first, second) => second.id - first.id),
      claims
    },
    config: normalizeConfig({
      ...normalizedConfig,
      assetRegistryAddress,
      identityRegistryAddress,
      reputationRegistryAddress,
      claimPageBaseUri,
      ownerAddress,
      isAttestor,
      isOwner,
      identityRegistered,
      identityPrimaryWallet
    })
  };
}

export async function defineBadgeOnchain(config, input, provider) {
  const normalizedConfig = normalizeConfig(config);
  if (!isOnchainConfigured(normalizedConfig)) {
    throw new Error("Add an RPC URL and badge registry address first.");
  }

  const { publicClient, walletClient, account } = await getWalletContext(normalizedConfig, provider);
  const assetRegistryAddress =
    normalizedConfig.assetRegistryAddress ||
    (await publicClient.readContract({
      address: normalizedConfig.badgeRegistryAddress,
      abi: agenticBadgeRegistryAbi,
      functionName: "assetRegistry"
    }));
  const unlockPayload = buildUnlockAdapterPayload(input, {
    fallbackTargetAddress: normalizedConfig.badgeRegistryAddress
  });
  const advancedPolicyPayload = buildAdvancedPolicyPayload({
    ...input,
    unlockSignerAddress: unlockPayload.unlockAdapterConfig?.unlockSignerAddress,
    unlockAdapterType: unlockPayload.unlockAdapterType
  });
  const assetRegistration =
    input.assetId > 0
      ? null
      : await registerAsset(publicClient, walletClient, {
          account,
          address: assetRegistryAddress,
          asset: input
        });
  const assetId = input.assetId > 0 ? input.assetId : assetRegistration?.assetId;

  const txHash = await walletClient.writeContract({
    account,
    address: normalizedConfig.badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "defineBadge",
    args: [
      input.name,
      input.description,
      BigInt(assetId),
      BADGE_TYPE_ENUMS[input.badgeType] ?? BADGE_TYPE_ENUMS.CUSTOM,
      VERIFICATION_TYPE_ENUMS[unlockPayload.verificationType] ?? VERIFICATION_TYPE_ENUMS.ONCHAIN_STATE,
      unlockPayload.verificationData,
      BigInt(Number(input.maxClaims) || 0),
      0,
      advancedPolicyPayload.advancedPolicy
    ]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Badge definition transaction reverted.");
  }
  const definitionId = findEventArg({
    abi: agenticBadgeRegistryAbi,
    receipt,
    eventName: "BadgeDefined",
    argName: "defId"
  });

  return {
    txHash,
    assetTxHash: assetRegistration?.txHash ?? "",
    definitionTxHash: txHash,
    account,
    assetId: Number(assetId),
    definitionId: Number(definitionId),
    config: normalizeConfig({
      ...normalizedConfig,
      assetRegistryAddress,
      walletAddress: account
    })
  };
}

export async function issueBadgeClaimOnchain(config, input, providerInput) {
  const normalizedConfig = normalizeConfig(config);
  const provider = providerInput?.wallet ?? providerInput;
  const paymentProvider = providerInput?.paymentWallet ?? null;
  const { publicClient, walletClient, account } = await getWalletContext(normalizedConfig, provider);
  const isAttestor = await publicClient.readContract({
    address: normalizedConfig.badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "attestors",
    args: [account]
  });

  const normalizedAgent = normalizeAddress(input.agent);
  if (!normalizedAgent) {
    throw new Error("Enter a valid 0x agent address.");
  }

  const definitionId = BigInt(Number(input.definitionId));
  const definition = input.definition ?? null;
  const unlockAdapterConfig =
    input.unlockAdapterConfig ??
    definition?.unlockAdapterConfig ??
    decodeUnlockAdapterConfig(definition?.verificationType, definition?.verificationData);
  const executionPath = input.executionPath ?? "auto";
  const isSelfClaim = normalizedAgent.toLowerCase() === account.toLowerCase();
  const manualOnly = unlockAdapterConfig?.unlockAdapterType === "MANUAL_ATTESTOR";
  const paymentContext =
    paymentProvider && unlockAdapterConfig?.unlockAdapterType === "PAYMENT_HISTORY"
      ? await getPaymentWalletContext(normalizedConfig, paymentProvider)
      : { walletClient: null, account: "" };

  let functionName = "claim";
  let args = [definitionId, "0x"];
  const effectiveChainId = Number(publicClient.chain?.id ?? normalizedConfig.chainId ?? 0);

  if (executionPath === "attestor") {
    if (!manualOnly) {
      throw new Error("Attestor recording is limited to manual badges. Proof-based badges must self-claim.");
    }
    functionName = "attestAndRecord";
    args = [definitionId, normalizedAgent];
  } else if (executionPath === "direct") {
    if (!isSelfClaim) {
      throw new Error("Direct self-claim only works when the connected wallet matches the agent.");
    }
    if (manualOnly) {
      throw new Error("This badge is configured for manual attestor approval. Use the attestor path.");
    }

    args = [
      definitionId,
      await buildDirectClaimProof({
        badgeRegistryAddress: normalizedConfig.badgeRegistryAddress,
        definitionId: Number(input.definitionId),
        agent: normalizedAgent,
        chainId: effectiveChainId,
        account,
        walletClient,
        paymentAccount: paymentContext.account,
        paymentWalletClient: paymentContext.walletClient,
        unlockAdapterConfig,
        advancedPolicyConfig: definition?.advancedPolicyConfig,
        providedProof: input.proofPackage,
        x402ServiceUrl: normalizedConfig.x402ServiceUrl,
        oracleServiceUrl: normalizedConfig.oracleServiceUrl,
        farcasterServiceUrl: normalizedConfig.farcasterServiceUrl
      })
    ];
  } else if (manualOnly) {
    functionName = "attestAndRecord";
    args = [definitionId, normalizedAgent];
  } else if (!isSelfClaim) {
    throw new Error("Proof-based badges must be claimed by the target agent wallet.");
  } else {
    args = [
      definitionId,
      await buildDirectClaimProof({
        badgeRegistryAddress: normalizedConfig.badgeRegistryAddress,
        definitionId: Number(input.definitionId),
        agent: normalizedAgent,
        chainId: effectiveChainId,
        account,
        walletClient,
        paymentAccount: paymentContext.account,
        paymentWalletClient: paymentContext.walletClient,
        unlockAdapterConfig,
        advancedPolicyConfig: definition?.advancedPolicyConfig,
        providedProof: input.proofPackage,
        x402ServiceUrl: normalizedConfig.x402ServiceUrl,
        oracleServiceUrl: normalizedConfig.oracleServiceUrl,
        farcasterServiceUrl: normalizedConfig.farcasterServiceUrl
      })
    ];
  }

  if (!isAttestor && functionName === "attestAndRecord") {
    throw new Error(
      manualOnly
        ? "This badge requires an authorized attestor to record the claim."
        : "Connect the target agent wallet to self-claim the proof-based badge."
    );
  }

  const txHash = await walletClient.writeContract({
    account,
    address: normalizedConfig.badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName,
    args
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Badge claim transaction reverted.");
  }

  return {
    account,
    definitionId: Number(input.definitionId),
    agent: normalizedAgent,
    mode:
      functionName === "claim"
        ? unlockAdapterConfig?.unlockAdapterType === "PAYMENT_HISTORY"
          ? "payment-proof"
          : unlockAdapterConfig?.unlockAdapterType === "X402_HISTORY"
          ? "x402-proof"
          : unlockAdapterConfig?.unlockAdapterType === "FARCASTER_ACCOUNT"
          ? "farcaster-proof"
          : unlockAdapterConfig?.unlockAdapterType === "ORACLE_EVENT"
          ? "oracle-proof"
          : unlockAdapterConfig?.unlockAdapterType === "AGENT_REP"
            ? "agent-proof"
            : "self-claim"
        : "attestor",
    txHash
  };
}

export async function authorizeConnectedAttestor(config, provider) {
  const normalizedConfig = normalizeConfig(config);
  const { publicClient, walletClient, account } = await getWalletContext(normalizedConfig, provider);

  const txHash = await walletClient.writeContract({
    account,
    address: normalizedConfig.badgeRegistryAddress,
    abi: agenticBadgeRegistryAbi,
    functionName: "setAttestor",
    args: [account, true]
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return normalizeConfig({
    ...normalizedConfig,
    walletAddress: account,
    isAttestor: true
  });
}

export async function registerConnectedIdentity(config, provider) {
  const normalizedConfig = normalizeConfig(config);
  const { publicClient, walletClient, account } = await getWalletContext(normalizedConfig, provider);
  const identityRegistryAddress =
    normalizedConfig.identityRegistryAddress ||
    normalizeAddress(
      await publicClient.readContract({
        address: normalizedConfig.badgeRegistryAddress,
        abi: agenticBadgeRegistryAbi,
        functionName: "identityRegistry"
      })
    );

  if (!identityRegistryAddress) {
    throw new Error("This deployment does not expose an identity registry.");
  }

  const txHash = await walletClient.writeContract({
    account,
    address: identityRegistryAddress,
    abi: identityRegistryAbi,
    functionName: "registerSelf"
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error("Identity registration transaction reverted.");
  }

  return {
    txHash,
    config: normalizeConfig({
      ...normalizedConfig,
      walletAddress: account,
      identityRegistryAddress,
      identityRegistered: true,
      identityPrimaryWallet: account
    })
  };
}

export function shortErrorMessage(error) {
  if (error?.code === 4001 || /user rejected/i.test(error?.message ?? "")) {
    return "The wallet request was rejected.";
  }
  if (error?.code === 4902 || /unrecognized chain/i.test(error?.message ?? "")) {
    return "The selected wallet does not know this chain yet. Add the network in the wallet first.";
  }
  if (/unknown provider rpc error/i.test(error?.message ?? "")) {
    return "The connected wallet could not complete the requested network action.";
  }
  if (/switch chain/i.test(error?.message ?? "") || /chain/i.test(error?.shortMessage ?? "")) {
    return error?.shortMessage || error?.message || "Switch the wallet to the expected chain and try again.";
  }
  return (
    error?.shortMessage ||
    error?.cause?.shortMessage ||
    error?.message ||
    "Transaction failed."
  );
}

function normalizeConfig(config = {}) {
  const defaults = defaultOnchainConfig();
  return {
    ...defaults,
    ...config,
    mode: config.mode === "onchain" ? "onchain" : "local",
    networkName: config.networkName?.trim?.() ?? defaults.networkName,
    deploymentProfileUrl: config.deploymentProfileUrl?.trim?.() ?? defaults.deploymentProfileUrl,
    eventStartBlock: normalizeBlockMarker(
      config.eventStartBlock ?? config.deploymentBlock ?? defaults.eventStartBlock
    ),
    rpcUrl: config.rpcUrl?.trim?.() ?? defaults.rpcUrl,
    chainId: String(config.chainId ?? defaults.chainId),
    badgeRegistryAddress: normalizeAddress(config.badgeRegistryAddress),
    assetRegistryAddress: normalizeAddress(config.assetRegistryAddress),
    identityRegistryAddress: normalizeAddress(config.identityRegistryAddress),
    reputationRegistryAddress: normalizeAddress(config.reputationRegistryAddress),
    balanceTokenAddress: normalizeAddress(config.balanceTokenAddress),
    walletProviderId: config.walletProviderId?.trim?.() ?? defaults.walletProviderId,
    walletAddress: normalizeAddress(config.walletAddress),
    walletChainId: String(config.walletChainId ?? defaults.walletChainId),
    ownerAddress: normalizeAddress(config.ownerAddress),
    isAttestor: Boolean(config.isAttestor),
    isOwner: Boolean(config.isOwner),
    identityRegistered: Boolean(config.identityRegistered),
    identityPrimaryWallet: normalizeAddress(config.identityPrimaryWallet),
    claimPageBaseUri: config.claimPageBaseUri?.trim?.() ?? defaults.claimPageBaseUri,
    mppWalletProviderId: config.mppWalletProviderId?.trim?.() ?? defaults.mppWalletProviderId,
    mppWalletAddress: normalizeAddress(config.mppWalletAddress),
    mppWalletChainId: String(config.mppWalletChainId ?? defaults.mppWalletChainId),
    mppServiceUrl: config.mppServiceUrl?.trim?.() ?? defaults.mppServiceUrl,
    oracleServiceUrl: config.oracleServiceUrl?.trim?.() ?? defaults.oracleServiceUrl,
    x402ServiceUrl: config.x402ServiceUrl?.trim?.() ?? defaults.x402ServiceUrl,
    farcasterServiceUrl: config.farcasterServiceUrl?.trim?.() ?? defaults.farcasterServiceUrl,
    mppPrice: String(config.mppPrice ?? defaults.mppPrice)
  };
}

async function getWalletContext(config, provider) {
  if (!provider) {
    throw new Error("No wallet was selected.");
  }

  const chain = createChain(config);
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl)
  });

  if (provider.kind === "local-dev" || provider.id === LOCAL_DEV_WALLET_ID) {
    const localAccount = privateKeyToAccount(LOCAL_DEV_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account: localAccount,
      chain,
      transport: http(config.rpcUrl)
    });

    return {
      publicClient,
      walletClient,
      account: localAccount.address
    };
  }

  const walletClient = await resolveWalletManager(provider, { payment: false }).getWalletClient({
    wallet: provider,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl
  });
  const account = walletClient.account?.address;

  if (!account) {
    throw new Error("Wallet connection was cancelled.");
  }

  return {
    publicClient,
    walletClient,
    account
  };
}

async function getPaymentWalletContext(config, provider) {
  if (!provider || provider.kind === "local-dev" || provider.id === LOCAL_DEV_WALLET_ID) {
    return {
      walletClient: null,
      account: ""
    };
  }

  const chain = createChain(config);
  const walletClient = await resolveWalletManager(provider, { payment: true }).getWalletClient({
    wallet: provider,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl
  });
  const account = walletClient.account?.address;

  if (!account) {
    throw new Error("MPP payer wallet connection was cancelled.");
  }

  return {
    walletClient,
    account
  };
}

export async function resolvePaymentWalletSession(config, provider) {
  const normalizedConfig = normalizeConfig(config);
  return getPaymentWalletContext(normalizedConfig, provider);
}

async function registerAsset(publicClient, walletClient, { account, address, asset }) {
  const zeroBytes32 = `0x${"0".repeat(64)}`;
  const videoHash = asset.videoHash || zeroBytes32;
  const posterHash = asset.posterHash || zeroBytes32;
  if (asset.videoUri) {
    requireHash(videoHash, "Video hash");
  }
  if (asset.posterUri) {
    requireHash(posterHash, "Poster hash");
  }

  const txHash = await walletClient.writeContract({
    account,
    address,
    abi: badgeAssetRegistryAbi,
    functionName: "registerAsset",
    args: [
      {
        videoUri: asset.videoUri,
        posterUri: asset.posterUri,
        detailUri: asset.detailUri,
        videoHash,
        posterHash,
        edition: asset.edition,
        loopSeconds: Number(asset.loopSeconds) || 0
      }
    ]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const assetId = findEventArg({
    abi: badgeAssetRegistryAbi,
    receipt,
    eventName: "AssetRegistered",
    argName: "assetId"
  });
  return {
    assetId: Number(assetId),
    txHash
  };
}

function requireHash(value, label) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value ?? "")) {
    throw new Error(`${label} must be a 32-byte 0x hash for live asset registration.`);
  }
}

function findEventArg({ abi, receipt, eventName, argName }) {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics
      });
      if (decoded.eventName === eventName) {
        return decoded.args[argName];
      }
    } catch {
      // Ignore logs from unrelated contracts.
    }
  }

  throw new Error(`Could not find ${eventName} in the transaction receipt.`);
}

function parseClaimUri(claimUri) {
  const commaIndex = claimUri.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid claimURI.");
  }

  const payload = claimUri.slice(commaIndex + 1).replace(/ /g, "+");
  const binary = window.atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function badgeTypeFromEnum(value) {
  return Object.keys(BADGE_TYPE_ENUMS).find((key) => BADGE_TYPE_ENUMS[key] === Number(value)) ?? "CUSTOM";
}

function verificationTypeFromEnum(value) {
  return (
    Object.keys(VERIFICATION_TYPE_ENUMS).find(
      (key) => VERIFICATION_TYPE_ENUMS[key] === Number(value)
    ) ?? "ONCHAIN_STATE"
  );
}

function normalizeDefinitionRecord(definition) {
  if (!Array.isArray(definition)) {
    return definition;
  }

  return {
    id: definition[0],
    name: definition[1],
    description: definition[2],
    assetId: definition[3],
    badgeType: definition[4],
    verificationType: definition[5],
    verificationData: definition[6],
    creator: definition[7],
    maxClaims: definition[8],
    claimCount: definition[9],
    expiresAt: definition[10],
    active: definition[11],
    advancedPolicy: definition[12]
  };
}

function buildEvidenceKey(definitionId, agent, proofHash) {
  return `${Number(definitionId)}:${String(agent).toLowerCase()}:${String(proofHash).toLowerCase()}`;
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

async function readReputationSummary(publicClient, reputationRegistryAddress, agent) {
  if (!reputationRegistryAddress) {
    return null;
  }

  try {
    const [count, summaryValue, lastUpdatedAt] = await publicClient.readContract({
      address: reputationRegistryAddress,
      abi: reputationRegistryAbi,
      functionName: "getSummary",
      args: [agent]
    });

    return {
      count: Number(count),
      summaryValue: Number(summaryValue),
      lastUpdatedAt: Number(lastUpdatedAt)
    };
  } catch {
    return null;
  }
}

function deriveReputationSummary(count, claim) {
  const claimedAt = Number(
    claim?.attributes?.find?.((entry) => entry.trait_type === "Claimed At")?.value ?? 0
  );

  return {
    count: Number(count),
    summaryValue: Number(count),
    lastUpdatedAt: claimedAt
  };
}

function normalizeAddress(value) {
  const trimmed = value?.trim?.() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

function createChain(config) {
  const chainId = Number(config.chainId) || 31337;

  return defineChain({
    id: chainId,
    name: `Agentic Chain ${chainId}`,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl]
      }
    }
  });
}

function normalizeBlockMarker(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }

  try {
    const blockNumber = trimmed.startsWith("0x") ? BigInt(trimmed) : BigInt(trimmed);
    return blockNumber >= 0n ? blockNumber.toString() : "";
  } catch {
    return "";
  }
}

function resolveEventStartBlock(value, latestBlock) {
  const normalized = normalizeBlockMarker(value);
  if (!normalized) {
    return 0n;
  }

  const parsed = BigInt(normalized);
  if (parsed < 0n) {
    return 0n;
  }

  return parsed > latestBlock ? latestBlock : parsed;
}

async function getContractEventsInChunks({
  publicClient,
  address,
  abi,
  eventName,
  fromBlock = 0n,
  toBlock
}) {
  const latestBlock = typeof toBlock === "bigint" ? toBlock : await publicClient.getBlockNumber();
  if (fromBlock > latestBlock) {
    return [];
  }

  const chunkSize = 90_000n;
  const logs = [];
  let cursor = fromBlock;

  while (cursor <= latestBlock) {
    const chunkTo =
      cursor + chunkSize - 1n < latestBlock ? cursor + chunkSize - 1n : latestBlock;
    const chunkLogs = await publicClient.getContractEvents({
      address,
      abi,
      eventName,
      fromBlock: cursor,
      toBlock: chunkTo
    });
    logs.push(...chunkLogs);
    cursor = chunkTo + 1n;
  }

  return logs;
}

export async function syncWagmiConnections(config, wallets = []) {
  const normalizedConfig = normalizeConfig(config);
  const expectsInjectedContractWallet =
    Boolean(normalizedConfig.walletProviderId) &&
    normalizedConfig.walletProviderId !== LOCAL_DEV_WALLET_ID;
  const expectsInjectedPayerWallet =
    Boolean(normalizedConfig.mppWalletProviderId) &&
    normalizedConfig.mppWalletProviderId !== LOCAL_DEV_WALLET_ID;

  const contractWallet =
    wallets.find((wallet) => wallet.id === normalizedConfig.walletProviderId && !wallet.isLocalDev) ?? null;
  const payerWallet =
    wallets.find((wallet) => wallet.id === normalizedConfig.mppWalletProviderId && !wallet.isLocalDev) ?? null;
  const walletSession = contractWallet
    ? await resolveWalletManager(contractWallet, { payment: false }).getSession({
        wallet: contractWallet,
        wallets,
        chainId: normalizedConfig.chainId,
        rpcUrl: normalizedConfig.rpcUrl
      })
    : { address: "", chainId: null };
  const payerSession = payerWallet
    ? await resolveWalletManager(payerWallet, { payment: true }).getSession({
        wallet: payerWallet,
        wallets,
        chainId: normalizedConfig.chainId,
        rpcUrl: normalizedConfig.rpcUrl
      })
    : { address: "", chainId: null };
  const normalizedWalletAddress = normalizeAddress(walletSession.address);
  const previousWalletAddress = normalizeAddress(normalizedConfig.walletAddress);
  const normalizedPayerAddress = normalizeAddress(payerSession.address);
  const nextWalletAddress = contractWallet
    ? normalizedWalletAddress
    : expectsInjectedContractWallet
      ? ""
      : normalizedConfig.walletAddress;
  const nextPayerAddress = payerWallet
    ? normalizedPayerAddress
    : expectsInjectedPayerWallet
      ? ""
      : normalizedConfig.mppWalletAddress;
  const nextWalletChainId = contractWallet
    ? walletSession.chainId
      ? String(walletSession.chainId)
      : ""
    : expectsInjectedContractWallet
      ? ""
      : normalizedConfig.walletChainId || normalizedConfig.chainId;
  const nextPayerChainId = payerWallet
    ? payerSession.chainId
      ? String(payerSession.chainId)
      : ""
    : expectsInjectedPayerWallet
      ? ""
      : normalizedConfig.mppWalletChainId;
  const walletChanged =
    nextWalletAddress.toLowerCase() !== previousWalletAddress.toLowerCase();

  return normalizeConfig({
    ...normalizedConfig,
    walletAddress: nextWalletAddress,
    isAttestor:
      walletChanged ? false : normalizedConfig.isAttestor,
    isOwner:
      walletChanged ? false : normalizedConfig.isOwner,
    mppWalletAddress: nextPayerAddress,
    walletChainId: nextWalletChainId,
    mppWalletChainId: nextPayerChainId
  });
}

function isTempoConnectWallet(wallet) {
  return wallet?.kind === "tempo-connect" || wallet?.id === TEMPO_CONNECT_WALLET_ID;
}

function isFarcasterMiniAppWallet(wallet) {
  return wallet?.kind === "farcaster-miniapp" || wallet?.id === FARCASTER_MINIAPP_WALLET_ID;
}

function resolveWalletManager(wallet, { payment = false } = {}) {
  if (isFarcasterMiniAppWallet(wallet)) {
    return payment ? farcasterPaymentWalletManager : farcasterContractWalletManager;
  }
  if (isTempoConnectWallet(wallet)) {
    return payment ? tempoPaymentWalletManager : tempoContractWalletManager;
  }

  return payment ? paymentWalletManager : contractWalletManager;
}
