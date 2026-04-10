import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, '..', '..', 'public', 'roms', 'ncombat.zip');

test('Neo-Geo boot', async ({ page }) => {
  test.skip(!existsSync(ROM_PATH), 'ncombat.zip not found');
  test.setTimeout(120_000);

  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/play/');
  await page.waitForFunction(() => (window as any).__emu !== undefined, { timeout: 8_000 });

  const b64 = readFileSync(ROM_PATH).toString('base64');
  await page.evaluate(async (d) => {
    const bin = atob(d);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 'ncombat.zip', { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);

  await page.waitForSelector('#drop-zone.hidden', { state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(30000);

  const diag = await page.evaluate(() => {
    const emu = (window as any).__ngoEmu;
    if (!emu) return { error: 'no emu' };
    const bus = emu.getBus();
    const m68k = emu.getM68000();
    const pc = m68k.getPC();
    const state = m68k.getState();
    const bootStep = bus.read16(0x10FD08);
    const steps = ['WORK RAM','BACKUP RAM','COLOR RAM 0','COLOR RAM 1','VIDEO RAM','CALENDAR','SYSTEM ROM','MEMORY CARD','Z80'];
    const video = emu.getVideo();
    let spr = 0;
    for (let i = 1; i <= 381; i++) if (video.readSpriteEntry(i).tileCode !== 0) spr++;
    return {
      pc: `0x${(pc>>>0).toString(16)}`, sr: `0x${state.sr.toString(16)}`,
      irqMask: (state.sr >> 8) & 7, frameCount: emu.getFrameCount(),
      bootStep, failedTest: steps[bootStep] ?? `?(${bootStep})`,
      vramWrites: bus.getVramWriteCount?.() ?? -1, activeSprites: spr,
      biosMode: bus.read8(0) === bus.read8(0xC00000) ? 'BIOS' : 'P-ROM',
    };
  });
  console.log('\n=== Boot ===\n' + JSON.stringify(diag, null, 2));
  for (const l of logs.filter(l => l.includes('[Neo-Geo'))) console.log(' ', l);
  await page.screenshot({ path: 'tests/e2e/neogeo-boot-screenshot.png' });
  expect(diag).not.toHaveProperty('error');
});
