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

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const beforeCount = Number(await readText(page, "#claim-count")) || 0;

    await page.click("#connect-wallet");
    await page.waitForTimeout(2500);

    const connectedWallet = await readValue(page, "#connection-wallet");
    if (!connectedWallet) {
      throw new Error("Wallet did not connect for event-proof verification.");
    }

    await page.click("#load-local-event-proof");
    await page.waitForTimeout(800);

    const proofPackage = await readValue(page, "#claim-proof-package");
    const proofStatus = await readText(page, "#claim-proof-status");
    const selectedDefinition = await readValue(page, "#claim-definition");
    const selectedAgent = await readValue(page, "#claim-agent");

    await page.locator("button[form='claim-form']").click();
    await page.waitForTimeout(5000);

    const afterCount = Number(await readText(page, "#claim-count")) || 0;
    const claimStatus = await readText(page, "#claim-status");
    const detailHeading = await readText(page, "#detail-heading");

    const screenshotPath = join(OUTPUT_DIR, "localhost-event-proof-claim.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      afterCount,
      beforeCount,
      claimStatus,
      connectedWallet,
      detailHeading,
      proofPackageLength: proofPackage.length,
      proofStatus,
      screenshotPath,
      selectedAgent,
      selectedDefinition
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (proofPackage.length < 50) {
      throw new Error("Expected the local event proof package to load into the form.");
    }
    if (afterCount < beforeCount + 1) {
      throw new Error(`Claim count did not increase after event proof claim. Before ${beforeCount}, after ${afterCount}.`);
    }
    if (!/oracle attendance proof/i.test(claimStatus)) {
      throw new Error(`Expected an oracle-proof claim status. Got: ${claimStatus || "empty"}`);
    }
    if (!detailHeading) {
      throw new Error("Expected the event-proof claim to open the detail view.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
