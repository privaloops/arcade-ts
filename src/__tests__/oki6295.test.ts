import { describe, it, expect } from 'vitest';
import { OKI6295 } from '../audio/oki6295';

// Build a minimal OKI ROM with one phrase
function buildTestRom(): Uint8Array {
  const rom = new Uint8Array(0x1000);
  // Phrase table entry 0: start=0x400, end=0x410
  const start = 0x000400;
  const end = 0x000410;
  rom[0] = (start >> 16) & 0xFF;
  rom[1] = (start >> 8) & 0xFF;
  rom[2] = start & 0xFF;
  rom[3] = (end >> 16) & 0xFF;
  rom[4] = (end >> 8) & 0xFF;
  rom[5] = end & 0xFF;

  // Fill sample data with non-zero nibbles
  for (let i = 0x400; i < 0x410; i++) {
    rom[i] = 0x77; // both nibbles = 7 (max positive step)
  }
  return rom;
}

describe('OKI6295', () => {
  it('starts with no channels playing', () => {
    const oki = new OKI6295(buildTestRom());
    // Status: bits 0-3 = channel playing, bits 4-7 = 0xF0
    expect(oki.read()).toBe(0xF0);
  });

  it('starts a phrase on command', () => {
    const oki = new OKI6295(buildTestRom());
    // Byte 1: phrase 0 (bit 7 set = phrase select)
    oki.write(0x80);
    // Byte 2: channel 0 (bit 4) + volume 0 (max)
    oki.write(0x10);
    // Channel 0 should now be playing
    expect(oki.read() & 0x01).toBe(1);
  });

  it('generates non-zero samples when playing', () => {
    const oki = new OKI6295(buildTestRom());
    oki.write(0x80); // phrase 0
    oki.write(0x10); // channel 0, max volume

    const buffer = new Float32Array(32);
    oki.generateSamples(buffer, 32);

    // Should have some non-zero samples (ADPCM decoded)
    let hasNonZero = false;
    for (let i = 0; i < 32; i++) {
      if (buffer[i] !== 0) { hasNonZero = true; break; }
    }
    expect(hasNonZero).toBe(true);
  });

  it('stops a channel on command', () => {
    const oki = new OKI6295(buildTestRom());
    oki.write(0x80);
    oki.write(0x10); // start channel 0
    expect(oki.read() & 0x01).toBe(1);

    // Stop command: bit 7 clear, bit 3 = stop channel 0
    oki.write(0x08);
    expect(oki.read() & 0x01).toBe(0);
  });

  it('sample rate is 7575 Hz', () => {
    const oki = new OKI6295(buildTestRom());
    expect(oki.getSampleRate()).toBe(7575);
  });
});
