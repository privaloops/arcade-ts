/**
 * Simple linear interpolation resampler.
 * Converts a mono stream from `inputRate` to `outputRate`.
 */
export class LinearResampler {
  private readonly ratio: number;
  private phase = 0;
  private prevSample = 0;

  constructor(
    private readonly inputRate: number,
    private readonly outputRate: number,
  ) {
    this.ratio = inputRate / outputRate;
  }

  /**
   * Resample `input` (length `numInputSamples`) into `output`.
   * Returns the number of output samples written.
   */
  resample(
    input: Float32Array,
    numInputSamples: number,
    output: Float32Array,
  ): number {
    let outIdx = 0;

    while (this.phase < numInputSamples) {
      const idx = Math.floor(this.phase);
      const frac = this.phase - idx;

      const s0 = idx === 0 ? this.prevSample : (input[idx - 1] ?? 0);
      const s1 = input[idx] ?? 0;

      output[outIdx++] = s0 + frac * (s1 - s0);
      this.phase += this.ratio;
    }

    // Save the last input sample for the next call (cross-buffer interpolation)
    this.prevSample = input[numInputSamples - 1] ?? 0;
    // Carry over the fractional phase
    this.phase -= numInputSamples;

    return outIdx;
  }
}
