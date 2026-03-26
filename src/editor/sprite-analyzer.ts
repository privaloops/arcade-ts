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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single OBJ sprite entry parsed from the OBJ buffer. */
export interface ObjSprite {
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
  tiles: Array<{ relX: number; relY: number; mappedCode: number; flipX: boolean; flipY: boolean }>;
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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAR_SIZE_16 = 128;
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

    const mappedCode = gfxromBankMapper(GFXTYPE_SPRITES, code, mapperTable, bankSizes, bankBases);
    if (mappedCode === -1) continue;

    const screenX = (x & 0x1FF) - CPS_HBEND;
    const screenY = (y & 0x1FF) - CPS_VBEND;

    sprites.push({ index: i, screenX, screenY, rawCode: code, mappedCode, palette, flipX, flipY });
  }

  return sprites;
}

// ---------------------------------------------------------------------------
// Step 2: Group sprites into characters by palette + spatial adjacency
// ---------------------------------------------------------------------------

/**
 * Find all sprites that belong to the same character as the clicked sprite.
 * Groups by: same palette AND bounding boxes touch or overlap (within tolerance).
 */
export function groupCharacter(allSprites: ObjSprite[], clickedIndex: number): SpriteGroup | null {
  const clicked = allSprites.find(s => s.index === clickedIndex);
  if (!clicked) return null;

  const palette = clicked.palette;
  const samePalette = allSprites.filter(s => s.palette === palette);

  // Flood-fill: find all sprites connected to the clicked one
  const TOLERANCE = 2; // pixels gap tolerance for adjacency
  const inGroup = new Set<number>();
  const queue = [clicked];
  inGroup.add(clicked.index);

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const candidate of samePalette) {
      if (inGroup.has(candidate.index)) continue;
      // Check if bounding boxes touch (within tolerance)
      if (tilesAdjacent(current, candidate, TOLERANCE)) {
        inGroup.add(candidate.index);
        queue.push(candidate);
      }
    }
  }

  const grouped = samePalette.filter(s => inGroup.has(s.index));

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
  }));

  return {
    sprites: grouped,
    palette,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    tiles,
  };
}

// ---------------------------------------------------------------------------
// Step 2b: Track character across frames + capture poses
// ---------------------------------------------------------------------------

/**
 * Find the character group in the current frame that best matches
 * a previously identified character (by palette + closest center position).
 */
export function trackCharacter(
  video: CPS1Video,
  palette: number,
  prevCenterX: number,
  prevCenterY: number,
): SpriteGroup | null {
  const allSprites = readAllSprites(video);
  const samePalette = allSprites.filter(s => s.palette === palette);
  if (samePalette.length === 0) return null;

  // Build all connected groups for this palette
  const visited = new Set<number>();
  const groups: SpriteGroup[] = [];

  for (const sprite of samePalette) {
    if (visited.has(sprite.index)) continue;

    const group = groupCharacter(allSprites, sprite.index);
    if (!group) continue;

    for (const s of group.sprites) visited.add(s.index);
    groups.push(group);
  }

  if (groups.length === 0) return null;

  // Pick the group whose center is closest to the previous center
  let bestGroup: SpriteGroup | null = null;
  let bestDist = Infinity;

  for (const g of groups) {
    const cx = g.bounds.x + g.bounds.w / 2;
    const cy = g.bounds.y + g.bounds.h / 2;
    const dist = (cx - prevCenterX) ** 2 + (cy - prevCenterY) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestGroup = g;
    }
  }

  return bestGroup;
}

/**
 * Compute a hash string for a pose (sorted tile codes) for deduplication.
 */
export function poseHash(group: SpriteGroup): string {
  // Deduplicate by tile codes only — ignores position and flip
  // so left-facing and right-facing versions of the same pose match
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
  };
}

// ---------------------------------------------------------------------------
// Step 2c: Extract head tiles by frequency analysis across captured poses
// ---------------------------------------------------------------------------

export interface HeadTile {
  mappedCode: number;
  /** Average relative position across poses (relative to group top-left) */
  avgRelX: number;
  avgRelY: number;
}

