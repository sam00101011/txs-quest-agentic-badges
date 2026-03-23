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

async function runAdapterFlow(page, adapterType, expectedStatus) {
  const runId = `${adapterType.toLowerCase()}-${Date.now()}`;

  await page.click("#prefill-pin-2");
  await page.fill("#definition-name", `Adapter ${runId}`);
  await page.fill("#definition-description", `Verification smoke test for ${adapterType}.`);
  await page.fill("#definition-edition", runId);
  await page.selectOption("#definition-unlock-adapter", adapterType);
  await page.waitForTimeout(200);

  if (adapterType === "BADGE_COUNT") {
    await page.fill("#definition-unlock-threshold", "1");
  } else if (adapterType === "TOKEN_BALANCE") {
    const balanceTokenAddress = await readValue(page, "#connection-balance-token");
    if (!balanceTokenAddress) {
      throw new Error("Expected a local balance token address before running token-balance verification.");
    }
    await page.fill("#definition-unlock-target", balanceTokenAddress);
    await page.fill("#definition-unlock-threshold", "100");
  } else if (adapterType === "ORACLE_EVENT") {
    const connectedWallet = await page.locator("#connection-wallet").inputValue();
    await page.fill("#definition-unlock-signer", connectedWallet);
  } else if (adapterType === "AGENT_REP") {
    await page.fill("#definition-unlock-threshold", "1");
  }

  await page.locator("#definition-form button[type='submit']").click();
  await page.waitForFunction(
    (label) => {
      const select = document.querySelector("#claim-definition");
      if (!(select instanceof HTMLSelectElement)) {
        return false;
      }

      const selectedLabel = select.selectedOptions?.[0]?.textContent ?? "";
      return selectedLabel.includes(label);
    },
    runId,
    {
      timeout: 15000
    }
  );

  await page.click("#claim-use-connected-wallet");
  await page.selectOption("#claim-execution-path", "direct");
  await page.waitForTimeout(200);
  await page.locator("button[form='claim-form']").click();
  await page.waitForFunction(
    ({ expectedStatusText, label }) => {
      const statusText = document.querySelector("#claim-status")?.textContent ?? "";
      if (statusText.includes(expectedStatusText)) {
        return true;
      }

      const detailHeading = document.querySelector("#detail-heading")?.textContent ?? "";
      return detailHeading.includes(label);
    },
    {
      expectedStatusText: expectedStatus,
      label: runId
    },
    {
      timeout: 15000
    }
  );

  const claimStatus = await readText(page, "#claim-status");
  const detailUnlockTitle = await readText(page, "#detail-unlock-title");

  if (!claimStatus.includes(expectedStatus)) {
    throw new Error(
      `Expected "${expectedStatus}" in claim status for ${adapterType}. Got: ${claimStatus || "empty"}`
    );
  }

  return {
    adapterType,
    claimStatus,
    detailUnlockTitle,
    runId
  };
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

    await page.click("#connect-wallet");
    await page.waitForTimeout(2500);

    const connectedWallet = await page.locator("#connection-wallet").inputValue();
    if (!connectedWallet) {
      throw new Error("Wallet did not connect for unlock adapter verification.");
    }

    const badgeCountResult = await runAdapterFlow(page, "BADGE_COUNT", "Self-claimed badge");
    const tokenBalanceResult = await runAdapterFlow(page, "TOKEN_BALANCE", "Self-claimed badge");
    const oracleResult = await runAdapterFlow(page, "ORACLE_EVENT", "oracle attendance proof");
    const agentRepResult = await runAdapterFlow(page, "AGENT_REP", "agent attestation");

    const screenshotPath = join(OUTPUT_DIR, "localhost-unlock-adapters.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          connectedWallet,
          badgeCountResult,
          tokenBalanceResult,
          oracleResult,
          agentRepResult,
          screenshotPath
        },
        null,
        2
      )}\n`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
