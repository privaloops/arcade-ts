/**
 * Tile Encoder tests — encodeRow, writePixel, readPixel, readTile.
 *
 * Validates that encodeRow is the exact inverse of decodeRow,
 * and that read/write operations on GFX ROM tiles are correct.
 */

import { describe, it, expect } from 'vitest';
import { encodeRow, writePixel, readPixel, readTile } from '../editor/tile-encoder';
import { decodeRow } from '../video/cps1-video';

// ---------------------------------------------------------------------------
// encodeRow — inverse of decodeRow
// ---------------------------------------------------------------------------

describe('encodeRow', () => {
  it('is exact inverse of decodeRow: encode(decode(bytes)) === bytes', () => {
    // Test with various byte patterns
    const patterns: [number, number, number, number][] = [
      [0x00, 0x00, 0x00, 0x00],
      [0xFF, 0xFF, 0xFF, 0xFF],
      [0x80, 0x00, 0x00, 0x00],
      [0xAA, 0x55, 0xF0, 0x0F],
      [0x12, 0x34, 0x56, 0x78],
      [0xDE, 0xAD, 0xBE, 0xEF],
      [0x01, 0x02, 0x04, 0x08],
    ];

    for (const [b0, b1, b2, b3] of patterns) {
      const decoded = new Uint8Array(8);
      decodeRow(b0, b1, b2, b3, decoded, 0);
      const [rb0, rb1, rb2, rb3] = encodeRow(decoded, 0);
      expect([rb0, rb1, rb2, rb3]).toEqual([b0, b1, b2, b3]);
    }
  });

  it('all-zero indices produce [0,0,0,0]', () => {
    const pixels = new Uint8Array(8); // all zeros
    expect(encodeRow(pixels, 0)).toEqual([0, 0, 0, 0]);
  });

  it('all-15 indices produce [0xFF, 0xFF, 0xFF, 0xFF]', () => {
    const pixels = new Uint8Array(8).fill(15);
    expect(encodeRow(pixels, 0)).toEqual([0xFF, 0xFF, 0xFF, 0xFF]);
  });

  it('index 1 at pixel 0 only → b0=0x80, rest=0', () => {
    const pixels = new Uint8Array(8);
    pixels[0] = 1;
    expect(encodeRow(pixels, 0)).toEqual([0x80, 0x00, 0x00, 0x00]);
  });

  it('uses offset parameter correctly', () => {
    const pixels = new Uint8Array(16);
    pixels[8] = 15;
    pixels[9] = 15;
    pixels[10] = 15;
    pixels[11] = 15;
    pixels[12] = 15;
    pixels[13] = 15;
    pixels[14] = 15;
    pixels[15] = 15;
    expect(encodeRow(pixels, 8)).toEqual([0xFF, 0xFF, 0xFF, 0xFF]);
    // Offset 0 should still be all zeros
    expect(encodeRow(pixels, 0)).toEqual([0, 0, 0, 0]);
  });

  it('roundtrip for all 256 possible single-pixel values', () => {
    // For each pixel position and each value 0-15
    for (let pos = 0; pos < 8; pos++) {
      for (let val = 0; val < 16; val++) {
        const pixels = new Uint8Array(8);
        pixels[pos] = val;
        const [b0, b1, b2, b3] = encodeRow(pixels, 0);
        const decoded = new Uint8Array(8);
        decodeRow(b0, b1, b2, b3, decoded, 0);
        expect(decoded[pos]).toBe(val);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// writePixel + readPixel roundtrip
// ---------------------------------------------------------------------------

describe('writePixel / readPixel', () => {
  it('roundtrip: write(5) then read() === 5', () => {
    const gfxRom = new Uint8Array(128 * 2); // 2 tiles
    writePixel(gfxRom, 0, 7, 3, 5);
    expect(readPixel(gfxRom, 0, 7, 3)).toBe(5);
  });

  it('only modifies the target pixel, not neighbors', () => {
    const gfxRom = new Uint8Array(128 * 2);
    // Fill tile 0 with color 3
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        writePixel(gfxRom, 0, x, y, 3);
      }
    }
    // Modify one pixel
    writePixel(gfxRom, 0, 5, 7, 10);

    // Check the modified pixel
    expect(readPixel(gfxRom, 0, 5, 7)).toBe(10);

    // Check neighbors are unchanged
    expect(readPixel(gfxRom, 0, 4, 7)).toBe(3);
    expect(readPixel(gfxRom, 0, 6, 7)).toBe(3);
    expect(readPixel(gfxRom, 0, 5, 6)).toBe(3);
    expect(readPixel(gfxRom, 0, 5, 8)).toBe(3);
  });

  it('works on the right half of the tile (localX >= 8)', () => {
    const gfxRom = new Uint8Array(128 * 2);
    writePixel(gfxRom, 0, 12, 5, 9);
    expect(readPixel(gfxRom, 0, 12, 5)).toBe(9);
    // Left half should be unaffected
    expect(readPixel(gfxRom, 0, 4, 5)).toBe(0);
  });

  it('works on tile 1 (non-zero tileCode)', () => {
    const gfxRom = new Uint8Array(128 * 2);
    writePixel(gfxRom, 1, 0, 0, 14);
    expect(readPixel(gfxRom, 1, 0, 0)).toBe(14);
    // Tile 0 should be unaffected
    expect(readPixel(gfxRom, 0, 0, 0)).toBe(0);
  });

  it('handles all 16 color values', () => {
    const gfxRom = new Uint8Array(128);
    for (let c = 0; c < 16; c++) {
      writePixel(gfxRom, 0, c, 0, c);
    }
    for (let c = 0; c < 16; c++) {
      expect(readPixel(gfxRom, 0, c, 0)).toBe(c);
    }
  });
});

// ---------------------------------------------------------------------------
// readTile
// ---------------------------------------------------------------------------

describe('readTile', () => {
  it('returns 256 values, all in range 0-15', () => {
    const gfxRom = new Uint8Array(128);
    const tile = readTile(gfxRom, 0);
    expect(tile.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(tile[i]).toBeGreaterThanOrEqual(0);
      expect(tile[i]).toBeLessThanOrEqual(15);
    }
  });

  it('reads what writePixel wrote', () => {
    const gfxRom = new Uint8Array(128);
    writePixel(gfxRom, 0, 3, 7, 11);
    writePixel(gfxRom, 0, 15, 0, 4);

    const tile = readTile(gfxRom, 0);
    expect(tile[7 * 16 + 3]).toBe(11);
    expect(tile[0 * 16 + 15]).toBe(4);
  });

  it('is consistent with readPixel for every position', () => {
    const gfxRom = new Uint8Array(128);
    // Write a pattern
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        writePixel(gfxRom, 0, x, y, (x + y) % 16);
      }
    }

    const tile = readTile(gfxRom, 0);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(tile[y * 16 + x]).toBe(readPixel(gfxRom, 0, x, y));
      }
    }
  });
});
