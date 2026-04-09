/**
 * Neo-Geo 68000 Main CPU Memory Bus
 *
 * Memory map (MVS, 24-bit big-endian):
 *   0x000000-0x0FFFFF : P-ROM (1MB, or banked if > 1MB)
 *   0x100000-0x10FFFF : Work RAM (64KB)
 *   0x200000-0x2FFFFF : P-ROM bank / mirror
 *   0x300000-0x300001 : Port P1 (joystick + A/B/C/D, active LOW)
 *   0x300080-0x300081 : REG_DIPSW
 *   0x320000-0x320001 : REG_SOUND (read=Z80 reply, write=Z80 command)
 *   0x340000-0x340001 : Port system (start, coin, select)
 *   0x380000-0x380001 : REG_STATUS_B (MVS/AES flag)
 *   0x3A0000-0x3A001F : Control registers (watchdog, IRQ ack)
 *   0x3C0000-0x3C000F : LSPC registers (VRAM addr/data/mod, timer, IRQ)
 *   0x400000-0x401FFF : Palette RAM (8KB)
 *   0x800000-0x800FFF : Memory card (optional)
 *   0xC00000-0xC1FFFF : BIOS ROM (128KB)
 *   0xD00000-0xD0FFFF : BIOS SRAM (backup, 64KB)
 */

import type { BusInterface } from '../types';
import { PD4990A } from './pd4990a';

export class NeoGeoBus implements BusInterface {
  private programRom: Uint8Array;
  private biosRom: Uint8Array;
  private workRam: Uint8Array;        // 64KB
  private backupRam: Uint8Array;      // 64KB BIOS SRAM
  private paletteRam: Uint8Array;     // 8KB (4096 x 16-bit words)
  private vram: Uint8Array;           // 68KB VRAM (accessed indirectly)

  // I/O port registers (active LOW for buttons)
  private portP1: number = 0xFF;
  private portP2: number = 0xFF;
  private portSystem: number = 0xFF;
  private portStatus: number = 0x00;  // bit 0: 0=AES, 1=MVS

  // LSPC VRAM indirect access
  private vramAddr: number = 0;
  private vramMod: number = 0;        // auto-increment value
  private _vramWriteCount: number = 0; // debug: count VRAM writes
  getVramWriteCount(): number { return this._vramWriteCount; }

  // LSPC timer
  private timerHigh: number = 0;
  private timerLow: number = 0;
  private timerCounter: number = 0;
  private timerReload: number = 0;
  private timerRunning: boolean = false;

  // IRQ state (bits: 0=VBlank, 1=timer, 2=coldboot)
  private irqPending: number = 0x04;  // IRQ3 pending at boot
  private irqControl: number = 0;

  // Sound latch
  private soundLatchToZ80: number = 0;
  private soundLatchFromZ80: number = 0;  // Z80 reply (read in upper byte of 0x320000)
  private soundCommandPending: boolean = false; // set when 68K writes, cleared when Z80 reads
  private _soundLatchCallback: ((value: number) => void) | null = null;
  private _onSoundReadSync: (() => void) | null = null;

  // pd4990a RTC chip
  private rtc: PD4990A;
  // Total 68K cycles accumulated (for RTC tick counting)
  private totalCycles = 0;

  // P-ROM banking: 0x200000-0x2FFFFF region
  // Default = 0 (mirror of P-ROM start). For games > 1MB, bank switch changes this.
  private pRomBankOffset: number = 0;

  // BIOS/P-ROM bank switch: at reset, BIOS is mapped to 0x000000.
  // BIOS writes REG_SWPROM (0x3A0003) to switch P-ROM to 0x000000.
  // BIOS writes REG_SWPBIOS (0x3A0001) to switch BIOS back.
  private biosMode: boolean = true; // true = BIOS at 0x000000, false = P-ROM

  constructor() {
    this.programRom = new Uint8Array(0);
    this.biosRom = new Uint8Array(0);
    this.workRam = new Uint8Array(0x10000);   // 64KB
    this.backupRam = new Uint8Array(0x10000); // 64KB
    this.paletteRam = new Uint8Array(0x2000); // 8KB
    this.vram = new Uint8Array(0x11000);      // ~68KB (slow 64KB + fast ~4KB)
    // pd4990a RTC — uses 68K cycle count for timing
    this.rtc = new PD4990A(12_000_000, () => this.totalCycles);
  }

