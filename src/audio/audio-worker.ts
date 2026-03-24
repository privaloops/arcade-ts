/**
 * Audio Worker — runs Z80 + YM2151 (WASM) + OKI6295 off the main thread.
 *
 * Runs autonomously at ~60fps via setInterval. The main thread only posts
 * sound latch commands as they arrive. The worker generates audio
 * independently and writes directly into the SharedArrayBuffer ring buffer.
 */

import { Z80, type Z80State } from '../cpu/z80';
import { Z80Bus, type Z80BusState } from '../memory/z80-bus';
import { initOPMWasm, NukedOPMWasm } from './nuked-opm-wasm';
import { OKI6295, type OKI6295State } from './oki6295';
import { LinearResampler } from './resampler';
import { YM2151_SAMPLE_RATE, OKI6295_SAMPLE_RATE } from '../constants';
import { RING_BUFFER_SAMPLES, SAB_DATA_OFFSET } from './audio-output';
import { VizWriter } from './audio-viz';

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

// Visualization
let vizWriter: VizWriter | null = null;

// Mute/Solo state
const fmMuted = new Uint8Array(8);       // 1 = channel is muted
let lastChannelMask = 0xFFF;             // all 12 channels audible
let lastYmAddr = 0;                      // last address written to YM2151

// YM2151 shadow register state (for visualization)
const ymKc = new Uint8Array(8);   // Key Code per channel
const ymKf = new Uint8Array(8);   // Key Fraction per channel
const ymKon = new Uint8Array(8);  // Key On per channel
const ymTl = new Uint8Array(32);  // Total Level per operator (8ch × 4ops)
const ymRl = new Uint8Array(8);       // Right/Left per channel
const ymConnect = new Uint8Array(8);  // Connection/algorithm per channel
const ymRlFull = new Uint8Array(8);   // Full 0x20 register value (RL+FB+connect)
const ymRlValid = new Uint8Array(8);  // 1 = Z80 has written register 0x20+ch

/** Carrier operator slot for each algorithm (0-7).
 *  In YM2151, the carrier is the last operator in the signal chain.
 *  For algorithms 0-3, only op4 (slot 3) is the carrier.
 *  For algo 4, ops 2+4 are carriers. For algo 5-6, ops 2+3+4. For algo 7, all 4.
 *  We simplify: always read op4 (slot 3 = channel + 24) as the primary carrier TL. */
function getCarrierTl(ch: number): number {
  return ymTl[ch + 24]!; // slot 3 (operator 4, offset = ch + 3*8)
}

/** Apply channel mask: just update mute flags. All muting happens in the
 *  Z80 write callback — we NEVER write to the WASM directly. */
function applyChannelMask(mask: number): void {
  if (mask === lastChannelMask) return;
  lastChannelMask = mask;

  for (let ch = 0; ch < 8; ch++) {
    fmMuted[ch] = (mask & (1 << ch)) === 0 ? 1 : 0;
  }

  if (oki6295) {
    oki6295.setVoiceMask((mask >> 8) & 0xF);
  }
}

function updateYmShadow(register: number, data: number): void {
  if (!vizWriter) return;

  if (register === 0x08) {
    // Key On/Off: bits 2-0 = channel, bits 6-3 = operator mask (M1,C1,M2,C2)
    const ch = data & 7;
    const opMask = (data >> 3) & 0xF;
    ymKon[ch] = opMask !== 0 ? 1 : 0;
    vizWriter.updateFmKon(ch, ymKon[ch]!);
    // Also update TL for this channel (carrier may have changed)
    vizWriter.updateFmTl(ch, getCarrierTl(ch));
  } else if (register >= 0x28 && register <= 0x2F) {
    const ch = register & 7;
    ymKc[ch] = data;
    vizWriter.updateFmKc(ch, data);
  } else if (register >= 0x30 && register <= 0x37) {
    const ch = register & 7;
    ymKf[ch] = data >> 2; // KF is bits 7-2
    vizWriter.updateFmKf(ch, ymKf[ch]!);
  } else if (register >= 0x60 && register <= 0x7F) {
    // TL: operator index = register & 0x1F
    const opIdx = register & 0x1F;
    ymTl[opIdx] = data & 0x7F;
    // Update carrier TL for the channel this operator belongs to
    const ch = opIdx & 7;
    vizWriter.updateFmTl(ch, getCarrierTl(ch));
  } else if (register >= 0x20 && register <= 0x27) {
    const ch = register & 7;
    ymRl[ch] = (data >> 6) & 3;
    ymConnect[ch] = data & 7;
    ymRlFull[ch] = data;
    ymRlValid[ch] = 1;
    vizWriter.updateFmRl(ch, ymRl[ch]!);
  }
}

