import { describe, it, expect } from 'vitest';
import { M68000 } from '../cpu/m68000';
import type { BusInterface } from '../types';

/** Simple mock bus backed by a flat 64KB array */
class MockBus implements BusInterface {
  private mem = new Uint8Array(0x10000);

  read8(address: number): number {
    return this.mem[address & 0xFFFF]!;
  }
  read16(address: number): number {
    const a = address & 0xFFFF;
    return (this.mem[a]! << 8) | this.mem[a + 1]!;
  }
  read32(address: number): number {
    return (this.read16(address) << 16) | this.read16(address + 2);
  }
  write8(address: number, value: number): void {
    this.mem[address & 0xFFFF] = value & 0xFF;
  }
  write16(address: number, value: number): void {
    const a = address & 0xFFFF;
    this.mem[a] = (value >> 8) & 0xFF;
    this.mem[a + 1] = value & 0xFF;
  }
  write32(address: number, value: number): void {
    this.write16(address, (value >> 16) & 0xFFFF);
    this.write16(address + 2, value & 0xFFFF);
  }

  /** Write a 68000 program starting at the given address */
  writeProgram(address: number, words: number[]): void {
    for (let i = 0; i < words.length; i++) {
      this.write16(address + i * 2, words[i]!);
    }
  }
}

function createCpu(programAddr: number, programWords: number[]): { cpu: M68000; bus: MockBus } {
  const bus = new MockBus();
  // Set up reset vectors: SP=0x1000, PC=programAddr
  bus.write32(0x0000, 0x00001000); // Initial SP
  bus.write32(0x0004, programAddr); // Initial PC
  // Write the program
  bus.writeProgram(programAddr, programWords);
  const cpu = new M68000(bus);
  cpu.reset();
  return { cpu, bus };
}

