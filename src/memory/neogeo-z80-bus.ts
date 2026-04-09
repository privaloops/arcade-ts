/**
 * Neo-Geo Z80 Audio CPU Memory Bus
 *
 * Memory map:
 *   0x0000-0x7FFF : M-ROM fixed (32KB)
 *   0x8000-0xBFFF : M-ROM banked (16KB window, NEO-ZMC2)
 *   0xC000-0xDFFF : Work RAM (8KB)
 *   0xE000-0xFFFF : Work RAM mirror
 *
 * I/O ports (critical — all YM2610 access goes through ports):
 *   0x00 : Sound latch read / clear pending (write)
 *   0x04 : YM2610 address port 0 (regs 0x00-0xFF)
 *   0x05 : YM2610 data port 0 / status read
 *   0x06 : YM2610 address port 1 (regs 0x100-0x1FF)
 *   0x07 : YM2610 data port 1 / status read
 *   0x08 : NMI enable / bank switch
 *   0x0C : Sound reply to 68K
 *   0x18 : NMI disable
 */

import type { Z80BusInterface } from '../types';

export interface NeoGeoZ80BusState {
  currentBank: number;
  soundLatchValue: number;
  soundLatchQueue: number[];
  nmiEnabled: boolean;
}

export class NeoGeoZ80Bus implements Z80BusInterface {
  private audioRom: Uint8Array;
  private workRam: Uint8Array;        // 8KB
  private currentBank: number;        // current 16KB bank for 0x8000-0xBFFF
  private bankRegisters: number[];    // 4 bank registers

  // Sound latch
  private soundLatchValue: number;
  private soundLatchQueue: number[];
  private soundLatchPending: boolean;

  // NMI control (NMI fires when 68K writes a sound command)
  private nmiEnabled: boolean;

  // YM2610 interface (via I/O ports)
  private ym2610AddrPort0: number;
  private ym2610AddrPort1: number;
  private onYm2610Write: ((port: number, value: number) => void) | null;
  private onYm2610Read: ((port: number) => number) | null;

  // Reply to 68K
  private onSoundReply: ((value: number) => void) | null;

  constructor() {
    this.audioRom = new Uint8Array(0);
    this.workRam = new Uint8Array(0x2000); // 8KB
    this.currentBank = 0;
    this.bankRegisters = [0, 0, 0, 0];

    this.soundLatchValue = 0;
    this.soundLatchQueue = [];
    this.soundLatchPending = false;
    this.nmiEnabled = true;

    this.ym2610AddrPort0 = 0;
    this.ym2610AddrPort1 = 0;
    this.onYm2610Write = null;
    this.onYm2610Read = null;
    this.onSoundReply = null;
  }

  loadAudioRom(data: Uint8Array): void { this.audioRom = data; }

  setYm2610WriteCallback(cb: (port: number, value: number) => void): void {
    this.onYm2610Write = cb;
  }

  setYm2610ReadCallback(cb: (port: number) => number): void {
    this.onYm2610Read = cb;
  }

  setSoundReplyCallback(cb: (value: number) => void): void {
    this.onSoundReply = cb;
  }

  /** Push a sound command from the 68K */
  pushSoundLatch(value: number): void {
    this.soundLatchQueue.push(value);
    if (!this.soundLatchPending) {
      this.soundLatchValue = this.soundLatchQueue.shift()!;
      this.soundLatchPending = true;
    }
  }

  /** Check if NMI should fire (called after 68K writes sound command) */
  shouldFireNmi(): boolean {
    return this.nmiEnabled && this.soundLatchPending;
  }

  // ---------------------------------------------------------------------------
  // Z80BusInterface — Memory access
  // ---------------------------------------------------------------------------

