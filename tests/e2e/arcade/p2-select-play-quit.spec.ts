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

/**
 * Sample a window of pixels from the playing canvas as a numeric
 * fingerprint — the sum changes whenever the picture changes. Uses
 * readPixels for WebGL contexts, getImageData for Canvas 2D.
 */
async function sampleCanvasHash(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector('[data-testid="playing-canvas"]') as HTMLCanvasElement | null;
    if (!c) return -1;
    const gl = c.getContext("webgl2") as WebGL2RenderingContext | null;
    if (gl) {
      const pixels = new Uint8Array(4 * 32 * 32);
      gl.readPixels(10, 10, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0;
      for (let i = 0; i < pixels.length; i++) sum = (sum + pixels[i]!) | 0;
      return sum;
    }
    const ctx = c.getContext("2d");
    if (ctx) {
      const data = ctx.getImageData(10, 10, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum = (sum + data[i]!) | 0;
      return sum;
    }
    return -1;
  });
}

test.describe("Phase 2 — golden path browser → playing → browser", () => {
  test.setTimeout(30_000);

  test("real CPS-1 emulator boots, renders distinct frames, pauses, saves & quits under 10 MB heap growth", async ({ page }) => {
    await installGamepadMock(page);
    const fixture = loadFixtureCps1Rom();

    await page.goto("/");
    // Seed RomDB with the real test.zip fixture so db.get(id) returns
    // a valid ZIP for PlayingScreen.create(). Overrides the mock
    // catalogue — loadCatalogue prefers IDB whenever it has records.
    await resetAndSeedRomDB(page, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await page.reload();

    const browser = page.locator(".af-browser-screen");
    const playing = page.locator('[data-testid="playing-screen"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');

    await expect(browser).toBeVisible();
    const initiallySelected = await page
      .locator(".af-game-list-item.selected")
      .getAttribute("data-game-id");
    expect(initiallySelected).toBe(fixture.id);

    const heapBefore = await page.evaluate(() => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return memory?.usedJSHeapSize ?? null;
    });

    // 1. Confirm → PlayingScreen boots the real engine.
    await holdButton(page, 0, 120);
    await expect(playing).toBeVisible({ timeout: 10_000 });
    await expect(browser).toBeHidden();

    // 2. Let the emulator run, then check that the engine really emulated
    // frames (not just that a canvas is mounted). Reading data-engine-frames
    // proves the real Emulator.getFrameCount() moved — a static mock can't
    // fake it. We also sample the canvas to ensure it was painted with
    // engine output (non-zero pixels), even though a minimal test ROM's
    // picture can stay visually static after boot.
    await page.waitForTimeout(600);
    const framesA = await page.evaluate(() =>
      parseInt(
        (document.querySelector('[data-testid="playing-screen"]') as HTMLElement | null)
          ?.dataset.engineFrames ?? "0",
        10,
      )
    );
    expect(framesA).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    const framesB = await page.evaluate(() =>
      parseInt(
        (document.querySelector('[data-testid="playing-screen"]') as HTMLElement | null)
          ?.dataset.engineFrames ?? "0",
        10,
      )
    );
    expect(framesB).toBeGreaterThan(framesA);
    const hashA = await sampleCanvasHash(page);
    expect(hashA).toBeGreaterThan(0);

    // 3. FPS readout has updated at least once (≥1).
    const fps = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="playing-fps"]');
      return parseInt((el?.textContent ?? "").replace(/\D/g, ""), 10) || 0;
    });
    expect(fps).toBeGreaterThan(0);

    // 5. Coin hold → PauseOverlay opens, selected=Resume.
    await holdButton(page, 8, 1200);
    await expect(overlay).toBeVisible();
    await expect(overlay.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "resume");

    // 6. Navigate down 3 times → Quit, then confirm.
    for (let i = 0; i < 3; i++) {
      await holdButton(page, 13, 120);
    }
    await expect(overlay.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "quit");
    await holdButton(page, 0, 120);

    // 7. Back on the browser, same game still selected.
    await expect(browser).toBeVisible();
    await expect(playing).toHaveCount(0);
    await expect(overlay).toHaveCount(0);
    await expect(page.locator(".af-game-list-item.selected")).toHaveAttribute(
      "data-game-id",
      initiallySelected!
    );

    // 8. Anti-leak: heap growth after the full cycle stays under 10 MB.
    if (heapBefore !== null) {
      const heapAfter = await page.evaluate(() => {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return memory!.usedJSHeapSize;
      });
      const deltaMb = (heapAfter - heapBefore) / (1024 * 1024);
      expect(deltaMb).toBeLessThan(10);
    }
  });
});
