import { describe, it, expect } from 'vitest';
import {
  parseSoundDriver,
  readPatch,
  writePatch,
  patchToRegisters,
  VOICE_SIZE,
  type FmPatch,
  type FmOperator,
  type SoundDriverInfo,
} from '../audio/cps1-sound-driver';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTestOperator(seed: number): FmOperator {
  return {
    dt1:   (seed + 1) % 8,
    mul:   (seed + 2) % 16,
    tl:    (seed * 7 + 3) % 128,
    ks:    seed % 4,
    ar:    (seed * 3 + 1) % 32,
    amsEn: seed % 2,
    d1r:   (seed * 5 + 2) % 32,
    dt2:   seed % 4,
    d2r:   (seed * 2 + 1) % 32,
    d1l:   (seed + 3) % 16,
    rr:    (seed + 1) % 16,
  };
}

function makeFmPatch(algo: number, fb: number, seed: number): FmPatch {
  return {
    algorithm: algo % 8,
    feedback: fb % 8,
    lfoEnable: false,
    lfoWaveform: 0,
    lfoFreq: 0,
    pmd: 0,
    amd: 0,
    pmsAms: 0,
    operators: [
      makeTestOperator(seed),
      makeTestOperator(seed + 10),
      makeTestOperator(seed + 20),
      makeTestOperator(seed + 30),
    ],
  };
}

/**
 * Build a 40-byte voice in ROM at a given offset matching the CPS1 driver v4 layout.
 */
function writeVoiceToRom(rom: Uint8Array, off: number, patch: FmPatch): void {
  // Byte 0: flags (unused)
  rom[off] = 0;
  // Byte 1: LFO flags
  rom[off + 1] = (patch.lfoEnable ? 0x80 : 0) | ((patch.lfoWaveform & 3) << 5);
  // Byte 2-4: LFO freq, PMD, AMD
  rom[off + 2] = patch.lfoFreq;
  rom[off + 3] = patch.pmd;
  rom[off + 4] = patch.amd;
  // Byte 5: ALG/FB
  rom[off + 5] = (patch.feedback << 3) | patch.algorithm;
  // Byte 6: PMS/AMS
  rom[off + 6] = patch.pmsAms;
  // Bytes 7-10: TL for 4 ops
  for (let i = 0; i < 4; i++) {
    rom[off + 7 + i] = patch.operators[i]!.tl & 0x7F;
  }
  // Bytes 11-19: misc (zero)
  for (let i = 11; i < 20; i++) rom[off + i] = 0;
  // Bytes 20-23: DT1/MUL
  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i]!;
    rom[off + 20 + i] = (op.dt1 << 4) | op.mul;
  }
  // Bytes 24-27: KS/AR
  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i]!;
    rom[off + 24 + i] = (op.ks << 6) | op.ar;
  }
  // Bytes 28-31: AMS-EN/D1R
  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i]!;
    rom[off + 28 + i] = (op.amsEn << 7) | op.d1r;
  }
  // Bytes 32-35: DT2/D2R
  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i]!;
    rom[off + 32 + i] = (op.dt2 << 6) | op.d2r;
  }
  // Bytes 36-39: D1L/RR
  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i]!;
    rom[off + 36 + i] = (op.d1l << 4) | op.rr;
  }
}

