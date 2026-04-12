/**
 * Neo-Geo Z80 Audio CPU Memory Bus
 *
 * Memory map (ref: MAME neogeo.cpp audio_map):
 *   0x0000-0x7FFF : M-ROM fixed (32KB)
 *   0x8000-0xBFFF : M-ROM banked window 3 (16KB, NEO-ZMC2)
 *   0xC000-0xDFFF : M-ROM banked window 2 (8KB)
 *   0xE000-0xEFFF : M-ROM banked window 1 (4KB)
 *   0xF000-0xF7FF : M-ROM banked window 0 (2KB)
 *   0xF800-0xFFFF : Work RAM (2KB)
 *
 * I/O ports (critical — all YM2610 access goes through ports):
 *   0x00 : Sound latch read / clear pending (write)
 *   0x04 : YM2610 address port 0 (regs 0x00-0xFF)
 *   0x05 : YM2610 data port 0 / status read
 *   0x06 : YM2610 address port 1 (regs 0x100-0x1FF)
 *   0x07 : YM2610 data port 1 / status read
 *   0x08 : NMI enable (write) / bank switch (read, NEO-ZMC2)
 *   0x09-0x0B : Bank switch (read, NEO-ZMC2)
 *   0x0C : Sound reply to 68K
 *   0x18 : NMI disable
 */

import type { Z80BusInterface } from '../types';

export interface NeoGeoZ80BusState {
  bankRegisters: number[];
  soundLatchValue: number;
  soundLatchQueue: number[];
  nmiEnabled: boolean;
}

export class NeoGeoZ80Bus implements Z80BusInterface {
  private audioRom: Uint8Array;        // Game M-ROM
  private biosRom: Uint8Array;        // BIOS Z80 ROM (sm1.sm1)
  private workRam: Uint8Array;        // 2KB (0xF800-0xFFFF)
  // NEO-ZMC2 bank registers: 4 windows into M-ROM
  // Window 0: 0xF000-0xF7FF (2KB), Window 1: 0xE000-0xEFFF (4KB)
  // Window 2: 0xC000-0xDFFF (8KB), Window 3: 0x8000-0xBFFF (16KB)
  private bankRegisters: number[];    // 4 bank registers (bank entry per window)

  // Sound latch
  private soundLatchValue: number;
  private soundLatchQueue: number[];
  private soundLatchPending: boolean;

  // NMI control (NMI fires once per sound command — edge-triggered)
  private nmiEnabled: boolean;
  private nmiPulse: boolean;

  // YM2610 interface (via I/O ports)
  private ym2610AddrPort0: number;
  private ym2610AddrPort1: number;
  private onYm2610Write: ((port: number, value: number) => void) | null;
  private onYm2610Read: ((port: number) => number) | null;
  // Simulated YM2610 timer counter (for when no real YM2610 is connected)
  private ym2610TimerCounter: number;

  // ROM banking: BIOS vs game M-ROM at 0x0000-0x7FFF
  private useGameRom: boolean = false;

  // Reply to 68K
  private onSoundReply: ((value: number) => void) | null;
  // Called when Z80 reads port 0x00 (consumes sound command)
  private onSoundConsumed: (() => void) | null;

  constructor() {
    this.audioRom = new Uint8Array(0);
    this.biosRom = new Uint8Array(0);
    this.workRam = new Uint8Array(0x0800); // 2KB
    // FBNeo: initial banks = linear identity mapping (addr = ROM offset)
    // Window 0 (2KB): bank 0x1E → 0x1E * 0x800 = 0xF000
    // Window 1 (4KB): bank 0x0E → 0x0E * 0x1000 = 0xE000
    // Window 2 (8KB): bank 0x06 → 0x06 * 0x2000 = 0xC000
    // Window 3 (16KB): bank 0x02 → 0x02 * 0x4000 = 0x8000
    this.bankRegisters = [0x1E, 0x0E, 0x06, 0x02];

    this.soundLatchValue = 0;
    this.soundLatchQueue = [];
    this.soundLatchPending = false;
    this.nmiEnabled = true;
    this.nmiPulse = false;

    this.ym2610AddrPort0 = 0;
    this.ym2610AddrPort1 = 0;
    this.onYm2610Write = null;
    this.onYm2610Read = null;
    this.ym2610TimerCounter = 0;
    this.onSoundReply = null;
    this.onSoundConsumed = null;
  }

  loadAudioRom(data: Uint8Array): void { this.audioRom = data; }
  loadBiosRom(data: Uint8Array): void { this.biosRom = data; }

  /** Switch Z80 fixed ROM at 0x0000-0x7FFF between BIOS and game M-ROM */
  setUseGameRom(useGame: boolean): void { this.useGameRom = useGame; }

  setYm2610WriteCallback(cb: (port: number, value: number) => void): void {
    this.onYm2610Write = cb;
  }

  setYm2610ReadCallback(cb: (port: number) => number): void {
    this.onYm2610Read = cb;
  }

  setSoundReplyCallback(cb: (value: number) => void): void {
    this.onSoundReply = cb;
  }

  getSoundReplyCallback(): ((value: number) => void) | null {
    return this.onSoundReply;
  }

  setSoundConsumedCallback(cb: () => void): void {
    this.onSoundConsumed = cb;
  }

  /** Push a sound command from the 68K */
  pushSoundLatch(value: number): void {
    this.soundLatchQueue.push(value);
    if (!this.soundLatchPending) {
      this.soundLatchValue = this.soundLatchQueue.shift()!;
      this.soundLatchPending = true;
      this.nmiPulse = true; // Edge-triggered: set pulse flag
    }
  }

