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
      height: 2200
    }
  });

  const runId = `browser-${Date.now()}`;

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const beforeCount = Number(await readText(page, "#claim-count")) || 0;
    const selectedWallet = await page.locator("#connection-wallet-provider").inputValue();

    await page.click("#connect-wallet");
    await page.waitForTimeout(2500);

    const connectedWallet = await readValue(page, "#connection-wallet");
    if (!connectedWallet) {
      throw new Error(`Wallet did not connect. Provider selection: ${selectedWallet || "none"}`);
    }

    await page.click("#prefill-pin-2");
    await page.fill("#definition-name", `Browser Live ${runId}`);
    await page.fill(
      "#definition-description",
      "Issued from the localhost browser flow using the built-in dev wallet."
    );
    await page.fill("#definition-edition", runId);
    await page.locator("#definition-form button[type='submit']").click();
    await page.waitForTimeout(3000);

    const definitionStatus = await readText(page, "#definition-status");

    await page.click("#claim-use-connected-wallet");
    await page.waitForTimeout(500);
    await page.locator("button[form='claim-form']").click();
    await page.waitForTimeout(5000);

    const afterCount = Number(await readText(page, "#claim-count")) || 0;
    const claimStatus = await readText(page, "#claim-status");
    const previewTitle = await readText(page, "#preview-title");
    const claimUri = await readValue(page, "#claim-uri-output");

    const screenshotPath = join(OUTPUT_DIR, "localhost-browser-issued-claim.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      afterCount,
      beforeCount,
      claimStatus,
      claimUriLength: claimUri.length,
      connectedWallet,
      definitionStatus,
      previewTitle,
      runId,
      screenshotPath,
      selectedWallet
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (afterCount < beforeCount + 1) {
      throw new Error(
        `Claim count did not increase. Before: ${beforeCount}. After: ${afterCount}. Status: ${claimStatus}`
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
