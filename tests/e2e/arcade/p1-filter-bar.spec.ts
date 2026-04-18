import { test, expect } from "@playwright/test";
import { installGamepadMock } from "./_helpers/gamepad";

test.describe("Phase 1 — filter bar", () => {
  test("LB / RB cycles through ALL / CPS-1 / NEO-GEO / FAVORITES with coherent counts", async ({ page }) => {
    await installGamepadMock(page);
    await page.goto("/");

    // Mock dataset: 10 games — 6 CPS-1, 4 Neo-Geo, 2 favorites.
    const visibleCount = page.locator('[data-testid="visible-count"]');
    const activePill = page.locator(".af-filter-pill.active");

    // Initial state: ALL active.
    await expect(activePill).toHaveAttribute("data-filter-id", "all");
    await expect(visibleCount).toHaveText("10");

    // Helper: trigger an RB (button 5) press and wait for active filter to change.
    async function pressBumperRight() {
      const current = await activePill.getAttribute("data-filter-id");
      await page.evaluate(async () => {
        const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
        await hold(5, 100);
        await new Promise((r) => setTimeout(r, 50));
      });
      await expect
        .poll(async () => await activePill.getAttribute("data-filter-id"), { timeout: 2000 })
        .not.toBe(current);
    }

    async function pressBumperLeft() {
      const current = await activePill.getAttribute("data-filter-id");
      await page.evaluate(async () => {
        const hold = (window as unknown as { __holdButton: (n: number, ms: number) => Promise<void> }).__holdButton;
        await hold(4, 100);
        await new Promise((r) => setTimeout(r, 50));
      });
      await expect
        .poll(async () => await activePill.getAttribute("data-filter-id"), { timeout: 2000 })
        .not.toBe(current);
    }

    // RB → CPS-1
    await pressBumperRight();
    await expect(activePill).toHaveAttribute("data-filter-id", "cps1");
    await expect(visibleCount).toHaveText("6");

    // RB → NEO-GEO
    await pressBumperRight();
    await expect(activePill).toHaveAttribute("data-filter-id", "neogeo");
    await expect(visibleCount).toHaveText("4");

    // RB → FAVORITES
    await pressBumperRight();
    await expect(activePill).toHaveAttribute("data-filter-id", "favorites");
    await expect(visibleCount).toHaveText("2");

    // LB wraps back through the sequence.
    await pressBumperLeft();
    await expect(activePill).toHaveAttribute("data-filter-id", "neogeo");
    await expect(visibleCount).toHaveText("4");
  });
});
