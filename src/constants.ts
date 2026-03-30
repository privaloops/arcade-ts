/**
 * CPS1 hardware constants — shared across modules.
 */

// Screen
export const SCREEN_WIDTH = 384;
export const SCREEN_HEIGHT = 224;
export const FRAMEBUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT * 4;

// GFX tile sizes (bytes per tile)
export const CHAR_SIZE_16 = 128;   // 16x16 tile: 4bpp = 128 bytes

// Timing
export const PIXEL_CLOCK = 8_000_000;        // 8 MHz
export const Z80_CLOCK = 3_579_545;          // 3.579545 MHz
export const CPS_HTOTAL = 512;
export const CPS_VTOTAL = 262;
export const FRAME_RATE = PIXEL_CLOCK / (CPS_HTOTAL * CPS_VTOTAL); // ~59.637 Hz

// Audio sample rates
export const YM2151_SAMPLE_RATE = 55930;      // OPM: 3.579545 MHz / 64
export const OKI6295_SAMPLE_RATE = 7575;      // OKI: 1 MHz / 132
export const QSOUND_SAMPLE_RATE = 24038;      // QSound: 60 MHz / 2 / 1248
