/**
 * Tile Reference Counter — find how many VRAM entries reference a given
 * mapped tile code, and optionally duplicate a tile to a free GFX ROM slot.
 */

import {
  gfxromBankMapper,
  GFXTYPE_SPRITES,
  GFXTYPE_SCROLL1,
  GFXTYPE_SCROLL2,
  GFXTYPE_SCROLL3,
  readWord,
  type GfxRange,
} from '../video/cps1-video';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TileReference {
  source: 'obj-table' | 'scroll1' | 'scroll2' | 'scroll3';
  entryIndex: number;
  rawCode: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OBJ_SIZE = 0x0800;
const CHAR_SIZE_16 = 128;

// ---------------------------------------------------------------------------
// findTileReferences
// ---------------------------------------------------------------------------

/**
 * Count how many times a mapped tile code is referenced in VRAM.
 * Scans: OBJ table (sprites), Scroll 1/2/3 tilemaps.
 *
 * For sprites, also checks multi-tile sub-tile codes.
 */
export function findTileReferences(
  mappedTileCode: number,
  objBuffer: Uint8Array,
  vram: Uint8Array,
  cpsaRegs: Uint8Array,
  mapperTable: GfxRange[],
  bankSizes: number[],
  bankBases: number[],
): TileReference[] {
  const refs: TileReference[] = [];

  // --- Sprites (OBJ table) ---
  const maxEntries = OBJ_SIZE / 8;
  for (let i = 0; i < maxEntries; i++) {
    const off = i * 8;
    if (off + 7 >= OBJ_SIZE) break;

    const code = (objBuffer[off + 4]! << 8) | objBuffer[off + 5]!;
    const colour = (objBuffer[off + 6]! << 8) | objBuffer[off + 7]!;

    // End-of-table marker
    if ((colour & 0xFF00) === 0xFF00) break;

    const mappedBase = gfxromBankMapper(GFXTYPE_SPRITES, code, mapperTable, bankSizes, bankBases);
    if (mappedBase === -1) continue;

    const nx = (colour & 0xFF00) ? (((colour >> 8) & 0x0F) + 1) : 1;
    const ny = (colour & 0xFF00) ? (((colour >> 12) & 0x0F) + 1) : 1;
    const flipX = (colour >> 5) & 1;
    const flipY = (colour >> 6) & 1;

    for (let nys = 0; nys < ny; nys++) {
      for (let nxs = 0; nxs < nx; nxs++) {
        let tileCode: number;
        if (flipY) {
          if (flipX) {
            tileCode = (mappedBase & ~0x0F) + ((mappedBase + (nx - 1) - nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
          } else {
            tileCode = (mappedBase & ~0x0F) + ((mappedBase + nxs) & 0x0F) + 0x10 * (ny - 1 - nys);
          }
        } else {
          if (flipX) {
            tileCode = (mappedBase & ~0x0F) + ((mappedBase + (nx - 1) - nxs) & 0x0F) + 0x10 * nys;
          } else {
            tileCode = (mappedBase & ~0x0F) + ((mappedBase + nxs) & 0x0F) + 0x10 * nys;
          }
        }

        if (tileCode === mappedTileCode) {
          refs.push({ source: 'obj-table', entryIndex: i, rawCode: code });
        }
      }
    }
  }

  // --- Scroll layers ---
  // Scan scroll tilemaps for tile code references
  // Scroll 1: base from CPS-A reg 0x02, 4 bytes per entry (code word at +0)
  // Scroll 2: base from CPS-A reg 0x04
  // Scroll 3: base from CPS-A reg 0x06
  const scrollConfigs: { source: 'scroll1' | 'scroll2' | 'scroll3'; reg: number; gfxType: number; entries: number }[] = [
    { source: 'scroll1', reg: 0x02, gfxType: GFXTYPE_SCROLL1, entries: 0x1000 },
    { source: 'scroll2', reg: 0x04, gfxType: GFXTYPE_SCROLL2, entries: 0x1000 },
    { source: 'scroll3', reg: 0x06, gfxType: GFXTYPE_SCROLL3, entries: 0x400 },
  ];

  for (const cfg of scrollConfigs) {
    const regValue = readWord(cpsaRegs, cfg.reg);
    const base = (regValue * 256) & 0x3FFFF;
    if (base >= 0x30000) continue;

    for (let j = 0; j < cfg.entries; j++) {
      const entryOff = base + j * 4;
      if (entryOff + 3 >= 0x30000) break;

      const rawCode = readWord(vram, entryOff);
      const mapped = gfxromBankMapper(cfg.gfxType, rawCode, mapperTable, bankSizes, bankBases);
      if (mapped === mappedTileCode) {
        refs.push({ source: cfg.source, entryIndex: j, rawCode });
      }
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// findFreeTileSlot
// ---------------------------------------------------------------------------

/**
 * Find a free tile slot in the GFX ROM.
 * A "free" tile = all 128 bytes are 0x00 (fully transparent).
 */
export function findFreeTileSlot(
  graphicsRom: Uint8Array,
  tileSize: number,
  startFrom: number,
): number {
  const totalTiles = Math.floor(graphicsRom.length / tileSize);

  for (let t = startFrom; t < totalTiles; t++) {
    const base = t * tileSize;
    let allZero = true;
    for (let b = 0; b < tileSize; b++) {
      if (graphicsRom[base + b] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) return t;
  }

  return -1;
}

// ---------------------------------------------------------------------------
// duplicateTile
// ---------------------------------------------------------------------------

/**
 * Duplicate a tile to a free slot.
 * Copies tile bytes and returns the new tile code.
 * Does NOT update VRAM references (caller must do that).
 */
export function duplicateTile(
  graphicsRom: Uint8Array,
  originalMappedCode: number,
): number {
  const tileSize = CHAR_SIZE_16;
  const newCode = findFreeTileSlot(graphicsRom, tileSize, 0x100); // skip first 256 tiles (fonts)
  if (newCode === -1) return -1;

  const srcOffset = originalMappedCode * tileSize;
  const dstOffset = newCode * tileSize;
  graphicsRom.set(graphicsRom.subarray(srcOffset, srcOffset + tileSize), dstOffset);

  return newCode;
}
