/**
 * Phase 9 — Quit game.
 *
 * Verifies that quitting resets the UI to the initial state and that
 * re-loading a ROM works after quitting.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady, getEmulatorState } from './helpers';

test.describe('Phase 9 — Quit game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('9.1 quit — drop zone visible, controls hidden, emulator stopped', async ({ page }) => {
    // Open hamburger to access quit button
    await page.click('#hamburger-btn');
    await page.click('#quit-btn');

    // Drop zone should be visible (not hidden)
    await expect(page.locator('#drop-zone')).not.toHaveClass(/hidden/);

    // Controls should be hidden (no "visible" class)
    await expect(page.locator('#controls')).not.toHaveClass(/visible/);

    // Emulator should be stopped
    const state = await page.evaluate(() => {
      const emu = (window as unknown as Record<string, unknown>).__emu as {
        isRunning(): boolean;
        isPaused(): boolean;
      };
      return { isRunning: emu.isRunning(), isPaused: emu.isPaused() };
    });
    expect(state.isRunning).toBe(false);
    expect(state.isPaused).toBe(false);
  });

  test('9.2 after quit, re-load ROM — emulator running again', async ({ page }) => {
    // Quit
    await page.click('#hamburger-btn');
    await page.click('#quit-btn');
    await expect(page.locator('#drop-zone')).not.toHaveClass(/hidden/);

    // Re-load ROM
    await loadTestRom(page);
    await waitForGameReady(page);

    // Emulator should be running
    const state = await getEmulatorState(page);
    expect(state.isRunning).toBe(true);
    expect(state.gameName).toBe('test');
  });
});
