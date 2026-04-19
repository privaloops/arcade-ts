import { test, expect } from "@playwright/test";
import { installPeerMock, seedMappingAndRoomId } from "./_helpers/peer-mock";
import { installGamepadMockOnly } from "./_helpers/gamepad";
import { loadFixtureCps1Rom, resetAndSeedRomDB } from "./_helpers/rom-db";

const ROOM_ID = "sprixe-e2e-phone-remote";

test.describe("Phase 3 — phone remote commands drive the kiosk", () => {
  test.setTimeout(60_000);

  test("phone Pause opens host overlay; Volume updates settings; Quit returns to browser", async ({ browser }) => {
    const fixture = loadFixtureCps1Rom();
    const context = await browser.newContext();
    await seedMappingAndRoomId(context, ROOM_ID);
    await installPeerMock(context, ROOM_ID);

    // Host with a seeded ROM.
    const hostPage = await context.newPage();
    await installGamepadMockOnly(hostPage);
    await hostPage.goto("/");
    await resetAndSeedRomDB(hostPage, [
      { id: fixture.id, system: "cps1", zipB64: fixture.zipB64 },
    ]);
    await hostPage.reload();
    await expect(hostPage.locator(".af-browser-screen")).toBeVisible();

    // Launch the game via gamepad confirm so host is in the playing state.
    await hostPage.evaluate(async () => {
      const h = (window as unknown as { __holdButton: (n: number, d: number) => Promise<void> }).__holdButton;
      await h(0, 120);
    });
    const playing = hostPage.locator('[data-testid="playing-screen"]');
    const overlay = hostPage.locator('[data-testid="pause-overlay"]');
    const browserScreen = hostPage.locator(".af-browser-screen");
    await expect(playing).toBeVisible({ timeout: 10_000 });

    // Phone opens remote and waits for the state to reach "playing".
    const phonePage = await context.newPage();
    await phonePage.goto(`/send/${ROOM_ID}`);
    await phonePage.locator('[data-testid="phone-tab-remote"]').click();
    const remoteState = phonePage.locator('[data-testid="remote-state"]');
    await expect(remoteState).toHaveAttribute("data-state", "playing", { timeout: 5000 });

    // 1. Pause from phone → host overlay visible.
    await phonePage.locator('[data-testid="remote-pause"]').click();
    await expect(overlay).toBeVisible({ timeout: 2000 });
    await expect(remoteState).toHaveAttribute("data-state", "paused", { timeout: 2000 });

    // 2. Resume from phone → overlay disappears.
    await phonePage.locator('[data-testid="remote-resume"]').click();
    await expect(overlay).toBeHidden({ timeout: 2000 });
    await expect(remoteState).toHaveAttribute("data-state", "playing", { timeout: 2000 });

    // 3. Volume slider → persisted setting mirrors the slider value.
    await phonePage.locator('[data-testid="remote-volume"]').fill("35");
    await phonePage.locator('[data-testid="remote-volume"]').dispatchEvent("input");
    await expect
      .poll(async () => hostPage.evaluate(() => {
        const raw = localStorage.getItem("sprixe.settings.v1");
        return raw ? (JSON.parse(raw) as { audio: { masterVolume: number } }).audio.masterVolume : null;
      }), { timeout: 3000 })
      .toBe(35);

    // 4. Quit from phone → host returns to the browser screen.
    await phonePage.locator('[data-testid="remote-quit"]').click();
    await expect(playing).toHaveCount(0, { timeout: 2000 });
    await expect(browserScreen).toBeVisible();
    await expect(remoteState).toHaveAttribute("data-state", "browser", { timeout: 2000 });

    await context.close();
  });
});
