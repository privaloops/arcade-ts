// =============================================================================
// Motorola 68000 CPU — Cycle-accurate interpreter
// Sprixe — TypeScript strict
// =============================================================================

import type { BusInterface } from '../types';
export type { BusInterface };

export interface CpuState {
  d: Int32Array;       // D0-D7
  a: Int32Array;       // A0-A7
  pc: number;
  sr: number;
  usp: number;
  ssp: number;
  stopped: boolean;
  pendingInterrupt: number;
  irqLines: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// SR flag positions (CCR bits stored as direct booleans, see _fC/_fV/_fZ/_fN/_fX)
const SR_S = 13;
const SR_T = 15;

// Exception vectors
const VEC_RESET_SSP = 0;
const VEC_RESET_PC = 1;
const VEC_BUS_ERROR = 2;
const VEC_ADDRESS_ERROR = 3;
const VEC_ILLEGAL = 4;
const VEC_ZERO_DIVIDE = 5;
const VEC_CHK = 6;
const VEC_TRAPV = 7;
const VEC_PRIVILEGE = 8;
const VEC_TRACE = 9;
const VEC_LINE_A = 10;
const VEC_LINE_F = 11;
const VEC_SPURIOUS = 24;
const VEC_AUTOVECTOR_BASE = 25; // 25-31 for levels 1-7
const VEC_TRAP_BASE = 32;      // 32-47 for TRAP #0-#15

// Condition code table for Bcc/DBcc/Scc
// 0=T, 1=F, 2=HI, 3=LS, 4=CC, 5=CS, 6=NE, 7=EQ,
// 8=VC, 9=VS, 10=PL, 11=MI, 12=GE, 13=LT, 14=GT, 15=LE
// Effective Address mode encoding (3-bit mode + 3-bit reg)
const EA_DATA_REG = 0;
const EA_ADDR_REG = 1;
const EA_ADDR_IND = 2;
const EA_ADDR_INC = 3;
const EA_ADDR_DEC = 4;
const EA_ADDR_DISP = 5;
const EA_ADDR_IDX = 6;
const EA_OTHER = 7;
// sub-modes for mode=7:
const EA_ABS_W = 0;
const EA_ABS_L = 1;
const EA_PC_DISP = 2;
const EA_PC_IDX = 3;
const EA_IMMEDIATE = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signExtend8(v: number): number {
  return (v << 24) >> 24;
}

function signExtend16(v: number): number {
  return (v << 16) >> 16;
}

function clip8(v: number): number {
  return v & 0xFF;
}

function clip16(v: number): number {
  return v & 0xFFFF;
}

function clip32(v: number): number {
  return v >>> 0;
}

function msb8(v: number): boolean {
  return (v & 0x80) !== 0;
}

function msb16(v: number): boolean {
  return (v & 0x8000) !== 0;
}

function msb32(v: number): boolean {
  return (v & 0x80000000) !== 0;
}

// Count bits set in a 16-bit value
function popcount16(v: number): number {
  let c = 0;
  v = v & 0xFFFF;
  while (v) { c++; v &= v - 1; }
  return c;
}

// ---------------------------------------------------------------------------
// Effective address timing tables
// (extra cycles for calculating the effective address, beyond the base instruction)
// Index: 0=Dn, 1=An, 2=(An), 3=(An)+, 4=-(An), 5=d(An), 6=d(An,Xn),
//        7=xxx.W, 8=xxx.L, 9=d(PC), 10=d(PC,Xn), 11=#imm
// ---------------------------------------------------------------------------
// Timing tables kept as reference (used implicitly in cycle counts per instruction):
// Byte/Word: [Dn:0, An:0, (An):4, (An)+:4, -(An):6, d(An):8, d(An,Xn):10, W:8, L:12, d(PC):8, d(PC,Xn):10, #:4]
// Long:      [Dn:0, An:0, (An):8, (An)+:8, -(An):10, d(An):12, d(An,Xn):14, W:12, L:16, d(PC):12, d(PC,Xn):14, #:8]

// ---------------------------------------------------------------------------
// M68000 class
// ---------------------------------------------------------------------------

export class M68000 {
  // Registers
  private d: Int32Array = new Int32Array(8);  // D0-D7
  private a: Int32Array = new Int32Array(8);  // A0-A7
  private pc: number = 0;
  private sr: number = 0x2700;                // supervisor mode, IPL=7
  private usp: number = 0;
  private ssp: number = 0;
  private stopped: boolean = false;
  private pendingInterrupt: number = 0;

  // Level-triggered interrupt lines (like real hardware).
  // Each bit represents an asserted IPL line. The line stays asserted
  // until explicitly cleared (e.g. by the interrupt acknowledge cycle).
  private irqLines: number = 0;

  // Prefetch (the 68000 has a 2-word prefetch queue, we model it simply)
  private prefetch0: number = 0;
  private prefetch1: number = 0;

  // Bus
  private bus: BusInterface;

  // Current instruction opcode (for decode)
  private opcode: number = 0;

  // Cycles accumulated for current instruction
  private cycles: number = 0;

  // Address error flag — set during readFromAddr/writeToAddr, checked by step()
  private addressError: boolean = false;
  // Override for frame PC in data-access address errors (used by MOVE predecrement dest)
  private addressErrorFramePC: number = -1;

  // Instruction tracer
  private _traceLog: string[] = [];
  private _traceEnabled: boolean = false;
  private _traceMax: number = 0;

