/**
 * SheetViewer — fullscreen sprite sheet & scroll set viewer.
 *
 * Read-only viewer for captured poses and scroll sets.
 * Editing happens in Aseprite via export/import.
 */

import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import type { Emulator } from '../emulator';
import type { SpriteEditor } from './sprite-editor';
import type { CapturedPose, SpriteGroup as SpriteGroupData } from './sprite-analyzer';
import type { ScrollSet } from './scroll-capture';
import type { LayerGroup } from './layer-model';
import { assembleCharacter } from './sprite-analyzer';
import { readPalette } from './palette-editor';
import { readTile as readTileFn } from './tile-encoder';
import { findTileReferences } from './tile-refs';
import { scrollLayerName } from './scroll-capture';
import { setTooltip } from '../ui/tooltip';
import { exportSpritePaletteAseprite, exportScrollAseprite } from './aseprite-io';

// ---------------------------------------------------------------------------
// Host interface — the subset of SpriteEditorUI that SheetViewer needs
// ---------------------------------------------------------------------------

export interface SheetViewerHost {
  readonly emulator: Emulator;
  readonly editor: SpriteEditor;
  readonly gameCanvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement | null;

  layerGroups: LayerGroup[];
  activeGroupIndex: number;

  readonly activeGroup: LayerGroup | undefined;
  readonly activePoses: CapturedPose[];
  readonly activePose: CapturedPose | undefined;

  refreshTileGrid(): void;
  refreshPalette(): void;
  refreshInfoBar(): void;
  refreshLayerPanel(): void;
  updateStatus(): void;
  /** Container for sprite palettes in the right debug panel. */
  getSpritePaletteContainer(): HTMLDivElement | null;
}

// ---------------------------------------------------------------------------
// SheetViewer
// ---------------------------------------------------------------------------

export class SheetViewer {
  spriteSheetMode = false;
  private sheetContainer: HTMLDivElement | null = null;
  private sheetZoomed = false;
  sheetSelectedPose = 0;
  sheetSelectedTile = -1;
  private sheetZoomCanvas: HTMLCanvasElement | null = null;
  private sheetZoomCtx: CanvasRenderingContext2D | null = null;
  private wasPausedBeforeSheet = false;
  private activeScrollSet: ScrollSet | null = null;

  // Palette layer visibility (hidden palettes for current pose)
  private hiddenPalettes = new Set<number>();

  // Scroll highlight
  private scrollHighlightOverlay: HTMLCanvasElement | null = null;
  private highlightedScrollSet: ScrollSet | null = null;

  constructor(private readonly host: SheetViewerHost) {}

  // -- Keyboard handling --

  /** Handle keyboard events while in sprite sheet mode. Returns true if handled. */
  handleSheetKey(e: KeyboardEvent): boolean {
    if (!this.spriteSheetMode) return false;

    const poses = this.host.activePoses;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.exitSpriteSheetMode();
      return true;
    }

