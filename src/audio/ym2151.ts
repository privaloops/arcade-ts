/**
 * YM2151 (OPM) -- 4-Operator FM Synthesizer
 *
 * 8 channels, 4 operators per channel (M1, C1, M2, C2).
 * Clock: 3.579545 MHz, sample rate = clock / 64 = 55930 Hz.
 *
 * Rewritten using exact YMFM data tables and algorithms from
 * Aaron Giles' YMFM reference implementation.
 */

// --- Constants ---------------------------------------------------------------

const YM_CLOCK = 3_579_545;
const YM_RATE = Math.floor(YM_CLOCK / 64); // 55930 Hz

const NUM_CHANNELS = 8;
const NUM_OPERATORS = 4;

/** Envelope max attenuation (10-bit: 0x3FF = 1023). 0 = max vol. */
const EG_MAX = 0x3FF;

/** TL is 7-bit (0-127), shifted left 3 to get 10-bit envelope range */
const TL_SHIFT = 3;

// --- Envelope phases ---------------------------------------------------------

const enum EnvPhase {
  Attack = 0,
  Decay1 = 1,
  Decay2 = 2,
  Release = 3,
  Off = 4,
}

// --- YMFM Phase Step Table (768 entries) ------------------------------------

const S_PHASE_STEP = new Uint32Array([
  41568,41600,41632,41664,41696,41728,41760,41792,41856,41888,41920,41952,42016,42048,42080,42112,
  42176,42208,42240,42272,42304,42336,42368,42400,42464,42496,42528,42560,42624,42656,42688,42720,
  42784,42816,42848,42880,42912,42944,42976,43008,43072,43104,43136,43168,43232,43264,43296,43328,
  43392,43424,43456,43488,43552,43584,43616,43648,43712,43744,43776,43808,43872,43904,43936,43968,
  44032,44064,44096,44128,44192,44224,44256,44288,44352,44384,44416,44448,44512,44544,44576,44608,
  44672,44704,44736,44768,44832,44864,44896,44928,44992,45024,45056,45088,45152,45184,45216,45248,
  45312,45344,45376,45408,45472,45504,45536,45568,45632,45664,45728,45760,45792,45824,45888,45920,
  45984,46016,46048,46080,46144,46176,46208,46240,46304,46336,46368,46400,46464,46496,46528,46560,
  46656,46688,46720,46752,46816,46848,46880,46912,46976,47008,47072,47104,47136,47168,47232,47264,
  47328,47360,47392,47424,47488,47520,47552,47584,47648,47680,47744,47776,47808,47840,47904,47936,
  48032,48064,48096,48128,48192,48224,48288,48320,48384,48416,48448,48480,48544,48576,48640,48672,
  48736,48768,48800,48832,48896,48928,48992,49024,49088,49120,49152,49184,49248,49280,49344,49376,
  49440,49472,49504,49536,49600,49632,49696,49728,49792,49824,49856,49888,49952,49984,50048,50080,
  50144,50176,50208,50240,50304,50336,50400,50432,50496,50528,50560,50592,50656,50688,50752,50784,
  50880,50912,50944,50976,51040,51072,51136,51168,51232,51264,51328,51360,51424,51456,51488,51520,
  51616,51648,51680,51712,51776,51808,51872,51904,51968,52000,52064,52096,52160,52192,52224,52256,
  52384,52416,52448,52480,52544,52576,52640,52672,52736,52768,52832,52864,52928,52960,52992,53024,
  53120,53152,53216,53248,53312,53344,53408,53440,53504,53536,53600,53632,53696,53728,53792,53824,
  53920,53952,54016,54048,54112,54144,54208,54240,54304,54336,54400,54432,54496,54528,54592,54624,
  54688,54720,54784,54816,54880,54912,54976,55008,55072,55104,55168,55200,55264,55296,55360,55392,
  55488,55520,55584,55616,55680,55712,55776,55808,55872,55936,55968,56032,56064,56128,56160,56224,
  56288,56320,56384,56416,56480,56512,56576,56608,56672,56736,56768,56832,56864,56928,56960,57024,
  57120,57152,57216,57248,57312,57376,57408,57472,57536,57568,57632,57664,57728,57792,57824,57888,
  57952,57984,58048,58080,58144,58208,58240,58304,58368,58400,58464,58496,58560,58624,58656,58720,
  58784,58816,58880,58912,58976,59040,59072,59136,59200,59232,59296,59328,59392,59456,59488,59552,
  59648,59680,59744,59776,59840,59904,59936,60000,60064,60128,60160,60224,60288,60320,60384,60416,
  60512,60544,60608,60640,60704,60768,60800,60864,60928,60992,61024,61088,61152,61184,61248,61280,
  61376,61408,61472,61536,61600,61632,61696,61760,61824,61856,61920,61984,62048,62080,62144,62208,
  62272,62304,62368,62432,62496,62528,62592,62656,62720,62752,62816,62880,62944,62976,63040,63104,
  63200,63232,63296,63360,63424,63456,63520,63584,63648,63680,63744,63808,63872,63904,63968,64032,
  64096,64128,64192,64256,64320,64352,64416,64480,64544,64608,64672,64704,64768,64832,64896,64928,
  65024,65056,65120,65184,65248,65312,65376,65408,65504,65536,65600,65664,65728,65792,65856,65888,
  65984,66016,66080,66144,66208,66272,66336,66368,66464,66496,66560,66624,66688,66752,66816,66848,
  66944,66976,67040,67104,67168,67232,67296,67328,67424,67456,67520,67584,67648,67712,67776,67808,
  67904,67936,68000,68064,68128,68192,68256,68288,68384,68448,68512,68544,68640,68672,68736,68800,
  68896,68928,68992,69056,69120,69184,69248,69280,69376,69440,69504,69536,69632,69664,69728,69792,
  69920,69952,70016,70080,70144,70208,70272,70304,70400,70464,70528,70560,70656,70688,70752,70816,
  70912,70976,71040,71104,71136,71232,71264,71360,71424,71488,71552,71616,71648,71744,71776,71872,
  71968,72032,72096,72160,72192,72288,72320,72416,72480,72544,72608,72672,72704,72800,72832,72928,
  72992,73056,73120,73184,73216,73312,73344,73440,73504,73568,73632,73696,73728,73824,73856,73952,
  74080,74144,74208,74272,74304,74400,74432,74528,74592,74656,74720,74784,74816,74912,74944,75040,
  75136,75200,75264,75328,75360,75456,75488,75584,75648,75712,75776,75840,75872,75968,76000,76096,
  76224,76288,76352,76416,76448,76544,76576,76672,76736,76800,76864,76928,77024,77120,77152,77248,
  77344,77408,77472,77536,77568,77664,77696,77792,77856,77920,77984,78048,78144,78240,78272,78368,
  78464,78528,78592,78656,78688,78784,78816,78912,78976,79040,79104,79168,79264,79360,79392,79488,
  79616,79680,79744,79808,79840,79936,79968,80064,80128,80192,80256,80320,80416,80512,80544,80640,
  80768,80832,80896,80960,80992,81088,81120,81216,81280,81344,81408,81472,81568,81664,81696,81792,
  81952,82016,82080,82144,82176,82272,82304,82400,82464,82528,82592,82656,82752,82848,82880,82976,
]);

