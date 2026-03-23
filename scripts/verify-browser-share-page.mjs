import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ??
  "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json&claimAgent=0x1234567890abcdef1234567890abcdef12345678&claimDef=0";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "output/playwright";

function sanitize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function readText(page, selector) {
  return sanitize(await page.locator(selector).textContent().catch(() => ""));
}

async function readValue(page, selector) {
  return sanitize(await page.locator(selector).inputValue().catch(() => ""));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 2200
    }
  });

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const previewTitle = await readText(page, "#preview-title");
    const claimStatus = await readText(page, "#claim-status");
    const claimCount = await readText(page, "#claim-count");
    const shareUrl = await readValue(page, "#claim-share-url-output");
    const reputation = await readValue(page, "#claim-reputation-output");
    const claimUri = await readValue(page, "#claim-uri-output");
    const claimJson = await page.locator("#claim-json-output").inputValue().catch(() => "");
    const videoSrc = await page.locator("#pin-video").getAttribute("src");
    const detailUnlockTitle = await readText(page, "#detail-unlock-title");
    const detailRecordTitle = await readText(page, "#detail-record-title");
    const relatedBadgeCount = await page.locator("#detail-related-badge-claims [data-view-claim]").count();

    const screenshotPath = join(OUTPUT_DIR, "localhost-shared-claim-page.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      appUrl: APP_URL,
      claimCount,
      claimJsonLength: claimJson.length,
      claimStatus,
      claimUriLength: claimUri.length,
      detailRecordTitle,
      detailUnlockTitle,
      previewTitle,
      relatedBadgeCount,
      reputation,
      screenshotPath,
      shareUrl,
      videoSrc
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (previewTitle !== "Trailblazer") {
      throw new Error(`Unexpected preview title: ${previewTitle || "empty"}`);
    }
    if (!shareUrl.includes("claimAgent=") || !shareUrl.includes("claimDef=0")) {
      throw new Error(`Share URL was not claim-page shaped: ${shareUrl || "empty"}`);
    }
    if (!reputation || /unavailable/i.test(reputation)) {
      throw new Error(`Reputation summary was not populated: ${reputation || "empty"}`);
    }
    if (!detailUnlockTitle) {
      throw new Error("The detail page did not render an unlock adapter title.");
    }
    if (!detailRecordTitle) {
      throw new Error("The detail page did not render a claim record title.");
    }
    if (!videoSrc || !videoSrc.includes("/pins/pin1.mp4")) {
      throw new Error(`Preview video did not load the seeded pin: ${videoSrc || "empty"}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
