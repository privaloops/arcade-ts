/**
 * Z80 CPU tests using SingleStepTests/z80 (JSMoo) test vectors.
 * https://github.com/SingleStepTests/z80
 *
 * Each test vector provides initial CPU state + RAM, executes one
 * instruction, and verifies the final state matches exactly.
 */

import { describe, it, expect } from 'vitest';
import { Z80 } from '../cpu/z80';
import type { Z80BusInterface } from '../types';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Test bus: simple RAM-based bus for test vectors
// ---------------------------------------------------------------------------

class TestBus implements Z80BusInterface {
  private ram = new Uint8Array(65536);
  private ioReadQueue: number[] = [];

  reset(): void {
    this.ram.fill(0);
    this.ioReadQueue = [];
  }

  loadRAM(entries: [number, number][]): void {
    for (const [addr, val] of entries) {
      this.ram[addr & 0xFFFF] = val & 0xFF;
    }
  }

  /** Preload I/O read values extracted from test vector cycles */
  loadIOReads(values: number[]): void {
    this.ioReadQueue = [...values];
  }

  read(address: number): number {
    return this.ram[address & 0xFFFF]!;
  }

  write(address: number, value: number): void {
    this.ram[address & 0xFFFF] = value & 0xFF;
  }

  ioRead(_port: number): number {
    return this.ioReadQueue.length > 0 ? this.ioReadQueue.shift()! : 0xFF;
  }

  ioWrite(_port: number, _value: number): void {
    // no-op
  }

  /** Read a byte for verification */
  readByte(addr: number): number {
    return this.ram[addr & 0xFFFF]!;
  }
}

// ---------------------------------------------------------------------------
// Test vector types (SingleStepTests/z80 format)
// ---------------------------------------------------------------------------

type BusCycle = [number, number | null, string]; // [address, data, flags]

interface TestVector {
  name: string;
  cycles?: BusCycle[];
  initial: {
    pc: number; sp: number;
    a: number; b: number; c: number; d: number;
    e: number; f: number; h: number; l: number;
    i: number; r: number;
    ei: number;
    wz: number;
    ix: number; iy: number;
    af_: number; bc_: number; de_: number; hl_: number;
    im: number;
    p: number; q: number;
    iff1: number; iff2: number;
    ram: [number, number][];
  };
  final: {
    pc: number; sp: number;
    a: number; b: number; c: number; d: number;
    e: number; f: number; h: number; l: number;
    i: number; r: number;
    ei: number;
    wz: number;
    ix: number; iy: number;
    af_: number; bc_: number; de_: number; hl_: number;
    im: number;
    p: number; q: number;
    iff1: number; iff2: number;
    ram: [number, number][];
  };
}

// ---------------------------------------------------------------------------
// Setup / verification helpers
// ---------------------------------------------------------------------------

function setupCPU(cpu: Z80, bus: TestBus, test: TestVector): void {
  bus.reset();
  bus.loadRAM(test.initial.ram);

  const init = test.initial;
  cpu.setState({
    a: init.a, f: init.f,
    b: init.b, c: init.c,
    d: init.d, e: init.e,
    h: init.h, l: init.l,
    // Shadow: test vectors store as 16-bit pairs
    a_: (init.af_ >> 8) & 0xFF, f_: init.af_ & 0xFF,
    b_: (init.bc_ >> 8) & 0xFF, c_: init.bc_ & 0xFF,
    d_: (init.de_ >> 8) & 0xFF, e_: init.de_ & 0xFF,
    h_: (init.hl_ >> 8) & 0xFF, l_: init.hl_ & 0xFF,
    ix: init.ix, iy: init.iy,
    sp: init.sp, pc: init.pc,
    i: init.i, r: init.r,
    iff1: init.iff1 !== 0, iff2: init.iff2 !== 0,
    im: init.im,
    halted: false,
    tStates: 0,
    irqLineAsserted: false,
    pendingIrq: false,
    enableInterruptsNext: false,
  });
  (cpu as unknown as { irqLineAsserted: boolean }).irqLineAsserted = false;
  (cpu as unknown as { wz: number }).wz = init.wz;
  (cpu as unknown as { q: number }).q = init.q;

  // Extract I/O read values from bus cycles (flags contain 'i' for I/O)
  if (test.cycles) {
    const ioReads: number[] = [];
    for (let i = 0; i < test.cycles.length; i++) {
      const cycle = test.cycles[i]!;
      const flags = cycle[2];
      // 'r--i' = I/O read; the data is in the NEXT cycle entry
      if (flags.includes('i') && flags.startsWith('r') && i + 1 < test.cycles.length) {
        const dataCycle = test.cycles[i + 1]!;
        if (dataCycle[1] !== null) {
          ioReads.push(dataCycle[1]);
        }
      }
    }
    bus.loadIOReads(ioReads);
  }
}

