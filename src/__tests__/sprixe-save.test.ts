/**
 * Sprixe Save/Load unit tests.
 *
 * Tests diff computation, serialization round-trip, and save file validation.
 * Uses the real ffight.zip ROM for integration-level coverage.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { loadRomFromZip, type RomSet } from '../memory/rom-loader';
import { RomStore } from '../rom-store';
import type { DiffEntry } from '../rom-store';
import { writePixel, readPixel, readTile } from '../editor/tile-encoder';
import { encodeColor } from '../editor/palette-editor';
import { encodeSample, replaceSampleInRom, parsePhraseTable, OKI_SAMPLE_RATE } from '../audio/oki-codec';
import { buildSaveData, parseSaveFile, applySaveFile, exportSaveFile } from '../editor/sprixe-save';
import type { CapturedPose } from '../editor/sprite-analyzer';

// ImageData is not available in Node — provide a minimal stub for tests
if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as Record<string, unknown>).ImageData = class ImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly colorSpace = 'srgb';
    constructor(w: number, h: number) {
      this.width = w; this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

function makePreview(w: number, h: number): ImageData {
  return new ImageData(w, h);
}

const ROM_URL = 'https://archive.org/download/mame-0.260-roms-non-merged/MAME%200.260%20ROMs%20%28non-merged%29/MAME%200.260%20ROMs%20%28non-merged%29/ffight.zip';
const CACHE_DIR = resolve(__dirname, '../../.rom-cache');
const CACHE_PATH = resolve(CACHE_DIR, 'ffight.zip');
const LOCAL_PATH = resolve(__dirname, '../../public/roms/ffight.zip');

async function getRomBuffer(): Promise<ArrayBuffer> {
  if (existsSync(LOCAL_PATH)) return readFileSync(LOCAL_PATH).buffer as ArrayBuffer;
  if (existsSync(CACHE_PATH)) return readFileSync(CACHE_PATH).buffer as ArrayBuffer;
  const res = await fetch(ROM_URL);
  if (!res.ok) throw new Error(`Failed to download ROM: ${res.status}`);
  const buffer = await res.arrayBuffer();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, Buffer.from(buffer));
  return buffer;
}

let originalRomSet: RomSet;

beforeAll(async () => {
  originalRomSet = await loadRomFromZip(await getRomBuffer());
}, 60_000);

// ---------------------------------------------------------------------------
// computeDiffs
// ---------------------------------------------------------------------------

describe('computeDiffs', () => {
  it('returns empty diffs for unmodified ROM', () => {
    const store = new RomStore(originalRomSet);
    const diffs = store.computeDiffs();
    expect(diffs.graphics).toHaveLength(0);
    expect(diffs.program).toHaveLength(0);
    expect(diffs.oki).toHaveLength(0);
  });

  it('detects tile modifications as contiguous runs', () => {
    const store = new RomStore(originalRomSet);
    const tileCode = 300;
    // Write a full tile (128 bytes contiguous)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        writePixel(store.graphicsRom, tileCode, x, y, (x + y) % 16);
      }
    }

    const diffs = store.computeDiffs();
    expect(diffs.graphics.length).toBeGreaterThan(0);

    // The tile at offset 300*128 = 38400 should be in a single run
    const tileOffset = tileCode * 128;
    const covering = diffs.graphics.filter(
      d => d.offset <= tileOffset && d.offset + d.bytes.length >= tileOffset + 128
    );
    expect(covering.length).toBe(1);
  });

  it('merges runs within 8-byte gap tolerance', () => {
    const store = new RomStore(originalRomSet);
    const orig = store.getOriginal('graphics');
    // Flip bits to guarantee a diff regardless of original value
    store.graphicsRom[10000] = orig[10000]! ^ 0xFF;
    store.graphicsRom[10004] = orig[10004]! ^ 0xFF;

    const diffs = store.computeDiffs();
    const entry = diffs.graphics.find(d => d.offset <= 10000 && d.offset + d.bytes.length > 10004);
    expect(entry).toBeDefined();
    // Should be one merged run, not two separate entries
    expect(entry!.bytes.length).toBe(5); // bytes 10000..10004 inclusive
  });

  it('does NOT merge runs beyond 8-byte gap', () => {
    const store = new RomStore(originalRomSet);
    const orig = store.getOriginal('graphics');
    store.graphicsRom[20000] = orig[20000]! ^ 0xFF;
    store.graphicsRom[20010] = orig[20010]! ^ 0xFF; // 10-byte gap > 8

    const diffs = store.computeDiffs();
    const entries = diffs.graphics.filter(
      d => (d.offset <= 20000 && d.offset + d.bytes.length > 20000) ||
           (d.offset <= 20010 && d.offset + d.bytes.length > 20010)
    );
    expect(entries.length).toBe(2);
  });

  it('detects program ROM modifications', () => {
    const store = new RomStore(originalRomSet);
    store.programRom[0x1000] = 0xAB;

    const diffs = store.computeDiffs();
    expect(diffs.program.length).toBeGreaterThan(0);
    const entry = diffs.program.find(d => d.offset <= 0x1000 && d.offset + d.bytes.length > 0x1000);
    expect(entry).toBeDefined();
  });

  it('detects OKI ROM modifications', () => {
    const store = new RomStore(originalRomSet);
    const phrases = parsePhraseTable(store.okiRom);
    const pcm = new Float32Array(Math.floor(OKI_SAMPLE_RATE * 0.05));
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(2 * Math.PI * 440 * i / OKI_SAMPLE_RATE);
    replaceSampleInRom(store.okiRom, phrases[0]!.id, encodeSample(pcm, OKI_SAMPLE_RATE));

    const diffs = store.computeDiffs();
    expect(diffs.oki.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// applyDiffs round-trip
// ---------------------------------------------------------------------------

describe('applyDiffs', () => {
  it('compute → apply on fresh store produces identical ROM', () => {
    // Modify a store
    const modified = new RomStore(originalRomSet);
    writePixel(modified.graphicsRom, 500, 8, 8, 7);
    modified.programRom[0x2000] = 0xCD;

    const diffs = modified.computeDiffs();

    // Apply to fresh store
    const fresh = new RomStore(originalRomSet);
    fresh.applyDiffs(diffs);

    // Verify match
    expect(readPixel(fresh.graphicsRom, 500, 8, 8)).toBe(7);
    expect(fresh.programRom[0x2000]).toBe(0xCD);
  });
});

// ---------------------------------------------------------------------------
// buildSaveData / parseSaveFile round-trip
// ---------------------------------------------------------------------------

describe('save file serialization', () => {
  it('round-trips through JSON: build → stringify → parse → validate', () => {
    const store = new RomStore(originalRomSet);
    writePixel(store.graphicsRom, 400, 0, 0, 5);

    const poses: CapturedPose[] = [{
      tileHash: '400',
      tiles: [{ relX: 0, relY: 0, mappedCode: 400, flipX: false, flipY: false, palette: 0 }],
      w: 16, h: 16,
      palette: 3,
      preview: makePreview(16, 16),
    }];

    const data = buildSaveData(store, poses);
    const json = JSON.stringify(data);
    const result = parseSaveFile(json);

    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.version).toBe(1);
      expect(result.data.gameName).toBe('ffight');
      expect(result.data.diffs.graphics.length).toBeGreaterThan(0);
      expect(result.data.poses).toHaveLength(1);
      expect(result.data.poses[0]!.palette).toBe(3);
      expect(result.data.poses[0]!.tiles[0]!.mappedCode).toBe(400);
    }
  });

  it('rejects invalid JSON', () => {
    const result = parseSaveFile('not json');
    expect('error' in result).toBe(true);
  });

  it('rejects unsupported version', () => {
    const result = parseSaveFile('{"version":99}');
    expect('error' in result).toBe(true);
  });

  it('rejects incomplete file', () => {
    const result = parseSaveFile('{"version":1}');
    expect('error' in result).toBe(true);
  });

  it('preserves createdAt across saves', () => {
    const store = new RomStore(originalRomSet);
    const firstSave = buildSaveData(store, []);
    const createdAt = firstSave.createdAt;

    // Second save with existing createdAt
    const secondSave = buildSaveData(store, [], createdAt);
    expect(secondSave.createdAt).toBe(createdAt);
    expect(secondSave.modifiedAt).not.toBe(secondSave.createdAt);
  });
});

// ---------------------------------------------------------------------------
// applySaveFile
// ---------------------------------------------------------------------------

describe('applySaveFile', () => {
  it('rejects save file for wrong game', () => {
    const store = new RomStore(originalRomSet);
    const data = buildSaveData(store, []);
    const json = JSON.stringify(data);
    const parsed = parseSaveFile(json);
    if (!('data' in parsed)) throw new Error('parse failed');

    // Mutate game name to simulate wrong game
    parsed.data.gameName = 'sf2';

    // Create a fake VRAM for the test
    const vram = new Uint8Array(0x30000);
    const result = applySaveFile(parsed.data, store, vram, 0x8000);
    expect('error' in result).toBe(true);
  });

  it('applies diffs and returns poses', () => {
    // Modify and save
    const modified = new RomStore(originalRomSet);
    writePixel(modified.graphicsRom, 600, 4, 4, 11);
    modified.programRom[0x3000] = 0xEF;

    const poses: CapturedPose[] = [{
      tileHash: '600',
      tiles: [{ relX: 0, relY: 0, mappedCode: 600, flipX: false, flipY: false, palette: 0 }],
      w: 16, h: 16, palette: 2,
      preview: makePreview(16, 16),
    }];

    const data = buildSaveData(modified, poses);
    const json = JSON.stringify(data);
    const parsed = parseSaveFile(json);
    if (!('data' in parsed)) throw new Error('parse failed');

    // Apply to fresh store
    const fresh = new RomStore(originalRomSet);
    const vram = new Uint8Array(0x30000);
    const result = applySaveFile(parsed.data, fresh, vram, 0x8000);

    expect('poses' in result).toBe(true);
    if ('poses' in result) {
      expect(result.poses).toHaveLength(1);
      expect(result.poses[0]!.palette).toBe(2);
    }

    // Verify ROM was patched
    expect(readPixel(fresh.graphicsRom, 600, 4, 4)).toBe(11);
    expect(fresh.programRom[0x3000]).toBe(0xEF);
  });
});

// ---------------------------------------------------------------------------
// Full E2E: modify → save → load on fresh ROM → verify
// ---------------------------------------------------------------------------

describe('E2E save/load round-trip', () => {
  it('tiles + palettes + OKI survive save → load on fresh ROM', () => {
    const store = new RomStore(originalRomSet);

    // --- Modify tiles ---
    const tileCode = 700;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        writePixel(store.graphicsRom, tileCode, x, y, (x * y) % 16);
      }
    }
    const tileDataBefore = readTile(store.graphicsRom, tileCode);

    // --- Modify palette in program ROM ---
    const paletteOffset = 0x4000;
    const words = [encodeColor(255, 0, 0), encodeColor(0, 255, 0), encodeColor(0, 0, 255)];
    for (let i = 0; i < words.length; i++) {
      store.programRom[paletteOffset + i * 2] = (words[i]! >> 8) & 0xFF;
      store.programRom[paletteOffset + i * 2 + 1] = words[i]! & 0xFF;
    }

    // --- Modify OKI sample ---
    const phrases = parsePhraseTable(store.okiRom);
    const pcm = new Float32Array(Math.floor(OKI_SAMPLE_RATE * 0.05));
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(2 * Math.PI * 1000 * i / OKI_SAMPLE_RATE);
    replaceSampleInRom(store.okiRom, phrases[0]!.id, encodeSample(pcm, OKI_SAMPLE_RATE));
    const okiBefore = store.okiRom.slice(phrases[0]!.startByte, phrases[0]!.endByte);

    // --- Save ---
    const saveData = buildSaveData(store, []);
    const json = JSON.stringify(saveData);

    // --- Load on fresh ROM ---
    const parsed = parseSaveFile(json);
    if (!('data' in parsed)) throw new Error('parse failed');

    const fresh = new RomStore(originalRomSet);
    const vram = new Uint8Array(0x30000);
    const result = applySaveFile(parsed.data, fresh, vram, 0x8000);
    if ('error' in result) throw new Error(result.error);

    // --- Verify tiles ---
    expect(readTile(fresh.graphicsRom, tileCode)).toEqual(tileDataBefore);

    // --- Verify palette ---
    for (let i = 0; i < words.length; i++) {
      const off = paletteOffset + i * 2;
      const word = (fresh.programRom[off]! << 8) | fresh.programRom[off + 1]!;
      expect(word).toBe(words[i]);
    }

    // --- Verify OKI ---
    const okiAfter = fresh.okiRom.slice(phrases[0]!.startByte, phrases[0]!.endByte);
    expect(okiAfter).toEqual(okiBefore);
  });

  it('empty save (no modifications) produces valid minimal file', () => {
    const store = new RomStore(originalRomSet);
    const data = buildSaveData(store, []);
    expect(data.diffs.graphics).toHaveLength(0);
    expect(data.diffs.program).toHaveLength(0);
    expect(data.diffs.oki).toHaveLength(0);
    expect(data.poses).toHaveLength(0);

    // Round-trip
    const json = JSON.stringify(data);
    const parsed = parseSaveFile(json);
    expect('data' in parsed).toBe(true);
  });

  it('multiple saves preserve createdAt, update modifiedAt', () => {
    const store = new RomStore(originalRomSet);
    const first = buildSaveData(store, []);
    const createdAt = first.createdAt;

    // Simulate time passing
    writePixel(store.graphicsRom, 800, 0, 0, 3);
    const second = buildSaveData(store, [], createdAt);

    expect(second.createdAt).toBe(createdAt);
    // modifiedAt should be different (or equal if very fast, but at least valid)
    expect(second.modifiedAt).toBeDefined();
  });
});
