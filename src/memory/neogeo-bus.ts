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
  private soundLatchFromZ80: number = 0;
  private soundLatchPending: boolean = false;
  private _soundLatchCallback: ((value: number) => void) | null = null;

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
  }

  loadProgramRom(data: Uint8Array): void { this.programRom = data; }
  loadBiosRom(data: Uint8Array): void { this.biosRom = data; }

  /** Reset bus state (call when CPU is reset) */
  resetBus(): void {
    this.biosMode = true; // BIOS mapped at 0x000000 at reset
    this.irqPending = 0x04; // IRQ3 (coldboot) pending
    this.vramAddr = 0;
    this.vramMod = 0;
    this.timerRunning = false;
  }

  getVram(): Uint8Array { return this.vram; }
  getPaletteRam(): Uint8Array { return this.paletteRam; }
  getWorkRam(): Uint8Array { return this.workRam; }

  setSoundLatchCallback(cb: (value: number) => void): void {
    this._soundLatchCallback = cb;
  }

  /** Called by Z80 bus to send reply back to 68K */
  setSoundReply(value: number): void {
    this.soundLatchFromZ80 = value;
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

    // 0x000000-0x0FFFFF: BIOS (at reset) or P-ROM (after REG_SWPROM)
    if (address <= 0x0FFFFF) {
      if (this.biosMode) {
        // BIOS mapped at 0x000000 (128KB mirrored)
        const off = address & 0x1FFFF; // 128KB mirror
        return off < this.biosRom.length ? this.biosRom[off]! : 0xFF;
      }
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

    // REG_SOUND: 0x320000-0x320001 (read = Z80 reply, write = Z80 command)
    if (address >= 0x320000 && address <= 0x320001) {
      return (address & 1) ? this.soundLatchFromZ80 : 0xFF;
    }

    // REG_STATUS_A: 0x340000-0x340001 (P1 start/select, P2 directions+buttons, coins)
    if (address >= 0x340000 && address <= 0x340001) {
      return (address & 1) ? this.portSystem : this.portP2;
    }

    // REG_STATUS_B: 0x380000-0x380001
    if (address >= 0x380000 && address <= 0x380001) {
      // Various hardware flags — AES: bit 6 set = AES mode
      // The exact value depends on BIOS version; 0x40 for AES is common
      return (address & 1) ? (this.portStatus | 0x40) : 0x00;
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

    // Sound command: 0x320000 (write)
    if (address >= 0x320000 && address <= 0x320001) {
      if (address & 1) {
        this.soundLatchToZ80 = value;
        this.soundLatchPending = true;
        this._soundLatchCallback?.(value);
      }
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
      this.soundLatchPending = true;
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
      case 6: // 0x3C000C: IRQ acknowledge + control
        // Writing acknowledges the IRQs whose bits are set
        if (value & 0x01) this.irqPending &= ~0x01; // Ack IRQ1 (VBlank)
        if (value & 0x02) this.irqPending &= ~0x02; // Ack IRQ2 (timer)
        if (value & 0x04) this.irqPending &= ~0x04; // Ack IRQ3 (coldboot)
        // Also controls timer enable/reload
        this.irqControl = value & 0x07;
        this.timerCounter = this.timerReload;
        this.timerRunning = true;
        break;
      case 7: // 0x3C000E: LSPC timer stop
        this.timerRunning = false;
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Control register writes (0x3A0000-0x3A001F)
  // ---------------------------------------------------------------------------

  private writeControlReg(address: number, _value: number): void {
    // Neo-Geo control registers are at even byte addresses: 0x3A00XX
    // MAME uses the raw address for switching:
    //   0x3A0001 = REG_SWPBIOS (map BIOS to 0x000000)
    //   0x3A0003 = REG_SWPROM  (map P-ROM to 0x000000)
    const regAddr = address & 0x1F;
    switch (regAddr) {
      case 0x00: // Watchdog (even byte) — ignore
      case 0x01: // REG_SWPBIOS — map BIOS to 0x000000
        this.biosMode = true;
        break;
      case 0x02: // Watchdog (odd byte)
        break;
      case 0x03: // REG_SWPROM — map P-ROM to 0x000000
        this.biosMode = false;
        break;
      case 0x05: // REG_CRDUNLOCK1
      case 0x07: // REG_CRDLOCK1
      case 0x09: // REG_CRDLOCK2
      case 0x0B: // REG_CRDREGSEL
        break; // Memory card — ignore
      case 0x0A: // 0x3A000A: unused on Neo-Geo (IRQ ack is via LSPC 0x3C000C)
      case 0x0B:
        break;
      case 0x0D: // REG_BRDFIX — use board fix (S-ROM from cartridge)
        break;
      case 0x0F: // REG_CRTFIX — use BIOS fix (sfix.sfix)
        break;
      case 0x11: // REG_SRAMLOCK — lock backup RAM
      case 0x13: // REG_SRAMUNLOCK — unlock backup RAM
        break;
      case 0x15: // REG_PALBANK0
      case 0x17: // REG_PALBANK1
        break; // Palette bank — ignore for MVP
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
  isSoundLatchPending(): boolean { return this.soundLatchPending; }

  /** Clear sound latch pending flag (called by Z80 after reading) */
  clearSoundLatchPending(): void { this.soundLatchPending = false; }

  // ---------------------------------------------------------------------------
  // Scanline counter (set by emulator during frame loop)
  // ---------------------------------------------------------------------------

  private currentScanline: number = 0;

  setScanline(line: number): void {
    this.currentScanline = line;
  }
}
