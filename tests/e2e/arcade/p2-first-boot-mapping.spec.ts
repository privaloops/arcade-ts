import { test, expect } from "@playwright/test";
import { installGamepadMockOnly, installGamepadMock } from "./_helpers/gamepad";

async function resetAllState(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("sprixe-arcade");
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
  test("empty state shows mapping screen, sequencing 12 arcade buttons advances to browser", async ({ page }) => {
    // Use the gamepad-only helper so no default mapping is seeded —
    // this test inspects the raw "never configured" boot path.
    await installGamepadMockOnly(page);
    // The post-mapping assertion expects the browser screen to mount
    // immediately. Without this flag main.ts would route to the
    // empty-state QR screen since IDB is wiped in resetAllState.
    await page.addInitScript(() => {
      localStorage.setItem("sprixe.useMockCatalogue", "true");
    });
    await page.goto("/");
    await resetAllState(page);
    await page.reload();

    // Mapping screen visible, browser not yet mounted.
    const mapping = page.locator('[data-testid="mapping-screen"]');
    await expect(mapping).toBeVisible();
    expect(await page.locator(".af-browser-screen").count()).toBe(0);

    // 12-prompt arcade mapping: coin, start, directions, 6 play buttons.
    // Each distinct index avoids findDuplicate warnings.
    for (const btn of [8, 9, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5]) {
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

    // Persist a full 12-role mapping directly so the boot flow thinks
    // the user already went through setup.
    await page.evaluate(() => {
      const payload = {
        version: 1,
        type: "gamepad",
        p1: {
          coin: { kind: "button", index: 8 },
          start: { kind: "button", index: 9 },
          up: { kind: "button", index: 12 },
          down: { kind: "button", index: 13 },
          left: { kind: "button", index: 14 },
          right: { kind: "button", index: 15 },
          button1: { kind: "button", index: 0 },
          button2: { kind: "button", index: 1 },
          button3: { kind: "button", index: 2 },
          button4: { kind: "button", index: 3 },
          button5: { kind: "button", index: 4 },
          button6: { kind: "button", index: 5 },
        },
      };
      localStorage.setItem("sprixe.input.mapping.v1", JSON.stringify(payload));
    });

    await page.reload();

    await expect(page.locator(".af-browser-screen")).toBeVisible();
    expect(await page.locator('[data-testid="mapping-screen"]').count()).toBe(0);
  });
});
