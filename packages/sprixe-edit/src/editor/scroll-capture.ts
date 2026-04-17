/**
 * Scroll Capture — accumulate scroll layer tiles during gameplay.
 *
 * Uses screen position + scroll offset to build a linear stage map.
 * Each frame, visible tiles are placed at their absolute pixel position.
 * Tiles are grouped by palette for Aseprite export.
 */

import type { CPS1Video } from '@sprixe/engine/video/cps1-video';
import { LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from '@sprixe/engine/video/cps1-video';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '@sprixe/engine/constants';
import { readPalette } from './palette-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollTile {
  /** Mapped GFX ROM tile code */
  tileCode: number;
  /** Absolute pixel position in the stage (screen + scroll) */
  absX: number;
  absY: number;
  /** Grid position (absX / tileW, absY / tileH) */
  tileCol: number;
  tileRow: number;
  /** Palette index (absolute, including group offset) */
  palette: number;
  /** Flip flags */
  flipX: boolean;
  flipY: boolean;
  /** Tile dimensions */
  tileW: number;
  tileH: number;
  /** Byte size in GFX ROM */
  charSize: number;
  /** Raw code (before bank mapping) for manifest */
  rawCode: number;
}

export interface ScrollSet {
  layerId: number;
  palette: number;
  tiles: ScrollTile[];
  tileW: number;
  tileH: number;
  /** Palette RGB snapshot captured at recording time (16 entries, [R,G,B]). */
  capturedColors?: Array<[number, number, number]>;
}

export interface ScrollCaptureSession {
  layerId: number;
  /** Captured tiles keyed by "absX,absY" for dedup */
  tileMap: Map<string, ScrollTile>;
  tileW: number;
  tileH: number;
}

// ---------------------------------------------------------------------------
// Capture logic
// ---------------------------------------------------------------------------

export function createScrollSession(layerId: number): ScrollCaptureSession {
  const tileW = layerId === LAYER_SCROLL1 ? 8 : layerId === LAYER_SCROLL2 ? 16 : 32;
  return {
    layerId,
    tileMap: new Map(),
    tileW,
    tileH: tileW,
  };
}

/**
 * Capture all visible tiles of a scroll layer for the current frame.
 * Places tiles at absolute position (screen + scroll offset).
 */
export function captureScrollFrame(
  session: ScrollCaptureSession,
  video: CPS1Video,
  vram?: Uint8Array,
  paletteBase?: number,
): number {
  const { layerId, tileW, tileH } = session;
  let newTiles = 0;

  // Get current scroll position
  const { scrollX, scrollY } = video.getScrollXY(layerId);

  // For each tile-sized cell on screen
  for (let sy = 0; sy < SCREEN_HEIGHT; sy += tileH) {
    for (let sx = 0; sx < SCREEN_WIDTH; sx += tileW) {
      const px = Math.min(sx + (tileW >> 1), SCREEN_WIDTH - 1);
      const py = Math.min(sy + (tileH >> 1), SCREEN_HEIGHT - 1);

      const info = video.inspectScrollAt(px, py, layerId, true);
      if (!info || info.tileCode === -1) continue;

      // Absolute position = screen position + scroll, snapped to tile grid
      const absX = Math.floor((sx + scrollX) / tileW) * tileW;
      const absY = Math.floor((sy + scrollY) / tileH) * tileH;
      const key = `${absX},${absY}`;

      if (!session.tileMap.has(key)) {
        session.tileMap.set(key, {
          tileCode: info.tileCode,
          absX, absY,
          tileCol: absX / tileW,
          tileRow: absY / tileH,
          palette: info.paletteIndex,
          flipX: info.flipX,
          flipY: info.flipY,
          tileW, tileH,
          charSize: info.charSize,
          rawCode: info.rawCode,
        });
        newTiles++;
      }
    }
  }

  return newTiles;
}

/**
 * Build scroll sets from a capture session (one per palette).
 * Palette RGB is snapshot at build time (STOP) to avoid fade/flash artifacts.
 */
export function buildScrollSets(session: ScrollCaptureSession, vram?: Uint8Array, paletteBase?: number): ScrollSet[] {
  const byPalette = new Map<number, ScrollTile[]>();

  for (const tile of session.tileMap.values()) {
    let list = byPalette.get(tile.palette);
    if (!list) { list = []; byPalette.set(tile.palette, list); }
    list.push(tile);
  }

  const sets: ScrollSet[] = [];
  for (const [palette, tiles] of byPalette) {
    if (tiles.length === 0) continue;
    const set: ScrollSet = { layerId: session.layerId, palette, tiles, tileW: session.tileW, tileH: session.tileH };
    // Snapshot palette from current VRAM state (stable at STOP time)
    if (vram && paletteBase !== undefined) {
      set.capturedColors = readPalette(vram, paletteBase, palette);
    }
    sets.push(set);
  }

  sets.sort((a, b) => a.palette - b.palette);
  return sets;
}

/**
 * Get layer name for display.
 */
export function scrollLayerName(layerId: number): string {
  switch (layerId) {
    case LAYER_SCROLL1: return 'Scroll 1 (8×8)';
    case LAYER_SCROLL2: return 'Scroll 2 (16×16)';
    case LAYER_SCROLL3: return 'Scroll 3 (32×32)';
    default: return `Layer ${layerId}`;
  }
}
