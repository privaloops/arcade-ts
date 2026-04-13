/**
 * Shared audio utilities used by both CPS1 and Neo-Geo audio workers.
 */

import { RING_BUFFER_SAMPLES, SAB_DATA_OFFSET } from './audio-output';

// ── Ring buffer writer ───────────────────────────────────────────────────

export class RingBufferWriter {
  private readonly ctrl: Int32Array;
  private readonly data: Float32Array;

  constructor(sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(sab, 0, 2);
    this.data = new Float32Array(sab, SAB_DATA_OFFSET, RING_BUFFER_SAMPLES * 2);
  }

  get freeSlots(): number {
    const writePtr = Atomics.load(this.ctrl, 0);
    const readPtr = Atomics.load(this.ctrl, 1);
    return RING_BUFFER_SAMPLES - 1 - ((writePtr - readPtr + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES);
  }

  write(left: Float32Array, right: Float32Array, numSamples: number): number {
    const free = this.freeSlots;
    const toWrite = Math.min(numSamples, free);

    let wp = Atomics.load(this.ctrl, 0);
    for (let i = 0; i < toWrite; i++) {
      const base = (wp % RING_BUFFER_SAMPLES) * 2;
      this.data[base] = left[i] ?? 0;
      this.data[base + 1] = right[i] ?? 0;
      wp = (wp + 1) % RING_BUFFER_SAMPLES;
    }

    Atomics.store(this.ctrl, 0, wp);
    return toWrite;
  }
}

// ── Soft limiter ─────────────────────────────────────────────────────────

/** Soft tanh limiter — clips beyond +/-0.95 with smooth rolloff */
export function clip(s: number): number {
  if (s > 0.95) return 0.95 + 0.05 * Math.tanh((s - 0.95) * 10);
  if (s < -0.95) return -0.95 - 0.05 * Math.tanh((-s - 0.95) * 10);
  return s;
}
