/**
 * Sprite Editor UI — integrated into the debug/video panel.
 *
 * Provides DOM elements (tile grid, tools, palette) that are injected into
 * a container (the debug panel). Manages the overlay canvas on the game screen
 * and keyboard shortcuts independently.
 */

import { SpriteEditor, type EditorTool } from './sprite-editor';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import type { Emulator } from '../emulator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 256; // fixed canvas size

const TOOL_DEFS: { id: EditorTool; label: string; key: string }[] = [
  { id: 'pencil',     label: 'Pencil',     key: 'B' },
  { id: 'fill',       label: 'Fill',       key: 'G' },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I' },
  { id: 'eraser',     label: 'Eraser',     key: 'X' },
];

// ---------------------------------------------------------------------------
// SpriteEditorUI
// ---------------------------------------------------------------------------

export class SpriteEditorUI {
  private readonly editor: SpriteEditor;
  private readonly emulator: Emulator;
  private readonly gameCanvas: HTMLCanvasElement;

  // DOM elements (injected into external container)
  private built = false;
  private overlay: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private tileCanvas: HTMLCanvasElement | null = null;
  private tileCtx: CanvasRenderingContext2D | null = null;
  private paletteContainer: HTMLDivElement | null = null;
  private infoBar: HTMLDivElement | null = null;
  private toolBtns: Map<EditorTool, HTMLButtonElement> = new Map();
  private undoBtn: HTMLButtonElement | null = null;
  private redoBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;
  private neighborGrid: HTMLDivElement | null = null;

  // State
  private painting = false;
  private lastPaintPos: { x: number; y: number } | null = null;
  private overlayRafId = 0;

  // Bound handlers
  private readonly boundKeyHandler: (e: KeyboardEvent) => void;
  private readonly boundOverlayMove: (e: MouseEvent) => void;
  private readonly boundOverlayClick: (e: MouseEvent) => void;
  private readonly boundOverlayLeave: () => void;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
    this.emulator = emulator;
    this.gameCanvas = canvas;
    this.editor = new SpriteEditor(emulator);

    this.boundKeyHandler = (e) => this.handleKey(e);
    this.boundOverlayMove = (e) => this.handleOverlayMove(e);
    this.boundOverlayClick = (e) => this.handleOverlayClick(e);
    this.boundOverlayLeave = () => this.clearOverlay();

