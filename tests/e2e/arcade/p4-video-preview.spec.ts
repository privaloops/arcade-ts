import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

/**
 * p4-video-preview — VideoPreview right-pane flow (§2.4 + Phase 4b.2).
 *
 * The placeholder GameEntry.screenshotUrl shows instantly, PreviewLoader
 * then fetches /media/{system}/{id}/screenshot.png and upgrades the
 * <img> src to a blob: URL when the CDN (dev server /public) responds.
 * After DEFAULT_CROSSFADE_DELAY_MS (1000ms), hasVideo() HEADs
 * /media/{system}/{id}/video.mp4 — on 404 the screenshot stays and no
 * <video> is mounted. The middleware `media-not-found-is-404` in
 * vite.config.ts guarantees a real 404 (not SPA fallback).
 */

test("Phase 4b.2 — screenshot resolves to a CDN blob URL", async ({ page }) => {
  await installGamepadMock(page);
  // Wipe IDB so MediaCache starts empty — otherwise the previous test
  // may have cached a blob and we'd race against a pre-warmed cache.
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("sprixe-arcade");
  });
  await page.goto("/");
  await expect(page.locator(".af-browser-screen")).toBeVisible();

  const img = page.locator('[data-testid="video-preview-image"]');
  await expect(img).toBeVisible();

  // PreviewLoader resolves the real screenshot and swaps src to a blob URL
  // served out of MediaCache. Poll until the upgrade lands.
  await expect(async () => {
    const src = await img.getAttribute("src");
    expect(src?.startsWith("blob:")).toBe(true);
  }).toPass({ timeout: 5000 });
});

test("Phase 4b.2 — no <video> is mounted when hasVideo() returns 404", async ({ page }) => {
  await installGamepadMock(page);
  await page.goto("/");
  await expect(page.locator(".af-browser-screen")).toBeVisible();

  // The Vite middleware returns a real 404 for any missing /media/* path.
  // None of the MOCK_GAMES have a video clip in public/media, so the
  // crossfade timer (1000ms) should elapse without mounting a <video>.
  await page.waitForTimeout(1500);

  const video = page.locator('[data-testid="video-preview-video"]');
  await expect(video).toHaveCount(0);

  // And the <img> is still there as the fallback.
  await expect(page.locator('[data-testid="video-preview-image"]')).toBeVisible();
});
