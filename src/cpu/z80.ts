// =============================================================================
// Zilog Z80 CPU — Cycle-accurate interpreter
// CPS1-Web : Z80 @ 3.58 MHz (audio CPU)
// =============================================================================

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

import type { Z80BusInterface } from '../types';
export type { Z80BusInterface };

export interface Z80State {
  // Main register set
  a: number; f: number;
  b: number; c: number;
  d: number; e: number;
  h: number; l: number;

  // Shadow register set
  a_: number; f_: number;
  b_: number; c_: number;
  d_: number; e_: number;
  h_: number; l_: number;

  // Index registers
  ix: number;
  iy: number;

  // Stack pointer & program counter
  sp: number;
  pc: number;

  // Interrupt / refresh
  i: number;
  r: number;

  // Interrupt flip-flops & mode
  iff1: boolean;
  iff2: boolean;
  im: number; // 0, 1, or 2

  halted: boolean;
  tStates: number;
}

// ---------------------------------------------------------------------------
// Flag bits
// ---------------------------------------------------------------------------

const F_C  = 0x01; // Carry
const F_N  = 0x02; // Subtract
const F_PV = 0x04; // Parity / Overflow
const F_3  = 0x08; // Undocumented bit 3
const F_H  = 0x10; // Half-carry
const F_5  = 0x20; // Undocumented bit 5
const F_Z  = 0x40; // Zero
const F_S  = 0x80; // Sign

// ---------------------------------------------------------------------------
// Precalculated tables
// ---------------------------------------------------------------------------

/** Parity lookup: true if even number of set bits */
const parityTable = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let bits = 0;
  let v = i;
  while (v) { bits += v & 1; v >>= 1; }
  parityTable[i] = (bits & 1) === 0 ? 1 : 0;
}

/** SZ53 flags for an 8-bit result (Sign, Zero, bits 5 and 3) */
const sz53Table = new Uint8Array(256);
/** SZ53P flags: SZ53 + Parity */
const sz53pTable = new Uint8Array(256);

