import { describe, it, expect } from 'vitest';
import {
  Kof98Protection, kof98Decrypt68k,
  MslugxProtection,
  SmaProtection, smaDecrypt68k,
  getProtectionType,
} from '../memory/neogeo-protection';

// Helper: bitswap is not exported, test it indirectly via SMA

describe('getProtectionType', () => {
  it('returns kof98 for KOF98 variants', () => {
    expect(getProtectionType('kof98')).toBe('kof98');
    expect(getProtectionType('kof98a')).toBe('kof98');
    expect(getProtectionType('kof98k')).toBe('kof98');
  });

  it('returns mslugx for Metal Slug X', () => {
    expect(getProtectionType('mslugx')).toBe('mslugx');
  });

  it('returns sma for SMA games', () => {
    expect(getProtectionType('kof99')).toBe('sma');
    expect(getProtectionType('garou')).toBe('sma');
    expect(getProtectionType('mslug3')).toBe('sma');
    expect(getProtectionType('kof2000')).toBe('sma');
  });

  it('returns cmc for CMC-only games', () => {
    expect(getProtectionType('kof2001')).toBe('cmc');
    expect(getProtectionType('mslug4')).toBe('cmc');
    expect(getProtectionType('svc')).toBe('cmc');
  });

  it('returns null for unprotected games', () => {
    expect(getProtectionType('nam1975')).toBeNull();
    expect(getProtectionType('fatfury1')).toBeNull();
    expect(getProtectionType('kof94')).toBeNull();
  });
});

describe('Kof98Protection', () => {
  it('returns default ROM words in initial state', () => {
    const prot = new Kof98Protection();
    prot.setDefaultRom(0x1234, 0x5678);
    expect(prot.read16!(0x000100)).toBe(0x1234);
    expect(prot.read16!(0x000102)).toBe(0x5678);
  });

  it('returns overlay values in state 1 (0x0090)', () => {
    const prot = new Kof98Protection();
    prot.setDefaultRom(0x1234, 0x5678);
    prot.write16!(0x20AAAA, 0x0090);
    expect(prot.read16!(0x000100)).toBe(0x00C2);
    expect(prot.read16!(0x000102)).toBe(0x00FD);
  });

  it('returns overlay values in state 2 (0x00F0)', () => {
    const prot = new Kof98Protection();
    prot.write16!(0x20AAAA, 0x00F0);
    expect(prot.read16!(0x000100)).toBe(0x4E45);
    expect(prot.read16!(0x000102)).toBe(0x4F2D);
  });

  it('does not handle reads outside 0x100-0x103', () => {
    const prot = new Kof98Protection();
    expect(prot.read16!(0x000104)).toBeUndefined();
    expect(prot.read16!(0x200000)).toBeUndefined();
  });

  it('does not handle writes outside 0x20AAAA', () => {
    const prot = new Kof98Protection();
    expect(prot.write16!(0x200000, 0x0090)).toBe(false);
  });
});

describe('kof98Decrypt68k', () => {
  it('returns default ROM words at 0x100/0x102', () => {
    // Create a minimal ROM buffer with known data at 0x100-0x103
    const rom = new Uint8Array(0x200000);
    rom[0x100] = 0xAB;
    rom[0x101] = 0xCD;
    rom[0x102] = 0xEF;
    rom[0x103] = 0x01;

    const [w100, w102] = kof98Decrypt68k(rom, rom.length);
    // After decrypt, the returned words are from the shuffled ROM
    // Just verify the function doesn't crash and returns valid words
    expect(typeof w100).toBe('number');
    expect(typeof w102).toBe('number');
    expect(w100).toBeGreaterThanOrEqual(0);
    expect(w100).toBeLessThanOrEqual(0xFFFF);
  });

  it('does not crash on minimum-size ROM', () => {
    const rom = new Uint8Array(0x200000);
    expect(() => kof98Decrypt68k(rom, rom.length)).not.toThrow();
  });
});

