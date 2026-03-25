/**
 * CPS1 Sound Driver — FM voice read/write utilities.
 *
 * Reverse-engineered from the CPS1 Z80 sound driver v4.x (SF2, FFight, etc.)
 *
 * Voice format = 40 bytes:
 *   Offset 0:     Reserved / voice flags
 *   Offset 1:     LFO flags (bit 7 = enable, bits 5-6 = waveform)
 *   Offset 2:     LFO frequency (reg 0x18)
 *   Offset 3:     PMD (reg 0x19 with bit 7 set)
 *   Offset 4:     AMD (reg 0x19 without bit 7)
 *   Offset 5:     FB/ALG (bits 5-3 = feedback, bits 2-0 = algorithm)
 *   Offset 6:     PMS/AMS (reg 0x38+ch)
 *   Offset 7-10:  TL for 4 operators
 *   Offset 11-19: Per-voice data (key fraction, panning, etc.)
 *   Offset 20-23: DT1/MUL for 4 operators (reg 0x40+slot)
 *   Offset 24-27: KS/AR for 4 operators  (reg 0x80+slot, skipping 0x60 TL)
 *   Offset 28-31: AMS-EN/D1R             (reg 0xA0+slot)
 *   Offset 32-35: DT2/D2R                (reg 0xC0+slot)
 *   Offset 36-39: D1L/RR                 (reg 0xE0+slot)
 *
 * The driver loads voices via: base_pointer + voice_index * 40.
 * The base pointer is stored as a big-endian 16-bit value at a known ROM offset
 * (typically 0x1102 for driver v4.x).
 *
 * Operator order follows slot offsets: +0, +8, +16, +24 (M1, C1, M2, C2).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FmOperator {
  dt1: number;    // 0-7   detune 1
  mul: number;    // 0-15  frequency multiply
  tl: number;     // 0-127 total level (0 = max volume, 127 = silent)
  ks: number;     // 0-3   key scaling
  ar: number;     // 0-31  attack rate
  amsEn: number;  // 0-1   AMS enable
  d1r: number;    // 0-31  decay 1 rate
  dt2: number;    // 0-3   detune 2
  d2r: number;    // 0-31  decay 2 rate
  d1l: number;    // 0-15  decay 1 level (sustain)
  rr: number;     // 0-15  release rate
}

export interface FmPatch {
  algorithm: number;    // 0-7
  feedback: number;     // 0-7
  operators: [FmOperator, FmOperator, FmOperator, FmOperator];
  /** LFO enable flag (bit 7 of voice byte 1) */
  lfoEnable: boolean;
  /** LFO waveform (0-3, from bits 5-6 of voice byte 1) */
  lfoWaveform: number;
  /** LFO frequency (voice byte 2) */
  lfoFreq: number;
  /** Phase modulation depth (voice byte 3) */
  pmd: number;
  /** Amplitude modulation depth (voice byte 4) */
  amd: number;
  /** PMS/AMS per-channel (voice byte 6) */
  pmsAms: number;
}

export interface SoundDriverInfo {
  patchTableOffset: number;   // offset of first voice in audioRom buffer
  patchCount: number;
  patchSize: number;          // bytes per voice (40)
}

// ── Constants ────────────────────────────────────────────────────────────────

export const VOICE_SIZE = 40;
/** @deprecated Use VOICE_SIZE instead */
export const PATCH_SIZE = VOICE_SIZE;

/** YM2151 slot offsets: OP1(M1)=+0, OP2(C1)=+8, OP3(M2)=+16, OP4(C2)=+24 */
const SLOT_OFFSETS: readonly [number, number, number, number] = [0, 8, 16, 24];

// Voice byte offsets
const OFF_FLAGS     = 0;
const OFF_LFO       = 1;
const OFF_LFO_FREQ  = 2;
const OFF_PMD       = 3;
const OFF_AMD       = 4;
const OFF_ALG_FB    = 5;
const OFF_PMS_AMS   = 6;
const OFF_TL        = 7;   // 4 bytes (7-10)
const OFF_OP_DATA   = 20;  // 20 bytes of operator register data (20-39)

/** Known base-pointer ROM offsets for different driver versions */
const BASE_PTR_OFFSETS = [0x1102, 0x1002] as const;

// ── Validation ───────────────────────────────────────────────────────────────

