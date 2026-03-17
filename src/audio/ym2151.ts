/**
 * YM2151 (OPM) — 4-Operator FM Synthesizer
 *
 * 8 channels, 4 operators per channel (M1, C1, M2, C2).
 * Clock: 3.579545 MHz, sample rate = clock / 64 = 55930 Hz.
 *
 * This is a software emulation targeting recognizable audio output.
 * Not cycle-accurate, but functionally correct for CPS1 music playback.
 *
 * Reference: YM2151 Application Manual, MAME ym2151.cpp
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const YM_CLOCK = 3_579_545;
const YM_RATE = Math.floor(YM_CLOCK / 64); // 55930 Hz

/** Number of channels */
const NUM_CHANNELS = 8;

/** Number of operators per channel */
const NUM_OPERATORS = 4;

/** Sine table size (10-bit phase → 10-bit output) */
const SINE_TABLE_SIZE = 1024;

/** Envelope generator output range: 0 (max volume) to 1023 (silence) */
const ENV_QUIET = 1023;

/** TL shift: TL is 7-bit (0-127), shifted left 3 to get 10-bit envelope range */
const TL_SHIFT = 3;

// ─── Envelope phases ─────────────────────────────────────────────────────────

const enum EnvPhase {
  Attack = 0,
  Decay1 = 1,
  Decay2 = 2,
  Release = 3,
  Off = 4,
}

// ─── Lookup tables ───────────────────────────────────────────────────────────

/**
 * Sine table: 10-bit phase input → 10-bit log-sin output.
 * The YM2151 uses a log-sin ROM internally. We approximate it.
 * Output is in "attenuation" units: 0 = full volume, higher = quieter.
 */
const sineTable = new Int32Array(SINE_TABLE_SIZE);

/**
 * Exponential table: converts log-attenuation to linear amplitude.
 * 10-bit input → 12-bit linear output (0-4095).
 */
const expTable = new Int32Array(4096);

/**
 * DT1 (detune 1) table.
 * Indexed by [dt1][keycode >> 2], gives phase increment offset.
 * Based on the YM2151 manual tables.
 */
const dt1Table: number[][] = [];

/**
 * Attack rate increment table.
 * Indexed by rate (0-63), gives the envelope increment per step.
 */
const attackRateTable = new Float64Array(64);

/**
 * Decay rate increment table.
 */
const decayRateTable = new Float64Array(64);

// Key Code to frequency multiplier for phase calculation
// The YM2151 uses a specific KC→frequency mapping.
// KC bits: octave (3 bits) | note (4 bits, but only 0-11 used)
// We compute frequency from KC + KF.

/**
 * Note frequency table: 16 entries (only 0-11 used, representing C# through C).
 * Values represent the base phase increment for octave 0.
 * These come from the YM2151 manual: frequency number for each note.
 */
const noteFreqTable = new Float64Array(16);

// Build lookup tables at module load time
function buildTables(): void {
  // ── Sine table (log-sin) ──
  // We store attenuation in 10-bit range.
  // sin(x) maps to -log2(|sin(x)|) * 256, essentially.
  for (let i = 0; i < SINE_TABLE_SIZE; i++) {
    // Phase: i / SINE_TABLE_SIZE represents 0..2*PI
    const phase = (i + 0.5) / SINE_TABLE_SIZE * Math.PI * 2;
    const sinVal = Math.sin(phase);
    if (Math.abs(sinVal) < 1e-10) {
      sineTable[i] = ENV_QUIET; // silence
    } else {
      // Convert to log-attenuation scale
      // -20*log10(|sin|) → but in YM units (0-1023 range)
      // Approximate: attenuation = -8 * 256 * log2(|sin|) / (10-bit range)
      const logAtt = -Math.log2(Math.abs(sinVal)) * 256;
      sineTable[i] = Math.min(ENV_QUIET, Math.round(logAtt));
    }
  }

  // ── Exponential table ──
  // Converts attenuation (0-4095) to linear amplitude (0-4095).
  // exp2(-x/256) scaled to 12-bit output.
  for (let i = 0; i < 4096; i++) {
    // Higher i = more attenuation = smaller output
    const linear = Math.pow(2, -(i / 256)) * 4095;
    expTable[i] = Math.round(linear);
  }

  // ── DT1 table ──
  // DT1 values 0-7 (but value 0 = no detune, 1-3 = positive, 5-7 = negative)
  // Based on the YM2151 detune table from the manual.
  const dt1Base: number[][] = [
    // dt1 = 0: no detune
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    // dt1 = 1
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8, 8],
    // dt1 = 2
    [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 16, 16, 16],
    // dt1 = 3
    [2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 22, 22, 22, 22],
  ];
  for (let d = 0; d < 8; d++) {
    const base = d < 4 ? dt1Base[d]! : dt1Base[d - 4]!;
    const sign = d < 4 ? 1 : -1;
    dt1Table[d] = new Array(32);
    for (let k = 0; k < 32; k++) {
      dt1Table[d]![k] = base[k]! * sign;
    }
  }

  // ── Rate tables ──
  // Attack: rate 0-3 = 0 (no attack), rate 62-63 = instant
  // The envelope counter increments at each sample; the rate determines
  // how much the envelope level changes.
  for (let rate = 0; rate < 64; rate++) {
    if (rate === 0) {
      attackRateTable[rate] = 0;
      decayRateTable[rate] = 0;
    } else if (rate >= 62) {
      attackRateTable[rate] = ENV_QUIET; // instant
      decayRateTable[rate] = ENV_QUIET;
    } else {
      // Approximate: higher rate = faster change
      // Attack doubles every 4 rates, starting from a base
      const effectiveRate = Math.min(63, rate);
      const shift = 11 - Math.floor(effectiveRate / 4);
      const select = effectiveRate & 3;
      const baseInc = (4 + select);
      if (shift > 0) {
        attackRateTable[rate] = baseInc / (1 << shift);
      } else {
        attackRateTable[rate] = baseInc * (1 << (-shift));
      }
      // Decay is about 1/3 the speed of attack for the same rate
      decayRateTable[rate] = attackRateTable[rate]! * 0.33;
    }
  }

  // ── Note frequency table ──
  // The YM2151 KC note field uses these note values:
  // 0=C#, 1=D, 2=D#, 4=E, 5=F, 6=F#, 8=G, 9=G#, 10=A, 12=A#, 13=B, 14=C
  // We map them to semitone offsets from C.
  // Phase increment = freq * 2^20 / sampleRate
  // Base frequencies for octave 0 (very low, we shift up by octave later).
  const noteMap = [
    // index: semitone offset
    // 0=C#, 1=D, 2=D#, 3=unused, 4=E, 5=F, 6=F#, 7=unused
    // 8=G, 9=G#, 10=A, 11=unused, 12=A#, 13=B, 14=C, 15=unused
    1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 0, 0
  ];
  const c0Freq = 32.7032; // C0 frequency in Hz
  for (let i = 0; i < 16; i++) {
    const semitone = noteMap[i]!;
    const freq = c0Freq * Math.pow(2, semitone / 12);
    // Phase increment per sample for octave 0
    // Phase accumulator is 20-bit (1<<20 = one full cycle)
    noteFreqTable[i] = (freq / YM_RATE) * (1 << 20);
  }
}

