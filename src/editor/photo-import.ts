/**
 * Photo Import — detour, pixelize, quantize, and place a photo onto sprite tiles.
 *
 * Pipeline: load → remove background → resize (nearest neighbor) → quantize to palette → place on tiles.
 */

import { writePixel } from './tile-encoder';
import * as iq from 'image-q';

// ---------------------------------------------------------------------------
// Step 1: Load image as ImageData
// ---------------------------------------------------------------------------

export function loadImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Failed to load image')); };
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Step 2: Remove background
// ---------------------------------------------------------------------------

/**
 * Detect background color from image corners and remove it via flood fill.
 */
export function removeBackground(image: ImageData, tolerance = 40): ImageData {
  const { width, height, data } = image;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);

  // Sample background color from corners
  const corners = [
    0,                            // top-left
    (width - 1) * 4,             // top-right
    (height - 1) * width * 4,   // bottom-left
    ((height - 1) * width + width - 1) * 4, // bottom-right
  ];

  let bgR = 0, bgG = 0, bgB = 0;
  for (const i of corners) {
    bgR += data[i]!;
    bgG += data[i + 1]!;
    bgB += data[i + 2]!;
  }
  bgR = Math.round(bgR / 4);
  bgG = Math.round(bgG / 4);
  bgB = Math.round(bgB / 4);

  // Flood fill from edges: mark pixels matching bg color as transparent
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Seed from all edge pixels
  for (let x = 0; x < width; x++) {
    queue.push(x);                      // top edge
    queue.push((height - 1) * width + x); // bottom edge
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push(y * width);              // left edge
    queue.push(y * width + width - 1);  // right edge
  }

  const tolSq = tolerance * tolerance * 3; // tolerance in squared RGB distance

  while (queue.length > 0) {
    const idx = queue.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const pi = idx * 4;
    const dr = result.data[pi]! - bgR;
    const dg = result.data[pi + 1]! - bgG;
    const db = result.data[pi + 2]! - bgB;
    if (dr * dr + dg * dg + db * db > tolSq) continue;

    // Set transparent
    result.data[pi + 3] = 0;

    // Expand to neighbors
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) queue.push(idx - 1);
    if (x < width - 1) queue.push(idx + 1);
    if (y > 0) queue.push(idx - width);
    if (y < height - 1) queue.push(idx + width);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 3: Resize (nearest neighbor)
// ---------------------------------------------------------------------------

export function resizeNearestNeighbor(src: ImageData, targetW: number, targetH: number): ImageData {
  const dst = new ImageData(targetW, targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.floor(x * src.width / targetW);
      const srcY = Math.floor(y * src.height / targetH);
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * targetW + x) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Step 4: Quantize to palette
// ---------------------------------------------------------------------------

/**
 * Map each pixel to the closest palette color (by index).
 * Returns a Uint8Array of palette indices (0 = transparent).
 */
export function quantizeToPalette(
  image: ImageData,
  palette: Array<[number, number, number]>,
): Uint8Array {
  const indices = new Uint8Array(image.width * image.height);

  for (let i = 0; i < indices.length; i++) {
    const pi = i * 4;
    const a = image.data[pi + 3]!;
    if (a < 128) {
      indices[i] = 0; // transparent
      continue;
    }

    const r = image.data[pi]!;
    const g = image.data[pi + 1]!;
    const b = image.data[pi + 2]!;

    // Find closest palette color (skip index 0 = transparent)
    let bestIdx = 1;
    let bestDist = Infinity;
    for (let c = 1; c < palette.length; c++) {
      const [pr, pg, pb] = palette[c]!;
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = c;
      }
    }
    indices[i] = bestIdx;
  }

  return indices;
}

// ---------------------------------------------------------------------------
// Step 5: Place quantized pixels onto GFX ROM tiles
// ---------------------------------------------------------------------------

export interface PlacementTile {
  mappedCode: number;
  relX: number;
  relY: number;
  flipX: boolean;
  flipY: boolean;
}

/**
 * Write quantized pixels onto the GFX ROM tiles that overlap the photo placement area.
 *
 * @param photoX - X offset of the photo within the sprite bounding box
 * @param photoY - Y offset of the photo within the sprite bounding box
 * @param photoW - Width of the quantized photo
 * @param photoH - Height of the quantized photo
 */