function validateVoice(rom: Uint8Array, off: number): boolean {
  if (off + VOICE_SIZE > rom.length) return false;

  // Byte 5: ALG/FB — bits 6-7 must be 0 (RL added at runtime via OR 0xC0)
  if ((rom[off + OFF_ALG_FB]! & 0xC0) !== 0) return false;

  // Operator data block at offset 20 (5 register groups × 4 ops = 20 bytes)
  const op = off + OFF_OP_DATA;

  // DT1/MUL (bytes 20-23): bit 7 must be 0
  for (let i = 0; i < 4; i++) {
    if ((rom[op + i]! & 0x80) !== 0) return false;
  }

  // KS/AR (bytes 24-27): bit 5 must be 0
  for (let i = 4; i < 8; i++) {
    if ((rom[op + i]! & 0x20) !== 0) return false;
  }

  // AMS-EN/D1R (bytes 28-31): bits 5-6 must be 0
  for (let i = 8; i < 12; i++) {
    if ((rom[op + i]! & 0x60) !== 0) return false;
  }

  // DT2/D2R (bytes 32-35): bit 5 must be 0
  for (let i = 12; i < 16; i++) {
    if ((rom[op + i]! & 0x20) !== 0) return false;
  }

  // D1L/RR (bytes 36-39): no bit constraint

  // Reject all-zero blocks
  let sum = 0;
  for (let i = 0; i < VOICE_SIZE; i++) sum += rom[off + i]!;
  if (sum === 0) return false;

  return true;
}

// ── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Try to find the voice table by reading the base pointer from known ROM offsets.
 * The CPS1 driver v4.x stores a BE 16-bit pointer at 0x1102.
 */
function findViaBasePointer(rom: Uint8Array): { offset: number; count: number } | null {
  for (const ptrAddr of BASE_PTR_OFFSETS) {
    if (ptrAddr + 1 >= rom.length) continue;

    // Big-endian read: H first, L second (matches the Z80 driver's LD A,(HL)/INC HL/LD L,(HL)/LD H,A)
    const base = (rom[ptrAddr]! << 8) | rom[ptrAddr + 1]!;
    if (base < 0x100 || base >= 0x8000) continue;

    // Count consecutive valid voices starting at base
    let count = 0;
    while (validateVoice(rom, base + count * VOICE_SIZE)) {
      count++;
      if (base + (count + 1) * VOICE_SIZE > 0x8000) break;
    }

    if (count >= 4) {
      return { offset: base, count };
    }
  }
  return null;
}

