/**
 * Game Matrix — automated testing of all ROMs in public/roms/.
 *
 * Level 1: Boot — canvas has non-black pixels after 600 frames
 * Level 2: Audio — audio worker is active (standard CPS1) or QSound flag set
 */

import { test, expect } from '@playwright/test';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROMS_DIR = join(__dirname, '..', '..', 'public', 'roms');

// Skip gracefully if public/roms/ doesn't exist (CI, fresh clone)
const romFiles = existsSync(ROMS_DIR)
  ? readdirSync(ROMS_DIR, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.zip'))
      .map(e => e.name.replace('.zip', ''))
      .sort()
  : [];

/** Load a ROM via the game selector and wait for emulator to start */
async function loadRom(page: import('@playwright/test').Page, rom: string): Promise<void> {
  await page.goto('/play/');

  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__emu !== undefined,
    { timeout: 15_000 },
  );

  await page.selectOption('#game-select', rom);
  await page.click('#load-btn');
  await page.waitForSelector('#drop-zone.hidden', { state: 'attached', timeout: 15_000 });

  await page.waitForFunction(() => {
    const emu = (window as unknown as Record<string, unknown>).__emu as { getFrameCount(): number } | undefined;
    return emu && emu.getFrameCount() > 0;
  }, { timeout: 10_000 });
}

/** Fast-forward N frames in batches to avoid blocking the page */
async function fastForward(page: import('@playwright/test').Page, frames: number): Promise<void> {
  const BATCH = 100;
  const batches = Math.ceil(frames / BATCH);
  for (let b = 0; b < batches; b++) {
    const n = Math.min(BATCH, frames - b * BATCH);
    await page.evaluate((count) => {
      const emu = (window as unknown as Record<string, unknown>).__emu as {
        pause(): void; stepFrame(): void;
      };
      emu.pause();
      for (let i = 0; i < count; i++) emu.stepFrame();
    }, n);
  }
}

/** Check canvas has non-black content via toDataURL (preserveDrawingBuffer) */
async function canvasHasContent(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const cvs = document.getElementById('screen') as HTMLCanvasElement;
    if (!cvs) return false;
    // Draw WebGL canvas to a 2D canvas to read pixels
    const tmp = document.createElement('canvas');
    tmp.width = cvs.width;
    tmp.height = cvs.height;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(cvs, 0, 0);
    const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 0 || data[i + 1]! > 0 || data[i + 2]! > 0) nonBlack++;
    }
    // Any non-black pixel = game rendered something (even dark intros)
    return nonBlack > 0;
  });
}

/** Spam coin/start/buttons for ~10s to get into gameplay, then play with random inputs */
async function coinStartAndPlay(page: import('@playwright/test').Page, frames: number): Promise<void> {
  // ~80 seconds of spamming coin/start/buttons to skip all intro/title/select screens
  // CPS1 games have long intros: warning → logo → demo → title → char select
  // Hold keys DOWN during fast-forward so the game sees them every frame
  const skipKeys = ['5', 'Enter', 'a', 'd'];
  for (let i = 0; i < 80; i++) {
    for (const key of skipKeys) await page.keyboard.down(key);
    await fastForward(page, 30);
    for (const key of skipKeys) await page.keyboard.up(key);
    await fastForward(page, 30);
  }

  // Play with random inputs
  const BATCH = 100;
  const inputs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 's', 'd', '5', '1'];
  let remaining = frames;
  while (remaining > 0) {
    const n = Math.min(BATCH, remaining);
    const key = inputs[Math.floor(Math.random() * inputs.length)]!;
    await page.keyboard.down(key);
    await fastForward(page, n);
    await page.keyboard.up(key);
    remaining -= n;
  }
}

