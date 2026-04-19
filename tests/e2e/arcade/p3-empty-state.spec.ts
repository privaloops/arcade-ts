import { test, expect } from "@playwright/test";
import { installGamepadMockOnly } from "./_helpers/gamepad";

/**
 * p3-empty-state (§2.3) — first boot with an empty ROM store shows
 * the 'Welcome to your arcade' screen with a prominent QR code and
 * absolutely no game cards.
 */

test.describe("Phase 3 — empty state", () => {
  test("IDB vide → QR ≥200px visible + welcome message + aucune game-card", async ({ page }) => {
    // installGamepadMockOnly skips the default-mapping + MOCK_GAMES
    // localStorage seeds so we can assert the raw first-boot path.
    await installGamepadMockOnly(page);
    await page.addInitScript(() => {
      // Seed only the input mapping so the mapping screen is skipped;
      // leave everything else untouched (ROM store empty, no mock flag).
      localStorage.setItem(
        "sprixe.input.mapping.v1",
        JSON.stringify({
          version: 1,
          type: "gamepad",
          p1: {
            coin: { kind: "button", index: 8 },
            start: { kind: "button", index: 9 },
            up: { kind: "button", index: 12 },
            down: { kind: "button", index: 13 },
            confirm: { kind: "button", index: 0 },
            back: { kind: "button", index: 1 },
          },
        })
      );
    });

    await page.goto("/");

    // Make sure the ROM store is clear on this origin.
    await page.evaluate(() => {
      return new Promise<void>((r) => {
        const req = indexedDB.open("sprixe-arcade");
        req.onsuccess = () => {
          const db = req.result;
          if (db.objectStoreNames.contains("roms")) {
            const tx = db.transaction("roms", "readwrite");
            tx.objectStore("roms").clear();
            tx.oncomplete = () => { db.close(); r(); };
            tx.onerror = () => { db.close(); r(); };
          } else {
            db.close();
            r();
          }
        };
        req.onerror = () => r();
      });
    });
    await page.reload();

    const empty = page.locator('[data-testid="empty-state"]');
    await expect(empty).toBeVisible();

    await expect(empty.locator(".af-empty-headline")).toHaveText("Welcome to your arcade.");

    const qr = empty.locator('[data-testid="qr"]');
    await expect(qr).toBeVisible();
    const qrBox = await qr.boundingBox();
    expect(qrBox).not.toBeNull();
    expect(qrBox!.width).toBeGreaterThanOrEqual(200);
    expect(qrBox!.height).toBeGreaterThanOrEqual(200);

    // The QR URL points at an http origin + /send/{roomId}. In dev the
    // vite config injects __LAN_IP__ so the encoded host is the Mac's
    // LAN IP; in local test runs where no LAN interface is up it falls
    // back to the kiosk's own origin. Either way it must be an http
    // URL ending in /send/<something>.
    const url = await qr.getAttribute("data-url");
    expect(url).toMatch(/^https?:\/\/[^\s]+\/send\/.+/);

    // No game cards in the DOM — the empty-state path does not mount
    // the browser screen.
    await expect(page.locator(".af-game-list-item")).toHaveCount(0);
  });
});
