/**
 * Phase 11 — Display settings (CRT, TATE).
 *
 * Verifies that CRT and TATE toggles affect both DOM classes and localStorage.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 11 — Display settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
    // Open config modal > Display tab
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
    await page.click('#tab-display');
  });

  test('11.1 CRT toggle — adds class + persists in localStorage', async ({ page }) => {
    const crtToggle = page.locator('#crt-toggle');

    // Enable CRT
    await crtToggle.check();
    await expect(page.locator('#canvas-wrapper')).toHaveClass(/crt/);
    const stored = await page.evaluate(() => localStorage.getItem('cps1-crt'));
    expect(stored).toBe('1');
  });

  test('11.2 CRT uncheck — removes class + clears localStorage', async ({ page }) => {
    const crtToggle = page.locator('#crt-toggle');

    // Enable then disable
    await crtToggle.check();
    await crtToggle.uncheck();
    await expect(page.locator('#canvas-wrapper')).not.toHaveClass(/crt/);
    const stored = await page.evaluate(() => localStorage.getItem('cps1-crt'));
    expect(stored).toBe('0');
  });

  test('11.3 TATE toggle — adds class to canvas-wrapper', async ({ page }) => {
    const tateToggle = page.locator('#tate-toggle');

    // Enable TATE
    await tateToggle.check();
    await expect(page.locator('#canvas-wrapper')).toHaveClass(/tate/);

    // Disable TATE
    await tateToggle.uncheck();
    await expect(page.locator('#canvas-wrapper')).not.toHaveClass(/tate/);
  });
});
