/**
 * Phase 12 — DIP switches.
 *
 * Verifies that the DIP tab renders switches and that changing a value
 * shows the "Reload Game" button and persists to localStorage.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 12 — DIP switches', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
    // Open config modal > DIP tab
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
    await page.click('#tab-dip');
  });

  test('12.1 DIP tab has content', async ({ page }) => {
    const dipList = page.locator('#dip-list');
    await expect(dipList).toBeAttached();
    // Either shows switch rows or the "no DIP switches" message
    const childCount = await dipList.evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThan(0);
  });

  test('12.2 DIP dropdowns exist if game has switches', async ({ page }) => {
    const selects = page.locator('#dip-list select');
    const count = await selects.count();
    // The test ROM may or may not have DIP switches — just verify structure
    if (count > 0) {
      // Each select should have at least 2 options
      const firstOptCount = await selects.first().locator('option').count();
      expect(firstOptCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('12.3 changing DIP value shows Reload Game button', async ({ page }) => {
    const selects = page.locator('#dip-list select');
    const count = await selects.count();
    if (count === 0) {
      // No switches for this game — skip test gracefully
      test.skip();
      return;
    }

    // Change the first select to a different value
    const firstSelect = selects.first();
    const options = firstSelect.locator('option');
    const optCount = await options.count();
    if (optCount < 2) {
      test.skip();
      return;
    }

    // Select the second option (different from default)
    const secondOptionValue = await options.nth(1).getAttribute('value');
    await firstSelect.selectOption(secondOptionValue!);

    // "Reload Game" button should now be visible
    const reloadBtn = page.locator('#dip-list .ctrl-btn', { hasText: 'Reload Game' });
    await expect(reloadBtn).toBeVisible();
  });

  test('12.4 DIP changes persist to localStorage', async ({ page }) => {
    const selects = page.locator('#dip-list select');
    const count = await selects.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Change a value
    const firstSelect = selects.first();
    const options = firstSelect.locator('option');
    const optCount = await options.count();
    if (optCount < 2) {
      test.skip();
      return;
    }

    const secondOptionValue = await options.nth(1).getAttribute('value');
    await firstSelect.selectOption(secondOptionValue!);

    // Verify localStorage key exists for DIP switches
    const hasDipKey = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return keys.some(k => k.startsWith('cps1-dip-'));
    });
    expect(hasDipKey).toBe(true);
  });
});
