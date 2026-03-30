/**
 * Aseprite (.aseprite / .ase) file reader — minimal, reads only what we need:
 * - Header (dimensions, color depth, transparent index, frame count)
 * - Palette (from 0x2019 chunk)
 * - Cels (indexed pixel data from 0x2005 chunks)
 * - User Data (JSON manifest from 0x2020 chunk)
 *
 * Format spec: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 */

import pako from 'pako';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsepriteTilesetData {
  id: number;
  tileW: number;
  tileH: number;
  numTiles: number;
  /** All tile pixel data (including empty tile 0). Each tile = tileW * tileH bytes. */
  tiles: Uint8Array[];
}

export interface AsepriteTilemapData {
  layerIndex: number;
  widthInTiles: number;
  heightInTiles: number;
  data: Uint32Array;
}

export interface AsepriteFile {
  width: number;
  height: number;
  colorDepth: number;
  transparentIndex: number;
  numFrames: number;
  palette: Array<{ r: number; g: number; b: number; a: number }>;
  frames: AsepriteFrameData[];
  /** Tilesets found in the file. */
  tilesets: AsepriteTilesetData[];
  /** First tilemap data (backward compat). */
  tilemap: { widthInTiles: number; heightInTiles: number; data: Uint32Array } | null;
  /** All tilemap cels, one per tilemap layer. */
  tilemaps: AsepriteTilemapData[];
  /** Layer definitions in order (index = layer index). */
  layerDefs: Array<{ name: string; type: number; tilesetIndex?: number | undefined }>;
  /** First user data text found (our JSON manifest). */
  userDataText: string | null;
  manifest: Record<string, unknown> | null;
}

