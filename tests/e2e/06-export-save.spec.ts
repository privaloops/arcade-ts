/**
 * Phase 6 — Export & Save states.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 6 — Export & Save states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('6.1 export ROM triggers download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-btn'),
    ]);
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^test_\d{8}_\d{4}\.zip$/);
  });

  test('6.2 save state modal opens with F5', async ({ page }) => {
    await page.keyboard.press('F5');
    // The save state overlay should open
    const overlay = page.locator('#savestate-modal-overlay');
    await expect(overlay).toHaveClass(/open/);
  });

  test('6.3 load state modal opens with F8', async ({ page }) => {
    await page.keyboard.press('F8');
    const overlay = page.locator('#savestate-modal-overlay');
    await expect(overlay).toHaveClass(/open/);
  });

  test('6.4 save state modal closes with Escape', async ({ page }) => {
    await page.keyboard.press('F5');
    const overlay = page.locator('#savestate-modal-overlay');
    await expect(overlay).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(overlay).not.toHaveClass(/open/);
  });

  test('6.5 save state modal has slots', async ({ page }) => {
    await page.keyboard.press('F5');
    const slots = page.locator('.ss-slot');
    expect(await slots.count()).toBeGreaterThanOrEqual(1);
  });
});
