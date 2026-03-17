/**
 * OKI MSM6295 — 4-bit ADPCM decoder with 4 simultaneous voices
 *
 * Used on the CPS1 board for digitized sound effects (e.g. voice samples).
 * The Z80 communicates via memory-mapped I/O:
 *   - 0xF000: command write
 *   - 0xF002: status read (bit N = channel N playing)
 *
 * Command protocol (two-byte sequence):
 *   Byte 1: bit 7 set   → phrase select (bits 6-0 = phrase number 0-127)
 *   Byte 2:              → channel mask (bits 7-4) + volume attenuation (bits 3-0)
 *   Single byte: bit 7 clear → stop channels (bits 6-3 = channel stop mask)
 *
 * ROM layout:
 *   0x000-0x3FF: phrase table (128 entries × 8 bytes)
 *     Each entry: start_addr[3 bytes] + end_addr[3 bytes] + 2 unused
 *     Addresses are in nibble units (divide by 2 for byte offset)
 *   0x400+: ADPCM sample data (4-bit packed, high nibble first)
 */

/** OKI ADPCM step size table (49 entries) */
const STEP_TABLE: readonly number[] = [
  16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66,
  73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552,
];

/** Index adjustment per nibble value (lower 3 bits) */
const INDEX_ADJUST: readonly number[] = [-1, -1, -1, -1, 2, 4, 6, 8];

/** Volume attenuation table: maps 0-15 attenuation to linear scale (0 = max, 15 = silent) */
const VOLUME_TABLE: readonly number[] = (() => {
  const table: number[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    // Each step = -3dB → factor = 10^(-3*i/20)
    // At i=0: 1.0, i=1: ~0.708, ... i=15: ~0.00562
    table[i] = Math.pow(10, (-3 * i) / 20);
  }
  return table;
})();

/** CPS1 OKI6295 native sample rate */
const OKI_SAMPLE_RATE = 7575;

/** Number of simultaneous channels */
const NUM_CHANNELS = 4;

interface OKIChannel {
  playing: boolean;
  /** Current byte address in ROM */
  address: number;
  /** End byte address in ROM */
  endAddress: number;
  /** Whether next sample comes from the low nibble (false = high nibble first) */
  nibbleToggle: boolean;
  /** ADPCM decoder state: current signal value (12-bit signed, -2048..2047) */
  signal: number;
  /** ADPCM decoder state: step table index (0..48) */
  stepIndex: number;
  /** Volume multiplier (from attenuation lookup) */
  volume: number;
}

export class OKI6295 {
  private readonly rom: Uint8Array;
  private readonly channels: OKIChannel[];

  /**
   * Pending phrase number when the first byte of a two-byte command has been
   * received (bit 7 set). -1 means no pending phrase.
   */
  private pendingPhrase: number;

