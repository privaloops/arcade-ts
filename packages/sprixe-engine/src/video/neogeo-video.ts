/**
 * Neo-Geo LSPC2 Video — Sprite + Fix Layer Renderer
 *
 * The Neo-Geo video system is fundamentally different from CPS1:
 * - Everything is sprites (381 sprite slots, no scroll layers)
 * - Sprites are vertical columns of 16x16 tiles (up to 32 tiles tall)
 * - Sprites chain horizontally via the "sticky bit"
 * - One fix layer (40x32 grid of 8x8 tiles) composited on top
 * - Hardware sprite scaling via shrink tables (L0-ROM, 000-lo.lo)
 *
 * VRAM layout:
 *   SCB1 (0x0000-0x6FFF): tile codes + attributes (64 words per sprite, 32 tiles max)
 *   FIX  (0x7000-0x74FF): fix layer tilemap (40x32 = 1280 entries)
 *   SCB2 (0x8000-0x81FF): shrink coefficients (1 word per sprite)
 *   SCB3 (0x8200-0x83FF): Y position, sticky bit, tile height (1 word per sprite)
 *   SCB4 (0x8400-0x85FF): X position (1 word per sprite)
 *
 * Native resolution: 320x224 pixels.
 */

import {
  NGO_SCREEN_WIDTH, NGO_SCREEN_HEIGHT,
  NGO_MAX_SPRITES, NGO_SPRITES_PER_LINE,
  NGO_SCB1_BASE, NGO_SCB2_BASE, NGO_SCB3_BASE, NGO_SCB4_BASE, NGO_FIX_BASE,
  NGO_TILE_BYTES, NGO_FIX_TILE_BYTES,
} from '../neogeo-constants';
import { decodeNeoGeoRow, decodeFixRow } from './neogeo-tile-encoder';
import { FixBankType } from '../memory/neogeo-cmc';

// ---------------------------------------------------------------------------
// Palette decoding
// ---------------------------------------------------------------------------

/**
 * Decode a Neo-Geo 16-bit color word to ABGR Uint32.
 *
 * Hardware format (wiki.neogeodev.org):
 *   15  14 13 12 | 11 10  9  8 |  7  6  5  4 |  3  2  1  0
 *    D  R0 G0 B0 | R4 R3 R2 R1 | G4 G3 G2 G1 | B4 B3 B2 B1
 *
 * Each channel = 5 bits (high nibble + LSB). The dark bit (D) acts as a
 * 6th bit on the hardware DAC (8200 Ohm resistor, weakest weight).
 * We expand the 6-bit value linearly to 8 bits.
 */
export function decodeNeoGeoColor(word: number): number {
  const dark = (word >>> 15) & 1;

  // 5-bit channels: high nibble from packed field, LSB from bits 14-12
  const r5 = ((word >> 7) & 0x1E) | ((word >> 14) & 1);
  const g5 = ((word >> 3) & 0x1E) | ((word >> 13) & 1);
  const b5 = ((word << 1) & 0x1E) | ((word >> 12) & 1);

  // 6-bit with dark as LSB (minimal contribution, matches hardware DAC)
  const r6 = (r5 << 1) | dark;
  const g6 = (g5 << 1) | dark;
  const b6 = (b5 << 1) | dark;

  // Expand 6-bit → 8-bit
  const r8 = (r6 << 2) | (r6 >> 4);
  const g8 = (g6 << 2) | (g6 >> 4);
  const b8 = (b6 << 2) | (b6 >> 4);

  return (0xFF << 24) | (b8 << 16) | (g8 << 8) | r8; // ABGR for Uint32Array
}

// ---------------------------------------------------------------------------
// Sprite entry parsing
// ---------------------------------------------------------------------------

export interface NeoGeoSpriteEntry {
  index: number;
  tileCode: number;
  palette: number;
  flipH: boolean;
  flipV: boolean;
  x: number;
  y: number;
  height: number;  // number of tiles vertically (1-32)
  sticky: boolean;
  autoAnim4: boolean;
  autoAnim8: boolean;
}