export function placePhotoOnTiles(
  gfxRom: Uint8Array,
  tiles: PlacementTile[],
  quantized: Uint8Array,
  photoX: number,
  photoY: number,
  photoW: number,
  photoH: number,
): void {
  for (const tile of tiles) {
    // Check if this tile overlaps with the photo area
    const tileRight = tile.relX + 16;
    const tileBottom = tile.relY + 16;
    const photoRight = photoX + photoW;
    const photoBottom = photoY + photoH;

    if (tile.relX >= photoRight || tileRight <= photoX) continue;
    if (tile.relY >= photoBottom || tileBottom <= photoY) continue;

    // Write overlapping pixels
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        // Position in the sprite bounding box
        const bx = tile.relX + px;
        const by = tile.relY + py;

        // Position in the photo
        const qx = bx - photoX;
        const qy = by - photoY;

        if (qx < 0 || qx >= photoW || qy < 0 || qy >= photoH) continue;

        const colorIndex = quantized[qy * photoW + qx]!;
        if (colorIndex === 0) continue; // don't overwrite with transparent

        // Account for tile flip
        const localX = tile.flipX ? 15 - px : px;
        const localY = tile.flipY ? 15 - py : py;

        writePixel(gfxRom, tile.mappedCode, localX, localY, colorIndex);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 6: Detect head region in a pose
// ---------------------------------------------------------------------------

import { readPixel } from './tile-encoder';

/**
 * Detect the "head" region of a sprite by finding the bounding box of
 * non-transparent pixels in the upper portion of the character.
 *
 * Scans from the top, expanding downward until hitting a row where
 * non-transparent pixel density drops significantly (neck/shoulders gap).
 */
export function detectHeadRegion(
  gfxRom: Uint8Array,
  tiles: PlacementTile[],
  spriteW: number,
  spriteH: number,
): { x: number; y: number; w: number; h: number } | null {
  // Build a mask of non-transparent pixels in the sprite bounding box
  const mask = new Uint8Array(spriteW * spriteH);
  for (const tile of tiles) {
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const localX = tile.flipX ? 15 - px : px;
        const localY = tile.flipY ? 15 - py : py;
        const idx = readPixel(gfxRom, tile.mappedCode, localX, localY);
        if (idx !== 0) {
          const bx = tile.relX + px;
          const by = tile.relY + py;
          if (bx >= 0 && bx < spriteW && by >= 0 && by < spriteH) {
            mask[by * spriteW + bx] = 1;
          }
        }
      }
    }
  }

  // Find the first non-empty row from top
  let startY = -1;
  for (let y = 0; y < spriteH; y++) {
    let count = 0;
    for (let x = 0; x < spriteW; x++) {
      if (mask[y * spriteW + x]) count++;
    }
    if (count > 0) { startY = y; break; }
  }
  if (startY === -1) return null;

  // CPS1 heads are ~2 tiles (32px) max. Scan up to 32px from top of content.
  // Look for a neck gap (density drop) within that range.
  const MAX_HEAD_PX = 32;
  const scanEnd = Math.min(startY + MAX_HEAD_PX, spriteH);
  let peakDensity = 0;
  const rowDensities: number[] = [];

  for (let y = startY; y < scanEnd; y++) {
    let count = 0;
    for (let x = 0; x < spriteW; x++) {
      if (mask[y * spriteW + x]) count++;
    }
    rowDensities.push(count);
    if (count > peakDensity) peakDensity = count;
  }

  // Find neck: where density drops below 50% of peak (more aggressive than before)
  let headRows = rowDensities.length;
  if (peakDensity > 0) {
    for (let i = 8; i < rowDensities.length; i++) {
      if (rowDensities[i]! < peakDensity * 0.5) {
        headRows = i;
        break;
      }
    }
  }

  const endY = startY + headRows;

  // Find horizontal extent of head pixels
  let minX = spriteW, maxX = 0;
  for (let y = startY; y < endY; y++) {
    for (let x = 0; x < spriteW; x++) {
      if (mask[y * spriteW + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  if (maxX < minX) return null;

  return { x: minX, y: startY, w: maxX - minX + 1, h: endY - startY };
}

/**
 * Build a mask of non-transparent pixels for a set of tiles.
 * Used to constrain photo placement to the original sprite silhouette.
 */
export function buildSpriteMask(
  gfxRom: Uint8Array,
  tiles: PlacementTile[],
  w: number,
  h: number,
): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (const tile of tiles) {
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const localX = tile.flipX ? 15 - px : px;
        const localY = tile.flipY ? 15 - py : py;
        const idx = readPixel(gfxRom, tile.mappedCode, localX, localY);
        if (idx !== 0) {
          const bx = tile.relX + px;
          const by = tile.relY + py;
          if (bx >= 0 && bx < w && by >= 0 && by < h) {
            mask[by * w + bx] = 1;
          }
        }
      }
    }
  }
  return mask;
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

export interface PhotoImportResult {
  indices: Uint8Array;
  preview: ImageData;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Run the full photo import pipeline with intelligent head detection:
 * load → detour → detect head region → resize to head → quantize → mask.
 */
export async function processPhoto(
  file: File,
  gfxRom: Uint8Array,
  tiles: PlacementTile[],
  spriteW: number,
  spriteH: number,
  palette: Array<[number, number, number]>,
): Promise<PhotoImportResult | null> {
  // Load
  const raw = await loadImageData(file);

  // Remove background
  const detoured = removeBackground(raw);

  // Crop to non-transparent bounding box
  const cropped = cropToContent(detoured);
  if (cropped.width <= 1 && cropped.height <= 1) return null;

  // Detect head region in the original sprite
  const headRegion = detectHeadRegion(gfxRom, tiles, spriteW, spriteH);
  if (!headRegion) return null;

  // Resize photo to match head region dimensions
  const resized = resizeNearestNeighbor(cropped, headRegion.w, headRegion.h);

  // Quantize to palette
  const rawIndices = quantizeToPalette(resized, palette);

  // Apply sprite mask: only keep pixels where the original sprite had content
  const mask = buildSpriteMask(gfxRom, tiles, spriteW, spriteH);
  const maskedIndices = new Uint8Array(rawIndices.length);
  for (let i = 0; i < rawIndices.length; i++) {
    const bx = headRegion.x + (i % headRegion.w);
    const by = headRegion.y + Math.floor(i / headRegion.w);
    if (bx >= 0 && bx < spriteW && by >= 0 && by < spriteH && mask[by * spriteW + bx]) {
      maskedIndices[i] = rawIndices[i]!;
    }
  }

  // Build preview
  const preview = indicesToImageData(maskedIndices, headRegion.w, headRegion.h, palette);

  return {
    indices: maskedIndices,
    preview,
    x: headRegion.x,
    y: headRegion.y,
    w: headRegion.w,
    h: headRegion.h,
  };
}

/**
 * Crop an ImageData to the bounding box of non-transparent pixels.
 */
function cropToContent(image: ImageData): ImageData {
  const { width, height, data } = image;
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) return new ImageData(1, 1); // fully transparent

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cropped = new ImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * width + (minX + x)) * 4;
      const di = (y * w + x) * 4;
      cropped.data[di] = data[si]!;
      cropped.data[di + 1] = data[si + 1]!;
      cropped.data[di + 2] = data[si + 2]!;
      cropped.data[di + 3] = data[si + 3]!;
    }
  }

  return cropped;
}

