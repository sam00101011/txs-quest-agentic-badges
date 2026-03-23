import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ?? "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json";
const EXTENSION_PATH = process.env.EXTENSION_PATH ?? "";
const USER_DATA_DIR = process.env.USER_DATA_DIR ?? "/tmp/agentic-poap-extension";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "output/playwright";
const WAIT_MS = Number(process.env.WAIT_MS ?? 3500);

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

function orderWalletOptions(options) {
  const ranked = [
    ...options.filter((option) => /rabby/i.test(option.label)),
    ...options.filter((option) => /tempo/i.test(option.label) && !/rabby/i.test(option.label)),
    ...options.filter((option) => /metamask/i.test(option.label)),
    ...options.filter(
      (option) =>
        option.value &&
        !/rabby/i.test(option.label) &&
        !/tempo/i.test(option.label) &&
        !/metamask/i.test(option.label)
    )
  ];

  return ranked.filter(
    (option, index) =>
      option.value &&
      ranked.findIndex((candidate) => candidate.value === option.value) === index
  );
}

async function maybeCapturePopup(context, outputName) {
  const popup = await context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
  if (!popup) {
    return null;
  }

  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await popup.waitForTimeout(1200);
  const screenshotPath = join(OUTPUT_DIR, outputName);
  await popup.screenshot({
    path: screenshotPath,
    fullPage: true
  }).catch(() => {});

  return {
    screenshotPath,
    title: sanitize(await popup.title().catch(() => "")),
    url: popup.url()
  };
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

async function connectFlow({ context, page, selectSelector, buttonSelector, valueSelector, screenshotName }) {
  const livePage = resolveLivePage(context, page);
  if (!livePage) {
    return {
      connectedValue: "",
      currentPages: [],
      errorMessage: "No live browser page remained open.",
      options: [],
      popup: null,
      selectedLabel: "",
      status: ""
    };
  }

  const options = await readOptions(livePage, selectSelector);
  const candidates = orderWalletOptions(options);

  if (!candidates.length) {
    return {
      connectedValue: "",
      currentPages: context.pages().map((entry) => entry.url()),
      errorMessage: "",
      options,
      popup: null,
      selectedLabel: "",
      status: "No wallet option available."
    };
  }
  let lastAttempt = {
    connectedValue: "",
    currentPages: context.pages().map((entry) => entry.url()),
    errorMessage: "",
    options,
    popup: null,
    selectedLabel: "",
    status: ""
  };

  for (const selected of candidates) {
    const currentPageForAttempt = resolveLivePage(context, livePage);
    if (!currentPageForAttempt) {
      break;
    }

    await currentPageForAttempt.selectOption(selectSelector, selected.value);
    await currentPageForAttempt.waitForTimeout(250);

    const popupPromise = maybeCapturePopup(
      context,
      screenshotName.replace(
        ".png",
        `-${selected.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`
      )
    );
    let errorMessage = "";

    try {
      await currentPageForAttempt.click(buttonSelector);
      await currentPageForAttempt.waitForTimeout(WAIT_MS);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const currentPage = resolveLivePage(context, currentPageForAttempt);
    const connectedValue = currentPage ? await readValue(currentPage, valueSelector) : "";
    const status = currentPage ? await readText(currentPage, "#connection-status") : "";

    lastAttempt = {
      connectedValue,
      currentPages: context.pages().map((entry) => entry.url()),
      errorMessage,
      options,
      popup: await popupPromise,
      selectedLabel: selected.label,
      status
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
    await page.waitForTimeout(WAIT_MS);

    const initialScreenshotPath = join(OUTPUT_DIR, "browser-wallet-connect-start.png");
    await page.screenshot({
      path: initialScreenshotPath,
      fullPage: true
    });

    const contractFlow = await connectFlow({
      context,
      page,
      selectSelector: "#connection-wallet-provider",
      buttonSelector: "#connect-wallet",
      valueSelector: "#connection-wallet",
      screenshotName: "browser-wallet-contract-popup.png"
    });
    const activePage = resolveLivePage(context, page) ?? page;

    const payerFlow = await connectFlow({
      context,
      page: activePage,
      selectSelector: "#connection-mpp-wallet-provider",
      buttonSelector: "#connect-mpp-wallet",
      valueSelector: "#connection-mpp-wallet",
      screenshotName: "browser-wallet-payer-popup.png"
    });

    const reportPage = resolveLivePage(context, activePage);
    const finalScreenshotPath = join(OUTPUT_DIR, "browser-wallet-connect-result.png");
    if (reportPage) {
      await reportPage.screenshot({
        path: finalScreenshotPath,
        fullPage: true
      }).catch(() => {});
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          contractFlow,
          diagnosticsSummary: reportPage
            ? await readText(reportPage, "#wallet-diagnostics-summary")
            : "",
          finalScreenshotPath,
          payerFlow,
          remainingPages: context.pages().map((entry) => entry.url()),
          sessionDiagnostics: reportPage
            ? await reportPage
                .locator("#wallet-diagnostics-session .wallet-diagnostic-item")
                .evaluateAll((nodes) =>
                  nodes.map((node) => String(node.textContent ?? "").replace(/\s+/g, " ").trim())
                )
            : [],
          startScreenshotPath: initialScreenshotPath
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
