/**
 * AudioOutput — connects YM2151 + OKI6295 generators to browser audio output.
 *
 * Architecture:
 *   - AudioWorklet for real-time audio processing (low-latency)
 *   - SharedArrayBuffer ring buffer between main thread and worklet
 *   - Linear resampling: YM2151 (55930 Hz) and OKI6295 (7575 Hz) → context sample rate
 *   - Fallback to ScriptProcessorNode if AudioWorklet is unavailable
 *
 * Ring buffer layout (SharedArrayBuffer):
 *   [0..3]   : Int32 write pointer (main thread writes)
 *   [4..7]   : Int32 read pointer  (worklet reads)
 *   [8..]    : Float32 stereo interleaved samples (L0, R0, L1, R1, ...)
 *              total = RING_BUFFER_SAMPLES * 2 floats
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import { YM2151_SAMPLE_RATE, OKI6295_SAMPLE_RATE, QSOUND_SAMPLE_RATE } from '../constants';
import { LinearResampler } from './resampler';

/** Ring buffer capacity in stereo sample pairs */
export const RING_BUFFER_SAMPLES = 12288;

/** Byte offsets inside the SharedArrayBuffer */
export const SAB_DATA_OFFSET = 8; // Float32 data starts here

/** Total SharedArrayBuffer size in bytes */
const SAB_BYTE_LENGTH = SAB_DATA_OFFSET + RING_BUFFER_SAMPLES * 2 * 4;

// ---------------------------------------------------------------------------
// Worklet processor source (inlined as string, loaded via Blob URL)
// ---------------------------------------------------------------------------

/**
 * This string is the complete AudioWorkletProcessor source.
 * It runs in the AudioWorklet global scope (separate thread).
 *
 * The processor reads stereo interleaved samples from a SharedArrayBuffer
 * ring buffer written by the main thread. On underrun it outputs silence.
 */
const WORKLET_PROCESSOR_SOURCE = /* javascript */ `
const SAB_WRITE_PTR_OFFSET = 0;
const SAB_READ_PTR_OFFSET  = 4;
const SAB_DATA_OFFSET      = 8;
const RING_BUFFER_SAMPLES  = 12288;

class AudioRingBufferProcessor extends AudioWorkletProcessor {
  /** @type {SharedArrayBuffer | null} */
  _sab = null;
  /** @type {Int32Array | null} */
  _ctrl = null;
  /** @type {Float32Array | null} */
  _data = null;
  /** Last output values — held on underrun to fade out smoothly */
  _lastL = 0;
  _lastR = 0;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data.type === 'init') {
        this._sab  = e.data.sab;
        this._ctrl = new Int32Array(this._sab, 0, 2);        // [writePtr, readPtr]
        this._data = new Float32Array(this._sab, SAB_DATA_OFFSET, RING_BUFFER_SAMPLES * 2);
      }
    };
  }

  /**
   * @param {Float32Array[][]} _inputs  - unused
   * @param {Float32Array[][]} outputs
   * @returns {boolean}
   */
  process(_inputs, outputs) {
    const output = outputs[0];
    const left   = output[0];
    const right  = output[1];

    if (!left || !right) return true;

    const blockSize = left.length; // typically 128

    if (!this._ctrl || !this._data) {
      // Not yet initialised — output silence
      left.fill(0);
      right.fill(0);
      return true;
    }

    const writePtr = Atomics.load(this._ctrl, 0);
    let   readPtr  = Atomics.load(this._ctrl, 1);

    for (let i = 0; i < blockSize; i++) {
      // Available samples in the ring buffer
      const available = (writePtr - readPtr + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES;

      if (available < 1) {
        // Underrun — fade from last sample to zero (avoid hard click)
        const remaining = blockSize - i;
        for (let j = 0; j < remaining; j++) {
          const fade = 1.0 - j / remaining;
          left[i + j]  = this._lastL * fade;
          right[i + j] = this._lastR * fade;
        }
        this._lastL = 0;
        this._lastR = 0;
        break;
      }

      const base = (readPtr % RING_BUFFER_SAMPLES) * 2;
      this._lastL = this._data[base];
      this._lastR = this._data[base + 1];
      left[i]  = this._lastL;
      right[i] = this._lastR;
      readPtr  = (readPtr + 1) % RING_BUFFER_SAMPLES;
    }

    Atomics.store(this._ctrl, 1, readPtr);
    return true;
  }
}

registerProcessor('audio-ring-buffer-processor', AudioRingBufferProcessor);
`;