/**
 * Convert palette indices back to ImageData for preview.
 */
function indicesToImageData(
  indices: Uint8Array,
  w: number,
  h: number,
  palette: Array<[number, number, number]>,
): ImageData {
  const img = new ImageData(w, h);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    const di = i * 4;
    if (idx === 0) {
      img.data[di + 3] = 0; // transparent
    } else {
      const [r, g, b] = palette[idx] ?? [0, 0, 0];
      img.data[di] = r;
      img.data[di + 1] = g;
      img.data[di + 2] = b;
      img.data[di + 3] = 255;
    }
  }
  return img;
}

/**
 * Simple photo pipeline: load → detour → crop → resize to given dimensions → quantize.
 * No head detection — the caller provides the target size (from manual selection).
 */
export async function processPhotoSimple(
  file: File,
  targetW: number,
  targetH: number,
  palette: Array<[number, number, number]>,
): Promise<PhotoImportResult> {
  const raw = await loadImageData(file);
  const detoured = removeBackground(raw);
  const cropped = cropToContent(detoured);
  const resized = resizeNearestNeighbor(cropped, targetW, targetH);
  const indices = quantizeToPalette(resized, palette);
  const preview = indicesToImageData(indices, targetW, targetH, palette);
  return { indices, preview, x: 0, y: 0, w: targetW, h: targetH };
}

