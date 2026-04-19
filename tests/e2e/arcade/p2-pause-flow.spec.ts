import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";
import { loadFixtureCps1Rom, resetAndSeedRomDB } from "./_helpers/rom-db";

async function holdButton(page: import("@playwright/test").Page, idx: number, ms: number): Promise<void> {
  await page.evaluate(
    async ([button, duration]) => {
      const hold = (window as unknown as { __holdButton: (n: number, d: number) => Promise<void> }).__holdButton;
      await hold(button as number, duration as number);
      await new Promise((r) => setTimeout(r, 60));
    },
    [idx, ms]
  );
}

test.describe("Phase 2 — pause overlay flow", () => {
  test.setTimeout(30_000);

  test("select game → hold coin 1.2s → pause opens → resume closes it", async ({ page }) => {
    await installGamepadMock(page);
    const fixture = loadFixtureCps1Rom();

    await page.goto("/");
    await resetAndSeedRomDB(page, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await page.reload();

    // Press A on the seeded game → transition into PlayingScreen.
    await holdButton(page, 0, 120);
    await expect(page.locator('[data-testid="playing-screen"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="pause-overlay"]')).toBeHidden();

    // Let the emulator advance enough frames for the FPS readout to settle.
    await page.waitForTimeout(1200);
    const framesBeforePause = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="playing-canvas"]') as HTMLCanvasElement | null;
      return el ? el.width : 0;
    });
    expect(framesBeforePause).toBe(384);

    // Coin hold 1.2s triggers the pause overlay.
    await holdButton(page, 8, 1200);

    await expect(page.locator('[data-testid="pause-overlay"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="pause-overlay"] .af-pause-item.selected')
    ).toHaveAttribute("data-action", "resume");

    // Snapshot the FPS label — when paused, the PlayingScreen freezes
    // its counter so the readout stops changing.
    const pausedFps = await page.locator('[data-testid="playing-fps"]').textContent();
    await page.waitForTimeout(400);
    const stillPausedFps = await page.locator('[data-testid="playing-fps"]').textContent();
    expect(pausedFps).toBe(stillPausedFps);

    // Confirm Resume — overlay closes, emulator resumes.
    await holdButton(page, 0, 120);
    await expect(page.locator('[data-testid="pause-overlay"]')).toBeHidden();

    // Wait ~1s for FPS readout to update (polls once per second).
    await page.waitForTimeout(1200);
    const resumedFps = await page.locator('[data-testid="playing-fps"]').textContent();
    expect(resumedFps).not.toBe("FPS: 0");
  });
});
