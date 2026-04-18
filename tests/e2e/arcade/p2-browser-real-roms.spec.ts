import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

/**
 * Clear the 'roms' store and seed N records in a single transaction.
 * Skips the deleteDatabase() path because the app keeps a RomDB
 * connection alive, which would block the delete indefinitely.
 */
async function resetAndSeedRomDB(
  page: import("@playwright/test").Page,
  records: { id: string; system: "cps1" | "neogeo" }[]
): Promise<void> {
  await page.evaluate((rows) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("sprixe-arcade", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("roms")) {
          db.createObjectStore("roms", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("roms", "readwrite");
        const store = tx.objectStore("roms");
        store.clear();
        for (const r of rows) {
          store.put({
            id: r.id,
            system: r.system,
            zipData: new ArrayBuffer(4),
            addedAt: Date.now(),
            lastPlayedAt: 0,
            playCount: 0,
            favorite: false,
            size: 4,
          });
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, records);
}

test.describe("Phase 2 — browser fed from RomDB", () => {
  test("3 seeded ROMs render as 3 browser cards with resolved titles", async ({ page }) => {
    await installGamepadMock(page);
    // Open the app once so the origin exists + the 'roms' store is
    // created by main.ts's RomDB, then seed three distinct records
    // (two CPS-1, one Neo-Geo) inside that same store.
    await page.goto("/");
    await resetAndSeedRomDB(page, [
      { id: "sf2", system: "cps1" },
      { id: "ffight", system: "cps1" },
      { id: "mslug", system: "neogeo" },
    ]);

    // Reload so main.ts picks up the seeded RomDB contents.
    await page.reload();

    const items = page.locator(".af-game-list-item");
    await expect(items).toHaveCount(3);

    const titles = await items.locator(".af-game-list-title").allTextContents();
    const badgeTexts = await items.locator(".af-badge").allTextContents();

    // Titles must be the human-readable forms from the engine catalogue
    // (not the raw ids), i.e. rom-source resolved the ids.
    expect(titles.some((t) => t.includes("Street Fighter"))).toBe(true);
    expect(titles.some((t) => t === "Final Fight")).toBe(true);
    expect(titles).toContain("Metal Slug");

    // One Neo-Geo badge + two CPS-1 badges.
    const cps1 = badgeTexts.filter((t) => t === "CPS-1").length;
    const neogeo = badgeTexts.filter((t) => t === "Neo-Geo").length;
    expect(cps1).toBe(2);
    expect(neogeo).toBe(1);

    // Clear the store so other arcade specs start with an empty DB.
    await resetAndSeedRomDB(page, []);
  });
});
