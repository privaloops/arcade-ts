/**
 * Aseprite I/O — import/export .aseprite files for sprites and scroll tilemaps.
 *
 * Extracted from SpriteEditorUI to isolate file I/O from UI concerns.
 */

import type { Emulator } from '../emulator';
import type { SpriteEditor } from './sprite-editor';
import type { CapturedPose, SpriteGroup as SpriteGroupData } from './sprite-analyzer';
import type { ScrollSet } from './scroll-capture';
import type { LayerGroup } from './layer-model';
import type { AsepriteFile } from './aseprite-reader';
import { assembleCharacter } from './sprite-analyzer';
import { readPalette, writeColor } from './palette-editor';
import { readTile as readTileFn, writePixel as writePixelFn } from './tile-encoder';
import { writeAseprite, writeAsepriteTilemap, downloadAseprite, type AsepriteFrame, type AsepritePaletteEntry } from './aseprite-writer';
import { readAseprite } from './aseprite-reader';
import { scrollLayerName } from './scroll-capture';
import { createSpriteGroup } from './layer-model';
import { showToast } from '../ui/toast';
import { CHAR_SIZE_16 } from '../constants';

// ---------------------------------------------------------------------------
// Manifest types (embedded in .aseprite User Data as JSON)
// ---------------------------------------------------------------------------

export interface ManifestTileRef {
  address: string;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}

export interface SpriteManifest {
  game: string;
  character: string;
  palette: number;
  frameSize: { w: number; h: number };
  frames: Array<{ id: string; tiles: ManifestTileRef[] }>;
}

export interface ScrollTilesetEntry {
  idx: number;
  address: string;
  tileCode: number;
  paletteSlot: number;
}

export interface ScrollPaletteMapping {
  palette: number;
  slot: number;
  indexOffset: number;
}

export interface ScrollManifest {
  type: 'scroll_tilemap';
  game: string;
  layerId: number;
  layerName: string;
  palettes: ScrollPaletteMapping[];
  tileW: number;
  tileH: number;
  gridOrigin: { col: number; row: number };
  gridCols: number;
  gridRows: number;
  tileset: ScrollTilesetEntry[];
  grid: number[];
}

export type AsepriteManifest = SpriteManifest | ScrollManifest;

// ---------------------------------------------------------------------------
// Sprite export
// ---------------------------------------------------------------------------

/** Export all captured poses as a single .aseprite file with ROM manifest. */
export function exportSpriteAseprite(
  emulator: Emulator,
  editor: SpriteEditor,
  poses: CapturedPose[],
  palette: number,
): void {
  if (poses.length === 0) { showToast('No poses captured', false); return; }

  const gfxRom = editor.getGfxRom();
  if (!gfxRom) { showToast('No GFX ROM loaded', false); return; }
  const video = emulator.getVideo();
  if (!video) return;
  const bufs = emulator.getBusBuffers();
  const cps1Palette = readPalette(bufs.vram, video.getPaletteBase(), palette);

  // Use the first pose dimensions as the canvas size
  const pose0 = poses[0]!;
  const frameW = pose0.w;
  const frameH = pose0.h;

  // Build Aseprite palette from CPS1 palette
  const asePalette: AsepritePaletteEntry[] = cps1Palette.map(([r, g, b]) => ({
    r, g, b, a: 255,
  }));
  // CPS1 pen 15 = transparent
  if (asePalette[15]) asePalette[15] = { r: 0, g: 0, b: 0, a: 0 };

  // Build frames: one per captured pose
  const aseFrames: AsepriteFrame[] = [];
  const manifestFrames: Array<{ id: string; tiles: Array<{ address: string; x: number; y: number; flipX: boolean; flipY: boolean }> }> = [];

  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i]!;
    const pixels = new Uint8Array(frameW * frameH).fill(15);

    for (const tile of pose.tiles) {
      const tilePixels = readTileFn(gfxRom, tile.mappedCode);
      for (let ty = 0; ty < 16; ty++) {
        for (let tx = 0; tx < 16; tx++) {
          const srcX = tile.flipX ? 15 - tx : tx;
          const srcY = tile.flipY ? 15 - ty : ty;
          const palIdx = tilePixels[srcY * 16 + srcX]!;
          if (palIdx === 15) continue;
          const destX = tile.relX + tx;
          const destY = tile.relY + ty;
          if (destX >= 0 && destX < frameW && destY >= 0 && destY < frameH) {
            pixels[destY * frameW + destX] = palIdx;
          }
        }
      }
    }

    aseFrames.push({ pixels, duration: 100 });

    manifestFrames.push({
      id: `pose_${i}`,
      tiles: pose.tiles.map(t => ({
        address: '0x' + (t.mappedCode * 128).toString(16).toUpperCase(),
        x: t.relX,
        y: t.relY,
        flipX: t.flipX,
        flipY: t.flipY,
      })),
    });
  }

  const manifest: SpriteManifest = {
    game: emulator.getGameName() || 'unknown',
    character: `palette_${palette}`,
    palette,
    frameSize: { w: frameW, h: frameH },
    frames: manifestFrames,
  };

  const data = writeAseprite({
    width: frameW,
    height: frameH,
    palette: asePalette,
    frames: aseFrames,
    transparentIndex: 15,
    layerName: manifest.character,
    manifest,
  });

  const filename = `${manifest.game}_${manifest.character}_${poses.length}poses.aseprite`;
  downloadAseprite(data, filename);
  showToast(`Exported ${poses.length} poses to ${filename}`, true);
}

