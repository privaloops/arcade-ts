import { describe, it, expect } from 'vitest';
import { TileAllocator, getTileStats, patchTilemapCode, patchTilemapPalette } from '../editor/tile-allocator';

// charSize=8 for simplicity (8 bytes per tile)
const CHAR_SIZE = 8;

function makeGfxRom(tileCount: number, fillPattern?: (tileIndex: number) => number): Uint8Array {
  const rom = new Uint8Array(tileCount * CHAR_SIZE);
  if (fillPattern) {
    for (let t = 0; t < tileCount; t++) {
      const val = fillPattern(t);
      for (let b = 0; b < CHAR_SIZE; b++) {
        rom[t * CHAR_SIZE + b] = val;
      }
    }
  }
  return rom;
}

// Simple reverse map: mapped code = raw code (identity)
function makeIdentityReverseMap(count: number): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < count; i++) map.set(i, i);
  return map;
}

describe('getTileStats', () => {
  it('counts total and free tiles correctly', () => {
    // 4 tiles: tile 0 and 2 are non-empty, tile 1 and 3 are empty (all zeros)
    const rom = makeGfxRom(4, i => (i % 2 === 0 ? 0xAA : 0));
    const stats = getTileStats(rom, CHAR_SIZE);
    expect(stats.total).toBe(4);
    expect(stats.free).toBe(2);
  });

  it('all tiles empty', () => {
    const rom = makeGfxRom(10);
    const stats = getTileStats(rom, CHAR_SIZE);
    expect(stats.total).toBe(10);
    expect(stats.free).toBe(10);
  });

  it('no tiles free', () => {
    const rom = makeGfxRom(5, () => 0xFF);
    const stats = getTileStats(rom, CHAR_SIZE);
    expect(stats.total).toBe(5);
    expect(stats.free).toBe(0);
  });
});

describe('TileAllocator', () => {
  it('reports correct freeCount and totalCount', () => {
    // 8 tiles: tiles 0,2,4,6 non-empty; tiles 1,3,5,7 empty
    const rom = makeGfxRom(8, i => (i % 2 === 0 ? 0xAA : 0));
    const reverseMap = makeIdentityReverseMap(8);
    const allocator = new TileAllocator(rom, CHAR_SIZE, reverseMap);

    expect(allocator.totalCount).toBe(8);
    expect(allocator.freeCount).toBe(4);
  });

  it('allocateAndCopy returns a free slot and copies tile data', () => {
    // Tile 0 = non-empty (source), tiles 1-3 = empty (free)
    const rom = makeGfxRom(4, i => (i === 0 ? 0x42 : 0));
    const reverseMap = makeIdentityReverseMap(4);
    const allocator = new TileAllocator(rom, CHAR_SIZE, reverseMap);

    const result = allocator.allocateAndCopy(0);
    expect(result).not.toBeNull();

    // Verify tile data was copied
    const dstOffset = result!.mapped * CHAR_SIZE;
    for (let b = 0; b < CHAR_SIZE; b++) {
      expect(rom[dstOffset + b]).toBe(0x42);
    }
  });

  it('allocated slots are not returned again', () => {
    const rom = makeGfxRom(4, i => (i === 0 ? 0x42 : 0));
    const reverseMap = makeIdentityReverseMap(4);
    const allocator = new TileAllocator(rom, CHAR_SIZE, reverseMap);

    const initialFree = allocator.freeCount;
    const allocated = new Set<number>();

    for (let i = 0; i < initialFree; i++) {
      const result = allocator.allocateAndCopy(0);
      expect(result).not.toBeNull();
      expect(allocated.has(result!.mapped)).toBe(false);
      allocated.add(result!.mapped);
    }

    expect(allocator.freeCount).toBe(0);
  });

  it('returns null when GFX ROM is full (no free tiles)', () => {
    const rom = makeGfxRom(4, () => 0xFF);
    const reverseMap = makeIdentityReverseMap(4);
    const allocator = new TileAllocator(rom, CHAR_SIZE, reverseMap);

    expect(allocator.freeCount).toBe(0);
    expect(allocator.allocateAndCopy(0)).toBeNull();
  });

  it('only counts tiles that have a reverse mapping as free', () => {
    // All tiles are empty, but only tile 0 and 1 have reverse mappings
    const rom = makeGfxRom(4);
    const reverseMap = new Map<number, number>();
    reverseMap.set(0, 0);
    reverseMap.set(1, 1);
    // tiles 2 and 3 have no reverse mapping

    const allocator = new TileAllocator(rom, CHAR_SIZE, reverseMap);
    expect(allocator.freeCount).toBe(2);
  });

  it('allocateAndCopy returns both mapped and raw codes', () => {
    const rom = makeGfxRom(4, i => (i === 0 ? 0x42 : 0));
    const reverseMap = new Map<number, number>();
    reverseMap.set(0, 100); // mapped 0 → raw 100
    reverseMap.set(1, 200); // mapped 1 → raw 200
    reverseMap.set(2, 300);
    reverseMap.set(3, 400);

    const allocator = new TileAllocator(rom, CHAR_SIZE, reverseMap);
    const result = allocator.allocateAndCopy(0);
    expect(result).not.toBeNull();
    // The raw code should come from the reverse map
    expect(reverseMap.get(result!.mapped)).toBe(result!.raw);
  });
});

describe('tilemap patching', () => {
  it('patchTilemapCode writes raw code at correct offset', () => {
    const vram = new Uint8Array(8);
    patchTilemapCode(vram, 0, 0x1234);
    expect(vram[0]).toBe(0x12);
    expect(vram[1]).toBe(0x34);
  });

  it('patchTilemapPalette updates palette bits without affecting other attribs', () => {
    const vram = new Uint8Array(8);
    // Set some existing attributes at offset 2
    vram[2] = 0x80;
    vram[3] = 0x60; // existing: 0x8060, palette bits = 0x00

    patchTilemapPalette(vram, 0, 0x1F); // max palette = 31
    expect(vram[2]).toBe(0x80);
    expect(vram[3]).toBe(0x7F); // 0x60 & 0xE0 | 0x1F = 0x7F
  });

  it('patchTilemapPalette masks to 5 bits', () => {
    const vram = new Uint8Array(8);
    vram[2] = 0x00;
    vram[3] = 0x00;

    patchTilemapPalette(vram, 0, 0x0A);
    expect(vram[3]).toBe(0x0A);
  });
});
