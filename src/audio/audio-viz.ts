/**
 * Audio visualization SharedArrayBuffer (vizSAB)
 *
 * Shared between the audio Worker (writes channel state) and the
 * main thread (reads for the Audio DAW panel). Lock-free via Atomics.
 *
 * Layout (256 bytes — supports both CPS1 and Neo-Geo):
 *   0-7     kc[8]         FM Key Code per channel (octave+note)
 *   8-15    kf[8]         FM Key Fraction per channel
 *   16-23   kon[8]        FM Key On state (1=on, 0=off)
 *   24-31   tl[8]         FM Carrier Total Level (0=loud, 127=silent)
 *   32-39   rl[8]         FM Right/Left enable
 *   40-71   pcm[8×4]      PCM voices: {playing, phraseId, volume, signal}
 *   72-73   channelMask   Mute/solo bitmask (bit=1 = audible)
 *                         bits 0-7 = FM, bits 8-15 = PCM
 *   74-81   connect[8]    FM Algorithm (0-7) per channel
 *   82      fmCount       Number of active FM channels (CPS1=8, Neo-Geo=4)
 *   83      pcmCount      Number of active PCM channels (CPS1=4, Neo-Geo=7)
 *   84      ssgCount      Number of SSG channels mapped into FM slots (0 or 3)
 *   85      ssgOffset     First FM slot used for SSG (e.g. 4 for Neo-Geo)
 *   86-255  reserved
 */

export const VIZ_SAB_SIZE = 256;

// Byte offsets
const OFF_KC  = 0;
const OFF_KF  = 8;
const OFF_KON = 16;
const OFF_TL  = 24;
const OFF_RL  = 32;
const OFF_PCM = 40;  // 8 voices × 4 bytes = 32 bytes
const OFF_MASK = 72;
const OFF_CONNECT = 74;
const OFF_FM_COUNT = 82;
const OFF_PCM_COUNT = 83;
const OFF_SSG_COUNT = 84;
const OFF_SSG_OFFSET = 85;

/** Worker-side writer. Writes channel state into the vizSAB each frame. */
export class VizWriter {
  private readonly u8: Uint8Array;
  private readonly u16: Uint16Array;

  constructor(sab: SharedArrayBuffer) {
    this.u8 = new Uint8Array(sab);
    this.u16 = new Uint16Array(sab);
  }

  /** Set system channel layout (call once at init) */
  setLayout(fmCount: number, pcmCount: number, ssgCount = 0, ssgOffset = 0): void {
    this.u8[OFF_FM_COUNT] = fmCount;
    this.u8[OFF_PCM_COUNT] = pcmCount;
    this.u8[OFF_SSG_COUNT] = ssgCount;
    this.u8[OFF_SSG_OFFSET] = ssgOffset;
  }

  updateFm(ch: number, kc: number, kf: number, kon: number, tl: number, rl: number): void {
    this.u8[OFF_KC + ch] = kc;
    this.u8[OFF_KF + ch] = kf;
    this.u8[OFF_KON + ch] = kon;
    this.u8[OFF_TL + ch] = tl;
    this.u8[OFF_RL + ch] = rl;
  }

  updateFmKc(ch: number, kc: number): void { this.u8[OFF_KC + ch] = kc; }
  updateFmKf(ch: number, kf: number): void { this.u8[OFF_KF + ch] = kf; }
  updateFmKon(ch: number, kon: number): void { this.u8[OFF_KON + ch] = kon; }
  updateFmTl(ch: number, tl: number): void { this.u8[OFF_TL + ch] = tl; }
  updateFmRl(ch: number, rl: number): void { this.u8[OFF_RL + ch] = rl; }
  updateFmConnect(ch: number, connect: number): void { this.u8[OFF_CONNECT + ch] = connect; }

  updatePcm(voice: number, playing: number, phraseId: number, volume: number, signal: number): void {
    const base = OFF_PCM + voice * 4;
    this.u8[base] = playing;
    this.u8[base + 1] = phraseId;
    this.u8[base + 2] = volume;
    // Signal as unsigned byte: map -2048..2047 → 0..255
    this.u8[base + 3] = Math.max(0, Math.min(255, ((signal + 2048) * 255 / 4095) | 0));
  }

  /** Read the channel mask set by the main thread (for mute/solo). */
  readChannelMask(): number {
    return Atomics.load(this.u16, OFF_MASK >> 1);
  }
}

