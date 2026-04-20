/**
 * ROM Round-Trip Test — validates that export → re-import preserves all modifications.
 *
 * Loads ffight.zip, modifies tiles, palettes, and OKI samples,
 * exports via RomStore, re-imports the ZIP, and verifies conformity.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { loadRomFromZip, type RomSet } from '@sprixe/engine/memory/rom-loader';
import { RomStore } from '@sprixe/engine/rom-store';
import { writePixel, readPixel, readTile } from '../editor/tile-encoder';
import { encodeColor, decodeColor, writeColor, readPalette } from '../editor/palette-editor';
import { parsePhraseTable, decodeSample, encodeSample, replaceSampleInRom, OKI_SAMPLE_RATE } from '@sprixe/engine/audio/oki-codec';

const ROM_URL = 'https://archive.org/download/mame-0.260-roms-non-merged/MAME%200.260%20ROMs%20%28non-merged%29/MAME%200.260%20ROMs%20%28non-merged%29/ffight.zip';
const CACHE_DIR = resolve(__dirname, '../../.rom-cache');
const CACHE_PATH = resolve(CACHE_DIR, 'ffight.zip');
const LOCAL_PATH = resolve(__dirname, '../../public/roms/ffight.zip');

async function getRomBuffer(): Promise<ArrayBuffer> {
  // Prefer local ROM if available
  if (existsSync(LOCAL_PATH)) {
    return readFileSync(LOCAL_PATH).buffer;
  }
  // Use cached download
  if (existsSync(CACHE_PATH)) {
    return readFileSync(CACHE_PATH).buffer;
  }
  // Download and cache
  const res = await fetch(ROM_URL);
  if (!res.ok) throw new Error(`Failed to download ROM: ${res.status} ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, Buffer.from(buffer));
  return buffer;
}

let originalRomSet: RomSet;

beforeAll(async () => {
  const zipBuffer = await getRomBuffer();
  originalRomSet = await loadRomFromZip(zipBuffer);
}, 60_000);

// ---------------------------------------------------------------------------
// Tile round-trip
// ---------------------------------------------------------------------------

describe('tile round-trip', () => {
  it('writePixel modifications survive export → re-import', async () => {
    const store = new RomStore(originalRomSet);

    // Pick a tile in a safe range (above font region, tile 300)
    const tileCode = 300;
    const testPixels = [
      { x: 0, y: 0, color: 5 },
      { x: 7, y: 3, color: 12 },
      { x: 15, y: 15, color: 1 },
      { x: 8, y: 8, color: 9 },
    ];

    // Write known pixel values
    for (const px of testPixels) {
      writePixel(store.graphicsRom, tileCode, px.x, px.y, px.color);
    }

    // Verify writes took effect
    for (const px of testPixels) {
      expect(readPixel(store.graphicsRom, tileCode, px.x, px.y)).toBe(px.color);
    }

    // Export and re-import
    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    // Verify pixels survived round-trip
    for (const px of testPixels) {
      expect(readPixel(reimported.graphicsRom, tileCode, px.x, px.y)).toBe(px.color);
    }
  });

  it('full tile data survives export → re-import', async () => {
    const store = new RomStore(originalRomSet);
    const tileCode = 400;

    // Write a recognizable 16×16 checkerboard pattern
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const color = ((x + y) % 2 === 0) ? 7 : 3;
        writePixel(store.graphicsRom, tileCode, x, y, color);
      }
    }

    const tileBefore = readTile(store.graphicsRom, tileCode);

    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    const tileAfter = readTile(reimported.graphicsRom, tileCode);
    expect(tileAfter).toEqual(tileBefore);
  });
});

// ---------------------------------------------------------------------------
// Palette round-trip
// ---------------------------------------------------------------------------

describe('palette round-trip', () => {
  it('encodeColor → decodeColor is stable (CPS1 quantization)', () => {
    // CPS1 has 4-bit per channel + brightness — not lossless for arbitrary RGB.
    // Test with values that encode cleanly.
    const testColors: [number, number, number][] = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [0, 0, 0],
      [128, 128, 128],
    ];

    for (const [r, g, b] of testColors) {
      const word = encodeColor(r, g, b);
      const [dr, dg, db] = decodeColor(word);
      // Re-encode → should produce same word (idempotent)
      const word2 = encodeColor(dr, dg, db);
      expect(word2).toBe(word);
    }
  });

  it('palette writes to program ROM survive export → re-import', async () => {
    const store = new RomStore(originalRomSet);

    // Write distinct colors at known positions in program ROM
    // We directly patch the program ROM bytes for palette data
    // Pick a palette-sized block in the program ROM and write a known pattern
    const testWord1 = encodeColor(255, 0, 0);   // red-ish
    const testWord2 = encodeColor(0, 255, 0);    // green-ish
    const testWord3 = encodeColor(0, 0, 255);    // blue-ish

    // Write directly to a known offset in program ROM (palette data area)
    // CPS1 program ROMs store palette data that gets copied to VRAM.
    // We'll write to a recognizable offset and verify it persists.
    const testOffset = 0x1000; // safe offset in program ROM
    store.programRom[testOffset] = (testWord1 >> 8) & 0xFF;
    store.programRom[testOffset + 1] = testWord1 & 0xFF;
    store.programRom[testOffset + 2] = (testWord2 >> 8) & 0xFF;
    store.programRom[testOffset + 3] = testWord2 & 0xFF;
    store.programRom[testOffset + 4] = (testWord3 >> 8) & 0xFF;
    store.programRom[testOffset + 5] = testWord3 & 0xFF;

    // Export and re-import
    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    // Verify
    const w1 = (reimported.programRom[testOffset]! << 8) | reimported.programRom[testOffset + 1]!;
    const w2 = (reimported.programRom[testOffset + 2]! << 8) | reimported.programRom[testOffset + 3]!;
    const w3 = (reimported.programRom[testOffset + 4]! << 8) | reimported.programRom[testOffset + 5]!;

    expect(w1).toBe(testWord1);
    expect(w2).toBe(testWord2);
    expect(w3).toBe(testWord3);
  });
});

// ---------------------------------------------------------------------------
// Palette ROM patching via source tracing — round-trip
// ---------------------------------------------------------------------------

describe('palette ROM patching round-trip', () => {
  it('patchPaletteViaSrc (fallback search) survives export → re-import', async () => {
    const store = new RomStore(originalRomSet);
    const rom = store.programRom;

    // Find a real palette in the program ROM: 16 consecutive non-zero words
    let palRomOff = -1;
    for (let off = 0; off <= rom.length - 32; off += 2) {
      let nonZero = 0;
      for (let i = 0; i < 16; i++) {
        const w = (rom[off + i * 2]! << 8) | rom[off + i * 2 + 1]!;
        if ((w & 0x0FFF) !== 0) nonZero++;
      }
      if (nonZero >= 14) { palRomOff = off; break; }
    }
    expect(palRomOff).toBeGreaterThan(-1);

    // Set up VRAM with this palette (simulating what the game would do)
    const vram = new Uint8Array(0x30000);
    const paletteBase = 0;
    const paletteIndex = 0;
    for (let i = 0; i < 32; i++) {
      vram[paletteIndex * 32 + i] = rom[palRomOff + i]!;
    }

    // Record original color 2
    const origWord = (rom[palRomOff + 4]! << 8) | rom[palRomOff + 5]!;
    const origRgb = origWord & 0x0FFF;

    // Patch color 2 with a new value (bright red)
    const newWord = encodeColor(255, 0, 0);
    const emptyMap = new Map<number, number>();
    const result = store.patchPaletteViaSrc(emptyMap, vram, paletteBase, paletteIndex, 2, newWord);
    expect(result).toBe(true);

    // Verify ROM was patched (brightness preserved, RGB changed)
    const patchedWord = (rom[palRomOff + 4]! << 8) | rom[palRomOff + 5]!;
    expect(patchedWord & 0x0FFF).not.toBe(origRgb);

    // Export and re-import
    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    // Verify the patched color survived round-trip
    const reloadedWord = (reimported.programRom[palRomOff + 4]! << 8) | reimported.programRom[palRomOff + 5]!;
    expect(reloadedWord).toBe(patchedWord);
  });

  it('patchPaletteViaSrc with traced source map patches correct offset', async () => {
    const store = new RomStore(originalRomSet);
    const rom = store.programRom;

    // Find a palette in ROM (same as above)
    let palRomOff = -1;
    for (let off = 0; off <= rom.length - 32; off += 2) {
      let nonZero = 0;
      for (let i = 0; i < 16; i++) {
        const w = (rom[off + i * 2]! << 8) | rom[off + i * 2 + 1]!;
        if ((w & 0x0FFF) !== 0) nonZero++;
      }
      if (nonZero >= 14) { palRomOff = off; break; }
    }

    // Set up VRAM + source map (simulating A0 trace)
    const vram = new Uint8Array(0x30000);
    const paletteBase = 0;
    const paletteIndex = 5;
    const vramOff = paletteIndex * 32;
    for (let i = 0; i < 32; i++) {
      vram[vramOff + i] = rom[palRomOff + i]!;
    }

    // Populate source map: VRAM offset → ROM offset (as the A0 trace would)
    const sourceMap = new Map<number, number>();
    for (let i = 0; i < 16; i++) {
      sourceMap.set(vramOff + i * 2, palRomOff + i * 2);
    }

    // Patch color 4 via traced source
    const newWord = encodeColor(0, 0, 255);
    const result = store.patchPaletteViaSrc(sourceMap, vram, paletteBase, paletteIndex, 4, newWord);
    expect(result).toBe(true);

    // Export and re-import
    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    const reloaded = (reimported.programRom[palRomOff + 8]! << 8) | reimported.programRom[palRomOff + 9]!;
    const patched = (rom[palRomOff + 8]! << 8) | rom[palRomOff + 9]!;
    expect(reloaded).toBe(patched);
  });
});

// ---------------------------------------------------------------------------
// OKI sample round-trip
// ---------------------------------------------------------------------------

describe('OKI sample round-trip', () => {
  it('replaceSampleInRom modifications survive export → re-import', async () => {
    const store = new RomStore(originalRomSet);

    // Parse phrase table to find a valid sample slot
    const phrases = parsePhraseTable(store.okiRom);
    expect(phrases.length).toBeGreaterThan(0);

    const targetPhrase = phrases[0]!;

    // Generate a test signal: 100ms of 440 Hz sine wave
    const duration = 0.1;
    const numSamples = Math.floor(OKI_SAMPLE_RATE * duration);
    const testPcm = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      testPcm[i] = Math.sin(2 * Math.PI * 440 * i / OKI_SAMPLE_RATE);
    }

    // Encode to ADPCM and replace in ROM
    const adpcmData = encodeSample(testPcm, OKI_SAMPLE_RATE);
    const result = replaceSampleInRom(store.okiRom, targetPhrase.id, adpcmData);
    expect(result.success).toBe(true);

    // Read back the ADPCM data before export
    const phrasesAfterWrite = parsePhraseTable(store.okiRom);
    const phraseAfterWrite = phrasesAfterWrite[0]!;
    const decodedBefore = decodeSample(store.okiRom, phraseAfterWrite);

    // Export and re-import
    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    // Verify OKI ROM sample data survived
    const phrasesReimported = parsePhraseTable(reimported.okiRom);
    expect(phrasesReimported.length).toBe(phrases.length);

    const reimportedPhrase = phrasesReimported[0]!;

    // Phrase table pointers should match
    expect(reimportedPhrase.startByte).toBe(phraseAfterWrite.startByte);
    expect(reimportedPhrase.endByte).toBe(phraseAfterWrite.endByte);

    // Decoded audio should be identical
    const decodedAfter = decodeSample(reimported.okiRom, reimportedPhrase);
    expect(decodedAfter.length).toBe(decodedBefore.length);

    for (let i = 0; i < decodedBefore.length; i++) {
      expect(decodedAfter[i]).toBeCloseTo(decodedBefore[i]!, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Combined round-trip — all modifications at once
// ---------------------------------------------------------------------------

describe('combined round-trip', () => {
  it('tiles + program ROM + OKI all survive a single export → re-import', async () => {
    const store = new RomStore(originalRomSet);

    // --- Tiles ---
    const tileCode = 500;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        writePixel(store.graphicsRom, tileCode, x, y, (x + y) % 16);
      }
    }
    const tileDataBefore = readTile(store.graphicsRom, tileCode);

    // --- Program ROM (palette data) ---
    const paletteOffset = 0x2000;
    const paletteWords = [
      encodeColor(255, 0, 0),
      encodeColor(0, 255, 0),
      encodeColor(0, 0, 255),
      encodeColor(255, 255, 0),
    ];
    for (let i = 0; i < paletteWords.length; i++) {
      const off = paletteOffset + i * 2;
      store.programRom[off] = (paletteWords[i]! >> 8) & 0xFF;
      store.programRom[off + 1] = paletteWords[i]! & 0xFF;
    }

    // --- OKI ---
    const phrases = parsePhraseTable(store.okiRom);
    const targetPhrase = phrases[0]!;
    const testPcm = new Float32Array(Math.floor(OKI_SAMPLE_RATE * 0.05));
    for (let i = 0; i < testPcm.length; i++) {
      testPcm[i] = Math.sin(2 * Math.PI * 1000 * i / OKI_SAMPLE_RATE);
    }
    const adpcm = encodeSample(testPcm, OKI_SAMPLE_RATE);
    replaceSampleInRom(store.okiRom, targetPhrase.id, adpcm);
    const okiPhraseBefore = parsePhraseTable(store.okiRom)[0]!;
    const okiDecodedBefore = decodeSample(store.okiRom, okiPhraseBefore);

    // === Export → Re-import ===
    const exported = await store.exportZipAsArrayBuffer();
    const reimported = await loadRomFromZip(exported);

    // --- Verify tiles ---
    const tileDataAfter = readTile(reimported.graphicsRom, tileCode);
    expect(tileDataAfter).toEqual(tileDataBefore);

    // --- Verify program ROM palette ---
    for (let i = 0; i < paletteWords.length; i++) {
      const off = paletteOffset + i * 2;
      const word = (reimported.programRom[off]! << 8) | reimported.programRom[off + 1]!;
      expect(word).toBe(paletteWords[i]);
    }

    // --- Verify OKI ---
    const okiPhraseAfter = parsePhraseTable(reimported.okiRom)[0]!;
    expect(okiPhraseAfter.startByte).toBe(okiPhraseBefore.startByte);
    expect(okiPhraseAfter.endByte).toBe(okiPhraseBefore.endByte);

    const okiDecodedAfter = decodeSample(reimported.okiRom, okiPhraseAfter);
    expect(okiDecodedAfter.length).toBe(okiDecodedBefore.length);
    for (let i = 0; i < okiDecodedBefore.length; i++) {
      expect(okiDecodedAfter[i]).toBeCloseTo(okiDecodedBefore[i]!, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// MAME validation — skip if MAME is not installed
// ---------------------------------------------------------------------------

function hasMame(): boolean {
  try {
    execSync('which mame', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasMame())('MAME validation', () => {
  it('modified ROM boots in MAME without errors', async () => {
    const store = new RomStore(originalRomSet);

    // Apply modifications (same as combined test)
    const tileCode = 500;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        writePixel(store.graphicsRom, tileCode, x, y, (x + y) % 16);
      }
    }

    const phrases = parsePhraseTable(store.okiRom);
    const testPcm = new Float32Array(Math.floor(OKI_SAMPLE_RATE * 0.05));
    for (let i = 0; i < testPcm.length; i++) {
      testPcm[i] = Math.sin(2 * Math.PI * 1000 * i / OKI_SAMPLE_RATE);
    }
    replaceSampleInRom(store.okiRom, phrases[0]!.id, encodeSample(testPcm, OKI_SAMPLE_RATE));

    // Export modified ROM to temp directory
    const exported = await store.exportZipAsArrayBuffer();
    const mameDir = resolve(tmpdir(), 'sprixe-mame-test');
    mkdirSync(mameDir, { recursive: true });
    writeFileSync(resolve(mameDir, 'ffight.zip'), Buffer.from(exported));

    try {
      // Run MAME headless: -bench 2 implies -video none -sound none -nothrottle
      const output = execSync(
        `mame ffight -rompath "${mameDir}" -bench 2 -skip_gameinfo`,
        { timeout: 30_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
      );

      // MAME outputs "Average speed: X%" on success
      expect(output).toContain('Average speed');
    } finally {
      rmSync(mameDir, { recursive: true, force: true });
    }
  }, 30_000);
});
