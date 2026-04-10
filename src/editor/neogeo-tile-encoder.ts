/**
 * Neo-Geo Tile Encoder/Decoder
 *
 * IMPORTANT: Neo-Geo uses PLANAR format (not nibble-packed like the old code assumed).
 *
 * C-ROM (sprites): 16x16, 4bpp, 128 bytes/tile.
 *   After load16_byte interleaving: [C1_0, C2_0, C1_1, C2_1] per 4-byte group.
 *   C1 provides bitplanes 0,1: low nibble = plane 0, high nibble = plane 1.
 *   C2 provides bitplanes 2,3: low nibble = plane 2, high nibble = plane 3.
 *   Each C1/C2 pair decodes 4 pixels. Bit order: MSB first (bit 3 → pixel 0).
 *   Reference: GnGeo convert_tile, FBNeo NeoDecodeGfx.
 *
 * S-ROM (fix layer): 8x8, 4bpp, 32 bytes/tile.
 *   Pure planar: byte 0 = plane 0, byte 1 = plane 1, byte 2 = plane 2, byte 3 = plane 3.
 *   MAME charlayout: planes {0,8,16,24}, xoffsets {3,2,1,0,7,6,5,4}.
 *   Pixels 0-3 from bits 3,2,1,0 (low nibble, MSB first).
 *   Pixels 4-7 from bits 7,6,5,4 (high nibble, MSB first).
 *
 * Transparent pen = index 0 (NOT 15 like CPS1).
 */

import { NGO_TILE_BYTES, NGO_FIX_TILE_BYTES } from '../neogeo-constants';

// ---------------------------------------------------------------------------
// C-ROM (sprite tiles, 16x16)
// ---------------------------------------------------------------------------

/**
 * Decode a row of 8 pixels from an interleaved C-ROM tile (4 bytes → 8 pixels).
 * C-ROM uses PLANAR format: each byte = 1 bitplane for 8 pixels, bit 7 = pixel 0.
 * After load16_byte interleaving: [C1_first, C2_first, C1_second, C2_second]
 *   byte[0] = bitplane 0, byte[1] = bitplane 2, byte[2] = bitplane 1, byte[3] = bitplane 3
 * Ref: wiki.neogeodev.org/Sprite_graphics_format, FBNeo NeoDecodeSprites.
 */
export function decodeNeoGeoRow(
  rom: Uint8Array,
  offset: number,
  out: Uint8Array,
  outOffset: number,
): void {
  const bp0 = rom[offset]!;      // bitplane 0 (C1 first byte)
  const bp2 = rom[offset + 1]!;  // bitplane 2 (C2 first byte)
  const bp1 = rom[offset + 2]!;  // bitplane 1 (C1 second byte)
  const bp3 = rom[offset + 3]!;  // bitplane 3 (C2 second byte)

  // LSB first: bit 0 = pixel 0 (matches our load16_byte interleave)
  for (let x = 0; x < 8; x++) {
    out[outOffset + x] =
      ((bp3 >> x) & 1) << 3 |
      ((bp2 >> x) & 1) << 2 |
      ((bp1 >> x) & 1) << 1 |
      ((bp0 >> x) & 1);
  }
}

/**
 * Encode a row of 8 pixels back to interleaved C-ROM planar format.
 * Inverse of decodeNeoGeoRow: pixels → [bp0, bp2, bp1, bp3].
 */
export function encodeNeoGeoRow(
  pixels: Uint8Array,
  offset: number,
): [number, number, number, number] {
  let bp0 = 0, bp1 = 0, bp2 = 0, bp3 = 0;

  // LSB first: pixel 0 stored at bit 0
  for (let x = 0; x < 8; x++) {
    const pix = pixels[offset + x]!;
    if (pix & 1) bp0 |= (1 << x);
    if (pix & 2) bp1 |= (1 << x);
    if (pix & 4) bp2 |= (1 << x);
    if (pix & 8) bp3 |= (1 << x);
  }

  return [bp0, bp2, bp1, bp3]; // interleaved: C1_first, C2_first, C1_second, C2_second
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

  // Block 0-63 = left half (pixels 0-7), block 64-127 = right half (pixels 8-15)
  for (let y = 0; y < 16; y++) {
    decodeNeoGeoRow(rom, tileOffset + y * 4, pixels, y * 16);           // left 8 pixels
    decodeNeoGeoRow(rom, tileOffset + 64 + y * 4, pixels, y * 16 + 8); // right 8 pixels
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
  // Block 0-63 = left half (pixels 0-7), block 64-127 = right half (pixels 8-15)
  const blockBase = tileOffset + ((localX >> 3) * 64);
  const groupBase = blockBase + localY * 4;

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
 * Decode a row of 8 pixels from an S-ROM fix tile.
 * S-ROM uses COLUMN-MAJOR nibble-packed format (wiki.neogeodev.org/Fix_graphics_format):
 *   32 bytes = 4 segments of 8 bytes (column pairs), stored top-to-bottom.
 *   Address pattern: ...nHCLLL (H=half, C=col, L=line)
 *   Pixels 0,1 at tile+16+row, pixels 2,3 at tile+24+row,
 *   pixels 4,5 at tile+0+row,  pixels 6,7 at tile+8+row.
 *   Left pixel = low nibble (bits 0-3), right pixel = high nibble (bits 4-7).
 * Ref: FBNeo NeoTextDecodeTile, NeoGeo Dev Wiki.
 */
export function decodeFixRow(
  rom: Uint8Array,
  tileOffset: number,
  row: number,
  out: Uint8Array,
  outOffset: number,
): void {
  const b01 = rom[tileOffset + 16 + row]!; // pixels 0,1
  const b23 = rom[tileOffset + 24 + row]!; // pixels 2,3
  const b45 = rom[tileOffset + row]!;       // pixels 4,5
  const b67 = rom[tileOffset + 8 + row]!;  // pixels 6,7

  out[outOffset]     = b01 & 0x0F;
  out[outOffset + 1] = (b01 >> 4) & 0x0F;
  out[outOffset + 2] = b23 & 0x0F;
  out[outOffset + 3] = (b23 >> 4) & 0x0F;
  out[outOffset + 4] = b45 & 0x0F;
  out[outOffset + 5] = (b45 >> 4) & 0x0F;
  out[outOffset + 6] = b67 & 0x0F;
  out[outOffset + 7] = (b67 >> 4) & 0x0F;
}

/**
 * Read a full 8x8 fix tile as palette indices (64 bytes output).
 */
export function readFixTile(
  rom: Uint8Array,
  tileCode: number,
): Uint8Array {
  const pixels = new Uint8Array(64);
  const tileOffset = tileCode * NGO_FIX_TILE_BYTES;

  for (let y = 0; y < 8; y++) {
    decodeFixRow(rom, tileOffset, y, pixels, y * 8);
  }

  return pixels;
}
