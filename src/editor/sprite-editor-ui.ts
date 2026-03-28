/**
 * Sprite Editor UI — integrated into the debug/video panel.
 *
 * Provides DOM elements (tile grid, tools, palette) that are injected into
 * a container (the debug panel). Manages the overlay canvas on the game screen
 * and keyboard shortcuts independently.
 */

import { SpriteEditor, type EditorTool } from './sprite-editor';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3, readWord, type CPS1Video } from '../video/cps1-video';
import { readAllSprites, groupCharacter, poseHash, capturePose, assembleCharacter, type SpriteGroup as SpriteGroupData, type CapturedPose } from './sprite-analyzer';
import { loadPhotoRgba, resizeRgba, quantizeWithDithering, placePhotoOnTiles, generatePalette } from './photo-import';
import { encodeColor } from './palette-editor';
import { readPixel as readPixelFn, writePixel as writePixelFn, writeScrollPixel, readTile as readTileFn } from './tile-encoder';
import { readPalette, rgbToHsl, hslToRgb } from './palette-editor';
import { createLayer, createSpriteGroup, createScrollGroup, type PhotoLayer, type LayerGroup } from './layer-model';
import { LayerPanel } from './layer-panel';
import { findTileReferences } from './tile-refs';
import type { Emulator } from '../emulator';
import { pencilCursor, fillCursor, eyedropperCursor, eraserCursor, wandCursor } from './tool-cursors';
import { showToast } from '../ui/toast';
import { setTooltip } from '../ui/tooltip';
import { createStatusBar, setStatus } from '../ui/status-bar';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 256; // fixed canvas size

const TOOL_DEFS: { id: EditorTool; label: string; key: string; icon: string; tip: string }[] = [
  { id: 'pencil',     label: 'Pencil',     key: 'B', icon: '\u270F\uFE0F', tip: 'Draw pixels one by one' },
  { id: 'fill',       label: 'Fill',       key: 'G', icon: '\u{1F4A7}',    tip: 'Flood fill connected area' },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I', icon: '\u{1F4CD}',    tip: 'Pick color from tile' },
  { id: 'eraser',     label: 'Eraser',     key: 'X', icon: '\u{1F6AB}',    tip: 'Set pixels to transparent' },
  { id: 'wand',       label: 'Wand',       key: 'W', icon: '\u{1FA84}',    tip: 'Erase connected similar colors' },
];

const TOOL_STATUS: Record<EditorTool, string> = {
  pencil: 'Click to draw — Shift+click: line',
  fill: 'Click to flood fill area',
  eyedropper: 'Click to pick color from tile',
  eraser: 'Click to erase to transparent',
  wand: 'Click to erase similar colors — Shift+[ / ]: tolerance',
};

