/**
 * OKI MSM6295 ADPCM Codec — encoder and decoder for sample preview and replacement.
 *
 * Reuses the same DIFF_LOOKUP and INDEX_ADJUST tables as oki6295.ts (MAME-exact).
 */

// ── Tables (identical to oki6295.ts) ──

const INDEX_ADJUST: readonly number[] = [-1, -1, -1, -1, 2, 4, 6, 8];

const DIFF_LOOKUP: Int16Array = (() => {
  const nbl2bit: readonly number[][] = [
    [1, 0, 0, 0], [1, 0, 0, 1], [1, 0, 1, 0], [1, 0, 1, 1],
    [1, 1, 0, 0], [1, 1, 0, 1], [1, 1, 1, 0], [1, 1, 1, 1],
    [-1, 0, 0, 0], [-1, 0, 0, 1], [-1, 0, 1, 0], [-1, 0, 1, 1],
    [-1, 1, 0, 0], [-1, 1, 0, 1], [-1, 1, 1, 0], [-1, 1, 1, 1],
  ];
  const table = new Int16Array(49 * 16);
  for (let step = 0; step <= 48; step++) {
    const stepval = Math.floor(16.0 * Math.pow(11.0 / 10.0, step));
    for (let nib = 0; nib < 16; nib++) {
      table[step * 16 + nib] = nbl2bit[nib]![0]! *
        (stepval * nbl2bit[nib]![1]! +
        (stepval >> 1) * nbl2bit[nib]![2]! +
        (stepval >> 2) * nbl2bit[nib]![3]! +
        (stepval >> 3));
    }
  }
  return table;
})();

export const OKI_SAMPLE_RATE = 7575;
const PHRASE_TABLE_SIZE = 128;
const PHRASE_ENTRY_SIZE = 8;

// ── Phrase Table Parser ──

export interface PhraseInfo {
  id: number;
  startByte: number;
  endByte: number;
  sizeBytes: number;
  numSamples: number;
  durationMs: number;
}

/** Parse the OKI ROM phrase table and return info for all valid samples. */
export function parsePhraseTable(rom: Uint8Array): PhraseInfo[] {
  const phrases: PhraseInfo[] = [];
  for (let i = 0; i < PHRASE_TABLE_SIZE; i++) {
    const off = i * PHRASE_ENTRY_SIZE;
    if (off + 5 >= rom.length) break;
    const start = ((rom[off]! << 16) | (rom[off + 1]! << 8) | rom[off + 2]!) & 0x3FFFF;
    const end = ((rom[off + 3]! << 16) | (rom[off + 4]! << 8) | rom[off + 5]!) & 0x3FFFF;
    if (start >= end || start >= rom.length) continue;
    const sizeBytes = end - start;
    const numSamples = sizeBytes * 2; // 2 nibbles per byte
    phrases.push({
      id: i,
      startByte: start,
      endByte: end,
      sizeBytes,
      numSamples,
      durationMs: Math.round(numSamples / OKI_SAMPLE_RATE * 1000),
    });
  }
  return phrases;
}

// ── Decoder ──

/** Decode an OKI ADPCM phrase to PCM Float32Array (mono, 7575 Hz, [-1..1]). */
export function decodeSample(rom: Uint8Array, phrase: PhraseInfo): Float32Array {
  const out = new Float32Array(phrase.numSamples);
  let signal = 0;
  let stepIndex = 0;
  let address = phrase.startByte;
  let nibbleToggle = false;

  for (let i = 0; i < phrase.numSamples; i++) {
    if (address >= rom.length) break;
    const byte = rom[address]!;
    const nibble = nibbleToggle ? (byte & 0xF) : ((byte >> 4) & 0xF);
    if (nibbleToggle) { address++; }
    nibbleToggle = !nibbleToggle;

    signal += DIFF_LOOKUP[stepIndex * 16 + nibble]!;
    signal = Math.max(-2048, Math.min(2047, signal));
    stepIndex = Math.max(0, Math.min(48, stepIndex + INDEX_ADJUST[nibble & 7]!));
    out[i] = signal / 2048; // normalize to [-1..1]
  }
  return out;
}

// ── Encoder ──

/** Encode PCM Float32Array (mono, any sample rate) to OKI ADPCM bytes.
 *  Resamples to 7575 Hz if needed. Returns packed ADPCM (high nibble first). */
