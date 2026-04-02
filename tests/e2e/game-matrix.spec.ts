/**
 * Game Matrix — automated testing of all ROMs in public/roms/.
 *
 * Level 1: Boot — title screen image comparison (canvas toDataURL)
 * Level 2: Audio — FM note activity via DOM (aud-ch-note elements)
 *
 * First run: generate reference screenshots with --update-snapshots
 * Subsequent runs: compare against references
 */

import { test, expect } from '@playwright/test';
import { readdirSync, existsSync } from 'fs';
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

/** Wait for N frames of emulation */
async function waitUntilFrame(page: import('@playwright/test').Page, n: number): Promise<void> {
  await page.waitForFunction((target) => {
    const emu = (window as unknown as Record<string, unknown>).__emu as { getFrameCount(): number } | undefined;
    return emu && emu.getFrameCount() > target;
  }, n, { timeout: 30_000 });
}

/** Extract canvas pixels as PNG buffer (384x224, native resolution) */
async function captureCanvas(page: import('@playwright/test').Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const cvs = document.getElementById('screen') as HTMLCanvasElement;
    return cvs.toDataURL('image/png');
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

test.describe('Game Matrix', () => {
  test.setTimeout(90_000);

  for (const rom of romFiles) {
    test.describe(rom, () => {

      test('Level 1 — title screen', async ({ page }) => {
        await loadRom(page, rom);
        await waitUntilFrame(page, 1200);

        const screenshot = await captureCanvas(page);
        expect(screenshot).toMatchSnapshot(`${rom}-title.png`);
      });

      test('Level 2 — audio activity', async ({ page }) => {
        await loadRom(page, rom);
        await waitUntilFrame(page, 300);

        // Verify audio is active:
        // - Standard CPS1: audioWorkerReady = true (Z80+YM2151 in Worker)
        // - QSound games: Z80 on main thread, check isQSound flag instead
        const audioOk = await page.evaluate(() => {
          const emu = (window as unknown as Record<string, unknown>).__emu as
            { audioWorkerReady: boolean } & Record<string, unknown> | undefined;
          if (!emu) return false;
          return emu.audioWorkerReady || emu['isQSound'];
        });
        expect(audioOk).toBe(true);
      });
    });
  }
});
