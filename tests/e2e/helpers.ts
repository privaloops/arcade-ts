/**
 * E2E test helpers — ROM loading, state checking, common utilities.
 */

import { type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'test.zip');

/**
 * Load the test ROM fixture by simulating a file drop on the drop zone.
 */
export async function loadTestRom(page: Page): Promise<void> {
  const buffer = readFileSync(FIXTURE_PATH);
  const b64 = buffer.toString('base64');

  // Wait for the app JS to fully initialize (emulator instance on window)
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__emu !== undefined,
    { timeout: 8_000 },
  );

  await page.evaluate(async (b64Data) => {
    const binary = atob(b64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], 'test.zip', { type: 'application/zip' });

    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) throw new Error('Drop zone not found');

    const dt = new DataTransfer();
    dt.items.add(file);

    dropZone.dispatchEvent(new DragEvent('drop', {
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
    }));
  }, b64);

  // Wait for drop zone to get .hidden class (ROM loaded)
  await page.waitForSelector('#drop-zone.hidden', { state: 'attached', timeout: 15_000 });
}

/**
 * Wait for the emulator to be running (at least 1 frame rendered).
 */
export async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const emu = (window as unknown as Record<string, unknown>).__emu as { getFrameCount(): number } | undefined;
    return emu && emu.getFrameCount() > 0;
  }, { timeout: 10_000 });
}

/**
 * Get emulator state from the page.
 */
export async function getEmulatorState(page: Page): Promise<{
  frameCount: number;
  isPaused: boolean;
  isRunning: boolean;
  gameName: string;
}> {
  return page.evaluate(() => {
    const emu = (window as unknown as Record<string, unknown>).__emu as {
      getFrameCount(): number;
      isPaused(): boolean;
      isRunning(): boolean;
      getGameName(): string;
    };
    return {
      frameCount: emu.getFrameCount(),
      isPaused: emu.isPaused(),
      isRunning: emu.isRunning(),
      gameName: emu.getGameName(),
    };
  });
}

/**
 * Check if canvas has non-zero pixels (something was rendered).
 */
export async function canvasHasContent(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const cvs = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!cvs) return false;
    const ctx = cvs.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 0 || data[i + 1]! > 0 || data[i + 2]! > 0) return true;
    }
    return false;
  }, selector);
}