buildTables();

// ─── MUL (frequency multiplier) table ───────────────────────────────────────
// MUL=0 means ×0.5, MUL=1-15 means ×1 through ×15
function getMulFactor(mul: number): number {
  return mul === 0 ? 0.5 : mul;
}

// ─── Operator state ──────────────────────────────────────────────────────────

class Operator {
  // Phase
  phase: number = 0;          // 20-bit phase accumulator
  phaseInc: number = 0;       // phase increment per sample

  // Envelope
  envPhase: EnvPhase = EnvPhase.Off;
  envLevel: number = ENV_QUIET; // 0 = max vol, 1023 = silence
  totalLevel: number = 0;       // TL (0-127) << 3 = 0-1016

  // ADSR rates (raw register values)
  ar: number = 0;   // attack rate (0-31)
  d1r: number = 0;  // decay 1 rate (0-31)
  d2r: number = 0;  // decay 2 rate (0-31)
  rr: number = 0;   // release rate (0-15)
  d1l: number = 0;  // decay 1 level (0-15)

  // Effective rates (computed from raw + key scale)
  effAR: number = 0;
  effD1R: number = 0;
  effD2R: number = 0;
  effRR: number = 0;

  // D1L converted to envelope units (0-1023)
  d1lLevel: number = 0;

  // Key scale
  ks: number = 0;

  // Detune
  dt1: number = 0;   // 0-7
  dt2: number = 0;   // 0-3 (ignored in simplified version)

  // Multiplier
  mul: number = 0;   // 0-15

  // AMS enable
  amsEn: boolean = false;

  // Key on state
  keyOn: boolean = false;

  // Feedback (only for operator M1, stored per-channel but applied per-op)
  feedbackShift: number = 0;
  feedback0: number = 0;
  feedback1: number = 0;

  /**
   * Recompute effective rates from raw ADSR rates + key scale + key code.
   */
  computeRates(keyCode: number): void {
    const ksShift = keyCode >> (3 - this.ks); // key scale contribution
    this.effAR = Math.min(63, this.ar > 0 ? (this.ar * 2 + 1) + ksShift : 0);
    this.effD1R = Math.min(63, this.d1r > 0 ? (this.d1r * 2 + 1) + ksShift : 0);
    this.effD2R = Math.min(63, this.d2r > 0 ? (this.d2r * 2 + 1) + ksShift : 0);
    this.effRR = Math.min(63, (this.rr * 4 + 2) + ksShift);

    // D1L → envelope level threshold
    // D1L = 0 means level 0 (stay at max volume in D1 phase)
    // D1L = 15 means jump to silence
    this.d1lLevel = this.d1l === 15 ? ENV_QUIET : this.d1l * 64; // 0..960 approx
  }

  /**
   * Compute phase increment from channel key code, key fraction, detune and MUL.
   */
  computePhaseInc(keyCode: number, keyFraction: number): void {
    const octave = (keyCode >> 4) & 0x07;
    const note = keyCode & 0x0F;

    // Base phase increment from note table (octave 0)
    let baseInc = noteFreqTable[note & 0x0F]!;

    // Shift by octave
    baseInc *= (1 << octave);

    // Apply key fraction (KF is 6-bit, represents 1/64 of a semitone)
    // Each KF unit adds ~1/64 semitone
    if (keyFraction > 0) {
      baseInc *= Math.pow(2, keyFraction / (64 * 12));
    }

    // Apply DT1
    const dt1Idx = this.dt1 & 7;
    if (dt1Idx !== 0) {
      const kcDiv = Math.min(31, keyCode >> 1);
      const detune = dt1Table[dt1Idx]![kcDiv]!;
      baseInc += detune;
    }

    // Apply MUL
    baseInc *= getMulFactor(this.mul);

    this.phaseInc = Math.floor(baseInc);
  }

