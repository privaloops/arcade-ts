/**
 * Tile Encoder — inverse of decodeRow() in cps1-video.ts.
 *
 * Encodes pixel indices back to CPS1 4bpp planar GFX ROM format.
 * Used by the sprite editor to write modified pixels back to the GFX ROM.
 *
 * GFX ROM layout for 16x16 tiles (CHAR_SIZE_16 = 128 bytes):
 *   - 16 rows, each row = 8 bytes (left half 4 bytes + right half 4 bytes)
 *   - Each 4-byte group encodes 8 pixels in 4bpp planar format (MSB-first)
 */

import { CHAR_SIZE_16 } from '../constants';

const ROW_STRIDE_8 = 8;    // row stride for 8x8 and 16x16 tiles
const ROW_STRIDE_32 = 16;  // row stride for 32x32 tiles

/**
 * Encode 8 pixel indices (0-15) back into 4 planar bytes.
 * Exact inverse of decodeRow() in cps1-video.ts.
 *
 * For each pixel position p (0=leftmost, 7=rightmost):
 *   bit position = 7 - p (MSB-first, matching decodeRow)
 */
export function encodeRow(pixels: Uint8Array, offset: number): [number, number, number, number] {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0;

  for (let p = 0; p < 8; p++) {
    const idx = pixels[offset + p]!;
    const bit = 7 - p;
    if (idx & 1) b0 |= (1 << bit);
    if (idx & 2) b1 |= (1 << bit);
    if (idx & 4) b2 |= (1 << bit);
    if (idx & 8) b3 |= (1 << bit);
  }

  return [b0, b1, b2, b3];
}

/**
 * Write a single pixel in a 16x16 tile stored in the GFX ROM.
 *
 * Reads the 4-byte group containing the pixel, decodes all 8 pixels,
 * modifies the target pixel, re-encodes, and writes back.
 */
export function writePixel(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
  colorIndex: number,
  charSize = CHAR_SIZE_16,
): void {
  const rowStride = charSize >= 512 ? ROW_STRIDE_32 : ROW_STRIDE_8;
  const tileOffset = tileCode * charSize;
  const groupBase = tileOffset + localY * rowStride + ((localX >> 3) * 4);

  // Decode the 8 pixels of this group
  const pixels = new Uint8Array(8);
  const b0 = graphicsRom[groupBase]!;
  const b1 = graphicsRom[groupBase + 1]!;
  const b2 = graphicsRom[groupBase + 2]!;
  const b3 = graphicsRom[groupBase + 3]!;

  for (let p = 0; p < 8; p++) {
    const bit = 7 - p;
    pixels[p] = ((b0 >> bit) & 1)
              | (((b1 >> bit) & 1) << 1)
              | (((b2 >> bit) & 1) << 2)
              | (((b3 >> bit) & 1) << 3);
  }

  // Modify the target pixel
  const pixelInGroup = localX & 7;
  pixels[pixelInGroup] = colorIndex & 0x0F;

  // Re-encode and write back
  const [nb0, nb1, nb2, nb3] = encodeRow(pixels, 0);
  graphicsRom[groupBase] = nb0;
  graphicsRom[groupBase + 1] = nb1;
  graphicsRom[groupBase + 2] = nb2;
  graphicsRom[groupBase + 3] = nb3;
}

/**
 * Write a pixel in a scroll tile, handling the scroll1 interleave quirk.
 * For scroll1 (8x8 tiles, charSize=64), tiles are stored in pairs:
 * odd columns (tileIndex & 0x20) use a +4 byte offset within each row.
 */
