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

async function readVideoState(target) {
  if (!target) {
    return {
      currentTime: 0,
      paused: true,
      present: false
    };
  }

  return target.evaluate((node) => {
    const video = node.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      return {
        currentTime: 0,
        paused: true,
        present: false
      };
    }

    return {
      currentTime: video.currentTime,
      paused: video.paused,
      present: true
    };
  });
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

    const visibleCount = await readText(page, "#gallery-visible-count");
    const agentCount = await readText(page, "#gallery-agent-count");
    const galleryStatus = await readText(page, "#gallery-status");
    const badgeGridStatus = await readText(page, "#badge-grid-status");
    const badgeTileCount = await page.locator("#badge-grid .badge-tile").count();
    const populatedBadgeCount = await page.locator("#badge-grid .badge-tile[data-view-pin]").count();
    const firstCard = page.locator("#claim-gallery .claim-card").first();
    const firstBadgeTile = page.locator("#badge-grid .badge-tile[data-view-pin]").first();
    const initialCardCount = await page.locator("#claim-gallery .claim-card").count();

    let badgeHoverState = {
      currentTime: 0,
      paused: true,
      present: false
    };
    if ((await firstBadgeTile.count()) > 0) {
      await firstBadgeTile.hover();
      await page.waitForTimeout(900);
      badgeHoverState = await readVideoState(await firstBadgeTile.elementHandle());
      await firstBadgeTile.click({
        position: {
          x: 24,
          y: 24
        }
      });
      await page.waitForTimeout(300);
    }

    const badgeWallDisplayAfterOpen = await page
      .locator("#badge-wall-stage")
      .evaluate((node) => window.getComputedStyle(node).display)
      .catch(() => "");

    let claimHoverState = {
      currentTime: 0,
      paused: true,
      present: false
    };
    if ((await firstCard.count()) > 0) {
      await firstCard.hover();
      await page.waitForTimeout(900);
      claimHoverState = await readVideoState(await firstCard.elementHandle());
      await firstCard.click({
        position: {
          x: 24,
          y: 24
        }
      });
      await page.waitForTimeout(300);
    }

    await page.fill("#gallery-filter", "Trailblazer");
    await page.waitForTimeout(300);
    await page.selectOption("#gallery-sort", "badge");
    await page.waitForTimeout(300);

    const filteredCardCount = await page.locator("#claim-gallery .claim-card").count();
    const firstCardTitle = sanitize(await firstCard.locator(".claim-title").textContent());
    const hasOpenShareButton = (await page.locator("#claim-gallery [data-open-share]").count()) > 0;
    const detailHeading = await readText(page, "#detail-heading");
    const previewTitle = await readText(page, "#preview-title");

    const screenshotPath = join(OUTPUT_DIR, "localhost-gallery-polished.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    const result = {
      agentCount,
      badgeHoverState,
      badgeGridStatus,
      badgeTileCount,
      badgeWallDisplayAfterOpen,
      claimHoverState,
      detailHeading,
      filteredCardCount,
      firstCardTitle,
      galleryStatus,
      hasOpenShareButton,
      initialCardCount,
      populatedBadgeCount,
      previewTitle,
      screenshotPath,
      visibleCount
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (Number(visibleCount) < 1) {
      throw new Error(`Expected at least one visible claim, got ${visibleCount || "empty"}.`);
    }
    if (Number(agentCount) < 1) {
      throw new Error(`Expected at least one agent shelf entry, got ${agentCount || "empty"}.`);
    }
    if (badgeTileCount < 20) {
      throw new Error(`Expected the badge wall to show the expanded pin set, got ${badgeTileCount} slots.`);
    }
    if (populatedBadgeCount < 1) {
      throw new Error("Expected at least one populated badge tile in the badge wall.");
    }
    if (badgeWallDisplayAfterOpen !== "none") {
      throw new Error(`Expected the badge wall to hide after opening detail, got ${badgeWallDisplayAfterOpen || "empty"}.`);
    }
    if (badgeHoverState.present && (badgeHoverState.paused || badgeHoverState.currentTime <= 0)) {
      throw new Error(`Expected badge tile hover video to play, got ${JSON.stringify(badgeHoverState)}.`);
    }
    if (claimHoverState.present && (claimHoverState.paused || claimHoverState.currentTime <= 0)) {
      throw new Error(`Expected claim card hover video to play, got ${JSON.stringify(claimHoverState)}.`);
    }
    if (filteredCardCount < 1 || !firstCardTitle) {
      throw new Error("Gallery filtering did not leave a visible claim card.");
    }
    if (!hasOpenShareButton) {
      throw new Error("Expected at least one Open Share button in the gallery.");
    }
    if (!detailHeading || !previewTitle) {
      throw new Error("Clicking a card did not open the detail view.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
