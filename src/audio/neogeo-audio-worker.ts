/**
 * Neo-Geo Audio Worker — runs Z80 + YM2610 (WASM) off the main thread.
 *
 * Same architecture as audio-worker.ts (CPS1):
 * - Autonomous setInterval(4ms) with debt accumulator
 * - Z80 runs independently, clocks YM2610 via WASM
 * - YM2610 outputs stereo FM+SSG+ADPCM mixed internally
 * - Single stereo resampler (55556 Hz → AudioContext rate)
 * - Output to SharedArrayBuffer ring buffer
 * - Register shadow → vizSAB for audio panel visualization
 */

import { Z80 } from '../cpu/z80';
import { NeoGeoZ80Bus } from '../memory/neogeo-z80-bus';
import { initYM2610Wasm, YM2610Wasm, YM2610_SAMPLE_RATE } from './ym2610-wasm';
import { LinearResampler } from './resampler';
import { NGO_Z80_CLOCK, NGO_YM2610_CLOCK, NGO_FRAME_RATE } from '../neogeo-constants';
import { RingBufferWriter, clip } from './audio-shared';
import { VizWriter, ssgPeriodToKc } from './audio-viz';

// ── Constants ──────────────────────────────────────────────────────────────

const FRAME_MS = 1000 / NGO_FRAME_RATE;
const Z80_CYCLES_PER_FRAME = Math.round(NGO_Z80_CLOCK / NGO_FRAME_RATE);
// YM2610 runs at 8 MHz, Z80 at 4 MHz → multiply Z80 T-states by this ratio
const YM_CLOCK_RATIO = NGO_YM2610_CLOCK / NGO_Z80_CLOCK; // = 2

// YM2610: 4 FM channels, 3 SSG, 6 ADPCM-A, 1 ADPCM-B
const FM_CHANNELS = 4;
const SSG_CHANNELS = 3;
// SSG clock = YM2610 clock / 4 = 2 MHz
const SSG_CLOCK = NGO_YM2610_CLOCK / 4;

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

// Visualization
let vizWriter: VizWriter | null = null;

// ── YM2610 register shadow (for visualization) ──────────────────────────

// FM shadow: 4 channels
const fmKc = new Uint8Array(4);
const fmKon = new Uint8Array(4);
const fmTl = new Uint8Array(16);      // 4 ch × 4 ops
const fmRl = new Uint8Array(4);
const fmConnect = new Uint8Array(4);
const fmFnum = new Uint16Array(4);
const fmBlock = new Uint8Array(4);

// SSG shadow: 3 channels
const ssgPeriod = new Uint16Array(3);
const ssgVolume = new Uint8Array(3);
const ssgToneEn = new Uint8Array(3);
const ssgKon = new Uint8Array(3);     // computed: toneEn && vol > 0

// ADPCM-A shadow: 6 channels
const adpcmAPlaying = new Uint8Array(6);
const adpcmAVolume = new Uint8Array(6);
const adpcmATotalVol = { value: 0 };
const adpcmATtl = new Int16Array(6);
const ADPCM_A_TTL_FRAMES = 20;

// ADPCM-B shadow
const adpcmBPlaying = { value: 0 };
const adpcmBVolume = { value: 0 };
let adpcmBTtl = 0;
const ADPCM_B_TTL_FRAMES = 120;

// Port address latches
let lastAddr0 = 0;
let lastAddr1 = 0;

// ADPCM-A per-channel start/end address registers (for sample capture)
const adpcmAStartH = new Uint8Array(6);
const adpcmAStartL = new Uint8Array(6);
const adpcmAEndH = new Uint8Array(6);
const adpcmAEndL = new Uint8Array(6);
// ADPCM-B start/end
let adpcmBStartH = 0, adpcmBStartL = 0, adpcmBEndH = 0, adpcmBEndL = 0;

