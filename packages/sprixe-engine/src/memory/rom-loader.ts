/**
 * CPS1 ROM Loader
 *
 * Loads MAME-format ROM sets from ZIP files.
 * Identifies the game by filenames, assembles program/graphics/audio/OKI ROMs,
 * and performs CPS1 graphics interleaving.
 */

import { GAME_DEFS } from './game-defs';
import type { GameDef, ProgramDef, GraphicsDef, GfxBankDef, ProgramRomEntry, ProgramWordSwapEntry, CpsBConfig, GfxMapperConfig } from './game-defs';
import { extractZip, buildFileMap } from './rom-utils';
import type { RomFileEntry } from './rom-utils';

export type { CpsBConfig, GfxMapperConfig, GameDef } from './game-defs';

export interface RomSet {
  name: string;
  programRom: Uint8Array;
  graphicsRom: Uint8Array;
  audioRom: Uint8Array;
  okiRom: Uint8Array;
  cpsBConfig: CpsBConfig;
  gfxMapper: GfxMapperConfig;
  qsound: boolean;
  qsoundDspRom: Uint8Array | null;
  /** Original ROM files from ZIP, preserved for export */
  originalFiles: Map<string, Uint8Array>;
  /** Game definition, needed for ROM reconstruction on export */
  gameDef: GameDef;
}

// ---------------------------------------------------------------------------
// ROM identification & loading
// ---------------------------------------------------------------------------

/** Collect all filenames referenced by a GameDef */
function getAllFiles(def: GameDef): string[] {
  const files: string[] = [];
  for (const entry of def.program.entries) {
    files.push(entry.even, entry.odd);
  }
  if (def.program.wordSwapEntries) {
    for (const entry of def.program.wordSwapEntries) {
      files.push(entry.file);
    }
  }
  for (const bank of def.graphics.banks) {
    files.push(...bank.files);
  }
  files.push(...def.audio.files, ...def.oki.files);
  return files;
}

/**
 * Identify a game from the filenames present in the ZIP archive.
 */
export function identifyGame(fileNames: string[]): GameDef | null {
  const lowerNames = new Set(fileNames.map(n => n.toLowerCase()));

  let bestMatch: GameDef | null = null;
  let bestScore = 0;

  for (const def of GAME_DEFS) {
    const allFiles = getAllFiles(def);
    let score = 0;
    for (const f of allFiles) {
      if (lowerNames.has(f.toLowerCase())) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = def;
    }
  }

  // Require at least the program ROMs to match
  if (bestMatch !== null) {
    const progFileCount = bestMatch.program.entries.length * 2;
    if (bestScore >= progFileCount) {
      return bestMatch;
    }
  }

  return null;
}


/**
 * Concatenate ROM files into a single Uint8Array in definition order.
 */
function assembleLinear(
  files: string[],
  fileMap: Map<string, Uint8Array>,
  totalSize: number,
): Uint8Array {
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (const name of files) {
    const data = fileMap.get(name.toLowerCase());
    if (data === undefined) continue;
    const copyLen = Math.min(data.length, totalSize - offset);
    result.set(data.subarray(0, copyLen), offset);
    offset += data.length;
  }

  return result;
}

/**
 * Assemble program ROM using ROM_LOAD16_BYTE format.
 *
 * Each entry has an even file (byte 0, 2, 4...) and odd file (byte 1, 3, 5...)
 * placed at a specific offset in the final ROM.
 */