  /**
   * Trigger key on: reset phase, start attack.
   */
  keyOnEvent(): void {
    if (!this.keyOn) {
      this.keyOn = true;
      this.phase = 0;
      this.envPhase = EnvPhase.Attack;
      // Don't reset envLevel — real YM2151 starts attack from current level
    }
  }

  /**
   * Trigger key off: enter release phase.
   */
  keyOffEvent(): void {
    if (this.keyOn) {
      this.keyOn = false;
      this.envPhase = EnvPhase.Release;
    }
  }

  /**
   * Advance envelope by one sample.
   */
  updateEnvelope(): void {
    switch (this.envPhase) {
      case EnvPhase.Attack: {
        if (this.effAR >= 62) {
          // Instant attack
          this.envLevel = 0;
          this.envPhase = EnvPhase.Decay1;
        } else if (this.effAR > 0) {
          const rate = attackRateTable[this.effAR]!;
          // Attack: level decreases (towards 0 = loud)
          // YM2151 attack is exponential: increment depends on current level
          const step = 1 + Math.floor(rate * (this.envLevel / 64));
          this.envLevel -= step;
          if (this.envLevel <= 0) {
            this.envLevel = 0;
            this.envPhase = EnvPhase.Decay1;
          }
        }
        break;
      }
      case EnvPhase.Decay1: {
        if (this.effD1R > 0) {
          const rate = decayRateTable[this.effD1R]!;
          this.envLevel += rate;
          if (this.envLevel >= this.d1lLevel) {
            this.envLevel = this.d1lLevel;
            this.envPhase = EnvPhase.Decay2;
          }
        } else {
          // D1R = 0 means no decay, skip to D2
          this.envPhase = EnvPhase.Decay2;
        }
        break;
      }
      case EnvPhase.Decay2: {
        if (this.effD2R > 0) {
          const rate = decayRateTable[this.effD2R]!;
          this.envLevel += rate;
          if (this.envLevel >= ENV_QUIET) {
            this.envLevel = ENV_QUIET;
            this.envPhase = EnvPhase.Off;
          }
        }
        // D2R = 0 means sustain forever at D1L level
        break;
      }
      case EnvPhase.Release: {
        const rate = decayRateTable[this.effRR]!;
        // Release is faster than decay
        this.envLevel += rate * 3;
        if (this.envLevel >= ENV_QUIET) {
          this.envLevel = ENV_QUIET;
          this.envPhase = EnvPhase.Off;
        }
        break;
      }
      case EnvPhase.Off:
        this.envLevel = ENV_QUIET;
        break;
    }
  }

  /**
   * Calculate operator output.
   * @param modulation Phase modulation input from other operators (10-bit signed)
   * @param lfoAm LFO amplitude modulation (0-1023)
   * @returns Signed output (-8191..+8191 approx)
   */
  calcOutput(modulation: number, lfoAm: number): number {
    if (this.envPhase === EnvPhase.Off) return 0;

    // Phase: 20-bit accumulator, use top 10 bits + modulation
    const phaseIndex = ((this.phase >> 10) + modulation) & (SINE_TABLE_SIZE - 1);

    // Get log-sin attenuation
    let attenuation = sineTable[phaseIndex]!;

    // Add envelope attenuation
    let envTotal = this.envLevel + this.totalLevel;

    // Add LFO AM if enabled
    if (this.amsEn) {
      envTotal += lfoAm;
    }

    // Clamp
    if (envTotal > ENV_QUIET) envTotal = ENV_QUIET;

    attenuation += envTotal;

    // Clamp total attenuation
    if (attenuation >= 4096) return 0;

    // Convert from log to linear via exp table
    const linear = expTable[attenuation]!;

    // Sign from phase: top bit of 10-bit phase determines sign
    const sign = (((this.phase >> 10) + modulation) & (SINE_TABLE_SIZE >> 1)) ? -1 : 1;

    return sign * (linear >> 1); // scale down a bit
  }

  /**
   * Advance phase by one sample.
   */
  advancePhase(): void {
    this.phase = (this.phase + this.phaseInc) & 0xFFFFF; // 20-bit wrap
  }
}

// ─── Channel state ───────────────────────────────────────────────────────────

class Channel {
  /** 4 operators: M1 (idx 0), C1 (idx 1), M2 (idx 2), C2 (idx 3) */
  ops: Operator[];

  // Key code and fraction
  keyCode: number = 0;    // 7-bit: octave(3) | note(4)
  keyFraction: number = 0; // 6-bit

  // Connection algorithm (0-7)
  algorithm: number = 0;

  // Feedback level for M1 (0-7, 0=off)
  feedback: number = 0;

  // Stereo output: left and right enable
  leftEnable: boolean = true;
  rightEnable: boolean = true;

  // PMS / AMS
  pms: number = 0; // phase modulation sensitivity (0-7)
  ams: number = 0; // amplitude modulation sensitivity (0-3)

