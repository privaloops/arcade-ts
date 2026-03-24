/**
 * CPS1 Video unit tests — tile decode, palette, tilemap scan, GFX mapper.
 *
 * All tests use synthetic data (no ROM files needed).
 * Reference: MAME src/mame/capcom/cps1_v.cpp
 */

import { describe, it, expect } from 'vitest';
import {
  readWord,
  decodeRow,
  tilemap0Scan,
  tilemap1Scan,
  tilemap2Scan,
  gfxromBankMapper,
  GFXTYPE_SPRITES,
  GFXTYPE_SCROLL1,
  GFXTYPE_SCROLL2,
  GFXTYPE_SCROLL3,
  CPS1Video,
} from '../video/cps1-video';
import { SCREEN_WIDTH, SCREEN_HEIGHT, FRAMEBUFFER_SIZE } from '../constants';

// ---------------------------------------------------------------------------
// readWord
// ---------------------------------------------------------------------------

describe('readWord', () => {
  it('reads big-endian 16-bit word', () => {
    const data = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    expect(readWord(data, 0)).toBe(0x1234);
    expect(readWord(data, 2)).toBe(0x5678);
  });

  it('returns 0 when out of bounds', () => {
    const data = new Uint8Array([0xFF]);
    expect(readWord(data, 0)).toBe(0);
    expect(readWord(data, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// decodeRow — 4bpp planar → 8 pixel indices
// ---------------------------------------------------------------------------

describe('decodeRow', () => {
  it('decodes all-zero bytes to all-zero indices', () => {
    const out = new Uint8Array(8);
    decodeRow(0x00, 0x00, 0x00, 0x00, out, 0);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('decodes plane 0 = 0xFF (all bits set in bit 0)', () => {
    // b0=0xFF → bit 0 set for all pixels → index = 1 for each pixel
    const out = new Uint8Array(8);
    decodeRow(0xFF, 0x00, 0x00, 0x00, out, 0);
    expect(Array.from(out)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('decodes plane 1 = 0xFF (all bits set in bit 1)', () => {
    const out = new Uint8Array(8);
    decodeRow(0x00, 0xFF, 0x00, 0x00, out, 0);
    expect(Array.from(out)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it('decodes all planes = 0xFF → index 15 for all pixels', () => {
    const out = new Uint8Array(8);
    decodeRow(0xFF, 0xFF, 0xFF, 0xFF, out, 0);
    expect(Array.from(out)).toEqual([15, 15, 15, 15, 15, 15, 15, 15]);
  });

  it('decodes MSB-first: bit 7 = pixel 0', () => {
    // b0=0x80 → only bit 7 set → pixel 0 = index 1, rest = 0
    const out = new Uint8Array(8);
    decodeRow(0x80, 0x00, 0x00, 0x00, out, 0);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(0);
    expect(out[7]).toBe(0);
  });

  it('decodes LSB: bit 0 = pixel 7', () => {
    // b0=0x01 → only bit 0 set → pixel 7 = index 1
    const out = new Uint8Array(8);
    decodeRow(0x01, 0x00, 0x00, 0x00, out, 0);
    expect(out[7]).toBe(1);
    expect(out[0]).toBe(0);
  });

  it('decodes mixed planes correctly', () => {
    // b0=0x80, b1=0x80, b2=0x00, b3=0x00 → pixel 0 = 0b0011 = 3
    const out = new Uint8Array(8);
    decodeRow(0x80, 0x80, 0x00, 0x00, out, 0);
    expect(out[0]).toBe(3);
  });

  it('writes at correct outOffset', () => {
    const out = new Uint8Array(16);
    decodeRow(0xFF, 0x00, 0x00, 0x00, out, 8);
    // First 8 should be untouched (0)
    expect(out[0]).toBe(0);
    // Offset 8+ should be 1
    expect(out[8]).toBe(1);
    expect(out[15]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tilemap scan functions
// ---------------------------------------------------------------------------

describe('tilemap0Scan (Scroll 1, 8x8, 64x64)', () => {
  it('returns sequential indices for first row', () => {
    // First row (row=0): col 0→31 should map to 0,32,64,...
    expect(tilemap0Scan(0, 0)).toBe(0);
    expect(tilemap0Scan(1, 0)).toBe(32);
    expect(tilemap0Scan(2, 0)).toBe(64);
  });

  it('increments by 1 within a column for rows 0-31', () => {
    expect(tilemap0Scan(0, 0)).toBe(0);
    expect(tilemap0Scan(0, 1)).toBe(1);
    expect(tilemap0Scan(0, 31)).toBe(31);
  });

  it('handles row wrap at 32 (upper half)', () => {
    // row 32 maps to the second block: (32 & 0x1f)=0, (32 & 0x20)<<6 = 0x800
    expect(tilemap0Scan(0, 32)).toBe(0x800);
  });
});

describe('tilemap1Scan (Scroll 2, 16x16, 64x64)', () => {
  it('returns sequential indices for first row', () => {
    expect(tilemap1Scan(0, 0)).toBe(0);
    expect(tilemap1Scan(1, 0)).toBe(16);
  });

  it('increments within column for rows 0-15', () => {
    expect(tilemap1Scan(0, 0)).toBe(0);
    expect(tilemap1Scan(0, 1)).toBe(1);
    expect(tilemap1Scan(0, 15)).toBe(15);
  });

  it('handles row 16 wrap', () => {
    // row 16: (16 & 0x0f)=0, (16 & 0x30)<<6 = 0x400
    expect(tilemap1Scan(0, 16)).toBe(0x400);
  });
});

describe('tilemap2Scan (Scroll 3, 32x32, 64x64)', () => {
  it('basic sequential behavior', () => {
    expect(tilemap2Scan(0, 0)).toBe(0);
    expect(tilemap2Scan(1, 0)).toBe(8);
    expect(tilemap2Scan(0, 1)).toBe(1);
  });

  it('handles row 8 wrap', () => {
    // row 8: (8 & 0x07)=0, (8 & 0x38)<<6 = 0x200
    expect(tilemap2Scan(0, 8)).toBe(0x200);
  });
});

// ---------------------------------------------------------------------------
// GFX ROM bank mapper — using SF2 mapper config
// ---------------------------------------------------------------------------

describe('gfxromBankMapper', () => {
  // SF2 mapper config (from game-defs.ts)
  const sf2Ranges = [
    { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
    { type: 1, start: 0x08000, end: 0x0ffff, bank: 1 },
    { type: 1, start: 0x10000, end: 0x11fff, bank: 2 },
    { type: 8, start: 0x02000, end: 0x03fff, bank: 2 },
    { type: 2, start: 0x04000, end: 0x04fff, bank: 2 },
    { type: 4, start: 0x05000, end: 0x07fff, bank: 2 },
  ];
  const sf2BankSizes = [0x8000, 0x8000, 0x8000, 0];
  // Bank bases: cumulative offsets
  const sf2BankBases = [0, 0x8000, 0x10000, 0x18000];

  it('maps sprite code 0 to bank 0 (shift=1)', () => {
    // Sprites shift=1: code 0 → shiftedCode=0, in range [0x0000..0x7fff] bank 0
    const result = gfxromBankMapper(GFXTYPE_SPRITES, 0, sf2Ranges, sf2BankSizes, sf2BankBases);
    expect(result).toBe(0);
  });

  it('maps sprite code in bank 1 range', () => {
    // Sprites shift=1: code 0x4000 → shiftedCode=0x8000, in range [0x8000..0xffff] bank 1
    const result = gfxromBankMapper(GFXTYPE_SPRITES, 0x4000, sf2Ranges, sf2BankSizes, sf2BankBases);
    // bankBases[1]=0x8000, (0x8000 & (0x8000-1))=0, (0x8000 + 0) >> 1 = 0x4000
    expect(result).toBe(0x4000);
  });

  it('maps scroll1 code 0 (shift=0)', () => {
    // Scroll1 shift=0: code 0 → shiftedCode=0, but range type=2 start=0x4000
    // No range matches type=2 for code 0 → falls through
    // No range for type 2 that includes 0? range {type:2, start:0x4000..0x4fff}
    // So code 0 for scroll1: hasRangeForType=true but no match → returns -1
    const result = gfxromBankMapper(GFXTYPE_SCROLL1, 0, sf2Ranges, sf2BankSizes, sf2BankBases);
    expect(result).toBe(-1);
  });

  it('maps scroll1 code in valid range', () => {
    // Scroll1 shift=0: code 0x4000 → shiftedCode=0x4000, in range [0x4000..0x4fff] bank 2
    const result = gfxromBankMapper(GFXTYPE_SCROLL1, 0x4000, sf2Ranges, sf2BankSizes, sf2BankBases);
    // bankBases[2]=0x10000, (0x4000 & (0x8000-1))=0x4000, (0x10000 + 0x4000) >> 0 = 0x14000
    expect(result).toBe(0x14000);
  });

  it('maps scroll3 code in valid range', () => {
    // Scroll3 shift=3: code 0x400 → shiftedCode=0x2000, in range [0x2000..0x3fff] bank 2
    const result = gfxromBankMapper(GFXTYPE_SCROLL3, 0x400, sf2Ranges, sf2BankSizes, sf2BankBases);
    // bankBases[2]=0x10000, (0x2000 & 0x7fff)=0x2000, (0x10000+0x2000)>>3 = 0x2400
    expect(result).toBe(0x2400);
  });

  it('returns -1 for out-of-range scroll code', () => {
    // Scroll2 shift=1: code 0xFFFF → shiftedCode=0x1FFFE, no range matches
    const result = gfxromBankMapper(GFXTYPE_SCROLL2, 0xFFFF, sf2Ranges, sf2BankSizes, sf2BankBases);
    expect(result).toBe(-1);
  });

  it('sprites always fallback to bank 0 when no range matches', () => {
    // Sprites with code beyond all ranges
    const result = gfxromBankMapper(GFXTYPE_SPRITES, 0xFFFFF, sf2Ranges, sf2BankSizes, sf2BankBases);
    // Falls through all ranges, but sprites fallback to bank 0
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// CPS1Video.decodeColor — palette color decode
// ---------------------------------------------------------------------------

describe('CPS1Video.decodeColor', () => {
  // Create a minimal CPS1Video instance for testing decodeColor
  const vram = new Uint8Array(0x30000);
  const gfxRom = new Uint8Array(64);
  const cpsaRegs = new Uint8Array(0x40);
  const cpsbRegs = new Uint8Array(0x40);
  const video = new CPS1Video(vram, gfxRom, cpsaRegs, cpsbRegs);

  it('decodes black (0x0000)', () => {
    const [r, g, b, a] = video.decodeColor(0x0000);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it('decodes with maximum brightness', () => {
    // 0xF000 = bright=0x0f + (0x0f << 1) = 0x2d, RGB all 0 → still black
    const [r, g, b] = video.decodeColor(0xF000);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('decodes pure red at max brightness', () => {
    // 0xFF00: bright nibble=0xF → bright=0x0f+0x1e=0x2d
    // R nibble=0xF → r = 0x0F * 0x11 * 0x2d / 0x2d = 0xFF = 255
    const [r, g, b] = video.decodeColor(0xFF00);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('decodes pure green at max brightness', () => {
    const [r, g, b] = video.decodeColor(0xF0F0);
    expect(r).toBe(0);
    expect(g).toBe(255);
    expect(b).toBe(0);
  });

  it('decodes pure blue at max brightness', () => {
    const [r, g, b] = video.decodeColor(0xF00F);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
  });

  it('decodes white at max brightness', () => {
    const [r, g, b] = video.decodeColor(0xFFFF);
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });

  it('decodes with low brightness', () => {
    // 0x0F00: bright nibble=0 → bright=0x0f, R=0xF
    // r = 0x0F * 0x11 * 0x0f / 0x2d | 0 = 255 * 15 / 45 = 85
    const [r, g, b] = video.decodeColor(0x0F00);
    expect(r).toBe(85);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('always returns alpha 255', () => {
    const [, , , a] = video.decodeColor(0x1234);
    expect(a).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// CPS1Video.renderFrame — integration smoke test
// ---------------------------------------------------------------------------

describe('CPS1Video.renderFrame', () => {
  it('renders without crashing on empty VRAM', () => {
    const vram = new Uint8Array(0x30000);
    const gfxRom = new Uint8Array(0x10000);
    const cpsaRegs = new Uint8Array(0x40);
    const cpsbRegs = new Uint8Array(0x40);
    const video = new CPS1Video(vram, gfxRom, cpsaRegs, cpsbRegs);
    const framebuffer = new Uint8Array(FRAMEBUFFER_SIZE);

    // Should not throw
    video.renderFrame(framebuffer);

    // Framebuffer should have been written (at minimum, the background fill)
    expect(framebuffer.length).toBe(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  });

  it('produces a non-zero framebuffer with palette data', () => {
    const vram = new Uint8Array(0x30000);
    const gfxRom = new Uint8Array(0x10000);
    const cpsaRegs = new Uint8Array(0x40);
    const cpsbRegs = new Uint8Array(0x40);

    // Set palette base register (CPSA offset 0x0A) to a valid value
    cpsaRegs[0x0A] = 0x00;
    cpsaRegs[0x0B] = 0x80; // palette base = 0x80 * 256 = 0x8000

    // Enable palette page 0 in CPS-B palette control register
    cpsbRegs[0x30] = 0x00;
    cpsbRegs[0x31] = 0x3F; // all 6 pages enabled

    // Write a non-black color to palette 0, color 0 (background color)
    const paletteBase = 0x8000;
    vram[paletteBase] = 0xFF; // bright + red
    vram[paletteBase + 1] = 0xFF; // green + blue → white at max brightness

    const video = new CPS1Video(vram, gfxRom, cpsaRegs, cpsbRegs);
    const framebuffer = new Uint8Array(FRAMEBUFFER_SIZE);
    video.renderFrame(framebuffer);

    // Check that at least some pixels are non-zero
    let nonZero = 0;
    for (let i = 0; i < framebuffer.length; i++) {
      if (framebuffer[i] !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
  });
});
