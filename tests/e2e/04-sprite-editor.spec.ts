/**
 * Phase 4 — Sprite/Scroll editor.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 4 — Sprite editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
    // Pause for stable state
    await page.keyboard.press('p');
  });

  test('4.1 info bar shows default message', async ({ page }) => {
    await expect(page.locator('.edit-info')).toHaveText('Click a sprite on the game screen');
  });

  test('4.2 pencil tool active by default', async ({ page }) => {
    const pencilBtn = page.locator('.edit-tool-btn', { hasText: 'Pencil' });
    await expect(pencilBtn).toHaveClass(/active/);
  });

  test('4.3 tool switch with keyboard B', async ({ page }) => {
    await page.keyboard.press('g'); // switch to fill
    const fillBtn = page.locator('.edit-tool-btn', { hasText: 'Fill' });
    await expect(fillBtn).toHaveClass(/active/);
    await page.keyboard.press('b'); // back to pencil
    const pencilBtn = page.locator('.edit-tool-btn', { hasText: 'Pencil' });
    await expect(pencilBtn).toHaveClass(/active/);
  });

  test('4.4 tool switch with keyboard I (eyedropper)', async ({ page }) => {
    await page.keyboard.press('i');
    const btn = page.locator('.edit-tool-btn', { hasText: 'Eyedropper' });
    await expect(btn).toHaveClass(/active/);
  });

  test('4.5 tool switch with keyboard X (eraser)', async ({ page }) => {
    await page.keyboard.press('x');
    const btn = page.locator('.edit-tool-btn', { hasText: 'Eraser' });
    await expect(btn).toHaveClass(/active/);
  });

  test('4.6 tool switch by clicking button', async ({ page }) => {
    await page.click('.edit-tool-btn >> text=Fill');
    const fillBtn = page.locator('.edit-tool-btn', { hasText: 'Fill' });
    await expect(fillBtn).toHaveClass(/active/);
  });

  test('4.7 undo/redo buttons exist and start disabled', async ({ page }) => {
    const undoBtn = page.locator('.edit-actions .ctrl-btn', { hasText: 'Undo' });
    const redoBtn = page.locator('.edit-actions .ctrl-btn', { hasText: 'Redo' });
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();
  });

  test('4.8 reset tile button exists', async ({ page }) => {
    const resetBtn = page.locator('.edit-actions .ctrl-btn', { hasText: 'Reset Tile' });
    await expect(resetBtn).toBeAttached();
  });

  test('4.9 tile canvas exists with correct dimensions', async ({ page }) => {
    const canvas = page.locator('.edit-tile-canvas');
    await expect(canvas).toBeAttached();
    const width = await canvas.getAttribute('width');
    const height = await canvas.getAttribute('height');
    expect(width).toBe('256');
    expect(height).toBe('256');
  });

  test('4.10 neighbors section exists', async ({ page }) => {
    await expect(page.locator('.edit-neighbors')).toBeAttached();
  });

  test('4.11 Escape deactivates editor overlay', async ({ page }) => {
    await expect(page.locator('#edit-overlay')).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(page.locator('#edit-overlay')).not.toBeAttached();
  });

  test('4.12 Escape removes edit-active class', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/edit-active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/edit-active/);
  });
});
