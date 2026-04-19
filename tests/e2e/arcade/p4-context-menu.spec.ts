import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";
import { loadFixtureCps1Rom, resetAndSeedRomDB } from "./_helpers/rom-db";

/**
 * Per-game context menu (Phase 4b polish) — opened by button3 on the
 * browser's selected item. Covers the three actions that matter
 * (Launch / Toggle favorite / Delete) plus Cancel.
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

test.describe("Phase 4b — per-game context menu", () => {
  test.setTimeout(20_000);

  test("button3 opens the context menu; Toggle favorite persists in RomDB", async ({ page }) => {
    await installGamepadMock(page);
    const fixture = loadFixtureCps1Rom();
    await page.goto("/");
    await resetAndSeedRomDB(page, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await page.reload();

    const browser = page.locator(".af-browser-screen");
    const menu = page.locator('[data-testid="context-menu"]');
    await expect(browser).toBeVisible();

    // Button 3 = context-menu → opens on current selection.
    await hold(page, 2); // arcade button3 mapped to index 2 in the test helper
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("data-game-id", fixture.id);

    // Nav down to 'favorite', confirm (button1 = index 0).
    await hold(page, 13);
    await expect(menu.locator(".af-context-menu-item.selected")).toHaveAttribute("data-action", "favorite");
    await hold(page, 0);

    // Menu closed, RomDB flipped favorite to true.
    await expect(menu).toHaveCount(0);
    const favoriteAfter = await page.evaluate((id) =>
      new Promise<boolean>((resolve, reject) => {
        const req = indexedDB.open("sprixe-arcade");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("roms", "readonly");
          const getReq = tx.objectStore("roms").get(id);
          getReq.onsuccess = () => resolve(Boolean((getReq.result as { favorite?: boolean } | undefined)?.favorite));
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      }), fixture.id);
    expect(favoriteAfter).toBe(true);
  });

  test("Cancel closes the menu without side effects", async ({ page }) => {
    await installGamepadMock(page);
    const fixture = loadFixtureCps1Rom();
    await page.goto("/");
    await resetAndSeedRomDB(page, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await page.reload();

    await hold(page, 2);
    await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
    // Down × 3 → Cancel, then confirm.
    for (let i = 0; i < 3; i++) await hold(page, 13);
    await expect(page.locator(".af-context-menu-item.selected")).toHaveAttribute("data-action", "cancel");
    await hold(page, 0);

    await expect(page.locator('[data-testid="context-menu"]')).toHaveCount(0);
    await expect(page.locator(".af-browser-screen")).toBeVisible();
  });
});
