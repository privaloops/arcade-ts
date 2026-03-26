/**
 * Sprite Editor UI — integrated into the debug/video panel.
 *
 * Provides DOM elements (tile grid, tools, palette) that are injected into
 * a container (the debug panel). Manages the overlay canvas on the game screen
 * and keyboard shortcuts independently.
 */

import { SpriteEditor, type EditorTool } from './sprite-editor';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3, GFXTYPE_SCROLL1, GFXTYPE_SCROLL2, GFXTYPE_SCROLL3, readWord, type CPS1Video } from '../video/cps1-video';
import { readAllSprites, groupCharacter, trackCharacter, poseHash, capturePose, assembleCharacter, type SpriteGroup as SpriteGroupData, type CapturedPose } from './sprite-analyzer';
import { loadPhotoRgba, resizeRgba, quantizeWithDithering, placePhotoOnTiles } from './photo-import';
import { readPixel as readPixelFn, writePixel as writePixelFn, writeScrollPixel, readTile as readTileFn } from './tile-encoder';
import { readPalette } from './palette-editor';
import { createLayer, createSpriteGroup, createScrollGroup, type PhotoLayer, type LayerGroup } from './layer-model';
import { LayerPanel } from './layer-panel';
import { TileAllocator, buildReverseMap, patchTilemapCode, patchTilemapPalette, getTileStats } from './tile-allocator';
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
  private captureBtn: HTMLButtonElement | null = null;
  private editSpritesBtn: HTMLButtonElement | null = null;
  private capturePanel: HTMLDivElement | null = null;
  private captureGallery: HTMLDivElement | null = null;
  private captureStatus: HTMLDivElement | null = null;

  // Capture state
  private capturing = false;
  private capturedPoses: CapturedPose[] = [];
  private selectedPoseIndex = 0;
  private captureSeenHashes = new Set<string>();
  private capturePalette = -1;
  private captureCenterX = 0;
  private captureCenterY = 0;

  // Head editor
  private headSection: HTMLDivElement | null = null;
  private headCanvas: HTMLCanvasElement | null = null;
  private headCtx: CanvasRenderingContext2D | null = null;
  private headScale = 1;
  private mergeBtn: HTMLButtonElement | null = null;
  private quantizeBtn: HTMLButtonElement | null = null;

  // Multi-layer system
  private layerGroups: LayerGroup[] = [];
  private activeGroupIndex = -1;
  private activeLayerIndex = -1;
  private layerPanel: LayerPanel | null = null;
  private draggingLayer = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private resizingLayer = false;
  private resizeCorner = ''; // 'tl' | 'tr' | 'bl' | 'br'
  private resizeStartW = 0;
  private resizeStartH = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;

  // Sprite Sheet Viewer
  private spriteSheetMode = false;
  private sheetContainer: HTMLDivElement | null = null;
  private sheetZoomed = false;  // true = viewing single zoomed pose, false = grid view
  private sheetSelectedPose = 0;
  private sheetSelectedTile = -1;
  private sheetZoomCanvas: HTMLCanvasElement | null = null;
  private sheetZoomCtx: CanvasRenderingContext2D | null = null;

  private get activeGroup(): LayerGroup | undefined { return this.layerGroups[this.activeGroupIndex]; }
  private get activeLayer(): PhotoLayer | undefined { return this.activeGroup?.layers[this.activeLayerIndex]; }
  private get activePoses(): CapturedPose[] { return this.activeGroup?.spriteCapture?.poses ?? []; }
  private get activePoseIndex(): number { return this.activeGroup?.spriteCapture?.selectedPoseIndex ?? 0; }
  private get activePose(): CapturedPose | undefined { return this.activePoses[this.activePoseIndex]; }
  private get hasLayers(): boolean { return (this.activeGroup?.layers.length ?? 0) > 0; }

  // State
  private painting = false;
  private lastPaintPos: { x: number; y: number } | null = null;
  private overlayRafId = 0;
  private gridLayers: Map<number, boolean> = new Map();
  private _isInteractionBlocked: (() => boolean) | null = null;
  private _onHwLayerToggle: ((layerId: number, visible: boolean) => void) | null = null;
  private _onSpreadChange: ((value: number) => void) | null = null;

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

    this.editor.setOnTileChanged(() => {
      this.refreshTileGrid();
      this.emulator.rerender();
      if (this.spriteSheetMode) this.refreshSheetAfterEdit();
    });
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

  setGridLayers(m: Map<number, boolean>): void {
    this.gridLayers = m;
  }

  setInteractionBlocker(fn: (() => boolean) | null): void {
    this._isInteractionBlocked = fn;
  }

  setHwLayerToggle(fn: (layerId: number, visible: boolean) => void): void {
    this._onHwLayerToggle = fn;
  }

  setSpreadChange(fn: (value: number) => void): void {
    this._onSpreadChange = fn;
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
    this.ensureDefaultGroups();
    this.ensureLayerPanel();
    this.layerPanel?.show();
    this.refreshLayerPanel();
  }

  deactivate(): void {
    if (this.spriteSheetMode) this.exitSpriteSheetMode();
    this.editor.deactivate();
    cancelAnimationFrame(this.overlayRafId);
    document.body.classList.remove('edit-active');
    this.removeOverlay();
    document.removeEventListener('keydown', this.boundKeyHandler);
    this.layerPanel?.hide();
  }

  /** Create the default layer groups (one per CPS1 layer) if they don't exist yet. */
  private ensureDefaultGroups(): void {
    if (this.layerGroups.some(g => g.type === 'scroll')) return; // already initialized
    this.layerGroups.unshift(
      createScrollGroup('Scroll 1', LAYER_SCROLL1),
      createScrollGroup('Scroll 2', LAYER_SCROLL2),
      createScrollGroup('Scroll 3', LAYER_SCROLL3),
    );
    // Sprites (OBJ) group is added dynamically via capture
    // But add a placeholder so it shows in the panel
    if (!this.layerGroups.some(g => g.type === 'sprite')) {
      this.layerGroups.push({
        type: 'sprite',
        name: 'Sprites (OBJ)',
        layers: [],
      });
    }
    this.activeGroupIndex = 0;
  }

  private ensureLayerPanel(): void {
    if (this.layerPanel) return;
    this.layerPanel = new LayerPanel({
      onSelectLayer: (gi, li) => {
        this.activeGroupIndex = gi;
        this.activeLayerIndex = li;
        this.drawHeadSelector();
        this.refreshLayerPanel();
      },
      onToggleVisibility: (gi, li) => {
        const layer = this.layerGroups[gi]?.layers[li];
        if (layer) layer.visible = !layer.visible;
        this.drawHeadSelector();
        this.refreshLayerPanel();
      },
      onDeleteLayer: (gi, li) => {
        const group = this.layerGroups[gi];
        if (!group) return;
        group.layers.splice(li, 1);
        if (this.activeLayerIndex >= group.layers.length) {
          this.activeLayerIndex = group.layers.length - 1;
        }
        this.drawHeadSelector();
        this.refreshLayerPanel();
      },
      onQuantizeLayer: (gi, li) => {
        this.activeGroupIndex = gi;
        this.activeLayerIndex = li;
        this.quantizeLayer();
        this.refreshLayerPanel();
      },
      onReorderLayer: (gi, fromIdx, toIdx) => {
        const group = this.layerGroups[gi];
        if (!group) return;
        const layers = group.layers;
        if (fromIdx < 0 || fromIdx >= layers.length || toIdx < 0 || toIdx >= layers.length) return;
        const [moved] = layers.splice(fromIdx, 1);
        if (moved) layers.splice(toIdx, 0, moved);
        // Update active layer index to follow the moved layer
        if (this.activeGroupIndex === gi) {
          if (this.activeLayerIndex === fromIdx) {
            this.activeLayerIndex = toIdx;
          } else if (fromIdx < this.activeLayerIndex && toIdx >= this.activeLayerIndex) {
            this.activeLayerIndex--;
          } else if (fromIdx > this.activeLayerIndex && toIdx <= this.activeLayerIndex) {
            this.activeLayerIndex++;
          }
        }
        this.refreshLayerPanel();
      },
      onMergeGroup: (gi) => {
        this.activeGroupIndex = gi;
        this.mergeAll();
        this.refreshLayerPanel();
      },
      onDropPhoto: (gi, file) => {
        this.activeGroupIndex = gi;
        this.importPhoto(file);
      },
      onToggleHwLayer: (layerId, visible) => {
        this._onHwLayerToggle?.(layerId, visible);
      },
      onToggleGrid: (layerId, visible) => {
        this.gridLayers.set(layerId, visible);
      },
      onSpreadChange: (value) => {
        this._onSpreadChange?.(value);
      },
    });
  }

  private refreshLayerPanel(): void {
    const gfxRom = this.editor.getGfxRom() ?? undefined;
    const video = this.emulator.getVideo();
    const layerOrder = video?.getLayerOrder();
    const LAYER_SHORT: Record<number, string> = { 0: 'OBJ', 1: 'S1', 2: 'S2', 3: 'S3' };
    const drawOrder = layerOrder ? layerOrder.map(id => LAYER_SHORT[id] ?? '?').join(' > ') : '';

    // Build HW layer visibility state (approximate — mirrors gridLayers for grid toggle)
    const hwState = {
      visible: new Map<number, boolean>(),
      grid: this.gridLayers,
      drawOrder,
    };
    // Default all visible (we don't track this directly — the renderer does)
    for (let i = 0; i < 4; i++) hwState.visible.set(i, true);

    this.layerPanel?.refresh(this.layerGroups, this.activeGroupIndex, this.activeLayerIndex, gfxRom, hwState);
  }

  // -- Overlay --

  private startOverlayLoop(): void {
    cancelAnimationFrame(this.overlayRafId);
    const loop = (): void => {
      if (!this.editor.active) return;
      // In 3D mode, let mouse events pass through to the exploded container
      if (this.overlay) {
        this.overlay.style.pointerEvents = this._isInteractionBlocked?.() ? 'none' : '';
      }
      this.drawAllSpriteBounds();
      this.drawSelectedOverlay();
      this.drawPhotoLayers();
      this.positionCaptureButton();
      this.captureFrame();
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

    // Layer interaction: Shift+click = select layer, corner handles = resize, click = drag
    cvs.addEventListener('mousedown', (e) => {
      const pos = this.screenCoordsFromEvent(e);
      if (!pos) return;

      // Shift+click: select the topmost layer under cursor
      if (e.shiftKey) {
        const group = this.activeGroup;
        if (group) {
          // Search top-to-bottom (last layer = topmost)
          for (let i = group.layers.length - 1; i >= 0; i--) {
            const l = group.layers[i]!;
            if (!l.visible) continue;
            if (pos.x >= l.offsetX && pos.x < l.offsetX + l.width
                && pos.y >= l.offsetY && pos.y < l.offsetY + l.height) {
              this.activeLayerIndex = i;
              this.refreshLayerPanel();
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
        return;
      }

      const layer = this.activeLayer;
      if (!layer) return;

      // Check resize handles first (4 corners, tolerance of 5 game pixels)
      const ht = 5;
      const lx = layer.offsetX, ly = layer.offsetY;
      const lw = layer.width, lh = layer.height;
      const corners: [string, number, number][] = [
        ['tl', lx, ly], ['tr', lx + lw, ly],
        ['bl', lx, ly + lh], ['br', lx + lw, ly + lh],
      ];
      for (const [corner, cx, cy] of corners) {
        if (Math.abs(pos.x - cx) <= ht && Math.abs(pos.y - cy) <= ht) {
          this.resizingLayer = true;
          this.resizeCorner = corner;
          this.resizeStartW = lw;
          this.resizeStartH = lh;
          this.resizeStartX = pos.x;
          this.resizeStartY = pos.y;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      const inBounds = pos.x >= lx && pos.x < lx + lw && pos.y >= ly && pos.y < ly + lh;
      if (!inBounds) return;

      // Click on layer = drag to move
      this.draggingLayer = true;
      this.dragLastX = pos.x;
      this.dragLastY = pos.y;
      e.preventDefault();
      e.stopPropagation();
    });
    cvs.addEventListener('mouseup', () => {
      if (this.resizingLayer) {
        this.resizingLayer = false;
        this.refreshLayerPanel();
      }
      if (this.draggingLayer) {
        this.draggingLayer = false;
        this.refreshLayerPanel();
      }
    });

    const wrapper = this.gameCanvas.parentElement;
    if (wrapper) {
      wrapper.appendChild(cvs);
      this.createCapturePanel(wrapper);
    }
  }

  private createCapturePanel(wrapper: HTMLElement): void {
    // Floating "Capture" button next to selected sprite
    this.captureBtn = document.createElement('button');
    this.captureBtn.className = 'edit-analyze-float';
    this.captureBtn.textContent = 'Start Capture';
    this.captureBtn.style.display = 'none';
    this.captureBtn.onclick = (e) => { e.stopPropagation(); this.toggleCapture(); };
    wrapper.appendChild(this.captureBtn);

    // Floating "Edit sprites" button — appears when captures exist
    this.editSpritesBtn = document.createElement('button');
    this.editSpritesBtn.className = 'edit-analyze-float';
    this.editSpritesBtn.textContent = 'Edit sprites';
    this.editSpritesBtn.style.display = 'none';
    this.editSpritesBtn.onclick = (e) => { e.stopPropagation(); this.enterSpriteSheetMode(); };
    wrapper.appendChild(this.editSpritesBtn);

    // Floating gallery panel
    this.capturePanel = el('div', 'edit-analyzer-float') as HTMLDivElement;
    this.capturePanel.style.display = 'none';

    this.captureStatus = el('div', 'edit-analyzer-status') as HTMLDivElement;
    this.capturePanel.appendChild(this.captureStatus);

    this.captureGallery = el('div', 'edit-analyzer-gallery') as HTMLDivElement;
    this.capturePanel.appendChild(this.captureGallery);

    wrapper.appendChild(this.capturePanel);
  }

  private removeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.removeEventListener('mousemove', this.boundOverlayMove);
    this.overlay.removeEventListener('click', this.boundOverlayClick);
    this.overlay.removeEventListener('mouseleave', this.boundOverlayLeave);
    this.overlay.remove();
    this.overlay = null;
    this.overlayCtx = null;
    this.stopCapture();
    this.captureBtn?.remove();
    this.captureBtn = null;
    this.editSpritesBtn?.remove();
    this.editSpritesBtn = null;
    this.capturePanel?.remove();
    this.capturePanel = null;
  }

  /** Position the "Start/Stop Capture" button next to the selected sprite's group. */
  private positionCaptureButton(): void {
    if (!this.captureBtn) return;

    // Hide both buttons in sprite sheet mode
    if (this.spriteSheetMode) {
      this.captureBtn.style.display = 'none';
      if (this.editSpritesBtn) this.editSpritesBtn.style.display = 'none';
      return;
    }

    // During capture, pin button next to the tracked character
    if (this.capturing) {
      if (this.editSpritesBtn) this.editSpritesBtn.style.display = 'none';
      const video = this.emulator.getVideo();
      if (video) {
        const rightEdgePct = (this.captureCenterX + 20) / SCREEN_WIDTH * 100;
        const centerYPct = this.captureCenterY / SCREEN_HEIGHT * 100;
        this.captureBtn.style.display = '';
        this.captureBtn.style.left = `${rightEdgePct}%`;
        this.captureBtn.style.top = `${centerYPct}%`;
        this.captureBtn.style.transform = 'translateY(-50%)';
      }
      return;
    }

    const tile = this.editor.currentTile;
    const isSprite = tile && tile.layerId === LAYER_OBJ && tile.spriteIndex !== undefined;
    if (!isSprite) {
      this.captureBtn.style.display = 'none';
      return;
    }

    // Position next to the character group bounding box
    const video = this.emulator.getVideo();
    if (!video) { this.captureBtn.style.display = 'none'; return; }

    const allSprites = readAllSprites(video);
    const group = groupCharacter(allSprites, tile.spriteIndex!);
    if (!group) { this.captureBtn.style.display = 'none'; return; }

    const rightEdgePct = (group.bounds.x + group.bounds.w + 4) / SCREEN_WIDTH * 100;
    const centerYPct = (group.bounds.y + group.bounds.h / 2) / SCREEN_HEIGHT * 100;

    this.captureBtn.style.display = '';
    this.captureBtn.style.left = `${rightEdgePct}%`;
    this.captureBtn.style.top = `${centerYPct}%`;
    this.captureBtn.style.transform = 'translateY(-50%)';

    // Show "Edit sprites" button below capture button when poses exist
    if (this.editSpritesBtn) {
      const hasPoses = this.activePoses.length > 0;
      this.editSpritesBtn.style.display = hasPoses ? '' : 'none';
      if (hasPoses) {
        this.editSpritesBtn.style.left = `${rightEdgePct}%`;
        this.editSpritesBtn.style.top = `calc(${centerYPct}% + 28px)`;
        this.editSpritesBtn.style.transform = '';
      }
    }
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
    if (this._isInteractionBlocked?.()) return;

    // Handle layer corner resize
    if (this.resizingLayer && this.activeLayer) {
      const pos = this.screenCoordsFromEvent(e);
      if (pos) {
        const dx = pos.x - this.resizeStartX;
        const dy = pos.y - this.resizeStartY;
        // Use the larger delta to maintain aspect ratio
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        const sign = this.resizeCorner === 'tl' || this.resizeCorner === 'bl' ? -1 : 1;
        const scaledDelta = delta * sign;

        const newW = Math.max(4, this.resizeStartW + scaledDelta);
        const newH = Math.max(4, Math.round(newW * this.resizeStartH / this.resizeStartW));

        if (newW !== this.activeLayer.width) {
          const newRgba = resizeRgba(this.activeLayer.rgbaOriginal, newW, newH);
          // Anchor to the opposite corner
          if (this.resizeCorner === 'tl') {
            this.activeLayer.offsetX += this.activeLayer.width - newW;
            this.activeLayer.offsetY += this.activeLayer.height - newH;
          } else if (this.resizeCorner === 'tr') {
            this.activeLayer.offsetY += this.activeLayer.height - newH;
          } else if (this.resizeCorner === 'bl') {
            this.activeLayer.offsetX += this.activeLayer.width - newW;
          }
          // br: offset stays
          this.activeLayer.rgbaData = newRgba;
          this.activeLayer.pixels = new Uint8Array(newW * newH);
          this.activeLayer.width = newW;
          this.activeLayer.height = newH;
          this.activeLayer.quantized = false;
        }
      }
      return;
    }

    // Handle layer dragging
    if (this.draggingLayer && this.activeLayer) {
      const pos = this.screenCoordsFromEvent(e);
      if (pos) {
        this.activeLayer.offsetX += pos.x - this.dragLastX;
        this.activeLayer.offsetY += pos.y - this.dragLastY;
        this.dragLastX = pos.x;
        this.dragLastY = pos.y;
      }
      return;
    }

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
    if (this._isInteractionBlocked?.()) return;

    const pos = this.screenCoordsFromEvent(e);
    if (!pos) return;
    const info = this.editor.selectTileAt(pos.x, pos.y);
    if (info) {
      this.refreshTileGrid();
      this.refreshPalette();
      this.refreshNeighbors();
      this.refreshInfoBar();
      this.refreshUndoButtons();

      // Highlight the corresponding layer group in the left panel
      const groupIdx = this.layerGroups.findIndex(g => {
        if (info.layerId === LAYER_OBJ) return g.type === 'sprite';
        return g.layerId === info.layerId;
      });
      if (groupIdx !== -1 && groupIdx !== this.activeGroupIndex) {
        this.activeGroupIndex = groupIdx;
        this.refreshLayerPanel();
      }
    }
  }

  private drawSelectedOverlay(): void {
    const tile = this.editor.currentTile;
    if (!tile || !this.overlayCtx || !this.overlay) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    const ctx = this.overlayCtx;

    if (tile.layerId === 0 && tile.spriteIndex !== undefined) {
      // Selected tile highlight (pink)
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

      // Character group contour (red) — all sprites belonging to the same character
      this.drawCharacterContour(ctx, video, tile.spriteIndex);
    }
  }

  /** Draw red outline around each sprite in the character group. */
  private drawCharacterContour(ctx: CanvasRenderingContext2D, video: CPS1Video, spriteIndex: number): void {
    const allSprites = readAllSprites(video);
    const group = groupCharacter(allSprites, spriteIndex);
    if (!group) return;

    // Draw each tile of the group with a red border
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 1.5;

    for (const sprite of group.sprites) {
      ctx.strokeRect(sprite.screenX + 0.5, sprite.screenY + 0.5, 15, 15);
    }

    // Draw the full bounding box with a thicker dashed red line
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      group.bounds.x + 0.5,
      group.bounds.y + 0.5,
      group.bounds.w - 1,
      group.bounds.h - 1,
    );
    ctx.setLineDash([]);
  }

  /** Apply tool on the active layer at game coordinates. Works on both RGBA and quantized. */
  private overlayLayerAction(gx: number, gy: number): void {
    const layer = this.activeLayer;
    if (!layer) return;
    const lx = gx - layer.offsetX;
    const ly = gy - layer.offsetY;
    if (lx < 0 || lx >= layer.width || ly < 0 || ly >= layer.height) return;

    const tool = this.editor.tool;

    if (layer.quantized) {
      // Quantized mode: full tool support
      if (tool === 'eyedropper') {
        this.editor.setActiveColor(layer.pixels[ly * layer.width + lx]!);
        this.refreshPalette();
      } else if (tool === 'fill') {
        this.magicWand(gx, gy);
      } else {
        const colorIndex = tool === 'eraser' ? 0 : this.editor.activeColorIndex;
        layer.pixels[ly * layer.width + lx] = colorIndex;
      }
    } else {
      // RGBA mode: eraser sets alpha to 0 (detour)
      if (tool === 'eraser') {
        const pi = (ly * layer.width + lx) * 4;
        layer.rgbaData.data[pi + 3] = 0;
      }
    }
  }

  /** Draw all visible photo layers directly on the game overlay canvas. */
  private drawPhotoLayers(): void {
    if (!this.overlayCtx || !this.overlay) return;
    const ctx = this.overlayCtx;

    for (const group of this.layerGroups) {
      for (const layer of group.layers) {
        if (!layer.visible) continue;

        // Create a temporary canvas with the layer's pixels
        const tmpCvs = document.createElement('canvas');
        tmpCvs.width = layer.width;
        tmpCvs.height = layer.height;
        const tmpCtx = tmpCvs.getContext('2d')!;

        if (layer.quantized) {
          // Draw indexed pixels using palette
          const video = this.emulator.getVideo();
          if (!video) continue;
          const bufs = this.emulator.getBusBuffers();
          const pageMap: Record<number, number> = { [LAYER_SCROLL1]: 32, [LAYER_SCROLL2]: 64, [LAYER_SCROLL3]: 96 };
          const palIdx = group.spriteCapture?.palette ?? pageMap[group.layerId ?? 0] ?? 0;
          const palette = readPalette(bufs.vram, video.getPaletteBase(), palIdx);
          const img = new ImageData(layer.width, layer.height);
          for (let i = 0; i < layer.pixels.length; i++) {
            const idx = layer.pixels[i]!;
            if (idx === 0) continue;
            const [r, g, b] = palette[idx] ?? [0, 0, 0];
            img.data[i * 4] = r;
            img.data[i * 4 + 1] = g;
            img.data[i * 4 + 2] = b;
            img.data[i * 4 + 3] = 255;
          }
          tmpCtx.putImageData(img, 0, 0);
        } else {
          // Draw RGBA directly
          tmpCtx.putImageData(layer.rgbaData, 0, 0);
        }

        // Draw on overlay at layer offset
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmpCvs, layer.offsetX, layer.offsetY);

        // Draw selection outline + resize handles for active layer
        if (layer === this.activeLayer) {
          const lx = layer.offsetX;
          const ly = layer.offsetY;
          const lw = layer.width;
          const lh = layer.height;

          ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(lx - 0.5, ly - 0.5, lw + 1, lh + 1);
          ctx.setLineDash([]);

          // Resize handles (4 corners)
          const hs = 3; // handle half-size in game pixels
          ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
          ctx.fillRect(lx - hs, ly - hs, hs * 2, hs * 2);           // top-left
          ctx.fillRect(lx + lw - hs, ly - hs, hs * 2, hs * 2);      // top-right
          ctx.fillRect(lx - hs, ly + lh - hs, hs * 2, hs * 2);      // bottom-left
          ctx.fillRect(lx + lw - hs, ly + lh - hs, hs * 2, hs * 2); // bottom-right
        }
      }
    }
  }

  /** Draw tile bounds for all layers with grid enabled. */
  private drawAllSpriteBounds(): void {
    const video = this.emulator.getVideo();
    if (!video || !this.overlayCtx || !this.overlay) return;

    this.clearOverlay();
    const ctx = this.overlayCtx;
    ctx.lineWidth = 1;

    // OBJ (sprites)
    if (this.gridLayers.get(LAYER_OBJ)) {
      ctx.strokeStyle = 'rgba(0, 255, 128, 0.35)';
      const objBuf = video.getObjBuffer();

      let lastIdx = 255;
      for (let i = 0; i < 256; i++) {
        const off = i * 8;
        if (off + 7 >= 0x0800) break;
        const colour = (objBuf[off + 6]! << 8) | objBuf[off + 7]!;
        if ((colour & 0xFF00) === 0xFF00) { lastIdx = i - 1; break; }
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

    // Scroll layers — draw tile grid based on scroll position
    const scrollConfigs: { layerId: number; tileSize: number; scrollXReg: number; scrollYReg: number; color: string }[] = [
      { layerId: LAYER_SCROLL1, tileSize: 8,  scrollXReg: 0x0C, scrollYReg: 0x0E, color: 'rgba(255, 200, 50, 0.2)' },
      { layerId: LAYER_SCROLL2, tileSize: 16, scrollXReg: 0x10, scrollYReg: 0x12, color: 'rgba(50, 180, 255, 0.2)' },
      { layerId: LAYER_SCROLL3, tileSize: 32, scrollXReg: 0x14, scrollYReg: 0x16, color: 'rgba(200, 50, 255, 0.2)' },
    ];

    const cpsaRegs = video.getCpsaRegs();

    for (const cfg of scrollConfigs) {
      if (!this.gridLayers.get(cfg.layerId)) continue;

      const scrollX = (readWord(cpsaRegs, cfg.scrollXReg) + 64) & 0xFFFF; // + CPS_HBEND
      const scrollY = (readWord(cpsaRegs, cfg.scrollYReg) + 16) & 0xFFFF; // + CPS_VBEND
      const ts = cfg.tileSize;

      // First grid line offset (negative = partial tile at left/top edge)
      const offsetX = -(scrollX % ts);
      const offsetY = -(scrollY % ts);

      ctx.strokeStyle = cfg.color;
      for (let x = offsetX; x < SCREEN_WIDTH; x += ts) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, SCREEN_HEIGHT);
        ctx.stroke();
      }
      for (let y = offsetY; y < SCREEN_HEIGHT; y += ts) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(SCREEN_WIDTH, y + 0.5);
        ctx.stroke();
      }
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

    // Sprite sheet mode keyboard handling
    if (this.spriteSheetMode) {
      this.handleSheetKey(e);
      return;
    }

    // Layer controls: Shift+arrows = move, +/- = resize
    const layer = this.activeLayer;
    if (layer) {
      if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowUp') layer.offsetY--;
        else if (e.key === 'ArrowDown') layer.offsetY++;
        else if (e.key === 'ArrowLeft') layer.offsetX--;
        else if (e.key === 'ArrowRight') layer.offsetX++;
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.resizeLayer(1);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        this.resizeLayer(-1);
        return;
      }
    }

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
  // -- Sprite Sheet Viewer --

  /** Handle keyboard events while in sprite sheet mode. */
  private handleSheetKey(e: KeyboardEvent): void {
    const poses = this.activePoses;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.exitSpriteSheetMode();
      return;
    }

    // Arrow keys navigate tiles within the zoomed pose
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;
    const tileCount = pose.tiles.length;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (tileCount > 0) {
          this.sheetSelectedTile = Math.min(this.sheetSelectedTile + 1, tileCount - 1);
          this.selectSheetTile(this.sheetSelectedTile);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (tileCount > 0) {
          this.sheetSelectedTile = Math.max(this.sheetSelectedTile - 1, 0);
          this.selectSheetTile(this.sheetSelectedTile);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Navigate to next pose in sidebar
        if (this.sheetSelectedPose < poses.length - 1) {
          this.selectPoseInSheet(this.sheetSelectedPose + 1);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Navigate to previous pose in sidebar
        if (this.sheetSelectedPose > 0) {
          this.selectPoseInSheet(this.sheetSelectedPose - 1);
        }
        break;
      default:
        this.handleToolShortcut(e);
        break;
    }
  }

  /** Forward tool shortcuts while in sheet zoomed view. */
  private handleToolShortcut(e: KeyboardEvent): void {
    switch (e.key) {
      case 'b': case 'B':
        this.editor.setTool('pencil'); e.preventDefault(); break;
      case 'g': case 'G':
        this.editor.setTool('fill'); e.preventDefault(); break;
      case 'i': case 'I':
        this.editor.setTool('eyedropper'); e.preventDefault(); break;
      case 'x': case 'X':
        this.editor.setTool('eraser'); e.preventDefault(); break;
      case 'z': case 'Z':
        if (e.ctrlKey || e.metaKey) {
          if (e.shiftKey) this.editor.redo(); else this.editor.undo();
          this.refreshUndoButtons(); e.preventDefault();
        }
        break;
      case '[':
        this.editor.setActiveColor((this.editor.activeColorIndex - 1 + 16) % 16);
        this.refreshPalette(); e.preventDefault(); break;
      case ']':
        this.editor.setActiveColor((this.editor.activeColorIndex + 1) % 16);
        this.refreshPalette(); e.preventDefault(); break;
    }
  }

  /** Highlight the currently selected cell in the grid view. */
  private highlightSheetCell(): void {
    if (!this.sheetContainer) return;
    const cells = this.sheetContainer.querySelectorAll('.sprite-sheet-cell');
    cells.forEach((c, i) => c.classList.toggle('selected', i === this.sheetSelectedPose));

    // Scroll into view
    const selected = cells[this.sheetSelectedPose];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Enter the fullscreen sprite sheet viewer mode.
   * Called after pose capture completes.
   */
  private enterSpriteSheetMode(): void {
    const poses = this.activePoses;
    if (poses.length === 0) return;

    this.spriteSheetMode = true;
    this.sheetZoomed = true;
    this.sheetSelectedPose = 0;
    this.sheetSelectedTile = -1;

    // Pause the game (frames + audio)
    if (!this.emulator.isPaused()) {
      this.emulator.pause();
      this.emulator.suspendAudio();
    }

    // Hide game canvas and overlay
    this.gameCanvas.style.display = 'none';
    if (this.overlay) this.overlay.style.display = 'none';

    // Create sheet container (fixed fullscreen, respects layer/debug panels via CSS)
    const container = document.createElement('div');
    container.className = 'sprite-sheet-viewer';
    this.sheetContainer = container;
    document.body.appendChild(container);

    // Refresh all previews from current GFX ROM state, then show edit view
    this.refreshAllPosePreviews();
    this.renderSheetZoomedView();
  }

  /** Render the pose grid view inside the sheet container. */
  private renderSheetGrid(): void {
    const container = this.sheetContainer;
    if (!container) return;
    container.innerHTML = '';

    const poses = this.activePoses;

    // Main content area (no sidebar in grid mode)
    const main = el('div', 'sprite-sheet-main');

    // Header
    const header = el('div', 'sprite-sheet-header');
    const title = document.createElement('h3');
    title.textContent = `${poses.length} captured pose${poses.length !== 1 ? 's' : ''}`;
    header.appendChild(title);

    const backBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    backBtn.textContent = 'Back to game';
    backBtn.onclick = () => this.exitSpriteSheetMode();
    header.appendChild(backBtn);
    main.appendChild(header);

    // Grid
    const grid = el('div', 'sprite-sheet-grid');

    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i]!;
      const cell = el('div', 'sprite-sheet-cell') as HTMLDivElement;
      if (i === this.sheetSelectedPose) cell.classList.add('selected');

      cell.onclick = () => {
        this.sheetSelectedPose = i;
        this.selectPoseInSheet(i);
      };

      const cvs = document.createElement('canvas');
      cvs.width = pose.w;
      cvs.height = pose.h;
      const ctx = cvs.getContext('2d')!;
      ctx.putImageData(pose.preview, 0, 0);
      cell.appendChild(cvs);

      // Index badge
      const idxBadge = el('div', 'pose-index');
      idxBadge.textContent = `${i}`;
      cell.appendChild(idxBadge);

      // Tile count badge
      const tileBadge = el('div', 'pose-tiles');
      tileBadge.textContent = `${pose.tiles.length}t`;
      cell.appendChild(tileBadge);

      grid.appendChild(cell);
    }

    main.appendChild(grid);
    container.appendChild(main);
  }

  /**
   * Zoom into a single pose for editing.
   */
  private selectPoseInSheet(index: number): void {
    const poses = this.activePoses;
    const pose = poses[index];
    if (!pose) return;

    this.sheetSelectedPose = index;
    this.sheetZoomed = true;
    this.sheetSelectedTile = -1;

    // Update spriteCapture's selectedPoseIndex
    const group = this.activeGroup;
    if (group?.spriteCapture) {
      group.spriteCapture.selectedPoseIndex = index;
    }
    this.selectedPoseIndex = index;

    this.renderSheetZoomedView();
  }

  /** Render the zoomed pose view with tile grid below + pose sidebar on the left. */
  private renderSheetZoomedView(): void {
    const container = this.sheetContainer;
    if (!container) return;
    container.innerHTML = '';

    const poses = this.activePoses;
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;

    // Left sidebar: all poses stacked vertically
    const sidebar = el('div', 'sprite-sheet-sidebar');
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      const cell = el('div', 'sprite-sheet-sidebar-cell') as HTMLDivElement;
      if (i === this.sheetSelectedPose) cell.classList.add('selected');

      const cvs = document.createElement('canvas');
      cvs.width = p.w;
      cvs.height = p.h;
      cvs.getContext('2d')!.putImageData(p.preview, 0, 0);
      cell.appendChild(cvs);

      const badge = el('div', 'pose-index');
      badge.textContent = `${i}`;
      cell.appendChild(badge);

      cell.onclick = () => this.selectPoseInSheet(i);
      sidebar.appendChild(cell);
    }
    container.appendChild(sidebar);

    // Main content area
    const main = el('div', 'sprite-sheet-main');

    // Header
    const header = el('div', 'sprite-sheet-header');
    const title = document.createElement('h3');
    title.textContent = `Pose ${this.sheetSelectedPose} / ${poses.length - 1} (${pose.w}\u00D7${pose.h}, ${pose.tiles.length} tiles)`;
    header.appendChild(title);

    const backBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    backBtn.textContent = 'Back to game';
    backBtn.onclick = () => this.exitSpriteSheetMode();
    header.appendChild(backBtn);
    main.appendChild(header);

    // Zoomed canvas — native resolution, CSS x2 (each CPS1 pixel = 2 CSS pixels)
    const zoomSection = el('div', 'sprite-sheet-zoom');
    const scale = 1; // canvas at native CPS1 resolution
    const cssScale = 4; // CSS display scale — each CPS1 pixel = 4 CSS pixels
    const zoomCvs = document.createElement('canvas');
    zoomCvs.width = pose.w;
    zoomCvs.height = pose.h;
    zoomCvs.style.width = `${pose.w * cssScale}px`;
    zoomCvs.style.height = `${pose.h * cssScale}px`;
    this.sheetZoomCanvas = zoomCvs;
    this.sheetZoomCtx = zoomCvs.getContext('2d')!;
    this.sheetZoomCtx.imageSmoothingEnabled = false;

    // Click handler: find tile at position (convert CSS coords to CPS1 coords)
    zoomCvs.addEventListener('click', (e) => {
      const rect = zoomCvs.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / cssScale);
      const py = Math.floor((e.clientY - rect.top) / cssScale);

      const tileIdx = pose.tiles.findIndex(t =>
        px >= t.relX && px < t.relX + 16 && py >= t.relY && py < t.relY + 16,
      );
      if (tileIdx !== -1) {
        this.sheetSelectedTile = tileIdx;
        this.selectSheetTile(tileIdx);
      }
    });

    this.renderSheetZoomedPose();
    zoomSection.appendChild(zoomCvs);

    // Tile strip (horizontal row)
    const tilesLabel = el('div', 'edit-section-label');
    tilesLabel.textContent = 'Tiles (click to edit)';
    zoomSection.appendChild(tilesLabel);

    const tilesGrid = el('div', 'sprite-sheet-tiles');
    this.renderSheetTileGrid(tilesGrid, pose);
    zoomSection.appendChild(tilesGrid);

    main.appendChild(zoomSection);
    container.appendChild(main);
  }

  /** Refresh all sheet visuals after a tile edit. */
  private refreshSheetAfterEdit(): void {
    this.refreshAllPosePreviews();
    this.renderSheetZoomedPose();
    this.refreshSheetSidebar();
  }

  /** Re-read ALL pose previews from the current GFX ROM. */
  private refreshAllPosePreviews(): void {
    const ag = this.activeGroup;
    if (!ag?.spriteCapture) return;
    const video = this.emulator.getVideo();
    if (!video) return;
    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const bufs = this.emulator.getBusBuffers();
    const pal = ag.spriteCapture.palette;
    const palette = readPalette(bufs.vram, video.getPaletteBase(), pal);

    for (const pose of ag.spriteCapture.poses) {
      const sprGroup: SpriteGroupData = {
        sprites: [], palette: pal,
        bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
        tiles: pose.tiles,
      };
      pose.preview = assembleCharacter(gfxRom, sprGroup, palette);
    }
  }

  /** Re-render the zoomed pose preview canvas (called on tile changes). */
  private renderSheetZoomedPose(): void {
    const ctx = this.sheetZoomCtx;
    const cvs = this.sheetZoomCanvas;
    if (!ctx || !cvs) return;

    const poses = this.activePoses;
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;

    // Rebuild preview directly from GFX ROM (not from cached pose.preview)
    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();
    const ag = this.activeGroup;
    const pal = ag?.spriteCapture?.palette ?? 0;
    const palette = readPalette(bufs.vram, video.getPaletteBase(), pal);

    const sprGroup: SpriteGroupData = {
      sprites: [], palette: pal,
      bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
      tiles: pose.tiles,
    };
    const freshPreview = assembleCharacter(gfxRom, sprGroup, palette);

    const tmp = document.createElement('canvas');
    tmp.width = pose.w;
    tmp.height = pose.h;
    tmp.getContext('2d')!.putImageData(freshPreview, 0, 0);

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(tmp, 0, 0);

    // Draw selected tile highlight
    if (this.sheetSelectedTile >= 0 && this.sheetSelectedTile < pose.tiles.length) {
      const t = pose.tiles[this.sheetSelectedTile]!;
      ctx.strokeStyle = '#ff1a50';
      ctx.lineWidth = 1;
      ctx.strokeRect(t.relX + 0.5, t.relY + 0.5, 15, 15);
    }
  }

  /** Refresh sidebar pose thumbnails after edits. */
  private refreshSheetSidebar(): void {
    if (!this.sheetContainer) return;
    const cells = this.sheetContainer.querySelectorAll('.sprite-sheet-sidebar-cell canvas');
    const poses = this.activePoses;
    cells.forEach((cvs, i) => {
      const pose = poses[i];
      if (!pose) return;
      const ctx = (cvs as HTMLCanvasElement).getContext('2d');
      if (ctx) ctx.putImageData(pose.preview, 0, 0);
    });
  }

  /** Render the mini tile grid for the zoomed pose. */
  private renderSheetTileGrid(container: HTMLElement, pose: CapturedPose): void {
    container.innerHTML = '';

    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;

    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();
    const paletteIdx = this.activeGroup?.spriteCapture?.palette ?? 0;
    const palette = readPalette(bufs.vram, video.getPaletteBase(), paletteIdx);

    for (let i = 0; i < pose.tiles.length; i++) {
      const t = pose.tiles[i]!;
      const tileCvs = document.createElement('canvas');
      tileCvs.width = 16;
      tileCvs.height = 16;
      tileCvs.className = 'sprite-sheet-tile';
      if (i === this.sheetSelectedTile) tileCvs.classList.add('active');

      const tileCtx = tileCvs.getContext('2d')!;
      const pixels = readTileFn(gfxRom, t.mappedCode, 16, 16, 128);
      const img = new ImageData(16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const srcX = t.flipX ? 15 - px : px;
          const srcY = t.flipY ? 15 - py : py;
          const colorIdx = pixels[srcY * 16 + srcX]!;
          if (colorIdx === 15) continue; // transparent pen
          const [r, g, b] = palette[colorIdx] ?? [0, 0, 0];
          const di = (py * 16 + px) * 4;
          img.data[di] = r;
          img.data[di + 1] = g;
          img.data[di + 2] = b;
          img.data[di + 3] = 255;
        }
      }
      tileCtx.putImageData(img, 0, 0);

      tileCvs.onclick = () => {
        this.sheetSelectedTile = i;
        this.selectSheetTile(i);
      };

      container.appendChild(tileCvs);
    }
  }

  /** Select a tile in the zoomed pose view and set up the editor for it. */
  private selectSheetTile(tileIdx: number): void {
    const poses = this.activePoses;
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;
    const t = pose.tiles[tileIdx];
    if (!t) return;

    const paletteIdx = this.activeGroup?.spriteCapture?.palette ?? 0;
    this.editor.selectTileFromPose(t.mappedCode, paletteIdx);
    this.refreshTileGrid();
    this.refreshPalette();
    this.refreshNeighbors();
    this.refreshInfoBar();
    this.refreshUndoButtons();

    // Refresh the zoomed pose canvas with highlight
    this.renderSheetZoomedPose();

    // Update tile grid highlights
    const tilesGrid = this.sheetContainer?.querySelector('.sprite-sheet-tiles');
    if (tilesGrid) {
      tilesGrid.querySelectorAll('.sprite-sheet-tile').forEach((c, i) => {
        c.classList.toggle('active', i === tileIdx);
      });
    }
  }

  /** Exit sprite sheet mode and return to the game. */
  private exitSpriteSheetMode(): void {
    if (!this.spriteSheetMode) return;

    this.spriteSheetMode = false;
    this.sheetZoomed = false;
    this.sheetSelectedTile = -1;
    this.sheetZoomCanvas = null;
    this.sheetZoomCtx = null;

    // Remove sheet container
    this.sheetContainer?.remove();
    this.sheetContainer = null;

    // Show game canvas and overlay
    this.gameCanvas.style.display = '';
    if (this.overlay) this.overlay.style.display = '';

    // Resume game (frames + audio)
    if (this.emulator.isPaused()) {
      this.emulator.resume();
      this.emulator.resumeAudio();
    }
  }

  // -- Sprite Analyzer --

  // -- Pose Capture --

  private toggleCapture(): void {
    if (this.capturing) {
      this.stopCapture();
    } else {
      this.startCapture();
    }
  }

  private startCapture(): void {
    const tile = this.editor.currentTile;
    if (!tile || tile.layerId !== LAYER_OBJ || tile.spriteIndex === undefined) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    // Identify the character group at this moment
    const allSprites = readAllSprites(video);
    const group = groupCharacter(allSprites, tile.spriteIndex);
    if (!group) return;

    this.capturing = true;
    this.capturedPoses = [];
    this.captureSeenHashes.clear();
    this.capturePalette = group.palette;
    this.captureCenterX = group.bounds.x + group.bounds.w / 2;
    this.captureCenterY = group.bounds.y + group.bounds.h / 2;

    this.captureBtn!.textContent = 'Stop Capture';
    this.captureBtn!.classList.add('edit-capture-active');
    this.capturePanel!.style.display = '';
    this.captureGallery!.innerHTML = '';
    this.captureStatus!.textContent = 'Capturing... Play the game!';

    // Capture the initial pose
    this.captureCurrentFrame(video, group);

    // Resume game if paused
    if (this.emulator.isPaused()) this.emulator.resume();
  }

  private stopCapture(): void {
    if (!this.capturing) return;
    this.capturing = false;
    if (this.captureBtn) {
      this.captureBtn.textContent = 'Start Capture';
      this.captureBtn.classList.remove('edit-capture-active');
    }
    if (this.capturedPoses.length > 0) {
      // Find or update the sprite group with the captured poses
      let spriteGroupIdx = this.layerGroups.findIndex(g => g.type === 'sprite');
      if (spriteGroupIdx === -1) {
        this.layerGroups.push(createSpriteGroup(
          `Sprites (${this.capturedPoses.length} poses)`,
          this.capturedPoses,
          this.capturePalette,
        ));
        spriteGroupIdx = this.layerGroups.length - 1;
      } else {
        const g = this.layerGroups[spriteGroupIdx]!;
        g.name = `Sprites (${this.capturedPoses.length} poses)`;
        g.spriteCapture = { poses: this.capturedPoses, palette: this.capturePalette, selectedPoseIndex: 0 };
      }
      this.activeGroupIndex = spriteGroupIdx;
      this.activeLayerIndex = -1;

      // Hide the capture floating panel — sprite sheet viewer takes over
      if (this.capturePanel) this.capturePanel.style.display = 'none';
      if (this.captureBtn) this.captureBtn.style.display = 'none';

      this.refreshLayerPanel();
      this.enterSpriteSheetMode();
    }
  }

  /** Show the first captured pose in a large canvas with selection + pixel editing. */
  /** Show/rebuild the layer editor canvas. Works for both sprite and scroll groups. */
  private showHeadSelector(): void {
    if (!this.headSection) return;
    const group = this.activeGroup;
    if (!group) return;

    // Determine canvas dimensions
    let canvasW: number;
    let canvasH: number;
    if (group.type === 'sprite') {
      const pose = this.activePose;
      if (!pose) return;
      canvasW = pose.w;
      canvasH = pose.h;
    } else {
      canvasW = SCREEN_WIDTH;
      canvasH = SCREEN_HEIGHT;
    }

    this.headSection.style.display = '';
    this.headSection.innerHTML = '';

    this.headScale = Math.max(1, Math.floor(400 / Math.max(canvasW, canvasH)));
    const scale = this.headScale;

    const label = el('div', 'edit-section-label');
    label.textContent = 'Select head area (click + drag), then drop a photo. After: use tools to edit pixels.';
    this.headSection.appendChild(label);

    const cvs = document.createElement('canvas');
    cvs.width = canvasW * scale;
    cvs.height = canvasH * scale;
    cvs.className = 'edit-head-canvas edit-head-selectable';
    this.headCanvas = cvs;
    this.headCtx = cvs.getContext('2d')!;
    this.headCtx.imageSmoothingEnabled = false;

    this.drawHeadSelector();

    let painting = false;

    cvs.addEventListener('mousedown', (e) => {
      const rect = cvs.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / scale);
      const py = Math.floor((e.clientY - rect.top) / scale);

      if (this.activeLayer) {
        if (this.editor.tool === 'fill') {
          this.magicWand(px, py);
        } else {
          painting = true;
          this.headPixelAction(px, py);
        }
      }
    });

    cvs.addEventListener('mousemove', (e) => {
      const rect = cvs.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / scale);
      const py = Math.floor((e.clientY - rect.top) / scale);

      if (painting) {
        this.headPixelAction(px, py);
      }
    });

    const stopAction = () => { painting = false; };
    cvs.addEventListener('mouseup', stopAction);
    cvs.addEventListener('mouseleave', stopAction);

    this.headSection.appendChild(cvs);

    // Merge button (hidden until layer exists)
    const mergeBtn = el('button', 'ctrl-btn edit-merge-btn') as HTMLButtonElement;
    const quantizeBtn = el('button', 'ctrl-btn edit-quantize-btn') as HTMLButtonElement;
    quantizeBtn.textContent = 'Quantize';
    quantizeBtn.style.display = 'none';
    quantizeBtn.onclick = () => this.quantizeLayer();
    this.headSection.appendChild(quantizeBtn);

    mergeBtn.textContent = 'Merge Layer';
    mergeBtn.style.display = 'none';
    mergeBtn.onclick = () => { this.mergeAll(); mergeBtn.style.display = 'none'; quantizeBtn.style.display = 'none'; };
    this.headSection.appendChild(mergeBtn);

    this.quantizeBtn = quantizeBtn;

    // Show merge button when layer is created
    const origImport = this.importPhoto.bind(this);
    const origSetup = this.setupDropZone.bind(this);
    // We'll toggle visibility in drawHeadSelector instead

    const info = el('div', 'edit-head-info');
    info.textContent = 'Draw rectangle → drop photo → B:pencil X:eraser G:wand I:picker Shift+arrows:move';
    this.headSection.appendChild(info);

    // Keyboard handler for layer movement
    const layerKeyHandler = (e: KeyboardEvent) => {
      if (!this.activeLayer) return;
      // Shift+arrows: move layer
      if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowUp') this.activeLayer.offsetY--;
        else if (e.key === 'ArrowDown') this.activeLayer.offsetY++;
        else if (e.key === 'ArrowLeft') this.activeLayer.offsetX--;
        else if (e.key === 'ArrowRight') this.activeLayer.offsetX++;
        this.drawHeadSelector();
      }
      // +/- : resize layer
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.resizeLayer(1);
      } else if (e.key === '-') {
        e.preventDefault();
        this.resizeLayer(-1);
      }
    };
    document.addEventListener('keydown', layerKeyHandler, true);

    // Store merge btn ref for visibility toggle
    this.mergeBtn = mergeBtn;
  }


  /**
   * Apply a pixel edit at (px, py) in sprite coordinates using the current tool.
   * Writes to the GFX ROM tile that contains this pixel.
   */
  /**
   * Edit a pixel on the photo layer (not the ROM).
   * Eraser sets layer pixel to 0 → original tile shows through.
   * Pencil paints on the layer. Eyedropper reads from composite.
   */
  private headPixelAction(px: number, py: number): void {
    if (this.capturedPoses.length === 0 || !this.activeLayer) return;
    const pose = this.activePose!;
    if (px < 0 || py < 0 || px >= pose.w || py >= pose.h) return;

    const layer = this.activeLayer;
    const lx = px - layer.offsetX;
    const ly = py - layer.offsetY;

    const tool = this.editor.tool;

    if (tool === 'eyedropper') {
      // Read from layer first, then from tile if layer is transparent
      if (lx >= 0 && lx < layer.width && ly >= 0 && ly < layer.height && layer.pixels[ly * layer.width + lx]! !== 0) {
        this.editor.setActiveColor(layer.pixels[ly * layer.width + lx]!);
      } else {
        // Read from original tile
        const gfxRom = this.editor.getGfxRom();
        if (!gfxRom) return;
        const tile = pose.tiles.find(t => px >= t.relX && px < t.relX + 16 && py >= t.relY && py < t.relY + 16);
        if (tile) {
          const localX = tile.flipX ? 15 - (px - tile.relX) : px - tile.relX;
          const localY = tile.flipY ? 15 - (py - tile.relY) : py - tile.relY;
          this.editor.setActiveColor(readPixelFn(gfxRom, tile.mappedCode, localX, localY));
        }
      }
      this.refreshPalette();
    } else if (lx >= 0 && lx < layer.width && ly >= 0 && ly < layer.height) {
      // Edit layer pixel
      const colorIndex = tool === 'eraser' ? 0 : this.editor.activeColorIndex;
      layer.pixels[ly * layer.width + lx] = colorIndex;
      this.drawHeadSelector();
    }
  }

  /** Magic wand: flood fill on the layer, setting similar pixels to transparent. */
  private magicWand(px: number, py: number): void {
    if (!this.activeLayer) return;
    const layer = this.activeLayer;
    const lx = px - layer.offsetX;
    const ly = py - layer.offsetY;
    if (lx < 0 || lx >= layer.width || ly < 0 || ly >= layer.height) return;

    const targetIdx = layer.pixels[ly * layer.width + lx]!;
    if (targetIdx === 0) return; // already transparent

    const visited = new Uint8Array(layer.width * layer.height);
    const queue = [ly * layer.width + lx];
    visited[ly * layer.width + lx] = 1;

    while (queue.length > 0) {
      const pos = queue.pop()!;
      layer.pixels[pos] = 0; // erase

      const cx = pos % layer.width;
      const cy = (pos - cx) / layer.width;

      const neighbors = [
        cy > 0 ? pos - layer.width : -1,
        cy < layer.height - 1 ? pos + layer.width : -1,
        cx > 0 ? pos - 1 : -1,
        cx < layer.width - 1 ? pos + 1 : -1,
      ];

      for (const n of neighbors) {
        if (n < 0 || visited[n]) continue;
        visited[n] = 1;
        if (layer.pixels[n] === targetIdx) {
          queue.push(n);
        }
      }
    }

    this.drawHeadSelector();
  }

  /** Merge the photo layer into the GFX ROM tiles for all captured poses. */
  /** Quantize the RGBA layer into palette indices using Atkinson dithering. */
  private quantizeLayer(): void {
    const layer = this.activeLayer;
    if (!layer || layer.quantized) return;
    const group = this.activeGroup;
    if (!group) return;

    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();

    // Get palette index based on group type
    let paletteIdx: number;
    if (group.spriteCapture) {
      paletteIdx = group.spriteCapture.palette;
    } else {
      // Scroll layers: use first palette of the scroll's page
      // Page 1 (Scroll 1): palettes 32-63 → use 32
      // Page 2 (Scroll 2): palettes 64-95 → use 64
      // Page 3 (Scroll 3): palettes 96-127 → use 96
      const pageMap: Record<number, number> = {
        [LAYER_SCROLL1]: 32,
        [LAYER_SCROLL2]: 64,
        [LAYER_SCROLL3]: 96,
      };
      paletteIdx = pageMap[group.layerId ?? 0] ?? 0;
    }

    const palette = readPalette(bufs.vram, video.getPaletteBase(), paletteIdx);
    layer.pixels = quantizeWithDithering(layer.rgbaData, palette);
    layer.quantized = true;
    this.refreshLayerPanel();
    if (this.captureStatus) this.captureStatus.textContent = `Quantized!`;
  }

  /** Resize the photo layer proportionally from the ORIGINAL data (no compound artifacts). */
  private resizeLayer(delta: number): void {
    const layer = this.activeLayer;
    if (!layer) return;

    // Scale by ~10% per step
    const factor = delta > 0 ? 1.1 : 0.9;
    const newW = Math.max(4, Math.round(layer.width * factor));
    const newH = Math.max(4, Math.round(layer.height * factor));
    if (newW === layer.width && newH === layer.height) return;

    // Resize from original RGBA (bilinear, lossless)
    const newRgba = resizeRgba(layer.rgbaOriginal, newW, newH);

    // Keep center in place
    const cx = layer.offsetX + layer.width / 2;
    const cy = layer.offsetY + layer.height / 2;
    layer.offsetX = Math.round(cx - newW / 2);
    layer.offsetY = Math.round(cy - newH / 2);
    layer.rgbaData = newRgba;
    layer.pixels = new Uint8Array(newW * newH);
    layer.width = newW;
    layer.height = newH;
    layer.quantized = false; // reset quantization after resize
    this.drawHeadSelector();
  }

  /** Merge all quantized layers in the active group into the GFX ROM. */
  private mergeAll(): void {
    const group = this.activeGroup;
    if (!group) return;

    let gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;

    let merged = 0;

    if (group.type === 'sprite') {
      // Sprite merge: write into all captured poses
      const poses = this.activePoses;
      if (poses.length === 0) return;
      for (const layer of group.layers) {
        if (!layer.quantized) continue;
        for (const pose of poses) {
          placePhotoOnTiles(gfxRom, pose.tiles, layer.pixels, layer.offsetX, layer.offsetY, layer.width, layer.height);
        }
        merged++;
      }
    } else {
      // Scroll merge: allocate private tile copies to avoid shared-tile corruption
      const video = this.emulator.getVideo();
      if (!video || group.layerId === undefined) return;

      // Build reverse map for this scroll's GFX type
      const gfxTypeMap: Record<number, number> = {
        [LAYER_SCROLL1]: GFXTYPE_SCROLL1,
        [LAYER_SCROLL2]: GFXTYPE_SCROLL2,
        [LAYER_SCROLL3]: GFXTYPE_SCROLL3,
      };
      const charSizeMap: Record<number, number> = { [LAYER_SCROLL1]: 64, [LAYER_SCROLL2]: 128, [LAYER_SCROLL3]: 512 };
      const gfxType = gfxTypeMap[group.layerId] ?? GFXTYPE_SCROLL2;
      const charSize = charSizeMap[group.layerId] ?? 128;

      const tileSizeMap: Record<number, number> = { [LAYER_SCROLL1]: 8, [LAYER_SCROLL2]: 16, [LAYER_SCROLL3]: 32 };
      const tileSize = tileSizeMap[group.layerId] ?? 16;

      // Calculate needed tiles from layer dimensions
      let neededTiles = 0;
      for (const layer of group.layers) {
        if (!layer.quantized) continue;
        const tilesW = Math.ceil(layer.width / tileSize);
        const tilesH = Math.ceil(layer.height / tileSize);
        neededTiles += tilesW * tilesH;
      }

      // Expand GFX ROM if not enough free tiles
      let reverseMap = buildReverseMap(gfxType, 0x10000, video);
      let allocator = new TileAllocator(gfxRom, charSize, reverseMap);
      if (allocator.freeCount < neededTiles) {
        const extraTiles = neededTiles + 32; // exact need + small headroom
        console.log(`[MERGE] Need ${neededTiles} tiles, have ${allocator.freeCount} free. Expanding by ${extraTiles}...`);
        gfxRom = video.expandGfxRom(extraTiles * charSize, gfxType);
        this.emulator.getRomStore()?.updateGraphicsRom(gfxRom);
        reverseMap = buildReverseMap(gfxType, 0x20000, video);
        allocator = new TileAllocator(gfxRom, charSize, reverseMap);
        console.log(`[MERGE] After expand: ${allocator.freeCount} free tiles`);
      }

      const vram = video.getVram();
      const bufs = this.emulator.getBusBuffers();
      const paletteBase = video.getPaletteBase();
      const isScroll1 = group.layerId === LAYER_SCROLL1;

      // Read palette 0 for the scroll page (the quantize target)
      const pageMap: Record<number, number> = { [LAYER_SCROLL1]: 32, [LAYER_SCROLL2]: 64, [LAYER_SCROLL3]: 96 };
      const targetPalIdx = pageMap[group.layerId] ?? 0;
      const targetPalette = readPalette(bufs.vram, paletteBase, targetPalIdx);

      // Phase 1: Find which tilemap entries need private copies
      // (entries that have at least one non-transparent photo pixel)
      const entriesToCopy = new Set<number>();
      for (const layer of group.layers) {
        if (!layer.quantized) continue;
        for (let ly = 0; ly < layer.height; ly++) {
          for (let lx = 0; lx < layer.width; lx++) {
            if (layer.pixels[ly * layer.width + lx] === 0) continue;
            const sx = lx + layer.offsetX;
            const sy = ly + layer.offsetY;
            if (sx < 0 || sx >= SCREEN_WIDTH || sy < 0 || sy >= SCREEN_HEIGHT) continue;
            const info = video.inspectScrollAt(sx, sy, group.layerId, true);
            if (info) entriesToCopy.add(info.tilemapOffset);
          }
        }
      }

      // Phase 2: Allocate private copies + re-quantize ALL pixels in those tiles
      const copiedEntries = new Map<number, number>();
      const palCache = new Map<number, Array<[number, number, number]>>();
      const getPal = (pi: number) => {
        let p = palCache.get(pi);
        if (!p) { p = readPalette(bufs.vram, paletteBase, pi); palCache.set(pi, p); }
        return p;
      };

      // Scan every pixel on screen that belongs to an affected tile
      // and re-quantize original pixels to the target palette
      for (let sy = 0; sy < SCREEN_HEIGHT; sy++) {
        for (let sx = 0; sx < SCREEN_WIDTH; sx++) {
          const info = video.inspectScrollAt(sx, sy, group.layerId, true);
          if (!info || !entriesToCopy.has(info.tilemapOffset)) continue;

          let tileCode = copiedEntries.get(info.tilemapOffset);
          if (tileCode === undefined) {
            const alloc = allocator.allocateAndCopy(info.tileCode);
            if (!alloc) continue;
            tileCode = alloc.mapped;
            copiedEntries.set(info.tilemapOffset, tileCode);
            patchTilemapCode(vram, info.tilemapOffset, alloc.raw);
            patchTilemapPalette(vram, info.tilemapOffset, 0);
          }

          // Re-quantize the original pixel to the target palette
          const origPalette = getPal(info.paletteIndex);
          const origIdx = info.colorIndex;
          const [or, og, ob] = origPalette[origIdx] ?? [0, 0, 0];
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let c = 0; c < targetPalette.length; c++) {
            const [pr, pg, pb] = targetPalette[c]!;
            const dist = (or - pr) ** 2 + (og - pg) ** 2 + (ob - pb) ** 2;
            if (dist < bestDist) { bestDist = dist; bestIdx = c; }
          }

          writeScrollPixel(gfxRom, tileCode, info.localX, info.localY, bestIdx, charSize, info.tileIndex, isScroll1);
        }
      }

      // Phase 3: Overwrite with photo pixels (on top of re-quantized originals)
      for (const layer of group.layers) {
        if (!layer.quantized) continue;
        for (let ly = 0; ly < layer.height; ly++) {
          for (let lx = 0; lx < layer.width; lx++) {
            const idx = layer.pixels[ly * layer.width + lx]!;
            if (idx === 0) continue;
            const sx = lx + layer.offsetX;
            const sy = ly + layer.offsetY;
            if (sx < 0 || sx >= SCREEN_WIDTH || sy < 0 || sy >= SCREEN_HEIGHT) continue;
            const info = video.inspectScrollAt(sx, sy, group.layerId, true);
            if (!info) continue;
            const tileCode = copiedEntries.get(info.tilemapOffset);
            if (tileCode === undefined) continue;
            writeScrollPixel(gfxRom, tileCode, info.localX, info.localY, idx, charSize, info.tileIndex, isScroll1);
          }
        }
        merged++;
      }

      console.log(`[MERGE] Allocated ${copiedEntries.size} tiles. Free: ${allocator.freeCount}/${allocator.totalCount}`);
    }

    // Remove merged layers
    group.layers = group.layers.filter(l => !l.quantized);
    this.activeLayerIndex = group.layers.length > 0 ? 0 : -1;

    this.emulator.rerender();
    this.refreshLayerPanel();
    if (this.captureStatus) {
      this.captureStatus.textContent = `Merged ${merged} layer${merged !== 1 ? 's' : ''}.`;
    }
  }

  /** Composite a single layer onto an ImageData buffer. */
  private compositeLayerOnto(
    composite: ImageData,
    layer: PhotoLayer,
    w: number,
    h: number,
    palette: Array<[number, number, number]> | null,
  ): void {
    if (layer.quantized && palette) {
      for (let ly = 0; ly < layer.height; ly++) {
        for (let lx = 0; lx < layer.width; lx++) {
          const idx = layer.pixels[ly * layer.width + lx]!;
          if (idx === 0) continue;
          const cx = lx + layer.offsetX;
          const cy = ly + layer.offsetY;
          if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
          const di = (cy * w + cx) * 4;
          const [r, g, b] = palette[idx] ?? [0, 0, 0];
          composite.data[di] = r;
          composite.data[di + 1] = g;
          composite.data[di + 2] = b;
          composite.data[di + 3] = 255;
        }
      }
    } else {
      const rd = layer.rgbaData;
      for (let ly = 0; ly < layer.height; ly++) {
        for (let lx = 0; lx < layer.width; lx++) {
          const si = (ly * layer.width + lx) * 4;
          const a = rd.data[si + 3]!;
          if (a < 128) continue;
          const cx = lx + layer.offsetX;
          const cy = ly + layer.offsetY;
          if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
          const di = (cy * w + cx) * 4;
          composite.data[di] = rd.data[si]!;
          composite.data[di + 1] = rd.data[si + 1]!;
          composite.data[di + 2] = rd.data[si + 2]!;
          composite.data[di + 3] = 255;
        }
      }
    }
  }

  /** Re-read tiles from GFX ROM to update the pose preview after pixel edits. */
  private refreshHeadPreview(): void {
    const pose = this.activePose;
    const ag = this.activeGroup;
    if (!pose || !ag?.spriteCapture) return;
    const video = this.emulator.getVideo();
    if (!video) return;
    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const bufs = this.emulator.getBusBuffers();
    const pal = ag.spriteCapture.palette;
    const palette = readPalette(bufs.vram, video.getPaletteBase(), pal);
    const sprGroup: SpriteGroupData = {
      sprites: [], palette: pal,
      bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
      tiles: pose.tiles,
    };
    pose.preview = assembleCharacter(gfxRom, sprGroup, palette);
  }

  private drawHeadSelector(): void {
    const ctx = this.headCtx;
    if (!ctx || !this.headCanvas) return;

    const group = this.activeGroup;
    if (!group) return;

    const scale = this.headScale;
    let w: number;
    let h: number;
    let composite: ImageData;

    if (group.type === 'sprite') {
      const pose = this.activePose;
      if (!pose) return;
      w = pose.w;
      h = pose.h;
      this.refreshHeadPreview();
      composite = new ImageData(w, h);
      composite.data.set(pose.preview.data);
    } else {
      // Scroll: black background (tiles would need tilemap reading — future)
      w = SCREEN_WIDTH;
      h = SCREEN_HEIGHT;
      composite = new ImageData(w, h);
    }

    // Overlay all visible layers (bottom to top)
    if (group) {
      const video = this.emulator.getVideo();
      const bufs = this.emulator.getBusBuffers();
      const pal = group.spriteCapture
        ? (video ? readPalette(bufs.vram, video.getPaletteBase(), group.spriteCapture.palette) : null)
        : null;

      for (const layer of group.layers) {
        if (!layer.visible) continue;
        this.compositeLayerOnto(composite, layer, w, h, pal);
      }
    }

    // Draw composite scaled up
    const tmpCvs = document.createElement('canvas');
    tmpCvs.width = w;
    tmpCvs.height = h;
    tmpCvs.getContext('2d')!.putImageData(composite, 0, 0);

    ctx.clearRect(0, 0, this.headCanvas.width, this.headCanvas.height);
    ctx.drawImage(tmpCvs, 0, 0, w, h, 0, 0, w * scale, h * scale);


    // Toggle button visibility
    const layer = this.activeLayer;
    const hasAnyQuantized = group?.layers.some(l => l.quantized) ?? false;
    if (this.quantizeBtn) this.quantizeBtn.style.display = (layer && !layer.quantized) ? '' : 'none';
    if (this.mergeBtn) this.mergeBtn.style.display = hasAnyQuantized ? '' : 'none';

    // Layer outline (after photo drop)
    if (this.activeLayer) {
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(
        this.activeLayer.offsetX * scale,
        this.activeLayer.offsetY * scale,
        this.activeLayer.width * scale,
        this.activeLayer.height * scale,
      );
      ctx.setLineDash([]);
    }
  }

  /**
   * Called every frame from the overlay loop. If capturing, tracks
   * the character and captures new unique poses.
   */
  private captureFrame(): void {
    if (!this.capturing) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    // Track the character by palette + closest center
    const group = trackCharacter(video, this.capturePalette, this.captureCenterX, this.captureCenterY);
    if (!group) return;

    // Update tracking center for next frame
    this.captureCenterX = group.bounds.x + group.bounds.w / 2;
    this.captureCenterY = group.bounds.y + group.bounds.h / 2;

    this.captureCurrentFrame(video, group);
  }

  private captureCurrentFrame(video: CPS1Video, group: SpriteGroupData): void {
    const hash = poseHash(group);
    if (this.captureSeenHashes.has(hash)) return; // already captured
    this.captureSeenHashes.add(hash);

    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;

    const bufs = this.emulator.getBusBuffers();
    const palette = readPalette(bufs.vram, video.getPaletteBase(), group.palette);
    const pose = capturePose(gfxRom, group, palette);

    this.capturedPoses.push(pose);
    this.addPoseCard(pose, this.capturedPoses.length - 1);

    this.captureStatus!.textContent = `Capturing... ${this.capturedPoses.length} unique pose${this.capturedPoses.length !== 1 ? 's' : ''}`;
  }

  private addPoseCard(pose: CapturedPose, index: number): void {
    const gallery = this.captureGallery;
    if (!gallery) return;

    const card = el('div', 'edit-variant-card') as HTMLDivElement;
    if (index === this.selectedPoseIndex) card.classList.add('edit-variant-ref');

    card.onclick = () => {
      this.selectedPoseIndex = index;
      this.refreshHeadPreview();
      this.drawHeadSelector();
      // Update selected highlight
      gallery.querySelectorAll('.edit-variant-card').forEach((c, i) => {
        c.classList.toggle('edit-variant-ref', i === index);
      });
    };

    const cvs = document.createElement('canvas');
    cvs.width = pose.w;
    cvs.height = pose.h;
    cvs.className = 'edit-variant-canvas';
    const ctx = cvs.getContext('2d')!;
    ctx.putImageData(pose.preview, 0, 0);
    card.appendChild(cvs);

    const badge = el('div', 'edit-variant-badge');
    badge.textContent = `${pose.tiles.length}t`;
    badge.classList.add('edit-variant-high');
    card.appendChild(badge);

    gallery.appendChild(card);
  }

  // -- Photo Import --

  private setupDropZone(): void {
    const panel = this.capturePanel;
    if (!panel) return;

    // Add drop hint
    const dropHint = el('div', 'edit-drop-hint');
    dropHint.textContent = 'Drop a photo here to apply on all poses';
    panel.appendChild(dropHint);

    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      panel.classList.add('edit-drop-active');
    });
    panel.addEventListener('dragleave', () => {
      panel.classList.remove('edit-drop-active');
    });
    panel.addEventListener('drop', (e) => {
      e.preventDefault();
      panel.classList.remove('edit-drop-active');
      const file = (e as DragEvent).dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        this.importPhoto(file);
      }
    });
  }

  private async importPhoto(file: File): Promise<void> {
    const group = this.activeGroup;
    if (!group) return;

    // Determine max dimensions based on group type
    let maxW: number;
    let maxH: number;
    let centerW: number;
    let centerH: number;

    if (group.type === 'sprite') {
      const pose = this.activePose;
      if (!pose) return;
      maxW = pose.w;
      maxH = Math.round(pose.h * 0.5);
      centerW = pose.w;
      centerH = pose.h;
    } else {
      // Scroll: use screen dimensions as bounds
      maxW = SCREEN_WIDTH;
      maxH = SCREEN_HEIGHT;
      centerW = SCREEN_WIDTH;
      centerH = SCREEN_HEIGHT;
    }

    this.captureStatus!.textContent = 'Loading photo...';

    try {
      const rgba = await loadPhotoRgba(file, maxW, maxH);

      const newLayer = createLayer(
        file.name,
        rgba,
        Math.round((centerW - rgba.width) / 2),
        Math.round((centerH - rgba.height) / 2),
      );
      group.layers.push(newLayer);
      this.activeLayerIndex = group.layers.length - 1;
      // Layers render directly on game overlay now — no need for floating editor
      this.drawHeadSelector();

      this.captureStatus!.textContent = `Photo loaded (${rgba.width}\u00D7${rgba.height}). Resize: +/\u2212. Move: Shift+arrows. Click "Quantize" when positioned.`;
      this.refreshLayerPanel();
    } catch (err) {
      this.captureStatus!.textContent = `Error: ${err instanceof Error ? err.message : 'unknown'}`;
    }
  }

  private refreshPoseGallery(): void {
    const gallery = this.captureGallery;
    if (!gallery) return;
    gallery.innerHTML = '';

    const video = this.emulator.getVideo();
    if (!video) return;
    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const bufs = this.emulator.getBusBuffers();

    const ag = this.activeGroup;
    const pal = ag?.spriteCapture?.palette ?? 0;
    const poses = this.activePoses;

    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i]!;
      const palette = readPalette(bufs.vram, video.getPaletteBase(), pal);
      const sprGroup: SpriteGroupData = {
        sprites: [],
        palette: pal,
        bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
        tiles: pose.tiles,
      };
      pose.preview = assembleCharacter(gfxRom, sprGroup, palette);
      this.addPoseCard(pose, i);
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
