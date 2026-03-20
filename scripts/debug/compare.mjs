#!/usr/bin/env node
/**
 * Memory Dump Comparison Tool
 *
 * Compares MAME and emulator memory dumps to find divergences.
 * Highlights palette color differences with decoded RGB values.
 *
 * Usage:
 *   node scripts/debug/compare.mjs <mame-dump.json> <emu-dump.json> [--region <name>] [--max-diffs <n>]
 *
 * Examples:
 *   node scripts/debug/compare.mjs /tmp/mame-dump-ghouls.json /tmp/emu-dump-ghouls.json
 *   node scripts/debug/compare.mjs /tmp/mame-dump-ghouls.json /tmp/emu-dump-ghouls.json --region vram_palette
 */

import { readFileSync } from 'fs';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node compare.mjs <mame-dump.json> <emu-dump.json> [--region <name>] [--max-diffs <n>]');
  process.exit(1);
}

function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const mamePath = args[0];
const emuPath = args[1];
const regionFilter = getArg('--region', null);
const maxDiffs = parseInt(getArg('--max-diffs', '100'), 10);

// CPS1 color decoding (matches cps1-video.ts)
function decodeCPS1Color(word) {
  const bright = 0x0f + (((word >> 12) & 0x0f) << 1);
  const r = Math.min(255, ((word >> 8) & 0x0f) * 0x11 * bright / 0x2d | 0);
  const g = Math.min(255, ((word >> 4) & 0x0f) * 0x11 * bright / 0x2d | 0);
  const b = Math.min(255, ((word >> 0) & 0x0f) * 0x11 * bright / 0x2d | 0);
  return { r, g, b, bright };
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function readWord(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

// Load dumps
const mameDump = JSON.parse(readFileSync(mamePath, 'utf-8'));
const emuDump = JSON.parse(readFileSync(emuPath, 'utf-8'));

console.log(`MAME dump: game=${mameDump.game}, frame=${mameDump.frame || '?'}, PC=0x${mameDump.pc?.toString(16)}`);
console.log(`EMU dump:  game=${emuDump.game}, PC=0x${emuDump.pc?.toString(16)}`);
console.log('');

// Compare each region
const regions = regionFilter ? [regionFilter] : Object.keys(mameDump.regions);

for (const regionName of regions) {
  const mameHex = mameDump.regions[regionName];
  const emuHex = emuDump.regions[regionName];

  if (!mameHex) { console.log(`Region "${regionName}": missing in MAME dump`); continue; }
  if (!emuHex) { console.log(`Region "${regionName}": missing in EMU dump`); continue; }

  const mameBytes = hexToBytes(mameHex);
  const emuBytes = hexToBytes(emuHex);

  const size = Math.min(mameBytes.length, emuBytes.length);
  let diffCount = 0;
  let totalBytes = size;
  let matchingBytes = 0;
  const diffs = [];

  for (let i = 0; i < size; i++) {
    if (mameBytes[i] === emuBytes[i]) {
      matchingBytes++;
    } else {
      diffCount++;
      if (diffs.length < maxDiffs) {
        diffs.push(i);
      }
    }
  }

  const pct = (matchingBytes / totalBytes * 100).toFixed(1);
  console.log(`=== ${regionName} (${totalBytes} bytes) ===`);
  console.log(`  Match: ${matchingBytes}/${totalBytes} (${pct}%) | Diffs: ${diffCount}`);

  if (diffs.length === 0) {
    console.log('  IDENTICAL');
    console.log('');
    continue;
  }

  // For palette region, show color-level diffs
  const isPalette = regionName.includes('palette');

  if (isPalette) {
    // Group diffs by 16-bit words (palette entries)
    const wordDiffs = new Map();
    for (const byteOff of diffs) {
      const wordOff = byteOff & ~1; // align to word boundary
      if (!wordDiffs.has(wordOff)) {
        wordDiffs.set(wordOff, true);
      }
    }

    console.log(`  Palette entries with differences: ${wordDiffs.size}`);
    console.log('');
    console.log('  Offset   | MAME raw  → RGB            | EMU raw   → RGB            | Delta');
    console.log('  ---------+---------+--------------------+---------+--------------------+------');

    let shown = 0;
    for (const [wordOff] of wordDiffs) {
      if (shown >= maxDiffs / 2) {
        console.log(`  ... (${wordDiffs.size - shown} more)`);
        break;
      }

      const mameWord = readWord(mameBytes, wordOff);
      const emuWord = readWord(emuBytes, wordOff);
      const mameCol = decodeCPS1Color(mameWord);
      const emuCol = decodeCPS1Color(emuWord);

      const paletteIdx = Math.floor(wordOff / 32);
      const colorIdx = (wordOff % 32) / 2;

      const dr = Math.abs(mameCol.r - emuCol.r);
      const dg = Math.abs(mameCol.g - emuCol.g);
      const db = Math.abs(mameCol.b - emuCol.b);

      console.log(
        `  0x${wordOff.toString(16).padStart(4, '0')} ` +
        `P${paletteIdx.toString().padStart(3)}:${colorIdx.toString().padStart(2)} | ` +
        `0x${mameWord.toString(16).padStart(4, '0')} → R${mameCol.r.toString().padStart(3)} G${mameCol.g.toString().padStart(3)} B${mameCol.b.toString().padStart(3)} | ` +
        `0x${emuWord.toString(16).padStart(4, '0')} → R${emuCol.r.toString().padStart(3)} G${emuCol.g.toString().padStart(3)} B${emuCol.b.toString().padStart(3)} | ` +
        `dR=${dr} dG=${dg} dB=${db}`
      );
      shown++;
    }
  } else {
    // Generic byte-level diff
    console.log('  First differences:');
    let shown = 0;
    // Group consecutive diffs into ranges
    let rangeStart = diffs[0];
    let rangeEnd = diffs[0];

    for (let i = 1; i <= diffs.length && shown < 20; i++) {
      if (i < diffs.length && diffs[i] === rangeEnd + 1) {
        rangeEnd = diffs[i];
      } else {
        const len = rangeEnd - rangeStart + 1;
        const mameSlice = Array.from(mameBytes.slice(rangeStart, rangeStart + Math.min(len, 16)))
          .map(b => b.toString(16).padStart(2, '0')).join(' ');
        const emuSlice = Array.from(emuBytes.slice(rangeStart, rangeStart + Math.min(len, 16)))
          .map(b => b.toString(16).padStart(2, '0')).join(' ');

        console.log(`    0x${rangeStart.toString(16).padStart(6, '0')}-0x${rangeEnd.toString(16).padStart(6, '0')} (${len} bytes)`);
        console.log(`      MAME: ${mameSlice}${len > 16 ? '...' : ''}`);
        console.log(`      EMU:  ${emuSlice}${len > 16 ? '...' : ''}`);
        shown++;

        if (i < diffs.length) {
          rangeStart = diffs[i];
          rangeEnd = diffs[i];
        }
      }
    }
  }
  console.log('');
}

// CPS-A/B register comparison (always show if present)
for (const regName of ['cpsa_regs', 'cpsb_regs']) {
  if (regionFilter && regionFilter !== regName) continue;
  const mameHex = mameDump.regions[regName];
  const emuHex = emuDump.regions[regName];
  if (!mameHex || !emuHex) continue;

  const mameBytes = hexToBytes(mameHex);
  const emuBytes = hexToBytes(emuHex);
  const size = Math.min(mameBytes.length, emuBytes.length);

  const regLabels = regName === 'cpsa_regs' ? {
    0x00: 'OBJ_BASE', 0x02: 'SCROLL1_BASE', 0x04: 'SCROLL2_BASE',
    0x06: 'SCROLL3_BASE', 0x08: 'OTHER_BASE', 0x0A: 'PALETTE_BASE',
    0x0C: 'SCROLL1_X', 0x0E: 'SCROLL1_Y',
    0x10: 'SCROLL2_X', 0x12: 'SCROLL2_Y',
    0x14: 'SCROLL3_X', 0x16: 'SCROLL3_Y',
  } : {};

  let hasDiff = false;
  for (let i = 0; i < size; i += 2) {
    const mameWord = readWord(mameBytes, i);
    const emuWord = readWord(emuBytes, i);
    if (mameWord !== emuWord) {
      if (!hasDiff) {
        console.log(`=== ${regName} register differences ===`);
        hasDiff = true;
      }
      const label = regLabels[i] || `+0x${i.toString(16).padStart(2, '0')}`;
      console.log(`  ${label.padEnd(16)}: MAME=0x${mameWord.toString(16).padStart(4, '0')} EMU=0x${emuWord.toString(16).padStart(4, '0')}`);
    }
  }
  if (hasDiff) console.log('');
}

console.log('Done.');
