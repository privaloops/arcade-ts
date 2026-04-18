import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

test.describe("Phase 1 — browser navigation", () => {
  test("D-pad DOWN × 5 selects the 6th game; preview panel present", async ({ page }) => {
    await installGamepadMock(page);
    await page.goto("/");

    // Mock dataset renders 10 games.
    const items = page.locator(".af-game-list-item");
    await expect(items).toHaveCount(10);

    // Initially the first game is selected.
    const selected = page.locator(".af-game-list-item.selected");
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute("data-game-id", "sf2");

    // Standard gamepad mapping: button 13 = D-pad down. For each step,
    // hold the button long enough for GamepadNav's rAF polling to observe
    // the down-edge, then release and give the next tick a chance to
    // clear button state before the next press.
    for (let i = 0; i < 5; i++) {
      const current = await page.locator(".af-game-list-item.selected").getAttribute("data-game-id");
      await page.evaluate(async () => {
        const holdButton = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
        await holdButton(13, 100);
        // Wait 2 frames so rAF sees the release before the next iteration.
        await new Promise((r) => setTimeout(r, 50));
      });
      await expect
        .poll(async () => await page.locator(".af-game-list-item.selected").getAttribute("data-game-id"), {
          timeout: 2000,
        })
        .not.toBe(current);
    }

    // 6th game = MOCK_GAMES[5] = id "mslug".
    await expect(page.locator(".af-game-list-item.selected")).toHaveAttribute("data-game-id", "mslug");

    // Preview panel is visible and reflects the new selection.
    const preview = page.locator('[data-testid="video-preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator(".af-video-preview-title")).toHaveText("Metal Slug");
  });
});
