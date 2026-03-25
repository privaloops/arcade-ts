/**
 * Sprite Editor — logic layer.
 *
 * Manages tool state, undo stack, tile read/write operations,
 * and coordinates between the UI and the emulator.
 */

import { writePixel, readPixel, readTile } from './tile-encoder';
import { readPalette, writeColor } from './palette-editor';
import { gfxromBankMapper, GFXTYPE_SPRITES } from '../video/cps1-video';
import type { SpriteInspectResult } from '../video/cps1-video';
import type { Emulator } from '../emulator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorTool = 'pencil' | 'fill' | 'eyedropper' | 'eraser';

export interface UndoEntry {
  tileCode: number;
  offset: number;        // byte offset in GFX ROM
  oldBytes: Uint8Array;  // 128 bytes (full tile backup)
}

export interface TileContext {
  spriteInfo: SpriteInspectResult;
  paletteBase: number;
}

// ---------------------------------------------------------------------------
// SpriteEditor
// ---------------------------------------------------------------------------

const MAX_UNDO = 100;
const CHAR_SIZE_16 = 128;

export class SpriteEditor {
  private readonly emulator: Emulator;

  // State
  private _active = false;
  private _tool: EditorTool = 'pencil';
  private _activeColorIndex = 1;
  private _currentTile: TileContext | null = null;

  // Undo/redo stacks
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];

  // Callbacks for UI updates
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
    if (this.emulator.isRunning() && !this.emulator.isPaused()) {
      this.emulator.pause();
    }
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

  selectTileAt(screenX: number, screenY: number): SpriteInspectResult | null {
    const video = this.emulator.getVideo();
    if (!video) return null;

    const info = video.inspectSpriteAt(screenX, screenY);
    if (!info) return null;

    const paletteBase = video.getPaletteBase();

    this._currentTile = { spriteInfo: info, paletteBase };
    this.onTileChanged?.();
    return info;
  }

  /** Switch to a neighbor tile within a multi-tile sprite */
  selectNeighborTile(nxs: number, nys: number): void {
    if (!this._currentTile) return;
    const info = this._currentTile.spriteInfo;
    if (nxs < 0 || nxs >= info.nx || nys < 0 || nys >= info.ny) return;

    // Recompute tile code for the neighbor sub-tile
    const video = this.emulator.getVideo();
    if (!video) return;

    const mappedBaseCode = gfxromBankMapper(
      GFXTYPE_SPRITES, info.rawCode,
      video.getMapperTable(), video.getBankSizes(), video.getBankBases(),
    );
    if (mappedBaseCode === -1) return;

    let tileCode: number;
    if (info.flipY) {
      if (info.flipX) {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (info.nx - 1) - nxs) & 0x0F) + 0x10 * (info.ny - 1 - nys);
      } else {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * (info.ny - 1 - nys);
      }
    } else {
      if (info.flipX) {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (info.nx - 1) - nxs) & 0x0F) + 0x10 * nys;
      } else {
        tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * nys;
      }
    }

    this._currentTile = {
      spriteInfo: { ...info, tileCode, gfxRomOffset: tileCode * CHAR_SIZE_16, nxs, nys },
      paletteBase: this._currentTile.paletteBase,
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

    const { tileCode } = this._currentTile.spriteInfo;
    const colorIndex = this._tool === 'eraser' ? 15 : this._activeColorIndex;

    // Save undo before modifying
    this.pushUndo(tileCode, gfxRom);

    writePixel(gfxRom, tileCode, localX, localY, colorIndex);
    this.onTileChanged?.();
  }

  eyedrop(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const color = readPixel(gfxRom, this._currentTile.spriteInfo.tileCode, localX, localY);
    this.setActiveColor(color);
  }

  floodFill(localX: number, localY: number): void {
    if (!this._currentTile) return;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode } = this._currentTile.spriteInfo;
    const targetColor = readPixel(gfxRom, tileCode, localX, localY);
    const fillColor = this._tool === 'eraser' ? 15 : this._activeColorIndex;

    if (targetColor === fillColor) return;

    this.pushUndo(tileCode, gfxRom);

    // BFS flood fill
    const visited = new Uint8Array(256); // 16x16
    const queue: [number, number][] = [[localX, localY]];
    visited[localY * 16 + localX] = 1;

    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      writePixel(gfxRom, tileCode, cx, cy, fillColor);

      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= 16 || ny < 0 || ny >= 16) continue;
        if (visited[ny * 16 + nx]) continue;
        visited[ny * 16 + nx] = 1;

        if (readPixel(gfxRom, tileCode, nx, ny) === targetColor) {
          queue.push([nx, ny]);
        }
      }
    }

    this.onTileChanged?.();
  }

  // -- Undo/Redo --

  private pushUndo(tileCode: number, gfxRom: Uint8Array): void {
    const offset = tileCode * CHAR_SIZE_16;
    const oldBytes = new Uint8Array(CHAR_SIZE_16);
    oldBytes.set(gfxRom.subarray(offset, offset + CHAR_SIZE_16));

    this.undoStack.push({ tileCode, offset, oldBytes });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();

    // Clear redo stack on new action
    this.redoStack.length = 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;

    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    // Save current state for redo
    const currentBytes = new Uint8Array(CHAR_SIZE_16);
    currentBytes.set(gfxRom.subarray(entry.offset, entry.offset + CHAR_SIZE_16));
    this.redoStack.push({ tileCode: entry.tileCode, offset: entry.offset, oldBytes: currentBytes });

    // Restore old bytes
    gfxRom.set(entry.oldBytes, entry.offset);
    this.onTileChanged?.();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;

    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    // Save current state for undo
    const currentBytes = new Uint8Array(CHAR_SIZE_16);
    currentBytes.set(gfxRom.subarray(entry.offset, entry.offset + CHAR_SIZE_16));
    this.undoStack.push({ tileCode: entry.tileCode, offset: entry.offset, oldBytes: currentBytes });

    // Restore redo bytes
    gfxRom.set(entry.oldBytes, entry.offset);
    this.onTileChanged?.();
  }

  resetTile(): void {
    if (!this._currentTile) return;
    const romStore = this.emulator.getRomStore();
    if (!romStore) return;

    const gfxRom = this.getGfxRom();
    if (!gfxRom) return;

    const { tileCode } = this._currentTile.spriteInfo;
    this.pushUndo(tileCode, gfxRom);

    // Copy only this tile from the pristine original
    const offset = tileCode * CHAR_SIZE_16;
    const original = romStore.getOriginal('graphics');
    gfxRom.set(original.subarray(offset, offset + CHAR_SIZE_16), offset);

    this.onTileChanged?.();
  }

  // -- Palette --

  getCurrentPalette(): Array<[number, number, number]> {
    if (!this._currentTile) return [];
    const bufs = this.emulator.getBusBuffers();
    return readPalette(bufs.vram, this._currentTile.paletteBase, this._currentTile.spriteInfo.paletteIndex);
  }

  editPaletteColor(colorIndex: number, r: number, g: number, b: number): void {
    if (!this._currentTile) return;
    const bufs = this.emulator.getBusBuffers();
    writeColor(bufs.vram, this._currentTile.paletteBase, this._currentTile.spriteInfo.paletteIndex, colorIndex, r, g, b);
    this.onTileChanged?.();
  }

  // -- Tile data --

  getCurrentTileData(): Uint8Array | null {
    if (!this._currentTile) return null;
    const gfxRom = this.getGfxRom();
    if (!gfxRom) return null;
    return readTile(gfxRom, this._currentTile.spriteInfo.tileCode);
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