  constructor() {
    this.ops = [];
    for (let i = 0; i < NUM_OPERATORS; i++) {
      this.ops.push(new Operator());
    }
  }

  /**
   * Recompute all operator phase increments and rates.
   */
  updateFrequency(): void {
    for (let i = 0; i < NUM_OPERATORS; i++) {
      this.ops[i]!.computePhaseInc(this.keyCode, this.keyFraction);
      this.ops[i]!.computeRates(this.keyCode);
    }
  }

  /**
   * Generate one sample for this channel using the selected algorithm.
   * @param lfoPhase Current LFO phase modulation value
   * @param lfoAm Current LFO amplitude modulation value
   * @returns Output sample (signed, ~14-bit range)
   */
  generateSample(lfoPhase: number, lfoAm: number): number {
    const m1 = this.ops[0]!;
    const c1 = this.ops[1]!;
    const m2 = this.ops[2]!;
    const c2 = this.ops[3]!;

    // Apply PMS (vibrato) — simplified: modulate all operators' phases
    // PMS values: 0=0, 1=5ct, 2=10ct, 3=20ct, 4=50ct, 5=100ct, 6=400ct, 7=700ct
    // For simplicity, we skip per-sample PMS recalc — it would need phase inc modulation.
    // TODO: accurate PMS would modulate phaseInc based on lfoPhase.

    // AMS depth mapping: 0=0dB, 1=1.4dB, 2=5.9dB, 3=11.8dB
    const amsDepth = [0, 32, 128, 256][this.ams]!;
    const amValue = Math.floor((lfoAm * amsDepth) >> 8);

    // Feedback on M1
    let m1Mod = 0;
    if (this.feedback > 0) {
      m1Mod = (m1.feedback0 + m1.feedback1) >> (10 - this.feedback);
    }

    // Calculate each operator's output
    const m1Out = m1.calcOutput(m1Mod, amValue);

    // Store M1 feedback
    m1.feedback1 = m1.feedback0;
    m1.feedback0 = m1Out >> 1;

    let output = 0;

    // 8 algorithms define how M1, C1, M2, C2 connect.
    // In each algorithm, operators can be modulators (feed into others)
    // or carriers (contribute to final output).
    //
    // Operator slot mapping (YM2151 ordering):
    //   Slot 0 = M1, Slot 1 = M2, Slot 2 = C1, Slot 3 = C2
    // BUT for register layout, the order in memory is M1, C1, M2, C2
    // i.e. ops[0]=M1, ops[1]=C1, ops[2]=M2, ops[3]=C2
    //
    // Algorithm diagrams (arrows = modulation, final sum = output):

    switch (this.algorithm) {
      case 0: {
        // M1→C1→M2→C2 (serial)
        // Only C2 is carrier
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(c1Out >> 1, amValue);
        output = c2.calcOutput(m2Out >> 1, amValue);
        break;
      }
      case 1: {
        // (M1+C1)→M2→C2
        const c1Out = c1.calcOutput(0, amValue);
        const sum = (m1Out + c1Out) >> 1;
        const m2Out = m2.calcOutput(sum >> 1, amValue);
        output = c2.calcOutput(m2Out >> 1, amValue);
        break;
      }
      case 2: {
        // (M1+(C1→M2))→C2
        const c1Out = c1.calcOutput(0, amValue);
        const m2Out = m2.calcOutput(c1Out >> 1, amValue);
        output = c2.calcOutput((m1Out + m2Out) >> 2, amValue);
        break;
      }
      case 3: {
        // ((M1→C1)+M2)→C2
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        output = c2.calcOutput((c1Out + m2Out) >> 2, amValue);
        break;
      }
      case 4: {
        // (M1→C1) + (M2→C2), two pairs
        // Carriers: C1, C2
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const c2Out = c2.calcOutput(m2.calcOutput(0, amValue) >> 1, amValue);
        output = (c1Out + c2Out) >> 1;
        break;
      }
      case 5: {
        // M1→(C1+M2+C2), M1 feeds all three
        // Carriers: C1, M2, C2
        const mod = m1Out >> 1;
        const c1Out = c1.calcOutput(mod, amValue);
        const m2Out = m2.calcOutput(mod, amValue);
        const c2Out = c2.calcOutput(mod, amValue);
        output = (c1Out + m2Out + c2Out) / 3;
        break;
      }
      case 6: {
        // M1→C1, M2, C2 independent (M1 modulates C1 only)
        // Carriers: C1, M2, C2
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        const c2Out = c2.calcOutput(0, amValue);
        output = (c1Out + m2Out + c2Out) / 3;
        break;
      }
      case 7: {
        // All four independent (no modulation except M1 self-feedback)
        // Carriers: M1, C1, M2, C2
        const c1Out = c1.calcOutput(0, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        const c2Out = c2.calcOutput(0, amValue);
        output = (m1Out + c1Out + m2Out + c2Out) >> 2;
        break;
      }
    }

    // Advance all operator phases
    m1.advancePhase();
    c1.advancePhase();
    m2.advancePhase();
    c2.advancePhase();

    // Advance all envelopes
    m1.updateEnvelope();
    c1.updateEnvelope();
    m2.updateEnvelope();
    c2.updateEnvelope();

    return output;
  }
}

// ─── LFO ─────────────────────────────────────────────────────────────────────

class LFO {
  phase: number = 0;
  phaseInc: number = 0;
  waveform: number = 0; // 0=saw, 1=square, 2=triangle, 3=noise (we simplify to sine)

