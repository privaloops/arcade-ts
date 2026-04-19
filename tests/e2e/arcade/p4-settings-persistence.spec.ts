import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

/**
 * p4-settings-persistence — the settings screen mounts from the
 * browser, writes localStorage via SettingsStore, and the values
 * survive a full reload (§2.8 + Phase 4b.1 test).
 */

async function pressSettings(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
    // Button 8 = Coin. Holding it ≥ 1 s emits `coin-hold` which opens
    // Settings on the browser screen (contextual — in-game it toggles
    // the pause overlay). This is the 2026-04 arcade-doctrine gesture.
    await hold(8, 1200);
    await new Promise((r) => setTimeout(r, 60));
  });
}

test("Phase 4b.1 — settings screen opens from Start, persists across reload", async ({ page }) => {
  await installGamepadMock(page);
  await page.goto("/");
  await expect(page.locator(".af-browser-screen")).toBeVisible();

  await pressSettings(page);
  await expect(page.locator('[data-testid="settings-screen"]')).toBeVisible();

  // Change three settings (CRT on, integer scaling off, volume 60).
  const crt = page.locator(".af-settings-toggle").first();
  expect(await crt.isChecked()).toBe(false);
  await crt.check();
  expect(await crt.isChecked()).toBe(true);

  const integerScaling = page.locator('[data-testid="setting-integer-scaling"] input[type="checkbox"]');
  expect(await integerScaling.isChecked()).toBe(true);
  await integerScaling.uncheck();

  // Swap to the Audio tab + set volume = 60.
  await page.locator('[data-testid="settings-tab-audio"]').click();
  const volume = page.locator('[data-testid="setting-volume"] input[type="range"]');
  await volume.fill("60");
  await volume.dispatchEvent("change");

  // Reload — values should come back via SettingsStore.
  await page.reload();
  await expect(page.locator(".af-browser-screen")).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem("sprixe.settings.v1"));
  expect(stored).not.toBeNull();
  const parsed = JSON.parse(stored!);
  expect(parsed.display.crtFilter).toBe(true);
  expect(parsed.display.integerScaling).toBe(false);
  expect(parsed.audio.masterVolume).toBe(60);

  // And the UI reopened shows the persisted values.
  await pressSettings(page);
  await expect(page.locator('[data-testid="settings-screen"]')).toBeVisible();
  const crt2 = page.locator(".af-settings-toggle").first();
  expect(await crt2.isChecked()).toBe(true);
});
