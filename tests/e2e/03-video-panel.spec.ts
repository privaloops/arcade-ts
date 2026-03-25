/**
 * Phase 3 — Video/Debug panel.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 3 — Video panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('3.1 panel toggles with F2', async ({ page }) => {
    // Panel is open by default
    await expect(page.locator('.dbg-panel')).toHaveClass(/open/);
    await page.keyboard.press('F2');
    await expect(page.locator('.dbg-panel')).not.toHaveClass(/open/);
    await page.keyboard.press('F2');
    await expect(page.locator('.dbg-panel')).toHaveClass(/open/);
  });

  test('3.2 body gets dbg-active class', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/dbg-active/);
    await page.keyboard.press('F2');
    await expect(page.locator('body')).not.toHaveClass(/dbg-active/);
  });

  test('3.3 layer checkboxes exist for all 4 layers', async ({ page }) => {
    const checkboxes = page.locator('.dbg-layer-row input[type="checkbox"]:not(.dbg-grid-cb)');
    expect(await checkboxes.count()).toBe(4);
  });

  test('3.4 unchecking layer checkbox works', async ({ page }) => {
    const firstCb = page.locator('.dbg-layer-row input[type="checkbox"]:not(.dbg-grid-cb)').first();
    await expect(firstCb).toBeChecked();
    await firstCb.uncheck();
    await expect(firstCb).not.toBeChecked();
  });

  test('3.5 grid checkboxes exist for all 4 layers', async ({ page }) => {
    const gridCbs = page.locator('.dbg-grid-cb');
    expect(await gridCbs.count()).toBe(4);
  });

  test('3.6 palette section exists', async ({ page }) => {
    const palCanvas = page.locator('.dbg-palette-canvas');
    await expect(palCanvas).toBeAttached();
  });

  test('3.7 palette page buttons exist', async ({ page }) => {
    const pageBtns = page.locator('.dbg-page-btn');
    expect(await pageBtns.count()).toBe(6);
  });

  test('3.8 tile inspector section exists', async ({ page }) => {
    const info = page.locator('.dbg-inspector-info');
    await expect(info).toBeAttached();
  });

  test('3.9 sprite editor section exists', async ({ page }) => {
    await expect(page.locator('.edit-info')).toBeAttached();
    await expect(page.locator('.edit-tile-canvas')).toBeAttached();
  });

  test('3.10 sprite editor tools exist', async ({ page }) => {
    const tools = page.locator('.edit-tool-btn');
    expect(await tools.count()).toBe(4); // pencil, fill, eyedropper, eraser
  });

  test('3.11 sprite editor overlay exists', async ({ page }) => {
    await expect(page.locator('#edit-overlay')).toBeAttached();
  });

  test('3.12 3D exploded slider exists', async ({ page }) => {
    // Open the 3D section first (it's collapsed by default)
    const sections = page.locator('.dbg-section-title');
    const count = await sections.count();
    for (let i = 0; i < count; i++) {
      const text = await sections.nth(i).textContent();
      if (text?.includes('3D')) {
        await sections.nth(i).click();
        break;
      }
    }
    const slider = page.locator('input[type="range"]');
    await expect(slider.first()).toBeAttached();
  });

  test('3.13 frame controls exist', async ({ page }) => {
    await expect(page.locator('.dbg-frame-controls')).toBeAttached();
    await expect(page.locator('.dbg-frame-count')).toBeAttached();
  });

  test('3.14 registers section exists', async ({ page }) => {
    await expect(page.locator('.dbg-register-view')).toBeAttached();
  });
});
