import { buildAdvancedPolicyPayload } from "./badgePolicies.js";
import {
  getBadgeMarkdownByPinId,
  getBadgeMarkdownBySlug
} from "./generated/badgeMarkdownCatalog.js";
import { LOCAL_DEV_ACCOUNT, buildUnlockAdapterPayload, unlockAdapterDefaults } from "./unlockAdapters.js";

const PIN_MEDIA_MANIFEST = Object.freeze({
  pin1: {
    posterHash: "0x68f593ef133373555962d140a58c18ddaa6e5ef36e4ff311defbafcdb7f0d021",
    videoHash: "0xfb809fb10073725090b967e5720ff48b9100c7d093190d1ff8b497aab64532f6"
  },
  pin2: {
    posterHash: "0x5be11dffaa27e512817458cd0e17f61a38a4356ecdd41c464d33c7e200dbb6dd",
    videoHash: "0x8c3a31400dd8102b473c8f8509958dab6c3ccfedb023323cbfcacc23e4e16d71"
  },
  pin3: {
    posterHash: "0xee6335373913338bdf28fa7acd737278a7e5c242ae584f952ebc89cff3187866",
    videoHash: "0x03d6ff2b973bec9846c570e754f7682e08361dd3d73f1c4005089683c46d2ef1"
  },
  pin4: {
    posterHash: "0x6703b32dfff7d2b06eef742839c2aec38c69942ee9362dafdd0e05ba1221af93",
    videoHash: "0x7489cc159e90a59a81b50524d5516b88fbcc73c8ff3fa8e15737bcd2bb752ad1"
  },
  pin5: {
    posterHash: "0x223b0662871e488a5cbacddfcfafd64b104b6231089a25fe0e85a7c017caca86",
    videoHash: "0xff3e5eff19b68d601eee8fc099da342f2c3eea90fe7164a700cc3a6a8c07950f"
  },
  pin6: {
    posterHash: "0x547dde4baa39e7744f1924ecd127c79c47e2ab06bb8471545c4320e6b47fc91c",
    videoHash: ""
  },
  pin7: {
    posterHash: "0x7a3f5cec4399158e175aad6b6a67c1c4d67a1d7745eef301a8632b9681bb592e",
    videoHash: "0xd6d7f8f81a2e7619003ce2b22eb1f8e5c491eae5b76ecf19a8d777267b18a52c"
  },
  pin8: {
    posterHash: "0x7945a850189b9f06be6f3ea09fd2c70d4132585c2425d2e66e01dc449967ad69",
    videoHash: ""
  },
  pin9: {
    posterHash: "0x99a0d4f1bc2cb78e65d9d3fd79b93f9437f3fac091027b3b933029e73f94e0bb",
    videoHash: "0xcaf7e4887c9f85e4cfa86079a7506d20cd804f50487f6ba4a03c953dc2a283d1"
  },
  pin10: {
    posterHash: "0xc496cd393012cddf031c364d338648457ebc34399e66ac84075c0339af4a4798",
    videoHash: "0x95106f24c72dd7f1be76717619b0561512ebb15bdae99fb37008a63b2a6757b4"
  },
  pin11: {
    posterHash: "0x1fc5ce2661f8bd740e708ac54859b2682687019474daf1990454b73ad100a3f5",
    videoHash: "0xf861864845e4f7fe68607af304cc36b89c912f442fc43e43182a1f88bcbceed9"
  },
  pin12: {
    posterHash: "0x92132ebfb536802064f24614f25317da24f94c2073e757942d619c68601102f3",
    videoHash: "0xda072babaf23fb933b8d886be1f91151deb2f12935475541e7c33b890f629f57"
  },
  pin13: {
    posterHash: "0x4a6ff0932d3c9a64fe40256b84ad7248d7f64117ab1e73fd38a8cd6df59b9e26",
    videoHash: "0xb1350d994ed73860e1a9250c3df9375a564995e21431eefc456f3523120e291b"
  },
  pin14: {
    posterHash: "0x5f885eae3baa5d689bb78dcc372df6f5a3363a398c02fc5c002b984edf0dddf5",
    videoHash: ""
  },
  pin15: {
    posterHash: "0x9b308255cf9e740b77f387e38052ca071b10048678a4448e6f3764a1d743a3c4",
    videoHash: ""
  },
  pin16: {
    posterHash: "0xc61f234f3fa1eae6ec65da7c0899a3bd439af248def7227bb99074660b42656d",
    videoHash: "0xe76b811475279d5efefef7a48182bbd3aa0044c9e9e69622c34f79d26297506d"
  },
  pin17: {
    posterHash: "0x90c0903335da50b5c3ca12ed0b38c6271103163185f7437fd248a38258d132ac",
    videoHash: "0xe10e4cf9656f414f0bd1fd9ad6669e69a405985926c2cba683c4f82a5a7ac2ba"
  },
  pin18: {
    posterHash: "0x57b43755edae00ef2cbfc3a4f6f0a093c59a08364da566e960de72e4acb5e502",
    videoHash: ""
  },
  pin19: {
    posterHash: "0xb16c425706d2f689aa2f769277ed2122f2ab057e7045c35c1dc5092b4dcde199",
    videoHash: "0xa2d78db50bc1ce27d21863c2bb0bfa573794da2b9247090de766199cfbd6206e"
  },
  pin20: {
    posterHash: "0xea0278bc69f149ab59a098ab8f04a166883c90c64ed9ec1e33888e07a1c7fe04",
    videoHash: ""
  },
  pin21: {
    posterHash: "0xbdf11fb4ba1231ef8c36745d68a2bd1ff4a8f67c821e11b87e9f7a7df589c701",
    videoHash: ""
  },
  pin22: {
    posterHash: "0x9032dc9e41d85df9b7e165bb05dcdb0f0c3ca216c78e6e81975fe2eb23fe9300",
    videoHash: ""
  },
  pin23: {
    posterHash: "0xd37e2c4a7f059f04eeb6a1053497923e3ef868d99c88673db15aaf21d70f7afd",
    videoHash: ""
  },
  pin24: {
    posterHash: "0x64471a389da06050d608d45b6664dde05e80fe0e8cda91efb5fba1ee7a3e79f0",
    videoHash: ""
  },
  pin25: {
    posterHash: "0x62292ca544ce904550c394cbef6acc504645759dea75a347ea173b863afe0d68",
    videoHash: "0x52a3e837102a01761297bdbe49405fc4e9f9845112de7c755612d63c24b86274"
  },
  pin26: {
    posterHash: "0x422ef3d03ec08abc0c94c3386b8b8d28be314ece314bc1c2a9123c965fd409b4",
    videoHash: ""
  },
  pin27: {
    posterHash: "0x95464e8fd047d7c63b1314a45204274e53d1a1df4b2b20655afd7343d99c65a3",
    videoHash: ""
  },
  pin28: {
    posterHash: "0xc4fb8849f4ddf8fb5d78d0cc62357a1aad24a1d381ae1a3d9735967a689948ed",
    videoHash: ""
  },
  pin29: {
    posterHash: "0xdaa333193e3520fe8af7613a9038030bdaa8cc7ad13a96c2c9d2d4da03866f8a",
    videoHash: ""
  },
  pin30: {
    posterHash: "0xde40d8a5e8e537cece72c4ab5cedb15cad8baa2cd0c4438e80df843c8bbbd5c1",
    videoHash: ""
  }
});

