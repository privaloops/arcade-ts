/**
 * CPS1 Z80 Audio CPU Memory Bus
 *
 * Memory map (from MAME cps1.cpp):
 *   0x0000-0x7FFF : Audio ROM fixed (32KB)
 *   0x8000-0xBFFF : Audio ROM banked (16KB window)
 *   0xC000-0xC7FF : Work RAM (2KB)
 *   0xD000-0xD7FF : Work RAM mirror
 *   0xF000        : YM2151 register select (write) / status (read)
 *   0xF001        : YM2151 data write / status (read)
 *   0xF002        : OKI6295 command (write) / status (read)
 *   0xF004        : Bank switch (write)
 *   0xF006        : OKI pin 7 (write, unused in basic setup)
 *   0xF008        : Sound latch (read, from 68000)
 *   0xF00A        : Sound latch 2 (read)
 *
 * The Z80 is little-endian but this bus deals with byte-level access only.
 */

import type { Z80BusInterface } from '../types';
export type { Z80BusInterface };

export interface Z80BusState {
  currentBank: number;
  soundLatchValue: number;
  soundLatchQueue: number[];
  soundLatch2Value: number;
  soundLatch2Queue: number[];
  ym2151Register: number;
}

export class Z80Bus implements Z80BusInterface {
  private audioRom: Uint8Array;
  private workRam: Uint8Array;       // 2KB at 0xC000
  private currentBank: number;       // current 16KB bank number for 0x8000-0xBFFF

  // Sound latches: command queues emulate MAME's synchronize() behavior.
  // The 68K can write multiple commands per frame; the Z80 consumes one per frame.
  private soundLatchValue: number;
  private soundLatchQueue: number[];
  private soundLatch2Value: number;
  private soundLatch2Queue: number[];

  // YM2151 interface
  private ym2151Register: number;

  // OKI6295 interface
  private okiStatus: number;

  // Callbacks for chip communication
  private onYm2151Write: ((register: number, data: number) => void) | null;
  private onYm2151AddressWrite: ((value: number) => void) | null;
  private onYm2151ReadStatus: (() => number) | null;
  private onOkiWrite: ((value: number) => void) | null;
  private onOkiReadStatus: (() => number) | null;

  constructor() {
    this.audioRom = new Uint8Array(0);
    this.workRam = new Uint8Array(0x800); // 2KB
    this.currentBank = 0;
    this.soundLatchValue = 0xFF;
    this.soundLatchQueue = [];
    this.soundLatch2Value = 0xFF;
    this.soundLatch2Queue = [];
    this.ym2151Register = 0;
    this.okiStatus = 0;
    this.onYm2151Write = null;
    this.onYm2151AddressWrite = null;
    this.onYm2151ReadStatus = null;
    this.onOkiWrite = null;
    this.onOkiReadStatus = null;
  }

  loadAudioRom(data: Uint8Array): void {
    this.audioRom = data;
  }

  /** Patch audioRom bytes in-place (used by FM editor sync from main thread). */
  patchAudioRom(offset: number, data: Uint8Array): void {
    this.audioRom.set(data, offset);
  }

  getWorkRam(): Uint8Array {
    return this.workRam;
  }

  getSerialState(): Z80BusState {
    return {
      currentBank: this.currentBank,
      soundLatchValue: this.soundLatchValue,
      soundLatchQueue: [...this.soundLatchQueue],
      soundLatch2Value: this.soundLatch2Value,
      soundLatch2Queue: [...this.soundLatch2Queue],
      ym2151Register: this.ym2151Register,
    };
  }

  setSerialState(s: Z80BusState): void {
    this.currentBank = s.currentBank;
    this.soundLatchValue = s.soundLatchValue;
    this.soundLatchQueue = [...s.soundLatchQueue];
    this.soundLatch2Value = s.soundLatch2Value;
    this.soundLatch2Queue = [...s.soundLatch2Queue];
    this.ym2151Register = s.ym2151Register;
  }

  setSoundLatch(value: number): void {
    value = value & 0xFF;
    if (value !== 0xFF && this.soundLatchQueue.length < 32) {
      // Real command: queue it. The Z80 will consume one per frame.
      this.soundLatchQueue.push(value);
    }
    // 0xFF (clear) is ignored — the queue handles ordering.
    // The latch returns 0xFF when the queue is empty.
  }

  /**
   * Called by the emulator after each Z80 frame to advance the command queue.
   * The Z80 consumed the current command during this frame; move to the next.
   */
  advanceSoundLatch(): void {
    if (this.soundLatchQueue.length > 0) {
      this.soundLatchValue = this.soundLatchQueue.shift()!;
    } else {
      this.soundLatchValue = 0xFF;
    }
    if (this.soundLatch2Queue.length > 0) {
      this.soundLatch2Value = this.soundLatch2Queue.shift()!;
    } else {
      this.soundLatch2Value = 0xFF;
    }
  }

  setSoundLatch2(value: number): void {
    value = value & 0xFF;
    if (value !== 0xFF && this.soundLatch2Queue.length < 32) {
      this.soundLatch2Queue.push(value);
    }
  }

  setYm2151WriteCallback(callback: (register: number, data: number) => void): void {
    this.onYm2151Write = callback;
  }

  setOkiWriteCallback(callback: (value: number) => void): void {
    this.onOkiWrite = callback;
  }

