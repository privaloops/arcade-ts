/**
 * Audio Worker — runs Z80 + YM2151 (WASM) + OKI6295 off the main thread.
 *
 * Runs autonomously at ~60fps via setInterval. The main thread only posts
 * sound latch commands as they arrive. The worker generates audio
 * independently and writes directly into the SharedArrayBuffer ring buffer.
 */

import { Z80 } from '../cpu/z80';
import { Z80Bus } from '../memory/z80-bus';
import { initOPMWasm, NukedOPMWasm } from './nuked-opm-wasm';
import { OKI6295 } from './oki6295';
import { LinearResampler } from './resampler';
import { YM2151_SAMPLE_RATE, OKI6295_SAMPLE_RATE } from '../constants';
import { RING_BUFFER_SAMPLES, SAB_DATA_OFFSET } from './audio-output';

// ── Constants ──────────────────────────────────────────────────────────────

const Z80_CLOCK = 3_579_545;
const PIXEL_CLOCK = 8_000_000;
const CPS_HTOTAL = 512;
const CPS_VTOTAL = 262;
const FRAME_RATE = PIXEL_CLOCK / (CPS_HTOTAL * CPS_VTOTAL);
const FRAME_MS = 1000 / FRAME_RATE;
const Z80_CYCLES_PER_FRAME = Math.round(Z80_CLOCK / FRAME_RATE);
const YM_SAMPLES_PER_FRAME = Math.ceil(YM2151_SAMPLE_RATE / FRAME_RATE);
const OKI_SAMPLES_PER_FRAME = Math.ceil(OKI6295_SAMPLE_RATE / FRAME_RATE);

// ── Ring buffer writer ───────────────────────────────────────────────────

class RingBufferWriter {
  private readonly ctrl: Int32Array;
  private readonly data: Float32Array;

  constructor(sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(sab, 0, 2);
    this.data = new Float32Array(sab, SAB_DATA_OFFSET, RING_BUFFER_SAMPLES * 2);
  }