// ---------------------------------------------------------------------------
// Scroll export
// ---------------------------------------------------------------------------

/** Export a single scroll set as Aseprite tilemap (16 colors, 1 CPS1 palette). */
export function exportScrollAseprite(
  emulator: Emulator,
  editor: SpriteEditor,
  set: ScrollSet,
): void {
  const gfxRom = editor.getGfxRom();
  if (!gfxRom) { showToast('No GFX ROM loaded', false); return; }
  const video = emulator.getVideo();
  if (!video) return;
  const bufs = emulator.getBusBuffers();

  const { tileW, tileH, layerId, palette: palIdx } = set;

  // Read the 16-color CPS1 palette
  const colors = readPalette(bufs.vram, video.getPaletteBase(), palIdx);
  const asePalette: AsepritePaletteEntry[] = [];
  for (let c = 0; c < 16; c++) {
    const [r, g, b] = colors[c] ?? [0, 0, 0];
    if (c === 15) {
      asePalette.push({ r: 0, g: 0, b: 0, a: 0 });
    } else {
      asePalette.push({ r, g, b, a: 255 });
    }
  }

  // Bounding box
  let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
  for (const tile of set.tiles) {
    if (tile.tileCol < minCol) minCol = tile.tileCol;
    if (tile.tileRow < minRow) minRow = tile.tileRow;
    if (tile.tileCol > maxCol) maxCol = tile.tileCol;
    if (tile.tileRow > maxRow) maxRow = tile.tileRow;
  }

  const gridCols = maxCol - minCol + 1;
  const gridRows = maxRow - minRow + 1;
  const sheetW = gridCols * tileW;
  const sheetH = gridRows * tileH;

  // Build deduplicated tileset + tilemap
  const gridMap: number[] = new Array(gridCols * gridRows).fill(-1);
  const tilesetMap = new Map<number, number>();
  const tilesetPixels: Uint8Array[] = [];
  const tilemap = new Uint32Array(gridCols * gridRows);

  const tilesetManifest: Array<{ idx: number; address: string; tileCode: number; paletteSlot: number }> = [];

  for (const tile of set.tiles) {
    let tileIdx = tilesetMap.get(tile.tileCode);

    if (tileIdx === undefined) {
      const rawPixels = readTileFn(gfxRom, tile.tileCode, tile.tileW, tile.tileH, tile.charSize);
      tilesetPixels.push(rawPixels);
      tileIdx = tilesetPixels.length; // 1-based
      tilesetMap.set(tile.tileCode, tileIdx);
      tilesetManifest.push({
        idx: tileIdx,
        address: '0x' + (tile.tileCode * tile.charSize).toString(16).toUpperCase(),
        tileCode: tile.tileCode,
        paletteSlot: 0,
      });
    }

    const gx = tile.tileCol - minCol;
    const gy = tile.tileRow - minRow;
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridRows) {
      gridMap[gy * gridCols + gx] = tile.tileCode;
      let val = tileIdx;
      if (tile.flipX) val |= 0x20000000;
      if (tile.flipY) val |= 0x40000000;
      tilemap[gy * gridCols + gx] = val;
    }
  }

  const manifest: ScrollManifest = {
    type: 'scroll_tilemap',
    game: emulator.getGameName() || 'unknown',
    layerId,
    layerName: scrollLayerName(layerId),
    palettes: [{ palette: palIdx, slot: 0, indexOffset: 0 }],
    tileW, tileH,
    gridOrigin: { col: minCol, row: minRow },
    gridCols, gridRows,
    tileset: tilesetManifest,
    grid: gridMap,
  };

  const data = writeAsepriteTilemap({
    width: sheetW, height: sheetH,
    tileW, tileH,
    palette: asePalette,
    tiles: tilesetPixels,
    tilemap,
    widthInTiles: gridCols, heightInTiles: gridRows,
    transparentIndex: 15,
    layerName: `${scrollLayerName(layerId)} pal#${palIdx}`,
    manifest,
  });

  const filename = `${manifest.game}_scroll${layerId}_pal${palIdx}_${tilesetPixels.length}tiles.aseprite`;
  downloadAseprite(data, filename);
  showToast(`Exported ${tilesetPixels.length} tiles, palette #${palIdx} (16 colors), ${gridCols}×${gridRows} grid`, true);
}

