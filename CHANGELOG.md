# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **CPU M68000** — Cycle-accurate Motorola 68000 interpreter (2937 lines)
  - Complete instruction set (56+ instructions with all addressing modes)
  - 12 addressing modes, 7 interrupt levels, exceptions
  - Prefetch pipeline (2-word), level-triggered IRQ with IACK callback
  - Save state / restore state support
- **CPU Z80** — Cycle-accurate Zilog Z80 interpreter (2220 lines)
  - Full instruction set including CB/DD/FD/ED prefixes
  - Undocumented instructions (SLL, IXH/IXL/IYH/IYL)
  - NMI, maskable IRQ (IM0/1/2)
- **Memory Bus 68000** — MAME-accurate CPS1 memory map
  - Program ROM (ROM_LOAD16_BYTE interleave)
  - CPS-A registers (0x800100-0x80013F)
  - CPS-B registers (0x800140-0x80017F) with SF2 ID (CPS_B_11 = 0x0401)
  - I/O ports, DIP switches, coin control
  - Sound latch with real-time Z80 forwarding
  - VRAM (192KB), Work RAM (64KB)
  - 24-bit address masking
- **Memory Bus Z80** — CPS1 audio CPU memory map
  - Audio ROM with ROM_LOAD + ROM_CONTINUE format
  - YM2151 at 0xF000/0xF001, OKI6295 at 0xF002
  - Sound latch at 0xF008, bank switch at 0xF004
- **ROM Loader** — MAME-format ZIP ROM loading
  - ROM_LOAD16_BYTE for program ROM (even/odd byte interleave)
  - ROM_LOAD64_WORD for graphics ROM (4 ROMs per bank, 8-byte groups)
  - GFX ROM bank mapper (mapper_STF29 for SF2)
  - SF2 game definition with all ROM files
  - Auto-load from public/ folder
- **Video CPS-A/CPS-B** — 4-layer tile/sprite renderer (830 lines)
  - Scroll 1: 8x8 tiles with gfxSet alternation (MAME tilemap0Scan)
  - Scroll 2: 16x16 tiles (MAME tilemap1Scan)
  - Scroll 3: 32x32 tiles with 14-bit code mask (MAME tilemap2Scan)
  - Sprites: 16x16 with multi-tile chaining and flip variants
  - Palette decoding with MAME brightness formula
  - Layer priority via CPS-B layer_control register
  - Layer enable via CPS-B + CPS-A videocontrol
  - Palette group offsets per layer (+0x20/+0x40/+0x60)
  - MSB-first pixel decoding (bit 7 = leftmost)
- **Canvas 2D Renderer** — 384x224 native resolution
  - ImageData + putImageData (zero-copy blit)
  - Pixel-perfect scaling with image-rendering: pixelated
  - Fullscreen support
- **Input Manager** — Keyboard + Gamepad API
  - CPS1 I/O port mapping (active LOW)
  - Default P1/P2 key mappings
  - Gamepad polling via Gamepad API
- **Audio Nuked OPM (YM2151)** — Cycle-accurate FM synthesizer from die-shot
  - Port of Nuked OPM (Nuke.YKT) from C to TypeScript (2300+ lines)
  - Transistor-level accurate: based on YM2151 chip decap
  - 8 channels, 4 operators, 8 algorithms, LFO, noise
  - YM3012 DAC emulation (10.3 mantissa/exponent format)
  - Timer A/B with IRQ, clocked at master/2 (prescale=2, confirmed via Furnace)
  - LGPL 2.1 licensed
- **Audio OKI MSM6295** — MAME-exact ADPCM decoder
  - 4 simultaneous voices with phrase table ROM parsing
  - ADPCM decode via MAME's precomputed DIFF_LOOKUP table (49×16 entries)
  - Step values: `floor(16 * (11/10)^step)`, bit-decomposition delta formula
  - Float volume table matching MAME's `s_volume_table` (sample_t division)
  - Normalization: `/2048` matching MAME's `stream.add_int(..., 2048)`
  - Command protocol: bit 7 set = phrase select, clear = stop (MAME-verified)
  - Phrase table byte addresses masked to 18 bits
  - Status register: `0xF0 | playing_bits` (MAME convention)
- **Audio Output** — Browser audio pipeline
  - AudioWorklet with SharedArrayBuffer ring buffer
  - ScriptProcessorNode fallback
  - Linear resampling (55930/7575 Hz -> 48000 Hz)
  - CPS1 mono mix matching MAME: `ymL*0.35 + ymR*0.35 + oki*0.30`
  - Soft limiter (tanh knee) to prevent digital saturation
  - FPS overlay on canvas
- **Emulator Loop** — Scanline-accurate frame timing
  - 262 scanlines, VBlank IRQ at scanline 240
  - Frame rate limiter (59.637 Hz)
  - Save state / restore state for all components
- **UI** — Drag & drop ROM loading, arcade-style dark theme

### Fixed
- M68000 prefetch pipeline bug (prefetch[1] reloaded from wrong address)
- M68000 BSET instruction decode (was excluded by guard condition)
- 24-bit address masking on bus (stack operations at address 0 now work)
- CPS-B ID register (SF2 CPS_B_11 = 0x0401 at offset 0x32)
- Z80 memory map (YM2151 at 0xF000/0xF001, not 0xF006/0xF008)
- Audio ROM loading (ROM_LOAD + ROM_CONTINUE format)
- GFX ROM pixel bit order (MSB-first = bit 7 is leftmost pixel)
- Scroll1 gfxSet alternation based on tile_index bit 5
- Sprite format corrected (word order: X, Y, code, attributes)
- Tilemap scan functions matching MAME (non-trivial row/col mapping)
- Tilemap attribute format (palette bits 0-4, flip bits 5-6)
- Transparent pen = 15 only (pen 0 is opaque)
- **YM2151 busy flag** was 64x too long (4096 vs 64 Z80 cycles), starving the Z80 sequencer → music tempo drastically too slow
- **Z80 EI timing** — `enableInterruptsNext` now processed after instruction execution (correct Z80 behavior)
- **Sound latch** — removed spurious Z80 IRQ (MAME: only YM2151 drives Z80 INT, latch is polled by Timer A ISR)
- **Nuked OPM envelope attack** — signed NOT was masked to uint16, causing channels to stick at max attenuation (silent)
- **Nuked OPM prescale** — chip clocked at master/2 (32 OPM_Clock = 1 sample, rate = clock/64)
- **OKI6295 command protocol** — bit 7 semantics were inverted (phrase select vs stop)
- **OKI6295 phrase table** — addresses were treated as nibble offsets instead of byte offsets (reading wrong ROM locations)
- **OKI6295 normalization** — was /8192, corrected to /2048 with float volumes (matching MAME's add_int divisor)

### Known Issues
- Scroll1 text has slight column alternation artifacts
- Sprites have minor tile-level garbling in 16x16 tiles
- Audio: music slows down when game framerate drops (Z80 coupled to frame loop instead of independent clock)
- Audio: OKI samples have slight crackling (linear resampler 7575→48000 Hz, no anti-aliasing filter)