// --- DT2 delta table (YMFM) ------------------------------------------------

const S_DETUNE2_DELTA = [0, 384, 500, 608];

// --- Lookup tables -----------------------------------------------------------

/**
 * Quarter-wave sine table: 256 entries of 4.8 fixed-point log-sin attenuation.
 * From the YMFM reference (matches YM2151 internal ROM).
 */
const sineTable = new Uint16Array([
  0x859,0x6c3,0x607,0x58b,0x52e,0x4e4,0x4a6,0x471,0x443,0x41a,0x3f5,0x3d3,0x3b5,0x398,0x37e,0x365,
  0x34e,0x339,0x324,0x311,0x2ff,0x2ed,0x2dc,0x2cd,0x2bd,0x2af,0x2a0,0x293,0x286,0x279,0x26d,0x261,
  0x256,0x24b,0x240,0x236,0x22c,0x222,0x218,0x20f,0x206,0x1fd,0x1f5,0x1ec,0x1e4,0x1dc,0x1d4,0x1cd,
  0x1c5,0x1be,0x1b7,0x1b0,0x1a9,0x1a2,0x19b,0x195,0x18f,0x188,0x182,0x17c,0x177,0x171,0x16b,0x166,
  0x160,0x15b,0x155,0x150,0x14b,0x146,0x141,0x13c,0x137,0x133,0x12e,0x129,0x125,0x121,0x11c,0x118,
  0x114,0x10f,0x10b,0x107,0x103,0x0ff,0x0fb,0x0f8,0x0f4,0x0f0,0x0ec,0x0e9,0x0e5,0x0e2,0x0de,0x0db,
  0x0d7,0x0d4,0x0d1,0x0cd,0x0ca,0x0c7,0x0c4,0x0c1,0x0be,0x0bb,0x0b8,0x0b5,0x0b2,0x0af,0x0ac,0x0a9,
  0x0a7,0x0a4,0x0a1,0x09f,0x09c,0x099,0x097,0x094,0x092,0x08f,0x08d,0x08a,0x088,0x086,0x083,0x081,
  0x07f,0x07d,0x07a,0x078,0x076,0x074,0x072,0x070,0x06e,0x06c,0x06a,0x068,0x066,0x064,0x062,0x060,
  0x05e,0x05c,0x05b,0x059,0x057,0x055,0x053,0x052,0x050,0x04e,0x04d,0x04b,0x04a,0x048,0x046,0x045,
  0x043,0x042,0x040,0x03f,0x03e,0x03c,0x03b,0x039,0x038,0x037,0x035,0x034,0x033,0x031,0x030,0x02f,
  0x02e,0x02d,0x02b,0x02a,0x029,0x028,0x027,0x026,0x025,0x024,0x023,0x022,0x021,0x020,0x01f,0x01e,
  0x01d,0x01c,0x01b,0x01a,0x019,0x018,0x017,0x017,0x016,0x015,0x014,0x014,0x013,0x012,0x011,0x011,
  0x010,0x00f,0x00f,0x00e,0x00d,0x00d,0x00c,0x00c,0x00b,0x00a,0x00a,0x009,0x009,0x008,0x008,0x007,
  0x007,0x007,0x006,0x006,0x005,0x005,0x005,0x004,0x004,0x004,0x003,0x003,0x003,0x002,0x002,0x002,
  0x002,0x001,0x001,0x001,0x001,0x001,0x001,0x001,0x000,0x000,0x000,0x000,0x000,0x000,0x000,0x000,
]);

