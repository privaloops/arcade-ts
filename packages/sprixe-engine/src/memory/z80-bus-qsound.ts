/**
 * CPS1 Z80 Audio CPU Memory Bus — QSound variant
 *
 * Memory map (from MAME cps1.cpp qsound_sub_map):
 *   0x0000-0x7FFF : Audio ROM fixed (32KB)
 *   0x8000-0xBFFF : Audio ROM banked (16KB window)
 *   0xC000-0xCFFF : Shared RAM 1 (4KB, shared with 68K at 0xF18000)
 *   0xD000-0xD002 : QSound DSP write (data_hi, data_lo, command)
 *   0xD003        : Bank switch (write)
 *   0xD007        : QSound DSP read (ready flag)
 *   0xF000-0xFFFF : Shared RAM 2 (4KB, shared with 68K at 0xF1E000)
 *
 * Differences from standard CPS1 Z80 bus:
 *   - No YM2151, no OKI6295 — replaced by QSound DSP
 *   - 68K communicates via shared RAM (not sound latch)
 *   - Z80 IRQ is a fixed 250 Hz timer (not from YM2151)
 */

import type { Z80BusInterface } from '../types';

export class Z80BusQSound implements Z80BusInterface {
  private audioRom: Uint8Array;       // data-decoded ROM
  private opcodeRom: Uint8Array | null = null; // opcode-decoded ROM (Kabuki)
  private sharedRam1: Uint8Array;  // 4KB at 0xC000 (68K: 0xF18000)
  private sharedRam2: Uint8Array;  // 4KB at 0xF000 (68K: 0xF1E000)
  private currentBank: number;

  // QSound DSP callbacks
  private onQsWrite: ((offset: number, data: number) => void) | null;
  private onQsRead: (() => number) | null;

  constructor() {
    this.audioRom = new Uint8Array(0);
    this.sharedRam1 = new Uint8Array(0x1000); // 4KB
    this.sharedRam2 = new Uint8Array(0x1000); // 4KB
    this.currentBank = 0;
    this.onQsWrite = null;
    this.onQsRead = null;
  }

  loadAudioRom(data: Uint8Array): void {
    this.audioRom = data;
  }

  /** Load Kabuki opcode-decoded ROM (separate from data-decoded audioRom) */
  loadOpcodeRom(data: Uint8Array): void {
    this.opcodeRom = data;
  }

  /** Shared RAM 1 — accessible by 68K at 0xF18000-0xF19FFF */
  getSharedRam1(): Uint8Array {
    return this.sharedRam1;
  }

  /** Shared RAM 2 — accessible by 68K at 0xF1E000-0xF1FFFF */
  getSharedRam2(): Uint8Array {
    return this.sharedRam2;
  }

  /** For Z80BusInterface compatibility (returns sharedRam1) */
  getWorkRam(): Uint8Array {
    return this.sharedRam1;
  }

  setQsoundWriteCallback(callback: (offset: number, data: number) => void): void {
    this.onQsWrite = callback;
  }

  setQsoundReadCallback(callback: () => number): void {
    this.onQsRead = callback;
  }

  read(address: number): number {
    address = address & 0xFFFF;

    // Fixed audio ROM: 0x0000-0x7FFF
    if (address <= 0x7FFF) {
      if (address < this.audioRom.length) {
        return this.audioRom[address]!;
      }
      return 0xFF;
    }

    // Banked audio ROM: 0x8000-0xBFFF
    if (address <= 0xBFFF) {
      const romAddress = 0x10000 + this.currentBank * 0x4000 + (address - 0x8000);
      if (romAddress < this.audioRom.length) {
        return this.audioRom[romAddress]!;
      }
      return 0xFF;
    }

    // Shared RAM 1: 0xC000-0xCFFF
    if (address >= 0xC000 && address <= 0xCFFF) {
      return this.sharedRam1[address - 0xC000]!;
    }

    // QSound read (ready flag): 0xD007
    // The HLE processes register writes instantly — always return ready.
    // Without this, the Z80 busy-waits forever because generate1()
    // only runs in the outer loop, not inside z80.step().
    if (address === 0xD007) {
      return 0x80;
    }

    // Shared RAM 2: 0xF000-0xFFFF
    if (address >= 0xF000) {
      return this.sharedRam2[address - 0xF000]!;
    }

    return 0xFF;
  }

  write(address: number, value: number): void {
    address = address & 0xFFFF;
    value = value & 0xFF;

    // ROM area: writes ignored
    if (address <= 0xBFFF) {
      return;
    }

    // Shared RAM 1: 0xC000-0xCFFF
    if (address >= 0xC000 && address <= 0xCFFF) {
      this.sharedRam1[address - 0xC000] = value;
      // When Z80 ISR clears command flag (0xC00F=0xFF), wake the main loop.
      // The ISR captured the command; now the main loop needs to process it.
      if (address === 0xC00F && value === 0xFF && this.sharedRam1[0xFFF] === 0x77) {
        this.sharedRam1[0xFFF] = 0xFF;
      }
      return;
    }

    // QSound write: 0xD000-0xD002
    if (address >= 0xD000 && address <= 0xD002) {
      if (this.onQsWrite !== null) {
        this.onQsWrite(address - 0xD000, value);
      }
      return;
    }

    // Bank switch: 0xD003
    if (address === 0xD003) {
      const numBanks = Math.max(1, ((this.audioRom.length - 0x10000) / 0x4000) | 0);
      this.currentBank = (value & 0x0f) % numBanks;
      return;
    }

    // Shared RAM 2: 0xF000-0xFFFF
    if (address >= 0xF000) {
      this.sharedRam2[address - 0xF000] = value;
      return;
    }
  }

  /** Read opcode byte — uses Kabuki opcode ROM for first 32KB */
  readOpcode(address: number): number {
    address = address & 0xFFFF;
    if (this.opcodeRom && address <= 0x7FFF) {
      if (address < this.opcodeRom.length) {
        return this.opcodeRom[address]!;
      }
      return 0xFF;
    }
    // Banked area and RAM: same as data read
    return this.read(address);
  }

  ioRead(_port: number): number {
    return 0xFF;
  }

  ioWrite(_port: number, _value: number): void {
    // No I/O ports used
  }
}
