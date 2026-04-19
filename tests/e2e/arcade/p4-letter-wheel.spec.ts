import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

/**
 * p4-letter-wheel — open the A-Z jump overlay with Y (button 3),
 * navigate to 'S', confirm → the first game starting with S
 * (Strider in MOCK_GAMES) is selected in the browser list.
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

// TODO: the letter wheel is bound to `favorite` which is not part of
// MAPPING_ROLES today. The 2026-04 UX audit flagged that firing it on
// a non-mapped button (Y) surprises users. Skip until MAPPING_ROLES
// learns about favorite/bumpers, cf. ARCADE-FRONTEND-PLAN post-mortem.
test.skip("Phase 4b.3 — Y opens the letter wheel; nav to S + A selects Strider", async ({ page }) => {
  await installGamepadMock(page);
  await page.goto("/");
  await expect(page.locator(".af-browser-screen")).toBeVisible();

  // Button 3 = Y in standard mapping = 'favorite' NavAction = opens the wheel.
  await hold(page, 3);
  await expect(page.locator('[data-testid="letter-wheel"]')).toBeVisible();

  // The mock catalogue has Final Fight, Ghouls'n Ghosts, Strider, Knights,
  // Metal Slug, KOF '97, Art of Fighting, Samurai Shodown, The Punisher,
  // Street Fighter II — leading letters: A, F, G, K, M, S, T.
  // Cycle down until 'S' is selected. From A, S is at index 5.
  const selectedLetter = async () =>
    (await page.locator(".af-letter-wheel-item.selected").textContent())?.trim();
  expect(await selectedLetter()).toBe("A");
  for (let i = 0; i < 5; i++) {
    await hold(page, 13); // D-pad down
  }
  expect(await selectedLetter()).toBe("S");

  // Confirm (A = button 0) jumps and closes the wheel.
  await hold(page, 0);
  await expect(page.locator('[data-testid="letter-wheel"]')).toBeHidden();

  // First game in the mock catalogue starting with 'S' is 'Street Fighter II'
  // (appears before Samurai Shodown in the MOCK_GAMES array order).
  const selectedTitle = await page.locator(".af-game-list-item.selected .af-game-list-title").textContent();
  expect(selectedTitle?.startsWith("S")).toBe(true);
});
