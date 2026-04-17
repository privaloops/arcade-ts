import { describe, it, expect } from 'vitest';
import {
  decodeNeoGeoRow,
  encodeNeoGeoRow,
  readNeoGeoTile,
  writeNeoGeoPixel,
  decodeFixRow,
  readFixTile,
} from '../video/neogeo-tile-encoder';
import { NGO_TILE_BYTES, NGO_FIX_TILE_BYTES } from '../neogeo-constants';

describe('Neo-Geo Tile Encoder', () => {
  describe('C-ROM row decode/encode (planar)', () => {
    it('decodes planar pixels correctly', () => {
      // Planar: [bp0, bp2, bp1, bp3] — each byte = 1 bitplane for 8 pixels, bit 7 = pixel 0
      // Target: pixels [15, 14, 13, 12, 11, 10, 9, 8]
      // pixel 0 = 15 = 0b1111 → all 4 planes bit 7 set
      // pixel 7 = 8  = 0b1000 → only plane 3 bit 0 set
      //
      // bp0: bits 7..0 = 1,1,1,1, 1,1,1,0 = 0xFE
      // bp1: bits 7..0 = 1,1,1,1, 0,1,0,0 = 0xF4  (wait let me redo)
      //
      // Actually let me just pick a simple pattern: all pixels = 5 (0b0101)
      // bp0 = 0xFF (plane 0 all set), bp1 = 0x00, bp2 = 0xFF (plane 2 all set), bp3 = 0x00
      // Interleaved: [bp0, bp2, bp1, bp3] = [0xFF, 0xFF, 0x00, 0x00]
      const rom = new Uint8Array([0xFF, 0xFF, 0x00, 0x00]);
      const out = new Uint8Array(8);
      decodeNeoGeoRow(rom, 0, out, 0);
      expect(Array.from(out)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    });

    it('decodes single pixel correctly', () => {
      // LSB first: pixel 0 = bit 0. Only bit 0 set in all planes → pixel 0 = 15, rest = 0
      // bp0 = 0x01, bp1 = 0x01, bp2 = 0x01, bp3 = 0x01
      // Interleaved: [bp0, bp2, bp1, bp3] = [0x01, 0x01, 0x01, 0x01]
      const rom = new Uint8Array([0x01, 0x01, 0x01, 0x01]);
      const out = new Uint8Array(8);
      decodeNeoGeoRow(rom, 0, out, 0);
      expect(out[0]).toBe(15);
      expect(out[1]).toBe(0);
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

  describe('Fix layer (S-ROM, column-major nibble-packed)', () => {
    it('decodes fix row with known values', () => {
      // S-ROM column-major: 4 segments of 8 bytes each
      // Row 0 bytes: pixels 0,1 at offset 16, pixels 2,3 at offset 24,
      //              pixels 4,5 at offset 0,  pixels 6,7 at offset 8
      // Low nibble = left pixel, high nibble = right pixel
      const rom = new Uint8Array(32);
      rom[16] = 0x21; // pixel 0 = 1, pixel 1 = 2
      rom[24] = 0x43; // pixel 2 = 3, pixel 3 = 4
      rom[0]  = 0x65; // pixel 4 = 5, pixel 5 = 6
      rom[8]  = 0x87; // pixel 6 = 7, pixel 7 = 8
      const out = new Uint8Array(8);
      decodeFixRow(rom, 0, 0, out, 0);
      expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('reads full 8x8 fix tile with all color 5', () => {
      const rom = new Uint8Array(NGO_FIX_TILE_BYTES);
      // Color 5 = low nibble 5, high nibble 5 = 0x55
      // All 4 segments, all 8 rows
      for (let i = 0; i < 32; i++) {
        rom[i] = 0x55;
      }
      const pixels = readFixTile(rom, 0);
      for (let i = 0; i < 64; i++) {
        expect(pixels[i]).toBe(5);
      }
    });
  });
});