  constructor(bus: BusInterface) {
    this.bus = bus;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Start tracing N instructions. Retrieve with getTrace(). */
  startTrace(maxInstructions: number = 1000): void {
    this._traceLog = [];
    this._traceMax = maxInstructions;
    this._traceEnabled = true;
  }

  /** Get the trace log as a string (one line per instruction). */
  getTrace(): string {
    return this._traceLog.join('\n');
  }


  reset(): void {
    this.sr = 0x2700;
    this._fC = this._fV = this._fZ = this._fN = this._fX = false;
    this.ssp = this.bus.read32(VEC_RESET_SSP * 4);
    this.a[7] = this.ssp;
    this.pc = this.bus.read32(VEC_RESET_PC * 4);
    this.stopped = false;
    this.pendingInterrupt = 0;
    this.prefetchFill();
  }

  step(): number {
    this.cycles = 0;

    // Compute the highest asserted interrupt level from level-triggered lines
    // and edge-triggered pending interrupt.
    let highestIrq = this.pendingInterrupt;
    if (this.irqLines > highestIrq) highestIrq = this.irqLines;

    // Check for pending interrupts
    if (highestIrq > 0) {
      const ipl = (this.sr >> 8) & 7;
      if (highestIrq > ipl || highestIrq === 7) {
        this.processInterrupt(highestIrq);
        return this.cycles;
      }
    }

    if (this.stopped) {
      this.cycles = 4; // idle cycles while stopped
      return this.cycles;
    }

    // Check trace flag BEFORE executing
    const traceBeforeExec = (this.sr & (1 << SR_T)) !== 0;

    // Log instruction before execution (if tracing)
    if (this._traceEnabled && this._traceLog.length < this._traceMax) {
      const instrPC = this.pc; // PC points to current instruction (before prefetch)
      this._traceLog.push(
        `PC=${instrPC.toString(16).padStart(6, '0').toUpperCase()} ` +
        `SR=${this.getSR().toString(16).padStart(4, '0').toUpperCase()} ` +
        `D0=${(this.d[0]! >>> 0).toString(16).padStart(8, '0').toUpperCase()} ` +
        `D1=${(this.d[1]! >>> 0).toString(16).padStart(8, '0').toUpperCase()} ` +
        `A0=${(this.a[0]! >>> 0).toString(16).padStart(8, '0').toUpperCase()} ` +
        `A7=${(this.a[7]! >>> 0).toString(16).padStart(8, '0').toUpperCase()} ` +
        `OP=${this.prefetch0.toString(16).padStart(4, '0').toUpperCase()}`
      );
      if (this._traceLog.length >= this._traceMax) {
        this._traceEnabled = false;
      }
    }

    // Reset address error flag
    this.addressError = false;
    this.addressErrorFramePC = -1;

    // Fetch and decode
    this.opcode = this.prefetchRead();
    this.executeInstruction();

    // If an address error occurred during execution, the exception
    // handler already set PC/SR/SP. Don't do trace or further processing.
    if (this.addressError) {
      return this.cycles;
    }

    // Trace exception after instruction
    if (traceBeforeExec) {
      this.raiseException(VEC_TRACE, 0);
    }

    return this.cycles;
  }

  requestInterrupt(level: number): void {
    if (level >= 1 && level <= 7) {
      this.pendingInterrupt = level;
    }
  }

  /**
   * Assert an interrupt line (level-triggered, like real hardware).
   * The line stays asserted until clearInterrupt() is called.
   * This is how MAME models the CPS1 VBlank: IRQ2 is asserted at
   * scanline 240 and cleared when the CPU acknowledges it.
   */
  assertInterrupt(level: number): void {
    if (level >= 1 && level <= 7) {
      this.irqLines = Math.max(this.irqLines, level);
    }
  }

  /**
   * Deassert an interrupt line (clear it).
   * If the cleared level was the highest, we recompute.
   */
  clearInterrupt(level: number): void {
    if (this.irqLines === level) {
      this.irqLines = 0;
    }
  }

  /** Clear all asserted interrupt lines (used by IRQ acknowledge). */
  clearAllInterrupts(): void {
    this.irqLines = 0;
    this.pendingInterrupt = 0;
  }

  getPC(): number { return this.pc; }
  getA0(): number { return this.a[0]!; }

  getState(): CpuState {
    return {
      d: new Int32Array(this.d),
      a: new Int32Array(this.a),
      pc: this.pc,
      sr: this.getSR(),
      usp: this.usp,
      ssp: this.ssp,
      stopped: this.stopped,
      pendingInterrupt: this.pendingInterrupt,
      irqLines: this.irqLines,
    };
  }

  setState(state: CpuState): void {
    this.d.set(state.d);
    this.a.set(state.a);
    this.pc = state.pc;
    this.sr = state.sr & 0xFFE0;
    this.syncFlagsFromSR(state.sr);
    this.usp = state.usp;
    this.ssp = state.ssp;
    this.stopped = state.stopped;
    this.pendingInterrupt = state.pendingInterrupt;
    this.irqLines = state.irqLines ?? 0;
    this.prefetchFill();
  }

  // =========================================================================
  // Prefetch
  // =========================================================================

  private prefetchFill(): void {
    this.prefetch0 = this.bus.read16(this.pc & 0xFFFFFF);
    this.prefetch1 = this.bus.read16((this.pc + 2) & 0xFFFFFF);
  }

  private prefetchRead(): number {
    const word = this.prefetch0;
    this.pc = (this.pc + 2) & 0xFFFFFFFF;
    this.prefetch0 = this.prefetch1;
    this.prefetch1 = this.bus.read16((this.pc + 2) & 0xFFFFFF);
    return word;
  }

  private readImm16(): number {
    const w = this.prefetchRead();
    this.cycles += 4;
    return w;
  }

  private readImm32(): number {
    const hi = this.prefetchRead();
    const lo = this.prefetchRead();
    this.cycles += 8;
    return ((hi << 16) | lo) >>> 0;
  }

  // =========================================================================
  // SR / flags — stored as direct booleans for hot-path performance.
  // The sr field holds only the upper byte (S, T, IPL mask).
  // Flags are synced to/from sr on demand (getSR, setSR, getState, etc.)
  // =========================================================================

  private _fC: boolean = false;
  private _fV: boolean = false;
  private _fZ: boolean = false;
  private _fN: boolean = false;
  private _fX: boolean = false;

  /** Rebuild full 16-bit SR from upper byte + boolean flags */
  private getSR(): number {
    return (this.sr & 0xFFE0)
      | (this._fX ? 0x10 : 0)
      | (this._fN ? 0x08 : 0)
      | (this._fZ ? 0x04 : 0)
      | (this._fV ? 0x02 : 0)
      | (this._fC ? 0x01 : 0);
  }

  /** Sync boolean flags from a full 16-bit SR value */
  private syncFlagsFromSR(val: number): void {
    this._fC = (val & 1) !== 0;
    this._fV = (val & 2) !== 0;
    this._fZ = (val & 4) !== 0;
    this._fN = (val & 8) !== 0;
    this._fX = (val & 16) !== 0;
  }

  private getCCR(): number {
    return this.getSR() & 0x1F;
  }

  private setCCR(v: number): void {
    this.syncFlagsFromSR(v);
  }

  private setSupervisorMode(s: boolean): void {
    const wasSuper = (this.sr & (1 << SR_S)) !== 0;
    if (s && !wasSuper) {
      this.usp = this.a[7]!;
      this.a[7] = this.ssp;
    } else if (!s && wasSuper) {
      this.ssp = this.a[7]!;
      this.a[7] = this.usp;
    }
    if (s) this.sr |= (1 << SR_S);
    else this.sr &= ~(1 << SR_S);
  }

  private setSR(val: number): void {
    const newS = (val & (1 << SR_S)) !== 0;
    this.setSupervisorMode(newS);
    this.sr = val & 0xFFE0; // upper byte only, flags go to booleans
    this.syncFlagsFromSR(val);
  }

  private isSupervisor(): boolean {
    return (this.sr & (1 << SR_S)) !== 0;
  }

  // =========================================================================
  // Condition testing
  // =========================================================================

  private testCondition(cc: number): boolean {
    switch (cc & 0xF) {
      case 0: return true;                                    // T
      case 1: return false;                                   // F
      case 2: return !this._fC && !this._fZ;              // HI
      case 3: return this._fC || this._fZ;                // LS
      case 4: return !this._fC;                             // CC (HS)
      case 5: return this._fC;                              // CS (LO)
      case 6: return !this._fZ;                             // NE
      case 7: return this._fZ;                              // EQ
      case 8: return !this._fV;                             // VC
      case 9: return this._fV;                              // VS
      case 10: return !this._fN;                            // PL
      case 11: return this._fN;                             // MI
      case 12: return this._fN === this._fV;              // GE
      case 13: return this._fN !== this._fV;              // LT
      case 14: return !this._fZ && (this._fN === this._fV); // GT
      case 15: return this._fZ || (this._fN !== this._fV);  // LE
      default: return false;
    }
  }

  // =========================================================================
  // Exception processing
  // =========================================================================

  private raiseException(vector: number, extraCycles: number): void {
    const oldSR = this.getSR();
    this.setSupervisorMode(true);
    this.sr &= ~(1 << SR_T); // Clear trace

    this.pushLong(this.pc);
    this.pushWord(oldSR);

    const vectorAddr = vector * 4;
    this.pc = this.bus.read32(vectorAddr & 0xFFFFFF);
    this.prefetchFill();
    this.cycles += 34 + extraCycles;
    this.stopped = false;
  }

  private raiseAddressError(address: number, isWrite: boolean = false, isInstruction: boolean = false): void {
    const oldSR = this.getSR();
    this.setSupervisorMode(true);
    this.sr &= ~(1 << SR_T);

    // Address error stack frame (14 bytes, 68000 format):
    // Push order (high addr first):
    //   PC (long)
    //   SR (word) — status before exception
    //   IR (word) — instruction register (current opcode)
    //   Access address (long) — the faulting address
    //   Access info (word) — opcode upper bits + R/W + I/N + function code
    let framePC: number;
    if (isInstruction) {
      framePC = (address - 4) & 0xFFFFFFFF;
    } else if (this.addressErrorFramePC >= 0) {
      framePC = this.addressErrorFramePC;
      this.addressErrorFramePC = -1;
    } else {
      framePC = (this.pc - 2) & 0xFFFFFFFF;
    }
    this.pushLong(framePC);
    this.pushWord(oldSR);
    this.pushWord(this.opcode);
    this.pushLong(address);

    // Info word: upper 11 bits from opcode, lower 5 bits = R/W + I/N + FC
    const sup = (oldSR & 0x2000) !== 0;
    let fc: number;
    let inBit: number;
    if (isInstruction) {
      fc = sup ? 6 : 2;   // supervisor program / user program
      inBit = 0x08;        // bit 3: I/N = 1 (instruction)
    } else {
      fc = sup ? 5 : 1;   // supervisor data / user data
      inBit = 0x00;        // bit 3: I/N = 0 (data)
    }
    const fcWord = (this.opcode & 0xFFE0) |
      (isWrite ? 0 : 0x10) |  // bit 4: R/W (1=read, 0=write)
      inBit |
      fc;
    this.pushWord(fcWord);

    this.pc = this.bus.read32(VEC_ADDRESS_ERROR * 4);
    this.prefetchFill();
    this.cycles += 50;
    this.stopped = false;
  }

  /** Check if a branch/jump target is odd; raise address error if so. */
  private checkOddPC(addr: number): boolean {
    if (addr & 1) {
      this.addressError = true;
      this.raiseAddressError(addr, false, true);
      return true;
    }
    return false;
  }

  private processInterrupt(level: number): void {
    const oldSR = this.getSR();
    this.setSupervisorMode(true);
    this.sr &= ~(1 << SR_T);
    // Set new interrupt mask
    this.sr = (this.sr & ~0x0700) | ((level & 7) << 8);

    this.pushLong(this.pc);
    this.pushWord(oldSR);

    const vector = VEC_AUTOVECTOR_BASE + level - 1;
    this.pc = this.bus.read32((vector * 4) & 0xFFFFFF);
    this.prefetchFill();

    this.cycles += 44;
    this.stopped = false;

    // Clear edge-triggered pending interrupt if it was serviced
    if (this.pendingInterrupt <= level) {
      this.pendingInterrupt = 0;
    }

    // Notify the bus/system that the interrupt has been acknowledged.
    // On real CPS1 hardware, the autovector acknowledge cycle clears
    // both IPL1 and IPL2 lines (see MAME irqack_r).
    if (this.irqAckCallback) {
      this.irqAckCallback();
    }
  }

  /** Set a callback that fires when the CPU acknowledges an interrupt. */
  setIrqAckCallback(cb: () => void): void {
    this.irqAckCallback = cb;
  }

  private irqAckCallback: (() => void) | null = null;

  // =========================================================================
  // Stack operations
  // =========================================================================

  private pushWord(val: number): void {
    this.a[7] = (this.a[7]! - 2) | 0;
    this.bus.write16(this.a[7] & 0xFFFFFF, val & 0xFFFF);
  }

  private pushLong(val: number): void {
    this.a[7] = (this.a[7]! - 4) | 0;
    this.bus.write32(this.a[7] & 0xFFFFFF, val >>> 0);
  }

  private popWord(): number {
    const val = this.bus.read16(this.a[7]! & 0xFFFFFF);
    this.a[7] = (this.a[7]! + 2) | 0;
    return val;
  }

  private popLong(): number {
    const val = this.bus.read32(this.a[7]! & 0xFFFFFF);
    this.a[7] = (this.a[7]! + 4) | 0;
    return val;
  }

  // =========================================================================
  // Effective address resolution
  // =========================================================================

  // Returns the computed address for the given EA mode/reg.
  // Does NOT read the value; just computes the address.
  // For Dn/An direct, returns a sentinel (negative) — caller must handle.
  private computeEA(mode: number, reg: number, size: number): number {
    switch (mode) {
      case EA_DATA_REG:
      case EA_ADDR_REG:
        return -1; // register direct — no memory address
      case EA_ADDR_IND:
        return this.a[reg]!;
      case EA_ADDR_INC: {
        const addr = this.a[reg]!;
        let inc = size;
        // Byte size on A7 still moves by 2 to keep stack aligned
        if (size === 1 && reg === 7) inc = 2;
        this.a[reg] = (this.a[reg]! + inc) | 0;
        return addr;
      }
      case EA_ADDR_DEC: {
        let dec = size;
        if (size === 1 && reg === 7) dec = 2;
        this.a[reg] = (this.a[reg]! - dec) | 0;
        return this.a[reg];
      }
      case EA_ADDR_DISP: {
        const disp = signExtend16(this.readImm16());
        return (this.a[reg]! + disp) | 0;
      }
      case EA_ADDR_IDX: {
        return this.computeIndexEA(this.a[reg]!);
      }
      case EA_OTHER:
        return this.computeEAOther(reg);
      default:
        return 0;
    }
  }

  private computeEAOther(reg: number): number {
    switch (reg) {
      case EA_ABS_W: {
        return signExtend16(this.readImm16());
      }
      case EA_ABS_L: {
        return this.readImm32();
      }
      case EA_PC_DISP: {
        const base = this.pc;
        const disp = signExtend16(this.readImm16());
        return (base + disp) | 0;
      }
      case EA_PC_IDX: {
        const base = this.pc;
        return this.computeIndexEAFromBase(base);
      }
      case EA_IMMEDIATE:
        return -2; // sentinel for immediate
      default:
        this.raiseException(VEC_ILLEGAL, 0);
        return 0;
    }
  }

  private computeIndexEA(baseReg: number): number {
    const ext = this.readImm16();
    const disp = signExtend8(ext & 0xFF);
    const idxReg = (ext >> 12) & 7;
    const idxIsAddr = (ext & 0x8000) !== 0;
    const idxLong = (ext & 0x0800) !== 0;
    let idx = idxIsAddr ? this.a[idxReg]! : this.d[idxReg]!;
    if (!idxLong) idx = signExtend16(idx & 0xFFFF);
    return (baseReg + disp + idx) | 0;
  }

  private computeIndexEAFromBase(base: number): number {
    const ext = this.readImm16();
    const disp = signExtend8(ext & 0xFF);
    const idxReg = (ext >> 12) & 7;
    const idxIsAddr = (ext & 0x8000) !== 0;
    const idxLong = (ext & 0x0800) !== 0;
    let idx = idxIsAddr ? this.a[idxReg]! : this.d[idxReg]!;
    if (!idxLong) idx = signExtend16(idx & 0xFFFF);
    return (base + disp + idx) | 0;
  }

  // Read a value from an effective address
  private readEA(mode: number, reg: number, size: number): number {
    if (mode === EA_DATA_REG) {
      switch (size) {
        case 1: return this.d[reg]! & 0xFF;
        case 2: return this.d[reg]! & 0xFFFF;
        case 4: return this.d[reg]! >>> 0;
        default: return 0;
      }
    }
    if (mode === EA_ADDR_REG) {
      switch (size) {
        case 2: return this.a[reg]! & 0xFFFF;
        case 4: return this.a[reg]! >>> 0;
        default: return this.a[reg]! & 0xFF;
      }
    }
    if (mode === EA_OTHER && reg === EA_IMMEDIATE) {
      if (size === 1) return this.readImm16() & 0xFF;
      if (size === 2) return this.readImm16();
      return this.readImm32();
    }

    const addr = this.computeEA(mode, reg, size);
    return this.readFromAddr(addr, size);
  }

  private readFromAddr(addr: number, size: number): number {
    // If an address error already occurred in this instruction, don't do anything
    if (this.addressError) return 0;
    // Address error: word/long access to odd address
    if (size > 1 && (addr & 1)) {
      this.addressError = true;
      this.raiseAddressError(addr);
      return 0;
    }
    const masked = addr & 0xFFFFFF;
    switch (size) {
      case 1: return this.bus.read8(masked);
      case 2: return this.bus.read16(masked);
      case 4: return this.bus.read32(masked);
      default: return 0;
    }
  }

  // Write a value to an effective address
  private writeEA(mode: number, reg: number, size: number, val: number): void {
    if (this.addressError) return;
    if (mode === EA_DATA_REG) {
      switch (size) {
        case 1: this.d[reg] = (this.d[reg]! & 0xFFFFFF00) | (val & 0xFF); break;
        case 2: this.d[reg] = (this.d[reg]! & 0xFFFF0000) | (val & 0xFFFF); break;
        case 4: this.d[reg] = val | 0; break;
      }
      return;
    }
    if (mode === EA_ADDR_REG) {
      // Writes to An are always long
      this.a[reg] = val | 0;
      return;
    }
    const addr = this.computeEA(mode, reg, size);
    this.writeToAddr(addr, size, val);
  }

  private writeToAddr(addr: number, size: number, val: number): void {
    // If an address error already occurred in this instruction, don't do anything
    if (this.addressError) return;
    // Address error: word/long access to odd address
    if (size > 1 && (addr & 1)) {
      this.addressError = true;
      this.raiseAddressError(addr, true);
      return;
    }
    switch (size) {
      case 1: this.bus.write8(addr & 0xFFFFFF, val & 0xFF); break;
      case 2: this.bus.write16(addr & 0xFFFFFF, val & 0xFFFF); break;
      case 4: this.bus.write32(addr & 0xFFFFFF, val >>> 0); break;
    }
  }

  // Get the address for an EA (for LEA, PEA, JMP, JSR, etc.)
  // Only valid for control addressing modes.
  private getControlEA(mode: number, reg: number): number {
    // NOTE: addresses are NOT masked to 24-bit here. LEA stores the full
    // 32-bit address in An (used for comparisons like CMPA). The bus
    // handles 24-bit masking when actually accessing memory.
    switch (mode) {
      case EA_ADDR_IND:
        return this.a[reg]!;
      case EA_ADDR_DISP: {
        const disp = signExtend16(this.readImm16());
        return (this.a[reg]! + disp) | 0;
      }
      case EA_ADDR_IDX:
        return this.computeIndexEA(this.a[reg]!);
      case EA_OTHER:
        switch (reg) {
          case EA_ABS_W: {
            return signExtend16(this.readImm16());
          }
          case EA_ABS_L:
            return this.readImm32() | 0;
          case EA_PC_DISP: {
            const base = this.pc;
            const disp = signExtend16(this.readImm16());
            return (base + disp) | 0;
          }
          case EA_PC_IDX: {
            const base = this.pc;
            return this.computeIndexEAFromBase(base);
          }
          default:
            this.raiseException(VEC_ILLEGAL, 0);
            return 0;
        }
      default:
        this.raiseException(VEC_ILLEGAL, 0);
        return 0;
    }
  }

  // =========================================================================
  // Flag computation helpers
  // =========================================================================

  private setLogicFlags(val: number, size: number): void {
    if (this.addressError) return;
    this._fV = false;
    this._fC = false;
    switch (size) {
      case 1:
        this._fN = msb8(val);
        this._fZ = clip8(val) === 0;
        break;
      case 2:
        this._fN = msb16(val);
        this._fZ = clip16(val) === 0;
        break;
      case 4:
        this._fN = msb32(val);
        this._fZ = clip32(val) === 0;
        break;
    }
  }

  private setAddFlags(src: number, dst: number, result: number, size: number): void {
    if (this.addressError) return;
    let s: number, d: number, r: number;
    switch (size) {
      case 1:
        s = src & 0xFF; d = dst & 0xFF; r = result & 0xFF;
        this._fN = msb8(r);
        this._fZ = r === 0;
        this._fV = ((~(s ^ d) & (r ^ d)) & 0x80) !== 0;
        this._fC = (result & 0x100) !== 0;
        this._fX = this._fC;
        break;
      case 2:
        s = src & 0xFFFF; d = dst & 0xFFFF; r = result & 0xFFFF;
        this._fN = msb16(r);
        this._fZ = r === 0;
        this._fV = ((~(s ^ d) & (r ^ d)) & 0x8000) !== 0;
        this._fC = (result & 0x10000) !== 0;
        this._fX = this._fC;
        break;
      case 4:
        s = src >>> 0; d = dst >>> 0; r = result >>> 0;
        this._fN = msb32(r);
        this._fZ = r === 0;
        // For 32-bit, we must use different overflow detection
        this._fV = ((~(s ^ d) & (r ^ d)) & 0x80000000) !== 0;
        // Carry: result > 0xFFFFFFFF, detect by checking if sum wrapped
        this._fC = (r < s) || (r < d);
        this._fX = this._fC;
        break;
    }
  }

  /** Flags for SUBX/ADDX — uses original src (not src+X) for V flag */
  private setSubXFlags(src: number, dst: number, result: number, size: number): void {
    if (this.addressError) return;
    const msb = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const s = size === 4 ? src >>> 0 : src & mask;
    const d = size === 4 ? dst >>> 0 : dst & mask;
    const r = size === 4 ? result >>> 0 : result & mask;
    this._fN = (r & msb) !== 0;
    this._fZ = r === 0;
    // V uses original src (not src+X) to correctly detect signed overflow
    this._fV = (((s ^ d) & (r ^ d)) & msb) !== 0;
    // C = borrow occurred: dst < src + X (full precision, no wrapping)
    this._fC = result < 0;
    this._fX = this._fC;
  }

  private setAddXFlags(src: number, dst: number, result: number, size: number): void {
    if (this.addressError) return;
    const msb = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const limit = size === 1 ? 0x100 : size === 2 ? 0x10000 : 0x100000000;
    const s = size === 4 ? src >>> 0 : src & mask;
    const d = size === 4 ? dst >>> 0 : dst & mask;
    const r = size === 4 ? result >>> 0 : result & mask;
    this._fN = (r & msb) !== 0;
    this._fZ = r === 0;
    // V uses original src (not src+X) to correctly detect signed overflow
    this._fV = ((~(s ^ d) & (r ^ d)) & msb) !== 0;
    // C = carry occurred: result >= limit
    this._fC = result >= limit;
    this._fX = this._fC;
  }

  private setSubFlags(src: number, dst: number, result: number, size: number): void {
    if (this.addressError) return;
    let s: number, d: number, r: number;
    switch (size) {
      case 1:
        s = src & 0xFF; d = dst & 0xFF; r = result & 0xFF;
        this._fN = msb8(r);
        this._fZ = r === 0;
        this._fV = (((s ^ d) & (r ^ d)) & 0x80) !== 0;
        this._fC = (d < s);
        this._fX = this._fC;
        break;
      case 2:
        s = src & 0xFFFF; d = dst & 0xFFFF; r = result & 0xFFFF;
        this._fN = msb16(r);
        this._fZ = r === 0;
        this._fV = (((s ^ d) & (r ^ d)) & 0x8000) !== 0;
        this._fC = (d < s);
        this._fX = this._fC;
        break;
      case 4:
        s = src >>> 0; d = dst >>> 0; r = result >>> 0;
        this._fN = msb32(r);
        this._fZ = r === 0;
        this._fV = (((s ^ d) & (r ^ d)) & 0x80000000) !== 0;
        this._fC = ((d >>> 0) < (s >>> 0));
        this._fX = this._fC;
        break;
    }
  }

  private setCmpFlags(src: number, dst: number, result: number, size: number): void {
    // Same as sub flags but don't touch X
    const oldX = this._fX;
    this.setSubFlags(src, dst, result, size);
    this._fX = oldX;
  }

  // =========================================================================
  // Size decoding helpers
  // =========================================================================

  private decodeSize2(bits: number): number {
    // bits = (opcode >> 6) & 3: 0=byte, 1=word, 2=long
    switch (bits) {
      case 0: return 1;
      case 1: return 2;
      case 2: return 4;
      default: return 0; // invalid
    }
  }

  // =========================================================================
  // Instruction dispatch — by line (bits 15-12)
  // =========================================================================

  private executeInstruction(): void {
    const line = (this.opcode >> 12) & 0xF;
    switch (line) {
      case 0x0: this.line0(); break;
      case 0x1: this.lineMove(1); break; // MOVE.B
      case 0x2: this.lineMove(4); break; // MOVE.L
      case 0x3: this.lineMove(2); break; // MOVE.W
      case 0x4: this.line4(); break;
      case 0x5: this.line5(); break;
      case 0x6: this.line6(); break;
      case 0x7: this.line7(); break;     // MOVEQ
      case 0x8: this.line8(); break;
      case 0x9: this.line9(); break;
      case 0xA: this.raiseException(VEC_LINE_A, 0); this.cycles += 4; break;
      case 0xB: this.lineB(); break;
      case 0xC: this.lineC(); break;
      case 0xD: this.lineD(); break;
      case 0xE: this.lineE(); break;
      case 0xF: this.raiseException(VEC_LINE_F, 0); this.cycles += 4; break;
      default: this.raiseException(VEC_ILLEGAL, 0); break;
    }
  }

  // =========================================================================
  // Line 0: Immediate operations, bit manipulation, MOVEP
  // =========================================================================

  private line0(): void {
    const op = this.opcode;

    // Check for bit operations with dynamic register
    // Encoding: 0000 DDD 1 TT MMM RRR (bit 8 set = dynamic register)
    // TT: 00=BTST, 01=BCHG, 10=BCLR, 11=BSET
    // Note: when MMM=001, this is MOVEP (handled below)
    if ((op & 0x0100) !== 0) {
      // BTST/BCHG/BCLR/BSET — register
      const bitReg = (op >> 9) & 7;

      // Check for MOVEP
      const mode = (op >> 3) & 7;
      if (mode === 1) {
        this.opMovep(op);
        return;
      }

      const type = (op >> 6) & 3;
      const dstMode = (op >> 3) & 7;
      const dstReg = op & 7;
      const bitNum = this.d[bitReg]!;
      this.opBitDynamic(type, bitNum, dstMode, dstReg);
      return;
    }

    // Check for bit operations with static immediate
    if ((op & 0x0F00) === 0x0800) {
      const type = (op >> 6) & 3;
      const dstMode = (op >> 3) & 7;
      const dstReg = op & 7;
      const bitNum = this.readImm16() & 0xFF;
      this.opBitDynamic(type, bitNum, dstMode, dstReg);
      return;
    }

    // Immediate operations
    const imOp = (op >> 9) & 7;
    const size = this.decodeSize2((op >> 6) & 3);
    const dstMode = (op >> 3) & 7;
    const dstReg = op & 7;

    switch (imOp) {
      case 0: this.opORI(size, dstMode, dstReg); break;
      case 1: this.opANDI(size, dstMode, dstReg); break;
      case 2: this.opSUBI(size, dstMode, dstReg); break;
      case 3: this.opADDI(size, dstMode, dstReg); break;
      case 5: this.opEORI(size, dstMode, dstReg); break;
      case 6: this.opCMPI(size, dstMode, dstReg); break;
      default:
        this.raiseException(VEC_ILLEGAL, 0);
        break;
    }
  }

  // --- Bit operations ---

  private opBitDynamic(type: number, bitNum: number, mode: number, reg: number): void {
    // For Dn, bit number modulo 32, size is long
    // For memory, bit number modulo 8, size is byte
    if (mode === EA_DATA_REG) {
      const bit = bitNum & 31;
      const val = this.d[reg]!;
      this._fZ = ((val >>> bit) & 1) === 0;

      switch (type) {
        case 0: // BTST
          this.cycles += 6;
          break;
        case 1: // BCHG
          this.d[reg] = val ^ (1 << bit);
          this.cycles += (bit > 15 ? 10 : 8);
          break;
        case 2: // BCLR
          this.d[reg] = val & ~(1 << bit);
          this.cycles += (bit > 15 ? 12 : 10);
          break;
        case 3: // BSET
          this.d[reg] = val | (1 << bit);
          this.cycles += (bit > 15 ? 10 : 8);
          break;
      }
    } else if (mode === EA_OTHER && reg === EA_IMMEDIATE) {
      // BTST Dn, #imm — test bit in immediate data
      const bit = bitNum & 7;
      const val = this.readImm16() & 0xFF;
      this._fZ = ((val >>> bit) & 1) === 0;
      this.cycles += (type === 0 ? 4 : 8);
      // Note: BCHG/BCLR/BSET on #imm are illegal on real 68000,
      // but we handle BTST for correctness
    } else {
      const bit = bitNum & 7;
      const addr = this.computeEA(mode, reg, 1);
      const val = this.bus.read8(addr);
      this._fZ = ((val >>> bit) & 1) === 0;

      switch (type) {
        case 0: // BTST
          this.cycles += 4;
          break;
        case 1: // BCHG
          this.bus.write8(addr, val ^ (1 << bit));
          this.cycles += 8;
          break;
        case 2: // BCLR
          this.bus.write8(addr, val & ~(1 << bit));
          this.cycles += 8;
          break;
        case 3: // BSET
          this.bus.write8(addr, val | (1 << bit));
          this.cycles += 8;
          break;
      }
    }
  }

  // --- MOVEP ---

  private opMovep(op: number): void {
    const dataReg = (op >> 9) & 7;
    const addrReg = op & 7;
    const disp = signExtend16(this.readImm16());
    const addr = ((this.a[addrReg]! + disp) & 0xFFFFFF);
    const opmode = (op >> 6) & 7;

    switch (opmode) {
      case 4: {
        // MOVEP.W (d16,An),Dn
        const hi = this.bus.read8(addr);
        const lo = this.bus.read8((addr + 2) & 0xFFFFFF);
        this.d[dataReg] = (this.d[dataReg]! & 0xFFFF0000) | (hi << 8) | lo;
        this.cycles += 16;
        break;
      }
      case 5: {
        // MOVEP.L (d16,An),Dn
        const b3 = this.bus.read8(addr);
        const b2 = this.bus.read8((addr + 2) & 0xFFFFFF);
        const b1 = this.bus.read8((addr + 4) & 0xFFFFFF);
        const b0 = this.bus.read8((addr + 6) & 0xFFFFFF);
        this.d[dataReg] = ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) | 0;
        this.cycles += 24;
        break;
      }
      case 6: {
        // MOVEP.W Dn,(d16,An)
        const val = this.d[dataReg]!;
        this.bus.write8(addr, (val >> 8) & 0xFF);
        this.bus.write8((addr + 2) & 0xFFFFFF, val & 0xFF);
        this.cycles += 16;
        break;
      }
      case 7: {
        // MOVEP.L Dn,(d16,An)
        const val = this.d[dataReg]!;
        this.bus.write8(addr, (val >> 24) & 0xFF);
        this.bus.write8((addr + 2) & 0xFFFFFF, (val >> 16) & 0xFF);
        this.bus.write8((addr + 4) & 0xFFFFFF, (val >> 8) & 0xFF);
        this.bus.write8((addr + 6) & 0xFFFFFF, val & 0xFF);
        this.cycles += 24;
        break;
      }
      default:
        this.raiseException(VEC_ILLEGAL, 0);
        break;
    }
  }

