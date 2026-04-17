/**
 * Aseprite Import Integration Test — validates that importing .aseprite files
 * correctly writes tiles to the GFX ROM.
 *
 * Uses real ffight.zip ROM + real .aseprite fixture files exported from Sprixe.
 * Tests both scroll tilemap import and sprite import.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock DOM-dependent modules
vi.mock('../ui/toast', () => ({ showToast: () => {} }));
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { loadRomFromZip, type RomSet } from '@sprixe/engine/memory/rom-loader';
import { readAseprite } from '../editor/aseprite-reader';
import { importScrollTilemap, type ScrollManifest, type SpriteManifest, type ManifestTileRef } from '../editor/aseprite-io';
import { readTile, readPixel, writePixel } from '../editor/tile-encoder';
import { CHAR_SIZE_16 } from '@sprixe/engine/constants';

// ---------------------------------------------------------------------------
// ROM loading (same as rom-roundtrip.test.ts)
// ---------------------------------------------------------------------------

const ROM_URL = 'https://archive.org/download/mame-0.260-roms-non-merged/MAME%200.260%20ROMs%20%28non-merged%29/MAME%200.260%20ROMs%20%28non-merged%29/ffight.zip';
const CACHE_DIR = resolve(__dirname, '../../.rom-cache');
const CACHE_PATH = resolve(CACHE_DIR, 'ffight.zip');
const LOCAL_PATH = resolve(__dirname, '../../public/roms/ffight.zip');

const SCROLL_ASE_PATH = resolve(__dirname, '../../tests/fixtures/ffight_scroll2_pal66_31tiles.aseprite');
const SPRITE_ASE_PATH = resolve(__dirname, '../../tests/fixtures/unknown_palette_15_3poses.aseprite');

async function getRomBuffer(): Promise<ArrayBuffer> {
  if (existsSync(LOCAL_PATH)) {
    return readFileSync(LOCAL_PATH).buffer as ArrayBuffer;
  }
  if (existsSync(CACHE_PATH)) {
    return readFileSync(CACHE_PATH).buffer as ArrayBuffer;
  }
  const res = await fetch(ROM_URL);
  if (!res.ok) throw new Error(`Failed to download ROM: ${res.status}`);
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
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal emulator mock with just what importScrollTilemap needs. */
function createEmulatorMock(romSet: RomSet) {
  const vram = new Uint8Array(0x30000);
  const cpsaRegs = new Uint8Array(0x40);
  return {
    getVideo: () => ({
      getPaletteBase: () => 0,
      setPaletteOverride: () => {},
    }),
    getBusBuffers: () => ({ vram, cpsaRegs }),
    rerender: () => {},
    getRomStore: () => null,
    getWorkRam: () => new Uint8Array(0x10000),
  };
}

