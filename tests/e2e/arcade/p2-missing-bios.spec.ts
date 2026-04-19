import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";
import { resetAndSeedRomDB, buildMockNeoGeoGameZipB64 } from "./_helpers/rom-db";

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

test.describe("Phase 2 — missing BIOS guard", () => {
  test("launching a Neo-Geo game without a BIOS in RomDB surfaces the per-system dialog", async ({ page }) => {
    await installGamepadMock(page);
    await page.goto("/");

    // Seed only the game (with a Neo-Geo-shaped ZIP so identifyRom()
    // routes to the neogeo runner) — no "neogeo" BIOS record. The
    // runner factory must throw MissingBiosError before any canvas is
    // painted.
    const zipB64 = await buildMockNeoGeoGameZipB64();
    await resetAndSeedRomDB(page, [
      { id: "mslug", system: "neogeo", zipB64 },
    ]);
    await page.reload();

    const browser = page.locator(".af-browser-screen");
    const playing = page.locator('[data-testid="playing-screen"]');
    const dialog = page.locator('[data-testid="missing-bios-dialog"]');

    await expect(browser).toBeVisible();
    await expect(page.locator(".af-game-list-item.selected")).toHaveAttribute("data-game-id", "mslug");

    // Press Confirm → dialog appears, no playing screen.
    await holdButton(page, 0, 120);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-system", "neogeo");
    await expect(playing).toHaveCount(0);

    // Dismiss → back to browser with the same selection.
    await page.click('[data-testid="missing-bios-ok"]');
    await expect(dialog).toHaveCount(0);
    await expect(browser).toBeVisible();
    await expect(page.locator(".af-game-list-item.selected")).toHaveAttribute("data-game-id", "mslug");
  });
});
