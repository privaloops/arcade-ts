/**
 * Phase 2 — ROM loaded + basic controls.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady, getEmulatorState } from './helpers';

test.describe('Phase 2 — ROM loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
  });

  test('2.1 ROM loads — drop zone hidden, emu bar visible', async ({ page }) => {
    await expect(page.locator('#drop-zone')).toHaveClass(/hidden/);
    await expect(page.locator('#emu-bar')).toHaveClass(/visible/);
  });

  test('2.2 export button visible after ROM load', async ({ page }) => {
    await expect(page.locator('#export-btn')).toBeVisible();
  });

  test('2.3 emulator is running', async ({ page }) => {
    await waitForGameReady(page);
    const state = await getEmulatorState(page);
    expect(state.isRunning).toBe(true);
    expect(state.gameName).toBe('test');
  });

  test('2.4 pause via keyboard P', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('p');
    const state = await getEmulatorState(page);
    expect(state.isPaused).toBe(true);
  });

  test('2.5 resume via keyboard P', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('p');
    await page.keyboard.press('p');
    const state = await getEmulatorState(page);
    expect(state.isRunning).toBe(true);
    expect(state.isPaused).toBe(false);
  });

  test('2.6 keyboard P toggles pause', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('p');
    let state = await getEmulatorState(page);
    expect(state.isPaused).toBe(true);
    await page.keyboard.press('p');
    state = await getEmulatorState(page);
    expect(state.isPaused).toBe(false);
  });

  test('2.7 keyboard M toggles mute', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('m');
    await expect(page.locator('#mute-btn')).toHaveClass(/active/);
    await page.keyboard.press('m');
    await expect(page.locator('#mute-btn')).not.toHaveClass(/active/);
  });

  test('2.8 config modal opens with F1', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
  });

  test('2.9 config modal tabs switch', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('F1');
    const tabs = page.locator('.config-tabs button[role="tab"]');
    expect(await tabs.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveClass(/active/);
    }
  });

  test('2.10 emu bar buttons exist', async ({ page }) => {
    await expect(page.locator('#pause-btn')).toBeAttached();
    await expect(page.locator('#mute-btn')).toBeAttached();
    await expect(page.locator('#save-btn')).toBeAttached();
    await expect(page.locator('#load-btn-ss')).toBeAttached();
    await expect(page.locator('#controls-btn')).toBeAttached();
  });
});