export interface FmChannelState {
  kc: number;
  kf: number;
  kon: boolean;
  tl: number;
  rl: number;
  connect: number;  // algorithm (0-7)
}

export interface PcmVoiceState {
  playing: boolean;
  phraseId: number;
  volume: number;
  signal: number; // 0..255 (128 = center/silence)
}

// Keep OkiVoiceState as alias for backward compatibility
export type OkiVoiceState = PcmVoiceState;

/** System audio layout descriptor */
export interface AudioLayout {
  fmCount: number;     // FM channels (CPS1=8, Neo-Geo=4)
  pcmCount: number;    // PCM channels (CPS1=4, Neo-Geo=7)
  ssgCount: number;    // SSG channels mapped as FM (0 or 3)
  ssgOffset: number;   // First FM slot for SSG (e.g. 4)
}

/** Main thread reader. Reads channel state from the vizSAB for UI display. */
export class VizReader {
  private readonly u8: Uint8Array;
  private readonly u16: Uint16Array;

  constructor(sab: SharedArrayBuffer) {
    this.u8 = new Uint8Array(sab);
    this.u16 = new Uint16Array(sab);
  }

  getFm(ch: number): FmChannelState {
    return {
      kc: this.u8[OFF_KC + ch]!,
      kf: this.u8[OFF_KF + ch]!,
      kon: this.u8[OFF_KON + ch]! !== 0,
      tl: this.u8[OFF_TL + ch]!,
      rl: this.u8[OFF_RL + ch]!,
      connect: this.u8[OFF_CONNECT + ch]!,
    };
  }

  getPcm(voice: number): PcmVoiceState {
    const base = OFF_PCM + voice * 4;
    return {
      playing: this.u8[base]! !== 0,
      phraseId: this.u8[base + 1]!,
      volume: this.u8[base + 2]!,
      signal: this.u8[base + 3]!,
    };
  }

  /** Backward-compatible alias */
  getOki(voice: number): OkiVoiceState {
    return this.getPcm(voice);
  }

  /** Read audio layout set by the worker */
  getLayout(): AudioLayout {
    return {
      fmCount: this.u8[OFF_FM_COUNT]! || 8,    // default CPS1
      pcmCount: this.u8[OFF_PCM_COUNT]! || 4,   // default CPS1
      ssgCount: this.u8[OFF_SSG_COUNT]! || 0,
      ssgOffset: this.u8[OFF_SSG_OFFSET]! || 0,
    };
  }

  /** Write the channel mask from the main thread (for mute/solo). */
  setChannelMask(mask: number): void {
    Atomics.store(this.u16, OFF_MASK >> 1, mask);
  }

  getChannelMask(): number {
    return Atomics.load(this.u16, OFF_MASK >> 1);
  }
}

/** Decode YM2151/YM2610 Key Code to note name. */
const NOTE_NAMES = ['C#', 'D', 'D#', '?', 'E', 'F', 'F#', '?', 'G', 'G#', 'A', '?', 'A#', 'B', 'C', '?'];

export function kcToNoteName(kc: number): string {
  const octave = (kc >> 4) & 7;
  const noteIdx = kc & 0xF;
  const name = NOTE_NAMES[noteIdx];
  return name === '?' ? '--' : `${name}${octave}`;
}

/**
 * Convert SSG period register to a KC-compatible value for the piano roll.
 * SSG period = 12-bit counter, frequency = clock / (16 * period).
 * We convert to the closest YM KC value for display.
 */
export function ssgPeriodToKc(period: number, clock = 2_000_000): number {
  if (period === 0) return 0;
  const freq = clock / (16 * period);
  // MIDI note: 69 + 12 * log2(freq / 440)
  const midi = 69 + 12 * Math.log2(freq / 440);
  if (midi < 0 || midi > 127) return 0;
  // Convert MIDI to KC: octave = midi/12 - 1, note index from semitone
  const octave = Math.floor(midi / 12) - 1;
  const semi = Math.round(midi) % 12;
  // Map semitone to YM note index (reverse of KC_TO_SEMI)
  const SEMI_TO_KC = [14, 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13];
  const noteIdx = SEMI_TO_KC[semi] ?? 0;
  return ((octave & 7) << 4) | noteIdx;
}
