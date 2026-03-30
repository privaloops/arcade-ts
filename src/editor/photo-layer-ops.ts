/**
 * Photo layer operations — pure logic for quantization, merging, compositing,
 * and magic wand on photo layers.
 *
 * Extracted from SpriteEditorUI to isolate pixel manipulation from UI.
 */

import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
import { LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from '../video/cps1-video';
import type { Emulator } from '../emulator';
import type { CapturedPose } from './sprite-analyzer';
import type { PhotoLayer, LayerGroup } from './layer-model';
import { readPalette, encodeColor } from './palette-editor';
import { writePixel as writePixelFn, writeScrollPixel } from './tile-encoder';
import { findTileReferences } from './tile-refs';
import { quantizeWithDithering, placePhotoOnTiles, generatePalette } from './photo-import';
import { showToast } from '../ui/toast';

// ---------------------------------------------------------------------------
// Magic wand (flood-fill erase on a layer)
// ---------------------------------------------------------------------------

/**
 * Flood-fill erase: set all connected pixels of the same index to 0.
 * Operates on layer.pixels at the given world coordinates (px, py).
 */
export function magicWandFill(layer: PhotoLayer, px: number, py: number): void {
  const lx = px - layer.offsetX;
  const ly = py - layer.offsetY;
  if (lx < 0 || lx >= layer.width || ly < 0 || ly >= layer.height) return;

  const targetIdx = layer.pixels[ly * layer.width + lx]!;
  if (targetIdx === 0) return;

  const visited = new Uint8Array(layer.width * layer.height);
  const queue = [ly * layer.width + lx];
  visited[ly * layer.width + lx] = 1;

  while (queue.length > 0) {
    const pos = queue.pop()!;
    layer.pixels[pos] = 0;

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
}

// ---------------------------------------------------------------------------
// Composite layer onto ImageData
// ---------------------------------------------------------------------------

/** Composite a single photo layer onto an ImageData buffer (w × h). */
export function compositeLayerOnto(
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

// ---------------------------------------------------------------------------
// Quantize sprite photo layer (with optional palette update + outline)
// ---------------------------------------------------------------------------

/**
 * Quantize a sprite photo layer to the CPS1 palette. Optionally regenerate
 * the palette from the photo. Adds a 1px black outline around opaque regions.
 */
export function quantizeSpritePhoto(
  emulator: Emulator,
  layer: PhotoLayer,
  paletteIdx: number,
  updatePalette: boolean,
): void {
  const video = emulator.getVideo();
  if (!video) return;
  const bufs = emulator.getBusBuffers();

  if (updatePalette) {
    const newColors = generatePalette(layer.rgbaData, 15);
    const paletteBase = video.getPaletteBase();
    const vramOff = paletteBase + paletteIdx * 32;
    for (let i = 0; i < 15; i++) {
      const [r, g, b] = newColors[i] ?? [0, 0, 0];
      const word = encodeColor(r, g, b);
      bufs.vram[vramOff + i * 2] = (word >> 8) & 0xFF;
      bufs.vram[vramOff + i * 2 + 1] = word & 0xFF;
    }
    const romStore = emulator.getRomStore();
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

  // Add 1px outline using darkest palette color
  let darkestIdx = 0;
  let darkestLum = Infinity;
  for (let c = 0; c < 15; c++) {
    const [cr, cg, cb] = palette[c] ?? [0, 0, 0];
    const lum = cr * 0.299 + cg * 0.587 + cb * 0.114;
    if (lum < darkestLum) { darkestLum = lum; darkestIdx = c; }
  }
  const w = layer.width;
  const h = layer.height;
  const border = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (layer.pixels[y * w + x] !== 0) continue;
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
}

// ---------------------------------------------------------------------------
// Merge sprite photo layer onto tiles
// ---------------------------------------------------------------------------

/** Merge quantized sprite photo layer onto pose tiles (refCount = 1 only). */
export function mergeSpritePhoto(
  emulator: Emulator,
  gfxRom: Uint8Array,
  layer: PhotoLayer,
  pose: CapturedPose,
): { written: number; skipped: number } {
  const video = emulator.getVideo();
  if (!video) return { written: 0, skipped: 0 };
  const bufs = emulator.getBusBuffers();

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

  return { written, skipped };
}

// ---------------------------------------------------------------------------
// Merge all layers (sprite + scroll)
// ---------------------------------------------------------------------------

/** Merge all quantized layers in a group into the GFX ROM. Returns the number of merged layers. */
export function mergeAllLayers(
  emulator: Emulator,
  gfxRom: Uint8Array,
  group: LayerGroup,
  poses: CapturedPose[],
  getGroupScroll: (g: LayerGroup) => { sx: number; sy: number },
): number {
  let merged = 0;

  if (group.type === 'sprite') {
    if (poses.length === 0) return 0;
    for (const layer of group.layers) {
      if (!layer.quantized) continue;
      for (const pose of poses) {
        placePhotoOnTiles(gfxRom, pose.tiles, layer.pixels, layer.offsetX, layer.offsetY, layer.width, layer.height);
      }
      merged++;
    }
  } else {
    const video = emulator.getVideo();
    if (!video || group.layerId === undefined) return 0;

    const charSizeMap: Record<number, number> = { [LAYER_SCROLL1]: 64, [LAYER_SCROLL2]: 128, [LAYER_SCROLL3]: 512 };
    const charSize = charSizeMap[group.layerId] ?? 128;
    const tileSizeMap: Record<number, number> = { [LAYER_SCROLL1]: 8, [LAYER_SCROLL2]: 16, [LAYER_SCROLL3]: 32 };
    const tileSize = tileSizeMap[group.layerId] ?? 16;
    const isScroll1 = group.layerId === LAYER_SCROLL1;

    const mergeScroll = getGroupScroll(group);
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

    const paletteBase = video.getPaletteBase();
    const bufs = emulator.getBusBuffers();
    const paletteCache = new Map<number, Array<[number, number, number]>>();

    let written = 0;
    let skipped = 0;
    for (const layer of group.layers) {
      if (!layer.quantized) continue;
      for (let ly = 0; ly < layer.height; ly++) {
        for (let lx = 0; lx < layer.width; lx++) {
          const pi = (ly * layer.width + lx) * 4;
          if (layer.rgbaData.data[pi + 3]! < 128) continue;
          const sx = lx + layer.offsetX - mergeScroll.sx;
          const sy = ly + layer.offsetY - mergeScroll.sy;
          if (sx < 0 || sx >= SCREEN_WIDTH || sy < 0 || sy >= SCREEN_HEIGHT) { skipped++; continue; }
          const info = video.inspectScrollAt(sx, sy, group.layerId, true);
          if (!info) { skipped++; continue; }
          if ((codeCount.get(info.tileCode) ?? 0) > 1) { skipped++; continue; }

          const r = layer.rgbaData.data[pi]!;
          const g = layer.rgbaData.data[pi + 1]!;
          const b = layer.rgbaData.data[pi + 2]!;

          let tilePalette = paletteCache.get(info.paletteIndex);
          if (!tilePalette) {
            tilePalette = readPalette(bufs.vram, paletteBase, info.paletteIndex);
            paletteCache.set(info.paletteIndex, tilePalette);
          }

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

  return merged;
}
