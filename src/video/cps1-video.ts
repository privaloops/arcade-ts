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

// VRAM is 192KB (0x30000 bytes). All VRAM offsets are relative to 0x900000.
const VRAM_SIZE = 0x30000;

// Tile sizes (in pixels)
const TILE8 = 8;
const TILE16 = 16;
const TILE32 = 32;


// ---------------------------------------------------------------------------
// CPS-A register offsets (byte offsets into cpsaRegs, read as 16-bit words)
//
// Each register is a 16-bit word at the given byte offset (big-endian).
// The bus stores CPS-A registers as a raw Uint8Array in big-endian format.
//
// MAME uses word indices: CPS1_OBJ_BASE = 0x00/2 = 0, CPS1_SCROLL1_BASE = 0x02/2 = 1, etc.
// Our byte offsets: multiply MAME's word index by 2 to get the byte offset.
// ---------------------------------------------------------------------------

const CPSA_OBJ_BASE      = 0x00; // Object (sprite) table base in VRAM
const CPSA_SCROLL1_BASE  = 0x02; // Scroll 1 tilemap base in VRAM
const CPSA_SCROLL2_BASE  = 0x04; // Scroll 2 tilemap base in VRAM
const CPSA_SCROLL3_BASE  = 0x06; // Scroll 3 tilemap base in VRAM
const CPSA_OTHER_BASE    = 0x08; // "Other" base (row scroll, etc.)
const CPSA_PALETTE_BASE  = 0x0A; // Palette base in VRAM
const CPSA_SCROLL1_XSCR  = 0x0C; // Scroll 1 X scroll
const CPSA_SCROLL1_YSCR  = 0x0E; // Scroll 1 Y scroll
const CPSA_SCROLL2_XSCR  = 0x10; // Scroll 2 X scroll
const CPSA_SCROLL2_YSCR  = 0x12; // Scroll 2 Y scroll
const CPSA_SCROLL3_XSCR  = 0x14; // Scroll 3 X scroll
const CPSA_SCROLL3_YSCR  = 0x16; // Scroll 3 Y scroll

// CPS-A register 0x22: video control (flip screen, rowscroll enable)
const CPSA_VIDEOCONTROL   = 0x22;

// ---------------------------------------------------------------------------
// CPS-B register offsets (byte offsets into cpsbRegs)
//
// For SF2 (CPS_B_11):
//   layer_control = 0x26
//   priority masks = {0x28, 0x2a, 0x2c, 0x2e}
//   palette_control = 0x30
//   layer_enable_mask = {0x08, 0x10, 0x20, 0x00, 0x00}
// ---------------------------------------------------------------------------

const CPSB_LAYER_CTRL     = 0x26; // Layer control register (SF2)
const CPSB_PALETTE_CTRL   = 0x30; // Palette control

// ---------------------------------------------------------------------------
// Layer identifiers (matching MAME convention)
//
// MAME uses: 0 = sprites, 1 = scroll1, 2 = scroll2, 3 = scroll3
// Our internal rendering uses the same convention for layer order,
// but LAYER_SCROLL1/2/3 are used for the scroll render dispatch.
// ---------------------------------------------------------------------------

const LAYER_OBJ     = 0; // MAME layer 0 = sprites
const LAYER_SCROLL1 = 1; // MAME layer 1 = scroll1
const LAYER_SCROLL2 = 2; // MAME layer 2 = scroll2
const LAYER_SCROLL3 = 3; // MAME layer 3 = scroll3

