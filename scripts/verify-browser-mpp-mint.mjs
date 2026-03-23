import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ?? "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json";
const EXTENSION_PATH = process.env.EXTENSION_PATH ?? "";
const USER_DATA_DIR = process.env.USER_DATA_DIR ?? "/tmp/agentic-poap-extension";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "output/playwright";
const WAIT_MS = Number(process.env.WAIT_MS ?? 12000);
const MINT_WAIT_MS = Number(process.env.MINT_WAIT_MS ?? 20000);
const TARGET_DEFINITION_ID = process.env.DEFINITION_ID ?? "7";

if (!EXTENSION_PATH) {
  throw new Error("Set EXTENSION_PATH to a Chromium-compatible wallet extension directory.");
}

function sanitize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function readText(page, selector) {
  return sanitize(await page.locator(selector).textContent().catch(() => ""));
}

async function readValue(page, selector) {
  return sanitize(await page.locator(selector).inputValue().catch(() => ""));
}

async function readOptions(page, selector) {
  return page
    .locator(`${selector} option`)
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: String(node.textContent ?? "").replace(/\s+/g, " ").trim(),
        value: node.value ?? ""
      }))
    );
}

function resolveLivePage(context, page) {
  if (page && !page.isClosed()) {
    return page;
  }

  return (
    context.pages().find((entry) => !entry.isClosed() && /^http:\/\/127\.0\.0\.1:5173/.test(entry.url())) ??
    context.pages().find((entry) => !entry.isClosed()) ??
    null
  );
}

function orderPayerOptions(options) {
  const ranked = [
    ...options.filter((option) => /metamask/i.test(option.label)),
    ...options.filter((option) => /rabby/i.test(option.label)),
    ...options.filter((option) => /tempo/i.test(option.label)),
    ...options.filter(
      (option) =>
        option.value &&
        !/metamask/i.test(option.label) &&
        !/rabby/i.test(option.label) &&
        !/tempo/i.test(option.label)
    )
  ];

  return ranked.filter(
    (option, index) =>
      option.value &&
      ranked.findIndex((candidate) => candidate.value === option.value) === index
  );
}

async function connectLocalDevWallet(page) {
  await page.selectOption("#connection-wallet-provider", "local-dev:anvil");
  await page.waitForTimeout(250);
  await page.click("#connect-wallet");
  await page.waitForTimeout(1500);
  return readValue(page, "#connection-wallet");
}

async function tryConnectPayer(context, page) {
  const initialPage = resolveLivePage(context, page);
  if (!initialPage) {
    return {
      connectedValue: "",
      selectedLabel: "",
      status: "",
      options: []
    };
  }

  const options = await readOptions(initialPage, "#connection-mpp-wallet-provider");
  const candidates = orderPayerOptions(options);
  let lastAttempt = {
    connectedValue: "",
    errorMessage: "",
    selectedLabel: "",
    status: "",
    options
  };

  for (const candidate of candidates) {
    const livePage = resolveLivePage(context, page);
    if (!livePage) {
      break;
    }

    await livePage.selectOption("#connection-mpp-wallet-provider", candidate.value);
    await livePage.waitForTimeout(250);
    let errorMessage = "";

    try {
      await livePage.click("#connect-mpp-wallet");
      await livePage.waitForTimeout(WAIT_MS);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const currentPage = resolveLivePage(context, livePage);
    const connectedValue = currentPage ? await readValue(currentPage, "#connection-mpp-wallet") : "";
    const status = currentPage ? await readText(currentPage, "#connection-status") : "";

    lastAttempt = {
      connectedValue,
      errorMessage,
      selectedLabel: candidate.label,
      status,
      options
    };

    if (connectedValue) {
      return lastAttempt;
    }
  }

  return lastAttempt;
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
    await page.waitForTimeout(4000);

    const beforeCount = Number(await readText(page, "#claim-count")) || 0;
    const contractWallet = await connectLocalDevWallet(page);

    const payerAttempt = await tryConnectPayer(context, page);
    const livePage = resolveLivePage(context, page);
    if (!livePage) {
      const fallbackScreenshotPath = join(OUTPUT_DIR, "browser-mpp-mint-closed.png");
      const fallbackPage = context.pages().find((entry) => !entry.isClosed()) ?? null;
      if (fallbackPage) {
        await fallbackPage.screenshot({
          path: fallbackScreenshotPath,
          fullPage: true
        }).catch(() => {});
      }

      process.stdout.write(
        `${JSON.stringify(
          {
            claimStatus: "",
            contractWallet,
            diagnosticsSummary: "",
            payerAttempt,
            remainingPages: context.pages().map((entry) => entry.url()),
            screenshotPath: fallbackScreenshotPath,
            targetDefinitionId: TARGET_DEFINITION_ID
          },
          null,
          2
        )}\n`
      );
      return;
    }

    await livePage.selectOption("#claim-definition", TARGET_DEFINITION_ID);
    await livePage.waitForTimeout(250);
    await livePage.click("#claim-use-connected-wallet");
    await livePage.waitForTimeout(500);

    let mintStatus = "";
    let claimUriLength = 0;
    let afterCount = beforeCount;

    if (payerAttempt.connectedValue) {
      await livePage.click("#mint-via-mpp").catch(() => {});
      await livePage.waitForTimeout(MINT_WAIT_MS);
      mintStatus = await readText(livePage, "#claim-status");
      const claimUri = await readValue(livePage, "#claim-uri-output");
      claimUriLength = claimUri.length;
      afterCount = Number(await readText(livePage, "#claim-count")) || 0;
    } else {
      mintStatus = await readText(livePage, "#claim-status");
    }

    const screenshotPath = join(OUTPUT_DIR, "browser-mpp-mint-result.png");
    await livePage.screenshot({
      path: screenshotPath,
      fullPage: true
    }).catch(() => {});

    process.stdout.write(
      `${JSON.stringify(
        {
          afterCount,
          beforeCount,
          claimStatus: mintStatus,
          claimUriLength,
          contractWallet,
          diagnosticsSummary: await readText(livePage, "#wallet-diagnostics-summary"),
          payerAttempt,
          remainingPages: context.pages().map((entry) => entry.url()),
          screenshotPath,
          targetDefinitionId: TARGET_DEFINITION_ID
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
