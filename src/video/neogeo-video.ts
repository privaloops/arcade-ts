/**
 * Neo-Geo LSPC2 Video — Sprite + Fix Layer Renderer
 *
 * The Neo-Geo video system is fundamentally different from CPS1:
 * - Everything is sprites (381 sprite slots, no scroll layers)
 * - Sprites are vertical columns of 16x16 tiles (up to 32 tiles tall)
 * - Sprites chain horizontally via the "sticky bit"
 * - One fix layer (40x32 grid of 8x8 tiles) composited on top
 * - Hardware sprite scaling via shrink tables (L0-ROM) — skipped in MVP
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
import { decodeNeoGeoRow, decodeFixRow } from '../editor/neogeo-tile-encoder';

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

export class NeoGeoVideo {
  private vram: Uint8Array;
  private spritesRom: Uint8Array;
  private fixedRom: Uint8Array;
  private biosFixedRom: Uint8Array;
  private paletteRam: Uint8Array;
  private paletteCache: Uint32Array;  // 4096 entries, decoded ABGR
  private fb: Uint8Array;             // 320x224x4 RGBA
  private fb32: Uint32Array;          // same buffer as Uint32Array view
  private paletteDirty: boolean;
  private autoAnimCounter: number;

  constructor() {
    this.vram = new Uint8Array(0x11000);  // ~68KB
    this.spritesRom = new Uint8Array(0);
    this.fixedRom = new Uint8Array(0);
    this.biosFixedRom = new Uint8Array(0);
    this.paletteRam = new Uint8Array(0x2000); // 8KB
    this.paletteCache = new Uint32Array(4096);
    const buffer = new ArrayBuffer(NGO_SCREEN_WIDTH * NGO_SCREEN_HEIGHT * 4);
    this.fb = new Uint8Array(buffer);
    this.fb32 = new Uint32Array(buffer);
    this.paletteDirty = true;
    this.autoAnimCounter = 0;
  }

  setRoms(
    spritesRom: Uint8Array,
    fixedRom: Uint8Array,
    biosFixedRom: Uint8Array,
  ): void {
    this.spritesRom = spritesRom;
    this.fixedRom = fixedRom;
    this.biosFixedRom = biosFixedRom;
  }

  getVram(): Uint8Array { return this.vram; }
  getPaletteRam(): Uint8Array { return this.paletteRam; }

  /** Set VRAM reference (shared with NeoGeoBus) */
  setVram(vram: Uint8Array): void { this.vram = vram; }
  /** Set palette RAM reference (shared with NeoGeoBus) */
  setPaletteRam(paletteRam: Uint8Array): void { this.paletteRam = paletteRam; }

  /** Increment auto-animation counter (call once per frame) */
  tickAutoAnim(): void { this.autoAnimCounter++; }

  /** Switch fix layer ROM source (BIOS sfix.sfix vs game S-ROM) */
  private useBiosFixRom: boolean = true;

  setFixRomMode(useBios: boolean): void { this.useBiosFixRom = useBios; }

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

  private rebuildPaletteCache(): void {
    for (let i = 0; i < 4096; i++) {
      const word = (this.paletteRam[i * 2]! << 8) | this.paletteRam[i * 2 + 1]!;
      this.paletteCache[i] = decodeNeoGeoColor(word);
    }
    this.paletteDirty = false;
  }

  markPaletteDirty(): void { this.paletteDirty = true; }

  // ---------------------------------------------------------------------------
  // Sprite entry reading
  // ---------------------------------------------------------------------------

  /** Read sprite entry from SCB1-SCB4 */
  readSpriteEntry(index: number): NeoGeoSpriteEntry {
    // SCB3: Y, sticky, height
    const scb3 = this.readVramWord(NGO_SCB3_BASE + index);
    const yRaw = scb3 >> 7;
    let y = 0x200 - (yRaw & 0x1FF); // 9-bit Y
    if (y > 0x110) y -= 0x200; // Y wrapping (MAME: ypos > 272 → ypos -= 512)
    const sticky = ((scb3 >> 6) & 1) === 1;
    const height = (scb3 & 0x3F) + 1; // 6-bit height (0=1 tile)

    // SCB4: X position
    const scb4 = this.readVramWord(NGO_SCB4_BASE + index);
    const x = (scb4 >> 7) & 0x1FF; // 9-bit X, left-shifted by 7
    const xSigned = x >= 320 ? x - 512 : x;

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

    for (let i = 1; i <= NGO_MAX_SPRITES; i++) {
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
   *   1. Clear framebuffer with backdrop color (palette 0, color 0)
   *   2. Render all sprites (back to front: high index = behind, low index = in front)
   *   3. Render fix layer on top
   */
  // Pre-computed sprite positions (forward pass, reused each frame)
  private readonly sprX = new Int16Array(NGO_MAX_SPRITES + 1);
  private readonly sprY = new Int16Array(NGO_MAX_SPRITES + 1);
  private readonly sprH = new Uint8Array(NGO_MAX_SPRITES + 1);

  renderFrame(framebuffer: Uint8Array): void {
    if (this.paletteDirty) this.rebuildPaletteCache();

    const fb32 = this.fb32;
    const backdrop = this.paletteCache[0 * 16]!;
    fb32.fill(backdrop);

    // Forward pass: compute sprite positions (hardware maintains running registers)
    let chainX = 0, chainY = 0, chainH = 0;
    for (let i = 1; i <= NGO_MAX_SPRITES; i++) {
      const scb3 = this.readVramWord(NGO_SCB3_BASE + i);
      const sticky = ((scb3 >> 6) & 1) === 1;

      if (!sticky) {
        // Chain master: read position from VRAM
        const yRaw = scb3 >> 7;
        chainY = 0x200 - (yRaw & 0x1FF);
        if (chainY > 0x110) chainY -= 0x200;
        chainH = (scb3 & 0x3F) + 1;
        const scb4 = this.readVramWord(NGO_SCB4_BASE + i);
        chainX = (scb4 >> 7) & 0x1FF;
        if (chainX >= 320) chainX -= 512;
      } else {
        // Sticky: advance X by 16 (full column width), inherit Y and height
        chainX += 16;
      }

      this.sprX[i] = chainX;
      this.sprY[i] = chainY;
      this.sprH[i] = chainH;
    }

    // Render sprites back to front (high index = behind)
    for (let i = NGO_MAX_SPRITES; i >= 1; i--) {
      this.renderSprite(i);
    }

    // Render fix layer on top
    this.renderFixLayer();

    // Copy to output framebuffer
    framebuffer.set(this.fb);
  }

  // Reusable row buffers (avoid per-row allocation)
  private readonly rowBuf = new Uint8Array(8);
  private readonly fullRowBuf = new Uint8Array(16);

  private renderSprite(index: number): void {
    // Use pre-computed positions from forward pass
    const x = this.sprX[index]!;
    const y = this.sprY[index]!;
    const height = this.sprH[index]!;

    // SCB2: shrink coefficients (TODO: vertical zoom with L0-ROM table)
    // Vertical zoom disabled — many sprites have uninitialized SCB2 (0x0000)
    // which would make them invisible. Full height for now.
    const scb1Base = NGO_SCB1_BASE + index * 64;
    const maxTiles = Math.min(height, 32);
    const totalSrcRows = maxTiles * 16;
    const effectiveHeight = totalSrcRows;

    const fb32 = this.fb32;
    const rom = this.spritesRom;
    const fullRow = this.fullRowBuf;
    const halfBuf = this.rowBuf;

    // Cache current tile data to avoid redundant VRAM reads
    let cachedTile = -1;
    let tileOff = 0, palBase = 0, flipV = false, flipH = false;

    for (let srcRow = 0; srcRow < effectiveHeight; srcRow++) {
      const py = y + srcRow;
      if (py >= NGO_SCREEN_HEIGHT) break;
      if (py < 0) continue;

      const tileIdx = srcRow >> 4;
      const tileRow = srcRow & 0xF;

      // Read tile entry from SCB1 (cached per tile)
      if (tileIdx !== cachedTile) {
        cachedTile = tileIdx;
        const w0 = this.readVramWord(scb1Base + tileIdx * 2);
        const w1 = this.readVramWord(scb1Base + tileIdx * 2 + 1);
        let tc = w0 | ((w1 & 0xF0) << 12);
        flipV = ((w1 >> 1) & 1) === 1;
        flipH = (w1 & 1) === 1;
        if (w1 & 0x08) tc = (tc & ~7) | (this.autoAnimCounter & 7);
        else if (w1 & 0x04) tc = (tc & ~3) | (this.autoAnimCounter & 3);
        tileOff = tc * NGO_TILE_BYTES;
        palBase = ((w1 >> 8) & 0xFF) * 16;
      }

      if (tileOff + NGO_TILE_BYTES > rom.length) continue;

      // Decode the full 16-pixel row (block 0-63 = left, 64-127 = right)
      const fy = flipV ? (15 - tileRow) : tileRow;
      decodeNeoGeoRow(rom, tileOff + fy * 4, halfBuf, 0);
      for (let i = 0; i < 8; i++) fullRow[i] = halfBuf[i]!;
      decodeNeoGeoRow(rom, tileOff + 64 + fy * 4, halfBuf, 0);
      for (let i = 0; i < 8; i++) fullRow[8 + i] = halfBuf[i]!;

      // Draw 16 source pixels
      const rowBase = py * NGO_SCREEN_WIDTH;
      for (let p = 0; p < 16; p++) {
        const colorIdx = fullRow[p]!;
        if (colorIdx === 0) continue;
        const px = flipH ? (x + 15 - p) : (x + p);
        if (px >= 0 && px < NGO_SCREEN_WIDTH) {
          fb32[rowBase + px] = this.paletteCache[palBase + colorIdx]!;
        }
      }
    }
  }

  private renderFixLayer(): void {
    // Fix layer: 40 columns × 32 rows of 8x8 tiles
    // VRAM layout at FIX_BASE: 1 word per tile
    //   bits 15-12 = palette (0-15)
    //   bits 11-0 = tile code (S-ROM)
    // Column-major order: tiles are stored column by column

    const fb32 = this.fb32;
    const fixRom = this.useBiosFixRom ? this.biosFixedRom : this.fixedRom;
    const row = new Uint8Array(8);

    for (let col = 0; col < 40; col++) {
      for (let rowIdx = 0; rowIdx < 32; rowIdx++) {
        // Fix layer uses column-major addressing
        const vramAddr = NGO_FIX_BASE + col * 32 + rowIdx;
        const word = this.readVramWord(vramAddr);
        const palette = (word >> 12) & 0x0F;
        const tileCode = word & 0x0FFF;

        const tileOffset = tileCode * NGO_FIX_TILE_BYTES;
        if (tileOffset + NGO_FIX_TILE_BYTES > fixRom.length) continue;

        const palBase = palette * 16;
        const screenX = col * 8;

        // Fix layer rows are mapped top-to-bottom but with 2-row offset
        // Row 0-1 are off-screen (Neo-Geo uses 32 rows but only 28 are visible)
        const screenY = (rowIdx - 2) * 8;

        for (let ty = 0; ty < 8; ty++) {
          const py = screenY + ty;
          if (py < 0 || py >= NGO_SCREEN_HEIGHT) continue;

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

  /** Get a sprite entry for the editor */
  inspectSpriteAt(screenX: number, screenY: number): NeoGeoSpriteEntry | null {
    // Check sprites front-to-back (low index = in front)
    for (let i = 1; i <= NGO_MAX_SPRITES; i++) {
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
