import { describe, it, expect } from 'vitest';
import { decodeKabuki, KABUKI_KEYS } from '../memory/kabuki';

describe('Kabuki Z80 encryption decoder', () => {
  it('returns null for unknown game name', () => {
    const rom = new Uint8Array(0x8000);
    expect(decodeKabuki(rom, 'unknown_game')).toBeNull();
  });

  it('returns opcode ROM for known game (dino)', () => {
    const rom = new Uint8Array(0x10000);
    // Fill first 32KB with deterministic pattern
    for (let i = 0; i < 0x8000; i++) {
      rom[i] = i & 0xFF;
    }
    const original = new Uint8Array(rom);
    const opcodeRom = decodeKabuki(rom, 'dino');

    expect(opcodeRom).not.toBeNull();
    expect(opcodeRom!.length).toBe(rom.length);

    // Opcode ROM should differ from original in the first 32KB (encrypted data is transformed)
    let opDiffers = false;
    for (let i = 0; i < 0x8000; i++) {
      if (opcodeRom![i] !== original[i]) { opDiffers = true; break; }
    }
    expect(opDiffers).toBe(true);

    // Data ROM (modified in-place) should also differ from original
    let dataDiffers = false;
    for (let i = 0; i < 0x8000; i++) {
      if (rom[i] !== original[i]) { dataDiffers = true; break; }
    }
    expect(dataDiffers).toBe(true);
  });

  it('does not modify bytes beyond 32KB', () => {
    const rom = new Uint8Array(0x10000);
    for (let i = 0; i < rom.length; i++) rom[i] = i & 0xFF;
    const bankedCopy = new Uint8Array(rom.subarray(0x8000));

    const opcodeRom = decodeKabuki(rom, 'punisher');
    expect(opcodeRom).not.toBeNull();

    // Banked area (0x8000+) should be identical in both opcode and data ROMs
    for (let i = 0; i < bankedCopy.length; i++) {
      expect(rom[0x8000 + i]).toBe(bankedCopy[i]);
      expect(opcodeRom![0x8000 + i]).toBe(bankedCopy[i]);
    }
  });

  it('opcode and data decoding produce different results', () => {
    const rom = new Uint8Array(0x8000);
    for (let i = 0; i < 0x8000; i++) rom[i] = (i * 7) & 0xFF;
    const dataCopy = new Uint8Array(rom);

    const opcodeRom = decodeKabuki(rom, 'wof');
    expect(opcodeRom).not.toBeNull();

    // Opcode and data decodings should differ (different select formulas)
    let differs = false;
    for (let i = 0; i < 0x8000; i++) {
      if (opcodeRom![i] !== rom[i]) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('all known game keys are defined', () => {
    const expectedGames = ['dino', 'punisher', 'wof', 'slammast', 'mbombrd', 'mbomberj', 'wofch'];
    for (const name of expectedGames) {
      expect(KABUKI_KEYS[name]).toBeDefined();
    }
  });

  it('decoding is deterministic', () => {
    const rom1 = new Uint8Array(0x8000);
    const rom2 = new Uint8Array(0x8000);
    for (let i = 0; i < 0x8000; i++) {
      rom1[i] = (i * 13) & 0xFF;
      rom2[i] = (i * 13) & 0xFF;
    }
    const op1 = decodeKabuki(rom1, 'slammast')!;
    const op2 = decodeKabuki(rom2, 'slammast')!;

    for (let i = 0; i < 0x8000; i++) {
      expect(op1[i]).toBe(op2[i]);
      expect(rom1[i]).toBe(rom2[i]);
    }
  });
});