export interface AsepriteFrameData {
  duration: number;
  /** Indexed pixel data (width * height bytes). Null if no cel in this frame. */
  pixels: Uint8Array | null;
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export function readAseprite(buffer: ArrayBuffer): AsepriteFile {
  const view = new DataView(buffer);
  let pos = 0;

  function readByte(): number { const v = view.getUint8(pos); pos += 1; return v; }
  function readWord(): number { const v = view.getUint16(pos, true); pos += 2; return v; }
  function readShort(): number { const v = view.getInt16(pos, true); pos += 2; return v; }
  function readDword(): number { const v = view.getUint32(pos, true); pos += 4; return v; }
  function readString(): string {
    const len = readWord();
    const bytes = new Uint8Array(buffer, pos, len);
    pos += len;
    return new TextDecoder().decode(bytes);
  }
  function skip(n: number): void { pos += n; }

  // -- File Header (128 bytes) --
  const fileSize = readDword();
  const magic = readWord();
  if (magic !== 0xA5E0) throw new Error(`Invalid Aseprite magic: 0x${magic.toString(16)}`);

  const numFrames = readWord();
  const width = readWord();
  const height = readWord();
  const colorDepth = readWord();
  skip(4); // flags
  skip(2); // speed (deprecated)
  skip(8); // reserved
  const transparentIndex = readByte();
  skip(3 + 2 + 2 + 4 + 84); // padding + numColors + pixel ratio + grid + reserved
  // pos should be 128 now

  pos = 128;

  const result: AsepriteFile = {
    width, height, colorDepth, transparentIndex, numFrames,
    palette: [],
    frames: [],
    tilesets: [],
    tilemap: null,
    tilemaps: [],
    layerDefs: [],
    userDataText: null,
    manifest: null,
  };

  // -- Frames --
  for (let f = 0; f < numFrames; f++) {
    const frameStart = pos;
    const frameSize = readDword();
    const frameMagic = readWord();
    if (frameMagic !== 0xF1FA) throw new Error(`Invalid frame magic at offset ${frameStart}: 0x${frameMagic.toString(16)}`);

    const oldChunkCount = readWord();
    const duration = readWord();
    skip(2); // reserved
    const newChunkCount = readDword();
    const chunkCount = newChunkCount > 0 ? newChunkCount : oldChunkCount;

    let framePixels: Uint8Array | null = null;

    for (let c = 0; c < chunkCount; c++) {
      const chunkStart = pos;
      const chunkSize = readDword();
      const chunkType = readWord();
      const chunkDataEnd = chunkStart + chunkSize;

      switch (chunkType) {
        case 0x2019: { // New Palette
          const palSize = readDword();
          const firstIdx = readDword();
          const lastIdx = readDword();
          skip(8); // reserved
          for (let i = firstIdx; i <= lastIdx; i++) {
            const flags = readWord();
            const r = readByte();
            const g = readByte();
            const b = readByte();
            const a = readByte();
            if (i >= result.palette.length) {
              // Extend palette
              while (result.palette.length <= i) {
                result.palette.push({ r: 0, g: 0, b: 0, a: 255 });
              }
            }
            result.palette[i] = { r, g, b, a };
            if (flags & 1) readString(); // has name, skip it
          }
          break;
        }

        case 0x2005: { // Cel
          const layerIndex = readWord();
          const celX = readShort();
          const celY = readShort();
          const opacity = readByte();
          const celType = readWord();
          const zIndex = readShort();
          skip(5); // reserved

          if (celType === 2) {
            // Compressed image
            const celW = readWord();
            const celH = readWord();
            const compressedLen = chunkDataEnd - pos;
            const compressed = new Uint8Array(buffer, pos, compressedLen);
            const raw = pako.inflate(compressed);

            // Place cel pixels into frame-sized buffer
            framePixels = new Uint8Array(width * height).fill(transparentIndex);
            for (let y = 0; y < celH; y++) {
              for (let x = 0; x < celW; x++) {
                const destX = celX + x;
                const destY = celY + y;
                if (destX >= 0 && destX < width && destY >= 0 && destY < height) {
                  framePixels[destY * width + destX] = raw[y * celW + x]!;
                }
              }
            }
          } else if (celType === 1) {
            // Linked cel — reference another frame
            const linkedFrame = readWord();
            if (linkedFrame < result.frames.length) {
              framePixels = result.frames[linkedFrame]!.pixels;
            }
          } else if (celType === 3) {
            // Compressed tilemap
            const tmW = readWord();  // width in tiles
            const tmH = readWord();  // height in tiles
            const bitsPerTile = readWord(); // 32
            skip(4 + 4 + 4 + 4); // tile ID mask, X flip mask, Y flip mask, D flip mask
            skip(10); // reserved
            const compLen = chunkDataEnd - pos;
            const compData = new Uint8Array(buffer, pos, compLen);
            const rawTm = pako.inflate(compData);
            // Convert to Uint32Array
            const tmData = new Uint32Array(tmW * tmH);
            const tmView = new DataView(rawTm.buffer, rawTm.byteOffset, rawTm.byteLength);
            for (let i = 0; i < tmW * tmH; i++) {
              tmData[i] = tmView.getUint32(i * 4, true);
            }
            const tmEntry = { layerIndex, widthInTiles: tmW, heightInTiles: tmH, data: tmData };
            if (!result.tilemap) {
              result.tilemap = { widthInTiles: tmW, heightInTiles: tmH, data: tmData };
            }
            result.tilemaps.push(tmEntry);
          }
          break;
        }

        case 0x2004: { // Layer
          const layerFlags = readWord();
          const layerType = readWord();
          const childLevel = readWord();
          skip(2); // default width
          skip(2); // default height
          skip(2); // blend mode
          skip(1); // opacity
          skip(3); // reserved
          const layerName = readString();
          let tilesetIdx: number | undefined;
          if (layerType === 2) { // tilemap layer — has tileset index
            tilesetIdx = readDword();
          }
          result.layerDefs.push({ name: layerName, type: layerType, tilesetIndex: tilesetIdx });
          break;
        }

        case 0x2023: { // Tileset
          const tilesetId = readDword();
          const tsFlags = readDword();
          const numTiles = readDword();
          const tsTileW = readWord();
          const tsTileH = readWord();
          skip(2); // base index
          skip(14); // reserved
          readString(); // tileset name

          const tiles: Uint8Array[] = [];
          if (tsFlags & 2) { // embedded tiles
            const compLen = readDword();
            const compData = new Uint8Array(buffer, pos, compLen);
            const rawData = pako.inflate(compData);
            const tileSize = tsTileW * tsTileH;
            for (let t = 0; t < numTiles; t++) {
              tiles.push(rawData.slice(t * tileSize, (t + 1) * tileSize));
            }
          }

          result.tilesets.push({ id: tilesetId, tileW: tsTileW, tileH: tsTileH, numTiles, tiles });
          break;
        }

        case 0x2020: { // User Data
          const flags = readDword();
          if (flags & 1) { // has text
            const text = readString();
            if (!result.userDataText) {
              result.userDataText = text;
              try {
                result.manifest = JSON.parse(text);
              } catch { /* not JSON */ }
            }
          }
          break;
        }

        // Skip all other chunk types
        default:
          break;
      }

      // Jump to end of chunk
      pos = chunkDataEnd;
    }

    result.frames.push({ duration, pixels: framePixels });

    // Jump to end of frame (in case we miscounted)
    pos = frameStart + frameSize;
  }

  return result;
}