const PIN_ASSET_VERSION = "20260322b";
const KAWAII_COLLECTION_IDS = Object.freeze([
  "doodles",
  "pudgy-penguins",
  "lil-pudgys",
  "cool-cats-nft",
  "karafuru"
]);
const PEPE_COLLECTION_IDS = Object.freeze([
  "pepe",
  "rare-pepe",
  "pepe-the-frog",
  "pepe-cards",
  "pepe-frog"
]);
const YIELD_FARMING_PROTOCOL_IDS = Object.freeze([
  "aave",
  "aerodrome",
  "balancer",
  "beefy",
  "compound",
  "convex",
  "curve",
  "pendle",
  "sushiswap",
  "uniswap",
  "velodrome",
  "yearn"
]);
const OPAL_PROTOCOL_IDS = Object.freeze([
  ...YIELD_FARMING_PROTOCOL_IDS,
  "bao-finance"
]);

function getBadgeMarkdownEntry({ slug = "", samplePinId = "" } = {}) {
  return getBadgeMarkdownBySlug(slug) ?? getBadgeMarkdownByPinId(samplePinId) ?? null;
}

function mergeBadgeCatalogCopy(entry) {
  const badgeMarkdown = getBadgeMarkdownEntry(entry);
  if (!badgeMarkdown) {
    return {
      ...entry,
      claimCondition: entry.claimCondition ?? "",
      catalogBadgeTypeLabel: entry.catalogBadgeTypeLabel ?? ""
    };
  }

  return {
    ...entry,
    name: badgeMarkdown.name || entry.name,
    description: badgeMarkdown.description || entry.description,
    claimCondition: badgeMarkdown.claimCondition || entry.claimCondition || "",
    catalogBadgeTypeLabel: badgeMarkdown.badgeType || entry.catalogBadgeTypeLabel || ""
  };
}