// ---------------------------------------------------------------------------
// RingBuffer (main-thread writer)
// ---------------------------------------------------------------------------

/**
 * Main-thread side of the SharedArrayBuffer ring buffer.
 * Writes stereo interleaved samples; the worklet reads them.
 */
class RingBuffer {
  private readonly ctrl: Int32Array;
  private readonly data: Float32Array;

  constructor(private readonly sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(sab, 0, 2);
    this.data = new Float32Array(sab, SAB_DATA_OFFSET, RING_BUFFER_SAMPLES * 2);
  }

  /** Number of free stereo sample slots in the buffer */
  get freeSlots(): number {
    const writePtr = Atomics.load(this.ctrl, 0);
    const readPtr = Atomics.load(this.ctrl, 1);
    // Leave one slot empty to distinguish full from empty
    return (RING_BUFFER_SAMPLES - 1 - ((writePtr - readPtr + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES));
  }

  /**
   * Write up to `numSamples` stereo pairs.
   * Returns the number of samples actually written (may be less on overflow).
   */
  write(left: Float32Array, right: Float32Array, numSamples: number): number {
    const free = this.freeSlots;
    const toWrite = Math.min(numSamples, free);

    let writePtr = Atomics.load(this.ctrl, 0);

    for (let i = 0; i < toWrite; i++) {
      const base = (writePtr % RING_BUFFER_SAMPLES) * 2;
      this.data[base] = left[i] ?? 0;
      this.data[base + 1] = right[i] ?? 0;
      writePtr = (writePtr + 1) % RING_BUFFER_SAMPLES;
    }

    Atomics.store(this.ctrl, 0, writePtr);
    return toWrite;
  }
}

// ---------------------------------------------------------------------------
// ScriptProcessorNode fallback (deprecated but universal)
// ---------------------------------------------------------------------------

/**
 * Fallback audio output using ScriptProcessorNode.
 * Only used when AudioWorklet is not available.
 */
class ScriptProcessorOutput {
  private readonly node: ScriptProcessorNode;
  private readonly bufferL: Float32Array;
  private readonly bufferR: Float32Array;
  private writePos = 0;
  private readPos = 0;

  constructor(
    private readonly context: AudioContext,
    bufferSize: number = 2048,
  ) {
    this.bufferL = new Float32Array(RING_BUFFER_SAMPLES);
    this.bufferR = new Float32Array(RING_BUFFER_SAMPLES);

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    this.node = context.createScriptProcessor(bufferSize, 0, 2);
    this.node.onaudioprocess = (e) => this._onAudioProcess(e);
    this.node.connect(context.destination);
  }

  private _onAudioProcess(e: AudioProcessingEvent): void {
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);

    for (let i = 0; i < outL.length; i++) {
      const available =
        (this.writePos - this.readPos + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES;

      if (available < 1) {
        outL[i] = 0;
        outR[i] = 0;
      } else {
        outL[i] = this.bufferL[this.readPos % RING_BUFFER_SAMPLES] ?? 0;
        outR[i] = this.bufferR[this.readPos % RING_BUFFER_SAMPLES] ?? 0;
        this.readPos = (this.readPos + 1) % RING_BUFFER_SAMPLES;
      }
    }
  }

