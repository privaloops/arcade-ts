# ROMstudio

CPS1 (Capcom Play System 1) arcade studio in the browser.
Play, inspect, and modify — TypeScript strict + WebGL2 + Web Worker audio + WASM. Zero emulation dependencies.

## Commands

```bash
npm run dev      # Vite dev server (hot reload)
npm run build    # TypeScript + Vite production build → dist/
npm run preview  # Preview production build
npm test         # Unit tests (Vitest)
npm run test:watch  # Tests in watch mode
```

## Structure

```
src/
  cpu/
    m68000.ts       # Motorola 68000 interpreter (~3000 lines)
    z80.ts          # Zilog Z80 interpreter (~2250 lines)
  video/
    cps1-video.ts   # CPS-A/CPS-B tile decode, layers, sprites, palette
    renderer.ts     # Canvas 2D renderer (fallback)
    renderer-webgl.ts # WebGL2 renderer (texture upload, default)
    GameScreen.ts   # DOM renderer — hybrid canvas+DOM (experimental)
    sprite-sheet.ts # Sprite tile cache (ImageData, no data URLs)
    frame-state.ts  # Frame state extractor for DOM renderer
  audio/
    audio-worker.ts   # Web Worker: Z80 + YM2151 + OKI autonomous audio
    audio-output.ts   # AudioWorklet + SharedArrayBuffer ring buffer
    nuked-opm-wasm.ts # Nuked OPM (YM2151) WASM wrapper — cycle-accurate FM
    oki6295.ts        # OKI MSM6295 ADPCM decoder
    qsound-wasm.ts    # QSound DSP HLE WASM (CPS1.5 games)
    resampler.ts      # LinearResampler (shared main thread / worker)
  memory/
    bus.ts          # 68000 bus — memory map, I/O, CPS-A/B registers
    z80-bus.ts      # Z80 bus — audio ROM, RAM, YM2151, OKI, sound latch
    z80-bus-qsound.ts # Z80 QSound bus — shared RAM, DSP I/O
    rom-loader.ts   # MAME ZIP ROM loader + 41 GameDefs + CPS-B configs + GFX mappers
    game-defs.ts    # Per-game ROM layouts, CPS-B configs, GFX mappers
    kabuki.ts       # Kabuki Z80 decryption (QSound games)
    eeprom-93c46.ts # EEPROM 93C46 serial protocol (QSound games)
  editor/
    tile-encoder.ts   # GFX ROM tile encode/decode (inverse of decodeRow)
    palette-editor.ts # VRAM palette read/write, RGB↔CPS1 conversion
    sprite-editor.ts  # Sprite editor logic: tools, undo, paint, flood fill
    sprite-editor-ui.ts # DOM panel, tile grid, overlay, shortcuts
    tile-refs.ts      # Tile reference counter + duplication
    sprite-analyzer.ts  # Character grouping, pose capture, sprite sheet viewer
    photo-import.ts   # Multi-layer photo import with Atkinson dithering
    layer-model.ts    # Layer group model for photo overlays
    layer-panel.ts    # Left sidebar layer panel with visibility/reorder
    tile-allocator.ts # Private tile allocation, GFX ROM expansion
    tool-cursors.ts   # Per-tool canvas cursors (pencil, bucket, eyedropper, eraser, wand)
  input/
    input.ts        # Keyboard + Gamepad API + device assignment + autofire
  ui/
    tooltip.ts      # Custom tooltip system (600ms delay, suppressed during painting)
    status-bar.ts   # Contextual status bar (tool hints, zoom info)
    toast.ts        # Toast notifications
    controls-bar.ts # Emu bar buttons + fullscreen toggle
    shortcuts.ts    # Global keyboard shortcuts
    drop-zone.ts    # ROM drag-and-drop zone
    modal.ts        # Modal overlay helpers
    save-state-ui.ts    # Save/load state modal
    gamepad-config.ts   # Gamepad mapping UI
    keyboard-config.ts  # Keyboard mapping UI
    dip-switch-ui.ts    # DIP switch config UI
    renderer-toggle.ts  # WebGL/Canvas/DOM renderer toggle
    focus-trap.ts       # Focus trap for modals
  game-catalog.ts   # 245 CPS1 games (source: MAME 0.286)
  rom-store.ts      # Central mutable ROM manager with ZIP export
  save-state.ts     # Save/load state (4 slots, localStorage)
  dip-switches.ts   # DIP switch definitions (56 games, from MAME)
  types.ts          # Shared interfaces (BusInterface, Z80BusInterface)
  index.ts          # Entry point — UI, config modal, shortcuts
  emulator.ts       # Main loop — frame scheduling, CPU/video orchestration
wasm/
  opm.c, opm.h      # Nuked OPM C source (LGPL 2.1+, github.com/nukeykt/Nuked-OPM)
  opm_wrapper.c     # Emscripten C wrapper
  opm.mjs           # Compiled WASM (ESM, SINGLE_FILE)
src/__tests__/
  bus.test.ts       # Bus address decoding tests
  m68000.test.ts    # M68000 CPU tests (basic opcodes)
  m68000-tom-harte.test.ts  # M68000 Tom Harte tests (84 instructions, 200 vectors each)
  z80-tom-harte.test.ts     # Z80 SingleStepTests (588 instructions, 200 vectors each)
  oki6295.test.ts   # OKI6295 tests (ADPCM, commands)
  tile-encoder.test.ts    # Tile encoder roundtrip tests
  palette-editor.test.ts  # Palette encode/decode tests
  tile-refs.test.ts       # Tile reference counter tests
tests/
  68000/*.json      # Tom Harte M68000 test vectors (ProcessorTests)
  z80/*.json        # Z80 SingleStepTests vectors (JSMoo)
```