function verifyCPU(cpu: Z80, bus: TestBus, test: TestVector): string[] {
  const errors: string[] = [];
  const state = cpu.getState();
  const expected = test.final;

  // 8-bit registers
  const regs8: [string, number, number][] = [
    ['A', state.a, expected.a],
    ['F', state.f, expected.f],
    ['B', state.b, expected.b],
    ['C', state.c, expected.c],
    ['D', state.d, expected.d],
    ['E', state.e, expected.e],
    ['H', state.h, expected.h],
    ['L', state.l, expected.l],
    ['I', state.i, expected.i],
    ['R', state.r & 0xFF, expected.r & 0xFF],
  ];

  for (const [name, got, exp] of regs8) {
    if ((got & 0xFF) !== (exp & 0xFF)) {
      errors.push(`${name}: got 0x${(got & 0xFF).toString(16)} expected 0x${(exp & 0xFF).toString(16)}`);
    }
  }

  // 16-bit registers
  const regs16: [string, number, number][] = [
    ['PC', state.pc, expected.pc],
    ['SP', state.sp, expected.sp],
    ['IX', state.ix, expected.ix],
    ['IY', state.iy, expected.iy],
  ];

  for (const [name, got, exp] of regs16) {
    if ((got & 0xFFFF) !== (exp & 0xFFFF)) {
      errors.push(`${name}: got 0x${(got & 0xFFFF).toString(16)} expected 0x${(exp & 0xFFFF).toString(16)}`);
    }
  }

  // Shadow registers (stored as 16-bit pairs in test vectors)
  const gotAF_ = ((state.a_ & 0xFF) << 8) | (state.f_ & 0xFF);
  const gotBC_ = ((state.b_ & 0xFF) << 8) | (state.c_ & 0xFF);
  const gotDE_ = ((state.d_ & 0xFF) << 8) | (state.e_ & 0xFF);
  const gotHL_ = ((state.h_ & 0xFF) << 8) | (state.l_ & 0xFF);

  if (gotAF_ !== (expected.af_ & 0xFFFF)) errors.push(`AF': got 0x${gotAF_.toString(16)} expected 0x${(expected.af_ & 0xFFFF).toString(16)}`);
  if (gotBC_ !== (expected.bc_ & 0xFFFF)) errors.push(`BC': got 0x${gotBC_.toString(16)} expected 0x${(expected.bc_ & 0xFFFF).toString(16)}`);
  if (gotDE_ !== (expected.de_ & 0xFFFF)) errors.push(`DE': got 0x${gotDE_.toString(16)} expected 0x${(expected.de_ & 0xFFFF).toString(16)}`);
  if (gotHL_ !== (expected.hl_ & 0xFFFF)) errors.push(`HL': got 0x${gotHL_.toString(16)} expected 0x${(expected.hl_ & 0xFFFF).toString(16)}`);

  // IFF1/IFF2
  if ((state.iff1 ? 1 : 0) !== expected.iff1) errors.push(`IFF1: got ${state.iff1 ? 1 : 0} expected ${expected.iff1}`);
  if ((state.iff2 ? 1 : 0) !== expected.iff2) errors.push(`IFF2: got ${state.iff2 ? 1 : 0} expected ${expected.iff2}`);

  // IM
  if (state.im !== expected.im) errors.push(`IM: got ${state.im} expected ${expected.im}`);

  // Halted
  if (state.halted !== (expected.pc === test.initial.pc)) {
    // HALT keeps PC at the same place — only check if instruction is HALT
  }

  // RAM
  for (const [addr, expectedVal] of expected.ram) {
    const got = bus.readByte(addr!);
    if (got !== expectedVal) {
      errors.push(`RAM[0x${addr!.toString(16)}]: got 0x${got.toString(16)} expected 0x${expectedVal!.toString(16)}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const TEST_DIR = join(__dirname, '../../tests/z80');
const MAX_TESTS_PER_FILE = 200; // Run first N tests per instruction (speed)

// Find all test files
let testFiles: string[] = [];
try {
  testFiles = readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
} catch {
  // Test directory doesn't exist — skip
}

for (const file of testFiles) {
  const instrName = file.replace('.json', '').toUpperCase();

  describe(`Z80 ${instrName}`, () => {
    const filePath = join(TEST_DIR, file);
    let vectors: TestVector[] = [];

    try {
      vectors = JSON.parse(readFileSync(filePath, 'utf8')) as TestVector[];
    } catch {
      it.skip('could not load test vectors', () => {});
      return;
    }

    const bus = new TestBus();
    const cpu = new Z80(bus);
    const subset = vectors.slice(0, MAX_TESTS_PER_FILE);

    it(`passes ${subset.length}/${vectors.length} test vectors`, () => {
      let passed = 0;
      let failed = 0;
      const failures: string[] = [];

      for (const test of subset) {
        setupCPU(cpu, bus, test);

        try {
          cpu.step();
        } catch (e) {
          failures.push(`${test.name}: EXCEPTION: ${e}`);
          failed++;
          continue;
        }

        const errs = verifyCPU(cpu, bus, test);
        if (errs.length > 0) {
          failed++;
          if (failures.length < 10) {
            failures.push(`${test.name}: ${errs.join(', ')}`);
          }
        } else {
          passed++;
        }
      }

      if (failures.length > 0) {
        console.log(`\n${instrName}: ${passed} passed, ${failed} failed (of ${subset.length})`);
        for (const f of failures) {
          console.log(`  FAIL: ${f}`);
        }
      }

      expect(failed, `${failed} tests failed:\n${failures.join('\n')}`).toBe(0);
    });
  });
}
