/**
 * M68000 CPU tests using Tom Harte's ProcessorTests vectors.
 * https://github.com/TomHarte/ProcessorTests/tree/main/680x0/68000/v1
 *
 * Each test vector provides initial CPU state + RAM, executes one
 * instruction, and verifies the final state matches exactly.
 */

import { describe, it, expect } from 'vitest';
import { M68000 } from '../cpu/m68000';
import type { BusInterface } from '../types';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Test bus: simple RAM-based bus for test vectors
// ---------------------------------------------------------------------------

class TestBus implements BusInterface {
  private ram = new Map<number, number>();

  reset(): void {
    this.ram.clear();
  }

  loadRAM(entries: [number, number][]): void {
    for (const [addr, val] of entries) {
      this.ram.set(addr & 0xFFFFFF, val & 0xFF);
    }
  }

  read8(address: number): number {
    return this.ram.get(address & 0xFFFFFF) ?? 0;
  }

  read16(address: number): number {
    return (this.read8(address) << 8) | this.read8(address + 1);
  }

  read32(address: number): number {
    return ((this.read8(address) << 24) |
            (this.read8(address + 1) << 16) |
            (this.read8(address + 2) << 8) |
             this.read8(address + 3)) >>> 0;
  }

  write8(address: number, value: number): void {
    this.ram.set(address & 0xFFFFFF, value & 0xFF);
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

  /** Read all RAM entries for comparison */
  getRAM(): Map<number, number> {
    return this.ram;
  }
}

// ---------------------------------------------------------------------------
// Test vector interface
// ---------------------------------------------------------------------------

interface TestVector {
  name: string;
  initial: {
    d0: number; d1: number; d2: number; d3: number;
    d4: number; d5: number; d6: number; d7: number;
    a0: number; a1: number; a2: number; a3: number;
    a4: number; a5: number; a6: number;
    usp: number; ssp: number;
    sr: number; pc: number;
    prefetch: [number, number];
    ram: [number, number][];
  };
  final: {
    d0: number; d1: number; d2: number; d3: number;
    d4: number; d5: number; d6: number; d7: number;
    a0: number; a1: number; a2: number; a3: number;
    a4: number; a5: number; a6: number;
    usp: number; ssp: number;
    sr: number; pc: number;
    prefetch: [number, number];
    ram: [number, number][];
  };
  length: number;
}

// ---------------------------------------------------------------------------
// Setup: load CPU state from test vector
// ---------------------------------------------------------------------------

function setupCPU(cpu: M68000, bus: TestBus, test: TestVector): void {
  bus.reset();

  const init = test.initial;

  // Load RAM (includes instruction bytes at PC)
  bus.loadRAM(init.ram);

  // Set CPU state via setState
  cpu.setState({
    d: new Int32Array([init.d0, init.d1, init.d2, init.d3, init.d4, init.d5, init.d6, init.d7]),
    a: new Int32Array([init.a0, init.a1, init.a2, init.a3, init.a4, init.a5, init.a6, init.ssp]),
    pc: init.pc,
    sr: init.sr,
    usp: init.usp,
    ssp: init.ssp,
    stopped: false,
    pendingInterrupt: 0,
    irqLines: 0,
  });

  // Set prefetch queue
  const cpuAny = cpu as unknown as { prefetch0: number; prefetch1: number };
  cpuAny.prefetch0 = init.prefetch[0];
  cpuAny.prefetch1 = init.prefetch[1];
}

function verifyCPU(cpu: M68000, bus: TestBus, test: TestVector): string[] {
  const errors: string[] = [];
  const state = cpu.getState();
  const expected = test.final;

  // Check data registers
  const dNames = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'] as const;
  for (let i = 0; i < 8; i++) {
    const got = state.d[i]! >>> 0;
    const exp = expected[dNames[i]!] >>> 0;
    if (got !== exp) {
      errors.push(`D${i}: got 0x${got.toString(16)} expected 0x${exp.toString(16)}`);
    }
  }

  // Check address registers
  const aNames = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'] as const;
  for (let i = 0; i < 7; i++) {
    const got = state.a[i]! >>> 0;
    const exp = expected[aNames[i]!] >>> 0;
    if (got !== exp) {
      errors.push(`A${i}: got 0x${got.toString(16)} expected 0x${exp.toString(16)}`);
    }
  }

  // Check SSP (A7 in supervisor mode)
  const gotSSP = expected.sr & 0x2000 ? (state.a[7]! >>> 0) : state.ssp >>> 0;
  if ((gotSSP >>> 0) !== (expected.ssp >>> 0)) {
    errors.push(`SSP: got 0x${gotSSP.toString(16)} expected 0x${(expected.ssp >>> 0).toString(16)}`);
  }

  // Check USP
  if ((state.usp >>> 0) !== (expected.usp >>> 0)) {
    errors.push(`USP: got 0x${(state.usp >>> 0).toString(16)} expected 0x${(expected.usp >>> 0).toString(16)}`);
  }

  // Check PC
  if ((state.pc >>> 0) !== (expected.pc >>> 0)) {
    errors.push(`PC: got 0x${(state.pc >>> 0).toString(16)} expected 0x${(expected.pc >>> 0).toString(16)}`);
  }

  // Check SR
  if ((state.sr & 0xFFFF) !== (expected.sr & 0xFFFF)) {
    errors.push(`SR: got 0x${(state.sr & 0xFFFF).toString(16)} expected 0x${(expected.sr & 0xFFFF).toString(16)}`);
  }

  // Check RAM
  for (const [addr, expectedVal] of expected.ram) {
    const got = bus.read8(addr);
    if (got !== expectedVal) {
      errors.push(`RAM[0x${addr.toString(16)}]: got 0x${got.toString(16)} expected 0x${expectedVal.toString(16)}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const TEST_DIR = join(__dirname, '../../tests/68000');
const MAX_TESTS_PER_FILE = 200; // Run first N tests per instruction (speed)

// Find all test files
let testFiles: string[] = [];
try {
  testFiles = readdirSync(TEST_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
} catch {
  // Test directory doesn't exist
}

if (testFiles.length === 0) {
  it('M68000 Tom Harte fixtures must be present', () => {
    throw new Error(`No test vectors found in ${TEST_DIR}. Run: git submodule update --init`);
  });
}

for (const file of testFiles) {
  const instrName = file.replace('.json', '');

  describe(`M68000 ${instrName}`, () => {
    const filePath = join(TEST_DIR, file);
    let vectors: TestVector[];

    try {
      vectors = JSON.parse(readFileSync(filePath, 'utf8')) as TestVector[];
    } catch {
      it.skip('could not load test vectors', () => {});
      return;
    }

    const bus = new TestBus();
    const cpu = new M68000(bus);
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

        const errors = verifyCPU(cpu, bus, test);
        if (errors.length > 0) {
          failed++;
          if (failures.length < 10) {
            failures.push(`${test.name}: ${errors.join(', ')}`);
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
