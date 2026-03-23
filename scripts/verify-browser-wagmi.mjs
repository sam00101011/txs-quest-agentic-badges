import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ?? "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "output/playwright";
const MOCK_ADDRESS =
  process.env.MOCK_ADDRESS ?? "0x1234567890abcdef1234567890abcdef12345678";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

function sanitize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function readValue(page, selector) {
  return sanitize(await page.locator(selector).inputValue().catch(() => ""));
}

async function readOptions(page, selector) {
  return page
    .locator(`${selector} option`)
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: node.textContent ?? "",
        value: node.value ?? ""
      }))
    );
}

async function readLocalStorageSnapshot(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(window.localStorage)
        .sort()
        .map((key) => [key, window.localStorage.getItem(key)])
    )
  );
}

async function injectMockTempoWallet(page) {
  await page.addInitScript(
    ({ chainId, mockAddress }) => {
      const listeners = new Map();
      let activeChainId = chainId;
      const hexChainId = () => `0x${activeChainId.toString(16)}`;
      const emit = (eventName, payload) => {
        for (const listener of listeners.get(eventName) ?? []) {
          listener(payload);
        }
      };

      const provider = {
        isTempo: true,
        isMetaMask: false,
        isRabby: false,
        async request({ method, params = [] }) {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [mockAddress];
            case "eth_chainId":
              return hexChainId();
            case "net_version":
              return String(activeChainId);
            case "wallet_switchEthereumChain": {
              const nextChain = params?.[0]?.chainId;
              if (typeof nextChain === "string" && nextChain.startsWith("0x")) {
                activeChainId = Number.parseInt(nextChain, 16) || activeChainId;
              }
              emit("chainChanged", hexChainId());
              return null;
            }
            case "wallet_addEthereumChain": {
              const nextChain = params?.[0]?.chainId;
              if (typeof nextChain === "string" && nextChain.startsWith("0x")) {
                activeChainId = Number.parseInt(nextChain, 16) || activeChainId;
              }
              emit("chainChanged", hexChainId());
              return null;
            }
            default:
              throw new Error(`Unsupported mock wallet method: ${method}`);
          }
        },
        on(eventName, listener) {
          const nextListeners = listeners.get(eventName) ?? new Set();
          nextListeners.add(listener);
          listeners.set(eventName, nextListeners);
        },
        removeListener(eventName, listener) {
          listeners.get(eventName)?.delete(listener);
        }
      };

      Object.defineProperty(window, "ethereum", {
        configurable: true,
        writable: true,
        value: provider
      });
      window.ethereum.providers = [provider];
    },
    {
      chainId: CHAIN_ID,
      mockAddress: MOCK_ADDRESS
    }
  );
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
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    await injectMockTempoWallet(page);
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);

    const contractOptions = await readOptions(page, "#connection-wallet-provider");
    const payerOptions = await readOptions(page, "#connection-mpp-wallet-provider");

    await page.click("#connect-wallet");
    await page.waitForTimeout(1500);
    await page.click("#connect-mpp-wallet");
    await page.waitForTimeout(1500);

    const connectedWalletBeforeReload = await readValue(page, "#connection-wallet");
    const connectionStatusBeforeReload = sanitize(
      await page.locator("#connection-status").textContent().catch(() => "")
    );
    const payerWalletBeforeReload = await readValue(page, "#connection-mpp-wallet");
    const localStorageBeforeReload = await readLocalStorageSnapshot(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);

    const connectedWalletAfterReload = await readValue(page, "#connection-wallet");
    const connectionStatusAfterReload = sanitize(
      await page.locator("#connection-status").textContent().catch(() => "")
    );
    const payerWalletAfterReload = await readValue(page, "#connection-mpp-wallet");
    const localStorageAfterReload = await readLocalStorageSnapshot(page);

    const screenshotPath = join(OUTPUT_DIR, "localhost-wagmi-reconnect.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      connectedWalletAfterReload,
      connectedWalletBeforeReload,
      connectionStatusAfterReload,
      connectionStatusBeforeReload,
      consoleMessages,
      contractOptions,
      localStorageAfterReload,
      localStorageBeforeReload,
      pageErrors,
      payerOptions,
      payerWalletAfterReload,
      payerWalletBeforeReload,
      screenshotPath
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (connectedWalletBeforeReload.toLowerCase() !== MOCK_ADDRESS.toLowerCase()) {
      throw new Error(`Contract wallet did not connect through wagmi. Got: ${connectedWalletBeforeReload}`);
    }
    if (payerWalletBeforeReload.toLowerCase() !== MOCK_ADDRESS.toLowerCase()) {
      throw new Error(`MPP wallet did not connect through wagmi. Got: ${payerWalletBeforeReload}`);
    }
    if (connectedWalletAfterReload.toLowerCase() !== MOCK_ADDRESS.toLowerCase()) {
      throw new Error(
        `Contract wallet did not reconnect after reload. Got: ${connectedWalletAfterReload}`
      );
    }
    if (payerWalletAfterReload.toLowerCase() !== MOCK_ADDRESS.toLowerCase()) {
      throw new Error(`MPP wallet did not reconnect after reload. Got: ${payerWalletAfterReload}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
