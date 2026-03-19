/**
 * Tile Cache — per-tile rendering
 *
 * Instead of generating massive sprite sheet atlases, we render each
 * tile+palette combo as a tiny canvas (8x8, 16x16, 32x32) and cache
 * the data URL. Each tile is ~1KB as PNG. Even 2000 unique tiles per
 * frame = ~2MB — no browser crash.
 */

// ---------------------------------------------------------------------------
// Tile decode (same as cps1-video.ts)
// ---------------------------------------------------------------------------

function decodeRow(
  b0: number, b1: number, b2: number, b3: number,
  out: Uint8Array, outOffset: number,
): void {
  out[outOffset]     = ((b0 >> 7) & 1) | (((b1 >> 7) & 1) << 1) | (((b2 >> 7) & 1) << 2) | (((b3 >> 7) & 1) << 3);
  out[outOffset + 1] = ((b0 >> 6) & 1) | (((b1 >> 6) & 1) << 1) | (((b2 >> 6) & 1) << 2) | (((b3 >> 6) & 1) << 3);
  out[outOffset + 2] = ((b0 >> 5) & 1) | (((b1 >> 5) & 1) << 1) | (((b2 >> 5) & 1) << 2) | (((b3 >> 5) & 1) << 3);
  out[outOffset + 3] = ((b0 >> 4) & 1) | (((b1 >> 4) & 1) << 1) | (((b2 >> 4) & 1) << 2) | (((b3 >> 4) & 1) << 3);
  out[outOffset + 4] = ((b0 >> 3) & 1) | (((b1 >> 3) & 1) << 1) | (((b2 >> 3) & 1) << 2) | (((b3 >> 3) & 1) << 3);
  out[outOffset + 5] = ((b0 >> 2) & 1) | (((b1 >> 2) & 1) << 1) | (((b2 >> 2) & 1) << 2) | (((b3 >> 2) & 1) << 3);
  out[outOffset + 6] = ((b0 >> 1) & 1) | (((b1 >> 1) & 1) << 1) | (((b2 >> 1) & 1) << 2) | (((b3 >> 1) & 1) << 3);
  out[outOffset + 7] = (b0 & 1) | ((b1 & 1) << 1) | ((b2 & 1) << 2) | ((b3 & 1) << 3);
}

// ---------------------------------------------------------------------------
// Palette decode
// ---------------------------------------------------------------------------

