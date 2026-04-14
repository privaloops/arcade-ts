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
 *   0x340000-0x340001 : REG_STATUS_A (P2 joystick)
 *   0x380000-0x380001 : REG_STATUS_B (system starts/selects)
 *   0x3A0000-0x3A001F : Control registers (watchdog, IRQ ack)
 *   0x3C0000-0x3C000F : LSPC registers (VRAM addr/data/mod, timer, IRQ)
 *   0x400000-0x401FFF : Palette RAM (8KB)
 *   0x800000-0x800FFF : Memory card (optional)
 *   0xC00000-0xC1FFFF : BIOS ROM (128KB)
 *   0xD00000-0xD0FFFF : BIOS SRAM (backup, 64KB)
 */

import type { BusInterface } from '../types';
import { PD4990A } from './pd4990a';
import type { NeoGeoProtection } from './neogeo-protection';

export class NeoGeoBus implements BusInterface {
  private programRom: Uint8Array;
  private biosRom: Uint8Array;
  private workRam: Uint8Array;        // 64KB
  private backupRam: Uint8Array;      // 64KB BIOS SRAM
  private paletteRam: Uint8Array;     // 16KB (2 banks × 4096 × 16-bit words)
  private paletteBankOffset: number = 0; // 0 or 0x2000 bytes (0x1000 words)
  private vram: Uint8Array;           // 68KB VRAM (accessed indirectly)
  private memCardRam: Uint8Array;     // 4KB memory card RAM

  // I/O port registers (active LOW for buttons)
  private portP1: number = 0xFF;
  private portP2: number = 0xFF;
  private portSystem: number = 0xFF;  // Start/Select at 0x340001
  private portCoins: number = 0xFF;   // Coins/Service at 0x380001
  private portStatus: number = 0x00;  // bit 0: 0=AES, 1=MVS

  // LSPC VRAM indirect access (hardware has separate read/write pointers)
  private vramAddr: number = 0;       // write pointer (incremented on data write)
  private vramReadAddr: number = 0;   // read pointer (latched on addr set, incremented on data read)
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
  private irqPending: number = 0;  // FBNeo: nIRQAcknowledge = ~0 → no pending IRQs at boot

  // LSPC control register (0x3C0006 write)
  // Upper byte: sprite frame speed, lower byte: IRQ control flags
  // Bit 4 (0x10): IRQ enable, Bit 5 (0x20): relative offset, Bit 6 (0x40): load at VBlank, Bit 7 (0x80): auto-reload
  private lspcControl: number = 0;

  // Auto-animation: counter increments every (speed+1) VBlanks (LSPC2 register 0x3C0006 upper byte)
  private autoAnimCounter: number = 0;
  private autoAnimSpeed: number = 0;
  private autoAnimFrameTimer: number = 0;

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

  // Watchdog timer: counts down each VBlank, triggers reset at 0.
  // MAME: 3244030 ticks / 24MHz = ~0.135s ≈ 8 frames at 59.185 Hz.
  // Kicked by writing to 0x300001 (MAME: watchdog_timer_device).
  private watchdogCounter: number = 8;
  private _watchdogResetCallback: (() => void) | null = null;