/**
 * Exponential / power table: 256 entries.
 * Converts 8-bit fractional attenuation to linear mantissa.
 */
const expTable = new Uint16Array(256);

/**
 * DT1 (detune 1) table.
 * Indexed by [dt1][keycode >> 2], gives phase increment offset.
 */
const dt1Table: number[][] = [];

/**
 * Envelope rate increment table -- 64 entries, 8 sub-steps each.
 * Matches the YMFM s_increment_table nibble encoding.
 */
const egIncTable: number[][] = [];

// Build lookup tables at module load time
function buildTables(): void {
  // -- Exponential table --
  for (let i = 0; i < 256; i++) {
    const mantissa = Math.round(Math.pow(2, 1 - i / 256) * 1024) - 1024;
    expTable[i] = ((mantissa | 0x400) << 2) >>> 0;
  }

  // -- DT1 table --
  const dt1Base: number[][] = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8, 8],
    [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 16, 16, 16],
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

  // -- Envelope increment table --
  const egIncPacked: number[] = [
    0x00000000, 0x00000000, 0x10101010, 0x10101010,
    0x10101010, 0x10101010, 0x11101110, 0x11101110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x10101010, 0x10111010, 0x11101110, 0x11111110,
    0x11111111, 0x21112111, 0x21212121, 0x22212221,
    0x22222222, 0x42224222, 0x42424242, 0x44424442,
    0x44444444, 0x84448444, 0x84848484, 0x88848884,
    0x88888888, 0x88888888, 0x88888888, 0x88888888,
  ];
  for (let rate = 0; rate < 64; rate++) {
    const packed = egIncPacked[rate]!;
    const incs = new Array<number>(8);
    for (let step = 0; step < 8; step++) {
      incs[step] = (packed >> ((7 - step) * 4)) & 0x0F;
    }
    egIncTable[rate] = incs;
  }
}

buildTables();

// --- YMFM Phase step function -----------------------------------------------

/**
 * Convert OPM key code (blockFreq = KC<<6 | KF) to phase step,
 * with detune delta applied. Exact YMFM logic.
 */
function opmKeyCodeToPhaseStep(blockFreq: number, delta: number): number {
  const block = (blockFreq >> 10) & 7;
  const adjustedCode = ((blockFreq >> 6) & 0xF) - ((blockFreq >> 8) & 3);
  let effFreq = (adjustedCode << 6) | (blockFreq & 0x3F);
  effFreq += delta;

  if (effFreq >= 768 || effFreq < 0) {
    let b = block;
    if (effFreq < 0) {
      effFreq += 768;
      if (b-- === 0) return S_PHASE_STEP[0]! >> 7;
    } else {
      effFreq -= 768;
      if (effFreq >= 768) { b++; effFreq -= 768; }
      if (b++ >= 7) return S_PHASE_STEP[767]!;
    }
    return S_PHASE_STEP[effFreq]! >> (b ^ 7);
  }
  return S_PHASE_STEP[effFreq]! >> (block ^ 7);
}

// --- Sine / Exp lookup functions (matching YMFM) ----------------------------

/**
 * Look up the absolute sine attenuation for a 10-bit phase input.
 * Uses the 256-entry quarter-wave table with mirroring.
 */
