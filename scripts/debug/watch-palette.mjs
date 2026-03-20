#!/usr/bin/env node
/**
 * Palette Watch — finds which M68K instructions write wrong palette values.
 *
 * Loads Ghouls, enters gameplay, activates the palette watchpoint,
 * and captures console logs showing PCs that write G=0xF palette entries.
 *
 * Usage: node scripts/debug/watch-palette.mjs [game] [--wait-boot <ms>] [--watch-time <ms>]
 */

import { chromium } from 'playwright';
import { join } from 'path';

const args = process.argv.slice(2);
const game = args[0] || 'ghouls';

function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const waitBoot = parseInt(getArg('--wait-boot', '50000'), 10);
const watchTime = parseInt(getArg('--watch-time', '15000'), 10);
const romPath = join(import.meta.dirname, '../../public', `${game}.zip`);

async function main() {
  console.log(`[watch] Game: ${game}, boot: ${waitBoot}ms, watch: ${watchTime}ms`);

  const browser = await chromium.launch({ headless: false }); // headed to ensure rAF works
  const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await context.newPage();

  // Capture all console output
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[PAL]') || text.includes('[PALETTE WATCH]')) {
      logs.push(text);
      console.log(text);
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // Load ROM
  console.log('[watch] Loading ROM...');
  await page.locator('#file-input').setInputFiles(romPath);

  // Wait for boot
  console.log(`[watch] Waiting ${waitBoot}ms for boot...`);
  await page.waitForTimeout(waitBoot);

  // Take a screenshot to see what state we're in
  await page.screenshot({ path: '/tmp/watch-prestart.png' });
  console.log('[watch] Pre-start screenshot: /tmp/watch-prestart.png');

  // Activate palette watchpoint BEFORE starting gameplay
  console.log('[watch] Activating palette watchpoint...');
  await page.evaluate(() => {
    const emu = /** @type {any} */ (window).__emu;
    emu.debugWatchPalette(200);
  });

  // Insert coin + start
  await page.click('body');
  await page.waitForTimeout(200);
  await page.keyboard.down('Digit5');
  await page.waitForTimeout(200);
  await page.keyboard.up('Digit5');
  await page.waitForTimeout(1500);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.up('Enter');

  // Wait for gameplay to start
  console.log('[watch] Waiting 15s for gameplay transition...');
  await page.waitForTimeout(15000);

  await page.screenshot({ path: '/tmp/watch-gameplay.png' });
  console.log('[watch] Gameplay screenshot: /tmp/watch-gameplay.png');

  // Wait and collect logs
  console.log(`[watch] Watching for ${watchTime}ms...`);
  await page.waitForTimeout(watchTime);

  // Stop watch
  await page.evaluate(() => {
    const emu = /** @type {any} */ (window).__emu;
    emu.debugStopWatch();
  });

  await page.screenshot({ path: '/tmp/watch-final.png' });

  console.log(`\n=== Results: ${logs.length} unique PCs wrote G=0xF ===`);
  for (const log of logs) {
    if (log.includes('PC=')) console.log(log);
  }

  await browser.close();
}

main().catch(e => {
  console.error('[watch] Error:', e.message);
  process.exit(1);
});
