import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(rootDir, ".env");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function trim(value) {
  return String(value ?? "").trim();
}

function normalizeToken(name, value) {
  const raw = trim(value);
  if (!raw) {
    throw new Error(`Missing --${name}.`);
  }

  if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    return raw;
  }

  if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
    return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  throw new Error(`${name} must be a base64url or base64 string from the Farcaster Mini App Manifest Tool.`);
}

function upsertEnvValue(contents, key, value) {
  const escapedValue = value.replace(/\n/g, "");
  const line = `${key}=${escapedValue}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) {
    return contents.replace(pattern, line);
  }
  return contents.trimEnd() + "\n" + line + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const header = normalizeToken("header", args.header);
  const payload = normalizeToken("payload", args.payload);
  const signature = normalizeToken("signature", args.signature);

  const current = await fs.readFile(envPath, "utf8").catch(() => "");
  let next = current;
  next = upsertEnvValue(next, "FARCASTER_ACCOUNT_ASSOCIATION_HEADER", header);
  next = upsertEnvValue(next, "FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD", payload);
  next = upsertEnvValue(next, "FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE", signature);
  await fs.writeFile(envPath, next, "utf8");

  process.stdout.write("Saved Farcaster domain association values to .env\n");
  process.stdout.write("Next: bun run build\n");
  process.stdout.write("Then: bunx wrangler pages deploy dist --project-name txs-quest --branch main\n");
}

await main();
