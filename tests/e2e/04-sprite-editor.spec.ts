/**
 * Phase 4 — Sprite/Tile viewer (read-only, Aseprite workflow).
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 4 — Tile viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
    // Pause for stable state
    await page.keyboard.press('p');
  });

  test('4.1 tile canvas exists in debug panel', async ({ page }) => {
    const canvas = page.locator('.edit-tile-canvas');
    await expect(canvas).toBeAttached();
  });

  test('4.2 palette container exists (read-only)', async ({ page }) => {
    await expect(page.locator('.edit-palette')).toBeAttached();
  });

  test('4.3 edit overlay is active when debug panel open', async ({ page }) => {
    await expect(page.locator('#edit-overlay')).toBeAttached();
    await expect(page.locator('body')).toHaveClass(/edit-active/);
  });

  test('4.4 E key toggles editor overlay', async ({ page }) => {
    // Editor is active (debug panel open by default)
    await expect(page.locator('#edit-overlay')).toBeAttached();
    // Close debug panel to deactivate editor
    await page.keyboard.press('F2');
    await expect(page.locator('#edit-overlay')).not.toBeAttached();
    // Reopen debug panel to reactivate editor
    await page.keyboard.press('F2');
    await expect(page.locator('#edit-overlay')).toBeAttached();
  });

  test('4.5 closing debug panel removes edit-active class', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/edit-active/);
    await page.keyboard.press('F2');
    await expect(page.locator('body')).not.toHaveClass(/edit-active/);
  });

  test('4.6 info bar is hidden (Aseprite workflow)', async ({ page }) => {
    const infoBar = page.locator('.edit-info');
    await expect(infoBar).toBeAttached();
    await expect(infoBar).toBeHidden();
  });
});
