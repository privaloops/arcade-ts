import { describe, it, expect } from 'vitest';
import { Z80BusQSound } from '../memory/z80-bus-qsound';

describe('Z80BusQSound', () => {
  // ── Fixed ROM access ──────────────────────────────────────────────────

  it('reads fixed ROM at 0x0000-0x7FFF', () => {
    const bus = new Z80BusQSound();
    const rom = new Uint8Array(0x20000);
    rom[0] = 0x42;
    rom[0x7FFF] = 0xAB;
    bus.loadAudioRom(rom);

    expect(bus.read(0x0000)).toBe(0x42);
    expect(bus.read(0x7FFF)).toBe(0xAB);
  });

  it('returns 0xFF for fixed ROM reads beyond ROM size', () => {
    const bus = new Z80BusQSound();
    bus.loadAudioRom(new Uint8Array(0x100));
    expect(bus.read(0x200)).toBe(0xFF);
  });

  // ── Banked ROM access ─────────────────────────────────────────────────

  it('reads banked ROM at 0x8000-0xBFFF (default bank 0)', () => {
    const bus = new Z80BusQSound();
    const rom = new Uint8Array(0x20000);
    // Bank 0 starts at ROM offset 0x10000
    rom[0x10000] = 0x11;
    rom[0x13FFF] = 0x22;
    bus.loadAudioRom(rom);

    expect(bus.read(0x8000)).toBe(0x11);
    expect(bus.read(0xBFFF)).toBe(0x22);
  });

  it('bank switch via write to 0xD003', () => {
    const bus = new Z80BusQSound();
    const rom = new Uint8Array(0x20000);
    // Bank 0: ROM[0x10000], Bank 1: ROM[0x14000]
    rom[0x10000] = 0xAA;
    rom[0x14000] = 0xBB;
    bus.loadAudioRom(rom);

    expect(bus.read(0x8000)).toBe(0xAA);

    bus.write(0xD003, 1);
    expect(bus.read(0x8000)).toBe(0xBB);
  });

  it('bank switch wraps around available banks', () => {
    const bus = new Z80BusQSound();
    // 0x10000 + 2*0x4000 = 0x18000 → 2 banks
    const rom = new Uint8Array(0x18000);
    rom[0x10000] = 0x11; // bank 0
    rom[0x14000] = 0x22; // bank 1
    bus.loadAudioRom(rom);

    // Bank 2 should wrap to bank 0 (2 % 2 = 0)
    bus.write(0xD003, 2);
    expect(bus.read(0x8000)).toBe(0x11);
  });

  // ── Shared RAM 1 (0xC000-0xCFFF) ─────────────────────────────────────

  it('reads/writes shared RAM 1 at 0xC000-0xCFFF', () => {
    const bus = new Z80BusQSound();
    bus.write(0xC000, 0x42);
    expect(bus.read(0xC000)).toBe(0x42);

    bus.write(0xCFFF, 0xAB);
    expect(bus.read(0xCFFF)).toBe(0xAB);
  });

  it('shared RAM 1 is accessible via getSharedRam1()', () => {
    const bus = new Z80BusQSound();
    bus.write(0xC005, 0x77);
    expect(bus.getSharedRam1()[5]).toBe(0x77);
  });

  // ── Shared RAM 2 (0xF000-0xFFFF) ─────────────────────────────────────

  it('reads/writes shared RAM 2 at 0xF000-0xFFFF', () => {
    const bus = new Z80BusQSound();
    bus.write(0xF000, 0x12);
    expect(bus.read(0xF000)).toBe(0x12);

    bus.write(0xFFFF, 0x34);
    expect(bus.read(0xFFFF)).toBe(0x34);
  });

  it('shared RAM 2 is accessible via getSharedRam2()', () => {
    const bus = new Z80BusQSound();
    bus.write(0xF010, 0x55);
    expect(bus.getSharedRam2()[0x10]).toBe(0x55);
  });

  // ── QSound DSP I/O ────────────────────────────────────────────────────

  it('QSound read at 0xD007 returns 0x80 (always ready)', () => {
    const bus = new Z80BusQSound();
    expect(bus.read(0xD007)).toBe(0x80);
  });

  it('QSound write at 0xD000-0xD002 triggers callback', () => {
    const bus = new Z80BusQSound();
    const writes: Array<{ offset: number; data: number }> = [];
    bus.setQsoundWriteCallback((offset, data) => writes.push({ offset, data }));

    bus.write(0xD000, 0x42); // data_hi
    bus.write(0xD001, 0x13); // data_lo
    bus.write(0xD002, 0x07); // command

    expect(writes).toEqual([
      { offset: 0, data: 0x42 },
      { offset: 1, data: 0x13 },
      { offset: 2, data: 0x07 },
    ]);
  });

  // ── Unmapped / ROM area ───────────────────────────────────────────────

  it('reads from unmapped addresses return 0xFF', () => {
    const bus = new Z80BusQSound();
    // 0xD004 is not QSound read (only 0xD007), not shared RAM
    expect(bus.read(0xD004)).toBe(0xFF);
    expect(bus.read(0xE000)).toBe(0xFF);
  });

  it('writes to ROM area (0x0000-0xBFFF) are ignored', () => {
    const bus = new Z80BusQSound();
    const rom = new Uint8Array(0x20000);
    rom[0] = 0x42;
    bus.loadAudioRom(rom);

    bus.write(0x0000, 0xFF);
    expect(bus.read(0x0000)).toBe(0x42);
  });

  // ── Kabuki opcode ROM ─────────────────────────────────────────────────

  it('readOpcode uses opcode ROM for 0x0000-0x7FFF', () => {
    const bus = new Z80BusQSound();
    const dataRom = new Uint8Array(0x20000);
    const opcodeRom = new Uint8Array(0x8000);
    dataRom[0x100] = 0xAA;
    opcodeRom[0x100] = 0xBB;
    bus.loadAudioRom(dataRom);
    bus.loadOpcodeRom(opcodeRom);

    expect(bus.read(0x100)).toBe(0xAA);        // data read
    expect(bus.readOpcode(0x100)).toBe(0xBB);  // opcode read
  });

  it('readOpcode falls back to read() for banked area', () => {
    const bus = new Z80BusQSound();
    const rom = new Uint8Array(0x20000);
    rom[0x10000] = 0x55;
    bus.loadAudioRom(rom);
    bus.loadOpcodeRom(new Uint8Array(0x8000));

    expect(bus.readOpcode(0x8000)).toBe(0x55);
  });

  // ── I/O ports ─────────────────────────────────────────────────────────

  it('I/O reads return 0xFF', () => {
    const bus = new Z80BusQSound();
    expect(bus.ioRead(0x00)).toBe(0xFF);
    expect(bus.ioRead(0xFF)).toBe(0xFF);
  });

  // ── Misc ──────────────────────────────────────────────────────────────

  it('getWorkRam returns sharedRam1', () => {
    const bus = new Z80BusQSound();
    bus.write(0xC000, 0x99);
    expect(bus.getWorkRam()[0]).toBe(0x99);
    expect(bus.getWorkRam()).toBe(bus.getSharedRam1());
  });

  it('values are masked to 8 bits on write', () => {
    const bus = new Z80BusQSound();
    bus.write(0xC000, 0x1FF);
    expect(bus.read(0xC000)).toBe(0xFF);
  });

  it('address wraps to 16 bits', () => {
    const bus = new Z80BusQSound();
    bus.write(0x1C000, 0x42); // should wrap to 0xC000
    expect(bus.read(0xC000)).toBe(0x42);
  });
});
