import { test, expect } from "@playwright/test";

/**
 * p3-phone-responsive — viewports that cover mainstream iOS + Android
 * phones (§5 Phase 3.14). Chromium-only in CI; Safari / real-Android
 * smoke is manual before tagging a release per the plan.
 *
 * Gates:
 *   - document.body.scrollWidth <= window.innerWidth — no horizontal
 *     scroll on the primary axis.
 *   - Every visible <button> is ≥44×44 px (WCAG 2.5.5 touch target).
 */

const VIEWPORTS = [
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "Pixel 7", width: 412, height: 915 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`Phase 3 — phone responsive on ${viewport.name}`, () => {
    test(`no horizontal scroll, every visible button ≥44×44 px`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      await page.goto("/send/sprixe-responsive-test");
      await expect(page.locator('[data-testid="phone-page"]')).toBeVisible();

      // No horizontal scroll.
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1 px tolerance

      // Every visible button satisfies the 44×44 touch target rule.
      const buttons = page.locator("button");
      const count = await buttons.count();
      const offenders: string[] = [];
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        if (!(await btn.isVisible())) continue;
        const box = await btn.boundingBox();
        if (!box) continue;
        if (box.width < 44 || box.height < 44) {
          const testId = await btn.getAttribute("data-testid");
          const klass = await btn.getAttribute("class");
          offenders.push(
            `[${testId ?? klass ?? "button"}] ${box.width.toFixed(1)}×${box.height.toFixed(1)}`
          );
        }
      }
      expect(offenders, `Buttons below 44×44: ${offenders.join(", ")}`).toEqual([]);

      await context.close();
    });
  });
}