// Captured sample addresses: Map<"start:end", {start, end, channel, type}>
interface CapturedSample { startByte: number; endByte: number; type: 'A' | 'B'; }
const capturedSamples = new Map<string, CapturedSample>();
let workerAdpcmASize = 0; // ADPCM-A pool size for B offset correction

// Mute/Solo state (read from vizSAB each frame)
// Bit layout: bits 0-3 = FM ch 0-3, bits 4-6 = SSG ch 0-2, bits 7-13 = PCM 0-6
const chMuted = new Uint8Array(14);  // 1 = muted
let lastChannelMask = 0xFFFF;

function applyChannelMask(mask: number): void {
  if (mask === lastChannelMask) return;
  lastChannelMask = mask;
  for (let i = 0; i < 14; i++) {
    const wasMuted = chMuted[i]!;
    const nowMuted = (mask & (1 << i)) === 0 ? 1 : 0;
    chMuted[i] = nowMuted;
    // Mute FM: key-off + max TL
    if (nowMuted && !wasMuted && i < FM_CHANNELS && ym2610) {
      const slot = i < 2 ? (i + 1) : (i - 2); // viz ch → OPN slot
      const portBit = i < 2 ? 0 : 4;
      ym2610.write(0, 0x28); ym2610.write(1, slot | portBit); // key-off
      for (let op = 0; op < 4; op++) {
        const opReg = 0x40 + (op << 2) + slot;
        if (i < 2) { ym2610.write(0, opReg); ym2610.write(1, 0x7F); }
        else { ym2610.write(2, opReg); ym2610.write(3, 0x7F); }
      }
    }
    // Mute SSG: set volume 0
    if (nowMuted && !wasMuted && i >= FM_CHANNELS && i < FM_CHANNELS + SSG_CHANNELS && ym2610) {
      const ssgCh = i - FM_CHANNELS;
      ym2610.write(0, 0x08 + ssgCh); ym2610.write(1, 0);
    }
    // Mute ADPCM-A: dump (key-off)
    if (nowMuted && !wasMuted && i >= FM_CHANNELS + SSG_CHANNELS && i < FM_CHANNELS + SSG_CHANNELS + 6 && ym2610) {
      const aCh = i - FM_CHANNELS - SSG_CHANNELS;
      ym2610.write(2, 0x00); ym2610.write(3, 0x80 | (1 << aCh)); // dump bit
    }
    // Mute ADPCM-B: stop
    if (nowMuted && !wasMuted && i === FM_CHANNELS + SSG_CHANNELS + 6 && ym2610) {
      ym2610.write(0, 0x10); ym2610.write(1, 0x01); // reset/stop
    }
  }
}

/**
 * Intercept a YM2610 write and modify/block it if the target channel is muted.
 * Returns: modified value (>=0) to write, or -1 to block the write entirely.
 */