function absSinAttenuation(phase10: number): number {
  const mirror = phase10 & 0x100;
  let idx = phase10 & 0xFF;
  if (mirror) {
    idx = 0xFF - idx;
  }
  return sineTable[idx]!;
}

/**
 * Convert log-attenuation to linear volume.
 * Input: total attenuation in 4.8 fixed-point format.
 * Output: 13-bit unsigned linear value.
 */
function attenuationToVolume(attenuation: number): number {
  const frac = attenuation & 0xFF;
  const shift = attenuation >> 8;
  return expTable[frac]! >> shift;
}

// --- Operator state ----------------------------------------------------------

class Operator {
  // Phase
  phase: number = 0;          // 20-bit phase accumulator
  phaseInc: number = 0;       // phase increment per sample

  // Envelope (integer, 10-bit: 0 = max vol, 0x3FF = silence)
  envPhase: EnvPhase = EnvPhase.Off;
  envLevel: number = EG_MAX;
  totalLevel: number = 0;

  // ADSR rates (raw register values)
  ar: number = 0;
  d1r: number = 0;
  d2r: number = 0;
  rr: number = 0;
  d1l: number = 0;

  // Effective rates (computed from raw + key scale, 0-63)
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
  dt2: number = 0;   // 0-3

  // Multiplier
  mul: number = 0;   // 0-15

  // AMS enable
  amsEn: boolean = false;

  // Key on state
  keyOn: boolean = false;

  // Feedback (only for operator M1)
  feedbackShift: number = 0;
  feedback0: number = 0;
  feedback1: number = 0;

  // Envelope counter for rate-dependent stepping
  egCounter: number = 0;

  /**
   * Recompute effective rates from raw ADSR rates + key scale + key code.
   */
  computeRates(keyCode: number): void {
    const ksShift = keyCode >> (3 - this.ks);
    this.effAR = Math.min(63, this.ar > 0 ? (this.ar * 2 + 1) + ksShift : 0);
    this.effD1R = Math.min(63, this.d1r > 0 ? (this.d1r * 2 + 1) + ksShift : 0);
    this.effD2R = Math.min(63, this.d2r > 0 ? (this.d2r * 2 + 1) + ksShift : 0);
    this.effRR = Math.min(63, (this.rr * 4 + 2) + ksShift);

    this.d1lLevel = this.d1l === 15 ? EG_MAX : (this.d1l << 5);
  }

  /**
   * Compute phase increment using YMFM's opmKeyCodeToPhaseStep.
   *
   * blockFreq for OPM = (KC << 6) | KF, where:
   *   KC bits [6:4] = block (octave)
   *   KC bits [3:0] = note
   *   KF bits [5:0] = key fraction
   */
  computePhaseInc(keyCode: number, keyFraction: number): void {
    // Build the 13-bit blockFreq: KC(7 bits) << 6 | KF(6 bits)
    const blockFreq = (keyCode << 6) | keyFraction;

    // DT2 delta
    const dt2Delta = S_DETUNE2_DELTA[this.dt2 & 3]!;

    // Base phase step from YMFM table, with DT2 applied
    let phaseStep = opmKeyCodeToPhaseStep(blockFreq, dt2Delta);

    // Apply DT1
    const dt1Idx = this.dt1 & 7;
    if (dt1Idx !== 0) {
      const kcDiv = Math.min(31, keyCode >> 1);
      const detune = dt1Table[dt1Idx]![kcDiv]!;
      phaseStep += detune;
    }

    // Apply MUL: MUL=0 means x0.5, MUL=1-15 means x1..x15
    if (this.mul === 0) {
      phaseStep >>= 1;
    } else {
      phaseStep *= this.mul;
    }

    // The phase step from YMFM is already scaled for a 20-bit accumulator
    // (table values are ~41568..82976, shifted right by block^7).
    // At block=7, shift=0, values are up to ~82976 which fits in 20 bits.
    this.phaseInc = phaseStep & 0xFFFFF;
  }

  keyOnEvent(): void {
    if (!this.keyOn) {
      this.keyOn = true;
      this.phase = 0;
      this.envPhase = EnvPhase.Attack;
      // Don't reset envLevel -- real YM2151 starts attack from current level
    }
  }

  keyOffEvent(): void {
    if (this.keyOn) {
      this.keyOn = false;
      this.envPhase = EnvPhase.Release;
    }
  }

