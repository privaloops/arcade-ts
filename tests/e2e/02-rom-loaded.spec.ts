/**
 * Phase 2 — ROM loaded + basic controls.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady, getEmulatorState } from './helpers';

test.describe('Phase 2 — ROM loaded', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
  });

  test('2.1 ROM loads — drop zone hidden, controls visible', async ({ page }) => {
    await expect(page.locator('#drop-zone')).toHaveClass(/hidden/);
    await expect(page.locator('#controls')).toHaveClass(/visible/);
  });

  test('2.2 export and edit buttons visible in hamburger', async ({ page }) => {
    await page.click('#hamburger-btn');
    await expect(page.locator('#export-btn')).toBeVisible();
    await expect(page.locator('#edit-btn')).toBeVisible();
  });

  test('2.3 emulator is running', async ({ page }) => {
    await waitForGameReady(page);
    const state = await getEmulatorState(page);
    expect(state.isRunning).toBe(true);
    expect(state.gameName).toBe('test');
  });

  test('2.4 pause button works', async ({ page }) => {
    await waitForGameReady(page);
    await page.click('#pause-btn');
    const state = await getEmulatorState(page);
    expect(state.isPaused).toBe(true);
    await expect(page.locator('#pause-btn')).toHaveText(/Resume/);
  });

  test('2.5 resume after pause', async ({ page }) => {
    await waitForGameReady(page);
    await page.click('#pause-btn');
    await page.click('#pause-btn');
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

  test('2.8 frame step increments frame count', async ({ page }) => {
    await waitForGameReady(page);
    // Pause first
    await page.keyboard.press('p');
    const before = (await getEmulatorState(page)).frameCount;
    // Click step button
    await page.click('.dbg-frame-controls .ctrl-btn:nth-child(2)'); // Step button
    const after = (await getEmulatorState(page)).frameCount;
    expect(after).toBeGreaterThan(before);
  });

  test('2.9 config modal opens with F1', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
  });

  test('2.10 config modal tabs switch', async ({ page }) => {
    await waitForGameReady(page);
    await page.keyboard.press('F1');
    const tabs = page.locator('.config-tabs button[role="tab"]');
    expect(await tabs.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveClass(/active/);
    }
  });
});
