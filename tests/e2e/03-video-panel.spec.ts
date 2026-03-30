/**
 * Phase 3 — Video/Debug panel.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 3 — Video panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('3.1 panel toggles with F2', async ({ page }) => {
    // Panel is open by default
    await expect(page.locator('#dbg-panel')).toHaveClass(/open/);
    await page.keyboard.press('F2');
    await expect(page.locator('#dbg-panel')).not.toHaveClass(/open/);
    await page.keyboard.press('F2');
    await expect(page.locator('#dbg-panel')).toHaveClass(/open/);
  });

  test('3.2 body gets dbg-active class', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/dbg-active/);
    await page.keyboard.press('F2');
    await expect(page.locator('body')).not.toHaveClass(/dbg-active/);
  });

  test('3.3 dbg-btn toggles panel via click', async ({ page }) => {
    await expect(page.locator('#dbg-panel')).toHaveClass(/open/);
    await page.click('#dbg-btn');
    await expect(page.locator('#dbg-panel')).not.toHaveClass(/open/);
    await page.click('#dbg-btn');
    await expect(page.locator('#dbg-panel')).toHaveClass(/open/);
  });

  test('3.4 tile canvas exists in editor section', async ({ page }) => {
    const canvas = page.locator('.edit-tile-canvas');
    await expect(canvas).toBeAttached();
  });

  test('3.5 palette section exists in editor', async ({ page }) => {
    await expect(page.locator('.edit-palette')).toBeAttached();
  });

  test('3.6 editor overlay created when panel is open', async ({ page }) => {
    // The debug panel activates the sprite editor overlay
    await expect(page.locator('#edit-overlay')).toBeAttached();
  });

  test('3.7 frame counter exists in emu bar', async ({ page }) => {
    await expect(page.locator('#frame-counter')).toBeAttached();
  });

  test('3.8 step button exists in emu bar', async ({ page }) => {
    await expect(page.locator('#step-btn')).toBeAttached();
  });
});