  /** Add 68K cycles to the total (call from emulator per step) */
  addCycles(n: number): void { this.totalCycles += n; }

  loadProgramRom(data: Uint8Array): void { this.programRom = data; }
  loadBiosRom(data: Uint8Array): void { this.biosRom = data; }

  /** Reset bus state (call when CPU is reset) */
  resetBus(): void {
    this.biosMode = true; // BIOS mapped at 0x000000 at reset
    this.irqPending = 0x04; // IRQ3 (coldboot) pending
    this.vramAddr = 0;
    this.vramMod = 0;
    this.timerRunning = false;
    // Pre-set Z80 reply to 0xC3 ("HELLO") — sm1.sm1 should send this at boot
    // but our Z80 emulation doesn't reach the OUT instruction during init.
    this.soundLatchFromZ80 = 0xC3;
    this.soundCommandPending = false;
  }

  getVram(): Uint8Array { return this.vram; }
  getPaletteRam(): Uint8Array { return this.paletteRam; }
  getWorkRam(): Uint8Array { return this.workRam; }

  setSoundLatchCallback(cb: (value: number) => void): void {
    this._soundLatchCallback = cb;
  }

  /** Set callback for lazy Z80 sync when 68K reads sound reply */
  setSoundReadSyncCallback(cb: () => void): void {
    this._onSoundReadSync = cb;
  }

  /** Called by Z80 bus to send reply back to 68K */
  setSoundReply(value: number): void {
    if (this.soundLatchFromZ80 === 0xC3 && value !== 0xC3) {
      console.log(`[Neo-Geo BUS] soundReply overwritten: 0xC3 → 0x${value.toString(16)}`, new Error().stack?.split('\n')[2]);
    }
    this.soundLatchFromZ80 = value;
  }

  /** Called when Z80 reads port 0x00 — marks command as consumed */
  clearSoundPending(): void {
    this.soundCommandPending = false;
  }

  /** Called when 68K writes a sound command */
  markSoundCommandPending(): void {
    this.soundCommandPending = true;
  }

  /** Set I/O port values (called by InputManager) */
  setPortP1(value: number): void { this.portP1 = value; }
  setPortP2(value: number): void { this.portP2 = value; }
  setPortSystem(value: number): void { this.portSystem = value; }

  /** Set MVS mode (default is AES) */
  setMvsMode(mvs: boolean): void {
    this.portStatus = mvs ? 0x01 : 0x00;
  }

  /** Assert IRQ (1=VBlank, 2=timer, 3=coldboot) */
  assertIrq(level: number): void {
    if (level >= 1 && level <= 3) {
      this.irqPending |= (1 << (level - 1));
    }
  }

  /** Get highest pending IRQ level (1-3), or 0 if none */
  getPendingIrq(): number {
    const masked = this.irqPending & ~this.irqControl;
    if (masked & 0x04) return 3; // IRQ3 = coldboot (highest priority)
    if (masked & 0x02) return 2; // IRQ2 = timer
    if (masked & 0x01) return 1; // IRQ1 = VBlank
    return 0;
  }

  /** Acknowledge IRQ (called via register write) */
  acknowledgeIrq(level: number): void {
    if (level >= 1 && level <= 3) {
      this.irqPending &= ~(1 << (level - 1));
    }
  }

  /** LSPC timer tick — call per scanline */
  tickTimer(): boolean {
    if (!this.timerRunning) return false;
    if (this.timerCounter > 0) {
      this.timerCounter--;
      if (this.timerCounter === 0) {
        this.timerCounter = this.timerReload;
        this.irqPending |= 0x02; // Assert timer IRQ
        return true;
      }
    }
    return false;
  }

  /** Read VRAM word at given address */
  readVramWord(addr: number): number {
    const off = (addr & 0xFFFF) * 2;
    if (off + 1 < this.vram.length) {
      return (this.vram[off]! << 8) | this.vram[off + 1]!;
    }
    return 0;
  }

  /** Write VRAM word at given address */
  writeVramWord(addr: number, value: number): void {
    const off = (addr & 0xFFFF) * 2;
    if (off + 1 < this.vram.length) {
      this.vram[off] = (value >> 8) & 0xFF;
      this.vram[off + 1] = value & 0xFF;
    }
  }

