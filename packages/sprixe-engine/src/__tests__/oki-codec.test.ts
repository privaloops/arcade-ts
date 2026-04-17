import { describe, it, expect } from 'vitest';
import {
  parsePhraseTable,
  decodeSample,
  encodeSample,
  replaceSampleInRom,
  OKI_SAMPLE_RATE,
  type PhraseInfo,
} from '../audio/oki-codec';
import { OKI6295 } from '../audio/oki6295';

// ── Helpers ──

function writePhraseEntry(rom: Uint8Array, id: number, start: number, end: number): void {
  const off = id * 8;
  rom[off] = (start >> 16) & 0xFF;
  rom[off + 1] = (start >> 8) & 0xFF;
  rom[off + 2] = start & 0xFF;
  rom[off + 3] = (end >> 16) & 0xFF;
  rom[off + 4] = (end >> 8) & 0xFF;
  rom[off + 5] = end & 0xFF;
}

function buildRomWithPhrases(entries: Array<{ id: number; start: number; end: number; fill?: number }>): Uint8Array {
  let maxEnd = 0x400;
  for (const e of entries) {
    if (e.end > maxEnd) maxEnd = e.end;
  }
  const rom = new Uint8Array(maxEnd + 0x100);
  for (const e of entries) {
    writePhraseEntry(rom, e.id, e.start, e.end);
    for (let i = e.start; i < e.end; i++) {
      rom[i] = e.fill ?? 0x77;
    }
  }
  return rom;
}