  amd: number = 0; // amplitude modulation depth (0-127)
  pmd: number = 0; // phase modulation depth (0-127)

  // Noise LFSR for noise waveform
  noiseState: number = 1;

  /**
   * Set LFO frequency from register value.
   * The YM2151 LFO frequency table maps 0-255 to ~0.008Hz to ~32.6Hz.
   */
  setFrequency(value: number): void {
    // Approximate: LFO freq increases roughly exponentially
    // LFO period in samples: from very slow (value=0) to fast (value=255)
    if (value === 0) {
      this.phaseInc = 0;
    } else {
      // Approximate the YM2151 LFO frequency curve
      const freqHz = 0.008 * Math.pow(2, value / 32);
      this.phaseInc = (freqHz / YM_RATE) * (1 << 20);
    }
  }

  /**
   * Advance LFO and return [phaseModulation, amplitudeModulation].
   * Phase mod output: signed value scaled by PMD.
   * Amplitude mod output: unsigned value (0..max) scaled by AMD.
   */
  advance(): [number, number] {
    this.phase = (this.phase + this.phaseInc) & 0xFFFFF;

    const phaseNorm = this.phase / (1 << 20); // 0..1

    let waveVal: number; // -1..+1 for phase mod
    let amWaveVal: number; // 0..1 for amplitude mod

    switch (this.waveform) {
      case 0: // Sawtooth
        waveVal = 2 * phaseNorm - 1;
        amWaveVal = phaseNorm;
        break;
      case 1: // Square
        waveVal = phaseNorm < 0.5 ? 1 : -1;
        amWaveVal = phaseNorm < 0.5 ? 1 : 0;
        break;
      case 2: // Triangle
        waveVal = phaseNorm < 0.5
          ? 4 * phaseNorm - 1
          : 3 - 4 * phaseNorm;
        amWaveVal = phaseNorm < 0.5
          ? 2 * phaseNorm
          : 2 - 2 * phaseNorm;
        break;
      case 3: // Noise
        // Simple LFSR-based random
        this.noiseState ^= (this.noiseState << 13);
        this.noiseState ^= (this.noiseState >> 17);
        this.noiseState ^= (this.noiseState << 5);
        waveVal = (this.noiseState & 0xFFFF) / 32768 - 1;
        amWaveVal = Math.abs(waveVal);
        break;
      default:
        waveVal = Math.sin(2 * Math.PI * phaseNorm);
        amWaveVal = (waveVal + 1) / 2;
    }

    const phaseMod = Math.floor(waveVal * this.pmd);
    const ampMod = Math.floor(amWaveVal * this.amd * 4); // scale to envelope units

    return [phaseMod, ampMod];
  }

  reset(): void {
    this.phase = 0;
  }
}

// ─── Noise generator ─────────────────────────────────────────────────────────

class NoiseGenerator {
  enabled: boolean = false;
  frequency: number = 0; // 5-bit (0-31)
  lfsr: number = 0x7FFF; // 15-bit LFSR
  counter: number = 0;
  output: number = 0;

  /**
   * Advance noise generator by one sample.
   * Returns noise output as signed value.
   */
  advance(): number {
    if (!this.enabled) return 0;

    this.counter++;
    const period = (32 - this.frequency) * 16;
    if (this.counter >= period) {
      this.counter = 0;
      // 15-bit LFSR: feedback from bits 0 and 1
      const bit = ((this.lfsr >> 0) ^ (this.lfsr >> 1)) & 1;
      this.lfsr = ((this.lfsr >> 1) | (bit << 14)) & 0x7FFF;
      this.output = (this.lfsr & 1) ? 4095 : -4095;
    }
    return this.output;
  }
}

// ─── Timer ───────────────────────────────────────────────────────────────────

class Timer {
  period: number = 0;          // in samples
  counter: number = 0;
  enabled: boolean = false;
  overflow: boolean = false;   // overflow flag
  irqEnable: boolean = false;  // IRQ mask

  /**
   * Advance timer by one sample.
   * @returns true if timer overflowed this sample.
   */
  advance(): boolean {
    if (!this.enabled) return false;

    this.counter++;
    if (this.counter >= this.period) {
      this.counter = 0;
      this.overflow = true;
      return true;
    }
    return false;
  }

  reset(): void {
    this.counter = 0;
    this.overflow = false;
  }
}

// ─── YM2151 main class ──────────────────────────────────────────────────────

export class YM2151 {
  private channels: Channel[];
  private lfo: LFO;
  private noise: NoiseGenerator;
  private timerA: Timer;
  private timerB: Timer;

  // Register state
  private registers: Uint8Array;
  private selectedRegister: number;

  // Timer raw values
  private timerAHigh: number; // top 8 bits of 10-bit timer A value
  private timerALow: number;  // bottom 2 bits
  private timerBValue: number;

  // Timer callback (for Z80 IRQ assert)
  private timerCallback: ((timerIndex: number) => void) | null;

  // IRQ line clear callback (called when all overflow flags are cleared)
  private irqClearCallback: (() => void) | null;

