/**
 * Sprite Analyzer — group OBJ sprites into characters, then scan GFX ROM
 * for animation variants (other poses of the same character).
 *
 * CPS1 games compose characters from multiple individual 1×1 sprites
 * sharing the same palette and placed adjacently on screen.
 */

import { readTile } from './tile-encoder';
import { gfxromBankMapper, GFXTYPE_SPRITES } from '../video/cps1-video';
import type { CPS1Video } from '../video/cps1-video';
import { CHAR_SIZE_16 } from '../constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single OBJ sprite entry parsed from the OBJ buffer. */
export interface ObjSprite {
  /** Unique id per sub-tile (sequential, for grouping deduplication). */
  uid: number;
  /** OBJ table slot index (0-255). Multiple sub-tiles share the same index. */
  index: number;
  screenX: number;
  screenY: number;
  rawCode: number;
  mappedCode: number;
  palette: number;
  flipX: boolean;
  flipY: boolean;
}

/** A character = group of OBJ sprites forming one entity on screen. */
export interface SpriteGroup {
  sprites: ObjSprite[];
  palette: number;
  /** Bounding box in screen coords */
  bounds: { x: number; y: number; w: number; h: number };
  /** Tile codes at relative positions (relX, relY) within the bounding box */
  tiles: Array<{ relX: number; relY: number; mappedCode: number; flipX: boolean; flipY: boolean; palette: number }>;
}


/** A unique pose captured during gameplay. */
export interface CapturedPose {
  /** Sorted tile codes — used as identity key for deduplication */
  tileHash: string;
  /** Tile layout (positions + codes + flips) */
  tiles: SpriteGroup['tiles'];
  /** Bounding box dimensions */
  w: number;
  h: number;
  /** Palette index */
  palette: number;
  /** Preview image */
  preview: ImageData;
  /** Palette RGB snapshot at capture time (16 entries). */
  capturedColors?: Array<[number, number, number]>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CPS_HBEND = 64;
const CPS_VBEND = 16;

// ---------------------------------------------------------------------------
// Step 1: Read all active sprites from OBJ buffer
// ---------------------------------------------------------------------------

export function readAllSprites(video: CPS1Video): ObjSprite[] {
  const objBuf = video.getObjBuffer();
  const mapperTable = video.getMapperTable();
  const bankSizes = video.getBankSizes();
  const bankBases = video.getBankBases();
  const sprites: ObjSprite[] = [];
  let uid = 0;

  for (let i = 0; i < 256; i++) {
    const off = i * 8;
    if (off + 7 >= objBuf.length) break;

    const colour = (objBuf[off + 6]! << 8) | objBuf[off + 7]!;
    if ((colour & 0xFF00) === 0xFF00) break; // end-of-list marker

    const x = (objBuf[off]! << 8) | objBuf[off + 1]!;
    const y = (objBuf[off + 2]! << 8) | objBuf[off + 3]!;
    const code = (objBuf[off + 4]! << 8) | objBuf[off + 5]!;
    const palette = colour & 0x1F;
    const flipX = !!((colour >> 5) & 1);
    const flipY = !!((colour >> 6) & 1);

    const mappedBaseCode = gfxromBankMapper(GFXTYPE_SPRITES, code, mapperTable, bankSizes, bankBases);
    if (mappedBaseCode === -1) continue;

    if (colour & 0xFF00) {
      // Multi-tile (blocked) sprite: expand into individual sub-tiles
      // Same formula as the hardware renderer (cps1-video.ts renderObjects)
      const nx = ((colour >> 8) & 0x0F) + 1;
      const ny = ((colour >> 12) & 0x0F) + 1;

      for (let nys = 0; nys < ny; nys++) {
        for (let nxs = 0; nxs < nx; nxs++) {
          const sx = ((x + nxs * 16) & 0x1FF) - CPS_HBEND;
          const sy = ((y + nys * 16) & 0x1FF) - CPS_VBEND;

          let tileCode: number;
          if (flipY) {
            if (flipX) {
              tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (nx - 1) - nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
            } else {
              tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
            }
          } else {
            if (flipX) {
              tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + (nx - 1) - nxs) & 0x0F) + 0x10 * nys;
            } else {
              tileCode = (mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * nys;
            }
          }

          sprites.push({
            uid: uid++, index: i, screenX: sx, screenY: sy,
            rawCode: code, mappedCode: tileCode, palette, flipX, flipY,
          });
        }
      }
    } else {
      // Single-tile sprite
      const screenX = (x & 0x1FF) - CPS_HBEND;
      const screenY = (y & 0x1FF) - CPS_VBEND;
      sprites.push({
        uid: uid++, index: i, screenX, screenY,
        rawCode: code, mappedCode: mappedBaseCode, palette, flipX, flipY,
      });
    }
  }

  return sprites;
}

// ---------------------------------------------------------------------------
// Step 2: Group sprites into characters by palette + spatial adjacency
// ---------------------------------------------------------------------------

/**
 * Find all sprites that belong to the same character as the clicked sprite.
 * Groups by spatial adjacency (within tolerance).
 * @param filterPalette — if set, only include sprites of this palette in the
 *   flood-fill. Produces a mono-palette group (cleaner captures, no parasites).
 */