  setOkiStatus(status: number): void {
    this.okiStatus = status & 0xFF;
  }

  setYm2151AddressWriteCallback(callback: (value: number) => void): void {
    this.onYm2151AddressWrite = callback;
  }

  setYm2151ReadStatusCallback(callback: () => number): void {
    this.onYm2151ReadStatus = callback;
  }

  setOkiReadStatusCallback(callback: () => number): void {
    this.onOkiReadStatus = callback;
  }

  read(address: number): number {
    address = address & 0xFFFF; // Z80 has 16-bit address space

    // Fixed audio ROM: 0x0000-0x7FFF (first 32KB)
    if (address <= 0x7FFF) {
      if (address < this.audioRom.length) {
        return this.audioRom[address]!;
      }
      return 0xFF;
    }

    // Banked audio ROM: 0x8000-0xBFFF (16KB window)
    // MAME ROM_LOAD puts first 32KB at 0x0000, ROM_CONTINUE puts next 32KB at 0x10000.
    // The bank register selects which 16KB page within the 0x10000+ region:
    //   bank 0 = ROM 0x10000-0x13FFF (audioFile[0x8000-0xBFFF])
    //   bank 1 = ROM 0x14000-0x17FFF (audioFile[0xC000-0xFFFF])
    if (address <= 0xBFFF) {
      const bankBase = 0x10000 + this.currentBank * 0x4000;
      const romAddress = bankBase + (address - 0x8000);
      if (romAddress < this.audioRom.length) {
        return this.audioRom[romAddress]!;
      }
      return 0xFF;
    }

    // Work RAM: 0xC000-0xC7FF
    if (address >= 0xC000 && address <= 0xC7FF) {
      return this.workRam[address - 0xC000]!;
    }

    // Work RAM mirror: 0xD000-0xD7FF
    if (address >= 0xD000 && address <= 0xD7FF) {
      return this.workRam[address - 0xD000]!;
    }

    // Memory-mapped I/O registers (from MAME cps1.cpp sound_map)
    // 0xF000-0xF001 : YM2151 (address at 0xF000, data/status at 0xF001)
    if (address === 0xF000) {
      // YM2151 status register (same value at both 0xF000 and 0xF001)
      if (this.onYm2151ReadStatus !== null) {
        return this.onYm2151ReadStatus();
      }
      return 0x00;
    }
    if (address === 0xF001) {
      // YM2151 status register
      if (this.onYm2151ReadStatus !== null) {
        return this.onYm2151ReadStatus();
      }
      return 0x00;
    }

    // 0xF002 : OKI6295 status
    if (address === 0xF002) {
      if (this.onOkiReadStatus !== null) {
        return this.onOkiReadStatus();
      }
      return this.okiStatus;
    }

    // 0xF008 : Sound latch from 68000
    if (address === 0xF008) {
      return this.soundLatchValue;
    }

    // 0xF00A : Sound latch 2
    if (address === 0xF00A) {
      return this.soundLatch2Value;
    }

    // Unmapped
    return 0xFF;
  }

  write(address: number, value: number): void {
    address = address & 0xFFFF;
    value = value & 0xFF;

    // ROM area: writes ignored
    if (address <= 0xBFFF) {
      return;
    }

    // Work RAM: 0xC000-0xC7FF
    if (address >= 0xC000 && address <= 0xC7FF) {
      this.workRam[address - 0xC000] = value;
      return;
    }

    // Work RAM mirror: 0xD000-0xD7FF
    if (address >= 0xD000 && address <= 0xD7FF) {
      this.workRam[address - 0xD000] = value;
      return;
    }

    // Memory-mapped I/O writes (from MAME cps1.cpp sound_map)

    // 0xF000 : YM2151 register select
    if (address === 0xF000) {
      this.ym2151Register = value;
      if (this.onYm2151AddressWrite !== null) {
        this.onYm2151AddressWrite(value);
      }
      return;
    }

    // 0xF001 : YM2151 data write
    if (address === 0xF001) {
      if (this.onYm2151Write !== null) {
        this.onYm2151Write(this.ym2151Register, value);
      }
      return;
    }

    // 0xF002 : OKI6295 command
    if (address === 0xF002) {
      if (this.onOkiWrite !== null) {
        this.onOkiWrite(value);
      }
      return;
    }

    // 0xF004 : Bank switch
    // MAME uses (data & mask) where mask = numBanks - 1.
    // numBanks = (regionSize - 0x10000) / 0x4000.
    // For standard 0x18000 ROMs: 2 banks, mask = 0x01.
    // For larger 0x20000 ROMs (QSound): 4 banks, mask = 0x03.
    if (address === 0xF004) {
      const numBanks = Math.max(1, ((this.audioRom.length - 0x10000) / 0x4000) | 0);
      this.currentBank = value % numBanks;
      return;
    }

    // Unmapped: write ignored
  }

  ioRead(port: number): number {
    port = port & 0xFF;
    // CPS1 Z80 does not use I/O ports — all I/O is memory-mapped.
    // Return 0xFF for any I/O read.
    return 0xFF;
  }

  ioWrite(port: number, value: number): void {
    port = port & 0xFF;
    value = value & 0xFF;
    // CPS1 Z80 does not use I/O ports — all I/O is memory-mapped.
    // Ignore any I/O write.
  }
}
