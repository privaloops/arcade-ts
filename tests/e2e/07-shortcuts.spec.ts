/**
 * Phase 7 — Keyboard shortcuts.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady, getEmulatorState } from './helpers';

test.describe('Phase 7 — Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('7.1 P toggles pause', async ({ page }) => {
    await page.keyboard.press('p');
    expect((await getEmulatorState(page)).isPaused).toBe(true);
    await page.keyboard.press('p');
    expect((await getEmulatorState(page)).isPaused).toBe(false);
  });

  test('7.2 M toggles mute', async ({ page }) => {
    await page.keyboard.press('m');
    await expect(page.locator('#mute-btn')).toHaveClass(/active/);
    await page.keyboard.press('m');
    await expect(page.locator('#mute-btn')).not.toHaveClass(/active/);
  });

  test('7.3 F1 opens config modal', async ({ page }) => {
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
  });

  test('7.4 F2 toggles video panel', async ({ page }) => {
    await expect(page.locator('.dbg-panel')).toHaveClass(/open/);
    await page.keyboard.press('F2');
    await expect(page.locator('.dbg-panel')).not.toHaveClass(/open/);
  });

  test('7.5 F3 toggles audio panel', async ({ page }) => {
    await expect(page.locator('.aud-panel')).toHaveClass(/open/);
    await page.keyboard.press('F3');
    await expect(page.locator('.aud-panel')).not.toHaveClass(/open/);
  });

  test('7.6 F5 opens save state modal', async ({ page }) => {
    await page.keyboard.press('F5');
    await expect(page.locator('#savestate-modal-overlay')).toHaveClass(/open/);
  });

  test('7.7 F8 opens load state modal', async ({ page }) => {
    await page.keyboard.press('F8');
    await expect(page.locator('#savestate-modal-overlay')).toHaveClass(/open/);
  });

  test('7.8 Escape closes modals', async ({ page }) => {
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#controls-modal-overlay')).not.toHaveClass(/open/);
  });

  test('7.9 E opens video panel (sprite editor)', async ({ page }) => {
    // Close panel first
    await page.keyboard.press('F2');
    await expect(page.locator('.dbg-panel')).not.toHaveClass(/open/);
    // E should reopen it
    await page.keyboard.press('e');
    await expect(page.locator('.dbg-panel')).toHaveClass(/open/);
  });
});