// SF2 (CPS_B_11) layer enable masks: {0x08, 0x10, 0x20, 0x00, 0x00}
// scroll1 enabled when layercontrol & 0x08
// scroll2 enabled when (layercontrol & 0x10) && (videocontrol & 0x04)
// scroll3 enabled when (layercontrol & 0x20) && (videocontrol & 0x08)
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
//
// These map (col, row) to a tile_index used to address the tilemap in VRAM.
// All tilemaps are logically 64 columns x 64 rows but use different row
// grouping to create different effective virtual sizes.
//
// Each tilemap entry is 2 words (4 bytes) in VRAM.
// The tile_index is multiplied by 4 (bytes) to get the VRAM byte offset.
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
//
// The CPS1 uses a PAL to map tile codes to physical GFX ROM addresses.
// Different layer types (sprites, scroll1/2/3) use different code ranges
// within the same ROM data. The mapper shifts the code based on tile size
// and then looks up which ROM bank contains that code.
//
// For SF2 (mapper_STF29):
//   bank_sizes = [0x8000, 0x8000, 0x8000, 0]
//   Sprites:  0x00000-0x07fff -> bank 0
//   Sprites:  0x08000-0x0ffff -> bank 1
//   Sprites:  0x10000-0x11fff -> bank 2
//   Scroll3:  0x02000-0x03fff -> bank 2
//   Scroll1:  0x04000-0x04fff -> bank 2
//   Scroll2:  0x05000-0x07fff -> bank 2
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

/**
 * Map a tile code to a physical GFX ROM tile index.
 *
 * From MAME cps_state::gfxrom_bank_mapper:
 *   1. Shift the code left by a type-dependent amount (8x8=0, 16x16=1, 32x32=3)
 *   2. Find the matching range in the mapper table
 *   3. Calculate: (bank_base + (shifted_code & (bank_size - 1))) >> shift
 *
 * Returns -1 if the code is out of range (tile should be transparent).
 */
function gfxromBankMapper(type: number, code: number): number {
  let shift = 0;
  switch (type) {
    case GFXTYPE_SPRITES: shift = 1; break;
    case GFXTYPE_SCROLL1: shift = 0; break;
    case GFXTYPE_SCROLL2: shift = 1; break;
    case GFXTYPE_SCROLL3: shift = 3; break;
  }

  const shiftedCode = code << shift;

  for (const range of SF2_MAPPER_TABLE) {
    if (shiftedCode >= range.start && shiftedCode <= range.end) {
      if (range.type & type) {
        let base = 0;
        for (let i = 0; i < range.bank; i++) {
          base += SF2_BANK_SIZES[i]!;
        }
        return (base + (shiftedCode & (SF2_BANK_SIZES[range.bank]! - 1))) >> shift;
      }
    }
  }

  return -1; // Out of range
}

// ---------------------------------------------------------------------------
// GFX pixel decoding from interleaved graphics ROM.
//
// For all layouts, the plane offsets are {24,16,8,0} in bits, meaning:
//   byte[3] = plane 0, byte[2] = plane 1, byte[1] = plane 2, byte[0] = plane 3
//
// The bit index within each byte corresponds to the pixel X position (0-7).
// ---------------------------------------------------------------------------

/** Char sizes for each tile dimension */
const CHAR_SIZE_8 = 64;    // 8x8:   64 bytes
const CHAR_SIZE_16 = 128;  // 16x16: 128 bytes
const CHAR_SIZE_32 = 512;  // 32x32: 512 bytes

/** Row stride in bytes */
const ROW_STRIDE_8 = 8;    // 8 bytes per row for 8x8 and 16x16
const ROW_STRIDE_32 = 16;  // 16 bytes per row for 32x32

/**
 * Read a pixel from the graphics ROM for an 8x8 tile.
 * tileCode indexes into 64-byte chars.
 * localX: 0-7, localY: 0-7
 * gfxSet: 0 = bytes 0-3 (cps1_layout8x8), 1 = bytes 4-7 (cps1_layout8x8_2)
 */
function getGfxPixel8(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
  gfxSet: number = 0,
): number {
  const charBase = tileCode * CHAR_SIZE_8;
  const rowBase = charBase + localY * ROW_STRIDE_8 + gfxSet * 4;

  if (rowBase + 3 >= graphicsRom.length) return 0;

  const bit = 7 - localX;  // MSB-first: bit 7 = leftmost pixel
  return ((graphicsRom[rowBase + 3]! >> bit) & 1) |
         (((graphicsRom[rowBase + 2]! >> bit) & 1) << 1) |
         (((graphicsRom[rowBase + 1]! >> bit) & 1) << 2) |
         (((graphicsRom[rowBase]! >> bit) & 1) << 3);
}

