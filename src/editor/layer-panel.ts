/**
 * Layer Panel — left sidebar for managing photo layers.
 *
 * Groups layers by CPS1 target (Scroll 2/3, Sprite group).
 * Each layer shows name, visibility toggle, quantize/delete buttons.
 */

import type { PhotoLayer, LayerGroup } from './layer-model';
import { getTileStats } from './tile-allocator';

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

export interface LayerPanelCallbacks {
  onSelectLayer(groupIdx: number, layerIdx: number): void;
  onToggleVisibility(groupIdx: number, layerIdx: number): void;
  onDeleteLayer(groupIdx: number, layerIdx: number): void;
  onQuantizeLayer(groupIdx: number, layerIdx: number): void;
  onMergeGroup(groupIdx: number): void;
  onDropPhoto(groupIdx: number, file: File): void;
}

// ---------------------------------------------------------------------------
// LayerPanel
// ---------------------------------------------------------------------------

export class LayerPanel {
  private container: HTMLDivElement;
  private content: HTMLDivElement;
  private callbacks: LayerPanelCallbacks;

  constructor(callbacks: LayerPanelCallbacks) {
    this.callbacks = callbacks;

    this.container = document.getElementById('layer-panel') as HTMLDivElement;
    if (!this.container) {
      // Create dynamically if not in HTML
      this.container = document.createElement('div');
      this.container.id = 'layer-panel';
      this.container.className = 'layer-panel';
      document.body.appendChild(this.container);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'layer-panel-header';
    const title = document.createElement('h2');
    title.textContent = 'Layers';
    header.appendChild(title);
    this.container.appendChild(header);

    // Content area
    this.content = document.createElement('div');
    this.content.className = 'layer-panel-content';
    this.container.appendChild(this.content);

    // Memory indicator
    this.memIndicator = document.createElement('div');
    this.memIndicator.className = 'layer-mem-indicator';
    this.container.appendChild(this.memIndicator);
  }

  private memIndicator: HTMLDivElement;

  show(): void {
    this.container.classList.add('open');
    document.body.classList.add('layer-active');
  }

  hide(): void {
    this.container.classList.remove('open');
    document.body.classList.remove('layer-active');
  }

  /**
   * Rebuild the panel contents from the current layer groups.
   */
  refresh(
    groups: LayerGroup[],
    activeGroupIdx: number,
    activeLayerIdx: number,
    gfxRom?: Uint8Array,
  ): void {
    this.content.innerHTML = '';

    // Update memory indicator
    if (gfxRom) {
      const stats16 = getTileStats(gfxRom, 128); // 16x16 tiles (most common)
      const pct = Math.round(stats16.free / stats16.total * 100);
      this.memIndicator.textContent = `GFX ROM: ${stats16.free}/${stats16.total} tiles free (${pct}%)`;
    }

    if (groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'layer-empty';
      empty.textContent = 'No layers yet. Capture a sprite first.';
      this.content.appendChild(empty);
      return;
    }

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]!;
      const isActiveGroup = gi === activeGroupIdx;

      // Group header
      const groupEl = document.createElement('div');
      groupEl.className = 'layer-group' + (isActiveGroup ? ' layer-group-active' : '');

      const groupHeader = document.createElement('div');
      groupHeader.className = 'layer-group-header';
      groupHeader.textContent = group.name;
      groupHeader.onclick = () => {
        groupEl.classList.toggle('layer-group-collapsed');
      };
      groupEl.appendChild(groupHeader);

      // Layer rows
      const layerList = document.createElement('div');
      layerList.className = 'layer-list';

      for (let li = 0; li < group.layers.length; li++) {
        const layer = group.layers[li]!;
        const isActive = isActiveGroup && li === activeLayerIdx;
        const row = this.createLayerRow(layer, gi, li, isActive);
        layerList.appendChild(row);
      }

      groupEl.appendChild(layerList);

      // Group actions
      const actions = document.createElement('div');
      actions.className = 'layer-group-actions';

      // Merge button
      const hasQuantized = group.layers.some(l => l.quantized);
      if (hasQuantized) {
        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'layer-btn layer-merge-btn';
        mergeBtn.textContent = 'Merge All';
        mergeBtn.onclick = () => this.callbacks.onMergeGroup(gi);
        actions.appendChild(mergeBtn);
      }

      groupEl.appendChild(actions);

      // Drop zone (disabled for sprite groups without captures)
      const spriteNeedsCapture = group.type === 'sprite' && !group.spriteCapture?.poses.length;
      const dropZone = document.createElement('div');
      dropZone.className = 'layer-drop-zone';
      dropZone.textContent = spriteNeedsCapture ? 'Capture poses first' : '+ Drop photo here';
      if (spriteNeedsCapture) dropZone.classList.add('layer-drop-disabled');
      dropZone.addEventListener('dragover', (e) => { if (spriteNeedsCapture) return; e.preventDefault(); dropZone.classList.add('layer-drop-active'); });
      dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('layer-drop-active'); });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('layer-drop-active');
        const file = (e as DragEvent).dataTransfer?.files[0];
        if (file?.type.startsWith('image/')) {
          this.callbacks.onDropPhoto(gi, file);
        }
      });
      groupEl.appendChild(dropZone);

      this.content.appendChild(groupEl);
    }
  }

  private createLayerRow(
    layer: PhotoLayer,
    groupIdx: number,
    layerIdx: number,
    isActive: boolean,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'layer-row' + (isActive ? ' layer-row-active' : '');
    row.draggable = true;

    // Click to select
    row.onclick = () => this.callbacks.onSelectLayer(groupIdx, layerIdx);

    // Visibility toggle
    const eye = document.createElement('button');
    eye.className = 'layer-eye-btn';
    eye.textContent = layer.visible ? '\u{1F441}' : '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}';
    eye.title = layer.visible ? 'Hide layer' : 'Show layer';
    eye.style.opacity = layer.visible ? '1' : '0.3';
    eye.onclick = (e) => { e.stopPropagation(); this.callbacks.onToggleVisibility(groupIdx, layerIdx); };
    row.appendChild(eye);

    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.className = 'layer-thumb';
    thumb.width = 24;
    thumb.height = 24;
    const thumbCtx = thumb.getContext('2d')!;
    thumbCtx.imageSmoothingEnabled = false;
    // Draw a tiny preview
    const tmpCvs = document.createElement('canvas');
    tmpCvs.width = layer.width;
    tmpCvs.height = layer.height;
    tmpCvs.getContext('2d')!.putImageData(layer.rgbaData, 0, 0);
    const fitScale = Math.min(24 / layer.width, 24 / layer.height);
    const tw = layer.width * fitScale;
    const th = layer.height * fitScale;
    thumbCtx.drawImage(tmpCvs, 0, 0, layer.width, layer.height, (24 - tw) / 2, (24 - th) / 2, tw, th);
    row.appendChild(thumb);

    // Name
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.name;
    row.appendChild(name);

    // Status badge
    const badge = document.createElement('span');
    badge.className = 'layer-badge';
    badge.textContent = layer.quantized ? 'Q' : 'RGBA';
    badge.title = layer.quantized ? 'Quantized (ready for merge)' : 'Raw photo (needs quantize)';
    row.appendChild(badge);

    // Quantize button (only if not yet quantized)
    if (!layer.quantized) {
      const qBtn = document.createElement('button');
      qBtn.className = 'layer-btn';
      qBtn.textContent = 'Q';
      qBtn.title = 'Quantize to palette';
      qBtn.onclick = (e) => { e.stopPropagation(); this.callbacks.onQuantizeLayer(groupIdx, layerIdx); };
      row.appendChild(qBtn);
    }

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'layer-btn layer-del-btn';
    delBtn.textContent = '\u00D7';
    delBtn.title = 'Delete layer';
    delBtn.onclick = (e) => { e.stopPropagation(); this.callbacks.onDeleteLayer(groupIdx, layerIdx); };
    row.appendChild(delBtn);

    return row;
  }
}
