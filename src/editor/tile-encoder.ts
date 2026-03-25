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

const CHAR_SIZE_16 = 128;
const ROW_STRIDE = 8;

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
): void {
  const tileOffset = tileCode * CHAR_SIZE_16;
  const halfOffset = localX < 8 ? 0 : 4;
  const groupBase = tileOffset + localY * ROW_STRIDE + halfOffset;

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
  const pixelInGroup = localX < 8 ? localX : localX - 8;
  pixels[pixelInGroup] = colorIndex & 0x0F;

  // Re-encode and write back
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
): number {
  const tileOffset = tileCode * CHAR_SIZE_16;
  const halfOffset = localX < 8 ? 0 : 4;
  const groupBase = tileOffset + localY * ROW_STRIDE + halfOffset;
  const pixelInGroup = localX < 8 ? localX : localX - 8;
  const bit = 7 - pixelInGroup;

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
): Uint8Array {
  const result = new Uint8Array(256);
  const tileOffset = tileCode * CHAR_SIZE_16;

  for (let row = 0; row < 16; row++) {
    const rowBase = tileOffset + row * ROW_STRIDE;
    const outBase = row * 16;

    // Left half (pixels 0-7)
    const lb0 = graphicsRom[rowBase]!;
    const lb1 = graphicsRom[rowBase + 1]!;
    const lb2 = graphicsRom[rowBase + 2]!;
    const lb3 = graphicsRom[rowBase + 3]!;

    for (let p = 0; p < 8; p++) {
      const bit = 7 - p;
      result[outBase + p] = ((lb0 >> bit) & 1)
                           | (((lb1 >> bit) & 1) << 1)
                           | (((lb2 >> bit) & 1) << 2)
                           | (((lb3 >> bit) & 1) << 3);
    }

    // Right half (pixels 8-15)
    const rb0 = graphicsRom[rowBase + 4]!;
    const rb1 = graphicsRom[rowBase + 5]!;
    const rb2 = graphicsRom[rowBase + 6]!;
    const rb3 = graphicsRom[rowBase + 7]!;

    for (let p = 0; p < 8; p++) {
      const bit = 7 - p;
      result[outBase + 8 + p] = ((rb0 >> bit) & 1)
                                | (((rb1 >> bit) & 1) << 1)
                                | (((rb2 >> bit) & 1) << 2)
                                | (((rb3 >> bit) & 1) << 3);
    }
  }

  return result;
}