## Tech stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (strict: noUncheckedIndexedAccess, exactOptionalPropertyTypes) |
| Build | Vite |
| Rendering | WebGL2 (fallback Canvas 2D, experimental DOM) |
| FM audio | Nuked OPM → WASM (Emscripten, -O3) |
| ADPCM audio | OKI MSM6295 in TS |
| QSound audio | QSound HLE → WASM |
| Audio output | Web Worker + AudioWorklet + SharedArrayBuffer |
| Tests | Vitest |
| UI | HTML/CSS vanilla |
| Hosting | Vercel (COOP/COEP headers) |

## CPS1 hardware reference

| Component | Spec |
|-----------|------|
| Main CPU | Motorola 68000 @ 10 MHz |
| Audio CPU | Zilog Z80 @ 3.579545 MHz |
| Video | CPS-A + CPS-B (3 scroll layers + 1 sprite layer) |
| FM audio | YM2151 (OPM) — 8 channels, 4 operators, 55930 Hz |
| ADPCM audio | OKI MSM6295 — 4 voices, 7575 Hz |
| QSound audio | Custom DSP — surround spatialization, 24038 Hz |
| Resolution | 384×224 @ ~59.637 Hz |
| VRAM | 192 KB |
| Work RAM | 64 KB |

## Performance (profiled)

| Component | CPU % | Notes |
|-----------|-------|-------|
| M68000 | ~25% | TS interpreter, ~168K instructions/frame |
| Z80 + OPM WASM | ~8% | Autonomous Web Worker |
| Video (CPU decode + WebGL2) | ~3% | Tile decode + texture upload |
| **Total** | **~33%** | Mac, Chrome |

## Supported games

