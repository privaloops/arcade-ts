/**
 * Neo-Geo ADPCM-A sample table parser + codec.
 *
 * Parses the ADPCM-A sample address table from the Z80 M-ROM.
 * SNK standard driver format:
 *   - Table starts with a pointer (LE 16-bit) at a known offset
 *   - Data = banks of (N+1) LE 16-bit addresses, separated by 0x0000
 *   - Each bank has N samples: sample[i] spans addr[i]..addr[i+1]-1
 *   - Addresses are in 256-byte units within the V-ROM
 *
 * Reuses the OKI ADPCM codec (same algorithm, different sample rate).
 */

import { decodeSample as okiDecode, encodeSample as okiEncode, type PhraseInfo, type ReplaceResult } from './oki-codec';
export type { PhraseInfo, ReplaceResult } from './oki-codec';

// ADPCM-A native sample rate: 8 MHz / 432 = 18518.5 Hz
export const ADPCM_A_SAMPLE_RATE = 18519;

// ── Sample table parser ─────────────────────────────────────────────────

/**
 * Find and parse the ADPCM-A sample table from the Z80 M-ROM.
 *
 * Strategy: scan M-ROM for the pattern:
 *   [addr, addr, addr, ..., 0x0000, addr, addr, ..., 0x0000, ...]
 * where addrs are LE 16-bit values in ascending order within V-ROM range,
 * grouped into banks of equal size separated by 0x0000.
 */
/**
 * Check if a sample region in V-ROM is silent (all same byte = padding).
 * Returns true if the sample should be hidden from the table.
 */
function isSilentSample(vRom: Uint8Array, startByte: number, endByte: number): boolean {
  if (startByte >= vRom.length) return true;
  const end = Math.min(endByte, vRom.length);
  const first = vRom[startByte]!;
  for (let i = startByte + 1; i < end; i++) {
    if (vRom[i] !== first) return false;
  }
  return true;
}

export function parseAdpcmASampleTable(
  mRom: Uint8Array,
  vRomSize: number,
  vRom?: Uint8Array,
): PhraseInfo[] {
  // YM2610 can address up to 16MB, but V-ROM may be smaller with mirroring
  const maxAddr = Math.max(Math.floor(vRomSize / 256), 0x10000);

  // Try to find the table by scanning for bank patterns
  // Strategy 1: look for a LE 16-bit pointer in the M-ROM header area (0x100-0x400)
  // that points to a valid table. The SNK driver stores the table pointer early in the ROM.
  for (let ptrOff = 0x100; ptrOff < Math.min(mRom.length, 0x400); ptrOff += 2) {
    const ptr = mRom[ptrOff]! | (mRom[ptrOff + 1]! << 8);
    if (ptr < 0x100 || ptr >= mRom.length - 8) continue;
    const result = tryParseTableAt(mRom, ptr, maxAddr);
    if (result.length >= 20) return filterSilent(result, vRom);
  }

  // Strategy 2: brute-force scan entire M-ROM
  let bestResult: PhraseInfo[] = [];
  for (let off = 0; off < mRom.length - 8; off += 2) {
    const result = tryParseTableAt(mRom, off, maxAddr);
    if (result.length > bestResult.length) bestResult = result;
  }

  return filterSilent(bestResult, vRom);
}

/** Filter out silent/padding samples and re-index. */
function filterSilent(phrases: PhraseInfo[], vRom?: Uint8Array): PhraseInfo[] {
  if (!vRom || phrases.length === 0) return phrases;
  const filtered = phrases.filter(p => !isSilentSample(vRom, p.startByte, p.endByte));
  for (let i = 0; i < filtered.length; i++) filtered[i]!.id = i;
  return filtered;
}

/** Try to parse a sample table starting at the given M-ROM offset. */
function tryParseTableAt(
  mRom: Uint8Array,
  offset: number,
  maxAddr: number,
): PhraseInfo[] {
  // Read LE 16-bit values until we find the bank structure
  const banks: number[][] = [];
  let currentBank: number[] = [];
  const MAX_BANKS = 16; // SNK standard driver: 16 banks

  for (let i = offset; i < mRom.length - 1; i += 2) {
    const val = mRom[i]! | (mRom[i + 1]! << 8);

    if (val === 0) {
      if (currentBank.length >= 3) {
        banks.push(currentBank);
        if (banks.length >= MAX_BANKS) break;
      }
      currentBank = [];
      continue;
    }

    // Validate: address must be within V-ROM range
    if (val >= maxAddr) {
      if (currentBank.length >= 3) banks.push(currentBank);
      break;
    }

    currentBank.push(val);
  }
  if (currentBank.length >= 3) banks.push(currentBank);

  if (banks.length < 2) return [];

  // Validate: all banks should have the same size (SNK standard driver)
  const bankSize = banks[0]!.length;
  const uniformBanks = banks.filter(b => b.length === bankSize);
  if (uniformBanks.length < 2) return [];

  // Build samples from consecutive addresses within each bank
  const phrases: PhraseInfo[] = [];
  let id = 0;

  for (const bank of uniformBanks) {
    // Merge consecutive entries (delta=1) into single samples
    let j = 0;
    while (j < bank.length - 1) {
      const startUnit = bank[j]!;
      // Find the end of this run: skip over consecutive +1 entries
      let k = j + 1;
      while (k < bank.length - 1 && bank[k + 1]! - bank[k]! === 1) k++;
      const nextUnit = bank[k]!;
      if (nextUnit <= startUnit) { j = k + 1; continue; }

      const startByte = startUnit * 256;
      const endByte = nextUnit * 256;
      const sizeBytes = endByte - startByte;
      const numSamples = sizeBytes * 2;

      phrases.push({
        id: id++,
        startByte,
        endByte,
        sizeBytes,
        numSamples,
        durationMs: Math.round(numSamples / ADPCM_A_SAMPLE_RATE * 1000),
      });

      j = k + 1;
    }
  }

  if (phrases.length < 4) return [];

  return phrases;
}

// ── Decode / Encode (same ADPCM algorithm as OKI — tables are identical) ──

/** Decode an ADPCM-A sample to PCM Float32Array (mono, 18519 Hz). */
export function decodeAdpcmASample(vRom: Uint8Array, phrase: PhraseInfo): Float32Array {
  return okiDecode(vRom, phrase);
}

/** Encode PCM to ADPCM-A format. Resamples to 18519 Hz if needed. */
export function encodeAdpcmASample(pcm: Float32Array, srcRate: number): Uint8Array {
  return okiEncode(pcm, srcRate, false);
}

/** Replace an ADPCM-A sample in the V-ROM. */
export function replaceAdpcmASample(
  vRom: Uint8Array,
  phrase: PhraseInfo,
  adpcmData: Uint8Array,
): ReplaceResult {
  const originalMs = Math.round((adpcmData.length * 2) / ADPCM_A_SAMPLE_RATE * 1000);
  let writeData = adpcmData;
  let truncated = false;

  if (adpcmData.length > phrase.sizeBytes) {
    writeData = adpcmData.subarray(0, phrase.sizeBytes);
    truncated = true;
  }

  vRom.set(writeData, phrase.startByte);

  // Pad remaining with silence
  for (let i = phrase.startByte + writeData.length; i < phrase.endByte; i++) {
    vRom[i] = 0x80;
  }

  const keptMs = Math.round((writeData.length * 2) / ADPCM_A_SAMPLE_RATE * 1000);
  return { success: true, truncated, keptMs, originalMs };
}