export interface ExtractedHead {
  tiles: HeadTile[];
  /** Bounding box of the head tiles */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Preview image */
  preview: ImageData;
}

/**
 * Analyze all captured poses to find the "head" tiles:
 * tiles that appear in most poses AND are positioned in the upper region.
 *
 * @param minFrequency - minimum fraction of poses a tile must appear in (0-1, default 0.7)
 * @param topFraction - only consider tiles in the upper fraction of the sprite (default 0.45)
 */
export function extractHead(
  poses: CapturedPose[],
  gfxRom: Uint8Array,
  palette: Array<[number, number, number]>,
  minFrequency = 0.7,
  topFraction = 0.45,
): ExtractedHead | null {
  if (poses.length === 0) return null;

  // Count frequency of each tile code across all poses
  // and collect their relative positions
  const tileFreq = new Map<number, number>();
  const tilePositions = new Map<number, Array<{ relX: number; relY: number }>>();

  for (const pose of poses) {
    // Use a set to count each code once per pose
    const seenInPose = new Set<number>();
    for (const t of pose.tiles) {
      if (!seenInPose.has(t.mappedCode)) {
        seenInPose.add(t.mappedCode);
        tileFreq.set(t.mappedCode, (tileFreq.get(t.mappedCode) ?? 0) + 1);
      }
      let positions = tilePositions.get(t.mappedCode);
      if (!positions) {
        positions = [];
        tilePositions.set(t.mappedCode, positions);
      }
      positions.push({ relX: t.relX, relY: t.relY });
    }
  }

  const poseCount = poses.length;
  const freqThreshold = poseCount * minFrequency;

  // Find the average sprite height to determine "upper region"
  const avgH = poses.reduce((s, p) => s + p.h, 0) / poseCount;
  const maxY = avgH * topFraction;

  // Filter: high frequency + positioned in upper region
  const headTiles: HeadTile[] = [];

  for (const [code, freq] of tileFreq) {
    if (freq < freqThreshold) continue;

    const positions = tilePositions.get(code)!;
    const avgRelX = positions.reduce((s, p) => s + p.relX, 0) / positions.length;
    const avgRelY = positions.reduce((s, p) => s + p.relY, 0) / positions.length;

    // Must be in the upper portion
    if (avgRelY > maxY) continue;

    headTiles.push({ mappedCode: code, avgRelX, avgRelY });
  }

  if (headTiles.length === 0) return null;

  // Sort by position (top-left first)
  headTiles.sort((a, b) => a.avgRelY - b.avgRelY || a.avgRelX - b.avgRelX);

  // Compute bounding box of head tiles
  let minX = Infinity, minY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const t of headTiles) {
    if (t.avgRelX < minX) minX = t.avgRelX;
    if (t.avgRelY < minY) minY = t.avgRelY;
    if (t.avgRelX + 16 > bMaxX) bMaxX = t.avgRelX + 16;
    if (t.avgRelY + 16 > bMaxY) bMaxY = t.avgRelY + 16;
  }

  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const w = Math.ceil(bMaxX) - x;
  const h = Math.ceil(bMaxY) - y;

  // Build preview using the head tiles at their average positions
  const preview = new ImageData(w, h);
  for (const t of headTiles) {
    const pixels = readTile(gfxRom, t.mappedCode, 16, 16, CHAR_SIZE_16);
    blitTile(preview, pixels, Math.round(t.avgRelX) - x, Math.round(t.avgRelY) - y, false, false, palette);
  }

  return { tiles: headTiles, x, y, w, h, preview };
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

export function assembleCharacter(
  gfxRom: Uint8Array,
  group: SpriteGroup,
  palette: Array<[number, number, number]>,
): ImageData {
  const { w, h } = group.bounds;
  const img = new ImageData(w, h);

  for (const tile of group.tiles) {
    const pixels = readTile(gfxRom, tile.mappedCode, 16, 16, CHAR_SIZE_16);
    blitTile(img, pixels, tile.relX, tile.relY, tile.flipX, tile.flipY, palette);
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

