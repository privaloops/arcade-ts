/**
 * CPS1 Video — CPS-A / CPS-B Graphics Decoder
 *
 * Renders all 4 graphic layers of the CPS1 system:
 *   - Scroll 1: 8x8 tiles (foreground text / HUD)
 *   - Scroll 2: 16x16 tiles (main background)
 *   - Scroll 3: 32x32 tiles (far background)
 *   - Objects: 16x16 sprites with multi-tile chaining
 *
 * Native resolution: 384x224 pixels.
 *
 * Reference: MAME src/mame/capcom/cps1_v.cpp
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = 384;
const SCREEN_HEIGHT = 224;
const FRAMEBUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT * 4;

// Visible area offsets (from MAME cps1.h)
// The CPS1 generates a 512x262 raster; the visible window is 64..447 x 16..239.
// Tile scroll values and sprite coordinates are in the full raster space,
// so we must compensate when mapping to our 384x224 framebuffer.
const CPS_HBEND = 64;  // first visible horizontal pixel
const CPS_VBEND = 16;  // first visible vertical line

// VRAM is 192KB (0x30000 bytes). All VRAM offsets are relative to 0x900000.
const VRAM_SIZE = 0x30000;

// Tile sizes (in pixels)
const TILE8 = 8;
const TILE16 = 16;
const TILE32 = 32;


// ---------------------------------------------------------------------------
// CPS-A register offsets (byte offsets into cpsaRegs, read as 16-bit words)
// ---------------------------------------------------------------------------

const CPSA_OBJ_BASE      = 0x00; // Object (sprite) table base in VRAM
const CPSA_SCROLL1_BASE  = 0x02; // Scroll 1 tilemap base in VRAM
const CPSA_SCROLL2_BASE  = 0x04; // Scroll 2 tilemap base in VRAM
const CPSA_SCROLL3_BASE  = 0x06; // Scroll 3 tilemap base in VRAM
const CPSA_PALETTE_BASE  = 0x0A; // Palette base in VRAM
const CPSA_SCROLL1_XSCR  = 0x0C; // Scroll 1 X scroll
const CPSA_SCROLL1_YSCR  = 0x0E; // Scroll 1 Y scroll
const CPSA_SCROLL2_XSCR  = 0x10; // Scroll 2 X scroll
const CPSA_SCROLL2_YSCR  = 0x12; // Scroll 2 Y scroll
const CPSA_SCROLL3_XSCR  = 0x14; // Scroll 3 X scroll
const CPSA_SCROLL3_YSCR  = 0x16; // Scroll 3 Y scroll
const CPSA_OTHER_BASE    = 0x08; // Row scroll data base in VRAM
const CPSA_ROWSCROLL_OFFS = 0x20; // Row scroll offset register

// CPS-A register 0x22: video control (flip screen, rowscroll enable)
const CPSA_VIDEOCONTROL   = 0x22;

// ---------------------------------------------------------------------------
// CPS-B register offsets (byte offsets into cpsbRegs)
// ---------------------------------------------------------------------------

const CPSB_LAYER_CTRL     = 0x26; // Layer control register (SF2)
const CPSB_PALETTE_CTRL   = 0x30; // Palette control

// ---------------------------------------------------------------------------
// Layer identifiers (matching MAME convention)
// ---------------------------------------------------------------------------

const LAYER_OBJ     = 0; // MAME layer 0 = sprites
const LAYER_SCROLL1 = 1; // MAME layer 1 = scroll1
const LAYER_SCROLL2 = 2; // MAME layer 2 = scroll2
const LAYER_SCROLL3 = 3; // MAME layer 3 = scroll3

// SF2 (CPS_B_11) layer enable masks
const SF2_LAYER_ENABLE_SCROLL1 = 0x08;
const SF2_LAYER_ENABLE_SCROLL2 = 0x10;
const SF2_LAYER_ENABLE_SCROLL3 = 0x20;

// VRAM base alignment boundaries (from MAME video_start)
const SCROLL_SIZE    = 0x4000;
const OBJ_SIZE       = 0x0800;
const PALETTE_ALIGN  = 0x0400;

// ---------------------------------------------------------------------------
// Helper: read big-endian 16-bit word from a Uint8Array
// ---------------------------------------------------------------------------

function readWord(data: Uint8Array, offset: number): number {
  if (offset + 1 >= data.length) return 0;
  return (data[offset]! << 8) | data[offset + 1]!;
}

// ---------------------------------------------------------------------------
// Tilemap scan functions (from MAME)
// ---------------------------------------------------------------------------

/** Scroll 1 (8x8): 64x64 tiles = 512x512 virtual pixels */
function tilemap0Scan(col: number, row: number): number {
  return (row & 0x1f) + ((col & 0x3f) << 5) + ((row & 0x20) << 6);
}

