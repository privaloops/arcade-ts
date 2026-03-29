/**
 * Scroll Capture — accumulate scroll layer tiles during gameplay.
 *
 * Captures visible tiles from a scroll layer each frame, building up
 * a complete tilemap as the player scrolls through the stage.
 * Tiles are grouped by palette for Aseprite export.
 */

import type { CPS1Video } from '../video/cps1-video';
import { LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from '../video/cps1-video';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollTile {
  /** Mapped GFX ROM tile code */
  tileCode: number;
  /** Key for dedup: "tileCol,tileRow" in tilemap space */
  key: string;
  /** Column/row in the 64x64 tilemap */
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
  /** Layer ID (LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3) */
  layerId: number;
  /** Palette index for this set */
  palette: number;
  /** Unique tiles */
  tiles: ScrollTile[];
  /** Tile dimensions for this layer */
  tileW: number;
  tileH: number;
}

export interface ScrollCaptureSession {
  layerId: number;
  /** All captured tiles keyed by "tileCol,tileRow" for deduplication */
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
 * Uses inspectScrollAt to read tile info at each tile position.
 * Returns the number of new tiles found.
 */
export function captureScrollFrame(
  session: ScrollCaptureSession,
  video: CPS1Video,
): number {
  const { layerId, tileW, tileH } = session;
  let newTiles = 0;

  // Sample at the center of each tile-sized cell on screen
  for (let sy = 0; sy < SCREEN_HEIGHT; sy += tileH) {
    for (let sx = 0; sx < SCREEN_WIDTH; sx += tileW) {
      const px = Math.min(sx + (tileW >> 1), SCREEN_WIDTH - 1);
      const py = Math.min(sy + (tileH >> 1), SCREEN_HEIGHT - 1);

      const info = video.inspectScrollAt(px, py, layerId, true);
      if (!info || info.tileCode === -1) continue;

      // Derive tilemap column/row from screen position + localX/localY
      // The virtual position of the pixel is: screen_pos + scroll_offset
      // The tile starts at: virtual_pos - local_pos
      // The tile col/row: tile_start / tileW
      // Since inspectScrollAt already computes tileCol/tileRow internally
      // and gives us tilemapOffset, we can derive col/row from tileIndex
      // tileIndex = scanFn(col, row) — but we don't have the inverse
      // Instead, use tilemapOffset which is unique per tile position
      const key = `${info.tilemapOffset}`;

      if (!session.tileMap.has(key)) {
        const tile: ScrollTile = {
          tileCode: info.tileCode,
          key,
          tileCol: 0, // we use tilemapOffset as unique key instead
          tileRow: 0,
          palette: info.paletteIndex,
          flipX: info.flipX,
          flipY: info.flipY,
          tileW: info.tileW,
          tileH: info.tileH,
          charSize: info.charSize,
          rawCode: info.rawCode,
        };

        session.tileMap.set(key, tile);
        newTiles++;
      }
    }
  }

  return newTiles;
}

/**
 * Build scroll sets from a capture session (one per palette).
 */
export function buildScrollSets(session: ScrollCaptureSession): ScrollSet[] {
  const byPalette = new Map<number, ScrollTile[]>();

  for (const tile of session.tileMap.values()) {
    let list = byPalette.get(tile.palette);
    if (!list) {
      list = [];
      byPalette.set(tile.palette, list);
    }
    list.push(tile);
  }

  const sets: ScrollSet[] = [];
  for (const [palette, tiles] of byPalette) {
    if (tiles.length === 0) continue;
    sets.push({
      layerId: session.layerId,
      palette,
      tiles,
      tileW: session.tileW,
      tileH: session.tileH,
    });
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