  /**
   * Advance envelope by one sample.
   * Uses YMFM-style rate-dependent counter with the increment table.
   */
  updateEnvelope(): void {
    this.egCounter = (this.egCounter + 1) & 7;

    switch (this.envPhase) {
      case EnvPhase.Attack: {
        if (this.effAR >= 62) {
          this.envLevel = 0;
          this.envPhase = EnvPhase.Decay1;
        } else if (this.effAR > 0) {
          const increment = this._getIncrement(this.effAR);
          if (increment > 0) {
            // YMFM attack formula: m_env_attenuation += (~m_env_attenuation * increment) >> 4
            this.envLevel += ((~this.envLevel * increment) >> 4);
            if (this.envLevel <= 0) {
              this.envLevel = 0;
              this.envPhase = EnvPhase.Decay1;
            }
          }
        }
        break;
      }
      case EnvPhase.Decay1: {
        if (this.effD1R > 0) {
          const increment = this._getIncrement(this.effD1R);
          this.envLevel += increment;
          if (this.envLevel >= this.d1lLevel) {
            this.envLevel = this.d1lLevel;
            this.envPhase = EnvPhase.Decay2;
          }
        } else {
          this.envPhase = EnvPhase.Decay2;
        }
        break;
      }
      case EnvPhase.Decay2: {
        if (this.effD2R > 0) {
          const increment = this._getIncrement(this.effD2R);
          this.envLevel += increment;
          if (this.envLevel >= EG_MAX) {
            this.envLevel = EG_MAX;
            this.envPhase = EnvPhase.Off;
          }
        }
        break;
      }
      case EnvPhase.Release: {
        if (this.effRR > 0) {
          const increment = this._getIncrement(this.effRR);
          this.envLevel += increment;
          if (this.envLevel >= EG_MAX) {
            this.envLevel = EG_MAX;
            this.envPhase = EnvPhase.Off;
          }
        }
        break;
      }
      case EnvPhase.Off:
        this.envLevel = EG_MAX;
        break;
    }
  }

  /**
   * Get the envelope increment for the current sub-step, using the rate table.
   */
  private _getIncrement(rate: number): number {
    if (rate <= 0) return 0;

    const effectiveRate = Math.min(63, rate);
    const shift = Math.max(0, 13 - (effectiveRate >> 2));
    const counterMask = (1 << shift) - 1;

    if (shift > 0 && (this.egCounter & counterMask) !== 0) {
      return 0;
    }

    const subStep = shift > 0
      ? (this.egCounter >> shift) & 7
      : this.egCounter & 7;

    return egIncTable[effectiveRate]![subStep]!;
  }

  /**
   * Calculate operator output (YMFM compute_volume logic).
   * @param modulation Phase modulation input from other operators (signed)
   * @param lfoAm LFO amplitude modulation value
   * @returns Signed output (14-bit range)
   */
  calcOutput(modulation: number, lfoAm: number): number {
    if (this.envPhase === EnvPhase.Off) return 0;

    // Phase: 20-bit accumulator, use top 10 bits + modulation
    const rawPhase = ((this.phase >> 10) + modulation) & 0x3FF;

    // sinAttenuation = S_SIN_TABLE[phase & 0xFF] (with mirroring for bits 8-9)
    const sinAttenuation = absSinAttenuation(rawPhase & 0x1FF);

    // envAttenuation = (envLevel + totalLevel + amOffset) << 2
    let envTotal = this.envLevel + this.totalLevel;
    if (this.amsEn) {
      envTotal += lfoAm;
    }
    if (envTotal > EG_MAX) envTotal = EG_MAX;
    const envAttenuation = envTotal << 2;

    // totalAtten = sinAttenuation + envAttenuation
    const totalAttenuation = sinAttenuation + envAttenuation;

    // if totalAtten >= 0x1000: return 0
    if (totalAttenuation >= 0x1000) return 0;

    // linear = S_POWER_TABLE[totalAtten & 0xFF] >> (totalAtten >> 8)
    const linear = attenuationToVolume(totalAttenuation);

    // sign from phase bit 9
    const sign = rawPhase & 0x200;

    // return sign ? -linear : linear
    return sign ? -linear : linear;
  }

  advancePhase(): void {
    this.phase = (this.phase + this.phaseInc) & 0xFFFFF; // 20-bit wrap
  }
}

// --- Channel state -----------------------------------------------------------

class Channel {
  ops: Operator[];

  keyCode: number = 0;
  keyFraction: number = 0;

  algorithm: number = 0;
  feedback: number = 0;

  leftEnable: boolean = true;
  rightEnable: boolean = true;

  pms: number = 0;
  ams: number = 0;

  constructor() {
    this.ops = [];
    for (let i = 0; i < NUM_OPERATORS; i++) {
      this.ops.push(new Operator());
    }
  }

  updateFrequency(): void {
    for (let i = 0; i < NUM_OPERATORS; i++) {
      this.ops[i]!.computePhaseInc(this.keyCode, this.keyFraction);
      this.ops[i]!.computeRates(this.keyCode);
    }
  }