const TOOL_CURSORS: Record<string, string> = {
  pencil: pencilCursor,
  fill: fillCursor,
  eyedropper: eyedropperCursor,
  eraser: eraserCursor,
  wand: wandCursor,
};

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
  private capturePanel: HTMLDivElement | null = null;
  private captureGallery: HTMLDivElement | null = null;
  private captureStatus: HTMLDivElement | null = null;
  private capturesSection: HTMLDivElement | null = null;
  private capturesList: HTMLDivElement | null = null;
  private selectedPoseIndex = 0;

  // Capture state — multiple simultaneous captures keyed by palette
  private activeSessions = new Map<number, { poses: CapturedPose[]; seenHashes: Set<string>; refTileCount: number }>();
  private captureCounter = 0;

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
  private wasPausedBeforeSheet = false;

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
  private lastMouseX = 0;
  private lastMouseY = 0;
  private selectedTileScreenX = 0;
  private selectedTileScreenY = 0;
  private nuanceGroup = new Set<number>();
  private wandTolerance = 30;

  // Zoom/pan — tile canvas
  private tileZoom = 1;
  private tilePanX = 0;
  private tilePanY = 0;
  private tilePanning = false;
  private tilePanStartX = 0;
  private tilePanStartY = 0;

  // Zoom/pan — game overlay
  private gameZoom = 1;
  private gamePanX = 0;
  private gamePanY = 0;
  private gamePanning = false;
  private gamePanStartX = 0;
  private gamePanStartY = 0;
  private spaceHeld = false;
  private _savedTile: import('./sprite-editor').TileContext | null = null;
  private gridLayers: Map<number, boolean> = new Map();
  private hwLayerVisible: Map<number, boolean> = new Map();
  private _isInteractionBlocked: (() => boolean) | null = null;
  private _onHwLayerToggle: ((layerId: number, visible: boolean) => void) | null = null;
  private _onSpreadChange: ((value: number) => void) | null = null;

  // Bound handlers
  private readonly boundKeyHandler: (e: KeyboardEvent) => void;
  private readonly boundKeyUpHandler: (e: KeyboardEvent) => void;
  private readonly boundOverlayMove: (e: MouseEvent) => void;
  private readonly boundOverlayClick: (e: MouseEvent) => void;
  private readonly boundOverlayLeave: () => void;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
    this.emulator = emulator;
    this.gameCanvas = canvas;
    this.editor = new SpriteEditor(emulator);

    this.boundKeyHandler = (e) => this.handleKey(e);
    this.boundKeyUpHandler = (e) => this.handleKeyUp(e);
    this.boundOverlayMove = (e) => this.handleOverlayMove(e);
    this.boundOverlayClick = (e) => this.handleOverlayClick(e);
    this.boundOverlayLeave = () => this.clearOverlay();

    this.editor.setOnTileChanged(() => {
      this.refreshTileGrid();
      this.emulator.rerender();
      this.emulator.getRomStore()?.onModified?.();
      if (this.spriteSheetMode) this.refreshSheetAfterEdit();
      this.refreshCapturesPanel();
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
    container.appendChild(this.infoBar);

    // Action buttons (above tile grid)
    const actions = el('div', 'edit-actions');

    this.undoBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    this.undoBtn.textContent = 'Undo';
    setTooltip(this.undoBtn, 'Undo — Ctrl+Z');
    this.undoBtn.onclick = () => { this.editor.undo(); this.refreshUndoButtons(); };
    actions.appendChild(this.undoBtn);

    this.redoBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    this.redoBtn.textContent = 'Redo';
    setTooltip(this.redoBtn, 'Redo — Ctrl+Shift+Z');
    this.redoBtn.onclick = () => { this.editor.redo(); this.refreshUndoButtons(); };
    actions.appendChild(this.redoBtn);

    this.resetBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    this.resetBtn.textContent = 'Reset Tile';
    setTooltip(this.resetBtn, 'Restore tile to original ROM data');
    this.resetBtn.onclick = () => { this.editor.resetTile(); this.refreshUndoButtons(); };
    actions.appendChild(this.resetBtn);

    const eraseBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    eraseBtn.textContent = 'Erase Tile';
    setTooltip(eraseBtn, 'Clear all pixels to transparent — Delete');
    eraseBtn.onclick = () => { this.editor.eraseTile(); this.refreshUndoButtons(); };
    actions.appendChild(eraseBtn);

    const importImgBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    importImgBtn.innerHTML = '\u{1F4E5} Import';
    setTooltip(importImgBtn, 'Import image onto this tile');
    importImgBtn.onclick = () => this.importImageOnCurrentTile();
    actions.appendChild(importImgBtn);

    const exportImgBtn = el('button', 'ctrl-btn') as HTMLButtonElement;
    exportImgBtn.innerHTML = '\u{1F4E4} Export';
    setTooltip(exportImgBtn, 'Export this tile as PNG');
    exportImgBtn.onclick = () => this.exportCurrentTile();
    actions.appendChild(exportImgBtn);

    container.appendChild(actions);
    this.refreshUndoButtons();

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
      btn.innerHTML = `<span class="edit-tool-icon">${def.icon}</span> ${def.label}`;
      setTooltip(btn, `${def.label} (${def.key}) — ${def.tip}`);
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

    // Captured sprites section
    this.capturesSection = el('div', 'edit-captures-section') as HTMLDivElement;
    const capturesLabel = el('div', 'edit-section-label');
    capturesLabel.textContent = 'Captured Sprites';
    this.capturesSection.appendChild(capturesLabel);
    const capturesHint = el('div', 'edit-capture-hint') as HTMLDivElement;
    capturesHint.textContent = 'Shift+click a sprite to capture';
    this.capturesSection.appendChild(capturesHint);
    this.capturesList = el('div', 'edit-captures-list') as HTMLDivElement;
    this.capturesSection.appendChild(this.capturesList);
    container.appendChild(this.capturesSection);

    // Status bar (contextual hint at bottom)
    container.appendChild(createStatusBar());
    this.updateStatus();
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

  /** Collect all captured poses across all sprite layer groups */
  getAllPoses(): CapturedPose[] {
    return this.layerGroups.flatMap(g => g.spriteCapture?.poses ?? []);
  }

  /** Restore poses from a save file (creates sprite groups) */
  restorePoses(poses: CapturedPose[]): void {
    // Group poses by palette
    const byPalette = new Map<number, CapturedPose[]>();
    for (const pose of poses) {
      const list = byPalette.get(pose.palette) ?? [];
      list.push(pose);
      byPalette.set(pose.palette, list);
    }
    for (const [palette, groupPoses] of byPalette) {
      this.layerGroups.push(createSpriteGroup(`Restored (pal ${palette})`, groupPoses, palette));
    }
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
    this.layerPanel?.destroy();
    this.layerPanel = null;
  }

  // -- Activate / Deactivate (overlay + shortcuts, no panel creation) --

  activate(): void {
    this.editor.activate();
    // Restore tile selection from before deactivate
    if (this._savedTile) {
      this.editor.restoreSelection(this._savedTile);
      this._savedTile = null;
    }
    this.createOverlay();
    document.body.classList.add('edit-active');
    document.addEventListener('keydown', this.boundKeyHandler);
    document.addEventListener('keyup', this.boundKeyUpHandler);
    this.startOverlayLoop();
    this.ensureDefaultGroups();
    this.ensureLayerPanel();
    this.layerPanel?.show();
    this.refreshLayerPanel();
    this.refreshCapturesPanel();
    this.refreshTileGrid();
    this.refreshPalette();
  }

  deactivate(): void {
    if (this.spriteSheetMode) this.exitSpriteSheetMode();
    // Preserve tile selection across deactivate/activate
    const savedTile = this.editor.currentTile;
    this.editor.deactivate();
    this._savedTile = savedTile;
    cancelAnimationFrame(this.overlayRafId);
    document.body.classList.remove('edit-active');
    this.removeOverlay();
    document.removeEventListener('keydown', this.boundKeyHandler);
    document.removeEventListener('keyup', this.boundKeyUpHandler);
    this.spaceHeld = false;
    this.resetTileZoom();
    this.resetGameZoom();
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
    if (!this.layerGroups.some(g => g.type === 'sprite')) {
      this.layerGroups.push({ type: 'sprite', name: 'Sprites (OBJ)', layers: [] });
    }
    this.activeGroupIndex = 0;
    this.reorderGroupsByLayerOrder();
  }

  /** Reorder layer groups to match the CPS-B dynamic layer order (front first). */
  reorderGroupsByLayerOrder(): void {
    const video = this.emulator.getVideo();
    if (!video) return;

    const order = video.getLayerOrder(); // [back, ..., front]
    const layerIdToRank = new Map<number, number>();
    for (let i = 0; i < order.length; i++) {
      // Front = highest rank (order.length - 1 - i → 0 = front)
      layerIdToRank.set(order[i]!, order.length - 1 - i);
    }

    const getGroupLayerId = (g: LayerGroup): number => {
      if (g.type === 'sprite') return LAYER_OBJ;
      return g.layerId ?? 999;
    };

    // Stable sort: HW groups by rank (front first), user-created groups at the end
    const hwGroups = this.layerGroups.filter(g => layerIdToRank.has(getGroupLayerId(g)));
    const otherGroups = this.layerGroups.filter(g => !layerIdToRank.has(getGroupLayerId(g)));
    hwGroups.sort((a, b) => (layerIdToRank.get(getGroupLayerId(a)) ?? 99) - (layerIdToRank.get(getGroupLayerId(b)) ?? 99));
    this.layerGroups.length = 0;
    this.layerGroups.push(...hwGroups, ...otherGroups);
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
        this.hwLayerVisible.set(layerId, visible);
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
    this.reorderGroupsByLayerOrder();
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
    // Use tracked HW visibility (default to true if not yet toggled)
    for (let i = 0; i < 4; i++) hwState.visible.set(i, this.hwLayerVisible.get(i) !== false);

    this.layerPanel?.refresh(this.layerGroups, this.activeGroupIndex, this.activeLayerIndex, gfxRom, hwState);
  }

  private refreshCapturesPanel(): void {
    if (!this.capturesList) return;
    this.capturesList.innerHTML = '';

    let hasEntries = false;

    // Completed captures first (stable order)
    for (let gi = 0; gi < this.layerGroups.length; gi++) {
      const group = this.layerGroups[gi]!;
      if (group.type !== 'sprite' || !group.spriteCapture || group.spriteCapture.poses.length === 0) continue;
      hasEntries = true;

      const card = el('div', 'edit-capture-card') as HTMLDivElement;
      setTooltip(card, 'Open sprite sheet viewer');
      card.onclick = () => {
        this.activeGroupIndex = gi;
        this.activeLayerIndex = -1;
        this.enterSpriteSheetMode();
      };

      const thumb = document.createElement('canvas');
      thumb.className = 'edit-capture-thumb';
      const pose = group.spriteCapture.poses[0]!;
      thumb.width = pose.w;
      thumb.height = pose.h;
      const ctx = thumb.getContext('2d');
      if (ctx) ctx.putImageData(pose.preview, 0, 0);
      card.appendChild(thumb);

      const info = el('div', 'edit-capture-info') as HTMLDivElement;
      const name = el('div', 'edit-capture-name') as HTMLDivElement;
      name.textContent = group.name;
      info.appendChild(name);
      const count = el('div', 'edit-capture-count') as HTMLDivElement;
      count.textContent = `${group.spriteCapture.poses.length} pose${group.spriteCapture.poses.length !== 1 ? 's' : ''}`;
      info.appendChild(count);
      card.appendChild(info);

      this.capturesList.appendChild(card);
    }

    // Active capture sessions at the bottom (recording indicator)
    for (const [palette, session] of this.activeSessions) {
      hasEntries = true;
      const card = el('div', 'edit-capture-card edit-capture-active') as HTMLDivElement;
      setTooltip(card, 'Click to stop capture');
      card.onclick = () => this.stopCaptureForPalette(palette);

      const thumb = document.createElement('canvas');
      thumb.className = 'edit-capture-thumb';
      if (session.poses.length > 0) {
        const pose = session.poses[0]!;
        thumb.width = pose.w;
        thumb.height = pose.h;
        const ctx = thumb.getContext('2d');
        if (ctx) ctx.putImageData(pose.preview, 0, 0);
      } else {
        thumb.width = 16;
        thumb.height = 16;
      }
      card.appendChild(thumb);

      const info = el('div', 'edit-capture-info') as HTMLDivElement;
      const name = el('div', 'edit-capture-name') as HTMLDivElement;
      name.textContent = `Palette ${palette}`;
      info.appendChild(name);
      const count = el('div', 'edit-capture-count') as HTMLDivElement;
      count.textContent = `Recording... ${session.poses.length} pose${session.poses.length !== 1 ? 's' : ''}`;
      info.appendChild(count);
      card.appendChild(info);

      this.capturesList.appendChild(card);
    }

    if (!hasEntries) {
      const empty = el('div', 'edit-capture-empty') as HTMLDivElement;
      empty.textContent = 'No captures yet';
      this.capturesList.appendChild(empty);
    }
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

      // Shift+click: select the topmost layer under cursor (search ALL groups, world coords)
      if (e.shiftKey) {
        for (let gi = this.layerGroups.length - 1; gi >= 0; gi--) {
          const group = this.layerGroups[gi]!;
          const sc = this.getGroupScroll(group);
          // Convert screen pos to world pos for this group
          const wx = pos.x + sc.sx;
          const wy = pos.y + sc.sy;
          for (let i = group.layers.length - 1; i >= 0; i--) {
            const l = group.layers[i]!;
            if (!l.visible) continue;
            if (wx >= l.offsetX && wx < l.offsetX + l.width
                && wy >= l.offsetY && wy < l.offsetY + l.height) {
              this.activeGroupIndex = gi;
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

      // Convert screen coords to world coords for the active group
      const agScroll = this.activeGroup ? this.getGroupScroll(this.activeGroup) : { sx: 0, sy: 0 };
      const wx = pos.x + agScroll.sx;
      const wy = pos.y + agScroll.sy;

      // Check resize handles first (4 corners, tolerance of 5 game pixels)
      const ht = 5;
      const lx = layer.offsetX, ly = layer.offsetY;
      const lw = layer.width, lh = layer.height;
      const corners: [string, number, number][] = [
        ['tl', lx, ly], ['tr', lx + lw, ly],
        ['bl', lx, ly + lh], ['br', lx + lw, ly + lh],
      ];
      for (const [corner, cx, cy] of corners) {
        if (Math.abs(wx - cx) <= ht && Math.abs(wy - cy) <= ht) {
          this.resizingLayer = true;
          this.resizeCorner = corner;
          this.resizeStartW = lw;
          this.resizeStartH = lh;
          this.resizeStartX = wx;
          this.resizeStartY = wy;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      const inBounds = wx >= lx && wx < lx + lw && wy >= ly && wy < ly + lh;
      if (!inBounds) return;

      // Click on layer = drag to move (store world coords)
      this.draggingLayer = true;
      this.dragLastX = wx;
      this.dragLastY = wy;
      e.preventDefault();
      e.stopPropagation();
    });
    cvs.addEventListener('mouseup', () => {
      if (this.resizingLayer || this.draggingLayer) {
        this.resizingLayer = false;
        this.draggingLayer = false;
        this.refreshLayerPanel();
        // Suppress the click event that follows mouseup to prevent group switch
        // Use capture phase to fire before the existing boundOverlayClick handler
        cvs.addEventListener('click', (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); }, { once: true, capture: true });
      }
    });

    // Game canvas zoom/pan — middle-click or Space+click to pan
    cvs.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (this.spaceHeld && e.button === 0 && !this.activeLayer)) {
        if (this.gameZoom > 1) {
          this.gamePanning = true;
          this.gamePanStartX = e.clientX - this.gamePanX;
          this.gamePanStartY = e.clientY - this.gamePanY;
          cvs.style.cursor = 'grabbing';
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
    }, true); // capture phase so it fires before layer drag

    cvs.addEventListener('mousemove', (e) => {
      if (this.gamePanning) {
        this.gamePanX = e.clientX - this.gamePanStartX;
        this.gamePanY = e.clientY - this.gamePanStartY;
        this.clampGamePan();
        this.applyGameTransform();
        e.stopPropagation();
      }
    }, true);

    cvs.addEventListener('mouseup', () => {
      if (this.gamePanning) {
        this.gamePanning = false;
        this.updateGameCursor();
      }
    }, true);

    // Wheel zoom on game canvas
    cvs.addEventListener('wheel', (e) => {
      e.preventDefault();
      const wrapper = this.gameCanvas.parentElement;
      if (!wrapper) return;
      // Use wrapper rect (stable, not affected by canvas transform)
      const wrapperRect = wrapper.getBoundingClientRect();
      const mx = e.clientX - wrapperRect.left;
      const my = e.clientY - wrapperRect.top;
      // Convert to unscaled canvas coords
      const ux = (mx - this.gamePanX) / this.gameZoom;
      const uy = (my - this.gamePanY) / this.gameZoom;
      const oldZoom = this.gameZoom;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      this.gameZoom = Math.max(1, Math.min(6, this.gameZoom * factor));
      if (this.gameZoom <= 1.01) { this.gameZoom = 1; this.gamePanX = 0; this.gamePanY = 0; }
      else {
        // Keep the point under cursor fixed
        this.gamePanX = mx - ux * this.gameZoom;
        this.gamePanY = my - uy * this.gameZoom;
      }
      this.clampGamePan();
      this.applyGameTransform();
      this.updateGameCursor();
      this.updateStatus();
    }, { passive: false });

    const wrapper = this.gameCanvas.parentElement;
    if (wrapper) {
      wrapper.appendChild(cvs);
      this.createCapturePanel(wrapper);
    }
  }

  private clampGamePan(): void {
    // Clamp based on original (unscaled) canvas dimensions
    const w = this.gameCanvas.offsetWidth;
    const h = this.gameCanvas.offsetHeight;
    const maxX = w * (this.gameZoom - 1);
    const maxY = h * (this.gameZoom - 1);
    this.gamePanX = Math.max(-maxX, Math.min(0, this.gamePanX));
    this.gamePanY = Math.max(-maxY, Math.min(0, this.gamePanY));
  }

  private applyGameTransform(): void {
    const t = this.gameZoom === 1
      ? '' : `translate(${this.gamePanX}px, ${this.gamePanY}px) scale(${this.gameZoom})`;
    const o = this.gameZoom === 1 ? '' : '0 0';
    this.gameCanvas.style.transform = t;
    this.gameCanvas.style.transformOrigin = o;
    if (this.overlay) {
      this.overlay.style.transform = t;
      this.overlay.style.transformOrigin = o;
    }
    const wrapper = this.gameCanvas.parentElement;
    if (wrapper) wrapper.style.overflow = this.gameZoom === 1 ? '' : 'hidden';
  }

  private updateGameCursor(): void {
    if (!this.overlay) return;
    if (this.gameZoom > 1 && this.spaceHeld) {
      this.overlay.style.cursor = 'grab';
    } else {
      this.overlay.style.cursor = '';
    }
  }

  private resetGameZoom(): void {
    this.gameZoom = 1;
    this.gamePanX = 0;
    this.gamePanY = 0;
    this.applyGameTransform();
    this.updateGameCursor();
    this.updateStatus();
    // Clean up wrapper overflow
    const wrapper = this.gameCanvas.parentElement;
    if (wrapper) wrapper.style.overflow = '';
  }

  private createCapturePanel(wrapper: HTMLElement): void {
    // Floating panel (used for head/layer editor in photo import)
    this.capturePanel = el('div', 'edit-analyzer-float') as HTMLDivElement;
    this.capturePanel.style.display = 'none';

    this.captureStatus = el('div', 'edit-analyzer-status') as HTMLDivElement;
    this.capturePanel.appendChild(this.captureStatus);

    this.captureGallery = el('div', 'edit-analyzer-gallery') as HTMLDivElement;
    this.capturePanel.appendChild(this.captureGallery);

    // Head/layer editor section (used by scroll layer photo import)
    this.headSection = el('div', 'edit-head-section') as HTMLDivElement;
    this.headSection.style.display = 'none';
    this.capturePanel.appendChild(this.headSection);

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
    this.stopAllCaptures();
    this.capturePanel?.remove();
    this.capturePanel = null;
  }


  private clearOverlay(): void {
    if (!this.overlayCtx || !this.overlay) return;
    this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private screenCoordsFromEvent(e: MouseEvent): { x: number; y: number } | null {
    if (!this.overlay) return null;
    // getBoundingClientRect accounts for CSS transform, so coords map correctly
    const rect = this.overlay.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * SCREEN_WIDTH);
    const y = Math.floor((e.clientY - rect.top) / rect.height * SCREEN_HEIGHT);
    if (x < 0 || y < 0 || x >= SCREEN_WIDTH || y >= SCREEN_HEIGHT) return null;
    return { x, y };
  }

  /** Get scroll offset for a layer group. Scroll groups return world scroll; sprites return (0,0). */
  private getGroupScroll(group: LayerGroup): { sx: number; sy: number } {
    if (group.type === 'sprite' || group.layerId === undefined) return { sx: 0, sy: 0 };
    const video = this.emulator.getVideo();
    if (!video) return { sx: 0, sy: 0 };
    const cpsaRegs = video.getCpsaRegs();
    const regMap: Record<number, [number, number]> = {
      [LAYER_SCROLL1]: [0x0C, 0x0E],
      [LAYER_SCROLL2]: [0x10, 0x12],
      [LAYER_SCROLL3]: [0x14, 0x16],
    };
    const regs = regMap[group.layerId];
    if (!regs) return { sx: 0, sy: 0 };
    const sx = (readWord(cpsaRegs, regs[0]) + 64) & 0xFFFF;
    const sy = (readWord(cpsaRegs, regs[1]) + 16) & 0xFFFF;
    return { sx, sy };
  }

  private handleOverlayMove(e: MouseEvent): void {
    if (this._isInteractionBlocked?.()) return;
    const mousePos = this.screenCoordsFromEvent(e);
    if (mousePos) { this.lastMouseX = mousePos.x; this.lastMouseY = mousePos.y; }

    // Handle layer corner resize (resizeStartX/Y are in world coords, deltas are the same)
    if (this.resizingLayer && this.activeLayer) {
      const pos = this.screenCoordsFromEvent(e);
      if (pos) {
        const agScroll = this.activeGroup ? this.getGroupScroll(this.activeGroup) : { sx: 0, sy: 0 };
        const dx = (pos.x + agScroll.sx) - this.resizeStartX;
        const dy = (pos.y + agScroll.sy) - this.resizeStartY;
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

    // Handle layer dragging (world coords)
    if (this.draggingLayer && this.activeLayer) {
      const pos = this.screenCoordsFromEvent(e);
      if (pos) {
        const agScroll = this.activeGroup ? this.getGroupScroll(this.activeGroup) : { sx: 0, sy: 0 };
        const wx = pos.x + agScroll.sx;
        const wy = pos.y + agScroll.sy;
        this.activeLayer.offsetX += wx - this.dragLastX;
        this.activeLayer.offsetY += wy - this.dragLastY;
        this.dragLastX = wx;
        this.dragLastY = wy;
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
    this.lastMouseX = pos.x;
    this.lastMouseY = pos.y;

    // If there's an active photo layer under the cursor, don't switch groups (world coords)
    const layer = this.activeLayer;
    if (layer) {
      const agScroll = this.activeGroup ? this.getGroupScroll(this.activeGroup) : { sx: 0, sy: 0 };
      const wx = pos.x + agScroll.sx;
      const wy = pos.y + agScroll.sy;
      if (wx >= layer.offsetX && wx < layer.offsetX + layer.width
          && wy >= layer.offsetY && wy < layer.offsetY + layer.height) {
        return;
      }
    }

    const info = this.editor.selectTileAt(pos.x, pos.y);
    if (info) {
      // Shift+click or Alt+click on an OBJ sprite toggles capture for its palette
      if ((e.shiftKey || e.altKey) && info.layerId === LAYER_OBJ && info.spriteIndex !== undefined) {
        this.toggleCaptureForSprite(info.spriteIndex);
        return;
      }

      this.nuanceGroup.clear();
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

    if (tile.layerId === LAYER_OBJ && tile.spriteIndex !== undefined) {
      // Sprite tile highlight (dashed outline, no fill)
      const objBuf = video.getObjBuffer();
      const entryOff = tile.spriteIndex * 8;
      const sprX = (objBuf[entryOff]! << 8) | objBuf[entryOff + 1]!;
      const sprY = (objBuf[entryOff + 2]! << 8) | objBuf[entryOff + 3]!;
      const tileScreenX = ((sprX + (tile.nxs ?? 0) * 16) & 0x1FF) - 64;
      const tileScreenY = ((sprY + (tile.nys ?? 0) * 16) & 0x1FF) - 16;

      ctx.strokeStyle = '#ff1a50';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(tileScreenX + 0.5, tileScreenY + 0.5, 15, 15);
      ctx.setLineDash([]);
    } else if (tile.layerId >= LAYER_SCROLL1 && tile.layerId <= LAYER_SCROLL3 && tile.screenX !== undefined && tile.screenY !== undefined) {
      // Scroll tile highlight (dashed outline, no fill)
      ctx.strokeStyle = '#ff1a50';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(tile.screenX + 0.5, tile.screenY + 0.5, tile.tileW - 1, tile.tileH - 1);
      ctx.setLineDash([]);
    }
  }

  /** Draw dashed outline around the full character group bounding box. */
  private drawCharacterContour(ctx: CanvasRenderingContext2D, video: CPS1Video, spriteIndex: number): void {
    const allSprites = readAllSprites(video);
    const group = groupCharacter(allSprites, spriteIndex);
    if (!group) return;

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

        // Draw on overlay at layer offset (world coords → screen coords for scroll groups)
        const scroll = this.getGroupScroll(group);
        const screenX = layer.offsetX - scroll.sx;
        const screenY = layer.offsetY - scroll.sy;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmpCvs, screenX, screenY);

        // Draw selection outline + resize handles for active layer
        if (layer === this.activeLayer) {
          const lx = screenX;
          const ly = screenY;
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

    // Red bounds + REC indicator for sprites being captured
    if (this.activeSessions.size > 0) {
      const allSprites = readAllSprites(video);
      const visited = new Set<number>();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 50, 80, 0.8)';
      for (const sprite of allSprites) {
        if (!this.activeSessions.has(sprite.palette)) continue;
        if (visited.has(sprite.index)) continue;
        const group = groupCharacter(allSprites, sprite.index);
        if (!group) continue;
        for (const s of group.sprites) visited.add(s.index);

        const { x, y, w, h } = group.bounds;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        // REC indicator
        const rx = x + w + 2;
        const ry = y + 1;
        ctx.fillStyle = '#ff324a';
        ctx.beginPath();
        ctx.arc(rx + 3, ry + 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '7px sans-serif';
        ctx.fillText('REC', rx + 8, ry + 6);
      }
      ctx.lineWidth = 1;
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

      // Green overlay on editable tiles (refCount = 1)
      {
        // Count tile code occurrences on screen
        const codeCount = new Map<number, number>();
        for (let sy = offsetY; sy < SCREEN_HEIGHT; sy += ts) {
          for (let sx = offsetX; sx < SCREEN_WIDTH; sx += ts) {
            const px = Math.max(0, Math.min(sx + ts / 2, SCREEN_WIDTH - 1));
            const py = Math.max(0, Math.min(sy + ts / 2, SCREEN_HEIGHT - 1));
            const info = video.inspectScrollAt(px, py, cfg.layerId, true);
            if (info) codeCount.set(info.tileCode, (codeCount.get(info.tileCode) ?? 0) + 1);
          }
        }
        // Fill green on tiles with refCount = 1
        ctx.fillStyle = 'rgba(0, 200, 100, 0.35)';
        for (let sy = offsetY; sy < SCREEN_HEIGHT; sy += ts) {
          for (let sx = offsetX; sx < SCREEN_WIDTH; sx += ts) {
            const px = Math.max(0, Math.min(sx + ts / 2, SCREEN_WIDTH - 1));
            const py = Math.max(0, Math.min(sy + ts / 2, SCREEN_HEIGHT - 1));
            const info = video.inspectScrollAt(px, py, cfg.layerId, true);
            if (info && (codeCount.get(info.tileCode) ?? 0) === 1) {
              ctx.fillRect(sx, sy, ts, ts);
            }
          }
        }
      }
    }
  }

  // -- Tile grid canvas events --

  private bindTileCanvasEvents(cvs: HTMLCanvasElement): void {
    cvs.addEventListener('mousedown', (e) => {
      // Middle-click or Space+click = pan
      if (e.button === 1 || (this.spaceHeld && e.button === 0)) {
        if (this.tileZoom > 1) {
          this.tilePanning = true;
          this.tilePanStartX = e.clientX - this.tilePanX;
          this.tilePanStartY = e.clientY - this.tilePanY;
          cvs.style.cursor = 'grabbing';
          e.preventDefault();
        }
        return;
      }
      if (this.tilePanning) return;
      const pos = this.tilePixelFromEvent(e);
      if (!pos) return;
      this.painting = true;
      this.lastPaintPos = pos;
      this.handleTilePixelAction(pos.x, pos.y);
    });

    cvs.addEventListener('mousemove', (e) => {
      if (this.tilePanning) {
        this.tilePanX = e.clientX - this.tilePanStartX;
        this.tilePanY = e.clientY - this.tilePanStartY;
        this.clampTilePan();
        this.applyTileTransform();
        return;
      }
      if (!this.painting) return;
      const pos = this.tilePixelFromEvent(e);
      if (!pos) return;
      if (this.lastPaintPos && pos.x === this.lastPaintPos.x && pos.y === this.lastPaintPos.y) return;
      this.lastPaintPos = pos;
      this.handleTilePixelAction(pos.x, pos.y);
    });

    const stopPaint = () => {
      this.painting = false;
      this.lastPaintPos = null;
      if (this.tilePanning) {
        this.tilePanning = false;
        this.updateTileCursor();
      }
    };
    cvs.addEventListener('mouseup', stopPaint);
    cvs.addEventListener('mouseleave', stopPaint);

    // Wheel zoom
    cvs.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Use parent section rect (stable, not affected by canvas transform)
      const section = cvs.parentElement;
      if (!section) return;
      const sectionRect = section.getBoundingClientRect();
      const mx = e.clientX - sectionRect.left;
      const my = e.clientY - sectionRect.top;
      // Convert to unscaled canvas coords
      const ux = (mx - this.tilePanX) / this.tileZoom;
      const uy = (my - this.tilePanY) / this.tileZoom;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      this.tileZoom = Math.max(1, Math.min(6, this.tileZoom * factor));
      if (this.tileZoom <= 1.01) { this.tileZoom = 1; this.tilePanX = 0; this.tilePanY = 0; }
      else {
        this.tilePanX = mx - ux * this.tileZoom;
        this.tilePanY = my - uy * this.tileZoom;
      }
      this.clampTilePan();
      this.applyTileTransform();
      this.updateTileCursor();
      this.updateStatus();
    }, { passive: false });
  }

  private clampTilePan(): void {
    if (!this.tileCanvas) return;
    // Original (unscaled) canvas size
    const w = this.tileCanvas.offsetWidth;
    const h = this.tileCanvas.offsetHeight;
    const maxX = w * (this.tileZoom - 1);
    const maxY = h * (this.tileZoom - 1);
    this.tilePanX = Math.max(-maxX, Math.min(0, this.tilePanX));
    this.tilePanY = Math.max(-maxY, Math.min(0, this.tilePanY));
  }

  private applyTileTransform(): void {
    if (!this.tileCanvas) return;
    if (this.tileZoom === 1) {
      this.tileCanvas.style.transform = '';
      this.tileCanvas.style.transformOrigin = '';
    } else {
      this.tileCanvas.style.transformOrigin = '0 0';
      this.tileCanvas.style.transform = `translate(${this.tilePanX}px, ${this.tilePanY}px) scale(${this.tileZoom})`;
    }
  }

  private updateTileCursor(): void {
    if (!this.tileCanvas) return;
    if (this.tileZoom > 1 && this.spaceHeld) {
      this.tileCanvas.style.cursor = 'grab';
    } else {
      const cursor = TOOL_CURSORS[this.editor.tool] ?? 'crosshair';
      this.tileCanvas.style.cursor = cursor;
    }
  }

  private resetTileZoom(): void {
    this.tileZoom = 1;
    this.tilePanX = 0;
    this.tilePanY = 0;
    this.applyTileTransform();
    this.updateTileCursor();
    this.updateStatus();
  }

  private tilePixelFromEvent(e: MouseEvent): { x: number; y: number } | null {
    if (!this.tileCanvas) return null;
    const tile = this.editor.currentTile;
    const tw = tile?.tileW ?? 16;
    const th = tile?.tileH ?? 16;
    const rect = this.tileCanvas.getBoundingClientRect();
    // Account for CSS transform (zoom + pan)
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    // rect already includes the CSS transform scale, so divide by actual displayed size
    const x = Math.floor(cssX / rect.width * tw);
    const y = Math.floor(cssY / rect.height * th);
    if (x < 0 || y < 0 || x >= tw || y >= th) return null;
    return { x, y };
  }

  /** Convert display coordinates (post-flip) to ROM coordinates (pre-flip). */
  private displayToRomCoords(lx: number, ly: number): { x: number; y: number } {
    const tile = this.editor.currentTile;
    if (!tile) return { x: lx, y: ly };
    const rx = tile.flipX ? (tile.tileW - 1 - lx) : lx;
    const ry = tile.flipY ? (tile.tileH - 1 - ly) : ly;
    return { x: rx, y: ry };
  }

  private handleTilePixelAction(lx: number, ly: number): void {
    const { x, y } = this.displayToRomCoords(lx, ly);
    const tool = this.editor.tool;
    switch (tool) {
      case 'pencil':
      case 'eraser':
        this.editor.paintPixel(x, y);
        break;
      case 'fill':
        this.editor.floodFill(x, y);
        break;
      case 'eyedropper':
        this.editor.eyedrop(x, y);
        this.refreshPalette();
        break;
      case 'wand':
        this.editor.magicWandTile(x, y, this.wandTolerance);
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
        // Read pixel in display orientation (apply flip)
        const srcX = tile.flipX ? (tw - 1 - x) : x;
        const srcY = tile.flipY ? (th - 1 - y) : y;
        const colorIdx = tileData[srcY * tw + srcX]!;

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
      if (this.nuanceGroup.has(i)) {
        swatch.classList.add('edit-swatch-nuance');
      }

      setTooltip(swatch, `Color ${i} — Click: select / Shift+click: nuance group / Double-click: edit`);
      swatch.onclick = (e) => {
        if (e.shiftKey && i < 15) {
          if (this.nuanceGroup.has(i)) this.nuanceGroup.delete(i);
          else this.nuanceGroup.add(i);
          this.refreshPalette();
        } else {
          this.editor.setActiveColor(i);
        }
      };
      swatch.ondblclick = () => this.openColorPicker(i);
      grid.appendChild(swatch);
    }

    this.paletteContainer.appendChild(grid);
    this.updateStatus();
  }

  private openColorPicker(colorIndex: number): void {
    const palette = this.editor.getCurrentPalette();
    const [r, g, b] = palette[colorIndex] ?? [0, 0, 0];
    const isTransparent = colorIndex === 15;

    // Remove any existing color dialog
    this.paletteContainer?.querySelector('.edit-color-dialog')?.remove();

    const dialog = el('div', 'edit-color-dialog') as HTMLDivElement;

    // Color input (visible, always shown)
    const input = document.createElement('input');
    input.type = 'color';
    input.value = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
    input.className = 'edit-color-input';

    // Transparent checkbox
    const transLabel = el('label', 'edit-color-trans-label') as HTMLLabelElement;
    const transCb = document.createElement('input');
    transCb.type = 'checkbox';
    transCb.checked = isTransparent;
    transLabel.append(transCb, ' Transparent');
    setTooltip(transLabel, 'Mark this color index as transparent');

    // Nuances checkbox (hue shift similar colors)
    const nuancesLabel = el('label', 'edit-color-trans-label') as HTMLLabelElement;
    const nuancesCb = document.createElement('input');
    nuancesCb.type = 'checkbox';
    nuancesCb.checked = false;
    nuancesLabel.append(nuancesCb, ' Nuances');
    setTooltip(nuancesLabel, 'Hue-shift all similar colors together (or selected nuance group)');

    // Reset button
    const resetBtn = el('button', 'edit-color-reset-btn') as HTMLButtonElement;
    resetBtn.textContent = 'Reset';
    setTooltip(resetBtn, 'Reset palette to original ROM colors');

    // Saturation slider
    const satLabel = el('label', 'edit-color-sat-label') as HTMLLabelElement;
    satLabel.textContent = 'Saturation';
    const satSlider = document.createElement('input');
    satSlider.type = 'range';
    satSlider.min = '0';
    satSlider.max = '200';
    satSlider.value = '100';
    satSlider.className = 'edit-color-sat-slider';
    satLabel.appendChild(satSlider);

    satLabel.appendChild(resetBtn);
    dialog.append(input, transLabel, nuancesLabel, satLabel);
    this.paletteContainer?.appendChild(dialog);

    // Snapshot original RGB for reset
    const origRgb = palette.map(([cr, cg, cb]) => [cr, cg, cb] as [number, number, number]);

    // Store original palette HSL for hue shift calculation
    const origHsl = palette.map(([cr, cg, cb]) => rgbToHsl(cr, cg, cb));
    const [origH] = origHsl[colorIndex] ?? [0, 0, 0];
    const HUE_TOLERANCE = 30 / 360; // ±30°

    input.addEventListener('input', () => {
      const hex = input.value;
      const nr = parseInt(hex.slice(1, 3), 16);
      const ng = parseInt(hex.slice(3, 5), 16);
      const nb = parseInt(hex.slice(5, 7), 16);

      if (nuancesCb.checked) {
        const [newH] = rgbToHsl(nr, ng, nb);
        const hueShift = newH - origH;

        // Use manually selected nuance group if any, otherwise auto-detect by hue
        const targets = this.nuanceGroup.size > 0
          ? this.nuanceGroup
          : new Set(Array.from({ length: 15 }, (_, i) => i).filter(i => {
              const [h, s] = origHsl[i] ?? [0, 0, 0];
              if (s < 0.05) return false;
              const dist = Math.min(Math.abs(h - origH), 1 - Math.abs(h - origH));
              return dist <= HUE_TOLERANCE;
            }));

        for (const i of targets) {
          const [h, s, l] = origHsl[i] ?? [0, 0, 0];
          const shiftedH = ((h + hueShift) % 1 + 1) % 1;
          const [sr, sg, sb] = hslToRgb(shiftedH, s, l);
          this.editor.editPaletteColor(i, sr, sg, sb);
        }
      } else {
        this.editor.editPaletteColor(colorIndex, nr, ng, nb);
      }

      // Update swatch colors in-place (without rebuilding DOM)
      const updatedPalette = this.editor.getCurrentPalette();
      const swatches = this.paletteContainer?.querySelectorAll('.edit-swatch');
      if (swatches) {
        for (let i = 0; i < Math.min(swatches.length, 15); i++) {
          const sw = swatches[i] as HTMLDivElement;
          const [ur, ug, ub] = updatedPalette[i] ?? [0, 0, 0];
          sw.style.backgroundColor = `rgb(${ur},${ug},${ub})`;
        }
      }
    });

    transCb.addEventListener('change', () => {
      if (transCb.checked) {
        this.editor.replaceColorWithTransparent(colorIndex);
      } else {
        // Undo transparency: replace pen 15 pixels back to this color index
        this.editor.replaceTransparentWithColor(colorIndex);
      }
      this.refreshPalette();
      // Re-open dialog to keep editing
      this.paletteContainer?.appendChild(dialog);
      transCb.checked = transCb.checked; // preserve state
    });

    satSlider.addEventListener('input', () => {
      const factor = parseInt(satSlider.value, 10) / 100; // 0 = grayscale, 1 = original, 2 = boosted

      // Apply saturation to selected nuance group or all colors
      const targets = this.nuanceGroup.size > 0
        ? this.nuanceGroup
        : new Set(Array.from({ length: 15 }, (_, i) => i));

      for (const i of targets) {
        const [h, s, l] = origHsl[i] ?? [0, 0, 0];
        const newS = Math.min(1, s * factor);
        const [sr, sg, sb] = hslToRgb(h, newS, l);
        this.editor.editPaletteColor(i, sr, sg, sb);
      }

      // Update swatches
      const updatedPalette = this.editor.getCurrentPalette();
      const swatches = this.paletteContainer?.querySelectorAll('.edit-swatch');
      if (swatches) {
        for (let i = 0; i < Math.min(swatches.length, 15); i++) {
          const sw = swatches[i] as HTMLDivElement;
          const [ur, ug, ub] = updatedPalette[i] ?? [0, 0, 0];
          sw.style.backgroundColor = `rgb(${ur},${ug},${ub})`;
        }
      }
    });

    resetBtn.addEventListener('click', () => {
      satSlider.value = '100';
      for (let i = 0; i < 15; i++) {
        const [or, og, ob] = origRgb[i] ?? [0, 0, 0];
        this.editor.editPaletteColor(i, or, og, ob);
      }
      // Update swatches
      const swatches = this.paletteContainer?.querySelectorAll('.edit-swatch');
      if (swatches) {
        for (let i = 0; i < Math.min(swatches.length, 15); i++) {
          const sw = swatches[i] as HTMLDivElement;
          const [or, og, ob] = origRgb[i] ?? [0, 0, 0];
          sw.style.backgroundColor = `rgb(${or},${og},${ob})`;
        }
      }
      // Reset color input to original color
      const [or, og, ob] = origRgb[colorIndex] ?? [0, 0, 0];
      input.value = `#${hex2(or)}${hex2(og)}${hex2(ob)}`;
    });

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
            setTooltip(cell, 'Navigate to neighbor tile — Arrow keys');
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
      this.infoBar.textContent = '';
      return;
    }
    const layerNames = ['Sprites', 'Scroll 1', 'Scroll 2', 'Scroll 3'];
    const layerName = layerNames[tile.layerId] ?? '?';
    let text = `Tile: 0x${tile.tileCode.toString(16).toUpperCase()} | ${layerName}`;
    if (tile.spriteIndex !== undefined) text += ` #${tile.spriteIndex}`;
    text += ` | Pal: ${tile.paletteIndex} | ${tile.tileW}x${tile.tileH}`;

    // Shared tile count
    const video = this.emulator.getVideo();
    if (video) {
      const bufs = this.emulator.getBusBuffers();
      const refs = findTileReferences(
        tile.tileCode,
        video.getObjBuffer(),
        bufs.vram,
        bufs.cpsaRegs,
        video.getMapperTable(),
        video.getBankSizes(),
        video.getBankBases(),
      );
      if (refs.length > 1) {
        text += ` | Shared x${refs.length}`;
      }
    }

    this.infoBar.textContent = text;
  }

  private refreshToolButtons(): void {
    const currentTool = this.editor.tool;
    for (const [tool, btn] of this.toolBtns) {
      btn.classList.toggle('active', tool === currentTool);
    }
    // Update cursor on tile canvas only (tools only work there)
    const cursor = TOOL_CURSORS[currentTool] ?? 'crosshair';
    if (this.tileCanvas) this.tileCanvas.style.cursor = cursor;
    this.updateStatus();
  }

  private updateStatus(): void {
    if (this.spriteSheetMode) {
      setStatus('Up/Down: browse poses — Left/Right: browse tiles — Escape: back');
      return;
    }
    if (this.hasLayers) {
      const n = this.nuanceGroup.size;
      if (n > 0) {
        setStatus(`${n} color${n > 1 ? 's' : ''} selected for hue shifting`);
      } else {
        setStatus('Shift+Arrows: move layer — +/-: resize — Drop image to add');
      }
      return;
    }
    const toolStatus = this.editor.tool === 'wand'
      ? `Click to erase similar colors — Shift+[ / ]: tolerance (${this.wandTolerance})`
      : TOOL_STATUS[this.editor.tool] ?? '';
    const zoomInfo = this.tileZoom > 1 || this.gameZoom > 1
      ? ` — Zoom ×${Math.round(Math.max(this.tileZoom, this.gameZoom) * 10) / 10} (0: reset, Space+drag: pan)`
      : '';
    setStatus(toolStatus + zoomInfo);
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
        // Don't close editor panels — Escape only exits fullscreen (handled in shortcuts.ts)
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
      case 'w': case 'W':
        this.editor.setTool('wand');
        e.preventDefault();
        break;
      case 'Delete': case 'Backspace':
        this.editor.eraseTile();
        this.refreshUndoButtons();
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
        if (e.shiftKey && this.editor.tool === 'wand') {
          this.wandTolerance = Math.max(0, this.wandTolerance - 5);
          this.updateStatus();
        } else {
          this.editor.setActiveColor((this.editor.activeColorIndex - 1 + 16) % 16);
          this.refreshPalette();
        }
        e.preventDefault();
        break;
      case ']':
        if (e.shiftKey && this.editor.tool === 'wand') {
          this.wandTolerance = Math.min(255, this.wandTolerance + 5);
          this.updateStatus();
        } else {
          this.editor.setActiveColor((this.editor.activeColorIndex + 1) % 16);
          this.refreshPalette();
        }
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
      case '0':
        this.resetTileZoom();
        this.resetGameZoom();
        e.preventDefault();
        break;
      case ' ':
        this.spaceHeld = true;
        this.updateTileCursor();
        this.updateGameCursor();
        e.preventDefault();
        break;
    }
  }
  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ') {
      this.spaceHeld = false;
      this.updateTileCursor();
      this.updateGameCursor();
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
    // Layer controls: Shift+arrows = move, +/- = resize
    const layer = this.activeGroup?.layers[this.activeLayerIndex];
    if (layer) {
      if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') layer.offsetY--;
        else if (e.key === 'ArrowDown') layer.offsetY++;
        else if (e.key === 'ArrowLeft') layer.offsetX--;
        else if (e.key === 'ArrowRight') layer.offsetX++;
        this.renderSheetZoomedPose();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const newW = layer.width + 1;
        const newH = layer.height + 1;
        layer.rgbaData = resizeRgba(layer.rgbaOriginal, newW, newH);
        layer.width = newW;
        layer.height = newH;
        this.renderSheetZoomedPose();
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        const newW = Math.max(4, layer.width - 1);
        const newH = Math.max(4, layer.height - 1);
        layer.rgbaData = resizeRgba(layer.rgbaOriginal, newW, newH);
        layer.width = newW;
        layer.height = newH;
        this.renderSheetZoomedPose();
        return;
      }
    }

    switch (e.key) {
      case 'b': case 'B':
        this.editor.setTool('pencil'); e.preventDefault(); break;
      case 'g': case 'G':
        this.editor.setTool('fill'); e.preventDefault(); break;
      case 'i': case 'I':
        this.editor.setTool('eyedropper'); e.preventDefault(); break;
      case 'x': case 'X':
        this.editor.setTool('eraser'); e.preventDefault(); break;
      case 'w': case 'W':
        this.editor.setTool('wand'); e.preventDefault(); break;
      case 'Delete': case 'Backspace':
        this.editor.eraseTile();
        this.refreshUndoButtons();
        if (this.spriteSheetMode) this.refreshSheetAfterEdit();
        e.preventDefault(); break;
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

    // Clean up any existing sheet container from a previous session
    if (this.sheetContainer) {
      this.sheetContainer.remove();
      this.sheetContainer = null;
    }

    this.spriteSheetMode = true;
    this.sheetZoomed = true;
    this.sheetSelectedPose = 0;
    this.sheetSelectedTile = -1;
    this.sheetZoomCanvas = null;
    this.sheetZoomCtx = null;

    // Pause the game (frames + audio), remembering prior state
    this.wasPausedBeforeSheet = this.emulator.isPaused();
    if (!this.wasPausedBeforeSheet) {
      this.emulator.pause();
      this.emulator.suspendAudio();
    }

    // Hide game canvas, overlay, and emu bar
    this.gameCanvas.style.display = 'none';
    const emuBar = document.getElementById('emu-bar');
    if (emuBar) emuBar.style.display = 'none';
    if (this.overlay) this.overlay.style.display = 'none';

    // Create sheet container (fixed fullscreen, respects layer/debug panels via CSS)
    const container = document.createElement('div');
    container.className = 'sprite-sheet-viewer';
    this.sheetContainer = container;
    document.body.appendChild(container);

    // Refresh all previews from current GFX ROM state, then show edit view
    this.refreshAllPosePreviews();
    this.renderSheetZoomedView();
    this.updateStatus();
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
    backBtn.textContent = 'Close';
    setTooltip(backBtn, 'Back to game — Escape');
    backBtn.onclick = () => this.exitSpriteSheetMode();
    header.appendChild(backBtn);
    main.appendChild(header);

    // Grid
    const grid = el('div', 'sprite-sheet-grid');

    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i]!;
      const cell = el('div', 'sprite-sheet-cell') as HTMLDivElement;
      setTooltip(cell, 'Click to zoom into this pose');
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

      setTooltip(cell, 'Switch to this pose — Up/Down arrows');
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

    const exportBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    exportBtn.textContent = 'Export PNG';
    setTooltip(exportBtn, 'Download this pose as transparent PNG');
    exportBtn.onclick = () => this.exportPosePng();
    header.appendChild(exportBtn);

    // Sprite photo layer controls (shown when layers exist)
    const hasPhotoLayers = (this.activeGroup?.layers.length ?? 0) > 0;
    if (hasPhotoLayers) {
      const activeLayer = this.activeGroup?.layers[this.activeLayerIndex];
      const isQuantized = activeLayer?.quantized ?? false;

      if (!isQuantized) {
        const updatePalLabel = el('label', 'sprite-sheet-update-pal') as HTMLLabelElement;
        const updatePalCb = document.createElement('input');
        updatePalCb.type = 'checkbox';
        updatePalCb.id = 'update-palette-cb';
        const updatePalText = document.createElement('span');
        updatePalText.textContent = 'Update palette';
        updatePalLabel.append(updatePalCb, updatePalText);
        header.appendChild(updatePalLabel);

        const quantizeBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
        quantizeBtn.textContent = 'Quantize';
        quantizeBtn.onclick = () => {
          this.quantizeSpritePhotoLayer(updatePalCb.checked);
          this.renderSheetZoomedView();
        };
        header.appendChild(quantizeBtn);
      } else {
        const mergeBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
        mergeBtn.textContent = 'Merge';
        mergeBtn.onclick = () => {
          this.mergeSpritePhotoLayer();
          this.renderSheetZoomedView();
        };
        header.appendChild(mergeBtn);
      }

      const removeBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
      removeBtn.textContent = 'Remove Photo';
      removeBtn.onclick = () => {
        if (this.activeGroup) {
          this.activeGroup.layers.splice(this.activeLayerIndex, 1);
          this.activeLayerIndex = -1;
          this.renderSheetZoomedView();
        }
      };
      header.appendChild(removeBtn);
    }

    const backBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    backBtn.textContent = 'Close';
    setTooltip(backBtn, 'Back to game — Escape');
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

    // Mouse interaction: drag/resize layer or click to select tile
    let draggingPhotoLayer = false;
    let resizingPhotoLayer = false;
    let resizeCorner = '';
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;

    zoomCvs.addEventListener('mousedown', (e) => {
      const rect = zoomCvs.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / cssScale);
      const py = Math.floor((e.clientY - rect.top) / cssScale);

      const layer = this.activeGroup?.layers[this.activeLayerIndex];
      if (layer) {
        const lx = layer.offsetX;
        const ly = layer.offsetY;
        const lw = layer.width;
        const lh = layer.height;
        const ht = 3; // corner handle tolerance in CPS1 pixels

        // Check corner handles first → resize
        const corners: [string, number, number][] = [
          ['tl', lx, ly], ['tr', lx + lw, ly],
          ['bl', lx, ly + lh], ['br', lx + lw, ly + lh],
        ];
        for (const [corner, cx, cy] of corners) {
          if (Math.abs(px - cx) <= ht && Math.abs(py - cy) <= ht) {
            resizingPhotoLayer = true;
            resizeCorner = corner;
            dragStartX = px;
            dragStartY = py;
            dragMoved = false;
            e.preventDefault();
            return;
          }
        }

        // Click inside layer → drag
        if (px >= lx && px < lx + lw && py >= ly && py < ly + lh) {
          draggingPhotoLayer = true;
          dragStartX = px;
          dragStartY = py;
          dragMoved = false;
          e.preventDefault();
          return;
        }
      }
    });

    const onMove = (e: MouseEvent) => {
      const layer = this.activeGroup?.layers[this.activeLayerIndex];
      if (!layer) return;
      const rect = zoomCvs.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / cssScale);
      const py = Math.floor((e.clientY - rect.top) / cssScale);
      const dx = px - dragStartX;
      const dy = py - dragStartY;
      if (dx === 0 && dy === 0) return;
      dragMoved = true;

      if (resizingPhotoLayer) {
        // Resize from corner handle — maintain aspect ratio
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        const sign = (resizeCorner === 'tl' || resizeCorner === 'bl') ? -1 : 1;
        const origW = layer.rgbaOriginal.width;
        const origH = layer.rgbaOriginal.height;
        const newW = Math.max(4, layer.width + delta * sign);
        const newH = Math.max(4, Math.round(newW * origH / origW));
        if (resizeCorner.includes('l')) layer.offsetX += layer.width - newW;
        if (resizeCorner.includes('t')) layer.offsetY += layer.height - newH;
        layer.rgbaData = resizeRgba(layer.rgbaOriginal, newW, newH);
        layer.width = newW;
        layer.height = newH;
      } else if (draggingPhotoLayer) {
        layer.offsetX += dx;
        layer.offsetY += dy;
      } else {
        return;
      }
      dragStartX = px;
      dragStartY = py;
      this.renderSheetZoomedPose();
    };

    const onUp = (e: MouseEvent) => {
      if (draggingPhotoLayer || resizingPhotoLayer) {
        draggingPhotoLayer = false;
        resizingPhotoLayer = false;
        if (dragMoved) return; // don't select tile if we dragged
      }
      // Click to select tile (only if not dragging)
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
    };

    // Use document for move/up so drag works even outside canvas
    zoomCvs.addEventListener('mousedown', () => {
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp, { once: true });
    });
    zoomCvs.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMove);
    });

    this.renderSheetZoomedPose();
    zoomSection.appendChild(zoomCvs);

    // Hint text when no photo layer
    if (!hasPhotoLayers) {
      const hint = el('div', 'edit-capture-hint') as HTMLDivElement;
      hint.textContent = 'Drop an image on the sprite to overlay it';
      zoomSection.appendChild(hint);
    }

    // Drop zone for photo import onto sprite
    const dropHint = el('div', 'sprite-sheet-drop-hint') as HTMLDivElement;
    dropHint.textContent = 'Drop image here';
    dropHint.style.display = 'none';
    zoomSection.appendChild(dropHint);

    zoomSection.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropHint.style.display = '';
      zoomSection.classList.add('drop-active');
    });
    zoomSection.addEventListener('dragleave', (e) => {
      if (!zoomSection.contains(e.relatedTarget as Node)) {
        dropHint.style.display = 'none';
        zoomSection.classList.remove('drop-active');
      }
    });
    zoomSection.addEventListener('drop', (e) => {
      e.preventDefault();
      dropHint.style.display = 'none';
      zoomSection.classList.remove('drop-active');
      const file = (e as DragEvent).dataTransfer?.files[0];
      if (file?.type.startsWith('image/')) this.handleSpritePhotoDrop(file);
    });

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
    // Refresh tile grid
    const tilesGrid = this.sheetContainer?.querySelector('.sprite-sheet-tiles');
    const pose = this.activePoses[this.sheetSelectedPose];
    if (tilesGrid && pose) this.renderSheetTileGrid(tilesGrid as HTMLElement, pose);
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

    // Draw photo layers on top of sprite
    const group = this.activeGroup;
    if (group) {
      for (const layer of group.layers) {
        if (!layer.visible) continue;
        const layerCvs = document.createElement('canvas');
        layerCvs.width = layer.width;
        layerCvs.height = layer.height;
        const layerCtx = layerCvs.getContext('2d')!;
        if (layer.quantized) {
          const palArr = readPalette(bufs.vram, video.getPaletteBase(), pal);
          const imgData = new ImageData(layer.width, layer.height);
          for (let i = 0; i < layer.pixels.length; i++) {
            const ci = layer.pixels[i]!;
            if (ci === 0) continue;
            const [r, g, b] = palArr[ci] ?? [0, 0, 0];
            imgData.data[i * 4] = r;
            imgData.data[i * 4 + 1] = g;
            imgData.data[i * 4 + 2] = b;
            imgData.data[i * 4 + 3] = 255;
          }
          layerCtx.putImageData(imgData, 0, 0);
        } else {
          layerCtx.putImageData(layer.rgbaData, 0, 0);
        }
        ctx.drawImage(layerCvs, layer.offsetX, layer.offsetY);
      }
    }

    // Draw tile grid overlay (16x16 boundaries)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    for (const t of pose.tiles) {
      ctx.strokeRect(t.relX + 0.5, t.relY + 0.5, 15, 15);
    }

    // Draw active photo layer selection outline + resize handles
    const activeLayer = group?.layers[this.activeLayerIndex];
    if (activeLayer) {
      const lx = activeLayer.offsetX;
      const ly = activeLayer.offsetY;
      const lw = activeLayer.width;
      const lh = activeLayer.height;

      ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(lx - 0.5, ly - 0.5, lw + 1, lh + 1);
      ctx.setLineDash([]);

      // Resize handles (4 corners)
      const hs = 2;
      ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
      ctx.fillRect(lx - hs, ly - hs, hs * 2, hs * 2);
      ctx.fillRect(lx + lw - hs, ly - hs, hs * 2, hs * 2);
      ctx.fillRect(lx - hs, ly + lh - hs, hs * 2, hs * 2);
      ctx.fillRect(lx + lw - hs, ly + lh - hs, hs * 2, hs * 2);
    }

    // Draw selected tile highlight (dashed outline, no fill)
    if (this.sheetSelectedTile >= 0 && this.sheetSelectedTile < pose.tiles.length) {
      const t = pose.tiles[this.sheetSelectedTile]!;
      ctx.strokeStyle = '#ff1a50';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(t.relX + 0.5, t.relY + 0.5, 15, 15);
      ctx.setLineDash([]);
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

    // Compute refCount for each tile to show shared indicator
    const objBuf = video.getObjBuffer();
    const vram = bufs.vram;
    const cpsaRegs = video.getCpsaRegs();
    const mapperTable = video.getMapperTable();
    const bankSizes = video.getBankSizes();
    const bankBases = video.getBankBases();

    for (let i = 0; i < pose.tiles.length; i++) {
      const t = pose.tiles[i]!;

      // Wrapper div for tile + optional shared badge
      const tileWrap = el('div', 'sprite-sheet-tile-wrap') as HTMLDivElement;

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
      tileWrap.appendChild(tileCvs);

      // Shared badge
      const refs = findTileReferences(t.mappedCode, objBuf, vram, cpsaRegs, mapperTable, bankSizes, bankBases);
      const isShared = refs.length > 1;
      if (isShared) {
        const badge = el('div', 'sprite-sheet-tile-shared') as HTMLDivElement;
        badge.textContent = `×${refs.length}`;
        setTooltip(badge, `Shared by ${refs.length} sprites — editing affects all of them`);
        tileWrap.appendChild(badge);
      }

      setTooltip(tileWrap, 'Click to edit this tile — Left/Right arrows');
      tileWrap.onclick = () => {
        this.sheetSelectedTile = i;
        this.selectSheetTile(i);
      };

      container.appendChild(tileWrap);
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

    // Clean up any un-merged photo layers on the active sprite group
    const group = this.activeGroup;
    if (group?.type === 'sprite' && group.layers.length > 0) {
      group.layers.length = 0;
      this.activeLayerIndex = -1;
    }

    this.spriteSheetMode = false;
    this.sheetZoomed = false;
    this.sheetSelectedTile = -1;
    this.sheetZoomCanvas = null;
    this.sheetZoomCtx = null;

    // Remove sheet container
    this.sheetContainer?.remove();
    this.sheetContainer = null;

    // Show game canvas, overlay, and emu bar
    this.gameCanvas.style.display = '';
    const emuBar = document.getElementById('emu-bar');
    if (emuBar) emuBar.style.display = '';
    if (this.overlay) this.overlay.style.display = '';

    // Resume game only if it wasn't paused before entering the sheet viewer
    if (!this.wasPausedBeforeSheet && this.emulator.isPaused()) {
      this.emulator.resume();
      this.emulator.resumeAudio();
    }
    this.updateStatus();
  }

  // -- Pose PNG Export / Import --

  /** Export the selected pose as a transparent PNG. */
  private exportPosePng(): void {
    const poses = this.activePoses;
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;

    // Build the preview fresh from GFX ROM
    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();
    const pal = this.activeGroup?.spriteCapture?.palette ?? 0;
    const palette = readPalette(bufs.vram, video.getPaletteBase(), pal);

    const sprGroup: SpriteGroupData = {
      sprites: [], palette: pal,
      bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
      tiles: pose.tiles,
    };
    const preview = assembleCharacter(gfxRom, sprGroup, palette);

    // Render to canvas and download
    const cvs = document.createElement('canvas');
    cvs.width = pose.w;
    cvs.height = pose.h;
    cvs.getContext('2d')!.putImageData(preview, 0, 0);

    const link = document.createElement('a');
    link.download = `pose_${this.sheetSelectedPose}.png`;
    link.href = cvs.toDataURL('image/png');
    link.click();
  }

  /** Import a PNG and write it into the GFX ROM tiles of the selected pose. */
  /** Import PNG onto a single tile. If image is larger than 16x16, crop from center. */
  private importTilePng(tileIndex: number, isShared: boolean): void {
    if (isShared) {
      showToast('Warning: this tile is shared — editing affects other sprites', false);
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) this.processImportTilePng(file, tileIndex);
    };
    input.click();
  }

  private async processImportTilePng(file: File, tileIndex: number): Promise<void> {
    const pose = this.activePoses[this.sheetSelectedPose];
    if (!pose) return;
    const tile = pose.tiles[tileIndex];
    if (!tile) return;

    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();
    const pal = this.activeGroup?.spriteCapture?.palette ?? 0;
    const palette = readPalette(bufs.vram, video.getPaletteBase(), pal);

    // Load the image
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
    URL.revokeObjectURL(url);

    // Draw to canvas to read pixel data
    const cvs = document.createElement('canvas');
    cvs.width = img.width;
    cvs.height = img.height;
    const ctx = cvs.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, img.width, img.height);

    // If image is larger than 16x16, crop from center
    const ox = Math.max(0, Math.floor((img.width - 16) / 2));
    const oy = Math.max(0, Math.floor((img.height - 16) / 2));

    // Write pixels to this single tile
    for (let ty = 0; ty < 16; ty++) {
      for (let tx = 0; tx < 16; tx++) {
        const imgX = ox + tx;
        const imgY = oy + ty;
        if (imgX >= img.width || imgY >= img.height) continue;

        const si = (imgY * img.width + imgX) * 4;
        const r = imgData.data[si]!;
        const g = imgData.data[si + 1]!;
        const b = imgData.data[si + 2]!;
        const a = imgData.data[si + 3]!;

        const romX = tile.flipX ? 15 - tx : tx;
        const romY = tile.flipY ? 15 - ty : ty;

        // Transparent pixel → pen 15
        if (a < 128) {
          writePixelFn(gfxRom, tile.mappedCode, romX, romY, 15);
          continue;
        }

        // Find nearest palette color (skip pen 15 = transparent)
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let c = 0; c < 15; c++) {
          const [pr, pg, pb] = palette[c] ?? [0, 0, 0];
          const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
          if (dist < bestDist) { bestDist = dist; bestIdx = c; }
        }

        writePixelFn(gfxRom, tile.mappedCode, romX, romY, bestIdx);
      }
    }

    showToast('Tile imported', true);
    this.refreshSheetAfterEdit();
    this.emulator.rerender();
  }

  /** Import image onto the currently selected tile in the main editor. */
  private exportCurrentTile(): void {
    const tile = this.editor.currentTile;
    const tileData = this.editor.getCurrentTileData();
    if (!tile || !tileData) return;

    const palette = this.editor.getCurrentPalette();
    const tw = tile.tileW;
    const th = tile.tileH;
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(tw, th);

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        // Apply flip for export in display orientation
        const srcX = tile.flipX ? (tw - 1 - x) : x;
        const srcY = tile.flipY ? (th - 1 - y) : y;
        const colorIdx = tileData[srcY * tw + srcX]!;
        const pi = (y * tw + x) * 4;
        if (colorIdx === 15) {
          img.data[pi + 3] = 0; // transparent
        } else {
          const [r, g, b] = palette[colorIdx] ?? [0, 0, 0];
          img.data[pi] = r;
          img.data[pi + 1] = g;
          img.data[pi + 2] = b;
          img.data[pi + 3] = 255;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tile-${tile.tileCode}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  /** Quantize the active sprite photo layer. Optionally update palette from image colors. */
  private quantizeSpritePhotoLayer(updatePalette: boolean): void {
    const group = this.activeGroup;
    if (!group?.spriteCapture) return;
    const layer = group.layers[this.activeLayerIndex];
    if (!layer || layer.quantized) return;

    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();
    const paletteIdx = group.spriteCapture.palette;

    if (updatePalette) {
      // Generate optimal palette from the photo via median cut
      const newColors = generatePalette(layer.rgbaData, 15);

      // Write new palette to VRAM (immediate visual effect)
      const paletteBase = video.getPaletteBase();
      const vramOff = paletteBase + paletteIdx * 32;
      for (let i = 0; i < 15; i++) {
        const [r, g, b] = newColors[i] ?? [0, 0, 0];
        const word = encodeColor(r, g, b);
        bufs.vram[vramOff + i * 2] = (word >> 8) & 0xFF;
        bufs.vram[vramOff + i * 2 + 1] = word & 0xFF;
      }

      // Patch program ROM so the palette persists
      const romStore = this.emulator.getRomStore();
      if (romStore) {
        for (let i = 0; i < 15; i++) {
          const [r, g, b] = newColors[i] ?? [0, 0, 0];
          romStore.patchProgramPalette(bufs.vram, video.getPaletteBase(), paletteIdx, i, encodeColor(r, g, b));
        }
      }

      showToast('Palette updated from image', true);
    }

    // Read the (possibly updated) palette and quantize
    const palette = readPalette(bufs.vram, video.getPaletteBase(), paletteIdx);
    layer.pixels = quantizeWithDithering(layer.rgbaData, palette);

    // Add 1px black outline: find darkest palette color, fill transparent neighbors of opaque pixels
    let darkestIdx = 0;
    let darkestLum = Infinity;
    for (let c = 0; c < 15; c++) {
      const [cr, cg, cb] = palette[c] ?? [0, 0, 0];
      const lum = cr * 0.299 + cg * 0.587 + cb * 0.114;
      if (lum < darkestLum) { darkestLum = lum; darkestIdx = c; }
    }
    const w = layer.width;
    const h = layer.height;
    // Two-pass outline: first pass detects border pixels, second pass writes them
    // (avoids outline leaking into the interior)
    const border = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (layer.pixels[y * w + x] !== 0) continue; // not transparent
        // Check 8 neighbors (including diagonals) for non-transparent pixels
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && layer.pixels[ny * w + nx] !== 0) {
              border[y * w + x] = 1;
            }
          }
        }
      }
    }
    for (let i = 0; i < border.length; i++) {
      if (border[i]) layer.pixels[i] = darkestIdx;
    }

    layer.quantized = true;

    this.refreshSheetAfterEdit();
    showToast('Quantized with outline', true);
  }

  /** Merge the quantized sprite photo layer onto pose tiles (refCount = 1 only). */
  private mergeSpritePhotoLayer(): void {
    const group = this.activeGroup;
    if (!group?.spriteCapture) return;
    const layer = group.layers[this.activeLayerIndex];
    if (!layer?.quantized) return;

    const pose = this.activePoses[this.sheetSelectedPose];
    if (!pose) return;

    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return;
    const video = this.emulator.getVideo();
    if (!video) return;
    const bufs = this.emulator.getBusBuffers();

    // Build refCount for each tile in the pose
    const objBuf = video.getObjBuffer();
    const cpsaRegs = video.getCpsaRegs();
    const mapperTable = video.getMapperTable();
    const bankSizes = video.getBankSizes();
    const bankBases = video.getBankBases();

    let written = 0;
    let skipped = 0;

    for (const tile of pose.tiles) {
      const refs = findTileReferences(tile.mappedCode, objBuf, bufs.vram, cpsaRegs, mapperTable, bankSizes, bankBases);
      if (refs.length > 1) {
        skipped += 16 * 16;
        continue;
      }

      // Write photo pixels onto this tile
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const bx = tile.relX + px;
          const by = tile.relY + py;
          const qx = bx - layer.offsetX;
          const qy = by - layer.offsetY;
          if (qx < 0 || qx >= layer.width || qy < 0 || qy >= layer.height) continue;

          const colorIndex = layer.pixels[qy * layer.width + qx]!;
          if (colorIndex === 0) continue;

          const localX = tile.flipX ? 15 - px : px;
          const localY = tile.flipY ? 15 - py : py;
          writePixelFn(gfxRom, tile.mappedCode, localX, localY, colorIndex);
          written++;
        }
      }
    }

    // Remove the merged layer
    group.layers.splice(this.activeLayerIndex, 1);
    this.activeLayerIndex = -1;

    this.refreshSheetAfterEdit();
    this.refreshCapturesPanel();
    this.emulator.rerender();

    showToast(
      skipped > 0
        ? `Merged ${written} pixels (${skipped} skipped — shared tiles)`
        : `Merged ${written} pixels`,
      true,
    );
  }

  /** Handle photo drop on the sprite sheet viewer. Creates a PhotoLayer for positioning. */
  private async handleSpritePhotoDrop(file: File): Promise<void> {
    const group = this.activeGroup;
    if (!group?.spriteCapture) return;
    const pose = this.activePoses[this.sheetSelectedPose];
    if (!pose) return;

    const rgba = await loadPhotoRgba(file, pose.w, pose.h);

    // Create a photo layer centered on the pose
    const newLayer = createLayer(
      file.name,
      rgba,
      Math.round((pose.w - rgba.width) / 2),
      Math.round((pose.h - rgba.height) / 2),
    );
    group.layers.push(newLayer);
    this.activeLayerIndex = group.layers.length - 1;

    // Re-render the zoomed view with the photo overlay
    this.renderSheetZoomedView();
    showToast('Photo added — drag to position, then Quantize', true);
  }

  private importImageOnCurrentTile(): void {
    const tile = this.editor.currentTile;
    if (!tile) { showToast('No tile selected', false); return; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const gfxRom = this.editor.getGfxRom();
      if (!gfxRom) return;
      const video = this.emulator.getVideo();
      if (!video) return;
      const bufs = this.emulator.getBusBuffers();

      // Get palette for this tile
      const paletteIdx = tile.paletteIndex;
      const palette = readPalette(bufs.vram, video.getPaletteBase(), paletteIdx);

      // Check shared
      const objBuf = video.getObjBuffer();
      const refs = findTileReferences(tile.tileCode, objBuf, bufs.vram, video.getCpsaRegs(), video.getMapperTable(), video.getBankSizes(), video.getBankBases());
      if (refs.length > 1) {
        showToast(`Warning: tile shared (×${refs.length}) — editing affects other sprites`, false);
      }

      // Load image
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
      URL.revokeObjectURL(url);

      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);

      // Crop from center if larger than 16x16
      const ox = Math.max(0, Math.floor((img.width - 16) / 2));
      const oy = Math.max(0, Math.floor((img.height - 16) / 2));

      for (let ty = 0; ty < 16; ty++) {
        for (let tx = 0; tx < 16; tx++) {
          const imgX = ox + tx;
          const imgY = oy + ty;
          if (imgX >= img.width || imgY >= img.height) continue;

          const si = (imgY * img.width + imgX) * 4;
          const r = imgData.data[si]!;
          const g = imgData.data[si + 1]!;
          const b = imgData.data[si + 2]!;
          const a = imgData.data[si + 3]!;

          if (a < 128) {
            writePixelFn(gfxRom, tile.tileCode, tx, ty, 15);
            continue;
          }

          let bestIdx = 0;
          let bestDist = Infinity;
          for (let c = 0; c < 15; c++) {
            const [pr, pg, pb] = palette[c] ?? [0, 0, 0];
            const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
            if (dist < bestDist) { bestDist = dist; bestIdx = c; }
          }

          writePixelFn(gfxRom, tile.tileCode, tx, ty, bestIdx);
        }
      }

      showToast('Tile imported', true);
      this.refreshTileGrid();
      this.refreshPalette();
      this.refreshNeighbors();
      this.emulator.rerender();
      this.emulator.getRomStore()?.onModified?.();
      if (this.spriteSheetMode) this.refreshSheetAfterEdit();
    };
    input.click();
  }

  // -- Sprite Analyzer --

  // -- Pose Capture --

  /** Toggle capture for the sprite at the given OBJ index. */
  private toggleCaptureForSprite(spriteIndex: number): void {
    const video = this.emulator.getVideo();
    if (!video) return;

    const allSprites = readAllSprites(video);
    const group = groupCharacter(allSprites, spriteIndex);
    if (!group) return;

    const palette = group.palette;

    if (this.activeSessions.has(palette)) {
      // Stop capturing this palette
      this.stopCaptureForPalette(palette);
    } else {
      // Start capturing this palette, remembering the initial group size
      this.activeSessions.set(palette, { poses: [], seenHashes: new Set<string>(), refTileCount: group.sprites.length });
      // Capture the initial pose(s)
      this.captureGroupsForPalette(video, palette);
      showToast(`Recording sprite (palette ${palette})`, true);
    }

    this.refreshCapturesPanel();
  }

  /** Stop capture for a specific palette and save the group. */
  private stopCaptureForPalette(palette: number): void {
    const session = this.activeSessions.get(palette);
    if (!session) return;
    this.activeSessions.delete(palette);

    if (session.poses.length > 0) {
      this.captureCounter++;
      const name = `Sprite #${this.captureCounter}`;
      this.layerGroups.push(createSpriteGroup(name, session.poses, palette));
      this.refreshLayerPanel();
      showToast(`Captured ${session.poses.length} pose${session.poses.length !== 1 ? 's' : ''} → ${name}`, true);
    } else {
      showToast('No poses captured', false);
    }

    this.refreshCapturesPanel();
  }

  /** Stop all active captures. */
  private stopAllCaptures(): void {
    for (const palette of [...this.activeSessions.keys()]) {
      this.stopCaptureForPalette(palette);
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
    setTooltip(quantizeBtn, 'Convert photo to palette colors (Atkinson dithering)');
    quantizeBtn.style.display = 'none';
    quantizeBtn.onclick = () => this.quantizeLayer();
    this.headSection.appendChild(quantizeBtn);

    mergeBtn.textContent = 'Merge Layer';
    setTooltip(mergeBtn, 'Write pixels into GFX ROM — irreversible');
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
    if (this.activePoses.length === 0 || !this.activeLayer) return;
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
      const charSizeMap: Record<number, number> = { [LAYER_SCROLL1]: 64, [LAYER_SCROLL2]: 128, [LAYER_SCROLL3]: 512 };
      const charSize = charSizeMap[group.layerId] ?? 128;
      const tileSizeMap: Record<number, number> = { [LAYER_SCROLL1]: 8, [LAYER_SCROLL2]: 16, [LAYER_SCROLL3]: 32 };
      const tileSize = tileSizeMap[group.layerId] ?? 16;
      const isScroll1 = group.layerId === LAYER_SCROLL1;

      // Safe merge: write only on tiles with refCount = 1 (no allocation, no expansion)
      const mergeScroll = this.getGroupScroll(group);

      // Build tile code frequency map for visible tiles
      const scrollX = mergeScroll.sx;
      const scrollY = mergeScroll.sy;
      const offsetX = -(scrollX % tileSize);
      const offsetY = -(scrollY % tileSize);
      const codeCount = new Map<number, number>();
      for (let sy = offsetY; sy < SCREEN_HEIGHT; sy += tileSize) {
        for (let sx = offsetX; sx < SCREEN_WIDTH; sx += tileSize) {
          const px = Math.max(0, Math.min(sx + tileSize / 2, SCREEN_WIDTH - 1));
          const py = Math.max(0, Math.min(sy + tileSize / 2, SCREEN_HEIGHT - 1));
          const info = video.inspectScrollAt(px, py, group.layerId, true);
          if (info) codeCount.set(info.tileCode, (codeCount.get(info.tileCode) ?? 0) + 1);
        }
      }

      // Write photo pixels only on tiles with refCount = 1
      // Re-quantize per tile: each tile has its own palette in the tilemap,
      // so palette indices from the global quantize step are wrong.
      // Instead, read the RGBA color and find the nearest match in the tile's actual palette.
      const paletteBase = video.getPaletteBase();
      const bufs = this.emulator.getBusBuffers();
      const paletteCache = new Map<number, Array<[number, number, number]>>();

      let written = 0;
      let skipped = 0;
      for (const layer of group.layers) {
        if (!layer.quantized) continue;
        for (let ly = 0; ly < layer.height; ly++) {
          for (let lx = 0; lx < layer.width; lx++) {
            // Skip transparent pixels (check RGBA alpha, not the global quantize index)
            const pi = (ly * layer.width + lx) * 4;
            if (layer.rgbaData.data[pi + 3]! < 128) continue;
            const sx = lx + layer.offsetX - mergeScroll.sx;
            const sy = ly + layer.offsetY - mergeScroll.sy;
            if (sx < 0 || sx >= SCREEN_WIDTH || sy < 0 || sy >= SCREEN_HEIGHT) { skipped++; continue; }
            const info = video.inspectScrollAt(sx, sy, group.layerId, true);
            if (!info) { skipped++; continue; }
            if ((codeCount.get(info.tileCode) ?? 0) > 1) { skipped++; continue; }

            // Read the original RGBA color from the layer
            const r = layer.rgbaData.data[pi]!;
            const g = layer.rgbaData.data[pi + 1]!;
            const b = layer.rgbaData.data[pi + 2]!;

            // Get the tile's actual palette (cached per paletteIndex)
            let tilePalette = paletteCache.get(info.paletteIndex);
            if (!tilePalette) {
              tilePalette = readPalette(bufs.vram, paletteBase, info.paletteIndex);
              paletteCache.set(info.paletteIndex, tilePalette);
            }

            // Nearest-neighbor in tile's palette (skip index 0 = transparent)
            let bestIdx = 1;
            let bestDist = Infinity;
            for (let c = 1; c < tilePalette.length; c++) {
              const [pr, pg, pb] = tilePalette[c]!;
              const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
              if (dist < bestDist) { bestDist = dist; bestIdx = c; }
            }

            writeScrollPixel(gfxRom, info.tileCode, info.localX, info.localY, bestIdx, charSize, info.tileIndex, isScroll1);
            written++;
          }
        }
        merged++;
      }

      showToast(
        skipped > 0
          ? `Merged ${written} pixels (${skipped} skipped — shared tiles)`
          : `Merged ${written} pixels`,
        true,
      );
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
   * Called every frame from the overlay loop. Captures unique poses
   * for all active palette sessions.
   */
  private captureFrame(): void {
    if (this.activeSessions.size === 0) return;

    const video = this.emulator.getVideo();
    if (!video) return;

    let changed = false;
    for (const palette of this.activeSessions.keys()) {
      if (this.captureGroupsForPalette(video, palette)) changed = true;
    }

    if (changed) this.refreshCapturesPanel();
  }

  /** Capture all connected sprite groups for a palette. Returns true if new poses were found. */
  private captureGroupsForPalette(video: CPS1Video, palette: number): boolean {
    const session = this.activeSessions.get(palette);
    if (!session) return false;

    const allSprites = readAllSprites(video);
    const samePalette = allSprites.filter(s => s.palette === palette);
    if (samePalette.length === 0) return false;

    const gfxRom = this.editor.getGfxRom();
    if (!gfxRom) return false;
    const bufs = this.emulator.getBusBuffers();

    // Find all connected groups for this palette
    const visited = new Set<number>();
    const groups: SpriteGroupData[] = [];
    for (const sprite of samePalette) {
      if (visited.has(sprite.index)) continue;
      const group = groupCharacter(allSprites, sprite.index);
      if (!group) continue;
      for (const s of group.sprites) visited.add(s.index);
      groups.push(group);
    }

    if (groups.length === 0) return false;

    // Pick the group closest in tile count to the initial capture (filters fragments + multi-char merges)
    const ref = session.refTileCount;
    let bestGroup: SpriteGroupData | null = null;
    let bestDiff = Infinity;
    for (const g of groups) {
      const diff = Math.abs(g.sprites.length - ref);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestGroup = g;
      }
    }

    if (!bestGroup) return false;

    const hash = poseHash(bestGroup);
    if (session.seenHashes.has(hash)) return false;
    session.seenHashes.add(hash);

    const pal = readPalette(bufs.vram, video.getPaletteBase(), bestGroup.palette);
    session.poses.push(capturePose(gfxRom, bestGroup, pal));
    return true;
  }

  private addPoseCard(pose: CapturedPose, index: number): void {
    const gallery = this.captureGallery;
    if (!gallery) return;

    const card = el('div', 'edit-variant-card') as HTMLDivElement;
    setTooltip(card, 'Select this pose variant');
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

      // Position in world coords (screen center + scroll offset for scroll groups)
      const scroll = this.getGroupScroll(group);
      const newLayer = createLayer(
        file.name,
        rgba,
        Math.round((centerW - rgba.width) / 2) + scroll.sx,
        Math.round((centerH - rgba.height) / 2) + scroll.sy,
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