/**
 * Read a pixel from the graphics ROM for a 16x16 tile.
 * tileCode indexes into 128-byte chars.
 * localX: 0-15, localY: 0-15
 */
function getGfxPixel16(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
): number {
  const charBase = tileCode * CHAR_SIZE_16;
  const rowBase = charBase + localY * ROW_STRIDE_8;
  const halfOff = localX >= 8 ? 4 : 0;
  const planeBase = rowBase + halfOff;
  const bit = 7 - (localX & 7);  // MSB-first: bit 7 = leftmost pixel

  if (planeBase + 3 >= graphicsRom.length) return 0;

  return ((graphicsRom[planeBase + 3]! >> bit) & 1) |
         (((graphicsRom[planeBase + 2]! >> bit) & 1) << 1) |
         (((graphicsRom[planeBase + 1]! >> bit) & 1) << 2) |
         (((graphicsRom[planeBase]! >> bit) & 1) << 3);
}

/**
 * Read a pixel from the graphics ROM for a 32x32 tile.
 * tileCode indexes into 512-byte chars.
 * localX: 0-31, localY: 0-31
 */
function getGfxPixel32(
  graphicsRom: Uint8Array,
  tileCode: number,
  localX: number,
  localY: number,
): number {
  const charBase = tileCode * CHAR_SIZE_32;
  const rowBase = charBase + localY * ROW_STRIDE_32;
  const groupOff = (localX >> 3) * 4;
  const planeBase = rowBase + groupOff;
  const bit = 7 - (localX & 7);  // MSB-first: bit 7 = leftmost pixel

  if (planeBase + 3 >= graphicsRom.length) return 0;

  return ((graphicsRom[planeBase + 3]! >> bit) & 1) |
         (((graphicsRom[planeBase + 2]! >> bit) & 1) << 1) |
         (((graphicsRom[planeBase + 1]! >> bit) & 1) << 2) |
         (((graphicsRom[planeBase]! >> bit) & 1) << 3);
}

// ---------------------------------------------------------------------------
// CPS1Video
// ---------------------------------------------------------------------------

export class CPS1Video {
  private readonly vram: Uint8Array;
  private readonly graphicsRom: Uint8Array;
  private readonly cpsaRegs: Uint8Array;
  private readonly cpsbRegs: Uint8Array;

  // Internal priority buffer: stores the priority value per pixel so we can
  // composite layers correctly. 0 = transparent / not yet drawn.
  private readonly priorityBuf: Uint8Array;

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

  /**
   * Get the VRAM byte offset for a given base register and alignment boundary.
   *
   * From MAME cps1_base():
   *   int base = m_cps_a_regs[offset] * 256;
   *   base &= ~(boundary - 1);
   *   return &m_gfxram[(base & 0x3ffff) / 2];
   *
   * MAME gfxram is a uint16_t array, so the /2 converts a byte address to a
   * word index. Our VRAM is a byte array, so we keep the byte address.
   */
  private vramBaseOffset(regOffset: number, boundary: number): number {
    const regValue = this.readCpsaReg(regOffset);
    let base = regValue * 256;
    base &= ~(boundary - 1);
    const byteAddr = base & 0x3FFFF;
    // Clamp to VRAM size (192KB is not a power of 2)
    return byteAddr < VRAM_SIZE ? byteAddr : byteAddr % VRAM_SIZE;
  }

  // -------------------------------------------------------------------------
  // Palette decoding
  // -------------------------------------------------------------------------

