import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  http,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildCatalogDefinitions } from "../web/badgeCatalog.js";
import {
  buildUnlockAdapterPayload,
  encode8183ProofPackageCalldata,
  signOracle8183ProofPackage
} from "../web/unlockAdapters.js";
import { buildReusableOracleContextLabel } from "../web/oracleCriteria.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicDir = join(projectRoot, "web", "public");
const localDir = join(publicDir, "local");

const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_EVENT_SIGNER_PRIVATE_KEY =
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const DEFAULT_AGENT = "0x1234567890abcdef1234567890abcdef12345678";

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

function readArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function normalizePrivateKey(value) {
  if (!value) {
    throw new Error("Missing private key.");
  }

  return value.startsWith("0x") ? value : `0x${value}`;
}

function decodeClaimUri(claimUri) {
  const commaIndex = claimUri.indexOf(",");
  if (commaIndex === -1) {
    throw new Error("Invalid claim URI.");
  }

  const payload = claimUri.slice(commaIndex + 1).replace(/ /g, "+");
  return Buffer.from(payload, "base64").toString("utf8");
}

function createChain(chainId, rpcUrl) {
  return defineChain({
    id: chainId,
    name: `Agentic Local ${chainId}`,
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

async function readArtifact(relativePath) {
  const artifactPath = join(projectRoot, "out", relativePath);
  return JSON.parse(await readFile(artifactPath, "utf8"));
}

async function deployContract({
  walletClient,
  publicClient,
  account,
  artifact,
  args = [],
  nonce
}) {
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args
  });
  const gas = await publicClient.estimateGas({
    account: account.address,
    data
  });

  const hash = await walletClient.sendTransaction({
    account,
    data,
    gas: withGasBuffer(gas),
    nonce
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error("Deployment receipt did not include a contract address.");
  }

  return receipt.contractAddress;
}

async function writeContract({
  walletClient,
  publicClient,
  account,
  address,
  abi,
  functionName,
  args = [],
  nonce
}) {
  const data = encodeFunctionData({
    abi,
    functionName,
    args
  });
  const gas = await publicClient.estimateGas({
    account: account.address,
    to: address,
    data
  });

  const hash = await walletClient.sendTransaction({
    account,
    to: address,
    data,
    gas: withGasBuffer(gas),
    nonce
  });

  return publicClient.waitForTransactionReceipt({ hash });
}

function withGasBuffer(gasEstimate) {
  return (gasEstimate * 12n) / 10n + 50_000n;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const rpcUrl = String(args["rpc-url"] ?? process.env.RPC_URL ?? DEFAULT_RPC_URL);
  const chainId = Number(args["chain-id"] ?? process.env.CHAIN_ID ?? DEFAULT_CHAIN_ID);
  const privateKey = normalizePrivateKey(
    args["private-key"] ?? process.env.PRIVATE_KEY ?? DEFAULT_PRIVATE_KEY
  );
  const eventSignerPrivateKey = normalizePrivateKey(
    args["event-signer-private-key"] ??
      process.env.EVENT_SIGNER_PRIVATE_KEY ??
      DEFAULT_EVENT_SIGNER_PRIVATE_KEY
  );
  const viewerBaseUrl = String(
    args["viewer-base-url"] ?? process.env.VIEWER_BASE_URL ?? "http://127.0.0.1:5173"
  ).replace(/\/$/, "");
  const seedAgent = String(args["seed-agent"] ?? process.env.SEED_AGENT ?? DEFAULT_AGENT);
  const shouldSeed = !args["no-seed"];

  const chain = createChain(chainId, rpcUrl);
  const account = privateKeyToAccount(privateKey);
  const eventSignerAccount = privateKeyToAccount(eventSignerPrivateKey);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });
  const eventSignerWalletClient = createWalletClient({
    account: eventSignerAccount,
    chain,
    transport: http(rpcUrl)
  });

  const [assetArtifact, rendererArtifact, tokenArtifact, identityArtifact, reputationArtifact, registryArtifact] = await Promise.all([
    readArtifact("BadgeAssetRegistry.sol/BadgeAssetRegistry.json"),
    readArtifact("BadgeClaimRenderer.sol/BadgeClaimRenderer.json"),
    readArtifact("MockBalanceToken.sol/MockBalanceToken.json"),
    readArtifact("SimpleIdentityRegistry.sol/SimpleIdentityRegistry.json"),
    readArtifact("SimpleReputationRegistry.sol/SimpleReputationRegistry.json"),
    readArtifact("AgenticBadgeRegistry.sol/AgenticBadgeRegistry.json")
  ]);

  let nextNonce = BigInt(
    await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending"
    })
  );

  function takeNonce() {
    const nonce = nextNonce;
    nextNonce += 1n;
    return nonce;
  }

  const badgeAssetRegistry = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: assetArtifact,
    args: [account.address],
    nonce: takeNonce()
  });
  const badgeClaimRenderer = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: rendererArtifact,
    args: [badgeAssetRegistry],
    nonce: takeNonce()
  });
  const balanceToken = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: tokenArtifact,
    args: ["Agentic Access Token", "AAT", 0, account.address],
    nonce: takeNonce()
  });
  const identityRegistry = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: identityArtifact,
    args: [account.address],
    nonce: takeNonce()
  });
  const reputationRegistry = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: reputationArtifact,
    args: [account.address],
    nonce: takeNonce()
  });
  const agenticBadgeRegistry = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: registryArtifact,
    args: [badgeAssetRegistry, badgeClaimRenderer, identityRegistry, reputationRegistry],
    nonce: takeNonce()
  });

  const claimPageBaseUri = `${viewerBaseUrl}/index.html?deployment=/local/anvil-deployment.json`;
  const balanceTokenSymbol = "AAT";
  const contractWalletTokenBalance = 1000n;
  const seedAgentTokenBalance = 75n;

  await writeContract({
    walletClient,
    publicClient,
    account,
    address: balanceToken,
    abi: tokenArtifact.abi,
    functionName: "mint",
    args: [account.address, contractWalletTokenBalance],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: balanceToken,
    abi: tokenArtifact.abi,
    functionName: "mint",
    args: [seedAgent, seedAgentTokenBalance],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: identityRegistry,
    abi: identityArtifact.abi,
    functionName: "setIdentity",
    args: [account.address, account.address, true],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: identityRegistry,
    abi: identityArtifact.abi,
    functionName: "setIdentity",
    args: [seedAgent, seedAgent, true],
    nonce: takeNonce()
  });

  await writeContract({
    walletClient,
    publicClient,
    account,
    address: agenticBadgeRegistry,
    abi: registryArtifact.abi,
    functionName: "setAttestor",
    args: [account.address, true],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: reputationRegistry,
    abi: reputationArtifact.abi,
    functionName: "setWriter",
    args: [agenticBadgeRegistry, true],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: agenticBadgeRegistry,
    abi: registryArtifact.abi,
    functionName: "setClaimPageBaseUri",
    args: [claimPageBaseUri],
    nonce: takeNonce()
  });

  let seeded = null;
  let localTrailblazerProof = null;

  if (shouldSeed) {
    const catalogDefinitions = buildCatalogDefinitions({
      badgeRegistryAddress: agenticBadgeRegistry,
      oracleSignerAddress: eventSignerAccount.address,
      tokenBalanceAddress: balanceToken
    });
    const definedBadges = [];

    for (const catalogDefinition of catalogDefinitions) {
      const registerAssetReceipt = await writeContract({
        walletClient,
        publicClient,
        account,
        address: badgeAssetRegistry,
        abi: assetArtifact.abi,
        functionName: "registerAsset",
        args: [
          {
            ...catalogDefinition.asset,
            detailUri: `${viewerBaseUrl}/index.html?badge=${catalogDefinition.slug}`
          }
        ],
        nonce: takeNonce()
      });

      const assetRegisteredLog = registerAssetReceipt.logs.find(
        (entry) => entry.address.toLowerCase() === badgeAssetRegistry.toLowerCase()
      );
      if (!assetRegisteredLog) {
        throw new Error(`Could not find the asset registration log for ${catalogDefinition.slug}.`);
      }

      const assetId = Number(BigInt(assetRegisteredLog.topics[1]));
      const unlockPayload = buildUnlockAdapterPayload(
        {
          ...catalogDefinition,
          ...catalogDefinition.asset
        },
        {
          fallbackTargetAddress: agenticBadgeRegistry
        }
      );

      const defineBadgeReceipt = await writeContract({
        walletClient,
        publicClient,
        account,
        address: agenticBadgeRegistry,
        abi: registryArtifact.abi,
        functionName: "defineBadge",
        args: [
          catalogDefinition.name,
          catalogDefinition.description,
          BigInt(assetId),
          BADGE_TYPE_ENUMS[catalogDefinition.badgeType] ?? BADGE_TYPE_ENUMS.CUSTOM,
          VERIFICATION_TYPE_ENUMS[unlockPayload.verificationType] ?? VERIFICATION_TYPE_ENUMS.ONCHAIN_STATE,
          unlockPayload.verificationData,
          BigInt(Number(catalogDefinition.maxClaims) || 0),
          0,
          catalogDefinition.advancedPolicy ?? "0x"
        ],
        nonce: takeNonce()
      });

      const badgeDefinedLog = defineBadgeReceipt.logs.find(
        (entry) => entry.address.toLowerCase() === agenticBadgeRegistry.toLowerCase()
      );
      if (!badgeDefinedLog) {
        throw new Error(`Could not find the badge definition log for ${catalogDefinition.slug}.`);
      }

      definedBadges.push({
        ...catalogDefinition,
        assetId,
        definitionId: Number(BigInt(badgeDefinedLog.topics[1]))
      });
    }

    const trailblazerBadge = definedBadges.find((entry) => entry.slug === "trailblazer");
    if (!trailblazerBadge) {
      throw new Error("Could not find the seeded Trailblazer badge.");
    }

    localTrailblazerProof = await signOracle8183ProofPackage({
      badgeRegistryAddress: agenticBadgeRegistry,
      chainId,
      definitionId: trailblazerBadge.definitionId,
      agent: account.address,
      account: eventSignerAccount,
      walletClient: eventSignerWalletClient,
      schemaId:
        trailblazerBadge.advancedPolicyConfig?.schemaId ??
        trailblazerBadge.advancedPolicyConfig?.schemaInput,
      contextId: trailblazerBadge.unlockAdapterConfig?.oracleCriteriaHash,
      contextLabel: buildReusableOracleContextLabel(
        trailblazerBadge.unlockAdapterType,
        trailblazerBadge.unlockAdapterConfig?.oracleCriteriaJson
          ? JSON.parse(trailblazerBadge.unlockAdapterConfig.oracleCriteriaJson)
          : {}
      ),
      note: `${trailblazerBadge.name} sample eligibility`
    });
    await writeContract({
      walletClient,
      publicClient,
      account,
      address: agenticBadgeRegistry,
      abi: registryArtifact.abi,
      functionName: "claim",
      args: [
        BigInt(trailblazerBadge.definitionId),
        encode8183ProofPackageCalldata(localTrailblazerProof)
      ],
      nonce: takeNonce()
    });

    const claimUri = await publicClient.readContract({
      address: agenticBadgeRegistry,
      abi: registryArtifact.abi,
      functionName: "claimURI",
      args: [account.address, BigInt(trailblazerBadge.definitionId)]
    });

    seeded = {
      assetId: trailblazerBadge.assetId,
      definitionId: trailblazerBadge.definitionId,
      agent: account.address,
      claimUri,
      catalogSize: definedBadges.length
    };
  }

  const deployment = {
    version: 1,
    mode: "onchain",
    environment: "local",
    chainId: String(chainId),
    rpcUrl,
    badgeRegistryAddress: agenticBadgeRegistry,
    assetRegistryAddress: badgeAssetRegistry,
    claimRendererAddress: badgeClaimRenderer,
    identityRegistryAddress: identityRegistry,
    reputationRegistryAddress: reputationRegistry,
    balanceTokenAddress: balanceToken,
    claimPageBaseUri,
    oracleServiceUrl: "http://127.0.0.1:8789/api/oracle/proof",
    paymentProofServiceUrl: "http://127.0.0.1:8788/api/x402/proof",
    x402ServiceUrl: "http://127.0.0.1:8788/api/x402/proof",
    mppServiceUrl: "http://127.0.0.1:8787/api/mint/claim",
    deployer: account.address,
    eventSignerAddress: eventSignerAccount.address,
    tokens: {
      balanceToken,
      symbol: balanceTokenSymbol,
      contractWalletBalance: Number(contractWalletTokenBalance),
      seedAgentBalance: Number(seedAgentTokenBalance)
    },
    viewerBaseUrl,
    services: {
      viewer: {
        baseUrl: viewerBaseUrl,
        claimPageBaseUri
      },
      oracleProof: {
        proofUrl: "http://127.0.0.1:8789/api/oracle/proof",
        healthUrl: "http://127.0.0.1:8789/api/oracle/health",
        decisionsUrl: "http://127.0.0.1:8789/api/oracle/admin/decisions",
        requestShape: "agentic-poap.oracle-proof.v1"
      },
      paymentProof: {
        proofUrl: "http://127.0.0.1:8788/api/x402/proof",
        healthUrl: "http://127.0.0.1:8788/api/x402/health",
        decisionsUrl: "http://127.0.0.1:8788/api/x402/admin/decisions",
        requestShape: "agentic-poap.payment-history.v1"
      },
      mpp: {
        mintUrl: "http://127.0.0.1:8787/api/mint/claim"
      }
    },
    seeded,
    localTrailblazerProof
  };

  await mkdir(localDir, { recursive: true });
  await writeFile(join(localDir, "anvil-deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`);

  if (seeded?.claimUri) {
    await writeFile(join(localDir, "anvil-seed-claim.uri.txt"), `${seeded.claimUri}\n`);
    await writeFile(
      join(localDir, "anvil-seed-claim.json"),
      `${decodeClaimUri(seeded.claimUri)}\n`
    );
  }
  if (localTrailblazerProof) {
    await writeFile(
      join(localDir, "anvil-trailblazer-proof.json"),
      `${JSON.stringify(localTrailblazerProof, null, 2)}\n`
    );
    await writeFile(
      join(localDir, "anvil-trailblazer-proof.txt"),
      `${JSON.stringify(localTrailblazerProof)}\n`
    );
  }
  await writeFile(
    join(localDir, "anvil-balance-token.json"),
    `${JSON.stringify(
      {
        address: balanceToken,
        symbol: balanceTokenSymbol,
        contractWalletBalance: Number(contractWalletTokenBalance),
        seedAgentBalance: Number(seedAgentTokenBalance)
      },
      null,
      2
    )}\n`
  );

  process.stdout.write(`${JSON.stringify(deployment, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