export function groupCharacter(allSprites: ObjSprite[], clickedIndex: number, filterPalette?: number): SpriteGroup | null {
  const clicked = allSprites.find(s => s.index === clickedIndex);
  if (!clicked) return null;

  const palette = clicked.palette;
  if (filterPalette !== undefined && clicked.palette !== filterPalette) return null;

  const candidates = filterPalette !== undefined
    ? allSprites.filter(s => s.palette === filterPalette)
    : allSprites;

  const TOLERANCE = 4;
  const inGroup = new Set<number>();
  const queue = [clicked];
  inGroup.add(clicked.uid);

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const candidate of candidates) {
      if (inGroup.has(candidate.uid)) continue;
      if (tilesAdjacent(current, candidate, TOLERANCE)) {
        inGroup.add(candidate.uid);
        queue.push(candidate);
      }
    }
  }

  const grouped = candidates.filter(s => inGroup.has(s.uid));

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of grouped) {
    minX = Math.min(minX, s.screenX);
    minY = Math.min(minY, s.screenY);
    maxX = Math.max(maxX, s.screenX + 16);
    maxY = Math.max(maxY, s.screenY + 16);
  }

  // Build tile list with positions relative to bounding box origin
  const tiles = grouped.map(s => ({
    relX: s.screenX - minX,
    relY: s.screenY - minY,
    mappedCode: s.mappedCode,
    flipX: s.flipX,
    flipY: s.flipY,
    palette: s.palette,
  }));

  return {
    sprites: grouped,
    palette,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    tiles,
  };
}

/**
 * Compute a hash string for a pose (sorted tile codes) for deduplication.
 */
export function poseHash(group: SpriteGroup): string {
  // Hash sorted tile codes — ignores position and flip so mirrored poses match
  const codes = group.tiles.map(t => t.mappedCode).sort((a, b) => a - b);
  return codes.join(',');
}

/**
 * Build a CapturedPose from a SpriteGroup.
 */
export function capturePose(
  gfxRom: Uint8Array,
  group: SpriteGroup,
  palette: Array<[number, number, number]>,
): CapturedPose {
  return {
    tileHash: poseHash(group),
    tiles: group.tiles.map(t => ({ ...t })),
    w: group.bounds.w,
    h: group.bounds.h,
    palette: group.palette,
    preview: assembleCharacter(gfxRom, group, palette),
    capturedColors: palette.map(([r, g, b]) => [r, g, b] as [number, number, number]),
  };
}

/** Check if a 16×16 tile is fully transparent (all pixels = pen 15). */
export function isTileTransparent(gfxRom: Uint8Array, mappedCode: number): boolean {
  const pixels = readTile(gfxRom, mappedCode, 16, 16, CHAR_SIZE_16);
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] !== 15) return false;
  }
  return true;
}

function tilesAdjacent(a: ObjSprite, b: ObjSprite, tolerance: number): boolean {
  // Two 16x16 sprites are adjacent if their bounding boxes touch or overlap
  const ax2 = a.screenX + 16 + tolerance;
  const ay2 = a.screenY + 16 + tolerance;
  const bx2 = b.screenX + 16 + tolerance;
  const by2 = b.screenY + 16 + tolerance;

  return a.screenX - tolerance < bx2 && ax2 > b.screenX - tolerance
      && a.screenY - tolerance < by2 && ay2 > b.screenY - tolerance;
}

// ---------------------------------------------------------------------------
// Step 3: Assemble character preview from tile pixels
// ---------------------------------------------------------------------------

/**
 * Assemble character preview. Each tile uses its own palette (like the game renderer).
 * @param paletteLookup - maps palette index → 16 RGB entries
 */
export function assembleCharacter(
  gfxRom: Uint8Array,
  group: SpriteGroup,
  paletteLookup: Map<number, Array<[number, number, number]>> | Array<[number, number, number]>,
): ImageData {
  const { w, h } = group.bounds;
  const img = new ImageData(w, h);

  // Support both Map (multi-palette) and plain array (single palette, backward compat)
  const isMap = paletteLookup instanceof Map;

  // Draw back-to-front: CPS1 renders high OBJ indices first (background),
  // low indices last (foreground). Tiles array follows OBJ order, so reverse.
  for (let i = group.tiles.length - 1; i >= 0; i--) {
    const tile = group.tiles[i]!;
    const pal = isMap
      ? (paletteLookup as Map<number, Array<[number, number, number]>>).get(tile.palette) ?? []
      : paletteLookup as Array<[number, number, number]>;
    const pixels = readTile(gfxRom, tile.mappedCode, 16, 16, CHAR_SIZE_16);
    blitTile(img, pixels, tile.relX, tile.relY, tile.flipX, tile.flipY, pal);
  }

  return img;
}

function blitTile(
  img: ImageData,
  pixels: Uint8Array,
  dx: number,
  dy: number,
  flipX: boolean,
  flipY: boolean,
  palette: Array<[number, number, number]>,
): void {
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      const srcX = flipX ? 15 - px : px;
      const srcY = flipY ? 15 - py : py;
      const colorIdx = pixels[srcY * 16 + srcX]!;
      if (colorIdx === 15) continue; // transparent pen (CPS1 uses pen 15, not pen 0)

      const imgX = dx + px;
      const imgY = dy + py;
      if (imgX < 0 || imgX >= img.width || imgY < 0 || imgY >= img.height) continue;

      const [r, g, b] = palette[colorIdx] ?? [0, 0, 0];
      const di = (imgY * img.width + imgX) * 4;
      img.data[di] = r;
      img.data[di + 1] = g;
      img.data[di + 2] = b;
      img.data[di + 3] = 255;
    }
  }
}