function decodeCps1Color(colorWord: number): [number, number, number, number] {
  const bright = 0x0f + (((colorWord >> 12) & 0x0f) << 1);
  const r = Math.min(255, ((colorWord >> 8) & 0x0f) * 0x11 * bright / 0x2d | 0);
  const g = Math.min(255, ((colorWord >> 4) & 0x0f) * 0x11 * bright / 0x2d | 0);
  const b = Math.min(255, ((colorWord >> 0) & 0x0f) * 0x11 * bright / 0x2d | 0);
  return [r, g, b, 255];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TileSize = 8 | 16 | 32;

// ---------------------------------------------------------------------------
// SpriteSheetManager — per-tile cache
// ---------------------------------------------------------------------------

export class SpriteSheetManager {
  private readonly gfxRom: Uint8Array;

  // Cache: key = `${tileSize}:${tileCode}:${paletteIndex}`, value = data URL
  private readonly cache = new Map<string, string>();

  // Reusable canvas + context for rendering tiles
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rowBuf = new Uint8Array(32);

  // Palette cache: decoded from VRAM, keyed by palette index
  private readonly paletteCache = new Map<number, Array<[number, number, number, number]>>();
  private lastPaletteBase = -1;
  private lastPaletteHash = 0;

  constructor(gfxRom: Uint8Array) {
    this.gfxRom = gfxRom;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 32;
    this.canvas.height = 32;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * Get a data URL for a single tile rendered with a specific palette.
   * Cached — only generated once per unique tile+palette+size combo.
   */
  getTileUrl(
    tileCode: number,
    tileSize: TileSize,
    paletteIndex: number,
    vram: Uint8Array,
    paletteBase: number,
  ): string {
    // Check palette hash FIRST — invalidate stale cache before lookup
    this.checkPaletteChanged(vram, paletteBase);

    const key = `${tileSize}:${tileCode}:${paletteIndex}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let palette = this.paletteCache.get(paletteIndex);
    if (!palette) {
      palette = this.decodePalette(paletteIndex, vram, paletteBase);
      this.paletteCache.set(paletteIndex, palette);
    }

    const url = this.renderTile(tileCode, tileSize, palette);
    this.cache.set(key, url);
    return url;
  }

  /** Check if palette VRAM changed since last call; invalidate caches if so. */
  private checkPaletteChanged(vram: Uint8Array, paletteBase: number): void {
    const paletteHash = this.hashPaletteVram(vram, paletteBase);
    if (paletteBase !== this.lastPaletteBase || paletteHash !== this.lastPaletteHash) {
      this.paletteCache.clear();
      this.cache.clear();
      this.lastPaletteBase = paletteBase;
      this.lastPaletteHash = paletteHash;
    }
  }

  /** Invalidate cache. */
  invalidate(): void {
    this.cache.clear();
    this.paletteCache.clear();
    this.lastPaletteBase = -1;
  }

  /**
   * Get a data URL for a multi-tile sprite (nx * ny tiles of 16x16).
   * Composes sub-tiles using MAME formula: (code & ~0xF) + ((code + nxs) & 0xF) + 0x10 * nys
   */
  getMultiTileUrl(
    baseCode: number,
    nx: number,
    ny: number,
    paletteIndex: number,
    vram: Uint8Array,
    paletteBase: number,
  ): string {
    // Check palette hash FIRST
    this.checkPaletteChanged(vram, paletteBase);

    const key = `multi:${baseCode}:${nx}x${ny}:${paletteIndex}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let palette = this.paletteCache.get(paletteIndex);
    if (!palette) {
      palette = this.decodePalette(paletteIndex, vram, paletteBase);
      this.paletteCache.set(paletteIndex, palette);
    }

    const w = nx * 16;
    const h = ny * 16;
    this.canvas.width = w;
    this.canvas.height = h;
    const imageData = this.ctx.createImageData(w, h);
    const pixels = imageData.data;
    const gfx = this.gfxRom;
    const gfxLen = gfx.length;
    const rowBuf = this.rowBuf;

    for (let nys = 0; nys < ny; nys++) {
      for (let nxs = 0; nxs < nx; nxs++) {
        const subCode = (baseCode & ~0x0F) + ((baseCode + nxs) & 0x0F) + 0x10 * nys;
        const charBase = subCode * 128; // CHAR_SIZE_16
        const offsetX = nxs * 16;
        const offsetY = nys * 16;

        for (let ty = 0; ty < 16; ty++) {
          for (let group = 0; group < 2; group++) {
            const planeBase = charBase + ty * 8 + group * 4;
            if (planeBase + 3 >= gfxLen) continue;
            decodeRow(gfx[planeBase]!, gfx[planeBase + 1]!, gfx[planeBase + 2]!, gfx[planeBase + 3]!, rowBuf, 0);
            for (let px = 0; px < 8; px++) {
              const colorIdx = rowBuf[px]!;
              const [r, g, b, a] = palette[colorIdx]!;
              const screenX = offsetX + group * 8 + px;
              const screenY = offsetY + ty;
              const pixelOffset = (screenY * w + screenX) * 4;
              pixels[pixelOffset] = r;
              pixels[pixelOffset + 1] = g;
              pixels[pixelOffset + 2] = b;
              pixels[pixelOffset + 3] = a;
            }
          }
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
    const url = this.canvas.toDataURL();
    this.cache.set(key, url);
    return url;
  }

  /** For compatibility with GameScreen — not used in per-tile mode. */
  getSheet(
    _tileSize: TileSize,
    _paletteIndex: number,
    _vram: Uint8Array,
    _paletteBase: number,
  ): string {
    return '';
  }

  getBackgroundPosition(_tileCode: number, _tileSize: TileSize): string {
    return '0px 0px';
  }

  getAtlasSize(_tileSize: TileSize): { width: number; height: number } {
    return { width: 0, height: 0 };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Fast checksum of palette VRAM (256 palettes × 32 bytes = 8192 bytes).
   * Only needs to detect changes, not be cryptographic.
   */
  private hashPaletteVram(vram: Uint8Array, paletteBase: number): number {
    let hash = 0;
    const end = Math.min(paletteBase + 8192, vram.length);
    for (let i = paletteBase; i < end; i++) {
      hash = ((hash << 5) - hash + vram[i]!) | 0;
    }
    return hash;
  }

  private decodePalette(
    paletteIndex: number,
    vram: Uint8Array,
    paletteBase: number,
  ): Array<[number, number, number, number]> {
    const palette: Array<[number, number, number, number]> = [];
    for (let c = 0; c < 16; c++) {
      const offset = paletteBase + paletteIndex * 32 + c * 2;
      if (offset + 1 < vram.length) {
        const colorWord = (vram[offset]! << 8) | vram[offset + 1]!;
        palette.push(decodeCps1Color(colorWord));
      } else {
        palette.push([0, 0, 0, 0]);
      }
    }
    // Pen 15 = transparent
    palette[15] = [0, 0, 0, 0];
    return palette;
  }

  private renderTile(
    tileCode: number,
    tileSize: TileSize,
    palette: Array<[number, number, number, number]>,
  ): string {
    const canvas = this.canvas;
    const ctx = this.ctx;
    canvas.width = tileSize;
    canvas.height = tileSize;

    const imageData = ctx.createImageData(tileSize, tileSize);
    const pixels = imageData.data;
    const gfx = this.gfxRom;
    const gfxLen = gfx.length;
    const rowBuf = this.rowBuf;

    const charSize = tileSize === 8 ? 64 : tileSize === 16 ? 128 : 512;
    const rowStride = tileSize === 32 ? 16 : 8;
    const groupsPerRow = tileSize >> 3;
    const charBase = tileCode * charSize;

    for (let ty = 0; ty < tileSize; ty++) {
      for (let group = 0; group < groupsPerRow; group++) {
        const planeBase = charBase + ty * rowStride + group * 4;
        if (planeBase + 3 >= gfxLen) continue;

        decodeRow(
          gfx[planeBase]!, gfx[planeBase + 1]!,
          gfx[planeBase + 2]!, gfx[planeBase + 3]!,
          rowBuf, 0,
        );

        for (let px = 0; px < 8; px++) {
          const colorIdx = rowBuf[px]!;
          const [r, g, b, a] = palette[colorIdx]!;
          const screenX = group * 8 + px;
          const pixelOffset = (ty * tileSize + screenX) * 4;
          pixels[pixelOffset] = r;
          pixels[pixelOffset + 1] = g;
          pixels[pixelOffset + 2] = b;
          pixels[pixelOffset + 3] = a;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }
}
