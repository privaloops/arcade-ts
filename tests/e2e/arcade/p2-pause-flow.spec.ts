import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

async function seedMappingAndLaunch(page: import("@playwright/test").Page): Promise<void> {
  await installGamepadMock(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "sprixe.input.mapping.v1",
      JSON.stringify({
        version: 1,
        type: "gamepad",
        p1: {
          coin: { kind: "button", index: 8 },
          start: { kind: "button", index: 9 },
          up: { kind: "axis", index: 1, dir: -1 },
          down: { kind: "axis", index: 1, dir: 1 },
          confirm: { kind: "button", index: 0 },
          back: { kind: "button", index: 1 },
        },
      })
    );
    // Clear the ROM store so the MOCK_GAMES fallback is used.
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("sprixe-arcade", 1);
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains("roms")) {
          const tx = db.transaction("roms", "readwrite");
          tx.objectStore("roms").clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        } else {
          db.close();
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  });
  await page.reload();
}

test.describe("Phase 2 — pause overlay flow", () => {
  test("select game → hold coin 1.2s → pause opens → resume closes it", async ({ page }) => {
    await seedMappingAndLaunch(page);

    // Press A on the first game → transition into PlayingScreen.
    await page.evaluate(async () => {
      const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
      await hold(0, 120);
    });

    await expect(page.locator('[data-testid="playing-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="pause-overlay"]')).toBeHidden();

    // Wait for the emulator to advance a few frames so the "resume"
    // assertion later has something to compare against.
    await page.waitForTimeout(300);
    const framesBeforePause = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="playing-canvas"]') as HTMLCanvasElement | null;
      return el ? el.width : 0; // canvas is present → emulator is running
    });
    expect(framesBeforePause).toBe(384);

    // Coin hold 1.2s triggers the pause overlay.
    await page.evaluate(async () => {
      const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
      await hold(8, 1200);
    });

    await expect(page.locator('[data-testid="pause-overlay"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="pause-overlay"] .af-pause-item.selected')
    ).toHaveAttribute("data-action", "resume");

    // Snapshot the FPS label — when paused, emulator stops incrementing
    // the frame counter so the canvas content doesn't change further.
    const pausedFps = await page.locator('[data-testid="playing-fps"]').textContent();
    await page.waitForTimeout(400);
    const stillPausedFps = await page.locator('[data-testid="playing-fps"]').textContent();
    expect(pausedFps).toBe(stillPausedFps);

    // Confirm Resume — overlay closes, emulator resumes.
    await page.evaluate(async () => {
      const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
      await hold(0, 120);
    });
    await expect(page.locator('[data-testid="pause-overlay"]')).toBeHidden();

    // Wait ~1s for FPS readout to update (it polls every ~1000ms).
    await page.waitForTimeout(1200);
    const resumedFps = await page.locator('[data-testid="playing-fps"]').textContent();
    expect(resumedFps).not.toBe("FPS: 0");
  });
});