  /**
   * Decode a 16-bit CPS1 palette color to RGBA.
   *
   * From MAME cps1_build_palette():
   *   bright = 0x0f + ((palette >> 12) << 1);
   *   r = ((palette >> 8) & 0x0f) * 0x11 * bright / 0x2d;
   *   g = ((palette >> 4) & 0x0f) * 0x11 * bright / 0x2d;
   *   b = ((palette >> 0) & 0x0f) * 0x11 * bright / 0x2d;
   *
   * The format is: BBBBrrrrggggbbbb where BBBB is a 4-bit brightness value.
   * When brightness nibble is 0, bright = 0x0f, giving ~1/3 brightness.
   * When brightness nibble is 0xf, bright = 0x2d (= 45), giving full brightness.
   */
  decodeColor(colorValue: number): [number, number, number, number] {
    const bright = 0x0f + (((colorValue >> 12) & 0x0f) << 1);

    const r = Math.min(255, ((colorValue >> 8) & 0x0f) * 0x11 * bright / 0x2d | 0);
    const g = Math.min(255, ((colorValue >> 4) & 0x0f) * 0x11 * bright / 0x2d | 0);
    const b = Math.min(255, ((colorValue >> 0) & 0x0f) * 0x11 * bright / 0x2d | 0);

    return [r, g, b, 255];
  }

  /**
   * Read a palette color from VRAM.
   *
   * The palette base points to a region of VRAM containing palette data.
   * MAME organizes palettes in groups of 32 colors (512 bytes per page,
   * 6 pages). Each palette entry = 16 colors * 2 bytes = 32 bytes.
   *
   * @param paletteBase - VRAM byte offset of the palette data
   * @param paletteIndex - Palette number (absolute, includes layer group offset)
   * @param colorIndex - Color within the palette (0-15)
   * @returns RGBA tuple
   */
  private readPaletteColor(
    paletteBase: number,
    paletteIndex: number,
    colorIndex: number,
  ): [number, number, number, number] {
    // Each palette = 16 colors * 2 bytes = 32 bytes
    const offset = paletteBase + paletteIndex * 32 + colorIndex * 2;
    if (offset + 1 >= VRAM_SIZE) return [0, 0, 0, 0];
    const colorWord = readWord(this.vram, offset);
    return this.decodeColor(colorWord);
  }

  // -------------------------------------------------------------------------
  // Scroll layer rendering
  // -------------------------------------------------------------------------

