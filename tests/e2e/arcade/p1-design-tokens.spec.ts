import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

test.describe("Phase 1 — design tokens", () => {
  test("CSS vars on :root match the spec and game titles use Rajdhani", async ({ page }) => {
    await installGamepadMock(page);
    await page.goto("/");

    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const read = (name: string) => s.getPropertyValue(name).trim();
      return {
        bgDeep: read("--af-bg-deep"),
        bgPrimary: read("--af-bg-primary"),
        bgCard: read("--af-bg-card"),
        accent: read("--af-accent"),
        accentWarm: read("--af-accent-warm"),
        accentGold: read("--af-accent-gold"),
        badgeCps1: read("--af-badge-cps1"),
        badgeNeogeo: read("--af-badge-neogeo"),
        textPrimary: read("--af-text-primary"),
        fontDisplay: read("--af-font-display"),
        fontBody: read("--af-font-body"),
      };
    });

    expect(tokens.bgDeep).toBe("#050508");
    expect(tokens.bgPrimary).toBe("#0a0a10");
    expect(tokens.bgCard).toBe("#12121a");
    expect(tokens.accent).toBe("#00d4ff");
    expect(tokens.accentWarm).toBe("#ff6b2e");
    expect(tokens.accentGold).toBe("#ffd700");
    expect(tokens.badgeCps1).toBe("#e8003c");
    expect(tokens.badgeNeogeo).toBe("#00b4d8");
    expect(tokens.textPrimary).toBe("#f0f0f5");
    expect(tokens.fontDisplay).toContain("Rajdhani");
    expect(tokens.fontBody).toContain("Inter");

    // A rendered game title should resolve to Rajdhani.
    const title = page.locator(".af-game-list-title").first();
    await expect(title).toBeVisible();
    const titleFont = await title.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(titleFont).toContain("Rajdhani");
  });
});
