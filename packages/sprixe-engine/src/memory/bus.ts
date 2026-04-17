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
import { EEPROM93C46 } from './eeprom-93c46';
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
  private _soundLatch2Callback: ((value: number) => void) | null = null;
  // Debug: VRAM write watchpoint callback (address, value)
  private _vramWatchCallback: ((addr: number, value: number, isWord: boolean) => void) | null = null;
  // QSound shared RAM (set by emulator for QSound games)
  private _qsoundSharedRam1: Uint8Array | null = null; // 68K: 0xF18000-0xF19FFF
  private _qsoundSharedRam2: Uint8Array | null = null; // 68K: 0xF1E000-0xF1FFFF
  private _eeprom: EEPROM93C46 | null = null;

  // Palette ROM source map: VRAM offset → ROM source address
  // Built by capturing A0 (ROM pointer) during MOVE.L/MOVE.W (A0)+,(A1)+ palette copies
  private _m68kGetA0: (() => number) | null = null;
  private _paletteRomSource = new Map<number, number>(); // vramOff → romAddr

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

  getCoinCtrl(): Uint8Array {
    return this.coinCtrl;
  }

  setSoundLatchCallback(cb: (value: number) => void): void {
    this._soundLatchCallback = cb;
  }

  setSoundLatch2Callback(cb: (value: number) => void): void {
    this._soundLatch2Callback = cb;
  }

  /** Debug: set a watchpoint on VRAM writes */
  setVramWatchCallback(cb: ((addr: number, value: number, isWord: boolean) => void) | null): void {
    this._vramWatchCallback = cb;
  }

  /** Set direct QSound callback (bypass Z80 for testing) */
  /** Set EEPROM for QSound games */
  setEeprom(eeprom: EEPROM93C46 | null): void {
    this._eeprom = eeprom;
  }

  /** Set QSound shared RAM references (from Z80BusQSound), or null to clear */
  setQsoundSharedRam(ram1: Uint8Array | null, ram2: Uint8Array | null): void {
    this._qsoundSharedRam1 = ram1;
    this._qsoundSharedRam2 = ram2;
  }

  getWorkRam(): Uint8Array {
    return this.workRam;
  }

  /** Set M68K A0 getter for palette ROM source tracing */
  setM68kA0Getter(getter: () => number): void {
    this._m68kGetA0 = getter;
  }

  /** Palette ROM source map: VRAM offset → ROM address the data was copied from */
  getPaletteRomSource(): Map<number, number> {
    return this._paletteRomSource;
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

    // Sound latch: 0x800180-0x80018F — WRITE ONLY (MAME: .w() only)
    // Reads fall through to unmapped (0xFF)

    // VRAM: 0x900000-0x92FFFF
    if (address >= 0x900000 && address <= 0x92FFFF) {
      return this.vram[address - 0x900000]!;
    }

    // QSound I/O: 0xF1C000-0xF1C007 (player 3/4 + EEPROM)
    if (this._qsoundSharedRam1 !== null && address >= 0xF1C000 && address <= 0xF1C007) {
      // 0xF1C000-0xF1C001: IN2 (player 3), 0xF1C002-0xF1C003: IN3 (player 4)
      if (address <= 0xF1C003) return 0xFF; // no buttons pressed
      // 0xF1C006-0xF1C007: EEPROM read — bit 0 = DO (data out)
      if (address >= 0xF1C006 && this._eeprom) {
        return (address & 1) ? this._eeprom.read() : 0xFF;
      }
      return 0xFF;
    }

    // QSound shared RAM 1: 0xF18000-0xF19FFF (4KB, only low byte)
    if (this._qsoundSharedRam1 !== null && address >= 0xF18000 && address <= 0xF19FFF) {
      if (address & 1) return this._qsoundSharedRam1[(address - 0xF18000) >> 1]!;
      return 0xFF;
    }

    // QSound shared RAM 2: 0xF1E000-0xF1FFFF (4KB, only low byte)
    if (this._qsoundSharedRam2 !== null && address >= 0xF1E000 && address <= 0xF1FFFF) {
      if (address & 1) return this._qsoundSharedRam2[(address - 0xF1E000) >> 1]!;
      return 0xFF;
    }

    // Work RAM: 0xFF0000-0xFFFFFF
    if (address >= 0xFF0000 && address <= 0xFFFFFF) {
      return this.workRam[address - 0xFF0000]!;
    }

    // Unmapped — return 0xFF (open bus, matches MAME)
    return 0xFF;
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
      // CPS-B multiplication hardware (used by SF2CE, SF2HF, etc.)
      // Two 16-bit factors at offsets 0-1 and 2-3, result at offsets 4-7.
      // Recompute on any write to the factor registers.
      const offset = address - 0x800140;
      if (offset < 4) {
        const regs = this.cpsbRegisters;
        const factor1 = (regs[0]! << 8) | regs[1]!;
        const factor2 = (regs[2]! << 8) | regs[3]!;
        const result = (factor1 * factor2) >>> 0;
        // result_lo (lower 16 bits) at offsets 4-5, big-endian
        regs[4] = (result >> 8) & 0xFF;
        regs[5] = result & 0xFF;
        // result_hi (upper 16 bits) at offsets 6-7, big-endian
        regs[6] = (result >> 24) & 0xFF;
        regs[7] = (result >> 16) & 0xFF;
      }
      return;
    }

    // Sound latch 1: 0x800180-0x800187
    if (address >= 0x800180 && address <= 0x800187) {
      this.soundLatch[address - 0x800180] = value;
      if ((address & 1) === 1 && this._soundLatchCallback !== null) {
        this._soundLatchCallback(value);
      }
      return;
    }

    // Sound latch 2: 0x800188-0x80018F
    if (address >= 0x800188 && address <= 0x80018F) {
      this.soundLatch[address - 0x800180] = value;
      if ((address & 1) === 1 && this._soundLatch2Callback !== null) {
        this._soundLatch2Callback(value);
      }
      return;
    }

    // VRAM: 0x900000-0x92FFFF
    if (address >= 0x900000 && address <= 0x92FFFF) {
      this.vram[address - 0x900000] = value;
      if (this._vramWatchCallback !== null) {
        this._vramWatchCallback(address, value, false);
      }
      return;
    }

    // QSound shared RAM 1: 0xF18000-0xF19FFF (only low byte writable)
    if (this._qsoundSharedRam1 !== null && address >= 0xF18000 && address <= 0xF19FFF) {
      if (address & 1) {
        this._qsoundSharedRam1[(address - 0xF18000) >> 1] = value;
      }
      return;
    }

    // QSound I/O writes: 0xF1C004-0xF1C007 (coin control 2, EEPROM)
    if (this._qsoundSharedRam1 !== null && address >= 0xF1C004 && address <= 0xF1C007) {
      // 0xF1C006-0xF1C007: EEPROM write — bit 0=DI, bit 6=CLK, bit 7=CS
      if (address >= 0xF1C006 && (address & 1) && this._eeprom) {
        this._eeprom.write(value);
      }
      return;
    }

    // QSound shared RAM 2: 0xF1E000-0xF1FFFF (only low byte writable)
    if (this._qsoundSharedRam2 !== null && address >= 0xF1E000 && address <= 0xF1FFFF) {
      if (address & 1) this._qsoundSharedRam2[(address - 0xF1E000) >> 1] = value;
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
    // Track ROM→VRAM copies in palette area only (192 palettes × 32 bytes = 0x1800)
    if (this._m68kGetA0 !== null && address >= 0x900000 && address < 0x901800) {
      const a0 = this._m68kGetA0();
      // Quick check: A0 must point into program ROM range (post-increment, so A0-2)
      if (a0 >= 2 && a0 <= this.programRom.length) {
        const srcAddr = a0 - 2;
        const romVal = (this.programRom[srcAddr]! << 8) | this.programRom[srcAddr + 1]!;
        if (romVal === value) {
          this._paletteRomSource.set(address - 0x900000, srcAddr);
        }
      }
    }
    this.write8(address, (value >> 8) & 0xFF);
    this.write8(address + 1, value & 0xFF);
  }

  write32(address: number, value: number): void {
    // Track ROM→VRAM copies in palette area only (192 palettes × 32 bytes = 0x1800)
    if (this._m68kGetA0 !== null && address >= 0x900000 && address < 0x901800) {
      const a0 = this._m68kGetA0();
      if (a0 >= 4 && a0 <= this.programRom.length) {
        const srcAddr = a0 - 4;
        const r = this.programRom;
        const romVal = ((r[srcAddr]! << 24) | (r[srcAddr+1]! << 16) | (r[srcAddr+2]! << 8) | r[srcAddr+3]!) >>> 0;
        if (romVal === (value >>> 0)) {
          const vOff = address - 0x900000;
          this._paletteRomSource.set(vOff, srcAddr);
          this._paletteRomSource.set(vOff + 2, srcAddr + 2);
        }
      }
    }
    this.write8(address, (value >>> 24) & 0xFF);
    this.write8(address + 1, (value >>> 16) & 0xFF);
    this.write8(address + 2, (value >>> 8) & 0xFF);
    this.write8(address + 3, value & 0xFF);
  }
}