  write(left: Float32Array, right: Float32Array, numSamples: number): void {
    const free =
      RING_BUFFER_SAMPLES -
      1 -
      ((this.writePos - this.readPos + RING_BUFFER_SAMPLES) % RING_BUFFER_SAMPLES);
    const toWrite = Math.min(numSamples, free);

    for (let i = 0; i < toWrite; i++) {
      const idx = this.writePos % RING_BUFFER_SAMPLES;
      this.bufferL[idx] = left[i] ?? 0;
      this.bufferR[idx] = right[i] ?? 0;
      this.writePos = (this.writePos + 1) % RING_BUFFER_SAMPLES;
    }
  }

  disconnect(): void {
    this.node.disconnect();
  }
}

// ---------------------------------------------------------------------------
// AudioOutput — public API
// ---------------------------------------------------------------------------

export class AudioOutput {
  private context: AudioContext | null = null;
  private sab: SharedArrayBuffer | null = null;
  private ringBuffer: RingBuffer | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessorOutput: ScriptProcessorOutput | null = null;
  /**
   * Inserted between the workletNode (or ScriptProcessor) and
   * ctx.destination so setVolume() affects the actual output stream.
   * The legacy `_volume` applied inside pushSamples/_mix only fires on
   * the ScriptProcessor mix path — with SharedArrayBuffer the worker
   * writes straight to the ring buffer and bypasses that multiply.
   */
  private masterGain: GainNode | null = null;

  /** Resampler for each channel type (created after context is known) */
  private ymResamplerL: LinearResampler | null = null;
  private ymResamplerR: LinearResampler | null = null;
  private okiResampler: LinearResampler | null = null;
  private qsResamplerL: LinearResampler | null = null;
  private qsResamplerR: LinearResampler | null = null;

  /** Scratch buffers (allocated once, reused every frame — zero GC pressure) */
  private ymResampledL: Float32Array = new Float32Array(12288);
  private ymResampledR: Float32Array = new Float32Array(12288);
  private okiResampledM: Float32Array = new Float32Array(12288);
  private _mixedL: Float32Array = new Float32Array(2048);
  private _mixedR: Float32Array = new Float32Array(2048);

  private _volume = 1.0;
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;

  constructor() {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Initialize the audio subsystem.
   * Safe to call multiple times — returns the same promise if already initializing.
   */
  async init(): Promise<void> {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    // Create AudioContext synchronously (must be in user gesture call stack)
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
    }

    const rate = this.context.sampleRate;

    this.ymResamplerL = new LinearResampler(YM2151_SAMPLE_RATE, rate);
    this.ymResamplerR = new LinearResampler(YM2151_SAMPLE_RATE, rate);
    this.okiResampler = new LinearResampler(OKI6295_SAMPLE_RATE, rate);
    this.qsResamplerL = new LinearResampler(QSOUND_SAMPLE_RATE, rate);
    this.qsResamplerR = new LinearResampler(QSOUND_SAMPLE_RATE, rate);

    if (this.context.audioWorklet && typeof SharedArrayBuffer !== 'undefined') {
      await this._initWorklet();
    } else {
      this._initScriptProcessor();
    }

    this._initialized = true;
  }

  /**
   * Push pre-mixed stereo audio from the emulator into the output buffer.
   *
   * `left` and `right` are raw samples from the emulator at the native
   * emulation rate. Resampling to the AudioContext sample rate happens here.
   *
   * For a simpler integration where the caller already provides samples at
   * the correct rate (and has done its own mix), pass both arrays with
   * `numSamples` frames.
   */
  pushSamples(left: Float32Array, right: Float32Array, numSamples: number): void {
    if (!this._initialized || numSamples <= 0) return;

    // Apply master volume in-place on a copy (avoid mutating caller's buffer)
    const scaledL = this._scaleAndClip(left, numSamples);
    const scaledR = this._scaleAndClip(right, numSamples);

    if (this.ringBuffer) {
      this.ringBuffer.write(scaledL, scaledR, numSamples);
    } else if (this.scriptProcessorOutput) {
      this.scriptProcessorOutput.write(scaledL, scaledR, numSamples);
    }
  }