/**
 * Photo pipeline preserving aspect ratio: fits within maxW × maxH.
 */
export async function processPhotoFit(
  file: File,
  maxW: number,
  maxH: number,
  palette: Array<[number, number, number]>,
): Promise<PhotoImportResult> {
  const raw = await loadImageData(file);
  const cropped = cropToContent(raw);

  // Fit within max bounds, preserving aspect ratio
  const scale = Math.min(maxW / cropped.width, maxH / cropped.height);
  const targetW = Math.max(1, Math.round(cropped.width * scale));
  const targetH = Math.max(1, Math.round(cropped.height * scale));

  // Step 1: Bilinear downscale (smooth average, preserves features at low res)
  const smoothed = resizeBilinear(cropped, targetW, targetH);

  // Step 2: Enhance contrast (make features pop at pixel-art resolution)
  enhanceContrast(smoothed, 1.4);

  // Step 3: Detect edges and force to darkest palette color
  const darkIdx = findDarkestIndex(palette);
  const edges = detectEdges(smoothed);

  // Step 4: Quantize with perceptual distance (CIE Lab)
  const indices = quantizeToPaletteLab(smoothed, palette);

  // Step 5: Apply edge outlines (CPS1 style)
  for (let i = 0; i < indices.length; i++) {
    if (edges[i]! > 80) indices[i] = darkIdx;
  }

  const preview = indicesToImageData(indices, targetW, targetH, palette);
  return { indices, preview, x: 0, y: 0, w: targetW, h: targetH };
}

// ---------------------------------------------------------------------------
// Bilinear resize (smooth downscale, better than nearest neighbor for photos)
// ---------------------------------------------------------------------------

function resizeBilinear(src: ImageData, targetW: number, targetH: number): ImageData {
  // Use canvas for high-quality bilinear downscale
  const cvs = document.createElement('canvas');
  cvs.width = targetW;
  cvs.height = targetH;
  const ctx = cvs.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const tmpCvs = document.createElement('canvas');
  tmpCvs.width = src.width;
  tmpCvs.height = src.height;
  tmpCvs.getContext('2d')!.putImageData(src, 0, 0);

  ctx.drawImage(tmpCvs, 0, 0, src.width, src.height, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

// ---------------------------------------------------------------------------
// Contrast enhancement
// ---------------------------------------------------------------------------

function enhanceContrast(image: ImageData, factor: number): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp(128 + (d[i]! - 128) * factor);
    d[i + 1] = clamp(128 + (d[i + 1]! - 128) * factor);
    d[i + 2] = clamp(128 + (d[i + 2]! - 128) * factor);
  }
}

function clamp(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }

// ---------------------------------------------------------------------------
// Edge detection (simplified Sobel)
// ---------------------------------------------------------------------------

function detectEdges(image: ImageData): Uint8Array {
  const { width, height, data } = image;
  const edges = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Luminance of surrounding pixels
      const lum = (ox: number, oy: number) => {
        const i = ((y + oy) * width + (x + ox)) * 4;
        return data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
      };

      // Sobel gradients
      const gx = -lum(-1, -1) - 2 * lum(-1, 0) - lum(-1, 1)
                + lum(1, -1) + 2 * lum(1, 0) + lum(1, 1);
      const gy = -lum(-1, -1) - 2 * lum(0, -1) - lum(1, -1)
                + lum(-1, 1) + 2 * lum(0, 1) + lum(1, 1);

      edges[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  return edges;
}

function findDarkestIndex(palette: Array<[number, number, number]>): number {
  let darkIdx = 1;
  let darkLum = Infinity;
  for (let i = 1; i < palette.length; i++) {
    const [r, g, b] = palette[i]!;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (lum < darkLum) { darkLum = lum; darkIdx = i; }
  }
  return darkIdx;
}

// ---------------------------------------------------------------------------
// Perceptual quantization (CIE Lab color distance)
// ---------------------------------------------------------------------------

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB → linear
  let rl = r / 255, gl = g / 255, bl = b / 255;
  rl = rl > 0.04045 ? ((rl + 0.055) / 1.055) ** 2.4 : rl / 12.92;
  gl = gl > 0.04045 ? ((gl + 0.055) / 1.055) ** 2.4 : gl / 12.92;
  bl = bl > 0.04045 ? ((bl + 0.055) / 1.055) ** 2.4 : bl / 12.92;

  // Linear RGB → XYZ (D65)
  let x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  let y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750);
  let z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;

  // XYZ → Lab
  const f = (t: number) => t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  x = f(x); y = f(y); z = f(z);

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function quantizeToPaletteLab(
  image: ImageData,
  palette: Array<[number, number, number]>,
): Uint8Array {
  // Pre-compute palette in Lab space
  const palLab = palette.map(([r, g, b]) => rgbToLab(r, g, b));

  const indices = new Uint8Array(image.width * image.height);
  for (let i = 0; i < indices.length; i++) {
    const pi = i * 4;
    const a = image.data[pi + 3]!;
    if (a < 128) { indices[i] = 0; continue; }

    const [L, A, B] = rgbToLab(image.data[pi]!, image.data[pi + 1]!, image.data[pi + 2]!);

    let bestIdx = 1;
    let bestDist = Infinity;
    for (let c = 1; c < palLab.length; c++) {
      const [pL, pA, pB] = palLab[c]!;
      const dist = (L - pL) ** 2 + (A - pA) ** 2 + (B - pB) ** 2;
      if (dist < bestDist) { bestDist = dist; bestIdx = c; }
    }
    indices[i] = bestIdx;
  }

  return indices;
}

