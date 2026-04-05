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
  type SpriteInspectResult,
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

// ---------------------------------------------------------------------------
// inspectSpriteAt — sprite hit-test
// ---------------------------------------------------------------------------

describe('CPS1Video.inspectSpriteAt', () => {
  // Helper: create a CPS1Video with an identity mapper (no bank shifting)
  // so tile code N maps directly to GFX ROM offset N * 128.
  function createTestVideo(gfxRomSize = 0x10000) {
    const vram = new Uint8Array(0x30000);
    const gfxRom = new Uint8Array(gfxRomSize);
    const cpsaRegs = new Uint8Array(0x40);
    const cpsbRegs = new Uint8Array(0x40);

    // Identity mapper: single bank covering entire ROM
    const totalTiles = gfxRomSize / 128;
    const gfxMapper = {
      ranges: [{ type: 0x0F, start: 0, end: totalTiles - 1, bank: 0 }],
      bankSizes: [totalTiles, 0, 0, 0] as [number, number, number, number],
    };

    const video = new CPS1Video(vram, gfxRom, cpsaRegs, cpsbRegs, undefined, gfxMapper);
    return { video, vram, gfxRom, cpsaRegs, cpsbRegs };
  }

  // Helper: write a sprite entry into the OBJ buffer
  // CPS1 sprites: screen X = (sprX & 0x1FF) - 64, screen Y = (sprY & 0x1FF) - 16
  // To place a sprite at screen (sx, sy): sprX = sx + 64, sprY = sy + 16
  function writeSprite(
    video: CPS1Video,
    index: number,
    screenX: number,
    screenY: number,
    tileCode: number,
    palette: number,
    opts?: { flipX?: boolean; flipY?: boolean; nx?: number; ny?: number },
  ) {
    const objBuf = video.getObjBuffer();
    const off = index * 8;
    const sprX = screenX + 64; // CPS_HBEND
    const sprY = screenY + 16; // CPS_VBEND

    objBuf[off] = (sprX >> 8) & 0xFF;
    objBuf[off + 1] = sprX & 0xFF;
    objBuf[off + 2] = (sprY >> 8) & 0xFF;
    objBuf[off + 3] = sprY & 0xFF;
    objBuf[off + 4] = (tileCode >> 8) & 0xFF;
    objBuf[off + 5] = tileCode & 0xFF;

    let colour = palette & 0x1F;
    if (opts?.flipX) colour |= (1 << 5);
    if (opts?.flipY) colour |= (1 << 6);
    const nx = (opts?.nx ?? 1) - 1;
    const ny = (opts?.ny ?? 1) - 1;
    colour |= (nx << 8) | (ny << 12);

    objBuf[off + 6] = (colour >> 8) & 0xFF;
    objBuf[off + 7] = colour & 0xFF;
  }

  // Helper: write end-of-table marker after last sprite
  function writeEndMarker(video: CPS1Video, afterIndex: number) {
    const objBuf = video.getObjBuffer();
    const off = afterIndex * 8;
    objBuf[off + 6] = 0xFF;
    objBuf[off + 7] = 0x00;
  }

  // Helper: fill a tile in GFX ROM with a specific color index
  function fillTile(gfxRom: Uint8Array, tileCode: number, colorIndex: number) {
    const base = tileCode * 128;
    // Each row = 8 bytes (left 4 + right 4), 16 rows
    // encodeRow inverse: for colorIndex, set bit planes accordingly
    for (let row = 0; row < 16; row++) {
      for (let half = 0; half < 2; half++) {
        const groupOff = base + row * 8 + half * 4;
        // 8 pixels per half, all set to colorIndex
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
        for (let px = 0; px < 8; px++) {
          const bit = 7 - px; // MSB-first
          if (colorIndex & 1) b0 |= (1 << bit);
          if (colorIndex & 2) b1 |= (1 << bit);
          if (colorIndex & 4) b2 |= (1 << bit);
          if (colorIndex & 8) b3 |= (1 << bit);
        }
        gfxRom[groupOff] = b0;
        gfxRom[groupOff + 1] = b1;
        gfxRom[groupOff + 2] = b2;
        gfxRom[groupOff + 3] = b3;
      }
    }
  }

  it('returns null when no sprite at position', () => {
    const { video } = createTestVideo();
    // No sprites in OBJ buffer (all zeros), end marker at entry 0
    writeEndMarker(video, 0);
    expect(video.inspectSpriteAt(100, 100)).toBeNull();
  });

  it('returns null for out-of-bounds coordinates', () => {
    const { video } = createTestVideo();
    expect(video.inspectSpriteAt(-1, 0)).toBeNull();
    expect(video.inspectSpriteAt(0, -1)).toBeNull();
    expect(video.inspectSpriteAt(384, 0)).toBeNull();
    expect(video.inspectSpriteAt(0, 224)).toBeNull();
  });

  it('returns correct tileCode for a known sprite entry', () => {
    const { video, gfxRom } = createTestVideo();
    // Place sprite at screen (100, 50), tile code 0x10, palette 3
    writeSprite(video, 0, 100, 50, 0x10, 3);
    writeEndMarker(video, 1);
    // Fill tile 0x10 with color index 5 (non-transparent)
    fillTile(gfxRom, 0x10, 5);

    const result = video.inspectSpriteAt(108, 58);
    expect(result).not.toBeNull();
    expect(result!.tileCode).toBe(0x10);
    expect(result!.paletteIndex).toBe(3);
    expect(result!.colorIndex).toBe(5);
    expect(result!.spriteIndex).toBe(0);
    expect(result!.gfxRomOffset).toBe(0x10 * 128);
  });

  it('returns null for transparent pixels (color index 15)', () => {
    const { video, gfxRom } = createTestVideo();
    writeSprite(video, 0, 100, 50, 0x10, 3);
    writeEndMarker(video, 1);
    // Fill tile 0x10 with color index 15 (transparent)
    fillTile(gfxRom, 0x10, 15);

    expect(video.inspectSpriteAt(108, 58)).toBeNull();
  });

  it('handles flipX correctly (localX is flipped)', () => {
    const { video, gfxRom } = createTestVideo();
    writeSprite(video, 0, 100, 50, 0x10, 3, { flipX: true });
    writeEndMarker(video, 1);
    fillTile(gfxRom, 0x10, 7);

    const result = video.inspectSpriteAt(100, 50);
    expect(result).not.toBeNull();
    expect(result!.flipX).toBe(true);
    // Screen pixel (100, 50) is at px=0 from sprite start
    // With flipX, localX = 15 - 0 = 15
    expect(result!.localX).toBe(15);
  });

  it('handles flipY correctly (localY is flipped)', () => {
    const { video, gfxRom } = createTestVideo();
    writeSprite(video, 0, 100, 50, 0x10, 3, { flipY: true });
    writeEndMarker(video, 1);
    fillTile(gfxRom, 0x10, 7);

    const result = video.inspectSpriteAt(100, 50);
    expect(result).not.toBeNull();
    expect(result!.flipY).toBe(true);
    // Screen pixel at py=0 from sprite start → localY = 15 - 0 = 15
    expect(result!.localY).toBe(15);
  });

  it('handles multi-tile sprites (nx>1 or ny>1)', () => {
    const { video, gfxRom } = createTestVideo();
    // 2x2 multi-tile sprite at screen (100, 50), base tile code 0x10
    writeSprite(video, 0, 100, 50, 0x10, 3, { nx: 2, ny: 2 });
    writeEndMarker(video, 1);

    // Fill all 4 sub-tiles with different colors
    // Sub-tile (0,0) = tile 0x10, (1,0) = 0x11, (0,1) = 0x20, (1,1) = 0x21
    fillTile(gfxRom, 0x10, 1);
    fillTile(gfxRom, 0x11, 2);
    fillTile(gfxRom, 0x20, 3);
    fillTile(gfxRom, 0x21, 4);

    // Hit top-left sub-tile (nxs=0, nys=0)
    const r0 = video.inspectSpriteAt(108, 58);
    expect(r0).not.toBeNull();
    expect(r0!.tileCode).toBe(0x10);
    expect(r0!.colorIndex).toBe(1);
    expect(r0!.nxs).toBe(0);
    expect(r0!.nys).toBe(0);

    // Hit top-right sub-tile (nxs=1, nys=0) — at screen x = 100+16 = 116
    const r1 = video.inspectSpriteAt(120, 58);
    expect(r1).not.toBeNull();
    expect(r1!.tileCode).toBe(0x11);
    expect(r1!.colorIndex).toBe(2);
    expect(r1!.nxs).toBe(1);
    expect(r1!.nys).toBe(0);

    // Hit bottom-left sub-tile (nxs=0, nys=1) — at screen y = 50+16 = 66
    const r2 = video.inspectSpriteAt(108, 70);
    expect(r2).not.toBeNull();
    expect(r2!.tileCode).toBe(0x20);
    expect(r2!.colorIndex).toBe(3);
    expect(r2!.nxs).toBe(0);
    expect(r2!.nys).toBe(1);
  });

  it('returns the frontmost sprite when two overlap', () => {
    const { video, gfxRom } = createTestVideo();
    // Sprite 0 (front) and sprite 1 (back) at same position
    writeSprite(video, 0, 100, 50, 0x10, 5);
    writeSprite(video, 1, 100, 50, 0x20, 7);
    writeEndMarker(video, 2);
    // Fill both with different non-transparent colors
    fillTile(gfxRom, 0x10, 3);
    fillTile(gfxRom, 0x20, 8);

    const result = video.inspectSpriteAt(108, 58);
    expect(result).not.toBeNull();
    // Sprite 0 (index 0) is frontmost (drawn last = on top)
    expect(result!.spriteIndex).toBe(0);
    expect(result!.tileCode).toBe(0x10);
    expect(result!.paletteIndex).toBe(5);
  });

  it('sees through transparent front sprite to opaque back sprite', () => {
    const { video, gfxRom } = createTestVideo();
    writeSprite(video, 0, 100, 50, 0x10, 5);
    writeSprite(video, 1, 100, 50, 0x20, 7);
    writeEndMarker(video, 2);
    // Front sprite is transparent (index 15), back is opaque (index 8)
    fillTile(gfxRom, 0x10, 15);
    fillTile(gfxRom, 0x20, 8);

    const result = video.inspectSpriteAt(108, 58);
    expect(result).not.toBeNull();
    expect(result!.spriteIndex).toBe(1);
    expect(result!.tileCode).toBe(0x20);
  });

  it('returns correct localX/localY for interior pixel', () => {
    const { video, gfxRom } = createTestVideo();
    writeSprite(video, 0, 100, 50, 0x10, 3);
    writeEndMarker(video, 1);
    fillTile(gfxRom, 0x10, 5);

    // Click on screen pixel (105, 57) → local (5, 7) within the tile
    const result = video.inspectSpriteAt(105, 57);
    expect(result).not.toBeNull();
    expect(result!.localX).toBe(5);
    expect(result!.localY).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// inspectScrollAt — scroll tile hit-test
// ---------------------------------------------------------------------------

describe('CPS1Video.inspectScrollAt', () => {
  // Reuse createTestVideo + fillTile from inspectSpriteAt tests above.
  function createScrollTestVideo(gfxRomSize = 0x40000) {
    const vram = new Uint8Array(0x30000);
    const gfxRom = new Uint8Array(gfxRomSize);
    const cpsaRegs = new Uint8Array(0x40);
    const cpsbRegs = new Uint8Array(0x40);

    const totalTiles = gfxRomSize / 128;
    const gfxMapper = {
      ranges: [{ type: 0x0F, start: 0, end: totalTiles - 1, bank: 0 }],
      bankSizes: [totalTiles, 0, 0, 0] as [number, number, number, number],
    };

    const video = new CPS1Video(vram, gfxRom, cpsaRegs, cpsbRegs, undefined, gfxMapper);
    return { video, vram, gfxRom, cpsaRegs, cpsbRegs };
  }

  function fillTile16(gfxRom: Uint8Array, tileCode: number, colorIndex: number) {
    const base = tileCode * 128;
    for (let row = 0; row < 16; row++) {
      for (let half = 0; half < 2; half++) {
        const groupOff = base + row * 8 + half * 4;
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
        for (let px = 0; px < 8; px++) {
          const bit = 7 - px;
          if (colorIndex & 1) b0 |= (1 << bit);
          if (colorIndex & 2) b1 |= (1 << bit);
          if (colorIndex & 4) b2 |= (1 << bit);
          if (colorIndex & 8) b3 |= (1 << bit);
        }
        gfxRom[groupOff] = b0;
        gfxRom[groupOff + 1] = b1;
        gfxRom[groupOff + 2] = b2;
        gfxRom[groupOff + 3] = b3;
      }
    }
  }

  // Set scroll2 tilemap base via CPS-A register 0x04
  // Value = base / 256
  function setScroll2Base(cpsaRegs: Uint8Array, vramBase: number) {
    const val = vramBase / 256;
    cpsaRegs[0x04] = (val >> 8) & 0xFF;
    cpsaRegs[0x05] = val & 0xFF;
  }

  // Set scroll2 X/Y via CPS-A registers 0x10/0x12
  // CPS1 adds CPS_HBEND(64) / CPS_VBEND(16) internally, so scroll=0
  // means virtual pixel 0 maps to screen pixel 0 after HBEND/VBEND offset
  function setScroll2XY(cpsaRegs: Uint8Array, scrollX: number, scrollY: number) {
    cpsaRegs[0x10] = (scrollX >> 8) & 0xFF;
    cpsaRegs[0x11] = scrollX & 0xFF;
    cpsaRegs[0x12] = (scrollY >> 8) & 0xFF;
    cpsaRegs[0x13] = scrollY & 0xFF;
  }

  // Write a 4-byte tilemap entry at the given VRAM offset
  function writeTilemapEntry(vram: Uint8Array, offset: number, code: number, palette: number, flipX = false, flipY = false) {
    vram[offset] = (code >> 8) & 0xFF;
    vram[offset + 1] = code & 0xFF;
    let attribs = palette & 0x1F;
    if (flipX) attribs |= (1 << 5);
    if (flipY) attribs |= (1 << 6);
    vram[offset + 2] = (attribs >> 8) & 0xFF;
    vram[offset + 3] = attribs & 0xFF;
  }

  it('returns null for out-of-bounds coordinates', () => {
    const { video } = createScrollTestVideo();
    expect(video.inspectScrollAt(-1, 0, 2)).toBeNull();
    expect(video.inspectScrollAt(0, -1, 2)).toBeNull();
    expect(video.inspectScrollAt(384, 0, 2)).toBeNull();
    expect(video.inspectScrollAt(0, 224, 2)).toBeNull();
  });

  it('returns null for invalid layer ID', () => {
    const { video } = createScrollTestVideo();
    expect(video.inspectScrollAt(0, 0, 0)).toBeNull(); // LAYER_OBJ
    expect(video.inspectScrollAt(0, 0, 5)).toBeNull(); // invalid
  });

  it('returns correct tile for scroll2 at (0,0)', () => {
    const { video, vram, gfxRom, cpsaRegs } = createScrollTestVideo();

    // Set tilemap base at VRAM offset 0x4000
    setScroll2Base(cpsaRegs, 0x4000);
    // Scroll = 0 (screen pixel 0,0 maps to virtual pixel 64,16 → tile col=4, row=1)
    setScroll2XY(cpsaRegs, 0, 0);

    // tilemap1Scan(4, 1) = (1 & 0x0f) + ((4 & 0x3f) << 4) + ((1 & 0x30) << 6) = 1 + 64 = 65
    const tileIndex = 65;
    const entryOffset = 0x4000 + tileIndex * 4;
    const tileCode = 0x42;
    writeTilemapEntry(vram, entryOffset, tileCode, 5);
    fillTile16(gfxRom, tileCode, 3); // color index 3

    const result = video.inspectScrollAt(0, 0, 2);
    expect(result).not.toBeNull();
    expect(result!.tileCode).toBe(tileCode);
    expect(result!.paletteIndex).toBe(5 + 0x40); // scroll2 group offset = 0x40
    expect(result!.colorIndex).toBe(3);
  });

  it('returns null for transparent pixel (colorIndex 15)', () => {
    const { video, vram, gfxRom, cpsaRegs } = createScrollTestVideo();

    setScroll2Base(cpsaRegs, 0x4000);
    setScroll2XY(cpsaRegs, 0, 0);

    const tileIndex = 65;
    const entryOffset = 0x4000 + tileIndex * 4;
    writeTilemapEntry(vram, entryOffset, 0x10, 2);
    fillTile16(gfxRom, 0x10, 15); // all transparent

    expect(video.inspectScrollAt(0, 0, 2)).toBeNull();
  });

  it('returns result for transparent pixel when boundsOnly=true', () => {
    const { video, vram, gfxRom, cpsaRegs } = createScrollTestVideo();

    setScroll2Base(cpsaRegs, 0x4000);
    setScroll2XY(cpsaRegs, 0, 0);

    const tileIndex = 65;
    const entryOffset = 0x4000 + tileIndex * 4;
    writeTilemapEntry(vram, entryOffset, 0x10, 2);
    fillTile16(gfxRom, 0x10, 15);

    const result = video.inspectScrollAt(0, 0, 2, true);
    expect(result).not.toBeNull();
    expect(result!.tileCode).toBe(0x10);
    expect(result!.colorIndex).toBe(15);
  });
});