  /**
   * Push YM2151 stereo samples (at 55930 Hz) and OKI6295 mono samples
   * (at 7575 Hz). This method handles resampling and mixing internally.
   *
   * @param ymLeft   YM2151 left channel samples at 55930 Hz
   * @param ymRight  YM2151 right channel samples at 55930 Hz
   * @param ymCount  Number of YM2151 samples
   * @param okiMono  OKI6295 mono samples at 7575 Hz
   * @param okiCount Number of OKI6295 samples
   */
  pushEmulatorSamples(
    ymLeft: Float32Array,
    ymRight: Float32Array,
    ymCount: number,
    okiMono: Float32Array,
    okiCount: number,
  ): void {
    if (!this._initialized) return;

    // Resample YM2151
    if (this.ymResampledL.length < ymCount * 4) {
      this.ymResampledL = new Float32Array(ymCount * 8);
      this.ymResampledR = new Float32Array(ymCount * 8);
    }
    const ymOutL = this.ymResampledL;
    const ymOutR = this.ymResampledR;
    const nYmL = this.ymResamplerL!.resample(ymLeft, ymCount, ymOutL);
    const nYmR = this.ymResamplerR!.resample(ymRight, ymCount, ymOutR);

    // Resample OKI6295
    if (this.okiResampledM.length < okiCount * 16) {
      this.okiResampledM = new Float32Array(okiCount * 32);
    }
    const okiOut = this.okiResampledM;
    const nOki = this.okiResampler!.resample(okiMono, okiCount, okiOut);

    // Mix: use the output count from YM (dominant), pad OKI if needed
    const nOut = nYmL;
    if (this._mixedL.length < nOut) {
      this._mixedL = new Float32Array(nOut * 2);
      this._mixedR = new Float32Array(nOut * 2);
    }
    const mixedL = this._mixedL;
    const mixedR = this._mixedR;

    // CPS1 is MONO: MAME routes both YM channels to a single speaker:
    //   ym2151.add_route(0, "mono", 0.35)   → L to mono at 0.35
    //   ym2151.add_route(1, "mono", 0.35)   → R to mono at 0.35
    //   OKIM6295.add_route(ALL_OUTPUTS, "mono", 0.30)
    // Mono output = ymL*0.35 + ymR*0.35 + oki*0.30
    //
    // CPS1 MAME route gains: YM2151 L/R → mono at 0.35 each, OKI → mono at 0.30.
    for (let i = 0; i < nOut; i++) {
      const oki = i < nOki ? (okiOut[i] ?? 0) : 0;
      const ymMono = (ymOutL[i] ?? 0) * 0.35 + (ymOutR[i] ?? 0) * 0.35;
      const mono = this._clip(ymMono + oki * 0.30) * this._volume;
      mixedL[i] = mono;
      mixedR[i] = mono;
    }


    if (this.ringBuffer) {
      this.ringBuffer.write(mixedL, mixedR, nOut);
    } else if (this.scriptProcessorOutput) {
      this.scriptProcessorOutput.write(mixedL, mixedR, nOut);
    }
  }

