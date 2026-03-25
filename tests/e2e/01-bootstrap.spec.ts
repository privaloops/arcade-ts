/**
 * Phase 1 — Bootstrap tests (no ROM loaded).
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 1 — Bootstrap', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('1.1 page loads with title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('ROMstudio');
  });

  test('1.2 drop zone visible', async ({ page }) => {
    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).not.toHaveClass(/hidden/);
  });

  test('1.3 controls hidden before ROM load', async ({ page }) => {
    await expect(page.locator('#controls')).not.toHaveClass(/visible/);
  });

  test('1.4 hamburger menu opens on click', async ({ page }) => {
    const menu = page.locator('.hamburger-menu');
    await expect(menu).not.toHaveClass(/open/);
    await page.click('#hamburger-btn');
    await expect(menu).toHaveClass(/open/);
  });

  test('1.5 hamburger closes on outside click', async ({ page }) => {
    await page.click('#hamburger-btn');
    const menu = page.locator('.hamburger-menu');
    await expect(menu).toHaveClass(/open/);
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(menu).not.toHaveClass(/open/);
  });

  test('1.6 game select has options', async ({ page }) => {
    const count = await page.locator('#game-select option').count();
    expect(count).toBeGreaterThan(0);
  });

  test('1.7 export/edit buttons hidden before ROM', async ({ page }) => {
    await expect(page.locator('#export-btn')).toBeHidden();
    await expect(page.locator('#edit-btn')).toBeHidden();
  });

  test('1.8 debug panel exists and open by default', async ({ page }) => {
    await expect(page.locator('.dbg-panel')).toHaveClass(/open/);
  });

  test('1.9 audio panel exists and open by default', async ({ page }) => {
    await expect(page.locator('.aud-panel')).toHaveClass(/open/);
  });
});
