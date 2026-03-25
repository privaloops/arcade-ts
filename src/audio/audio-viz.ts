/**
 * Audio visualization SharedArrayBuffer (vizSAB)
 *
 * Shared between the audio Worker (writes channel state) and the
 * main thread (reads for the Audio DAW panel). Lock-free via Atomics.
 *
 * Layout (128 bytes):
 *   0-7    kc[8]         FM Key Code per channel (octave+note)
 *   8-15   kf[8]         FM Key Fraction per channel
 *   16-23  kon[8]        FM Key On state (1=on, 0=off)
 *   24-31  tl[8]         FM Carrier Total Level (0=loud, 127=silent)
 *   32-39  rl[8]         FM Right/Left enable
 *   40-55  oki[4×4]      OKI voices: {playing, phraseId, volume, pad}
 *   56-57  channelMask   Mute/solo bitmask (bit=1 = audible)
 *                        bits 0-7 = FM, bits 8-11 = OKI
 *   58-65  connect[8]    FM Algorithm (0-7) per channel
 *   66-127 reserved
 */

export const VIZ_SAB_SIZE = 128;

// Byte offsets
const OFF_KC  = 0;
const OFF_KF  = 8;
const OFF_KON = 16;
const OFF_TL  = 24;
const OFF_RL  = 32;
const OFF_OKI = 40;  // 4 voices × 4 bytes = 16 bytes
const OFF_MASK = 56;
const OFF_CONNECT = 58;

/** Worker-side writer. Writes channel state into the vizSAB each frame. */
export class VizWriter {
  private readonly u8: Uint8Array;
  private readonly u16: Uint16Array;

  constructor(sab: SharedArrayBuffer) {
    this.u8 = new Uint8Array(sab);
    this.u16 = new Uint16Array(sab);
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

  updateOki(voice: number, playing: number, phraseId: number, volume: number, signal: number): void {
    const base = OFF_OKI + voice * 4;
    this.u8[base] = playing;
    this.u8[base + 1] = phraseId;
    this.u8[base + 2] = volume;
    // Signal as signed byte: map -2048..2047 → 0..255
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

export interface OkiVoiceState {
  playing: boolean;
  phraseId: number;
  volume: number;
  signal: number; // 0..255 (128 = center/silence)
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

  getOki(voice: number): OkiVoiceState {
    const base = OFF_OKI + voice * 4;
    return {
      playing: this.u8[base]! !== 0,
      phraseId: this.u8[base + 1]!,
      volume: this.u8[base + 2]!,
      signal: this.u8[base + 3]!,
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

/** Decode YM2151 Key Code to note name. */
const NOTE_NAMES = ['C#', 'D', 'D#', '?', 'E', 'F', 'F#', '?', 'G', 'G#', 'A', '?', 'A#', 'B', 'C', '?'];

export function kcToNoteName(kc: number): string {
  const octave = (kc >> 4) & 7;
  const noteIdx = kc & 0xF;
  const name = NOTE_NAMES[noteIdx];
  return name === '?' ? '--' : `${name}${octave}`;
}