  /**
   * Push QSound stereo samples (at 24038 Hz).
   * Resamples to AudioContext rate and writes to output buffer.
   */
  pushQSoundSamples(
    left: Float32Array,
    right: Float32Array,
    count: number,
  ): void {
    if (!this._initialized || count <= 0) return;

    // Resample QSound 24038 Hz → context sample rate
    if (this.ymResampledL.length < count * 4) {
      this.ymResampledL = new Float32Array(count * 8);
      this.ymResampledR = new Float32Array(count * 8);
    }
    const nL = this.qsResamplerL!.resample(left, count, this.ymResampledL);
    const nR = this.qsResamplerR!.resample(right, count, this.ymResampledR);
    const nOut = Math.min(nL, nR);

    if (this._mixedL.length < nOut) {
      this._mixedL = new Float32Array(nOut * 2);
      this._mixedR = new Float32Array(nOut * 2);
    }

    // QSound is stereo — apply volume and soft limiter
    for (let i = 0; i < nOut; i++) {
      this._mixedL[i] = this._clip((this.ymResampledL[i] ?? 0) * this._volume);
      this._mixedR[i] = this._clip((this.ymResampledR[i] ?? 0) * this._volume);
    }

    if (this.ringBuffer) {
      this.ringBuffer.write(this._mixedL, this._mixedR, nOut);
    } else if (this.scriptProcessorOutput) {
      this.scriptProcessorOutput.write(this._mixedL, this._mixedR, nOut);
    }
  }

  /** Set master volume (0.0 = silent, 1.0 = full). Clamped automatically. */
  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    // The legacy `_volume` multiply lives on the ScriptProcessor mix
    // path; the AudioWorklet path has no such hook, so the value is
    // applied via a shared GainNode inserted in front of the output.
    if (this.masterGain && this.context) {
      // Ramp to avoid zipper noise on fast slider drags.
      this.masterGain.gain.setTargetAtTime(this._volume, this.context.currentTime, 0.01);
    }
  }

  /** Suspend audio output (e.g. when tab is hidden). */
  suspend(): void {
    this.context?.suspend().catch(() => {});
  }

  /** Resume audio output. Must have been initialized first. */
  resume(): void {
    this.context?.resume().catch(() => {});
  }

  /** Whether `init()` has been called and completed successfully. */
  isInitialized(): boolean {
    return this._initialized;
  }

  /** Expose the SharedArrayBuffer for use by the audio worker. */
  getSAB(): SharedArrayBuffer | null {
    return this.sab;
  }

  /**
   * Returns the AudioContext sample rate, or 48000 as a default before init.
   */
  getSampleRate(): number {
    return this.context?.sampleRate ?? 48000;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _initWorklet(): Promise<void> {
    const ctx = this.context!;

    // Create a Blob URL for the worklet processor source
    const blob = new Blob([WORKLET_PROCESSOR_SOURCE], {
      type: 'application/javascript',
    });
    const blobUrl = URL.createObjectURL(blob);

    try {
      await ctx.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    // Allocate the SharedArrayBuffer ring buffer
    this.sab = new SharedArrayBuffer(SAB_BYTE_LENGTH);
    this.ringBuffer = new RingBuffer(this.sab);

    // Create the worklet node (stereo output)
    this.workletNode = new AudioWorkletNode(ctx, 'audio-ring-buffer-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Send the SharedArrayBuffer to the worklet
    this.workletNode.port.postMessage({ type: 'init', sab: this.sab });

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.workletNode.connect(this.masterGain).connect(ctx.destination);
  }

  private _initScriptProcessor(): void {
    this.scriptProcessorOutput = new ScriptProcessorOutput(this.context!);
  }

  /**
   * Apply master volume and hard-clip to [-1, 1].
   * Returns a new Float32Array (does not mutate `src`).
   */
  private _scaleAndClip(src: Float32Array, numSamples: number): Float32Array {
    const out = new Float32Array(numSamples);
    const vol = this._volume;
    for (let i = 0; i < numSamples; i++) {
      out[i] = this._clip((src[i] ?? 0) * vol);
    }
    return out;
  }

  /** Soft limiter at ±0.95 — only compresses extreme peaks (multiple OKI channels).
   *  MAME route gains sum to 1.0; typical signal stays well below 0.95. */
  private _clip(s: number): number {
    if (s > 0.95) return 0.95 + 0.05 * Math.tanh((s - 0.95) * 10);
    if (s < -0.95) return -0.95 - 0.05 * Math.tanh((-s - 0.95) * 10);
    return s;
  }

}

