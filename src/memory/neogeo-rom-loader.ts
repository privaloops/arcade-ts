/**
 * Neo-Geo ROM Loader
 *
 * Loads MAME-format Neo-Geo ROM sets from ZIP files.
 * Identifies the game by filenames, assembles P-ROM/C-ROM/M-ROM/V-ROM/S-ROM,
 * and performs Neo-Geo C-ROM byte interleaving.
 */

import JSZip from 'jszip';
import { NEOGEO_GAME_DEFS } from './neogeo-game-defs';
import type { NeoGeoGameDef, NeoGeoRomEntry } from './neogeo-game-defs';

export type { NeoGeoGameDef, NeoGeoRomEntry } from './neogeo-game-defs';

export interface NeoGeoRomSet {
  name: string;
  description: string;
  programRom: Uint8Array;     // P-ROM assembled (68K code)
  spritesRom: Uint8Array;     // C-ROM assembled (interleaved pairs)
  audioRom: Uint8Array;       // M-ROM (Z80 code)
  voiceRom: Uint8Array;       // V-ROM (ADPCM samples, concatenated)
  fixedRom: Uint8Array;       // S-ROM (fix layer tiles)
  biosRom: Uint8Array;        // BIOS 68K (sp-s2.sp1, 128KB)
  biosSRom: Uint8Array;       // BIOS S-ROM (sfix.sfix, 128KB)
  biosZRom: Uint8Array;       // BIOS Z80 (sm1.sm1, 128KB)
  loRom: Uint8Array;          // L0 ROM (shrink tables, 64KB)
  gameDef: NeoGeoGameDef;
  originalFiles: Map<string, Uint8Array>;
}

interface RomFileEntry {
  name: string;
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// ROM identification & loading
// ---------------------------------------------------------------------------

/** Collect all filenames referenced by a NeoGeoGameDef */
function getAllFiles(def: NeoGeoGameDef): string[] {
  const files: string[] = [];
  for (const r of def.program) files.push(r.name);
  for (const r of def.sprites) files.push(r.name);
  for (const r of def.audio) files.push(r.name);
  for (const r of def.voice) files.push(r.name);
  if (def.fixed) {
    for (const r of def.fixed) files.push(r.name);
  }
  return files;
}

/** Identify a Neo-Geo game from the filenames present in the ZIP archive. */
function identifyNeoGeoGame(fileNames: string[]): NeoGeoGameDef | null {
  const lowerNames = new Set(fileNames.map(n => n.toLowerCase()));

  let bestMatch: NeoGeoGameDef | null = null;
  let bestScore = 0;

  for (const def of NEOGEO_GAME_DEFS) {
    const allFiles = getAllFiles(def);
    let score = 0;
    for (const f of allFiles) {
      if (lowerNames.has(f.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = def;
    }
  }

  // Require at least the program ROMs to match
  if (bestMatch !== null && bestScore >= bestMatch.program.length) {
    return bestMatch;
  }

  return null;
}

/** Extract all files from a ZIP as RomFileEntry[]. */
async function extractZip(file: File | ArrayBuffer): Promise<RomFileEntry[]> {
  const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entries: RomFileEntry[] = [];
  const promises: Promise<void>[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const name = relativePath.includes('/')
      ? relativePath.substring(relativePath.lastIndexOf('/') + 1)
      : relativePath;
    promises.push(
      zipEntry.async('uint8array').then(data => {
        entries.push({ name, data });
      })
    );
  });

  await Promise.all(promises);
  return entries;
}

/** Build a filename -> data map from the extracted entries. */
function buildFileMap(entries: RomFileEntry[]): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const entry of entries) {
    map.set(entry.name.toLowerCase(), entry.data);
  }
  return map;
}

// ---------------------------------------------------------------------------
// ROM assembly
// ---------------------------------------------------------------------------

/**
 * Assemble P-ROM (program ROM).
 * Neo-Geo P-ROMs use load16_word_swap: each pair of bytes is swapped.
 */
