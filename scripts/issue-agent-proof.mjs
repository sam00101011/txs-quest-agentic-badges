import { readFile, writeFile } from "node:fs/promises";

import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { DEFAULT_AGENT_8183_SCHEMA } from "../web/badgePolicies.js";
import { signAgent8183ProofPackage } from "../web/unlockAdapters.js";

const DEFAULT_ATTESTOR_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";

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
    throw new Error("Add --private-key or ATTESTOR_PRIVATE_KEY to issue an agent proof.");
  }

  return value.startsWith("0x") ? value : `0x${value}`;
}

function normalizeAddress(value, label) {
  const trimmed = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`Add a valid ${label} address.`);
  }

  return trimmed;
}

function normalizeBytes32ish(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed;
  }

  return keccak256(stringToHex(trimmed));
}

async function loadDeployment(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const deploymentPath = String(args.deployment ?? DEFAULT_DEPLOYMENT_PATH);
  const deployment = args["badge-registry-address"] ? null : await loadDeployment(deploymentPath);

  const badgeRegistryAddress = normalizeAddress(
    args["badge-registry-address"] ?? deployment?.badgeRegistryAddress,
    "badge registry"
  );
  const definitionId = Number(args["definition-id"] ?? deployment?.seeded?.definitionId);
  if (!Number.isInteger(definitionId) || definitionId < 0) {
    throw new Error("Add a valid --definition-id.");
  }

  const agent = normalizeAddress(args.agent ?? deployment?.deployer, "agent");
  const chainId = Number(args["chain-id"] ?? deployment?.chainId ?? 0);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Add a valid --chain-id.");
  }
  const contextInput =
    args["context-id"] ??
    args.context ??
    deployment?.seeded?.agentProofContextId ??
    "peer-vouch";
  const schemaInput =
    args["schema-id"] ??
    args.schema ??
    deployment?.seeded?.agentProofSchemaId ??
    DEFAULT_AGENT_8183_SCHEMA;
  const note = String(args.note ?? "agent attestation").trim();
  const issuedAt = Number(args["issued-at"] ?? Math.floor(Date.now() / 1000));
  const expiresAt = Number(args["expires-at"] ?? issuedAt + Number(args["expires-in"] ?? 60 * 60 * 24 * 7));
  const privateKey = normalizePrivateKey(
    args["private-key"] ??
      process.env.ATTESTOR_PRIVATE_KEY ??
      process.env.PRIVATE_KEY ??
      DEFAULT_ATTESTOR_PRIVATE_KEY
  );
  const account = privateKeyToAccount(privateKey);

  const proofPackage = await signAgent8183ProofPackage({
    badgeRegistryAddress,
    chainId,
    definitionId,
    agent,
    account,
    contextId: normalizeBytes32ish(contextInput) || normalizeBytes32ish("peer-vouch"),
    contextLabel: String(args["context-label"] ?? args.context ?? contextInput).trim(),
    schemaId: normalizeBytes32ish(schemaInput) || normalizeBytes32ish(DEFAULT_AGENT_8183_SCHEMA),
    nonce: args.nonce,
    note,
    issuedAt,
    expiresAt
  });

  const output = `${JSON.stringify(proofPackage, null, 2)}\n`;
  if (args.output) {
    await writeFile(String(args.output), output);
  }

  process.stdout.write(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