  read(address: number): number {
    address &= 0xFFFF;

    // M-ROM fixed: 0x0000-0x7FFF
    if (address <= 0x7FFF) {
      return address < this.audioRom.length ? this.audioRom[address]! : 0xFF;
    }

    // M-ROM banked: 0x8000-0xBFFF (16KB window)
    if (address <= 0xBFFF) {
      const bankOffset = this.currentBank * 0x4000;
      const romAddr = bankOffset + (address - 0x8000);
      return romAddr < this.audioRom.length ? this.audioRom[romAddr]! : 0xFF;
    }

    // Work RAM: 0xC000-0xDFFF (8KB) + mirror 0xE000-0xFFFF
    if (address >= 0xC000) {
      return this.workRam[(address - 0xC000) & 0x1FFF]!;
    }

    return 0xFF;
  }

  write(address: number, value: number): void {
    address &= 0xFFFF;

    // Work RAM: 0xC000-0xDFFF + mirror 0xE000-0xFFFF
    if (address >= 0xC000) {
      this.workRam[(address - 0xC000) & 0x1FFF] = value & 0xFF;
      return;
    }
    // ROM area — ignore writes
  }

  // ---------------------------------------------------------------------------
  // Z80BusInterface — I/O ports (CRITICAL for Neo-Geo audio)
  // ---------------------------------------------------------------------------

  ioRead(port: number): number {
    port &= 0xFF;

    switch (port) {
      case 0x00: // Sound latch (command from 68K)
        return this.soundLatchValue;

      case 0x04: // YM2610 status port 0
      case 0x05: // YM2610 data port 0 read
        return this.onYm2610Read ? this.onYm2610Read(port & 1) : 0;

      case 0x06: // YM2610 status port 1
      case 0x07: // YM2610 data port 1 read
        return this.onYm2610Read ? this.onYm2610Read((port & 1) + 2) : 0;

      default:
        return 0xFF;
    }
  }

  ioWrite(port: number, value: number): void {
    port &= 0xFF;
    value &= 0xFF;

    switch (port) {
      case 0x00: // Clear sound latch pending
        this.soundLatchPending = false;
        // Dequeue next command if available
        if (this.soundLatchQueue.length > 0) {
          this.soundLatchValue = this.soundLatchQueue.shift()!;
          this.soundLatchPending = true;
        }
        break;

      case 0x04: // YM2610 address port 0
        this.ym2610AddrPort0 = value;
        this.onYm2610Write?.(0, value); // port 0 = address low
        break;

      case 0x05: // YM2610 data port 0
        this.onYm2610Write?.(1, value); // port 1 = data low
        break;

      case 0x06: // YM2610 address port 1
        this.ym2610AddrPort1 = value;
        this.onYm2610Write?.(2, value); // port 2 = address high
        break;

      case 0x07: // YM2610 data port 1
        this.onYm2610Write?.(3, value); // port 3 = data high
        break;

      case 0x08: // NMI enable + bank switch
        this.nmiEnabled = true;
        // Bank switch: value selects the bank
        this.updateBank(value);
        break;

      case 0x0C: // Sound reply to 68K
        console.log(`[Neo-Geo Z80] Reply to 68K: 0x${value.toString(16)}`);
        this.onSoundReply?.(value);
        break;

      case 0x18: // NMI disable
        this.nmiEnabled = false;
        break;

      default:
        // Bank switch registers (0x08-0x0B)
        if (port >= 0x08 && port <= 0x0B) {
          this.bankRegisters[port - 0x08] = value;
          this.updateBank(value);
        }
        break;
    }
  }

  private updateBank(value: number): void {
    // NEO-ZMC2 banking: bank = value, maps 16KB window at 0x8000
    // Simple banking: skip the first 32KB (fixed area), then 16KB banks
    this.currentBank = ((value & 0x1F) + 2); // +2 to skip the fixed 32KB (banks 0-1)
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  getState(): NeoGeoZ80BusState {
    return {
      currentBank: this.currentBank,
      soundLatchValue: this.soundLatchValue,
      soundLatchQueue: [...this.soundLatchQueue],
      nmiEnabled: this.nmiEnabled,
    };
  }

  setState(state: NeoGeoZ80BusState): void {
    this.currentBank = state.currentBank;
    this.soundLatchValue = state.soundLatchValue;
    this.soundLatchQueue = [...state.soundLatchQueue];
    this.nmiEnabled = state.nmiEnabled;
  }
}