for (let i = 0; i < 256; i++) {
  const s = i & F_S;
  const z = i === 0 ? F_Z : 0;
  const b53 = i & (F_3 | F_5);
  sz53Table[i] = s | z | b53;
  sz53pTable[i] = s | z | b53 | (parityTable[i]! ? F_PV : 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign-extend an 8-bit value to a signed offset (-128..127) */
function toSigned(v: number): number {
  return v < 128 ? v : v - 256;
}

// ---------------------------------------------------------------------------
// Z80 implementation
// ---------------------------------------------------------------------------

export class Z80 {
  // Main registers
  private a = 0xFF; private f = 0xFF;
  private b = 0; private c = 0;
  private d = 0; private e = 0;
  private h = 0; private l = 0;

  // Shadow registers
  private a_ = 0; private f_ = 0;
  private b_ = 0; private c_ = 0;
  private d_ = 0; private e_ = 0;
  private h_ = 0; private l_ = 0;

  // Index
  private ix = 0;
  private iy = 0;

  // Pointers
  private sp = 0xFFFF;
  private pc = 0;

  // Interrupt / refresh
  private i = 0;
  private r = 0;

  // Interrupt state
  private iff1 = false;
  private iff2 = false;
  private im = 0;

  private halted = false;
  private enableInterruptsNext = false; // EI delays by one instruction

  // Level-triggered IRQ line: when true, IRQ is asserted continuously.
  // The Z80 will accept the IRQ as soon as iff1 becomes true (after EI).
  private irqLineAsserted = false;

  private readonly bus: Z80BusInterface;

  constructor(bus: Z80BusInterface) {
    this.bus = bus;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  reset(): void {
    this.a = 0xFF; this.f = 0xFF;
    this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.a_ = 0; this.f_ = 0;
    this.b_ = 0; this.c_ = 0; this.d_ = 0; this.e_ = 0; this.h_ = 0; this.l_ = 0;
    this.ix = 0; this.iy = 0;
    this.sp = 0xFFFF; this.pc = 0;
    this.i = 0; this.r = 0;
    this.iff1 = false; this.iff2 = false; this.im = 0;
    this.halted = false;
    this.enableInterruptsNext = false;
    this.irqLineAsserted = false;
  }

  /** Execute one instruction. Returns T-states consumed. */
  step(): number {
    // Check level-triggered IRQ line: if asserted and interrupts enabled,
    // accept the interrupt (same as calling irq() but driven by the line state).
    if (this.irqLineAsserted && this.iff1) {
      this.irq();
    }

    if (this.halted) {
      // Execute NOP while halted
      this.incR();
      // Process deferred EI after the instruction (correct Z80 behavior:
      // EI delays interrupt acceptance by one instruction)
      if (this.enableInterruptsNext) {
        this.iff1 = true;
        this.iff2 = true;
        this.enableInterruptsNext = false;
      }
      return 4;
    }

    const opcode = this.fetchByte();
    this.incR();
    const cycles = this.execMain(opcode);

    // Process deferred EI after the instruction (correct Z80 behavior:
    // EI delays interrupt acceptance by one instruction)
    if (this.enableInterruptsNext) {
      this.iff1 = true;
      this.iff2 = true;
      this.enableInterruptsNext = false;
    }

    return cycles;
  }

  /**
   * Assert or de-assert the maskable IRQ line (level-triggered).
   * When asserted, the Z80 will accept the interrupt as soon as iff1 is true.
   * Call with false to de-assert (e.g. when YM2151 overflow is cleared).
   */
  setIrqLine(asserted: boolean): void {
    this.irqLineAsserted = asserted;
  }

  /** Non-maskable interrupt */
  nmi(): void {
    this.halted = false;
    this.iff2 = this.iff1;
    this.iff1 = false;
    this.pushWord(this.pc);
    this.pc = 0x0066;
    // NMI takes 11 T-states
  }

  /** Maskable interrupt request */
  irq(data: number = 0xFF): void {
    if (!this.iff1) return;
    this.halted = false;
    this.iff1 = false;
    this.iff2 = false;
    this.enableInterruptsNext = false;

    switch (this.im) {
      case 0:
        // Execute instruction on data bus (usually RST 38h = 0xFF)
        this.pushWord(this.pc);
        this.pc = data & 0x38; // assuming RST xx
        break;
      case 1:
        this.pushWord(this.pc);
        this.pc = 0x0038;
        break;
      case 2: {
        this.pushWord(this.pc);
        const addr = ((this.i << 8) | (data & 0xFE)) & 0xFFFF;
        this.pc = this.readWord(addr);
        break;
      }
    }
  }

  getState(): Z80State {
    return {
      a: this.a, f: this.f, b: this.b, c: this.c,
      d: this.d, e: this.e, h: this.h, l: this.l,
      a_: this.a_, f_: this.f_, b_: this.b_, c_: this.c_,
      d_: this.d_, e_: this.e_, h_: this.h_, l_: this.l_,
      ix: this.ix, iy: this.iy, sp: this.sp, pc: this.pc,
      i: this.i, r: this.r,
      iff1: this.iff1, iff2: this.iff2, im: this.im,
      halted: this.halted, tStates: 0,
    };
  }

  setState(s: Z80State): void {
    this.a = s.a; this.f = s.f; this.b = s.b; this.c = s.c;
    this.d = s.d; this.e = s.e; this.h = s.h; this.l = s.l;
    this.a_ = s.a_; this.f_ = s.f_; this.b_ = s.b_; this.c_ = s.c_;
    this.d_ = s.d_; this.e_ = s.e_; this.h_ = s.h_; this.l_ = s.l_;
    this.ix = s.ix; this.iy = s.iy; this.sp = s.sp; this.pc = s.pc;
    this.i = s.i; this.r = s.r;
    this.iff1 = s.iff1; this.iff2 = s.iff2; this.im = s.im;
    this.halted = s.halted;
  }

  // -------------------------------------------------------------------------
  // Memory access helpers
  // -------------------------------------------------------------------------

  private readByte(addr: number): number {
    return this.bus.read(addr & 0xFFFF);
  }

  private writeByte(addr: number, val: number): void {
    this.bus.write(addr & 0xFFFF, val & 0xFF);
  }

  private readWord(addr: number): number {
    const lo = this.bus.read(addr & 0xFFFF);
    const hi = this.bus.read((addr + 1) & 0xFFFF);
    return (hi << 8) | lo;
  }

  private writeWord(addr: number, val: number): void {
    this.bus.write(addr & 0xFFFF, val & 0xFF);
    this.bus.write((addr + 1) & 0xFFFF, (val >> 8) & 0xFF);
  }

  private fetchByte(): number {
    const v = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    return v;
  }

  private fetchWord(): number {
    const lo = this.fetchByte();
    const hi = this.fetchByte();
    return (hi << 8) | lo;
  }

  private pushWord(val: number): void {
    this.sp = (this.sp - 1) & 0xFFFF;
    this.bus.write(this.sp, (val >> 8) & 0xFF);
    this.sp = (this.sp - 1) & 0xFFFF;
    this.bus.write(this.sp, val & 0xFF);
  }

  private popWord(): number {
    const lo = this.bus.read(this.sp);
    this.sp = (this.sp + 1) & 0xFFFF;
    const hi = this.bus.read(this.sp);
    this.sp = (this.sp + 1) & 0xFFFF;
    return (hi << 8) | lo;
  }

  private incR(): void {
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
  }

  // -------------------------------------------------------------------------
  // 16-bit register pair helpers
  // -------------------------------------------------------------------------

  private getBC(): number { return (this.b << 8) | this.c; }
  private getDE(): number { return (this.d << 8) | this.e; }
  private getHL(): number { return (this.h << 8) | this.l; }
  private getAF(): number { return (this.a << 8) | this.f; }

  private setBC(v: number): void { this.b = (v >> 8) & 0xFF; this.c = v & 0xFF; }
  private setDE(v: number): void { this.d = (v >> 8) & 0xFF; this.e = v & 0xFF; }
  private setHL(v: number): void { this.h = (v >> 8) & 0xFF; this.l = v & 0xFF; }
  private setAF(v: number): void { this.a = (v >> 8) & 0xFF; this.f = v & 0xFF; }

  // -------------------------------------------------------------------------
  // 8-bit register access by index (3-bit r field)
  //   0=B, 1=C, 2=D, 3=E, 4=H, 5=L, 6=(HL), 7=A
  // -------------------------------------------------------------------------

  private getReg8(idx: number): number {
    switch (idx) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return this.h;
      case 5: return this.l;
      case 6: return this.readByte(this.getHL());
      case 7: return this.a;
      default: return 0;
    }
  }

  private setReg8(idx: number, val: number): void {
    const v = val & 0xFF;
    switch (idx) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4: this.h = v; break;
      case 5: this.l = v; break;
      case 6: this.writeByte(this.getHL(), v); break;
      case 7: this.a = v; break;
    }
  }

  // For IX/IY-prefixed instructions, idx 4/5 map to IXH/IXL or IYH/IYL
  // and idx 6 maps to (IX+d) or (IY+d).
  private getRegIx8(idx: number, ixiy: number, d: number): number {
    switch (idx) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return (ixiy >> 8) & 0xFF;  // IXH/IYH
      case 5: return ixiy & 0xFF;          // IXL/IYL
      case 6: return this.readByte((ixiy + d) & 0xFFFF);
      case 7: return this.a;
      default: return 0;
    }
  }

  private setRegIx8(idx: number, val: number, isIX: boolean, d: number): void {
    const v = val & 0xFF;
    switch (idx) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4:
        if (isIX) this.ix = (this.ix & 0x00FF) | (v << 8);
        else this.iy = (this.iy & 0x00FF) | (v << 8);
        break;
      case 5:
        if (isIX) this.ix = (this.ix & 0xFF00) | v;
        else this.iy = (this.iy & 0xFF00) | v;
        break;
      case 6: {
        const base = isIX ? this.ix : this.iy;
        this.writeByte((base + d) & 0xFFFF, v);
        break;
      }
      case 7: this.a = v; break;
    }
  }

  // -------------------------------------------------------------------------
  // Flag condition evaluation (cc field: 3 bits)
  //   0=NZ, 1=Z, 2=NC, 3=C, 4=PO, 5=PE, 6=P, 7=M
  // -------------------------------------------------------------------------

  private testCondition(cc: number): boolean {
    switch (cc) {
      case 0: return (this.f & F_Z) === 0;   // NZ
      case 1: return (this.f & F_Z) !== 0;   // Z
      case 2: return (this.f & F_C) === 0;   // NC
      case 3: return (this.f & F_C) !== 0;   // C
      case 4: return (this.f & F_PV) === 0;  // PO
      case 5: return (this.f & F_PV) !== 0;  // PE
      case 6: return (this.f & F_S) === 0;   // P (positive)
      case 7: return (this.f & F_S) !== 0;   // M (minus)
      default: return false;
    }
  }

  // -------------------------------------------------------------------------
  // ALU operations
  // -------------------------------------------------------------------------

  private addA(val: number): void {
    const result = this.a + val;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((result & 0x88) >> 1);
    this.a = result & 0xFF;
    this.f = (result & 0x100 ? F_C : 0) |
             halfcarryAddTable[lookup & 0x07]! |
             overflowAddTable[lookup >> 4]! |
             sz53Table[this.a]!;
  }

  private adcA(val: number): void {
    const carry = this.f & F_C;
    const result = this.a + val + carry;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((result & 0x88) >> 1);
    this.a = result & 0xFF;
    this.f = (result & 0x100 ? F_C : 0) |
             halfcarryAddTable[lookup & 0x07]! |
             overflowAddTable[lookup >> 4]! |
             sz53Table[this.a]!;
  }

  private subA(val: number): void {
    const result = this.a - val;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((result & 0x88) >> 1);
    this.a = result & 0xFF;
    this.f = (result & 0x100 ? F_C : 0) | F_N |
             halfcarrySubTable[lookup & 0x07]! |
             overflowSubTable[lookup >> 4]! |
             sz53Table[this.a]!;
  }

  private sbcA(val: number): void {
    const carry = this.f & F_C;
    const result = this.a - val - carry;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((result & 0x88) >> 1);
    this.a = result & 0xFF;
    this.f = (result & 0x100 ? F_C : 0) | F_N |
             halfcarrySubTable[lookup & 0x07]! |
             overflowSubTable[lookup >> 4]! |
             sz53Table[this.a]!;
  }

  private andA(val: number): void {
    this.a &= val;
    this.f = F_H | sz53pTable[this.a]!;
  }

  private xorA(val: number): void {
    this.a ^= val;
    this.a &= 0xFF;
    this.f = sz53pTable[this.a]!;
  }

  private orA(val: number): void {
    this.a |= val;
    this.a &= 0xFF;
    this.f = sz53pTable[this.a]!;
  }

  private cpA(val: number): void {
    const result = this.a - val;
    const lookup = ((this.a & 0x88) >> 3) | ((val & 0x88) >> 2) | ((result & 0x88) >> 1);
    this.f = (result & 0x100 ? F_C : 0) | F_N |
             halfcarrySubTable[lookup & 0x07]! |
             overflowSubTable[lookup >> 4]! |
             (result & F_S) |
             (result === 0 ? F_Z : 0) |  // Z based on result, not val
             (val & (F_3 | F_5));         // bits 3/5 from operand, not result
  }

  private incByte(val: number): number {
    const result = (val + 1) & 0xFF;
    this.f = (this.f & F_C) |
             (val === 0x7F ? F_PV : 0) |
             ((val & 0x0F) === 0x0F ? F_H : 0) |
             sz53Table[result]!;
    return result;
  }

  private decByte(val: number): number {
    const result = (val - 1) & 0xFF;
    this.f = (this.f & F_C) | F_N |
             (val === 0x80 ? F_PV : 0) |
             ((val & 0x0F) === 0x00 ? F_H : 0) |
             sz53Table[result]!;
    return result;
  }

  /** ADD HL,ss (16-bit add) */
  private addHL(val: number): void {
    const hl = this.getHL();
    const result = hl + val;
    const lookup = ((hl & 0x0800) >> 11) | ((val & 0x0800) >> 10) | ((result & 0x0800) >> 9);
    this.setHL(result & 0xFFFF);
    this.f = (this.f & (F_S | F_Z | F_PV)) |
             (result & 0x10000 ? F_C : 0) |
             ((result >> 8) & (F_3 | F_5)) |
             halfcarryAddTable[lookup]!;
  }

  /** ADD IX/IY,ss */
  private addIxIy(base: number, val: number): number {
    const result = base + val;
    const lookup = ((base & 0x0800) >> 11) | ((val & 0x0800) >> 10) | ((result & 0x0800) >> 9);
    this.f = (this.f & (F_S | F_Z | F_PV)) |
             (result & 0x10000 ? F_C : 0) |
             ((result >> 8) & (F_3 | F_5)) |
             halfcarryAddTable[lookup]!;
    return result & 0xFFFF;
  }

  /** ADC HL,ss */
  private adcHL(val: number): void {
    const hl = this.getHL();
    const carry = this.f & F_C;
    const result = hl + val + carry;
    const lookup = ((hl & 0x8800) >> 11) | ((val & 0x8800) >> 10) | ((result & 0x8800) >> 9);
    this.setHL(result & 0xFFFF);
    const r16 = result & 0xFFFF;
    this.f = (result & 0x10000 ? F_C : 0) |
             overflowAddTable[lookup >> 4]! |
             (r16 === 0 ? F_Z : 0) |
             ((r16 >> 8) & (F_S | F_3 | F_5)) |
             halfcarryAddTable[lookup & 0x07]!;
  }

  /** SBC HL,ss */
  private sbcHL(val: number): void {
    const hl = this.getHL();
    const carry = this.f & F_C;
    const result = hl - val - carry;
    const lookup = ((hl & 0x8800) >> 11) | ((val & 0x8800) >> 10) | ((result & 0x8800) >> 9);
    this.setHL(result & 0xFFFF);
    const r16 = result & 0xFFFF;
    this.f = (result & 0x10000 ? F_C : 0) | F_N |
             overflowSubTable[lookup >> 4]! |
             (r16 === 0 ? F_Z : 0) |
             ((r16 >> 8) & (F_S | F_3 | F_5)) |
             halfcarrySubTable[lookup & 0x07]!;
  }

  // -------------------------------------------------------------------------
  // Rotate / shift helpers (for CB-prefixed operations)
  // -------------------------------------------------------------------------

  private rlcByte(val: number): number {
    const result = ((val << 1) | (val >> 7)) & 0xFF;
    this.f = (val >> 7) | sz53pTable[result]!;
    return result;
  }

  private rrcByte(val: number): number {
    const result = ((val >> 1) | (val << 7)) & 0xFF;
    this.f = (val & F_C) | sz53pTable[result]!;
    return result;
  }

  private rlByte(val: number): number {
    const result = ((val << 1) | (this.f & F_C)) & 0xFF;
    this.f = (val >> 7) | sz53pTable[result]!;
    return result;
  }

  private rrByte(val: number): number {
    const result = ((val >> 1) | ((this.f & F_C) << 7)) & 0xFF;
    this.f = (val & F_C) | sz53pTable[result]!;
    return result;
  }

  private slaByte(val: number): number {
    const result = (val << 1) & 0xFF;
    this.f = (val >> 7) | sz53pTable[result]!;
    return result;
  }

  private sraByte(val: number): number {
    const result = ((val >> 1) | (val & 0x80)) & 0xFF;
    this.f = (val & F_C) | sz53pTable[result]!;
    return result;
  }

  private srlByte(val: number): number {
    const result = (val >> 1) & 0xFF;
    this.f = (val & F_C) | sz53pTable[result]!;
    return result;
  }

  /** SLL — undocumented: shift left, bit 0 = 1 */
  private sllByte(val: number): number {
    const result = ((val << 1) | 0x01) & 0xFF;
    this.f = (val >> 7) | sz53pTable[result]!;
    return result;
  }

  // -------------------------------------------------------------------------
  // Main opcode dispatch (non-prefixed)
  // -------------------------------------------------------------------------

  private execMain(op: number): number {
    switch (op) {
      // =====================================================================
      // 0x00 — NOP
      // =====================================================================
      case 0x00: return 4;

      // =====================================================================
      // 0x01 — LD BC,nn
      // =====================================================================
      case 0x01: this.setBC(this.fetchWord()); return 10;

      // =====================================================================
      // 0x02 — LD (BC),A
      // =====================================================================
      case 0x02: this.writeByte(this.getBC(), this.a); return 7;

      // =====================================================================
      // 0x03 — INC BC
      // =====================================================================
      case 0x03: this.setBC((this.getBC() + 1) & 0xFFFF); return 6;

      // =====================================================================
      // 0x04 — INC B
      // =====================================================================
      case 0x04: this.b = this.incByte(this.b); return 4;

      // 0x05 — DEC B
      case 0x05: this.b = this.decByte(this.b); return 4;

      // 0x06 — LD B,n
      case 0x06: this.b = this.fetchByte(); return 7;

      // 0x07 — RLCA
      case 0x07: {
        this.a = ((this.a << 1) | (this.a >> 7)) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_PV)) | (this.a & (F_C | F_3 | F_5));
        return 4;
      }

      // 0x08 — EX AF,AF'
      case 0x08: {
        let tmp = this.a; this.a = this.a_; this.a_ = tmp;
        tmp = this.f; this.f = this.f_; this.f_ = tmp;
        return 4;
      }

      // 0x09 — ADD HL,BC
      case 0x09: this.addHL(this.getBC()); return 11;

      // 0x0A — LD A,(BC)
      case 0x0A: this.a = this.readByte(this.getBC()); return 7;

      // 0x0B — DEC BC
      case 0x0B: this.setBC((this.getBC() - 1) & 0xFFFF); return 6;

      // 0x0C — INC C
      case 0x0C: this.c = this.incByte(this.c); return 4;

      // 0x0D — DEC C
      case 0x0D: this.c = this.decByte(this.c); return 4;

      // 0x0E — LD C,n
      case 0x0E: this.c = this.fetchByte(); return 7;

      // 0x0F — RRCA
      case 0x0F: {
        this.f = (this.f & (F_S | F_Z | F_PV)) | (this.a & F_C);
        this.a = ((this.a >> 1) | (this.a << 7)) & 0xFF;
        this.f |= this.a & (F_3 | F_5);
        return 4;
      }

      // 0x10 — DJNZ d
      case 0x10: {
        const d = toSigned(this.fetchByte());
        this.b = (this.b - 1) & 0xFF;
        if (this.b !== 0) {
          this.pc = (this.pc + d) & 0xFFFF;
          return 13;
        }
        return 8;
      }

      // 0x11 — LD DE,nn
      case 0x11: this.setDE(this.fetchWord()); return 10;

      // 0x12 — LD (DE),A
      case 0x12: this.writeByte(this.getDE(), this.a); return 7;

      // 0x13 — INC DE
      case 0x13: this.setDE((this.getDE() + 1) & 0xFFFF); return 6;

      // 0x14 — INC D
      case 0x14: this.d = this.incByte(this.d); return 4;

      // 0x15 — DEC D
      case 0x15: this.d = this.decByte(this.d); return 4;

      // 0x16 — LD D,n
      case 0x16: this.d = this.fetchByte(); return 7;

      // 0x17 — RLA
      case 0x17: {
        const carry = this.a >> 7;
        this.a = ((this.a << 1) | (this.f & F_C)) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_PV)) | carry | (this.a & (F_3 | F_5));
        return 4;
      }

      // 0x18 — JR d
      case 0x18: {
        const d = toSigned(this.fetchByte());
        this.pc = (this.pc + d) & 0xFFFF;
        return 12;
      }

      // 0x19 — ADD HL,DE
      case 0x19: this.addHL(this.getDE()); return 11;

      // 0x1A — LD A,(DE)
      case 0x1A: this.a = this.readByte(this.getDE()); return 7;

      // 0x1B — DEC DE
      case 0x1B: this.setDE((this.getDE() - 1) & 0xFFFF); return 6;

      // 0x1C — INC E
      case 0x1C: this.e = this.incByte(this.e); return 4;

      // 0x1D — DEC E
      case 0x1D: this.e = this.decByte(this.e); return 4;

      // 0x1E — LD E,n
      case 0x1E: this.e = this.fetchByte(); return 7;

      // 0x1F — RRA
      case 0x1F: {
        const carry = this.a & F_C;
        this.a = ((this.a >> 1) | ((this.f & F_C) << 7)) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_PV)) | carry | (this.a & (F_3 | F_5));
        return 4;
      }

      // 0x20 — JR NZ,d
      case 0x20: {
        const d = toSigned(this.fetchByte());
        if (!(this.f & F_Z)) { this.pc = (this.pc + d) & 0xFFFF; return 12; }
        return 7;
      }

      // 0x21 — LD HL,nn
      case 0x21: this.setHL(this.fetchWord()); return 10;

      // 0x22 — LD (nn),HL
      case 0x22: { const a = this.fetchWord(); this.writeWord(a, this.getHL()); return 16; }

      // 0x23 — INC HL
      case 0x23: this.setHL((this.getHL() + 1) & 0xFFFF); return 6;

      // 0x24 — INC H
      case 0x24: this.h = this.incByte(this.h); return 4;

      // 0x25 — DEC H
      case 0x25: this.h = this.decByte(this.h); return 4;

      // 0x26 — LD H,n
      case 0x26: this.h = this.fetchByte(); return 7;

      // 0x27 — DAA
      case 0x27: {
        let correction = 0;
        let carry = this.f & F_C;
        if ((this.f & F_H) || (this.a & 0x0F) > 9) correction |= 0x06;
        if (carry || this.a > 0x99) { correction |= 0x60; carry = F_C; }
        if (this.f & F_N) {
          this.a = (this.a - correction) & 0xFF;
          // H flag after subtraction
          this.f = (this.f & F_N) | carry |
                   ((this.f & F_H) && (this.a & 0x0F) === 0x0F ? F_H : 0) | // approx
                   sz53pTable[this.a]!;
          // More accurate H: ((oldA & 0x0F) - (correction & 0x0F)) & 0x10 ? F_H : 0
          // but we use the standard DAA logic
          const oldA = (this.a + correction) & 0xFF;
          this.f = (this.f & ~F_H) | (((oldA & 0x0F) - (correction & 0x0F)) & 0x10 ? F_H : 0);
        } else {
          const oldA = this.a;
          this.a = (this.a + correction) & 0xFF;
          this.f = carry | sz53pTable[this.a]! |
                   ((oldA ^ this.a) & F_H);
        }
        return 4;
      }

      // 0x28 — JR Z,d
      case 0x28: {
        const d = toSigned(this.fetchByte());
        if (this.f & F_Z) { this.pc = (this.pc + d) & 0xFFFF; return 12; }
        return 7;
      }

      // 0x29 — ADD HL,HL
      case 0x29: this.addHL(this.getHL()); return 11;

      // 0x2A — LD HL,(nn)
      case 0x2A: { const a = this.fetchWord(); this.setHL(this.readWord(a)); return 16; }

      // 0x2B — DEC HL
      case 0x2B: this.setHL((this.getHL() - 1) & 0xFFFF); return 6;

      // 0x2C — INC L
      case 0x2C: this.l = this.incByte(this.l); return 4;

      // 0x2D — DEC L
      case 0x2D: this.l = this.decByte(this.l); return 4;

      // 0x2E — LD L,n
      case 0x2E: this.l = this.fetchByte(); return 7;

      // 0x2F — CPL
      case 0x2F:
        this.a ^= 0xFF;
        this.f = (this.f & (F_S | F_Z | F_PV | F_C)) | F_H | F_N | (this.a & (F_3 | F_5));
        return 4;

      // 0x30 — JR NC,d
      case 0x30: {
        const d = toSigned(this.fetchByte());
        if (!(this.f & F_C)) { this.pc = (this.pc + d) & 0xFFFF; return 12; }
        return 7;
      }

      // 0x31 — LD SP,nn
      case 0x31: this.sp = this.fetchWord(); return 10;

      // 0x32 — LD (nn),A
      case 0x32: this.writeByte(this.fetchWord(), this.a); return 13;

      // 0x33 — INC SP
      case 0x33: this.sp = (this.sp + 1) & 0xFFFF; return 6;

      // 0x34 — INC (HL)
      case 0x34: {
        const addr = this.getHL();
        this.writeByte(addr, this.incByte(this.readByte(addr)));
        return 11;
      }

      // 0x35 — DEC (HL)
      case 0x35: {
        const addr = this.getHL();
        this.writeByte(addr, this.decByte(this.readByte(addr)));
        return 11;
      }

      // 0x36 — LD (HL),n
      case 0x36: this.writeByte(this.getHL(), this.fetchByte()); return 10;

      // 0x37 — SCF
      case 0x37:
        this.f = (this.f & (F_S | F_Z | F_PV)) | F_C | (this.a & (F_3 | F_5));
        return 4;

      // 0x38 — JR C,d
      case 0x38: {
        const d = toSigned(this.fetchByte());
        if (this.f & F_C) { this.pc = (this.pc + d) & 0xFFFF; return 12; }
        return 7;
      }

      // 0x39 — ADD HL,SP
      case 0x39: this.addHL(this.sp); return 11;

      // 0x3A — LD A,(nn)
      case 0x3A: this.a = this.readByte(this.fetchWord()); return 13;

      // 0x3B — DEC SP
      case 0x3B: this.sp = (this.sp - 1) & 0xFFFF; return 6;

      // 0x3C — INC A
      case 0x3C: this.a = this.incByte(this.a); return 4;

      // 0x3D — DEC A
      case 0x3D: this.a = this.decByte(this.a); return 4;

      // 0x3E — LD A,n
      case 0x3E: this.a = this.fetchByte(); return 7;

      // 0x3F — CCF
      case 0x3F:
        this.f = (this.f & (F_S | F_Z | F_PV)) |
                 ((this.f & F_C) ? F_H : F_C) |
                 (this.a & (F_3 | F_5));
        return 4;

      // =====================================================================
      // 0x40-0x7F — LD r,r' (except 0x76 = HALT)
      // =====================================================================
      case 0x76: // HALT
        this.halted = true;
        this.pc = (this.pc - 1) & 0xFFFF; // re-execute HALT
        return 4;

      // Generate all LD r,r' combinations
      case 0x40: return 4; // LD B,B (nop)
      case 0x41: this.b = this.c; return 4;
      case 0x42: this.b = this.d; return 4;
      case 0x43: this.b = this.e; return 4;
      case 0x44: this.b = this.h; return 4;
      case 0x45: this.b = this.l; return 4;
      case 0x46: this.b = this.readByte(this.getHL()); return 7;
      case 0x47: this.b = this.a; return 4;

      case 0x48: this.c = this.b; return 4;
      case 0x49: return 4; // LD C,C
      case 0x4A: this.c = this.d; return 4;
      case 0x4B: this.c = this.e; return 4;
      case 0x4C: this.c = this.h; return 4;
      case 0x4D: this.c = this.l; return 4;
      case 0x4E: this.c = this.readByte(this.getHL()); return 7;
      case 0x4F: this.c = this.a; return 4;

      case 0x50: this.d = this.b; return 4;
      case 0x51: this.d = this.c; return 4;
      case 0x52: return 4; // LD D,D
      case 0x53: this.d = this.e; return 4;
      case 0x54: this.d = this.h; return 4;
      case 0x55: this.d = this.l; return 4;
      case 0x56: this.d = this.readByte(this.getHL()); return 7;
      case 0x57: this.d = this.a; return 4;

      case 0x58: this.e = this.b; return 4;
      case 0x59: this.e = this.c; return 4;
      case 0x5A: this.e = this.d; return 4;
      case 0x5B: return 4; // LD E,E
      case 0x5C: this.e = this.h; return 4;
      case 0x5D: this.e = this.l; return 4;
      case 0x5E: this.e = this.readByte(this.getHL()); return 7;
      case 0x5F: this.e = this.a; return 4;

      case 0x60: this.h = this.b; return 4;
      case 0x61: this.h = this.c; return 4;
      case 0x62: this.h = this.d; return 4;
      case 0x63: this.h = this.e; return 4;
      case 0x64: return 4; // LD H,H
      case 0x65: this.h = this.l; return 4;
      case 0x66: this.h = this.readByte(this.getHL()); return 7;
      case 0x67: this.h = this.a; return 4;

      case 0x68: this.l = this.b; return 4;
      case 0x69: this.l = this.c; return 4;
      case 0x6A: this.l = this.d; return 4;
      case 0x6B: this.l = this.e; return 4;
      case 0x6C: this.l = this.h; return 4;
      case 0x6D: return 4; // LD L,L
      case 0x6E: this.l = this.readByte(this.getHL()); return 7;
      case 0x6F: this.l = this.a; return 4;

      case 0x70: this.writeByte(this.getHL(), this.b); return 7;
      case 0x71: this.writeByte(this.getHL(), this.c); return 7;
      case 0x72: this.writeByte(this.getHL(), this.d); return 7;
      case 0x73: this.writeByte(this.getHL(), this.e); return 7;
      case 0x74: this.writeByte(this.getHL(), this.h); return 7;
      case 0x75: this.writeByte(this.getHL(), this.l); return 7;
      // 0x76 = HALT (handled above)
      case 0x77: this.writeByte(this.getHL(), this.a); return 7;

      case 0x78: this.a = this.b; return 4;
      case 0x79: this.a = this.c; return 4;
      case 0x7A: this.a = this.d; return 4;
      case 0x7B: this.a = this.e; return 4;
      case 0x7C: this.a = this.h; return 4;
      case 0x7D: this.a = this.l; return 4;
      case 0x7E: this.a = this.readByte(this.getHL()); return 7;
      case 0x7F: return 4; // LD A,A

      // =====================================================================
      // 0x80-0xBF — ALU A,r
      // =====================================================================
      // ADD A,r
      case 0x80: this.addA(this.b); return 4;
      case 0x81: this.addA(this.c); return 4;
      case 0x82: this.addA(this.d); return 4;
      case 0x83: this.addA(this.e); return 4;
      case 0x84: this.addA(this.h); return 4;
      case 0x85: this.addA(this.l); return 4;
      case 0x86: this.addA(this.readByte(this.getHL())); return 7;
      case 0x87: this.addA(this.a); return 4;

      // ADC A,r
      case 0x88: this.adcA(this.b); return 4;
      case 0x89: this.adcA(this.c); return 4;
      case 0x8A: this.adcA(this.d); return 4;
      case 0x8B: this.adcA(this.e); return 4;
      case 0x8C: this.adcA(this.h); return 4;
      case 0x8D: this.adcA(this.l); return 4;
      case 0x8E: this.adcA(this.readByte(this.getHL())); return 7;
      case 0x8F: this.adcA(this.a); return 4;

      // SUB r
      case 0x90: this.subA(this.b); return 4;
      case 0x91: this.subA(this.c); return 4;
      case 0x92: this.subA(this.d); return 4;
      case 0x93: this.subA(this.e); return 4;
      case 0x94: this.subA(this.h); return 4;
      case 0x95: this.subA(this.l); return 4;
      case 0x96: this.subA(this.readByte(this.getHL())); return 7;
      case 0x97: this.subA(this.a); return 4;

      // SBC A,r
      case 0x98: this.sbcA(this.b); return 4;
      case 0x99: this.sbcA(this.c); return 4;
      case 0x9A: this.sbcA(this.d); return 4;
      case 0x9B: this.sbcA(this.e); return 4;
      case 0x9C: this.sbcA(this.h); return 4;
      case 0x9D: this.sbcA(this.l); return 4;
      case 0x9E: this.sbcA(this.readByte(this.getHL())); return 7;
      case 0x9F: this.sbcA(this.a); return 4;

      // AND r
      case 0xA0: this.andA(this.b); return 4;
      case 0xA1: this.andA(this.c); return 4;
      case 0xA2: this.andA(this.d); return 4;
      case 0xA3: this.andA(this.e); return 4;
      case 0xA4: this.andA(this.h); return 4;
      case 0xA5: this.andA(this.l); return 4;
      case 0xA6: this.andA(this.readByte(this.getHL())); return 7;
      case 0xA7: this.andA(this.a); return 4;

      // XOR r
      case 0xA8: this.xorA(this.b); return 4;
      case 0xA9: this.xorA(this.c); return 4;
      case 0xAA: this.xorA(this.d); return 4;
      case 0xAB: this.xorA(this.e); return 4;
      case 0xAC: this.xorA(this.h); return 4;
      case 0xAD: this.xorA(this.l); return 4;
      case 0xAE: this.xorA(this.readByte(this.getHL())); return 7;
      case 0xAF: this.xorA(this.a); return 4;

      // OR r
      case 0xB0: this.orA(this.b); return 4;
      case 0xB1: this.orA(this.c); return 4;
      case 0xB2: this.orA(this.d); return 4;
      case 0xB3: this.orA(this.e); return 4;
      case 0xB4: this.orA(this.h); return 4;
      case 0xB5: this.orA(this.l); return 4;
      case 0xB6: this.orA(this.readByte(this.getHL())); return 7;
      case 0xB7: this.orA(this.a); return 4;

      // CP r
      case 0xB8: this.cpA(this.b); return 4;
      case 0xB9: this.cpA(this.c); return 4;
      case 0xBA: this.cpA(this.d); return 4;
      case 0xBB: this.cpA(this.e); return 4;
      case 0xBC: this.cpA(this.h); return 4;
      case 0xBD: this.cpA(this.l); return 4;
      case 0xBE: this.cpA(this.readByte(this.getHL())); return 7;
      case 0xBF: this.cpA(this.a); return 4;

      // =====================================================================
      // 0xC0-0xFF — RET cc, POP, JP, CALL, RST, prefixes, etc.
      // =====================================================================

      // 0xC0 — RET NZ
      case 0xC0: if (!(this.f & F_Z)) { this.pc = this.popWord(); return 11; } return 5;

      // 0xC1 — POP BC
      case 0xC1: this.setBC(this.popWord()); return 10;

      // 0xC2 — JP NZ,nn
      case 0xC2: { const addr = this.fetchWord(); if (!(this.f & F_Z)) this.pc = addr; return 10; }

      // 0xC3 — JP nn
      case 0xC3: this.pc = this.fetchWord(); return 10;

      // 0xC4 — CALL NZ,nn
      case 0xC4: {
        const addr = this.fetchWord();
        if (!(this.f & F_Z)) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xC5 — PUSH BC
      case 0xC5: this.pushWord(this.getBC()); return 11;

      // 0xC6 — ADD A,n
      case 0xC6: this.addA(this.fetchByte()); return 7;

      // 0xC7 — RST 00h
      case 0xC7: this.pushWord(this.pc); this.pc = 0x00; return 11;

      // 0xC8 — RET Z
      case 0xC8: if (this.f & F_Z) { this.pc = this.popWord(); return 11; } return 5;

      // 0xC9 — RET
      case 0xC9: this.pc = this.popWord(); return 10;

      // 0xCA — JP Z,nn
      case 0xCA: { const addr = this.fetchWord(); if (this.f & F_Z) this.pc = addr; return 10; }

      // 0xCB — CB prefix
      case 0xCB: return this.execCB();

      // 0xCC — CALL Z,nn
      case 0xCC: {
        const addr = this.fetchWord();
        if (this.f & F_Z) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xCD — CALL nn
      case 0xCD: { const addr = this.fetchWord(); this.pushWord(this.pc); this.pc = addr; return 17; }

      // 0xCE — ADC A,n
      case 0xCE: this.adcA(this.fetchByte()); return 7;

      // 0xCF — RST 08h
      case 0xCF: this.pushWord(this.pc); this.pc = 0x08; return 11;

      // 0xD0 — RET NC
      case 0xD0: if (!(this.f & F_C)) { this.pc = this.popWord(); return 11; } return 5;

      // 0xD1 — POP DE
      case 0xD1: this.setDE(this.popWord()); return 10;

      // 0xD2 — JP NC,nn
      case 0xD2: { const addr = this.fetchWord(); if (!(this.f & F_C)) this.pc = addr; return 10; }

      // 0xD3 — OUT (n),A
      case 0xD3: { const port = this.fetchByte(); this.bus.ioWrite((this.a << 8) | port, this.a); return 11; }

      // 0xD4 — CALL NC,nn
      case 0xD4: {
        const addr = this.fetchWord();
        if (!(this.f & F_C)) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xD5 — PUSH DE
      case 0xD5: this.pushWord(this.getDE()); return 11;

      // 0xD6 — SUB n
      case 0xD6: this.subA(this.fetchByte()); return 7;

      // 0xD7 — RST 10h
      case 0xD7: this.pushWord(this.pc); this.pc = 0x10; return 11;

      // 0xD8 — RET C
      case 0xD8: if (this.f & F_C) { this.pc = this.popWord(); return 11; } return 5;

      // 0xD9 — EXX
      case 0xD9: {
        let t: number;
        t = this.b; this.b = this.b_; this.b_ = t;
        t = this.c; this.c = this.c_; this.c_ = t;
        t = this.d; this.d = this.d_; this.d_ = t;
        t = this.e; this.e = this.e_; this.e_ = t;
        t = this.h; this.h = this.h_; this.h_ = t;
        t = this.l; this.l = this.l_; this.l_ = t;
        return 4;
      }

      // 0xDA — JP C,nn
      case 0xDA: { const addr = this.fetchWord(); if (this.f & F_C) this.pc = addr; return 10; }

      // 0xDB — IN A,(n)
      case 0xDB: { const port = this.fetchByte(); this.a = this.bus.ioRead((this.a << 8) | port); return 11; }

      // 0xDC — CALL C,nn
      case 0xDC: {
        const addr = this.fetchWord();
        if (this.f & F_C) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xDD — DD prefix (IX instructions)
      case 0xDD: return this.execDDFD(true);

      // 0xDE — SBC A,n
      case 0xDE: this.sbcA(this.fetchByte()); return 7;

      // 0xDF — RST 18h
      case 0xDF: this.pushWord(this.pc); this.pc = 0x18; return 11;

      // 0xE0 — RET PO
      case 0xE0: if (!(this.f & F_PV)) { this.pc = this.popWord(); return 11; } return 5;

      // 0xE1 — POP HL
      case 0xE1: this.setHL(this.popWord()); return 10;

      // 0xE2 — JP PO,nn
      case 0xE2: { const addr = this.fetchWord(); if (!(this.f & F_PV)) this.pc = addr; return 10; }

      // 0xE3 — EX (SP),HL
      case 0xE3: {
        const tmp = this.readWord(this.sp);
        this.writeWord(this.sp, this.getHL());
        this.setHL(tmp);
        return 19;
      }

      // 0xE4 — CALL PO,nn
      case 0xE4: {
        const addr = this.fetchWord();
        if (!(this.f & F_PV)) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xE5 — PUSH HL
      case 0xE5: this.pushWord(this.getHL()); return 11;

      // 0xE6 — AND n
      case 0xE6: this.andA(this.fetchByte()); return 7;

      // 0xE7 — RST 20h
      case 0xE7: this.pushWord(this.pc); this.pc = 0x20; return 11;

      // 0xE8 — RET PE
      case 0xE8: if (this.f & F_PV) { this.pc = this.popWord(); return 11; } return 5;

      // 0xE9 — JP (HL) — really JP HL
      case 0xE9: this.pc = this.getHL(); return 4;

      // 0xEA — JP PE,nn
      case 0xEA: { const addr = this.fetchWord(); if (this.f & F_PV) this.pc = addr; return 10; }

      // 0xEB — EX DE,HL
      case 0xEB: {
        let t = this.d; this.d = this.h; this.h = t;
        t = this.e; this.e = this.l; this.l = t;
        return 4;
      }

      // 0xEC — CALL PE,nn
      case 0xEC: {
        const addr = this.fetchWord();
        if (this.f & F_PV) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xED — ED prefix
      case 0xED: return this.execED();

      // 0xEE — XOR n
      case 0xEE: this.xorA(this.fetchByte()); return 7;

      // 0xEF — RST 28h
      case 0xEF: this.pushWord(this.pc); this.pc = 0x28; return 11;

      // 0xF0 — RET P
      case 0xF0: if (!(this.f & F_S)) { this.pc = this.popWord(); return 11; } return 5;

      // 0xF1 — POP AF
      case 0xF1: this.setAF(this.popWord()); return 10;

      // 0xF2 — JP P,nn
      case 0xF2: { const addr = this.fetchWord(); if (!(this.f & F_S)) this.pc = addr; return 10; }

      // 0xF3 — DI
      case 0xF3:
        this.iff1 = false;
        this.iff2 = false;
        return 4;

      // 0xF4 — CALL P,nn
      case 0xF4: {
        const addr = this.fetchWord();
        if (!(this.f & F_S)) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xF5 — PUSH AF
      case 0xF5: this.pushWord(this.getAF()); return 11;

      // 0xF6 — OR n
      case 0xF6: this.orA(this.fetchByte()); return 7;

      // 0xF7 — RST 30h
      case 0xF7: this.pushWord(this.pc); this.pc = 0x30; return 11;

      // 0xF8 — RET M
      case 0xF8: if (this.f & F_S) { this.pc = this.popWord(); return 11; } return 5;

      // 0xF9 — LD SP,HL
      case 0xF9: this.sp = this.getHL(); return 6;

      // 0xFA — JP M,nn
      case 0xFA: { const addr = this.fetchWord(); if (this.f & F_S) this.pc = addr; return 10; }

      // 0xFB — EI
      case 0xFB:
        // EI takes effect after the NEXT instruction
        this.enableInterruptsNext = true;
        return 4;

      // 0xFC — CALL M,nn
      case 0xFC: {
        const addr = this.fetchWord();
        if (this.f & F_S) { this.pushWord(this.pc); this.pc = addr; return 17; }
        return 10;
      }

      // 0xFD — FD prefix (IY instructions)
      case 0xFD: return this.execDDFD(false);

      // 0xFE — CP n
      case 0xFE: this.cpA(this.fetchByte()); return 7;

      // 0xFF — RST 38h
      case 0xFF: this.pushWord(this.pc); this.pc = 0x38; return 11;

      default: return 4; // NOP for undefined
    }
  }

  // -------------------------------------------------------------------------
  // CB prefix — bit operations, rotations, shifts
  // -------------------------------------------------------------------------

  private execCB(): number {
    const op = this.fetchByte();
    this.incR();

    const r = op & 0x07;
    const isMemHL = r === 6;
    const val = this.getReg8(r);
    const baseCycles = isMemHL ? 15 : 8;
    const bitCycles = isMemHL ? 12 : 8;

    switch (op >> 3) {
      // Rotations/shifts: 0x00-0x3F
      case 0: { const res = this.rlcByte(val); this.setReg8(r, res); return baseCycles; } // RLC r
      case 1: { const res = this.rrcByte(val); this.setReg8(r, res); return baseCycles; } // RRC r
      case 2: { const res = this.rlByte(val);  this.setReg8(r, res); return baseCycles; } // RL r
      case 3: { const res = this.rrByte(val);  this.setReg8(r, res); return baseCycles; } // RR r
      case 4: { const res = this.slaByte(val); this.setReg8(r, res); return baseCycles; } // SLA r
      case 5: { const res = this.sraByte(val); this.setReg8(r, res); return baseCycles; } // SRA r
      case 6: { const res = this.sllByte(val); this.setReg8(r, res); return baseCycles; } // SLL r (undoc)
      case 7: { const res = this.srlByte(val); this.setReg8(r, res); return baseCycles; } // SRL r

      // BIT b,r: 0x40-0x7F
      case 8: case 9: case 10: case 11:
      case 12: case 13: case 14: case 15: {
        const bit = (op >> 3) & 7;
        const result = val & (1 << bit);
        this.f = (this.f & F_C) | F_H |
                 (result ? 0 : F_Z | F_PV) |
                 (result & F_S) |
                 (isMemHL ? 0 : (val & (F_3 | F_5)));
        return bitCycles;
      }

      // RES b,r: 0x80-0xBF
      case 16: case 17: case 18: case 19:
      case 20: case 21: case 22: case 23: {
        const bit = (op >> 3) & 7;
        this.setReg8(r, val & ~(1 << bit));
        return baseCycles;
      }

      // SET b,r: 0xC0-0xFF
      case 24: case 25: case 26: case 27:
      case 28: case 29: case 30: case 31: {
        const bit = (op >> 3) & 7;
        this.setReg8(r, val | (1 << bit));
        return baseCycles;
      }

      default: return 8;
    }
  }

  // -------------------------------------------------------------------------
  // DD/FD CB prefix — indexed bit operations
  // For DD CB d op / FD CB d op, the displacement comes BEFORE the opcode
  // -------------------------------------------------------------------------

  private execDDFDCBWithDisp(isIX: boolean, d: number): number {
    const op = this.fetchByte();
    const base = isIX ? this.ix : this.iy;
    const addr = (base + d) & 0xFFFF;
    const val = this.readByte(addr);
    const r = op & 0x07; // destination register (or 6 for (IX+d) only)

    // For shift/rotate operations (0x00-0x3F): result goes to (IX+d) AND to register r
    // For BIT operations (0x40-0x7F): only test, no write
    // For RES/SET (0x80-0xFF): result goes to (IX+d) AND to register r

    const group = op >> 6;

    if (group === 0) {
      // Rotate/shift
      let result: number;
      switch ((op >> 3) & 7) {
        case 0: result = this.rlcByte(val); break;
        case 1: result = this.rrcByte(val); break;
        case 2: result = this.rlByte(val); break;
        case 3: result = this.rrByte(val); break;
        case 4: result = this.slaByte(val); break;
        case 5: result = this.sraByte(val); break;
        case 6: result = this.sllByte(val); break; // undocumented SLL
        case 7: result = this.srlByte(val); break;
        default: result = val;
      }
      this.writeByte(addr, result);
      // Undocumented: also copy to register r (unless r==6)
      if (r !== 6) this.setReg8(r, result);
      return 23;
    }

    if (group === 1) {
      // BIT b,(IX+d)
      const bit = (op >> 3) & 7;
      const result = val & (1 << bit);
      this.f = (this.f & F_C) | F_H |
               (result ? 0 : F_Z | F_PV) |
               (result & F_S) |
               // Undocumented: bits 3,5 come from high byte of (IX+d) address
               ((addr >> 8) & (F_3 | F_5));
      return 20;
    }

    // group 2 or 3: RES or SET
    const bit = (op >> 3) & 7;
    let result: number;
    if (group === 2) {
      result = val & ~(1 << bit); // RES
    } else {
      result = val | (1 << bit);  // SET
    }
    this.writeByte(addr, result);
    if (r !== 6) this.setReg8(r, result);
    return 23;
  }

  // -------------------------------------------------------------------------
  // DD / FD prefix — IX / IY instructions
  // -------------------------------------------------------------------------

  private execDDFD(isIX: boolean): number {
    const op = this.fetchByte();
    this.incR();

    const ixiy = isIX ? this.ix : this.iy;

    switch (op) {
      // ADD IX,BC / ADD IY,BC
      case 0x09: {
        const result = this.addIxIy(ixiy, this.getBC());
        if (isIX) this.ix = result; else this.iy = result;
        return 15;
      }

      // ADD IX,DE / ADD IY,DE
      case 0x19: {
        const result = this.addIxIy(ixiy, this.getDE());
        if (isIX) this.ix = result; else this.iy = result;
        return 15;
      }

      // LD IX,nn / LD IY,nn
      case 0x21: {
        const val = this.fetchWord();
        if (isIX) this.ix = val; else this.iy = val;
        return 14;
      }

      // LD (nn),IX / LD (nn),IY
      case 0x22: {
        const addr = this.fetchWord();
        this.writeWord(addr, ixiy);
        return 20;
      }

      // INC IX / INC IY
      case 0x23:
        if (isIX) this.ix = (this.ix + 1) & 0xFFFF;
        else this.iy = (this.iy + 1) & 0xFFFF;
        return 10;

      // INC IXH / INC IYH (undocumented)
      case 0x24: {
        const hi = this.incByte((ixiy >> 8) & 0xFF);
        if (isIX) this.ix = (hi << 8) | (this.ix & 0xFF);
        else this.iy = (hi << 8) | (this.iy & 0xFF);
        return 8;
      }

      // DEC IXH / DEC IYH (undocumented)
      case 0x25: {
        const hi = this.decByte((ixiy >> 8) & 0xFF);
        if (isIX) this.ix = (hi << 8) | (this.ix & 0xFF);
        else this.iy = (hi << 8) | (this.iy & 0xFF);
        return 8;
      }

      // LD IXH,n / LD IYH,n (undocumented)
      case 0x26: {
        const n = this.fetchByte();
        if (isIX) this.ix = (n << 8) | (this.ix & 0xFF);
        else this.iy = (n << 8) | (this.iy & 0xFF);
        return 11;
      }

      // ADD IX,IX / ADD IY,IY
      case 0x29: {
        const result = this.addIxIy(ixiy, ixiy);
        if (isIX) this.ix = result; else this.iy = result;
        return 15;
      }

      // LD IX,(nn) / LD IY,(nn)
      case 0x2A: {
        const addr = this.fetchWord();
        const val = this.readWord(addr);
        if (isIX) this.ix = val; else this.iy = val;
        return 20;
      }

      // DEC IX / DEC IY
      case 0x2B:
        if (isIX) this.ix = (this.ix - 1) & 0xFFFF;
        else this.iy = (this.iy - 1) & 0xFFFF;
        return 10;

      // INC IXL / INC IYL (undocumented)
      case 0x2C: {
        const lo = this.incByte(ixiy & 0xFF);
        if (isIX) this.ix = (this.ix & 0xFF00) | lo;
        else this.iy = (this.iy & 0xFF00) | lo;
        return 8;
      }

      // DEC IXL / DEC IYL (undocumented)
      case 0x2D: {
        const lo = this.decByte(ixiy & 0xFF);
        if (isIX) this.ix = (this.ix & 0xFF00) | lo;
        else this.iy = (this.iy & 0xFF00) | lo;
        return 8;
      }

      // LD IXL,n / LD IYL,n (undocumented)
      case 0x2E: {
        const n = this.fetchByte();
        if (isIX) this.ix = (this.ix & 0xFF00) | n;
        else this.iy = (this.iy & 0xFF00) | n;
        return 11;
      }

      // INC (IX+d) / INC (IY+d)
      case 0x34: {
        const d = toSigned(this.fetchByte());
        const addr = (ixiy + d) & 0xFFFF;
        this.writeByte(addr, this.incByte(this.readByte(addr)));
        return 23;
      }

      // DEC (IX+d) / DEC (IY+d)
      case 0x35: {
        const d = toSigned(this.fetchByte());
        const addr = (ixiy + d) & 0xFFFF;
        this.writeByte(addr, this.decByte(this.readByte(addr)));
        return 23;
      }

      // LD (IX+d),n / LD (IY+d),n
      case 0x36: {
        const d = toSigned(this.fetchByte());
        const n = this.fetchByte();
        this.writeByte((ixiy + d) & 0xFFFF, n);
        return 19;
      }

      // ADD IX,SP / ADD IY,SP
      case 0x39: {
        const result = this.addIxIy(ixiy, this.sp);
        if (isIX) this.ix = result; else this.iy = result;
        return 15;
      }

      // LD r,(IX+d) — 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E
      case 0x46: { const d = toSigned(this.fetchByte()); this.b = this.readByte((ixiy + d) & 0xFFFF); return 19; }
      case 0x4E: { const d = toSigned(this.fetchByte()); this.c = this.readByte((ixiy + d) & 0xFFFF); return 19; }
      case 0x56: { const d = toSigned(this.fetchByte()); this.d = this.readByte((ixiy + d) & 0xFFFF); return 19; }
      case 0x5E: { const d = toSigned(this.fetchByte()); this.e = this.readByte((ixiy + d) & 0xFFFF); return 19; }
      case 0x66: { const d = toSigned(this.fetchByte()); this.h = this.readByte((ixiy + d) & 0xFFFF); return 19; }
      case 0x6E: { const d = toSigned(this.fetchByte()); this.l = this.readByte((ixiy + d) & 0xFFFF); return 19; }
      case 0x7E: { const d = toSigned(this.fetchByte()); this.a = this.readByte((ixiy + d) & 0xFFFF); return 19; }

      // LD (IX+d),r — 0x70-0x77 (except 0x76)
      case 0x70: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.b); return 19; }
      case 0x71: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.c); return 19; }
      case 0x72: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.d); return 19; }
      case 0x73: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.e); return 19; }
      case 0x74: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.h); return 19; }
      case 0x75: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.l); return 19; }
      case 0x77: { const d = toSigned(this.fetchByte()); this.writeByte((ixiy + d) & 0xFFFF, this.a); return 19; }

      // Undocumented LD r,IXH/IXL / LD r,IYH/IYL
      case 0x44: { if (isIX) this.b = (this.ix >> 8) & 0xFF; else this.b = (this.iy >> 8) & 0xFF; return 8; }
      case 0x45: { if (isIX) this.b = this.ix & 0xFF; else this.b = this.iy & 0xFF; return 8; }
      case 0x4C: { if (isIX) this.c = (this.ix >> 8) & 0xFF; else this.c = (this.iy >> 8) & 0xFF; return 8; }
      case 0x4D: { if (isIX) this.c = this.ix & 0xFF; else this.c = this.iy & 0xFF; return 8; }
      case 0x54: { if (isIX) this.d = (this.ix >> 8) & 0xFF; else this.d = (this.iy >> 8) & 0xFF; return 8; }
      case 0x55: { if (isIX) this.d = this.ix & 0xFF; else this.d = this.iy & 0xFF; return 8; }
      case 0x5C: { if (isIX) this.e = (this.ix >> 8) & 0xFF; else this.e = (this.iy >> 8) & 0xFF; return 8; }
      case 0x5D: { if (isIX) this.e = this.ix & 0xFF; else this.e = this.iy & 0xFF; return 8; }
      case 0x7C: { if (isIX) this.a = (this.ix >> 8) & 0xFF; else this.a = (this.iy >> 8) & 0xFF; return 8; }
      case 0x7D: { if (isIX) this.a = this.ix & 0xFF; else this.a = this.iy & 0xFF; return 8; }

      // LD IXH,r / LD IYH,r (undocumented)
      case 0x60: {
        if (isIX) this.ix = (this.b << 8) | (this.ix & 0xFF);
        else this.iy = (this.b << 8) | (this.iy & 0xFF);
        return 8;
      }
      case 0x61: {
        if (isIX) this.ix = (this.c << 8) | (this.ix & 0xFF);
        else this.iy = (this.c << 8) | (this.iy & 0xFF);
        return 8;
      }
      case 0x62: {
        if (isIX) this.ix = (this.d << 8) | (this.ix & 0xFF);
        else this.iy = (this.d << 8) | (this.iy & 0xFF);
        return 8;
      }
      case 0x63: {
        if (isIX) this.ix = (this.e << 8) | (this.ix & 0xFF);
        else this.iy = (this.e << 8) | (this.iy & 0xFF);
        return 8;
      }
      case 0x64: {
        // LD IXH,IXH — nop-like
        return 8;
      }
      case 0x65: {
        // LD IXH,IXL
        if (isIX) this.ix = ((this.ix & 0xFF) << 8) | (this.ix & 0xFF);
        else this.iy = ((this.iy & 0xFF) << 8) | (this.iy & 0xFF);
        return 8;
      }
      case 0x67: {
        if (isIX) this.ix = (this.a << 8) | (this.ix & 0xFF);
        else this.iy = (this.a << 8) | (this.iy & 0xFF);
        return 8;
      }

      // LD IXL,r / LD IYL,r (undocumented)
      case 0x68: {
        if (isIX) this.ix = (this.ix & 0xFF00) | this.b;
        else this.iy = (this.iy & 0xFF00) | this.b;
        return 8;
      }
      case 0x69: {
        if (isIX) this.ix = (this.ix & 0xFF00) | this.c;
        else this.iy = (this.iy & 0xFF00) | this.c;
        return 8;
      }
      case 0x6A: {
        if (isIX) this.ix = (this.ix & 0xFF00) | this.d;
        else this.iy = (this.iy & 0xFF00) | this.d;
        return 8;
      }
      case 0x6B: {
        if (isIX) this.ix = (this.ix & 0xFF00) | this.e;
        else this.iy = (this.iy & 0xFF00) | this.e;
        return 8;
      }
      case 0x6C: {
        // LD IXL,IXH
        if (isIX) this.ix = (this.ix & 0xFF00) | ((this.ix >> 8) & 0xFF);
        else this.iy = (this.iy & 0xFF00) | ((this.iy >> 8) & 0xFF);
        return 8;
      }
      case 0x6D: {
        // LD IXL,IXL — nop-like
        return 8;
      }
      case 0x6F: {
        if (isIX) this.ix = (this.ix & 0xFF00) | this.a;
        else this.iy = (this.iy & 0xFF00) | this.a;
        return 8;
      }

      // ALU A,(IX+d) — ADD, ADC, SUB, SBC, AND, XOR, OR, CP
      case 0x86: { const d = toSigned(this.fetchByte()); this.addA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0x8E: { const d = toSigned(this.fetchByte()); this.adcA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0x96: { const d = toSigned(this.fetchByte()); this.subA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0x9E: { const d = toSigned(this.fetchByte()); this.sbcA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0xA6: { const d = toSigned(this.fetchByte()); this.andA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0xAE: { const d = toSigned(this.fetchByte()); this.xorA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0xB6: { const d = toSigned(this.fetchByte()); this.orA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }
      case 0xBE: { const d = toSigned(this.fetchByte()); this.cpA(this.readByte((ixiy + d) & 0xFFFF)); return 19; }

      // Undocumented ALU A,IXH/IXL / ALU A,IYH/IYL
      case 0x84: this.addA((ixiy >> 8) & 0xFF); return 8;
      case 0x85: this.addA(ixiy & 0xFF); return 8;
      case 0x8C: this.adcA((ixiy >> 8) & 0xFF); return 8;
      case 0x8D: this.adcA(ixiy & 0xFF); return 8;
      case 0x94: this.subA((ixiy >> 8) & 0xFF); return 8;
      case 0x95: this.subA(ixiy & 0xFF); return 8;
      case 0x9C: this.sbcA((ixiy >> 8) & 0xFF); return 8;
      case 0x9D: this.sbcA(ixiy & 0xFF); return 8;
      case 0xA4: this.andA((ixiy >> 8) & 0xFF); return 8;
      case 0xA5: this.andA(ixiy & 0xFF); return 8;
      case 0xAC: this.xorA((ixiy >> 8) & 0xFF); return 8;
      case 0xAD: this.xorA(ixiy & 0xFF); return 8;
      case 0xB4: this.orA((ixiy >> 8) & 0xFF); return 8;
      case 0xB5: this.orA(ixiy & 0xFF); return 8;
      case 0xBC: this.cpA((ixiy >> 8) & 0xFF); return 8;
      case 0xBD: this.cpA(ixiy & 0xFF); return 8;

      // CB prefix with IX/IY displacement
      case 0xCB: {
        // DD CB d op — displacement comes before the CB opcode
        // We already consumed the DD and CB. Now read d then op.
        const d = toSigned(this.fetchByte());
        return this.execDDFDCBWithDisp(isIX, d);
      }

      // POP IX / POP IY
      case 0xE1: {
        const val = this.popWord();
        if (isIX) this.ix = val; else this.iy = val;
        return 14;
      }

      // EX (SP),IX / EX (SP),IY
      case 0xE3: {
        const tmp = this.readWord(this.sp);
        this.writeWord(this.sp, ixiy);
        if (isIX) this.ix = tmp; else this.iy = tmp;
        return 23;
      }

      // PUSH IX / PUSH IY
      case 0xE5: {
        this.pushWord(ixiy);
        return 15;
      }

      // JP (IX) / JP (IY)
      case 0xE9: {
        this.pc = ixiy;
        return 8;
      }

      // LD SP,IX / LD SP,IY
      case 0xF9: {
        this.sp = ixiy;
        return 10;
      }

      default:
        // Unrecognized DD/FD opcode — treat as NOP prefix then re-execute
        // the opcode as a normal instruction (the byte was already consumed).
        // This matches real Z80 behavior for undefined DD/FD prefixed opcodes.
        return 4 + this.execMain(op);
    }
  }

  // -------------------------------------------------------------------------
  // ED prefix — extended instructions
  // -------------------------------------------------------------------------

  private execED(): number {
    const op = this.fetchByte();
    this.incR();

    switch (op) {
      // IN r,(C) — 0x40,0x48,0x50,0x58,0x60,0x68,0x70,0x78
      case 0x40: { this.b = this.inC(); return 12; }
      case 0x48: { this.c = this.inC(); return 12; }
      case 0x50: { this.d = this.inC(); return 12; }
      case 0x58: { this.e = this.inC(); return 12; }
      case 0x60: { this.h = this.inC(); return 12; }
      case 0x68: { this.l = this.inC(); return 12; }
      case 0x70: { this.inC(); return 12; } // IN (C) — result discarded (undocumented)
      case 0x78: { this.a = this.inC(); return 12; }

      // OUT (C),r — 0x41,0x49,0x51,0x59,0x61,0x69,0x71,0x79
      case 0x41: this.bus.ioWrite(this.getBC(), this.b); return 12;
      case 0x49: this.bus.ioWrite(this.getBC(), this.c); return 12;
      case 0x51: this.bus.ioWrite(this.getBC(), this.d); return 12;
      case 0x59: this.bus.ioWrite(this.getBC(), this.e); return 12;
      case 0x61: this.bus.ioWrite(this.getBC(), this.h); return 12;
      case 0x69: this.bus.ioWrite(this.getBC(), this.l); return 12;
      case 0x71: this.bus.ioWrite(this.getBC(), 0); return 12; // OUT (C),0 (undocumented)
      case 0x79: this.bus.ioWrite(this.getBC(), this.a); return 12;

      // SBC HL,ss
      case 0x42: this.sbcHL(this.getBC()); return 15;
      case 0x52: this.sbcHL(this.getDE()); return 15;
      case 0x62: this.sbcHL(this.getHL()); return 15;
      case 0x72: this.sbcHL(this.sp); return 15;

      // ADC HL,ss
      case 0x4A: this.adcHL(this.getBC()); return 15;
      case 0x5A: this.adcHL(this.getDE()); return 15;
      case 0x6A: this.adcHL(this.getHL()); return 15;
      case 0x7A: this.adcHL(this.sp); return 15;

      // LD (nn),ss
      case 0x43: { const addr = this.fetchWord(); this.writeWord(addr, this.getBC()); return 20; }
      case 0x53: { const addr = this.fetchWord(); this.writeWord(addr, this.getDE()); return 20; }
      case 0x63: { const addr = this.fetchWord(); this.writeWord(addr, this.getHL()); return 20; }
      case 0x73: { const addr = this.fetchWord(); this.writeWord(addr, this.sp); return 20; }

      // LD ss,(nn)
      case 0x4B: { const addr = this.fetchWord(); this.setBC(this.readWord(addr)); return 20; }
      case 0x5B: { const addr = this.fetchWord(); this.setDE(this.readWord(addr)); return 20; }
      case 0x6B: { const addr = this.fetchWord(); this.setHL(this.readWord(addr)); return 20; }
      case 0x7B: { const addr = this.fetchWord(); this.sp = this.readWord(addr); return 20; }

      // NEG (0x44 and undocumented mirrors 0x4C,0x54,0x5C,0x64,0x6C,0x74,0x7C)
      case 0x44: case 0x4C: case 0x54: case 0x5C:
      case 0x64: case 0x6C: case 0x74: case 0x7C: {
        const prev = this.a;
        this.a = (0 - this.a) & 0xFF;
        this.f = (this.a !== 0 ? F_C : 0) | F_N |
                 (prev === 0x80 ? F_PV : 0) |
                 ((prev ^ this.a) & F_H) |
                 sz53Table[this.a]!;
        return 8;
      }

      // RETN (0x45 and mirrors 0x55,0x65,0x75)
      case 0x45: case 0x55: case 0x65: case 0x75:
        this.iff1 = this.iff2;
        this.pc = this.popWord();
        return 14;

      // RETI (0x4D and mirrors 0x5D,0x6D,0x7D)
      case 0x4D: case 0x5D: case 0x6D: case 0x7D:
        this.iff1 = this.iff2;
        this.pc = this.popWord();
        return 14;

      // IM 0 (0x46 and mirrors)
      case 0x46: case 0x4E: case 0x66: case 0x6E:
        this.im = 0;
        return 8;

      // IM 1 (0x56 and mirror 0x76)
      case 0x56: case 0x76:
        this.im = 1;
        return 8;

      // IM 2 (0x5E and mirror 0x7E)
      case 0x5E: case 0x7E:
        this.im = 2;
        return 8;

      // LD I,A
      case 0x47:
        this.i = this.a;
        return 9;

      // LD R,A
      case 0x4F:
        this.r = this.a;
        return 9;

      // LD A,I
      case 0x57:
        this.a = this.i;
        this.f = (this.f & F_C) | sz53Table[this.a]! | (this.iff2 ? F_PV : 0);
        return 9;

      // LD A,R
      case 0x5F:
        this.a = this.r;
        this.f = (this.f & F_C) | sz53Table[this.a]! | (this.iff2 ? F_PV : 0);
        return 9;

      // RRD
      case 0x67: {
        const addr = this.getHL();
        const mem = this.readByte(addr);
        this.writeByte(addr, ((this.a << 4) | (mem >> 4)) & 0xFF);
        this.a = (this.a & 0xF0) | (mem & 0x0F);
        this.f = (this.f & F_C) | sz53pTable[this.a]!;
        return 18;
      }

      // RLD
      case 0x6F: {
        const addr = this.getHL();
        const mem = this.readByte(addr);
        this.writeByte(addr, ((mem << 4) | (this.a & 0x0F)) & 0xFF);
        this.a = (this.a & 0xF0) | ((mem >> 4) & 0x0F);
        this.f = (this.f & F_C) | sz53pTable[this.a]!;
        return 18;
      }

      // =====================================================================
      // Block instructions
      // =====================================================================

      // LDI
      case 0xA0: {
        const val = this.readByte(this.getHL());
        this.writeByte(this.getDE(), val);
        this.setHL((this.getHL() + 1) & 0xFFFF);
        this.setDE((this.getDE() + 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = (val + this.a) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_C)) |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        return 16;
      }

      // LDIR
      case 0xB0: {
        const val = this.readByte(this.getHL());
        this.writeByte(this.getDE(), val);
        this.setHL((this.getHL() + 1) & 0xFFFF);
        this.setDE((this.getDE() + 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = (val + this.a) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_C)) |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        if (this.getBC() !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF; // repeat
          return 21;
        }
        return 16;
      }

      // LDD
      case 0xA8: {
        const val = this.readByte(this.getHL());
        this.writeByte(this.getDE(), val);
        this.setHL((this.getHL() - 1) & 0xFFFF);
        this.setDE((this.getDE() - 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = (val + this.a) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_C)) |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        return 16;
      }

      // LDDR
      case 0xB8: {
        const val = this.readByte(this.getHL());
        this.writeByte(this.getDE(), val);
        this.setHL((this.getHL() - 1) & 0xFFFF);
        this.setDE((this.getDE() - 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = (val + this.a) & 0xFF;
        this.f = (this.f & (F_S | F_Z | F_C)) |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        if (this.getBC() !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      // CPI
      case 0xA1: {
        const val = this.readByte(this.getHL());
        const result = (this.a - val) & 0xFF;
        const hc = ((this.a & 0x0F) - (val & 0x0F)) & 0x10;
        this.setHL((this.getHL() + 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = result - (hc ? 1 : 0);
        this.f = (this.f & F_C) | F_N |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (hc ? F_H : 0) |
                 (result & F_S) |
                 (result === 0 ? F_Z : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        return 16;
      }

      // CPIR
      case 0xB1: {
        const val = this.readByte(this.getHL());
        const result = (this.a - val) & 0xFF;
        const hc = ((this.a & 0x0F) - (val & 0x0F)) & 0x10;
        this.setHL((this.getHL() + 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = result - (hc ? 1 : 0);
        this.f = (this.f & F_C) | F_N |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (hc ? F_H : 0) |
                 (result & F_S) |
                 (result === 0 ? F_Z : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        if (this.getBC() !== 0 && result !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      // CPD
      case 0xA9: {
        const val = this.readByte(this.getHL());
        const result = (this.a - val) & 0xFF;
        const hc = ((this.a & 0x0F) - (val & 0x0F)) & 0x10;
        this.setHL((this.getHL() - 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = result - (hc ? 1 : 0);
        this.f = (this.f & F_C) | F_N |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (hc ? F_H : 0) |
                 (result & F_S) |
                 (result === 0 ? F_Z : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        return 16;
      }

      // CPDR
      case 0xB9: {
        const val = this.readByte(this.getHL());
        const result = (this.a - val) & 0xFF;
        const hc = ((this.a & 0x0F) - (val & 0x0F)) & 0x10;
        this.setHL((this.getHL() - 1) & 0xFFFF);
        this.setBC((this.getBC() - 1) & 0xFFFF);
        const n = result - (hc ? 1 : 0);
        this.f = (this.f & F_C) | F_N |
                 (this.getBC() !== 0 ? F_PV : 0) |
                 (hc ? F_H : 0) |
                 (result & F_S) |
                 (result === 0 ? F_Z : 0) |
                 (n & F_3) |
                 ((n & 0x02) ? F_5 : 0);
        if (this.getBC() !== 0 && result !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      // =====================================================================
      // I/O block instructions
      // =====================================================================

      // INI
      case 0xA2: {
        const val = this.bus.ioRead(this.getBC());
        this.writeByte(this.getHL(), val);
        this.b = (this.b - 1) & 0xFF;
        this.setHL((this.getHL() + 1) & 0xFFFF);
        const k = (val + ((this.c + 1) & 0xFF)) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        return 16;
      }

      // INIR
      case 0xB2: {
        const val = this.bus.ioRead(this.getBC());
        this.writeByte(this.getHL(), val);
        this.b = (this.b - 1) & 0xFF;
        this.setHL((this.getHL() + 1) & 0xFFFF);
        const k = (val + ((this.c + 1) & 0xFF)) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        if (this.b !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      // IND
      case 0xAA: {
        const val = this.bus.ioRead(this.getBC());
        this.writeByte(this.getHL(), val);
        this.b = (this.b - 1) & 0xFF;
        this.setHL((this.getHL() - 1) & 0xFFFF);
        const k = (val + ((this.c - 1) & 0xFF)) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        return 16;
      }

      // INDR
      case 0xBA: {
        const val = this.bus.ioRead(this.getBC());
        this.writeByte(this.getHL(), val);
        this.b = (this.b - 1) & 0xFF;
        this.setHL((this.getHL() - 1) & 0xFFFF);
        const k = (val + ((this.c - 1) & 0xFF)) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        if (this.b !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      // OUTI
      case 0xA3: {
        const val = this.readByte(this.getHL());
        this.b = (this.b - 1) & 0xFF;
        this.bus.ioWrite(this.getBC(), val);
        this.setHL((this.getHL() + 1) & 0xFFFF);
        const k = (val + this.l) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        return 16;
      }

      // OTIR
      case 0xB3: {
        const val = this.readByte(this.getHL());
        this.b = (this.b - 1) & 0xFF;
        this.bus.ioWrite(this.getBC(), val);
        this.setHL((this.getHL() + 1) & 0xFFFF);
        const k = (val + this.l) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        if (this.b !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      // OUTD
      case 0xAB: {
        const val = this.readByte(this.getHL());
        this.b = (this.b - 1) & 0xFF;
        this.bus.ioWrite(this.getBC(), val);
        this.setHL((this.getHL() - 1) & 0xFFFF);
        const k = (val + this.l) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        return 16;
      }

      // OTDR
      case 0xBB: {
        const val = this.readByte(this.getHL());
        this.b = (this.b - 1) & 0xFF;
        this.bus.ioWrite(this.getBC(), val);
        this.setHL((this.getHL() - 1) & 0xFFFF);
        const k = (val + this.l) & 0xFF;
        this.f = (this.b === 0 ? F_Z : 0) |
                 (this.b & F_S) |
                 (this.b & (F_3 | F_5)) |
                 ((val & 0x80) ? F_N : 0) |
                 (parityTable[(k & 7) ^ this.b]! ? F_PV : 0) |
                 (k > 255 ? F_C | F_H : 0);
        if (this.b !== 0) {
          this.pc = (this.pc - 2) & 0xFFFF;
          return 21;
        }
        return 16;
      }

      default:
        // All undefined ED opcodes are NOPs (8 T-states: 4 for ED prefix + 4 for opcode)
        return 8;
    }
  }

  // -------------------------------------------------------------------------
  // Helper: IN r,(C) with flag updates
  // -------------------------------------------------------------------------

  private inC(): number {
    const val = this.bus.ioRead(this.getBC());
    this.f = (this.f & F_C) | sz53pTable[val]!;
    return val;
  }
}

// ---------------------------------------------------------------------------
// Half-carry and overflow lookup tables (for ADD/SUB 8-bit)
// Used by addA, adcA, subA, sbcA, cpA
// ---------------------------------------------------------------------------

const halfcarryAddTable = new Uint8Array([0, F_H, F_H, F_H, 0, 0, 0, F_H]);
const halfcarrySubTable = new Uint8Array([0, 0, F_H, 0, F_H, 0, F_H, F_H]);
const overflowAddTable  = new Uint8Array([0, 0, 0, F_PV, F_PV, 0, 0, 0]);
const overflowSubTable  = new Uint8Array([0, F_PV, 0, 0, 0, 0, F_PV, 0]);
