import { describe, it, expect } from 'vitest';
import { Bus } from '../memory/bus';

describe('Bus address decoding', () => {
  it('reads/writes work RAM at 0xFF0000-0xFFFFFF', () => {
    const bus = new Bus();
    bus.write8(0xFF0000, 0x42);
    expect(bus.read8(0xFF0000)).toBe(0x42);
    bus.write8(0xFFFFFF, 0xAB);
    expect(bus.read8(0xFFFFFF)).toBe(0xAB);
  });

  it('reads/writes VRAM at 0x900000-0x92FFFF', () => {
    const bus = new Bus();
    bus.write8(0x900000, 0x12);
    expect(bus.read8(0x900000)).toBe(0x12);
    bus.write8(0x92FFFF, 0x34);
    expect(bus.read8(0x92FFFF)).toBe(0x34);
  });

  it('reads program ROM (read-only)', () => {
    const bus = new Bus();
    const rom = new Uint8Array(256);
    rom[0] = 0x00; rom[1] = 0x10; // SP high
    rom[4] = 0x00; rom[5] = 0x00; rom[6] = 0x01; rom[7] = 0x00; // PC = 0x100
    bus.loadProgramRom(rom);
    expect(bus.read8(0x000000)).toBe(0x00);
    expect(bus.read8(0x000001)).toBe(0x10);
    expect(bus.read16(0x000006)).toBe(0x0100);
  });

  it('I/O ports default to 0xFF (buttons released)', () => {
    const bus = new Bus();
    expect(bus.read8(0x800000)).toBe(0xFF);
    expect(bus.read8(0x800001)).toBe(0xFF);
  });

  it('CPS-B registers default to 0xFF', () => {
    const bus = new Bus();
    expect(bus.read8(0x800140)).toBe(0xFF);
    expect(bus.read8(0x80017F)).toBe(0xFF);
  });

  it('setCpsBId writes correct ID', () => {
    const bus = new Bus();
    bus.setCpsBId(0x32, 0x0401);
    expect(bus.read8(0x800172)).toBe(0x04); // high byte
    expect(bus.read8(0x800173)).toBe(0x01); // low byte
  });

  it('sound latch callback fires on odd-address write', () => {
    const bus = new Bus();
    let received = -1;
    bus.setSoundLatchCallback((v) => { received = v; });
    // The 68000 writes a word to 0x800180; the callback fires on the low byte (odd address)
    bus.write8(0x800181, 0x55);
    expect(received).toBe(0x55);
  });

  it('sound latch callback does NOT fire on even-address write', () => {
    const bus = new Bus();
    let received = -1;
    bus.setSoundLatchCallback((v) => { received = v; });
    bus.write8(0x800180, 0x55);
    expect(received).toBe(-1); // callback not triggered
  });

  it('returns 0xFF for unmapped reads (open bus)', () => {
    const bus = new Bus();
    expect(bus.read8(0x400000)).toBe(0xFF);
  });
});

// ---------------------------------------------------------------------------
// CPS-B multiplication hardware
// ---------------------------------------------------------------------------

describe('CPS-B multiplication', () => {
  function writeWord(bus: Bus, addr: number, value: number) {
    bus.write8(addr, (value >> 8) & 0xFF);
    bus.write8(addr + 1, value & 0xFF);
  }

  function readResult(bus: Bus): { lo: number; hi: number } {
    const lo = (bus.read8(0x800144) << 8) | bus.read8(0x800145);
    const hi = (bus.read8(0x800146) << 8) | bus.read8(0x800147);
    return { lo, hi };
  }

  it('multiplies 1 × 1 = 1', () => {
    const bus = new Bus();
    writeWord(bus, 0x800140, 1); // factor1
    writeWord(bus, 0x800142, 1); // factor2
    const { lo, hi } = readResult(bus);
    expect(hi).toBe(0);
    expect(lo).toBe(1);
  });

  it('multiplies 0 × 0xFFFF = 0', () => {
    const bus = new Bus();
    writeWord(bus, 0x800140, 0);
    writeWord(bus, 0x800142, 0xFFFF);
    const { lo, hi } = readResult(bus);
    expect(hi).toBe(0);
    expect(lo).toBe(0);
  });

  it('multiplies 0xFFFF × 0xFFFF = 0xFFFE0001', () => {
    const bus = new Bus();
    writeWord(bus, 0x800140, 0xFFFF);
    writeWord(bus, 0x800142, 0xFFFF);
    const { lo, hi } = readResult(bus);
    expect(hi).toBe(0xFFFE);
    expect(lo).toBe(0x0001);
  });

  it('multiplies 100 × 200 = 20000', () => {
    const bus = new Bus();
    writeWord(bus, 0x800140, 100);
    writeWord(bus, 0x800142, 200);
    const { lo, hi } = readResult(bus);
    expect(hi).toBe(0);
    expect(lo).toBe(20000);
  });

  it('recomputes when factor1 changes', () => {
    const bus = new Bus();
    writeWord(bus, 0x800140, 10);
    writeWord(bus, 0x800142, 5);
    expect(readResult(bus).lo).toBe(50);

    // Change factor1 only
    writeWord(bus, 0x800140, 20);
    expect(readResult(bus).lo).toBe(100);
  });
});