  /**
   * Render a scroll tilemap layer.
   *
   * From MAME get_tile0_info / get_tile1_info / get_tile2_info:
   *   code = m_scrollN[2 * tile_index]
   *   attr = m_scrollN[2 * tile_index + 1]
   *   color = (attr & 0x1f) + palette_group_offset
   *   flip  = (attr & 0x60) >> 5  (bit 5 = X flip, bit 6 = Y flip)
   *
   * Scroll3 additionally masks: code & 0x3fff
   *
   * Palette group offsets: scroll1 = 0x20, scroll2 = 0x40, scroll3 = 0x60
   *
   * All tilemaps are 64x64 tiles with non-trivial scan functions.
   *
   * @param layerIndex - LAYER_SCROLL1, LAYER_SCROLL2, or LAYER_SCROLL3
   * @param framebuffer - RGBA framebuffer (384x224 x 4 bytes)
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
    let getPixel: (rom: Uint8Array, code: number, x: number, y: number) => number;

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
        getPixel = getGfxPixel8;
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
        getPixel = getGfxPixel16;
        break;
      case LAYER_SCROLL3:
        tileW = TILE32;
        tileH = TILE32;
        scrollXReg = CPSA_SCROLL3_XSCR;
        scrollYReg = CPSA_SCROLL3_YSCR;
        baseReg = CPSA_SCROLL3_BASE;
        scanFn = tilemap2Scan;
        paletteGroupOffset = 0x60;
        codeMask = 0x3FFF; // MAME: m_scroll3[2*tile_index] & 0x3fff
        gfxType = GFXTYPE_SCROLL3;
        getPixel = getGfxPixel32;
        break;
      default:
        return;
    }

    const scrollX = this.readCpsaReg(scrollXReg);
    const scrollY = this.readCpsaReg(scrollYReg);
    const tilemapBase = this.vramBaseOffset(baseReg, SCROLL_SIZE);
    const paletteBase = this.vramBaseOffset(CPSA_PALETTE_BASE, PALETTE_ALIGN);

    // Virtual tilemap: 64x64 tiles
    const tilemapCols = 64;
    const tilemapRows = 64;
    const virtualW = tilemapCols * tileW;
    const virtualH = tilemapRows * tileH;

    for (let screenY = 0; screenY < SCREEN_HEIGHT; screenY++) {
      for (let screenX = 0; screenX < SCREEN_WIDTH; screenX++) {
        // Apply scroll to get the virtual pixel coordinate
        const vx = ((screenX + scrollX) & 0xFFFF) % virtualW;
        const vy = ((screenY + scrollY) & 0xFFFF) % virtualH;

        // Which tile in the tilemap?
        const tileCol = (vx / tileW) | 0;
        const tileRow = (vy / tileH) | 0;

        // Use MAME's scan function to get the tile_index
        const tileIndex = scanFn(tileCol, tileRow);

        // Each tilemap entry is 2 words (4 bytes). tile_index addresses words
        // in a uint16_t array. In our byte array: offset = tileIndex * 4.
        const entryOffset = tilemapBase + tileIndex * 4;
        if (entryOffset + 3 >= VRAM_SIZE) continue;

        // Word 0: tile code, Word 1: attributes
        const rawCode = readWord(this.vram, entryOffset) & codeMask;
        const tileCode = gfxromBankMapper(gfxType, rawCode);
        if (tileCode === -1) continue; // out of range -> transparent
        const attribs = readWord(this.vram, entryOffset + 2);

        // From MAME: color = (attr & 0x1f) + group_offset
        // flip = TILE_FLIPYX((attr & 0x60) >> 5)
        //   TILE_FLIPYX expands to: bit 0 = X flip, bit 1 = Y flip
        //   So: (attr >> 5) & 1 = X flip, (attr >> 6) & 1 = Y flip
        const palette = (attribs & 0x1F) + paletteGroupOffset;
        const flipX = (attribs >> 5) & 1;
        const flipY = (attribs >> 6) & 1;

        // Pixel position within the tile
        let localX = vx % tileW;
        let localY = vy % tileH;

        if (flipX) localX = tileW - 1 - localX;
        if (flipY) localY = tileH - 1 - localY;

        // For scroll1 (8x8), MAME alternates gfx set based on tile_index bit 5:
        //   gfxset = (tile_index & 0x20) >> 5
        // This alternates between cps1_layout8x8 (bytes 0-3) and cps1_layout8x8_2 (bytes 4-7)
        let colorIdx: number;
        if (layerIndex === LAYER_SCROLL1) {
          const gfxSet = (tileIndex & 0x20) >> 5;
          colorIdx = getGfxPixel8(this.graphicsRom, tileCode, localX, localY, gfxSet);
        } else {
          colorIdx = getPixel(this.graphicsRom, tileCode, localX, localY);
        }

        // Color index 15 (0xf) is transparent for tilemaps in MAME
        // (prio_transpen uses pen 15 as transparent for scroll layers)
        if (colorIdx === 15) continue;

        const fbIdx = (screenY * SCREEN_WIDTH + screenX) * 4;
        const prioIdx = screenY * SCREEN_WIDTH + screenX;

        const [r, g, b, a] = this.readPaletteColor(paletteBase, palette, colorIdx);
        framebuffer[fbIdx] = r;
        framebuffer[fbIdx + 1] = g;
        framebuffer[fbIdx + 2] = b;
        framebuffer[fbIdx + 3] = a;
        this.priorityBuf[prioIdx] = 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Object (sprite) rendering
  // -------------------------------------------------------------------------

  /**
   * Render all objects (sprites) from the object table in VRAM.
   *
   * From MAME cps1_render_sprites() and the sprite format comment:
   *
   *   xx xx yy yy nn nn aa aa
   *
   *   Word 0 (+0): X position (9 bits used)
   *   Word 1 (+2): Y position (9 bits used)
   *   Word 2 (+4): Tile code (16-bit)
   *   Word 3 (+6): Attributes:
   *     bits 0-4:   palette (5-bit color)
   *     bit 5:      X flip
   *     bit 6:      Y flip
   *     bits 8-11:  nx (X block size in tiles, 0 = 1 tile)
   *     bits 12-15: ny (Y block size in tiles, 0 = 1 tile)
   *
   * End of table marker: (colour & 0xff00) == 0xff00
   *
   * The obj table size is 0x0800 bytes = 256 entries of 8 bytes each.
   * Sprites are rendered from last to first (lower index = higher priority).
   *
   * Multi-tile sprite tile calculation (from MAME, no-flip case):
   *   (code & ~0xf) + ((code + nxs) & 0xf) + 0x10 * nys
   */
  renderObjects(framebuffer: Uint8Array): void {
    const objBase = this.vramBaseOffset(CPSA_OBJ_BASE, OBJ_SIZE);
    const paletteBase = this.vramBaseOffset(CPSA_PALETTE_BASE, PALETTE_ALIGN);

    // Object table: 0x0800 bytes / 2 = 0x400 words, each sprite = 4 words
    const OBJ_WORD_SIZE = OBJ_SIZE / 2; // 0x400 words
    const MAX_ENTRIES = OBJ_WORD_SIZE / 4; // 256 sprites

    // Find last sprite (end-of-table marker: attribute word upper byte = 0xFF)
    let lastSpriteIdx = MAX_ENTRIES - 1;
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const entryOffset = objBase + i * 8;
      if (entryOffset + 7 >= VRAM_SIZE) break;
      const colour = readWord(this.vram, entryOffset + 6);
      if ((colour & 0xFF00) === 0xFF00) {
        lastSpriteIdx = i - 1;
        break;
      }
    }