// ---------------------------------------------------------------------------
// Scroll tilemap import
// ---------------------------------------------------------------------------

/** Import a scroll tilemap from an .aseprite file back into GFX ROM. */
export function importScrollTilemap(
  emulator: Emulator,
  ase: AsepriteFile,
  manifest: ScrollManifest,
  gfxRom: Uint8Array,
): void {
  const tileset = ase.tilesets[0];
  if (!tileset || tileset.tiles.length === 0) {
    showToast('No tileset found in .aseprite file', false);
    return;
  }

  const { tileW, tileH } = manifest;
  const palettes = manifest.palettes;
  if (!palettes?.length) {
    showToast('No palette mapping in manifest', false);
    return;
  }

  // Build reverse map: mega-palette index → local 0-15 index
  const indexToLocal = (megaIdx: number): number => {
    for (const p of palettes) {
      if (megaIdx >= p.indexOffset && megaIdx < p.indexOffset + 16) {
        return megaIdx - p.indexOffset;
      }
    }
    return megaIdx;
  };

  const tilesetEntries = manifest.tileset;
  if (!tilesetEntries?.length) {
    showToast('No tileset mapping in manifest', false);
    return;
  }

  const tilesetToRom = new Map<number, { tileCode: number; charSize: number }>();
  const charSize = (tileW * tileH) / 2;
  for (const entry of tilesetEntries) {
    tilesetToRom.set(entry.idx, { tileCode: entry.tileCode, charSize });
  }

  let tilesWritten = 0;

  if (ase.tilemap && manifest.grid) {
    const grid = manifest.grid as number[];
    const { widthInTiles, heightInTiles, data: tmData } = ase.tilemap;
    const gridCols = manifest.gridCols as number;
    const gridRows = manifest.gridRows as number;

    const codeToTileIdx = new Map<number, number>();
    const origTilesetIdx = new Map<number, number>();
    for (const entry of tilesetEntries) {
      origTilesetIdx.set(entry.tileCode, entry.idx);
    }

    for (let gy = 0; gy < Math.min(gridRows, heightInTiles); gy++) {
      for (let gx = 0; gx < Math.min(gridCols, widthInTiles); gx++) {
        const origCode = grid[gy * gridCols + gx];
        if (origCode === undefined || origCode < 0) continue;

        const tmVal = tmData[gy * widthInTiles + gx]!;
        const currentTileIdx = tmVal & 0x1FFFFFFF;
        if (currentTileIdx === 0 || currentTileIdx >= tileset.tiles.length) continue;

        const origIdx = origTilesetIdx.get(origCode);
        const existing = codeToTileIdx.get(origCode);

        if (existing === undefined) {
          codeToTileIdx.set(origCode, currentTileIdx);
        } else if (currentTileIdx !== origIdx && existing === origIdx) {
          codeToTileIdx.set(origCode, currentTileIdx);
        }
      }
    }

    for (const [origCode, tileIdx] of codeToTileIdx) {
      const tilePixels = tileset.tiles[tileIdx];
      if (!tilePixels) continue;
      for (let ty = 0; ty < tileH; ty++) {
        for (let tx = 0; tx < tileW; tx++) {
          const megaIdx = tilePixels[ty * tileW + tx]!;
          const localIdx = indexToLocal(megaIdx);
          writePixelFn(gfxRom, origCode, tx, ty, localIdx, charSize);
        }
      }
      tilesWritten++;
    }
  } else {
    for (const [tsIdx, romInfo] of tilesetToRom) {
      if (tsIdx >= tileset.tiles.length) continue;
      const tilePixels = tileset.tiles[tsIdx]!;
      for (let ty = 0; ty < tileH; ty++) {
        for (let tx = 0; tx < tileW; tx++) {
          const megaIdx = tilePixels[ty * tileW + tx]!;
          const localIdx = indexToLocal(megaIdx);
          writePixelFn(gfxRom, romInfo.tileCode, tx, ty, localIdx, charSize);
        }
      }
      tilesWritten++;
    }
  }

  // Sync palettes if modified in Aseprite
  let colorsChanged = 0;
  if (ase.palette.length > 0) {
    const video = emulator.getVideo();
    const bufs2 = emulator.getBusBuffers();
    if (video && bufs2) {
      const palBase = video.getPaletteBase();
      for (const palInfo of palettes) {
        const cps1Pal = readPalette(bufs2.vram, palBase, palInfo.palette);
        for (let c = 0; c < 16; c++) {
          const megaIdx = palInfo.indexOffset + c;
          if (megaIdx >= ase.palette.length) continue;
          const ap = ase.palette[megaIdx]!;
          const [or, og, ob] = cps1Pal[c] ?? [0, 0, 0];
          if (ap.r !== or || ap.g !== og || ap.b !== ob) {
            writeColor(bufs2.vram, palBase, palInfo.palette, c, ap.r, ap.g, ap.b);
            colorsChanged++;
          }
        }
      }
    }
  }
  emulator.rerender();
  emulator.getRomStore()?.onModified?.();
  const palMsg = colorsChanged > 0 ? `, ${colorsChanged} palette colors updated` : '';
  showToast(`Scroll import: ${tilesWritten} unique tiles written to ROM${palMsg}`, true);
}

