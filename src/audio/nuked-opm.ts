// @ts-nocheck — Mechanical port of Nuked OPM (C→TS). All array indices are bounded.
/* Nuked OPM
 * Copyright (C) 2022 Nuke.YKT
 *
 * This file is part of Nuked OPM.
 *
 * Nuked OPM is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, either version 2.1
 * of the License, or (at your option) any later version.
 *
 * Nuked OPM is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Nuked OPM. If not, see <https://www.gnu.org/licenses/>.
 *
 *  Nuked OPM emulator.
 *  Thanks:
 *      siliconpr0n.org(digshadow, John McMaster):
 *          YM2151 and other FM chip decaps and die shots.
 *
 * version: 0.9.3 beta
 *
 * TypeScript port from C source (opm.c / opm.h).
 */

// Envelope generator states
const eg_num_attack = 0;
const eg_num_decay = 1;
const eg_num_sustain = 2;
const eg_num_release = 3;

/* logsin table */
const logsinrom: Uint16Array = new Uint16Array([
  0x859, 0x6c3, 0x607, 0x58b, 0x52e, 0x4e4, 0x4a6, 0x471,
  0x443, 0x41a, 0x3f5, 0x3d3, 0x3b5, 0x398, 0x37e, 0x365,
  0x34e, 0x339, 0x324, 0x311, 0x2ff, 0x2ed, 0x2dc, 0x2cd,
  0x2bd, 0x2af, 0x2a0, 0x293, 0x286, 0x279, 0x26d, 0x261,
  0x256, 0x24b, 0x240, 0x236, 0x22c, 0x222, 0x218, 0x20f,
  0x206, 0x1fd, 0x1f5, 0x1ec, 0x1e4, 0x1dc, 0x1d4, 0x1cd,
  0x1c5, 0x1be, 0x1b7, 0x1b0, 0x1a9, 0x1a2, 0x19b, 0x195,
  0x18f, 0x188, 0x182, 0x17c, 0x177, 0x171, 0x16b, 0x166,
  0x160, 0x15b, 0x155, 0x150, 0x14b, 0x146, 0x141, 0x13c,
  0x137, 0x133, 0x12e, 0x129, 0x125, 0x121, 0x11c, 0x118,
  0x114, 0x10f, 0x10b, 0x107, 0x103, 0x0ff, 0x0fb, 0x0f8,
  0x0f4, 0x0f0, 0x0ec, 0x0e9, 0x0e5, 0x0e2, 0x0de, 0x0db,
  0x0d7, 0x0d4, 0x0d1, 0x0cd, 0x0ca, 0x0c7, 0x0c4, 0x0c1,
  0x0be, 0x0bb, 0x0b8, 0x0b5, 0x0b2, 0x0af, 0x0ac, 0x0a9,
  0x0a7, 0x0a4, 0x0a1, 0x09f, 0x09c, 0x099, 0x097, 0x094,
  0x092, 0x08f, 0x08d, 0x08a, 0x088, 0x086, 0x083, 0x081,
  0x07f, 0x07d, 0x07a, 0x078, 0x076, 0x074, 0x072, 0x070,
  0x06e, 0x06c, 0x06a, 0x068, 0x066, 0x064, 0x062, 0x060,
  0x05e, 0x05c, 0x05b, 0x059, 0x057, 0x055, 0x053, 0x052,
  0x050, 0x04e, 0x04d, 0x04b, 0x04a, 0x048, 0x046, 0x045,
  0x043, 0x042, 0x040, 0x03f, 0x03e, 0x03c, 0x03b, 0x039,
  0x038, 0x037, 0x035, 0x034, 0x033, 0x031, 0x030, 0x02f,
  0x02e, 0x02d, 0x02b, 0x02a, 0x029, 0x028, 0x027, 0x026,
  0x025, 0x024, 0x023, 0x022, 0x021, 0x020, 0x01f, 0x01e,
  0x01d, 0x01c, 0x01b, 0x01a, 0x019, 0x018, 0x017, 0x017,
  0x016, 0x015, 0x014, 0x014, 0x013, 0x012, 0x011, 0x011,
  0x010, 0x00f, 0x00f, 0x00e, 0x00d, 0x00d, 0x00c, 0x00c,
  0x00b, 0x00a, 0x00a, 0x009, 0x009, 0x008, 0x008, 0x007,
  0x007, 0x007, 0x006, 0x006, 0x005, 0x005, 0x005, 0x004,
  0x004, 0x004, 0x003, 0x003, 0x003, 0x002, 0x002, 0x002,
  0x002, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001,
  0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000,
]);

/* exp table */
const exprom: Uint16Array = new Uint16Array([
  0x7fa, 0x7f5, 0x7ef, 0x7ea, 0x7e4, 0x7df, 0x7da, 0x7d4,
  0x7cf, 0x7c9, 0x7c4, 0x7bf, 0x7b9, 0x7b4, 0x7ae, 0x7a9,
  0x7a4, 0x79f, 0x799, 0x794, 0x78f, 0x78a, 0x784, 0x77f,
  0x77a, 0x775, 0x770, 0x76a, 0x765, 0x760, 0x75b, 0x756,
  0x751, 0x74c, 0x747, 0x742, 0x73d, 0x738, 0x733, 0x72e,
  0x729, 0x724, 0x71f, 0x71a, 0x715, 0x710, 0x70b, 0x706,
  0x702, 0x6fd, 0x6f8, 0x6f3, 0x6ee, 0x6e9, 0x6e5, 0x6e0,
  0x6db, 0x6d6, 0x6d2, 0x6cd, 0x6c8, 0x6c4, 0x6bf, 0x6ba,
  0x6b5, 0x6b1, 0x6ac, 0x6a8, 0x6a3, 0x69e, 0x69a, 0x695,
  0x691, 0x68c, 0x688, 0x683, 0x67f, 0x67a, 0x676, 0x671,
  0x66d, 0x668, 0x664, 0x65f, 0x65b, 0x657, 0x652, 0x64e,
  0x649, 0x645, 0x641, 0x63c, 0x638, 0x634, 0x630, 0x62b,
  0x627, 0x623, 0x61e, 0x61a, 0x616, 0x612, 0x60e, 0x609,
  0x605, 0x601, 0x5fd, 0x5f9, 0x5f5, 0x5f0, 0x5ec, 0x5e8,
  0x5e4, 0x5e0, 0x5dc, 0x5d8, 0x5d4, 0x5d0, 0x5cc, 0x5c8,
  0x5c4, 0x5c0, 0x5bc, 0x5b8, 0x5b4, 0x5b0, 0x5ac, 0x5a8,
  0x5a4, 0x5a0, 0x59c, 0x599, 0x595, 0x591, 0x58d, 0x589,
  0x585, 0x581, 0x57e, 0x57a, 0x576, 0x572, 0x56f, 0x56b,
  0x567, 0x563, 0x560, 0x55c, 0x558, 0x554, 0x551, 0x54d,
  0x549, 0x546, 0x542, 0x53e, 0x53b, 0x537, 0x534, 0x530,
  0x52c, 0x529, 0x525, 0x522, 0x51e, 0x51b, 0x517, 0x514,
  0x510, 0x50c, 0x509, 0x506, 0x502, 0x4ff, 0x4fb, 0x4f8,
  0x4f4, 0x4f1, 0x4ed, 0x4ea, 0x4e7, 0x4e3, 0x4e0, 0x4dc,
  0x4d9, 0x4d6, 0x4d2, 0x4cf, 0x4cc, 0x4c8, 0x4c5, 0x4c2,
  0x4be, 0x4bb, 0x4b8, 0x4b5, 0x4b1, 0x4ae, 0x4ab, 0x4a8,
  0x4a4, 0x4a1, 0x49e, 0x49b, 0x498, 0x494, 0x491, 0x48e,
  0x48b, 0x488, 0x485, 0x482, 0x47e, 0x47b, 0x478, 0x475,
  0x472, 0x46f, 0x46c, 0x469, 0x466, 0x463, 0x460, 0x45d,
  0x45a, 0x457, 0x454, 0x451, 0x44e, 0x44b, 0x448, 0x445,
  0x442, 0x43f, 0x43c, 0x439, 0x436, 0x433, 0x430, 0x42d,
  0x42a, 0x428, 0x425, 0x422, 0x41f, 0x41c, 0x419, 0x416,
  0x414, 0x411, 0x40e, 0x40b, 0x408, 0x406, 0x403, 0x400,
]);

/* Envelope generator step table */
const eg_stephi: number[][] = [
  [0, 0, 0, 0],
  [1, 0, 0, 0],
  [1, 0, 1, 0],
  [1, 1, 1, 0],
];

/* Phase generator detune */
const pg_detune: Uint32Array = new Uint32Array([16, 17, 19, 20, 22, 24, 27, 29]);

interface freqtable_t {
  basefreq: number;
  approxtype: number;
  slope: number;
}