/** Snapshot specific tiles from the GFX ROM. */
function snapshotTiles(gfxRom: Uint8Array, tileCodes: number[], charSize = CHAR_SIZE_16): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>();
  for (const code of tileCodes) {
    const pixels = readTile(gfxRom, code);
    map.set(code, new Uint8Array(pixels));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Scroll tilemap import
// ---------------------------------------------------------------------------

describe('Aseprite scroll tilemap import', () => {
  it('after import, GFX ROM tiles match Aseprite tileset pixel-for-pixel', () => {
    const gfxRom = new Uint8Array(originalRomSet.graphicsRom);

    const aseBuffer = readFileSync(SCROLL_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);

    expect(ase.manifest).not.toBeNull();
    expect(ase.manifest!.type).toBe('scroll_tilemap');

    const manifest = ase.manifest! as unknown as ScrollManifest;
    const tilesetEntries = manifest.tileset;
    const aseTileset = ase.tilesets[0]!;
    expect(tilesetEntries.length).toBe(31);

    // Import the .aseprite into the GFX ROM
    const emulatorMock = createEmulatorMock(originalRomSet);
    importScrollTilemap(emulatorMock as any, ase, manifest, gfxRom);

    // For each tile in the manifest, read back from GFX ROM and compare
    // with the Aseprite tileset pixels (should be identical)
    const { tileW, tileH } = manifest;
    const charSize = (tileW * tileH) / 2; // 4bpp
    let tilesVerified = 0;

    for (const entry of tilesetEntries) {
      const aseTilePixels = aseTileset.tiles[entry.idx];
      if (!aseTilePixels) continue;

      const romPixels = readTile(gfxRom, entry.tileCode, tileW, tileH, charSize);

      for (let y = 0; y < tileH; y++) {
        for (let x = 0; x < tileW; x++) {
          const expected = aseTilePixels[y * tileW + x]!;
          const actual = romPixels[y * tileW + x]!;
          if (expected !== actual) {
            throw new Error(
              `Tile ${entry.tileCode} pixel (${x},${y}): expected ${expected}, got ${actual}`,
            );
          }
        }
      }
      tilesVerified++;
    }

    expect(tilesVerified).toBe(31);
  });

  it('does not modify tiles outside the manifest', () => {
    const gfxRom = new Uint8Array(originalRomSet.graphicsRom);

    const aseBuffer = readFileSync(SCROLL_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);
    const manifest = ase.manifest! as unknown as ScrollManifest;
    const tileset = manifest.tileset;
    const importedCodes = new Set(tileset.map(t => t.tileCode));

    // Pick some tiles that are NOT in the manifest
    const untouchedCodes = [100, 200, 500, 1000, 5000].filter(c => !importedCodes.has(c));
    const before = snapshotTiles(gfxRom, untouchedCodes);

    const emulatorMock = createEmulatorMock(originalRomSet);
    importScrollTilemap(emulatorMock as any, ase, manifest, gfxRom);

    const after = snapshotTiles(gfxRom, untouchedCodes);

    for (const code of untouchedCodes) {
      expect(after.get(code)).toEqual(before.get(code));
    }
  });

  it('manifest grid dimensions match expectations', () => {
    const aseBuffer = readFileSync(SCROLL_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);
    const manifest = ase.manifest! as unknown as ScrollManifest;

    expect(manifest.gridCols).toBe(6);
    expect(manifest.gridRows).toBe(10);
    expect(manifest.tileW).toBe(16);
    expect(manifest.tileH).toBe(16);
    expect(manifest.layerId).toBe(2); // Scroll 2
  });
});

// ---------------------------------------------------------------------------
// Sprite import
// ---------------------------------------------------------------------------

describe('Aseprite sprite import', () => {
  it('reads sprite manifest with 3 poses', () => {
    const aseBuffer = readFileSync(SPRITE_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);

    expect(ase.manifest).not.toBeNull();
    const manifest = ase.manifest! as unknown as SpriteManifest;
    expect(manifest.palette).toBe(15);
    expect(manifest.character).toBe('palette_15');

    const frames = manifest.frames;
    expect(frames.length).toBe(3);
    expect(frames[0]!.id).toBe('pose_0');
    expect(frames[1]!.id).toBe('pose_1');
    expect(frames[2]!.id).toBe('pose_2');
  });

  it('pose 0 has 40 tiles, pose 1 has 8, pose 2 has 16', () => {
    const aseBuffer = readFileSync(SPRITE_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);
    const manifest = ase.manifest! as unknown as SpriteManifest;

    expect(manifest.frames[0]!.tiles.length).toBe(40);
    expect(manifest.frames[1]!.tiles.length).toBe(8);
    expect(manifest.frames[2]!.tiles.length).toBe(16);
  });

  it('sprite pixel data has correct dimensions per frame', () => {
    const aseBuffer = readFileSync(SPRITE_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);

    expect(ase.width).toBe(80);
    expect(ase.height).toBe(128);
    expect(ase.numFrames).toBe(3);

    for (const frame of ase.frames) {
      expect(frame.pixels).not.toBeNull();
      expect(frame.pixels!.length).toBe(80 * 128);
    }
  });

  it('sprite import writes modified pixels — ROM differs from original', () => {
    const gfxRom = new Uint8Array(originalRomSet.graphicsRom);

    const aseBuffer = readFileSync(SPRITE_ASE_PATH);
    const ase = readAseprite(aseBuffer.buffer as ArrayBuffer);
    const manifest = ase.manifest! as unknown as SpriteManifest;
    const frame0 = manifest.frames[0]!;

    // Collect unique tile codes from frame 0
    const tileCodes = new Set<number>();
    for (const t of frame0.tiles) {
      tileCodes.add(Math.floor(parseInt(t.address, 16) / CHAR_SIZE_16));
    }

    // Snapshot before
    const before = snapshotTiles(gfxRom, [...tileCodes]);

    // Write frame 0 tiles (same logic as importAsepriteFile)
    const pixels = ase.frames[0]!.pixels!;
    for (const tileInfo of frame0.tiles) {
      const tileCode = Math.floor(parseInt(tileInfo.address, 16) / CHAR_SIZE_16);
      for (let ty = 0; ty < 16; ty++) {
        for (let tx = 0; tx < 16; tx++) {
          const srcX = tileInfo.flipX ? 15 - tx : tx;
          const srcY = tileInfo.flipY ? 15 - ty : ty;
          const frameX = tileInfo.x + tx;
          const frameY = tileInfo.y + ty;
          if (frameX >= ase.width || frameY >= ase.height) continue;
          writePixel(gfxRom, tileCode, srcX, srcY, pixels[frameY * ase.width + frameX]!);
        }
      }
    }

    // The .aseprite was hand-modified (gribouillé), so at least some tiles
    // must differ from the original ROM
    const after = snapshotTiles(gfxRom, [...tileCodes]);
    let tilesChanged = 0;
    for (const code of tileCodes) {
      const beforePixels = before.get(code)!;
      const afterPixels = after.get(code)!;
      expect(afterPixels.length).toBe(256);
      let differs = false;
      for (let i = 0; i < 256; i++) {
        if (beforePixels[i] !== afterPixels[i]) { differs = true; break; }
      }
      if (differs) tilesChanged++;
    }

    // Expect at least 1 tile to have changed (aseprite was modified)
    expect(tilesChanged).toBeGreaterThan(0);
  });
});
