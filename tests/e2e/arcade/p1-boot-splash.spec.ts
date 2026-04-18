import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

test.describe("Phase 1 — boot splash", () => {
  test("splash exists at DOMContentLoaded and is removed after app-ready", async ({ page }) => {
    await installGamepadMock(page);

    // Capture splash DOM presence via a boot-time snapshot so the
    // assertion doesn't race the fade-out on fast reloads.
    await page.addInitScript(() => {
      (window as unknown as { __sawSplashAtBoot: boolean }).__sawSplashAtBoot = false;
      document.addEventListener("DOMContentLoaded", () => {
        const el = document.querySelector('[data-testid="splash"]');
        (window as unknown as { __sawSplashAtBoot: boolean }).__sawSplashAtBoot = el !== null;
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The splash element existed at the moment DOMContentLoaded fired.
    const presentAtBoot = await page.evaluate(
      () => (window as unknown as { __sawSplashAtBoot: boolean }).__sawSplashAtBoot
    );
    expect(presentAtBoot).toBe(true);

    // After main.ts dispatches 'app-ready', the splash fades out and is
    // removed from the DOM within the 300 ms fade-out window.
    await expect
      .poll(async () => await page.locator('[data-testid="splash"]').count(), { timeout: 3000 })
      .toBe(0);
  });

  test("under prefers-reduced-motion, splash transition duration is 0", async ({ page }) => {
    await installGamepadMock(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const splash = page.locator('[data-testid="splash"]');
    await expect(splash).toBeVisible();

    const transitionMs = await splash.evaluate((el) => {
      const val = getComputedStyle(el).transitionDuration;
      return parseFloat(val) * (val.endsWith("ms") ? 1 : 1000);
    });
    expect(transitionMs).toBe(0);
  });
});