  // ---------------------------------------------------------------------------
  // BusInterface implementation
  // ---------------------------------------------------------------------------

  read8(address: number): number {
    address = (address >>> 0) & 0xFFFFFF;

    // 0x000000-0x0FFFFF: Composite vector table + BIOS or P-ROM
    if (address <= 0x0FFFFF) {
      if (this.biosMode) {
        // BIOS mode: entire 0x000000-0x0FFFFF maps to BIOS ROM (128KB mirrored).
        // FBNeo does a composite mapping (0x80-0x3FF from P-ROM) but only AFTER
        // the initial boot. During boot, the BIOS needs its own full vector table.
        const off = address & 0x1FFFF;
        return off < this.biosRom.length ? this.biosRom[off]! : 0xFF;
      }
      // P-ROM mode: game vectors at 0x000000
      return address < this.programRom.length ? this.programRom[address]! : 0xFF;
    }

    // Work RAM: 0x100000-0x10FFFF
    if (address >= 0x100000 && address <= 0x10FFFF) {
      return this.workRam[address - 0x100000]!;
    }

    // P-ROM bank: 0x200000-0x2FFFFF
    if (address >= 0x200000 && address <= 0x2FFFFF) {
      const romAddr = this.pRomBankOffset + (address - 0x200000);
      return romAddr < this.programRom.length ? this.programRom[romAddr]! : 0xFF;
    }

    // Port P1: 0x300000-0x300001
    if (address >= 0x300000 && address <= 0x300001) {
      return (address & 1) ? this.portP1 : 0xFF;
    }

    // REG_DIPSW: 0x300080-0x300081
    if (address >= 0x300080 && address <= 0x300081) {
      return 0xFF; // No DIP switches on AES
    }

    // REG_SOUND / timer16: 0x320000-0x320001
    // Lazy Z80 sync: when 68K reads, run the Z80 catch-up callback
    this._onSoundReadSync?.();
    // Word read: upper byte = Z80 reply + pending flag, lower byte = RTC + coins
    //   Bit 15: pending_command (0 = command pending, 1 = done/idle) — active LOW
    //   Bits 14-8: Z80 sound reply value (from port $0C)
    //   Bit 7: RTC data bit (stub: 0)
    //   Bit 6: RTC time pulse (must toggle ~1Hz for BIOS calendar test)
    //   Bits 4-0: coin inputs (active LOW, 0xFF = no coins)
    if (address >= 0x320000 && address <= 0x320001) {
      if (!(address & 1)) {
        // High byte (FBNeo protocol):
        // If command is still pending (Z80 hasn't read it), mask bit 7 of reply
        if (!this.soundCommandPending) {
          return this.soundLatchFromZ80; // full reply, Z80 has consumed command
        }
        return this.soundLatchFromZ80 & 0x7F; // bit 7 masked while pending
      }
      // Low byte: bits 7-6 = pd4990a (DO, TP), bits 5-0 = 0x3F (inputs)
      const rtcBits = this.rtc.read(); // bit 1 = DO, bit 0 = TP
      return 0x3F | ((rtcBits & 3) << 6); // map to bits 7-6
    }

    // REG_STATUS_A: 0x340000-0x340001 (P1 start/select, P2 directions+buttons, coins)
    if (address >= 0x340000 && address <= 0x340001) {
      return (address & 1) ? this.portSystem : this.portP2;
    }

    // REG_STATUS_B: 0x380000-0x380001
    // FBNeo: bit 7 of low byte = AES flag (1=AES, 0=MVS)
    if (address >= 0x380000 && address <= 0x380001) {
      if (address & 1) {
        // Low byte: bit 7 = AES, bit 6 = slot count, rest = hardware type
        return this.portStatus | 0x80; // AES mode (bit 7 set)
      }
      return 0x00; // High byte
    }

    // LSPC registers: 0x3C0000-0x3C000F (read)
    if (address >= 0x3C0000 && address <= 0x3C000F) {
      return this.readLspc(address);
    }

    // Palette RAM: 0x400000-0x401FFF
    if (address >= 0x400000 && address <= 0x401FFF) {
      return this.paletteRam[address - 0x400000]!;
    }

    // Memory card: 0x800000-0x800FFF (return 0xFF = no card)
    if (address >= 0x800000 && address <= 0x800FFF) {
      return 0xFF;
    }

    // BIOS ROM: 0xC00000-0xC1FFFF
    if (address >= 0xC00000 && address <= 0xC1FFFF) {
      const off = address - 0xC00000;
      return off < this.biosRom.length ? this.biosRom[off]! : 0xFF;
    }

    // Backup SRAM: 0xD00000-0xD0FFFF
    if (address >= 0xD00000 && address <= 0xD0FFFF) {
      return this.backupRam[address - 0xD00000]!;
    }

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
    address = (address >>> 0) & 0xFFFFFF;
    value &= 0xFF;

    // Work RAM: 0x100000-0x10FFFF
    if (address >= 0x100000 && address <= 0x10FFFF) {
      this.workRam[address - 0x100000] = value;
      return;
    }

    // Sound command: 0x320000 (write) — any byte write sets the command
    if (address >= 0x320000 && address <= 0x320001) {
      this.soundLatchToZ80 = value;
      this.soundCommandPending = true;
      this._soundLatchCallback?.(value);
      return;
    }

    // Control registers: 0x3A0000-0x3A001F
    if (address >= 0x3A0000 && address <= 0x3A001F) {
      this.writeControlReg(address, value);
      return;
    }

    // LSPC registers: 0x3C0000-0x3C000F (write)
    if (address >= 0x3C0000 && address <= 0x3C000F) {
      this.writeLspc(address, value);
      return;
    }

    // Palette RAM: 0x400000-0x401FFF
    if (address >= 0x400000 && address <= 0x401FFF) {
      this.paletteRam[address - 0x400000] = value;
      return;
    }

    // Memory card: 0x800000-0x800FFF
    if (address >= 0x800000 && address <= 0x800FFF) {
      return; // Ignore writes
    }

    // Backup SRAM: 0xD00000-0xD0FFFF
    if (address >= 0xD00000 && address <= 0xD0FFFF) {
      this.backupRam[address - 0xD00000] = value;
      return;
    }
  }