const pg_freqtable: freqtable_t[] = [
  { basefreq: 1299, approxtype: 1, slope: 19 },
  { basefreq: 1318, approxtype: 1, slope: 19 },
  { basefreq: 1337, approxtype: 1, slope: 19 },
  { basefreq: 1356, approxtype: 1, slope: 20 },
  { basefreq: 1376, approxtype: 1, slope: 20 },
  { basefreq: 1396, approxtype: 1, slope: 20 },
  { basefreq: 1416, approxtype: 1, slope: 21 },
  { basefreq: 1437, approxtype: 1, slope: 20 },
  { basefreq: 1458, approxtype: 1, slope: 21 },
  { basefreq: 1479, approxtype: 1, slope: 21 },
  { basefreq: 1501, approxtype: 1, slope: 22 },
  { basefreq: 1523, approxtype: 1, slope: 22 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 1545, approxtype: 1, slope: 22 },
  { basefreq: 1567, approxtype: 1, slope: 22 },
  { basefreq: 1590, approxtype: 1, slope: 23 },
  { basefreq: 1613, approxtype: 1, slope: 23 },
  { basefreq: 1637, approxtype: 1, slope: 23 },
  { basefreq: 1660, approxtype: 1, slope: 24 },
  { basefreq: 1685, approxtype: 1, slope: 24 },
  { basefreq: 1709, approxtype: 1, slope: 24 },
  { basefreq: 1734, approxtype: 1, slope: 25 },
  { basefreq: 1759, approxtype: 1, slope: 25 },
  { basefreq: 1785, approxtype: 1, slope: 26 },
  { basefreq: 1811, approxtype: 1, slope: 26 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 1837, approxtype: 1, slope: 26 },
  { basefreq: 1864, approxtype: 1, slope: 27 },
  { basefreq: 1891, approxtype: 1, slope: 27 },
  { basefreq: 1918, approxtype: 1, slope: 28 },
  { basefreq: 1946, approxtype: 1, slope: 28 },
  { basefreq: 1975, approxtype: 1, slope: 28 },
  { basefreq: 2003, approxtype: 1, slope: 29 },
  { basefreq: 2032, approxtype: 1, slope: 30 },
  { basefreq: 2062, approxtype: 1, slope: 30 },
  { basefreq: 2092, approxtype: 1, slope: 30 },
  { basefreq: 2122, approxtype: 1, slope: 31 },
  { basefreq: 2153, approxtype: 1, slope: 31 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 2185, approxtype: 1, slope: 31 },
  { basefreq: 2216, approxtype: 0, slope: 31 },
  { basefreq: 2249, approxtype: 0, slope: 31 },
  { basefreq: 2281, approxtype: 0, slope: 31 },
  { basefreq: 2315, approxtype: 0, slope: 31 },
  { basefreq: 2348, approxtype: 0, slope: 31 },
  { basefreq: 2382, approxtype: 0, slope: 30 },
  { basefreq: 2417, approxtype: 0, slope: 30 },
  { basefreq: 2452, approxtype: 0, slope: 30 },
  { basefreq: 2488, approxtype: 0, slope: 30 },
  { basefreq: 2524, approxtype: 0, slope: 30 },
  { basefreq: 2561, approxtype: 0, slope: 30 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
  { basefreq: 0, approxtype: 0, slope: 16 },
];

/* FM algorithm: [operator_phase][row][connect] */
const fm_algorithm: number[][][] = [
  [
    [1, 1, 1, 1, 1, 1, 1, 1], /* M1_0          */
    [1, 1, 1, 1, 1, 1, 1, 1], /* M1_1          */
    [0, 0, 0, 0, 0, 0, 0, 0], /* C1            */
    [0, 0, 0, 0, 0, 0, 0, 0], /* Last operator */
    [0, 0, 0, 0, 0, 0, 0, 0], /* Last operator */
    [0, 0, 0, 0, 0, 0, 0, 1], /* Out           */
  ],
  [
    [0, 1, 0, 0, 0, 1, 0, 0], /* M1_0          */
    [0, 0, 0, 0, 0, 0, 0, 0], /* M1_1          */
    [1, 1, 1, 0, 0, 0, 0, 0], /* C1            */
    [0, 0, 0, 0, 0, 0, 0, 0], /* Last operator */
    [0, 0, 0, 0, 0, 0, 0, 0], /* Last operator */
    [0, 0, 0, 0, 0, 1, 1, 1], /* Out           */
  ],
  [
    [0, 0, 0, 0, 0, 0, 0, 0], /* M1_0          */
    [0, 0, 0, 0, 0, 0, 0, 0], /* M1_1          */
    [0, 0, 0, 0, 0, 0, 0, 0], /* C1            */
    [1, 0, 0, 1, 1, 1, 1, 0], /* Last operator */
    [0, 0, 0, 0, 0, 0, 0, 0], /* Last operator */
    [0, 0, 0, 0, 1, 1, 1, 1], /* Out           */
  ],
  [
    [0, 0, 1, 0, 0, 1, 0, 0], /* M1_0          */
    [0, 0, 0, 0, 0, 0, 0, 0], /* M1_1          */
    [0, 0, 0, 1, 0, 0, 0, 0], /* C1            */
    [1, 1, 0, 1, 1, 0, 0, 0], /* Last operator */
    [0, 0, 1, 0, 0, 0, 0, 0], /* Last operator */
    [1, 1, 1, 1, 1, 1, 1, 1], /* Out           */
  ],
];

const lfo_counter2_table: Uint16Array = new Uint16Array([
  0x0000, 0x4000, 0x6000, 0x7000,
  0x7800, 0x7c00, 0x7e00, 0x7f00,
  0x7f80, 0x7fc0, 0x7fe0, 0x7ff0,
  0x7ff8, 0x7ffc, 0x7ffe, 0x7fff,
]);

// ─── opm_t struct as a class ───────────────────────────────────────────────────

class opm_t {
  cycles: number = 0;
  ic: number = 0;
  ic2: number = 0;

  // IO
  write_data: number = 0;
  write_a: number = 0;
  write_a_en: number = 0;
  write_d: number = 0;
  write_d_en: number = 0;
  write_busy: number = 0;
  write_busy_cnt: number = 0;
  mode_address: number = 0;
  io_ct1: number = 0;
  io_ct2: number = 0;

  // LFO
  lfo_am_lock: number = 0;
  lfo_pm_lock: number = 0;
  lfo_counter1: number = 0;
  lfo_counter1_of1: number = 0;
  lfo_counter1_of2: number = 0;
  lfo_counter2: number = 0;
  lfo_counter2_load: number = 0;
  lfo_counter2_of: number = 0;
  lfo_counter2_of_lock: number = 0;
  lfo_counter2_of_lock2: number = 0;
  lfo_counter3_clock: number = 0;
  lfo_counter3: number = 0;
  lfo_counter3_step: number = 0;
  lfo_frq_update: number = 0;
  lfo_clock: number = 0;
  lfo_clock_lock: number = 0;
  lfo_clock_test: number = 0;
  lfo_test: number = 0;
  lfo_val: number = 0;
  lfo_val_carry: number = 0;
  lfo_out1: number = 0;
  lfo_out2: number = 0;
  lfo_out2_b: number = 0;
  lfo_mult_carry: number = 0;
  lfo_trig_sign: number = 0;
  lfo_saw_sign: number = 0;
  lfo_bit_counter: number = 0;

  // Env Gen
  eg_state: Uint8Array = new Uint8Array(32);
  eg_level: Uint16Array = new Uint16Array(32);
  eg_rate: Uint8Array = new Uint8Array(2);
  eg_sl: Uint8Array = new Uint8Array(2);
  eg_tl: Uint8Array = new Uint8Array(3);
  eg_zr: Uint8Array = new Uint8Array(2);
  eg_timershift_lock: number = 0;
  eg_timer_lock: number = 0;
  eg_inchi: number = 0;
  eg_shift: number = 0;
  eg_clock: number = 0;
  eg_clockcnt: number = 0;
  eg_clockquotinent: number = 0;
  eg_inc: number = 0;
  eg_ratemax: Uint8Array = new Uint8Array(2);
  eg_instantattack: number = 0;
  eg_inclinear: number = 0;
  eg_incattack: number = 0;
  eg_mute: number = 0;
  eg_outtemp: Uint16Array = new Uint16Array(2);
  eg_out: Uint16Array = new Uint16Array(2);
  eg_am: number = 0;
  eg_ams: Uint8Array = new Uint8Array(2);
  eg_timercarry: number = 0;
  eg_timer: number = 0;
  eg_timer2: number = 0;
  eg_timerbstop: number = 0;
  eg_serial: number = 0;
  eg_serial_bit: number = 0;
  eg_test: number = 0;

  // Phase Gen
  pg_fnum: Uint16Array = new Uint16Array(32);
  pg_kcode: Uint8Array = new Uint8Array(32);
  pg_inc: Uint32Array = new Uint32Array(32);
  pg_phase: Uint32Array = new Uint32Array(32);
  pg_reset: Uint8Array = new Uint8Array(32);
  pg_reset_latch: Uint8Array = new Uint8Array(32);
  pg_serial: number = 0;

  // Operator
  op_phase_in: number = 0;
  op_mod_in: number = 0;
  op_phase: number = 0;
  op_logsin: Uint16Array = new Uint16Array(3);
  op_atten: number = 0;
  op_exp: Uint16Array = new Uint16Array(2);
  op_pow: Uint8Array = new Uint8Array(2);
  op_sign: number = 0;
  op_out: Int16Array = new Int16Array(6);
  op_connect: number = 0;
  op_counter: number = 0;
  op_fbupdate: number = 0;
  op_fbshift: number = 0;
  op_c1update: number = 0;
  op_modtable: Uint8Array = new Uint8Array(5);
  // op_m1[8][2] - use a flat array of size 16, index as [ch*2 + idx]
  op_m1: Int16Array = new Int16Array(16);
  op_c1: Int16Array = new Int16Array(8);
  op_mod: Int16Array = new Int16Array(3);
  op_fb: Int16Array = new Int16Array(2);
  op_mixl: number = 0;
  op_mixr: number = 0;
  op_chmix: Uint16Array = new Uint16Array(8);

  // Mixer
  mix: Int32Array = new Int32Array(2);
  mix2: Int32Array = new Int32Array(2);
  mix_op: number = 0;
  mix_serial: Uint32Array = new Uint32Array(2);
  mix_bits: number = 0;
  mix_top_bits_lock: number = 0;
  mix_sign_lock: number = 0;
  mix_sign_lock2: number = 0;
  mix_exp_lock: number = 0;
  mix_clamp_low: Uint8Array = new Uint8Array(2);
  mix_clamp_high: Uint8Array = new Uint8Array(2);
  mix_out_bit: number = 0;

  // Output
  smp_so: number = 0;
  smp_sh1: number = 0;
  smp_sh2: number = 0;
  ch_out: Uint16Array = new Uint16Array(8);

  // Noise
  noise_lfsr: number = 0;
  noise_timer: number = 0;
  noise_timer_of: number = 0;
  noise_update: number = 0;
  noise_temp: number = 0;

  // Register set
  mode_test: Uint8Array = new Uint8Array(8);
  mode_kon_operator: Uint8Array = new Uint8Array(4);
  mode_kon_channel: number = 0;

  reg_address: number = 0;
  reg_address_ready: number = 0;
  reg_data: number = 0;
  reg_data_ready: number = 0;

  ch_rl: Uint8Array = new Uint8Array(8);
  ch_fb: Uint8Array = new Uint8Array(8);
  ch_connect: Uint8Array = new Uint8Array(8);
  ch_kc: Uint8Array = new Uint8Array(8);
  ch_kf: Uint8Array = new Uint8Array(8);
  ch_pms: Uint8Array = new Uint8Array(8);
  ch_ams: Uint8Array = new Uint8Array(8);

  sl_dt1: Uint8Array = new Uint8Array(32);
  sl_mul: Uint8Array = new Uint8Array(32);
  sl_tl: Uint8Array = new Uint8Array(32);
  sl_ks: Uint8Array = new Uint8Array(32);
  sl_ar: Uint8Array = new Uint8Array(32);
  sl_am_e: Uint8Array = new Uint8Array(32);
  sl_d1r: Uint8Array = new Uint8Array(32);
  sl_dt2: Uint8Array = new Uint8Array(32);
  sl_d2r: Uint8Array = new Uint8Array(32);
  sl_d1l: Uint8Array = new Uint8Array(32);
  sl_rr: Uint8Array = new Uint8Array(32);

  noise_en: number = 0;
  noise_freq: number = 0;

  // Timer
  timer_a_reg: number = 0;
  timer_b_reg: number = 0;
  timer_a_temp: number = 0;
  timer_a_do_reset: number = 0;
  timer_a_do_load: number = 0;
  timer_a_inc: number = 0;
  timer_a_val: number = 0;
  timer_a_of: number = 0;
  timer_a_load: number = 0;
  timer_a_status: number = 0;

  timer_b_sub: number = 0;
  timer_b_sub_of: number = 0;
  timer_b_inc: number = 0;
  timer_b_val: number = 0;
  timer_b_of: number = 0;
  timer_b_do_reset: number = 0;
  timer_b_do_load: number = 0;
  timer_b_temp: number = 0;
  timer_b_status: number = 0;
  timer_irq: number = 0;

  lfo_freq_hi: number = 0;
  lfo_freq_lo: number = 0;
  lfo_pmd: number = 0;
  lfo_amd: number = 0;
  lfo_wave: number = 0;

  timer_irqa: number = 0;
  timer_irqb: number = 0;
  timer_loada: number = 0;
  timer_loadb: number = 0;
  timer_reseta: number = 0;
  timer_resetb: number = 0;
  mode_csm: number = 0;

  nc_active: number = 0;
  nc_active_lock: number = 0;
  nc_sign: number = 0;
  nc_sign_lock: number = 0;
  nc_sign_lock2: number = 0;
  nc_bit: number = 0;
  nc_out: number = 0;
  op_mix: number = 0;

  kon_csm: number = 0;
  kon_csm_lock: number = 0;
  kon_do: number = 0;
  kon_chanmatch: number = 0;
  kon: Uint8Array = new Uint8Array(32);
  kon2: Uint8Array = new Uint8Array(32);
  mode_kon: Uint8Array = new Uint8Array(32);

  // DAC
  dac_osh1: number = 0;
  dac_osh2: number = 0;
  dac_bits: number = 0;
  dac_output: Int32Array = new Int32Array(2);
}

// ─── Helper functions (static in C) ───────────────────────────────────────────

function OPM_KCToFNum(kcode: number): number {
  const kcode_h = (kcode >> 4) & 63;
  const kcode_l = kcode & 15;
  let sum = 0;
  if (pg_freqtable[kcode_h].approxtype) {
    for (let i = 0; i < 4; i++) {
      if (kcode_l & (1 << i)) {
        sum += (pg_freqtable[kcode_h].slope >> (3 - i));
      }
    }
  } else {
    const slope = pg_freqtable[kcode_h].slope | 1;
    if (kcode_l & 1) {
      sum += (slope >> 3) + 2;
    }
    if (kcode_l & 2) {
      sum += 8;
    }
    if (kcode_l & 4) {
      sum += slope >> 1;
    }
    if (kcode_l & 8) {
      sum += slope;
      sum++;
    }
    if ((kcode_l & 12) === 12 && (pg_freqtable[kcode_h].slope & 1) === 0) {
      sum += 4;
    }
  }
  return pg_freqtable[kcode_h].basefreq + (sum >> 1);
}

function OPM_LFOApplyPMS(lfo: number, pms: number): number {
  let out: number;
  let top = (lfo >> 4) & 7;
  if (pms !== 7) {
    top >>= 1;
  }
  const t = ((top & 6) === 6 || ((top & 3) === 3 && pms >= 6)) ? 1 : 0;

  out = top + ((top >> 2) & 1) + t;
  out = out * 2 + ((lfo >> 4) & 1);

  if (pms === 7) {
    out >>= 1;
  }
  out &= 15;
  out = (lfo & 15) + out * 16;
  switch (pms) {
    case 0:
    default:
      out = 0;
      break;
    case 1:
      out = (out >> 5) & 3;
      break;
    case 2:
      out = (out >> 4) & 7;
      break;
    case 3:
      out = (out >> 3) & 15;
      break;
    case 4:
      out = (out >> 2) & 31;
      break;
    case 5:
      out = (out >> 1) & 63;
      break;
    case 6:
      out = (out & 255) << 1;
      break;
    case 7:
      out = (out & 255) << 2;
      break;
  }
  return out;
}

function OPM_CalcKCode(kcf: number, lfo: number, lfo_sign: number, dt: number): number {
  let overflow1 = 0;
  let overflow2 = 0;
  let negoverflow = 0;

  if (!lfo_sign) {
    lfo = ~lfo;
  }
  let sum = (kcf & 8191) + (lfo & 8191) + (lfo_sign ? 0 : 1);
  const cr = ((kcf & 255) + (lfo & 255) + (lfo_sign ? 0 : 1)) >> 8;
  if (sum & (1 << 13)) {
    overflow1 = 1;
  }
  sum &= 8191;
  if (lfo_sign && ((((sum >> 6) & 3) === 3) || cr)) {
    sum += 64;
  }
  if (!lfo_sign && !cr) {
    sum += (-64) & 8191;
    negoverflow = 1;
  }
  if (sum & (1 << 13)) {
    overflow2 = 1;
  }
  sum &= 8191;
  if ((!lfo_sign && !overflow1) || (negoverflow && !overflow2)) {
    sum = 0;
  }
  if (lfo_sign && (overflow1 || overflow2)) {
    sum = 8127;
  }

  let t2 = sum & 63;
  if (dt === 2) t2 += 20;
  if (dt === 2 || dt === 3) t2 += 32;

  const b0 = (t2 >> 6) & 1;
  const b1 = dt === 2 ? 1 : 0;
  const b2 = (sum >> 6) & 1;
  const b3 = (sum >> 7) & 1;

  const w2 = (b0 && b1 && b2) ? 1 : 0;
  const w3 = (b0 && b3) ? 1 : 0;
  const w6 = ((b0 && !w2 && !w3) || (b3 && !b0 && b1)) ? 1 : 0;

  t2 &= 63;

  let t3 = (sum >> 6) + w6 + b1 + (w2 || w3 ? 1 : 0) * 2 + (dt === 3 ? 1 : 0) * 4 + (dt !== 0 ? 1 : 0) * 8;
  if (t3 & 128) {
    t2 = 63;
    t3 = 126;
  }
  sum = t3 * 64 + t2;
  return sum;
}

function OPM_PhaseCalcFNumBlock(chip: opm_t): void {
  const slot = (chip.cycles + 7) % 32;
  const channel = slot % 8;
  const kcf = (chip.ch_kc[channel] << 6) + chip.ch_kf[channel];
  const lfo = chip.lfo_pmd ? chip.lfo_pm_lock : 0;
  const pms = chip.ch_pms[channel];
  const dt = chip.sl_dt2[slot];
  const lfo_pm = OPM_LFOApplyPMS(lfo & 127, pms);
  const kcode = OPM_CalcKCode(kcf, lfo_pm, (lfo & 0x80) !== 0 && pms !== 0 ? 0 : 1, dt);
  const fnum = OPM_KCToFNum(kcode);
  const kcode_h = kcode >> 8;
  chip.pg_fnum[slot] = fnum;
  chip.pg_kcode[slot] = kcode_h;
}

function OPM_PhaseCalcIncrement(chip: opm_t): void {
  const slot = chip.cycles;
  const dt = chip.sl_dt1[slot];
  const dt_l = dt & 3;
  let detune = 0;
  const multi = chip.sl_mul[slot];
  let kcode = chip.pg_kcode[slot];
  const fnum = chip.pg_fnum[slot];
  let block = kcode >> 2;
  let basefreq = (fnum << block) >> 2;

  /* Apply detune */
  if (dt_l) {
    if (kcode > 0x1c) {
      kcode = 0x1c;
    }
    block = kcode >> 2;
    const note = kcode & 0x03;
    const sum = block + 9 + ((dt_l === 3 ? 1 : 0) | (dt_l & 0x02));
    const sum_h = sum >> 1;
    const sum_l = sum & 0x01;
    detune = pg_detune[(sum_l << 2) | note] >> (9 - sum_h);
  }
  if (dt & 0x04) {
    basefreq -= detune;
  } else {
    basefreq += detune;
  }
  basefreq &= 0x1ffff;
  let inc: number;
  if (multi) {
    inc = basefreq * multi;
  } else {
    inc = basefreq >> 1;
  }
  inc &= 0xfffff;
  chip.pg_inc[slot] = inc;
}

function OPM_PhaseGenerate(chip: opm_t): void {
  let slot = (chip.cycles + 27) % 32;
  chip.pg_reset_latch[slot] = chip.pg_reset[slot];
  slot = (chip.cycles + 25) % 32;
  /* Mask increment */
  if (chip.pg_reset_latch[slot]) {
    chip.pg_inc[slot] = 0;
  }
  /* Phase step */
  slot = (chip.cycles + 24) % 32;
  if (chip.pg_reset_latch[slot] || chip.mode_test[3]) {
    chip.pg_phase[slot] = 0;
  }
  chip.pg_phase[slot] = (chip.pg_phase[slot] + chip.pg_inc[slot]) & 0xfffff;
}

function OPM_PhaseDebug(chip: opm_t): void {
  chip.pg_serial >>= 1;
  if (chip.cycles === 5) {
    chip.pg_serial |= (chip.pg_phase[29] & 0x3ff);
  }
}

function OPM_KeyOn1(chip: opm_t): void {
  const cycles = (chip.cycles + 1) % 32;
  chip.kon_chanmatch = 0;
  if (chip.mode_kon_channel + 24 === cycles) {
    chip.kon_chanmatch = 1;
  }
}

function OPM_KeyOn2(chip: opm_t): void {
  const slot = (chip.cycles + 8) % 32;
  if (chip.kon_chanmatch) {
    chip.mode_kon[(slot + 0) % 32] = chip.mode_kon_operator[0];
    chip.mode_kon[(slot + 8) % 32] = chip.mode_kon_operator[2];
    chip.mode_kon[(slot + 16) % 32] = chip.mode_kon_operator[1];
    chip.mode_kon[(slot + 24) % 32] = chip.mode_kon_operator[3];
  }
}

function OPM_EnvelopePhase1(chip: opm_t): void {
  const slot = (chip.cycles + 2) % 32;
  const kon = chip.mode_kon[slot] | chip.kon_csm;
  const konevent = !chip.kon[slot] && kon;
  if (konevent) {
    chip.eg_state[slot] = eg_num_attack;
  }
  chip.kon2[slot] = chip.kon[slot];
  chip.kon[slot] = kon;
}

function OPM_EnvelopePhase2(chip: opm_t): void {
  const slot = chip.cycles;
  const chan = slot % 8;
  let rate = 0;
  let zr: number;
  let ams: number;
  switch (chip.eg_state[slot]) {
    case eg_num_attack:
      rate = chip.sl_ar[slot];
      break;
    case eg_num_decay:
      rate = chip.sl_d1r[slot];
      break;
    case eg_num_sustain:
      rate = chip.sl_d2r[slot];
      break;
    case eg_num_release:
      rate = chip.sl_rr[slot] * 2 + 1;
      break;
    default:
      break;
  }
  if (chip.ic) {
    rate = 31;
  }

  zr = rate === 0 ? 1 : 0;

  let ksv = chip.pg_kcode[slot] >> (chip.sl_ks[slot] ^ 3);
  if (chip.sl_ks[slot] === 0 && zr) {
    ksv &= ~3;
  }
  rate = rate * 2 + ksv;
  if (rate & 64) {
    rate = 63;
  }

  chip.eg_tl[2] = chip.eg_tl[1];
  chip.eg_tl[1] = chip.eg_tl[0];
  chip.eg_tl[0] = chip.sl_tl[slot];
  chip.eg_sl[1] = chip.eg_sl[0];
  chip.eg_sl[0] = chip.sl_d1l[slot];
  if (chip.sl_d1l[slot] === 15) {
    chip.eg_sl[0] = 31;
  }
  chip.eg_zr[1] = chip.eg_zr[0];
  chip.eg_zr[0] = zr;
  chip.eg_rate[1] = chip.eg_rate[0];
  chip.eg_rate[0] = rate;
  chip.eg_ratemax[1] = chip.eg_ratemax[0];
  chip.eg_ratemax[0] = (rate >> 1) === 31 ? 1 : 0;
  ams = chip.sl_am_e[slot] ? chip.ch_ams[chan] : 0;
  switch (ams) {
    default:
    case 0:
      chip.eg_am = 0;
      break;
    case 1:
      chip.eg_am = chip.lfo_am_lock << 0;
      break;
    case 2:
      chip.eg_am = chip.lfo_am_lock << 1;
      break;
    case 3:
      chip.eg_am = chip.lfo_am_lock << 2;
      break;
  }
}

function OPM_EnvelopePhase3(chip: opm_t): void {
  chip.eg_shift = (chip.eg_timershift_lock + (chip.eg_rate[0] >> 2)) & 15;
  chip.eg_inchi = eg_stephi[chip.eg_rate[0] & 3][chip.eg_timer_lock & 3];

  chip.eg_outtemp[1] = chip.eg_outtemp[0];
  chip.eg_outtemp[0] = chip.eg_level[(chip.cycles + 31) % 32] + chip.eg_am;
  if (chip.eg_outtemp[0] & 1024) {
    chip.eg_outtemp[0] = 1023;
  }
}

function OPM_EnvelopePhase4(chip: opm_t): void {
  const slot = (chip.cycles + 30) % 32;
  let inc = 0;
  if (chip.eg_clock & 2) {
    if (chip.eg_rate[1] >= 48) {
      inc = chip.eg_inchi + (chip.eg_rate[1] >> 2) - 11;
      if (inc > 4) {
        inc = 4;
      }
    } else if (!chip.eg_zr[1]) {
      switch (chip.eg_shift) {
        case 12:
          inc = chip.eg_rate[1] !== 0 ? 1 : 0;
          break;
        case 13:
          inc = (chip.eg_rate[1] >> 1) & 1;
          break;
        case 14:
          inc = chip.eg_rate[1] & 1;
          break;
      }
    }
  }
  chip.eg_inc = inc;

  const kon = chip.kon[slot] && !chip.kon2[slot] ? 1 : 0;
  chip.pg_reset[slot] = kon;
  chip.eg_instantattack = chip.eg_ratemax[1] && (kon || !chip.eg_ratemax[1]) ? 1 : 0;

  const eg_off = ((chip.eg_level[slot] & 0x3f0) === 0x3f0) ? 1 : 0;
  const slreach = ((chip.eg_level[slot] >> 4) === (chip.eg_sl[1] << 1)) ? 1 : 0;
  const eg_zero = (chip.eg_level[slot] === 0) ? 1 : 0;

  chip.eg_mute = (eg_off && chip.eg_state[slot] !== eg_num_attack && !kon) ? 1 : 0;
  chip.eg_inclinear = 0;
  if (!kon && !eg_off) {
    switch (chip.eg_state[slot]) {
      case eg_num_decay:
        if (!slreach) chip.eg_inclinear = 1;
        break;
      case eg_num_sustain:
      case eg_num_release:
        chip.eg_inclinear = 1;
        break;
    }
  }
  chip.eg_incattack = (chip.eg_state[slot] === eg_num_attack && !chip.eg_ratemax[1] && chip.kon[slot] && !eg_zero) ? 1 : 0;

  // Update state
  if (kon) {
    chip.eg_state[slot] = eg_num_attack;
  } else if (!chip.kon[slot]) {
    chip.eg_state[slot] = eg_num_release;
  } else {
    switch (chip.eg_state[slot]) {
      case eg_num_attack:
        if (eg_zero) {
          chip.eg_state[slot] = eg_num_decay;
        }
        break;
      case eg_num_decay:
        if (eg_off) {
          chip.eg_state[slot] = eg_num_release;
        } else if (slreach) {
          chip.eg_state[slot] = eg_num_sustain;
        }
        break;
      case eg_num_sustain:
        if (eg_off) {
          chip.eg_state[slot] = eg_num_release;
        }
        break;
      case eg_num_release:
        break;
    }
  }

  if (chip.ic) {
    chip.eg_state[slot] = eg_num_release;
  }
}

function OPM_EnvelopePhase5(chip: opm_t): void {
  const slot = (chip.cycles + 29) % 32;
  let level = chip.eg_level[slot];
  let step = 0;
  if (chip.eg_instantattack) {
    level = 0;
  }
  if (chip.eg_mute || chip.ic) {
    level = 0x3ff;
  }
  if (chip.eg_inc) {
    if (chip.eg_inclinear) {
      step |= 1 << (chip.eg_inc - 1);
    }
    if (chip.eg_incattack) {
      // C: step |= ((~(int32_t)chip->eg_level[slot]) << chip->eg_inc) >> 5;
      // Must use signed 32-bit NOT (not masked to 16 bits) for correct attack curve.
      step |= ((~chip.eg_level[slot]) << chip.eg_inc) >> 5;
    }
  }
  level += step;
  chip.eg_level[slot] = level & 0xffff;

  chip.eg_out[0] = chip.eg_outtemp[1] + (chip.eg_tl[2] << 3);
  if (chip.eg_out[0] & 1024) {
    chip.eg_out[0] = 1023;
  }

  if (chip.eg_test) {
    chip.eg_out[0] = 0;
  }

  chip.eg_test = chip.mode_test[5];
}

function OPM_EnvelopePhase6(chip: opm_t): void {
  chip.eg_serial_bit = (chip.eg_serial >> 9) & 1;
  if (chip.cycles === 3) {
    chip.eg_serial = chip.eg_out[0] ^ 1023;
  } else {
    chip.eg_serial <<= 1;
  }

  chip.eg_out[1] = chip.eg_out[0];
}

function OPM_EnvelopeClock(chip: opm_t): void {
  chip.eg_clock <<= 1;
  if ((chip.eg_clockcnt & 2) !== 0 || chip.mode_test[0]) {
    chip.eg_clock |= 1;
  }
  if (chip.ic || (chip.cycles === 31 && (chip.eg_clockcnt & 2) !== 0)) {
    chip.eg_clockcnt = 0;
  } else if (chip.cycles === 31) {
    chip.eg_clockcnt++;
  }
}

function OPM_EnvelopeTimer(chip: opm_t): void {
  const cycle = (chip.cycles + 31) % 16;
  const inc_cond = ((chip.cycles + 31) % 32) < 16 && (chip.eg_clock & 1) !== 0 && (cycle === 0 || chip.eg_timercarry !== 0);
  const inc = inc_cond ? 1 : 0;
  const timerbit = (chip.eg_timer >> cycle) & 1;
  const sum = timerbit + inc;
  const sum0 = (sum & 1) && !chip.ic ? 1 : 0;
  chip.eg_timercarry = sum >> 1;
  chip.eg_timer = (chip.eg_timer & (~(1 << cycle))) | (sum0 << cycle);

  const cycle2 = (chip.cycles + 30) % 16;

  chip.eg_timer2 <<= 1;
  if ((chip.eg_timer & (1 << cycle2)) !== 0 && !chip.eg_timerbstop) {
    chip.eg_timer2 |= 1;
  }

  if (chip.eg_timer & (1 << cycle2)) {
    chip.eg_timerbstop = 1;
  }

  if (cycle === 0 || chip.ic2) {
    chip.eg_timerbstop = 0;
  }

  if (chip.cycles === 1 && (chip.eg_clock & 1) !== 0) {
    chip.eg_timershift_lock = 0;
    if (chip.eg_timer2 & (8 + 32 + 128 + 512 + 2048 + 8192 + 32768)) {
      chip.eg_timershift_lock |= 1;
    }
    if (chip.eg_timer2 & (4 + 32 + 64 + 512 + 1024 + 8192 + 16384)) {
      chip.eg_timershift_lock |= 2;
    }
    if (chip.eg_timer2 & (4 + 8 + 16 + 512 + 1024 + 2048 + 4096)) {
      chip.eg_timershift_lock |= 4;
    }
    if (chip.eg_timer2 & (4 + 8 + 16 + 32 + 64 + 128 + 256)) {
      chip.eg_timershift_lock |= 8;
    }
    chip.eg_timer_lock = chip.eg_timer;
  }
}

function OPM_OperatorPhase1(chip: opm_t): void {
  let mod = chip.op_mod[2];
  chip.op_phase_in = chip.pg_phase[chip.cycles] >> 10;
  if (chip.op_fbshift & 8) {
    if (chip.op_fb[1] === 0) {
      mod = 0;
    } else {
      mod = mod >> (9 - chip.op_fb[1]);
    }
  }
  chip.op_mod_in = mod;
}

function OPM_OperatorPhase2(chip: opm_t): void {
  chip.op_phase = (chip.op_phase_in + chip.op_mod_in) & 1023;
}

function OPM_OperatorPhase3(chip: opm_t): void {
  let phase = chip.op_phase & 255;
  if (chip.op_phase & 256) {
    phase ^= 255;
  }
  chip.op_logsin[0] = logsinrom[phase];
  chip.op_sign <<= 1;
  chip.op_sign |= (chip.op_phase >> 9) & 1;
}

function OPM_OperatorPhase4(chip: opm_t): void {
  chip.op_logsin[1] = chip.op_logsin[0];
}

function OPM_OperatorPhase5(chip: opm_t): void {
  chip.op_logsin[2] = chip.op_logsin[1];
}

function OPM_OperatorPhase6(chip: opm_t): void {
  chip.op_atten = chip.op_logsin[2] + (chip.eg_out[1] << 2);
  if (chip.op_atten & 4096) {
    chip.op_atten = 4095;
  }
}

function OPM_OperatorPhase7(chip: opm_t): void {
  chip.op_exp[0] = exprom[chip.op_atten & 255];
  chip.op_pow[0] = chip.op_atten >> 8;
}

function OPM_OperatorPhase8(chip: opm_t): void {
  chip.op_exp[1] = chip.op_exp[0];
  chip.op_pow[1] = chip.op_pow[0];
}

function OPM_OperatorPhase9(chip: opm_t): void {
  let out = (chip.op_exp[1] << 2) >> (chip.op_pow[1]);
  if (chip.op_sign & 32) {
    out = -out;
  }
  chip.op_out[0] = out;
}

function OPM_OperatorPhase10(chip: opm_t): void {
  chip.op_out[1] = chip.op_out[0];
}

function OPM_OperatorPhase11(chip: opm_t): void {
  chip.op_out[2] = chip.op_out[1];
}

function OPM_OperatorPhase12(chip: opm_t): void {
  chip.op_out[3] = chip.op_out[2];
}

function OPM_OperatorPhase13(chip: opm_t): void {
  const slot = (chip.cycles + 20) % 32;
  chip.op_out[4] = chip.op_out[3];
  chip.op_connect = chip.ch_connect[slot % 8];
}

function OPM_OperatorPhase14(chip: opm_t): void {
  const slot = (chip.cycles + 19) % 32;
  chip.op_mix = chip.op_out[5] = chip.op_out[4];
  chip.op_fbupdate = (chip.op_counter === 0) ? 1 : 0;
  chip.op_c1update = (chip.op_counter === 2) ? 1 : 0;
  chip.op_fbshift <<= 1;
  chip.op_fbshift |= (chip.op_counter === 2) ? 1 : 0;

  chip.op_modtable[0] = fm_algorithm[(chip.op_counter + 2) % 4][0][chip.op_connect];
  chip.op_modtable[1] = fm_algorithm[(chip.op_counter + 2) % 4][1][chip.op_connect];
  chip.op_modtable[2] = fm_algorithm[(chip.op_counter + 2) % 4][2][chip.op_connect];
  chip.op_modtable[3] = fm_algorithm[(chip.op_counter + 2) % 4][3][chip.op_connect];
  chip.op_modtable[4] = fm_algorithm[(chip.op_counter + 2) % 4][4][chip.op_connect];
  chip.op_mixl = (fm_algorithm[chip.op_counter][5][chip.op_connect] && (chip.ch_rl[slot % 8] & 1) !== 0) ? 1 : 0;
  chip.op_mixr = (fm_algorithm[chip.op_counter][5][chip.op_connect] && (chip.ch_rl[slot % 8] & 2) !== 0) ? 1 : 0;
}

function OPM_OperatorPhase15(chip: opm_t): void {
  const slot = (chip.cycles + 18) % 32;
  const ch = slot % 8;
  let mod1 = 0;
  let mod2 = 0;
  if (chip.op_modtable[0]) {
    mod2 |= chip.op_m1[ch * 2 + 0];
  }
  if (chip.op_modtable[1]) {
    mod1 |= chip.op_m1[ch * 2 + 1];
  }
  if (chip.op_modtable[2]) {
    mod1 |= chip.op_c1[ch];
  }
  if (chip.op_modtable[3]) {
    mod2 |= chip.op_out[5];
  }
  if (chip.op_modtable[4]) {
    mod1 |= chip.op_out[5];
  }
  const mod = (mod1 + mod2) >> 1;
  chip.op_mod[0] = mod;
  if (chip.op_fbupdate) {
    chip.op_m1[ch * 2 + 1] = chip.op_m1[ch * 2 + 0];
    chip.op_m1[ch * 2 + 0] = chip.op_out[5];
  }
  if (chip.op_c1update) {
    chip.op_c1[ch] = chip.op_out[5];
  }
}

function OPM_OperatorPhase16(chip: opm_t): void {
  const slot = (chip.cycles + 17) % 32;
  // hack
  chip.op_mod[2] = chip.op_mod[1];
  chip.op_fb[1] = chip.op_fb[0];

  chip.op_mod[1] = chip.op_mod[0];
  chip.op_fb[0] = chip.ch_fb[slot % 8];
}

function OPM_OperatorCounter(chip: opm_t): void {
  if ((chip.cycles % 8) === 4) {
    chip.op_counter++;
  }
  if (chip.cycles === 12) {
    chip.op_counter = 0;
  }
}

function OPM_Mixer2(chip: opm_t): void {
  const cycles = (chip.cycles + 30) % 32;
  let bit: number;
  if (cycles < 16) {
    bit = chip.mix_serial[0] & 1;
  } else {
    bit = chip.mix_serial[1] & 1;
  }
  if (chip.cycles % 16 === 1) {
    chip.mix_sign_lock = bit ^ 1;
    chip.mix_top_bits_lock = (chip.mix_bits >> 15) & 63;
  }
  chip.mix_bits >>>= 1;
  chip.mix_bits |= bit << 20;
  if (chip.cycles % 16 === 10) {
    let top = chip.mix_top_bits_lock;
    if (chip.mix_sign_lock) {
      top ^= 63;
    }
    let ex: number;
    if (top & 32) {
      ex = 7;
    } else if (top & 16) {
      ex = 6;
    } else if (top & 8) {
      ex = 5;
    } else if (top & 4) {
      ex = 4;
    } else if (top & 2) {
      ex = 3;
    } else if (top & 1) {
      ex = 2;
    } else {
      ex = 1;
    }
    chip.mix_sign_lock2 = chip.mix_sign_lock;
    chip.mix_exp_lock = ex;
  }
  chip.mix_out_bit <<= 1;
  switch ((chip.cycles + 1) % 16) {
    case 0:
      chip.mix_out_bit |= chip.mix_sign_lock2 ^ 1;
      break;
    case 1:
      chip.mix_out_bit |= (chip.mix_exp_lock >> 0) & 1;
      break;
    case 2:
      chip.mix_out_bit |= (chip.mix_exp_lock >> 1) & 1;
      break;
    case 3:
      chip.mix_out_bit |= (chip.mix_exp_lock >> 2) & 1;
      break;
    default:
      if (chip.mix_exp_lock) {
        chip.mix_out_bit |= (chip.mix_bits >> (chip.mix_exp_lock - 1)) & 1;
      }
      break;
  }
}

function OPM_Output(chip: opm_t): void {
  const slot = (chip.cycles + 27) % 32;
  chip.smp_so = (chip.mix_out_bit & 4) !== 0 ? 1 : 0;
  chip.smp_sh1 = ((slot & 24) === 8 && !chip.ic) ? 1 : 0;
  chip.smp_sh2 = ((slot & 24) === 24 && !chip.ic) ? 1 : 0;
}

function OPM_DAC(chip: opm_t): void {
  let exp: number, mant: number;
  if (chip.dac_osh1 && !chip.smp_sh1) {
    exp = (chip.dac_bits >> 10) & 7;
    mant = (chip.dac_bits >> 0) & 1023;
    mant -= 512;
    chip.dac_output[1] = (mant << exp) >> 1;
  }
  if (chip.dac_osh2 && !chip.smp_sh2) {
    exp = (chip.dac_bits >> 10) & 7;
    mant = (chip.dac_bits >> 0) & 1023;
    mant -= 512;
    chip.dac_output[0] = (mant << exp) >> 1;
  }
  chip.dac_bits >>= 1;
  chip.dac_bits |= chip.smp_so << 12;
  chip.dac_osh1 = chip.smp_sh1;
  chip.dac_osh2 = chip.smp_sh2;
}

function OPM_Mixer(chip: opm_t): void {
  const slot = (chip.cycles + 18) % 32;
  // Right channel
  chip.mix_serial[1] >>>= 1;
  if (chip.cycles === 13) {
    chip.mix_serial[1] |= (chip.mix[1] & 1023) << 4;
  }
  if (chip.cycles === 14) {
    chip.mix_serial[1] |= ((chip.mix2[1] >> 10) & 31) << 13;
    chip.mix_serial[1] |= (((chip.mix2[1] >> 17) & 1) ^ 1) << 18;
    chip.mix_clamp_low[1] = 0;
    chip.mix_clamp_high[1] = 0;
    switch ((chip.mix2[1] >> 15) & 7) {
      case 0:
      default:
        break;
      case 1:
        chip.mix_clamp_high[1] = 1;
        break;
      case 2:
        chip.mix_clamp_high[1] = 1;
        break;
      case 3:
        chip.mix_clamp_high[1] = 1;
        break;
      case 4:
        chip.mix_clamp_low[1] = 1;
        break;
      case 5:
        chip.mix_clamp_low[1] = 1;
        break;
      case 6:
        chip.mix_clamp_low[1] = 1;
        break;
      case 7:
        break;
    }
  }
  if (chip.mix_clamp_low[1]) {
    chip.mix_serial[1] &= ~2;
  }
  if (chip.mix_clamp_high[1]) {
    chip.mix_serial[1] |= 2;
  }
  // Left channel
  chip.mix_serial[0] >>>= 1;
  if (chip.cycles === 29) {
    chip.mix_serial[0] |= (chip.mix[0] & 1023) << 4;
  }
  if (chip.cycles === 30) {
    chip.mix_serial[0] |= ((chip.mix2[0] >> 10) & 31) << 13;
    chip.mix_serial[0] |= (((chip.mix2[0] >> 17) & 1) ^ 1) << 18;
    chip.mix_clamp_low[0] = 0;
    chip.mix_clamp_high[0] = 0;
    switch ((chip.mix2[0] >> 15) & 7) {
      case 0:
      default:
        break;
      case 1:
        chip.mix_clamp_high[0] = 1;
        break;
      case 2:
        chip.mix_clamp_high[0] = 1;
        break;
      case 3:
        chip.mix_clamp_high[0] = 1;
        break;
      case 4:
        chip.mix_clamp_low[0] = 1;
        break;
      case 5:
        chip.mix_clamp_low[0] = 1;
        break;
      case 6:
        chip.mix_clamp_low[0] = 1;
        break;
      case 7:
        break;
    }
  }
  if (chip.mix_clamp_low[0]) {
    chip.mix_serial[0] &= ~2;
  }
  if (chip.mix_clamp_high[0]) {
    chip.mix_serial[0] |= 2;
  }
  chip.mix2[0] = chip.mix[0];
  chip.mix2[1] = chip.mix[1];
  if (chip.cycles === 13) {
    chip.mix[1] = 0;
  }
  if (chip.cycles === 29) {
    chip.mix[0] = 0;
  }
  chip.mix[0] += chip.op_mix * chip.op_mixl;
  chip.mix[1] += chip.op_mix * chip.op_mixr;

  if (slot < 8) {
    chip.op_chmix[slot & 7] = 0;
  }
  chip.op_chmix[slot & 7] += chip.op_mix * (chip.op_mixl | chip.op_mixr);
  if (slot >= 24) {
    chip.ch_out[slot & 7] = chip.op_chmix[slot & 7];
  }
}

function OPM_Noise(chip: opm_t): void {
  const w1 = (!chip.ic && !chip.noise_update) ? 1 : 0;
  const xr = ((chip.noise_lfsr >> 2) & 1) ^ chip.noise_temp;
  const w2t = ((chip.noise_lfsr & 0xffff) === 0xffff && chip.noise_temp === 0) ? 1 : 0;
  const w2 = (!w2t && !xr) ? 1 : 0;
  const w3 = (!chip.ic && !w1 && !w2) ? 1 : 0;
  const w4 = (((chip.noise_lfsr & 1) === 0 || !w1) && !w3) ? 1 : 0;
  if (!w1) {
    chip.noise_temp = ((chip.noise_lfsr & 1) === 0) ? 1 : 0;
  }
  chip.noise_lfsr >>= 1;
  chip.noise_lfsr |= w4 << 15;
}

function OPM_NoiseTimer(chip: opm_t): void {
  let timer = chip.noise_timer;

  chip.noise_update = chip.noise_timer_of;

  if (chip.cycles % 16 === 15) {
    timer++;
    timer &= 31;
  }
  if (chip.ic || (chip.noise_timer_of && (chip.cycles % 16 === 15))) {
    timer = 0;
  }

  chip.noise_timer_of = (chip.noise_timer === (chip.noise_freq ^ 31)) ? 1 : 0;
  chip.noise_timer = timer;
}

function OPM_DoTimerA(chip: opm_t): void {
  let value = chip.timer_a_val;
  value += chip.timer_a_inc;
  chip.timer_a_of = (value >> 10) & 1;
  if (chip.timer_a_do_reset) {
    value = 0;
  }
  if (chip.timer_a_do_load) {
    value = chip.timer_a_reg;
  }
  chip.timer_a_val = value & 1023;
}

function OPM_DoTimerA2(chip: opm_t): void {
  if (chip.cycles === 1) {
    chip.timer_a_load = chip.timer_loada;
  }
  chip.timer_a_inc = (chip.mode_test[2] || (chip.timer_a_load && chip.cycles === 0)) ? 1 : 0;
  chip.timer_a_do_load = (chip.timer_a_of || (chip.timer_a_load && chip.timer_a_temp)) ? 1 : 0;
  chip.timer_a_do_reset = chip.timer_a_temp;
  chip.timer_a_temp = chip.timer_a_load ? 0 : 1;
  if (chip.timer_reseta || chip.ic) {
    chip.timer_a_status = 0;
  } else {
    chip.timer_a_status |= (chip.timer_irqa && chip.timer_a_of) ? 1 : 0;
  }
  chip.timer_reseta = 0;
}

function OPM_DoTimerB(chip: opm_t): void {
  let value = chip.timer_b_val;
  value += chip.timer_b_inc;
  chip.timer_b_of = (value >> 8) & 1;
  if (chip.timer_b_do_reset) {
    value = 0;
  }
  if (chip.timer_b_do_load) {
    value = chip.timer_b_reg;
  }
  chip.timer_b_val = value & 255;

  if (chip.cycles === 0) {
    chip.timer_b_sub++;
  }

  chip.timer_b_sub_of = (chip.timer_b_sub >> 4) & 1;
  chip.timer_b_sub &= 15;
  if (chip.ic) {
    chip.timer_b_sub = 0;
  }
}

function OPM_DoTimerB2(chip: opm_t): void {
  chip.timer_b_inc = (chip.mode_test[2] || (chip.timer_loadb && chip.timer_b_sub_of)) ? 1 : 0;
  chip.timer_b_do_load = (chip.timer_b_of || (chip.timer_loadb && chip.timer_b_temp)) ? 1 : 0;
  chip.timer_b_do_reset = chip.timer_b_temp;
  chip.timer_b_temp = chip.timer_loadb ? 0 : 1;
  if (chip.timer_resetb || chip.ic) {
    chip.timer_b_status = 0;
  } else {
    chip.timer_b_status |= (chip.timer_irqb && chip.timer_b_of) ? 1 : 0;
  }
  chip.timer_resetb = 0;
}

function OPM_DoTimerIRQ(chip: opm_t): void {
  chip.timer_irq = (chip.timer_a_status || chip.timer_b_status) ? 1 : 0;
}

function OPM_DoLFOMult(chip: opm_t): void {
  const ampm_sel = (chip.lfo_bit_counter & 8) !== 0 ? 1 : 0;
  const dp = ampm_sel ? chip.lfo_pmd : chip.lfo_amd;
  let bit = 0;

  chip.lfo_out2_b = chip.lfo_out2;

  switch (chip.lfo_bit_counter & 7) {
    case 0:
      bit = ((dp & 64) !== 0 && (chip.lfo_out1 & 64) === 0) ? 1 : 0;
      break;
    case 1:
      bit = ((dp & 32) !== 0 && (chip.lfo_out1 & 32) === 0) ? 1 : 0;
      break;
    case 2:
      bit = ((dp & 16) !== 0 && (chip.lfo_out1 & 16) === 0) ? 1 : 0;
      break;
    case 3:
      bit = ((dp & 8) !== 0 && (chip.lfo_out1 & 8) === 0) ? 1 : 0;
      break;
    case 4:
      bit = ((dp & 4) !== 0 && (chip.lfo_out1 & 4) === 0) ? 1 : 0;
      break;
    case 5:
      bit = ((dp & 2) !== 0 && (chip.lfo_out1 & 2) === 0) ? 1 : 0;
      break;
    case 6:
      bit = ((dp & 1) !== 0 && (chip.lfo_out1 & 1) === 0) ? 1 : 0;
      break;
  }

  let b1 = (chip.lfo_out2 & 1) !== 0 ? 1 : 0;
  if ((chip.lfo_bit_counter & 7) === 0) {
    b1 = 0;
  }
  let b2 = chip.lfo_mult_carry;
  if (chip.cycles % 16 === 15) {
    b2 = 0;
  }
  const sum = bit + b1 + b2;
  chip.lfo_out2 >>= 1;
  chip.lfo_out2 |= (sum & 1) << 15;
  chip.lfo_mult_carry = sum >> 1;
}

function OPM_DoLFO1(chip: opm_t): void {
  let counter2 = chip.lfo_counter2;
  const of_old = chip.lfo_counter2_of;
  const ampm_sel = (chip.lfo_bit_counter & 8) !== 0 ? 1 : 0;
  counter2 += (((chip.lfo_counter1_of1 & 2) !== 0) || chip.mode_test[3]) ? 1 : 0;
  chip.lfo_counter2_of = (counter2 >> 15) & 1;
  if (chip.ic) {
    counter2 = 0;
  }
  if (chip.lfo_counter2_load) {
    counter2 = lfo_counter2_table[chip.lfo_freq_hi];
  }
  chip.lfo_counter2 = counter2 & 32767;
  chip.lfo_counter2_load = (chip.lfo_frq_update || of_old) ? 1 : 0;
  chip.lfo_frq_update = 0;
  if ((chip.cycles % 16) === 12) {
    chip.lfo_counter1++;
  }
  chip.lfo_counter1_of1 <<= 1;
  chip.lfo_counter1_of1 |= (chip.lfo_counter1 >> 4) & 1;
  chip.lfo_counter1 &= 15;
  if (chip.ic) {
    chip.lfo_counter1 = 0;
  }

  if ((chip.cycles & 15) === 5) {
    chip.lfo_counter2_of_lock2 = chip.lfo_counter2_of_lock;
  }

  chip.lfo_counter3 += chip.lfo_counter3_clock;
  if (chip.ic) {
    chip.lfo_counter3 = 0;
  }

  chip.lfo_counter3_clock = ((chip.cycles & 15) === 13 && chip.lfo_counter2_of_lock2) ? 1 : 0;

  if ((chip.cycles & 15) === 15) {
    chip.lfo_trig_sign = (chip.lfo_val & 0x80) !== 0 ? 1 : 0;
    chip.lfo_saw_sign = (chip.lfo_val & 0x100) !== 0 ? 1 : 0;
  }

  const lfo_pm_sign = chip.lfo_wave === 2 ? chip.lfo_trig_sign : chip.lfo_saw_sign;

  const w5 = ampm_sel ? chip.lfo_saw_sign : (chip.lfo_wave !== 2 || !chip.lfo_trig_sign ? 1 : 0);

  const w1 = (!chip.lfo_clock || chip.lfo_wave === 3 || (chip.cycles & 15) !== 15) ? 1 : 0;
  const w2 = (chip.lfo_wave === 2 && !w1) ? 1 : 0;
  const w4 = (chip.lfo_clock_lock && chip.lfo_wave === 3) ? 1 : 0;
  const w3 = (!chip.ic && !chip.mode_test[1] && !w4 && (chip.lfo_val & 0x8000) !== 0) ? 1 : 0;

  const w7 = ((chip.cycles + 1) % 16) < 8 ? 1 : 0;

  const w6 = w5 ^ w3;

  const w9 = ampm_sel ? ((chip.cycles % 16) === 6 ? 1 : 0) : (!chip.lfo_saw_sign ? 1 : 0);

  let w8 = chip.lfo_wave === 1 ? w9 : w6;

  w8 &= w7;

  chip.lfo_out1 <<= 1;
  chip.lfo_out1 |= w8 ? 0 : 1;

  const carry = (!w1 || ((chip.cycles & 15) !== 15 && chip.lfo_val_carry !== 0 && chip.lfo_wave !== 3)) ? 1 : 0;
  const sum = carry + w2 + w3;
  const noise = (chip.lfo_clock_lock && (chip.noise_lfsr & 1) !== 0) ? 1 : 0;
  let lfo_bit = sum & 1;
  lfo_bit |= (chip.lfo_wave === 3 ? 1 : 0) & noise;
  chip.lfo_val_carry = sum >> 1;
  chip.lfo_val <<= 1;
  chip.lfo_val |= lfo_bit;

  if (chip.cycles % 16 === 15 && (chip.lfo_bit_counter & 7) === 7) {
    if (ampm_sel) {
      chip.lfo_pm_lock = (chip.lfo_out2_b >> 8) & 255;
      chip.lfo_pm_lock ^= lfo_pm_sign << 7;
    } else {
      chip.lfo_am_lock = (chip.lfo_out2_b >> 8) & 255;
    }
  }

  if ((chip.cycles & 15) === 14) {
    chip.lfo_bit_counter++;
  }
  if ((chip.cycles & 15) !== 12 && chip.lfo_counter1_of2) {
    chip.lfo_bit_counter = 0;
  }
  chip.lfo_counter1_of2 = (chip.lfo_counter1 === 2) ? 1 : 0;
}

function OPM_DoLFO2(chip: opm_t): void {
  chip.lfo_clock_test = chip.lfo_clock;
  chip.lfo_clock = (chip.lfo_counter2_of || chip.lfo_test || chip.lfo_counter3_step) ? 1 : 0;
  if ((chip.cycles & 15) === 14) {
    chip.lfo_counter2_of_lock = chip.lfo_counter2_of;
    chip.lfo_clock_lock = chip.lfo_clock;
  }
  chip.lfo_counter3_step = 0;
  if (chip.lfo_counter3_clock) {
    if ((chip.lfo_counter3 & 1) === 0) {
      chip.lfo_counter3_step = (chip.lfo_freq_lo & 8) !== 0 ? 1 : 0;
    } else if ((chip.lfo_counter3 & 2) === 0) {
      chip.lfo_counter3_step = (chip.lfo_freq_lo & 4) !== 0 ? 1 : 0;
    } else if ((chip.lfo_counter3 & 4) === 0) {
      chip.lfo_counter3_step = (chip.lfo_freq_lo & 2) !== 0 ? 1 : 0;
    } else if ((chip.lfo_counter3 & 8) === 0) {
      chip.lfo_counter3_step = (chip.lfo_freq_lo & 1) !== 0 ? 1 : 0;
    }
  }
  chip.lfo_test = chip.mode_test[2];
}

function OPM_CSM(chip: opm_t): void {
  chip.kon_csm = chip.kon_csm_lock;
  if (chip.cycles === 1) {
    chip.kon_csm_lock = (chip.timer_a_do_load && chip.mode_csm) ? 1 : 0;
  }
}

function OPM_NoiseChannel(chip: opm_t): void {
  chip.nc_active |= chip.eg_serial_bit & 1;
  if (chip.cycles === 13) {
    chip.nc_active = 0;
  }
  chip.nc_out <<= 1;
  chip.nc_out |= chip.nc_sign ^ chip.eg_serial_bit;
  chip.nc_sign = chip.nc_sign_lock ? 0 : 1;
  if (chip.cycles === 12) {
    chip.nc_active_lock = chip.nc_active;
    chip.nc_sign_lock2 = (chip.nc_active_lock && !chip.nc_sign_lock) ? 1 : 0;
    chip.nc_sign_lock = chip.noise_lfsr & 1;

    if (chip.noise_en) {
      if (chip.nc_sign_lock2) {
        chip.op_mix = ((chip.nc_out & ~1) << 2) | -4089;
      } else {
        chip.op_mix = ((chip.nc_out & ~1) << 2);
      }
    }
  }
}

function OPM_DoIO(chip: opm_t): void {
  // Busy
  chip.write_busy_cnt += chip.write_busy;
  chip.write_busy = ((!(chip.write_busy_cnt >> 5) && chip.write_busy && !chip.ic) ? 1 : 0) | chip.write_d_en;
  chip.write_busy_cnt &= 0x1f;
  if (chip.ic) {
    chip.write_busy_cnt = 0;
  }
  // Write signal check
  chip.write_a_en = chip.write_a;
  chip.write_d_en = chip.write_d;
  chip.write_a = 0;
  chip.write_d = 0;
}

function OPM_DoRegWrite(chip: opm_t): void {
  const channel = chip.cycles % 8;
  const slot = chip.cycles;

  // Register write
  if (chip.reg_data_ready) {
    // Channel
    if ((chip.reg_address & 0xe7) === (0x20 | channel)) {
      switch (chip.reg_address & 0x18) {
        case 0x00: // RL, FB, CONNECT
          chip.ch_rl[channel] = chip.reg_data >> 6;
          chip.ch_fb[channel] = (chip.reg_data >> 3) & 0x07;
          chip.ch_connect[channel] = chip.reg_data & 0x07;
          break;
        case 0x08: // KC
          chip.ch_kc[channel] = chip.reg_data & 0x7f;
          break;
        case 0x10: // KF
          chip.ch_kf[channel] = chip.reg_data >> 2;
          break;
        case 0x18: // PMS, AMS
          chip.ch_pms[channel] = (chip.reg_data >> 4) & 0x07;
          chip.ch_ams[channel] = chip.reg_data & 0x03;
          break;
        default:
          break;
      }
    }
    // Slot
    if ((chip.reg_address & 0x1f) === slot) {
      switch (chip.reg_address & 0xe0) {
        case 0x40: // DT1, MUL
          chip.sl_dt1[slot] = (chip.reg_data >> 4) & 0x07;
          chip.sl_mul[slot] = chip.reg_data & 0x0f;
          break;
        case 0x60: // TL
          chip.sl_tl[slot] = chip.reg_data & 0x7f;
          break;
        case 0x80: // KS, AR
          chip.sl_ks[slot] = chip.reg_data >> 6;
          chip.sl_ar[slot] = chip.reg_data & 0x1f;
          break;
        case 0xa0: // AMS-EN, D1R
          chip.sl_am_e[slot] = chip.reg_data >> 7;
          chip.sl_d1r[slot] = chip.reg_data & 0x1f;
          break;
        case 0xc0: // DT2, D2R
          chip.sl_dt2[slot] = chip.reg_data >> 6;
          chip.sl_d2r[slot] = chip.reg_data & 0x1f;
          break;
        case 0xe0: // D1L, RR
          chip.sl_d1l[slot] = chip.reg_data >> 4;
          chip.sl_rr[slot] = chip.reg_data & 0x0f;
          break;
        default:
          break;
      }
    }
  }

  // Mode write
  if (chip.write_d_en) {
    switch (chip.mode_address) {
      case 0x01:
        for (let i = 0; i < 8; i++) {
          chip.mode_test[i] = (chip.write_data >> i) & 0x01;
        }
        break;
      case 0x08:
        for (let i = 0; i < 4; i++) {
          chip.mode_kon_operator[i] = (chip.write_data >> (i + 3)) & 0x01;
        }
        chip.mode_kon_channel = chip.write_data & 0x07;
        break;
      case 0x0f:
        chip.noise_en = chip.write_data >> 7;
        chip.noise_freq = chip.write_data & 0x1f;
        break;
      case 0x10:
        chip.timer_a_reg &= 0x03;
        chip.timer_a_reg |= chip.write_data << 2;
        break;
      case 0x11:
        chip.timer_a_reg &= 0x3fc;
        chip.timer_a_reg |= chip.write_data & 0x03;
        break;
      case 0x12:
        chip.timer_b_reg = chip.write_data;
        break;
      case 0x14:
        chip.mode_csm = (chip.write_data >> 7) & 1;
        chip.timer_irqb = (chip.write_data >> 3) & 1;
        chip.timer_irqa = (chip.write_data >> 2) & 1;
        chip.timer_resetb = (chip.write_data >> 5) & 1;
        chip.timer_reseta = (chip.write_data >> 4) & 1;
        chip.timer_loadb = (chip.write_data >> 1) & 1;
        chip.timer_loada = (chip.write_data >> 0) & 1;
        break;
      case 0x18:
        chip.lfo_freq_hi = chip.write_data >> 4;
        chip.lfo_freq_lo = chip.write_data & 0x0f;
        chip.lfo_frq_update = 1;
        break;
      case 0x19:
        if (chip.write_data & 0x80) {
          chip.lfo_pmd = chip.write_data & 0x7f;
        } else {
          chip.lfo_amd = chip.write_data;
        }
        break;
      case 0x1b:
        chip.lfo_wave = chip.write_data & 0x03;
        chip.io_ct1 = (chip.write_data >> 6) & 0x01;
        chip.io_ct2 = chip.write_data >> 7;
        break;
    }
  }

  // Register data write
  chip.reg_data_ready = (chip.reg_data_ready && !chip.write_a_en) ? 1 : 0;
  if (chip.reg_address_ready && chip.write_d_en) {
    chip.reg_data = chip.write_data;
    chip.reg_data_ready = 1;
  }

  // Register address write
  chip.reg_address_ready = (chip.reg_address_ready && !chip.write_a_en) ? 1 : 0;
  if (chip.write_a_en && (chip.write_data & 0xe0) !== 0) {
    chip.reg_address = chip.write_data;
    chip.reg_address_ready = 1;
  }
  if (chip.write_a_en) {
    chip.mode_address = chip.write_data;
  }
}

function OPM_DoIC(chip: opm_t): void {
  const channel = chip.cycles % 8;
  const slot = chip.cycles;
  if (chip.ic) {
    chip.ch_rl[channel] = 0;
    chip.ch_fb[channel] = 0;
    chip.ch_connect[channel] = 0;
    chip.ch_kc[channel] = 0;
    chip.ch_kf[channel] = 0;
    chip.ch_pms[channel] = 0;
    chip.ch_ams[channel] = 0;

    chip.sl_dt1[slot] = 0;
    chip.sl_mul[slot] = 0;
    chip.sl_tl[slot] = 0;
    chip.sl_ks[slot] = 0;
    chip.sl_ar[slot] = 0;
    chip.sl_am_e[slot] = 0;
    chip.sl_d1r[slot] = 0;
    chip.sl_dt2[slot] = 0;
    chip.sl_d2r[slot] = 0;
    chip.sl_d1l[slot] = 0;
    chip.sl_rr[slot] = 0;

    chip.timer_a_reg = 0;
    chip.timer_b_reg = 0;
    chip.timer_irqa = 0;
    chip.timer_irqb = 0;
    chip.timer_loada = 0;
    chip.timer_loadb = 0;
    chip.mode_csm = 0;

    chip.mode_test[0] = 0;
    chip.mode_test[1] = 0;
    chip.mode_test[2] = 0;
    chip.mode_test[3] = 0;
    chip.mode_test[4] = 0;
    chip.mode_test[5] = 0;
    chip.mode_test[6] = 0;
    chip.mode_test[7] = 0;
    chip.noise_en = 0;
    chip.noise_freq = 0;

    chip.mode_kon_channel = 0;
    chip.mode_kon_operator[0] = 0;
    chip.mode_kon_operator[1] = 0;
    chip.mode_kon_operator[2] = 0;
    chip.mode_kon_operator[3] = 0;
    chip.mode_kon[(slot + 8) % 32] = 0;

    chip.lfo_pmd = 0;
    chip.lfo_amd = 0;
    chip.lfo_wave = 0;
    chip.lfo_freq_hi = 0;
    chip.lfo_freq_lo = 0;

    chip.io_ct1 = 0;
    chip.io_ct2 = 0;

    chip.reg_address = 0;
    chip.reg_data = 0;
  }
  chip.ic2 = chip.ic;
}

// ─── Public API functions ──────────────────────────────────────────────────────

function OPM_Clock(chip: opm_t, output: Int32Array | null, sh1_out: { value: number } | null, sh2_out: { value: number } | null, so_out: { value: number } | null): void {
  OPM_Mixer2(chip);
  OPM_Mixer(chip);

  OPM_OperatorPhase16(chip);
  OPM_OperatorPhase15(chip);
  OPM_OperatorPhase14(chip);
  OPM_OperatorPhase13(chip);
  OPM_OperatorPhase12(chip);
  OPM_OperatorPhase11(chip);
  OPM_OperatorPhase10(chip);
  OPM_OperatorPhase9(chip);
  OPM_OperatorPhase8(chip);
  OPM_OperatorPhase7(chip);
  OPM_OperatorPhase6(chip);
  OPM_OperatorPhase5(chip);
  OPM_OperatorPhase4(chip);
  OPM_OperatorPhase3(chip);
  OPM_OperatorPhase2(chip);
  OPM_OperatorPhase1(chip);
  OPM_OperatorCounter(chip);

  OPM_EnvelopeTimer(chip);
  OPM_EnvelopePhase6(chip);
  OPM_EnvelopePhase5(chip);
  OPM_EnvelopePhase4(chip);
  OPM_EnvelopePhase3(chip);
  OPM_EnvelopePhase2(chip);
  OPM_EnvelopePhase1(chip);

  OPM_PhaseDebug(chip);
  OPM_PhaseGenerate(chip);
  OPM_PhaseCalcIncrement(chip);
  OPM_PhaseCalcFNumBlock(chip);

  OPM_DoTimerIRQ(chip);
  OPM_DoTimerA(chip);
  OPM_DoTimerB(chip);
  OPM_DoLFOMult(chip);
  OPM_DoLFO1(chip);
  OPM_Noise(chip);
  OPM_KeyOn2(chip);
  OPM_DoRegWrite(chip);
  OPM_EnvelopeClock(chip);
  OPM_NoiseTimer(chip);
  OPM_KeyOn1(chip);
  OPM_DoIO(chip);
  OPM_DoTimerA2(chip);
  OPM_DoTimerB2(chip);
  OPM_DoLFO2(chip);
  OPM_CSM(chip);
  OPM_NoiseChannel(chip);
  OPM_Output(chip);
  OPM_DAC(chip);
  OPM_DoIC(chip);

  if (sh1_out) {
    sh1_out.value = chip.smp_sh1;
  }
  if (sh2_out) {
    sh2_out.value = chip.smp_sh2;
  }
  if (so_out) {
    so_out.value = chip.smp_so;
  }
  if (output) {
    output[0] = chip.dac_output[0];
    output[1] = chip.dac_output[1];
  }
  chip.cycles = (chip.cycles + 1) % 32;
}

function OPM_Write(chip: opm_t, port: number, data: number): void {
  chip.write_data = data;
  if (chip.ic) {
    return;
  }
  if (port & 0x01) {
    chip.write_d = 1;
  } else {
    chip.write_a = 1;
  }
}

function OPM_Read(chip: opm_t, _port: number): number {
  if (chip.mode_test[6]) {
    const testdata = chip.op_out[5] | ((chip.eg_serial_bit ^ 1) << 14) | ((chip.pg_serial & 1) << 15);
    if (chip.mode_test[7]) {
      return testdata & 255;
    } else {
      return testdata >> 8;
    }
  }
  return (chip.write_busy << 7) | (chip.timer_b_status << 1) | chip.timer_a_status;
}

function OPM_ReadIRQ(chip: opm_t): number {
  return chip.timer_irq;
}

function OPM_ReadCT1(chip: opm_t): number {
  if (chip.mode_test[3]) {
    return chip.lfo_clock_test;
  }
  return chip.io_ct1;
}

function OPM_ReadCT2(chip: opm_t): number {
  return chip.io_ct2;
}

function OPM_SetIC(chip: opm_t, ic: number): void {
  if (chip.ic !== ic) {
    chip.ic = ic;
    if (!ic) {
      chip.cycles = 0;
    }
  }
}

function OPM_Reset(chip: opm_t): void {
  // Zero all fields - re-create the object's typed arrays and reset scalars
  chip.cycles = 0;
  chip.ic = 0;
  chip.ic2 = 0;
  chip.write_data = 0;
  chip.write_a = 0;
  chip.write_a_en = 0;
  chip.write_d = 0;
  chip.write_d_en = 0;
  chip.write_busy = 0;
  chip.write_busy_cnt = 0;
  chip.mode_address = 0;
  chip.io_ct1 = 0;
  chip.io_ct2 = 0;
  chip.lfo_am_lock = 0;
  chip.lfo_pm_lock = 0;
  chip.lfo_counter1 = 0;
  chip.lfo_counter1_of1 = 0;
  chip.lfo_counter1_of2 = 0;
  chip.lfo_counter2 = 0;
  chip.lfo_counter2_load = 0;
  chip.lfo_counter2_of = 0;
  chip.lfo_counter2_of_lock = 0;
  chip.lfo_counter2_of_lock2 = 0;
  chip.lfo_counter3_clock = 0;
  chip.lfo_counter3 = 0;
  chip.lfo_counter3_step = 0;
  chip.lfo_frq_update = 0;
  chip.lfo_clock = 0;
  chip.lfo_clock_lock = 0;
  chip.lfo_clock_test = 0;
  chip.lfo_test = 0;
  chip.lfo_val = 0;
  chip.lfo_val_carry = 0;
  chip.lfo_out1 = 0;
  chip.lfo_out2 = 0;
  chip.lfo_out2_b = 0;
  chip.lfo_mult_carry = 0;
  chip.lfo_trig_sign = 0;
  chip.lfo_saw_sign = 0;
  chip.lfo_bit_counter = 0;
  chip.eg_state.fill(0);
  chip.eg_level.fill(0);
  chip.eg_rate.fill(0);
  chip.eg_sl.fill(0);
  chip.eg_tl.fill(0);
  chip.eg_zr.fill(0);
  chip.eg_timershift_lock = 0;
  chip.eg_timer_lock = 0;
  chip.eg_inchi = 0;
  chip.eg_shift = 0;
  chip.eg_clock = 0;
  chip.eg_clockcnt = 0;
  chip.eg_clockquotinent = 0;
  chip.eg_inc = 0;
  chip.eg_ratemax.fill(0);
  chip.eg_instantattack = 0;
  chip.eg_inclinear = 0;
  chip.eg_incattack = 0;
  chip.eg_mute = 0;
  chip.eg_outtemp.fill(0);
  chip.eg_out.fill(0);
  chip.eg_am = 0;
  chip.eg_ams.fill(0);
  chip.eg_timercarry = 0;
  chip.eg_timer = 0;
  chip.eg_timer2 = 0;
  chip.eg_timerbstop = 0;
  chip.eg_serial = 0;
  chip.eg_serial_bit = 0;
  chip.eg_test = 0;
  chip.pg_fnum.fill(0);
  chip.pg_kcode.fill(0);
  chip.pg_inc.fill(0);
  chip.pg_phase.fill(0);
  chip.pg_reset.fill(0);
  chip.pg_reset_latch.fill(0);
  chip.pg_serial = 0;
  chip.op_phase_in = 0;
  chip.op_mod_in = 0;
  chip.op_phase = 0;
  chip.op_logsin.fill(0);
  chip.op_atten = 0;
  chip.op_exp.fill(0);
  chip.op_pow.fill(0);
  chip.op_sign = 0;
  chip.op_out.fill(0);
  chip.op_connect = 0;
  chip.op_counter = 0;
  chip.op_fbupdate = 0;
  chip.op_fbshift = 0;
  chip.op_c1update = 0;
  chip.op_modtable.fill(0);
  chip.op_m1.fill(0);
  chip.op_c1.fill(0);
  chip.op_mod.fill(0);
  chip.op_fb.fill(0);
  chip.op_mixl = 0;
  chip.op_mixr = 0;
  chip.op_chmix.fill(0);
  chip.mix.fill(0);
  chip.mix2.fill(0);
  chip.mix_op = 0;
  chip.mix_serial.fill(0);
  chip.mix_bits = 0;
  chip.mix_top_bits_lock = 0;
  chip.mix_sign_lock = 0;
  chip.mix_sign_lock2 = 0;
  chip.mix_exp_lock = 0;
  chip.mix_clamp_low.fill(0);
  chip.mix_clamp_high.fill(0);
  chip.mix_out_bit = 0;
  chip.smp_so = 0;
  chip.smp_sh1 = 0;
  chip.smp_sh2 = 0;
  chip.ch_out.fill(0);
  chip.noise_lfsr = 0;
  chip.noise_timer = 0;
  chip.noise_timer_of = 0;
  chip.noise_update = 0;
  chip.noise_temp = 0;
  chip.mode_test.fill(0);
  chip.mode_kon_operator.fill(0);
  chip.mode_kon_channel = 0;
  chip.reg_address = 0;
  chip.reg_address_ready = 0;
  chip.reg_data = 0;
  chip.reg_data_ready = 0;
  chip.ch_rl.fill(0);
  chip.ch_fb.fill(0);
  chip.ch_connect.fill(0);
  chip.ch_kc.fill(0);
  chip.ch_kf.fill(0);
  chip.ch_pms.fill(0);
  chip.ch_ams.fill(0);
  chip.sl_dt1.fill(0);
  chip.sl_mul.fill(0);
  chip.sl_tl.fill(0);
  chip.sl_ks.fill(0);
  chip.sl_ar.fill(0);
  chip.sl_am_e.fill(0);
  chip.sl_d1r.fill(0);
  chip.sl_dt2.fill(0);
  chip.sl_d2r.fill(0);
  chip.sl_d1l.fill(0);
  chip.sl_rr.fill(0);
  chip.noise_en = 0;
  chip.noise_freq = 0;
  chip.timer_a_reg = 0;
  chip.timer_b_reg = 0;
  chip.timer_a_temp = 0;
  chip.timer_a_do_reset = 0;
  chip.timer_a_do_load = 0;
  chip.timer_a_inc = 0;
  chip.timer_a_val = 0;
  chip.timer_a_of = 0;
  chip.timer_a_load = 0;
  chip.timer_a_status = 0;
  chip.timer_b_sub = 0;
  chip.timer_b_sub_of = 0;
  chip.timer_b_inc = 0;
  chip.timer_b_val = 0;
  chip.timer_b_of = 0;
  chip.timer_b_do_reset = 0;
  chip.timer_b_do_load = 0;
  chip.timer_b_temp = 0;
  chip.timer_b_status = 0;
  chip.timer_irq = 0;
  chip.lfo_freq_hi = 0;
  chip.lfo_freq_lo = 0;
  chip.lfo_pmd = 0;
  chip.lfo_amd = 0;
  chip.lfo_wave = 0;
  chip.timer_irqa = 0;
  chip.timer_irqb = 0;
  chip.timer_loada = 0;
  chip.timer_loadb = 0;
  chip.timer_reseta = 0;
  chip.timer_resetb = 0;
  chip.mode_csm = 0;
  chip.nc_active = 0;
  chip.nc_active_lock = 0;
  chip.nc_sign = 0;
  chip.nc_sign_lock = 0;
  chip.nc_sign_lock2 = 0;
  chip.nc_bit = 0;
  chip.nc_out = 0;
  chip.op_mix = 0;
  chip.kon_csm = 0;
  chip.kon_csm_lock = 0;
  chip.kon_do = 0;
  chip.kon_chanmatch = 0;
  chip.kon.fill(0);
  chip.kon2.fill(0);
  chip.mode_kon.fill(0);
  chip.dac_osh1 = 0;
  chip.dac_osh2 = 0;
  chip.dac_bits = 0;
  chip.dac_output.fill(0);

  OPM_SetIC(chip, 1);
  for (let i = 0; i < 32 * 64; i++) {
    OPM_Clock(chip, null, null, null, null);
  }
  OPM_SetIC(chip, 0);
}

// ─── Wrapper class ─────────────────────────────────────────────────────────────

// YM2151 prescale = 2: internal clock = master / 2. With 32 operator slots,
// one sample period = 2 × 32 = 64 master clocks. Rate = 3579545 / 64 = 55930 Hz.
const OPM_NATIVE_SAMPLE_RATE = 55930;
// Nuked OPM: 32 OPM_Clock calls = 1 sample (one full operator cycle).
// But the real YM2151 has prescale=2, so the actual sample period is
// 64 master clocks. Furnace confirms: 32 OPM_Clock per sample, rate=clock/64.
const OPM_CLOCKS_PER_SAMPLE = 32;

export class NukedOPM {
  private chip: opm_t;
  private timerCallback: ((timerIndex: number) => void) | null = null;
  private irqClearCallback: (() => void) | null = null;
  private externalTimerMode: boolean = false;

  // Internal sample buffer for external timer mode.
  // tickTimers() clocks the chip and collects samples here.
  // generateSamples() drains the buffer.
  private sampleBufL: Float32Array;
  private sampleBufR: Float32Array;
  private sampleBufWritePos: number = 0;

  // Reusable temporaries for OPM_Clock
  private readonly _output = new Int32Array(2);
  private readonly _sh1 = { value: 0 };
  private readonly _sh2 = { value: 0 };
  // Counter to capture one sample every 64 master clocks (= native sample rate)
  private _clockCounter: number = 0;

  constructor() {
    this.chip = new opm_t();
    OPM_Reset(this.chip);
    // Buffer enough for 2 frames worth of samples
    this.sampleBufL = new Float32Array(2048);
    this.sampleBufR = new Float32Array(2048);
  }

  /** Register address write (port 0) - used by Z80 bus */
  writeAddress(value: number): void {
    OPM_Write(this.chip, 0, value & 0xff);
  }

  /** Register data write (port 1) - used by Z80 bus */
  writeData(value: number): void {
    OPM_Write(this.chip, 1, value & 0xff);
  }

  /** Read status register (port 0) */
  readStatus(): number {
    return OPM_Read(this.chip, 0);
  }

  /**
   * Generate audio samples at native rate (55930 Hz).
   * In external timer mode: copies from internal buffer (filled by tickTimers).
   * In internal mode: clocks the chip directly.
   */
  generateSamples(bufferL: Float32Array, bufferR: Float32Array, numSamples: number, startOffset: number = 0): void {
    if (this.externalTimerMode) {
      // Copy from internal buffer (filled during tickTimers)
      const available = this.sampleBufWritePos;
      const toCopy = Math.min(numSamples, available);
      for (let i = 0; i < toCopy; i++) {
        bufferL[startOffset + i] = this.sampleBufL[i]!;
        bufferR[startOffset + i] = this.sampleBufR[i]!;
      }
      // Hold last sample value for remainder (avoids click from zero-padding)
      if (toCopy < numSamples && toCopy > 0) {
        const lastL = this.sampleBufL[toCopy - 1]!;
        const lastR = this.sampleBufR[toCopy - 1]!;
        for (let i = toCopy; i < numSamples; i++) {
          bufferL[startOffset + i] = lastL;
          bufferR[startOffset + i] = lastR;
        }
      }
      // Keep excess samples for next frame (don't lose data)
      const excess = available - toCopy;
      for (let i = 0; i < excess; i++) {
        this.sampleBufL[i] = this.sampleBufL[toCopy + i]!;
        this.sampleBufR[i] = this.sampleBufR[toCopy + i]!;
      }
      this.sampleBufWritePos = excess;
      return;
    }

    // Internal timer mode: clock the chip directly
    const output = this._output;
    const sh1 = this._sh1;
    const sh2 = this._sh2;

    for (let s = 0; s < numSamples; s++) {
      let sampleL = 0;
      let sampleR = 0;

      for (let c = 0; c < OPM_CLOCKS_PER_SAMPLE; c++) {
        OPM_Clock(this.chip, output, sh1, sh2, null);
        if (sh1.value) sampleR = output[1]!;
        if (sh2.value) sampleL = output[0]!;
      }

      bufferL[startOffset + s] = sampleL / 32768;
      bufferR[startOffset + s] = sampleR / 32768;
    }
  }

  /**
   * Clock the chip for N master clock cycles.
   * Nuked OPM is cycle-accurate — must be clocked every Z80 T-state.
   * Collects audio output and checks for IRQ transitions.
   */
  clockCycles(numCycles: number): void {
    const chip = this.chip;
    const output = this._output;
    const sh1 = this._sh1;
    const sh2 = this._sh2;
    const sampleBufL = this.sampleBufL;
    const sampleBufR = this.sampleBufR;
    let counter = this._clockCounter;
    let writePos = this.sampleBufWritePos;
    const bufLen = sampleBufL.length;
    const irqBefore = chip.timer_irq;

    for (let c = 0; c < numCycles; c++) {
      OPM_Clock(chip, output, sh1, sh2, null);

      // Collect one stereo sample every 32 OPM clocks (= clock/64 rate).
      if (++counter >= OPM_CLOCKS_PER_SAMPLE) {
        counter = 0;
        if (writePos < bufLen) {
          sampleBufL[writePos] = chip.dac_output[0]! / 32768;
          sampleBufR[writePos] = chip.dac_output[1]! / 32768;
          writePos++;
        }
      }
    }

    this._clockCounter = counter;
    this.sampleBufWritePos = writePos;

    // Check IRQ transitions only once after the batch (not per-clock)
    const irqAfter = chip.timer_irq;
    if (!irqBefore && irqAfter) {
      if (this.timerCallback) {
        if (chip.timer_a_status) this.timerCallback(0);
        if (chip.timer_b_status) this.timerCallback(1);
      }
    } else if (irqBefore && !irqAfter) {
      if (this.irqClearCallback) this.irqClearCallback();
    }
  }

  /**
   * tickTimers compatibility: clock 64 cycles (= 1 sample period).
   * Kept for API compatibility with old YM2151.
   */
  tickTimers(): boolean {
    const irqBefore = this.chip.timer_irq;
    this.clockCycles(OPM_CLOCKS_PER_SAMPLE);
    return this.chip.timer_irq !== irqBefore;
  }

  setTimerCallback(cb: (timerIndex: number) => void): void { this.timerCallback = cb; }
  setIrqClearCallback(cb: () => void): void { this.irqClearCallback = cb; }
  setExternalTimerMode(enabled: boolean): void { this.externalTimerMode = enabled; }
  readIRQ(): boolean { return OPM_ReadIRQ(this.chip) !== 0; }
  getSampleRate(): number { return OPM_NATIVE_SAMPLE_RATE; }

  reset(): void {
    OPM_Reset(this.chip);
    this.sampleBufWritePos = 0;
  }
}
