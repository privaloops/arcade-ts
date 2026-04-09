// Neo-Geo hardware constants (MVS/AES)

// Screen
export const NGO_SCREEN_WIDTH = 320;
export const NGO_SCREEN_HEIGHT = 224;
export const NGO_FRAMEBUFFER_SIZE = NGO_SCREEN_WIDTH * NGO_SCREEN_HEIGHT * 4;

// Timing
export const NGO_M68K_CLOCK = 12_000_000;          // 12 MHz
export const NGO_Z80_CLOCK = 4_000_000;             // 4 MHz
export const NGO_PIXEL_CLOCK = 6_000_000;           // 6 MHz
export const NGO_HTOTAL = 384;
export const NGO_VTOTAL = 264;
export const NGO_FRAME_RATE = NGO_PIXEL_CLOCK / (NGO_HTOTAL * NGO_VTOTAL); // ~59.185 Hz
export const NGO_VBLANK_LINE = 224;

// CPU cycles per frame
export const NGO_M68K_CYCLES_PER_FRAME = Math.round(NGO_M68K_CLOCK / NGO_FRAME_RATE);
export const NGO_M68K_CYCLES_PER_SCANLINE = Math.round(NGO_M68K_CYCLES_PER_FRAME / NGO_VTOTAL);
export const NGO_Z80_CYCLES_PER_FRAME = Math.round(NGO_Z80_CLOCK / NGO_FRAME_RATE);

// GFX tile sizes
export const NGO_TILE_SIZE = 16;                    // 16x16 pixels
export const NGO_TILE_BYTES = 128;                  // 4bpp = 128 bytes per tile
export const NGO_FIX_TILE_SIZE = 8;                 // 8x8 fix layer tile
export const NGO_FIX_TILE_BYTES = 32;               // 4bpp = 32 bytes per 8x8 tile

// VRAM
export const NGO_MAX_SPRITES = 381;                 // slots 1-381 (0 = padding)
export const NGO_SPRITES_PER_LINE = 96;
export const NGO_MAX_TILE_HEIGHT = 32;              // tiles per sprite column
export const NGO_SCB1_BASE = 0x0000;                // slow VRAM — tile codes + attributes
export const NGO_SCB2_BASE = 0x8000;                // fast VRAM — shrink
export const NGO_SCB3_BASE = 0x8200;                // fast VRAM — Y, sticky, height
export const NGO_SCB4_BASE = 0x8400;                // fast VRAM — X
export const NGO_FIX_BASE = 0x7000;                 // fix layer tilemap

// Audio
export const NGO_YM2610_CLOCK = 8_000_000;          // 8 MHz (from LSPC2)
export const NGO_YM2610_SAMPLE_RATE = 55556;        // 8 MHz / 144
export const NGO_ADPCMA_SAMPLE_RATE = 18519;        // 8 MHz / 432