  write16(address: number, value: number): void {
    // LSPC and palette are best handled as word writes
    address = (address >>> 0) & 0xFFFFFF;

    // LSPC registers — handle as word directly
    if (address >= 0x3C0000 && address <= 0x3C000F) {
      this.writeLspcWord(address & 0xFFFFFE, value);
      return;
    }

    // Sound command
    if (address >= 0x320000 && address <= 0x320001) {
      this.soundLatchToZ80 = value & 0xFF;
      this.soundCommandPending = true;
      this._soundLatchCallback?.(value & 0xFF);
      return;
    }

    // Control registers — split into byte writes so both bytes get handled
    // (e.g., word write to 0x3A0000 triggers both watchdog and REG_SWPBIOS)
    if (address >= 0x3A0000 && address <= 0x3A001F) {
      this.writeControlReg(address, (value >> 8) & 0xFF);
      this.writeControlReg(address + 1, value & 0xFF);
      return;
    }

    // Default: split into two byte writes
    this.write8(address, (value >> 8) & 0xFF);
    this.write8(address + 1, value & 0xFF);
  }

  write32(address: number, value: number): void {
    this.write16(address, (value >>> 16) & 0xFFFF);
    this.write16(address + 2, value & 0xFFFF);
  }

  // ---------------------------------------------------------------------------
  // LSPC register access
  // ---------------------------------------------------------------------------

  private readLspc(address: number): number {
    const reg = (address & 0xE) >> 1;
    switch (reg) {
      case 1: { // 0x3C0002-0x3C0003: VRAM data read
        const word = this.readVramWord(this.vramAddr);
        return (address & 1) ? (word & 0xFF) : ((word >> 8) & 0xFF);
      }
      case 3: { // 0x3C0006-0x3C0007: current scanline counter
        const scanVal = this.currentScanline & 0x1FF;
        return (address & 1) ? (scanVal & 0xFF) : ((scanVal >> 8) & 0xFF);
      }
      default:
        return 0;
    }
  }

  private writeLspc(address: number, value: number): void {
    // Byte writes to LSPC are unusual — typically word writes
    // Buffer and handle via writeLspcWord when second byte arrives
  }

