/**
 * CPS1 hardware constants — shared across modules.
 */

// Screen
export const SCREEN_WIDTH = 384;
export const SCREEN_HEIGHT = 224;
export const FRAMEBUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT * 4;

// Audio sample rates
export const YM2151_SAMPLE_RATE = 55930;      // OPM: 3.579545 MHz / 64
export const OKI6295_SAMPLE_RATE = 7575;      // OKI: 1 MHz / 132
export const QSOUND_SAMPLE_RATE = 24038;      // QSound: 60 MHz / 2 / 1248
