import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";

const APP_URL =
  process.env.APP_URL ??
  "http://127.0.0.1:5173/?deployment=/local/anvil-deployment.json&profileAgent=0x1234567890abcdef1234567890abcdef12345678";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "output/playwright";

function sanitize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function readText(page, selector) {
  return sanitize(await page.locator(selector).textContent().catch(() => ""));
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

    const initialHeading = await readText(page, "#profile-heading");
    const profileSummary = await readText(page, "#profile-summary");
    const overviewTitle = await readText(page, "#profile-overview-title");
    const badgeCount = await page.locator("#profile-badge-claims [data-view-claim]").count();
    const recentCount = await page.locator("#profile-recent-claims [data-view-claim]").count();
    const neighborButtons = page.locator("#profile-neighbor-list [data-view-profile]");
    const neighborCount = await neighborButtons.count();

    if (neighborCount > 0) {
      await neighborButtons.first().click();
      await page.waitForTimeout(600);
    }

    const nextHeading = await readText(page, "#profile-heading");
    const currentUrl = page.url();
    const screenshotPath = join(OUTPUT_DIR, "localhost-agent-profile.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      appUrl: APP_URL,
      badgeCount,
      currentUrl,
      initialHeading,
      neighborCount,
      nextHeading,
      overviewTitle,
      profileSummary,
      recentCount,
      screenshotPath
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (!initialHeading.includes("Agent 0x1234")) {
      throw new Error(`Profile route did not load the seeded agent: ${initialHeading || "empty"}`);
    }
    if (!profileSummary || !/claim/i.test(profileSummary)) {
      throw new Error(`Profile summary did not describe claim activity: ${profileSummary || "empty"}`);
    }
    if (!overviewTitle) {
      throw new Error("Profile overview title did not render.");
    }
    if (badgeCount < 1) {
      throw new Error(`Expected at least one badge in the profile shelf, got ${badgeCount}.`);
    }
    if (recentCount < 1) {
      throw new Error(`Expected at least one recent claim in the profile, got ${recentCount}.`);
    }
    if (neighborCount < 1) {
      throw new Error(`Expected at least one shared-badge neighbor, got ${neighborCount}.`);
    }
    if (!currentUrl.includes("profileAgent=")) {
      throw new Error(`Profile navigation did not preserve the profile route: ${currentUrl}`);
    }
    if (neighborCount > 0 && nextHeading === initialHeading) {
      throw new Error("Clicking a profile neighbor did not switch the active profile.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