  // --- Immediate ALU ops ---

  private readImmForSize(size: number): number {
    if (size === 1) return this.readImm16() & 0xFF;
    if (size === 2) return this.readImm16();
    return this.readImm32();
  }

  private opORI(size: number, mode: number, reg: number): void {
    // ORI to CCR: size=1, mode=7, reg=4
    if (size === 1 && mode === EA_OTHER && reg === EA_IMMEDIATE) {
      const imm = this.readImm16() & 0xFF;
      this.setCCR(this.getCCR() | imm);
      this.cycles += 20;
      return;
    }
    // ORI to SR
    if (size === 2 && mode === EA_OTHER && reg === EA_IMMEDIATE) {
      if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
      const imm = this.readImm16();
      this.setSR(this.getSR() | imm);
      this.cycles += 20;
      return;
    }
    const imm = this.readImmForSize(size);
    if (mode === EA_DATA_REG) {
      const val = this.readEA(mode, reg, size);
      const result = val | imm;
      this.writeEA(mode, reg, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 16 : 8);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const val = this.readFromAddr(addr, size);
      const result = val | imm;
      this.writeToAddr(addr, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 20 : 12);
    }
  }

  private opANDI(size: number, mode: number, reg: number): void {
    // ANDI to CCR
    if (size === 1 && mode === EA_OTHER && reg === EA_IMMEDIATE) {
      const imm = this.readImm16() & 0xFF;
      this.setCCR(this.getCCR() & imm);
      this.cycles += 20;
      return;
    }
    // ANDI to SR
    if (size === 2 && mode === EA_OTHER && reg === EA_IMMEDIATE) {
      if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
      const imm = this.readImm16();
      this.setSR(this.getSR() & imm);
      this.cycles += 20;
      return;
    }
    const imm = this.readImmForSize(size);
    if (mode === EA_DATA_REG) {
      const val = this.readEA(mode, reg, size);
      const result = val & imm;
      this.writeEA(mode, reg, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 14 : 8);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const val = this.readFromAddr(addr, size);
      const result = val & imm;
      this.writeToAddr(addr, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 20 : 12);
    }
  }