export const PIN_ASSET_LIBRARY = Object.freeze(
  Object.fromEntries(
    Object.entries(PIN_MEDIA_MANIFEST).map(([pinId, entry], index) => [
      pinId,
      {
        assetId: index,
        videoUri: entry.videoHash ? `/pins/${pinId}.mp4?v=${PIN_ASSET_VERSION}` : "",
        posterUri: `/pins/${pinId}.jpg?v=${PIN_ASSET_VERSION}`,
        detailUri: `/?samplePin=${pinId}`,
        edition: `${pinId}-loop`,
        loopSeconds: 5,
        videoHash: entry.videoHash,
        posterHash: entry.posterHash
      }
    ])
  )
);

export const SAMPLE_PIN_OPTIONS = Object.freeze(
  Object.keys(PIN_ASSET_LIBRARY).map((pinId) => {
    const index = Number(pinId.replace("pin", ""));
    const badgeMarkdown = getBadgeMarkdownByPinId(pinId);
    return {
      id: pinId,
      label: badgeMarkdown?.name ?? `Pin ${index}`,
      asset: PIN_ASSET_LIBRARY[pinId],
      catalog: badgeMarkdown ?? null
    };
  })
);

const BASE_BADGE_CATALOG = [
  {
    slug: "cryptopunk",
    name: "Punk",
    description: "Owns a cryptopunk.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin9",
    edition: "cryptopunk-holder",
    unlockAdapterType: "PORTFOLIO_STATE",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.portfolio-state.criteria.v1",
      requiredCollections: ["cryptopunks"],
      collectionMatch: "ANY",
      minCollectionBalance: "1",
      minDefiUsd: "0",
      minTokenUsd: "0",
      minNftUsd: "0",
      minTotalUsd: "0",
      note: "Owns at least one Cryptopunk."
    })
  },
  {
    slug: "artblocks",
    name: "Artblocks",
    description: "Own a NFT from the Artblocks project.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin11",
    edition: "artblocks-holder",
    unlockAdapterType: "PORTFOLIO_STATE",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.portfolio-state.criteria.v1",
      requiredCollections: ["artblocks"],
      collectionMatch: "ANY",
      minCollectionBalance: "1",
      minDefiUsd: "0",
      minTokenUsd: "0",
      minNftUsd: "0",
      minTotalUsd: "0",
      note: "Owns at least one Art Blocks NFT."
    })
  },
  {
    slug: "bao",
    name: "BAO",
    description: "Used Bao Swap.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin22",
    edition: "bao-finance-user",
    unlockAdapterType: "PROTOCOL_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.protocol-activity.criteria.v1",
      protocolIds: ["bao-finance"],
      chains: [],
      minInteractionCount: "1",
      minDistinctProtocols: "0",
      minDistinctChains: "0",
      windowDays: "0",
      note: "Has at least one indexed Bao Swap interaction."
    })
  },
  {
    slug: "onchain",
    name: "Onchain",
    description: "Has over 10000 txs onchain.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin8",
    edition: "onchain-10000",
    unlockAdapterType: "WALLET_AGE_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.wallet-age-activity.criteria.v1",
      minWalletAgeDays: "0",
      minTransactionCount: "10000",
      minGasUsd: "0",
      chains: [],
      note: "Has cleared ten thousand indexed EVM transactions."
    })
  },
  {
    slug: "liquidity",
    name: "Liquidity",
    description: "Has minimum 10000$ deployed in a protocol.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin14",
    edition: "liquidity-10000",
    unlockAdapterType: "PORTFOLIO_STATE",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.portfolio-state.criteria.v1",
      requiredCollections: [],
      collectionMatch: "ANY",
      minCollectionBalance: "1",
      minDefiUsd: "10000",
      minTokenUsd: "0",
      minNftUsd: "0",
      minTotalUsd: "0",
      note: "Has at least ten thousand dollars deployed in indexed DeFi positions."
    })
  },
  {
    slug: "finalform",
    name: "Final Form",
    description: "Uses onchain compute via bankr llm, codex, claude, perplexity, or similar paid compute services.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin23",
    edition: "finalform-compute",
    unlockAdapterType: "INTERNAL_SERVICE_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.internal-service-activity.criteria.v1",
      services: ["bankr-llm", "codex", "claude", "perplexity"],
      rails: ["MPP", "X402"],
      matchMode: "ALL",
      windowDays: "0",
      minActivityCount: "0",
      minPaidRequests: "1",
      minSpendUsd: "0",
      minDistinctServices: "0",
      evmChains: [],
      minEvmTransactionCount: "0",
      note: "Has paid for onchain compute or agentic inference through indexed compute services."
    })
  },
  {
    slug: "etherean",
    name: "Etherean",
    description: "Been using Ethereum for at least 4 years.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin2",
    edition: "etherean-four-years",
    unlockAdapterType: "WALLET_AGE_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.wallet-age-activity.criteria.v1",
      minWalletAgeDays: "1460",
      minTransactionCount: "0",
      minGasUsd: "0",
      chains: ["ethereum"],
      note: "Has at least four years of indexed Ethereum activity."
    })
  },
  {
    slug: "trailblazer",
    name: "Trailblazer",
    description: "Have one active agent on x402, MPP, OpenClaw, or Moltbook.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin1",
    edition: "trailblazer-launch",
    unlockAdapterType: "INTERNAL_SERVICE_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.internal-service-activity.criteria.v1",
      services: [],
      rails: [],
      matchMode: "ALL",
      requirementMatchMode: "ANY",
      windowDays: "0",
      minActivityCount: "0",
      minPaidRequests: "0",
      minSpendUsd: "0",
      minDistinctServices: "0",
      evmChains: [],
      minEvmTransactionCount: "0",
      requiredSubjectType: "ANY",
      activityRequirements: [
        {
          label: "x402 agent",
          rails: ["X402"],
          services: [],
          matchMode: "ALL",
          minActivityCount: "0",
          minPaidRequests: "1",
          minSpendUsd: "0",
          minDistinctServices: "0",
          evmChains: [],
          minEvmTransactionCount: "0",
          requiredSubjectType: "AGENT"
        },
        {
          label: "mpp agent",
          rails: ["MPP"],
          services: [],
          matchMode: "ALL",
          minActivityCount: "0",
          minPaidRequests: "1",
          minSpendUsd: "0",
          minDistinctServices: "0",
          evmChains: [],
          minEvmTransactionCount: "0",
          requiredSubjectType: "AGENT"
        },
        {
          label: "openclaw agent",
          rails: ["APP"],
          services: ["openclaw"],
          matchMode: "ALL",
          minActivityCount: "1",
          minPaidRequests: "0",
          minSpendUsd: "0",
          minDistinctServices: "0",
          evmChains: [],
          minEvmTransactionCount: "0",
          requiredSubjectType: "AGENT"
        },
        {
          label: "moltbook agent",
          rails: ["APP"],
          services: ["moltbook"],
          matchMode: "ALL",
          minActivityCount: "1",
          minPaidRequests: "0",
          minSpendUsd: "0",
          minDistinctServices: "0",
          evmChains: [],
          minEvmTransactionCount: "0",
          requiredSubjectType: "AGENT"
        }
      ],
      note: "Has at least one qualifying agent-backed x402, MPP, OpenClaw, or Moltbook activity. Plain human wallet activity does not qualify."
    })
  },
  {
    slug: "burner",
    name: "Burner",
    description: "Has burned a meaningful amount of gas across indexed EVM chains.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin3",
    edition: "burner-gas",
    unlockAdapterType: "WALLET_AGE_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.wallet-age-activity.criteria.v1",
      minWalletAgeDays: "0",
      minTransactionCount: "0",
      minGasUsd: "1000",
      chains: [],
      note: "Has burned at least $1,000 of indexed EVM gas across supported chains."
    })
  },
  {
    slug: "kawaii",
    name: "Kawaii",
    description: "Owns at least one NFT from a curated cute collection.",
    badgeType: "COLLECTOR",
    samplePinId: "pin7",
    edition: "kawaii-collector",
    unlockAdapterType: "PORTFOLIO_STATE",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.portfolio-state.criteria.v1",
      requiredCollections: KAWAII_COLLECTION_IDS,
      collectionMatch: "ANY",
      minCollectionBalance: "1",
      minDefiUsd: "0",
      minTokenUsd: "0",
      minNftUsd: "0",
      minTotalUsd: "0",
      note: "Owns at least one NFT from the curated cute-collection allowlist."
    })
  },
  {
    slug: "pepethefrog",
    name: "Pepe",
    description: "Owns a Pepe-related token or NFT from the curated allowlist.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin10",
    edition: "pepe-collector",
    unlockAdapterType: "PORTFOLIO_STATE",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.portfolio-state.criteria.v1",
      requiredCollections: PEPE_COLLECTION_IDS,
      collectionMatch: "ANY",
      minCollectionBalance: "1",
      minDefiUsd: "0",
      minTokenUsd: "0",
      minNftUsd: "0",
      minTotalUsd: "0",
      note: "Owns at least one curated Pepe-related NFT collection or token position."
    })
  },
  {
    slug: "yieldfarmer",
    name: "Yield Farmer",
    description: "Has farmed across multiple indexed DeFi protocols with meaningful repeat activity.",
    badgeType: "ACHIEVEMENT",
    samplePinId: "pin15",
    edition: "yield-farmer",
    unlockAdapterType: "PROTOCOL_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.protocol-activity.criteria.v1",
      protocolIds: YIELD_FARMING_PROTOCOL_IDS,
      chains: [],
      minInteractionCount: "10",
      minDistinctProtocols: "3",
      minDistinctChains: "1",
      windowDays: "0",
      note: "Has at least ten indexed yield-farming interactions across three or more supported protocols."
    })
  },
  {
    slug: "opal",
    name: "Opal",
    description: "Operated across at least three chains and ten protocols under one linked claimant identity.",
    badgeType: "MILESTONE",
    samplePinId: "pin19",
    edition: "opal-operator",
    unlockAdapterType: "PROTOCOL_ACTIVITY",
    oracleCriteriaJson: JSON.stringify({
      kind: "agentic-poap.protocol-activity.criteria.v1",
      protocolIds: OPAL_PROTOCOL_IDS,
      chains: [],
      minInteractionCount: "10",
      minDistinctProtocols: "10",
      minDistinctChains: "3",
      windowDays: "0",
      note: "Treats the claimant plus explicitly linked wallets as one persistent identity operating across multiple chains and protocols."
    })
  }
];

