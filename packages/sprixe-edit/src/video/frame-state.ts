/**
 * Frame State Extractor
 *
 * Reads CPS-A/B registers and VRAM to produce a structured FrameState
 * describing all visible tiles and sprites — without rasterizing pixels.
 * This state feeds the React DOM renderer.
 */

import type { CpsBConfig, GfxMapperConfig } from '@sprixe/engine/memory/rom-loader';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '@sprixe/engine/constants';
import {
  readWord, tilemap0Scan, tilemap1Scan, tilemap2Scan,
  gfxromBankMapper, type GfxRange,
  GFXTYPE_SPRITES, GFXTYPE_SCROLL1, GFXTYPE_SCROLL2, GFXTYPE_SCROLL3,
} from '@sprixe/engine/video/cps1-video';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface TileInfo {
  code: number;
  palette: number;
  flipX: boolean;
  flipY: boolean;
  /** Position in virtual tilemap space (pixels) */
  x: number;
  y: number;
}

export interface SpriteInfo {
  code: number;
  palette: number;
  flipX: boolean;
  flipY: boolean;
  screenX: number;
  screenY: number;
  /** Tile grid dimensions (1x1 for single sprites) */
  nx: number;
  ny: number;
}

export interface ScrollLayerState {
  scrollX: number;
  scrollY: number;
  tileSize: number;
  tiles: TileInfo[];
  enabled: boolean;
  /** Virtual tilemap size in pixels */
  virtualWidth: number;
  virtualHeight: number;
  /** True when scroll2 uses per-row X scrolling (parallax) */
  useRowScroll: boolean;
}

export interface FrameState {
  scroll1: ScrollLayerState;
  scroll2: ScrollLayerState;
  scroll3: ScrollLayerState;
  sprites: SpriteInfo[];
  layerOrder: number[];
  paletteBase: number;
}

// ---------------------------------------------------------------------------
// Constants (shared via constants.ts, others local)
// ---------------------------------------------------------------------------

const CPS_HBEND = 64;
const CPS_VBEND = 16;
const VRAM_SIZE = 0x30000;
const SCROLL_SIZE = 0x4000;
const OBJ_SIZE = 0x0800;
const PALETTE_ALIGN = 0x0400;

const CPSA_OBJ_BASE = 0x00;
const CPSA_SCROLL1_BASE = 0x02;
const CPSA_SCROLL2_BASE = 0x04;
const CPSA_SCROLL3_BASE = 0x06;
const CPSA_PALETTE_BASE = 0x0A;
const CPSA_SCROLL1_XSCR = 0x0C;
const CPSA_SCROLL1_YSCR = 0x0E;
const CPSA_SCROLL2_XSCR = 0x10;
const CPSA_SCROLL2_YSCR = 0x12;
const CPSA_SCROLL3_XSCR = 0x14;
const CPSA_SCROLL3_YSCR = 0x16;
const CPSA_VIDEOCONTROL = 0x22;

const DEFAULT_LAYER_CTRL = 0x26;
const DEFAULT_ENABLE_SCROLL1 = 0x08;
const DEFAULT_ENABLE_SCROLL2 = 0x10;
const DEFAULT_ENABLE_SCROLL3 = 0x20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function vramBaseOffset(cpsaRegs: Uint8Array, regOffset: number, boundary: number): number {
  const regValue = readWord(cpsaRegs, regOffset);
  let base = regValue * 256;
  base &= ~(boundary - 1);
  const byteAddr = base & 0x3FFFF;
  return byteAddr < VRAM_SIZE ? byteAddr : byteAddr % VRAM_SIZE;
}

// ---------------------------------------------------------------------------
// FrameStateExtractor
// ---------------------------------------------------------------------------

export class FrameStateExtractor {
  private readonly vram: Uint8Array;
  private readonly cpsaRegs: Uint8Array;
  private readonly cpsbRegs: Uint8Array;

  private layerCtrlOffset: number;
  private enableScroll1: number;
  private enableScroll2: number;
  private enableScroll3: number;
  private mapperTable: GfxRange[];
  private bankSizes: number[];
  private bankBases: number[];

  private readonly objBuffer: Uint8Array;

  constructor(
    vram: Uint8Array,
    cpsaRegs: Uint8Array,
    cpsbRegs: Uint8Array,
    cpsBConfig?: CpsBConfig,
    gfxMapper?: GfxMapperConfig,
  ) {
    this.vram = vram;
    this.cpsaRegs = cpsaRegs;
    this.cpsbRegs = cpsbRegs;
    this.objBuffer = new Uint8Array(OBJ_SIZE);

    this.layerCtrlOffset = cpsBConfig?.layerControl ?? DEFAULT_LAYER_CTRL;
    this.enableScroll1 = cpsBConfig?.layerEnableMask[0] ?? DEFAULT_ENABLE_SCROLL1;
    this.enableScroll2 = cpsBConfig?.layerEnableMask[1] ?? DEFAULT_ENABLE_SCROLL2;
    this.enableScroll3 = cpsBConfig?.layerEnableMask[2] ?? DEFAULT_ENABLE_SCROLL3;

    this.mapperTable = gfxMapper?.ranges.map(r => ({
      type: r.type, start: r.start, end: r.end, bank: r.bank,
    })) ?? [];
    this.bankSizes = gfxMapper ? [...gfxMapper.bankSizes] : [0, 0, 0, 0];
    this.bankBases = [];
    let bankBase = 0;
    for (const size of this.bankSizes) {
      this.bankBases.push(bankBase);
      bankBase += size;
    }
  }

