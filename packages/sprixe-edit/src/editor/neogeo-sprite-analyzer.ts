/**
 * Neo-Geo Sprite Analyzer
 *
 * Groups sprites into characters using the Neo-Geo sticky bit mechanism.
 * Unlike CPS1 (heuristic proximity grouping), Neo-Geo grouping is deterministic:
 * - sticky=0 starts a new character (master sprite)
 * - sticky=1 continues the previous character (adds column to the right)
 *
 * Horizontal grouping uses sticky chains directly.
 * Transparent pen = index 0 (not 15 like CPS1).
 */

import { readNeoGeoTile } from '@sprixe/engine/video/neogeo-tile-encoder';
import { NGO_TILE_BYTES, NGO_SCREEN_WIDTH, NGO_SCREEN_HEIGHT } from '@sprixe/engine/neogeo-constants';
import type { NeoGeoVideo, NeoGeoSpriteEntry, SpriteGroup } from '@sprixe/engine/video/neogeo-video';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A captured pose from the Neo-Geo sprite system */
export interface NeoGeoCapturedPose {
  /** Sorted tile codes — identity key for deduplication */
  tileHash: string;
  /** Tile layout */
  tiles: Array<{
    relX: number;
    relY: number;
    tileCode: number;
    flipH: boolean;
    flipV: boolean;
    palette: number;
  }>;
  /** Bounding box dimensions */
  w: number;
  h: number;
  /** Palette index */
  palette: number;
  /** Preview image */
  preview: ImageData;
  /** Palette RGB snapshot at capture time */
  capturedColors?: Array<[number, number, number]>;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Read all sprite groups from the Neo-Geo VRAM.
 * Groups are determined by the sticky bit chain.
 */
export function readAllSpriteGroups(video: NeoGeoVideo): SpriteGroup[] {
  return video.readAllSpriteGroups();
}

/**
 * Filter groups that are visible on screen and non-empty.
 */
export function getVisibleGroups(groups: SpriteGroup[]): SpriteGroup[] {
  return groups.filter(g => {
    if (g.sprites.length === 0) return false;
    const master = g.sprites[0]!;
    // Check if any part of the group is on screen
    const groupWidth = g.width * 16;
    const groupHeight = g.height * 16;
    return (
      master.x + groupWidth > 0 &&
      master.x < NGO_SCREEN_WIDTH &&
      g.y + groupHeight > 0 &&
      g.y < NGO_SCREEN_HEIGHT
    );
  });
}

// ---------------------------------------------------------------------------
// Pose hashing and capture
// ---------------------------------------------------------------------------

/** Generate a hash string from a sprite group's tile codes (order-independent) */
export function poseHash(group: SpriteGroup, video: NeoGeoVideo): string {
  const codes: number[] = [];
  for (const sprite of group.sprites) {
    const entry = video.readSpriteEntry(sprite.index);
    // Read all tile codes in the sprite column
    for (let t = 0; t < entry.height; t++) {
      codes.push(entry.tileCode + t); // Simplified: tiles are sequential
    }
  }
  codes.sort((a, b) => a - b);
  return codes.join(',');
}

/**
 * Assemble a character preview image from a sprite group.
 * Uses back-to-front rendering with transparent pen = 0.
 */
export function assembleCharacter(
  group: SpriteGroup,
  video: NeoGeoVideo,
  spritesRom: Uint8Array,
  paletteRam: Uint8Array,
): ImageData {
  const w = group.width * 16;
  const h = group.height * 16;
  const img = new ImageData(w, h);
  const data = img.data;

  // Decode palette colors for this group
  const masterPalette = group.sprites[0]?.palette ?? 0;
  const colors = decodePaletteRgb(paletteRam, masterPalette);

  // Render each column (sprite) of the group
  for (let colIdx = 0; colIdx < group.sprites.length; colIdx++) {
    const sprite = group.sprites[colIdx]!;
    const entry = video.readSpriteEntry(sprite.index);
    const baseX = colIdx * 16;

    for (let tileY = 0; tileY < entry.height && tileY < 32; tileY++) {
      const tileCode = entry.tileCode + tileY; // Simplified
      if (tileCode * NGO_TILE_BYTES + NGO_TILE_BYTES > spritesRom.length) continue;

      const pixels = readNeoGeoTile(spritesRom, tileCode);
      const baseY = tileY * 16;

      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const srcX = entry.flipH ? (15 - px) : px;
          const srcY = entry.flipV ? (15 - py) : py;
          const colorIdx = pixels[srcY * 16 + srcX]!;

          if (colorIdx === 0) continue; // Transparent

          const destX = baseX + px;
          const destY = baseY + py;
          if (destX >= w || destY >= h) continue;

          const dstOff = (destY * w + destX) * 4;
          const [r, g, b] = colors[colorIdx]!;
          data[dstOff] = r;
          data[dstOff + 1] = g;
          data[dstOff + 2] = b;
          data[dstOff + 3] = 255;
        }
      }
    }
  }

  return img;
}

// ---------------------------------------------------------------------------
// Palette helpers
// ---------------------------------------------------------------------------

/** Decode a 16-color Neo-Geo palette to RGB arrays */
export function decodePaletteRgb(
  paletteRam: Uint8Array,
  paletteIndex: number,
): Array<[number, number, number]> {
  const colors: Array<[number, number, number]> = [];
  const base = paletteIndex * 16 * 2; // 16 colors × 2 bytes each

  for (let i = 0; i < 16; i++) {
    const word = (paletteRam[base + i * 2]! << 8) | paletteRam[base + i * 2 + 1]!;

    const rHi = (word >> 11) & 0x0F;
    const gHi = (word >> 7) & 0x0F;
    const bHi = (word >> 3) & 0x0F;
    const rLo = (word >> 2) & 1;
    const gLo = (word >> 1) & 1;
    const bLo = word & 1;

    const r5 = (rHi << 1) | rLo;
    const g5 = (gHi << 1) | gLo;
    const b5 = (bHi << 1) | bLo;

    let r8 = (r5 << 3) | (r5 >> 2);
    let g8 = (g5 << 3) | (g5 >> 2);
    let b8 = (b5 << 3) | (b5 >> 2);

    if (word & 0x8000) { // dark bit
      r8 >>= 1;
      g8 >>= 1;
      b8 >>= 1;
    }

    colors.push([r8, g8, b8]);
  }

  return colors;
}
