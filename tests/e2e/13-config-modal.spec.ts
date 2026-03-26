/**
 * Phase 13 — Controls config (advanced).
 *
 * Verifies reset-to-defaults, keyboard remapping, and modal closing
 * via overlay click.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 13 — Config modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadTestRom(page);
    await waitForGameReady(page);
  });

  test('13.1 reset button restores default key mappings', async ({ page }) => {
    // Open config modal > Keyboard tab
    await page.keyboard.press('F1');
    await page.click('#tab-keyboard');

    // Remap the first button to a different key
    const firstBtn = page.locator('#kb-mapping-list-p1 .gp-btn').first();
    const originalText = await firstBtn.textContent();

    await firstBtn.click();
    await expect(firstBtn).toHaveText('Press...');
    await page.keyboard.press('q');

    // Button text should now be different from original
    const remappedText = await firstBtn.textContent();
    expect(remappedText).not.toBe('Press...');

    // Click reset
    await page.click('#controls-reset-btn');

    // First button should show the default key again
    const resetText = await firstBtn.textContent();
    expect(resetText).toBe(originalText);
  });

  test('13.2 keyboard remapping — press button, shows Press..., then updates', async ({ page }) => {
    await page.keyboard.press('F1');
    await page.click('#tab-keyboard');

    const firstBtn = page.locator('#kb-mapping-list-p1 .gp-btn').first();

    // Click button to start listening
    await firstBtn.click();
    await expect(firstBtn).toHaveText('Press...');
    await expect(firstBtn).toHaveClass(/listening/);

    // Press a key to complete the remapping
    await page.keyboard.press('q');

    // Button should show the new key (not "Press..." anymore)
    await expect(firstBtn).not.toHaveText('Press...');
    await expect(firstBtn).not.toHaveClass(/listening/);
  });

  test('13.3 close modal via overlay click', async ({ page }) => {
    await page.keyboard.press('F1');
    const overlay = page.locator('#controls-modal-overlay');
    await expect(overlay).toHaveClass(/open/);

    // Click on the overlay itself (outside the modal content)
    // The overlay is the full-screen background; clicking at the edge hits it
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).not.toHaveClass(/open/);
  });

  test('13.4 close modal via Escape from config modal', async ({ page }) => {
    await page.keyboard.press('F1');
    await expect(page.locator('#controls-modal-overlay')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#controls-modal-overlay')).not.toHaveClass(/open/);
  });
});