export function writeScrollPixel(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
  colorIndex: number,
  charSize: number,
  tileIndex: number,
  isScroll1: boolean,
): void {
  const rowStride = charSize >= 512 ? ROW_STRIDE_32 : ROW_STRIDE_8;
  const tileOffset = tileCode * charSize;

  // For scroll1: the 4-byte group offset depends on tileIndex, not localX
  // For scroll2/3: same as writePixel
  const groupOffset = isScroll1
    ? ((tileIndex & 0x20) >> 5) * 4
    : ((localX >> 3) * 4);

  const groupBase = tileOffset + localY * rowStride + groupOffset;
  if (groupBase + 3 >= graphicsRom.length) return;

  const pixels = new Uint8Array(8);
  const b0 = graphicsRom[groupBase]!;
  const b1 = graphicsRom[groupBase + 1]!;
  const b2 = graphicsRom[groupBase + 2]!;
  const b3 = graphicsRom[groupBase + 3]!;

  for (let p = 0; p < 8; p++) {
    const bit = 7 - p;
    pixels[p] = ((b0 >> bit) & 1)
              | (((b1 >> bit) & 1) << 1)
              | (((b2 >> bit) & 1) << 2)
              | (((b3 >> bit) & 1) << 3);
  }

  const pixelInGroup = localX & 7;
  pixels[pixelInGroup] = colorIndex & 0x0F;

  const [nb0, nb1, nb2, nb3] = encodeRow(pixels, 0);
  graphicsRom[groupBase] = nb0;
  graphicsRom[groupBase + 1] = nb1;
  graphicsRom[groupBase + 2] = nb2;
  graphicsRom[groupBase + 3] = nb3;
}

/**
 * Read a single pixel from a 16x16 tile in the GFX ROM.
 */
export function readPixel(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
  charSize = CHAR_SIZE_16,
): number {
  const rowStride = charSize >= 512 ? ROW_STRIDE_32 : ROW_STRIDE_8;
  const tileOffset = tileCode * charSize;
  const groupBase = tileOffset + localY * rowStride + ((localX >> 3) * 4);
  const bit = 7 - (localX & 7);

  return ((graphicsRom[groupBase]! >> bit) & 1)
       | (((graphicsRom[groupBase + 1]! >> bit) & 1) << 1)
       | (((graphicsRom[groupBase + 2]! >> bit) & 1) << 2)
       | (((graphicsRom[groupBase + 3]! >> bit) & 1) << 3);
}

/**
 * Read a pixel from a scroll tile, handling the scroll1 interleave quirk.
 */
export function readScrollPixel(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
  charSize: number,
  tileIndex: number,
  isScroll1: boolean,
): number {
  const rowStride = charSize >= 512 ? ROW_STRIDE_32 : ROW_STRIDE_8;
  const tileOffset = tileCode * charSize;
  const groupOffset = isScroll1
    ? ((tileIndex & 0x20) >> 5) * 4
    : ((localX >> 3) * 4);
  const groupBase = tileOffset + localY * rowStride + groupOffset;
  if (groupBase + 3 >= graphicsRom.length) return 0;
  const bit = 7 - (localX & 7);

  return ((graphicsRom[groupBase]! >> bit) & 1)
       | (((graphicsRom[groupBase + 1]! >> bit) & 1) << 1)
       | (((graphicsRom[groupBase + 2]! >> bit) & 1) << 2)
       | (((graphicsRom[groupBase + 3]! >> bit) & 1) << 3);
}

/**
 * Read an entire 16x16 tile as a flat array of palette indices.
 * Returns 256 values (row-major, 16 per row).
 */
export function readTile(
  graphicsRom: Uint8Array,
  tileCode: number,
  tileW = 16,
  tileH = 16,
  charSize = CHAR_SIZE_16,
): Uint8Array {
  const rowStride = charSize >= 512 ? ROW_STRIDE_32 : ROW_STRIDE_8;
  const groupsPerRow = tileW >> 3;
  const result = new Uint8Array(tileW * tileH);
  const tileOffset = tileCode * charSize;

  for (let row = 0; row < tileH; row++) {
    const rowBase = tileOffset + row * rowStride;
    const outBase = row * tileW;

    for (let group = 0; group < groupsPerRow; group++) {
      const planeBase = rowBase + group * 4;
      const b0 = graphicsRom[planeBase]!;
      const b1 = graphicsRom[planeBase + 1]!;
      const b2 = graphicsRom[planeBase + 2]!;
      const b3 = graphicsRom[planeBase + 3]!;

      for (let p = 0; p < 8; p++) {
        const bit = 7 - p;
        result[outBase + group * 8 + p] = ((b0 >> bit) & 1)
                                         | (((b1 >> bit) & 1) << 1)
                                         | (((b2 >> bit) & 1) << 2)
                                         | (((b3 >> bit) & 1) << 3);
      }
    }
  }

  return result;
}
