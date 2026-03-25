/**
 * Tile Reference Counter tests.
 */

import { describe, it, expect } from 'vitest';
import { findTileReferences, findFreeTileSlot, duplicateTile } from '../editor/tile-refs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an identity mapper (tile code N = GFX ROM offset N * 128) */
function makeMapper(totalTiles: number) {
  const mapperTable = [{ type: 0x0F, start: 0, end: totalTiles - 1, bank: 0 }];
  const bankSizes = [totalTiles, 0, 0, 0];
  const bankBases = [0, totalTiles, totalTiles, totalTiles];
  return { mapperTable, bankSizes, bankBases };
}

/** Write a sprite entry to an OBJ buffer */
function writeSprite(
  objBuf: Uint8Array,
  index: number,
  tileCode: number,
  opts?: { nx?: number; ny?: number; endMarker?: boolean },
) {
  const off = index * 8;
  // X, Y don't matter for ref counting
  objBuf[off] = 0; objBuf[off + 1] = 100;
  objBuf[off + 2] = 0; objBuf[off + 3] = 100;
  objBuf[off + 4] = (tileCode >> 8) & 0xFF;
  objBuf[off + 5] = tileCode & 0xFF;

  if (opts?.endMarker) {
    objBuf[off + 6] = 0xFF;
    objBuf[off + 7] = 0x00;
    return;
  }

  let colour = 0; // palette 0, no flip
  const nx = (opts?.nx ?? 1) - 1;
  const ny = (opts?.ny ?? 1) - 1;
  colour |= (nx << 8) | (ny << 12);
  objBuf[off + 6] = (colour >> 8) & 0xFF;
  objBuf[off + 7] = colour & 0xFF;
}

// ---------------------------------------------------------------------------
// findTileReferences
// ---------------------------------------------------------------------------

describe('findTileReferences', () => {
  it('returns 0 refs for an unused tile code', () => {
    const objBuf = new Uint8Array(0x0800);
    const vram = new Uint8Array(0x30000);
    const cpsaRegs = new Uint8Array(0x40);
    const { mapperTable, bankSizes, bankBases } = makeMapper(0x200);

    writeSprite(objBuf, 0, 0x10);
    writeSprite(objBuf, 1, 0, { endMarker: true });

    const refs = findTileReferences(0x99, objBuf, vram, cpsaRegs, mapperTable, bankSizes, bankBases);
    expect(refs.length).toBe(0);
  });

  it('counts sprite OBJ references correctly', () => {
    const objBuf = new Uint8Array(0x0800);
    const vram = new Uint8Array(0x30000);
    const cpsaRegs = new Uint8Array(0x40);
    const { mapperTable, bankSizes, bankBases } = makeMapper(0x200);

    // Three sprites referencing tile 0x10
    writeSprite(objBuf, 0, 0x10);
    writeSprite(objBuf, 1, 0x10);
    writeSprite(objBuf, 2, 0x10);
    writeSprite(objBuf, 3, 0x20); // different tile
    writeSprite(objBuf, 4, 0, { endMarker: true });

    const refs = findTileReferences(0x10, objBuf, vram, cpsaRegs, mapperTable, bankSizes, bankBases);
    expect(refs.length).toBe(3);
    expect(refs.every(r => r.source === 'obj-table')).toBe(true);
  });

  it('counts multi-tile sprite sub-tiles', () => {
    const objBuf = new Uint8Array(0x0800);
    const vram = new Uint8Array(0x30000);
    const cpsaRegs = new Uint8Array(0x40);
    const { mapperTable, bankSizes, bankBases } = makeMapper(0x200);

    // 2x2 sprite with base code 0x10 → sub-tiles: 0x10, 0x11, 0x20, 0x21
    writeSprite(objBuf, 0, 0x10, { nx: 2, ny: 2 });
    writeSprite(objBuf, 1, 0, { endMarker: true });

    // Check sub-tile 0x11 is referenced
    const refs = findTileReferences(0x11, objBuf, vram, cpsaRegs, mapperTable, bankSizes, bankBases);
    expect(refs.length).toBe(1);
    expect(refs[0]!.source).toBe('obj-table');
  });
});

// ---------------------------------------------------------------------------
// findFreeTileSlot
// ---------------------------------------------------------------------------

describe('findFreeTileSlot', () => {
  it('finds first all-zero tile', () => {
    const gfxRom = new Uint8Array(128 * 10);
    // Fill tiles 0-4 with non-zero data
    for (let i = 0; i < 5 * 128; i++) gfxRom[i] = 0xFF;

    expect(findFreeTileSlot(gfxRom, 128, 0)).toBe(5);
  });

  it('respects startFrom parameter', () => {
    const gfxRom = new Uint8Array(128 * 10);
    // Tile 0 is free, but startFrom=3 → skip it
    for (let i = 128; i < 5 * 128; i++) gfxRom[i] = 0xFF;

    expect(findFreeTileSlot(gfxRom, 128, 3)).toBe(5);
  });

  it('returns -1 when ROM is full', () => {
    const gfxRom = new Uint8Array(128 * 4).fill(0xFF);
    expect(findFreeTileSlot(gfxRom, 128, 0)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// duplicateTile
// ---------------------------------------------------------------------------

describe('duplicateTile', () => {
  it('copies bytes to new slot', () => {
    const gfxRom = new Uint8Array(128 * 0x200);
    // Fill tile 0x10 with pattern
    const base = 0x10 * 128;
    for (let i = 0; i < 128; i++) gfxRom[base + i] = (i + 1) & 0xFF;

    const newCode = duplicateTile(gfxRom, 0x10);
    expect(newCode).toBeGreaterThanOrEqual(0x100); // starts from 0x100
    expect(newCode).not.toBe(-1);

    // Verify bytes were copied
    const newBase = newCode * 128;
    for (let i = 0; i < 128; i++) {
      expect(gfxRom[newBase + i]).toBe((i + 1) & 0xFF);
    }
  });

  it('does not affect the original tile', () => {
    const gfxRom = new Uint8Array(128 * 0x200);
    const base = 0x10 * 128;
    for (let i = 0; i < 128; i++) gfxRom[base + i] = 0xAB;

    const newCode = duplicateTile(gfxRom, 0x10);
    expect(newCode).not.toBe(-1);

    // Modify the copy
    const newBase = newCode * 128;
    gfxRom[newBase] = 0x00;

    // Original should be unchanged
    expect(gfxRom[base]).toBe(0xAB);
  });

  it('returns -1 if no free slot available', () => {
    // Small ROM, all filled
    const gfxRom = new Uint8Array(128 * 0x101).fill(0xFF);
    expect(duplicateTile(gfxRom, 0x10)).toBe(-1);
  });
});
