import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const sourcePinsDir = join(projectRoot, "pins");
const publicDir = join(projectRoot, "web", "public");
const publicPinsDir = join(publicDir, "pins");
const claimsDir = join(publicDir, "claims");
const legacyAssetsDir = join(publicDir, "assets");

function sha256Hex(buffer) {
  return `0x${createHash("sha256").update(buffer).digest("hex")}`;
}

function toClaimUri(claim) {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(claim)).toString("base64")}`;
}

async function removeIfExists(path) {
  await rm(path, {
    force: true,
    recursive: true
  });
}

async function writeClaimFiles(fileName, claim) {
  const claimPath = join(claimsDir, `${fileName}.json`);
  const claimUriPath = join(claimsDir, `${fileName}.uri.txt`);
  await writeFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`);
  await writeFile(claimUriPath, `${toClaimUri(claim)}\n`);
}

async function main() {
  await mkdir(publicPinsDir, { recursive: true });
  await mkdir(claimsDir, { recursive: true });

  await cp(sourcePinsDir, publicPinsDir, {
    recursive: true,
    force: true
  });

  await removeIfExists(legacyAssetsDir);
  await removeIfExists(join(claimsDir, "trailblazer-silver-claim.json"));
  await removeIfExists(join(claimsDir, "trailblazer-silver-claim.uri.txt"));

  const pin1Video = await readFile(join(publicPinsDir, "pin1.mp4"));
  const pin1Poster = await readFile(join(publicPinsDir, "pin1.jpg"));
  const pin2Video = await readFile(join(publicPinsDir, "pin2.mp4"));
  const pin2Poster = await readFile(join(publicPinsDir, "pin2.jpg"));

  const pin1VideoHash = sha256Hex(pin1Video);
  const pin1PosterHash = sha256Hex(pin1Poster);
  const pin2VideoHash = sha256Hex(pin2Video);
  const pin2PosterHash = sha256Hex(pin2Poster);

  const baseClaim = {
    name: "Trailblazer",
    description: "Awarded to early agent contributors and first-wave builders.",
    attributes: [
      { trait_type: "Badge Type", value: "Achievement" },
      { trait_type: "Verification", value: "Onchain State" },
      { trait_type: "Claimed At", display_type: "date", value: 1774022715 }
    ]
  };

  await writeClaimFiles("trailblazer-loop-claim", {
    ...baseClaim,
    external_url: "/index.html?claim=/claims/trailblazer-loop-claim.json",
    image: "/pins/pin1.jpg",
    animation_url: "/pins/pin1.mp4",
    assets: [
      {
        uri: "/pins/pin1.mp4",
        mime_type: "video/mp4"
      }
    ],
    properties: {
      record_type: "tempo-badge-claim",
      agent: "0x1234567890abcdef1234567890abcdef12345678",
      definition_id: "0",
      asset_id: "0",
      video_uri: "/pins/pin1.mp4",
      detail_uri: "/index.html?samplePin=pin1",
      video_hash: pin1VideoHash,
      poster_hash: pin1PosterHash,
      edition: "trailblazer-launch",
      loop_seconds: 5
    }
  });

  await writeClaimFiles("trailblazer-loop-alt-claim", {
    ...baseClaim,
    external_url: "/index.html?claim=/claims/trailblazer-loop-alt-claim.json",
    image: "/pins/pin2.jpg",
    animation_url: "/pins/pin2.mp4",
    assets: [
      {
        uri: "/pins/pin2.mp4",
        mime_type: "video/mp4"
      }
    ],
    properties: {
      record_type: "tempo-badge-claim",
      agent: "0x1234567890abcdef1234567890abcdef12345678",
      definition_id: "1",
      asset_id: "1",
      video_uri: "/pins/pin2.mp4",
      detail_uri: "/index.html?samplePin=pin2",
      video_hash: pin2VideoHash,
      poster_hash: pin2PosterHash,
      edition: "trailblazer-alt",
      loop_seconds: 5
    }
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        pin1VideoHash,
        pin1PosterHash,
        pin2VideoHash,
        pin2PosterHash
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