describe('M68000 basic instructions', () => {
  it('resets with correct SP and PC', () => {
    const { cpu } = createCpu(0x100, [0x4E71]); // NOP
    const state = cpu.getState();
    expect(state.a[7]).toBe(0x00001000); // SP
    expect(state.pc).toBe(0x100); // PC at first instruction
  });

  it('executes NOP (0x4E71)', () => {
    const { cpu } = createCpu(0x100, [0x4E71, 0x4E71]);
    const cycles = cpu.step(); // execute NOP
    expect(cycles).toBeGreaterThan(0);
    const state = cpu.getState();
    expect(state.pc).toBe(0x102); // PC advanced by 2
  });

  it('executes MOVEQ #imm, Dn', () => {
    // MOVEQ #42, D0 = 0x702A
    const { cpu } = createCpu(0x100, [0x702A]);
    cpu.step();
    const state = cpu.getState();
    expect(state.d[0]).toBe(42);
  });

  it('executes MOVEQ with negative value (sign-extended)', () => {
    // MOVEQ #-1, D0 = 0x70FF
    const { cpu } = createCpu(0x100, [0x70FF]);
    cpu.step();
    const state = cpu.getState();
    expect(state.d[0]).toBe(-1);
  });

  it('executes ADD.L Dn, Dn', () => {
    // MOVEQ #10, D0 (0x700A)
    // MOVEQ #20, D1 (0x7214)
    // ADD.L D0, D1 (0xD280)
    const { cpu } = createCpu(0x100, [0x700A, 0x7214, 0xD280]);
    cpu.step(); // MOVEQ #10, D0
    cpu.step(); // MOVEQ #20, D1
    cpu.step(); // ADD.L D0, D1
    const state = cpu.getState();
    expect(state.d[1]).toBe(30);
  });

  it('executes BRA.S (short branch)', () => {
    // BRA.S +4 = 0x6004 (skip 2 words)
    // NOP = 0x4E71
    // NOP = 0x4E71
    // MOVEQ #99, D0 = 0x7063
    const { cpu } = createCpu(0x100, [0x6004, 0x4E71, 0x4E71, 0x7063]);
    cpu.step(); // BRA.S +4 → jumps to 0x106
    const state1 = cpu.getState();
    expect(state1.pc).toBe(0x106);
    cpu.step(); // MOVEQ #99, D0
    const state2 = cpu.getState();
    expect(state2.d[0]).toBe(99);
  });

  it('executes CLR.L Dn', () => {
    // MOVEQ #42, D0 (0x702A)
    // CLR.L D0 (0x4280)
    const { cpu } = createCpu(0x100, [0x702A, 0x4280]);
    cpu.step(); // MOVEQ
    cpu.step(); // CLR.L D0
    const state = cpu.getState();
    expect(state.d[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// M68000 interrupts
// ---------------------------------------------------------------------------

describe('M68000 interrupts', () => {
  function createCpuWithIsr(
    isrAddr: number,
    level: number,
    programWords: number[],
  ) {
    const bus = new MockBus();
    // Reset vectors: SP=0x1000, PC=0x100
    bus.write32(0x0000, 0x00001000);
    bus.write32(0x0004, 0x00000100);
    // Autovector for this level: (25 + level - 1) * 4
    const vectorAddr = (25 + level - 1) * 4;
    bus.write32(vectorAddr, isrAddr);
    // Write ISR: RTE (0x4E73)
    bus.write16(isrAddr, 0x4E73);
    // Write main program
    bus.writeProgram(0x100, programWords);
    const cpu = new M68000(bus);
    cpu.reset();
    return { cpu, bus };
  }

  it('takes IRQ level 2 when IPL=0', () => {
    // NOP loop
    const { cpu } = createCpuWithIsr(0x200, 2, [0x4E71, 0x4E71, 0x4E71]);
    // SR after reset = 0x2700 (IPL=7). Lower IPL to 0 via MOVE to SR.
    // ANDI #0x20FF, SR → 0x027C 0x20FF (clears IPL bits, keeps supervisor)
    // Actually, let's use setState for simplicity
    const state = cpu.getState();
    state.sr = 0x2000; // supervisor, IPL=0
    cpu.setState(state);

    cpu.assertInterrupt(2);
    cpu.step(); // should take the interrupt

    const after = cpu.getState();
    // PC should be at ISR address (0x200) + 2 (after prefetch)
    // SR IPL should be 2
    expect((after.sr >> 8) & 7).toBe(2);
    // SP should have decreased by 6 (pushed PC=4 + SR=2)
    expect(after.a[7]).toBeLessThan(0x1000);
  });

  it('masks IRQ when level <= IPL', () => {
    const { cpu } = createCpuWithIsr(0x200, 2, [0x4E71, 0x4E71]);
    const state = cpu.getState();
    state.sr = 0x2300; // supervisor, IPL=3
    cpu.setState(state);

    cpu.assertInterrupt(2);
    const pcBefore = cpu.getState().pc;
    cpu.step(); // should execute NOP, not take IRQ

    const after = cpu.getState();
    // PC advanced (NOP executed), not jumped to ISR
    expect(after.pc).toBe(pcBefore + 2);
  });

  it('level 7 (NMI) is never masked', () => {
    const { cpu } = createCpuWithIsr(0x200, 7, [0x4E71, 0x4E71]);
    const state = cpu.getState();
    state.sr = 0x2700; // supervisor, IPL=7 (max mask)
    cpu.setState(state);

    cpu.assertInterrupt(7);
    cpu.step();

    const after = cpu.getState();
    expect((after.sr >> 8) & 7).toBe(7);
    // SP decreased = interrupt was taken
    expect(after.a[7]).toBeLessThan(0x1000);
  });

  it('requestInterrupt is one-shot (cleared after servicing)', () => {
    const { cpu } = createCpuWithIsr(0x200, 2, [0x4E71, 0x4E71, 0x4E71]);
    const state = cpu.getState();
    state.sr = 0x2000; // IPL=0
    cpu.setState(state);

    cpu.requestInterrupt(2);
    cpu.step(); // takes IRQ, clears pending

    // Execute RTE at 0x200
    cpu.step();
    const afterRte = cpu.getState();
    // After RTE, IPL restored to 0, pendingInterrupt cleared
    // Next step should execute NOP, not re-enter IRQ
    const pcAfterRte = afterRte.pc;
    cpu.step();
    const afterNop = cpu.getState();
    expect(afterNop.pc).toBe(pcAfterRte + 2); // NOP advanced PC
  });

  it('irqAckCallback is called on interrupt acknowledge', () => {
    const { cpu } = createCpuWithIsr(0x200, 2, [0x4E71]);
    const state = cpu.getState();
    state.sr = 0x2000;
    cpu.setState(state);

    let acked = false;
    cpu.setIrqAckCallback(() => { acked = true; });
    cpu.assertInterrupt(2);
    cpu.step();

    expect(acked).toBe(true);
  });
});
