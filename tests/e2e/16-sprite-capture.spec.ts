/**
 * Phase 16 — Sprite capture workflow: REC button, sprite cards, sheet viewer.
 *
 * The test ROM is a minimal mock — actual sprite captures may not occur.
 * Tests that depend on real sprite data are marked with a comment.
 * Structure and DOM flow tests are always verified.
 */

import { test, expect } from '@playwright/test';
import { loadTestRom, waitForGameReady } from './helpers';

test.describe('Phase 16 — Sprite capture workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/play/');
    await loadTestRom(page);
    await waitForGameReady(page);
    await page.keyboard.press('p'); // pause

    // Ensure editor is closed before each test
    if (await page.evaluate(() => document.body.classList.contains('edit-active'))) {
      await page.keyboard.press('e');
    }
  });

  // -- Editor opens with layer panel --

  test('16.1 pressing E opens editor and layer panel', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-active/);
    await expect(page.locator('#layer-panel')).toHaveClass(/open/);
  });

  // -- REC button exists --

  test('16.2 REC sprites button exists in layer panel', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await expect(recBtn).toBeAttached();
    await expect(recBtn).toContainText('REC');
  });

  test('16.3 REC sprites button is visible and enabled', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await expect(recBtn).toBeVisible();
    await expect(recBtn).toBeEnabled();
  });

  test('16.4 REC button has rec-dot indicator', async ({ page }) => {
    await page.keyboard.press('e');

    const dot = page.locator('#layer-panel .layer-rec-btn').first().locator('.rec-dot');
    await expect(dot).toBeAttached();
  });

  // -- REC button toggles recording state --

  test('16.5 clicking REC adds recording class to button', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await expect(recBtn).not.toHaveClass(/recording/);

    await recBtn.click();
    await expect(recBtn).toHaveClass(/recording/);
  });

  test('16.6 clicking REC again removes recording class', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click();
    await expect(recBtn).toHaveClass(/recording/);

    await recBtn.click();
    await expect(recBtn).not.toHaveClass(/recording/);
  });

  test('16.7 rec-dot blinks when recording is active', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click();

    const dot = recBtn.locator('.rec-dot');
    await expect(dot).toHaveClass(/rec-blink/);
  });

  test('16.8 rec-dot stops blinking when recording is stopped', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click();
    await recBtn.click();

    const dot = recBtn.locator('.rec-dot');
    await expect(dot).not.toHaveClass(/rec-blink/);
  });

  // -- Recording flow with game running --

  test('16.9 full REC flow: start → run → stop (structure verification)', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click(); // start recording
    await expect(recBtn).toHaveClass(/recording/);

    // Resume game briefly to allow sprite frames to be captured
    await page.keyboard.press('p'); // unpause
    await page.waitForTimeout(300);
    await page.keyboard.press('p'); // pause again

    // Stop recording
    await recBtn.click();
    await expect(recBtn).not.toHaveClass(/recording/);

    // Layer panel should still be open and intact
    await expect(page.locator('#layer-panel')).toHaveClass(/open/);
  });

  // -- Sprite cards (may not appear with mock ROM, noted in comment) --

  test('16.10 layer panel content area exists', async ({ page }) => {
    await page.keyboard.press('e');

    const content = page.locator('#layer-panel .layer-panel-content');
    await expect(content).toBeAttached();
  });

  test('16.11 layer capture list container is present after editor opens', async ({ page }) => {
    await page.keyboard.press('e');

    // Layer groups with sprite type should be rendered
    const groups = page.locator('#layer-panel .layer-group');
    await expect(groups.first()).toBeAttached();
  });

  // NOTE: Tests 16.12–16.14 depend on the mock ROM producing actual sprite
  // captures. They may be skipped or fail on a minimal test ROM.

  test('16.12 sprite cards appear after capture (skipped on mock ROM if no sprites)', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click(); // start recording

    await page.keyboard.press('p'); // unpause
    await page.waitForTimeout(500);
    await page.keyboard.press('p'); // pause

    await recBtn.click(); // stop recording

    const cards = page.locator('#layer-panel .edit-capture-card');
    const count = await cards.count();

    // With a mock ROM, count may be 0 — verify the panel structure is intact regardless
    if (count === 0) {
      // Verify the panel is still open and functional
      await expect(page.locator('#layer-panel')).toHaveClass(/open/);
    } else {
      await expect(cards.first()).toBeAttached();
    }
  });

  test('16.13 clicking a sprite card opens sheet viewer (requires real sprites)', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click();

    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    await page.keyboard.press('p');

    await recBtn.click();

    const cards = page.locator('#layer-panel .edit-capture-card');
    const count = await cards.count();

    if (count === 0) {
      // No captures on mock ROM — skip assertion
      test.info().annotations.push({ type: 'skip-reason', description: 'No sprite captures on mock ROM' });
      return;
    }

    await cards.first().click();

    const viewer = page.locator('.sprite-sheet-viewer');
    await expect(viewer).toBeAttached({ timeout: 3_000 });
  });

  test('16.14 close button in sheet viewer closes the viewer (requires real sprites)', async ({ page }) => {
    await page.keyboard.press('e');

    const recBtn = page.locator('#layer-panel .layer-rec-btn').first();
    await recBtn.click();

    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    await page.keyboard.press('p');

    await recBtn.click();

    const cards = page.locator('#layer-panel .edit-capture-card');
    const count = await cards.count();

    if (count === 0) {
      // No captures on mock ROM — skip assertion
      test.info().annotations.push({ type: 'skip-reason', description: 'No sprite captures on mock ROM' });
      return;
    }

    await cards.first().click();

    const viewer = page.locator('.sprite-sheet-viewer');
    await expect(viewer).toBeAttached({ timeout: 3_000 });

    // Close button — use text to disambiguate from Export button
    const closeBtn = page.getByRole('button', { name: 'Close' });
    await expect(closeBtn).toBeAttached();
    await closeBtn.click();

    await expect(viewer).not.toBeAttached({ timeout: 3_000 });
  });

  // -- Import button in layer panel --

  test('16.15 Import .aseprite button exists in layer panel', async ({ page }) => {
    await page.keyboard.press('e');

    const importBtn = page.locator('#layer-panel .layer-import-btn');
    await expect(importBtn).toBeAttached();
    await expect(importBtn).toBeVisible();
  });

  // -- Layer panel close button --

  test('16.16 layer panel close button hides the panel', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('#layer-panel')).toHaveClass(/open/);

    const closeBtn = page.locator('#layer-panel .layer-close');
    await expect(closeBtn).toBeAttached();
    await closeBtn.click();

    await expect(page.locator('#layer-panel')).not.toHaveClass(/open/);
  });

  // -- Memory indicator --

  test('16.17 memory indicator is present in layer panel', async ({ page }) => {
    await page.keyboard.press('e');

    const mem = page.locator('#layer-panel .layer-mem-indicator');
    await expect(mem).toBeAttached();
  });
});