  /**
   * Generate one sample for this channel using the selected algorithm.
   *
   * YMFM operator naming: O1=M1, O2=C1, O3=M2, O4=C2
   * (our ops[0]=M1, ops[1]=C1, ops[2]=M2, ops[3]=C2)
   *
   * Algorithm connections (YMFM encoding):
   *   0: O1->O2->O3->O4, output O4
   *   1: (O1+O2)->O3->O4, output O4
   *   2: (O1+(O2->O3))->O4, output O4
   *   3: ((O1->O2)+O3)->O4, output O4
   *   4: (O1->O2)+(O3->O4), output O2+O4
   *   5: O1->(O2+O3+O4), output O2+O3+O4
   *   6: (O1->O2)+O3+O4, output O2+O3+O4
   *   7: O1+O2+O3+O4, output all
   */
  generateSample(_lfoPhase: number, lfoAm: number): number {
    const m1 = this.ops[0]!;
    const c1 = this.ops[1]!;
    const m2 = this.ops[2]!;
    const c2 = this.ops[3]!;

    // AMS depth mapping: 0=0dB, 1=1.4dB, 2=5.9dB, 3=11.8dB
    const amsDepth = [0, 32, 128, 256][this.ams]!;
    const amValue = (lfoAm * amsDepth) >> 8;

    // Feedback on M1
    let m1Mod = 0;
    if (this.feedback > 0) {
      m1Mod = (m1.feedback0 + m1.feedback1) >> (10 - this.feedback);
    }

    const m1Out = m1.calcOutput(m1Mod, amValue);

    // Store M1 feedback (YMFM stores raw output, not shifted)
    m1.feedback1 = m1.feedback0;
    m1.feedback0 = m1Out;

    let output = 0;

    // YMFM: modulation inputs are shifted >> 1 before being passed
    // as phase input (ymfm_fm.ipp line 1042: opmod = opout[...] >> 1)
    switch (this.algorithm) {
      case 0: {
        // O1→O2→O3→O4, output O4
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(c1Out >> 1, amValue);
        output = c2.calcOutput(m2Out >> 1, amValue);
        break;
      }
      case 1: {
        // (O1+O2)→O3→O4, output O4
        const c1Out = c1.calcOutput(0, amValue);
        const m2Out = m2.calcOutput((m1Out + c1Out) >> 1, amValue);
        output = c2.calcOutput(m2Out >> 1, amValue);
        break;
      }
      case 2: {
        // (O1+(O2→O3))→O4, output O4
        const c1Out = c1.calcOutput(0, amValue);
        const m2Out = m2.calcOutput(c1Out >> 1, amValue);
        output = c2.calcOutput((m1Out + m2Out) >> 1, amValue);
        break;
      }
      case 3: {
        // ((O1→O2)+O3)→O4, output O4
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        output = c2.calcOutput((c1Out + m2Out) >> 1, amValue);
        break;
      }
      case 4: {
        // (O1→O2)+(O3→O4), output O2+O4
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        const c2Out = c2.calcOutput(m2Out >> 1, amValue);
        output = c1Out + c2Out;
        break;
      }
      case 5: {
        // O1→(O2+O3+O4), output O2+O3+O4
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(m1Out >> 1, amValue);
        const c2Out = c2.calcOutput(m1Out >> 1, amValue);
        output = c1Out + m2Out + c2Out;
        break;
      }
      case 6: {
        // (O1→O2)+O3+O4, output O2+O3+O4
        const c1Out = c1.calcOutput(m1Out >> 1, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        const c2Out = c2.calcOutput(0, amValue);
        output = c1Out + m2Out + c2Out;
        break;
      }
      case 7: {
        // O1+O2+O3+O4, output all
        const c1Out = c1.calcOutput(0, amValue);
        const m2Out = m2.calcOutput(0, amValue);
        const c2Out = c2.calcOutput(0, amValue);
        output = m1Out + c1Out + m2Out + c2Out;
        break;
      }
    }

    // Advance all operator phases and envelopes
    m1.advancePhase();
    c1.advancePhase();
    m2.advancePhase();
    c2.advancePhase();

    m1.updateEnvelope();
    c1.updateEnvelope();
    m2.updateEnvelope();
    c2.updateEnvelope();

    return output;
  }
}

// --- LFO ---------------------------------------------------------------------

class LFO {
  phase: number = 0;
  phaseInc: number = 0;
  waveform: number = 0; // 0=saw, 1=square, 2=triangle, 3=noise

  amd: number = 0;
  pmd: number = 0;

  noiseState: number = 1;

  setFrequency(value: number): void {
    if (value === 0) {
      this.phaseInc = 0;
    } else {
      const freqHz = 0.008 * Math.pow(2, value / 32);
      this.phaseInc = (freqHz / YM_RATE) * (1 << 20);
    }
  }