  get freeSlots(): number {
    const writePtr = Atomics.load(this.ctrl, 0);
    const readPtr = Atomics.load(this.ctrl, 1);
    return (RING_BUFFER_SAMPLES - 1 - ((writePtr - readPtr + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES));
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

function clip(s: number): number {
  if (s > 0.95) return 0.95 + 0.05 * Math.tanh((s - 0.95) * 10);
  if (s < -0.95) return -0.95 - 0.05 * Math.tanh((-s - 0.95) * 10);
  return s;
}

// ── Worker state ─────────────────────────────────────────────────────────

let z80: Z80 | null = null;
let z80Bus: Z80Bus | null = null;
let ym2151: NukedOPMWasm | null = null;
let oki6295: OKI6295 | null = null;
let ringBuffer: RingBufferWriter | null = null;

let ymResamplerL: LinearResampler | null = null;
let ymResamplerR: LinearResampler | null = null;
let okiResampler: LinearResampler | null = null;

// Scratch buffers
let ymBufferL = new Float32Array(1024);
let ymBufferR = new Float32Array(1024);
let okiBuffer = new Float32Array(256);
let ymResampledL = new Float32Array(8192);
let ymResampledR = new Float32Array(8192);
let okiResampledM = new Float32Array(8192);
let mixedL = new Float32Array(2048);
let mixedR = new Float32Array(2048);

let suspended = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

// ── Autonomous frame generation ──────────────────────────────────────────

function runAudioFrame(): void {
  if (!z80 || !z80Bus || !ym2151 || !ringBuffer || suspended) return;

  // Skip if ring buffer is nearly full (we're ahead of the AudioWorklet)
  if (ringBuffer.freeSlots < 1024) return;

  // Advance latch queue (one command per frame)
  z80Bus.advanceSoundLatch();

  // Run Z80 for one frame with interleaved YM2151 clocking
  let z80Cycles = 0;
  let opmAccum = 0;
  try {
    while (z80Cycles < Z80_CYCLES_PER_FRAME) {
      const cyc = z80.step();
      z80Cycles += cyc;
      opmAccum += cyc;
      const opmClocks = opmAccum >> 1;
      opmAccum &= 1;
      if (opmClocks > 0) {
        ym2151.clockCycles(opmClocks);
      }
    }
  } catch {
    // Z80 errors — continue generating audio
  }

  // Generate samples
  ym2151.generateSamples(ymBufferL, ymBufferR, YM_SAMPLES_PER_FRAME);
  let okiCount = 0;
  if (oki6295 !== null) {
    okiCount = OKI_SAMPLES_PER_FRAME;
    oki6295.generateSamples(okiBuffer, okiCount);
  }

  // Resample YM2151
  if (ymResampledL.length < YM_SAMPLES_PER_FRAME * 4) {
    ymResampledL = new Float32Array(YM_SAMPLES_PER_FRAME * 8);
    ymResampledR = new Float32Array(YM_SAMPLES_PER_FRAME * 8);
  }
  const nYmL = ymResamplerL!.resample(ymBufferL, YM_SAMPLES_PER_FRAME, ymResampledL);
  ymResamplerR!.resample(ymBufferR, YM_SAMPLES_PER_FRAME, ymResampledR);

  // Resample OKI
  if (okiResampledM.length < okiCount * 16) {
    okiResampledM = new Float32Array(okiCount * 32);
  }
  const nOki = okiCount > 0 ? okiResampler!.resample(okiBuffer, okiCount, okiResampledM) : 0;

  // Mix (MAME CPS1 route: ymL*0.35 + ymR*0.35 + oki*0.30, mono)
  const nOut = nYmL;
  if (mixedL.length < nOut) {
    mixedL = new Float32Array(nOut * 2);
    mixedR = new Float32Array(nOut * 2);
  }
  for (let i = 0; i < nOut; i++) {
    const oki = i < nOki ? (okiResampledM[i] ?? 0) : 0;
    const mono = clip((ymResampledL[i] ?? 0) * 0.35 + (ymResampledR[i] ?? 0) * 0.35 + oki * 0.30);
    mixedL[i] = mono;
    mixedR[i] = mono;
  }

  ringBuffer.write(mixedL, mixedR, nOut);
}

// ── Message handler ──────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      const audioRom = new Uint8Array(msg.audioRom as ArrayBuffer);
      const okiRom = new Uint8Array(msg.okiRom as ArrayBuffer);
      const sab = msg.sab as SharedArrayBuffer;
      const sampleRate = msg.sampleRate as number;

      // Init WASM OPM
      await initOPMWasm();
      ym2151 = new NukedOPMWasm();
      ym2151.reset();

      // Init Z80 bus and wire callbacks
      z80Bus = new Z80Bus();
      z80Bus.loadAudioRom(audioRom);

      z80Bus.setYm2151AddressWriteCallback((value: number) => {
        ym2151!.writeAddress(value);
      });
      z80Bus.setYm2151WriteCallback((_register: number, data: number) => {
        ym2151!.writeData(data);
      });
      z80Bus.setYm2151ReadStatusCallback(() => {
        return ym2151!.readStatus();
      });

      // Init OKI6295
      if (okiRom.length > 0) {
        oki6295 = new OKI6295(okiRom);
        z80Bus.setOkiWriteCallback((value: number) => {
          oki6295!.write(value);
        });
        z80Bus.setOkiReadStatusCallback(() => {
          return oki6295!.read();
        });
      }

      // Init Z80
      z80 = new Z80(z80Bus);

      // Wire YM2151 timer IRQs to Z80
      ym2151.setTimerCallback(() => { z80!.setIrqLine(true); });
      ym2151.setIrqClearCallback(() => { z80!.setIrqLine(false); });
      ym2151.setExternalTimerMode(true);

      z80.reset();

      // Ring buffer writer
      ringBuffer = new RingBufferWriter(sab);

      // Resamplers
      ymResamplerL = new LinearResampler(YM2151_SAMPLE_RATE, sampleRate);
      ymResamplerR = new LinearResampler(YM2151_SAMPLE_RATE, sampleRate);
      okiResampler = new LinearResampler(OKI6295_SAMPLE_RATE, sampleRate);

      suspended = false;

      // Start autonomous audio generation at ~60fps
      intervalId = setInterval(runAudioFrame, FRAME_MS);

      self.postMessage({ type: 'ready' });
      break;
    }

    case 'latch': {
      // Sound latch from 68K — inject into Z80 bus queue
      if (!z80Bus) return;
      const latches = msg.latches as number[];
      for (const latch of latches) {
        z80Bus.setSoundLatch(latch);
      }
      const latches2 = msg.latches2 as number[] | undefined;
      if (latches2) {
        for (const latch of latches2) {
          z80Bus.setSoundLatch2(latch);
        }
      }
      break;
    }

    case 'reset': {
      z80?.reset();
      ym2151?.reset();
      break;
    }

    case 'suspend': {
      suspended = true;
      break;
    }

    case 'resume': {
      suspended = false;
      break;
    }

    case 'terminate': {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;
    }
  }
};