    this.editor.setOnTileChanged(() => { this.refreshTileGrid(); this.emulator.rerender(); });
    this.editor.setOnToolChanged(() => this.refreshToolButtons());
    this.editor.setOnColorChanged(() => this.refreshPalette());
  }

  // -- Public API --

  /** Build sprite editor elements into the given container (called once by debug panel). */
  buildInto(container: HTMLElement): void {
    if (this.built) return;
    this.built = true;

    // Info bar
    this.infoBar = el('div', 'edit-info') as HTMLDivElement;
    this.infoBar.textContent = 'Click a sprite on the game screen';
    container.appendChild(this.infoBar);

    // Tile grid canvas
    const tileSection = el('div', 'edit-tile-section');
    const cvs = document.createElement('canvas');
    cvs.width = GRID_SIZE;
    cvs.height = GRID_SIZE;
    cvs.className = 'edit-tile-canvas';
    this.tileCanvas = cvs;
    this.tileCtx = cvs.getContext('2d')!;
    this.bindTileCanvasEvents(cvs);
    tileSection.appendChild(cvs);
    container.appendChild(tileSection);

    // Tools bar
    const toolsBar = el('div', 'edit-tools');
    for (const def of TOOL_DEFS) {
      const btn = el('button', 'ctrl-btn edit-tool-btn') as HTMLButtonElement;
      btn.textContent = def.label;
      btn.title = `${def.label} (${def.key})`;
      btn.dataset['tool'] = def.id;
      btn.onclick = () => this.editor.setTool(def.id);
      this.toolBtns.set(def.id, btn);
      toolsBar.appendChild(btn);
    }
    container.appendChild(toolsBar);
    this.refreshToolButtons();

    // Palette
    this.paletteContainer = el('div', 'edit-palette') as HTMLDivElement;
    container.appendChild(this.paletteContainer);

    // Tile neighbors
    const neighborsSection = el('div', 'edit-neighbors-section');
    const neighborsLabel = el('div', 'edit-section-label');
    neighborsLabel.textContent = 'Tile Neighbors';
    neighborsSection.appendChild(neighborsLabel);
    this.neighborGrid = el('div', 'edit-neighbors') as HTMLDivElement;
    neighborsSection.appendChild(this.neighborGrid);
    container.appendChild(neighborsSection);

    // Action buttons
    const actions = el('div', 'edit-actions');

    this.undoBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    this.undoBtn.textContent = 'Undo';
    this.undoBtn.title = 'Ctrl+Z';
    this.undoBtn.onclick = () => { this.editor.undo(); this.refreshUndoButtons(); };
    actions.appendChild(this.undoBtn);

    this.redoBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    this.redoBtn.textContent = 'Redo';
    this.redoBtn.title = 'Ctrl+Shift+Z';
    this.redoBtn.onclick = () => { this.editor.redo(); this.refreshUndoButtons(); };
    actions.appendChild(this.redoBtn);

    this.resetBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    this.resetBtn.textContent = 'Reset Tile';
    this.resetBtn.onclick = () => { this.editor.resetTile(); this.refreshUndoButtons(); };
    actions.appendChild(this.resetBtn);

    container.appendChild(actions);
    this.refreshUndoButtons();
  }

  toggle(): void {
    if (this.editor.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  isOpen(): boolean {
    return this.editor.active;
  }

  getEditor(): SpriteEditor {
    return this.editor;
  }

  destroy(): void {
    this.deactivate();
  }

  // -- Activate / Deactivate (overlay + shortcuts, no panel creation) --

  activate(): void {
    this.editor.activate();
    this.createOverlay();
    document.body.classList.add('edit-active');
    document.addEventListener('keydown', this.boundKeyHandler);
    this.startOverlayLoop();
  }

  deactivate(): void {
    this.editor.deactivate();
    cancelAnimationFrame(this.overlayRafId);
    document.body.classList.remove('edit-active');
    this.removeOverlay();
    document.removeEventListener('keydown', this.boundKeyHandler);
  }

  // -- Overlay --

  private startOverlayLoop(): void {
    cancelAnimationFrame(this.overlayRafId);
    const loop = (): void => {
      if (!this.editor.active) return;
      this.drawAllSpriteBounds();
      this.drawSelectedOverlay();
      this.overlayRafId = requestAnimationFrame(loop);
    };
    this.overlayRafId = requestAnimationFrame(loop);
  }

  private createOverlay(): void {
    if (this.overlay) return;

    const cvs = document.createElement('canvas');
    cvs.id = 'edit-overlay';
    cvs.width = SCREEN_WIDTH;
    cvs.height = SCREEN_HEIGHT;
    cvs.className = 'edit-overlay';
    this.overlay = cvs;
    this.overlayCtx = cvs.getContext('2d')!;

    cvs.addEventListener('mousemove', this.boundOverlayMove);
    cvs.addEventListener('click', this.boundOverlayClick);
    cvs.addEventListener('mouseleave', this.boundOverlayLeave);

    const wrapper = this.gameCanvas.parentElement;
    if (wrapper) wrapper.appendChild(cvs);
  }

  private removeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.removeEventListener('mousemove', this.boundOverlayMove);
    this.overlay.removeEventListener('click', this.boundOverlayClick);
    this.overlay.removeEventListener('mouseleave', this.boundOverlayLeave);
    this.overlay.remove();
    this.overlay = null;
    this.overlayCtx = null;
  }

  private clearOverlay(): void {
    if (!this.overlayCtx || !this.overlay) return;
    this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private screenCoordsFromEvent(e: MouseEvent): { x: number; y: number } | null {
    if (!this.overlay) return null;
    const rect = this.overlay.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * SCREEN_WIDTH);
    const y = Math.floor((e.clientY - rect.top) / rect.height * SCREEN_HEIGHT);
    if (x < 0 || y < 0 || x >= SCREEN_WIDTH || y >= SCREEN_HEIGHT) return null;
    return { x, y };
  }

  private handleOverlayMove(e: MouseEvent): void {
    const pos = this.screenCoordsFromEvent(e);
    if (!pos) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    const info = video.inspectSpriteAt(pos.x, pos.y, true);
    if (!info || !this.overlayCtx) return;

    const ctx = this.overlayCtx;
    const objBuf = video.getObjBuffer();
    const entryOff = info.spriteIndex * 8;
    const sprX = (objBuf[entryOff]! << 8) | objBuf[entryOff + 1]!;
    const sprY = (objBuf[entryOff + 2]! << 8) | objBuf[entryOff + 3]!;

    const tileScreenX = ((sprX + info.nxs * 16) & 0x1FF) - 64;
    const tileScreenY = ((sprY + info.nys * 16) & 0x1FF) - 16;

    // Hovered tile outline (cyan, drawn on top of bounds by next rAF)
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(tileScreenX, tileScreenY, 16, 16);
  }

  private handleOverlayClick(e: MouseEvent): void {
    const pos = this.screenCoordsFromEvent(e);
    if (!pos) return;

    const info = this.editor.selectTileAt(pos.x, pos.y);
    if (info) {
      this.refreshTileGrid();
      this.refreshPalette();
      this.refreshNeighbors();
      this.refreshInfoBar();
      this.refreshUndoButtons();
    }
  }

  private drawSelectedOverlay(): void {
    const tile = this.editor.currentTile;
    if (!tile || !this.overlayCtx || !this.overlay) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    const ctx = this.overlayCtx;

    if (tile.layerId === 0 && tile.spriteIndex !== undefined) {
      // Sprite: get screen position from OBJ buffer
      const objBuf = video.getObjBuffer();
      const entryOff = tile.spriteIndex * 8;
      const sprX = (objBuf[entryOff]! << 8) | objBuf[entryOff + 1]!;
      const sprY = (objBuf[entryOff + 2]! << 8) | objBuf[entryOff + 3]!;
      const tileScreenX = ((sprX + (tile.nxs ?? 0) * 16) & 0x1FF) - 64;
      const tileScreenY = ((sprY + (tile.nys ?? 0) * 16) & 0x1FF) - 16;

      ctx.fillStyle = 'rgba(255, 26, 80, 0.25)';
      ctx.fillRect(tileScreenX, tileScreenY, 16, 16);
      ctx.strokeStyle = '#ff1a50';
      ctx.lineWidth = 2;
      ctx.strokeRect(tileScreenX, tileScreenY, 16, 16);
    }
    // For scroll tiles, the bounds overlay is less useful (tiles are static grid)
    // so we skip drawing a selection box on the game canvas for now.
  }

  /** Draw bounding boxes for all visible sprites on the overlay. */
  private drawAllSpriteBounds(): void {
    const video = this.emulator.getVideo();
    if (!video || !this.overlayCtx || !this.overlay) return;

    this.clearOverlay();
    const ctx = this.overlayCtx;
    const objBuf = video.getObjBuffer();

    ctx.strokeStyle = 'rgba(0, 255, 128, 0.35)';
    ctx.lineWidth = 1;

    let lastIdx = 255;
    for (let i = 0; i < 256; i++) {
      const off = i * 8;
      if (off + 7 >= 0x0800) break;
      const colour = (objBuf[off + 6]! << 8) | objBuf[off + 7]!;
      if ((colour & 0xFF00) === 0xFF00) {
        lastIdx = i - 1;
        break;
      }
    }

    for (let i = 0; i <= lastIdx; i++) {
      const off = i * 8;
      if (off + 7 >= 0x0800) break;

      const sprX = (objBuf[off]! << 8) | objBuf[off + 1]!;
      const sprY = (objBuf[off + 2]! << 8) | objBuf[off + 3]!;
      const colour = (objBuf[off + 6]! << 8) | objBuf[off + 7]!;

      const nx = (colour & 0xFF00) ? (((colour >> 8) & 0x0F) + 1) : 1;
      const ny = (colour & 0xFF00) ? (((colour >> 12) & 0x0F) + 1) : 1;

      const sx = (sprX & 0x1FF) - 64;
      const sy = (sprY & 0x1FF) - 16;
      const w = nx * 16;
      const h = ny * 16;

      if (sx + w <= 0 || sx >= SCREEN_WIDTH || sy + h <= 0 || sy >= SCREEN_HEIGHT) continue;

      ctx.strokeRect(sx + 0.5, sy + 0.5, w - 1, h - 1);
    }
  }

  // -- Tile grid canvas events --

  private bindTileCanvasEvents(cvs: HTMLCanvasElement): void {
    cvs.addEventListener('mousedown', (e) => {
      const pos = this.tilePixelFromEvent(e);
      if (!pos) return;
      this.painting = true;
      this.lastPaintPos = pos;
      this.handleTilePixelAction(pos.x, pos.y);
    });

    cvs.addEventListener('mousemove', (e) => {
      if (!this.painting) return;
      const pos = this.tilePixelFromEvent(e);
      if (!pos) return;
      if (this.lastPaintPos && pos.x === this.lastPaintPos.x && pos.y === this.lastPaintPos.y) return;
      this.lastPaintPos = pos;
      this.handleTilePixelAction(pos.x, pos.y);
    });

    const stopPaint = () => { this.painting = false; this.lastPaintPos = null; };
    cvs.addEventListener('mouseup', stopPaint);
    cvs.addEventListener('mouseleave', stopPaint);
  }

  private tilePixelFromEvent(e: MouseEvent): { x: number; y: number } | null {
    if (!this.tileCanvas) return null;
    const tile = this.editor.currentTile;
    const tw = tile?.tileW ?? 16;
    const th = tile?.tileH ?? 16;
    const rect = this.tileCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * tw);
    const y = Math.floor((e.clientY - rect.top) / rect.height * th);
    if (x < 0 || y < 0 || x >= tw || y >= th) return null;
    return { x, y };
  }

  private handleTilePixelAction(lx: number, ly: number): void {
    const tool = this.editor.tool;
    switch (tool) {
      case 'pencil':
      case 'eraser':
        this.editor.paintPixel(lx, ly);
        break;
      case 'fill':
        this.editor.floodFill(lx, ly);
        break;
      case 'eyedropper':
        this.editor.eyedrop(lx, ly);
        this.refreshPalette();
        break;
    }
    this.refreshUndoButtons();
  }

  // -- Rendering --

  private refreshTileGrid(): void {
    const ctx = this.tileCtx;
    if (!ctx || !this.tileCanvas) return;

    const tile = this.editor.currentTile;
    const tileData = this.editor.getCurrentTileData();
    if (!tileData || !tile) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
      return;
    }

    const tw = tile.tileW;
    const th = tile.tileH;
    const cellW = GRID_SIZE / tw;
    const cellH = GRID_SIZE / th;
    const palette = this.editor.getCurrentPalette();

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const colorIdx = tileData[y * tw + x]!;

        if (colorIdx === 15) {
          // Transparent: checkerboard
          const cx = x * cellW;
          const cy = y * cellH;
          ctx.fillStyle = '#222';
          ctx.fillRect(cx, cy, cellW, cellH);
          ctx.fillStyle = '#333';
          for (let dy = 0; dy < cellH; dy += 2) {
            for (let dx = 0; dx < cellW; dx += 2) {
              ctx.fillRect(cx + dx, cy + dy, 1, 1);
              if (dx + 1 < cellW && dy + 1 < cellH)
                ctx.fillRect(cx + dx + 1, cy + dy + 1, 1, 1);
            }
          }
        } else {
          const [r, g, b] = palette[colorIdx] ?? [0, 0, 0];
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < tw; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellW + 0.5, 0);
      ctx.lineTo(i * cellW + 0.5, GRID_SIZE);
      ctx.stroke();
    }
    for (let i = 1; i < th; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellH + 0.5);
      ctx.lineTo(GRID_SIZE, i * cellH + 0.5);
      ctx.stroke();
    }
  }

  private refreshPalette(): void {
    if (!this.paletteContainer) return;
    this.paletteContainer.innerHTML = '';

    const palette = this.editor.getCurrentPalette();
    if (palette.length === 0) return;

    const label = el('div', 'edit-section-label');
    label.textContent = 'Palette';
    this.paletteContainer.appendChild(label);

    const grid = el('div', 'edit-palette-grid');

    for (let i = 0; i < 16; i++) {
      const swatch = el('div', 'edit-swatch') as HTMLDivElement;

      if (i === 15) {
        swatch.classList.add('edit-swatch-transparent');
      } else {
        const [r, g, b] = palette[i] ?? [0, 0, 0];
        swatch.style.backgroundColor = `rgb(${r},${g},${b})`;
      }

      if (i === this.editor.activeColorIndex) {
        swatch.classList.add('edit-swatch-active');
      }

      swatch.title = `Color ${i}`;
      swatch.onclick = () => this.editor.setActiveColor(i);
      swatch.ondblclick = () => this.openColorPicker(i);
      grid.appendChild(swatch);
    }

    this.paletteContainer.appendChild(grid);
  }

  private openColorPicker(colorIndex: number): void {
    const palette = this.editor.getCurrentPalette();
    const [r, g, b] = palette[colorIndex] ?? [0, 0, 0];

    const input = document.createElement('input');
    input.type = 'color';
    input.value = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    input.style.position = 'absolute';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);

    input.addEventListener('input', () => {
      const hex = input.value;
      const nr = parseInt(hex.slice(1, 3), 16);
      const ng = parseInt(hex.slice(3, 5), 16);
      const nb = parseInt(hex.slice(5, 7), 16);
      this.editor.editPaletteColor(colorIndex, nr, ng, nb);
      this.refreshPalette();
    });

    input.addEventListener('change', () => { input.remove(); });
    input.click();
  }

  private refreshNeighbors(): void {
    if (!this.neighborGrid) return;
    this.neighborGrid.innerHTML = '';

    const tile = this.editor.currentTile;
    if (!tile || ((tile.nx ?? 1) <= 1 && (tile.ny ?? 1) <= 1)) {
      this.neighborGrid.style.display = 'none';
      return;
    }

    this.neighborGrid.style.display = 'grid';
    const nx = tile.nx ?? 1;
    const ny = tile.ny ?? 1;
    const nxs = tile.nxs ?? 0;
    const nys = tile.nys ?? 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tnxs = nxs + dx;
        const tnys = nys + dy;
        const cell = el('div', 'edit-neighbor-cell') as HTMLDivElement;

        if (tnxs >= 0 && tnxs < nx && tnys >= 0 && tnys < ny) {
          if (dx === 0 && dy === 0) {
            cell.classList.add('edit-neighbor-current');
            cell.textContent = '\u2022';
          } else {
            cell.classList.add('edit-neighbor-valid');
            const arrows: Record<string, string> = {
              '-1,-1': '\u2196', '0,-1': '\u2191', '1,-1': '\u2197',
              '-1,0': '\u2190', '1,0': '\u2192',
              '-1,1': '\u2199', '0,1': '\u2193', '1,1': '\u2198',
            };
            cell.textContent = arrows[`${dx},${dy}`] ?? '';
            cell.onclick = () => {
              this.editor.selectNeighborTile(tnxs, tnys);
              this.refreshTileGrid();
              this.refreshPalette();
              this.refreshNeighbors();
              this.refreshInfoBar();
            };
          }
        } else {
          cell.classList.add('edit-neighbor-empty');
        }

        this.neighborGrid.appendChild(cell);
      }
    }
  }

  private refreshInfoBar(): void {
    if (!this.infoBar) return;
    const tile = this.editor.currentTile;
    if (!tile) {
      this.infoBar.textContent = 'Click a sprite on the game screen';
      return;
    }
    const layerNames = ['Sprites', 'Scroll 1', 'Scroll 2', 'Scroll 3'];
    const layerName = layerNames[tile.layerId] ?? '?';
    let text = `Tile: 0x${tile.tileCode.toString(16).toUpperCase()} | ${layerName}`;
    if (tile.spriteIndex !== undefined) text += ` #${tile.spriteIndex}`;
    text += ` | Pal: ${tile.paletteIndex} | ${tile.tileW}x${tile.tileH}`;
    this.infoBar.textContent = text;
  }

  private refreshToolButtons(): void {
    for (const [tool, btn] of this.toolBtns) {
      btn.classList.toggle('active', tool === this.editor.tool);
    }
  }

  private refreshUndoButtons(): void {
    if (this.undoBtn) this.undoBtn.disabled = !this.editor.canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !this.editor.canRedo;
  }

  // -- Keyboard shortcuts --

  private handleKey(e: KeyboardEvent): void {
    if (!this.editor.active) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    switch (e.key) {
      case 'Escape':
        this.deactivate();
        e.preventDefault();
        break;
      case 'b': case 'B':
        this.editor.setTool('pencil');
        e.preventDefault();
        break;
      case 'g': case 'G':
        this.editor.setTool('fill');
        e.preventDefault();
        break;
      case 'i': case 'I':
        this.editor.setTool('eyedropper');
        e.preventDefault();
        break;
      case 'x': case 'X':
        this.editor.setTool('eraser');
        e.preventDefault();
        break;
      case 'z': case 'Z':
        if (e.ctrlKey || e.metaKey) {
          if (e.shiftKey) {
            this.editor.redo();
          } else {
            this.editor.undo();
          }
          this.refreshUndoButtons();
          e.preventDefault();
        }
        break;
      case '[':
        this.editor.setActiveColor((this.editor.activeColorIndex - 1 + 16) % 16);
        this.refreshPalette();
        e.preventDefault();
        break;
      case ']':
        this.editor.setActiveColor((this.editor.activeColorIndex + 1) % 16);
        this.refreshPalette();
        e.preventDefault();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.editor.stepFrames(e.shiftKey ? 10 : 1);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft': {
        const tile = this.editor.currentTile;
        if (tile && ((tile.nx ?? 1) > 1 || (tile.ny ?? 1) > 1)) {
          const dx = e.key === 'ArrowLeft' ? -1 : 0;
          const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          const newNxs = (tile.nxs ?? 0) + dx;
          const newNys = (tile.nys ?? 0) + dy;
          if (newNxs >= 0 && newNxs < (tile.nx ?? 1) &&
              newNys >= 0 && newNys < (tile.ny ?? 1)) {
            this.editor.selectNeighborTile(newNxs, newNys);
            this.refreshTileGrid();
            this.refreshPalette();
            this.refreshNeighbors();
            this.refreshInfoBar();
          }
          e.preventDefault();
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}