// ── Autonomous frame generation ──────────────────────────────────────────

function runAudioFrame(): void {
  if (!z80 || !z80Bus || !ym2151 || !ringBuffer || suspended) return;

  // Skip if ring buffer is nearly full (we're ahead of the AudioWorklet)
  if (ringBuffer.freeSlots < 1024) return;

  // Read channel mask from main thread (mute/solo)
  if (vizWriter) {
    applyChannelMask(vizWriter.readChannelMask());
  }

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

  // Update OKI voice state in vizSAB
  if (vizWriter && oki6295) {
    const okiState = oki6295.getState();
    for (let v = 0; v < 4; v++) {
      const ch = okiState.channels[v];
      if (ch) {
        vizWriter.updateOki(v, ch.playing ? 1 : 0, 0, Math.round(ch.volume * 255), ch.signal);
      }
    }
  }
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
      const vizSab = msg.vizSab as SharedArrayBuffer | undefined;
      if (vizSab) vizWriter = new VizWriter(vizSab);

      // Init WASM OPM
      await initOPMWasm();
      ym2151 = new NukedOPMWasm();
      ym2151.reset();

      // Init Z80 bus and wire callbacks
      z80Bus = new Z80Bus();
      z80Bus.loadAudioRom(audioRom);

      z80Bus.setYm2151AddressWriteCallback((value: number) => {
        lastYmAddr = value;
        ym2151!.writeAddress(value);
      });
      z80Bus.setYm2151WriteCallback((register: number, data: number) => {
        updateYmShadow(register, data);

        // Intercept writes for muted channels — modify data, never block
        if (register >= 0x60 && register <= 0x7F && fmMuted[register & 7]) {
          ym2151!.writeData(0x7F); // silence: max attenuation
        } else if (register >= 0x20 && register <= 0x27 && fmMuted[register & 7]) {
          ym2151!.writeData(data & 0x3F); // clear RL output bits
        } else if (register === 0x08 && fmMuted[data & 7]) {
          ym2151!.writeData(data & 0x07); // key off: clear operator bits
        } else {
          ym2151!.writeData(data);
        }
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

    case 'getState': {
      // Return Z80 + Z80Bus + OKI + YM2151 state for save state
      const state: Record<string, unknown> = {};
      if (z80) state["z80"] = z80.getState();
      if (z80Bus) {
        state["z80Bus"] = z80Bus.getSerialState();
        state["z80WorkRam"] = Array.from(z80Bus.getWorkRam());
      }
      if (oki6295) state["oki"] = oki6295.getState();
      if (ym2151) state["opmHeap"] = ym2151.getHeapSnapshot();
      self.postMessage({ type: 'state', state });
      break;
    }

    case 'setState': {
      // Restore Z80 + Z80Bus + OKI state from save state
      const s = msg.state as Record<string, unknown>;
      if (s["z80"] && z80) z80.setState(s["z80"] as Z80State);
      if (s["z80Bus"] && z80Bus) {
        z80Bus.setSerialState(s["z80Bus"] as Z80BusState);
      }
      if (s["z80WorkRam"] && z80Bus) {
        z80Bus.getWorkRam().set(new Uint8Array(s["z80WorkRam"] as number[]));
      }
      if (s["oki"] && oki6295) {
        oki6295.setState(s["oki"] as OKI6295State);
      }
      // Restore YM2151 WASM heap if available
      if (s["opmHeap"] && ym2151) {
        ym2151.setHeapSnapshot(s["opmHeap"] as string);
      }
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