export function assembleProgramRom(
  entries: NeoGeoRomEntry[],
  fileMap: Map<string, Uint8Array>,
): Uint8Array {
  // Calculate total size from entries
  let totalSize = 0;
  for (const entry of entries) {
    const end = entry.offset + entry.size;
    if (end > totalSize) totalSize = end;
  }
  const result = new Uint8Array(totalSize);

  for (const entry of entries) {
    const data = fileMap.get(entry.name.toLowerCase());
    if (data === undefined) continue;

    if (entry.loadFlag === 'load16_word_swap') {
      // Swap each pair of bytes (big-endian word swap)
      const len = Math.min(data.length, entry.size);
      for (let i = 0; i < len; i += 2) {
        result[entry.offset + i] = data[i + 1] ?? 0;
        result[entry.offset + i + 1] = data[i] ?? 0;
      }
    } else {
      // Linear copy
      const len = Math.min(data.length, entry.size);
      result.set(data.subarray(0, len), entry.offset);
    }
  }

  return result;
}

/**
 * Assemble C-ROM (sprites ROM).
 * C-ROMs come in pairs: odd (C1, C3, C5...) provides bp0+bp1,
 * even (C2, C4, C6...) provides bp2+bp3.
 * load16_byte interleaving: odd bytes at offset, even bytes at offset+1.
 */
export function assembleSpritesRom(
  entries: NeoGeoRomEntry[],
  fileMap: Map<string, Uint8Array>,
): Uint8Array {
  // Calculate total size: each pair contributes size*2 bytes
  let totalSize = 0;
  for (const entry of entries) {
    const end = entry.offset + entry.size * 2;
    // offset for load16_byte uses 0, 1, so actual end is (offset & ~1) + size*2
    const baseOffset = entry.offset & ~1;
    const realEnd = baseOffset + entry.size * 2;
    if (realEnd > totalSize) totalSize = realEnd;
  }
  const result = new Uint8Array(totalSize);

  for (const entry of entries) {
    const data = fileMap.get(entry.name.toLowerCase());
    if (data === undefined) continue;

    if (entry.loadFlag === 'load16_byte') {
      // Byte interleaving: odd ROM at even offsets, even ROM at odd offsets
      const byteOffset = entry.offset & 1; // 0 for odd ROM, 1 for even ROM
      const baseOffset = entry.offset & ~1;
      const len = Math.min(data.length, entry.size);
      for (let i = 0; i < len; i++) {
        result[baseOffset + i * 2 + byteOffset] = data[i]!;
      }
    } else {
      // Linear copy fallback
      const len = Math.min(data.length, entry.size);
      result.set(data.subarray(0, len), entry.offset);
    }
  }

  return result;
}

/**
 * Assemble V-ROM (voice/ADPCM samples).
 * Simple linear concatenation based on offsets.
 * Voice data can come from ymsnd:adpcma and ymsnd:adpcmb — different pools.
 */
export function assembleVoiceRom(
  entries: NeoGeoRomEntry[],
  fileMap: Map<string, Uint8Array>,
): Uint8Array {
  // Calculate total size
  let totalSize = 0;
  for (const entry of entries) {
    const end = entry.offset + entry.size;
    if (end > totalSize) totalSize = end;
  }

  // ADPCM-A and ADPCM-B have separate address spaces in the XML.
  // We detect split pools by counting entries starting at offset 0.
  // If there are two, we concatenate ADPCM-B after ADPCM-A.
  const zeroOffsetIndices: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.offset === 0) zeroOffsetIndices.push(i);
  }

  if (zeroOffsetIndices.length >= 2) {
    const splitIdx = zeroOffsetIndices[1]!;
    const groupA = entries.slice(0, splitIdx);
    const groupB = entries.slice(splitIdx);

    let adpcmASize = 0;
    for (const e of groupA) {
      const end = e.offset + e.size;
      if (end > adpcmASize) adpcmASize = end;
    }
    let adpcmBSize = 0;
    for (const e of groupB) {
      const end = e.offset + e.size;
      if (end > adpcmBSize) adpcmBSize = end;
    }

    totalSize = adpcmASize + adpcmBSize;
    const result = new Uint8Array(totalSize);

    for (const entry of groupA) {
      const data = fileMap.get(entry.name.toLowerCase());
      if (data === undefined) continue;
      result.set(data.subarray(0, Math.min(data.length, entry.size)), entry.offset);
    }
    for (const entry of groupB) {
      const data = fileMap.get(entry.name.toLowerCase());
      if (data === undefined) continue;
      result.set(data.subarray(0, Math.min(data.length, entry.size)), adpcmASize + entry.offset);
    }

    return result;
  }

  // Simple case: single address space
  const result = new Uint8Array(totalSize);
  for (const entry of entries) {
    const data = fileMap.get(entry.name.toLowerCase());
    if (data === undefined) continue;
    const len = Math.min(data.length, entry.size);
    result.set(data.subarray(0, len), entry.offset);
  }

  return result;
}

