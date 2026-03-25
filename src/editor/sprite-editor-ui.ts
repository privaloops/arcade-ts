/**
 * Sprite Editor UI — DOM panel, tile grid canvas, palette sidebar,
 * tools bar, overlay on game canvas, keyboard shortcuts.
 */

import { SpriteEditor, type EditorTool } from './sprite-editor';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import type { Emulator } from '../emulator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TILE_PX = 16;       // tile is 16x16 pixels
const CELL_SIZE = 16;     // each pixel rendered as 16x16 in the grid
const GRID_SIZE = TILE_PX * CELL_SIZE; // 256px

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

  // DOM elements
  private panel: HTMLDivElement | null = null;
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
  private frameInfo: HTMLSpanElement | null = null;

  // State
  private painting = false;
  private lastPaintPos: { x: number; y: number } | null = null;

  // Bound handlers for cleanup
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

    // Wire editor callbacks
    this.editor.setOnTileChanged(() => this.refreshTileGrid());
    this.editor.setOnToolChanged(() => this.refreshToolButtons());
    this.editor.setOnColorChanged(() => this.refreshPalette());
  }

  // -- Public API --

  toggle(): void {
    if (this.editor.active) {
      this.close();
    } else {
      this.open();
    }
  }

  isOpen(): boolean {
    return this.editor.active;
  }

  getEditor(): SpriteEditor {
    return this.editor;
  }

  destroy(): void {
    this.close();
  }

  // -- Open / Close --

  private open(): void {
    this.editor.activate();
    this.buildDOM();
    this.createOverlay();

    document.body.classList.add('edit-active');
    this.panel!.classList.add('open');

    document.addEventListener('keydown', this.boundKeyHandler);
  }

  private close(): void {
    this.editor.deactivate();
    document.body.classList.remove('edit-active');

    if (this.panel) {
      this.panel.classList.remove('open');
      this.panel.remove();
      this.panel = null;
    }
    this.removeOverlay();
    document.removeEventListener('keydown', this.boundKeyHandler);
  }

  // -- DOM construction --

  private buildDOM(): void {
    if (this.panel) return;

    const panel = el('div', 'edit-panel') as HTMLDivElement;

    // Header
    const header = el('div', 'edit-header');
    const title = el('h2', 'edit-title');
    title.textContent = 'SPRITE EDITOR';
    const closeBtn = el('button', 'ctrl-btn edit-close') as HTMLButtonElement;
    closeBtn.textContent = '\u2715';
    closeBtn.title = 'Close (Esc)';
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Info bar
    this.infoBar = el('div', 'edit-info') as HTMLDivElement;
    this.infoBar.textContent = 'Click a sprite on the game screen';
    panel.appendChild(this.infoBar);

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
    panel.appendChild(tileSection);

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
    panel.appendChild(toolsBar);
    this.refreshToolButtons();

    // Palette
    this.paletteContainer = el('div', 'edit-palette') as HTMLDivElement;
    panel.appendChild(this.paletteContainer);

    // Tile neighbors
    const neighborsSection = el('div', 'edit-neighbors-section');
    const neighborsLabel = el('div', 'edit-section-label');
    neighborsLabel.textContent = 'Tile Neighbors';
    neighborsSection.appendChild(neighborsLabel);
    this.neighborGrid = el('div', 'edit-neighbors') as HTMLDivElement;
    neighborsSection.appendChild(this.neighborGrid);
    panel.appendChild(neighborsSection);

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

    panel.appendChild(actions);

    // Frame info
    const frameBar = el('div', 'edit-frame-bar');
    this.frameInfo = el('span', 'edit-frame-info') as HTMLSpanElement;
    this.updateFrameInfo();

    const stepBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    stepBtn.textContent = '\u25B6 Step';
    stepBtn.title = 'Right Arrow';
    stepBtn.onclick = () => { this.editor.stepFrames(1); this.updateFrameInfo(); this.refreshOverlayAfterStep(); };

    const step10Btn = el('button', 'ctrl-btn') as HTMLButtonElement;
    step10Btn.textContent = '\u25B6\u25B6 \u00D710';
    step10Btn.title = 'Shift+Right';
    step10Btn.onclick = () => { this.editor.stepFrames(10); this.updateFrameInfo(); this.refreshOverlayAfterStep(); };

    frameBar.appendChild(this.frameInfo);
    frameBar.appendChild(stepBtn);
    frameBar.appendChild(step10Btn);
    panel.appendChild(frameBar);

    this.panel = panel;
    document.body.appendChild(panel);

    this.refreshUndoButtons();
  }

  // -- Overlay --

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

    // Insert overlay in canvas wrapper, on top of game canvas
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
    if (!pos) { this.clearOverlay(); return; }

    const video = this.emulator.getVideo();
    if (!video) return;

    const info = video.inspectSpriteAt(pos.x, pos.y);
    this.clearOverlay();
    if (!info || !this.overlayCtx) return;

    // Draw tile outline (snap to tile bounds)
    const ctx = this.overlayCtx;
    const spriteInfo = info;

    // Get the OBJ buffer to find screen position
    const objBuf = video.getObjBuffer();
    const entryOff = spriteInfo.spriteIndex * 8;
    const sprX = (objBuf[entryOff]! << 8) | objBuf[entryOff + 1]!;
    const sprY = (objBuf[entryOff + 2]! << 8) | objBuf[entryOff + 3]!;

    // Sub-tile screen position
    const tileScreenX = ((sprX + spriteInfo.nxs * 16) & 0x1FF) - 64;
    const tileScreenY = ((sprY + spriteInfo.nys * 16) & 0x1FF) - 16;

    // Hovered tile outline (cyan)
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(tileScreenX + 0.5, tileScreenY + 0.5, 15, 15);

    // If multi-tile, draw dim outlines on all sub-tiles
    if (spriteInfo.nx > 1 || spriteInfo.ny > 1) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      for (let nys = 0; nys < spriteInfo.ny; nys++) {
        for (let nxs = 0; nxs < spriteInfo.nx; nxs++) {
          if (nxs === spriteInfo.nxs && nys === spriteInfo.nys) continue;
          const sx = ((sprX + nxs * 16) & 0x1FF) - 64;
          const sy = ((sprY + nys * 16) & 0x1FF) - 16;
          ctx.strokeRect(sx + 0.5, sy + 0.5, 15, 15);
        }
      }
    }
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

      // Draw selected tile outline (red)
      if (this.overlayCtx) {
        this.drawSelectedOverlay();
      }
    }
  }

  private drawSelectedOverlay(): void {
    const tile = this.editor.currentTile;
    if (!tile || !this.overlayCtx || !this.overlay) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    this.clearOverlay();
    const ctx = this.overlayCtx;
    const info = tile.spriteInfo;

    const objBuf = video.getObjBuffer();
    const entryOff = info.spriteIndex * 8;
    const sprX = (objBuf[entryOff]! << 8) | objBuf[entryOff + 1]!;
    const sprY = (objBuf[entryOff + 2]! << 8) | objBuf[entryOff + 3]!;

    const tileScreenX = ((sprX + info.nxs * 16) & 0x1FF) - 64;
    const tileScreenY = ((sprY + info.nys * 16) & 0x1FF) - 16;

    // Selected tile: red outline + semi-transparent fill
    ctx.fillStyle = 'rgba(255, 26, 80, 0.15)';
    ctx.fillRect(tileScreenX, tileScreenY, 16, 16);
    ctx.strokeStyle = '#ff1a50';
    ctx.lineWidth = 1;
    ctx.strokeRect(tileScreenX + 0.5, tileScreenY + 0.5, 15, 15);
  }

  private refreshOverlayAfterStep(): void {
    this.drawSelectedOverlay();
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
    const rect = this.tileCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * TILE_PX);
    const y = Math.floor((e.clientY - rect.top) / rect.height * TILE_PX);
    if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) return null;
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

    const tileData = this.editor.getCurrentTileData();
    if (!tileData) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
      return;
    }

    const palette = this.editor.getCurrentPalette();

    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const colorIdx = tileData[y * TILE_PX + x]!;

        if (colorIdx === 15) {
          // Transparent: checkerboard
          const cx = x * CELL_SIZE;
          const cy = y * CELL_SIZE;
          for (let dy = 0; dy < CELL_SIZE; dy++) {
            for (let dx = 0; dx < CELL_SIZE; dx++) {
              ctx.fillStyle = ((dx + dy) & 1) ? '#222' : '#333';
              ctx.fillRect(cx + dx, cy + dy, 1, 1);
            }
          }
        } else {
          const [r, g, b] = palette[colorIdx] ?? [0, 0, 0];
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < TILE_PX; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE + 0.5, 0);
      ctx.lineTo(i * CELL_SIZE + 0.5, GRID_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE + 0.5);
      ctx.lineTo(GRID_SIZE, i * CELL_SIZE + 0.5);
      ctx.stroke();
    }

    // Highlight active color index in the grid
    this.drawSelectedOverlay();
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
        // Transparent — checkerboard
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

    // Use native color input
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

    input.addEventListener('change', () => {
      input.remove();
    });

    input.click();
  }

  private refreshNeighbors(): void {
    if (!this.neighborGrid) return;
    this.neighborGrid.innerHTML = '';

    const tile = this.editor.currentTile;
    if (!tile || (tile.spriteInfo.nx <= 1 && tile.spriteInfo.ny <= 1)) {
      this.neighborGrid.style.display = 'none';
      return;
    }

    this.neighborGrid.style.display = 'grid';
    const { nx, ny, nxs, nys } = tile.spriteInfo;

    // Show a 3x3 grid centered on current tile
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tnxs = nxs + dx;
        const tnys = nys + dy;
        const cell = el('div', 'edit-neighbor-cell') as HTMLDivElement;

        if (tnxs >= 0 && tnxs < nx && tnys >= 0 && tnys < ny) {
          if (dx === 0 && dy === 0) {
            cell.classList.add('edit-neighbor-current');
            cell.textContent = '\u2022'; // bullet
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
    const info = tile.spriteInfo;
    this.infoBar.textContent =
      `Tile: 0x${info.tileCode.toString(16).toUpperCase()} | ` +
      `Sprite #${info.spriteIndex} | ` +
      `Palette: ${info.paletteIndex}`;
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

  private updateFrameInfo(): void {
    if (this.frameInfo) {
      this.frameInfo.textContent = `Frame: ${this.emulator.getFrameCount()}`;
    }
  }

  // -- Keyboard shortcuts --

  private handleKey(e: KeyboardEvent): void {
    if (!this.editor.active) return;

    // Don't capture if typing in an input
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    switch (e.key) {
      case 'Escape':
        this.close();
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
        this.updateFrameInfo();
        this.refreshOverlayAfterStep();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft': {
        // Navigate neighbor tiles
        const tile = this.editor.currentTile;
        if (tile && (tile.spriteInfo.nx > 1 || tile.spriteInfo.ny > 1)) {
          const dx = e.key === 'ArrowLeft' ? -1 : 0;
          const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          const newNxs = tile.spriteInfo.nxs + dx;
          const newNys = tile.spriteInfo.nys + dy;
          if (newNxs >= 0 && newNxs < tile.spriteInfo.nx &&
              newNys >= 0 && newNys < tile.spriteInfo.ny) {
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