export const BADGE_CATALOG = Object.freeze(BASE_BADGE_CATALOG.map(mergeBadgeCatalogCopy));

export function getPinAsset(samplePinId = "pin1") {
  return PIN_ASSET_LIBRARY[samplePinId] ?? PIN_ASSET_LIBRARY.pin1;
}

export function getCatalogBadgeBySlug(slug) {
  return BADGE_CATALOG.find((entry) => entry.slug === slug) ?? null;
}

export function buildCatalogDefinitions({
  badgeRegistryAddress = LOCAL_DEV_ACCOUNT.address,
  oracleSignerAddress = LOCAL_DEV_ACCOUNT.address,
  tokenBalanceAddress = badgeRegistryAddress
} = {}) {
  return BADGE_CATALOG.map((entry, index) => {
    const targetAddress =
      entry.unlockAdapterType === "BADGE_COUNT"
        ? badgeRegistryAddress
        : entry.unlockAdapterType === "TOKEN_BALANCE"
          ? tokenBalanceAddress
          : "";
    const asset = getPinAsset(entry.samplePinId);
    const unlockDefaults = unlockAdapterDefaults(entry.unlockAdapterType, {
      targetAddress,
      signerAddress: oracleSignerAddress
    });
    const unlockPayload = buildUnlockAdapterPayload(
      {
        ...unlockDefaults,
        ...entry,
        unlockTargetAddress: entry.unlockTargetAddress ?? unlockDefaults.unlockTargetAddress,
        unlockSignerAddress: entry.unlockSignerAddress ?? unlockDefaults.unlockSignerAddress
      },
      {
        fallbackTargetAddress: badgeRegistryAddress
      }
    );
    const advancedPolicyPayload = buildAdvancedPolicyPayload({
      unlockAdapterType: unlockPayload.unlockAdapterType,
      unlockSignerAddress: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
      advancedPolicyEnabled:
        entry.advancedPolicyEnabled ??
        unlockPayload.verificationType === "ORACLE_ATTESTATION",
      advancedPolicyContext:
        unlockPayload.unlockAdapterConfig.farcasterCriteriaHash ||
        unlockPayload.unlockAdapterConfig.paymentCriteriaHash ||
        unlockPayload.unlockAdapterConfig.x402CriteriaHash ||
        unlockPayload.unlockAdapterConfig.oracleCriteriaHash ||
        "",
      advancedPolicySchema: entry.advancedPolicySchema ?? "",
      advancedPolicyRequiredIssuer:
        entry.advancedPolicyRequiredIssuer ??
        unlockPayload.unlockAdapterConfig.unlockSignerAddress
    });

    return {
      index,
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      claimCondition: entry.claimCondition ?? "",
      catalogBadgeTypeLabel: entry.catalogBadgeTypeLabel ?? "",
      badgeType: entry.badgeType,
      verificationType: unlockPayload.verificationType,
      verificationData: unlockPayload.verificationData,
      unlockAdapterType: unlockPayload.unlockAdapterType,
      unlockAdapterConfig: unlockPayload.unlockAdapterConfig,
      advancedPolicy: advancedPolicyPayload.advancedPolicy,
      advancedPolicyConfig: advancedPolicyPayload.advancedPolicyConfig,
      unlockTargetAddress: unlockPayload.unlockAdapterConfig.unlockTargetAddress,
      unlockThreshold: unlockPayload.unlockAdapterConfig.unlockThreshold,
      unlockSignerAddress: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
      unlockNote: unlockPayload.unlockAdapterConfig.unlockNote,
      maxClaims: entry.maxClaims ?? 0,
      samplePinId: entry.samplePinId,
      asset: {
        ...asset,
        edition: entry.edition,
        detailUri: `/index.html?badge=${entry.slug}`
      }
    };
  });
}