/** Scroll 2 (16x16): 64x64 tiles = 1024x1024 virtual pixels */
function tilemap1Scan(col: number, row: number): number {
  return (row & 0x0f) + ((col & 0x3f) << 4) + ((row & 0x30) << 6);
}

/** Scroll 3 (32x32): 64x64 tiles = 2048x2048 virtual pixels */
function tilemap2Scan(col: number, row: number): number {
  return (row & 0x07) + ((col & 0x3f) << 3) + ((row & 0x38) << 6);
}


// ---------------------------------------------------------------------------
// GFX ROM bank mapper (from MAME gfxrom_bank_mapper)
// ---------------------------------------------------------------------------

const GFXTYPE_SPRITES = 1;
const GFXTYPE_SCROLL1 = 2;
const GFXTYPE_SCROLL2 = 4;
const GFXTYPE_SCROLL3 = 8;

interface GfxRange {
  type: number;
  start: number;
  end: number;
  bank: number;
}

const SF2_BANK_SIZES = [0x8000, 0x8000, 0x8000, 0];

const SF2_MAPPER_TABLE: GfxRange[] = [
  { type: GFXTYPE_SPRITES, start: 0x00000, end: 0x07fff, bank: 0 },
  { type: GFXTYPE_SPRITES, start: 0x08000, end: 0x0ffff, bank: 1 },
  { type: GFXTYPE_SPRITES, start: 0x10000, end: 0x11fff, bank: 2 },
  { type: GFXTYPE_SCROLL3, start: 0x02000, end: 0x03fff, bank: 2 },
  { type: GFXTYPE_SCROLL1, start: 0x04000, end: 0x04fff, bank: 2 },
  { type: GFXTYPE_SCROLL2, start: 0x05000, end: 0x07fff, bank: 2 },
];

// Pre-compute bank base offsets to avoid loop in hot path
const SF2_BANK_BASES: number[] = [];
{
  let base = 0;
  for (let i = 0; i < SF2_BANK_SIZES.length; i++) {
    SF2_BANK_BASES.push(base);
    base += SF2_BANK_SIZES[i]!;
  }
}

function gfxromBankMapper(type: number, code: number): number {
  let shift = 0;
  switch (type) {
    case GFXTYPE_SPRITES: shift = 1; break;
    case GFXTYPE_SCROLL1: shift = 0; break;
    case GFXTYPE_SCROLL2: shift = 1; break;
    case GFXTYPE_SCROLL3: shift = 3; break;
  }

  const shiftedCode = code << shift;

  for (let i = 0; i < SF2_MAPPER_TABLE.length; i++) {
    const range = SF2_MAPPER_TABLE[i]!;
    if (shiftedCode >= range.start && shiftedCode <= range.end) {
      if (range.type & type) {
        return (SF2_BANK_BASES[range.bank]! + (shiftedCode & (SF2_BANK_SIZES[range.bank]! - 1))) >> shift;
      }
    }
  }

  return -1; // Out of range
}

// ---------------------------------------------------------------------------
// GFX pixel decoding from interleaved graphics ROM.
// ---------------------------------------------------------------------------

/** Char sizes for each tile dimension */
const CHAR_SIZE_8 = 64;    // 8x8:   64 bytes
const CHAR_SIZE_16 = 128;  // 16x16: 128 bytes
const CHAR_SIZE_32 = 512;  // 32x32: 512 bytes

/** Row stride in bytes */
const ROW_STRIDE_8 = 8;    // 8 bytes per row for 8x8 and 16x16
const ROW_STRIDE_32 = 16;  // 16 bytes per row for 32x32

/**
 * Decode an entire row of 8 pixels from a 4-byte plane group.
 * Writes 8 palette indices into `out` starting at `outOffset`.
 * MSB-first: bit 7 = leftmost pixel (x=0).
 *
 * MAME planeoffset = {24, 16, 8, 0}:
 *   byte 0 → planeoffset  0 → bit 0 of color index
 *   byte 1 → planeoffset  8 → bit 1
 *   byte 2 → planeoffset 16 → bit 2
 *   byte 3 → planeoffset 24 → bit 3
 *
 * MAME readbit() uses (0x80 >> (bitnum % 8)) = MSB-first within each byte.
 */