  constructor(rom: Uint8Array) {
    this.rom = rom;
    this.pendingPhrase = -1;

    this.channels = new Array(NUM_CHANNELS);
    for (let i = 0; i < NUM_CHANNELS; i++) {
      this.channels[i] = {
        playing: false,
        address: 0,
        endAddress: 0,
        nibbleToggle: false,
        signal: 0,
        stepIndex: 0,
        volume: 0,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Z80 bus interface
  // ---------------------------------------------------------------------------

  /**
   * Command register write (address 0xF000).
   *
   * Two-byte protocol:
   *   1) Byte with bit 7 set → stores phrase number, waits for byte 2
   *   2) Byte 2 → bits 7-4 select which channels to start, bits 3-0 = attenuation
   *
   * Single byte with bit 7 clear → bits 6-3 select which channels to stop.
   */
  write(value: number): void {
    value = value & 0xFF;

    if (this.pendingPhrase >= 0) {
      // This is byte 2: channel mask + volume
      const channelMask = (value >> 4) & 0x0F;
      const attenuation = value & 0x0F;
      const phrase = this.pendingPhrase;
      this.pendingPhrase = -1;

      // Look up phrase in ROM table
      const tableOffset = phrase * 8;
      if (tableOffset + 7 >= this.rom.length) {
        return; // invalid phrase, ignore
      }

      // Start/end addresses are 3 bytes each, big-endian, in nibble units
      const startNibble =
        (this.rom[tableOffset]! << 16) |
        (this.rom[tableOffset + 1]! << 8) |
        this.rom[tableOffset + 2]!;
      const endNibble =
        (this.rom[tableOffset + 3]! << 16) |
        (this.rom[tableOffset + 4]! << 8) |
        this.rom[tableOffset + 5]!;

      // Convert nibble addresses to byte addresses (divide by 2)
      const startByte = startNibble >> 1;
      const endByte = endNibble >> 1;

      if (startByte >= endByte || startByte >= this.rom.length) {
        return; // invalid range
      }

      // Start the selected channels
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (channelMask & (1 << (NUM_CHANNELS - 1 - ch))) {
          const channel = this.channels[ch]!;
          channel.playing = true;
          channel.address = startByte;
          channel.endAddress = endByte;
          channel.nibbleToggle = false;
          channel.signal = 0;
          channel.stepIndex = 0;
          channel.volume = VOLUME_TABLE[attenuation]!;
        }
      }
      return;
    }

    if (value & 0x80) {
      // Byte 1: phrase select — store and wait for byte 2
      this.pendingPhrase = value & 0x7F;
    } else {
      // Stop command: bits 6-3 = channel stop mask
      const stopMask = (value >> 3) & 0x0F;
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        if (stopMask & (1 << (NUM_CHANNELS - 1 - ch))) {
          this.channels[ch]!.playing = false;
        }
      }
    }
  }

  /**
   * Status register read (address 0xF002).
   * Returns a byte where bit N (3-0) is set if channel N is currently playing.
   * Bit layout: bit 3 = ch0 busy, bit 2 = ch1 busy, bit 1 = ch2 busy, bit 0 = ch3 busy.
   */
  read(): number {
    let status = 0;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      if (this.channels[ch]!.playing) {
        status |= 1 << (NUM_CHANNELS - 1 - ch);
      }
    }
    return status;
  }

  // ---------------------------------------------------------------------------
  // Audio generation
  // ---------------------------------------------------------------------------

  /**
   * Decode one ADPCM nibble for a channel, advancing its state.
   */
  private decodeNibble(channel: OKIChannel): number {
    if (channel.address >= channel.endAddress || channel.address >= this.rom.length) {
      channel.playing = false;
      return 0;
    }

    const byte = this.rom[channel.address]!;
    let nibble: number;

    if (!channel.nibbleToggle) {
      // High nibble first
      nibble = (byte >> 4) & 0x0F;
      channel.nibbleToggle = true;
    } else {
      // Low nibble, then advance address
      nibble = byte & 0x0F;
      channel.nibbleToggle = false;
      channel.address++;
    }

    // Standard OKI ADPCM decode
    const step = STEP_TABLE[channel.stepIndex]!;
    const delta = (step * (nibble & 7)) / 4 + step / 8;

    if (nibble & 8) {
      channel.signal -= delta;
    } else {
      channel.signal += delta;
    }

    // Clamp to 12-bit signed range
    if (channel.signal > 2047) {
      channel.signal = 2047;
    } else if (channel.signal < -2048) {
      channel.signal = -2048;
    }

    // Update step index
    channel.stepIndex += INDEX_ADJUST[nibble & 7]!;
    if (channel.stepIndex < 0) {
      channel.stepIndex = 0;
    } else if (channel.stepIndex > 48) {
      channel.stepIndex = 48;
    }

    return channel.signal;
  }

  /**
   * Generate audio samples into a Float32Array.
   *
   * Output is normalized to [-1, 1] float range. The buffer is filled with
   * `numSamples` mono samples at 7575 Hz. The caller is responsible for
   * resampling to the AudioContext sample rate.
   *
   * @param buffer  Destination buffer (must be at least `numSamples` long)
   * @param numSamples  Number of samples to generate
   */
  generateSamples(buffer: Float32Array, numSamples: number): void {
    for (let i = 0; i < numSamples; i++) {
      let mix = 0;

      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const channel = this.channels[ch]!;
        if (!channel.playing) {
          continue;
        }

        const sample = this.decodeNibble(channel);
        // Apply per-channel volume and accumulate
        mix += sample * channel.volume;
      }

      // Normalize: 12-bit signed × 4 channels max → range [-8192, 8191]
      // Divide by 2048 (single channel max) × 4 = 8192 to fit in [-1, 1]
      buffer[i] = mix / 8192;
    }
  }

  /** Native sample rate of the OKI6295 on the CPS1 board. */
  getSampleRate(): number {
    return OKI_SAMPLE_RATE;
  }
}