/** Build a test ROM with voices at a given offset. Also sets the BE pointer at 0x1102. */
function buildTestRom(size: number, voiceOffset: number, patches: FmPatch[]): Uint8Array {
  const rom = new Uint8Array(size);
  rom.fill(0xFF); // Fill with invalid data

  // Write the base pointer at 0x1102 (big-endian)
  if (size > 0x1103) {
    rom[0x1102] = (voiceOffset >> 8) & 0xFF;
    rom[0x1103] = voiceOffset & 0xFF;
  }

  for (let i = 0; i < patches.length; i++) {
    writeVoiceToRom(rom, voiceOffset + i * VOICE_SIZE, patches[i]!);
  }
  return rom;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseSoundDriver', () => {
  it('finds voices via base pointer at 0x1102', () => {
    const patches = Array.from({ length: 10 }, (_, i) => makeFmPatch(i, i, i * 5));
    const rom = buildTestRom(0x8000, 0x2000, patches);

    const info = parseSoundDriver(rom);

    expect(info.patchTableOffset).toBe(0x2000);
    expect(info.patchCount).toBe(10);
    expect(info.patchSize).toBe(VOICE_SIZE);
  });

  it('finds voices via fallback scan when no pointer', () => {
    const patches = Array.from({ length: 8 }, (_, i) => makeFmPatch(i, i + 1, i * 3));
    const rom = new Uint8Array(0x8000);
    rom.fill(0xFF);
    // Don't set the pointer at 0x1102 — force fallback
    for (let i = 0; i < patches.length; i++) {
      writeVoiceToRom(rom, 0x3000 + i * VOICE_SIZE, patches[i]!);
    }

    const info = parseSoundDriver(rom);

    expect(info.patchTableOffset).toBe(0x3000);
    expect(info.patchCount).toBe(8);
  });

  it('throws when no voices found', () => {
    const rom = new Uint8Array(0x8000);
    rom.fill(0xFF);
    expect(() => parseSoundDriver(rom)).toThrow('Could not find FM voice table');
  });

  it('throws when fewer than 4 voices', () => {
    const patches = Array.from({ length: 3 }, (_, i) => makeFmPatch(i, i, i));
    const rom = buildTestRom(0x8000, 0x2000, patches);
    // Corrupt the pointer so it doesn't find via pointer path
    rom[0x1102] = 0xFF;
    rom[0x1103] = 0xFF;
    expect(() => parseSoundDriver(rom)).toThrow('Could not find FM voice table');
  });

  it('ignores all-zero blocks', () => {
    const rom = new Uint8Array(0x8000);
    rom.fill(0x00);
    expect(() => parseSoundDriver(rom)).toThrow('Could not find FM voice table');
  });
});

describe('readPatch', () => {
  it('reads voice correctly', () => {
    const patch = makeFmPatch(4, 5, 42);
    const rom = buildTestRom(0x8000, 0x2000, [patch]);
    const info: SoundDriverInfo = {
      patchTableOffset: 0x2000,
      patchCount: 1,
      patchSize: VOICE_SIZE,
    };

    const result = readPatch(rom, info, 0);

    expect(result.algorithm).toBe(patch.algorithm);
    expect(result.feedback).toBe(patch.feedback);
    expect(result.lfoEnable).toBe(patch.lfoEnable);
    for (let i = 0; i < 4; i++) {
      expect(result.operators[i]).toEqual(patch.operators[i]);
    }
  });

  it('reads LFO parameters', () => {
    const patch = makeFmPatch(2, 3, 0);
    patch.lfoEnable = true;
    patch.lfoWaveform = 2;
    patch.lfoFreq = 100;
    patch.pmd = 50;
    patch.amd = 30;
    patch.pmsAms = 0x35;

    const rom = buildTestRom(0x8000, 0x2000, [patch]);
    const info: SoundDriverInfo = { patchTableOffset: 0x2000, patchCount: 1, patchSize: VOICE_SIZE };

    const result = readPatch(rom, info, 0);

    expect(result.lfoEnable).toBe(true);
    expect(result.lfoWaveform).toBe(2);
    expect(result.lfoFreq).toBe(100);
    expect(result.pmd).toBe(50);
    expect(result.amd).toBe(30);
    expect(result.pmsAms).toBe(0x35);
  });

  it('returns valid ranges for all fields', () => {
    const patches = Array.from({ length: 8 }, (_, i) => makeFmPatch(i, i, i * 17));
    const rom = buildTestRom(0x8000, 0x2000, patches);
    const info: SoundDriverInfo = { patchTableOffset: 0x2000, patchCount: 8, patchSize: VOICE_SIZE };

    for (let p = 0; p < 8; p++) {
      const result = readPatch(rom, info, p);
      expect(result.algorithm).toBeGreaterThanOrEqual(0);
      expect(result.algorithm).toBeLessThanOrEqual(7);
      expect(result.feedback).toBeGreaterThanOrEqual(0);
      expect(result.feedback).toBeLessThanOrEqual(7);

      for (const op of result.operators) {
        expect(op.dt1).toBeGreaterThanOrEqual(0);
        expect(op.dt1).toBeLessThanOrEqual(7);
        expect(op.mul).toBeGreaterThanOrEqual(0);
        expect(op.mul).toBeLessThanOrEqual(15);
        expect(op.tl).toBeGreaterThanOrEqual(0);
        expect(op.tl).toBeLessThanOrEqual(127);
        expect(op.ks).toBeGreaterThanOrEqual(0);
        expect(op.ks).toBeLessThanOrEqual(3);
        expect(op.ar).toBeGreaterThanOrEqual(0);
        expect(op.ar).toBeLessThanOrEqual(31);
        expect(op.amsEn).toBeGreaterThanOrEqual(0);
        expect(op.amsEn).toBeLessThanOrEqual(1);
        expect(op.d1r).toBeGreaterThanOrEqual(0);
        expect(op.d1r).toBeLessThanOrEqual(31);
        expect(op.dt2).toBeGreaterThanOrEqual(0);
        expect(op.dt2).toBeLessThanOrEqual(3);
        expect(op.d2r).toBeGreaterThanOrEqual(0);
        expect(op.d2r).toBeLessThanOrEqual(31);
        expect(op.d1l).toBeGreaterThanOrEqual(0);
        expect(op.d1l).toBeLessThanOrEqual(15);
        expect(op.rr).toBeGreaterThanOrEqual(0);
        expect(op.rr).toBeLessThanOrEqual(15);
      }
    }
  });

  it('throws on out-of-range index', () => {
    const info: SoundDriverInfo = { patchTableOffset: 0, patchCount: 5, patchSize: VOICE_SIZE };
    const rom = new Uint8Array(0x1000);
    expect(() => readPatch(rom, info, -1)).toThrow(RangeError);
    expect(() => readPatch(rom, info, 5)).toThrow(RangeError);
  });
});

