import { describe, it, expect } from 'vitest';
import { Z80Bus } from '../memory/z80-bus';

describe('Z80Bus', () => {
  // ── ROM access ──────────────────────────────────────────────────────────

  it('reads fixed ROM at 0x0000-0x7FFF', () => {
    const bus = new Z80Bus();
    const rom = new Uint8Array(0x18000);
    rom[0] = 0x42;
    rom[0x7FFF] = 0xAB;
    bus.loadAudioRom(rom);

    expect(bus.read(0x0000)).toBe(0x42);
    expect(bus.read(0x7FFF)).toBe(0xAB);
  });

  it('reads banked ROM at 0x8000-0xBFFF', () => {
    const bus = new Z80Bus();
    const rom = new Uint8Array(0x18000);
    // Bank 0: ROM[0x10000]
    rom[0x10000] = 0x11;
    rom[0x13FFF] = 0x22;
    // Bank 1: ROM[0x14000]
    rom[0x14000] = 0x33;
    bus.loadAudioRom(rom);

    // Default bank 0
    expect(bus.read(0x8000)).toBe(0x11);
    expect(bus.read(0xBFFF)).toBe(0x22);

    // Switch to bank 1
    bus.write(0xF004, 1);
    expect(bus.read(0x8000)).toBe(0x33);
  });

  it('returns 0xFF for ROM reads beyond ROM size', () => {
    const bus = new Z80Bus();
    bus.loadAudioRom(new Uint8Array(0x100));
    expect(bus.read(0x200)).toBe(0xFF);
  });

  // ── Work RAM ────────────────────────────────────────────────────────────

  it('reads/writes work RAM at 0xC000-0xC7FF', () => {
    const bus = new Z80Bus();
    bus.write(0xC000, 0x42);
    bus.write(0xC7FF, 0xAB);
    expect(bus.read(0xC000)).toBe(0x42);
    expect(bus.read(0xC7FF)).toBe(0xAB);
  });

  it('work RAM mirror at 0xD000-0xD7FF', () => {
    const bus = new Z80Bus();
    bus.write(0xC000, 0x99);
    expect(bus.read(0xD000)).toBe(0x99);

    bus.write(0xD100, 0x77);
    expect(bus.read(0xC100)).toBe(0x77);
  });

  it('ROM writes are ignored', () => {
    const bus = new Z80Bus();
    const rom = new Uint8Array(0x18000);
    rom[0] = 0x42;
    bus.loadAudioRom(rom);

    bus.write(0x0000, 0xFF);
    expect(bus.read(0x0000)).toBe(0x42);
  });

  // ── Sound latch ─────────────────────────────────────────────────────────

  it('sound latch returns 0xFF when empty', () => {
    const bus = new Z80Bus();
    bus.advanceSoundLatch();
    expect(bus.read(0xF008)).toBe(0xFF);
  });

  it('sound latch queues and delivers commands', () => {
    const bus = new Z80Bus();
    bus.setSoundLatch(0x42);
    bus.setSoundLatch(0x43);

    // Before advance: still 0xFF (nothing consumed yet)
    // First advance delivers first command
    bus.advanceSoundLatch();
    expect(bus.read(0xF008)).toBe(0x42);

    // Second advance delivers second command
    bus.advanceSoundLatch();
    expect(bus.read(0xF008)).toBe(0x43);

    // Third advance: queue empty → 0xFF
    bus.advanceSoundLatch();
    expect(bus.read(0xF008)).toBe(0xFF);
  });

  it('sound latch ignores 0xFF (clear command)', () => {
    const bus = new Z80Bus();
    bus.setSoundLatch(0xFF);
    bus.advanceSoundLatch();
    expect(bus.read(0xF008)).toBe(0xFF); // not queued
  });

  it('sound latch 2 works independently', () => {
    const bus = new Z80Bus();
    bus.setSoundLatch2(0xAA);
    bus.advanceSoundLatch();
    expect(bus.read(0xF00A)).toBe(0xAA);
  });

  // ── YM2151 callbacks ───────────────────────────────────────────────────

  it('YM2151 address + data write triggers callbacks', () => {
    const bus = new Z80Bus();
    let addr = -1;
    let reg = -1;
    let data = -1;

    bus.setYm2151AddressWriteCallback((v) => { addr = v; });
    bus.setYm2151WriteCallback((r, d) => { reg = r; data = d; });

    bus.write(0xF000, 0x28); // register select
    expect(addr).toBe(0x28);

    bus.write(0xF001, 0x7F); // data write
    expect(reg).toBe(0x28);
    expect(data).toBe(0x7F);
  });

  it('YM2151 status read uses callback', () => {
    const bus = new Z80Bus();
    bus.setYm2151ReadStatusCallback(() => 0x81);

    expect(bus.read(0xF000)).toBe(0x81);
    expect(bus.read(0xF001)).toBe(0x81);
  });

  // ── OKI6295 ────────────────────────────────────────────────────────────

  it('OKI write triggers callback', () => {
    const bus = new Z80Bus();
    let cmd = -1;
    bus.setOkiWriteCallback((v) => { cmd = v; });

    bus.write(0xF002, 0x78);
    expect(cmd).toBe(0x78);
  });

  it('OKI status read uses callback', () => {
    const bus = new Z80Bus();
    bus.setOkiReadStatusCallback(() => 0x0F);
    expect(bus.read(0xF002)).toBe(0x0F);
  });

  // ── Bank switching ─────────────────────────────────────────────────────

  it('bank switch wraps around numBanks', () => {
    const bus = new Z80Bus();
    // ROM with 2 banks: 0x10000-0x17FFF (2 * 0x4000)
    const rom = new Uint8Array(0x18000);
    rom[0x10000] = 0xAA; // bank 0
    rom[0x14000] = 0xBB; // bank 1
    bus.loadAudioRom(rom);

    bus.write(0xF004, 2); // should wrap to bank 0
    expect(bus.read(0x8000)).toBe(0xAA);
  });

  // ── I/O ports ──────────────────────────────────────────────────────────

  it('I/O read returns 0xFF', () => {
    const bus = new Z80Bus();
    expect(bus.ioRead(0x00)).toBe(0xFF);
    expect(bus.ioRead(0xFF)).toBe(0xFF);
  });

  // ── Unmapped ───────────────────────────────────────────────────────────

  it('unmapped addresses return 0xFF', () => {
    const bus = new Z80Bus();
    expect(bus.read(0xE000)).toBe(0xFF);
  });

  // ── getWorkRam ─────────────────────────────────────────────────────────

  it('getWorkRam returns the 2KB buffer', () => {
    const bus = new Z80Bus();
    const ram = bus.getWorkRam();
    expect(ram.length).toBe(0x800);
    ram[0] = 0x42;
    expect(bus.read(0xC000)).toBe(0x42);
  });
});