    const pose = poses[this.sheetSelectedPose];
    if (!pose) return true;
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
        if (this.sheetSelectedPose < poses.length - 1) {
          this.selectPoseInSheet(this.sheetSelectedPose + 1);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (this.sheetSelectedPose > 0) {
          this.selectPoseInSheet(this.sheetSelectedPose - 1);
        }
        break;
      default:
        this.handleToolShortcut(e);
        break;
    }
    return true;
  }

  /** Forward tool shortcuts while in sheet zoomed view. */
  private handleToolShortcut(e: KeyboardEvent): void {
    const { host } = this;
    const { editor } = host;
    switch (e.key) {
      case 'b': case 'B': editor.setTool('pencil'); e.preventDefault(); break;
      case 'g': case 'G': editor.setTool('fill'); e.preventDefault(); break;
      case 'i': case 'I': editor.setTool('eyedropper'); e.preventDefault(); break;
      case 'x': case 'X': editor.setTool('eraser'); e.preventDefault(); break;
      case 'w': case 'W': editor.setTool('wand'); e.preventDefault(); break;
      case 'Delete': case 'Backspace':
        editor.eraseTile();
        if (this.spriteSheetMode) this.refreshSheetAfterEdit();
        e.preventDefault(); break;
      case 'z': case 'Z':
        if (e.ctrlKey || e.metaKey) {
          if (e.shiftKey) editor.redo(); else editor.undo();
          e.preventDefault();
        }
        break;
      case '[':
        editor.setActiveColor((editor.activeColorIndex - 1 + 16) % 16);
        host.refreshPalette(); e.preventDefault(); break;
      case ']':
        editor.setActiveColor((editor.activeColorIndex + 1) % 16);
        host.refreshPalette(); e.preventDefault(); break;
    }
  }

  // -- Sprite sheet mode --

  enterSpriteSheetMode(): void {
    const poses = this.host.activePoses;
    if (poses.length === 0) return;

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

    this.wasPausedBeforeSheet = this.host.emulator.isPaused();
    if (!this.wasPausedBeforeSheet) {
      this.host.emulator.pause();
      this.host.emulator.suspendAudio();
    }

    this.hideGame();

    const container = document.createElement('div') as HTMLDivElement;
    container.className = 'sprite-sheet-viewer';
    this.sheetContainer = container;
    document.body.appendChild(container);

    this.refreshAllPosePreviews();
    this.renderSheetZoomedView();
    this.host.updateStatus();
  }

  exitSpriteSheetMode(): void {
    if (!this.spriteSheetMode) return;

    this.spriteSheetMode = false;
    this.activeScrollSet = null;
    this.sheetZoomed = false;
    this.sheetSelectedTile = -1;
    this.sheetZoomCanvas = null;
    this.sheetZoomCtx = null;

    this.sheetContainer?.remove();
    this.sheetContainer = null;

    // Clear capture palettes from right panel (refreshSpritePalettes will restore live palettes)
    const palContainer = this.host.getSpritePaletteContainer();
    if (palContainer) {
      palContainer.innerHTML = '';
      delete palContainer.dataset['palKeys'];
      delete palContainer.dataset['captureMode'];
    }
    this.hiddenPalettes.clear();

    this.showGame();

    if (!this.wasPausedBeforeSheet && this.host.emulator.isPaused()) {
      this.host.emulator.resume();
      this.host.emulator.resumeAudio();
    }
    this.host.updateStatus();
  }

  // -- Scroll set mode --

  enterScrollSetMode(set: ScrollSet): void {
    if (this.spriteSheetMode) this.exitSpriteSheetMode();
    if (this.sheetContainer) {
      this.sheetContainer.remove();
      this.sheetContainer = null;
    }

    this.activeScrollSet = set;
    this.spriteSheetMode = true;

    this.wasPausedBeforeSheet = this.host.emulator.isPaused();
    if (!this.wasPausedBeforeSheet) {
      this.host.emulator.pause();
      this.host.emulator.suspendAudio();
    }

    this.hideGame();

    const container = document.createElement('div') as HTMLDivElement;
    container.className = 'sprite-sheet-viewer';
    this.sheetContainer = container;
    document.body.appendChild(container);

    this.renderScrollSetView();
  }

  // -- Scroll highlight --

  toggleScrollHighlight(set: ScrollSet): void {
    if (this.highlightedScrollSet === set) {
      this.highlightedScrollSet = null;
      this.clearScrollHighlight();
      return;
    }
    this.highlightedScrollSet = set;
    this.drawScrollHighlight(set);
  }

  clearScrollHighlight(): void {
    if (this.scrollHighlightOverlay) {
      this.scrollHighlightOverlay.remove();
      this.scrollHighlightOverlay = null;
    }
  }

  /** Render a thumbnail canvas for a scroll set. */
  renderScrollSetThumbnail(set: ScrollSet): HTMLCanvasElement | null {
    const { host } = this;
    const gfxRom = host.editor.getGfxRom();
    if (!gfxRom) return null;
    const video = host.emulator.getVideo();
    if (!video) return null;
    const bufs = host.emulator.getBusBuffers();

    const { tileW, tileH, palette: palIdx, tiles, capturedColors } = set;
    if (tiles.length === 0) return null;

    const colors = capturedColors ?? readPalette(bufs.vram, video.getPaletteBase(), palIdx);

    let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
    for (const tile of tiles) {
      if (tile.tileCol < minCol) minCol = tile.tileCol;
      if (tile.tileRow < minRow) minRow = tile.tileRow;
      if (tile.tileCol > maxCol) maxCol = tile.tileCol;
      if (tile.tileRow > maxRow) maxRow = tile.tileRow;
    }

    const gridCols = maxCol - minCol + 1;
    const gridRows = maxRow - minRow + 1;
    const w = gridCols * tileW;
    const h = gridRows * tileH;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const imgData = ctx.createImageData(w, h);
    for (const tile of tiles) {
      renderTileToImageData(imgData.data, w, gfxRom, tile, tileW, tileH, colors, tile.tileCol - minCol, tile.tileRow - minRow);
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /** Refresh all sheet visuals after a tile edit. */
  refreshSheetAfterEdit(): void {
    this.refreshAllPosePreviews();
    this.renderSheetZoomedPose();
    this.refreshSheetSidebar();
    const tilesGrid = this.sheetContainer?.querySelector('.sprite-sheet-tiles');
    const pose = this.host.activePoses[this.sheetSelectedPose];
    if (tilesGrid && pose) this.renderSheetTileGrid(tilesGrid as HTMLElement, pose);
  }

  // -- Private helpers --

  private hideGame(): void {
    this.host.gameCanvas.style.display = 'none';
    const emuBar = document.getElementById('emu-bar');
    if (emuBar) emuBar.style.display = 'none';
    if (this.host.overlay) this.host.overlay.style.display = 'none';
  }

  private showGame(): void {
    this.host.gameCanvas.style.display = '';
    const emuBar = document.getElementById('emu-bar');
    if (emuBar) emuBar.style.display = '';
    if (this.host.overlay) this.host.overlay.style.display = '';
  }

  selectPoseInSheet(index: number): void {
    const poses = this.host.activePoses;
    const pose = poses[index];
    if (!pose) return;

    this.sheetSelectedPose = index;
    this.sheetZoomed = true;
    this.sheetSelectedTile = -1;

    const group = this.host.activeGroup;
    if (group?.spriteCapture) {
      group.spriteCapture.selectedPoseIndex = index;
    }

    this.renderSheetZoomedView();
  }

  private renderSheetZoomedView(): void {
    const container = this.sheetContainer;
    if (!container) return;
    container.innerHTML = '';

    const { host } = this;
    const poses = host.activePoses;
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

    const backBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    backBtn.textContent = 'Close';
    setTooltip(backBtn, 'Back to game — Escape');
    backBtn.onclick = () => this.exitSpriteSheetMode();
    header.appendChild(backBtn);
    main.appendChild(header);

    // Zoomed canvas
    const zoomSection = el('div', 'sprite-sheet-zoom');
    const cssScale = 4;
    const zoomCvs = document.createElement('canvas');
    zoomCvs.width = pose.w;
    zoomCvs.height = pose.h;
    zoomCvs.style.width = `${pose.w * cssScale}px`;
    zoomCvs.style.height = `${pose.h * cssScale}px`;
    this.sheetZoomCanvas = zoomCvs;
    this.sheetZoomCtx = zoomCvs.getContext('2d')!;
    this.sheetZoomCtx.imageSmoothingEnabled = false;

    // Click to select tile
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
      } else {
        this.sheetSelectedTile = -1;
        this.renderSheetZoomedPose();
      }
    });

    this.renderSheetZoomedPose();
    zoomSection.appendChild(zoomCvs);

    const hint = el('div', 'edit-capture-hint') as HTMLDivElement;
    hint.textContent = 'Export to Aseprite to edit';
    zoomSection.appendChild(hint);

    // Tile strip
    const tilesLabel = el('div', 'edit-section-label');
    tilesLabel.textContent = 'Tiles';
    zoomSection.appendChild(tilesLabel);

    const tilesGrid = el('div', 'sprite-sheet-tiles');
    this.renderSheetTileGrid(tilesGrid, pose);
    zoomSection.appendChild(tilesGrid);

    main.appendChild(zoomSection);

    container.appendChild(main);

    // Push capture palettes into the right debug panel
    this.refreshCapturePalettes();
  }

  /** Render palette layer toggles (eye icon + color swatch + tile count). */
  private renderPaletteLayers(parent: HTMLElement, palettesUsed: Map<number, number>): void {
    const { host } = this;
    const video = host.emulator.getVideo();
    const bufs = host.emulator.getBusBuffers();

    const label = el('div', 'edit-section-label');
    label.textContent = 'Palettes';
    parent.appendChild(label);

    const list = el('div', 'palette-layer-list');

    for (const [palIdx, count] of palettesUsed) {
      const row = el('div', 'palette-layer-row') as HTMLDivElement;
      const isHidden = this.hiddenPalettes.has(palIdx);

      // Eye toggle
      const eyeBtn = el('button', 'palette-layer-eye') as HTMLButtonElement;
      eyeBtn.textContent = isHidden ? '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}' : '\u{1F441}';
      eyeBtn.style.opacity = isHidden ? '0.3' : '1';
      setTooltip(eyeBtn, 'Toggle palette visibility');
      eyeBtn.onclick = () => {
        if (this.hiddenPalettes.has(palIdx)) {
          this.hiddenPalettes.delete(palIdx);
        } else {
          this.hiddenPalettes.add(palIdx);
        }
        this.renderSheetZoomedPose();
        // Refresh tile grid to dim hidden tiles
        const tilesGrid = this.sheetContainer?.querySelector('.sprite-sheet-tiles');
        const pose = host.activePoses[this.sheetSelectedPose];
        if (tilesGrid && pose) this.renderSheetTileGrid(tilesGrid as HTMLElement, pose);
        // Update eye state
        eyeBtn.style.opacity = this.hiddenPalettes.has(palIdx) ? '0.3' : '1';
      };
      row.appendChild(eyeBtn);

      // Color swatch (first 8 non-transparent colors)
      const swatch = el('div', 'palette-layer-swatch') as HTMLDivElement;
      if (video) {
        const colors = readPalette(bufs.vram, video.getPaletteBase(), palIdx);
        for (let i = 0; i < 15; i++) {
          const [r, g, b] = colors[i] ?? [0, 0, 0];
          const dot = document.createElement('span');
          dot.className = 'palette-layer-color';
          dot.style.background = `rgb(${r},${g},${b})`;
          swatch.appendChild(dot);
        }
      }
      row.appendChild(swatch);

      // Label
      const nameEl = el('span', 'palette-layer-name');
      nameEl.textContent = `#${palIdx}`;
      row.appendChild(nameEl);

      // Tile count badge
      const badge = el('span', 'palette-layer-count');
      badge.textContent = `${count}`;
      setTooltip(badge, `${count} tile${count !== 1 ? 's' : ''} using this palette`);
      row.appendChild(badge);

      // Export button
      const actions = el('div', 'palette-layer-actions');
      const exportAse = el('button', 'palette-layer-export') as HTMLButtonElement;
      exportAse.textContent = 'Export';
      setTooltip(exportAse, 'Export all poses as .aseprite (16-color indexed)');
      exportAse.onclick = (e) => {
        e.stopPropagation();
        exportSpritePaletteAseprite(host.emulator, host.editor, host.activePoses, palIdx);
      };
      actions.appendChild(exportAse);
      row.appendChild(actions);

      list.appendChild(row);
    }

    parent.appendChild(list);
  }

  /** Push capture palette controls into the right debug panel (only rebuilds once). */
  private refreshCapturePalettes(): void {
    const container = this.host.getSpritePaletteContainer();
    if (!container) return;
    // Already built for this capture — don't rebuild (preserves eye toggle state)
    if (container.dataset['captureMode'] === 'true') return;

    const poses = this.host.activePoses;
    const palettesUsed = new Map<number, number>();
    for (const p of poses) {
      for (const t of p.tiles) {
        palettesUsed.set(t.palette, (palettesUsed.get(t.palette) ?? 0) + 1);
      }
    }

    container.innerHTML = '';
    container.style.display = '';
    container.dataset['captureMode'] = 'true';
    this.renderPaletteLayers(container, palettesUsed);
  }

  private renderScrollSetView(): void {
    const container = this.sheetContainer;
    const set = this.activeScrollSet;
    if (!container || !set) return;
    container.innerHTML = '';

    const { host } = this;
    const gfxRom = host.editor.getGfxRom();
    if (!gfxRom) return;
    const video = host.emulator.getVideo();
    if (!video) return;
    const bufs = host.emulator.getBusBuffers();

    const { tileW, tileH, palette: palIdx, tiles, layerId, capturedColors } = set;
    const colors = capturedColors ?? readPalette(bufs.vram, video.getPaletteBase(), palIdx);

    const main = el('div', 'sprite-sheet-main');

    // Header
    const header = el('div', 'sprite-sheet-header');
    const title = document.createElement('h3');
    title.textContent = `${scrollLayerName(layerId)} · Palette #${palIdx} · ${tiles.length} tiles`;
    header.appendChild(title);

    const exportBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    exportBtn.textContent = 'Export .aseprite';
    setTooltip(exportBtn, 'Export as Aseprite tilemap (16 colors)');
    exportBtn.onclick = () => {
      exportScrollAseprite(host.emulator, host.editor, set);
    };
    header.appendChild(exportBtn);

    const backBtn = el('button', 'sprite-sheet-back') as HTMLButtonElement;
    backBtn.textContent = 'Close';
    setTooltip(backBtn, 'Back to game — Escape');
    backBtn.onclick = () => this.exitSpriteSheetMode();
    header.appendChild(backBtn);
    main.appendChild(header);

    // Scroll reconstitution
    const zoomSection = el('div', 'sprite-sheet-zoom');

    let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
    for (const tile of tiles) {
      if (tile.tileCol < minCol) minCol = tile.tileCol;
      if (tile.tileRow < minRow) minRow = tile.tileRow;
      if (tile.tileCol > maxCol) maxCol = tile.tileCol;
      if (tile.tileRow > maxRow) maxRow = tile.tileRow;
    }
    const gridCols = maxCol - minCol + 1;
    const gridRows = maxRow - minRow + 1;
    const w = gridCols * tileW;
    const h = gridRows * tileH;

    const cssScale = Math.max(2, Math.min(4, Math.floor(800 / Math.max(w, h))));
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    cvs.style.width = `${w * cssScale}px`;
    cvs.style.height = `${h * cssScale}px`;
    cvs.style.imageRendering = 'pixelated';
    const ctx = cvs.getContext('2d')!;

    const imgData = ctx.createImageData(w, h);
    for (const tile of tiles) {
      renderTileToImageData(imgData.data, w, gfxRom, tile, tileW, tileH, colors, tile.tileCol - minCol, tile.tileRow - minRow);
    }
    ctx.putImageData(imgData, 0, 0);
    zoomSection.appendChild(cvs);

    // Tile strip
    const tilesLabel = el('div', 'edit-section-label');
    tilesLabel.textContent = `Tiles (${tiles.length})`;
    tilesLabel.style.marginTop = '12px';
    zoomSection.appendChild(tilesLabel);

    const tilesGrid = el('div', 'sprite-sheet-tiles');
    const seenCodes = new Set<number>();
    for (const tile of tiles) {
      if (seenCodes.has(tile.tileCode)) continue;
      seenCodes.add(tile.tileCode);

      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tileW;
      tileCanvas.height = tileH;
      tileCanvas.style.width = `${tileW * 2}px`;
      tileCanvas.style.height = `${tileH * 2}px`;
      tileCanvas.style.imageRendering = 'pixelated';
      tileCanvas.style.border = '1px solid #333';
      tileCanvas.style.cursor = 'pointer';
      const tCtx = tileCanvas.getContext('2d')!;
      const tImg = tCtx.createImageData(tileW, tileH);
      const pixels = readTileFn(gfxRom, tile.tileCode, tile.tileW, tile.tileH, tile.charSize);
      for (let i = 0; i < tileW * tileH; i++) {
        const colorIdx = pixels[i]!;
        if (colorIdx === 15) continue;
        const [r, g, b] = colors[colorIdx] ?? [0, 0, 0];
        tImg.data[i * 4] = r;
        tImg.data[i * 4 + 1] = g;
        tImg.data[i * 4 + 2] = b;
        tImg.data[i * 4 + 3] = 255;
      }
      tCtx.putImageData(tImg, 0, 0);
      tilesGrid.appendChild(tileCanvas);
    }
    zoomSection.appendChild(tilesGrid);

    main.appendChild(zoomSection);
    container.appendChild(main);
  }

  refreshAllPosePreviews(): void {
    const { host } = this;
    const ag = host.activeGroup;
    if (!ag?.spriteCapture) return;
    const video = host.emulator.getVideo();
    if (!video) return;
    const gfxRom = host.editor.getGfxRom();
    if (!gfxRom) return;
    const bufs = host.emulator.getBusBuffers();
    const pal = ag.spriteCapture.palette;
    // Fallback palette from VRAM (for poses without snapshot)
    const vramPalette = readPalette(bufs.vram, video.getPaletteBase(), pal);

    for (const pose of ag.spriteCapture.poses) {
      // Build per-tile palette map (like the game renderer)
      const palMap = new Map<number, Array<[number, number, number]>>();
      for (const t of pose.tiles) {
        if (!palMap.has(t.palette)) {
          palMap.set(t.palette, readPalette(bufs.vram, video.getPaletteBase(), t.palette));
        }
      }
      const sprGroup: SpriteGroupData = {
        sprites: [], palette: pal,
        bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
        tiles: pose.tiles,
      };
      pose.preview = assembleCharacter(gfxRom, sprGroup, palMap);
    }
  }

  renderSheetZoomedPose(): void {
    const ctx = this.sheetZoomCtx;
    const cvs = this.sheetZoomCanvas;
    if (!ctx || !cvs) return;

    const { host } = this;
    const poses = host.activePoses;
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;

    const gfxRom = host.editor.getGfxRom();
    if (!gfxRom) return;
    const video = host.emulator.getVideo();
    if (!video) return;
    const bufs = host.emulator.getBusBuffers();
    const ag = host.activeGroup;
    const pal = ag?.spriteCapture?.palette ?? 0;
    const palMap = new Map<number, Array<[number, number, number]>>();
    // Filter out hidden palettes for the zoomed view
    const visibleTiles = this.hiddenPalettes.size > 0
      ? pose.tiles.filter(t => !this.hiddenPalettes.has(t.palette))
      : pose.tiles;
    for (const t of visibleTiles) {
      if (!palMap.has(t.palette)) {
        palMap.set(t.palette, readPalette(bufs.vram, video.getPaletteBase(), t.palette));
      }
    }
    const sprGroup: SpriteGroupData = {
      sprites: [], palette: pal,
      bounds: { x: 0, y: 0, w: pose.w, h: pose.h },
      tiles: visibleTiles,
    };
    const freshPreview = assembleCharacter(gfxRom, sprGroup, palMap);

    const tmp = document.createElement('canvas');
    tmp.width = pose.w;
    tmp.height = pose.h;
    tmp.getContext('2d')!.putImageData(freshPreview, 0, 0);

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(tmp, 0, 0);

    // Tile grid overlay (only visible tiles)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.5;
    for (const t of visibleTiles) {
      ctx.strokeRect(t.relX + 0.5, t.relY + 0.5, 15, 15);
    }

    // Selected tile highlight (only if visible)
    if (this.sheetSelectedTile >= 0 && this.sheetSelectedTile < pose.tiles.length) {
      const t = pose.tiles[this.sheetSelectedTile]!;
      if (!this.hiddenPalettes.has(t.palette)) {
        ctx.strokeStyle = '#ff1a50';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(t.relX + 0.5, t.relY + 0.5, 15, 15);
        ctx.setLineDash([]);
      }
    }
  }

  private refreshSheetSidebar(): void {
    if (!this.sheetContainer) return;
    const cells = this.sheetContainer.querySelectorAll('.sprite-sheet-sidebar-cell canvas');
    const poses = this.host.activePoses;
    cells.forEach((cvs, i) => {
      const pose = poses[i];
      if (!pose) return;
      const ctx = (cvs as HTMLCanvasElement).getContext('2d');
      if (ctx) ctx.putImageData(pose.preview, 0, 0);
    });
  }

  private renderSheetTileGrid(container: HTMLElement, pose: CapturedPose): void {
    container.innerHTML = '';

    const { host } = this;
    const gfxRom = host.editor.getGfxRom();
    if (!gfxRom) return;
    const video = host.emulator.getVideo();
    if (!video) return;
    const bufs = host.emulator.getBusBuffers();
    const paletteIdx = host.activeGroup?.spriteCapture?.palette ?? 0;
    const palette = pose.capturedColors ?? readPalette(bufs.vram, video.getPaletteBase(), paletteIdx);

    const objBuf = video.getObjBuffer();
    const vram = bufs.vram;
    const cpsaRegs = video.getCpsaRegs();
    const mapperTable = video.getMapperTable();
    const bankSizes = video.getBankSizes();
    const bankBases = video.getBankBases();

    // Build per-tile palette cache
    const palCache = new Map<number, Array<[number, number, number]>>();

    for (let i = 0; i < pose.tiles.length; i++) {
      const t = pose.tiles[i]!;
      const isHidden = this.hiddenPalettes.has(t.palette);

      const tileWrap = el('div', 'sprite-sheet-tile-wrap') as HTMLDivElement;
      if (isHidden) tileWrap.style.opacity = '0.2';

      const tileCvs = document.createElement('canvas');
      tileCvs.width = 16;
      tileCvs.height = 16;
      tileCvs.className = 'sprite-sheet-tile';
      if (i === this.sheetSelectedTile) tileCvs.classList.add('active');

      // Use tile's own palette
      if (!palCache.has(t.palette)) {
        palCache.set(t.palette, readPalette(bufs.vram, video.getPaletteBase(), t.palette));
      }
      const tilePal = palCache.get(t.palette)!;

      const tileCtx = tileCvs.getContext('2d')!;
      const pixels = readTileFn(gfxRom, t.mappedCode, 16, 16, 128);
      const img = new ImageData(16, 16);
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const srcX = t.flipX ? 15 - px : px;
          const srcY = t.flipY ? 15 - py : py;
          const colorIdx = pixels[srcY * 16 + srcX]!;
          if (colorIdx === 15) continue;
          const [r, g, b] = tilePal[colorIdx] ?? [0, 0, 0];
          const di = (py * 16 + px) * 4;
          img.data[di] = r;
          img.data[di + 1] = g;
          img.data[di + 2] = b;
          img.data[di + 3] = 255;
        }
      }
      tileCtx.putImageData(img, 0, 0);
      tileWrap.appendChild(tileCvs);

      const refs = findTileReferences(t.mappedCode, objBuf, vram, cpsaRegs, mapperTable, bankSizes, bankBases);
      if (refs.length > 1) {
        const badge = el('div', 'sprite-sheet-tile-shared') as HTMLDivElement;
        badge.textContent = `×${refs.length}`;
        setTooltip(badge, `Shared by ${refs.length} sprites — editing affects all of them`);
        tileWrap.appendChild(badge);
      }

      setTooltip(tileWrap, 'Click to select this tile — Left/Right arrows');
      tileWrap.onclick = () => {
        this.sheetSelectedTile = i;
        this.selectSheetTile(i);
      };

      container.appendChild(tileWrap);
    }
  }

  private selectSheetTile(tileIdx: number): void {
    const { host } = this;
    const poses = host.activePoses;
    const pose = poses[this.sheetSelectedPose];
    if (!pose) return;
    const t = pose.tiles[tileIdx];
    if (!t) return;

    host.editor.selectTileFromPose(t.mappedCode, t.palette);
    host.refreshTileGrid();
    host.refreshPalette();
    host.refreshInfoBar();

    this.renderSheetZoomedPose();

    const tilesGrid = this.sheetContainer?.querySelector('.sprite-sheet-tiles');
    if (tilesGrid) {
      tilesGrid.querySelectorAll('.sprite-sheet-tile').forEach((c, i) => {
        c.classList.toggle('active', i === tileIdx);
      });
    }
  }

  private drawScrollHighlight(set: ScrollSet): void {
    this.clearScrollHighlight();
    const { host } = this;
    const video = host.emulator.getVideo();
    if (!video) return;

    const { layerId, tileW, tileH, tiles } = set;
    const { scrollX, scrollY } = video.getScrollXY(layerId);

    const overlay = document.createElement('canvas');
    const gameRect = host.gameCanvas.getBoundingClientRect();
    const scaleX = gameRect.width / SCREEN_WIDTH;
    const scaleY = gameRect.height / SCREEN_HEIGHT;
    overlay.width = gameRect.width;
    overlay.height = gameRect.height;
    overlay.style.position = 'absolute';
    overlay.style.left = `${gameRect.left + window.scrollX}px`;
    overlay.style.top = `${gameRect.top + window.scrollY}px`;
    overlay.style.width = `${gameRect.width}px`;
    overlay.style.height = `${gameRect.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '100';
    document.body.appendChild(overlay);
    this.scrollHighlightOverlay = overlay;

    const ctx = overlay.getContext('2d')!;
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 255, 0, 0.15)';

    const virtualW = 64 * tileW;
    const virtualH = 64 * tileH;

    for (const tile of tiles) {
      const absX = tile.tileCol * tileW;
      const absY = tile.tileRow * tileH;
      const screenX = ((absX - scrollX) % virtualW + virtualW) % virtualW;
      const screenY = ((absY - scrollY) % virtualH + virtualH) % virtualH;

      if (screenX >= SCREEN_WIDTH || screenY >= SCREEN_HEIGHT) continue;
      if (screenX + tileW <= 0 || screenY + tileH <= 0) continue;

      ctx.fillRect(screenX * scaleX, screenY * scaleY, tileW * scaleX, tileH * scaleY);
      ctx.strokeRect(screenX * scaleX, screenY * scaleY, tileW * scaleX, tileH * scaleY);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/** Render a single tile into an ImageData data array. */
function renderTileToImageData(
  data: Uint8ClampedArray,
  imgWidth: number,
  gfxRom: Uint8Array,
  tile: { tileCode: number; tileW: number; tileH: number; charSize: number; flipX: boolean; flipY: boolean },
  tileW: number,
  tileH: number,
  colors: Array<[number, number, number]>,
  gridX: number,
  gridY: number,
): void {
  const pixels = readTileFn(gfxRom, tile.tileCode, tile.tileW, tile.tileH, tile.charSize);
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      let lx = tx, ly = ty;
      if (tile.flipX) lx = tileW - 1 - tx;
      if (tile.flipY) ly = tileH - 1 - ty;
      const colorIdx = pixels[ly * tileW + lx]!;
      if (colorIdx === 15) continue;
      const [r, g, b] = colors[colorIdx] ?? [0, 0, 0];
      const px = gridX * tileW + tx;
      const py = gridY * tileH + ty;
      const off = (py * imgWidth + px) * 4;
      data[off] = r;
      data[off + 1] = g;
      data[off + 2] = b;
      data[off + 3] = 255;
    }
  }
}