  // Busy flag (simulated: set briefly after writes)
  private busyCycles: number;

  // CT1/CT2 output pins
  private ct1: boolean;
  private ct2: boolean;

  // When true, generateSamples() skips timer advancement
  // (timers are ticked externally via tickTimers())
  private _externalTimerMode: boolean;

  constructor() {
    this.channels = [];
    for (let i = 0; i < NUM_CHANNELS; i++) {
      this.channels.push(new Channel());
    }
    this.lfo = new LFO();
    this.noise = new NoiseGenerator();
    this.timerA = new Timer();
    this.timerB = new Timer();

    this.registers = new Uint8Array(256);
    this.selectedRegister = 0;
    this.timerAHigh = 0;
    this.timerALow = 0;
    this.timerBValue = 0;
    this.timerCallback = null;
    this.irqClearCallback = null;
    this.busyCycles = 0;
    this.ct1 = false;
    this.ct2 = false;
    this._externalTimerMode = false;
  }

  // ── Public interface ─────────────────────────────────────────────────────

  /**
   * Called by Z80 bus when writing to 0xF006 (register select).
   */
  writeAddress(value: number): void {
    this.selectedRegister = value & 0xFF;
  }

  /**
   * Called by Z80 bus when writing to 0xF008 (register data).
   */
  writeData(value: number): void {
    value = value & 0xFF;
    const reg = this.selectedRegister;
    this.registers[reg] = value;
    this.busyCycles = 64; // ~64 internal cycles of busy time

    this.writeRegister(reg, value);
  }

  /**
   * Read status register.
   * Bit 7: busy flag
   * Bit 1: timer B overflow
   * Bit 0: timer A overflow
   */
  readStatus(): number {
    let status = 0;
    if (this.busyCycles > 0) status |= 0x80;
    if (this.timerA.overflow && this.timerA.irqEnable) status |= 0x01;
    if (this.timerB.overflow && this.timerB.irqEnable) status |= 0x02;
    return status;
  }

  /**
   * Enable or disable external timer mode.
   * When enabled, generateSamples() will NOT advance timers or busy counter
   * (the caller is responsible for calling tickTimers() at the correct rate).
   */
  setExternalTimerMode(enabled: boolean): void {
    this._externalTimerMode = enabled;
  }

  /**
   * Generate stereo audio samples.
   * @param bufferL Left channel output buffer
   * @param bufferR Right channel output buffer
   * @param numSamples Number of samples to generate
   */
  private _debugSampleCount = 0;

  generateSamples(bufferL: Float32Array, bufferR: Float32Array, numSamples: number): void {
    this._debugSampleCount++;
    if (this._debugSampleCount === 400 || this._debugSampleCount === 800) {
      // Check if any channel has key-on operators
      let anyKeyOn = false;
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const c = this.channels[ch]!;
        for (let op = 0; op < 4; op++) {
          if (c.ops[op]!.keyOn) anyKeyOn = true;
        }
      }
      console.log('YM2151 generateSamples: numSamples=' + numSamples + ' anyKeyOn=' + anyKeyOn +
        ' ch0.lr=' + this.channels[0]!.leftEnable + '/' + this.channels[0]!.rightEnable +
        ' ch0.algo=' + this.channels[0]!.algorithm +
        ' ch0.op0.tl=' + this.channels[0]!.ops[0]!.totalLevel +
        ' ch0.op0.ar=' + this.channels[0]!.ops[0]!.ar +
        ' ch0.op0.envPhase=' + this.channels[0]!.ops[0]!.envPhase +
        ' ch0.kc=' + this.channels[0]!.keyCode);
    }
    for (let s = 0; s < numSamples; s++) {
      // Advance LFO
      const [lfoPM, lfoAM] = this.lfo.advance();

      // Advance timers and busy counter only if NOT in external timer mode
      if (!this._externalTimerMode) {
        if (this.busyCycles > 0) this.busyCycles--;

        if (this.timerA.advance()) {
          if (this.timerA.irqEnable && this.timerCallback !== null) {
            this.timerCallback(0);
          }
        }
        if (this.timerB.advance()) {
          if (this.timerB.irqEnable && this.timerCallback !== null) {
            this.timerCallback(1);
          }
        }
      }

      // Advance noise
      const noiseOut = this.noise.advance();

      // Mix all channels
      let mixL = 0;
      let mixR = 0;

      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const channel = this.channels[ch]!;
        let sample: number;

        // Channel 7 can use noise instead of normal output
        if (ch === 7 && this.noise.enabled) {
          // Noise replaces C2 (op3) output on channel 7
          // But we still run the channel for the other operators
          sample = channel.generateSample(lfoPM, lfoAM);
          // Mix in some noise
          sample = (sample + noiseOut) >> 1;
        } else {
          sample = channel.generateSample(lfoPM, lfoAM);
        }

        if (channel.leftEnable) mixL += sample;
        if (channel.rightEnable) mixR += sample;
      }