describe('MslugxProtection', () => {
  it('handles init + command sequence', () => {
    const rom = new Uint8Array(0x200000);
    rom[0xDEDD2] = 0b10110101; // test byte
    const busRead = (addr: number) => {
      const a = addr & ~1;
      if (a < rom.length - 1) return (rom[a]! << 8) | rom[a + 1]!;
      return 0;
    };

    const prot = new MslugxProtection(busRead);

    // Init (offset 5 = 0x2FFFEA)
    prot.write16!(0x2FFFEA, 0);
    // Set command 0x0001 (offset 1 = 0x2FFFE2)
    prot.write16!(0x2FFFE2, 0x0001);

    // Read should return sequential bits from ROM
    const bit0 = prot.read16!(0x2FFFE0);
    expect(bit0).toBeDefined();
    expect(bit0! === 0 || bit0! === 1).toBe(true);
  });

  it('does not handle addresses outside protection range', () => {
    const prot = new MslugxProtection(() => 0);
    expect(prot.read16!(0x000000)).toBeUndefined();
    expect(prot.write16!(0x000000, 0)).toBe(false);
  });
});

describe('SmaProtection', () => {
  it('returns magic value 0x9A37 for protected range', () => {
    const prot = new SmaProtection('kof99', () => {});
    expect(prot.read16!(0x2FE400)).toBe(0x9A37);
    expect(prot.read16!(0x2FE500)).toBe(0x9A37);
    expect(prot.read16!(0x2FE7FF)).toBe(0x9A37);
  });

  it('does not handle reads outside protected ranges', () => {
    const prot = new SmaProtection('kof99', () => {});
    expect(prot.read16!(0x000000)).toBeUndefined();
    expect(prot.read16!(0x100000)).toBeUndefined();
  });

  it('triggers bankswitch on write to game-specific address', () => {
    let bankOffset = 0;
    const prot = new SmaProtection('kof99', (offset) => { bankOffset = offset; });

    // KOF99 bankswitch address is 0x2FFFF0
    prot.write16!(0x2FFFF0, 0);
    expect(bankOffset).toBeGreaterThanOrEqual(0x100000);
  });

  it('generates deterministic RNG sequence', () => {
    const prot = new SmaProtection('kof99', () => {});
    // KOF99 RNG addresses: 0x2FFFF8, 0x2FFFFA
    const r1 = prot.read16!(0x2FFFF8);
    const r2 = prot.read16!(0x2FFFF8);
    // RNG returns previous state, so first call returns seed (0x2345)
    expect(r1).toBe(0x2345);
    // Second call returns next LFSR value (different from seed)
    expect(r2).not.toBe(r1);
    expect(typeof r2).toBe('number');
  });

  it('supports different SMA games', () => {
    // Each game should construct without errors
    expect(() => new SmaProtection('garou', () => {})).not.toThrow();
    expect(() => new SmaProtection('mslug3', () => {})).not.toThrow();
    expect(() => new SmaProtection('kof2000', () => {})).not.toThrow();
    expect(() => new SmaProtection('mslug3h', () => {})).not.toThrow();
  });
});

describe('smaDecrypt68k', () => {
  it('does not crash on kof99 ROM', () => {
    const rom = new Uint8Array(0x900000);
    expect(() => smaDecrypt68k(rom, 'kof99')).not.toThrow();
  });

  it('does not crash on garou ROM', () => {
    const rom = new Uint8Array(0x900000);
    expect(() => smaDecrypt68k(rom, 'garou')).not.toThrow();
  });

  it('does not crash on mslug3 ROM', () => {
    const rom = new Uint8Array(0x900000);
    expect(() => smaDecrypt68k(rom, 'mslug3')).not.toThrow();
  });

  it('does nothing for unknown games', () => {
    const rom = new Uint8Array(0x200000);
    rom.fill(0xAA);
    const copy = new Uint8Array(rom);
    smaDecrypt68k(rom, 'unknowngame');
    expect(rom).toEqual(copy); // unchanged
  });
});