describe('writePatch + readPatch roundtrip', () => {
  it('roundtrip is identity', () => {
    const patches = Array.from({ length: 6 }, (_, i) => makeFmPatch(i, (i * 3) % 8, i * 11));
    const rom = buildTestRom(0x8000, 0x2000, patches);
    const info: SoundDriverInfo = { patchTableOffset: 0x2000, patchCount: 6, patchSize: VOICE_SIZE };

    for (let i = 0; i < 6; i++) {
      const original = readPatch(rom, info, i);
      writePatch(rom, info, i, original);
      const after = readPatch(rom, info, i);
      expect(after).toEqual(original);
    }
  });

  it('modified patch persists after write', () => {
    const patch = makeFmPatch(2, 4, 7);
    const rom = buildTestRom(0x8000, 0x2000, [patch]);
    const info: SoundDriverInfo = { patchTableOffset: 0x2000, patchCount: 1, patchSize: VOICE_SIZE };

    const modified = readPatch(rom, info, 0);
    modified.algorithm = 7;
    modified.feedback = 6;
    modified.operators[0].tl = 100;
    modified.operators[2].ar = 31;
    modified.operators[3].d1l = 15;
    modified.lfoEnable = true;
    modified.lfoFreq = 200;
    writePatch(rom, info, 0, modified);

    const result = readPatch(rom, info, 0);
    expect(result.algorithm).toBe(7);
    expect(result.feedback).toBe(6);
    expect(result.operators[0].tl).toBe(100);
    expect(result.operators[2].ar).toBe(31);
    expect(result.operators[3].d1l).toBe(15);
    expect(result.lfoEnable).toBe(true);
    expect(result.lfoFreq).toBe(200);
  });
});