// ---------------------------------------------------------------------------
// Load photo as RGBA (bilinear resize, no quantize)
// ---------------------------------------------------------------------------

export async function loadPhotoRgba(
  file: File,
  maxW: number,
  maxH: number,
): Promise<ImageData> {
  const raw = await loadImageData(file);
  const cropped = cropToContent(raw);

  const scale = Math.min(maxW / cropped.width, maxH / cropped.height);
  const targetW = Math.max(1, Math.round(cropped.width * scale));
  const targetH = Math.max(1, Math.round(cropped.height * scale));

  return resizeBilinear(cropped, targetW, targetH);
}

/**
 * Resize RGBA ImageData (from original, lossless).
 */
export function resizeRgba(original: ImageData, newW: number, newH: number): ImageData {
  return resizeBilinear(original, newW, newH);
}

// ---------------------------------------------------------------------------
// Quantize RGBA → palette indices using image-q (Atkinson dithering)
// ---------------------------------------------------------------------------

export function quantizeWithDithering(
  rgba: ImageData,
  palette: Array<[number, number, number]>,
): Uint8Array {
  const { width, height } = rgba;

  // Boost saturation before quantize
  const saturated = new ImageData(new Uint8ClampedArray(rgba.data), width, height);
  enhanceSaturation(saturated, 1.3);

  // Build image-q point container
  const pointContainer = iq.utils.PointContainer.fromUint8Array(saturated.data, width, height);

  // Build palette (skip index 0 = transparent)
  const iqPalette = new iq.utils.Palette();
  for (let i = 1; i < palette.length; i++) {
    const [r, g, b] = palette[i]!;
    iqPalette.add(iq.utils.Point.createByRGBA(r, g, b, 255));
  }

  // Atkinson dithering
  const distCalc = new iq.distance.EuclideanBT709();
  const ditherer = new iq.image.ErrorDiffusionArray(distCalc, iq.image.ErrorDiffusionArrayKernel.Atkinson);
  const result = ditherer.quantizeSync(pointContainer, iqPalette);

  // Map result back to palette indices
  const resultPoints = result.getPointArray();
  const indices = new Uint8Array(width * height);

  for (let i = 0; i < resultPoints.length; i++) {
    const p = resultPoints[i]!;
    const a = rgba.data[i * 4 + 3]!;
    if (a < 128) { indices[i] = 0; continue; }

    const r = p.r, g = p.g, b = p.b;
    let bestIdx = 1;
    let bestDist = Infinity;
    for (let c = 1; c < palette.length; c++) {
      const [pr, pg, pb] = palette[c]!;
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) { bestDist = dist; bestIdx = c; }
    }
    indices[i] = bestIdx;
  }

  return indices;
}

// ---------------------------------------------------------------------------
// Saturation enhancement
// ---------------------------------------------------------------------------

function enhanceSaturation(image: ImageData, factor: number): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    d[i]     = clamp(gray + (r - gray) * factor);
    d[i + 1] = clamp(gray + (g - gray) * factor);
    d[i + 2] = clamp(gray + (b - gray) * factor);
  }
}