function decodeRow(
  b0: number, b1: number, b2: number, b3: number,
  out: Uint8Array, outOffset: number,
): void {
  // b0 = bit 0, b1 = bit 1, b2 = bit 2, b3 = bit 3
  // Unrolled for all 8 pixels (MSB-first: bit 7 = pixel 0)
  out[outOffset]     = ((b0 >> 7) & 1) | (((b1 >> 7) & 1) << 1) | (((b2 >> 7) & 1) << 2) | (((b3 >> 7) & 1) << 3);
  out[outOffset + 1] = ((b0 >> 6) & 1) | (((b1 >> 6) & 1) << 1) | (((b2 >> 6) & 1) << 2) | (((b3 >> 6) & 1) << 3);
  out[outOffset + 2] = ((b0 >> 5) & 1) | (((b1 >> 5) & 1) << 1) | (((b2 >> 5) & 1) << 2) | (((b3 >> 5) & 1) << 3);
  out[outOffset + 3] = ((b0 >> 4) & 1) | (((b1 >> 4) & 1) << 1) | (((b2 >> 4) & 1) << 2) | (((b3 >> 4) & 1) << 3);
  out[outOffset + 4] = ((b0 >> 3) & 1) | (((b1 >> 3) & 1) << 1) | (((b2 >> 3) & 1) << 2) | (((b3 >> 3) & 1) << 3);
  out[outOffset + 5] = ((b0 >> 2) & 1) | (((b1 >> 2) & 1) << 1) | (((b2 >> 2) & 1) << 2) | (((b3 >> 2) & 1) << 3);
  out[outOffset + 6] = ((b0 >> 1) & 1) | (((b1 >> 1) & 1) << 1) | (((b2 >> 1) & 1) << 2) | (((b3 >> 1) & 1) << 3);
  out[outOffset + 7] = (b0 & 1) | ((b1 & 1) << 1) | ((b2 & 1) << 2) | ((b3 & 1) << 3);
}


// ---------------------------------------------------------------------------
// CPS1Video
// ---------------------------------------------------------------------------

export class CPS1Video {
  private readonly vram: Uint8Array;
  private readonly graphicsRom: Uint8Array;
  private readonly cpsaRegs: Uint8Array;
  private readonly cpsbRegs: Uint8Array;

  // Internal priority buffer
  private readonly priorityBuf: Uint8Array;

  // Pre-decoded palette cache: 16 RGBA32 values per palette entry
  // Max palettes: VRAM palette area can hold up to ~192 palettes (0x60 * 32 = 0x1800 bytes max used)
  // We cache up to 256 palettes (covers all group offsets)
  // Each palette = 16 colors, each color = 1 Uint32 (ABGR for little-endian canvas)
  private readonly paletteCache: Uint32Array;
  private paletteCacheValid: boolean = false;

  // Tile row decode buffer (reused across calls)
  private readonly tileRowBuf: Uint8Array;

  // Sprite double-buffer: MAME renders sprites from a buffered copy
  // updated at VBlank, not from live VRAM. This prevents tearing.
  private readonly objBuffer: Uint8Array;

  constructor(
    vram: Uint8Array,
    graphicsRom: Uint8Array,
    cpsaRegs: Uint8Array,
    cpsbRegs: Uint8Array,
  ) {
    this.vram = vram;
    this.graphicsRom = graphicsRom;
    this.cpsaRegs = cpsaRegs;
    this.cpsbRegs = cpsbRegs;
    this.priorityBuf = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    this.objBuffer = new Uint8Array(OBJ_SIZE);
    this.paletteCache = new Uint32Array(256 * 16); // 256 palettes * 16 colors
    this.tileRowBuf = new Uint8Array(32); // max tile width = 32 pixels
  }

  // -------------------------------------------------------------------------
  // CPS-A register helpers
  // -------------------------------------------------------------------------

  private readCpsaReg(offset: number): number {
    return readWord(this.cpsaRegs, offset);
  }

  private readCpsbReg(offset: number): number {
    return readWord(this.cpsbRegs, offset);
  }

  private vramBaseOffset(regOffset: number, boundary: number): number {
    const regValue = this.readCpsaReg(regOffset);
    let base = regValue * 256;
    base &= ~(boundary - 1);
    const byteAddr = base & 0x3FFFF;
    return byteAddr < VRAM_SIZE ? byteAddr : byteAddr % VRAM_SIZE;
  }

  // -------------------------------------------------------------------------
  // Palette decoding
  // -------------------------------------------------------------------------

  /**
   * Decode a 16-bit CPS1 palette color to RGBA.
   */
  decodeColor(colorValue: number): [number, number, number, number] {
    const bright = 0x0f + (((colorValue >> 12) & 0x0f) << 1);

    const r = Math.min(255, ((colorValue >> 8) & 0x0f) * 0x11 * bright / 0x2d | 0);
    const g = Math.min(255, ((colorValue >> 4) & 0x0f) * 0x11 * bright / 0x2d | 0);
    const b = Math.min(255, ((colorValue >> 0) & 0x0f) * 0x11 * bright / 0x2d | 0);

    return [r, g, b, 255];
  }