  advance(): [number, number] {
    this.phase = (this.phase + this.phaseInc) & 0xFFFFF;

    const phaseNorm = this.phase / (1 << 20);

    let waveVal: number;
    let amWaveVal: number;

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
    const ampMod = Math.floor(amWaveVal * this.amd * 4);

    return [phaseMod, ampMod];
  }

  reset(): void {
    this.phase = 0;
  }
}

// --- Noise generator ---------------------------------------------------------

class NoiseGenerator {
  enabled: boolean = false;
  frequency: number = 0;
  lfsr: number = 0x7FFF;
  counter: number = 0;
  output: number = 0;

  advance(): number {
    if (!this.enabled) return 0;

    this.counter++;
    const period = (32 - this.frequency) * 16;
    if (this.counter >= period) {
      this.counter = 0;
      const bit = ((this.lfsr >> 0) ^ (this.lfsr >> 1)) & 1;
      this.lfsr = ((this.lfsr >> 1) | (bit << 14)) & 0x7FFF;
      this.output = (this.lfsr & 1) ? 2047 : -2047;
    }
    return this.output;
  }
}

// --- Timer -------------------------------------------------------------------

class Timer {
  period: number = 0;
  counter: number = 0;
  enabled: boolean = false;
  overflow: boolean = false;
  irqEnable: boolean = false;

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

// --- YM2151 main class -------------------------------------------------------

export class YM2151 {
  private channels: Channel[];
  private lfo: LFO;
  private noise: NoiseGenerator;
  private timerA: Timer;
  private timerB: Timer;

  private registers: Uint8Array;
  private selectedRegister: number;

  private timerAHigh: number;
  private timerALow: number;
  private timerBValue: number;

  private timerCallback: ((timerIndex: number) => void) | null;
  private irqClearCallback: (() => void) | null;

  private busyCycles: number;

  private ct1: boolean;
  private ct2: boolean;

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

  // -- Public interface -------------------------------------------------------

  writeAddress(value: number): void {
    this.selectedRegister = value & 0xFF;
  }

  writeData(value: number): void {
    value = value & 0xFF;
    const reg = this.selectedRegister;
    this.registers[reg] = value;
    // Real YM2151 busy period is 64 master clocks ≈ 1 timer tick.
    // tickTimers() runs once per 64 clocks, so busyCycles=1 clears
    // after exactly one tick — matching real hardware behavior.
    this.busyCycles = 1;

    this.writeRegister(reg, value);
  }

  readStatus(): number {
    let status = 0;
    if (this.busyCycles > 0) status |= 0x80;
    if (this.timerA.overflow && this.timerA.irqEnable) status |= 0x01;
    if (this.timerB.overflow && this.timerB.irqEnable) status |= 0x02;
    return status;
  }

  setExternalTimerMode(enabled: boolean): void {
    this._externalTimerMode = enabled;
  }

  generateSamples(bufferL: Float32Array, bufferR: Float32Array, numSamples: number, startOffset: number = 0): void {
    for (let s = 0; s < numSamples; s++) {
      const [lfoPM, lfoAM] = this.lfo.advance();

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

      const noiseOut = this.noise.advance();

      let mixL = 0;
      let mixR = 0;

      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const channel = this.channels[ch]!;
        let sample: number;

        if (ch === 7 && this.noise.enabled) {
          sample = channel.generateSample(lfoPM, lfoAM);
          sample = (sample + noiseOut) >> 1;
        } else {
          sample = channel.generateSample(lfoPM, lfoAM);
        }

        if (channel.leftEnable) mixL += sample;
        if (channel.rightEnable) mixR += sample;
      }

      const scale = 1.0 / 16384;
      bufferL[startOffset + s] = mixL * scale;
      bufferR[startOffset + s] = mixR * scale;
    }
  }

  setTimerCallback(cb: (timerIndex: number) => void): void {
    this.timerCallback = cb;
  }

  setIrqClearCallback(cb: () => void): void {
    this.irqClearCallback = cb;
  }

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

    if (this.busyCycles > 0) this.busyCycles--;

    return irq;
  }

