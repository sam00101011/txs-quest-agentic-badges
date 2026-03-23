import { readFile, writeFile } from "node:fs/promises";

import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { DEFAULT_ORACLE_8183_SCHEMA } from "../web/badgePolicies.js";
import {
  DEFAULT_ORACLE_EVENT_PROOF_TTL,
  signOracle8183ProofPackage,
  signOracleEventProofPackage
} from "../web/unlockAdapters.js";

const DEFAULT_EVENT_SIGNER_PRIVATE_KEY =
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const DEFAULT_DEPLOYMENT_PATH = "web/public/local/anvil-deployment.json";
const FORMAT_ALIASES = new Set(["v2", "8183"]);

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
    throw new Error("Add --private-key or EVENT_SIGNER_PRIVATE_KEY to issue an event proof.");
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

function normalizeProofFormat(value) {
  const normalized = String(value ?? "8183").trim().toLowerCase();
  if (!FORMAT_ALIASES.has(normalized)) {
    throw new Error("Use --format v2 or --format 8183.");
  }

  return normalized;
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
  const definitionId = Number(
    args["definition-id"] ?? deployment?.seeded?.eventProofDefinitionId ?? deployment?.seeded?.definitionId
  );
  if (!Number.isInteger(definitionId) || definitionId < 0) {
    throw new Error("Add a valid --definition-id.");
  }

  const agent = normalizeAddress(args.agent ?? deployment?.deployer, "agent");
  const chainId = Number(args["chain-id"] ?? deployment?.chainId ?? 0);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Add a valid --chain-id.");
  }
  const format = normalizeProofFormat(args.format ?? deployment?.seeded?.eventProofFormat ?? "8183");
  const eventSlug = String(args["event-slug"] ?? "attendance").trim();
  const note = String(args.note ?? `${eventSlug} attendance`).trim();
  const issuedAt = Number(args["issued-at"] ?? Math.floor(Date.now() / 1000));
  const expiresAt = Number(
    args["expires-at"] ?? issuedAt + Number(args["expires-in"] ?? DEFAULT_ORACLE_EVENT_PROOF_TTL)
  );
  const privateKey = normalizePrivateKey(
    args["private-key"] ?? process.env.EVENT_SIGNER_PRIVATE_KEY ?? DEFAULT_EVENT_SIGNER_PRIVATE_KEY
  );
  const account = privateKeyToAccount(privateKey);

  const proofPackage =
    format === "8183"
      ? await signOracle8183ProofPackage({
          badgeRegistryAddress,
          chainId,
          definitionId,
          agent,
          account,
          contextId:
            normalizeBytes32ish(
              args["context-id"] ??
                args.context ??
                deployment?.seeded?.eventProofContextId ??
                eventSlug
            ) || normalizeBytes32ish(eventSlug),
          contextLabel: String(
            args["context-label"] ??
              args.context ??
              deployment?.seeded?.eventProofContextLabel ??
              eventSlug
          ).trim(),
          schemaId:
            normalizeBytes32ish(
              args["schema-id"] ??
                args.schema ??
                deployment?.seeded?.eventProofSchemaId ??
                DEFAULT_ORACLE_8183_SCHEMA
            ) || normalizeBytes32ish(DEFAULT_ORACLE_8183_SCHEMA),
          nonce: args.nonce,
          note,
          issuedAt,
          expiresAt
        })
      : await signOracleEventProofPackage({
          badgeRegistryAddress,
          definitionId,
          agent,
          account,
          eventSlug,
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