function makeSine(freq: number, sampleRate: number, durationSamples: number): Float32Array {
  const out = new Float32Array(durationSamples);
  for (let i = 0; i < durationSamples; i++) {
    out[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return out;
}

// ── Tests ──

describe('parsePhraseTable', () => {
  it('parses valid phrases with correct fields', () => {
    const rom = buildRomWithPhrases([
      { id: 0, start: 0x400, end: 0x410 },
      { id: 1, start: 0x410, end: 0x430 },
      { id: 2, start: 0x430, end: 0x440 },
    ]);
    const phrases = parsePhraseTable(rom);

    expect(phrases).toHaveLength(3);

    expect(phrases[0]).toEqual({
      id: 0, startByte: 0x400, endByte: 0x410,
      sizeBytes: 0x10, numSamples: 0x20,
      durationMs: Math.round(0x20 / OKI_SAMPLE_RATE * 1000),
    });

    expect(phrases[1]!.sizeBytes).toBe(0x20);
    expect(phrases[1]!.numSamples).toBe(0x40);

    expect(phrases[2]!.startByte).toBe(0x430);
    expect(phrases[2]!.endByte).toBe(0x440);
  });

  it('ignores entries where start >= end', () => {
    const rom = new Uint8Array(0x500);
    writePhraseEntry(rom, 0, 0x400, 0x400); // start == end
    writePhraseEntry(rom, 1, 0x410, 0x400); // start > end
    writePhraseEntry(rom, 2, 0x400, 0x410); // valid

    for (let i = 0x400; i < 0x410; i++) rom[i] = 0x77;

    const phrases = parsePhraseTable(rom);
    expect(phrases).toHaveLength(1);
    expect(phrases[0]!.id).toBe(2);
  });

  it('ignores entries with start >= rom.length', () => {
    const rom = new Uint8Array(0x100);
    writePhraseEntry(rom, 0, 0x200, 0x210); // start past end of ROM

    const phrases = parsePhraseTable(rom);
    expect(phrases).toHaveLength(0);
  });

  it('returns [] for empty ROM', () => {
    expect(parsePhraseTable(new Uint8Array(0))).toEqual([]);
  });

  it('returns [] for ROM too short for even one entry', () => {
    expect(parsePhraseTable(new Uint8Array(5))).toEqual([]);
  });
});

describe('decodeSample', () => {
  it('decodes nibbles to non-zero PCM', () => {
    const rom = buildRomWithPhrases([{ id: 0, start: 0x400, end: 0x410, fill: 0x77 }]);
    const phrase: PhraseInfo = {
      id: 0, startByte: 0x400, endByte: 0x410,
      sizeBytes: 0x10, numSamples: 0x20,
      durationMs: Math.round(0x20 / OKI_SAMPLE_RATE * 1000),
    };

    const pcm = decodeSample(rom, phrase);
    let hasNonZero = false;
    for (let i = 0; i < pcm.length; i++) {
      if (pcm[i] !== 0) { hasNonZero = true; break; }
    }
    expect(hasNonZero).toBe(true);
  });

  it('all samples are in [-1..1]', () => {
    const rom = buildRomWithPhrases([{ id: 0, start: 0x400, end: 0x440, fill: 0xFF }]);
    const phrase: PhraseInfo = {
      id: 0, startByte: 0x400, endByte: 0x440,
      sizeBytes: 0x40, numSamples: 0x80,
      durationMs: 0,
    };

    const pcm = decodeSample(rom, phrase);
    for (let i = 0; i < pcm.length; i++) {
      expect(pcm[i]).toBeGreaterThanOrEqual(-1);
      expect(pcm[i]).toBeLessThanOrEqual(1);
    }
  });

  it('returns numSamples samples', () => {
    const rom = buildRomWithPhrases([{ id: 0, start: 0x400, end: 0x420 }]);
    const phrase: PhraseInfo = {
      id: 0, startByte: 0x400, endByte: 0x420,
      sizeBytes: 0x20, numSamples: 0x40,
      durationMs: 0,
    };

    const pcm = decodeSample(rom, phrase);
    expect(pcm.length).toBe(0x40);
  });
});

describe('encodeSample', () => {
  it('encodes at native rate with correct size', () => {
    const sine = makeSine(440, OKI_SAMPLE_RATE, 200);
    const adpcm = encodeSample(sine, OKI_SAMPLE_RATE);

    expect(adpcm).toBeInstanceOf(Uint8Array);
    expect(adpcm.length).toBe(Math.ceil(200 / 2));
  });

  it('resamples from 44100 Hz to correct size', () => {
    const srcRate = 44100;
    const numSamples = 4410; // 100ms at 44100
    const sine = makeSine(440, srcRate, numSamples);
    const adpcm = encodeSample(sine, srcRate);

    const expectedSamples = Math.floor(numSamples * OKI_SAMPLE_RATE / srcRate);
    const expectedBytes = Math.ceil(expectedSamples / 2);

    expect(adpcm).toBeInstanceOf(Uint8Array);
    expect(adpcm.length).toBe(expectedBytes);
  });

  it('returns a Uint8Array', () => {
    const pcm = new Float32Array(100);
    const adpcm = encodeSample(pcm, OKI_SAMPLE_RATE);
    expect(adpcm).toBeInstanceOf(Uint8Array);
  });
});

describe('replaceSampleInRom', () => {
  it('replaces with smaller ADPCM: success, not truncated, silence padding', () => {
    const rom = buildRomWithPhrases([{ id: 0, start: 0x400, end: 0x420, fill: 0x77 }]);
    const adpcm = new Uint8Array(0x10);
    adpcm.fill(0x55);

    const result = replaceSampleInRom(rom, 0, adpcm);

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(false);

    // ADPCM data written
    for (let i = 0x400; i < 0x410; i++) {
      expect(rom[i]).toBe(0x55);
    }
    // Remainder padded with silence
    for (let i = 0x410; i < 0x420; i++) {
      expect(rom[i]).toBe(0x80);
    }
  });

  it('truncates when ADPCM is larger than slot', () => {
    const rom = buildRomWithPhrases([{ id: 0, start: 0x400, end: 0x410 }]);
    const adpcm = new Uint8Array(0x30); // much bigger than 0x10 slot
    adpcm.fill(0xAA);

    const result = replaceSampleInRom(rom, 0, adpcm);

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
  });

  it('fails for phrase offset outside ROM', () => {
    const rom = new Uint8Array(0x100);
    writePhraseEntry(rom, 0, 0x200, 0x210); // start past ROM

    const result = replaceSampleInRom(rom, 0, new Uint8Array(8));
    expect(result.success).toBe(false);
  });

  it('updates phrase table end pointer', () => {
    const rom = buildRomWithPhrases([{ id: 0, start: 0x400, end: 0x420 }]);
    const adpcm = new Uint8Array(0x08);
    adpcm.fill(0x33);

    replaceSampleInRom(rom, 0, adpcm);

    // Read back end pointer from phrase table
    const off = 0;
    const newEnd = ((rom[off + 3]! << 16) | (rom[off + 4]! << 8) | rom[off + 5]!) & 0x3FFFF;
    expect(newEnd).toBe(0x400 + 0x08);
  });
});

describe('roundtrip: encode → replace → parse → decode', () => {
  it('preserves signal shape through ADPCM roundtrip', () => {
    // Create a sine wave at OKI native rate
    const numSamples = 200;
    const original = makeSine(300, OKI_SAMPLE_RATE, numSamples);

    // Encode to ADPCM
    const adpcm = encodeSample(original, OKI_SAMPLE_RATE);

    // Build ROM with enough space
    const slotSize = adpcm.length + 0x20; // extra padding
    const rom = new Uint8Array(0x400 + slotSize + 0x100);
    writePhraseEntry(rom, 0, 0x400, 0x400 + slotSize);

    // Replace in ROM
    const result = replaceSampleInRom(rom, 0, adpcm);
    expect(result.success).toBe(true);

    // Parse phrase table
    const phrases = parsePhraseTable(rom);
    expect(phrases.length).toBeGreaterThanOrEqual(1);

    const phrase = phrases[0]!;
    expect(phrase.id).toBe(0);

    // Decode
    const decoded = decodeSample(rom, phrase);
    expect(decoded.length).toBe(phrase.numSamples);

    // Correlation check: count how often signs match
    // Only compare up to the actual encoded length (decoded may be longer due to padding)
    const compareLen = Math.min(numSamples, decoded.length);
    let signMatches = 0;
    let compared = 0;
    for (let i = 10; i < compareLen; i++) { // skip first few samples (encoder ramp-up)
      if (Math.abs(original[i]!) < 0.05) continue; // skip near-zero crossings
      compared++;
      if (Math.sign(original[i]!) === Math.sign(decoded[i]!)) signMatches++;
    }

    // At least 60% sign correlation (ADPCM is lossy + lo-fi processing)
    const correlation = compared > 0 ? signMatches / compared : 0;
    expect(correlation).toBeGreaterThan(0.6);
  });
});

describe('integration: replaced sample is played by OKI6295', () => {
  it('encode → replace → replaceRom → play produces non-zero output', () => {
    // 1. Build a ROM with a silent sample (0x80 = silence nibbles 8,0)
    const slotStart = 0x400;
    const slotEnd = 0x500;
    const romSize = slotEnd + 0x100;
    const rom = new Uint8Array(romSize);
    writePhraseEntry(rom, 0, slotStart, slotEnd);
    rom.fill(0x80, slotStart, slotEnd); // silence

    // 2. Create a sine wave and encode it
    const sine = makeSine(400, OKI_SAMPLE_RATE, 200);
    const adpcm = encodeSample(sine, OKI_SAMPLE_RATE);

    // 3. Replace the sample in ROM
    const result = replaceSampleInRom(rom, 0, adpcm);
    expect(result.success).toBe(true);

    // 4. Create OKI with the original (silent) ROM, then replaceRom with modified
    const originalRom = new Uint8Array(romSize);
    writePhraseEntry(originalRom, 0, slotStart, slotEnd);
    originalRom.fill(0x80, slotStart, slotEnd);

    const oki = new OKI6295(originalRom);
    oki.replaceRom(rom); // swap to the modified ROM

    // 5. Trigger playback: phrase 0 on channel 0, full volume
    oki.write(0x80); // phrase select: phrase 0
    oki.write(0x10); // channel mask = 0x1 (ch0), attenuation = 0x0

    // 6. Generate samples
    const numSamples = 100;
    const buffer = new Float32Array(numSamples);
    oki.generateSamples(buffer, numSamples);

    // 7. Verify output is non-zero (sine was played, not silence)
    let hasNonZero = false;
    for (let i = 0; i < numSamples; i++) {
      if (buffer[i] !== 0) { hasNonZero = true; break; }
    }
    expect(hasNonZero).toBe(true);

    // 8. Verify channel 0 reports as active
    const status = oki.read();
    expect(status & 0x01).toBe(1); // bit 0 = channel 0 playing
  });

  it('replacing a sample mid-playback does not crash', () => {
    // Build ROM with a sample long enough for two generate passes
    const slotStart = 0x400;
    const slotEnd = 0x600; // 0x200 bytes = 0x400 nibbles
    const romSize = slotEnd + 0x100;
    const rom = new Uint8Array(romSize);
    writePhraseEntry(rom, 0, slotStart, slotEnd);
    rom.fill(0x77, slotStart, slotEnd); // non-silence ADPCM data

    const oki = new OKI6295(rom);

    // Start playing phrase 0
    oki.write(0x80);
    oki.write(0x10);

    // Generate some samples (advances the read pointer mid-sample)
    const buf1 = new Float32Array(50);
    oki.generateSamples(buf1, 50);

    // Now replace ROM mid-playback with a new encoded sine
    const sine = makeSine(300, OKI_SAMPLE_RATE, 400);
    const adpcm = encodeSample(sine, OKI_SAMPLE_RATE);
    const rom2 = new Uint8Array(rom); // copy current ROM state
    replaceSampleInRom(rom2, 0, adpcm);
    oki.replaceRom(rom2);

    // Continue generating — must not throw, and must produce output
    const buf2 = new Float32Array(100);
    expect(() => oki.generateSamples(buf2, 100)).not.toThrow();

    // Verify samples are still being produced (channel should still be active
    // or have finished gracefully — either way, no crash)
    let hasNonZero = false;
    for (let i = 0; i < buf2.length; i++) {
      if (buf2[i] !== 0) { hasNonZero = true; break; }
    }
    // The channel was mid-playback, so it should still produce audio
    // (the address pointer is still within the sample range)
    expect(hasNonZero).toBe(true);
  });
});