function assembleProgram(
  def: ProgramDef,
  fileMap: Map<string, Uint8Array>,
): Uint8Array {
  const result = new Uint8Array(def.size);

  for (const entry of def.entries) {
    const evenData = fileMap.get(entry.even.toLowerCase());
    const oddData = fileMap.get(entry.odd.toLowerCase());

    for (let i = 0; i < entry.size; i++) {
      const dest = entry.offset + i * 2;
      if (dest + 1 >= def.size) break;
      result[dest] = evenData !== undefined && i < evenData.length ? evenData[i]! : 0;
      result[dest + 1] = oddData !== undefined && i < oddData.length ? oddData[i]! : 0;
    }
  }

  // ROM_LOAD16_WORD_SWAP: standard files are little-endian words and need
  // byte-swapping to big-endian (68K native). Some ROM sets ship files already
  // pre-swapped to big-endian. We auto-detect the byte order statistically:
  // in CPS1 ROM data, the LSB byte of each word tends to be larger than the
  // MSB byte (due to palette format, opcode distribution, etc.). We count
  // how often byte[0] > byte[1] across all non-zero words:
  //   - ratio > 1 → byte[0] is the LSB → file is little-endian → needs swap
  //   - ratio ≤ 1 → byte[0] is the MSB → file is already big-endian → no swap
  if (def.wordSwapEntries) {
    for (const entry of def.wordSwapEntries) {
      const data = fileMap.get(entry.file.toLowerCase());
      if (data === undefined) continue;
      const copyLen = Math.min(data.length, entry.size, def.size - entry.offset);

      let b0bigger = 0;
      let b1bigger = 0;
      for (let i = 0; i < copyLen; i += 2) {
        const b0 = data[i]!;
        const b1 = data[i + 1]!;
        if (b0 === 0 && b1 === 0) continue;
        if (b0 > b1) b0bigger++;
        else if (b1 > b0) b1bigger++;
      }

      const needSwap = b1bigger === 0 || b0bigger / b1bigger > 1;

      if (needSwap) {
        for (let i = 0; i < copyLen; i += 2) {
          result[entry.offset + i] = data[i + 1] ?? 0;
          result[entry.offset + i + 1] = data[i] ?? 0;
        }
      } else {
        result.set(data.subarray(0, copyLen), entry.offset);
      }
    }
  }

  return result;
}

/**
 * CPS1 graphics ROM assembly and decode.
 *
 * Step 1: ROM_LOAD64_WORD interleave.
 *   Each bank has 4 ROMs. Each ROM provides 2 bytes (word) per 8-byte group.
 *   ROM 0 → bytes 0,1; ROM 1 → bytes 2,3; ROM 2 → bytes 4,5; ROM 3 → bytes 6,7.
 *
 * Step 2: Decode to 1-byte-per-pixel using MAME's cps1_layout8x8:
 *   planeoffset = {24, 16, 8, 0}  → in each 4-byte word: byte3=plane3, byte2=plane2, byte1=plane1, byte0=plane0
 *   xoffset = STEP8(0, 1)         → bit 0=pixel 0 ... bit 7=pixel 7 (LSB = leftmost!)
 *   yoffset = STEP8(0, 64)        → each row = 64 bits = 8 bytes apart
 *   charincrement = 512 bits = 64 bytes per tile
 *
 *   So each 64-byte block in the interleaved ROM = one 8x8 tile.
 *   Each row = 8 bytes = [plane0_byte, plane1_byte, plane2_byte, plane3_byte, next_tile_plane0, ...]
 *   Wait — actually the 64-byte block contains TWO tiles side by side:
 *     Tile A uses bytes 0-3 of each row, Tile B uses bytes 4-7 (cps1_layout8x8_2).
 *   But for our renderer we decode ALL as sequential tiles, which maps correctly.
 *
 *   Per row (8 bytes): plane0=byte[0], plane1=byte[1], plane2=byte[2], plane3=byte[3]
 *   xoffset STEP8(0,1) means bit 0 = pixel 0 (leftmost), bit 7 = pixel 7 (rightmost)
 *
 * Output: 1 byte per pixel, 64 bytes per 8x8 tile. Tile N starts at N*64.
 */