function interceptMutedWrite(port: number, value: number): number {
  // Address port writes always pass through (we need them for register selection)
  if (port === 0 || port === 2) return value;

  // Data write to port 0
  if (port === 1) {
    const reg = lastAddr0;

    // FM Key On (reg 0x28): block operator bits for muted FM channels
    if (reg === 0x28) {
      const fmCh = slotToFmCh((value & 4) !== 0, value & 3);
      if (fmCh >= 0 && chMuted[fmCh]!) {
        return value & 0x07; // keep channel select, clear operator bits (= key-off)
      }
    }

    // FM TL (reg 0x40-0x4F) on port 0: max attenuation for muted channels
    if (reg >= 0x40 && reg <= 0x4F) {
      const fmCh = slotToFmCh(false, reg & 3);
      if (fmCh >= 0 && chMuted[fmCh]!) return 0x7F;
    }

    // SSG volume (reg 0x08-0x0A): zero for muted channels
    if (reg >= 0x08 && reg <= 0x0A) {
      if (chMuted[FM_CHANNELS + (reg - 0x08)]!) return 0;
    }

    // ADPCM-B start (reg 0x10): block start for muted ADPCM-B
    if (reg === 0x10 && chMuted[FM_CHANNELS + SSG_CHANNELS + 6]!) {
      return value & 0x01; // only allow stop/reset, block start
    }

    // ADPCM-B volume (reg 0x1B): zero for muted
    if (reg === 0x1B && chMuted[FM_CHANNELS + SSG_CHANNELS + 6]!) return 0;
  }

  // Data write to port 1
  if (port === 3) {
    const reg = lastAddr1;

    // ADPCM-A key on (reg 0x00): mask out muted channels
    if (reg === 0x00 && (value & 0x80) === 0) {
      // Key-on command: clear bits for muted channels
      let masked = value;
      for (let ch = 0; ch < 6; ch++) {
        if (chMuted[FM_CHANNELS + SSG_CHANNELS + ch]!) masked &= ~(1 << ch);
      }
      if ((masked & 0x3F) === 0) return -1; // all channels masked → skip write
      return masked;
    }

    // ADPCM-A per-channel volume (reg 0x08-0x0D): zero for muted
    if (reg >= 0x08 && reg <= 0x0D) {
      if (chMuted[FM_CHANNELS + SSG_CHANNELS + (reg - 0x08)]!) return value & 0xC0; // keep L/R, zero volume
    }

    // FM TL (reg 0x40-0x4F) on port 1: max attenuation for muted channels
    if (reg >= 0x40 && reg <= 0x4F) {
      const fmCh = slotToFmCh(true, reg & 3);
      if (fmCh >= 0 && chMuted[fmCh]!) return 0x7F;
    }
  }

  return value; // pass through unmodified
}

/**
 * YM2610 FM channel mapping (OPN-B):
 *   Port 0, slot 1 (reg & 3 == 1) → viz FM ch 0
 *   Port 0, slot 2 (reg & 3 == 2) → viz FM ch 1
 *   Port 1, slot 0 (reg & 3 == 0) → viz FM ch 2
 *   Port 1, slot 1 (reg & 3 == 1) → viz FM ch 3
 *   Slot 0 on port 0 and slot 2 on port 1 are unused on YM2610.
 */
const PORT0_SLOT_TO_CH: (number | -1)[] = [-1, 0, 1, -1]; // slot 0,1,2,3
const PORT1_SLOT_TO_CH: (number | -1)[] = [2, 3, -1, -1];

function slotToFmCh(isPort1: boolean, slot: number): number {
  return (isPort1 ? PORT1_SLOT_TO_CH : PORT0_SLOT_TO_CH)[slot] ?? -1;
}

/** Convert YM2610 F-Number + Block to YM2151-compatible KC for viz */
function fnumToKc(fnum: number, block: number): number {
  if (fnum === 0) return 0;
  // OPN freq = (fnum × Mclock) / (144 × 2^(21-block))
  // FM internal clock = YM2610 clock / 2 = 4 MHz
  const fmClock = NGO_YM2610_CLOCK / 2;
  const freq = (fnum * fmClock) / (144 * (1 << (21 - block)));
  const midi = 69 + 12 * Math.log2(freq / 440);
  if (midi < 12 || midi > 127) return 0;
  const octave = Math.floor(midi / 12) - 1;
  const semi = Math.round(midi) % 12;
  const SEMI_TO_KC = [14, 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13];
  return ((octave & 7) << 4) | (SEMI_TO_KC[semi] ?? 0);
}

/** Get carrier TL for an FM channel (operator 4 = slot 3) */
function getCarrierTl(ch: number): number {
  return fmTl[ch * 4 + 3]!;
}

/** Process FM per-operator register — immediate write to SAB (like CPS1) */
function shadowFmOperator(reg: number, value: number, isPort1: boolean): void {
  const slot = reg & 3;
  const fmCh = slotToFmCh(isPort1, slot);
  if (fmCh < 0) return;
  const opBlock = (reg >> 2) & 3;
  if (reg >= 0x40 && reg <= 0x4F) {
    fmTl[fmCh * 4 + opBlock] = value & 0x7F;
    vizWriter?.updateFmTl(fmCh, getCarrierTl(fmCh));
  }
}

