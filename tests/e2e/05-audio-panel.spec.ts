/**
 * Phase 5 — Audio panel.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 5 — Audio panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('5.1 panel toggles with F3', async ({ page }) => {
    // Audio panel is open by default
    await expect(page.locator('.aud-panel')).toHaveClass(/open/);
    await page.keyboard.press('F3');
    await expect(page.locator('.aud-panel')).not.toHaveClass(/open/);
    await page.keyboard.press('F3');
    await expect(page.locator('.aud-panel')).toHaveClass(/open/);
  });

  test('5.2 tracks tab active by default', async ({ page }) => {
    const tracksBtn = page.locator('.aud-tab-btn', { hasText: 'Tracks' });
    await expect(tracksBtn).toHaveClass(/active/);
  });

  test('5.3 samples tab switches', async ({ page }) => {
    await page.click('.aud-tab-btn >> text=Samples');
    const samplesBtn = page.locator('.aud-tab-btn', { hasText: 'Samples' });
    await expect(samplesBtn).toHaveClass(/active/);
  });

  test('5.4 FM channel strips exist', async ({ page }) => {
    const strips = page.locator('.aud-fm-strip');
    expect(await strips.count()).toBe(8);
  });

  test('5.5 mute buttons exist', async ({ page }) => {
    const muteBtns = page.locator('.aud-ms-btn >> text=M');
    expect(await muteBtns.count()).toBeGreaterThanOrEqual(8); // FM + OKI
  });

  test('5.6 mute button toggles', async ({ page }) => {
    const muteBtn = page.locator('.aud-ms-btn >> text=M').first();
    await muteBtn.click();
    await expect(muteBtn).toHaveClass(/active/);
    await muteBtn.click();
    await expect(muteBtn).not.toHaveClass(/active/);
  });

  test('5.7 solo button toggles', async ({ page }) => {
    const soloBtn = page.locator('.aud-ms-btn >> text=S').first();
    await soloBtn.click();
    await expect(soloBtn).toHaveClass(/active/);
    await soloBtn.click();
    await expect(soloBtn).not.toHaveClass(/active/);
  });

  test('5.8 ruler exists', async ({ page }) => {
    await expect(page.locator('.aud-ruler')).toBeAttached();
  });

  test('5.9 ruler info shows FPS', async ({ page }) => {
    const info = page.locator('.aud-ruler-info');
    await expect(info).toBeAttached();
    // Wait for it to be populated
    await page.waitForFunction(() => {
      const el = document.querySelector('.aud-ruler-info');
      return el && el.textContent && el.textContent.includes('fps');
    }, { timeout: 5000 });
  });

  test('5.10 FM timelines exist', async ({ page }) => {
    const timelines = page.locator('.aud-fm-timeline');
    expect(await timelines.count()).toBe(8);
  });

  test('5.11 OKI waveform timelines exist', async ({ page }) => {
    const waveforms = page.locator('.aud-hit-timeline');
    expect(await waveforms.count()).toBe(4);
  });
});
