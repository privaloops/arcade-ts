/**
 * RomStore — central mutable ROM manager.
 *
 * Holds all ROM regions as mutable Uint8Array buffers, keeps pristine
 * copies for reset, preserves original files for ZIP export.
 */

import JSZip from 'jszip';
import type { RomSet, GameDef } from './memory/rom-loader';

type Region = 'program' | 'graphics' | 'audio' | 'oki';

export class RomStore {
  readonly name: string;

  /** Mutable ROM regions — editors write here, consumers read here */
  readonly programRom: Uint8Array;
  readonly graphicsRom: Uint8Array;
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

  /** Check if a region has been modified */
  isModified(region: Region): boolean {
    const [mutable, original] = this.getBufferPair(region);
    for (let i = 0; i < mutable.length; i++) {
      if (mutable[i] !== original[i]) return true;
    }
    return false;
  }

  /** Get the pristine copy of a region (for undo/comparison) */
  getOriginal(region: Region): Uint8Array {
    return this.getBufferPair(region)[1];
  }

  /**
   * Export all ROMs as a MAME-compatible ZIP.
   * Unmodified regions use original file bytes.
   * Modified regions are reconstructed from the mutable buffers.
   */
  async exportZip(): Promise<Blob> {
    const zip = this.buildExportZip();
    return zip.generateAsync({ type: 'blob' });
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