function assembleGraphicsNew(
  def: GraphicsDef,
  fileMap: Map<string, Uint8Array>,
): Uint8Array {
  // Step 1: Interleave into raw buffer (same size as region)
  const raw = new Uint8Array(def.size);

  for (const bank of def.banks) {
    const roms: (Uint8Array | undefined)[] = bank.files.map(
      f => fileMap.get(f.toLowerCase())
    );

    const numRoms = bank.files.length;

    if (numRoms === 8) {
      // ROM_LOAD64_BYTE: 8 ROMs, each contributes 1 byte per 8-byte group
      for (let j = 0; j < bank.romSize; j++) {
        const destBase = bank.offset + j * 8;
        if (destBase + 7 >= def.size) break;
        for (let r = 0; r < 8; r++) {
          const rom = roms[r];
          raw[destBase + r] = rom !== undefined && j < rom.length ? rom[j]! : 0;
        }
      }
    } else {
      // ROM_LOAD64_WORD: 4 ROMs, each contributes 2 bytes per 8-byte group
      for (let j = 0; j < bank.romSize; j += 2) {
        const destBase = bank.offset + (j / 2) * 8;
        if (destBase + 7 >= def.size) break;
        for (let r = 0; r < 4; r++) {
          const rom = roms[r];
          raw[destBase + r * 2] = rom !== undefined && j < rom.length ? rom[j]! : 0;
          raw[destBase + r * 2 + 1] = rom !== undefined && j + 1 < rom.length ? rom[j + 1]! : 0;
        }
      }
    }
  }

  // Return the raw interleaved data directly.
  // The renderer will decode pixels on-the-fly using the MAME gfx layout.
  // This avoids having to pre-decode all tiles and keeps the tile indexing
  // consistent with how the CPS1 hardware addresses graphics.
  return raw;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a CPS1 ROM set from a ZIP file (browser File API).
 *
 * @param file - A File object from drag & drop or file input
 * @returns The assembled RomSet ready to be loaded into the emulator
 * @throws Error if the game cannot be identified or required ROMs are missing
 */
export async function loadRomFromZip(file: File | ArrayBuffer): Promise<RomSet> {
  const entries = await extractZip(file);

  if (entries.length === 0) {
    throw new Error('ZIP archive is empty');
  }

  const fileNames = entries.map(e => e.name);
  const gameDef = identifyGame(fileNames);

  if (gameDef === null) {
    throw new Error(
      `Unable to identify CPS1 game. Found files: ${fileNames.join(', ')}. ` +
      `Supported games: ${GAME_DEFS.map(g => g.name).join(', ')}`
    );
  }

  const fileMap = buildFileMap(entries);

  // Verify program ROM files
  for (const entry of gameDef.program.entries) {
    if (!fileMap.has(entry.even.toLowerCase()) || !fileMap.has(entry.odd.toLowerCase())) {
      throw new Error(
        `Missing program ROM files for ${gameDef.name}: ${entry.even} or ${entry.odd}`
      );
    }
  }
  if (gameDef.program.wordSwapEntries) {
    for (const entry of gameDef.program.wordSwapEntries) {
      if (!fileMap.has(entry.file.toLowerCase())) {
        throw new Error(
          `Missing program ROM file for ${gameDef.name}: ${entry.file}`
        );
      }
    }
  }

  const programRom = assembleProgram(gameDef.program, fileMap);
  const graphicsRom = assembleGraphicsNew(gameDef.graphics, fileMap);
  // Audio ROM uses ROM_LOAD + ROM_CONTINUE format:
  // First 0x8000 bytes → offset 0x0000 (fixed ROM)
  // Remaining bytes → offset 0x10000 (banked ROM)
  // MAME allocates regionSize = 0x10000 + continuedSize for the full banked area.
  const audioFileData = fileMap.get(gameDef.audio.files[0]!.toLowerCase());
  const continuedSize = audioFileData ? Math.max(0, audioFileData.length - 0x8000) : 0;
  const audioRegionSize = Math.max(gameDef.audio.size, 0x10000 + continuedSize);
  const audioRom = new Uint8Array(audioRegionSize);
  if (audioFileData !== undefined) {
    // ROM_LOAD: first 0x8000 bytes at offset 0x0000
    const firstChunk = Math.min(0x8000, audioFileData.length);
    audioRom.set(audioFileData.subarray(0, firstChunk), 0x0000);
    // ROM_CONTINUE: remaining bytes at offset 0x10000
    if (continuedSize > 0) {
      audioRom.set(audioFileData.subarray(0x8000), 0x10000);
    }
  }
  const okiRom = assembleLinear(gameDef.oki.files, fileMap, gameDef.oki.size);

  // Load QSound DSP ROM (dl-1425.bin) if present in the ZIP
  let qsoundDspRom: Uint8Array | null = null;
  if (gameDef.qsound) {
    const dspFile = fileMap.get('dl-1425.bin');
    if (dspFile) {
      // File is 24KB but only first 8KB (4096 x 16-bit words) is used
      qsoundDspRom = dspFile.subarray(0, 0x2000);
    } else {
      console.warn('[ROM] QSound game but dl-1425.bin not found in ZIP');
    }
  }

  return {
    name: gameDef.name,
    programRom,
    graphicsRom,
    audioRom,
    okiRom,
    cpsBConfig: gameDef.cpsBConfig,
    gfxMapper: gameDef.gfxMapper,
    qsound: gameDef.qsound === true,
    qsoundDspRom,
    originalFiles: fileMap,
    gameDef,
  };
}

/**
 * Get the list of supported game names.
 */
export function getSupportedGames(): string[] {
  return GAME_DEFS.map(g => g.name);
}
