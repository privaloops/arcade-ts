import { test, expect } from "@playwright/test";
import { installGamepadMockOnly, installGamepadMock } from "./_helpers/gamepad";

async function resetAllState(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
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
          tx.onerror = () => {
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
}

async function pressButton(page: import("@playwright/test").Page, idx: number): Promise<void> {
  await page.evaluate(async (button) => {
    const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
    await hold(button, 120);
    await new Promise((r) => setTimeout(r, 60));
  }, idx);
}

test.describe("Phase 2 — first-boot input mapping", () => {
  test("empty state shows mapping screen, sequencing 6 buttons advances to browser", async ({ page }) => {
    // Use the gamepad-only helper so no default mapping is seeded —
    // this test inspects the raw "never configured" boot path.
    await installGamepadMockOnly(page);
    await page.goto("/");
    await resetAllState(page);
    await page.reload();

    // Mapping screen visible, browser not yet mounted.
    const mapping = page.locator('[data-testid="mapping-screen"]');
    await expect(mapping).toBeVisible();
    expect(await page.locator(".af-browser-screen").count()).toBe(0);

    // Sequence: coin(8), start(9), up(12), down(13), confirm(0), back(1).
    // Every press hits a distinct button so findDuplicate never trips.
    for (const btn of [8, 9, 12, 13, 0, 1]) {
      await pressButton(page, btn);
    }

    // Browser screen is now mounted; mapping screen is unmounted.
    await expect(page.locator(".af-browser-screen")).toBeVisible();
    await expect(page.locator('[data-testid="mapping-screen"]')).toHaveCount(0);

    // localStorage holds the persisted mapping.
    const stored = await page.evaluate(() => localStorage.getItem("sprixe.input.mapping.v1"));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
    expect(parsed.type).toBe("gamepad");
    expect(parsed.p1.coin).toEqual({ kind: "button", index: 8 });
  });

  test("returning user with a stored mapping skips the mapping screen", async ({ page }) => {
    await installGamepadMock(page);
    await page.goto("/");

    // Persist a mapping directly so the boot flow thinks the user
    // already went through setup.
    await page.evaluate(() => {
      const payload = {
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
      };
      localStorage.setItem("sprixe.input.mapping.v1", JSON.stringify(payload));
    });

    await page.reload();

    await expect(page.locator(".af-browser-screen")).toBeVisible();
    expect(await page.locator('[data-testid="mapping-screen"]').count()).toBe(0);
  });
});