export function encodeSample(pcm: Float32Array, srcRate: number, boost = false): Uint8Array {
  // Resample to OKI rate
  let resampled = srcRate === OKI_SAMPLE_RATE ? pcm : resampleLinear(pcm, srcRate, OKI_SAMPLE_RATE);

  // Lo-fi processing: match OKI hardware character
  // 1. Low-pass at ~3kHz (single-pole) to kill harsh highs before ADPCM quantization
  const cutoff = 3000;
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / OKI_SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < resampled.length; i++) {
    prev += alpha * (resampled[i]! - prev);
    resampled[i] = prev;
  }

  // 2. Normalize (+ optional soft-clip for mic recording)
  let peak = 0;
  for (let i = 0; i < resampled.length; i++) {
    const abs = Math.abs(resampled[i]!);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.001) {
    if (boost) {
      // Mic mode: boost to 1.8x peak + tanh soft-clip (match arcade sample loudness)
      const gain = 1.8 / peak;
      for (let i = 0; i < resampled.length; i++) {
        let s = resampled[i]! * gain;
        s = Math.tanh(s * 2.0);
        resampled[i] = s;
      }
    } else {
      // WAV import: normalize to peak without overdrive
      const gain = 1.0 / peak;
      for (let i = 0; i < resampled.length; i++) {
        resampled[i] = resampled[i]! * gain;
      }
    }
  }

  const numSamples = resampled.length;
  const numBytes = Math.ceil(numSamples / 2);
  const out = new Uint8Array(numBytes);

  let signal = 0;
  let stepIndex = 0;

  for (let i = 0; i < numSamples; i++) {
    // Target value in 12-bit range
    const target = Math.round(resampled[i]! * 2048);
    const delta = target - signal;

    // Find best nibble (brute force — 16 options, fast enough)
    let bestNibble = 0;
    let bestError = Infinity;
    for (let nib = 0; nib < 16; nib++) {
      const diff = DIFF_LOOKUP[stepIndex * 16 + nib]!;
      const predicted = Math.max(-2048, Math.min(2047, signal + diff));
      const err = Math.abs(target - predicted);
      if (err < bestError) {
        bestError = err;
        bestNibble = nib;
      }
    }

    // Apply the chosen nibble (same as decoder)
    signal += DIFF_LOOKUP[stepIndex * 16 + bestNibble]!;
    signal = Math.max(-2048, Math.min(2047, signal));
    stepIndex = Math.max(0, Math.min(48, stepIndex + INDEX_ADJUST[bestNibble & 7]!));

    // Pack into bytes (high nibble first)
    const byteIdx = i >> 1;
    if ((i & 1) === 0) {
      out[byteIdx] = (bestNibble << 4);
    } else {
      out[byteIdx]! |= bestNibble;
    }
  }

  return out;
}

// ── Resampler ──

function resampleLinear(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
  const ratio = srcRate / dstRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

// ── ROM Manipulation ──

/** Replace a sample in the OKI ROM. Returns true if successful. */
export interface ReplaceResult {
  success: boolean;
  truncated: boolean;
  /** Duration kept in ms (only meaningful if truncated) */
  keptMs: number;
  /** Original WAV duration in ms */
  originalMs: number;
}

export function replaceSampleInRom(
  rom: Uint8Array,
  phraseId: number,
  adpcmData: Uint8Array,
): ReplaceResult {
  const off = phraseId * PHRASE_ENTRY_SIZE;
  if (off + 5 >= rom.length) return { success: false, truncated: false, keptMs: 0, originalMs: 0 };

  const oldStart = ((rom[off]! << 16) | (rom[off + 1]! << 8) | rom[off + 2]!) & 0x3FFFF;
  const oldEnd = ((rom[off + 3]! << 16) | (rom[off + 4]! << 8) | rom[off + 5]!) & 0x3FFFF;
  const oldSize = oldEnd - oldStart;

  if (oldStart >= rom.length) return { success: false, truncated: false, keptMs: 0, originalMs: 0 };

  const originalMs = Math.round((adpcmData.length * 2) / OKI_SAMPLE_RATE * 1000);
  let writeData = adpcmData;
  let truncated = false;

  if (adpcmData.length > oldSize) {
    // Truncate to fit in existing slot
    writeData = adpcmData.subarray(0, oldSize);
    truncated = true;
  }

  // Write ADPCM data at the original slot
  rom.set(writeData, oldStart);

  // Pad remaining with silence
  for (let i = oldStart + writeData.length; i < oldEnd; i++) {
    rom[i] = 0x80;
  }

  // Update phrase table end pointer (in case truncated)
  const writeEnd = oldStart + writeData.length;
  rom[off + 3] = (writeEnd >> 16) & 0xFF;
  rom[off + 4] = (writeEnd >> 8) & 0xFF;
  rom[off + 5] = writeEnd & 0xFF;

  const keptMs = Math.round((writeData.length * 2) / OKI_SAMPLE_RATE * 1000);

  return { success: true, truncated, keptMs, originalMs };
}
