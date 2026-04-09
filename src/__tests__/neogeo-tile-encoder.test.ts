import { describe, it, expect } from 'vitest';
import {
  decodeNeoGeoRow,
  encodeNeoGeoRow,
  readNeoGeoTile,
  writeNeoGeoPixel,
  decodeFixRow,
  readFixTile,
} from '../editor/neogeo-tile-encoder';
import { NGO_TILE_BYTES, NGO_FIX_TILE_BYTES } from '../neogeo-constants';

describe('Neo-Geo Tile Encoder (nibble-packed)', () => {
  describe('C-ROM row decode/encode roundtrip', () => {
    it('decodes nibble-packed pixels correctly', () => {
      // After interleaving: [odd0, even0, odd1, even1]
      // Pixel order: even0_lo, even0_hi, odd0_lo, odd0_hi, even1_lo, even1_hi, odd1_lo, odd1_hi
      const rom = new Uint8Array([
        0x32, // odd0:  low=2, high=3 → pixels 2,3
        0x10, // even0: low=0, high=1 → pixels 0,1
        0x76, // odd1:  low=6, high=7 → pixels 6,7
        0x54, // even1: low=4, high=5 → pixels 4,5
      ]);
      const out = new Uint8Array(8);
      decodeNeoGeoRow(rom, 0, out, 0);
      // pixel 0 = even0 & 0x0F = 0, pixel 1 = even0 >> 4 = 1, etc.
      expect(Array.from(out)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('roundtrips all 16 color indices', () => {
      const pixels = new Uint8Array([8, 9, 10, 11, 12, 13, 14, 15]);
      const [b0, b1, b2, b3] = encodeNeoGeoRow(pixels, 0);

      const rom = new Uint8Array([b0, b1, b2, b3]);
      const decoded = new Uint8Array(8);
      decodeNeoGeoRow(rom, 0, decoded, 0);
      expect(Array.from(decoded)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    });

    it('roundtrips all-zero row (transparent)', () => {
      const pixels = new Uint8Array(8);
      const [b0, b1, b2, b3] = encodeNeoGeoRow(pixels, 0);
      expect(b0).toBe(0);
      expect(b1).toBe(0);
      expect(b2).toBe(0);
      expect(b3).toBe(0);
    });

    it('roundtrips arbitrary pixel values', () => {
      const pixels = new Uint8Array([3, 7, 1, 15, 0, 12, 5, 9]);
      const encoded = encodeNeoGeoRow(pixels, 0);
      const rom = new Uint8Array(encoded);
      const decoded = new Uint8Array(8);
      decodeNeoGeoRow(rom, 0, decoded, 0);
      expect(Array.from(decoded)).toEqual([3, 7, 1, 15, 0, 12, 5, 9]);
    });
  });

  describe('Full 16x16 tile', () => {
    it('reads and writes back a tile correctly', () => {
      const rom = new Uint8Array(NGO_TILE_BYTES * 2);

      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          writeNeoGeoPixel(rom, 0, x, y, (x + y) & 0x0F);
        }
      }

      const pixels = readNeoGeoTile(rom, 0);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          expect(pixels[y * 16 + x]).toBe((x + y) & 0x0F);
        }
      }
    });

    it('tile 1 is independent of tile 0', () => {
      const rom = new Uint8Array(NGO_TILE_BYTES * 2);
      writeNeoGeoPixel(rom, 0, 0, 0, 5);
      writeNeoGeoPixel(rom, 1, 0, 0, 10);

      const tile0 = readNeoGeoTile(rom, 0);
      const tile1 = readNeoGeoTile(rom, 1);
      expect(tile0[0]).toBe(5);
      expect(tile1[0]).toBe(10);
    });

    it('transparent pen is index 0', () => {
      const rom = new Uint8Array(NGO_TILE_BYTES);
      const pixels = readNeoGeoTile(rom, 0);
      expect(pixels[0]).toBe(0);
      expect(pixels[255]).toBe(0);
    });
  });

  describe('Fix layer (S-ROM, nibble-packed)', () => {
    it('decodes fix row with known values', () => {
      // xoffset = {16, 20, 24, 28, 0, 4, 8, 12}
      // pixels 0-3 from bytes 2-3, pixels 4-7 from bytes 0-1
      const rom = new Uint8Array([
        0x54, // b0: low=4, high=5 → pixels 4,5
        0x76, // b1: low=6, high=7 → pixels 6,7
        0x10, // b2: low=0, high=1 → pixels 0,1
        0x32, // b3: low=2, high=3 → pixels 2,3
      ]);
      const out = new Uint8Array(8);
      decodeFixRow(rom, 0, out, 0);
      expect(Array.from(out)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('reads full 8x8 fix tile', () => {
      const rom = new Uint8Array(NGO_FIX_TILE_BYTES);
      // Fill all pixels with color 5: low nibble=5, high nibble=5 → 0x55
      for (let y = 0; y < 8; y++) {
        rom[y * 4 + 0] = 0x55; // pixels 4,5
        rom[y * 4 + 1] = 0x55; // pixels 6,7
        rom[y * 4 + 2] = 0x55; // pixels 0,1
        rom[y * 4 + 3] = 0x55; // pixels 2,3
      }
      const pixels = readFixTile(rom, 0);
      for (let i = 0; i < 64; i++) {
        expect(pixels[i]).toBe(5);
      }
    });
  });
});