  private writeLspcWord(address: number, value: number): void {
    const reg = (address & 0xE) >> 1;
    switch (reg) {
      case 0: // 0x3C0000: VRAM address
        this.vramAddr = value & 0xFFFF;
        break;
      case 1: // 0x3C0002: VRAM data write
        this._vramWriteCount++;
        this.writeVramWord(this.vramAddr, value);
        this.vramAddr = (this.vramAddr + this.vramMod) & 0xFFFF;
        break;
      case 2: // 0x3C0004: VRAM modulo
        this.vramMod = value;
        break;
      case 4: // 0x3C0008: LSPC timer high
        this.timerHigh = value;
        this.timerReload = (this.timerHigh << 16) | this.timerLow;
        break;
      case 5: // 0x3C000A: LSPC timer low
        this.timerLow = value;
        this.timerReload = (this.timerHigh << 16) | this.timerLow;
        break;
      case 6: { // 0x3C000C: IRQ acknowledge register (from FBNeo NeoIRQUpdate)
        // Bits accumulate: bit 0 = ack IRQ3, bit 1 = ack scanline IRQ, bit 2 = ack VBlank
        // When all 3 bits set (0x07), clear all pending IRQs
        const ack = value & 0x07;
        if (ack & 0x01) this.irqPending &= ~0x04; // bit 0 → ack IRQ3 (coldboot)
        if (ack & 0x02) this.irqPending &= ~0x02; // bit 1 → ack IRQ2 (timer/scanline)
        if (ack & 0x04) this.irqPending &= ~0x01; // bit 2 → ack IRQ1 (VBlank)
        // Timer reload
        this.timerCounter = this.timerReload;
        this.timerRunning = true;
        break;
      }
      case 7: // 0x3C000E: LSPC timer stop
        this.timerRunning = false;
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Control register writes (0x3A0000-0x3A001F)
  // ---------------------------------------------------------------------------

  // Callbacks for ROM banking (set by emulator)
  private _onFixRomSwitch: ((useBios: boolean) => void) | null = null;
  private _onZ80RomSwitch: ((useBios: boolean) => void) | null = null;

  setFixRomSwitchCallback(cb: (useBios: boolean) => void): void { this._onFixRomSwitch = cb; }
  setZ80RomSwitchCallback(cb: (useBios: boolean) => void): void { this._onZ80RomSwitch = cb; }

  private writeControlReg(address: number, _value: number): void {
    // Control registers per FBNeo WriteIO2 (odd byte addresses)
    const regAddr = address & 0x1F;
    switch (regAddr) {
      case 0x00: // Watchdog kick (even byte)
        break;
      case 0x01: // Shadow off (normal palette)
        break;
      case 0x03: // SWPBIOS — map BIOS vectors to 0x000000
        this.biosMode = true;
        break;
      case 0x0B: // BIOS text + Z80 BIOS ROM
        this._onFixRomSwitch?.(true);
        this._onZ80RomSwitch?.(true);
        break;
      case 0x0D: // SRAM write protect
        break;
      case 0x0F: // Palette bank 1
        break;
      case 0x11: // Shadow on (darken palette)
        break;
      case 0x13: // SWPROM — map GAME vectors to 0x000000
        this.biosMode = false;
        break;
      case 0x1B: // Game text + Z80 game ROM
        this._onFixRomSwitch?.(false);
        this._onZ80RomSwitch?.(false);
        break;
      case 0x1D: // SRAM write enable
        break;
      case 0x1F: // Palette bank 0
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Sound latch
  // ---------------------------------------------------------------------------

  /** Get current sound latch value (for Z80 bus) */
  getSoundLatch(): number { return this.soundLatchToZ80; }

  /** Check if sound latch has pending data */
  isSoundLatchPending(): boolean { return this.soundCommandPending; }

  /** Clear sound latch pending flag (called by Z80 after reading) */
  clearSoundLatchPending(): void { this.soundCommandPending = false; }

  // ---------------------------------------------------------------------------
  // Scanline counter (set by emulator during frame loop)
  // ---------------------------------------------------------------------------

  private currentScanline: number = 0;

  setScanline(line: number): void {
    this.currentScanline = line;
  }
}
