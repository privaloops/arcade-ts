/**
 * CPS1 Z80 Audio CPU Memory Bus
 *
 * Memory map:
 *   0x0000-0x7FFF : Audio ROM fixed (32KB)
 *   0x8000-0xBFFF : Audio ROM banked (16KB window)
 *   0xC000-0xC7FF : Work RAM (2KB)
 *   0xD000-0xD7FF : Work RAM mirror
 *   0xF000        : OKI6295 command/data
 *   0xF002        : OKI6295 status
 *   0xF004        : Sound latch (from 68000)
 *   0xF006        : YM2151 register select
 *   0xF008        : YM2151 data write
 *   0xF00A        : Bank switch
 *
 * The Z80 is little-endian but this bus deals with byte-level access only.
 */

export interface Z80BusInterface {
  read(address: number): number;
  write(address: number, value: number): void;
  ioRead(port: number): number;
  ioWrite(port: number, value: number): void;
}

export class Z80Bus implements Z80BusInterface {
  private audioRom: Uint8Array;
  private workRam: Uint8Array;       // 2KB at 0xC000
  private currentBank: number;       // current 16KB bank number for 0x8000-0xBFFF

  // Sound latch byte written by 68000
  private soundLatchValue: number;

  // YM2151 interface
  private ym2151Register: number;
  private ym2151Data: number;

  // OKI6295 interface
  private okiCommand: number;
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
    this.soundLatchValue = 0;
    this.ym2151Register = 0;
    this.ym2151Data = 0;
    this.okiCommand = 0;
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

  getWorkRam(): Uint8Array {
    return this.workRam;
  }

  setSoundLatch(value: number): void {
    this.soundLatchValue = value & 0xFF;
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
    if (address <= 0xBFFF) {
      const bankOffset = 0x8000 + this.currentBank * 0x4000;
      const romAddress = bankOffset + (address - 0x8000);
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

    // Memory-mapped I/O registers
    if (address === 0xF000) {
      // OKI6295 command (read returns last written command)
      return this.okiCommand;
    }

    if (address === 0xF002) {
      // OKI6295 status
      if (this.onOkiReadStatus !== null) {
        return this.onOkiReadStatus();
      }
      return this.okiStatus;
    }

    if (address === 0xF004) {
      // Sound latch from 68000
      return this.soundLatchValue;
    }

    if (address === 0xF006 || address === 0xF008) {
      // YM2151 status register (readable from both addresses)
      // Bit 7 = busy, bit 1 = timer B overflow, bit 0 = timer A overflow
      if (this.onYm2151ReadStatus !== null) {
        return this.onYm2151ReadStatus();
      }
      return 0x00;
    }

    if (address === 0xF00A) {
      // Bank switch register (read returns current bank)
      return this.currentBank;
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

    // OKI6295 command
    if (address === 0xF000) {
      this.okiCommand = value;
      if (this.onOkiWrite !== null) {
        this.onOkiWrite(value);
      }
      return;
    }

    // OKI6295 status (write ignored, read-only)
    if (address === 0xF002) {
      return;
    }

    // Sound latch (read-only from Z80 side)
    if (address === 0xF004) {
      return;
    }

    // YM2151 register select
    if (address === 0xF006) {
      this.ym2151Register = value;
      if (this.onYm2151AddressWrite !== null) {
        this.onYm2151AddressWrite(value);
      }
      return;
    }

    // YM2151 data write
    if (address === 0xF008) {
      this.ym2151Data = value;
      if (this.onYm2151Write !== null) {
        this.onYm2151Write(this.ym2151Register, value);
      }
      return;
    }

    // Bank switch
    if (address === 0xF00A) {
      this.currentBank = value & 0x0F; // 4-bit bank number (max 16 banks)
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