// ---------------------------------------------------------------------------
// Full Aseprite import (sprites + scroll routing)
// ---------------------------------------------------------------------------

/**
 * Open a file dialog and import an .aseprite file.
 * Routes scroll_tilemap manifests to importScrollTilemap.
 * For sprite manifests, writes tiles to GFX ROM and creates/updates layer groups.
 */
export function importAsepriteFile(
  emulator: Emulator,
  editor: SpriteEditor,
  layerGroups: LayerGroup[],
  onRefresh: () => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.aseprite,.ase';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const ase = readAseprite(buffer);

      if (!ase.manifest) {
        showToast('No ROM manifest found in .aseprite file', false);
        return;
      }

      const raw = ase.manifest;
      const gfxRom = editor.getGfxRom();
      if (!gfxRom) { showToast('No GFX ROM loaded', false); return; }

      // Route to scroll import
      if (raw.type === 'scroll_tilemap') {
        importScrollTilemap(emulator, ase, raw as unknown as ScrollManifest, gfxRom);
        return;
      }

      const manifest = raw as unknown as SpriteManifest;

      let tilesWritten = 0;
      let framesWritten = 0;

      for (let f = 0; f < ase.frames.length; f++) {
        const frame = ase.frames[f];
        if (!frame?.pixels) continue;

        const manifestFrame = manifest.frames?.[f];
        if (!manifestFrame?.tiles) continue;

        for (const tileInfo of manifestFrame.tiles) {
          const romAddr = typeof tileInfo.address === 'string'
            ? parseInt(tileInfo.address, 16)
            : tileInfo.address;
          const tileCode = Math.floor(romAddr / CHAR_SIZE_16);

          for (let ty = 0; ty < 16; ty++) {
            for (let tx = 0; tx < 16; tx++) {
              const srcX = tileInfo.flipX ? 15 - tx : tx;
              const srcY = tileInfo.flipY ? 15 - ty : ty;
              const frameX = tileInfo.x + tx;
              const frameY = tileInfo.y + ty;

              if (frameX < 0 || frameX >= ase.width || frameY < 0 || frameY >= ase.height) continue;

              const palIdx = frame.pixels[frameY * ase.width + frameX]!;
              writePixelFn(gfxRom, tileCode, srcX, srcY, palIdx);
            }
          }
          tilesWritten++;
        }
        framesWritten++;
      }

      // Force re-render + trigger auto-save
      emulator.rerender();
      emulator.getRomStore()?.onModified?.();

      // Create sprite set from imported frames
      if (manifest.frames?.length > 0 && manifest.palette !== undefined) {
        const poses: CapturedPose[] = [];
        const video = emulator.getVideo();
        const bufs = emulator.getBusBuffers();
        if (video && bufs) {
          const palette = readPalette(bufs.vram, video.getPaletteBase(), manifest.palette);

          for (let f = 0; f < manifest.frames.length; f++) {
            const mf = manifest.frames[f];
            if (!mf?.tiles) continue;

            const tiles = mf.tiles.map((t: ManifestTileRef) => ({
              relX: t.x,
              relY: t.y,
              mappedCode: Math.floor(parseInt(t.address, 16) / CHAR_SIZE_16),
              flipX: t.flipX,
              flipY: t.flipY,
            }));

            const w = manifest.frameSize?.w ?? ase.width;
            const h = manifest.frameSize?.h ?? ase.height;

            const sprGroup: SpriteGroupData = {
              sprites: [], palette: manifest.palette,
              bounds: { x: 0, y: 0, w, h },
              tiles,
            };
            const preview = assembleCharacter(gfxRom, sprGroup, palette);

            poses.push({
              tileHash: mf.id ?? `imported_${f}`,
              tiles,
              w, h,
              palette: manifest.palette,
              preview,
            });
          }

          if (poses.length > 0) {
            // Check for existing sprite set with same palette + tileHashes → replace
            const importHashes = new Set(poses.map(p => p.tileHash));
            const existingIdx = layerGroups.findIndex(g => {
              const sc = g.spriteCapture;
              if (!sc || sc.palette !== manifest.palette) return false;
              if (sc.poses.length !== poses.length) return false;
              return sc.poses.every(p => importHashes.has(p.tileHash));
            });

            if (existingIdx >= 0) {
              const existing = layerGroups[existingIdx]!;
              existing.spriteCapture!.poses = poses;
              showToast(`Updated existing sprite set (palette ${manifest.palette})`, true);
            } else {
              // Inline restorePoses logic
              const byPalette = new Map<number, CapturedPose[]>();
              for (const pose of poses) {
                const list = byPalette.get(pose.palette) ?? [];
                list.push(pose);
                byPalette.set(pose.palette, list);
              }
              for (const [pal, groupPoses] of byPalette) {
                layerGroups.push(createSpriteGroup(`Restored (pal ${pal})`, groupPoses, pal));
              }
            }
            onRefresh();
          }
        }
      }

      // Sync palette if modified in Aseprite
      if (manifest.palette !== undefined && ase.palette.length > 0) {
        const video = emulator.getVideo();
        const bufs = emulator.getBusBuffers();
        if (video && bufs) {
          const palBase = video.getPaletteBase();
          const palIdx = manifest.palette as number;
          const origPal = readPalette(bufs.vram, palBase, palIdx);
          let colorsChanged = 0;
          for (let c = 0; c < 16 && c < ase.palette.length; c++) {
            const ap = ase.palette[c]!;
            const [or, og, ob] = origPal[c] ?? [0, 0, 0];
            if (ap.r !== or || ap.g !== og || ap.b !== ob) {
              writeColor(bufs.vram, palBase, palIdx, c, ap.r, ap.g, ap.b);
              colorsChanged++;
            }
          }
          if (colorsChanged > 0) {
            emulator.rerender();
            showToast(`Imported ${framesWritten} frames, ${tilesWritten} tiles, ${colorsChanged} palette colors updated`, true);
          } else {
            showToast(`Imported ${framesWritten} frames, ${tilesWritten} tiles written to ROM`, true);
          }
        } else {
          showToast(`Imported ${framesWritten} frames, ${tilesWritten} tiles written to ROM`, true);
        }
      } else {
        showToast(`Imported ${framesWritten} frames, ${tilesWritten} tiles written to ROM`, true);
      }
    } catch (err) {
      showToast(`Import failed: ${(err as Error).message}`, false);
    }
  };
  input.click();
}
