/**
 * Phase 14 — Game selector.
 *
 * Verifies that the game select dropdown and load button exist and
 * interact correctly. Actual ROM loading from /api/roms depends on the
 * server, so we only test the UI elements.
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 14 — Game selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('14.1 game select dropdown exists with options', async ({ page }) => {
    const select = page.locator('#game-select');
    await expect(select).toBeAttached();
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
  });

  test('14.2 load button exists', async ({ page }) => {
    const loadBtn = page.locator('#load-btn');
    await expect(loadBtn).toBeAttached();
  });

  test('14.3 selecting a game enables load button', async ({ page }) => {
    const select = page.locator('#game-select');
    const loadBtn = page.locator('#load-btn');

    // If there's a non-empty option, select it
    const options = select.locator('option');
    const count = await options.count();

    // Find an option with a non-empty value
    for (let i = 0; i < count; i++) {
      const value = await options.nth(i).getAttribute('value');
      if (value) {
        await select.selectOption(value);
        // Load button should not be disabled when a game is selected
        await expect(loadBtn).not.toBeDisabled();
        return;
      }
    }
  });

  test('14.4 game select and load button are in rom-controls', async ({ page }) => {
    const romControls = page.locator('#rom-controls');
    await expect(romControls).toBeAttached();
    await expect(romControls.locator('#game-select')).toBeAttached();
    await expect(romControls.locator('#load-btn')).toBeAttached();
  });
});
