/**
 * Palette Editor — read/write CPS1 palette colors in VRAM.
 *
 * CPS1 color format (16-bit word, big-endian in VRAM):
 *   bits [15:12] = brightness nibble (0-15)
 *   bits [11:8]  = red nibble (0-15)
 *   bits [7:4]   = green nibble (0-15)
 *   bits [3:0]   = blue nibble (0-15)
 *
 * Decode formula (from CPS1Video.decodeColor):
 *   bright = 0x0F + (brightNibble << 1)
 *   channel = min(255, channelNibble * 0x11 * bright / 0x2D | 0)
 */

/**
 * Read the 16 colors of a palette from VRAM.
 * Each palette = 16 colors × 2 bytes = 32 bytes in VRAM.
 */
export function readPalette(
  vram: Uint8Array,
  paletteBase: number,
  paletteIndex: number,
): Array<[number, number, number]> {
  const colors: Array<[number, number, number]> = [];
  const offset = paletteBase + paletteIndex * 32;

  for (let i = 0; i < 16; i++) {
    const byteOff = offset + i * 2;
    const word = (vram[byteOff]! << 8) | vram[byteOff + 1]!;
    colors.push(decodeColor(word));
  }

  return colors;
}

/**
 * Write a single color in a VRAM palette.
 */
export function writeColor(
  vram: Uint8Array,
  paletteBase: number,
  paletteIndex: number,
  colorIndex: number,
  r: number,
  g: number,
  b: number,
): void {
  const offset = paletteBase + paletteIndex * 32 + colorIndex * 2;
  const word = encodeColor(r, g, b);
  vram[offset] = (word >> 8) & 0xFF;
  vram[offset + 1] = word & 0xFF;
}

/**
 * Decode a CPS1 16-bit color word to RGB.
 * Same formula as CPS1Video.decodeColor().
 */
export function decodeColor(colorValue: number): [number, number, number] {
  const bright = 0x0F + (((colorValue >> 12) & 0x0F) << 1);
  const r = Math.min(255, ((colorValue >> 8) & 0x0F) * 0x11 * bright / 0x2D | 0);
  const g = Math.min(255, ((colorValue >> 4) & 0x0F) * 0x11 * bright / 0x2D | 0);
  const b = Math.min(255, ((colorValue >> 0) & 0x0F) * 0x11 * bright / 0x2D | 0);
  return [r, g, b];
}

/**
 * Encode RGB to CPS1 16-bit color word.
 * Inverse of decodeColor(). Lossy (4-bit per channel + brightness).
 *
 * Strategy: try all 16 brightness levels, for each compute the best
 * RGB nibbles, pick the combination that minimizes total squared error.
 */
export function encodeColor(r: number, g: number, b: number): number {
  let bestWord = 0;
  let bestError = Infinity;

  for (let brightNibble = 0; brightNibble < 16; brightNibble++) {
    const bright = 0x0F + (brightNibble << 1);

    // For each channel, find the nibble that best reproduces the target
    const rNibble = findBestNibble(r, bright);
    const gNibble = findBestNibble(g, bright);
    const bNibble = findBestNibble(b, bright);

    // Compute actual decoded values for this combination
    const rActual = Math.min(255, rNibble * 0x11 * bright / 0x2D | 0);
    const gActual = Math.min(255, gNibble * 0x11 * bright / 0x2D | 0);
    const bActual = Math.min(255, bNibble * 0x11 * bright / 0x2D | 0);

    const error = (r - rActual) ** 2 + (g - gActual) ** 2 + (b - bActual) ** 2;

    if (error < bestError) {
      bestError = error;
      bestWord = (brightNibble << 12) | (rNibble << 8) | (gNibble << 4) | bNibble;
    }

    if (error === 0) break;
  }

  return bestWord;
}

function findBestNibble(target: number, bright: number): number {
  let bestNibble = 0;
  let bestDist = Infinity;

  for (let n = 0; n < 16; n++) {
    const value = Math.min(255, n * 0x11 * bright / 0x2D | 0);
    const dist = Math.abs(target - value);
    if (dist < bestDist) {
      bestDist = dist;
      bestNibble = n;
    }
  }

  return bestNibble;
}