  // Runtime protection handler (KOF98, MSLUGX, SMA, etc.)
  private protection: NeoGeoProtection | null = null;

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
    this.paletteRam = new Uint8Array(0x4000); // 16KB (2 banks)
    this.vram = new Uint8Array(0x11000);      // ~68KB (slow 64KB + fast ~4KB)
    this.memCardRam = new Uint8Array(0x1000); // 4KB memory card
    // pd4990a RTC — uses 68K cycle count for timing
    this.rtc = new PD4990A(12_000_000, () => this.totalCycles);
  }

  /** Add 68K cycles to the total (call from emulator per step) */
  addCycles(n: number): void { this.totalCycles += n; }

  /** Increment auto-animation counter with speed divider (call once per VBlank) */
  tickAutoAnim(): void {
    // Bit 3 of lspcControl low byte disables auto-animation (MAME: BIT(data, 3))
    if (this.lspcControl & 0x08) return;
    if (this.autoAnimFrameTimer >= this.autoAnimSpeed) {
      this.autoAnimFrameTimer = 0;
      this.autoAnimCounter++;
    } else {
      this.autoAnimFrameTimer++;
    }
  }

  /** Get current auto-animation counter (for video renderer) */
  getAutoAnimCounter(): number { return this.autoAnimCounter; }

  loadProgramRom(data: Uint8Array): void {
    this.programRom = data;
    // Default bank: if P-ROM > 1MB, bank 0 maps P2 (offset 0x100000) into 0x200000-0x2FFFFF
    this.pRomBankOffset = data.length > 0x100000 ? 0x100000 : 0;
  }
  loadBiosRom(data: Uint8Array): void { this.biosRom = data; }

  /** Set P-ROM bank offset for 0x200000-0x2FFFFF region (SMA protection) */
  setPRomBankOffset(offset: number): void { this.pRomBankOffset = offset; }

  /** Switch to game mode (P-ROM at 0x000000) for direct boot */
  switchToGameMode(): void {
    this.biosMode = false;
    this.irqPending = 0; // No pending IRQs for direct boot
  }

  /** Reset bus state (call when CPU is reset) */
  resetBus(): void {
    this.biosMode = true; // BIOS mapped at 0x000000 at reset
    this.irqPending = 0; // No pending IRQs at reset (FBNeo: nIRQAcknowledge = ~0)
    this.vramAddr = 0;
    this.vramMod = 0;
    this.timerRunning = false;
    this.autoAnimCounter = 0;
    this.autoAnimSpeed = 0;
    this.autoAnimFrameTimer = 0;
    this.lspcControl = 0;
    // Pre-set Z80 reply to 0xC3 ("HELLO") — sm1.sm1 should send this at boot
    // but our Z80 emulation doesn't reach the OUT instruction during init.
    this.soundLatchFromZ80 = 0xC3;
    this.soundCommandPending = false;
    this.watchdogCounter = 8;
  }

  /** Set runtime protection handler for the current game */
  setProtection(prot: NeoGeoProtection | null): void { this.protection = prot; }

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

  /** Register callback for watchdog-triggered system reset */
  setWatchdogResetCallback(cb: () => void): void {
    this._watchdogResetCallback = cb;
  }

  /** Tick watchdog — call once per VBlank. Returns true if reset triggered. */
  tickWatchdog(): boolean {
    if (this.watchdogCounter > 0) {
      this.watchdogCounter--;
      if (this.watchdogCounter === 0) {
        this._watchdogResetCallback?.();
        return true;
      }
    }
    return false;
  }

  /** Kick watchdog (reset counter to 8 frames). Called on write to 0x300001. */
  private kickWatchdog(): void {
    this.watchdogCounter = 8;
  }

  /** Set I/O port values (called by InputManager) */
  setPortP1(value: number): void { this.portP1 = value; }
  setPortP2(value: number): void { this.portP2 = value; }
  setPortSystem(value: number): void { this.portSystem = value; }
  setPortCoins(value: number): void { this.portCoins = value; }

  /** Set MVS mode. Bit 7: 0=MVS, 1=AES. Bit 6: 0=1-slot, 1=multi-slot */
  setMvsMode(mvs: boolean): void {
    this.portStatus = mvs ? 0x00 : 0x80;
  }

  /** Assert IRQ (1=VBlank, 2=timer, 3=coldboot) */
  assertIrq(level: number): void {
    if (level >= 1 && level <= 3) {
      this.irqPending |= (1 << (level - 1));
    }
  }

  /** Get highest pending IRQ level (1-3), or 0 if none */
  getPendingIrq(): number {
    // No masking — IRQ control register (lspcControl) governs timer behavior,
    // not IRQ suppression. FBNeo uses nIRQAcknowledge for ack, not for masking.
    if (this.irqPending & 0x04) return 3; // IRQ3 = coldboot (highest priority)
    if (this.irqPending & 0x02) return 2; // IRQ2 = timer
    if (this.irqPending & 0x01) return 1; // IRQ1 = VBlank
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

  // Debug: trace VRAM writes to SCB2/3/4 for specific sprites
  private _vramTraceSprites: Set<number> | null = null;
  enableVramTrace(spriteIndices: number[]): void {
    this._vramTraceSprites = new Set(spriteIndices);
    console.log(`[VRAM Trace] Watching sprites: ${spriteIndices.join(',')}`);
  }
  disableVramTrace(): void { this._vramTraceSprites = null; }

  /** Write VRAM word at given address */
  writeVramWord(addr: number, value: number): void {
    const a = addr & 0xFFFF;
    const off = a * 2;
    if (off + 1 < this.vram.length) {
      this.vram[off] = (value >> 8) & 0xFF;
      this.vram[off + 1] = value & 0xFF;
    }
    // Trace ALL SCB2 writes (zoom values) — log only non-full-zoom writes
    if (this._vramTraceSprites) {
      if (a >= 0x8000 && a < 0x8200) {
        const sprIdx = a - 0x8000;
        const xz = (value >> 8) & 0xF;
        const yz = value & 0xFF;
        console.log(`[VRAM] SCB2[${sprIdx}] = 0x${value.toString(16).padStart(4,'0')} xZoom=${xz} yZoom=${yz}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // BusInterface implementation
  // ---------------------------------------------------------------------------

  read8(address: number): number {
    address = (address >>> 0) & 0xFFFFFF;

    // 0x000000-0x0FFFFF: Composite vector table (FBNeo MapVectorTable)
    // BIOS mode: 0x00-0x7F = BIOS vectors, 0x80+ = P-ROM
    // Game mode: entire range = P-ROM
    if (address <= 0x0FFFFF) {
      if (this.biosMode && address < 0x80) {
        return address < this.biosRom.length ? this.biosRom[address]! : 0xFF;
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
    // FBNeo: even byte = P1 joystick+buttons, odd byte = test/service (MVS) or 0xFF
    if (address >= 0x300000 && address <= 0x300001) {
      return (address & 1) ? 0xFF : this.portP1;
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
      // Low byte: bits 7-6 = pd4990a (DO, TP), bits 5-0 = coin/service inputs
      const rtcBits = this.rtc.read(); // bit 1 = DO, bit 0 = TP
      return (this.portCoins & 0x3F) | ((rtcBits & 3) << 6);
    }

    // REG_STATUS_A: 0x340000-0x340001 (P2 joystick only)
    // FBNeo: even byte = P2 joystick+buttons, odd byte = 0xFF
    if (address >= 0x340000 && address <= 0x340001) {
      return (address & 1) ? 0xFF : this.portP2;
    }

    // REG_STATUS_B: 0x380000-0x380001
    // Even byte: bit 7 = MVS/AES (0=MVS, 1=AES), bits 0-6 = starts/selects
    if (address >= 0x380000 && address <= 0x380001) {
      if (address & 1) return 0xFF;
      return (this.portSystem & 0x7F) | (this.portStatus & 0x80);
    }

    // LSPC registers: 0x3C0000-0x3C000F (read)
    if (address >= 0x3C0000 && address <= 0x3C000F) {
      return this.readLspc(address);
    }

    // Palette RAM: 0x400000-0x401FFF (banked, 2 × 8KB)
    if (address >= 0x400000 && address <= 0x401FFF) {
      return this.paletteRam[this.paletteBankOffset + (address - 0x400000)]!;
    }

    // Memory card RAM: 0x800000-0x800FFF (2KB, only odd bytes used)
    if (address >= 0x800000 && address <= 0x800FFF) {
      const off = (address - 0x800000) & 0xFFF;
      return this.memCardRam[off]!;
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
    // Check protection handler first (ROM overlay, bit counters, etc.)
    if (this.protection?.read16) {
      const val = this.protection.read16(address, (a) => this.read16(a));
      if (val !== undefined) return val;
    }
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

    // P-ROM bankswitch: write to 0x200000-0x2FFFFF latches D0/D1 for bank select
    // Only odd byte writes or word writes trigger the latch (PORTWEL signal)
    if (address >= 0x200000 && address <= 0x2FFFFF && (address & 1)) {
      const bank = value & 0x03;
      this.pRomBankOffset = 0x100000 + bank * 0x100000;
      return;
    }

    // Work RAM: 0x100000-0x10FFFF
    if (address >= 0x100000 && address <= 0x10FFFF) {
      this.workRam[address - 0x100000] = value;
      return;
    }

    // Watchdog kick: write to 0x300001 (odd byte, mirrored 0x300000-0x31FFFF)
    // MAME: map(0x300001).mirror(0x01fffe).w("watchdog", reset_w)
    if (address >= 0x300000 && address <= 0x31FFFF && (address & 1)) {
      this.kickWatchdog();
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

    // pd4990a RTC write: 0x380000-0x3800FF
    // bit 0 = DATA_IN, bit 1 = CLK, bit 2 = STB
    if (address >= 0x380000 && address <= 0x3800FF) {
      this.rtc.write(value & 2, value & 4, value & 1);
      return;
    }

    // Palette RAM: 0x400000-0x401FFF (banked, 2 × 8KB)
    if (address >= 0x400000 && address <= 0x401FFF) {
      this.paletteRam[this.paletteBankOffset + (address - 0x400000)] = value;
      return;
    }

    // Memory card RAM: 0x800000-0x800FFF
    if (address >= 0x800000 && address <= 0x800FFF) {
      const off = (address - 0x800000) & 0xFFF;
      this.memCardRam[off] = value;
      return;
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

    // Check protection handler first
    if (this.protection?.write16?.(address, value)) return;

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
      case 0: // 0x3C0000-0x3C0001: VRAM data (same as 0x3C0002, per FBNeo)
      case 1: { // 0x3C0002-0x3C0003: VRAM data read (uses separate read pointer)
        const word = this.readVramWord(this.vramReadAddr);
        // Auto-increment read pointer on low byte (once per word read)
        if (address & 1) {
          this.vramReadAddr = (this.vramReadAddr + this.vramMod) & 0xFFFF;
        }
        return (address & 1) ? (word & 0xFF) : ((word >> 8) & 0xFF);
      }
      case 2: { // 0x3C0004-0x3C0005: VRAM modulo read
        const mod = this.vramMod & 0xFFFF;
        return (address & 1) ? (mod & 0xFF) : ((mod >> 8) & 0xFF);
      }
      case 3: { // 0x3C0006-0x3C0007: display status (FBNeo format)
        // FBNeo: ((NeoCurrentScanline() + nScanlineOffset) << 7) | (nNeoSpriteFrame & 7)
        // NeoCurrentScanline = (SekCurrentScanline + 248) % 264, nScanlineOffset = 0xF8
        const neoScan = (this.currentScanline + 248) % 264;
        const scanVal = (((neoScan + 0xF8) & 0x1FF) << 7) | (this.autoAnimCounter & 7);
        return (address & 1) ? (scanVal & 0xFF) : ((scanVal >> 8) & 0xFF);
      }
      default:
        return 0;
    }
  }

  private _lspcByteBuffer: number = -1; // pending high byte for byte-pair writes
  private writeLspc(address: number, value: number): void {
    // Log byte writes — they may be critical for VRAM addressing
    if (this._vramTraceSprites) {
      console.log(`[LSPC BYTE] addr=0x${address.toString(16)} val=0x${value.toString(16).padStart(2,'0')}`);
    }
    // Buffer byte writes and assemble into word when both bytes arrive
    if (!(address & 1)) {
      // Even byte (high byte) — buffer it
      this._lspcByteBuffer = value;
    } else if (this._lspcByteBuffer >= 0) {
      // Odd byte (low byte) — assemble word and dispatch
      const word = (this._lspcByteBuffer << 8) | value;
      this._lspcByteBuffer = -1;
      this.writeLspcWord(address & 0xFFFFFE, word);
    }
  }

  private writeLspcWord(address: number, value: number): void {
    const reg = (address & 0xE) >> 1;
    switch (reg) {
      case 0: // 0x3C0000: VRAM address — latches both write and read pointers
        this.vramAddr = value & 0xFFFF;
        this.vramReadAddr = value & 0xFFFF;
        break;
      case 1: // 0x3C0002: VRAM data write
        this._vramWriteCount++;
        this.writeVramWord(this.vramAddr, value);
        this.vramAddr = (this.vramAddr + this.vramMod) & 0xFFFF;
        break;
      case 2: // 0x3C0004: VRAM modulo
        this.vramMod = value;
        break;
      case 3: // 0x3C0006: LSPC control (auto-anim speed + IRQ control flags)
        this.lspcControl = value;
        this.autoAnimSpeed = (value >> 8) & 0xFF;
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
        const ack = value & 0x07;
        if (ack & 0x01) this.irqPending &= ~0x04;
        if (ack & 0x02) this.irqPending &= ~0x02;
        if (ack & 0x04) this.irqPending &= ~0x01;
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

  // Callbacks for ROM banking and palette (set by emulator)
  private _onFixRomSwitch: ((useBios: boolean) => void) | null = null;
  private _onZ80RomSwitch: ((useBios: boolean) => void) | null = null;
  private _onPaletteBankSwitch: ((bank: number) => void) | null = null;

  setFixRomSwitchCallback(cb: (useBios: boolean) => void): void { this._onFixRomSwitch = cb; }
  setZ80RomSwitchCallback(cb: (useBios: boolean) => void): void { this._onZ80RomSwitch = cb; }
  setPaletteBankCallback(cb: (bank: number) => void): void { this._onPaletteBankSwitch = cb; }

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
      case 0x0F: // Palette bank 1 (HC259 Q7 set)
        this.paletteBankOffset = 0x2000;
        this._onPaletteBankSwitch?.(1);
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
      case 0x1F: // Palette bank 0 (HC259 Q7 clear)
        this.paletteBankOffset = 0;
        this._onPaletteBankSwitch?.(0);
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
