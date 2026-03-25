/**
 * Sprite & Scroll Editor — logic layer.
 *
 * Manages tool state, undo stack, tile read/write operations,
 * and coordinates between the UI and the emulator.
 * Supports OBJ (sprites) and Scroll 1/2/3 layers.
 */

import { writePixel, readPixel, readTile } from './tile-encoder';
import { readPalette, writeColor } from './palette-editor';
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

    // Try sprites first
    const sprInfo = video.inspectSpriteAt(screenX, screenY, true);
    if (sprInfo) {
      this._currentTile = {
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
      };
      this.onTileChanged?.();
      return this._currentTile;
    }

    // Try scroll layers (front-to-back based on layer order)
    const layerOrder = video.getLayerOrder();
    for (let slot = layerOrder.length - 1; slot >= 0; slot--) {
      const lid = layerOrder[slot]!;
      if (lid === LAYER_OBJ) continue; // already checked
      if (!video.isLayerEnabled(lid)) continue;

      const scrInfo = video.inspectScrollAt(screenX, screenY, lid, true);
      if (scrInfo) {
        this._currentTile = {
          layerId: lid,
          tileCode: scrInfo.tileCode,
          rawCode: scrInfo.rawCode,
          paletteIndex: scrInfo.paletteIndex,
          gfxRomOffset: scrInfo.gfxRomOffset,
          tileW: scrInfo.tileW, tileH: scrInfo.tileH,
          charSize: scrInfo.charSize,
          flipX: scrInfo.flipX,
          flipY: scrInfo.flipY,
          paletteBase,
        };
        this.onTileChanged?.();
        return this._currentTile;
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
    writePixel(gfxRom, tileCode, localX, localY, colorIndex, charSize);
    this.onTileChanged?.();
  }

  eyedrop(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const color = readPixel(gfxRom, this._currentTile.tileCode, localX, localY, this._currentTile.charSize);
    this.setActiveColor(color);
  }

  floodFill(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode, tileW, tileH, charSize } = this._currentTile;
    const targetColor = readPixel(gfxRom, tileCode, localX, localY, charSize);
    const fillColor = this._tool === 'eraser' ? 15 : this._activeColorIndex;

    if (targetColor === fillColor) return;

    this.pushUndo(tileCode, charSize, gfxRom);

    const visited = new Uint8Array(tileW * tileH);
    const queue: [number, number][] = [[localX, localY]];
    visited[localY * tileW + localX] = 1;

    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      writePixel(gfxRom, tileCode, cx, cy, fillColor, charSize);

      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= tileW || ny < 0 || ny >= tileH) continue;
        if (visited[ny * tileW + nx]) continue;
        visited[ny * tileW + nx] = 1;

        if (readPixel(gfxRom, tileCode, nx, ny, charSize) === targetColor) {
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

  // -- Palette --

  getCurrentPalette(): Array<[number, number, number]> {
    if (!this._currentTile) return [];
    const bufs = this.emulator.getBusBuffers();
    return readPalette(bufs.vram, this._currentTile.paletteBase, this._currentTile.paletteIndex);
  }

  editPaletteColor(colorIndex: number, r: number, g: number, b: number): void {
    if (!this._currentTile) return;
    const bufs = this.emulator.getBusBuffers();
    writeColor(bufs.vram, this._currentTile.paletteBase, this._currentTile.paletteIndex, colorIndex, r, g, b);
    this.onTileChanged?.();
  }

  // -- Tile data --

  getCurrentTileData(): Uint8Array | null {
    if (!this._currentTile) return null;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return null;
    const { tileCode, tileW, tileH, charSize } = this._currentTile;
    return readTile(gfxRom, tileCode, tileW, tileH, charSize);
  }

  // -- Frame stepping --

  stepFrames(count: number): void {
    for (let i = 0; i < count; i++) {
      this.emulator.stepFrame();
    }
    this.onTileChanged?.();
  }

  // -- Callbacks --

  setOnTileChanged(cb: (() => void) | null): void { this.onTileChanged = cb; }
  setOnToolChanged(cb: (() => void) | null): void { this.onToolChanged = cb; }
  setOnColorChanged(cb: (() => void) | null): void { this.onColorChanged = cb; }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