/** Assemble linear ROM (M-ROM, S-ROM). */
function assembleLinearRom(
  entries: NeoGeoRomEntry[],
  fileMap: Map<string, Uint8Array>,
): Uint8Array {
  let totalSize = 0;
  for (const entry of entries) {
    const end = entry.offset + entry.size;
    if (end > totalSize) totalSize = end;
  }

  const result = new Uint8Array(totalSize);
  for (const entry of entries) {
    const data = fileMap.get(entry.name.toLowerCase());
    if (data === undefined) continue;
    const len = Math.min(data.length, entry.size);
    result.set(data.subarray(0, len), entry.offset);
  }

  return result;
}

/** Swap each pair of bytes in a Uint8Array (ROM_LOAD16_WORD_SWAP) */
function wordSwap(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 2) {
    result[i] = data[i + 1] ?? 0;
    result[i + 1] = data[i] ?? 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Generic game def builder (for games not in our database)
// ---------------------------------------------------------------------------

/**
 * Build a NeoGeoGameDef from file naming conventions.
 * Neo-Geo ROMs follow a uniform pattern: XXX-p1.p1, XXX-c1.c1, XXX-m1.m1, etc.
 */
function buildGenericGameDef(
  fileNames: string[],
  fileMap: Map<string, Uint8Array>,
): NeoGeoGameDef | null {
  const lower = fileNames.map(n => n.toLowerCase());

  // Detect the game prefix (e.g., "009" from "009-p1.p1")
  const pMatch = lower.find(n => /^\d{3}-p1\.p1$/.test(n));
  if (!pMatch) return null;
  const prefix = pMatch.substring(0, 3);

  // Helper: find all files matching a pattern, sorted
  const findFiles = (pattern: RegExp): string[] =>
    lower.filter(n => pattern.test(n)).sort();

  // P-ROMs: XXX-p1.p1, XXX-p2.sp2, etc.
  const pFiles = findFiles(new RegExp(`^${prefix}-p\\d`));
  const program: NeoGeoRomEntry[] = pFiles.map(name => {
    const data = fileMap.get(name);
    const size = data?.length ?? 0;
    // Determine offset: p1 at 0, p2 at p1.size, etc.
    return { name, offset: 0, size, loadFlag: 'load16_word_swap' };
  });
  // Fix offsets: sequential
  let pOff = 0;
  for (const entry of program) {
    entry.offset = pOff;
    pOff += entry.size;
  }

  // C-ROMs: XXX-c1.c1, XXX-c2.c2, ... (pairs, interleaved)
  const cFiles = findFiles(new RegExp(`^${prefix}-c\\d+\\.c\\d+$`));
  const sprites: NeoGeoRomEntry[] = [];
  for (let i = 0; i < cFiles.length; i += 2) {
    const oddFile = cFiles[i]!;
    const evenFile = cFiles[i + 1];
    const oddData = fileMap.get(oddFile);
    const size = oddData?.length ?? 0;
    const baseOffset = (i / 2) * size * 2;
    sprites.push({ name: oddFile, offset: baseOffset, size, loadFlag: 'load16_byte' });
    if (evenFile) {
      sprites.push({ name: evenFile, offset: baseOffset + 1, size, loadFlag: 'load16_byte' });
    }
  }

  // M-ROM: XXX-m1.m1
  const mFiles = findFiles(new RegExp(`^${prefix}-m\\d`));
  const audio: NeoGeoRomEntry[] = mFiles.map(name => {
    const data = fileMap.get(name);
    return { name, offset: 0, size: data?.length ?? 0 };
  });

  // V-ROMs: XXX-v1.v1, XXX-v2.v2, ... or XXX-v11.v11, XXX-v21.v21, ...
  const vFiles = findFiles(new RegExp(`^${prefix}-v\\d`));
  const voice: NeoGeoRomEntry[] = [];
  let vOff = 0;
  let lastVGroup = '';
  for (const name of vFiles) {
    const data = fileMap.get(name);
    const size = data?.length ?? 0;
    // Detect ADPCM-A vs ADPCM-B by name pattern: v1x = ADPCM-A, v2x = ADPCM-B
    const groupMatch = /v(\d)/.exec(name);
    const group = groupMatch?.[1] ?? '1';
    if (group !== lastVGroup && lastVGroup !== '') {
      vOff = 0; // Reset offset for new group (ADPCM-B)
    }
    voice.push({ name, offset: vOff, size });
    vOff += size;
    lastVGroup = group;
  }

  // S-ROM: XXX-s1.s1
  const sFiles = findFiles(new RegExp(`^${prefix}-s\\d`));
  const fixed: NeoGeoRomEntry[] = sFiles.map(name => {
    const data = fileMap.get(name);
    return { name, offset: 0, size: data?.length ?? 0 };
  });

  const gameName = prefix;
  console.log(`[Neo-Geo ROM] Generic load: prefix=${prefix}, P=${program.length}, C=${sprites.length}, M=${audio.length}, V=${voice.length}, S=${fixed.length}`);

  const def: NeoGeoGameDef = {
    name: gameName,
    description: `Neo-Geo game (${prefix})`,
    year: '',
    publisher: '',
    program,
    sprites,
    audio,
    voice,
  };
  if (fixed.length > 0) def.fixed = fixed;
  return def;
}

// ---------------------------------------------------------------------------
// BIOS
// ---------------------------------------------------------------------------

// Known BIOS ROM names in neogeo.zip — AES (home) BIOS first for direct game launch
const BIOS_68K_NAMES = [
  'sp-s2.sp1',      // Japan MVS (Ver. 3) — all tests pass
  'neo-epo.bin',    // Europe AES
  'neo-po.bin',     // Japan AES
  'aes-bios.bin',   // AES generic
  'sp-s2.sp1',      // Japan MVS (Ver. 3) — fallback
  'sp-s.sp1',       // Japan MVS (Ver. 2)
  'sp-u2.sp1',      // US MVS (Ver. 2)
  'sp-e.sp1',       // Europe MVS (Ver. 2)
  'sp1.jipjap.com', // Unibios
  'uni-bios.rom',   // Universe BIOS
  'sp-s3.sp1',      // Japan MVS (Ver. 6)
  'sp-45.sp1',      // Japan MVS (Ver. 5)
  'japan-j3.bin',   // Japan MVS (J3)
  'neo-po.bin',     // Japan AES
  'neo-epo.bin',    // Europe AES
  'neodebug.rom',   // Debug BIOS
  'sp-1v1_3db8c.bin', // Japan MVS (Alt)
  'vs-bios.rom',    // US MVS
  'aes-bios.bin',   // AES generic
];

const BIOS_SROM_NAMES = ['sfix.sfix', 'sfix.sfx'];
const BIOS_ZROM_NAMES = ['sm1.sm1'];
const BIOS_LO_NAMES = ['000-lo.lo'];

function findBiosFile(fileMap: Map<string, Uint8Array>, names: string[]): Uint8Array | null {
  for (const name of names) {
    const data = fileMap.get(name.toLowerCase());
    if (data !== undefined) return data;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a Neo-Geo ROM set from a game ZIP file.
 * The BIOS (neogeo.zip) must be provided separately.
 */
export async function loadNeoGeoRomFromZip(
  gameFile: File | ArrayBuffer,
  biosFile?: File | ArrayBuffer,
): Promise<NeoGeoRomSet> {
  const gameEntries = await extractZip(gameFile);

  if (gameEntries.length === 0) {
    throw new Error('ZIP archive is empty');
  }

  const fileNames = gameEntries.map(e => e.name);
  let gameDef = identifyNeoGeoGame(fileNames);
  const fileMap = buildFileMap(gameEntries);

  // If no known game def, build one generically from file naming conventions
  if (gameDef === null) {
    gameDef = buildGenericGameDef(fileNames, fileMap);
    if (gameDef === null) {
      throw new Error(
        `Unable to identify Neo-Geo game. Found files: ${fileNames.slice(0, 10).join(', ')}`
      );
    }
  }

  // Load BIOS if provided
  let biosMap: Map<string, Uint8Array>;
  if (biosFile) {
    const biosEntries = await extractZip(biosFile);
    biosMap = buildFileMap(biosEntries);
  } else {
    biosMap = fileMap;
  }

  // Verify critical program ROM files
  for (const entry of gameDef.program) {
    if (!fileMap.has(entry.name.toLowerCase())) {
      throw new Error(`Missing program ROM file for ${gameDef.name}: ${entry.name}`);
    }
  }

  const programRom = assembleProgramRom(gameDef.program, fileMap);
  const spritesRom = assembleSpritesRom(gameDef.sprites, fileMap);
  const audioRom = assembleLinearRom(gameDef.audio, fileMap);
  const voiceRom = assembleVoiceRom(gameDef.voice, fileMap);
  const fixedRom = gameDef.fixed
    ? assembleLinearRom(gameDef.fixed, fileMap)
    : new Uint8Array(0);

  // BIOS components — 68K BIOS needs word swap (MAME: ROM_LOAD16_WORD_SWAP)
  const biosRomRaw = findBiosFile(biosMap, BIOS_68K_NAMES);
  const biosRom = biosRomRaw ? wordSwap(biosRomRaw) : new Uint8Array(0x20000);
  const biosSRom = findBiosFile(biosMap, BIOS_SROM_NAMES) ?? new Uint8Array(0x20000);
  const biosZRom = findBiosFile(biosMap, BIOS_ZROM_NAMES) ?? new Uint8Array(0x20000);
  const loRomFound = findBiosFile(biosMap, BIOS_LO_NAMES);
  const loRom = loRomFound ?? new Uint8Array(0x10000);
  if (!loRomFound) {
    console.warn('[Neo-Geo ROM] 000-lo.lo not found in BIOS — sprite zoom will use fallback');
  }

  if (biosRom.length === 0x20000 && !findBiosFile(biosMap, BIOS_68K_NAMES)) {
    console.warn('[Neo-Geo ROM] No BIOS found — the game will not boot without neogeo.zip');
  }

  return {
    name: gameDef.name,
    description: gameDef.description,
    programRom,
    spritesRom,
    audioRom,
    voiceRom,
    fixedRom,
    biosRom,
    biosSRom,
    biosZRom,
    loRom,
    gameDef,
    originalFiles: fileMap,
  };
}

/**
 * Check if a set of filenames looks like a Neo-Geo ROM.
 * Two detection methods:
 * 1. Match against known game defs
 * 2. Pattern-based: Neo-Geo ROMs use distinctive naming (XXX-p1.p1, XXX-c1.c1)
 */
export function isNeoGeoRom(fileNames: string[]): boolean {
  if (identifyNeoGeoGame(fileNames) !== null) return true;

  // Pattern detection: look for Neo-Geo naming convention
  // P-ROM: \d{3}-p1.p1, C-ROM pairs: \d{3}-c1.c1 + \d{3}-c2.c2
  const lower = fileNames.map(n => n.toLowerCase());
  const hasP1 = lower.some(n => /^\d{3}-p1\.p1$/.test(n));
  const hasC1 = lower.some(n => /^\d{3}-c1\.c1$/.test(n));
  const hasC2 = lower.some(n => /^\d{3}-c2\.c2$/.test(n));
  return hasP1 && hasC1 && hasC2;
}

/** Get the list of supported Neo-Geo game names. */
export function getSupportedNeoGeoGames(): string[] {
  return NEOGEO_GAME_DEFS.map(g => g.name);
}
