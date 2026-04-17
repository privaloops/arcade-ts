import { describe, it, expect } from 'vitest';
import { LinearResampler } from '../audio/resampler';

describe('LinearResampler', () => {
  it('identity resample (same rate) returns correct sample count', () => {
    const resampler = new LinearResampler(48000, 48000);
    const input = new Float32Array([0.1, 0.5, -0.3, 0.8, -1.0]);
    const output = new Float32Array(input.length + 2);

    const count = resampler.resample(input, input.length, output);

    expect(count).toBe(input.length);
    // Linear interpolation with frac=0 reads s0 (previous sample),
    // so output is delayed by one sample from input.
    // output[0] = prevSample (0), output[1] = input[0], etc.
    expect(output[0]).toBeCloseTo(0, 5);     // prevSample
    expect(output[1]).toBeCloseTo(0.1, 5);   // input[0]
    expect(output[2]).toBeCloseTo(0.5, 5);   // input[1]
  });

  it('downsampling produces fewer output frames', () => {
    const resampler = new LinearResampler(48000, 24000); // 2:1 downsample
    const input = new Float32Array(100);
    for (let i = 0; i < 100; i++) input[i] = Math.sin(i * 0.1);
    const output = new Float32Array(200);

    const count = resampler.resample(input, input.length, output);

    // ratio=2, so ~50 output samples
    expect(count).toBeGreaterThanOrEqual(49);
    expect(count).toBeLessThanOrEqual(51);
  });

  it('upsampling produces more output frames', () => {
    const resampler = new LinearResampler(24000, 48000); // 1:2 upsample
    const input = new Float32Array(100);
    for (let i = 0; i < 100; i++) input[i] = Math.sin(i * 0.1);
    const output = new Float32Array(300);

    const count = resampler.resample(input, input.length, output);

    // ratio=0.5, so ~200 output samples
    expect(count).toBeGreaterThanOrEqual(198);
    expect(count).toBeLessThanOrEqual(202);
  });

  it('DC signal (constant value) resamples to the same value after settling', () => {
    const resampler = new LinearResampler(44100, 48000);
    const dc = 0.75;
    const input = new Float32Array(200).fill(dc);
    const output = new Float32Array(400);

    const count = resampler.resample(input, input.length, output);

    // Skip initial samples (ramp-up from prevSample=0 to dc)
    for (let i = 5; i < count; i++) {
      expect(output[i]).toBeCloseTo(dc, 2);
    }
  });

  it('no output sample exceeds the input peak amplitude', () => {
    const resampler = new LinearResampler(44100, 48000);
    const input = new Float32Array(500);
    let peak = 0;
    for (let i = 0; i < 500; i++) {
      input[i] = Math.sin(i * 0.05) * 0.8;
      peak = Math.max(peak, Math.abs(input[i]!));
    }
    const output = new Float32Array(1000);

    const count = resampler.resample(input, input.length, output);

    for (let i = 0; i < count; i++) {
      // Linear interpolation never exceeds input range
      expect(Math.abs(output[i]!)).toBeLessThanOrEqual(peak + 1e-6);
    }
  });

  it('handles multiple consecutive resample calls (streaming)', () => {
    const resampler = new LinearResampler(48000, 48000);
    const chunk1 = new Float32Array([0.1, 0.2, 0.3]);
    const chunk2 = new Float32Array([0.4, 0.5, 0.6]);
    const output = new Float32Array(10);

    const c1 = resampler.resample(chunk1, chunk1.length, output);
    expect(c1).toBe(3);

    const c2 = resampler.resample(chunk2, chunk2.length, output);
    expect(c2).toBe(3);
    // First sample of chunk2: frac=0 → s0=prevSample (0.3 from chunk1)
    expect(output[0]).toBeCloseTo(0.3, 5);
  });
});
