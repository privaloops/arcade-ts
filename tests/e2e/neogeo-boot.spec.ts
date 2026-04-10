import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, '..', '..', 'public', 'roms', 'ncombat.zip');

test('Neo-Geo full boot + coin + start', async ({ page }) => {
  test.skip(!existsSync(ROM_PATH), 'ncombat.zip not found');
  test.setTimeout(180_000);

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

  // Helper: get emulator state
  const getState = () => page.evaluate(() => {
    const emu = (window as any).__ngoEmu;
    if (!emu) return null;
    const bus = emu.getBus();
    const m68k = emu.getM68000();
    const pc = m68k.getPC();
    const state = m68k.getState();
    const video = emu.getVideo();
    let spr = 0;
    for (let i = 1; i <= 381; i++) if (video.readSpriteEntry(i).tileCode !== 0) spr++;
    let fix = 0;
    for (let i = 0; i < 1280; i++) if (video.readVramWord(0x7000 + i) !== 0) fix++;
    // Check framebuffer for non-black pixels
    const fb = new Uint8Array(320 * 224 * 4);
    video.renderFrame(fb);
    let nonBlack = 0;
    for (let i = 0; i < fb.length; i += 4) {
      if (fb[i] !== 0 || fb[i+1] !== 0 || fb[i+2] !== 0) nonBlack++;
    }
    return {
      pc: `0x${(pc>>>0).toString(16)}`,
      irqMask: (state.sr >> 8) & 7,
      frames: emu.getFrameCount(),
      vw: bus.getVramWriteCount?.() ?? -1,
      sprites: spr, fix, nonBlack,
      biosMode: bus.read8(0) === bus.read8(0xC00000) ? 'BIOS' : 'GAME',
    };
  });

  // Phase 1: Wait for BIOS boot (30s)
  console.log('Phase 1: BIOS boot...');
  await page.waitForTimeout(30000);
  const s1 = await getState();
  console.log('After boot:', JSON.stringify(s1));
  await page.screenshot({ path: 'tests/e2e/neogeo-phase1-boot.png' });

  // Phase 2: Insert coin (key 5)
  console.log('Phase 2: Insert coin...');
  await page.click('canvas');
  await page.keyboard.down('Digit5');
  await page.waitForTimeout(200);
  await page.keyboard.up('Digit5');
  await page.waitForTimeout(2000);
  const s2 = await getState();
  console.log('After coin:', JSON.stringify(s2));
  await page.screenshot({ path: 'tests/e2e/neogeo-phase2-coin.png' });

  // Phase 3: Press start (Enter)
  console.log('Phase 3: Press start...');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.up('Enter');
  await page.waitForTimeout(5000);
  const s3 = await getState();
  console.log('After start:', JSON.stringify(s3));
  await page.screenshot({ path: 'tests/e2e/neogeo-phase3-start.png' });

  // Phase 4: Wait for game to load
  console.log('Phase 4: Wait for game...');
  await page.waitForTimeout(10000);
  const s4 = await getState();
  console.log('After wait:', JSON.stringify(s4));
  await page.screenshot({ path: 'tests/e2e/neogeo-phase4-game.png' });

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Boot:  ${s1?.sprites} spr, ${s1?.fix} fix, ${s1?.nonBlack} px, ${s1?.biosMode}`);
  console.log(`Coin:  ${s2?.sprites} spr, ${s2?.fix} fix, ${s2?.nonBlack} px, ${s2?.biosMode}`);
  console.log(`Start: ${s3?.sprites} spr, ${s3?.fix} fix, ${s3?.nonBlack} px, ${s3?.biosMode}`);
  console.log(`Game:  ${s4?.sprites} spr, ${s4?.fix} fix, ${s4?.nonBlack} px, ${s4?.biosMode}`);

  expect(s1).not.toBeNull();
});
