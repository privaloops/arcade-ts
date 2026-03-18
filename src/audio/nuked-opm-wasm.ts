/**
 * Nuked OPM — WASM wrapper
 *
 * Drop-in replacement for the TypeScript NukedOPM class, backed by
 * the original C code compiled to WebAssembly via Emscripten.
 * ~3-5x faster than the mechanical C→TS port.
 *
 * Source: https://github.com/nukeykt/Nuked-OPM (opm.c / opm.h)
 * License: LGPL 2.1+
 */

// @ts-ignore — Emscripten-generated ESM module loader
import createOPM from '../../wasm/opm.mjs';

/** Native sample rate: 3579545 / 64 = 55930 Hz */
const OPM_NATIVE_SAMPLE_RATE = 55930;

interface OPMModule {
  _opm_init(): void;
  _opm_reset(): void;
  _opm_write_address(value: number): void;
  _opm_write_data(value: number): void;
  _opm_read_status(): number;
  _opm_read_irq(): number;
  _opm_clock_cycles(numCycles: number): number;
  _opm_get_sample_count(): number;
  _opm_get_samples_l(): number;  // returns pointer
  _opm_get_samples_r(): number;  // returns pointer
  _opm_drain_samples(count: number): void;
  _opm_get_sample_rate(): number;
  HEAPF32: Float32Array;
}

let wasmModule: OPMModule | null = null;
let wasmReady: Promise<OPMModule> | null = null;

/** Initialize the WASM module (call once, awaitable) */
export async function initOPMWasm(): Promise<void> {
  if (wasmModule) return;
  if (!wasmReady) {
    wasmReady = createOPM() as Promise<OPMModule>;
  }
  wasmModule = await wasmReady;
  wasmModule._opm_init();
}

/**
 * NukedOPM WASM — same API as the TS version in nuked-opm.ts
 */
export class NukedOPMWasm {
  private timerCallback: ((timerIndex: number) => void) | null = null;
  private irqClearCallback: (() => void) | null = null;

  constructor() {
    if (!wasmModule) {
      throw new Error('NukedOPMWasm: call initOPMWasm() first');
    }
  }

  writeAddress(value: number): void {
    wasmModule!._opm_write_address(value);
  }

  writeData(value: number): void {
    wasmModule!._opm_write_data(value);
  }

  readStatus(): number {
    return wasmModule!._opm_read_status();
  }

  /**
   * Clock the chip for N cycles. Handles IRQ callbacks.
   */
  clockCycles(numCycles: number): void {
    const flags = wasmModule!._opm_clock_cycles(numCycles);

    // flags: bit 0 = IRQ asserted, bit 1 = IRQ cleared
    //        bit 2 = timer A, bit 3 = timer B
    if (flags & 1) {
      if (this.timerCallback) {
        if (flags & 4) this.timerCallback(0); // Timer A
        if (flags & 8) this.timerCallback(1); // Timer B
      }
    } else if (flags & 2) {
      if (this.irqClearCallback) this.irqClearCallback();
    }
  }

  /**
   * Generate audio samples. Copies from WASM sample buffer.
   */
  generateSamples(
    bufferL: Float32Array,
    bufferR: Float32Array,
    numSamples: number,
    startOffset: number = 0,
  ): void {
    const mod = wasmModule!;
    const available = mod._opm_get_sample_count();
    const toCopy = Math.min(numSamples, available);

    if (toCopy > 0) {
      // Direct memory access — read from WASM heap
      const ptrL = mod._opm_get_samples_l() >> 2; // byte offset → float index
      const ptrR = mod._opm_get_samples_r() >> 2;

      for (let i = 0; i < toCopy; i++) {
        bufferL[startOffset + i] = mod.HEAPF32[ptrL + i]!;
        bufferR[startOffset + i] = mod.HEAPF32[ptrR + i]!;
      }
    }

    // Hold last sample for remainder (avoid zero-padding clicks)
    if (toCopy < numSamples && toCopy > 0) {
      const lastL = bufferL[startOffset + toCopy - 1]!;
      const lastR = bufferR[startOffset + toCopy - 1]!;
      for (let i = toCopy; i < numSamples; i++) {
        bufferL[startOffset + i] = lastL;
        bufferR[startOffset + i] = lastR;
      }
    }

    // Drain consumed samples (keeps excess for next frame)
    if (toCopy > 0) {
      mod._opm_drain_samples(toCopy);
    }
  }

  setTimerCallback(cb: (timerIndex: number) => void): void {
    this.timerCallback = cb;
  }

  setIrqClearCallback(cb: () => void): void {
    this.irqClearCallback = cb;
  }

  setExternalTimerMode(_enabled: boolean): void {
    // WASM version always uses external timer mode (clocked via clockCycles)
  }

  readIRQ(): boolean {
    return wasmModule!._opm_read_irq() !== 0;
  }

  getSampleRate(): number {
    return OPM_NATIVE_SAMPLE_RATE;
  }

  reset(): void {
    wasmModule!._opm_reset();
  }
}
