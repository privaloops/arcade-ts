/**
 * QSound HLE — WASM wrapper
 *
 * Drop-in QSound DSP emulator backed by the MAME HLE code compiled to
 * WebAssembly via Emscripten. Same pattern as nuked-opm-wasm.ts.
 *
 * Original HLE: superctr & Valley Bell (BSD-3-Clause)
 * Source: https://github.com/mamedev/mame/blob/master/src/devices/sound/qsoundhle.cpp
 */

// @ts-ignore — Emscripten-generated ESM module loader
import createQSound from '../../wasm/qsound.mjs';

import { QSOUND_SAMPLE_RATE } from '../constants';

interface QSoundModule {
  _qs_init(): void;
  _qs_reset(): void;
  _qs_load_dsp_rom(ptr: number, count: number): void;
  _qs_set_sample_rom(ptr: number, size: number): void;
  _qs_write(offset: number, data: number): void;
  _qs_read(): number;
  _qs_tick(): void;
  _qs_generate(numSamples: number): void;
  _qs_get_sample_count(): number;
  _qs_get_samples_l(): number;  // returns pointer
  _qs_get_samples_r(): number;  // returns pointer
  _qs_drain_samples(count: number): void;
  _qs_get_sample_rate(): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
}

let wasmModule: QSoundModule | null = null;
let wasmReady: Promise<QSoundModule> | null = null;

/** Initialize the WASM module (call once, awaitable) */
export async function initQSoundWasm(): Promise<void> {
  if (wasmModule) return;
  if (!wasmReady) {
    wasmReady = createQSound() as Promise<QSoundModule>;
  }
  wasmModule = await wasmReady;
  wasmModule._qs_init();
}

/**
 * QSound HLE WASM — manages the DSP state and sample ROM in WASM memory.
 */
export class QSoundWasm {
  private sampleRomPtr = 0;
  private sampleRomSize = 0;

  constructor() {
    if (!wasmModule) {
      throw new Error('QSoundWasm: call initQSoundWasm() first');
    }
  }

  /**
   * Load the DSP internal ROM (dl-1425.bin).
   * Expected format: raw 16-bit LE words, 8192 bytes (4096 words).
   */
  loadDspRom(data: Uint8Array): void {
    const mod = wasmModule!;
    const wordCount = Math.min(data.length >> 1, 4096);
    const ptr = mod._malloc(wordCount * 2);
    mod.HEAPU8.set(data.subarray(0, wordCount * 2), ptr);
    mod._qs_load_dsp_rom(ptr, wordCount);
    mod._free(ptr);
  }

  /**
   * Load the QSound sample ROM (the "oki" field from GameDef, actually QSound PCM data).
   * Data is copied into WASM linear memory and kept alive until next call or destroy.
   */
  loadSampleRom(data: Uint8Array): void {
    const mod = wasmModule!;
    // Free previous allocation
    if (this.sampleRomPtr) {
      mod._free(this.sampleRomPtr);
    }
    this.sampleRomSize = data.length;
    this.sampleRomPtr = mod._malloc(data.length);
    mod.HEAPU8.set(data, this.sampleRomPtr);
    mod._qs_set_sample_rom(this.sampleRomPtr, data.length);
  }

  /**
   * Write to QSound registers (called by Z80 bus).
   *   offset 0: data high byte
   *   offset 1: data low byte
   *   offset 2: register address (triggers write)
   */
  write(offset: number, data: number): void {
    wasmModule!._qs_write(offset, data);
  }

  /**
   * Read QSound ready flag (0x00 = busy, 0x80 = ready).
   */
  read(): number {
    return wasmModule!._qs_read();
  }

  /**
   * Advance the QSound state machine by one sample tick.
   * Updates ready flag and internal state but does NOT buffer audio.
   */
  tick(): void {
    wasmModule!._qs_tick();
  }

  /**
   * Generate exactly 1 sample and buffer it in the WASM sample buffer.
   * Use this in the interleaved Z80 loop to collect samples in real-time.
   */
  generate1(): void {
    wasmModule!._qs_generate(1);
  }

  /**
   * Generate audio samples and copy from WASM buffer.
   */
  generateSamples(
    bufferL: Float32Array,
    bufferR: Float32Array,
    numSamples: number,
    startOffset: number = 0,
  ): void {
    const mod = wasmModule!;

    mod._qs_generate(numSamples);

    const available = mod._qs_get_sample_count();
    const toCopy = Math.min(numSamples, available);

    if (toCopy > 0) {
      const ptrL = mod._qs_get_samples_l() >> 2;
      const ptrR = mod._qs_get_samples_r() >> 2;

      for (let i = 0; i < toCopy; i++) {
        bufferL[startOffset + i] = mod.HEAPF32[ptrL + i]!;
        bufferR[startOffset + i] = mod.HEAPF32[ptrR + i]!;
      }
    }

    // Hold last sample for remainder
    if (toCopy < numSamples && toCopy > 0) {
      const lastL = bufferL[startOffset + toCopy - 1]!;
      const lastR = bufferR[startOffset + toCopy - 1]!;
      for (let i = toCopy; i < numSamples; i++) {
        bufferL[startOffset + i] = lastL;
        bufferR[startOffset + i] = lastR;
      }
    }

    if (toCopy > 0) {
      mod._qs_drain_samples(toCopy);
    }
  }

  /**
   * Read all accumulated samples from the WASM buffer into JS arrays.
   * Drains the WASM buffer. Returns the number of samples copied.
   */
  drainToBuffers(bufferL: Float32Array, bufferR: Float32Array): number {
    const mod = wasmModule!;
    const available = mod._qs_get_sample_count();
    if (available <= 0) return 0;

    const ptrL = mod._qs_get_samples_l() >> 2;
    const ptrR = mod._qs_get_samples_r() >> 2;
    const toCopy = Math.min(available, bufferL.length);

    for (let i = 0; i < toCopy; i++) {
      bufferL[i] = mod.HEAPF32[ptrL + i]!;
      bufferR[i] = mod.HEAPF32[ptrR + i]!;
    }

    mod._qs_drain_samples(toCopy);
    return toCopy;
  }

  getSampleRate(): number {
    return QSOUND_SAMPLE_RATE;
  }

  reset(): void {
    wasmModule!._qs_reset();
  }

  destroy(): void {
    if (this.sampleRomPtr) {
      wasmModule!._free(this.sampleRomPtr);
      this.sampleRomPtr = 0;
      this.sampleRomSize = 0;
    }
  }
}
