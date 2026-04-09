/**
 * Neo-Geo Tile Encoder/Decoder
 *
 * IMPORTANT: Neo-Geo does NOT use planar format like CPS1.
 * Both C-ROM and S-ROM use nibble-packed format: each nibble = one 4-bit pixel.
 *
 * C-ROM (sprites): 16x16, 4bpp, 128 bytes/tile.
 *   After load16_byte interleaving: byte[0]=odd, byte[1]=even, byte[2]=odd, byte[3]=even
 *   MAME xoffset = {8, 12, 0, 4, 24, 28, 16, 20}
 *   → pixel 0 = even[0] low nib, pixel 1 = even[0] high nib,
 *     pixel 2 = odd[0] low nib,  pixel 3 = odd[0] high nib,
 *     pixel 4 = even[1] low nib, pixel 5 = even[1] high nib,
 *     pixel 6 = odd[1] low nib,  pixel 7 = odd[1] high nib
 *
 * S-ROM (fix layer): 8x8, 4bpp, 32 bytes/tile.
 *   MAME xoffset = {16, 20, 24, 28, 0, 4, 8, 12}
 *   → pixel 0 = byte[2] low nib, pixel 1 = byte[2] high nib,
 *     pixel 2 = byte[3] low nib, pixel 3 = byte[3] high nib,
 *     pixel 4 = byte[0] low nib, pixel 5 = byte[0] high nib,
 *     pixel 6 = byte[1] low nib, pixel 7 = byte[1] high nib
 *
 * Transparent pen = index 0 (NOT 15 like CPS1).
 */

import { NGO_TILE_BYTES, NGO_FIX_TILE_BYTES } from '../neogeo-constants';

// ---------------------------------------------------------------------------
// C-ROM (sprite tiles, 16x16)
// ---------------------------------------------------------------------------

/**
 * Decode a row of 8 pixels from an interleaved C-ROM tile (4 bytes → 8 pixels).
 * After load16_byte interleaving: [odd0, even0, odd1, even1]
 * Pixel order from MAME: even0_lo, even0_hi, odd0_lo, odd0_hi, even1_lo, even1_hi, odd1_lo, odd1_hi
 */
export function decodeNeoGeoRow(
  rom: Uint8Array,
  offset: number,
  out: Uint8Array,
  outOffset: number,
): void {
  const odd0  = rom[offset]!;
  const even0 = rom[offset + 1]!;
  const odd1  = rom[offset + 2]!;
  const even1 = rom[offset + 3]!;

  out[outOffset]     = even0 & 0x0F;
  out[outOffset + 1] = (even0 >> 4) & 0x0F;
  out[outOffset + 2] = odd0 & 0x0F;
  out[outOffset + 3] = (odd0 >> 4) & 0x0F;
  out[outOffset + 4] = even1 & 0x0F;
  out[outOffset + 5] = (even1 >> 4) & 0x0F;
  out[outOffset + 6] = odd1 & 0x0F;
  out[outOffset + 7] = (odd1 >> 4) & 0x0F;
}

/**
 * Encode a row of 8 pixels back to interleaved C-ROM format.
 */
export function encodeNeoGeoRow(
  pixels: Uint8Array,
  offset: number,
): [number, number, number, number] {
  const odd0  = (pixels[offset + 2]! & 0x0F) | ((pixels[offset + 3]! & 0x0F) << 4);
  const even0 = (pixels[offset]! & 0x0F)     | ((pixels[offset + 1]! & 0x0F) << 4);
  const odd1  = (pixels[offset + 6]! & 0x0F) | ((pixels[offset + 7]! & 0x0F) << 4);
  const even1 = (pixels[offset + 4]! & 0x0F) | ((pixels[offset + 5]! & 0x0F) << 4);
  return [odd0, even0, odd1, even1];
}

/**
 * Read a full 16x16 tile from C-ROM as palette indices (256 bytes output).
 * Each row = 8 bytes (4 bytes left half + 4 bytes right half), 16 rows = 128 bytes.
 */
export function readNeoGeoTile(
  rom: Uint8Array,
  tileCode: number,
): Uint8Array {
  const pixels = new Uint8Array(256); // 16x16
  const tileOffset = tileCode * NGO_TILE_BYTES;

  for (let y = 0; y < 16; y++) {
    const rowOffset = tileOffset + y * 8;
    decodeNeoGeoRow(rom, rowOffset, pixels, y * 16);       // left 8 pixels
    decodeNeoGeoRow(rom, rowOffset + 4, pixels, y * 16 + 8); // right 8 pixels
  }

  return pixels;
}

/**
 * Write a single pixel in a 16x16 C-ROM tile.
 */
export function writeNeoGeoPixel(
  rom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
  colorIndex: number,
): void {
  const tileOffset = tileCode * NGO_TILE_BYTES;
  const groupBase = tileOffset + localY * 8 + ((localX >> 3) * 4);

  // Decode the 8 pixels of this group
  const pixels = new Uint8Array(8);
  decodeNeoGeoRow(rom, groupBase, pixels, 0);

  // Modify target pixel
  pixels[localX & 7] = colorIndex & 0x0F;

  // Re-encode and write back
  const [b0, b1, b2, b3] = encodeNeoGeoRow(pixels, 0);
  rom[groupBase] = b0;
  rom[groupBase + 1] = b1;
  rom[groupBase + 2] = b2;
  rom[groupBase + 3] = b3;
}

// ---------------------------------------------------------------------------
// S-ROM (fix layer tiles, 8x8)
// ---------------------------------------------------------------------------

/**
 * Decode a row of 8 pixels from an S-ROM fix tile (4 bytes → 8 pixels).
 * MAME xoffset = {16, 20, 24, 28, 0, 4, 8, 12}
 * → bytes 2-3 contain pixels 0-3, bytes 0-1 contain pixels 4-7
 */
export function decodeFixRow(
  rom: Uint8Array,
  offset: number,
  out: Uint8Array,
  outOffset: number,
): void {
  const b0 = rom[offset]!;
  const b1 = rom[offset + 1]!;
  const b2 = rom[offset + 2]!;
  const b3 = rom[offset + 3]!;

  out[outOffset]     = b2 & 0x0F;
  out[outOffset + 1] = (b2 >> 4) & 0x0F;
  out[outOffset + 2] = b3 & 0x0F;
  out[outOffset + 3] = (b3 >> 4) & 0x0F;
  out[outOffset + 4] = b0 & 0x0F;
  out[outOffset + 5] = (b0 >> 4) & 0x0F;
  out[outOffset + 6] = b1 & 0x0F;
  out[outOffset + 7] = (b1 >> 4) & 0x0F;
}

/**
 * Read a full 8x8 fix tile as palette indices (64 bytes output).
 */
export function readFixTile(
  rom: Uint8Array,
  tileCode: number,
): Uint8Array {
  const pixels = new Uint8Array(64);
  const offset = tileCode * NGO_FIX_TILE_BYTES;

  for (let y = 0; y < 8; y++) {
    decodeFixRow(rom, offset + y * 4, pixels, y * 8);
  }

  return pixels;
}
