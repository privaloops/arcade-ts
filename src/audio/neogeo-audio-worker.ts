/**
 * Neo-Geo Audio Worker — runs Z80 + YM2610 (WASM) off the main thread.
 *
 * Same architecture as audio-worker.ts (CPS1):
 * - Autonomous setInterval(4ms) with debt accumulator
 * - Z80 runs independently, clocks YM2610 via WASM
 * - YM2610 outputs stereo FM+SSG+ADPCM mixed internally
 * - Single stereo resampler (55556 Hz → AudioContext rate)
 * - Output to SharedArrayBuffer ring buffer
 */

import { Z80 } from '../cpu/z80';
import { NeoGeoZ80Bus } from '../memory/neogeo-z80-bus';
import { initYM2610Wasm, YM2610Wasm, YM2610_SAMPLE_RATE } from './ym2610-wasm';
import { LinearResampler } from './resampler';
import { NGO_Z80_CLOCK, NGO_YM2610_CLOCK, NGO_FRAME_RATE } from '../neogeo-constants';
import { RING_BUFFER_SAMPLES, SAB_DATA_OFFSET } from './audio-output';

// ── Constants ──────────────────────────────────────────────────────────────

const FRAME_MS = 1000 / NGO_FRAME_RATE;
const Z80_CYCLES_PER_FRAME = Math.round(NGO_Z80_CLOCK / NGO_FRAME_RATE);
// YM2610 runs at 8 MHz, Z80 at 4 MHz → multiply Z80 T-states by this ratio
const YM_CLOCK_RATIO = NGO_YM2610_CLOCK / NGO_Z80_CLOCK; // = 2

// ── Ring buffer writer ───────────────────────────────────────────────────

class RingBufferWriter {
  private readonly ctrl: Int32Array;
  private readonly data: Float32Array;

  constructor(sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(sab, 0, 2);
    this.data = new Float32Array(sab, SAB_DATA_OFFSET, RING_BUFFER_SAMPLES * 2);
  }