/** Process FM per-channel register — immediate write to SAB (like CPS1) */
function shadowFmChannel(reg: number, value: number, isPort1: boolean): void {
  const slot = reg & 3;
  const fmCh = slotToFmCh(isPort1, slot);
  if (fmCh < 0) return;
  if (reg >= 0xA4 && reg <= 0xA6) {
    fmBlock[fmCh] = (value >> 3) & 7;
    fmFnum[fmCh] = (fmFnum[fmCh]! & 0xFF) | ((value & 0x07) << 8);
  } else if (reg >= 0xA0 && reg <= 0xA2) {
    fmFnum[fmCh] = (fmFnum[fmCh]! & 0x700) | value;
    fmKc[fmCh] = fnumToKc(fmFnum[fmCh]!, fmBlock[fmCh]!);
    vizWriter?.updateFmKc(fmCh, fmKc[fmCh]!);
  } else if (reg >= 0xB0 && reg <= 0xB2) {
    fmRl[fmCh] = (value >> 6) & 3;
    fmConnect[fmCh] = value & 7;
    vizWriter?.updateFmRl(fmCh, fmRl[fmCh]!);
    vizWriter?.updateFmConnect(fmCh, value & 0x3F);
  }
}

/** Shadow YM2610 register writes — immediate SAB writes (same approach as CPS1) */
function updateYm2610Shadow(port: number, value: number): void {
  if (port === 0) lastAddr0 = value;
  if (port === 2) lastAddr1 = value;

  if (port === 1) {
    const reg = lastAddr0;

    // SSG tone period
    if (reg <= 0x05) {
      const ch = reg >> 1;
      if (reg & 1) ssgPeriod[ch] = (ssgPeriod[ch]! & 0xFF) | ((value & 0x0F) << 8);
      else ssgPeriod[ch] = (ssgPeriod[ch]! & 0xF00) | value;
      vizWriter?.updateFmKc(FM_CHANNELS + ch, ssgPeriodToKc(ssgPeriod[ch]!, SSG_CLOCK));
    }
    // SSG mixer
    if (reg === 0x07) {
      for (let ch = 0; ch < SSG_CHANNELS; ch++) {
        ssgToneEn[ch] = ((value >> ch) & 1) === 0 || ((value >> (ch + 3)) & 1) === 0 ? 1 : 0;
        ssgKon[ch] = ssgToneEn[ch]! && ssgVolume[ch]! > 0 ? 1 : 0;
        vizWriter?.updateFmKon(FM_CHANNELS + ch, ssgKon[ch]!);
      }
    }
    // SSG volume
    if (reg >= 0x08 && reg <= 0x0A) {
      const ch = reg - 0x08;
      ssgVolume[ch] = (value & 0x10) ? 15 : (value & 0x0F);
      ssgKon[ch] = ssgToneEn[ch]! && ssgVolume[ch]! > 0 ? 1 : 0;
      vizWriter?.updateFmTl(FM_CHANNELS + ch, 127 - ((ssgVolume[ch]! * 127 / 15) | 0));
      vizWriter?.updateFmKon(FM_CHANNELS + ch, ssgKon[ch]!);
    }
    // ADPCM-B address registers
    if (reg === 0x12) adpcmBStartL = value;
    if (reg === 0x13) adpcmBStartH = value;
    if (reg === 0x14) adpcmBEndL = value;
    if (reg === 0x15) adpcmBEndH = value;
    // ADPCM-B control
    if (reg === 0x10) {
      // Capture sample on start
      if (value & 0x80) {
        // ADPCM-B addresses are relative to B pool — offset by A size
        const startAddr = ((adpcmBStartH << 8) | adpcmBStartL) * 256 + workerAdpcmASize;
        const endAddr = (((adpcmBEndH << 8) | adpcmBEndL) + 1) * 256 + workerAdpcmASize;
        if (endAddr > startAddr) {
          const key = `B:${startAddr}:${endAddr}`;
          if (!capturedSamples.has(key)) {
            capturedSamples.set(key, { startByte: startAddr, endByte: endAddr, type: 'B' });
          }
        }
      }
      if (value & 0x80) { adpcmBPlaying.value = 1; adpcmBTtl = ADPCM_B_TTL_FRAMES; }
      if (value & 0x01) { adpcmBPlaying.value = 0; adpcmBTtl = 0; }
      vizWriter?.updatePcm(6, adpcmBPlaying.value, 0, adpcmBVolume.value, 128);
    }
    if (reg === 0x1B) {
      adpcmBVolume.value = value;
      vizWriter?.updatePcm(6, adpcmBPlaying.value, 0, value, 128);
    }
    // FM Key On/Off
    if (reg === 0x28) {
      const fmCh = slotToFmCh((value & 4) !== 0, value & 3);
      if (fmCh >= 0) {
        fmKon[fmCh] = ((value >> 4) & 0x0F) !== 0 ? 1 : 0;
        vizWriter?.updateFmKon(fmCh, fmKon[fmCh]!);
        vizWriter?.updateFmTl(fmCh, getCarrierTl(fmCh));
      }
    }
    if (reg >= 0x30 && reg < 0xA0) shadowFmOperator(reg, value, false);
    if (reg >= 0xA0 && reg < 0xC0) shadowFmChannel(reg, value, false);
  }

  if (port === 3) {
    const reg = lastAddr1;
    // ADPCM-A address registers
    if (reg >= 0x10 && reg <= 0x15) adpcmAStartL[reg - 0x10] = value;
    if (reg >= 0x18 && reg <= 0x1D) adpcmAStartH[reg - 0x18] = value;
    if (reg >= 0x20 && reg <= 0x25) adpcmAEndL[reg - 0x20] = value;
    if (reg >= 0x28 && reg <= 0x2D) adpcmAEndH[reg - 0x28] = value;
    // ADPCM-A key on/off
    if (reg === 0x00) {
      const isKeyOn = (value & 0x80) === 0;
      for (let ch = 0; ch < 6; ch++) {
        if (value & (1 << ch)) {
          if (isKeyOn) {
            adpcmAPlaying[ch] = 1; adpcmATtl[ch] = ADPCM_A_TTL_FRAMES;
            // Capture sample address on key-on
            const startAddr = ((adpcmAStartH[ch]! << 8) | adpcmAStartL[ch]!) * 256;
            const endAddr = (((adpcmAEndH[ch]! << 8) | adpcmAEndL[ch]!) + 1) * 256;
            if (endAddr > startAddr) {
              const key = `A:${startAddr}:${endAddr}`;
              if (!capturedSamples.has(key)) {
                capturedSamples.set(key, { startByte: startAddr, endByte: endAddr, type: 'A' });
              }
            }
          } else {
            adpcmAPlaying[ch] = 0; adpcmATtl[ch] = 0;
          }
          const vol = Math.round(((63 - adpcmATotalVol.value) / 63) * ((31 - (adpcmAVolume[ch] ?? 0)) / 31) * 255);
          vizWriter?.updatePcm(ch, adpcmAPlaying[ch]!, 0, vol, 128);
        }
      }
    }
    if (reg === 0x01) adpcmATotalVol.value = value & 0x3F;
    if (reg >= 0x08 && reg <= 0x0D) {
      const ch = reg - 0x08;
      adpcmAVolume[ch] = value & 0x1F;
      const vol = Math.round(((63 - adpcmATotalVol.value) / 63) * ((31 - (value & 0x1F)) / 31) * 255);
      vizWriter?.updatePcm(ch, adpcmAPlaying[ch]!, 0, vol, 128);
    }
    if (reg >= 0x30 && reg < 0xA0) shadowFmOperator(reg, value, true);
    if (reg >= 0xA0 && reg < 0xC0) shadowFmChannel(reg, value, true);
  }
}

