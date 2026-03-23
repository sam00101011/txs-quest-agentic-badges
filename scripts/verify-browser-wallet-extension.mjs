import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ?? "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json";
const EXTENSION_PATH = process.env.EXTENSION_PATH ?? "";
const USER_DATA_DIR = process.env.USER_DATA_DIR ?? "/tmp/agentic-poap-extension";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "output/playwright";
const WAIT_MS = Number(process.env.WAIT_MS ?? 6000);

if (!EXTENSION_PATH) {
  throw new Error("Set EXTENSION_PATH to a Chromium-compatible wallet extension directory.");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`
    ]
  });

  try {
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(WAIT_MS);

    const contractOptions = await page
      .locator("#connection-wallet-provider option")
      .evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent })));
    const payerOptions = await page
      .locator("#connection-mpp-wallet-provider option")
      .evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent })));

    const screenshotPath = join(OUTPUT_DIR, "browser-wallet-extension-detect.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          contractOptions,
          payerOptions,
          screenshotPath
        },
        null,
        2
      )}\n`
    );
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