export interface SpriteGroup {
  sprites: NeoGeoSpriteEntry[];
  x: number;
  y: number;
  width: number;  // in tiles
  height: number; // in tiles
}

// ---------------------------------------------------------------------------
// NeoGeoVideo class
// ---------------------------------------------------------------------------

// Neo-Geo visible window within the 512-line virtual scanline space
const VLINE_TOP = 0x10;   // first visible line (16)
const VLINE_BOT = 0xF0;   // first line below visible area (240)

// X zoom bitmasks (from MAME): each entry selects which of 16 source pixels to draw
const ZOOM_X_TABLES: readonly number[] = [
  0x0080, 0x0880, 0x0888, 0x2888, 0x288a, 0x2a8a, 0x2aaa, 0xaaaa,
  0xaaea, 0xbaea, 0xbaeb, 0xbbeb, 0xbbef, 0xfbef, 0xfbff, 0xffff,
];

export class NeoGeoVideo {
  private vram: Uint8Array;
  private spritesRom: Uint8Array;
  private fixedRom: Uint8Array;
  private biosFixedRom: Uint8Array;
  private zoomRom: Uint8Array;       // L0 ROM (000-lo.lo) — shrink lookup table
  private paletteRam: Uint8Array;
  private paletteCache: Uint32Array;  // 4096 entries, decoded ABGR (active bank)
  private paletteBankOffset: number;  // 0 or 0x2000 bytes (matches bus bank)
  private fb: Uint8Array;             // 320x224x4 RGBA
  private fb32: Uint32Array;          // same buffer as Uint32Array view
  private paletteDirty: boolean;
  private autoAnimCounter: () => number;  // delegate to bus counter
  private tileMask: number;           // wraps tile codes to ROM range
  private _dbgHideFrom = 0;          // debug: hide sprites in range [from, to)
  private _dbgHideTo = 0;

  constructor() {
    this.vram = new Uint8Array(0x11000);  // ~68KB
    this.spritesRom = new Uint8Array(0);
    this.fixedRom = new Uint8Array(0);
    this.biosFixedRom = new Uint8Array(0);
    this.zoomRom = NeoGeoVideo.buildDefaultZoomTable();
    this.paletteRam = new Uint8Array(0x4000); // 16KB (2 banks)
    this.paletteCache = new Uint32Array(4096);
    this.paletteBankOffset = 0;
    const buffer = new ArrayBuffer(NGO_SCREEN_WIDTH * NGO_SCREEN_HEIGHT * 4);
    this.fb = new Uint8Array(buffer);
    this.fb32 = new Uint32Array(buffer);
    this.paletteDirty = true;
    this.autoAnimCounter = () => 0;
    this.tileMask = 0;
  }

  /**
   * Build a linear approximation of the L0 shrink table (000-lo.lo).
   * 256 zoom levels × 256 entries. Each entry = (tileIndex << 4) | rowInTile.
   * For zoom level Z, entries 0..Z map linearly across all 256 source rows.
   */
  private static buildDefaultZoomTable(): Uint8Array {
    const table = new Uint8Array(0x10000);
    for (let z = 0; z < 256; z++) {
      const base = z << 8;
      for (let n = 0; n <= z; n++) {
        // Linear interpolation: n maps to source line n*255/z (0..255)
        const src = z > 0 ? Math.round(n * 255 / z) : 0;
        table[base + n] = src;
      }
    }
    return table;
  }

  setRoms(
    spritesRom: Uint8Array,
    fixedRom: Uint8Array,
    biosFixedRom: Uint8Array,
    zoomRom?: Uint8Array,
  ): void {
    this.spritesRom = spritesRom;
    this.fixedRom = fixedRom;
    this.biosFixedRom = biosFixedRom;
    // Use real L0 ROM if provided and non-empty, otherwise keep the linear fallback
    if (zoomRom && zoomRom.length >= 0x10000 && zoomRom.some(b => b !== 0)) {
      this.zoomRom = zoomRom;
      console.log('[NeoGeo Video] Using real L0 zoom ROM (000-lo.lo)');
    } else {
      console.warn('[NeoGeo Video] No L0 ROM — using linear fallback zoom table');
    }
    // Compute tile mask: next power-of-2 tile count minus 1
    const tileCount = spritesRom.length / NGO_TILE_BYTES;
    let pot = 1;
    while (pot < tileCount) pot <<= 1;
    this.tileMask = pot - 1;
  }

