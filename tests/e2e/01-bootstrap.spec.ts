/**
 * Phase 1 — Bootstrap tests (no ROM loaded).
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 1 — Bootstrap', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
  });

  test('1.1 page loads with title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('ROMstudio');
  });

  test('1.2 drop zone visible', async ({ page }) => {
    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).not.toHaveClass(/hidden/);
  });

  test('1.3 emu bar hidden before ROM load', async ({ page }) => {
    await expect(page.locator('#emu-bar')).not.toHaveClass(/visible/);
  });

  test('1.4 game select has options', async ({ page }) => {
    const count = await page.locator('#game-select option').count();
    expect(count).toBeGreaterThan(0);
  });

  test('1.5 export button hidden before ROM', async ({ page }) => {
    await expect(page.locator('#export-btn')).toBeHidden();
  });

  test('1.6 studio tools exist in header', async ({ page }) => {
    await expect(page.locator('#studio-tools')).toBeAttached();
    await expect(page.locator('#dbg-btn')).toBeAttached();
    await expect(page.locator('#aud-btn')).toBeAttached();
    await expect(page.locator('#quit-btn')).toBeAttached();
  });

  test('1.7 debug panel exists and open by default', async ({ page }) => {
    await expect(page.locator('#dbg-panel')).toHaveClass(/open/);
  });

  test('1.8 audio panel exists and open by default', async ({ page }) => {
    await expect(page.locator('#aud-panel')).toHaveClass(/open/);
  });

  test('1.9 body has dbg-active and aud-active classes', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/dbg-active/);
    await expect(page.locator('body')).toHaveClass(/aud-active/);
  });

  test('1.10 canvas exists with correct dimensions', async ({ page }) => {
    const canvas = page.locator('#screen');
    await expect(canvas).toBeAttached();
    await expect(canvas).toHaveAttribute('width', '384');
    await expect(canvas).toHaveAttribute('height', '224');
  });
});
