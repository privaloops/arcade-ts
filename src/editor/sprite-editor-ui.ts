/**
 * Sprite Editor UI — integrated into the debug/video panel.
 *
 * Provides DOM elements (tile grid, tools, palette) that are injected into
 * a container (the debug panel). Manages the overlay canvas on the game screen
 * and keyboard shortcuts independently.
 */

import { SpriteEditor, type EditorTool } from './sprite-editor';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3, readWord } from '../video/cps1-video';
import { readAllSprites, groupCharacter, assembleCharacter, type SpriteGroup as SpriteGroupData, type CapturedPose } from './sprite-analyzer';
import { readPalette, rgbToHsl, hslToRgb } from './palette-editor';
import { createSpriteGroup, createScrollGroup, type LayerGroup } from './layer-model';
import { LayerPanel } from './layer-panel';
import { findTileReferences } from './tile-refs';
import type { Emulator } from '../emulator';
import { pencilCursor, fillCursor, eyedropperCursor, eraserCursor, wandCursor } from './tool-cursors';
import { showToast } from '../ui/toast';
import { exportScrollAseprite, importAsepriteFile } from './aseprite-io';
import { buildScrollSets, type ScrollSet } from './scroll-capture';
import { CaptureManager } from './capture-session';
import { SheetViewer, type SheetViewerHost } from './sheet-viewer';
import { setTooltip } from '../ui/tooltip';
import { createStatusBar, setStatus } from '../ui/status-bar';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 256; // fixed canvas size


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

  // Capture manager (sprite + scroll capture sessions)
  private capture!: CaptureManager;

  // Sheet viewer (fullscreen sprite sheet + scroll set viewer)
  private sheet!: SheetViewer;

  // Multi-layer system
  private layerGroups: LayerGroup[] = [];
  private activeGroupIndex = -1;
  private layerPanel: LayerPanel | null = null;

  get activeGroup(): LayerGroup | undefined { return this.layerGroups[this.activeGroupIndex]; }
  get activePoses(): CapturedPose[] { return this.activeGroup?.spriteCapture?.poses ?? []; }
  private get activePoseIndex(): number { return this.activeGroup?.spriteCapture?.selectedPoseIndex ?? 0; }
  get activePose(): CapturedPose | undefined { return this.activePoses[this.activePoseIndex]; }

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
  private gridLayers: Map<number, boolean> = new Map();
  private hwLayerVisible: Map<number, boolean> = new Map();
  private hiddenSpritePalettes = new Set<number>();
  private spritePaletteContainer: HTMLDivElement | null = null;
  private spritePaletteTick = 0;
  private _isInteractionBlocked: (() => boolean) | null = null;
  private _onHwLayerToggle: ((layerId: number, visible: boolean) => void) | null = null;
  private _onSpreadChange: ((value: number) => void) | null = null;

  // Bound handlers
  private readonly boundKeyHandler: (e: KeyboardEvent) => void;
  private readonly boundKeyUpHandler: (e: KeyboardEvent) => void;
  private readonly boundOverlayMove: (e: MouseEvent) => void;
  private readonly boundOverlayClick: (e: MouseEvent) => void;
  private readonly boundOverlayLeave: () => void;
  private readonly boundDocClick: (e: MouseEvent) => void;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
    this.emulator = emulator;
    this.gameCanvas = canvas;
    this.editor = new SpriteEditor(emulator);
    this.capture = new CaptureManager(emulator, this.editor, this.layerGroups, () => this.refreshLayerPanel());
    this.sheet = new SheetViewer(this as unknown as SheetViewerHost);

    this.boundKeyHandler = (e) => this.handleKey(e);
    this.boundKeyUpHandler = (e) => this.handleKeyUp(e);
    this.boundOverlayMove = (e) => this.handleOverlayMove(e);
    this.boundOverlayClick = (e) => this.handleOverlayClick(e);
    this.boundOverlayLeave = () => this.clearOverlay();
    this.boundDocClick = (e) => {
      // Click outside overlay → deselect tile
      if (this.overlay && !this.overlay.contains(e.target as Node)) {
        this.editor.deselectTile();
      }
    };

    this.editor.setOnTileChanged(() => {
      this.refreshTileGrid();
      this.emulator.rerender();
      this.emulator.getRomStore()?.onModified?.();
      if (this.sheet.spriteSheetMode) this.sheet.refreshSheetAfterEdit();
      this.refreshLayerPanel();
    });
    this.editor.setOnColorChanged(() => this.refreshPalette());
  }

  // -- Public API --

  /** Build sprite editor elements into the given container (called once by debug panel). */
  buildInto(container: HTMLElement): void {
    if (this.built) return;
    this.built = true;

    // Info bar hidden — tile inspector moved to Aseprite workflow
    this.infoBar = el('div', 'edit-info') as HTMLDivElement;
    this.infoBar.style.display = 'none';
    container.appendChild(this.infoBar);

    // Action buttons removed — editing happens in Aseprite now

    // Tile grid (read-only viewer)
    const tileSection = el('div', 'edit-tile-section');
    const cvs = document.createElement('canvas');
    cvs.width = GRID_SIZE;
    cvs.height = GRID_SIZE;
    cvs.className = 'edit-tile-canvas';
    this.tileCanvas = cvs;
    this.tileCtx = cvs.getContext('2d')!;
    tileSection.appendChild(cvs);
    container.appendChild(tileSection);

    // Tools bar removed — editing happens in Aseprite now

    // Palette (read-only)
    this.paletteContainer = el('div', 'edit-palette') as HTMLDivElement;
    container.appendChild(this.paletteContainer);

    // Tile neighbors removed — editing happens in Aseprite now

    // Import button moved to layer panel (left sidebar)

    // Sprite palettes (live OBJ palette list with visibility toggles)
    this.spritePaletteContainer = el('div', 'edit-sprite-palettes') as HTMLDivElement;
    container.appendChild(this.spritePaletteContainer);

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

  /** Reset all captures and layer groups (call on game change). */
  resetCaptures(): void {
    this.capture.stopAllCaptures();
    this.layerGroups.length = 0;
    this.activeGroupIndex = -1;
    this.emulator.getVideo()?.clearPaletteOverrides();
    this.hiddenSpritePalettes.clear();
    this.emulator.getVideo()?.setHiddenSpritePalettes(null);
    if (this.spritePaletteContainer) {
      this.spritePaletteContainer.innerHTML = '';
      delete this.spritePaletteContainer.dataset['palKeys'];
    }
    // Recreate default HW layer groups so the panel works
    this.ensureDefaultGroups();
    this.refreshLayerPanel();
  }

  getSpritePaletteContainer(): HTMLDivElement | null {
    return this.spritePaletteContainer;
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
    this.createOverlay();
    document.body.classList.add('edit-active');
    document.addEventListener('keydown', this.boundKeyHandler);
    document.addEventListener('keyup', this.boundKeyUpHandler);
    document.addEventListener('click', this.boundDocClick, true);
    this.startOverlayLoop();
    this.ensureDefaultGroups();
    this.ensureLayerPanel();
    this.layerPanel?.show();
    this.refreshLayerPanel();
    this.refreshTileGrid();
    this.refreshPalette();
  }

  deactivate(): void {
    if (this.sheet.spriteSheetMode) this.sheet.exitSpriteSheetMode();
    this.editor.deactivate();
    cancelAnimationFrame(this.overlayRafId);
    document.body.classList.remove('edit-active');
    this.removeOverlay();
    document.removeEventListener('keydown', this.boundKeyHandler);
    document.removeEventListener('keyup', this.boundKeyUpHandler);
    document.removeEventListener('click', this.boundDocClick, true);
    this.spaceHeld = false;
    this.resetTileZoom();
    this.resetGameZoom();
    this.layerPanel?.hide();
    // Restore all sprite palettes on exit
    if (this.hiddenSpritePalettes.size > 0) {
      this.hiddenSpritePalettes.clear();
      this.emulator.getVideo()?.setHiddenSpritePalettes(null);
      this.emulator.rerender();
    }
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
      this.layerGroups.push({ type: 'sprite', name: 'Sprites (OBJ)' });
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
      onToggleRecScroll: (layerId) => {
        this.toggleScrollCaptureFromPanel(layerId);
      },
      onOpenSpriteSheet: (groupIdx) => {
        if (groupIdx < 0) return;
        this.activeGroupIndex = groupIdx;
        this.sheet.enterSpriteSheetMode();
      },
      onStopSpriteCapture: (palette) => {
        this.capture.stopCaptureForPalette(palette);
      },
      onDeleteSpriteSet: (groupIdx) => {
        if (groupIdx >= 0 && groupIdx < this.layerGroups.length) {
          this.layerGroups.splice(groupIdx, 1);
          if (this.activeGroupIndex >= this.layerGroups.length) {
            this.activeGroupIndex = Math.max(0, this.layerGroups.length - 1);
          }
          this.refreshLayerPanel();
        }
      },
      onExportScrollSet: (set) => {
        this.exportScrollSingle(set);
      },
      onHighlightScrollSet: (set) => {
        this.sheet.enterScrollSetMode(set);
      },
      onRenderScrollThumb: (set) => {
        return this.sheet.renderScrollSetThumbnail(set);
      },
      onImportAseprite: () => {
        this.importAseprite();
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

    // Sprite sets now live in the right palette panel — no longer passed to layer panel

    // Include live scroll sets from active capture sessions
    const allScrollSets = [...this.capture.scrollSets];
    for (const session of this.capture.scrollSessions.values()) {
      allScrollSets.push(...buildScrollSets(session));
    }

    this.layerPanel?.refresh(this.layerGroups, this.activeGroupIndex, -1, gfxRom, hwState, allScrollSets);
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
      this.captureFrame();
      this.captureScrollTick();
      // Refresh palettes every frame during capture (live pose count), otherwise every 30 frames
      const refreshInterval = this.capture.activeSessions.size > 0 ? 1 : 30;
      if (++this.spritePaletteTick >= refreshInterval) {
        this.spritePaletteTick = 0;
        this.refreshSpritePalettes();
      }
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

    // Game canvas zoom/pan — middle-click or Space+click to pan
    cvs.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (this.spaceHeld && e.button === 0)) {
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

  private removeOverlay(): void {
    if (!this.overlay) return;
    this.overlay.removeEventListener('mousemove', this.boundOverlayMove);
    this.overlay.removeEventListener('click', this.boundOverlayClick);
    this.overlay.removeEventListener('mouseleave', this.boundOverlayLeave);
    this.overlay.remove();
    this.overlay = null;
    this.overlayCtx = null;
    this.stopAllCaptures();
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
      this.refreshInfoBar();

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
    if (this.capture.activeSessions.size > 0) {
      const recSprites = readAllSprites(video);
      const visited = new Set<number>();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 50, 80, 0.8)';
      for (const sprite of recSprites) {
        if (!this.capture.activeSessions.has(sprite.palette)) continue;
        if (visited.has(sprite.uid)) continue;
        // Mono-palette grouping matches capture behavior
        const group = groupCharacter(recSprites, sprite.index, sprite.palette);
        if (!group) continue;
        for (const s of group.sprites) visited.add(s.uid);

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
  }

  // -- Rendering --

  refreshTileGrid(): void {
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

  refreshPalette(): void {
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

      setTooltip(swatch, `Color ${i}`);
      grid.appendChild(swatch);
    }

    this.paletteContainer.appendChild(grid);
    this.updateStatus();
  }

  /** Scan active OBJ palettes and rebuild the sprite palette list. */
  private refreshSpritePalettes(): void {
    const container = this.spritePaletteContainer;
    if (!container) return;
    // In sprite sheet mode, the sheet viewer manages this container
    if (this.sheet.spriteSheetMode) return;
    const video = this.emulator.getVideo();
    if (!video) return;

    const allSprites = readAllSprites(video);
    // Count sprites per palette
    const palCounts = new Map<number, number>();
    for (const s of allSprites) {
      palCounts.set(s.palette, (palCounts.get(s.palette) ?? 0) + 1);
    }

    // Rebuild DOM if palette set or capture state changed
    const captureKeys = this.layerGroups
      .filter(g => g.type === 'sprite' && g.spriteCapture)
      .map(g => `${g.spriteCapture!.palette}:${g.spriteCapture!.poses.length}`)
      .join(';');
    const activeKeys = [...this.capture.activeSessions.keys()].join(',');
    const palKeys = [...palCounts.keys()].sort((a, b) => a - b).join(',') + '|' + captureKeys + '|' + activeKeys;
    if (container.dataset['palKeys'] === palKeys) {
      // Just update eye states (in case user toggled while paused)
      container.querySelectorAll<HTMLButtonElement>('.palette-layer-eye').forEach(btn => {
        const pi = parseInt(btn.dataset['pal'] ?? '', 10);
        if (!isNaN(pi)) btn.style.opacity = this.hiddenSpritePalettes.has(pi) ? '0.3' : '1';
      });
      return;
    }
    container.dataset['palKeys'] = palKeys;
    container.innerHTML = '';

    if (palCounts.size === 0) return;

    const label = el('div', 'edit-section-label');
    label.textContent = 'Sprite Palettes';
    container.appendChild(label);

    const list = el('div', 'palette-layer-list');
    const bufs = this.emulator.getBusBuffers();
    const paletteBase = video.getPaletteBase();

    for (const [palIdx, count] of palCounts) {
      const row = el('div', 'palette-layer-row') as HTMLDivElement;
      const isHidden = this.hiddenSpritePalettes.has(palIdx);

      const eyeBtn = el('button', 'palette-layer-eye') as HTMLButtonElement;
      eyeBtn.textContent = '\u{1F441}';
      eyeBtn.style.opacity = isHidden ? '0.3' : '1';
      eyeBtn.dataset['pal'] = String(palIdx);
      setTooltip(eyeBtn, 'Toggle palette visibility in game');
      eyeBtn.onclick = () => {
        if (this.hiddenSpritePalettes.has(palIdx)) {
          this.hiddenSpritePalettes.delete(palIdx);
        } else {
          this.hiddenSpritePalettes.add(palIdx);
        }
        eyeBtn.style.opacity = this.hiddenSpritePalettes.has(palIdx) ? '0.3' : '1';
        video.setHiddenSpritePalettes(
          this.hiddenSpritePalettes.size > 0 ? this.hiddenSpritePalettes : null,
        );
        this.emulator.rerender();
      };
      row.appendChild(eyeBtn);

      const swatch = el('div', 'palette-layer-swatch') as HTMLDivElement;
      const colors = readPalette(bufs.vram, paletteBase, palIdx);
      for (let i = 0; i < 15; i++) {
        const [r, g, b] = colors[i] ?? [0, 0, 0];
        const dot = document.createElement('span');
        dot.className = 'palette-layer-color';
        dot.style.background = `rgb(${r},${g},${b})`;
        swatch.appendChild(dot);
      }
      row.appendChild(swatch);

      const nameEl = el('span', 'palette-layer-name');
      nameEl.textContent = `#${palIdx}`;
      row.appendChild(nameEl);

      const badge = el('span', 'palette-layer-count');
      badge.textContent = `${count}`;
      setTooltip(badge, `${count} sprite tile${count !== 1 ? 's' : ''}`);
      row.appendChild(badge);

      // REC button
      const isRec = this.capture.activeSessions.has(palIdx);
      const recBtn = el('button', 'layer-rec-btn' + (isRec ? ' recording' : '')) as HTMLButtonElement;
      recBtn.innerHTML = `<span class="rec-dot${isRec ? ' rec-blink' : ''}"></span> REC`;
      recBtn.onclick = (e) => {
        e.stopPropagation();
        this.capture.toggleCaptureForPalette(palIdx);
      };
      row.appendChild(recBtn);

      list.appendChild(row);

      // Captured sprite cards for this palette
      const captures = this.layerGroups.filter(
        g => g.type === 'sprite' && g.spriteCapture?.palette === palIdx && g.spriteCapture.poses.length > 0,
      );
      for (const group of captures) {
        const gi = this.layerGroups.indexOf(group);
        const pose = group.spriteCapture!.poses[0]!;
        const card = el('div', 'edit-capture-card') as HTMLDivElement;
        setTooltip(card, 'Open sprite sheet viewer');
        card.onclick = () => {
          this.activeGroupIndex = gi;
          this.sheet.enterSpriteSheetMode();
        };

        const thumb = document.createElement('canvas');
        thumb.className = 'edit-capture-thumb';
        thumb.width = pose.w;
        thumb.height = pose.h;
        const ctx = thumb.getContext('2d');
        if (ctx) ctx.putImageData(pose.preview, 0, 0);
        card.appendChild(thumb);

        const info = el('div', 'edit-capture-info');
        const nameEl = el('div', 'edit-capture-name');
        nameEl.textContent = group.name;
        info.appendChild(nameEl);
        const countEl = el('div', 'edit-capture-count');
        countEl.textContent = `${group.spriteCapture!.poses.length} pose${group.spriteCapture!.poses.length !== 1 ? 's' : ''}`;
        info.appendChild(countEl);
        card.appendChild(info);

        // Delete button
        const delBtn = el('button', 'edit-capture-delete') as HTMLButtonElement;
        delBtn.textContent = '\u00D7';
        setTooltip(delBtn, 'Delete this capture');
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (gi >= 0 && gi < this.layerGroups.length) {
            this.layerGroups.splice(gi, 1);
            if (this.activeGroupIndex >= this.layerGroups.length) {
              this.activeGroupIndex = Math.max(0, this.layerGroups.length - 1);
            }
            this.refreshLayerPanel();
            this.refreshSpritePalettes();
          }
        };
        card.appendChild(delBtn);

        list.appendChild(card);
      }

      // Live recording card (new capture, not resumed)
      const liveSession = this.capture.activeSessions.get(palIdx);
      if (liveSession && !liveSession.resumeTarget && liveSession.poses.length > 0) {
        const pose = liveSession.poses[0]!;
        const card = el('div', 'edit-capture-card recording') as HTMLDivElement;
        setTooltip(card, 'Click to stop recording');
        card.onclick = () => this.capture.toggleCaptureForPalette(palIdx);

        const thumb = document.createElement('canvas');
        thumb.className = 'edit-capture-thumb';
        thumb.width = pose.w;
        thumb.height = pose.h;
        const ctx = thumb.getContext('2d');
        if (ctx) ctx.putImageData(pose.preview, 0, 0);
        card.appendChild(thumb);

        const info = el('div', 'edit-capture-info');
        const nameEl = el('div', 'edit-capture-name');
        nameEl.textContent = `Recording (pal ${palIdx})`;
        info.appendChild(nameEl);
        const countEl = el('div', 'edit-capture-count');
        countEl.textContent = `${liveSession.poses.length} pose${liveSession.poses.length !== 1 ? 's' : ''}`;
        info.appendChild(countEl);
        card.appendChild(info);

        list.appendChild(card);
      }
    }

    container.appendChild(list);
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

  refreshInfoBar(): void {
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

  updateStatus(): void {
    if (this.sheet.spriteSheetMode) {
      setStatus('Up/Down: browse poses — Left/Right: browse tiles — Escape: back');
      return;
    }
    setStatus('');
  }

  // -- Keyboard shortcuts --

  private handleKey(e: KeyboardEvent): void {
    if (!this.editor.active) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    // Sprite sheet mode keyboard handling
    if (this.sheet.spriteSheetMode) {
      this.sheet.handleSheetKey(e);
      return;
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
        e.preventDefault();
        break;
      case 'z': case 'Z':
        if (e.ctrlKey || e.metaKey) {
          if (e.shiftKey) {
            this.editor.redo();
          } else {
            this.editor.undo();
          }
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


  // -- Capture delegations --

  private toggleScrollCaptureFromPanel(layerId: number): void {
    this.capture.toggleScrollCaptureFromPanel(layerId);
  }

  private captureScrollTick(): void {
    this.capture.captureScrollTick();
  }

  private toggleCaptureForSprite(spriteIndex: number): void {
    this.capture.toggleCaptureForSprite(spriteIndex);
  }

  private stopAllCaptures(): void {
    this.capture.stopAllCaptures();
  }

  private captureFrame(): void {
    this.capture.captureFrame();
  }



  /** Export a single scroll set as Aseprite tilemap (16 colors, 1 CPS1 palette). */
  private exportScrollSingle(set: ScrollSet): void {
    exportScrollAseprite(this.emulator, this.editor, set);
  }

  /** Import a .aseprite file: read manifest, write tiles back to GFX ROM, create sprite set. */
  private importAseprite(): void {
    importAsepriteFile(this.emulator, this.editor, this.layerGroups, () => this.refreshLayerPanel());
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
