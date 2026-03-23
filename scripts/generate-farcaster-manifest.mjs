import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = new URL("..", import.meta.url);
const manifestPath = new URL("../web/public/.well-known/farcaster.json", import.meta.url);
const manifestExamplePath = new URL("../web/public/farcaster-manifest.example.json", import.meta.url);
const redirectsPath = new URL("../web/public/_redirects", import.meta.url);

const DEFAULT_BASE_URL = "https://txs.quest";
const DEFAULT_HOME_PATH = "/claim?farcaster=1";
const DEFAULT_ICON_PATH = "/favicon.svg";
const DEFAULT_IMAGE_PATH = "/farcaster-share.svg";
const DEFAULT_REQUIRED_CAPABILITIES = [
  "actions.ready",
  "actions.signIn",
  "experimental.signManifest"
];

function trim(value) {
  return String(value ?? "").trim();
}

function normalizeBaseUrl(value) {
  const raw = trim(value) || DEFAULT_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function readEnvFile(filePath) {
  return fs.readFile(filePath, "utf8").then((contents) => {
    const values = {};
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (!match) {
        continue;
      }
      const key = match[1];
      const rawValue = match[2];
      const unquoted =
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
          ? rawValue.slice(1, -1)
          : rawValue;
      values[key] = unquoted;
    }
    return values;
  }).catch(() => ({}));
}

function resolveConfig(envFileValues) {
  const mergedEnv = {
    ...envFileValues,
    ...process.env
  };

  const baseUrl = normalizeBaseUrl(mergedEnv.PUBLIC_APP_URL);
  const homeUrl = new URL(trim(mergedEnv.FARCASTER_HOME_URL) || DEFAULT_HOME_PATH, baseUrl).toString();
  const iconUrl = new URL(trim(mergedEnv.FARCASTER_ICON_URL) || DEFAULT_ICON_PATH, baseUrl).toString();
  const imageUrl = new URL(trim(mergedEnv.FARCASTER_IMAGE_URL) || DEFAULT_IMAGE_PATH, baseUrl).toString();
  const splashImageUrl = new URL(trim(mergedEnv.FARCASTER_SPLASH_IMAGE_URL) || DEFAULT_ICON_PATH, baseUrl).toString();
  const requiredCapabilities = (trim(mergedEnv.FARCASTER_REQUIRED_CAPABILITIES)
    ? trim(mergedEnv.FARCASTER_REQUIRED_CAPABILITIES).split(",")
    : DEFAULT_REQUIRED_CAPABILITIES
  )
    .map((value) => value.trim())
    .filter(Boolean);

  const header = trim(mergedEnv.FARCASTER_ACCOUNT_ASSOCIATION_HEADER) || "REPLACE_WITH_DOMAIN_HEADER";
  const payload = trim(mergedEnv.FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD) || "REPLACE_WITH_DOMAIN_PAYLOAD";
  const signature =
    trim(mergedEnv.FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE) || "REPLACE_WITH_DOMAIN_SIGNATURE";

  return {
    baseUrl,
    homeUrl,
    iconUrl,
    imageUrl,
    splashImageUrl,
    manifest: {
      accountAssociation: {
        header,
        payload,
        signature
      },
      miniapp: {
        version: "1",
        name: "txs.quest",
        homeUrl,
        iconUrl,
        imageUrl,
        buttonTitle: "Claim",
        splashImageUrl,
        splashBackgroundColor: "#0f0f10",
        requiredCapabilities,
        canonicalDomain: new URL(baseUrl).hostname
      },
      frame: {
        version: "1",
        name: "txs.quest",
        homeUrl,
        iconUrl,
        imageUrl,
        buttonTitle: "Claim",
        splashImageUrl,
        splashBackgroundColor: "#0f0f10",
        requiredCapabilities,
        canonicalDomain: new URL(baseUrl).hostname
      }
    }
  };
}

const FARCASTER_PLACEHOLDER_REDIRECT = "/.well-known/farcaster.json /404 404";

async function syncRedirectsFile(hasPlaceholder) {
  const existing = await fs.readFile(redirectsPath, "utf8").catch(() => "");
  const lines = existing
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line && line !== FARCASTER_PLACEHOLDER_REDIRECT);

  if (hasPlaceholder) {
    lines.unshift(FARCASTER_PLACEHOLDER_REDIRECT);
  }

  const contents = lines.length ? lines.join("\n") + "\n" : "";
  await fs.writeFile(redirectsPath, contents, "utf8");
}

async function main() {
  const envFileValues = await readEnvFile(path.join(fileURLToPath(rootDir), ".env"));
  const { manifest } = resolveConfig(envFileValues);
  await fs.writeFile(manifestExamplePath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.mkdir(new URL("../web/public/.well-known/", import.meta.url), { recursive: true });
  const hasPlaceholder = Object.values(manifest.accountAssociation).some((value) => value.startsWith("REPLACE_WITH_"));
  if (hasPlaceholder) {
    await fs.rm(manifestPath, { force: true });
  } else {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
  await syncRedirectsFile(hasPlaceholder);
  const note = hasPlaceholder
    ? "Generated Farcaster manifest scaffold example. /.well-known/farcaster.json is intentionally omitted until a real accountAssociation signature is configured."
    : "Generated Farcaster manifest with configured accountAssociation values.";
  process.stdout.write(note + "\n");
}

await main();
