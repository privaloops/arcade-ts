/**
 * RomStore — central mutable ROM manager.
 *
 * Holds all ROM regions as mutable Uint8Array buffers, keeps pristine
 * copies for reset, preserves original files for ZIP export.
 */

import JSZip from 'jszip';
import type { RomSet, GameDef } from './memory/rom-loader';

type Region = 'program' | 'graphics' | 'audio' | 'oki';

/** Sparse diff entry: a contiguous run of modified bytes */
export interface DiffEntry {
  offset: number;
  bytes: Uint8Array;
}

/** All diffs for the three editable regions */
export interface RomDiffs {
  graphics: DiffEntry[];
  program: DiffEntry[];
  oki: DiffEntry[];
}

export class RomStore {
  readonly name: string;

  /** Optional callback fired after any modification (for auto-save) */
  onModified: (() => void) | null = null;

  /** Mutable ROM regions — editors write here, consumers read here */
  readonly programRom: Uint8Array;
  graphicsRom: Uint8Array;
  readonly audioRom: Uint8Array;
  readonly okiRom: Uint8Array;

  /** Pristine copies for reset */
  private readonly originalProgramRom: Uint8Array;
  private readonly originalGraphicsRom: Uint8Array;
  private readonly originalAudioRom: Uint8Array;
  private readonly originalOkiRom: Uint8Array;

  /** Original ROM files from ZIP (filename → bytes), for export */
  private readonly originalFiles: Map<string, Uint8Array>;

  /** Game definition (needed to reconstruct ROM files from regions) */
  private readonly gameDef: GameDef;

  constructor(romSet: RomSet) {
    this.name = romSet.name;
    this.programRom = romSet.programRom;
    this.graphicsRom = romSet.graphicsRom;
    this.audioRom = romSet.audioRom;
    this.okiRom = romSet.okiRom;
    this.gameDef = romSet.gameDef;
    this.originalFiles = romSet.originalFiles;

    // Deep copy for reset
    this.originalProgramRom = new Uint8Array(romSet.programRom);
    this.originalGraphicsRom = new Uint8Array(romSet.graphicsRom);
    this.originalAudioRom = new Uint8Array(romSet.audioRom);
    this.originalOkiRom = new Uint8Array(romSet.okiRom);
  }

  /** Reset a region to its original ROM data */
  resetRegion(region: Region): void {
    const [mutable, original] = this.getBufferPair(region);
    mutable.set(original);
  }

  /**
   * Patch a palette color in the program ROM.
   * Searches for the 32-byte palette pattern in program ROM and patches the specific color.
   * Returns true if the pattern was found and patched.
   */
  patchProgramPalette(vram: Uint8Array, paletteBase: number, paletteIndex: number, colorIndex: number, newWord: number): boolean {
    // Read the current 32-byte palette from VRAM (this is what the 68K wrote from program ROM)
    const vramOff = paletteBase + paletteIndex * 32;
    const colorOff = colorIndex * 2;
    let found = false;
    const rom = this.programRom;

    // CPS1 palettes: 16-bit words where bits 15-12 = brightness nibble.
    // The 68K applies brightness fades at runtime (ADD.W #0x1000 in a loop).
    // Program ROM stores the BASE palette (before brightness).
    // Strategy: strip brightness from VRAM values and search for that pattern.
    const basePattern = new Uint8Array(32);
    for (let i = 0; i < 32; i += 2) {
      basePattern[i] = vram[vramOff + i]! & 0x0F;  // strip brightness nibble
      basePattern[i + 1] = vram[vramOff + i + 1]!;
    }

    // Search program ROM for base palette (matching low 12 bits of each word)
    for (let offset = 0; offset <= rom.length - 32; offset += 2) {
      let match = true;
      for (let i = 0; i < 32; i += 2) {
        if ((rom[offset + i]! & 0x0F) !== basePattern[i] || rom[offset + i + 1] !== basePattern[i + 1]) {
          match = false; break;
        }
      }
      if (match) {
        // Patch: preserve the ROM's brightness nibble, replace the color nibbles
        const romBright = rom[offset + colorOff]! & 0xF0;
        rom[offset + colorOff] = romBright | ((newWord >> 8) & 0x0F);
        rom[offset + colorOff + 1] = newWord & 0xFF;
        found = true;
      }
    }

    // Fallback: if not found, try exact match (for games without brightness fade)
    if (!found) {
      const exactPattern = new Uint8Array(32);
      for (let i = 0; i < 32; i++) exactPattern[i] = vram[vramOff + i]!;

      for (let offset = 0; offset <= rom.length - 32; offset += 2) {
        let match = true;
        for (let i = 0; i < 32; i++) {
          if (rom[offset + i] !== exactPattern[i]) { match = false; break; }
        }
        if (match) {
          rom[offset + colorOff] = (newWord >> 8) & 0xFF;
          rom[offset + colorOff + 1] = newWord & 0xFF;
          found = true;
        }
      }
    }

    if (found) this.onModified?.();
    return found;
  }