  getSampleRate(): number {
    return YM_RATE;
  }

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
        o.envLevel = EG_MAX;
        o.totalLevel = EG_MAX;
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
        o.egCounter = 0;
      }
    }
  }

  // -- Register write dispatch ------------------------------------------------

  private getOperatorIndex(reg: number): { channel: number; operator: number } | null {
    const offset = reg & 0x1F;
    const channel = offset & 0x07;
    const opSlot = (offset >> 3) & 0x03;

    // Map YM2151 slot order to internal order:
    // Slot 0 = M1 (ops[0]), Slot 1 = M2 (ops[2]), Slot 2 = C1 (ops[1]), Slot 3 = C2 (ops[3])
    const slotToOp = [0, 2, 1, 3];
    const operator = slotToOp[opSlot]!;

    if (channel >= NUM_CHANNELS) return null;
    return { channel, operator };
  }

  private writeRegister(reg: number, value: number): void {
    // -- Global registers (0x00-0x1F) -----------------------------------------

    if (reg === 0x01) {
      if (value & 0x02) {
        this.lfo.reset();
      }
      return;
    }

    if (reg === 0x08) {
      // Key On/Off
      const ch = value & 0x07;
      const slotMask = (value >> 3) & 0x0F;
      const channel = this.channels[ch]!;

      // Must match the per-operator register mapping: slot1=M2(ops[2]), slot2=C1(ops[1])
      const slotToOp = [0, 2, 1, 3];
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
      this.noise.enabled = (value & 0x80) !== 0;
      this.noise.frequency = value & 0x1F;
      return;
    }

    if (reg === 0x10) {
      this.timerAHigh = value;
      this.updateTimerA();
      return;
    }

    if (reg === 0x11) {
      this.timerALow = value & 0x03;
      this.updateTimerA();
      return;
    }

    if (reg === 0x12) {
      this.timerBValue = value;
      this.updateTimerB();
      return;
    }

    if (reg === 0x14) {
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

      if (!this.timerA.overflow && !this.timerB.overflow) {
        if (this.irqClearCallback !== null) {
          this.irqClearCallback();
        }
      }
      return;
    }

    if (reg === 0x18) {
      this.lfo.setFrequency(value);
      return;
    }

    if (reg === 0x19) {
      if (value & 0x80) {
        this.lfo.pmd = value & 0x7F;
      } else {
        this.lfo.amd = value & 0x7F;
      }
      return;
    }

    if (reg === 0x1B) {
      this.ct1 = (value & 0x40) !== 0;
      this.ct2 = (value & 0x80) !== 0;
      this.lfo.waveform = value & 0x03;
      return;
    }

    // -- Per-channel registers (0x20-0x3F) ------------------------------------

    if (reg >= 0x20 && reg <= 0x27) {
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.rightEnable = (value & 0x80) !== 0;
      channel.leftEnable = (value & 0x40) !== 0;
      channel.feedback = (value >> 3) & 0x07;
      channel.algorithm = value & 0x07;
      return;
    }

    if (reg >= 0x28 && reg <= 0x2F) {
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.keyCode = value & 0x7F;
      channel.updateFrequency();
      return;
    }

    if (reg >= 0x30 && reg <= 0x37) {
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.keyFraction = (value >> 2) & 0x3F;
      channel.updateFrequency();
      return;
    }

    if (reg >= 0x38 && reg <= 0x3F) {
      const ch = reg & 0x07;
      const channel = this.channels[ch]!;
      channel.pms = (value >> 4) & 0x07;
      channel.ams = value & 0x03;
      return;
    }

    // -- Per-operator registers (0x40-0xFF) -----------------------------------

    if (reg >= 0x40 && reg <= 0x5F) {
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.dt1 = (value >> 4) & 0x07;
      op.mul = value & 0x0F;
      this.channels[idx.channel]!.updateFrequency();
      return;
    }

    if (reg >= 0x60 && reg <= 0x7F) {
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.totalLevel = (value & 0x7F) << TL_SHIFT;
      return;
    }

    if (reg >= 0x80 && reg <= 0x9F) {
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.ks = (value >> 6) & 0x03;
      op.ar = value & 0x1F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }

    if (reg >= 0xA0 && reg <= 0xBF) {
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.amsEn = (value & 0x80) !== 0;
      op.d1r = value & 0x1F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }

    if (reg >= 0xC0 && reg <= 0xDF) {
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.dt2 = (value >> 6) & 0x03;
      op.d2r = value & 0x1F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }

    if (reg >= 0xE0 && reg <= 0xFF) {
      const idx = this.getOperatorIndex(reg);
      if (idx === null) return;
      const op = this.channels[idx.channel]!.ops[idx.operator]!;
      op.d1l = (value >> 4) & 0x0F;
      op.rr = value & 0x0F;
      op.computeRates(this.channels[idx.channel]!.keyCode);
      return;
    }
  }

  // -- Timer period computation -----------------------------------------------

  private updateTimerA(): void {
    const ta = (this.timerAHigh << 2) | this.timerALow;
    this.timerA.period = Math.max(1, 1024 - ta);
  }

  private updateTimerB(): void {
    this.timerB.period = Math.max(1, 16 * (256 - this.timerBValue));
  }
}
