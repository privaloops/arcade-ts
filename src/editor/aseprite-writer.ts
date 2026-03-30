/**
 * Aseprite (.aseprite / .ase) file writer.
 *
 * Generates indexed 8bpp files with palette, multiple frames (one per pose),
 * and a User Data chunk containing a JSON manifest for ROM round-trip.
 *
 * Format spec: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 */

import pako from 'pako';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AsepriteFrame {
  /** Palette-indexed pixels, row-major, one byte per pixel. Length = width * height. */
  pixels: Uint8Array;
  /** Frame duration in ms. */
  duration?: number;
}

export interface AsepritePaletteEntry {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface AsepriteOptions {
  width: number;
  height: number;
  palette: AsepritePaletteEntry[];
  frames: AsepriteFrame[];
  /** Palette index of the transparent color (default 0). */
  transparentIndex?: number;
  /** Layer name (default "Sprite"). */
  layerName?: string;
  /** JSON manifest to embed in User Data. */
  manifest?: object;
}

// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------

class BufWriter {
  private chunks: Uint8Array[] = [];
  private buf = new ArrayBuffer(256);
  private view = new DataView(this.buf);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n > this.buf.byteLength) {
      this.flush();
      if (n > this.buf.byteLength) {
        this.buf = new ArrayBuffer(n);
        this.view = new DataView(this.buf);
      }
    }
  }

  private flush(): void {
    if (this.pos > 0) {
      this.chunks.push(new Uint8Array(this.buf.slice(0, this.pos)));
      this.pos = 0;
    }
  }

  byte(v: number): void { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; }
  word(v: number): void { this.ensure(2); this.view.setUint16(this.pos, v, true); this.pos += 2; }
  short(v: number): void { this.ensure(2); this.view.setInt16(this.pos, v, true); this.pos += 2; }
  dword(v: number): void { this.ensure(4); this.view.setUint32(this.pos, v, true); this.pos += 4; }
  long(v: number): void { this.ensure(4); this.view.setInt32(this.pos, v, true); this.pos += 4; }

  bytes(data: Uint8Array): void {
    this.flush();
    this.chunks.push(data);
  }

  string(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.word(encoded.length);
    this.bytes(encoded);
  }

  zeros(n: number): void {
    this.flush();
    this.chunks.push(new Uint8Array(n));
  }

  toUint8Array(): Uint8Array {
    this.flush();
    let total = 0;
    for (const c of this.chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) { out.set(c, offset); offset += c.length; }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Chunk builders
// ---------------------------------------------------------------------------

function buildChunk(type: number, data: Uint8Array): Uint8Array {
  // Chunk = DWORD size + WORD type + data
  const size = 6 + data.length;
  const w = new BufWriter();
  w.dword(size);
  w.word(type);
  w.bytes(data);
  return w.toUint8Array();
}

/** Palette chunk (0x2019) */
function buildPaletteChunk(palette: AsepritePaletteEntry[]): Uint8Array {
  const w = new BufWriter();
  const count = palette.length;
  w.dword(count);        // palette size
  w.dword(0);            // first color index
  w.dword(count - 1);    // last color index
  w.zeros(8);            // reserved
  for (const entry of palette) {
    w.word(0);            // flags (no name)
    w.byte(entry.r);
    w.byte(entry.g);
    w.byte(entry.b);
    w.byte(entry.a ?? 255);
  }
  return buildChunk(0x2019, w.toUint8Array());
}

/** Layer chunk (0x2004) */
function buildLayerChunk(name: string): Uint8Array {
  const w = new BufWriter();
  w.word(1);              // flags: visible
  w.word(0);              // layer type: normal
  w.word(0);              // child level
  w.word(0);              // default width (ignored)
  w.word(0);              // default height (ignored)
  w.word(0);              // blend mode: normal
  w.byte(255);            // opacity
  w.zeros(3);             // reserved
  w.string(name);
  return buildChunk(0x2004, w.toUint8Array());
}

/** Cel chunk (0x2005) — compressed image */
function buildCelChunk(
  layerIndex: number,
  width: number,
  height: number,
  pixels: Uint8Array,
): Uint8Array {
  const compressed = pako.deflate(pixels);
  const w = new BufWriter();
  w.word(layerIndex);     // layer index
  w.short(0);             // x position
  w.short(0);             // y position
  w.byte(255);            // opacity
  w.word(2);              // cel type: compressed image
  w.short(0);             // z-index
  w.zeros(5);             // reserved
  w.word(width);
  w.word(height);
  w.bytes(compressed);
  return buildChunk(0x2005, w.toUint8Array());
}

/** Tilemap Layer chunk (0x2004) — type=2 (tilemap), references a tileset */
function buildTilemapLayerChunk(name: string, tilesetIndex: number): Uint8Array {
  const w = new BufWriter();
  w.word(1);              // flags: visible
  w.word(2);              // layer type: tilemap
  w.word(0);              // child level
  w.word(0);              // default width (ignored)
  w.word(0);              // default height (ignored)
  w.word(0);              // blend mode: normal
  w.byte(255);            // opacity
  w.zeros(3);             // reserved
  w.string(name);
  w.dword(tilesetIndex);  // tileset index (extra field for tilemap layers)
  return buildChunk(0x2004, w.toUint8Array());
}

/** Tileset chunk (0x2023) — embedded tile images */
function buildTilesetChunk(
  tilesetId: number,
  tileW: number,
  tileH: number,
  tiles: Uint8Array[], // each tile = tileW*tileH bytes (indexed pixels)
): Uint8Array {
  // Stack all tiles vertically into one image, then compress
  const numTiles = tiles.length + 1; // +1 for empty tile 0
  const tileSize = tileW * tileH;
  const imageData = new Uint8Array(numTiles * tileSize);
  // Tile 0 = empty (already zeros)
  for (let i = 0; i < tiles.length; i++) {
    imageData.set(tiles[i]!, (i + 1) * tileSize);
  }
  const compressed = pako.deflate(imageData);

  const w = new BufWriter();
  w.dword(tilesetId);       // tileset ID
  w.dword(2 | 4);           // flags: tiles embedded (2) + tile 0 is empty (4)
  w.dword(numTiles);        // number of tiles (including empty tile 0)
  w.word(tileW);
  w.word(tileH);
  w.short(1);               // base index
  w.zeros(14);              // reserved
  w.string(`tileset_${tilesetId}`);
  // Compressed tileset image
  w.dword(compressed.length);
  w.bytes(compressed);
  return buildChunk(0x2023, w.toUint8Array());
}

/** Tilemap Cel chunk (0x2005) — cel type 3 (compressed tilemap) */
function buildTilemapCelChunk(
  layerIndex: number,
  widthInTiles: number,
  heightInTiles: number,
  tileIds: Uint32Array, // tile ID per cell (0 = empty)
): Uint8Array {
  // Compress tile data (DWORD per tile)
  const rawData = new Uint8Array(tileIds.buffer, tileIds.byteOffset, tileIds.byteLength);
  const compressed = pako.deflate(rawData);

  const w = new BufWriter();
  w.word(layerIndex);         // layer index
  w.short(0);                 // x position
  w.short(0);                 // y position
  w.byte(255);                // opacity
  w.word(3);                  // cel type: compressed tilemap
  w.short(0);                 // z-index
  w.zeros(5);                 // reserved
  w.word(widthInTiles);
  w.word(heightInTiles);
  w.word(32);                 // bits per tile
  w.dword(0x1FFFFFFF);       // tile ID bitmask
  w.dword(0x20000000);       // X flip bitmask
  w.dword(0x40000000);       // Y flip bitmask
  w.dword(0x80000000);       // diagonal flip bitmask
  w.zeros(10);                // reserved
  w.bytes(compressed);
  return buildChunk(0x2005, w.toUint8Array());
}

/** User Data chunk (0x2020) — text only */
function buildUserDataChunk(text: string): Uint8Array {
  const w = new BufWriter();
  w.dword(1);             // flags: has text
  w.string(text);
  return buildChunk(0x2020, w.toUint8Array());
}

/** Color Profile chunk (0x2007) — sRGB */
function buildColorProfileChunk(): Uint8Array {
  const w = new BufWriter();
  w.word(1);              // type: sRGB
  w.word(0);              // flags
  w.dword(0);             // fixed gamma
  w.zeros(8);             // reserved (ICC not needed for sRGB)
  return buildChunk(0x2007, w.toUint8Array());
}

// ---------------------------------------------------------------------------
// Frame builder
// ---------------------------------------------------------------------------

function buildFrame(chunks: Uint8Array[], duration: number): Uint8Array {
  let dataSize = 0;
  for (const c of chunks) dataSize += c.length;

  const frameSize = 16 + dataSize; // 16-byte frame header
  const w = new BufWriter();
  const numChunks = chunks.length;
  w.dword(frameSize);
  w.word(0xF1FA);          // magic
  w.word(numChunks <= 0xFFFF ? numChunks : 0xFFFF); // old chunk count
  w.word(duration);        // frame duration ms
  w.zeros(2);              // reserved
  w.dword(numChunks);      // new chunk count
  for (const c of chunks) w.bytes(c);
  return w.toUint8Array();
}

// ---------------------------------------------------------------------------
// Main writer
// ---------------------------------------------------------------------------

export function writeAseprite(opts: AsepriteOptions): Uint8Array {
  const {
    width, height, palette, frames,
    transparentIndex = 0,
    layerName = 'Sprite',
    manifest,
  } = opts;

  if (frames.length === 0) throw new Error('At least one frame required');

  // Build all frames
  const frameBuffers: Uint8Array[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const chunks: Uint8Array[] = [];

    if (i === 0) {
      // First frame: color profile + palette + layer + user data (manifest)
      chunks.push(buildColorProfileChunk());
      chunks.push(buildPaletteChunk(palette));
      chunks.push(buildLayerChunk(layerName));
      if (manifest) {
        // User data on the layer
        chunks.push(buildUserDataChunk(JSON.stringify(manifest)));
      }
    }

    // Cel for this frame
    chunks.push(buildCelChunk(0, width, height, frame.pixels));

    frameBuffers.push(buildFrame(chunks, frame.duration ?? 100));
  }

  // Assemble file
  let bodySize = 0;
  for (const fb of frameBuffers) bodySize += fb.length;
  const fileSize = 128 + bodySize;

  // Write 128-byte header
  const header = new BufWriter();
  header.dword(fileSize);
  header.word(0xA5E0);           // magic
  header.word(frames.length);
  header.word(width);
  header.word(height);
  header.word(8);                // color depth: indexed
  header.dword(1);               // flags: layer opacity valid
  header.word(100);              // speed (deprecated)
  header.dword(0);
  header.dword(0);
  header.byte(transparentIndex);
  header.zeros(3);               // padding
  header.word(palette.length);   // number of colors
  header.byte(1);                // pixel width
  header.byte(1);                // pixel height
  header.short(0);               // grid X
  header.short(0);               // grid Y
  header.word(16);               // grid width
  header.word(16);               // grid height
  header.zeros(84);              // reserved

  const headerBuf = header.toUint8Array();
  if (headerBuf.length !== 128) throw new Error(`Header size mismatch: ${headerBuf.length}`);

  // Final assembly
  const file = new Uint8Array(fileSize);
  file.set(headerBuf, 0);
  let offset = 128;
  for (const fb of frameBuffers) {
    file.set(fb, offset);
    offset += fb.length;
  }

  return file;
}

// ---------------------------------------------------------------------------
// Helper: trigger download in browser
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tilemap writer
// ---------------------------------------------------------------------------

export interface AsepriteTilemapOptions {
  /** Canvas width in pixels (= widthInTiles * tileW) */
  width: number;
  /** Canvas height in pixels (= heightInTiles * tileH) */
  height: number;
  tileW: number;
  tileH: number;
  palette: AsepritePaletteEntry[];
  /** Unique tiles (indexed pixels, tileW*tileH bytes each). Tile 0 = empty is implicit. */
  tiles: Uint8Array[];
  /** Tilemap grid: row-major, each value = 1-based tile index (0 = empty). Can include flip bits. */
  tilemap: Uint32Array;
  widthInTiles: number;
  heightInTiles: number;
  transparentIndex?: number;
  layerName?: string;
  manifest?: object;
}

export function writeAsepriteTilemap(opts: AsepriteTilemapOptions): Uint8Array {
  const {
    width, height, tileW, tileH, palette, tiles, tilemap,
    widthInTiles, heightInTiles,
    transparentIndex = 0,
    layerName = 'Tilemap',
    manifest,
  } = opts;

  const chunks: Uint8Array[] = [];

  // Color profile
  chunks.push(buildColorProfileChunk());
  // Palette
  chunks.push(buildPaletteChunk(palette));
  // Tileset (ID 0)
  chunks.push(buildTilesetChunk(0, tileW, tileH, tiles));
  // Tilemap layer (references tileset 0)
  chunks.push(buildTilemapLayerChunk(layerName, 0));
  // User data (manifest)
  if (manifest) {
    chunks.push(buildUserDataChunk(JSON.stringify(manifest)));
  }
  // Tilemap cel
  chunks.push(buildTilemapCelChunk(0, widthInTiles, heightInTiles, tilemap));

  // Single frame
  const frameBuffer = buildFrame(chunks, 0);

  // File header
  const fileSize = 128 + frameBuffer.length;
  const header = new BufWriter();
  header.dword(fileSize);
  header.word(0xA5E0);
  header.word(1);                // 1 frame
  header.word(width);
  header.word(height);
  header.word(8);                // indexed
  header.dword(1);               // flags
  header.word(0);                // speed
  header.dword(0);
  header.dword(0);
  header.byte(transparentIndex);
  header.zeros(3);
  header.word(palette.length);
  header.byte(1);                // pixel width
  header.byte(1);                // pixel height
  header.short(0);               // grid X
  header.short(0);               // grid Y
  header.word(tileW);            // grid width = tile width
  header.word(tileH);            // grid height = tile height
  header.zeros(84);

  const headerBuf = header.toUint8Array();
  const file = new Uint8Array(fileSize);
  file.set(headerBuf, 0);
  file.set(frameBuffer, 128);
  return file;
}

// ---------------------------------------------------------------------------
// Multi-layer tilemap writer
// ---------------------------------------------------------------------------

export interface AsepriteLayerDef {
  /** Layer name (e.g. "CPS1 #64") */
  name: string;
  /** Unique tiles for this layer (indexed pixels in mega-palette range). Tile 0 = empty is implicit. */
  tiles: Uint8Array[];
  /** Tilemap grid: row-major, 1-based tile index (0 = empty cell). Can include flip bits. */
  tilemap: Uint32Array;
}

export interface AsepriteMultiLayerTilemapOptions {
  width: number;
  height: number;
  tileW: number;
  tileH: number;
  palette: AsepritePaletteEntry[];
  /** Layers ordered bottom-to-top (first layer = backmost). */
  layers: AsepriteLayerDef[];
  widthInTiles: number;
  heightInTiles: number;
  transparentIndex?: number;
  manifest?: object;
}

export function writeAsepriteMultiLayerTilemap(opts: AsepriteMultiLayerTilemapOptions): Uint8Array {
  const {
    width, height, tileW, tileH, palette, layers,
    widthInTiles, heightInTiles,
    transparentIndex = 0,
    manifest,
  } = opts;

  const chunks: Uint8Array[] = [];

  // Color profile + palette (shared across all layers)
  chunks.push(buildColorProfileChunk());
  chunks.push(buildPaletteChunk(palette));

  // Tilesets — one per layer (must come before layers in the file)
  for (let i = 0; i < layers.length; i++) {
    chunks.push(buildTilesetChunk(i, tileW, tileH, layers[i]!.tiles));
  }

  // Layers + user data + cels
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    chunks.push(buildTilemapLayerChunk(layer.name, i));
    // Attach manifest as user data on the first layer only
    if (i === 0 && manifest) {
      chunks.push(buildUserDataChunk(JSON.stringify(manifest)));
    }
  }

  // Cels (one per layer, same order as layers)
  for (let i = 0; i < layers.length; i++) {
    chunks.push(buildTilemapCelChunk(i, widthInTiles, heightInTiles, layers[i]!.tilemap));
  }

  const frameBuffer = buildFrame(chunks, 0);

  // File header
  const fileSize = 128 + frameBuffer.length;
  const header = new BufWriter();
  header.dword(fileSize);
  header.word(0xA5E0);
  header.word(1);                // 1 frame
  header.word(width);
  header.word(height);
  header.word(8);                // indexed
  header.dword(1);               // flags
  header.word(0);                // speed
  header.dword(0);
  header.dword(0);
  header.byte(transparentIndex);
  header.zeros(3);
  header.word(palette.length);
  header.byte(1);                // pixel width
  header.byte(1);                // pixel height
  header.short(0);               // grid X
  header.short(0);               // grid Y
  header.word(tileW);            // grid width
  header.word(tileH);            // grid height
  header.zeros(84);

  const headerBuf = header.toUint8Array();
  const file = new Uint8Array(fileSize);
  file.set(headerBuf, 0);
  file.set(frameBuffer, 128);
  return file;
}

export function downloadAseprite(data: Uint8Array, filename: string): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
