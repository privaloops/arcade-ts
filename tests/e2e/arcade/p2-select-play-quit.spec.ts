import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

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

test.describe("Phase 2 — golden path browser → playing → browser", () => {
  test("full select → play → pause → quit cycle keeps selection + stays under 10 MB heap growth", async ({ page }) => {
    await installGamepadMock(page);
    await page.goto("/");

    const browser = page.locator(".af-browser-screen");
    const playing = page.locator('[data-testid="playing-screen"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');

    await expect(browser).toBeVisible();
    const initiallySelected = await page
      .locator(".af-game-list-item.selected")
      .getAttribute("data-game-id");
    expect(initiallySelected).not.toBeNull();

    // Chromium-only: sample heap before the loop. If performance.memory
    // isn't exposed we skip the anti-leak check.
    const heapBefore = await page.evaluate(() => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return memory?.usedJSHeapSize ?? null;
    });

    // 1. Confirm → PlayingScreen mounts.
    await holdButton(page, 0, 120);
    await expect(playing).toBeVisible();
    await expect(browser).toBeHidden();

    // Canvas is rendering mock frames — first two pixels are non-black.
    await page.waitForTimeout(200);
    const canvasPainted = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="playing-canvas"]') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const px = ctx.getImageData(10, 10, 1, 1).data;
      return px[0] + px[1] + px[2] > 0;
    });
    expect(canvasPainted).toBe(true);

    // 2. Coin hold → PauseOverlay opens, selected=Resume.
    await holdButton(page, 8, 1200);
    await expect(overlay).toBeVisible();
    await expect(overlay.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "resume");

    // 3. Navigate down 3 times → Quit, then confirm.
    for (let i = 0; i < 3; i++) {
      // Button 13 = D-pad down in our default standard mapping.
      await holdButton(page, 13, 120);
    }
    await expect(overlay.locator(".af-pause-item.selected")).toHaveAttribute("data-action", "quit");
    await holdButton(page, 0, 120); // confirm quit

    // 4. Back on the browser, with the same game still selected.
    await expect(browser).toBeVisible();
    await expect(playing).toHaveCount(0);
    await expect(overlay).toHaveCount(0);
    await expect(page.locator(".af-game-list-item.selected")).toHaveAttribute(
      "data-game-id",
      initiallySelected!
    );

    // 5. Anti-leak: heap growth after the full cycle stays under 10 MB.
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