  /**
   * Extract the full frame state from current VRAM + registers.
   * Call once per frame, after M68000 has run.
   */
  /**
   * Buffer sprite data from VRAM. Called at VBlank (scanline 240) BEFORE
   * the game's IRQ handler changes OBJ_BASE for the next frame.
   */
  bufferSprites(): void {
    const objBase = vramBaseOffset(this.cpsaRegs, CPSA_OBJ_BASE, OBJ_SIZE);
    const copyLen = Math.min(OBJ_SIZE, VRAM_SIZE - objBase);
    if (copyLen > 0) {
      this.objBuffer.set(this.vram.subarray(objBase, objBase + copyLen));
    }
    this._spritesBuffered = true;
  }

  private _spritesBuffered = false;

  extractFrame(): FrameState {
    // Buffer sprites if not already done at VBlank
    if (!this._spritesBuffered) {
      this.bufferSprites();
    }
    this._spritesBuffered = false;

    const paletteBase = vramBaseOffset(this.cpsaRegs, CPSA_PALETTE_BASE, PALETTE_ALIGN);

    return {
      scroll1: this.extractScrollLayer(1),
      scroll2: this.extractScrollLayer(2),
      scroll3: this.extractScrollLayer(3),
      sprites: this.extractSprites(),
      layerOrder: this.getLayerOrder(),
      paletteBase,
    };
  }

  // -------------------------------------------------------------------------
  // Scroll layers
  // -------------------------------------------------------------------------

  private extractScrollLayer(layerIndex: number): ScrollLayerState {
    let tileW: number, scrollXReg: number, scrollYReg: number, baseReg: number;
    let scanFn: (col: number, row: number) => number;
    let paletteGroupOffset: number, codeMask: number, gfxType: number;
    let enableMask: number;

    switch (layerIndex) {
      case 1:
        tileW = 8;
        scrollXReg = CPSA_SCROLL1_XSCR; scrollYReg = CPSA_SCROLL1_YSCR;
        baseReg = CPSA_SCROLL1_BASE; scanFn = tilemap0Scan;
        paletteGroupOffset = 0x20; codeMask = 0xFFFF;
        gfxType = GFXTYPE_SCROLL1; enableMask = this.enableScroll1;
        break;
      case 2:
        tileW = 16;
        scrollXReg = CPSA_SCROLL2_XSCR; scrollYReg = CPSA_SCROLL2_YSCR;
        baseReg = CPSA_SCROLL2_BASE; scanFn = tilemap1Scan;
        paletteGroupOffset = 0x40; codeMask = 0xFFFF;
        gfxType = GFXTYPE_SCROLL2; enableMask = this.enableScroll2;
        break;
      case 3:
      default:
        tileW = 32;
        scrollXReg = CPSA_SCROLL3_XSCR; scrollYReg = CPSA_SCROLL3_YSCR;
        baseReg = CPSA_SCROLL3_BASE; scanFn = tilemap2Scan;
        paletteGroupOffset = 0x60; codeMask = 0x3FFF;
        gfxType = GFXTYPE_SCROLL3; enableMask = this.enableScroll3;
        break;
    }

    const layercontrol = readWord(this.cpsbRegs, this.layerCtrlOffset);
    const videocontrol = readWord(this.cpsaRegs, CPSA_VIDEOCONTROL);
    let enabled = (layercontrol & enableMask) !== 0;
    if (layerIndex === 2) enabled = enabled && (videocontrol & 0x04) !== 0;
    if (layerIndex === 3) enabled = enabled && (videocontrol & 0x08) !== 0;

    const scrollX = (readWord(this.cpsaRegs, scrollXReg) + CPS_HBEND) & 0xFFFF;
    const scrollY = (readWord(this.cpsaRegs, scrollYReg) + CPS_VBEND) & 0xFFFF;
    const virtualW = 64 * tileW;
    const virtualH = 64 * tileW;

    if (!enabled) {
      return { scrollX, scrollY, tileSize: tileW, tiles: [], enabled, virtualWidth: virtualW, virtualHeight: virtualH, useRowScroll: false };
    }

    const tilemapBase = vramBaseOffset(this.cpsaRegs, baseReg, SCROLL_SIZE);
    const vram = this.vram;
    const tiles: TileInfo[] = [];

    // Compute visible tiles — position in SCREEN space (not tilemap virtual space)
    // This avoids wrapping issues when the scroll crosses the 64-tile boundary.
    const vxStart = (scrollX & 0xFFFF) % virtualW;
    const vyStart = (scrollY & 0xFFFF) % virtualH;
    const startTileCol = (vxStart / tileW) | 0;
    const startTileRow = (vyStart / tileW) | 0;
    const numTileCols = ((SCREEN_WIDTH / tileW) | 0) + 2;
    const numTileRows = ((SCREEN_HEIGHT / tileW) | 0) + 2;

    // Screen offset of the first tile's top-left corner
    const firstTileX = -(vxStart % tileW);
    const firstTileY = -(vyStart % tileW);

    for (let tileRowIdx = 0; tileRowIdx < numTileRows; tileRowIdx++) {
      const tileRow = (startTileRow + tileRowIdx) % 64;
      for (let tileColIdx = 0; tileColIdx < numTileCols; tileColIdx++) {
        const tileCol = (startTileCol + tileColIdx) % 64;

        const tileIndex = scanFn(tileCol, tileRow);
        const entryOffset = tilemapBase + tileIndex * 4;
        if (entryOffset + 3 >= VRAM_SIZE) continue;

        const rawCode = ((vram[entryOffset]! << 8) | vram[entryOffset + 1]!) & codeMask;
        const tileCode = gfxromBankMapper(gfxType, rawCode, this.mapperTable, this.bankSizes, this.bankBases);
        if (tileCode === -1) continue;

        const attribs = (vram[entryOffset + 2]! << 8) | vram[entryOffset + 3]!;
        const palette = (attribs & 0x1F) + paletteGroupOffset;
        const flipX = ((attribs >> 5) & 1) === 1;
        const flipY = ((attribs >> 6) & 1) === 1;

        tiles.push({
          code: tileCode,
          palette,
          flipX,
          flipY,
          // Screen-space position (no wrapping issues)
          x: firstTileX + tileColIdx * tileW,
          y: firstTileY + tileRowIdx * tileW,
        });
      }
    }

    // scrollX/Y = 0 since tiles are already in screen space
    return { scrollX: 0, scrollY: 0, tileSize: tileW, tiles, enabled, virtualWidth: SCREEN_WIDTH, virtualHeight: SCREEN_HEIGHT, useRowScroll: false };
  }

