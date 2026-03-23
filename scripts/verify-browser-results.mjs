import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ?? "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json";
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
      height: 2400
    }
  });

  const runId = `result-${Date.now()}`;

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    await page.selectOption("#connection-wallet-provider", "local-dev:anvil");
    await page.click("#connect-wallet");
    await page.waitForTimeout(1800);

    await page.click("#prefill-pin-1");
    await page.fill("#definition-name", `Result Panel ${runId}`);
    await page.fill("#definition-description", "Verifies the latest result surface for onchain badge definition.");
    await page.fill("#definition-edition", runId);
    await page.locator("#definition-form button[type='submit']").click();
    await page.waitForTimeout(3500);

    const definitionResult = {
      assetId: await readValue(page, "#result-asset-id-output"),
      definitionId: await readValue(page, "#result-definition-id-output"),
      operation: await readValue(page, "#result-operation-output"),
      primaryTxHash: await readValue(page, "#result-primary-tx-output"),
      secondaryTxHash: await readValue(page, "#result-secondary-tx-output"),
      summary: await readValue(page, "#result-summary-output")
    };

    await page.click("#claim-use-connected-wallet");
    await page.waitForTimeout(300);
    await page.locator("button[form='claim-form']").click();
    await page.waitForTimeout(4500);

    const claimResult = {
      claimStatus: await readText(page, "#claim-status"),
      claimUriLength: (await readValue(page, "#result-claim-uri-output")).length,
      definitionId: await readValue(page, "#result-definition-id-output"),
      operation: await readValue(page, "#result-operation-output"),
      primaryTxHash: await readValue(page, "#result-primary-tx-output"),
      shareUrl: await readValue(page, "#result-share-url-output"),
      summary: await readValue(page, "#result-summary-output")
    };

    const screenshotPath = join(OUTPUT_DIR, "localhost-result-panel.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      claimResult,
      definitionResult,
      runId,
      screenshotPath
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (
      definitionResult.operation !== "Badge Defined" ||
      !definitionResult.assetId ||
      !definitionResult.definitionId ||
      !definitionResult.primaryTxHash ||
      !definitionResult.secondaryTxHash
    ) {
      throw new Error(`Definition result panel did not populate correctly: ${JSON.stringify(definitionResult)}`);
    }

    if (
      claimResult.operation !== "Claim Recorded" ||
      !claimResult.primaryTxHash ||
      !claimResult.shareUrl ||
      claimResult.claimUriLength === 0
    ) {
      throw new Error(`Claim result panel did not populate correctly: ${JSON.stringify(claimResult)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
