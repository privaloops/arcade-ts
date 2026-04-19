import { test, expect } from "@playwright/test";
import { installPeerMock, seedMappingAndRoomId } from "./_helpers/peer-mock";
import { installGamepadMockOnly } from "./_helpers/gamepad";
import { loadFixtureCps1Rom, resetAndSeedRomDB } from "./_helpers/rom-db";

const ROOM_ID = "sprixe-e2e-state-sync";

test.describe("Phase 3 — real-time state sync kiosk → phone", () => {
  test.setTimeout(45_000);

  test("host browser → playing → paused propagates to the phone remote tab within 500 ms", async ({ browser }) => {
    const fixture = loadFixtureCps1Rom();
    const context = await browser.newContext();
    await seedMappingAndRoomId(context, ROOM_ID);
    await installPeerMock(context, ROOM_ID);

    // 1. Host boots and seeds a CPS-1 ROM so we can actually launch it.
    const hostPage = await context.newPage();
    await installGamepadMockOnly(hostPage);
    await hostPage.goto("/");
    await resetAndSeedRomDB(hostPage, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await hostPage.reload();
    await expect(hostPage.locator(".af-browser-screen")).toBeVisible();

    // 2. Phone opens the remote and switches to the Remote tab.
    const phonePage = await context.newPage();
    await phonePage.goto(`/send/${ROOM_ID}`);
    await expect(phonePage.locator('[data-testid="phone-page"]')).toBeVisible();
    await phonePage.locator('[data-testid="phone-tab-remote"]').click();
    const remoteState = phonePage.locator('[data-testid="remote-state"]');

    // 3. State before launch: browser.
    await expect(remoteState).toHaveAttribute("data-state", "browser", { timeout: 5000 });

    // 4. Host launches the game — state flips to "playing".
    await hostPage.evaluate(async () => {
      const h = (window as unknown as { __holdButton: (n: number, d: number) => Promise<void> }).__holdButton;
      await h(0, 120);
    });
    await expect(hostPage.locator('[data-testid="playing-screen"]')).toBeVisible({ timeout: 10_000 });
    await expect(remoteState).toHaveAttribute("data-state", "playing", { timeout: 2000 });

    // 5. Coin hold opens the pause overlay — state flips to "paused".
    await hostPage.evaluate(async () => {
      const h = (window as unknown as { __holdButton: (n: number, d: number) => Promise<void> }).__holdButton;
      await h(8, 1200);
    });
    await expect(hostPage.locator('[data-testid="pause-overlay"]')).toBeVisible();
    await expect(remoteState).toHaveAttribute("data-state", "paused", { timeout: 2000 });

    await context.close();
  });
});
