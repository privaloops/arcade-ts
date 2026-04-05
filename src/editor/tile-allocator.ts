/**
 * Tile Allocator — find and allocate free tiles in the GFX ROM.
 *
 * CPS1 tiles are shared: the same tile code can appear at multiple screen positions.
 * To modify a tile without affecting other positions, we copy it to a free slot
 * and update the tilemap entry to point to the copy.
 *
 * The tilemap stores RAW codes. The GFX ROM is indexed by MAPPED codes.
 * The bank mapper transforms raw → mapped. We build a reverse table to go mapped → raw.
 */

import { gfxromBankMapper } from '../video/cps1-video';
import type { CPS1Video } from '../video/cps1-video';

// ---------------------------------------------------------------------------
// Free tile scanner
// ---------------------------------------------------------------------------

function isTileEmpty(gfxRom: Uint8Array, mappedCode: number, charSize: number): boolean {
  const offset = mappedCode * charSize;
  if (offset + charSize > gfxRom.length) return false;
  for (let i = 0; i < charSize; i++) {
    if (gfxRom[offset + i] !== 0) return false;
  }
  return true;
}

/**
 * Get total and free tile counts for display.
 */
export function getTileStats(gfxRom: Uint8Array, charSize: number): { total: number; free: number } {
  const total = Math.floor(gfxRom.length / charSize);
  let free = 0;
  for (let code = 0; code < total; code++) {
    if (isTileEmpty(gfxRom, code, charSize)) free++;
  }
  return { total, free };
}

// ---------------------------------------------------------------------------
// Tile Allocator with reverse mapping
// ---------------------------------------------------------------------------

export class TileAllocator {
  private readonly gfxRom: Uint8Array;
  private readonly charSize: number;
  private readonly reverseMap: Map<number, number>;
  private freePool: number[]; // mapped codes of free tiles

  constructor(gfxRom: Uint8Array, charSize: number, reverseMap: Map<number, number>) {
    this.gfxRom = gfxRom;
    this.charSize = charSize;
    this.reverseMap = reverseMap;

    // Build free pool: mapped codes that are empty AND have a reverse mapping
    this.freePool = [];
    const total = Math.floor(gfxRom.length / charSize);
    for (let mapped = 0; mapped < total; mapped++) {
      if (reverseMap.has(mapped) && isTileEmpty(gfxRom, mapped, charSize)) {
        this.freePool.push(mapped);
      }
    }
  }

  get freeCount(): number { return this.freePool.length; }
  get totalCount(): number { return Math.floor(this.gfxRom.length / this.charSize); }

  /**
   * Allocate a free tile by copying an existing tile's data into it.
   * Returns { mappedCode, rawCode } or null if no free tiles available.
   */
  allocateAndCopy(sourceMappedCode: number): { mapped: number; raw: number } | null {
    if (this.freePool.length === 0) return null;

    const newMapped = this.freePool.pop()!;
    const newRaw = this.reverseMap.get(newMapped);
    if (newRaw === undefined) return null;

    // Copy tile data
    const srcOffset = sourceMappedCode * this.charSize;
    const dstOffset = newMapped * this.charSize;
    this.gfxRom.set(
      this.gfxRom.subarray(srcOffset, srcOffset + this.charSize),
      dstOffset,
    );

    return { mapped: newMapped, raw: newRaw };
  }
}

// ---------------------------------------------------------------------------
// Tilemap patching
// ---------------------------------------------------------------------------

/**
 * Update a tilemap entry in VRAM to point to a new raw tile code.
 */
export function patchTilemapCode(
  vram: Uint8Array,
  tilemapOffset: number,
  newRawCode: number,
): void {
  vram[tilemapOffset] = (newRawCode >> 8) & 0xFF;
  vram[tilemapOffset + 1] = newRawCode & 0xFF;
}

/**
 * Update the palette index of a tilemap entry in VRAM.
 */
export function patchTilemapPalette(
  vram: Uint8Array,
  tilemapOffset: number,
  newPaletteLocal: number,
): void {
  const attrOff = tilemapOffset + 2;
  const oldAttribs = (vram[attrOff]! << 8) | vram[attrOff + 1]!;
  const newAttribs = (oldAttribs & 0xFFE0) | (newPaletteLocal & 0x1F);
  vram[attrOff] = (newAttribs >> 8) & 0xFF;
  vram[attrOff + 1] = newAttribs & 0xFF;
}