  private opSUBI(size: number, mode: number, reg: number): void {
    const imm = this.readImmForSize(size);
    if (mode === EA_DATA_REG) {
      const dst = this.readEA(mode, reg, size);
      const result = dst - imm;
      this.writeEA(mode, reg, size, result);
      this.setSubFlags(imm, dst, result, size);
      this.cycles += (size === 4 ? 16 : 8);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = dst - imm;
      this.writeToAddr(addr, size, result);
      this.setSubFlags(imm, dst, result, size);
      this.cycles += (size === 4 ? 20 : 12);
    }
  }

  private opADDI(size: number, mode: number, reg: number): void {
    const imm = this.readImmForSize(size);
    if (mode === EA_DATA_REG) {
      const dst = this.readEA(mode, reg, size);
      const result = dst + imm;
      this.writeEA(mode, reg, size, result);
      this.setAddFlags(imm, dst, result, size);
      this.cycles += (size === 4 ? 16 : 8);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = dst + imm;
      this.writeToAddr(addr, size, result);
      this.setAddFlags(imm, dst, result, size);
      this.cycles += (size === 4 ? 20 : 12);
    }
  }

  private opEORI(size: number, mode: number, reg: number): void {
    // EORI to CCR
    if (size === 1 && mode === EA_OTHER && reg === EA_IMMEDIATE) {
      const imm = this.readImm16() & 0xFF;
      this.setCCR(this.getCCR() ^ imm);
      this.cycles += 20;
      return;
    }
    // EORI to SR
    if (size === 2 && mode === EA_OTHER && reg === EA_IMMEDIATE) {
      if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
      const imm = this.readImm16();
      this.setSR(this.getSR() ^ imm);
      this.cycles += 20;
      return;
    }
    const imm = this.readImmForSize(size);
    if (mode === EA_DATA_REG) {
      const val = this.readEA(mode, reg, size);
      const result = val ^ imm;
      this.writeEA(mode, reg, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 16 : 8);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const val = this.readFromAddr(addr, size);
      const result = val ^ imm;
      this.writeToAddr(addr, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 20 : 12);
    }
  }