    // Render from last to first (lower index = draws on top)
    for (let i = lastSpriteIdx; i >= 0; i--) {
      const entryOffset = objBase + i * 8;
      if (entryOffset + 7 >= VRAM_SIZE) continue;

      const x = readWord(this.vram, entryOffset);
      const y = readWord(this.vram, entryOffset + 2);
      const code = readWord(this.vram, entryOffset + 4);
      const colour = readWord(this.vram, entryOffset + 6);

      // Map the base tile code through the bank mapper first
      const mappedBaseCode = gfxromBankMapper(GFXTYPE_SPRITES, code);
      if (mappedBaseCode === -1) continue; // out of range

      const col = colour & 0x1F;
      const flipX = (colour >> 5) & 1;
      const flipY = (colour >> 6) & 1;

      if (colour & 0xFF00) {
        // Multi-tile (blocked) sprite
        const nx = ((colour >> 8) & 0x0F) + 1;
        const ny = ((colour >> 12) & 0x0F) + 1;

        for (let nys = 0; nys < ny; nys++) {
          for (let nxs = 0; nxs < nx; nxs++) {
            const sx = (x + nxs * 16) & 0x1FF;
            const sy = (y + nys * 16) & 0x1FF;

            // Tile code calculation from MAME (handles flip variants)
            // Applied to the MAPPED base code, same arithmetic
            let tileCode: number;
            if (flipY) {
              if (flipX) {
                tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (nx - 1) - nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
              } else {
                tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
              }
            } else {
              if (flipX) {
                tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (nx - 1) - nxs) & 0x0F) + 0x10 * nys;
              } else {
                tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * nys;
              }
            }

            this.drawSpriteTile(
              framebuffer, paletteBase,
              tileCode, col, flipX, flipY,
              sx, sy,
            );
          }
        }
      } else {
        // Simple case: single 16x16 sprite tile
        this.drawSpriteTile(
          framebuffer, paletteBase,
          mappedBaseCode, col, flipX, flipY,
          x & 0x1FF, y & 0x1FF,
        );
      }
    }
  }

  /**
   * Draw a single 16x16 sprite tile to the framebuffer.
   * Transparent pixel = color index 15 (MAME uses transpen 15 for sprites).
   */
  private drawSpriteTile(
    framebuffer: Uint8Array,
    paletteBase: number,
    tileCode: number,
    palette: number,
    flipX: number,
    flipY: number,
    sx: number,
    sy: number,
  ): void {
    for (let py = 0; py < TILE16; py++) {
      const drawY = (sy + py) & 0x1FF;
      if (drawY >= SCREEN_HEIGHT) continue;

      for (let px = 0; px < TILE16; px++) {
        const drawX = (sx + px) & 0x1FF;
        if (drawX >= SCREEN_WIDTH) continue;

        const gfxPx = flipX ? (TILE16 - 1 - px) : px;
        const gfxPy = flipY ? (TILE16 - 1 - py) : py;

        const colorIdx = getGfxPixel16(this.graphicsRom, tileCode, gfxPx, gfxPy);
        if (colorIdx === 15) continue; // transparent pen

        const fbIdx = (drawY * SCREEN_WIDTH + drawX) * 4;

        const [r, g, b, a] = this.readPaletteColor(paletteBase, palette, colorIdx);
        framebuffer[fbIdx] = r;
        framebuffer[fbIdx + 1] = g;
        framebuffer[fbIdx + 2] = b;
        framebuffer[fbIdx + 3] = a;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Layer priority resolution (CPS-B)
  // -------------------------------------------------------------------------

  /**
   * Determine the rendering order of layers based on CPS-B layer control.
   *
   * From MAME render_layers():
   *   int layercontrol = m_cps_b_regs[m_game_config->layer_control / 2];
   *   int l0 = (layercontrol >> 0x06) & 0x03;
   *   int l1 = (layercontrol >> 0x08) & 0x03;
   *   int l2 = (layercontrol >> 0x0a) & 0x03;
   *   int l3 = (layercontrol >> 0x0c) & 0x03;
   *
   * Layer IDs: 0 = sprites, 1 = scroll1, 2 = scroll2, 3 = scroll3
   * l0 is drawn first (back), l3 is drawn last (front).
   */
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

  /**
   * Check if a layer is enabled.
   *
   * From MAME cps1_get_video_base():
   *   layercontrol = m_cps_b_regs[m_game_config->layer_control / 2];
   *   videocontrol = m_cps_a_regs[CPS1_VIDEOCONTROL];
   *   scroll1: layercontrol & layer_enable_mask[0]
   *   scroll2: (layercontrol & layer_enable_mask[1]) && (videocontrol & 4)
   *   scroll3: (layercontrol & layer_enable_mask[2]) && (videocontrol & 8)
   *
   * For SF2 (CPS_B_11): masks are {0x08, 0x10, 0x20, 0x00, 0x00}
   * Sprites are always enabled (mask = 0x00 means no check needed).
   */
  private isLayerEnabled(layerId: number): boolean {
    const layercontrol = this.readCpsbReg(CPSB_LAYER_CTRL);
    const videocontrol = this.readCpsaReg(CPSA_VIDEOCONTROL);

    switch (layerId) {
      case LAYER_OBJ:
        return true; // Sprites always enabled for SF2
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

  /**
   * Render a complete frame into an RGBA framebuffer (384x224 x 4 bytes).
   *
   * The rendering pipeline:
   * 1. Clear the framebuffer to black
   * 2. Clear the priority buffer
   * 3. Determine layer order from CPS-B registers
   * 4. Render layers from back to front
   */
  renderFrame(framebuffer: Uint8Array): void {
    if (framebuffer.length < FRAMEBUFFER_SIZE) {
      throw new Error(
        `Framebuffer too small: expected ${FRAMEBUFFER_SIZE} bytes, got ${framebuffer.length}`
      );
    }

    // 1. Clear framebuffer to black (RGBA = 0, 0, 0, 255)
    for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
      const base = i * 4;
      framebuffer[base] = 0;
      framebuffer[base + 1] = 0;
      framebuffer[base + 2] = 0;
      framebuffer[base + 3] = 255;
    }

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