  /** Check if NMI should fire — edge-triggered (fires once per command) */
  shouldFireNmi(): boolean {
    if (this.nmiEnabled && this.nmiPulse) {
      this.nmiPulse = false; // Consume the pulse — won't re-trigger until next push
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Z80BusInterface — Memory access
  // ---------------------------------------------------------------------------

  read(address: number): number {
    address &= 0xFFFF;

    // Fixed ROM: 0x0000-0x7FFF (32KB)
    if (address <= 0x7FFF) {
      const rom = (this.useGameRom || this.biosRom.length === 0)
        ? this.audioRom : this.biosRom;
      return address < rom.length ? rom[address]! : 0xFF;
    }

    // Work RAM: 0xF800-0xFFFF (2KB)
    if (address >= 0xF800) {
      return this.workRam[address & 0x07FF]!;
    }

    // Banked ROM windows (NEO-ZMC2) — all read from game M-ROM
    // Window 0: 0xF000-0xF7FF (2KB)
    if (address >= 0xF000) {
      const romAddr = this.bankRegisters[0]! * 0x0800 + (address - 0xF000);
      return romAddr < this.audioRom.length ? this.audioRom[romAddr]! : 0xFF;
    }
    // Window 1: 0xE000-0xEFFF (4KB)
    if (address >= 0xE000) {
      const romAddr = this.bankRegisters[1]! * 0x1000 + (address - 0xE000);
      return romAddr < this.audioRom.length ? this.audioRom[romAddr]! : 0xFF;
    }
    // Window 2: 0xC000-0xDFFF (8KB)
    if (address >= 0xC000) {
      const romAddr = this.bankRegisters[2]! * 0x2000 + (address - 0xC000);
      return romAddr < this.audioRom.length ? this.audioRom[romAddr]! : 0xFF;
    }
    // Window 3: 0x8000-0xBFFF (16KB)
    {
      const romAddr = this.bankRegisters[3]! * 0x4000 + (address - 0x8000);
      return romAddr < this.audioRom.length ? this.audioRom[romAddr]! : 0xFF;
    }
  }

  write(address: number, value: number): void {
    address &= 0xFFFF;

    // Work RAM: 0xF800-0xFFFF (2KB)
    if (address >= 0xF800) {
      this.workRam[address & 0x07FF] = value & 0xFF;
      return;
    }
    // ROM area — ignore writes
  }

  // ---------------------------------------------------------------------------
  // Z80BusInterface — I/O ports (CRITICAL for Neo-Geo audio)
  // ---------------------------------------------------------------------------

  ioRead(port: number): number {
    // NEO-ZMC2 bank switching uses the full 16-bit port address:
    // Z80 "IN A,(n)" puts A on bits 8-15, n on bits 0-7.
    // The bank value comes from the upper byte.
    const lowPort = port & 0xFF;

    switch (lowPort) {
      case 0x00: // Sound latch (command from 68K) — reading clears NMI pending
        this.soundLatchPending = false;
        this.onSoundConsumed?.();
        return this.soundLatchValue;

      case 0x04: // YM2610 status port 0
      case 0x05: // YM2610 data port 0 read
        if (this.onYm2610Read) return this.onYm2610Read(lowPort & 1);
        return 0x00;

      case 0x06: // YM2610 status port 1
      case 0x07: // YM2610 data port 1 read
        if (this.onYm2610Read) return this.onYm2610Read((lowPort & 1) + 2);
        return 0;

      // NEO-ZMC2 bank switch — triggered by READ (IN instruction)
      // Bank value = upper byte of port address (bits 8-15)
      case 0x08: // Window 0 (0xF000-0xF7FF, 2KB)
      case 0x09: // Window 1 (0xE000-0xEFFF, 4KB)
      case 0x0A: // Window 2 (0xC000-0xDFFF, 8KB)
      case 0x0B: { // Window 3 (0x8000-0xBFFF, 16KB)
        const window = lowPort - 0x08;
        const bankValue = (port >> 8) & 0xFF;
        this.bankRegisters[window] = bankValue;
        return 0;
      }

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
        // Dequeue next command if available — fire NMI for it
        if (this.soundLatchQueue.length > 0) {
          this.soundLatchValue = this.soundLatchQueue.shift()!;
          this.soundLatchPending = true;
          this.nmiPulse = true;
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

      case 0x08: // NMI enable (bank switching is on READ, not write)
        this.nmiEnabled = true;
        break;

      case 0x0C: // Sound reply to 68K
        console.log(`[Neo-Geo Z80] Reply to 68K: 0x${value.toString(16)}`);
        this.onSoundReply?.(value);
        break;

      case 0x18: // NMI disable
        this.nmiEnabled = false;
        break;

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  /** Reset latch + NMI state (call after Z80 reset to avoid stuck NMI) */
  resetLatchState(): void {
    this.soundLatchValue = 0;
    this.soundLatchQueue.length = 0;
    this.soundLatchPending = false;
    this.nmiPulse = false;
    this.nmiEnabled = true;
  }

  getState(): NeoGeoZ80BusState {
    return {
      bankRegisters: [...this.bankRegisters],
      soundLatchValue: this.soundLatchValue,
      soundLatchQueue: [...this.soundLatchQueue],
      nmiEnabled: this.nmiEnabled,
    };
  }

  setState(state: NeoGeoZ80BusState): void {
    this.bankRegisters = [...(state.bankRegisters ?? [0, 0, 0, 0])];
    this.soundLatchValue = state.soundLatchValue;
    this.soundLatchQueue = [...state.soundLatchQueue];
    this.nmiEnabled = state.nmiEnabled;
  }
}
