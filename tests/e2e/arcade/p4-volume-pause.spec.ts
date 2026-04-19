import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";
import { loadFixtureCps1Rom, resetAndSeedRomDB } from "./_helpers/rom-db";

/**
 * p4-volume-pause — the pause overlay renders a volume slider
 * (Phase 4b.4 wires it) that writes straight through SettingsStore
 * so the value survives resume → quit (§2.6).
 */

async function hold(page: import("@playwright/test").Page, button: number, ms = 120): Promise<void> {
  await page.evaluate(
    async ([b, duration]) => {
      const h = (window as unknown as { __holdButton: (n: number, d: number) => Promise<void> }).__holdButton;
      await h(b as number, duration as number);
      await new Promise((r) => setTimeout(r, 60));
    },
    [button, ms]
  );
}

test.setTimeout(30_000);

test("Phase 4b.4 — pause → volume slider to 25 → resume → quit → settings.audio.masterVolume === 25", async ({
  page,
}) => {
  await installGamepadMock(page);
  const fixture = loadFixtureCps1Rom();
  await page.goto("/");
  await resetAndSeedRomDB(page, [
    { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
  ]);
  await page.reload();
  await expect(page.locator(".af-browser-screen")).toBeVisible();

  // Launch the seeded game. Confirm (button 0) triggers GameList.onSelect.
  await hold(page, 0);
  await expect(page.locator('[data-testid="playing-screen"]')).toBeVisible({ timeout: 10_000 });

  // Coin-hold opens the pause overlay (Phase 2.7).
  await hold(page, 8, 1200);
  await expect(page.locator('[data-testid="pause-overlay"]')).toBeVisible();

  // Volume slider is mounted with the current setting (default 80).
  const slider = page.locator('[data-testid="pause-volume-slider"]');
  await expect(slider).toHaveValue("80");

  // Drag to 25 and confirm the Settings value updates live.
  await slider.fill("25");
  await slider.dispatchEvent("input");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("sprixe.settings.v1");
        return raw ? (JSON.parse(raw) as { audio: { masterVolume: number } }).audio.masterVolume : null;
      })
    )
    .toBe(25);

  // Nav to 'Quit to Menu' — 3 downs — then confirm.
  for (let i = 0; i < 3; i++) await hold(page, 13);
  await expect(page.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "quit");
  await hold(page, 0);

  // Back in the browser, the volume setting should still be 25.
  await expect(page.locator(".af-browser-screen")).toBeVisible();
  const volumeAfterQuit = await page.evaluate(() => {
    const raw = localStorage.getItem("sprixe.settings.v1");
    return raw ? (JSON.parse(raw) as { audio: { masterVolume: number } }).audio.masterVolume : null;
  });
  expect(volumeAfterQuit).toBe(25);
});