describe('patchToRegisters', () => {
  it('generates correct register writes', () => {
    const patch = makeFmPatch(4, 5, 0);
    const writes = patchToRegisters(patch, 0);

    // 1 ALG/FB + 1 PMS/AMS + 4 ops * 6 params = 26 writes (no LFO since lfoEnable=false)
    expect(writes).toHaveLength(26);
  });

  it('includes LFO writes when enabled', () => {
    const patch = makeFmPatch(0, 0, 0);
    patch.lfoEnable = true;
    patch.lfoFreq = 50;
    patch.pmd = 20;
    patch.amd = 10;
    patch.lfoWaveform = 1;

    const writes = patchToRegisters(patch, 0);
    // 26 + 4 LFO writes = 30
    expect(writes).toHaveLength(30);

    const lfoWrites = writes.filter(w => w.register === 0x18 || w.register === 0x19 || w.register === 0x1B);
    expect(lfoWrites).toHaveLength(4);
  });

  it('first write is ALG/FB with RL bits', () => {
    const patch = makeFmPatch(3, 5, 0);
    const writes = patchToRegisters(patch, 0);
    expect(writes[0]).toEqual({
      register: 0x20,
      value: 0xC0 | (5 << 3) | 3,
    });
  });

  it('uses correct channel offset for operator registers', () => {
    const patch = makeFmPatch(0, 0, 0);
    const writes = patchToRegisters(patch, 3);

    // After ALG/FB (0x23) and PMS/AMS (0x3B):
    // OP1 DT1/MUL at 0x40 + 3 = 0x43
    expect(writes[2]!.register).toBe(0x43);
    // OP1 TL at 0x60 + 3 = 0x63
    expect(writes[3]!.register).toBe(0x63);
    // OP2 DT1/MUL at 0x40 + 3 + 8 = 0x4B
    expect(writes[8]!.register).toBe(0x4B);
  });

  it('encodes operator values correctly', () => {
    const op: FmOperator = {
      dt1: 3, mul: 7, tl: 42, ks: 2, ar: 28,
      amsEn: 1, d1r: 15, dt2: 1, d2r: 10, d1l: 9, rr: 12,
    };
    const patch: FmPatch = {
      algorithm: 5, feedback: 6,
      lfoEnable: false, lfoWaveform: 0, lfoFreq: 0, pmd: 0, amd: 0, pmsAms: 0,
      operators: [op, op, op, op],
    };

    const writes = patchToRegisters(patch, 0);
    // OP1 values start at index 2 (after ALG/FB and PMS/AMS)
    expect(writes[2]!.value).toBe((3 << 4) | 7);      // DT1/MUL
    expect(writes[3]!.value).toBe(42);                  // TL
    expect(writes[4]!.value).toBe((2 << 6) | 28);      // KS/AR
    expect(writes[5]!.value).toBe((1 << 7) | 15);      // AMS-EN/D1R
    expect(writes[6]!.value).toBe((1 << 6) | 10);      // DT2/D2R
    expect(writes[7]!.value).toBe((9 << 4) | 12);      // D1L/RR
  });
});

describe('full integration', () => {
  it('parse → read → modify → write → read roundtrip', () => {
    const patches = Array.from({ length: 12 }, (_, i) =>
      makeFmPatch(i % 8, (i * 2 + 1) % 8, i * 7 + 3),
    );
    const rom = buildTestRom(0x8000, 0x2000, patches);

    const info = parseSoundDriver(rom);
    expect(info.patchCount).toBe(12);

    for (let i = 0; i < 12; i++) {
      const read = readPatch(rom, info, i);
      expect(read.algorithm).toBe(patches[i]!.algorithm);
      expect(read.feedback).toBe(patches[i]!.feedback);
      for (let op = 0; op < 4; op++) {
        expect(read.operators[op]).toEqual(patches[i]!.operators[op]);
      }
    }

    // Modify and verify
    const modified = readPatch(rom, info, 5);
    modified.algorithm = 0;
    modified.feedback = 7;
    modified.operators[1].tl = 127;
    writePatch(rom, info, 5, modified);

    const verify = readPatch(rom, info, 5);
    expect(verify.algorithm).toBe(0);
    expect(verify.feedback).toBe(7);
    expect(verify.operators[1].tl).toBe(127);

    // Other patches unaffected
    const unchanged = readPatch(rom, info, 4);
    expect(unchanged.algorithm).toBe(patches[4]!.algorithm);
    expect(unchanged.feedback).toBe(patches[4]!.feedback);
  });
});