      // Normalize to float [-1, 1]
      // 8 channels, each can output ~±4095, so max sum ~±32760
      const scale = 1.0 / 32768;
      bufferL[s] = mixL * scale;
      bufferR[s] = mixR * scale;
    }
  }

  /**
   * Set timer overflow callback (for Z80 IRQ generation).
   * @param cb Callback receiving timer index (0 = timer A, 1 = timer B)
   */
  setTimerCallback(cb: (timerIndex: number) => void): void {
    this.timerCallback = cb;
  }

  /**
   * Set IRQ line clear callback.
   * Called when timer overflow flags are cleared (via register 0x14 write),
   * which should de-assert the Z80 IRQ line.
   */
  setIrqClearCallback(cb: () => void): void {
    this.irqClearCallback = cb;
  }

  /**
   * Advance only the timers by one sample tick.
   * This is used for interleaving timer IRQs with Z80 execution,
   * separate from audio sample generation.
   *
   * @returns true if any timer overflowed and should trigger an IRQ.
   */
  tickTimers(): boolean {
    let irq = false;

    if (this.timerA.advance()) {
      if (this.timerA.irqEnable) {
        irq = true;
        if (this.timerCallback !== null) {
          this.timerCallback(0);
        }
      }
    }
    if (this.timerB.advance()) {
      if (this.timerB.irqEnable) {
        irq = true;
        if (this.timerCallback !== null) {
          this.timerCallback(1);
        }
      }
    }

    // Decrease busy counter
    if (this.busyCycles > 0) this.busyCycles--;

    return irq;
  }

  /**
   * Get the native sample rate of the YM2151.
   */
  getSampleRate(): number {
    return YM_RATE;
  }

  /**
   * Reset the chip to initial state.
   */
  reset(): void {
    this.registers.fill(0);
    this.selectedRegister = 0;
    this.busyCycles = 0;
    this.timerAHigh = 0;
    this.timerALow = 0;
    this.timerBValue = 0;
    this.ct1 = false;
    this.ct2 = false;

    this.lfo.reset();
    this.lfo.amd = 0;
    this.lfo.pmd = 0;
    this.lfo.waveform = 0;
    this.lfo.phaseInc = 0;

    this.noise.enabled = false;
    this.noise.frequency = 0;
    this.noise.lfsr = 0x7FFF;

    this.timerA.reset();
    this.timerA.enabled = false;
    this.timerA.irqEnable = false;
    this.timerB.reset();
    this.timerB.enabled = false;
    this.timerB.irqEnable = false;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const channel = this.channels[ch]!;
      channel.algorithm = 0;
      channel.feedback = 0;
      channel.keyCode = 0;
      channel.keyFraction = 0;
      channel.leftEnable = true;
      channel.rightEnable = true;
      channel.pms = 0;
      channel.ams = 0;

      for (let op = 0; op < NUM_OPERATORS; op++) {
        const o = channel.ops[op]!;
        o.phase = 0;
        o.phaseInc = 0;
        o.envPhase = EnvPhase.Off;
        o.envLevel = ENV_QUIET;
        o.totalLevel = ENV_QUIET;
        o.ar = 0;
        o.d1r = 0;
        o.d2r = 0;
        o.rr = 0;
        o.d1l = 0;
        o.ks = 0;
        o.dt1 = 0;
        o.dt2 = 0;
        o.mul = 0;
        o.amsEn = false;
        o.keyOn = false;
        o.feedbackShift = 0;
        o.feedback0 = 0;
        o.feedback1 = 0;
      }
    }
  }

  // ── Register write dispatch ──────────────────────────────────────────────

  /**
   * Map register address to operator index within a channel.
   * YM2151 register layout for per-operator regs (0x40-0xFF):
   *   Registers 0xXY where X = operator group, Y bits 2-0 = channel
   *   Operator mapping within each group of 32 registers:
   *     offset +0..+7  → Operator M1 (channels 0-7)
   *     offset +8..+15 → Operator M2 (channels 0-7)
   *     offset +16..+23 → Operator C1 (channels 0-7)
   *     offset +24..+31 → Operator C2 (channels 0-7)
   */
  private getOperatorIndex(reg: number): { channel: number; operator: number } | null {
    const offset = reg & 0x1F;
    const channel = offset & 0x07;
    const opSlot = (offset >> 3) & 0x03;

    // Map YM2151 slot order to our internal order:
    // Slot 0 = M1 (ops[0]), Slot 1 = M2 (ops[2]), Slot 2 = C1 (ops[1]), Slot 3 = C2 (ops[3])
    const slotToOp = [0, 2, 1, 3];
    const operator = slotToOp[opSlot]!;

    if (channel >= NUM_CHANNELS) return null;
    return { channel, operator };
  }

  private writeRegister(reg: number, value: number): void {
    // ── Global registers (0x00-0x1F) ─────────────────────────────────────

    if (reg === 0x01) {
      // Test / LFO reset
      if (value & 0x02) {
        this.lfo.reset();
      }
      return;
    }

    if (reg === 0x08) {
      // Key On/Off
      // Bits 6-3: slot mask (C2, M2, C1, M1 from MSB to LSB)
      // Bits 2-0: channel number
      const ch = value & 0x07;
      const slotMask = (value >> 3) & 0x0F;
      const channel = this.channels[ch]!;

      // Slot mapping: bit 0=M1, bit 1=C1, bit 2=M2, bit 3=C2
      const slotToOp = [0, 1, 2, 3]; // M1, C1, M2, C2
      for (let slot = 0; slot < 4; slot++) {
        const op = channel.ops[slotToOp[slot]!]!;
        if (slotMask & (1 << slot)) {
          op.keyOnEvent();
        } else {
          op.keyOffEvent();
        }
      }
      return;
    }

    if (reg === 0x0F) {
      // Noise enable + frequency
      this.noise.enabled = (value & 0x80) !== 0;
      this.noise.frequency = value & 0x1F;
      return;
    }

    if (reg === 0x10) {
      // Timer A high 8 bits
      this.timerAHigh = value;
      this.updateTimerA();
      return;
    }

    if (reg === 0x11) {
      // Timer A low 2 bits
      this.timerALow = value & 0x03;
      this.updateTimerA();
      return;
    }

    if (reg === 0x12) {
      // Timer B
      this.timerBValue = value;
      this.updateTimerB();
      return;
    }

    if (reg === 0x14) {
      // Timer control
      // Bit 7: CSM mode (not implemented)
      // Bit 5: Timer B IRQ enable
      // Bit 4: Timer A IRQ enable
      // Bit 3: Timer B enable
      // Bit 2: Timer A enable
      // Bit 1: Timer B overflow reset
      // Bit 0: Timer A overflow reset
      this.timerA.irqEnable = (value & 0x10) !== 0;
      this.timerB.irqEnable = (value & 0x20) !== 0;
      this.timerA.enabled = (value & 0x04) !== 0;
      this.timerB.enabled = (value & 0x08) !== 0;

      if (value & 0x01) {
        this.timerA.overflow = false;
      }
      if (value & 0x02) {
        this.timerB.overflow = false;
      }

      // If no overflow flags remain asserted, de-assert IRQ line
      if (!this.timerA.overflow && !this.timerB.overflow) {
        if (this.irqClearCallback !== null) {
          this.irqClearCallback();
        }
      }
      return;
    }

    if (reg === 0x18) {
      // LFO frequency
      this.lfo.setFrequency(value);
      return;
    }

    if (reg === 0x19) {
      // AMD / PMD
      // Bit 7: 0 = set AMD, 1 = set PMD
      if (value & 0x80) {
        this.lfo.pmd = value & 0x7F;
      } else {
        this.lfo.amd = value & 0x7F;
      }
      return;
    }

    if (reg === 0x1B) {
      // CT1/CT2 + LFO waveform
      this.ct1 = (value & 0x40) !== 0;
      this.ct2 = (value & 0x80) !== 0;
      this.lfo.waveform = value & 0x03;
      return;
    }

    // ── Per-channel registers (0x20-0x3F) ────────────────────────────────

    if (reg >= 0x20 && reg <= 0x27) {
      // RL / FB / CON
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.rightEnable = (value & 0x80) !== 0;
      channel.leftEnable = (value & 0x40) !== 0;
      channel.feedback = (value >> 3) & 0x07;
      channel.algorithm = value & 0x07;
      return;
    }

    if (reg >= 0x28 && reg <= 0x2F) {
      // Key Code (KC)
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.keyCode = value & 0x7F;
      channel.updateFrequency();
      return;
    }

    if (reg >= 0x30 && reg <= 0x37) {
      // Key Fraction (KF)
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.keyFraction = (value >> 2) & 0x3F;
      channel.updateFrequency();
      return;
    }

    if (reg >= 0x38 && reg <= 0x3F) {
      // PMS / AMS
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.pms = (value >> 4) & 0x07;
      channel.ams = value & 0x03;
      return;
    }

    // ── Per-operator registers (0x40-0xFF) ───────────────────────────────

    if (reg >= 0x40 && reg <= 0x5F) {
      // DT1 / MUL
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.dt1 = (value >> 4) & 0x07;
      op.mul = value & 0x0F;
      this.channels[idx.channel]!.updateFrequency();
      return;
    }

    if (reg >= 0x60 && reg <= 0x7F) {
      // TL (Total Level)
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.totalLevel = (value & 0x7F) << TL_SHIFT;
      return;
    }

    if (reg >= 0x80 && reg <= 0x9F) {
      // KS / AR
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.ks = (value >> 6) & 0x03;
      op.ar = value & 0x1F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }

    if (reg >= 0xA0 && reg <= 0xBF) {
      // AMS-EN / D1R
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.amsEn = (value & 0x80) !== 0;
      op.d1r = value & 0x1F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }

    if (reg >= 0xC0 && reg <= 0xDF) {
      // DT2 / D2R
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.dt2 = (value >> 6) & 0x03;
      op.d2r = value & 0x1F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }

    if (reg >= 0xE0 && reg <= 0xFF) {
      // D1L / RR
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.d1l = (value >> 4) & 0x0F;
      op.rr = value & 0x0F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }
  }

  // ── Timer period computation ───────────────────────────────────────────

  private updateTimerA(): void {
    // Timer A: 10-bit value, period = 64 * (1024 - TA) / YM_CLOCK
    // In samples: period_samples = 64 * (1024 - TA) / 64 = 1024 - TA
    // (because sample rate = clock / 64)
    const ta = (this.timerAHigh << 2) | this.timerALow;
    this.timerA.period = Math.max(1, 1024 - ta);
  }

  private updateTimerB(): void {
    // Timer B: 8-bit value, period = 1024 * (256 - TB) / YM_CLOCK
    // In samples: period_samples = 1024 * (256 - TB) / 64 = 16 * (256 - TB)
    this.timerB.period = Math.max(1, 16 * (256 - this.timerBValue));
  }
}