41 GameDefs (parent sets) with ROM layout, CPS-B config, and GFX mapper.
245 games in the catalog (source: MAME 0.286).
ROMs loaded from public/roms/ (not included in the repo).

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Arrows | Move |
| A, S, D | Buttons 1-3 |
| Z, X, C | Buttons 4-6 |
| 5 | Insert coin |
| 1 | 1P Start |
| P | Pause / Resume |
| M | Mute |
| F1 | Config |
| E | Sprite Editor |
| F3 | Audio panel |
| F5 | Save state |
| F8 | Load state |
| Ctrl+S | Save project (.romstudio) |
| Ctrl+O | Load project (.romstudio) |
| Double-click | Fullscreen |
| Escape | Close dialog |

## Sprite Editor shortcuts (when editor is active)

| Key | Action |
|-----|--------|
| B | Pencil tool |
| G | Fill tool |
| I | Eyedropper |
| X | Eraser |
| W | Magic wand (erase similar colors) |
| Delete / Backspace | Erase entire tile |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| [ / ] | Previous / next palette color |
| Shift+[ / Shift+] | Decrease / increase wand tolerance |
| Scroll wheel | Zoom in/out (centered on cursor) |
| Space+drag / Middle-click+drag | Pan when zoomed |
| 0 | Reset zoom to ×1 |
| Arrow keys | Navigate neighbor tiles |
| Right Arrow | Step 1 frame |
| Shift+Right | Step 10 frames |
| Escape | Close editor |

## Sprite Sheet Viewer shortcuts (when viewer is active)

| Key | Action |
|-----|--------|
| Arrow Up/Down | Navigate between poses |
| Arrow Left/Right | Navigate between tiles |
| Escape | Back to game |
| B, G, I, X | Tool shortcuts (same as editor) |

## Audio architecture

```
Main Thread                     Audio Worker (Web Worker)
───────────                     ────────────────────────
68K writes sound latch ───────→ Z80 (3.58 MHz, debt-based timing)
                                ├─ YM2151 WASM (cycle-accurate)
                                └─ OKI6295 (TS ADPCM)
                                Resampling → 48kHz
                                Mixing: ymL*0.35 + ymR*0.35 + oki*0.30
                                ↓
                                SharedArrayBuffer ring buffer (16384 samples)
                                ↓
                                AudioWorklet (separate thread) → speakers
```

The audio Z80 runs autonomously in the Worker via a debt-based timing system (4ms setInterval + frame debt accumulator with catch-up). This replaces the naive setInterval(16.77ms) approach, fixing audio lag on Firefox. The main thread only posts sound latches via postMessage.

For QSound games (Dino, Punisher, WoF, Slammast), the Z80 stays on the main thread (interleaved per-scanline with the 68K due to shared RAM communication).

## Required headers (dev server)

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Without these headers, SharedArrayBuffer is unavailable → fallback to ScriptProcessorNode (main thread).
`vercel.json` configures these headers for Vercel deployment.

## Building WASM (Nuked OPM)

```bash
source ~/emsdk/emsdk_env.sh
cd wasm
emcc -O3 opm.c opm_wrapper.c -o opm.mjs \
  -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME='createOPM' -s EXPORT_ES6=1 \
  -s SINGLE_FILE=1 -s FILESYSTEM=0 -s ENVIRONMENT='web' \
  -s INITIAL_MEMORY=1048576 \
  -s EXPORTED_FUNCTIONS='["_opm_init","_opm_reset","_opm_write_address","_opm_write_data","_opm_read_status","_opm_read_irq","_opm_clock_cycles","_opm_get_sample_count","_opm_get_samples_l","_opm_get_samples_r","_opm_drain_samples","_opm_get_sample_rate"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPF32"]'
```

## Credits

- Nuked OPM: [nukeykt/Nuked-OPM](https://github.com/nukeykt/Nuked-OPM) (LGPL 2.1+)
- Game definitions: [mamedev/mame](https://github.com/mamedev/mame) src/mame/capcom/cps1.cpp + cps1_v.cpp
- ROM catalog: MAME 0.286 via `mame -listxml`
- DIP switches: parsed from MAME cps1.cpp INPUT_PORTS blocks

## mdma

- **Workflow** : `default`
- **Git** : `default`
