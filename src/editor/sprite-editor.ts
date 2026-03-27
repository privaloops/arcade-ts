/**
 * Sprite & Scroll Editor — logic layer.
 *
 * Manages tool state, undo stack, tile read/write operations,
 * and coordinates between the UI and the emulator.
 * Supports OBJ (sprites) and Scroll 1/2/3 layers.
 */

import { writePixel, writeScrollPixel, readPixel, readScrollPixel, readTile } from './tile-encoder';
import { readPalette, writeColor, encodeColor } from './palette-editor';
import { gfxromBankMapper, GFXTYPE_SPRITES, LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from '../video/cps1-video';
import type { SpriteInspectResult, ScrollInspectResult } from '../video/cps1-video';
import type { Emulator } from '../emulator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorTool = 'pencil' | 'fill' | 'eyedropper' | 'eraser';

export interface UndoEntry {
  tileCode: number;
  offset: number;
  oldBytes: Uint8Array;
  charSize: number;
}

export interface TileContext {
  layerId: number;
  tileCode: number;
  rawCode: number;
  paletteIndex: number;
  gfxRomOffset: number;
  tileW: number;
  tileH: number;
  charSize: number;
  flipX: boolean;
  flipY: boolean;
  paletteBase: number;
  // Sprite-specific
  spriteIndex?: number;
  nx?: number;
  ny?: number;
  nxs?: number;
  nys?: number;
  // Scroll-specific (needed for scroll1 interleave)
  tileIndex?: number;
  // Screen position of the tile's top-left corner (for overlay highlight)
  screenX?: number;
  screenY?: number;
}

// ---------------------------------------------------------------------------
// SpriteEditor
// ---------------------------------------------------------------------------

const MAX_UNDO = 100;
const CHAR_SIZE_16 = 128;

export class SpriteEditor {
  private readonly emulator: Emulator;

  private _active = false;
  private _tool: EditorTool = 'pencil';
  private _activeColorIndex = 1;
  private _currentTile: TileContext | null = null;

  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];

  private onTileChanged: (() => void) | null = null;
  private onToolChanged: (() => void) | null = null;
  private onColorChanged: (() => void) | null = null;

  /** Optional filter: only select tiles on visible layers. Set by debug panel. */
  private _isLayerVisible: ((layerId: number) => boolean) | null = null;

  constructor(emulator: Emulator) {
    this.emulator = emulator;
  }

  // -- Getters --

  get active(): boolean { return this._active; }
  get tool(): EditorTool { return this._tool; }
  get activeColorIndex(): number { return this._activeColorIndex; }
  get currentTile(): TileContext | null { return this._currentTile; }

  // -- Activation --

  activate(): void {
    if (this._active) return;
    this._active = true;
  }

  deactivate(): void {
    this._active = false;
    this._currentTile = null;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  // -- Tool selection --

  setTool(tool: EditorTool): void {
    this._tool = tool;
    this.onToolChanged?.();
  }

  setActiveColor(index: number): void {
    this._activeColorIndex = index & 0x0F;
    this.onColorChanged?.();
  }

  // -- Tile selection --

  /**
   * Select the tile at screen position (x, y).
   * Checks sprites first (front layer), then scroll layers back-to-front.
   */
  selectTileAt(screenX: number, screenY: number): TileContext | null {
    const video = this.emulator.getVideo();
    if (!video) return null;
    const paletteBase = video.getPaletteBase();

    const isVisible = this._isLayerVisible ?? (() => true);

    const makeSpriteCtx = (sprInfo: NonNullable<ReturnType<typeof video.inspectSpriteAt>>): TileContext => ({
      layerId: LAYER_OBJ,
      tileCode: sprInfo.tileCode,
      rawCode: sprInfo.rawCode,
      paletteIndex: sprInfo.paletteIndex,
      gfxRomOffset: sprInfo.gfxRomOffset,
      tileW: 16, tileH: 16,
      charSize: CHAR_SIZE_16,
      flipX: sprInfo.flipX,
      flipY: sprInfo.flipY,
      paletteBase,
      spriteIndex: sprInfo.spriteIndex,
      nx: sprInfo.nx, ny: sprInfo.ny,
      nxs: sprInfo.nxs, nys: sprInfo.nys,
    });

    // Dynamic priority from CPS-B layer control register (front-to-back).
    // Click traverses transparent pixels to reach the layer beneath.

    const makeScrollCtx = (scrInfo: NonNullable<ReturnType<typeof video.inspectScrollAt>>): TileContext => {
      // localX/localY from inspectScrollAt are post-flip (for pixel decoding).
      // For screen position we need pre-flip values.
      const preFlipX = scrInfo.flipX ? (scrInfo.tileW - 1 - scrInfo.localX) : scrInfo.localX;
      const preFlipY = scrInfo.flipY ? (scrInfo.tileH - 1 - scrInfo.localY) : scrInfo.localY;
      return {
        layerId: scrInfo.layerId,
        tileCode: scrInfo.tileCode,
        rawCode: scrInfo.rawCode,
        paletteIndex: scrInfo.paletteIndex,
        gfxRomOffset: scrInfo.gfxRomOffset,
        tileW: scrInfo.tileW, tileH: scrInfo.tileH,
        charSize: scrInfo.charSize,
        flipX: scrInfo.flipX,
        flipY: scrInfo.flipY,
        paletteBase,
        tileIndex: scrInfo.tileIndex,
        screenX: screenX - preFlipX,
        screenY: screenY - preFlipY,
      };
    };

    const layerOrder = video.getLayerOrder(); // [back, ..., front]

    // Pass 1: opaque pixels only (front-to-back)
    for (let slot = layerOrder.length - 1; slot >= 0; slot--) {
      const lid = layerOrder[slot]!;
      if (!isVisible(lid)) continue;

      if (lid === LAYER_OBJ) {
        const sprOpaque = video.inspectSpriteAt(screenX, screenY, false);
        if (sprOpaque) {
          this._currentTile = makeSpriteCtx(sprOpaque);
          this.onTileChanged?.();
          return this._currentTile;
        }
      } else {
        const scrInfo = video.inspectScrollAt(screenX, screenY, lid, false);
        if (scrInfo) {
          this._currentTile = makeScrollCtx(scrInfo);
          this.onTileChanged?.();
          return this._currentTile;
        }
      }
    }

    // Pass 2: fallback — include transparent pixels (boundsOnly, front-to-back)
    for (let slot = layerOrder.length - 1; slot >= 0; slot--) {
      const lid = layerOrder[slot]!;
      if (!isVisible(lid)) continue;

      if (lid === LAYER_OBJ) {
        const sprBounds = video.inspectSpriteAt(screenX, screenY, true);
        if (sprBounds) {
          this._currentTile = makeSpriteCtx(sprBounds);
          this.onTileChanged?.();
          return this._currentTile;
        }
      } else {
        const scrInfo = video.inspectScrollAt(screenX, screenY, lid, true);
        if (scrInfo) {
          this._currentTile = makeScrollCtx(scrInfo);
          this.onTileChanged?.();
          return this._currentTile;
        }
      }
    }

    return null;
  }

  /** Switch to a neighbor tile within a multi-tile sprite */
  selectNeighborTile(nxs: number, nys: number): void {
    if (!this._currentTile || this._currentTile.layerId !== LAYER_OBJ) return;
    const tile = this._currentTile;
    if (!tile.nx || !tile.ny) return;
    if (nxs < 0 || nxs >= tile.nx || nys < 0 || nys >= tile.ny) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    const mappedBaseCode = gfxromBankMapper(
      GFXTYPE_SPRITES, tile.rawCode,
      video.getMapperTable(), video.getBankSizes(), video.getBankBases(),
    );
    if (mappedBaseCode === -1) return;

    let tileCode: number;
    if (tile.flipY) {
      if (tile.flipX) {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (tile.nx - 1) - nxs) & 0x0F) + 0x10 * (tile.ny - 1 - nys);
      } else {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * (tile.ny - 1 - nys);
      }
    } else {
      if (tile.flipX) {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (tile.nx - 1) - nxs) & 0x0F) + 0x10 * nys;
      } else {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * nys;
      }
    }

    this._currentTile = {
      ...tile,
      tileCode,
      gfxRomOffset: tileCode * CHAR_SIZE_16,
      nxs, nys,
    };
    this.onTileChanged?.();
  }

  // -- Pixel editing --

  getGfxRom(): Uint8Array | null {
    return this.emulator.getVideo()?.getGraphicsRom() ?? null;
  }

  paintPixel(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, charSize } = this._currentTile;
    const colorIndex = this._tool === 'eraser' ? 15 : this._activeColorIndex;

    this.pushUndo(tileCode, charSize, gfxRom);
    this.writeCurrentPixel(gfxRom, localX, localY, colorIndex);
    this.onTileChanged?.();
  }

  /** Read a pixel from the current tile, handling scroll1 interleave. */
  private readCurrentPixel(gfxRom: Uint8Array, lx: number, ly: number): number {
    const t = this._currentTile!;
    if (t.layerId !== LAYER_OBJ && t.tileIndex !== undefined) {
      return readScrollPixel(gfxRom, t.tileCode, lx, ly, t.charSize, t.tileIndex, t.layerId === LAYER_SCROLL1);
    }
    return readPixel(gfxRom, t.tileCode, lx, ly, t.charSize);
  }

  /** Write a pixel to the current tile, handling scroll1 interleave. */
  private writeCurrentPixel(gfxRom: Uint8Array, lx: number, ly: number, color: number): void {
    const t = this._currentTile!;
    if (t.layerId !== LAYER_OBJ && t.tileIndex !== undefined) {
      writeScrollPixel(gfxRom, t.tileCode, lx, ly, color, t.charSize, t.tileIndex, t.layerId === LAYER_SCROLL1);
    } else {
      writePixel(gfxRom, t.tileCode, lx, ly, color, t.charSize);
    }
  }

  eyedrop(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const color = this.readCurrentPixel(gfxRom, localX, localY);
    this.setActiveColor(color);
  }

  floodFill(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, tileW, tileH, charSize } = this._currentTile;
    const targetColor = this.readCurrentPixel(gfxRom, localX, localY);
    const fillColor = this._tool === 'eraser' ? 15 : this._activeColorIndex;

    if (targetColor === fillColor) return;

    this.pushUndo(tileCode, charSize, gfxRom);

    const visited = new Uint8Array(tileW * tileH);
    const queue: [number, number][] = [[localX, localY]];
    visited[localY * tileW + localX] = 1;

    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      this.writeCurrentPixel(gfxRom, cx, cy, fillColor);

      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= tileW || ny < 0 || ny >= tileH) continue;
        if (visited[ny * tileW + nx]) continue;
        visited[ny * tileW + nx] = 1;

        if (this.readCurrentPixel(gfxRom, nx, ny) === targetColor) {
          queue.push([nx, ny]);
        }
      }
    }

    this.onTileChanged?.();
  }

  // -- Undo/Redo --

  private pushUndo(tileCode: number, charSize: number, gfxRom: Uint8Array): void {
    const offset = tileCode * charSize;
    const oldBytes = new Uint8Array(charSize);
    oldBytes.set(gfxRom.subarray(offset, offset + charSize));

    this.undoStack.push({ tileCode, offset, oldBytes, charSize });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;

    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const currentBytes = new Uint8Array(entry.charSize);
    currentBytes.set(gfxRom.subarray(entry.offset, entry.offset + entry.charSize));
    this.redoStack.push({ tileCode: entry.tileCode, offset: entry.offset, oldBytes: currentBytes, charSize: entry.charSize });

    gfxRom.set(entry.oldBytes, entry.offset);
    this.onTileChanged?.();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;

    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const currentBytes = new Uint8Array(entry.charSize);
    currentBytes.set(gfxRom.subarray(entry.offset, entry.offset + entry.charSize));
    this.undoStack.push({ tileCode: entry.tileCode, offset: entry.offset, oldBytes: currentBytes, charSize: entry.charSize });

    gfxRom.set(entry.oldBytes, entry.offset);
    this.onTileChanged?.();
  }

  resetTile(): void {
    if (!this._currentTile) return;
    const romStore = this.emulator.getRomStore();
    if (!romStore) return;

    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, charSize } = this._currentTile;
    this.pushUndo(tileCode, charSize, gfxRom);

    const offset = tileCode * charSize;
    const original = romStore.getOriginal('graphics');
    gfxRom.set(original.subarray(offset, offset + charSize), offset);

    this.onTileChanged?.();
  }

  /** Erase entire tile — set all pixels to pen 15 (transparent). */
  eraseTile(): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, charSize, tileW, tileH } = this._currentTile;
    this.pushUndo(tileCode, charSize, gfxRom);

    for (let y = 0; y < tileH; y++) {
      for (let x = 0; x < tileW; x++) {
        this.writeCurrentPixel(gfxRom, x, y, 15);
      }
    }

    this.onTileChanged?.();
  }

  // -- Palette --

  getCurrentPalette(): Array<[number, number, number]> {
    if (!this._currentTile) return [];
    const bufs = this.emulator.getBusBuffers();
    return readPalette(bufs.vram, this._currentTile.paletteBase, this._currentTile.paletteIndex);
  }

  editPaletteColor(colorIndex: number, r: number, g: number, b: number): void {
    if (!this._currentTile) return;
    const bufs = this.emulator.getBusBuffers();
    const { paletteBase, paletteIndex } = this._currentTile;

    // Also patch program ROM so the change persists across rounds and in export
    const store = this.emulator.getRomStore();
    if (store) {
      const newWord = encodeColor(r, g, b);
      store.patchProgramPalette(bufs.vram, paletteBase, paletteIndex, colorIndex, newWord);
    }

    writeColor(bufs.vram, paletteBase, paletteIndex, colorIndex, r, g, b);
    this.onTileChanged?.();
  }

  // -- Tile data --

  getCurrentTileData(): Uint8Array | null {
    if (!this._currentTile) return null;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return null;
    const { tileCode, tileW, tileH, charSize, layerId, tileIndex } = this._currentTile;

    // For scroll1, read pixel by pixel to handle interleave
    if (layerId === LAYER_SCROLL1 && tileIndex !== undefined) {
      const result = new Uint8Array(tileW * tileH);
      for (let y = 0; y < tileH; y++) {
        for (let x = 0; x < tileW; x++) {
          result[y * tileW + x] = readScrollPixel(gfxRom, tileCode, x, y, charSize, tileIndex, true);
        }
      }
      return result;
    }

    return readTile(gfxRom, tileCode, tileW, tileH, charSize);
  }

  // -- Full sprite (all sub-tiles) --

  /**
   * Return tile codes and pixels for every sub-tile of the current multi-tile sprite.
   * Uses the same layout formula as selectNeighborTile().
   */
  getFullSpriteTileCodes(): number[] | null {
    if (!this._currentTile || this._currentTile.layerId !== LAYER_OBJ) return null;
    const tile = this._currentTile;
    const nx = tile.nx ?? 1;
    const ny = tile.ny ?? 1;

    const video = this.emulator.getVideo();
    if (!video) return null;

    const mappedBaseCode = gfxromBankMapper(
      GFXTYPE_SPRITES, tile.rawCode,
      video.getMapperTable(), video.getBankSizes(), video.getBankBases(),
    );
    if (mappedBaseCode === -1) return null;

    const tileCodes: number[] = [];
    for (let nys = 0; nys < ny; nys++) {
      for (let nxs = 0; nxs < nx; nxs++) {
        let tileCode: number;
        if (tile.flipY) {
          if (tile.flipX) {
            tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (nx - 1) - nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
          } else {
            tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
          }
        } else {
          if (tile.flipX) {
            tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (nx - 1) - nxs) & 0x0F) + 0x10 * nys;
          } else {
            tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * nys;
          }
        }
        tileCodes.push(tileCode);
      }
    }
    return tileCodes;
  }

  // -- Frame stepping --

  stepFrames(count: number): void {
    for (let i = 0; i < count; i++) {
      this.emulator.stepFrame();
    }
    this.onTileChanged?.();
  }

  // -- Direct tile selection from pose data --

  /**
   * Set the current tile context directly from captured pose tile data.
   * Used by the sprite sheet viewer to select a tile without clicking on the game screen.
   */
  selectTileFromPose(mappedCode: number, paletteIndex: number): void {
    const video = this.emulator.getVideo();
    if (!video) return;
    const paletteBase = video.getPaletteBase();

    this._currentTile = {
      layerId: LAYER_OBJ,
      tileCode: mappedCode,
      rawCode: 0, // not meaningful for direct selection
      paletteIndex,
      gfxRomOffset: mappedCode * CHAR_SIZE_16,
      tileW: 16,
      tileH: 16,
      charSize: CHAR_SIZE_16,
      flipX: false,
      flipY: false,
      paletteBase,
    };
    this.onTileChanged?.();
  }

  // -- Callbacks --

  setOnTileChanged(cb: (() => void) | null): void { this.onTileChanged = cb; }
  setLayerVisibilityFilter(fn: ((layerId: number) => boolean) | null): void { this._isLayerVisible = fn; }

  /** Replace all pixels of a given color index with pen 15 (transparent) in the current tile. */
  replaceColorWithTransparent(colorIndex: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, charSize, tileW, tileH } = this._currentTile;
    this.pushUndo(tileCode, charSize, gfxRom);

    for (let y = 0; y < tileH; y++) {
      for (let x = 0; x < tileW; x++) {
        if (this.readCurrentPixel(gfxRom, x, y) === colorIndex) {
          this.writeCurrentPixel(gfxRom, x, y, 15);
        }
      }
    }

    this.onTileChanged?.();
  }

  /** Replace all transparent pixels (pen 15) with a given color index in the current tile. */
  replaceTransparentWithColor(colorIndex: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, charSize, tileW, tileH } = this._currentTile;
    this.pushUndo(tileCode, charSize, gfxRom);

    for (let y = 0; y < tileH; y++) {
      for (let x = 0; x < tileW; x++) {
        if (this.readCurrentPixel(gfxRom, x, y) === 15) {
          this.writeCurrentPixel(gfxRom, x, y, colorIndex);
        }
      }
    }

    this.onTileChanged?.();
  }
  setOnToolChanged(cb: (() => void) | null): void { this.onToolChanged = cb; }
  setOnColorChanged(cb: (() => void) | null): void { this.onColorChanged = cb; }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
