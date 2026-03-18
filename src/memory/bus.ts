/**
 * CPS1 68000 Main CPU Memory Bus
 *
 * Memory map (from MAME cps1.cpp):
 *   0x000000-0x3FFFFF : Program ROM (up to 4MB)
 *   0x800000-0x800007 : Player input ports (active LOW)
 *   0x800018-0x80001F : DIP switches / system inputs
 *   0x800030-0x800037 : Coin control (active LOW, active HIGH)
 *   0x800100-0x80013F : CPS-A custom registers (64 bytes)
 *   0x800140-0x80017F : CPS-B custom registers (read/write)
 *   0x800180-0x800187 : Sound latch (write → Z80)
 *   0x800188-0x80018F : Sound latch 2 / timer fade
 *   0x900000-0x92FFFF : VRAM / GFX RAM (192KB, writeable + executable)
 *   0xFF0000-0xFFFFFF : Work RAM (64KB)
 *
 * The 68000 is big-endian: MSB at lower address.
 */

import type { BusInterface } from '../types';
export type { BusInterface };

export class Bus implements BusInterface {
  private programRom: Uint8Array;
  private cpsaRegisters: Uint8Array; // 0x800100-0x80013F (64 bytes)
  private cpsbRegisters: Uint8Array; // 0x800140-0x80017F (64 bytes)
  private ioPorts: Uint8Array;       // Player inputs + DIP switches (mapped)
  private soundLatch: Uint8Array;    // 0x800180-0x80018F (16 bytes)
  private coinCtrl: Uint8Array;      // 0x800030-0x800037 (8 bytes)
  private vram: Uint8Array;          // 0x900000-0x92FFFF (192KB)
  private workRam: Uint8Array;       // 0xFF0000-0xFFFFFF (64KB)
  private _soundLatchCallback: ((value: number) => void) | null = null;

  // Callback for IRQ acknowledge — set by the emulator to clear interrupt lines
  private irqAckCallback: (() => void) | null = null;

  constructor() {
    this.programRom = new Uint8Array(0);
    this.cpsaRegisters = new Uint8Array(0x40); // 64 bytes
    this.cpsbRegisters = new Uint8Array(0x40); // 64 bytes
    // CPS-B registers default to 0xFF (MAME returns 0xFFFF for unknown reads)
    this.cpsbRegisters.fill(0xFF);
    this.ioPorts = new Uint8Array(0x20);       // 32 bytes (0x800000-0x80001F)
    this.soundLatch = new Uint8Array(0x10);    // 16 bytes
    this.coinCtrl = new Uint8Array(0x08);      // 8 bytes
    this.vram = new Uint8Array(0x30000);       // 192KB
    this.workRam = new Uint8Array(0x10000);    // 64KB

    // I/O ports default to 0xFF (active LOW = all buttons released)
    this.ioPorts.fill(0xFF);

  }

  /** Set CPS-B ID register for the current game */
  setCpsBId(offset: number, value: number): void {
    if (offset >= 0 && offset + 1 < this.cpsbRegisters.length) {
      this.cpsbRegisters[offset] = (value >> 8) & 0xFF;
      this.cpsbRegisters[offset + 1] = value & 0xFF;
    }
  }

  loadProgramRom(data: Uint8Array): void {
    this.programRom = data;
  }

  setIrqAckCallback(cb: () => void): void {
    this.irqAckCallback = cb;
  }

  getVram(): Uint8Array {
    return this.vram;
  }

  getCpsaRegisters(): Uint8Array {
    return this.cpsaRegisters;
  }

  getCpsbRegisters(): Uint8Array {
    return this.cpsbRegisters;
  }

  getSoundLatch(): Uint8Array {
    return this.soundLatch;
  }

  setSoundLatchCallback(cb: (value: number) => void): void {
    this._soundLatchCallback = cb;
  }

  getWorkRam(): Uint8Array {
    return this.workRam;
  }

  getIoPorts(): Uint8Array {
    return this.ioPorts;
  }