/** Click all REC buttons in the layer panel (Sprites, BG1, BG2, BG3) */
async function clickAllRecButtons(page: import('@playwright/test').Page): Promise<number> {
  const recButtons = page.locator('#layer-panel .layer-rec-btn');
  const count = await recButtons.count();
  for (let i = 0; i < count; i++) {
    await recButtons.nth(i).click();
  }
  return count;
}

/** Save all capture card thumbnails as full-resolution PNG to a directory */
async function saveCaptureThumbnails(
  page: import('@playwright/test').Page,
  outputDir: string,
): Promise<number> {
  mkdirSync(outputDir, { recursive: true });

  const results = await page.evaluate(() => {
    const cards = document.querySelectorAll('#layer-panel .edit-capture-card');
    const out: Array<{ name: string; dataUrl: string; w: number; h: number }> = [];
    for (const card of cards) {
      const nameEl = card.querySelector('.edit-capture-name');
      const name = nameEl?.textContent ?? `card-${out.length}`;
      const canvas = card.querySelector('canvas.edit-capture-thumb') as HTMLCanvasElement | null;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        out.push({ name, dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
      }
    }
    return out;
  });

  for (const { name, dataUrl } of results) {
    const safeName = name.replace(/[^a-zA-Z0-9_#-]/g, '_');
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    writeFileSync(join(outputDir, `${safeName}.png`), Buffer.from(base64, 'base64'));
  }

  return results.length;
}

test.describe('Game Matrix', () => {
  test.setTimeout(90_000);

  for (const rom of romFiles) {
    test.describe(rom, () => {

      test('Level 1 — boot (canvas not black)', async ({ page }) => {
        await loadRom(page, rom);
        await fastForward(page, 900);

        const hasContent = await canvasHasContent(page);
        expect(hasContent).toBe(true);
      });

      test('Level 2 — audio active', async ({ page }) => {
        await loadRom(page, rom);
        await fastForward(page, 300);

        const audioOk = await page.evaluate(() => {
          const emu = (window as unknown as Record<string, unknown>).__emu as
            { audioWorkerReady: boolean } & Record<string, unknown> | undefined;
          if (!emu) return false;
          return emu.audioWorkerReady || emu['isQSound'];
        });
        expect(audioOk).toBe(true);
      });

      test('Level 3 — sprite & scroll REC', async ({ page }) => {
        await loadRom(page, rom);

        // Phase 1: skip all intros BEFORE recording
        await coinStartAndPlay(page, 0);

        // Wait for layer panel to be present
        await page.waitForSelector('#layer-panel', { state: 'attached', timeout: 5_000 });

        // Phase 2: start REC on all layers AFTER intros
        const recCount = await clickAllRecButtons(page);
        test.info().annotations.push({ type: 'info', description: `${recCount} REC buttons activated` });

        // Phase 3: play with random inputs to capture gameplay (~15 seconds)
        const BATCH = 100;
        const inputs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 's', 'd', '5', 'Enter'];
        let remaining = 900;
        while (remaining > 0) {
          const n = Math.min(BATCH, remaining);
          const key = inputs[Math.floor(Math.random() * inputs.length)]!;
          await page.keyboard.down(key);
          await fastForward(page, n);
          await page.keyboard.up(key);
          remaining -= n;
        }

        // Stop REC on all layers
        await clickAllRecButtons(page);

        // Wait briefly for captures to finalize in the panel
        await page.waitForTimeout(500);

        // Save thumbnails
        const outputDir = join(__dirname, '..', '..', 'test-results', 'sprite-rec', rom);
        const cardCount = await saveCaptureThumbnails(page, outputDir);

        test.info().annotations.push({
          type: 'info',
          description: `${cardCount} capture(s) saved to test-results/sprite-rec/${rom}/`,
        });

        // Soft assertion: log but don't fail if no captures
        // Some games need specific inputs or timing to produce sprites
        if (cardCount === 0) {
          test.info().annotations.push({
            type: 'warning',
            description: `No captures for ${rom} — may need manual review`,
          });
        }
      });
    });
  }
});