  /**
   * Update the GFX ROM reference after expansion.
   * The original copy stays at the old size — isModified() will detect the difference.
   */
  updateGraphicsRom(newRom: Uint8Array): void {
    this.graphicsRom = newRom;
  }

  /** Check if a region has been modified */
  isModified(region: Region): boolean {
    const [mutable, original] = this.getBufferPair(region);
    if (mutable.length !== original.length) return true; // expanded ROM
    for (let i = 0; i < mutable.length; i++) {
      if (mutable[i] !== original[i]) return true;
    }
    return false;
  }

  /** Get the pristine copy of a region (for undo/comparison) */
  getOriginal(region: Region): Uint8Array {
    return this.getBufferPair(region)[1];
  }

  /** True if any editable region has been modified */
  hasAnyModification(): boolean {
    return this.isModified('graphics') || this.isModified('program') || this.isModified('oki');
  }

  /** Compute sparse diffs for all editable regions */
  computeDiffs(): RomDiffs {
    return {
      graphics: this.computeRegionDiff('graphics'),
      program: this.computeRegionDiff('program'),
      oki: this.computeRegionDiff('oki'),
    };
  }

  /** Apply sparse diffs to the mutable ROM regions */
  applyDiffs(diffs: RomDiffs): void {
    this.applyRegionDiff('graphics', diffs.graphics);
    this.applyRegionDiff('program', diffs.program);
    this.applyRegionDiff('oki', diffs.oki);
  }

  private computeRegionDiff(region: Region): DiffEntry[] {
    const [mutable, original] = this.getBufferPair(region);
    const entries: DiffEntry[] = [];
    const len = Math.min(mutable.length, original.length);
    const GAP_TOLERANCE = 8;

    let runStart = -1;
    let runEnd = -1;

    for (let i = 0; i < len; i++) {
      if (mutable[i] !== original[i]) {
        if (runStart === -1) {
          runStart = i;
          runEnd = i;
        } else if (i - runEnd <= GAP_TOLERANCE) {
          // Extend run (gap within tolerance)
          runEnd = i;
        } else {
          // Close previous run, start new one
          entries.push({ offset: runStart, bytes: mutable.slice(runStart, runEnd + 1) });
          runStart = i;
          runEnd = i;
        }
      }
    }
    if (runStart !== -1) {
      entries.push({ offset: runStart, bytes: mutable.slice(runStart, runEnd + 1) });
    }

    // Handle expanded GFX ROM (bytes beyond original size)
    if (region === 'graphics' && mutable.length > original.length) {
      entries.push({ offset: original.length, bytes: mutable.slice(original.length) });
    }

    return entries;
  }

  private applyRegionDiff(region: Region, entries: DiffEntry[]): void {
    const [mutable] = this.getBufferPair(region);
    for (const entry of entries) {
      mutable.set(entry.bytes, entry.offset);
    }
  }