  getVram(): Uint8Array { return this.vram; }
  getPaletteRam(): Uint8Array { return this.paletteRam; }

  /** Set VRAM reference (shared with NeoGeoBus) */
  setVram(vram: Uint8Array): void { this.vram = vram; }
  /** Set palette RAM reference (shared with NeoGeoBus) */
  setPaletteRam(paletteRam: Uint8Array): void { this.paletteRam = paletteRam; }

  /** Set auto-animation counter source (delegate to bus) */
  setAutoAnimSource(fn: () => number): void { this.autoAnimCounter = fn; }

  /** Switch fix layer ROM source (BIOS sfix.sfix vs game S-ROM) */
  private useBiosFixRom: boolean = true;
  /** Fix layer banking type for CMC games with S-ROM > 128KB */
  private fixBankType: FixBankType = FixBankType.NONE;
  /** Pre-allocated buffers for fix layer rendering (avoid per-frame GC) */
  private readonly fixRow = new Uint8Array(8);
  private readonly garouBanks = new Int32Array(32);

  setFixRomMode(useBios: boolean): void { this.useBiosFixRom = useBios; }
  setFixBankType(type: FixBankType): void { this.fixBankType = type; }

  // ---------------------------------------------------------------------------
  // VRAM helpers
  // ---------------------------------------------------------------------------

