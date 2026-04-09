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
  // Take screenshots at different intervals
  for (const sec of [15, 30, 45, 60]) {
    await page.waitForTimeout(15000);
    await page.screenshot({ path: `tests/e2e/neogeo-boot-${sec}s.png` });
    const snap = await page.evaluate(() => {
      const emu = (window as any).__ngoEmu;
      if (!emu) return {};
      const bus = emu.getBus();
      const video = emu.getVideo();
      let sprites = 0;
      for (let i = 1; i <= 381; i++) {
        if (video.readSpriteEntry(i).tileCode !== 0) sprites++;
      }
      return { frames: emu.getFrameCount(), vw: bus.getVramWriteCount?.(), spr: sprites };
    });
    console.log(`@${sec}s:`, JSON.stringify(snap));
  }

  const diag = await page.evaluate(() => {
    const emu = (window as any).__ngoEmu;
    if (!emu) return { error: 'no emu' };
    const bus = emu.getBus();
    const m68k = emu.getM68000();
    const video = emu.getVideo();
    const pc = m68k.getPC();
    const state = m68k.getState();

    let spriteCount = 0;
    for (let i = 1; i <= 381; i++) {
      const entry = video.readSpriteEntry(i);
      if (entry.tileCode !== 0 && entry.height > 0) spriteCount++;
    }
    let fixCount = 0;
    for (let i = 0; i < 1280; i++) {
      if (video.readVramWord(0x7000 + i) !== 0) fixCount++;
    }

    // Opcodes around PC
    const opcodes: string[] = [];
    for (let a = pc - 4; a < pc + 12; a += 2) {
      opcodes.push(`${(a>>>0).toString(16)}:${bus.read16(a).toString(16).padStart(4,'0')}`);
    }

    // Boot step from BIOS RAM at A5+0x0A08 (A5=0x10F300)
    const bootStep = bus.read16(0x10F300 + 0x0A08);
    const stepNames = ['WORK RAM','BACKUP RAM','COLOR RAM 0','COLOR RAM 1','VIDEO RAM','CALENDAR','SYSTEM ROM','Z80 COMM','UNKNOWN'];

    return {
      pc: `0x${(pc >>> 0).toString(16)}`,
      bootStep,
      failedTest: stepNames[bootStep] ?? `UNKNOWN(${bootStep})`,
      opcodes,
      sr: `0x${state.sr.toString(16)}`,
      irqMask: (state.sr >> 8) & 7,
      frameCount: emu.getFrameCount(),
      vramWrites: bus.getVramWriteCount?.() ?? -1,
      activeSprites: spriteCount,
      fixLayerEntries: fixCount,
      biosMode: bus.read8(0x000000) === bus.read8(0xC00000) ? 'BIOS' : 'P-ROM',
      soundReply: `0x${bus.read8(0x320000).toString(16).padStart(2, '0')}`,
    };
  });

  console.log('\n=== Neo-Geo Boot Diagnostic ===');
  console.log(JSON.stringify(diag, null, 2));
  console.log('\nConsole:');
  for (const l of logs.filter(l => l.includes('[Neo-Geo'))) console.log(' ', l);

  await page.screenshot({ path: 'tests/e2e/neogeo-boot-screenshot.png' });
  expect(diag).not.toHaveProperty('error');
});