/** Fallback: scan for the longest run of consecutive valid 40-byte voices. */
function scanForVoices(rom: Uint8Array, start: number, end: number): { offset: number; count: number } {
  let bestOffset = -1;
  let bestCount = 0;

  let i = start;
  while (i <= end - VOICE_SIZE) {
    if (!validateVoice(rom, i)) {
      i++;
      continue;
    }

    let count = 1;
    while (validateVoice(rom, i + count * VOICE_SIZE)) {
      count++;
    }

    if (count > bestCount) {
      bestCount = count;
      bestOffset = i;
    }

    i += count * VOICE_SIZE;
  }

  return { offset: bestOffset, count: bestCount };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Scan the audio ROM to locate the FM voice table. */
export function parseSoundDriver(audioRom: Uint8Array): SoundDriverInfo {
  // 1. Try the fast path: read base pointer from known ROM offset
  const fromPtr = findViaBasePointer(audioRom);
  if (fromPtr) {
    return {
      patchTableOffset: fromPtr.offset,
      patchCount: fromPtr.count,
      patchSize: VOICE_SIZE,
    };
  }

  // 2. Fallback: brute-force scan fixed ROM and banked ROM
  const regions: Array<[number, number]> = [
    [0, Math.min(audioRom.length, 0x8000)],
  ];
  if (audioRom.length > 0x10000) {
    regions.push([0x10000, audioRom.length]);
  }

  let best = { offset: -1, count: 0 };
  for (const [start, end] of regions) {
    const result = scanForVoices(audioRom, start, end);
    if (result.count > best.count) best = result;
  }

  if (best.offset < 0 || best.count < 4) {
    throw new Error(
      'Could not find FM voice table in audio ROM — ' +
      'no region of 4+ consecutive valid voices found',
    );
  }

  return {
    patchTableOffset: best.offset,
    patchCount: best.count,
    patchSize: VOICE_SIZE,
  };
}

/** Read a single FM patch from ROM. */
export function readPatch(
  audioRom: Uint8Array,
  driverInfo: SoundDriverInfo,
  patchIndex: number,
): FmPatch {
  if (patchIndex < 0 || patchIndex >= driverInfo.patchCount) {
    throw new RangeError(`Patch index ${patchIndex} out of range [0, ${driverInfo.patchCount})`);
  }

  const off = driverInfo.patchTableOffset + patchIndex * driverInfo.patchSize;

  const algFb = audioRom[off + OFF_ALG_FB]!;
  const lfoFlags = audioRom[off + OFF_LFO]!;

  return {
    algorithm: algFb & 7,
    feedback: (algFb >> 3) & 7,
    lfoEnable: (lfoFlags & 0x80) !== 0,
    lfoWaveform: (lfoFlags >> 5) & 3,
    lfoFreq: audioRom[off + OFF_LFO_FREQ]!,
    pmd: audioRom[off + OFF_PMD]!,
    amd: audioRom[off + OFF_AMD]!,
    pmsAms: audioRom[off + OFF_PMS_AMS]!,
    operators: [
      readOperator(audioRom, off, 0),
      readOperator(audioRom, off, 1),
      readOperator(audioRom, off, 2),
      readOperator(audioRom, off, 3),
    ],
  };
}

/** Write a single FM patch back to ROM (mutates audioRom in-place). */
export function writePatch(
  audioRom: Uint8Array,
  driverInfo: SoundDriverInfo,
  patchIndex: number,
  patch: FmPatch,
): void {
  if (patchIndex < 0 || patchIndex >= driverInfo.patchCount) {
    throw new RangeError(`Patch index ${patchIndex} out of range [0, ${driverInfo.patchCount})`);
  }

  const off = driverInfo.patchTableOffset + patchIndex * driverInfo.patchSize;

  // ALG/FB
  audioRom[off + OFF_ALG_FB] = (patch.feedback << 3) | patch.algorithm;

  // LFO
  audioRom[off + OFF_LFO] =
    (patch.lfoEnable ? 0x80 : 0) | ((patch.lfoWaveform & 3) << 5);
  audioRom[off + OFF_LFO_FREQ] = patch.lfoFreq;
  audioRom[off + OFF_PMD] = patch.pmd;
  audioRom[off + OFF_AMD] = patch.amd;
  audioRom[off + OFF_PMS_AMS] = patch.pmsAms;

  // Operators
  writeOperator(audioRom, off, 0, patch.operators[0]);
  writeOperator(audioRom, off, 1, patch.operators[1]);
  writeOperator(audioRom, off, 2, patch.operators[2]);
  writeOperator(audioRom, off, 3, patch.operators[3]);
}

/** Convert an FmPatch to YM2151 register writes for a given channel (0-7). */
export function patchToRegisters(
  patch: FmPatch,
  channel: number,
): Array<{ register: number; value: number }> {
  const writes: Array<{ register: number; value: number }> = [];

  // ALG/FB with RL = both speakers (0xC0)
  writes.push({
    register: 0x20 + channel,
    value: 0xC0 | (patch.feedback << 3) | patch.algorithm,
  });

  // PMS/AMS
  writes.push({ register: 0x38 + channel, value: patch.pmsAms });

  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i] as FmOperator;
    const slot = channel + (SLOT_OFFSETS[i] as number);

    writes.push({ register: 0x40 + slot, value: (op.dt1 << 4) | op.mul });
    writes.push({ register: 0x60 + slot, value: op.tl & 0x7F });
    writes.push({ register: 0x80 + slot, value: (op.ks << 6) | op.ar });
    writes.push({ register: 0xA0 + slot, value: (op.amsEn << 7) | op.d1r });
    writes.push({ register: 0xC0 + slot, value: (op.dt2 << 6) | op.d2r });
    writes.push({ register: 0xE0 + slot, value: (op.d1l << 4) | op.rr });
  }

  // LFO (global registers — will affect all channels)
  if (patch.lfoEnable) {
    writes.push({ register: 0x18, value: patch.lfoFreq });
    writes.push({ register: 0x19, value: 0x80 | patch.pmd }); // PMD mode
    writes.push({ register: 0x19, value: patch.amd });          // AMD mode
    writes.push({ register: 0x1B, value: patch.lfoWaveform & 3 });
  }

  return writes;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function readOperator(rom: Uint8Array, voiceOffset: number, opIndex: number): FmOperator {
  const tl     = rom[voiceOffset + OFF_TL + opIndex]!;
  const op     = voiceOffset + OFF_OP_DATA;
  const dtMul  = rom[op + opIndex]!;
  const ksAr   = rom[op + 4 + opIndex]!;
  const amsD1r = rom[op + 8 + opIndex]!;
  const dt2D2r = rom[op + 12 + opIndex]!;
  const d1lRr  = rom[op + 16 + opIndex]!;

  return {
    dt1:   (dtMul >> 4) & 7,
    mul:   dtMul & 0xF,
    tl:    tl & 0x7F,
    ks:    (ksAr >> 6) & 3,
    ar:    ksAr & 0x1F,
    amsEn: (amsD1r >> 7) & 1,
    d1r:   amsD1r & 0x1F,
    dt2:   (dt2D2r >> 6) & 3,
    d2r:   dt2D2r & 0x1F,
    d1l:   (d1lRr >> 4) & 0xF,
    rr:    d1lRr & 0xF,
  };
}

function writeOperator(rom: Uint8Array, voiceOffset: number, opIndex: number, op: FmOperator): void {
  rom[voiceOffset + OFF_TL + opIndex] = op.tl & 0x7F;

  const base = voiceOffset + OFF_OP_DATA;
  rom[base + opIndex]      = (op.dt1 << 4) | op.mul;
  rom[base + 4 + opIndex]  = (op.ks << 6) | op.ar;
  rom[base + 8 + opIndex]  = (op.amsEn << 7) | op.d1r;
  rom[base + 12 + opIndex] = (op.dt2 << 6) | op.d2r;
  rom[base + 16 + opIndex] = (op.d1l << 4) | op.rr;
}