  write(left: Float32Array, right: Float32Array, numSamples: number): number {
    const writePtr = Atomics.load(this.ctrl, 0);
    const readPtr = Atomics.load(this.ctrl, 1);
    const free = RING_BUFFER_SAMPLES - 1 - ((writePtr - readPtr + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES);
    const toWrite = Math.min(numSamples, free);

    let wp = writePtr;
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
let z80Bus: NeoGeoZ80Bus | null = null;
let ym2610: YM2610Wasm | null = null;
let ringBuffer: RingBufferWriter | null = null;
let resamplerL: LinearResampler | null = null;
let resamplerR: LinearResampler | null = null;

// Scratch buffers
let ymBufferL = new Float32Array(2048);
let ymBufferR = new Float32Array(2048);
let resampledL = new Float32Array(12288);
let resampledR = new Float32Array(12288);

let suspended = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastAudioTime = 0;
let audioDebt = 0;
let contextSampleRate = 48000;
let workerFrameCount = 0;

// ── Autonomous frame generation ──────────────────────────────────────────

function runAudioTick(): void {
  if (!z80 || !z80Bus || !ym2610 || !ringBuffer || suspended) return;

  const now = performance.now();
  if (lastAudioTime === 0) lastAudioTime = now;
  audioDebt += now - lastAudioTime;
  lastAudioTime = now;

  // Cap debt to avoid runaway catch-up
  if (audioDebt > FRAME_MS * 3) audioDebt = FRAME_MS * 3;

  while (audioDebt >= FRAME_MS) {
    audioDebt -= FRAME_MS;
    runOneFrame();
  }
}

function runOneFrame(): void {
  if (!z80 || !z80Bus || !ym2610 || !ringBuffer || !resamplerL || !resamplerR) return;

  workerFrameCount++;

  // Run Z80 for one frame worth of cycles
  let cyclesLeft = Z80_CYCLES_PER_FRAME;

  while (cyclesLeft > 0) {
    // Check NMI
    if (z80Bus.shouldFireNmi()) {
      z80.nmi();
    }

    const ran = z80.step();
    cyclesLeft -= ran;

    // Clock YM2610 proportionally (8 MHz = 2× Z80's 4 MHz)
    ym2610.clockCycles(ran * YM_CLOCK_RATIO);

    // YM2610 IRQ → Z80 INT (level-triggered, like real hardware)
    z80.setIrqLine(ym2610.getIrq());
  }

  // Read generated YM2610 samples
  const sampleCount = ym2610.getSampleCount();
  if (sampleCount === 0) return;

  // Ensure buffers are large enough
  if (ymBufferL.length < sampleCount) {
    ymBufferL = new Float32Array(sampleCount);
    ymBufferR = new Float32Array(sampleCount);
  }

  const read = ym2610.readSamples(ymBufferL, ymBufferR, sampleCount);
  if (read === 0) return;

  // Resample from 55556 Hz to context rate
  const outCountL = resamplerL.resample(ymBufferL, read, resampledL);
  const outCountR = resamplerR.resample(ymBufferR, read, resampledR);
  const outCount = Math.min(outCountL, outCountR);

  if (outCount <= 0) return;

  // Apply soft limiter
  for (let i = 0; i < outCount; i++) {
    resampledL[i] = clip(resampledL[i]!);
    resampledR[i] = clip(resampledR[i]!);
  }

  // Write to ring buffer
  ringBuffer.write(resampledL, resampledR, outCount);
}

// ── Message handler ─────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      try {
        await initYM2610Wasm();
        ym2610 = new YM2610Wasm();

        z80Bus = new NeoGeoZ80Bus();
        z80 = new Z80(z80Bus);

        // Wire Z80 bus to YM2610 + classify writes for diagnostics
        let ymFmWrites = 0, ymSsgWrites = 0, ymAdpcmAWrites = 0, ymAdpcmBWrites = 0, ymTimerWrites = 0;
        let lastAddr0 = 0, lastAddr1 = 0;
        z80Bus.setYm2610WriteCallback((port, value) => {
          ym2610!.write(port, value);
          if (port === 0) lastAddr0 = value; // addr port 0
          if (port === 2) lastAddr1 = value; // addr port 1
          if (port === 1) { // data port 0: SSG(0x00-0x0F), ADPCM-B(0x10-0x1C), FM(0x21+), Timer(0x24-0x27)
            if (lastAddr0 <= 0x0F) ymSsgWrites++;
            else if (lastAddr0 >= 0x10 && lastAddr0 <= 0x1C) ymAdpcmBWrites++;
            else if (lastAddr0 >= 0x24 && lastAddr0 <= 0x27) ymTimerWrites++;
            else ymFmWrites++;
          }
          if (port === 3) { // data port 1: ADPCM-A(0x00-0x2F), FM ch4-6(0x30+)
            if (lastAddr1 <= 0x2F) ymAdpcmAWrites++;
            else ymFmWrites++;
          }
        });
        (self as any).__getYmStats = () => ({ fm: ymFmWrites, ssg: ymSsgWrites, adpcmA: ymAdpcmAWrites, adpcmB: ymAdpcmBWrites, timer: ymTimerWrites });
        z80Bus.setYm2610ReadCallback((port) => {
          return ym2610!.read(port);
        });

        // Wire Z80 reply back to main thread (68K polls this)
        z80Bus.setSoundReplyCallback((value) => {
          self.postMessage({ type: 'reply', value });
        });

        // Load BIOS Z80 ROM (sm1.sm1) — bootloader mapped at 0x0000
        if (msg.biosZRom) {
          z80Bus.loadBiosRom(new Uint8Array(msg.biosZRom));
        }

        // Load game M-ROM — accessible via banking (0x8000-0xBFFF)
        if (msg.audioRom) {
          z80Bus.loadAudioRom(new Uint8Array(msg.audioRom));
        }

        // Load V-ROM into WASM (with ADPCM-A/B split point)
        if (msg.voiceRom) {
          ym2610!.loadVRom(new Uint8Array(msg.voiceRom), msg.adpcmASize);
        }

        // Set up ring buffer
        if (msg.sab) {
          ringBuffer = new RingBufferWriter(msg.sab);
        }

        // Set up resampler
        contextSampleRate = msg.sampleRate || 48000;
        resamplerL = new LinearResampler(YM2610_SAMPLE_RATE, contextSampleRate);
        resamplerR = new LinearResampler(YM2610_SAMPLE_RATE, contextSampleRate);

        // Start autonomous tick
        z80.reset();
        lastAudioTime = 0;
        audioDebt = 0;
        intervalId = setInterval(runAudioTick, 4);

        self.postMessage({ type: 'ready' });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
      break;
    }

    case 'latch':
      z80Bus?.pushSoundLatch(msg.value);
      break;

    case 'rom-switch':
      // MAME/FBNeo: only change the ROM mapping, never reset Z80 or YM2610.
      // The Z80 continues executing from wherever it was (typically RAM idle loop).
      if (z80Bus) {
        z80Bus.setUseGameRom(msg.useGameRom);
      }
      break;


    case 'diag':
      self.postMessage({ type: 'diag', ymStats: (self as any).__getYmStats?.() ?? {}, frame: workerFrameCount });
      break;

    case 'reset':
      z80?.reset();
      ym2610?.reset();
      lastAudioTime = 0;
      audioDebt = 0;
      break;

    case 'suspend':
      suspended = true;
      break;

    case 'resume':
      suspended = false;
      lastAudioTime = 0;
      audioDebt = 0;
      break;

    case 'terminate':
      if (intervalId !== null) clearInterval(intervalId);
      suspended = true;
      break;
  }
};
