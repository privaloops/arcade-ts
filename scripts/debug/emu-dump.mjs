#!/usr/bin/env node
/**
 * Emulator Memory Dump Tool (via Playwright)
 *
 * Launches the dev server emulator in a headless browser, loads a game,
 * waits for gameplay, then dumps memory state to JSON.
 *
 * Usage:
 *   node scripts/debug/emu-dump.mjs <game> [--wait-boot <ms>] [--wait-gameplay <ms>] [--output <path>]
 *
 * Examples:
 *   node scripts/debug/emu-dump.mjs ghouls
 *   node scripts/debug/emu-dump.mjs ghouls --wait-boot 45000 --wait-gameplay 10000
 *
 * Prerequisites:
 *   - Dev server running: npm run dev
 *   - Playwright installed: npx playwright install chromium
 */

import { chromium } from 'playwright';
import { join } from 'path';

const args = process.argv.slice(2);
const game = args[0];
if (!game) {
  console.error('Usage: node emu-dump.mjs <game> [--wait-boot <ms>] [--wait-gameplay <ms>] [--output <path>] [--url <url>]');
  process.exit(1);
}

function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const waitBoot = parseInt(getArg('--wait-boot', '45000'), 10);
const waitGameplay = parseInt(getArg('--wait-gameplay', '10000'), 10);
const outputPath = getArg('--output', `/tmp/emu-dump-${game}.json`);
const baseUrl = getArg('--url', 'http://localhost:5173');
const romPath = join(import.meta.dirname, '../../public', `${game}.zip`);

async function main() {
  console.log(`[emu-dump] Game: ${game}`);
  console.log(`[emu-dump] ROM: ${romPath}`);
  console.log(`[emu-dump] Wait boot: ${waitBoot}ms, gameplay: ${waitGameplay}ms`);
  console.log(`[emu-dump] Output: ${outputPath}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 400, height: 300 },
  });
  const page = await context.newPage();

  // Navigate to emulator
  console.log(`[emu-dump] Loading ${baseUrl}`);
  await page.goto(baseUrl);
  await page.waitForTimeout(1000);

  // Load ROM via file input
  console.log(`[emu-dump] Loading ROM: ${game}.zip`);
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(romPath);

  // Wait for boot (self-test + title screen)
  console.log(`[emu-dump] Waiting ${waitBoot}ms for boot...`);
  await page.waitForTimeout(waitBoot);

  // Init audio (click) then insert coin + start
  await page.click('body');
  await page.waitForTimeout(200);

  console.log('[emu-dump] Inserting coin...');
  await page.keyboard.down('Digit5');
  await page.waitForTimeout(100);
  await page.keyboard.up('Digit5');
  await page.waitForTimeout(1000);

  console.log('[emu-dump] Pressing start...');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.up('Enter');

  // Wait for gameplay
  console.log(`[emu-dump] Waiting ${waitGameplay}ms for gameplay...`);
  await page.waitForTimeout(waitGameplay);

  // Take screenshot for visual reference
  const screenshotPath = outputPath.replace('.json', '.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`[emu-dump] Screenshot: ${screenshotPath}`);

  // Dump emulator state via window.__emu
  console.log('[emu-dump] Dumping emulator state...');
  const dump = await page.evaluate(() => {
    const emu = /** @type {any} */ (window).__emu;
    if (!emu) throw new Error('window.__emu not found');

    // Pause to get a stable snapshot
    emu.pause();
    const state = emu.saveState();

    // Convert Uint8Arrays to hex strings
    function toHex(arr) {
      return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return {
      source: 'emu',
      pc: state.m68kState.pc,
      regions: {
        cpsa_regs: toHex(state.cpsaRegisters),
        cpsb_regs: toHex(state.cpsbRegisters),
        vram_palette: toHex(state.vram.slice(0, 0x3000)),
        vram_full: toHex(state.vram),
        work_ram: toHex(state.workRam),
      },
    };
  });

  dump.game = game;

  // Write output
  const { writeFileSync } = await import('fs');
  writeFileSync(outputPath, JSON.stringify(dump, null, 2));

  console.log(`[emu-dump] Done! PC=0x${dump.pc.toString(16)}`);
  console.log(`[emu-dump] Regions: ${Object.keys(dump.regions).join(', ')}`);

  await browser.close();
}

main().catch(e => {
  console.error('[emu-dump] Error:', e.message);
  process.exit(1);
});