  /**
   * Decode a 16-bit CPS1 palette color directly to a packed RGBA32 value.
   * Uses 0xFFBBGGRR format (little-endian ABGR for canvas ImageData).
   */
  private decodeColorPacked(colorValue: number): number {
    const bright = 0x0f + (((colorValue >> 12) & 0x0f) << 1);

    const r = Math.min(255, ((colorValue >> 8) & 0x0f) * 0x11 * bright / 0x2d | 0);
    const g = Math.min(255, ((colorValue >> 4) & 0x0f) * 0x11 * bright / 0x2d | 0);
    const b = Math.min(255, ((colorValue >> 0) & 0x0f) * 0x11 * bright / 0x2d | 0);

    // ABGR little-endian: byte order in memory = R, G, B, A
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  /**
   * Build the palette cache for the current frame.
   * Pre-decodes all palette colors from VRAM into packed RGBA32 values.
   */
  private buildPaletteCache(paletteBase: number): void {
    const vram = this.vram;
    const cache = this.paletteCache;

    // Decode up to 256 palettes * 16 colors
    for (let pal = 0; pal < 256; pal++) {
      const palOffset = paletteBase + pal * 32;
      const cacheBase = pal * 16;

      if (palOffset + 31 >= VRAM_SIZE) {
        // Fill remaining with transparent black
        for (let c = 0; c < 16; c++) {
          cache[cacheBase + c] = 0;
        }
        continue;
      }

      for (let c = 0; c < 16; c++) {
        const colorWord = (vram[palOffset + c * 2]! << 8) | vram[palOffset + c * 2 + 1]!;
        cache[cacheBase + c] = this.decodeColorPacked(colorWord);
      }
    }

    this.paletteCacheValid = true;
  }

  /**
   * Read a palette color from VRAM (legacy API, kept for compatibility).
   */
  private readPaletteColor(
    paletteBase: number,
    paletteIndex: number,
    colorIndex: number,
  ): [number, number, number, number] {
    const offset = paletteBase + paletteIndex * 32 + colorIndex * 2;
    if (offset + 1 >= VRAM_SIZE) return [0, 0, 0, 0];
    const colorWord = readWord(this.vram, offset);
    return this.decodeColor(colorWord);
  }

  // -------------------------------------------------------------------------
  // Scroll layer rendering (tile-based)
  // -------------------------------------------------------------------------

  /**
   * Render a scroll tilemap layer using tile-based iteration.
   * Instead of iterating per-pixel (384x224 = 86K iterations per layer),
   * we iterate over visible tiles and blit them in bulk.
   */
  renderScrollLayer(layerIndex: number, framebuffer: Uint8Array): void {
    let tileW: number;
    let tileH: number;
    let scrollXReg: number;
    let scrollYReg: number;
    let baseReg: number;
    let scanFn: (col: number, row: number) => number;
    let paletteGroupOffset: number;
    let codeMask: number;
    let gfxType: number;
    let charSize: number;
    let rowStride: number;

    switch (layerIndex) {
      case LAYER_SCROLL1:
        tileW = TILE8;
        tileH = TILE8;
        scrollXReg = CPSA_SCROLL1_XSCR;
        scrollYReg = CPSA_SCROLL1_YSCR;
        baseReg = CPSA_SCROLL1_BASE;
        scanFn = tilemap0Scan;
        paletteGroupOffset = 0x20;
        codeMask = 0xFFFF;
        gfxType = GFXTYPE_SCROLL1;
        charSize = CHAR_SIZE_8;
        rowStride = ROW_STRIDE_8;
        break;
      case LAYER_SCROLL2:
        tileW = TILE16;
        tileH = TILE16;
        scrollXReg = CPSA_SCROLL2_XSCR;
        scrollYReg = CPSA_SCROLL2_YSCR;
        baseReg = CPSA_SCROLL2_BASE;
        scanFn = tilemap1Scan;
        paletteGroupOffset = 0x40;
        codeMask = 0xFFFF;
        gfxType = GFXTYPE_SCROLL2;
        charSize = CHAR_SIZE_16;
        rowStride = ROW_STRIDE_8;
        break;
      case LAYER_SCROLL3:
        tileW = TILE32;
        tileH = TILE32;
        scrollXReg = CPSA_SCROLL3_XSCR;
        scrollYReg = CPSA_SCROLL3_YSCR;
        baseReg = CPSA_SCROLL3_BASE;
        scanFn = tilemap2Scan;
        paletteGroupOffset = 0x60;
        codeMask = 0x3FFF;
        gfxType = GFXTYPE_SCROLL3;
        charSize = CHAR_SIZE_32;
        rowStride = ROW_STRIDE_32;
        break;
      default:
        return;
    }

    // In MAME, scroll values are applied to the tilemap, then the visible
    // cliprect (starting at CPS_HBEND, CPS_VBEND) selects which portion is
    // drawn. Since our framebuffer starts at (0,0) = visible pixel (64,16),
    // we must add the visible area offset to the scroll values.
    const baseScrollX = (this.readCpsaReg(scrollXReg) + CPS_HBEND) & 0xFFFF;
    const scrollY = (this.readCpsaReg(scrollYReg) + CPS_VBEND) & 0xFFFF;

    // Row scroll for scroll2: when videocontrol bit 0 is set, each row of
    // scroll2 has an independent X scroll offset from the "other" VRAM region.
    // From MAME: m_scroll2x + m_other[(i + otheroffs) & 0x3ff]
    const videocontrol = this.readCpsaReg(CPSA_VIDEOCONTROL);
    const useRowScroll = layerIndex === LAYER_SCROLL2 && (videocontrol & 0x01) !== 0;
    let otherBase = 0;
    let otherOffs = 0;
    if (useRowScroll) {
      otherBase = this.vramBaseOffset(CPSA_OTHER_BASE, 0x0800);
      otherOffs = this.readCpsaReg(CPSA_ROWSCROLL_OFFS);
    }
    const scrollX = baseScrollX; // default; overridden per-row if rowscroll
    const tilemapBase = this.vramBaseOffset(baseReg, SCROLL_SIZE);
    const paletteBase = this.vramBaseOffset(CPSA_PALETTE_BASE, PALETTE_ALIGN);

    // Build palette cache if not done yet this frame
    if (!this.paletteCacheValid) {
      this.buildPaletteCache(paletteBase);
    }

    const virtualW = 64 * tileW;
    const virtualH = 64 * tileH;
    const gfxRom = this.graphicsRom;
    const gfxRomLen = gfxRom.length;
    const vram = this.vram;
    const palCache = this.paletteCache;
    const prioBuf = this.priorityBuf;
    const rowBuf = this.tileRowBuf;

    // Use Uint32Array view for 4-byte writes
    const fb32 = new Uint32Array(framebuffer.buffer, framebuffer.byteOffset, framebuffer.byteLength / 4);

    // Row scroll mode for scroll2: render per-scanline with per-row X offset
    // From MAME: for (int i = 0; i < 256; i++)
    //   set_scrollx((i - scrly) & 0x3ff, m_scroll2x + m_other[(i + otheroffs) & 0x3ff])
    // where scrly = -m_scroll2y, i = screen row
    if (useRowScroll) {
      for (let screenY = 0; screenY < SCREEN_HEIGHT; screenY++) {
        const vy = ((screenY + scrollY) & 0xFFFF) % virtualH;
        // MAME: other[(i + otheroffs) & 0x3ff] where i = screenY
        const otherIdx = (screenY + otherOffs) & 0x3FF;
        const otherAddr = otherBase + otherIdx * 2;
        const rowOffset = otherAddr + 1 < VRAM_SIZE
          ? ((this.vram[otherAddr]! << 8) | this.vram[otherAddr + 1]!) & 0xFFFF
          : 0;
        // Sign-extend the 16-bit row offset
        const rowOffsetSigned = rowOffset > 0x7FFF ? rowOffset - 0x10000 : rowOffset;
        const rowScrollX = (baseScrollX + rowOffsetSigned) & 0xFFFF;

        for (let screenX = 0; screenX < SCREEN_WIDTH; screenX++) {
          const vx = ((screenX + rowScrollX) & 0xFFFF) % virtualW;
          const tileCol = (vx / tileW) | 0;
          const tileRow = (vy / tileH) | 0;
          const tileIndex = scanFn(tileCol, tileRow);
          const entryOffset = tilemapBase + tileIndex * 4;
          if (entryOffset + 3 >= VRAM_SIZE) continue;

          const rawCode = ((vram[entryOffset]! << 8) | vram[entryOffset + 1]!) & codeMask;
          const tileCode = gfxromBankMapper(gfxType, rawCode);
          if (tileCode === -1) continue;

          const attribs = (vram[entryOffset + 2]! << 8) | vram[entryOffset + 3]!;
          const palette = (attribs & 0x1F) + paletteGroupOffset;
          const flipXb = (attribs >> 5) & 1;
          const flipYb = (attribs >> 6) & 1;

          let localX = vx % tileW;
          let localY = vy % tileH;
          if (flipXb) localX = tileW - 1 - localX;
          if (flipYb) localY = tileH - 1 - localY;

          // Decode pixel inline (16x16 tile)
          const charBase = tileCode * charSize;
          const halfOff = localX >= 8 ? 4 : 0;
          const planeBase = charBase + localY * rowStride + halfOff;
          const bit = 7 - (localX & 7);
          if (planeBase + 3 >= gfxRomLen) continue;

          const colorIdx =
            ((gfxRom[planeBase + 3]! >> bit) & 1) |
            (((gfxRom[planeBase + 2]! >> bit) & 1) << 1) |
            (((gfxRom[planeBase + 1]! >> bit) & 1) << 2) |
            (((gfxRom[planeBase]! >> bit) & 1) << 3);

          if (colorIdx === 15) continue;
          fb32[screenY * SCREEN_WIDTH + screenX] = palCache[palette * 16 + colorIdx]!;
        }
      }
      return; // done with row scroll path
    }

    // Calculate which tiles are visible on screen (with partial tiles at edges)
    // First visible virtual pixel
    const vxStart = ((scrollX) & 0xFFFF) % virtualW;
    const vyStart = ((scrollY) & 0xFFFF) % virtualH;

    // First tile col/row
    const startTileCol = (vxStart / tileW) | 0;
    const startTileRow = (vyStart / tileH) | 0;

    // Number of tiles that fit on screen (+ 1 for partial tiles at edges)
    const numTileCols = ((SCREEN_WIDTH / tileW) | 0) + 2;
    const numTileRows = ((SCREEN_HEIGHT / tileH) | 0) + 2;

    // Offset of first tile's top-left pixel within the screen
    const firstTilePixelX = -(vxStart % tileW);
    const firstTilePixelY = -(vyStart % tileH);

    const isScroll1 = layerIndex === LAYER_SCROLL1;
    // Number of 8-pixel groups per tile row
    const groupsPerRow = tileW >> 3;

    for (let tileRowIdx = 0; tileRowIdx < numTileRows; tileRowIdx++) {
      const tileRow = (startTileRow + tileRowIdx) % 64;
      const screenTileY = firstTilePixelY + tileRowIdx * tileH;

      // Skip if entirely off screen
      if (screenTileY >= SCREEN_HEIGHT) break;
      if (screenTileY + tileH <= 0) continue;

      for (let tileColIdx = 0; tileColIdx < numTileCols; tileColIdx++) {
        const tileCol = (startTileCol + tileColIdx) % 64;
        const screenTileX = firstTilePixelX + tileColIdx * tileW;

        // Skip if entirely off screen
        if (screenTileX >= SCREEN_WIDTH) break;
        if (screenTileX + tileW <= 0) continue;

        // Tilemap lookup
        const tileIndex = scanFn(tileCol, tileRow);
        const entryOffset = tilemapBase + tileIndex * 4;
        if (entryOffset + 3 >= VRAM_SIZE) continue;

        const rawCode = ((vram[entryOffset]! << 8) | vram[entryOffset + 1]!) & codeMask;
        const tileCode = gfxromBankMapper(gfxType, rawCode);
        if (tileCode === -1) continue;

        const attribs = (vram[entryOffset + 2]! << 8) | vram[entryOffset + 3]!;
        const palette = (attribs & 0x1F) + paletteGroupOffset;
        const flipX = (attribs >> 5) & 1;
        const flipY = (attribs >> 6) & 1;

        // For scroll1, MAME alternates gfx set based on tileIndex bit 5
        const gfxSetOffset = isScroll1 ? ((tileIndex & 0x20) >> 5) * 4 : 0;

        const charBase = tileCode * charSize;
        const palCacheBase = palette * 16;

        // Iterate over each row of the tile
        for (let ty = 0; ty < tileH; ty++) {
          const screenY = screenTileY + ty;
          if (screenY < 0 || screenY >= SCREEN_HEIGHT) continue;

          const localY = flipY ? (tileH - 1 - ty) : ty;
          const rowBase = charBase + localY * rowStride + gfxSetOffset;

          const fbRowBase = screenY * SCREEN_WIDTH;

          // Decode each 8-pixel group in this tile row
          for (let group = 0; group < groupsPerRow; group++) {
            const groupScreenX = screenTileX + (flipX ? (groupsPerRow - 1 - group) * 8 : group * 8);

            // Quick check: if the entire 8-pixel group is off screen, skip
            if (groupScreenX >= SCREEN_WIDTH || groupScreenX + 8 <= 0) continue;

            // For 16x16 tiles, each row has two 4-byte groups (left half at +0, right half at +4)
            // For 32x32 tiles, each row has four 4-byte groups
            // For 8x8 tiles (with gfxSet), the offset is already in gfxSetOffset
            const planeBase = rowBase + (isScroll1 ? 0 : group * 4);

            if (planeBase + 3 >= gfxRomLen) continue;

            // MAME planeoffset: byte[3]=plane0(bit0), byte[0]=plane3(bit3)
            // decodeRow expects: b0=bit0, b1=bit1, b2=bit2, b3=bit3
            const b0 = gfxRom[planeBase + 3]!; // plane 0 = bit 0
            const b1 = gfxRom[planeBase + 2]!; // plane 1 = bit 1
            const b2 = gfxRom[planeBase + 1]!; // plane 2 = bit 2
            const b3 = gfxRom[planeBase]!;     // plane 3 = bit 3

            decodeRow(b0, b1, b2, b3, rowBuf, 0);

            // Blit the 8 pixels
            for (let px = 0; px < 8; px++) {
              const sx = flipX ? groupScreenX + 7 - px : groupScreenX + px;
              if (sx < 0 || sx >= SCREEN_WIDTH) continue;

              const colorIdx = rowBuf[px]!;
              if (colorIdx === 15) continue; // transparent pen

              const fbPixelIdx = fbRowBase + sx;
              fb32[fbPixelIdx] = palCache[palCacheBase + colorIdx]!;
              prioBuf[fbPixelIdx] = 1;
            }
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Object (sprite) rendering
  // -------------------------------------------------------------------------

  /**
   * Render all objects (sprites) from the object table in VRAM.
   */
  renderObjects(framebuffer: Uint8Array): void {
    const paletteBase = this.vramBaseOffset(CPSA_PALETTE_BASE, PALETTE_ALIGN);

    // Build palette cache if not done yet this frame
    if (!this.paletteCacheValid) {
      this.buildPaletteCache(paletteBase);
    }

    const MAX_ENTRIES = OBJ_SIZE / 8; // 256 sprites

    // Read from the buffered sprite table (copied at start of frame)
    const objData = this.objBuffer;

    // Find last sprite (end-of-table marker)
    let lastSpriteIdx = MAX_ENTRIES - 1;
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const entryOffset = i * 8;
      if (entryOffset + 7 >= OBJ_SIZE) break;
      const colour = (objData[entryOffset + 6]! << 8) | objData[entryOffset + 7]!;
      if ((colour & 0xFF00) === 0xFF00) {
        lastSpriteIdx = i - 1;
        break;
      }
    }

    const fb32 = new Uint32Array(framebuffer.buffer, framebuffer.byteOffset, framebuffer.byteLength / 4);
    const palCache = this.paletteCache;
    const gfxRom = this.graphicsRom;
    const gfxRomLen = gfxRom.length;
    const rowBuf = this.tileRowBuf;

    // Render from last to first (lower index = draws on top)
    for (let i = lastSpriteIdx; i >= 0; i--) {
      const entryOffset = i * 8;
      if (entryOffset + 7 >= OBJ_SIZE) continue;

      const x = (objData[entryOffset]! << 8) | objData[entryOffset + 1]!;
      const y = (objData[entryOffset + 2]! << 8) | objData[entryOffset + 3]!;
      const code = (objData[entryOffset + 4]! << 8) | objData[entryOffset + 5]!;
      const colour = (objData[entryOffset + 6]! << 8) | objData[entryOffset + 7]!;

      const col = colour & 0x1F;
      const flipX = (colour >> 5) & 1;
      const flipY = (colour >> 6) & 1;

      if (colour & 0xFF00) {
        // Multi-tile (blocked) sprite
        // MAME does tile arithmetic on RAW code, then bank-maps each sub-tile
        const nx = ((colour >> 8) & 0x0F) + 1;
        const ny = ((colour >> 12) & 0x0F) + 1;

        for (let nys = 0; nys < ny; nys++) {
          for (let nxs = 0; nxs < nx; nxs++) {
            const sx = ((x + nxs * 16) & 0x1FF) - CPS_HBEND;
            const sy = ((y + nys * 16) & 0x1FF) - CPS_VBEND;

            if (sx >= SCREEN_WIDTH || sx + 15 < 0) continue;
            if (sy >= SCREEN_HEIGHT || sy + 15 < 0) continue;

            // Calculate sub-tile from RAW code (before bank mapping)
            let rawTile: number;
            if (flipY) {
              if (flipX) {
                rawTile = (code & ~0x0F) + ((code + (nx - 1) - nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
              } else {
                rawTile = (code & ~0x0F) + ((code + nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
              }
            } else {
              if (flipX) {
                rawTile = (code & ~0x0F) + ((code + (nx - 1) - nxs) & 0x0F) + 0x10 * nys;
              } else {
                rawTile = (code & ~0x0F) + ((code + nxs) & 0x0F) + 0x10 * nys;
              }
            }

            // Bank-map each sub-tile individually
            const tileCode = gfxromBankMapper(GFXTYPE_SPRITES, rawTile);
            if (tileCode === -1) continue;

            this.drawSpriteTileFast(
              fb32, palCache, gfxRom, gfxRomLen, rowBuf,
              tileCode, col, flipX, flipY,
              sx, sy,
            );
          }
        }
      } else {
        // Single 16x16 sprite tile
        const mappedCode = gfxromBankMapper(GFXTYPE_SPRITES, code);
        if (mappedCode === -1) continue;
        this.drawSpriteTileFast(
          fb32, palCache, gfxRom, gfxRomLen, rowBuf,
          mappedCode, col, flipX, flipY,
          (x & 0x1FF) - CPS_HBEND, (y & 0x1FF) - CPS_VBEND,
        );
      }
    }
  }

  /**
   * Draw a single 16x16 sprite tile using batch decoding.
   * Uses Uint32Array for single-op pixel writes and pre-cached palette.
   */
  private drawSpriteTileFast(
    fb32: Uint32Array,
    palCache: Uint32Array,
    gfxRom: Uint8Array,
    gfxRomLen: number,
    rowBuf: Uint8Array,
    tileCode: number,
    palette: number,
    flipX: number,
    flipY: number,
    sx: number,
    sy: number,
  ): void {
    const charBase = tileCode * CHAR_SIZE_16;
    const palCacheBase = palette * 16;

    // sx, sy are now signed screen coordinates (can be negative for partial sprites)
    for (let py = 0; py < TILE16; py++) {
      const drawY = sy + py;
      if (drawY < 0) continue;
      if (drawY >= SCREEN_HEIGHT) continue;

      const localY = flipY ? (TILE16 - 1 - py) : py;
      const rowBase = charBase + localY * ROW_STRIDE_8;
      const fbRowBase = drawY * SCREEN_WIDTH;

      // Decode left half (pixels 0-7)
      // decodeRow args: b0=bit0, b1=bit1, b2=bit2, b3=bit3
      // MAME planeoffset: byte[3]=plane0(bit0), byte[2]=plane1, byte[1]=plane2, byte[0]=plane3(bit3)
      if (rowBase + 3 < gfxRomLen) {
        decodeRow(gfxRom[rowBase + 3]!, gfxRom[rowBase + 2]!, gfxRom[rowBase + 1]!, gfxRom[rowBase]!, rowBuf, 0);
      }
      // Decode right half (pixels 8-15)
      if (rowBase + 7 < gfxRomLen) {
        decodeRow(gfxRom[rowBase + 7]!, gfxRom[rowBase + 6]!, gfxRom[rowBase + 5]!, gfxRom[rowBase + 4]!, rowBuf, 8);
      }

      // Blit 16 pixels
      for (let px = 0; px < TILE16; px++) {
        const drawX = sx + px;
        if (drawX < 0) continue;
        if (drawX >= SCREEN_WIDTH) continue;

        const gfxPx = flipX ? (TILE16 - 1 - px) : px;
        const colorIdx = rowBuf[gfxPx]!;
        if (colorIdx === 15) continue; // transparent pen

        fb32[fbRowBase + drawX] = palCache[palCacheBase + colorIdx]!;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Layer priority resolution (CPS-B)
  // -------------------------------------------------------------------------

  private getLayerOrder(): number[] {
    const ctrl = this.readCpsbReg(CPSB_LAYER_CTRL);

    const l0 = (ctrl >> 0x06) & 0x03;
    const l1 = (ctrl >> 0x08) & 0x03;
    const l2 = (ctrl >> 0x0a) & 0x03;
    const l3 = (ctrl >> 0x0c) & 0x03;

    return [l0, l1, l2, l3];
  }

  // -------------------------------------------------------------------------
  // Layer enable check
  // -------------------------------------------------------------------------

  private isLayerEnabled(layerId: number): boolean {
    const layercontrol = this.readCpsbReg(CPSB_LAYER_CTRL);
    const videocontrol = this.readCpsaReg(CPSA_VIDEOCONTROL);

    switch (layerId) {
      case LAYER_OBJ:
        return true;
      case LAYER_SCROLL1:
        return (layercontrol & SF2_LAYER_ENABLE_SCROLL1) !== 0;
      case LAYER_SCROLL2:
        return (layercontrol & SF2_LAYER_ENABLE_SCROLL2) !== 0 &&
               (videocontrol & 0x04) !== 0;
      case LAYER_SCROLL3:
        return (layercontrol & SF2_LAYER_ENABLE_SCROLL3) !== 0 &&
               (videocontrol & 0x08) !== 0;
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // Full frame rendering
  // -------------------------------------------------------------------------

  renderFrame(framebuffer: Uint8Array): void {
    if (framebuffer.length < FRAMEBUFFER_SIZE) {
      throw new Error(
        `Framebuffer too small: expected ${FRAMEBUFFER_SIZE} bytes, got ${framebuffer.length}`
      );
    }

    // Invalidate palette cache for new frame
    this.paletteCacheValid = false;

    // Buffer sprites: copy obj table from VRAM to internal buffer (like MAME's m_buffered_obj)
    const objBase = this.vramBaseOffset(CPSA_OBJ_BASE, OBJ_SIZE);
    const copyLen = Math.min(OBJ_SIZE, VRAM_SIZE - objBase);
    if (copyLen > 0) {
      this.objBuffer.set(this.vram.subarray(objBase, objBase + copyLen));
    }

    // 1. Clear framebuffer to black (RGBA = 0, 0, 0, 255)
    // Use Uint32Array for fast fill: 0xFF000000 = ABGR(255, 0, 0, 0) = opaque black
    const fb32 = new Uint32Array(framebuffer.buffer, framebuffer.byteOffset, framebuffer.byteLength / 4);
    fb32.fill(0xFF000000);

    // 2. Clear priority buffer
    this.priorityBuf.fill(0);

    // 3. Get layer order from CPS-B (l0 = back, l3 = front)
    const layerOrder = this.getLayerOrder();

    // 4. Render layers from back to front
    for (let slot = 0; slot < layerOrder.length; slot++) {
      const layerId = layerOrder[slot]!;

      if (!this.isLayerEnabled(layerId)) continue;

      if (layerId === LAYER_OBJ) {
        this.renderObjects(framebuffer);
      } else {
        this.renderScrollLayer(layerId, framebuffer);
      }
    }
  }
}
