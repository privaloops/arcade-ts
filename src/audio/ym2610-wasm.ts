/**
 * YM2610 — WASM wrapper
 *
 * Wraps the ymfm-based YM2610 WASM module for Neo-Geo audio.
 * API mirrors NukedOPMWasm for consistency.
 *
 * Source: ymfm by Aaron Giles (BSD-3-Clause)
 */

// @ts-ignore — Emscripten-generated ESM module loader
import createYM2610 from '../../wasm/ym2610.mjs';

/** Native sample rate: 8 MHz / 144 = 55556 Hz */
export const YM2610_SAMPLE_RATE = 55556;

interface YM2610Module {
  _ym2610_init(): void;
  _ym2610_reset(): void;
  _ym2610_write(port: number, data: number): void;
  _ym2610_read(port: number): number;
  _ym2610_clock_cycles(numCycles: number): number;
  _ym2610_generate(numSamples: number): number;
  _ym2610_get_sample_count(): number;
  _ym2610_get_samples_l(): number;  // returns pointer
  _ym2610_get_samples_r(): number;  // returns pointer
  _ym2610_drain_samples(count: number): void;
  _ym2610_get_sample_rate(): number;
  _ym2610_alloc_rom(size: number): number;  // returns pointer
  _ym2610_set_adpcm_a_size(size: number): void;
  _ym2610_get_irq(): boolean;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
}

let wasmModule: YM2610Module | null = null;
let wasmReady: Promise<YM2610Module> | null = null;

/** Initialize the WASM module (call once, awaitable) */
export async function initYM2610Wasm(): Promise<void> {
  if (wasmModule) return;
  if (!wasmReady) {
    wasmReady = createYM2610() as Promise<YM2610Module>;
  }
  wasmModule = await wasmReady;
  wasmModule._ym2610_init();
}

/**
 * YM2610 WASM chip interface.
 * Handles FM + SSG + ADPCM-A + ADPCM-B (all mixed internally by ymfm).
 */
export class YM2610Wasm {
  private irqCallback: ((asserted: boolean) => void) | null = null;

  constructor() {
    if (!wasmModule) {
      throw new Error('YM2610Wasm: call initYM2610Wasm() first');
    }
  }

  /**
   * Load V-ROM (ADPCM samples) into WASM heap.
   * For games with split ADPCM-A/B pools (separate V1/V2 ROMs),
   * pass adpcmASize to set the split point. ADPCM-B reads are
   * offset by adpcmASize in the combined buffer.
   */
  loadVRom(vromData: Uint8Array, adpcmASize?: number): void {
    const ptr = wasmModule!._ym2610_alloc_rom(vromData.length);
    wasmModule!.HEAPU8.set(vromData, ptr);
    // Set ADPCM-A/B split: default = full ROM (no split)
    wasmModule!._ym2610_set_adpcm_a_size(adpcmASize ?? vromData.length);
  }

  /** Write to YM2610 port (0=addr_lo, 1=data_lo, 2=addr_hi, 3=data_hi) */
  write(port: number, value: number): void {
    wasmModule!._ym2610_write(port, value);
  }

  /** Read from YM2610 port (0=status_lo, 1=data_lo, 2=status_hi, 3=data_hi) */
  read(port: number): number {
    return wasmModule!._ym2610_read(port);
  }

  /**
   * Clock the chip for N cycles. Returns IRQ flags.
   * bit 0 = IRQ asserted, bit 1 = IRQ cleared
   */
  clockCycles(numCycles: number): number {
    const flags = wasmModule!._ym2610_clock_cycles(numCycles);

    if (flags & 1) this.irqCallback?.(true);
    if (flags & 2) this.irqCallback?.(false);

    return flags;
  }

  /** Generate N samples directly (alternative to clockCycles) */
  generate(numSamples: number): number {
    return wasmModule!._ym2610_generate(numSamples);
  }

  /** Get number of samples available in internal buffer */
  getSampleCount(): number {
    return wasmModule!._ym2610_get_sample_count();
  }

  /**
   * Read samples from internal buffer.
   * Copies up to `count` samples into the provided Float32Arrays.
   */
  readSamples(bufL: Float32Array, bufR: Float32Array, count: number): number {
    const available = wasmModule!._ym2610_get_sample_count();
    const toRead = Math.min(count, available, bufL.length, bufR.length);

    if (toRead <= 0) return 0;

    const ptrL = wasmModule!._ym2610_get_samples_l();
    const ptrR = wasmModule!._ym2610_get_samples_r();
    const offsetL = ptrL >> 2; // float pointer to Float32Array index
    const offsetR = ptrR >> 2;

    bufL.set(wasmModule!.HEAPF32.subarray(offsetL, offsetL + toRead));
    bufR.set(wasmModule!.HEAPF32.subarray(offsetR, offsetR + toRead));

    wasmModule!._ym2610_drain_samples(toRead);
    return toRead;
  }

  /** Get native sample rate (55556 Hz) */
  getSampleRate(): number {
    return wasmModule!._ym2610_get_sample_rate();
  }

  /** Get current IRQ state */
  getIrq(): boolean {
    return wasmModule!._ym2610_get_irq();
  }

  /** Reset the chip */
  reset(): void {
    wasmModule!._ym2610_reset();
  }

  /** Set IRQ callback */
  setIrqCallback(cb: (asserted: boolean) => void): void {
    this.irqCallback = cb;
  }

}