  private opCMPI(size: number, mode: number, reg: number): void {
    const imm = this.readImmForSize(size);
    const dst = this.readEA(mode, reg, size);
    const result = dst - imm;
    this.setCmpFlags(imm, dst, result, size);
    if (mode === EA_DATA_REG) {
      this.cycles += (size === 4 ? 14 : 8);
    } else {
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  // =========================================================================
  // Lines 1, 2, 3: MOVE / MOVEA
  // =========================================================================

  private lineMove(size: number): void {
    const op = this.opcode;
    const srcMode = (op >> 3) & 7;
    const srcReg = op & 7;
    const dstReg = (op >> 9) & 7;
    const dstMode = (op >> 6) & 7;

    // Read source
    const val = this.readEA(srcMode, srcReg, size);
    if (this.addressError) return;

    // MOVEA: destination is address register
    if (dstMode === EA_ADDR_REG) {
      // MOVEA sign-extends word to long
      if (size === 2) {
        this.a[dstReg] = signExtend16(val);
      } else {
        this.a[dstReg] = val | 0;
      }
      // MOVEA doesn't affect flags
      this.cycles += 4;
      return;
    }

    // Set flags before write (MOVE, not MOVEA) — on 68000 hardware,
    // flags are set from the source value before the destination write.
    // If the write triggers an address error, the frame captures updated flags.
    this.setLogicFlags(val, size);

    // For predecrement and modes with extension words, the 68000 address error
    // frame PC reflects the state after source EA resolution (= this.pc now),
    // not this.pc - 2 which is the default for data access errors.
    if (dstMode === EA_ADDR_DEC || dstMode === EA_ADDR_DISP || dstMode === EA_ADDR_IDX ||
        (dstMode === EA_OTHER && (dstReg === EA_ABS_W || dstReg === EA_ABS_L))) {
      this.addressErrorFramePC = this.pc;
    }

    // Write destination
    if (dstMode === EA_DATA_REG) {
      this.writeEA(dstMode, dstReg, size, val);
    } else if (dstMode === EA_ADDR_DEC) {
      // -(An) destination: predecrement before write
      // For long, 68000 writes as two words: first low word at An-2,
      // then high word at An-4. Address error after first -2 leaves An
      // only decremented by 2.
      let dec = size;
      if (size === 1 && dstReg === 7) dec = 2;
      if (size === 4) {
        // Long: write low word first at An-2
        this.a[dstReg] = (this.a[dstReg]! - 2) | 0;
        this.writeToAddr(this.a[dstReg], 2, val & 0xFFFF);
        if (this.addressError) return;
        // Then high word at An-4
        this.a[dstReg] = (this.a[dstReg] - 2) | 0;
        this.writeToAddr(this.a[dstReg], 2, (val >>> 16) & 0xFFFF);
      } else {
        this.a[dstReg] = (this.a[dstReg]! - dec) | 0;
        this.writeToAddr(this.a[dstReg], size, val);
      }
    } else if (dstMode === EA_ADDR_INC) {
      // (An)+ destination: write first, then postincrement only if no error
      const addr = this.a[dstReg]!;
      this.writeToAddr(addr, size, val);
      if (!this.addressError) {
        let inc = size;
        if (size === 1 && dstReg === 7) inc = 2;
        this.a[dstReg] = (this.a[dstReg]! + inc) | 0;
      }
    } else {
      this.writeEA(dstMode, dstReg, size, val);
    }

    this.cycles += 4;
  }

  // =========================================================================
  // Line 4: Miscellaneous
  // =========================================================================

  private line4(): void {
    const op = this.opcode;

    // Decode the many instructions that live in line 4
    // Check specific bit patterns

    // MOVE from SR: 0100 0000 11 <ea>
    if ((op & 0xFFC0) === 0x40C0) {
      this.opMoveFromSR();
      return;
    }

    // MOVE to CCR: 0100 0100 11 <ea>
    if ((op & 0xFFC0) === 0x44C0) {
      this.opMoveToCCR();
      return;
    }

    // MOVE to SR: 0100 0110 11 <ea>
    if ((op & 0xFFC0) === 0x46C0) {
      this.opMoveToSR();
      return;
    }

    // NEGX: 0100 0000 ss <ea>
    if ((op & 0xFF00) === 0x4000 && ((op >> 6) & 3) !== 3) {
      this.opNEGX();
      return;
    }

    // CLR: 0100 0010 ss <ea>
    if ((op & 0xFF00) === 0x4200 && ((op >> 6) & 3) !== 3) {
      this.opCLR();
      return;
    }

    // NEG: 0100 0100 ss <ea>
    if ((op & 0xFF00) === 0x4400 && ((op >> 6) & 3) !== 3) {
      this.opNEG();
      return;
    }

    // NOT: 0100 0110 ss <ea>
    if ((op & 0xFF00) === 0x4600 && ((op >> 6) & 3) !== 3) {
      this.opNOT();
      return;
    }

    // EXT: 0100 100 0ss 000 rrr
    if ((op & 0xFEB8) === 0x4880) {
      this.opEXT();
      return;
    }

    // NBCD: 0100 1000 00 <ea>
    if ((op & 0xFFC0) === 0x4800) {
      this.opNBCD();
      return;
    }

    // SWAP: 0100 1000 01 000 rrr
    if ((op & 0xFFF8) === 0x4840) {
      this.opSWAP();
      return;
    }

    // PEA: 0100 1000 01 <ea>
    if ((op & 0xFFC0) === 0x4840 && ((op >> 3) & 7) !== 0) {
      this.opPEA();
      return;
    }

    // ILLEGAL: 0100 1010 1111 1100
    if (op === 0x4AFC) {
      this.raiseException(VEC_ILLEGAL, 0);
      this.cycles += 4;
      return;
    }

    // TAS: 0100 1010 11 <ea>
    if ((op & 0xFFC0) === 0x4AC0) {
      this.opTAS();
      return;
    }

    // TST: 0100 1010 ss <ea>
    if ((op & 0xFF00) === 0x4A00 && ((op >> 6) & 3) !== 3) {
      this.opTST();
      return;
    }

    // MOVEM: 0100 1d00 1s <ea>
    if ((op & 0xFB80) === 0x4880) {
      this.opMOVEM();
      return;
    }

    // TRAP: 0100 1110 0100 vvvv
    if ((op & 0xFFF0) === 0x4E40) {
      this.raiseException(VEC_TRAP_BASE + (op & 0xF), 0);
      return;
    }

    // LINK: 0100 1110 0101 0 rrr
    if ((op & 0xFFF8) === 0x4E50) {
      this.opLINK();
      return;
    }

    // UNLK: 0100 1110 0101 1 rrr
    if ((op & 0xFFF8) === 0x4E58) {
      this.opUNLK();
      return;
    }

    // MOVE USP: 0100 1110 0110 d rrr
    if ((op & 0xFFF0) === 0x4E60) {
      this.opMoveUSP();
      return;
    }

    // RESET: 0100 1110 0111 0000
    if (op === 0x4E70) {
      if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
      this.cycles += 132;
      return;
    }

    // NOP: 0100 1110 0111 0001
    if (op === 0x4E71) {
      this.cycles += 4;
      return;
    }

    // STOP: 0100 1110 0111 0010
    if (op === 0x4E72) {
      if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
      const imm = this.readImm16();
      this.setSR(imm);
      this.stopped = true;
      this.cycles += 4;
      return;
    }

    // RTE: 0100 1110 0111 0011
    if (op === 0x4E73) {
      this.opRTE();
      return;
    }

    // RTS: 0100 1110 0111 0101
    if (op === 0x4E75) {
      this.opRTS();
      return;
    }

    // TRAPV: 0100 1110 0111 0110
    if (op === 0x4E76) {
      if (this._fV) {
        this.raiseException(VEC_TRAPV, 0);
      }
      this.cycles += 4;
      return;
    }

    // RTR: 0100 1110 0111 0111
    if (op === 0x4E77) {
      this.opRTR();
      return;
    }

    // JSR: 0100 1110 10 <ea>
    if ((op & 0xFFC0) === 0x4E80) {
      this.opJSR();
      return;
    }

    // JMP: 0100 1110 11 <ea>
    if ((op & 0xFFC0) === 0x4EC0) {
      this.opJMP();
      return;
    }

    // LEA: 0100 rrr 111 <ea>
    if ((op & 0xF1C0) === 0x41C0) {
      this.opLEA();
      return;
    }

    // CHK: 0100 rrr 110 <ea>
    if ((op & 0xF1C0) === 0x4180) {
      this.opCHK();
      return;
    }

    this.raiseException(VEC_ILLEGAL, 0);
    this.cycles += 4;
  }

  private opMoveFromSR(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    if (mode === EA_DATA_REG) {
      this.d[reg] = (this.d[reg]! & 0xFFFF0000) | (this.getSR() & 0xFFFF);
      this.cycles += 6;
    } else {
      const addr = this.computeEA(mode, reg, 2);
      this.bus.write16(addr, this.getSR() & 0xFFFF);
      this.cycles += 8;
    }
  }

  private opMoveToCCR(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const val = this.readEA(mode, reg, 2);
    this.setCCR(val & 0x1F);
    this.cycles += 12;
  }

  private opMoveToSR(): void {
    if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const val = this.readEA(mode, reg, 2);
    this.setSR(val);
    this.cycles += 12;
  }

  private opNEGX(): void {
    const size = this.decodeSize2((this.opcode >> 6) & 3);
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const x = this._fX ? 1 : 0;

    if (mode === EA_DATA_REG) {
      const dst = this.readEA(mode, reg, size);
      const result = 0 - dst - x;
      this.writeEA(mode, reg, size, result);
      this.setSubFlags(dst + x, 0, result, size);
      // NEGX: Z is only cleared, never set
      if (size === 1 && clip8(result) !== 0) this._fZ = false;
      else if (size === 2 && clip16(result) !== 0) this._fZ = false;
      else if (size === 4 && clip32(result) !== 0) this._fZ = false;
      // Actually NEGX: Z is cleared if result non-zero, unchanged otherwise
      // Re-implement: Z unchanged if result is 0
      const clipped = size === 1 ? clip8(result) : size === 2 ? clip16(result) : clip32(result);
      if (clipped !== 0) this._fZ = false;
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = 0 - dst - x;
      this.writeToAddr(addr, size, result);
      this.setSubFlags(dst + x, 0, result, size);
      const clipped = size === 1 ? clip8(result) : size === 2 ? clip16(result) : clip32(result);
      if (clipped !== 0) this._fZ = false;
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opCLR(): void {
    const size = this.decodeSize2((this.opcode >> 6) & 3);
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;

    // CLR reads then writes (even though the result is always 0)
    if (mode === EA_DATA_REG) {
      this.writeEA(mode, reg, size, 0);
      this.cycles += (size === 4 ? 6 : 4);
    } else {
      const addr = this.computeEA(mode, reg, size);
      this.readFromAddr(addr, size); // dummy read
      this.writeToAddr(addr, size, 0);
      this.cycles += (size === 4 ? 12 : 8);
    }

    if (this.addressError) return;
    this._fN = false;
    this._fZ = true;
    this._fV = false;
    this._fC = false;
  }

  private opNEG(): void {
    const size = this.decodeSize2((this.opcode >> 6) & 3);
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;

    if (mode === EA_DATA_REG) {
      const dst = this.readEA(mode, reg, size);
      const result = 0 - dst;
      this.writeEA(mode, reg, size, result);
      this.setSubFlags(dst, 0, result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = 0 - dst;
      this.writeToAddr(addr, size, result);
      this.setSubFlags(dst, 0, result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opNOT(): void {
    const size = this.decodeSize2((this.opcode >> 6) & 3);
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;

    if (mode === EA_DATA_REG) {
      const val = this.readEA(mode, reg, size);
      const result = ~val;
      this.writeEA(mode, reg, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const val = this.readFromAddr(addr, size);
      const result = ~val;
      this.writeToAddr(addr, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opEXT(): void {
    const reg = this.opcode & 7;
    const opmode = (this.opcode >> 6) & 7;

    if (opmode === 2) {
      // EXT.W — byte to word
      const val = signExtend8(this.d[reg]! & 0xFF) & 0xFFFF;
      this.d[reg] = (this.d[reg]! & 0xFFFF0000) | val;
      this.setLogicFlags(val, 2);
    } else {
      // EXT.L — word to long
      const val = signExtend16(this.d[reg]! & 0xFFFF);
      this.d[reg] = val | 0;
      this.setLogicFlags(val, 4);
    }
    this.cycles += 4;
  }

  private opNBCD(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const x = this._fX ? 1 : 0;

    if (mode === EA_DATA_REG) {
      const dst = this.d[reg]! & 0xFF;
      const result = this.bcdNegate(dst, x);
      this.d[reg] = (this.d[reg]! & 0xFFFFFF00) | (result & 0xFF);
      this.cycles += 6;
    } else {
      const addr = this.computeEA(mode, reg, 1);
      const dst = this.bus.read8(addr);
      const result = this.bcdNegate(dst, x);
      this.bus.write8(addr, result & 0xFF);
      this.cycles += 8;
    }
  }

  private bcdNegate(val: number, x: number): number {
    let carry = false;

    // Low nibble correction
    let lowNibble = (0 - (val & 0x0F) - x) & 0x1F;
    if (lowNibble > 9) {
      lowNibble -= 6;
    }

    // High nibble
    let highNibble = (0 - ((val >> 4) & 0x0F) - (lowNibble > 0x0F ? 1 : 0)) & 0x1F;
    if (highNibble > 9) {
      highNibble -= 6;
      carry = true;
    }

    const result = ((highNibble & 0xF) << 4) | (lowNibble & 0xF);
    this._fC = carry;
    this._fX = carry;
    if ((result & 0xFF) !== 0) this._fZ = false;
    return result & 0xFF;
  }

  private opSWAP(): void {
    const reg = this.opcode & 7;
    const val = this.d[reg]!;
    const result = ((val & 0xFFFF) << 16) | ((val >>> 16) & 0xFFFF);
    this.d[reg] = result | 0;
    this.setLogicFlags(result, 4);
    this.cycles += 4;
  }

  private opPEA(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const addr = this.getControlEA(mode, reg);
    this.pushLong(addr);
    this.cycles += 12;
  }

  private opTAS(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;

    if (mode === EA_DATA_REG) {
      const val = this.d[reg]! & 0xFF;
      this.setLogicFlags(val, 1);
      this.d[reg] = (this.d[reg]! & 0xFFFFFF00) | (val | 0x80);
      this.cycles += 4;
    } else {
      const addr = this.computeEA(mode, reg, 1);
      const val = this.bus.read8(addr);
      this.setLogicFlags(val, 1);
      this.bus.write8(addr, val | 0x80);
      this.cycles += 14;
    }
  }

  private opTST(): void {
    const size = this.decodeSize2((this.opcode >> 6) & 3);
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const val = this.readEA(mode, reg, size);
    this.setLogicFlags(val, size);
    this.cycles += 4;
  }

  private opMOVEM(): void {
    const op = this.opcode;
    const dir = (op >> 10) & 1; // 0=reg-to-mem, 1=mem-to-reg
    const sz = (op >> 6) & 1;  // 0=word, 1=long
    const size = sz ? 4 : 2;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    const mask = this.readImm16();

    if (mask === 0) {
      // Empty mask: 68000 still performs a dummy word read at the EA.
      // This can trigger address errors for odd addresses.
      let addr: number;
      if (mode === EA_ADDR_DEC) {
        addr = (this.a[reg]! - 2) | 0;
      } else if (mode === EA_ADDR_INC) {
        addr = this.a[reg]!;
      } else {
        addr = this.getControlEA(mode, reg);
      }
      this.readFromAddr(addr, 2); // dummy word read
      if (this.addressError) {
        // For postincrement, An is still updated by 2 on address error
        if (mode === EA_ADDR_INC) {
          this.a[reg] = (this.a[reg]! + 2) | 0;
        }
        return;
      }
      if (mode === EA_ADDR_INC) {
        this.a[reg] = (this.a[reg]! + 2) | 0;
      } else if (mode === EA_ADDR_DEC) {
        this.a[reg] = addr;
      }
      this.cycles += 8;
      return;
    }

    if (dir === 0) {
      // Register to memory
      if (mode === EA_ADDR_DEC) {
        // -(An): registers stored in reverse order, mask is reversed
        // 68000 writes long values as two words: first low word, then high word.
        let addr = this.a[reg]!;
        for (let i = 15; i >= 0; i--) {
          if ((mask & (1 << (15 - i))) !== 0) {
            const val = i < 8 ? this.d[i]! : this.a[i - 8]!;
            if (size === 2) {
              addr = (addr - 2) | 0;
              this.writeToAddr(addr, 2, val & 0xFFFF);
              if (this.addressError) return;
            } else {
              // Long: write low word first, then high word
              addr = (addr - 2) | 0;
              this.writeToAddr(addr, 2, val & 0xFFFF);
              if (this.addressError) return;
              addr = (addr - 2) | 0;
              this.writeToAddr(addr, 2, (val >>> 16) & 0xFFFF);
              if (this.addressError) return;
            }
          }
        }
        this.a[reg] = addr | 0;
      } else {
        let addr = this.getControlEA(mode, reg);
        for (let i = 0; i < 16; i++) {
          if ((mask & (1 << i)) !== 0) {
            const val = i < 8 ? this.d[i]! : this.a[i - 8]!;
            if (size === 2) {
              this.writeToAddr(addr, 2, val & 0xFFFF);
              if (this.addressError) return;
              addr += 2;
            } else {
              this.writeToAddr(addr, 2, (val >>> 16) & 0xFFFF);
              if (this.addressError) return;
              this.writeToAddr((addr + 2) | 0, 2, val & 0xFFFF);
              if (this.addressError) return;
              addr += 4;
            }
          }
        }
      }
    } else {
      // Memory to register
      let addr: number;
      if (mode === EA_ADDR_INC) {
        addr = this.a[reg]!;
      } else {
        addr = this.getControlEA(mode, reg);
      }

      for (let i = 0; i < 16; i++) {
        if ((mask & (1 << i)) !== 0) {
          const val = this.readFromAddr(addr, size);
          if (this.addressError) {
            // On address error during MOVEM postincrement, the 68000
            // still updates An to reflect the attempted read position + 2
            if (mode === EA_ADDR_INC) {
              this.a[reg] = (addr + 2) | 0;
            }
            return;
          }
          if (i < 8) {
            this.d[i] = size === 2 ? signExtend16(val) : val | 0;
          } else {
            this.a[i - 8] = size === 2 ? signExtend16(val) : val | 0;
          }
          addr += size;
        }
      }

      if (mode === EA_ADDR_INC) {
        this.a[reg] = addr | 0;
      }
    }

    const count = popcount16(mask);
    if (size === 4) {
      this.cycles += 8 + count * 8;
    } else {
      this.cycles += 8 + count * 4;
    }
  }

  private opLINK(): void {
    const reg = this.opcode & 7;
    if (reg === 7) {
      // LINK A7 special case: A7 is decremented first, then the
      // decremented value is written to the stack (68000 quirk)
      this.a[7] = (this.a[7]! - 4) | 0;
      this.bus.write32(this.a[7] & 0xFFFFFF, this.a[7] >>> 0);
    } else {
      this.pushLong(this.a[reg]!);
      this.a[reg] = this.a[7]!;
    }
    const disp = signExtend16(this.readImm16());
    this.a[7] = (this.a[7]! + disp) | 0;
    this.cycles += 16;
  }

  private opUNLK(): void {
    const reg = this.opcode & 7;
    this.a[7] = this.a[reg]!;
    this.a[reg] = this.popLong();
    this.cycles += 12;
  }

  private opMoveUSP(): void {
    if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
    const reg = this.opcode & 7;
    const dir = (this.opcode >> 3) & 1;
    if (dir === 0) {
      // An -> USP
      this.usp = this.a[reg]!;
    } else {
      // USP -> An
      this.a[reg] = this.usp;
    }
    this.cycles += 4;
  }

  private opRTE(): void {
    if (!this.isSupervisor()) { this.raiseException(VEC_PRIVILEGE, 0); return; }
    const newSR = this.popWord();
    this.pc = this.popLong();
    this.setSR(newSR);
    this.prefetchFill();
    this.cycles += 20;
  }

  private opRTS(): void {
    this.pc = this.popLong();
    if (this.checkOddPC(this.pc)) return;
    this.prefetchFill();
    this.cycles += 16;
  }

  private opRTR(): void {
    const ccr = this.popWord();
    this.setCCR(ccr);
    this.pc = this.popLong();
    this.prefetchFill();
    this.cycles += 20;
  }

  private opJSR(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const addr = this.getControlEA(mode, reg);
    if (this.addressError || this.checkOddPC(addr)) return;
    this.pushLong(this.pc);
    this.pc = addr;
    this.prefetchFill();
    this.cycles += 16;
  }

  private opJMP(): void {
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const addr = this.getControlEA(mode, reg);
    if (this.addressError || this.checkOddPC(addr)) return;
    this.pc = addr;
    this.prefetchFill();
    this.cycles += 8;
  }

  private opLEA(): void {
    const dstReg = (this.opcode >> 9) & 7;
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const addr = this.getControlEA(mode, reg);
    this.a[dstReg] = addr | 0;

    // Cycles depend on EA mode
    switch (mode) {
      case EA_ADDR_IND: this.cycles += 4; break;
      case EA_ADDR_DISP: this.cycles += 8; break;
      case EA_ADDR_IDX: this.cycles += 12; break;
      case EA_OTHER:
        switch (reg) {
          case EA_ABS_W: this.cycles += 8; break;
          case EA_ABS_L: this.cycles += 12; break;
          case EA_PC_DISP: this.cycles += 8; break;
          case EA_PC_IDX: this.cycles += 12; break;
          default: this.cycles += 4; break;
        }
        break;
      default: this.cycles += 4; break;
    }
  }

  private opCHK(): void {
    const dataReg = (this.opcode >> 9) & 7;
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;

    const bound = signExtend16(this.readEA(mode, reg, 2));
    const val = signExtend16(this.d[dataReg]! & 0xFFFF);

    if (val < 0) {
      this._fN = true;
      this.raiseException(VEC_CHK, 0);
      this.cycles += 40;
    } else if (val > bound) {
      this._fN = false;
      this.raiseException(VEC_CHK, 0);
      this.cycles += 40;
    } else {
      this.cycles += 10;
    }
  }

  // =========================================================================
  // Line 5: ADDQ, SUBQ, Scc, DBcc
  // =========================================================================

  private line5(): void {
    const op = this.opcode;
    const sizeBits = (op >> 6) & 3;

    if (sizeBits === 3) {
      // Scc or DBcc
      const mode = (op >> 3) & 7;
      const reg = op & 7;

      if (mode === EA_ADDR_REG) {
        // DBcc
        this.opDBcc();
      } else {
        // Scc
        this.opScc();
      }
      return;
    }

    // ADDQ or SUBQ
    const size = this.decodeSize2(sizeBits);
    let data = (op >> 9) & 7;
    if (data === 0) data = 8;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    if ((op & 0x0100) === 0) {
      // ADDQ
      this.opADDQ(data, size, mode, reg);
    } else {
      // SUBQ
      this.opSUBQ(data, size, mode, reg);
    }
  }

  private opADDQ(data: number, size: number, mode: number, reg: number): void {
    if (mode === EA_ADDR_REG) {
      // ADDQ to An — no flags, always long
      this.a[reg] = (this.a[reg]! + data) | 0;
      this.cycles += 8;
      return;
    }

    if (mode === EA_DATA_REG) {
      const dst = this.readEA(mode, reg, size);
      const result = dst + data;
      this.writeEA(mode, reg, size, result);
      this.setAddFlags(data, dst, result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = dst + data;
      this.writeToAddr(addr, size, result);
      this.setAddFlags(data, dst, result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opSUBQ(data: number, size: number, mode: number, reg: number): void {
    if (mode === EA_ADDR_REG) {
      this.a[reg] = (this.a[reg]! - data) | 0;
      this.cycles += 8;
      return;
    }

    if (mode === EA_DATA_REG) {
      const dst = this.readEA(mode, reg, size);
      const result = dst - data;
      this.writeEA(mode, reg, size, result);
      this.setSubFlags(data, dst, result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = dst - data;
      this.writeToAddr(addr, size, result);
      this.setSubFlags(data, dst, result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opScc(): void {
    const cc = (this.opcode >> 8) & 0xF;
    const mode = (this.opcode >> 3) & 7;
    const reg = this.opcode & 7;
    const cond = this.testCondition(cc);

    if (mode === EA_DATA_REG) {
      this.d[reg] = (this.d[reg]! & 0xFFFFFF00) | (cond ? 0xFF : 0x00);
      this.cycles += (cond ? 6 : 4);
    } else {
      const addr = this.computeEA(mode, reg, 1);
      this.bus.write8(addr, cond ? 0xFF : 0x00);
      this.cycles += 8;
    }
  }

  private opDBcc(): void {
    const cc = (this.opcode >> 8) & 0xF;
    const reg = this.opcode & 7;
    const disp = signExtend16(this.readImm16());

    if (this.testCondition(cc)) {
      // Condition true: no loop, just skip displacement
      this.cycles += 12;
    } else {
      // Decrement Dn.W
      const counter = ((this.d[reg]! & 0xFFFF) - 1) & 0xFFFF;
      this.d[reg] = (this.d[reg]! & 0xFFFF0000) | counter;

      if (counter === 0xFFFF) {
        // Counter expired (was 0, now -1)
        this.cycles += 14;
      } else {
        // Branch
        const target = (this.pc - 2 + disp) & 0xFFFFFFFF;
        this.pc = target;
        if (this.checkOddPC(target)) return;
        this.prefetchFill();
        this.cycles += 10;
      }
    }
  }

  // =========================================================================
  // Line 6: BRA, BSR, Bcc
  // =========================================================================

  private line6(): void {
    const cc = (this.opcode >> 8) & 0xF;
    let disp = this.opcode & 0xFF;

    if (disp === 0) {
      // 16-bit displacement
      disp = signExtend16(this.readImm16());
      // PC already advanced past the extension word
      const target = (this.pc - 2 + disp) & 0xFFFFFFFF;

      if (cc === 0) {
        // BRA.W
        this.pc = target;
        if (this.checkOddPC(target)) return;
        this.prefetchFill();
        this.cycles += 10;
      } else if (cc === 1) {
        // BSR.W
        this.pushLong(this.pc);
        this.pc = target;
        if (this.checkOddPC(target)) return;
        this.prefetchFill();
        this.cycles += 18;
      } else {
        // Bcc.W
        if (this.testCondition(cc)) {
          this.pc = target;
          if (this.checkOddPC(target)) return;
          this.prefetchFill();
          this.cycles += 10;
        } else {
          this.cycles += 12;
        }
      }
    } else {
      // 8-bit displacement
      disp = signExtend8(disp);
      const target = (this.pc + disp) & 0xFFFFFFFF;

      if (cc === 0) {
        // BRA.B
        this.pc = target;
        if (this.checkOddPC(target)) return;
        this.prefetchFill();
        this.cycles += 10;
      } else if (cc === 1) {
        // BSR.B
        this.pushLong(this.pc);
        this.pc = target;
        if (this.checkOddPC(target)) return;
        this.prefetchFill();
        this.cycles += 18;
      } else {
        // Bcc.B
        if (this.testCondition(cc)) {
          this.pc = target;
          if (this.checkOddPC(target)) return;
          this.prefetchFill();
          this.cycles += 10;
        } else {
          this.cycles += 8;
        }
      }
    }
  }

  // =========================================================================
  // Line 7: MOVEQ
  // =========================================================================

  private line7(): void {
    const reg = (this.opcode >> 9) & 7;
    // Bit 8 must be 0 for MOVEQ
    if ((this.opcode & 0x0100) !== 0) {
      this.raiseException(VEC_ILLEGAL, 0);
      return;
    }
    const data = signExtend8(this.opcode & 0xFF);
    this.d[reg] = data;
    this.setLogicFlags(data, 4);
    this.cycles += 4;
  }

  // =========================================================================
  // Line 8: OR, DIV, SBCD
  // =========================================================================

  private line8(): void {
    const op = this.opcode;
    const dataReg = (op >> 9) & 7;
    const opmode = (op >> 6) & 7;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    // SBCD: opmode=4, mode=0 or 1
    if (opmode === 4 && (mode === 0 || mode === 1)) {
      this.opSBCD();
      return;
    }

    // DIVU: opmode=3
    if (opmode === 3) {
      this.opDIVU(dataReg, mode, reg);
      return;
    }

    // DIVS: opmode=7
    if (opmode === 7) {
      this.opDIVS(dataReg, mode, reg);
      return;
    }

    // OR
    const size = this.decodeSize2(opmode & 3);
    const direction = (opmode >> 2) & 1; // 0=EA to Dn, 1=Dn to EA

    if (direction === 0) {
      // <ea> OR Dn -> Dn
      const src = this.readEA(mode, reg, size);
      const dst = this.readEA(EA_DATA_REG, dataReg, size);
      const result = src | dst;
      this.writeEA(EA_DATA_REG, dataReg, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      // Dn OR <ea> -> <ea>
      const src = this.readEA(EA_DATA_REG, dataReg, size);
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = src | dst;
      this.writeToAddr(addr, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opSBCD(): void {
    const dstReg = (this.opcode >> 9) & 7;
    const srcReg = this.opcode & 7;
    const rm = (this.opcode >> 3) & 1;
    const x = this._fX ? 1 : 0;

    if (rm === 0) {
      // Dn
      const src = this.d[srcReg]! & 0xFF;
      const dst = this.d[dstReg]! & 0xFF;
      const result = this.bcdSubtract(dst, src, x);
      this.d[dstReg] = (this.d[dstReg]! & 0xFFFFFF00) | (result & 0xFF);
      this.cycles += 6;
    } else {
      // -(An)
      const srcAddr = (this.a[srcReg]! - 1) & 0xFFFFFF;
      this.a[srcReg] = (this.a[srcReg]! - 1) | 0;
      const dstAddr = (this.a[dstReg]! - 1) & 0xFFFFFF;
      this.a[dstReg] = (this.a[dstReg]! - 1) | 0;
      const src = this.bus.read8(srcAddr);
      const dst = this.bus.read8(dstAddr);
      const result = this.bcdSubtract(dst, src, x);
      this.bus.write8(dstAddr, result & 0xFF);
      this.cycles += 18;
    }
  }

  private bcdSubtract(dst: number, src: number, x: number): number {
    let lowNibble = (dst & 0x0F) - (src & 0x0F) - x;
    let carry = 0;
    if (lowNibble < 0) {
      lowNibble += 10;
      carry = 1;
    }

    let highNibble = ((dst >> 4) & 0x0F) - ((src >> 4) & 0x0F) - carry;
    let borrow = false;
    if (highNibble < 0) {
      highNibble += 10;
      borrow = true;
    }

    const result = ((highNibble & 0xF) << 4) | (lowNibble & 0xF);
    this._fC = borrow;
    this._fX = borrow;
    if ((result & 0xFF) !== 0) this._fZ = false;
    // N is undefined for SBCD, but real 68000 sets it from MSB
    this._fN = (result & 0x80) !== 0;
    return result & 0xFF;
  }

  private opDIVU(dataReg: number, mode: number, reg: number): void {
    const divisor = this.readEA(mode, reg, 2) & 0xFFFF;
    if (this.addressError) return;
    const dividend = this.d[dataReg]! >>> 0;

    if (divisor === 0) {
      this.raiseException(VEC_ZERO_DIVIDE, 0);
      this.cycles += 38;
      return;
    }

    const quotient = Math.floor(dividend / divisor);
    const remainder = dividend % divisor;

    if (quotient > 0xFFFF) {
      // Overflow
      this._fV = true;
      this._fC = false;
      // Overflow doesn't change the register
      this.cycles += 140; // worst case
      return;
    }

    this.d[dataReg] = ((remainder & 0xFFFF) << 16) | (quotient & 0xFFFF);
    this._fN = (quotient & 0x8000) !== 0;
    this._fZ = (quotient & 0xFFFF) === 0;
    this._fV = false;
    this._fC = false;
    this.cycles += 140; // varies, use worst case
  }

  private opDIVS(dataReg: number, mode: number, reg: number): void {
    const divisor = signExtend16(this.readEA(mode, reg, 2) & 0xFFFF);
    if (this.addressError) return;
    const dividend = this.d[dataReg]! | 0;

    if (divisor === 0) {
      this.raiseException(VEC_ZERO_DIVIDE, 0);
      this.cycles += 38;
      return;
    }

    const quotient = Math.trunc(dividend / divisor);
    const remainder = dividend - quotient * divisor;

    if (quotient > 32767 || quotient < -32768) {
      this._fV = true;
      this._fC = false;
      this.cycles += 158;
      return;
    }

    this.d[dataReg] = ((remainder & 0xFFFF) << 16) | (quotient & 0xFFFF);
    this._fN = (quotient & 0x8000) !== 0;
    this._fZ = (quotient & 0xFFFF) === 0;
    this._fV = false;
    this._fC = false;
    this.cycles += 158;
  }

  // =========================================================================
  // Line 9: SUB, SUBA, SUBX
  // =========================================================================

  private line9(): void {
    const op = this.opcode;
    const dataReg = (op >> 9) & 7;
    const opmode = (op >> 6) & 7;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    // SUBA: opmode 3 (word) or 7 (long)
    if (opmode === 3) {
      const src = signExtend16(this.readEA(mode, reg, 2));
      this.a[dataReg] = (this.a[dataReg]! - src) | 0;
      this.cycles += 8;
      return;
    }
    if (opmode === 7) {
      const src = this.readEA(mode, reg, 4);
      this.a[dataReg] = (this.a[dataReg]! - src) | 0;
      this.cycles += (mode === EA_DATA_REG || mode === EA_ADDR_REG || (mode === EA_OTHER && reg === EA_IMMEDIATE)) ? 8 : 6;
      return;
    }

    // SUBX: opmode 4/5/6 with mode 0 or 1
    if ((opmode === 4 || opmode === 5 || opmode === 6) && (mode === 0 || mode === 1)) {
      this.opSUBX(opmode & 3, dataReg, reg, mode);
      return;
    }

    // SUB
    const size = this.decodeSize2(opmode & 3);
    const direction = (opmode >> 2) & 1;

    if (direction === 0) {
      // <ea> - Dn -> Dn ... no, SUB: Dn = Dn - <ea>
      const src = this.readEA(mode, reg, size);
      const dst = this.readEA(EA_DATA_REG, dataReg, size);
      const result = dst - src;
      this.writeEA(EA_DATA_REG, dataReg, size, result);
      this.setSubFlags(src, dst, result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      // Dn -> <ea>: <ea> = <ea> - Dn
      const src = this.readEA(EA_DATA_REG, dataReg, size);
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = dst - src;
      this.writeToAddr(addr, size, result);
      this.setSubFlags(src, dst, result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opSUBX(sizeBits: number, dstReg: number, srcReg: number, rm: number): void {
    const size = this.decodeSize2(sizeBits);
    const x = this._fX ? 1 : 0;
    const oldZ = this._fZ;

    if (rm === 0) {
      // Dn
      const src = this.readEA(EA_DATA_REG, srcReg, size);
      const dst = this.readEA(EA_DATA_REG, dstReg, size);
      const result = dst - src - x;
      this.writeEA(EA_DATA_REG, dstReg, size, result);
      this.setSubXFlags(src, dst, result, size);
      // Z unchanged if result is 0
      const clipped = size === 1 ? clip8(result) : size === 2 ? clip16(result) : clip32(result);
      if (clipped === 0) this._fZ = oldZ;
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      // Source predecrement and read
      const srcDec = (size === 1 && srcReg === 7) ? 2 : size;
      if (size === 4) {
        this.a[srcReg] = (this.a[srcReg]! - 2) | 0;
        if (this.a[srcReg] & 1) {
          this.addressError = true;
          this.raiseAddressError(this.a[srcReg]);
          return;
        }
        this.a[srcReg] = (this.a[srcReg] - 2) | 0;
      } else {
        this.a[srcReg] = (this.a[srcReg]! - srcDec) | 0;
      }
      const srcAddr = this.a[srcReg];
      const src = this.readFromAddr(srcAddr, size);
      if (this.addressError) return;

      // Dest predecrement and read (only if source read succeeded)
      const dstDec = (size === 1 && dstReg === 7) ? 2 : size;
      if (size === 4) {
        this.a[dstReg] = (this.a[dstReg]! - 2) | 0;
        if (this.a[dstReg] & 1) {
          this.addressError = true;
          this.raiseAddressError(this.a[dstReg]);
          return;
        }
        this.a[dstReg] = (this.a[dstReg] - 2) | 0;
      } else {
        this.a[dstReg] = (this.a[dstReg]! - dstDec) | 0;
      }
      const dstAddr = this.a[dstReg];
      const dst = this.readFromAddr(dstAddr, size);
      if (this.addressError) return;

      const result = dst - src - x;
      this.writeToAddr(dstAddr, size, result);
      this.setSubXFlags(src, dst, result, size);
      const clipped = size === 1 ? clip8(result) : size === 2 ? clip16(result) : clip32(result);
      if (clipped === 0) this._fZ = oldZ;
      this.cycles += (size === 4 ? 30 : 18);
    }
  }

  // =========================================================================
  // Line B: CMP, CMPA, CMPM, EOR
  // =========================================================================

  private lineB(): void {
    const op = this.opcode;
    const dataReg = (op >> 9) & 7;
    const opmode = (op >> 6) & 7;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    // CMPA
    if (opmode === 3) {
      const src = signExtend16(this.readEA(mode, reg, 2));
      const dst = this.a[dataReg]! | 0;
      const result = dst - src;
      this.setCmpFlags(src, dst, result, 4);
      this.cycles += 6;
      return;
    }
    if (opmode === 7) {
      const src = this.readEA(mode, reg, 4) | 0;
      const dst = this.a[dataReg]! | 0;
      const result = dst - src;
      this.setCmpFlags(src, dst, result, 4);
      this.cycles += 6;
      return;
    }

    // CMPM: opmode 4/5/6 with mode=1 (001 = postincrement)
    if ((opmode === 4 || opmode === 5 || opmode === 6) && mode === 1) {
      this.opCMPM(opmode & 3, dataReg, reg);
      return;
    }

    // EOR: opmode 4/5/6 with direction=1 (mode != 1 for non-CMPM)
    if (opmode >= 4 && opmode <= 6) {
      const size = this.decodeSize2(opmode & 3);
      const src = this.readEA(EA_DATA_REG, dataReg, size);

      if (mode === EA_DATA_REG) {
        const dst = this.d[reg]!;
        const result = src ^ dst;
        this.writeEA(EA_DATA_REG, reg, size, result);
        this.setLogicFlags(result, size);
        this.cycles += (size === 4 ? 8 : 4);
      } else {
        const addr = this.computeEA(mode, reg, size);
        const dst = this.readFromAddr(addr, size);
        const result = src ^ dst;
        this.writeToAddr(addr, size, result);
        this.setLogicFlags(result, size);
        this.cycles += (size === 4 ? 12 : 8);
      }
      return;
    }

    // CMP: opmode 0/1/2
    {
      const size = this.decodeSize2(opmode & 3);
      const src = this.readEA(mode, reg, size);
      const dst = this.readEA(EA_DATA_REG, dataReg, size);
      const result = dst - src;
      this.setCmpFlags(src, dst, result, size);
      this.cycles += (size === 4 ? 6 : 4);
    }
  }

  private opCMPM(sizeBits: number, dstReg: number, srcReg: number): void {
    const size = this.decodeSize2(sizeBits);

    // A7 byte access uses increment of 2 to keep stack aligned
    const srcInc = (size === 1 && srcReg === 7) ? 2 : size;
    const dstInc = (size === 1 && dstReg === 7) ? 2 : size;

    // Read source: postincrement, then read
    const srcAddr = this.a[srcReg]!;
    this.a[srcReg] = (this.a[srcReg]! + srcInc) | 0;
    const src = this.readFromAddr(srcAddr, size);
    if (this.addressError) return;

    // Read dest: postincrement, then read
    const dstAddr = this.a[dstReg]!;
    this.a[dstReg] = (this.a[dstReg]! + dstInc) | 0;
    const dst = this.readFromAddr(dstAddr, size);
    if (this.addressError) return;

    const result = dst - src;
    this.setCmpFlags(src, dst, result, size);
    this.cycles += (size === 4 ? 20 : 12);
  }

  // =========================================================================
  // Line C: AND, MUL, ABCD, EXG
  // =========================================================================

  private lineC(): void {
    const op = this.opcode;
    const dataReg = (op >> 9) & 7;
    const opmode = (op >> 6) & 7;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    // ABCD: opmode=4, mode=0 or 1
    if (opmode === 4 && (mode === 0 || mode === 1)) {
      this.opABCD();
      return;
    }

    // EXG: opmode=5 (data-data or addr-addr) or 6 (data-addr)
    if (opmode === 5 && mode === 0) {
      // EXG Dn, Dn
      const tmp = this.d[dataReg]!;
      this.d[dataReg] = this.d[reg]!;
      this.d[reg] = tmp;
      this.cycles += 6;
      return;
    }
    if (opmode === 5 && mode === 1) {
      // EXG An, An
      const tmp = this.a[dataReg]!;
      this.a[dataReg] = this.a[reg]!;
      this.a[reg] = tmp;
      this.cycles += 6;
      return;
    }
    if (opmode === 6 && mode === 1) {
      // EXG Dn, An
      const tmp = this.d[dataReg]!;
      this.d[dataReg] = this.a[reg]!;
      this.a[reg] = tmp;
      this.cycles += 6;
      return;
    }

    // MULU: opmode=3
    if (opmode === 3) {
      this.opMULU(dataReg, mode, reg);
      return;
    }

    // MULS: opmode=7
    if (opmode === 7) {
      this.opMULS(dataReg, mode, reg);
      return;
    }

    // AND
    const size = this.decodeSize2(opmode & 3);
    const direction = (opmode >> 2) & 1;

    if (direction === 0) {
      // <ea> AND Dn -> Dn
      const src = this.readEA(mode, reg, size);
      const dst = this.readEA(EA_DATA_REG, dataReg, size);
      const result = src & dst;
      this.writeEA(EA_DATA_REG, dataReg, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      // Dn AND <ea> -> <ea>
      const src = this.readEA(EA_DATA_REG, dataReg, size);
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = src & dst;
      this.writeToAddr(addr, size, result);
      this.setLogicFlags(result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opABCD(): void {
    const dstReg = (this.opcode >> 9) & 7;
    const srcReg = this.opcode & 7;
    const rm = (this.opcode >> 3) & 1;
    const x = this._fX ? 1 : 0;

    if (rm === 0) {
      const src = this.d[srcReg]! & 0xFF;
      const dst = this.d[dstReg]! & 0xFF;
      const result = this.bcdAdd(dst, src, x);
      this.d[dstReg] = (this.d[dstReg]! & 0xFFFFFF00) | (result & 0xFF);
      this.cycles += 6;
    } else {
      const srcAddr = (this.a[srcReg]! - 1) & 0xFFFFFF;
      this.a[srcReg] = (this.a[srcReg]! - 1) | 0;
      const dstAddr = (this.a[dstReg]! - 1) & 0xFFFFFF;
      this.a[dstReg] = (this.a[dstReg]! - 1) | 0;
      const src = this.bus.read8(srcAddr);
      const dst = this.bus.read8(dstAddr);
      const result = this.bcdAdd(dst, src, x);
      this.bus.write8(dstAddr, result & 0xFF);
      this.cycles += 18;
    }
  }

  private bcdAdd(dst: number, src: number, x: number): number {
    let lowNibble = (dst & 0x0F) + (src & 0x0F) + x;
    let carry = 0;
    if (lowNibble > 9) {
      lowNibble -= 10;
      carry = 1;
    }

    let highNibble = ((dst >> 4) & 0x0F) + ((src >> 4) & 0x0F) + carry;
    let borrow = false;
    if (highNibble > 9) {
      highNibble -= 10;
      borrow = true;
    }

    const result = ((highNibble & 0xF) << 4) | (lowNibble & 0xF);
    this._fC = borrow;
    this._fX = borrow;
    if ((result & 0xFF) !== 0) this._fZ = false;
    this._fN = (result & 0x80) !== 0;
    return result & 0xFF;
  }

  private opMULU(dataReg: number, mode: number, reg: number): void {
    const src = this.readEA(mode, reg, 2) & 0xFFFF;
    if (this.addressError) return;
    const dst = this.d[dataReg]! & 0xFFFF;
    const result = (src * dst) >>> 0;
    this.d[dataReg] = result | 0;
    this._fN = msb32(result);
    this._fZ = result === 0;
    this._fV = false;
    this._fC = false;
    // Cycles: 38 + 2 * number of set bits in source (use 70 worst case simplified)
    this.cycles += 70;
  }

  private opMULS(dataReg: number, mode: number, reg: number): void {
    const src = signExtend16(this.readEA(mode, reg, 2) & 0xFFFF);
    if (this.addressError) return;
    const dst = signExtend16(this.d[dataReg]! & 0xFFFF);
    const result = Math.imul(src, dst);
    this.d[dataReg] = result | 0;
    this._fN = msb32(result);
    this._fZ = (result | 0) === 0;
    this._fV = false;
    this._fC = false;
    this.cycles += 70;
  }

  // =========================================================================
  // Line D: ADD, ADDA, ADDX
  // =========================================================================

  private lineD(): void {
    const op = this.opcode;
    const dataReg = (op >> 9) & 7;
    const opmode = (op >> 6) & 7;
    const mode = (op >> 3) & 7;
    const reg = op & 7;

    // ADDA
    if (opmode === 3) {
      const src = signExtend16(this.readEA(mode, reg, 2));
      this.a[dataReg] = (this.a[dataReg]! + src) | 0;
      this.cycles += 8;
      return;
    }
    if (opmode === 7) {
      const src = this.readEA(mode, reg, 4) | 0;
      this.a[dataReg] = (this.a[dataReg]! + src) | 0;
      this.cycles += (mode === EA_DATA_REG || mode === EA_ADDR_REG || (mode === EA_OTHER && reg === EA_IMMEDIATE)) ? 8 : 6;
      return;
    }

    // ADDX
    if ((opmode === 4 || opmode === 5 || opmode === 6) && (mode === 0 || mode === 1)) {
      this.opADDX(opmode & 3, dataReg, reg, mode);
      return;
    }

    // ADD
    const size = this.decodeSize2(opmode & 3);
    const direction = (opmode >> 2) & 1;

    if (direction === 0) {
      // <ea> + Dn -> Dn
      const src = this.readEA(mode, reg, size);
      const dst = this.readEA(EA_DATA_REG, dataReg, size);
      const result = dst + src;
      this.writeEA(EA_DATA_REG, dataReg, size, result);
      this.setAddFlags(src, dst, result, size);
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      // Dn + <ea> -> <ea>
      const src = this.readEA(EA_DATA_REG, dataReg, size);
      const addr = this.computeEA(mode, reg, size);
      const dst = this.readFromAddr(addr, size);
      const result = dst + src;
      this.writeToAddr(addr, size, result);
      this.setAddFlags(src, dst, result, size);
      this.cycles += (size === 4 ? 12 : 8);
    }
  }

  private opADDX(sizeBits: number, dstReg: number, srcReg: number, rm: number): void {
    const size = this.decodeSize2(sizeBits);
    const x = this._fX ? 1 : 0;
    const oldZ = this._fZ;

    if (rm === 0) {
      const src = this.readEA(EA_DATA_REG, srcReg, size);
      const dst = this.readEA(EA_DATA_REG, dstReg, size);
      const result = dst + src + x;
      this.writeEA(EA_DATA_REG, dstReg, size, result);
      this.setAddXFlags(src, dst, result, size);
      const clipped = size === 1 ? clip8(result) : size === 2 ? clip16(result) : clip32(result);
      if (clipped === 0) this._fZ = oldZ;
      this.cycles += (size === 4 ? 8 : 4);
    } else {
      // Source predecrement and read
      // For long/word, 68000 decrements by 2 per word access.
      // If first word triggers address error, only 2 is decremented.
      const srcDec = (size === 1 && srcReg === 7) ? 2 : size;
      if (size === 4) {
        this.a[srcReg] = (this.a[srcReg]! - 2) | 0;
        // Check if first word access would trigger address error
        if (this.a[srcReg] & 1) {
          this.addressError = true;
          this.raiseAddressError(this.a[srcReg]);
          return;
        }
        this.a[srcReg] = (this.a[srcReg] - 2) | 0;
      } else {
        this.a[srcReg] = (this.a[srcReg]! - srcDec) | 0;
      }
      const srcAddr = this.a[srcReg];
      const src = this.readFromAddr(srcAddr, size);
      if (this.addressError) return;

      // Dest predecrement and read (only if source read succeeded)
      const dstDec = (size === 1 && dstReg === 7) ? 2 : size;
      if (size === 4) {
        this.a[dstReg] = (this.a[dstReg]! - 2) | 0;
        if (this.a[dstReg] & 1) {
          this.addressError = true;
          this.raiseAddressError(this.a[dstReg]);
          return;
        }
        this.a[dstReg] = (this.a[dstReg] - 2) | 0;
      } else {
        this.a[dstReg] = (this.a[dstReg]! - dstDec) | 0;
      }
      const dstAddr = this.a[dstReg];
      const dst = this.readFromAddr(dstAddr, size);
      if (this.addressError) return;

      const result = dst + src + x;
      this.writeToAddr(dstAddr, size, result);
      this.setAddXFlags(src, dst, result, size);
      const clipped = size === 1 ? clip8(result) : size === 2 ? clip16(result) : clip32(result);
      if (clipped === 0) this._fZ = oldZ;
      this.cycles += (size === 4 ? 30 : 18);
    }
  }

  // =========================================================================
  // Line E: Shift/Rotate
  // =========================================================================

  private lineE(): void {
    const op = this.opcode;
    const sizeBits = (op >> 6) & 3;

    if (sizeBits === 3) {
      // Memory shift/rotate (always word size, shift by 1)
      this.opShiftMemory();
      return;
    }

    // Register shift/rotate
    const size = this.decodeSize2(sizeBits);
    const ir = (op >> 5) & 1; // 0=count/reg, 1=register
    const dr = (op >> 8) & 1; // 0=right, 1=left
    const type = (op >> 3) & 3; // 0=AS, 1=LS, 2=ROX, 3=RO
    const reg = op & 7;

    let count: number;
    if (ir === 0) {
      count = (op >> 9) & 7;
      if (count === 0) count = 8;
    } else {
      count = this.d[(op >> 9) & 7]! & 63;
    }

    if (dr === 0) {
      // Right
      switch (type) {
        case 0: this.opASR_reg(count, reg, size); break;
        case 1: this.opLSR_reg(count, reg, size); break;
        case 2: this.opROXR_reg(count, reg, size); break;
        case 3: this.opROR_reg(count, reg, size); break;
      }
    } else {
      // Left
      switch (type) {
        case 0: this.opASL_reg(count, reg, size); break;
        case 1: this.opLSL_reg(count, reg, size); break;
        case 2: this.opROXL_reg(count, reg, size); break;
        case 3: this.opROL_reg(count, reg, size); break;
      }
    }
  }

  private opShiftMemory(): void {
    const op = this.opcode;
    const type = (op >> 9) & 3;
    const dr = (op >> 8) & 1;
    const mode = (op >> 3) & 7;
    const reg = op & 7;
    const addr = this.computeEA(mode, reg, 2);
    let val = this.readFromAddr(addr, 2);
    if (this.addressError) return;

    if (dr === 0) {
      // Right
      switch (type) {
        case 0: val = this.shiftASR(val, 1, 2); break;
        case 1: val = this.shiftLSR(val, 1, 2); break;
        case 2: val = this.shiftROXR(val, 1, 2); break;
        case 3: val = this.shiftROR(val, 1, 2); break;
      }
    } else {
      // Left
      switch (type) {
        case 0: val = this.shiftASL(val, 1, 2); break;
        case 1: val = this.shiftLSL(val, 1, 2); break;
        case 2: val = this.shiftROXL(val, 1, 2); break;
        case 3: val = this.shiftROL(val, 1, 2); break;
      }
    }

    this.writeToAddr(addr, 2, val);
    this.cycles += 8;
  }

  // --- Register shift operations ---

  private opASR_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftASR(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opLSR_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftLSR(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opROXR_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftROXR(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opROR_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftROR(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opASL_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftASL(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opLSL_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftLSL(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opROXL_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftROXL(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  private opROL_reg(count: number, reg: number, size: number): void {
    let val = this.readEA(EA_DATA_REG, reg, size);
    val = this.shiftROL(val, count, size);
    this.writeEA(EA_DATA_REG, reg, size, val);
    this.cycles += (size === 4 ? 8 : 6) + 2 * count;
  }

  // --- Core shift/rotate implementations ---

  private shiftASR(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;

    if (count === 0) {
      this._fC = false;
      this.setLogicFlags(val, size);
      return val & mask;
    }

    // Sign extend the value
    let v: number;
    if (size === 1) v = signExtend8(val & 0xFF);
    else if (size === 2) v = signExtend16(val & 0xFFFF);
    else v = val | 0;

    const sizeBits = size * 8;
    const effectiveCount = Math.min(count, sizeBits);

    for (let i = 0; i < effectiveCount; i++) {
      this._fC = (v & 1) !== 0;
      this._fX = this._fC;
      v = v >> 1; // arithmetic shift preserves sign
    }

    // Beyond operand width, no more original bits to shift out
    if (count > sizeBits) {
      this._fC = false;
      this._fX = false;
    }

    const result = v & mask;
    this._fN = size === 1 ? msb8(result) : size === 2 ? msb16(result) : msb32(result);
    this._fZ = (result & mask) === 0;
    this._fV = false; // ASR never sets V
    return result;
  }

  private shiftLSR(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    let v = val & mask;

    if (count === 0) {
      this._fC = false;
      this.setLogicFlags(v, size);
      return v;
    }

    for (let i = 0; i < count; i++) {
      this._fC = (v & 1) !== 0;
      this._fX = this._fC;
      v = (v >>> 1) & mask;
    }

    this._fN = false; // LSR always clears N (0 shifted in)
    this._fZ = v === 0;
    this._fV = false;
    return v;
  }

  private shiftASL(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const msbit = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    let v = val & mask;
    let overflow = false;

    if (count === 0) {
      this._fC = false;
      this.setLogicFlags(v, size);
      return v;
    }

    const signBefore = v & msbit;
    for (let i = 0; i < count; i++) {
      this._fC = (v & msbit) !== 0;
      this._fX = this._fC;
      v = (v << 1) & mask;
      if ((v & msbit) !== signBefore) overflow = true;
    }

    this._fN = (v & msbit) !== 0;
    this._fZ = (v & mask) === 0;
    this._fV = overflow;
    return v;
  }

  private shiftLSL(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const msbit = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    let v = val & mask;

    if (count === 0) {
      this._fC = false;
      this.setLogicFlags(v, size);
      return v;
    }

    for (let i = 0; i < count; i++) {
      this._fC = (v & msbit) !== 0;
      this._fX = this._fC;
      v = (v << 1) & mask;
    }

    this._fN = (v & msbit) !== 0;
    this._fZ = (v & mask) === 0;
    this._fV = false;
    return v;
  }

  private shiftROL(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const msbit = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    let v = val & mask;

    if (count === 0) {
      this._fC = false;
      this.setLogicFlags(v, size);
      return v;
    }

    for (let i = 0; i < count; i++) {
      const bit = (v & msbit) !== 0 ? 1 : 0;
      v = ((v << 1) | bit) & mask;
    }

    this._fC = (v & 1) !== 0;
    this._fN = (v & msbit) !== 0;
    this._fZ = (v & mask) === 0;
    this._fV = false;
    return v;
  }

  private shiftROR(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const msbit = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    let v = val & mask;

    if (count === 0) {
      this._fC = false;
      this.setLogicFlags(v, size);
      return v;
    }

    for (let i = 0; i < count; i++) {
      const bit = v & 1;
      v = ((v >>> 1) & mask) | (bit ? msbit : 0);
    }

    this._fC = (v & msbit) !== 0;
    this._fN = (v & msbit) !== 0;
    this._fZ = (v & mask) === 0;
    this._fV = false;
    return v;
  }

  private shiftROXL(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const msbit = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    let v = val & mask;
    let x = this._fX ? 1 : 0;

    if (count === 0) {
      this._fC = this._fX;
      this.setLogicFlags(v, size);
      this._fC = this._fX; // restore, setLogicFlags clears it
      return v;
    }

    for (let i = 0; i < count; i++) {
      const outBit = (v & msbit) !== 0 ? 1 : 0;
      v = ((v << 1) | x) & mask;
      x = outBit;
    }

    this._fX = x !== 0;
    this._fC = x !== 0;
    this._fN = (v & msbit) !== 0;
    this._fZ = (v & mask) === 0;
    this._fV = false;
    return v;
  }

  private shiftROXR(val: number, count: number, size: number): number {
    const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFFFF;
    const msbit = size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x80000000;
    let v = val & mask;
    let x = this._fX ? 1 : 0;

    if (count === 0) {
      this._fC = this._fX;
      this.setLogicFlags(v, size);
      this._fC = this._fX;
      return v;
    }

    for (let i = 0; i < count; i++) {
      const outBit = v & 1;
      v = ((v >>> 1) & mask) | (x ? msbit : 0);
      x = outBit;
    }

    this._fX = x !== 0;
    this._fC = x !== 0;
    this._fN = (v & msbit) !== 0;
    this._fZ = (v & mask) === 0;
    this._fV = false;
    return v;
  }

  // =========================================================================
  // Line A: handled in dispatch (Line A emulator trap)
  // Line F: handled in dispatch (Line F emulator trap)
  // =========================================================================
}
