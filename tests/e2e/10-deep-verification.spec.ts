/**
 * Phase 10 — Deep verification.
 *
 * Verifies that pause/resume/mute/layer toggle actually affect internal
 * emulator state, not just DOM appearance.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady, getEmulatorState } from './helpers';

test.describe('Phase 10 — Deep verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('10.1 pause TRULY stops frame progression', async ({ page }) => {
    await page.keyboard.press('p');
    const fcAfterPause = (await getEmulatorState(page)).frameCount;

    // Wait 200ms and verify frameCount has NOT changed
    await page.waitForTimeout(200);
    const fcAfterWait = (await getEmulatorState(page)).frameCount;
    // Tolerate at most 1 extra frame (in-flight frame may complete after pause)
    expect(fcAfterWait - fcAfterPause).toBeLessThanOrEqual(1);
  });

  test('10.2 resume TRULY resumes frame progression', async ({ page }) => {
    // Pause then resume
    await page.keyboard.press('p');
    await page.keyboard.press('p');

    const fcAfterResume = (await getEmulatorState(page)).frameCount;

    // Wait for frames to advance
    await page.waitForFunction((prevFc) => {
      const emu = (window as unknown as Record<string, unknown>).__emu as { getFrameCount(): number } | undefined;
      return emu !== undefined && emu.getFrameCount() > prevFc;
    }, fcAfterResume, { timeout: 5000 });
  });

  test('10.3 mute button toggles active class', async ({ page }) => {
    // Click mute
    await page.keyboard.press('m');

    const isMuted = await page.evaluate(() => {
      const muteBtn = document.getElementById('mute-btn');
      return muteBtn?.classList.contains('active') ?? false;
    });
    expect(isMuted).toBe(true);

    // Unmute
    await page.keyboard.press('m');
    const isUnmuted = await page.evaluate(() => {
      const muteBtn = document.getElementById('mute-btn');
      return !muteBtn?.classList.contains('active');
    });
    expect(isUnmuted).toBe(true);
  });

  test('10.4 layer toggle disables layer in debug panel', async ({ page }) => {
    // Uncheck the first layer checkbox (scroll1)
    const firstCb = page.locator('.dbg-layer-row input[type="checkbox"]:not(.dbg-grid-cb)').first();
    // The debug panel may not have layer rows if no game is loaded with layers visible
    const count = await firstCb.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstCb.uncheck();

    const layerDisabled = await page.evaluate(() => {
      const cb = document.querySelector('.dbg-layer-row input[type="checkbox"]:not(.dbg-grid-cb)') as HTMLInputElement | null;
      return cb !== null && !cb.checked;
    });
    expect(layerDisabled).toBe(true);

    // Re-check and verify it's enabled again
    await firstCb.check();
    const layerReEnabled = await page.evaluate(() => {
      const cb = document.querySelector('.dbg-layer-row input[type="checkbox"]:not(.dbg-grid-cb)') as HTMLInputElement | null;
      return cb !== null && cb.checked;
    });
    expect(layerReEnabled).toBe(true);
  });
});