/** Tick ADPCM TTL counters — call once per frame */
function tickAdpcmTtl(): void {
  if (!vizWriter) return;
  for (let ch = 0; ch < 6; ch++) {
    if (adpcmATtl[ch]! > 0) {
      adpcmATtl[ch] = adpcmATtl[ch]! - 1;
      if (adpcmATtl[ch]! === 0) { adpcmAPlaying[ch] = 0; vizWriter.updatePcm(ch, 0, 0, 0, 128); }
    }
  }
  if (adpcmBTtl > 0) {
    adpcmBTtl--;
    if (adpcmBTtl === 0) { adpcmBPlaying.value = 0; vizWriter.updatePcm(6, 0, 0, 0, 128); }
  }
}

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

  // Read channel mask from main thread (mute/solo)
  if (vizWriter) applyChannelMask(vizWriter.readChannelMask());

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

  // Tick ADPCM auto-expire counters
  tickAdpcmTtl();
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

        // Visualization SAB
        if (msg.vizSab) {
          vizWriter = new VizWriter(msg.vizSab);
          // Neo-Geo: 4 FM + 3 SSG (mapped as FM 4-6) + 6 ADPCM-A + 1 ADPCM-B
          vizWriter.setLayout(4, 7, 3, 4);
        }

        // Wire Z80 bus to YM2610 + shadow + mute interception
        z80Bus.setYm2610WriteCallback((port, value) => {
          // Always update shadow (shows what Z80 intends, regardless of mute)
          updateYm2610Shadow(port, value);

          // Intercept writes for muted channels before they reach the WASM chip
          const modValue = interceptMutedWrite(port, value);
          if (modValue >= 0) ym2610!.write(port, modValue);
          // modValue < 0 means "block this write entirely"
        });
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
          workerAdpcmASize = msg.adpcmASize ?? 0;
          ym2610!.loadVRom(new Uint8Array(msg.voiceRom), workerAdpcmASize);
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
      if (z80Bus) {
        z80Bus.setUseGameRom(msg.useGameRom);
      }
      break;

    case 'scan-samples': {
      // Create a SEPARATE Z80 + bus to scan without affecting the live game
      if (!msg.biosZRom && !msg.audioRom) break;

      try {
        const scanBus = new NeoGeoZ80Bus();
        const scanZ80 = new Z80(scanBus);

        if (msg.biosZRom) scanBus.loadBiosRom(new Uint8Array(msg.biosZRom));
        if (msg.audioRom) scanBus.loadAudioRom(new Uint8Array(msg.audioRom));
        const scanAdpcmASize = msg.adpcmASize ?? 0;

        // Shadow ADPCM register writes from the scan Z80
        const scanSamples = new Map<string, CapturedSample>();
        const sAdpcmAStartH = new Uint8Array(6), sAdpcmAStartL = new Uint8Array(6);
        const sAdpcmAEndH = new Uint8Array(6), sAdpcmAEndL = new Uint8Array(6);
        let sAdpcmBStartH = 0, sAdpcmBStartL = 0, sAdpcmBEndH = 0, sAdpcmBEndL = 0;
        let sLastAddr1 = 0, sLastAddr0 = 0;

        // Intercept YM2610 writes to capture ADPCM addresses
        scanBus.setYm2610WriteCallback((port, value) => {
          // We don't have a real YM2610 for the scan — just capture registers
          if (port === 0) sLastAddr0 = value;
          if (port === 2) sLastAddr1 = value;

          if (port === 1) {
            const reg = sLastAddr0;
            // ADPCM-B address regs
            if (reg === 0x12) sAdpcmBStartL = value;
            if (reg === 0x13) sAdpcmBStartH = value;
            if (reg === 0x14) sAdpcmBEndL = value;
            if (reg === 0x15) sAdpcmBEndH = value;
            if (reg === 0x10 && (value & 0x80)) {
              // ADPCM-B addresses are relative to the B pool — offset by ADPCM-A size in combined V-ROM
              const s = ((sAdpcmBStartH << 8) | sAdpcmBStartL) * 256 + scanAdpcmASize;
              const e = (((sAdpcmBEndH << 8) | sAdpcmBEndL) + 1) * 256 + scanAdpcmASize;
              if (e > s) scanSamples.set(`B:${s}:${e}`, { startByte: s, endByte: e, type: 'B' });
            }
          }

          if (port === 3) {
            const reg = sLastAddr1;
            if (reg >= 0x10 && reg <= 0x15) sAdpcmAStartL[reg - 0x10] = value;
            if (reg >= 0x18 && reg <= 0x1D) sAdpcmAStartH[reg - 0x18] = value;
            if (reg >= 0x20 && reg <= 0x25) sAdpcmAEndL[reg - 0x20] = value;
            if (reg >= 0x28 && reg <= 0x2D) sAdpcmAEndH[reg - 0x28] = value;
            if (reg === 0x00 && (value & 0x80) === 0) {
              for (let ch = 0; ch < 6; ch++) {
                if (value & (1 << ch)) {
                  const s = ((sAdpcmAStartH[ch]! << 8) | sAdpcmAStartL[ch]!) * 256;
                  const e = (((sAdpcmAEndH[ch]! << 8) | sAdpcmAEndL[ch]!) + 1) * 256;
                  if (e > s) scanSamples.set(`A:${s}:${e}`, { startByte: s, endByte: e, type: 'A' });
                }
              }
            }
          }
        });
        // Stub YM2610 read: simulate timer overflow periodically
        let scanReadCount = 0;
        scanBus.setYm2610ReadCallback((port) => {
          scanReadCount++;
          if (port === 0) {
            // Status register: simulate Timer A overflow every ~50 reads
            return (scanReadCount % 50 < 5) ? 0x01 : 0x00;
          }
          return 0;
        });

        // Helper: run scan Z80 for N cycles with NMI + periodic IRQ
        function runScanZ80(cycles: number): void {
          let c = 0;
          let irqTimer = 0;
          while (c < cycles) {
            if (scanBus.shouldFireNmi()) scanZ80.nmi();
            const ran = scanZ80.step();
            c += ran;
            irqTimer += ran;
            // Simulate YM2610 timer IRQ every ~4000 cycles (~1ms at 4MHz)
            if (irqTimer >= 4000) {
              irqTimer -= 4000;
              scanZ80.setIrqLine(true);
              scanZ80.step(); // let it acknowledge
              scanZ80.setIrqLine(false);
            }
          }
        }

        // Init: let Z80 boot from BIOS
        scanZ80.reset();
        runScanZ80(300000);

        // Switch to game ROM
        scanBus.setUseGameRom(true);
        scanZ80.reset();
        runScanZ80(300000);

        // Send all possible sound commands
        for (let cmd = 0x01; cmd <= 0xFF; cmd++) {
          scanBus.pushSoundLatch(cmd);
          runScanZ80(30000);
        }

        const samples = Array.from(scanSamples.values()).sort((a, b) => a.startByte - b.startByte);
        self.postMessage({ type: 'samples', samples });
      } catch (err) {
        self.postMessage({ type: 'samples', samples: [] });
        console.error('[Scan] Error:', err);
      }
      break;
    }

    case 'patch-vrom':
      if (ym2610) {
        ym2610.patchVRom(msg.offset, new Uint8Array(msg.data));
      }
      break;

    case 'diag':
      self.postMessage({ type: 'diag', frame: workerFrameCount });
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