  read8(address: number): number {
    address = (address >>> 0) & 0xFFFFFF; // 68000 has 24-bit address bus

    // Program ROM: 0x000000-0x3FFFFF
    if (address <= 0x3FFFFF) {
      if (address < this.programRom.length) {
        return this.programRom[address]!;
      }
      return 0xFF;
    }

    // Player inputs: 0x800000-0x800007
    if (address >= 0x800000 && address <= 0x800007) {
      return this.ioPorts[address - 0x800000]!;
    }

    // DIP switches / system: 0x800018-0x80001F
    if (address >= 0x800018 && address <= 0x80001F) {
      return this.ioPorts[address - 0x800018 + 0x08]!;
    }

    // Coin control: 0x800030-0x800037
    if (address >= 0x800030 && address <= 0x800037) {
      return this.coinCtrl[address - 0x800030]!;
    }

    // CPS-A registers: 0x800100-0x80013F
    if (address >= 0x800100 && address <= 0x80013F) {
      return this.cpsaRegisters[address - 0x800100]!;
    }

    // CPS-B registers: 0x800140-0x80017F
    if (address >= 0x800140 && address <= 0x80017F) {
      return this.cpsbRegisters[address - 0x800140]!;
    }

    // Sound latch: 0x800180-0x80018F
    if (address >= 0x800180 && address <= 0x80018F) {
      return this.soundLatch[address - 0x800180]!;
    }

    // VRAM: 0x900000-0x92FFFF
    if (address >= 0x900000 && address <= 0x92FFFF) {
      return this.vram[address - 0x900000]!;
    }

    // Work RAM: 0xFF0000-0xFFFFFF
    if (address >= 0xFF0000 && address <= 0xFFFFFF) {
      return this.workRam[address - 0xFF0000]!;
    }

    // Unmapped
    return 0x00;
  }

  read16(address: number): number {
    return (this.read8(address) << 8) | this.read8(address + 1);
  }

  read32(address: number): number {
    return (
      ((this.read8(address) << 24) |
       (this.read8(address + 1) << 16) |
       (this.read8(address + 2) << 8) |
        this.read8(address + 3)) >>> 0
    );
  }

  write8(address: number, value: number): void {
    address = (address >>> 0) & 0xFFFFFF; // 68000 has 24-bit address bus
    value = value & 0xFF;

    // Program ROM: read-only
    if (address <= 0x3FFFFF) {
      return;
    }

    // Coin control: 0x800030-0x800037
    if (address >= 0x800030 && address <= 0x800037) {
      this.coinCtrl[address - 0x800030] = value;
      return;
    }

    // CPS-A registers: 0x800100-0x80013F
    if (address >= 0x800100 && address <= 0x80013F) {
      this.cpsaRegisters[address - 0x800100] = value;
      return;
    }

    // CPS-B registers: 0x800140-0x80017F
    if (address >= 0x800140 && address <= 0x80017F) {
      this.cpsbRegisters[address - 0x800140] = value;
      return;
    }

    // Sound latch: 0x800180-0x80018F
    if (address >= 0x800180 && address <= 0x80018F) {
      this.soundLatch[address - 0x800180] = value;
      // Immediately forward to Z80 bus (real-time, not frame-synced)
      if (value !== 0 && this._soundLatchCallback !== null) {
        this._soundLatchCallback(value);
      }
      return;
    }

    // VRAM: 0x900000-0x92FFFF
    if (address >= 0x900000 && address <= 0x92FFFF) {
      this.vram[address - 0x900000] = value;
      return;
    }

    // Work RAM: 0xFF0000-0xFFFFFF
    if (address >= 0xFF0000 && address <= 0xFFFFFF) {
      this.workRam[address - 0xFF0000] = value;
      return;
    }

    // Unmapped: ignore
  }

  write16(address: number, value: number): void {
    this.write8(address, (value >> 8) & 0xFF);
    this.write8(address + 1, value & 0xFF);
  }

  write32(address: number, value: number): void {
    this.write8(address, (value >>> 24) & 0xFF);
    this.write8(address + 1, (value >>> 16) & 0xFF);
    this.write8(address + 2, (value >>> 8) & 0xFF);
    this.write8(address + 3, value & 0xFF);
  }
}