  readVramWord(addr: number): number {
    const off = (addr & 0xFFFF) * 2;
    if (off + 1 < this.vram.length) {
      return (this.vram[off]! << 8) | this.vram[off + 1]!;
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Palette cache
  // ---------------------------------------------------------------------------

  private shadowMode: boolean = false;

  private rebuildPaletteCache(): void {
    const off = this.paletteBankOffset;
    const shadow = this.shadowMode;
    for (let i = 0; i < 4096; i++) {
      const word = (this.paletteRam[off + i * 2]! << 8) | this.paletteRam[off + i * 2 + 1]!;
      const abgr = decodeNeoGeoColor(word);
      if (shadow) {
        // Shadow mode halves each channel. MAME: shadow mask 0x7F7F7F7F
        // preserves alpha and right-shifts RGB by one. Used by the BIOS
        // eye-catcher flash and by games for drop shadows.
        const a = abgr & 0xFF000000;
        const rgb = (abgr & 0x00FEFEFE) >>> 1;
        this.paletteCache[i] = (a | rgb) >>> 0;
      } else {
        this.paletteCache[i] = abgr;
      }
    }
    this.paletteDirty = false;
  }

  markPaletteDirty(): void { this.paletteDirty = true; }

  /** Switch active palette bank (0 or 1). MAME: set_palette_bank. */
  setPaletteBank(bank: number): void {
    const newOffset = bank ? 0x2000 : 0;
    if (newOffset !== this.paletteBankOffset) {
      this.paletteBankOffset = newOffset;
      this.paletteDirty = true;
    }
  }

  /** Toggle LSPC shadow mode (reg 0x3A0001 / 0x3A0011). When on, all
   *  decoded palette entries are halved — used by the Neo-Geo BIOS
   *  eye-catcher flash and per-sprite shadows. */
  setShadowMode(on: boolean): void {
    if (this.shadowMode !== on) {
      this.shadowMode = on;
      this.paletteDirty = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Sprite entry reading
  // ---------------------------------------------------------------------------

  /** Read sprite entry from SCB1-SCB4 */
  readSpriteEntry(index: number): NeoGeoSpriteEntry {
    // SCB3: Y, sticky, height
    const scb3 = this.readVramWord(NGO_SCB3_BASE + index);
    const yVirt = (0x200 - (scb3 >> 7)) & 0x1FF; // Y in 512-line virtual space
    const y = yVirt - VLINE_TOP; // convert to screen coordinate
    const sticky = ((scb3 >> 6) & 1) === 1;
    const height = (scb3 & 0x3F) + 1; // 6-bit height (0=1 tile)

    // SCB4: X position (9-bit unsigned, values > 0x1F0 wrap to left)
    const scb4 = this.readVramWord(NGO_SCB4_BASE + index);
    let xSigned = (scb4 >> 7) & 0x1FF;
    if (xSigned > 0x1F0) xSigned -= 0x200;

    // SCB1: first tile entry (2 words per tile)
    const scb1Base = NGO_SCB1_BASE + index * 64; // 64 words per sprite = 32 tiles max × 2
    const tileWord0 = this.readVramWord(scb1Base);      // tile number low 16 bits
    const tileWord1 = this.readVramWord(scb1Base + 1);  // attributes

    const tileCode = tileWord0 | ((tileWord1 & 0xF0) << 12); // 20-bit tile code
    const palette = (tileWord1 >> 8) & 0xFF;
    const autoAnim8 = ((tileWord1 >> 3) & 1) === 1;
    const autoAnim4 = ((tileWord1 >> 2) & 1) === 1;
    const flipV = ((tileWord1 >> 1) & 1) === 1;
    const flipH = (tileWord1 & 1) === 1;

    return {
      index, tileCode, palette, flipH, flipV,
      x: xSigned, y, height, sticky, autoAnim4, autoAnim8,
    };
  }

  /** Read all sprites and group by sticky chain */
  readAllSpriteGroups(): SpriteGroup[] {
    const groups: SpriteGroup[] = [];
    let currentGroup: NeoGeoSpriteEntry[] = [];
    let groupX = 0;
    let groupY = 0;

    for (let i = 0; i < NGO_MAX_SPRITES; i++) {
      const entry = this.readSpriteEntry(i);

      if (!entry.sticky || currentGroup.length === 0) {
        // Start new group
        if (currentGroup.length > 0) {
          groups.push({
            sprites: currentGroup,
            x: groupX,
            y: groupY,
            width: currentGroup.length,
            height: currentGroup[0]!.height,
          });
        }
        currentGroup = [entry];
        groupX = entry.x;
        groupY = entry.y;
      } else {
        // Continue sticky chain — inherit Y and height from master
        currentGroup.push(entry);
      }
    }

    // Push last group
    if (currentGroup.length > 0) {
      groups.push({
        sprites: currentGroup,
        x: groupX,
        y: groupY,
        width: currentGroup.length,
        height: currentGroup[0]!.height,
      });
    }

    return groups;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Render a complete frame into the framebuffer.
   * Pipeline:
   *   1. Clear framebuffer with backdrop color (palette[0xFFF] of active bank)
   *   2. Render all sprites (back to front: high index = behind, low index = in front)
   *   3. Render fix layer on top
   */
  // Per-sprite state computed in the forward pass each frame
  private readonly sprX = new Int16Array(NGO_MAX_SPRITES);
  private readonly sprYRaw = new Uint16Array(NGO_MAX_SPRITES);  // Y in 512-line space
  private readonly sprSize = new Uint8Array(NGO_MAX_SPRITES);   // raw size (0-63)
  private readonly sprYZoom = new Uint8Array(NGO_MAX_SPRITES);  // vertical shrink (0-255)
  private readonly sprXZoom = new Uint8Array(NGO_MAX_SPRITES);  // horizontal zoom (0-15)

  /** Prepare framebuffer for a new frame (clear + palette). Call once before renderSlice().
   *  Backdrop color on Neo-Geo = palette[0xFFF] of the active bank (MAME neogeo_v.cpp:71,
   *  FBNeo neogeo.cpp). Using palette[0] was a bug that showed BIOS RAM test residue
   *  (0xAAAA pattern → greenish) instead of the game's background color. */
  beginFrame(): void {
    if (this.paletteDirty) this.rebuildPaletteCache();
    this.fb32.fill(this.paletteCache[0xFFF]!);
  }

  /**
   * Render a slice of scanlines [y0, y1) using current VRAM state.
   * Re-runs the forward pass each slice so mid-frame VRAM changes (IRQ2) are picked up.
   */
  renderSlice(y0: number, y1: number): void {
    if (y0 >= y1) return;
    if (this.paletteDirty) this.rebuildPaletteCache();

    // Read auto-animation counter once per slice (shared by all sprites)
    const animCounter = this.autoAnimCounter();

    // Forward pass: hardware maintains running X/Y/size registers across sticky chains
    let chainX = 0, chainYRaw = 0, chainSize = 0, chainYZoom = 0;
    let xZoom = 0;
    for (let i = 0; i < NGO_MAX_SPRITES; i++) {
      const scb2 = this.readVramWord(NGO_SCB2_BASE + i);
      const scb3 = this.readVramWord(NGO_SCB3_BASE + i);
      const sticky = (scb3 >> 6) & 1;

      if (!sticky) {
        chainYRaw = (0x200 - (scb3 >> 7)) & 0x1FF;
        chainSize = scb3 & 0x3F;
        chainYZoom = scb2 & 0xFF;
        const scb4 = this.readVramWord(NGO_SCB4_BASE + i);
        chainX = (scb4 >> 7) & 0x1FF;
        xZoom = (scb2 >> 8) & 0x0F;
      } else {
        chainX = (chainX + xZoom + 1) & 0x1FF;
        xZoom = (scb2 >> 8) & 0x0F;
      }

      this.sprX[i] = chainX;
      this.sprYRaw[i] = chainYRaw;
      this.sprSize[i] = chainSize;
      this.sprYZoom[i] = chainYZoom;
      this.sprXZoom[i] = xZoom;
    }

    for (let i = 0; i < NGO_MAX_SPRITES; i++) {
      this.renderSprite(i, animCounter, y0, y1);
    }

    this.renderFixLayer(y0, y1);
  }

  /** Copy internal framebuffer to output. */
  copyFramebuffer(framebuffer: Uint8Array): void {
    framebuffer.set(this.fb);
  }

  /** Legacy single-pass render (no mid-frame VRAM changes). */
  renderFrame(framebuffer: Uint8Array): void {
    this.beginFrame();
    this.renderSlice(0, NGO_SCREEN_HEIGHT);
    framebuffer.set(this.fb);
  }

  // Reusable row buffers (avoid per-row allocation)
  private readonly rowBuf = new Uint8Array(8);
  private readonly fullRowBuf = new Uint8Array(16);

  /**
   * Render a single sprite column using the L0 zoom table.
   *
   * The Neo-Geo uses a 512-line virtual scanline space. Visible area = lines 16..239.
   * The zoom ROM maps each output line to a source tile + row within the sprite,
   * allowing vertical shrink from 256 lines (full) down to 1 line.
   */
  private renderSprite(index: number, animCounter: number, y0 = 0, y1 = NGO_SCREEN_HEIGHT): void {
    let x = this.sprX[index]!;
    const yRaw = this.sprYRaw[index]!;
    const size = this.sprSize[index]!;
    const yZoom = this.sprYZoom[index]!;
    const xZoom = this.sprXZoom[index]!;

    if (size === 0) return;
    if (index >= this._dbgHideFrom && index < this._dbgHideTo) return;

    // MAME: skip sprites in the off-screen X gap (right of visible, left of wrap)
    if (x >= 0x140 && x <= 0x1F0) return;
    // Convert 9-bit unsigned to signed screen X (values > 0x1F0 wrap to negative)
    if (x > 0x1F0) x -= 0x200;

    const scb1Base = NGO_SCB1_BASE + index * 64;
    const zoomXMask = ZOOM_X_TABLES[xZoom]!;
    const zoomTbl = this.zoomRom;
    const zoomOff = yZoom << 8;
    // Total virtual lines this sprite occupies (wraps full space when size >= 32)
    const totalLines = size >= 0x20 ? 0x1FF : (size << 4) - 1;

    const fb32 = this.fb32;
    const rom = this.spritesRom;
    const fullRow = this.fullRowBuf;
    const halfBuf = this.rowBuf;

    let cachedTile = -1;
    let tileOff = 0, palBase = 0, flipV = false, flipH = false;

    let line = 0;
    while (line <= totalLines) {
      const vLine = (yRaw + line) & 0x1FF;

      // Jump past invisible regions in the 512-line space
      if (vLine < VLINE_TOP) { line += VLINE_TOP - vLine; continue; }
      if (vLine >= VLINE_BOT) { line += VLINE_TOP + 0x200 - vLine; continue; }

      const screenY = vLine - VLINE_TOP;

      // Clamp to slice range [y0, y1)
      if (screenY < y0 || screenY >= y1) { line++; continue; }

      // MAME algorithm: inversion-based tile/row mapping
      let zoomLine = line & 0xFF;
      let invert = line >= 0x100;
      if (invert) zoomLine ^= 0xFF;

      // Full-strip sprites (size > 32): continuous wrapping via modulo
      if (size > 0x20) {
        const period = (yZoom + 1) << 1;
        zoomLine = zoomLine % period;
        if (zoomLine > yZoom) {
          zoomLine = period - 1 - zoomLine;
          invert = !invert;
        }
      }

      // Beyond the zoom range for this level — nothing to draw
      if (zoomLine > yZoom) { line++; continue; }

      // Look up the shrink table: which source tile and row to render
      const entry = zoomTbl[zoomOff + zoomLine]!;
      let tileIdx = entry >> 4;
      let tileRow = entry & 0x0F;

      // Inversion flips tile index across full 0-31 range and row within tile
      if (invert) {
        tileIdx ^= 0x1F;
        tileRow ^= 0x0F;
      }

      // Read tile from SCB1 (cached until tile changes)
      if (tileIdx !== cachedTile) {
        cachedTile = tileIdx;
        const w0 = this.readVramWord(scb1Base + tileIdx * 2);
        const w1 = this.readVramWord(scb1Base + tileIdx * 2 + 1);
        let tc = w0 | ((w1 & 0xF0) << 12);
        flipV = ((w1 >> 1) & 1) === 1;
        flipH = (w1 & 1) === 1;
        if (w1 & 0x08) tc = (tc & ~7) | (animCounter & 7);
        else if (w1 & 0x04) tc = (tc & ~3) | (animCounter & 3);
        tc &= this.tileMask;
        tileOff = tc * NGO_TILE_BYTES;
        palBase = ((w1 >> 8) & 0xFF) * 16;
      }

      // Decode the 16-pixel row (left half from block 64-127, right from 0-63)
      const fy = flipV ? (15 - tileRow) : tileRow;
      decodeNeoGeoRow(rom, tileOff + 64 + fy * 4, halfBuf, 0);
      for (let i = 0; i < 8; i++) fullRow[i] = halfBuf[i]!;
      decodeNeoGeoRow(rom, tileOff + fy * 4, halfBuf, 0);
      for (let i = 0; i < 8; i++) fullRow[8 + i] = halfBuf[i]!;

      // Blit with X zoom: bitmask selects which of 16 source pixels to output
      const rowBase = screenY * NGO_SCREEN_WIDTH;
      let zxBit = zoomXMask;
      let outX = x;
      const xInc = flipH ? -1 : 1;
      let srcStart = flipH ? 15 : 0;
      for (let p = 0; p < 16; p++) {
        if (zxBit & 0x8000) {
          const colorIdx = fullRow[srcStart]!;
          if (colorIdx !== 0 && outX >= 0 && outX < NGO_SCREEN_WIDTH) {
            fb32[rowBase + outX] = this.paletteCache[palBase + colorIdx]!;
          }
          outX++;
        }
        zxBit = (zxBit << 1) & 0xFFFF;
        if (zxBit === 0) break;
        srcStart += xInc;
      }

      line++;
    }
  }

  private renderFixLayer(y0 = 0, y1 = NGO_SCREEN_HEIGHT): void {
    // Fix layer: 40 columns × 32 rows of 8x8 tiles
    // VRAM layout at FIX_BASE: 1 word per tile
    //   bits 15-12 = palette (0-15)
    //   bits 11-0 = tile code (S-ROM)
    // Column-major order: tiles are stored column by column

    const fb32 = this.fb32;
    const fixRom = this.useBiosFixRom ? this.biosFixedRom : this.fixedRom;
    const row = this.fixRow;
    const banked = !this.useBiosFixRom && this.fixBankType !== FixBankType.NONE;

    // Type 1 (Garou/mslug3): pre-compute per-row sticky bank from VRAM $7500/$7580
    const garouBanks = this.garouBanks;
    if (banked && this.fixBankType === FixBankType.GAROU) {
      let bank = 0;
      let k = 0;
      for (let y = 0; y < 32; y++) {
        if (this.readVramWord(0x7500 + k) === 0x0200 &&
            (this.readVramWord(0x7580 + k) & 0xFF00) === 0xFF00) {
          bank = this.readVramWord(0x7580 + k) & 3;
        }
        garouBanks[y] = bank;
        k += 2;
      }
    }

    for (let col = 0; col < 40; col++) {
      for (let rowIdx = 0; rowIdx < 32; rowIdx++) {
        // Fix layer uses column-major addressing
        const vramAddr = NGO_FIX_BASE + col * 32 + rowIdx;
        const word = this.readVramWord(vramAddr);
        const palette = (word >> 12) & 0x0F;
        let tileCode = word & 0x0FFF;

        // CMC fix banking: extend 12-bit tile code with 2-bit bank (^ 3 inverts bank bits per MAME)
        if (banked) {
          if (this.fixBankType === FixBankType.GAROU) {
            tileCode += 0x1000 * ((garouBanks[(rowIdx - 2) & 31]! ^ 3));
          } else if (this.fixBankType === FixBankType.KOF2000) {
            const bankRow = (rowIdx - 1) & 31;
            const bankWord = this.readVramWord(0x7500 + bankRow + 32 * ((col / 6) | 0));
            tileCode += 0x1000 * (((bankWord >> ((5 - (col % 6)) * 2)) & 3) ^ 3);
          }
        }

        const tileOffset = tileCode * NGO_FIX_TILE_BYTES;
        if (tileOffset + NGO_FIX_TILE_BYTES > fixRom.length) continue;

        const palBase = palette * 16;
        const screenX = col * 8;

        // Fix layer rows are mapped top-to-bottom but with 2-row offset
        // Row 0-1 are off-screen (Neo-Geo uses 32 rows but only 28 are visible)
        const screenY = (rowIdx - 2) * 8;

        for (let ty = 0; ty < 8; ty++) {
          const py = screenY + ty;
          if (py < y0 || py >= y1) continue;

          decodeFixRow(fixRom, tileOffset, ty, row, 0);
          const rowBase = py * NGO_SCREEN_WIDTH;

          for (let p = 0; p < 8; p++) {
            const colorIdx = row[p]!;
            if (colorIdx === 0) continue; // Transparent
            const px = screenX + p;
            if (px < NGO_SCREEN_WIDTH) {
              fb32[rowBase + px] = this.paletteCache[palBase + colorIdx]!;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Editor methods
  // ---------------------------------------------------------------------------

  /** Debug: hide sprites in index range [from, to). Call with (0,0) to show all. */
  hideSprites(from: number, to: number): void {
    this._dbgHideFrom = from;
    this._dbgHideTo = to;
    console.log(from === 0 && to === 0
      ? '[Sprite Debug] All sprites visible'
      : `[Sprite Debug] Hiding sprites ${from}-${to - 1}`);
  }

  /** Diagnostic: dump full sprite table with SCB2 zoom values */
  dumpSpriteTable(): void {
    const romSize = this.spritesRom.length;
    const maxTile = romSize / NGO_TILE_BYTES;

    interface ChainInfo {
      master: number; width: number; x: number; yRaw: number; screenY: number;
      size: number; yZoom: number; xZoom: number;
      tiles: number[]; palettes: number[];
    }

    const chains: ChainInfo[] = [];
    let cur: ChainInfo | null = null;
    let active = 0;

    for (let i = 0; i < NGO_MAX_SPRITES; i++) {
      const scb2 = this.readVramWord(NGO_SCB2_BASE + i);
      const scb3 = this.readVramWord(NGO_SCB3_BASE + i);
      const scb4 = this.readVramWord(NGO_SCB4_BASE + i);
      const sticky = (scb3 >> 6) & 1;
      const size = scb3 & 0x3F;
      const yRaw = (0x200 - (scb3 >> 7)) & 0x1FF;
      const x = (scb4 >> 7) & 0x1FF;
      const yZoom = scb2 & 0xFF;
      const xZoom = (scb2 >> 8) & 0x0F;

      // Read first tile of this sprite column
      const scb1Base = NGO_SCB1_BASE + i * 64;
      const w0 = this.readVramWord(scb1Base);
      const w1 = this.readVramWord(scb1Base + 1);
      const tc = w0 | ((w1 & 0xF0) << 12);
      const pal = (w1 >> 8) & 0xFF;

      if (tc === 0 && size === 0) continue;
      active++;

      if (!sticky || !cur) {
        if (cur) chains.push(cur);
        cur = {
          master: i, width: 1, x, yRaw, screenY: yRaw - VLINE_TOP,
          size, yZoom, xZoom, tiles: [tc], palettes: [pal],
        };
      } else {
        cur.width++;
        cur.tiles.push(tc);
        cur.palettes.push(pal);
      }
    }
    if (cur) chains.push(cur);

    console.log(`[Sprite Diag] ${active} active, ${chains.length} chains, ROM=${(romSize / 1024) | 0}KB (${maxTile} tiles)`);
    console.log(`[Sprite Diag] L0 zoom ROM: ${this.zoomRom.length >= 0x10000 ? 'loaded' : 'fallback'}`);

    // Show all chains with size > 0 (fighters may have tile[0]=0 with data in later tiles)
    const rendered = chains.filter(c => c.size > 0);
    console.log(`[Sprite Diag] ${rendered.length} chains with size>0`);

    for (const c of rendered) {
      // Read up to 4 tiles deep per first sprite column to find actual tile data
      const scb1 = NGO_SCB1_BASE + c.master * 64;
      const deepTiles: string[] = [];
      for (let t = 0; t < Math.min(c.size, 4); t++) {
        const w0 = this.readVramWord(scb1 + t * 2);
        const w1 = this.readVramWord(scb1 + t * 2 + 1);
        const tc = w0 | ((w1 & 0xF0) << 12);
        deepTiles.push(`0x${tc.toString(16)}`);
      }

      const tileStr = c.tiles.slice(0, 6).map(t => `0x${t.toString(16)}`).join(',');
      const extra = c.tiles.length > 6 ? `...(${c.tiles.length})` : '';
      console.log(
        `  #${c.master}: w=${c.width} x=${c.x} yRaw=${c.yRaw} scrY=${c.screenY}` +
        ` size=${c.size} yZoom=0x${c.yZoom.toString(16).toUpperCase()} xZoom=${c.xZoom}` +
        ` pal=${c.palettes[0]} cols=[${tileStr}${extra}] depth=[${deepTiles.join(',')}]`
      );
    }
  }

  /** Get a sprite entry for the editor */
  inspectSpriteAt(screenX: number, screenY: number): NeoGeoSpriteEntry | null {
    // Check sprites front-to-back (low index = in front)
    for (let i = 0; i < NGO_MAX_SPRITES; i++) {
      const entry = this.readSpriteEntry(i);
      if (entry.height === 0) continue;

      const sprW = 16;
      const sprH = entry.height * 16;

      if (
        screenX >= entry.x && screenX < entry.x + sprW &&
        screenY >= entry.y && screenY < entry.y + sprH
      ) {
        return entry;
      }
    }
    return null;
  }
}
