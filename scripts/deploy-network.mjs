import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  encodeFunctionData,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicDir = join(projectRoot, "web", "public");

const DEFAULT_NETWORK_NAME = process.env.NETWORK_NAME ?? "tempo-testnet";
const DEFAULT_RPC_URL = process.env.RPC_URL ?? "";
const DEFAULT_CHAIN_ID = Number(process.env.CHAIN_ID ?? "31338");
const DEFAULT_PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const DEFAULT_VIEWER_BASE_URL =
  process.env.VIEWER_BASE_URL ??
  process.env.PUBLIC_APP_URL ??
  "http://127.0.0.1:5173";
const DEFAULT_CLAIM_PAGE_BASE_URI = (process.env.CLAIM_PAGE_BASE_URI ?? "").trim();
const DEFAULT_ORACLE_SERVICE_URL =
  process.env.ORACLE_SERVICE_URL ?? "http://127.0.0.1:8789/api/oracle/proof";
const DEFAULT_ORACLE_PROOF_HEALTH_URL =
  process.env.ORACLE_PROOF_HEALTH_URL ?? "";
const DEFAULT_X402_SERVICE_URL =
  process.env.X402_SERVICE_URL ?? "http://127.0.0.1:8788/api/x402/proof";
const DEFAULT_PAYMENT_PROOF_HEALTH_URL =
  process.env.PAYMENT_PROOF_HEALTH_URL ??
  process.env.X402_HEALTH_URL ??
  "";
const DEFAULT_PAYMENT_BACKEND_URL =
  process.env.PAYMENT_HISTORY_URL ??
  process.env.X402_HISTORY_URL ??
  "";
const DEFAULT_PAYMENT_BACKEND_HEALTH_URL =
  process.env.PAYMENT_HISTORY_HEALTH_URL ??
  process.env.X402_HISTORY_HEALTH_URL ??
  "";
const DEFAULT_MPP_SERVICE_URL =
  process.env.MPP_SERVICE_URL ?? "http://127.0.0.1:8787/api/mint/claim";

async function loadOptionalJson(pathname) {
  if (!pathname) {
    return null;
  }

  return JSON.parse(await readFile(pathname, "utf8"));
}

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
    throw new Error("Add --private-key or PRIVATE_KEY.");
  }
  return value.startsWith("0x") ? value : `0x${value}`;
}

