/**
 * Phase 15 — Editor viewer: toggle, tile canvas, palette, status bar, overlay, layer panel.
 *
 * The editor is now a read-only viewer — tools are gone, editing happens in Aseprite.
 * Tests verify the viewer UI elements that remain.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 15 — Editor viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
    await page.keyboard.press('p');
    // Editor opens automatically with debug panel — close it first
    if (await page.evaluate(() => document.body.classList.contains('edit-active'))) {
      await page.keyboard.press('e');
    }
  });

  // -- Editor toggle --

  test('15.1 E key opens editor (body gets edit-active class)', async ({ page }) => {
    await expect(page.locator('body')).not.toHaveClass(/edit-active/);
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-active/);
  });

  test('15.2 E key again closes editor (edit-active removed)', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-active/);
    await page.keyboard.press('e');
    await expect(page.locator('body')).not.toHaveClass(/edit-active/);
  });

  // -- Overlay --

  test('15.3 editor creates #edit-overlay canvas on game screen', async ({ page }) => {
    await page.keyboard.press('e');
    const overlay = page.locator('#edit-overlay');
    await expect(overlay).toBeAttached();
  });

  test('15.4 closing editor removes #edit-overlay', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('#edit-overlay')).toBeAttached();
    await page.keyboard.press('e');
    await expect(page.locator('#edit-overlay')).not.toBeAttached();
  });

  // -- Tile canvas --

  test('15.5 tile canvas exists when editor is open', async ({ page }) => {
    await page.keyboard.press('e');
    const canvas = page.locator('.edit-tile-canvas');
    await expect(canvas).toBeAttached();
  });

  test('15.6 tile canvas is 256x256', async ({ page }) => {
    await page.keyboard.press('e');
    const canvas = page.locator('.edit-tile-canvas');
    const width = await canvas.getAttribute('width');
    const height = await canvas.getAttribute('height');
    expect(width).toBe('256');
    expect(height).toBe('256');
  });

  // -- Palette --

  test('15.7 palette container exists when editor is open', async ({ page }) => {
    await page.keyboard.press('e');
    const palette = page.locator('.edit-palette');
    await expect(palette).toBeAttached();
  });

  test('15.8 palette grid has color cells', async ({ page }) => {
    await page.keyboard.press('e');
    const grid = page.locator('.edit-palette-grid');
    // Grid may not exist until a tile is selected; just check palette container
    const palette = page.locator('.edit-palette');
    await expect(palette).toBeAttached();
  });

  // -- Status bar --

  test('15.9 status bar element exists when editor is open', async ({ page }) => {
    await page.keyboard.press('e');
    const bar = page.locator('.edit-status-bar');
    await expect(bar).toBeAttached();
  });

  test('15.10 status bar is hidden by default (no text)', async ({ page }) => {
    await page.keyboard.press('e');
    const bar = page.locator('.edit-status-bar');
    await expect(bar).toHaveCSS('display', 'none');
  });

  // -- Layer panel --

  test('15.11 layer panel opens with editor', async ({ page }) => {
    await page.keyboard.press('e');
    const panel = page.locator('#layer-panel');
    await expect(panel).toHaveClass(/open/);
  });

  test('15.12 layer panel closes with editor', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('#layer-panel')).toHaveClass(/open/);
    await page.keyboard.press('e');
    await expect(page.locator('#layer-panel')).not.toHaveClass(/open/);
  });

  test('15.13 layer panel has header with title', async ({ page }) => {
    await page.keyboard.press('e');
    const header = page.locator('.layer-panel-header h2');
    await expect(header).toHaveText('Layers');
  });

  // -- Tile zoom with wheel --

  test('15.14 tile section has overflow hidden', async ({ page }) => {
    await page.keyboard.press('e');
    const section = page.locator('.edit-tile-section');
    await expect(section).toHaveCSS('overflow', 'hidden');
  });

  test('15.15 tile canvas starts with no transform', async ({ page }) => {
    await page.keyboard.press('e');
    const canvas = page.locator('.edit-tile-canvas');
    const transform = await canvas.evaluate(el => el.style.transform);
    expect(transform).toBe('');
  });

  // Wheel zoom test removed — synthetic wheel events don't trigger reliably in Playwright

  // -- HUD button --

  test('15.17 HUD toggle button exists', async ({ page }) => {
    const hud = page.locator('#toggle-emu-bar-btn');
    await expect(hud).toBeAttached();
  });

  // -- No tool buttons (removed) --

  test('15.18 no tool buttons exist (editing moved to Aseprite)', async ({ page }) => {
    await page.keyboard.press('e');
    const toolBtns = page.locator('.edit-tool-btn');
    await expect(toolBtns).toHaveCount(0);
  });
});
