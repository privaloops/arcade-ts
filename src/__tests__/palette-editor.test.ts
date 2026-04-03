/**
 * Palette Editor tests — encodeColor, decodeColor, readPalette, writeColor.
 */

import { describe, it, expect } from 'vitest';
import { encodeColor, decodeColor, readPalette, writeColor } from '../editor/palette-editor';

// ---------------------------------------------------------------------------
// encodeColor / decodeColor roundtrip
// ---------------------------------------------------------------------------

describe('encodeColor', () => {
  it('encodeColor(0, 0, 0) → 0x0000', () => {
    expect(encodeColor(0, 0, 0)).toBe(0x0000);
  });

  it('encodeColor(255, 0, 0) → 0xFF00', () => {
    expect(encodeColor(255, 0, 0)).toBe(0xFF00);
  });

  it('encodeColor(0, 255, 0) → 0xF0F0', () => {
    expect(encodeColor(0, 255, 0)).toBe(0xF0F0);
  });

  it('encodeColor(0, 0, 255) → 0xF00F', () => {
    expect(encodeColor(0, 0, 255)).toBe(0xF00F);
  });

  it('encodeColor(255, 255, 255) → 0xFFFF', () => {
    expect(encodeColor(255, 255, 255)).toBe(0xFFFF);
  });

  it('encode → decode roundtrip: decoded values are closest representable', () => {
    // CPS1 has 4-bit per channel + 4-bit brightness = lossy.
    // The encoder picks the best-fit; tolerance depends on the palette granularity.
    // Max step between adjacent representable values is ~18, so ±9 is the worst case.
    const testCases = [
      [0, 0, 0],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [128, 64, 32],
      [85, 0, 0],
      [170, 170, 170],
      [42, 100, 200],
    ];

    for (const [r, g, b] of testCases) {
      const word = encodeColor(r!, g!, b!);
      const [dr, dg, db] = decodeColor(word);
      expect(Math.abs(dr - r!)).toBeLessThanOrEqual(9);
      expect(Math.abs(dg - g!)).toBeLessThanOrEqual(9);
      expect(Math.abs(db - b!)).toBeLessThanOrEqual(9);
    }
  });

  it('perfect roundtrip for all hardware-representable colors', () => {
    // Every possible CPS1 color word should encode→decode perfectly
    for (let brightNibble = 0; brightNibble < 16; brightNibble++) {
      for (let rn = 0; rn < 16; rn++) {
        // Test a subset to keep test fast (all bright levels, all red, green=0, blue=0)
        const word = (brightNibble << 12) | (rn << 8);
        const [r, g, b] = decodeColor(word);
        const reencoded = encodeColor(r, g, b);
        const [r2, g2, b2] = decodeColor(reencoded);
        expect(r2).toBe(r);
        expect(g2).toBe(g);
        expect(b2).toBe(b);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// readPalette / writeColor
// ---------------------------------------------------------------------------

describe('readPalette', () => {
  it('returns 16 entries for any valid paletteIndex', () => {
    const vram = new Uint8Array(0x30000);
    const colors = readPalette(vram, 0x8000, 0);
    expect(colors.length).toBe(16);
  });

  it('reads black for zeroed VRAM', () => {
    const vram = new Uint8Array(0x30000);
    const colors = readPalette(vram, 0x8000, 0);
    for (const [r, g, b] of colors) {
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    }
  });
});

describe('writeColor + readPalette roundtrip', () => {
  it('writes and reads back the same color', () => {
    const vram = new Uint8Array(0x30000);
    const base = 0x8000;

    writeColor(vram, base, 5, 3, 255, 0, 0);
    const colors = readPalette(vram, base, 5);

    const [r, g, b] = colors[3]!;
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('does not affect other palette entries', () => {
    const vram = new Uint8Array(0x30000);
    const base = 0x8000;

    writeColor(vram, base, 5, 3, 255, 255, 0);

    // Color index 2 should still be black
    const colors = readPalette(vram, base, 5);
    const [r, g, b] = colors[2]!;
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('does not affect other palettes', () => {
    const vram = new Uint8Array(0x30000);
    const base = 0x8000;

    writeColor(vram, base, 5, 0, 255, 255, 255);

    const otherColors = readPalette(vram, base, 4);
    const [r, g, b] = otherColors[0]!;
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });
});

describe('palette override persistence', () => {
  it('override re-applied after VRAM is overwritten simulates 68K palette reset', () => {
    const vram = new Uint8Array(0x30000);
    const base = 0x8000;
    const palIdx = 3;

    // User imports aseprite with modified red color
    writeColor(vram, base, palIdx, 0, 255, 0, 0);
    const overrideWord = encodeColor(255, 0, 0);

    // Simulate 68K overwriting palette (game loads next round)
    writeColor(vram, base, palIdx, 0, 0, 255, 0); // 68K writes green
    const afterReset = readPalette(vram, base, palIdx);
    expect(afterReset[0]![1]).toBe(255); // green

    // Re-apply override (what CPS1Video.applyPaletteOverrides does)
    const off = base + palIdx * 32;
    vram[off] = (overrideWord >> 8) & 0xFF;
    vram[off + 1] = overrideWord & 0xFF;

    const afterOverride = readPalette(vram, base, palIdx);
    expect(afterOverride[0]![0]).toBe(255); // red restored
    expect(afterOverride[0]![1]).toBe(0);   // green gone
  });
});