function createChain(chainId, rpcUrl, networkName) {
  return defineChain({
    id: Number(chainId),
    name: networkName,
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

function withGasBuffer(gasEstimate) {
  return (gasEstimate * 12n) / 10n + 50_000n;
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
  return {
    address: receipt.contractAddress,
    txHash: hash,
    blockNumber: receipt.blockNumber
  };
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

async function main() {
  const args = readArgs(process.argv.slice(2));
  const fileConfig = await loadOptionalJson(args.config ? String(args.config) : "");
  const networkName = String(
    args.network ?? fileConfig?.network ?? fileConfig?.networkName ?? DEFAULT_NETWORK_NAME
  );
  const rpcUrl = String(args["rpc-url"] ?? fileConfig?.rpcUrl ?? DEFAULT_RPC_URL).trim();
  const chainId = Number(args["chain-id"] ?? fileConfig?.chainId ?? DEFAULT_CHAIN_ID);
  const privateKey = normalizePrivateKey(
    args["private-key"] ??
      (fileConfig?.privateKeyEnv ? process.env[fileConfig.privateKeyEnv] : "") ??
      fileConfig?.privateKey ??
      DEFAULT_PRIVATE_KEY
  );
  const viewerBaseUrl = String(
    args["viewer-base-url"] ?? fileConfig?.viewerBaseUrl ?? DEFAULT_VIEWER_BASE_URL
  ).replace(/\/$/, "");
  const x402ServiceUrl = String(
    args["x402-service-url"] ??
      args["payment-proof-url"] ??
      fileConfig?.x402ServiceUrl ??
      fileConfig?.paymentProofServiceUrl ??
      fileConfig?.services?.paymentProof?.proofUrl ??
      DEFAULT_X402_SERVICE_URL
  ).trim();
  const oracleServiceUrl = String(
    args["oracle-service-url"] ??
      fileConfig?.oracleServiceUrl ??
      fileConfig?.services?.oracleProof?.proofUrl ??
      DEFAULT_ORACLE_SERVICE_URL
  ).trim();
  const oracleProofHealthUrl = String(
    args["oracle-proof-health-url"] ??
      fileConfig?.oracleProofHealthUrl ??
      fileConfig?.services?.oracleProof?.healthUrl ??
      DEFAULT_ORACLE_PROOF_HEALTH_URL
  ).trim();
  const paymentProofHealthUrl = String(
    args["payment-proof-health-url"] ??
      fileConfig?.paymentProofHealthUrl ??
      fileConfig?.services?.paymentProof?.healthUrl ??
      DEFAULT_PAYMENT_PROOF_HEALTH_URL
  ).trim();
  const paymentBackendUrl = String(
    args["payment-backend-url"] ??
      fileConfig?.paymentBackendUrl ??
      fileConfig?.services?.paymentProof?.backendUrl ??
      DEFAULT_PAYMENT_BACKEND_URL
  ).trim();
  const paymentBackendHealthUrl = String(
    args["payment-backend-health-url"] ??
      fileConfig?.paymentBackendHealthUrl ??
      fileConfig?.services?.paymentProof?.backendHealthUrl ??
      DEFAULT_PAYMENT_BACKEND_HEALTH_URL
  ).trim();
  const mppServiceUrl = String(
    args["mpp-service-url"] ??
      fileConfig?.mppServiceUrl ??
      fileConfig?.services?.mpp?.mintUrl ??
      DEFAULT_MPP_SERVICE_URL
  ).trim();
  const proofIssuerAddress = String(
    args["proof-issuer-address"] ?? fileConfig?.proofIssuerAddress ?? ""
  ).trim();
  const outputPath =
    args.output ??
    fileConfig?.output ??
    join(publicDir, "networks", `${networkName}.json`);

  if (!rpcUrl) {
    throw new Error("Add --rpc-url or RPC_URL.");
  }

  const account = privateKeyToAccount(privateKey);
  const chain = createChain(chainId, rpcUrl, networkName);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });

  const [
    assetArtifact,
    rendererArtifact,
    identityArtifact,
    reputationArtifact,
    registryArtifact
  ] = await Promise.all([
    readArtifact("BadgeAssetRegistry.sol/BadgeAssetRegistry.json"),
    readArtifact("BadgeClaimRenderer.sol/BadgeClaimRenderer.json"),
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
  const takeNonce = () => {
    const current = nextNonce;
    nextNonce += 1n;
    return current;
  };

  const assetRegistry = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: assetArtifact,
    args: [account.address],
    nonce: takeNonce()
  });
  const claimRenderer = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: rendererArtifact,
    args: [assetRegistry.address],
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
  const badgeRegistry = await deployContract({
    walletClient,
    publicClient,
    account,
    artifact: registryArtifact,
    args: [
      assetRegistry.address,
      claimRenderer.address,
      identityRegistry.address,
      reputationRegistry.address
    ],
    nonce: takeNonce()
  });

  const claimPageBaseUri =
    String(args["claim-page-base-uri"] ?? "").trim() ||
    String(fileConfig?.claimPageBaseUri ?? "").trim() ||
    DEFAULT_CLAIM_PAGE_BASE_URI ||
    `${viewerBaseUrl}/?deployment=/networks/${networkName}.json`;

  await writeContract({
    walletClient,
    publicClient,
    account,
    address: badgeRegistry.address,
    abi: registryArtifact.abi,
    functionName: "setAttestor",
    args: [account.address, true],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: badgeRegistry.address,
    abi: registryArtifact.abi,
    functionName: "setClaimPageBaseUri",
    args: [claimPageBaseUri],
    nonce: takeNonce()
  });
  await writeContract({
    walletClient,
    publicClient,
    account,
    address: identityRegistry.address,
    abi: identityArtifact.abi,
    functionName: "setIdentity",
    args: [account.address, account.address, true],
    nonce: takeNonce()
  });

  const manifest = {
    version: 1,
    mode: "onchain",
    environment: String(args.environment ?? fileConfig?.environment ?? "testnet"),
    network: {
      name: networkName,
      chainId: String(chainId),
      rpcUrl
    },
    deploymentBlock: badgeRegistry.blockNumber.toString(),
    eventStartBlock: badgeRegistry.blockNumber.toString(),
    chainId: String(chainId),
    rpcUrl,
    badgeRegistryAddress: badgeRegistry.address,
    assetRegistryAddress: assetRegistry.address,
    claimRendererAddress: claimRenderer.address,
    identityRegistryAddress: identityRegistry.address,
    reputationRegistryAddress: reputationRegistry.address,
    claimPageBaseUri,
    viewerBaseUrl,
    oracleServiceUrl,
    paymentProofServiceUrl: x402ServiceUrl,
    x402ServiceUrl,
    mppServiceUrl,
    eventSignerAddress: proofIssuerAddress || account.address,
    deployer: account.address,
    services: {
      viewer: {
        baseUrl: viewerBaseUrl,
        claimPageBaseUri
      },
      oracleProof: {
        proofUrl: oracleServiceUrl,
        healthUrl:
          oracleProofHealthUrl || (oracleServiceUrl ? oracleServiceUrl.replace(/\/api\/oracle\/proof$/, "/api/oracle/health") : ""),
        decisionsUrl:
          oracleServiceUrl ? oracleServiceUrl.replace(/\/api\/oracle\/proof$/, "/api/oracle/admin/decisions") : "",
        requestShape: "agentic-poap.oracle-proof.v1"
      },
      paymentProof: {
        proofUrl: x402ServiceUrl,
        healthUrl:
          paymentProofHealthUrl || (x402ServiceUrl ? x402ServiceUrl.replace(/\/api\/x402\/proof$/, "/api/x402/health") : ""),
        decisionsUrl:
          x402ServiceUrl ? x402ServiceUrl.replace(/\/api\/x402\/proof$/, "/api/x402/admin/decisions") : "",
        backendUrl: paymentBackendUrl,
        backendHealthUrl: paymentBackendHealthUrl,
        requestShape: "agentic-poap.payment-history.v1"
      },
      mpp: {
        mintUrl: mppServiceUrl
      }
    },
    contracts: {
      badgeAssetRegistry: assetRegistry.address,
      badgeClaimRenderer: claimRenderer.address,
      identityRegistry: identityRegistry.address,
      reputationRegistry: reputationRegistry.address,
      agenticBadgeRegistry: badgeRegistry.address
    }
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outputPath, manifest }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
