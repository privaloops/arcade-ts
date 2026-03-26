/**
 * Phase 8 — Save/Load state EFFECTIVE.
 *
 * Verifies that save/load actually persists to localStorage and that
 * the emulator continues running after a load.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady, getEmulatorState } from './helpers';

test.describe('Phase 8 — Save/Load state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('8.1 save to slot 1 persists in localStorage', async ({ page }) => {
    // Open save modal
    await page.keyboard.press('F5');
    await expect(page.locator('#savestate-modal-overlay')).toHaveClass(/open/);

    // Click slot 1
    await page.locator('.ss-slot').first().click();

    // Modal should close after save
    await expect(page.locator('#savestate-modal-overlay')).not.toHaveClass(/open/);

    // Verify localStorage has the key
    const hasKey = await page.evaluate(() => localStorage.getItem('cps1-save-0') !== null);
    expect(hasKey).toBe(true);
  });

  test('8.2 load from slot 1 — emulator keeps running', async ({ page }) => {
    // Save first
    await page.keyboard.press('F5');
    await page.locator('.ss-slot').first().click();
    await expect(page.locator('#savestate-modal-overlay')).not.toHaveClass(/open/);

    // Record frame count before load
    const fcBefore = (await getEmulatorState(page)).frameCount;

    // Open load modal
    await page.keyboard.press('F8');
    await expect(page.locator('#savestate-modal-overlay')).toHaveClass(/open/);

    // Click slot 1 to load
    await page.locator('.ss-slot').first().click();
    await expect(page.locator('#savestate-modal-overlay')).not.toHaveClass(/open/);

    // Wait for frames to progress after load
    await page.waitForFunction((prevFc) => {
      const emu = (window as unknown as Record<string, unknown>).__emu as { getFrameCount(): number } | undefined;
      return emu !== undefined && emu.getFrameCount() > prevFc;
    }, fcBefore, { timeout: 5000 });
  });

  test('8.3 navigate slots with arrow keys + Enter', async ({ page }) => {
    // Open save modal
    await page.keyboard.press('F5');
    await expect(page.locator('#savestate-modal-overlay')).toHaveClass(/open/);

    // Navigate down to slot 2
    await page.keyboard.press('ArrowDown');

    // Slot 2 should be highlighted (border color changes)
    const slot2BorderColor = await page.locator('.ss-slot').nth(1).evaluate(
      (el) => (el as HTMLElement).style.borderColor
    );
    expect(slot2BorderColor).toBe('#ff1a50');

    // Press Enter to confirm save on slot 2
    await page.keyboard.press('Enter');
    await expect(page.locator('#savestate-modal-overlay')).not.toHaveClass(/open/);

    // Verify localStorage has slot 2 key
    const hasKey = await page.evaluate(() => localStorage.getItem('cps1-save-1') !== null);
    expect(hasKey).toBe(true);
  });

  test('8.4 save to two different slots — both filled', async ({ page }) => {
    // Save to slot 1
    await page.keyboard.press('F5');
    await page.locator('.ss-slot').first().click();
    await expect(page.locator('#savestate-modal-overlay')).not.toHaveClass(/open/);

    // Save to slot 3
    await page.keyboard.press('F5');
    await page.locator('.ss-slot').nth(2).click();
    await expect(page.locator('#savestate-modal-overlay')).not.toHaveClass(/open/);

    // Verify both keys exist
    const [slot0, slot2] = await page.evaluate(() => [
      localStorage.getItem('cps1-save-0') !== null,
      localStorage.getItem('cps1-save-2') !== null,
    ]);
    expect(slot0).toBe(true);
    expect(slot2).toBe(true);
  });
});