  // -------------------------------------------------------------------------
  // Sprites
  // -------------------------------------------------------------------------

  private extractSprites(): SpriteInfo[] {
    const objData = this.objBuffer;
    const MAX_ENTRIES = OBJ_SIZE / 8;
    const sprites: SpriteInfo[] = [];

    // Find last sprite
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

    // Output last-to-first: in DOM, later elements stack on top.
    // CPS1: lower sprite index = draws on top. So we output high index first (behind).
    for (let i = lastSpriteIdx; i >= 0; i--) {
      const entryOffset = i * 8;
      if (entryOffset + 7 >= OBJ_SIZE) continue;

      const x = (objData[entryOffset]! << 8) | objData[entryOffset + 1]!;
      const y = (objData[entryOffset + 2]! << 8) | objData[entryOffset + 3]!;
      const code = (objData[entryOffset + 4]! << 8) | objData[entryOffset + 5]!;
      const colour = (objData[entryOffset + 6]! << 8) | objData[entryOffset + 7]!;

      const col = colour & 0x1F;
      const flipX = ((colour >> 5) & 1) === 1;
      const flipY = ((colour >> 6) & 1) === 1;

      const mappedCode = gfxromBankMapper(
        GFXTYPE_SPRITES, code,
        this.mapperTable, this.bankSizes, this.bankBases,
      );
      if (mappedCode === -1) continue;

      let nx = 1, ny = 1;
      if (colour & 0xFF00) {
        nx = ((colour >> 8) & 0x0F) + 1;
        ny = ((colour >> 12) & 0x0F) + 1;
      }

      const screenX = (x & 0x1FF) - CPS_HBEND;
      const screenY = (y & 0x1FF) - CPS_VBEND;

      // Skip if completely off-screen
      if (screenX + nx * 16 <= 0 || screenX >= SCREEN_WIDTH) continue;
      if (screenY + ny * 16 <= 0 || screenY >= SCREEN_HEIGHT) continue;

      sprites.push({
        code: mappedCode,
        palette: col,
        flipX,
        flipY,
        screenX,
        screenY,
        nx,
        ny,
      });
    }

    return sprites;
  }

  // -------------------------------------------------------------------------
  // Layer order (CPS-B)
  // -------------------------------------------------------------------------

  private getLayerOrder(): number[] {
    const ctrl = readWord(this.cpsbRegs, this.layerCtrlOffset);
    return [
      (ctrl >> 0x06) & 0x03,
      (ctrl >> 0x08) & 0x03,
      (ctrl >> 0x0a) & 0x03,
      (ctrl >> 0x0c) & 0x03,
    ];
  }
}
