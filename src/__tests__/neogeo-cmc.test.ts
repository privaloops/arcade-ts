import { describe, it, expect } from 'vitest';
import { cmcGfxDecrypt, cmcSfixDecrypt, CMC42_KEYS, CMC50_KEYS } from '../memory/neogeo-cmc';

describe('CMC key tables', () => {
  it('CMC42 keys are valid bytes', () => {
    for (const [game, key] of Object.entries(CMC42_KEYS)) {
      expect(key, `${game} key`).toBeGreaterThanOrEqual(0x00);
      expect(key, `${game} key`).toBeLessThanOrEqual(0xFF);
    }
  });

  it('CMC50 keys are valid bytes', () => {
    for (const [game, key] of Object.entries(CMC50_KEYS)) {
      expect(key, `${game} key`).toBeGreaterThanOrEqual(0x00);
      expect(key, `${game} key`).toBeLessThanOrEqual(0xFF);
    }
  });

  it('CMC42 includes expected games', () => {
    expect(CMC42_KEYS['kof99']).toBeDefined();
    expect(CMC42_KEYS['garou']).toBeDefined();
    expect(CMC42_KEYS['mslug3']).toBeDefined();
  });

  it('CMC50 includes expected games', () => {
    expect(CMC50_KEYS['kof2000']).toBeDefined();
    expect(CMC50_KEYS['kof2002']).toBeDefined();
    expect(CMC50_KEYS['svc']).toBeDefined();
  });
});

describe('cmcGfxDecrypt', () => {
  it('does not crash on empty ROM', () => {
    const rom = new Uint8Array(0);
    expect(() => cmcGfxDecrypt(rom, 0, 0x00, false)).not.toThrow();
  });

  it('does not crash on small CMC42 ROM', () => {
    const rom = new Uint8Array(0x1000);
    rom.fill(0x55);
    expect(() => cmcGfxDecrypt(rom, rom.length, 0x00, false)).not.toThrow();
  });

  it('does not crash on small CMC50 ROM', () => {
    const rom = new Uint8Array(0x1000);
    rom.fill(0xAA);
    expect(() => cmcGfxDecrypt(rom, rom.length, 0x00, true)).not.toThrow();
  });

  it('modifies ROM data (not a no-op)', () => {
    // 16KB ROM filled with non-zero pattern
    const size = 0x4000;
    const rom = new Uint8Array(size);
    for (let i = 0; i < size; i++) rom[i] = (i * 7 + 3) & 0xFF;
    const original = new Uint8Array(rom);

    cmcGfxDecrypt(rom, size, 0x00, false);
    // At least some bytes should have changed
    let changed = 0;
    for (let i = 0; i < size; i++) {
      if (rom[i] !== original[i]) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe('cmcSfixDecrypt', () => {
  it('performs bit shuffle extraction', () => {
    // Create C-ROM with known pattern at the end
    const cRomSize = 0x100;
    const sRomSize = 0x100;
    const cRom = new Uint8Array(cRomSize);
    // Fill end of C-ROM (source for SFIX) with sequential values
    for (let i = 0; i < sRomSize; i++) {
      cRom[cRomSize - sRomSize + i] = i & 0xFF;
    }

    const sRom = new Uint8Array(sRomSize);
    cmcSfixDecrypt(cRom, cRomSize, sRom, sRomSize);

    // Verify it's not a straight copy (shuffle should reorder)
    let identical = 0;
    for (let i = 0; i < sRomSize; i++) {
      if (sRom[i] === (i & 0xFF)) identical++;
    }
    // Most bytes should be shuffled (not identical to sequential input)
    expect(identical).toBeLessThan(sRomSize / 2);
  });

  it('produces deterministic output', () => {
    const cRomSize = 0x200;
    const sRomSize = 0x80;
    const cRom = new Uint8Array(cRomSize);
    for (let i = 0; i < cRomSize; i++) cRom[i] = (i * 13 + 7) & 0xFF;

    const sRom1 = new Uint8Array(sRomSize);
    const sRom2 = new Uint8Array(sRomSize);
    cmcSfixDecrypt(cRom, cRomSize, sRom1, sRomSize);
    cmcSfixDecrypt(cRom, cRomSize, sRom2, sRomSize);

    expect(sRom1).toEqual(sRom2);
  });
});