  /**
   * Export all ROMs as a MAME-compatible ZIP.
   * Unmodified regions use original file bytes.
   * Modified regions are reconstructed from the mutable buffers.
   */
  async exportZip(): Promise<Blob> {
    const zip = this.buildExportZip();
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  /** Export as ArrayBuffer (for Node.js/test environments) */
  async exportZipAsArrayBuffer(): Promise<ArrayBuffer> {
    const zip = this.buildExportZip();
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private buildExportZip(): JSZip {
    const zip = new JSZip();

    // Start with all original files
    for (const [filename, data] of this.originalFiles) {
      zip.file(filename, data);
    }

    // Override modified regions
    if (this.isModified('audio')) {
      const audioFile = this.reconstructAudioFile();
      const audioFileName = this.gameDef.audio.files[0];
      if (audioFileName) zip.file(audioFileName, audioFile);
    }

    if (this.isModified('oki')) {
      this.reconstructLinearFiles('oki', zip);
    }

    if (this.isModified('graphics')) {
      this.reconstructGraphicsFiles(zip);
    }

    if (this.isModified('program')) {
      this.reconstructProgramFiles(zip);
    }

    return zip;
  }

  private getBufferPair(region: Region): [Uint8Array, Uint8Array] {
    switch (region) {
      case 'program':  return [this.programRom, this.originalProgramRom];
      case 'graphics': return [this.graphicsRom, this.originalGraphicsRom];
      case 'audio':    return [this.audioRom, this.originalAudioRom];
      case 'oki':      return [this.okiRom, this.originalOkiRom];
    }
  }

  /**
   * Reverse the rom-loader audio ROM layout:
   *   audioRom[0x0000-0x7FFF] + audioRom[0x10000+] → original file bytes
   */
  private reconstructAudioFile(): Uint8Array {
    const firstChunk = this.audioRom.subarray(0x0000, 0x8000);
    const bankedSize = this.audioRom.length - 0x10000;
    if (bankedSize <= 0) return new Uint8Array(firstChunk);
    const result = new Uint8Array(0x8000 + bankedSize);
    result.set(firstChunk, 0);
    result.set(this.audioRom.subarray(0x10000, 0x10000 + bankedSize), 0x8000);
    return result;
  }

  /**
   * Reverse ROM_LOAD64_WORD interleaving for graphics ROMs.
   *
   * assembleGraphicsNew() interleaves 4 ROM files per bank:
   *   For each 2-byte word j in a ROM file:
   *     destBase = bank.offset + (j/2) * 8
   *     rom[r] bytes at j,j+1 → graphicsRom[destBase + r*2, destBase + r*2 + 1]
   *
   * Reverse: for each bank, extract 4 ROM files.
   */
  private reconstructGraphicsFiles(zip: JSZip): void {
    const gfx = this.graphicsRom;
    const originalSize = this.originalGraphicsRom.length;

    // If ROM was expanded, export the extra data as a raw file
    if (gfx.length > originalSize) {
      zip.file('gfx_expanded.bin', gfx.subarray(originalSize));
    }

    for (const bank of this.gameDef.graphics.banks) {
      const numRoms = bank.files.length;
      const roms: Uint8Array[] = bank.files.map(() => new Uint8Array(bank.romSize));

      if (numRoms === 8) {
        // ROM_LOAD64_BYTE: 8 ROMs, each contributes 1 byte per 8-byte group
        for (let j = 0; j < bank.romSize; j++) {
          const srcBase = bank.offset + j * 8;
          for (let r = 0; r < 8; r++) {
            roms[r]![j] = gfx[srcBase + r] ?? 0;
          }
        }
      } else {
        // ROM_LOAD64_WORD: 4 ROMs, each contributes 2 bytes per 8-byte group
        for (let j = 0; j < bank.romSize; j += 2) {
          const srcBase = bank.offset + (j / 2) * 8;
          for (let r = 0; r < 4; r++) {
            roms[r]![j] = gfx[srcBase + r * 2] ?? 0;
            roms[r]![j + 1] = gfx[srcBase + r * 2 + 1] ?? 0;
          }
        }
      }

      for (let r = 0; r < numRoms; r++) {
        zip.file(bank.files[r]!, roms[r]!);
      }
    }
  }

  /**
   * Reverse assembleProgram() ROM_LOAD16_BYTE interleaving.
   * Even bytes → even file, odd bytes → odd file.
   */
  private reconstructProgramFiles(zip: JSZip): void {
    const rom = this.programRom;
    const def = this.gameDef.program;

    // ROM_LOAD16_BYTE entries
    for (const entry of def.entries) {
      const evenData = new Uint8Array(entry.size);
      const oddData = new Uint8Array(entry.size);

      for (let i = 0; i < entry.size; i++) {
        const src = entry.offset + i * 2;
        if (src + 1 < rom.length) {
          evenData[i] = rom[src]!;
          oddData[i] = rom[src + 1]!;
        }
      }

      zip.file(entry.even, evenData);
      zip.file(entry.odd, oddData);
    }

    // ROM_LOAD16_WORD_SWAP entries: the loader byte-swaps on load
    // (little-endian file → big-endian 68K in memory), so we must
    // re-swap on export to restore the original file byte order.
    if (def.wordSwapEntries) {
      for (const entry of def.wordSwapEntries) {
        const data = new Uint8Array(entry.size);
        for (let i = 0; i < entry.size; i += 2) {
          data[i] = rom[entry.offset + i + 1] ?? 0;
          data[i + 1] = rom[entry.offset + i] ?? 0;
        }
        zip.file(entry.file, data);
      }
    }
  }

  /**
   * Reconstruct linear ROM files (OKI) by splitting the flat region
   * back into individual files per original file sizes.
   */
  private reconstructLinearFiles(region: 'oki', zip: JSZip): void {
    const def = region === 'oki' ? this.gameDef.oki : this.gameDef.audio;
    const rom = region === 'oki' ? this.okiRom : this.audioRom;
    let offset = 0;

    for (const filename of def.files) {
      const originalFile = this.originalFiles.get(filename.toLowerCase());
      const size = originalFile?.length ?? 0;
      if (size > 0) {
        zip.file(filename, rom.slice(offset, offset + size));
        offset += size;
      }
    }
  }
}
