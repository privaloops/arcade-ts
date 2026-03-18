# CPS1-Web

A from-scratch Capcom Play System 1 (CPS1) emulator that runs entirely in the browser.

Built with TypeScript, WebGL2, AudioWorklet, and WebAssembly. Zero emulation dependencies.

## Features

- **M68000 CPU** — cycle-accurate interpreter with full instruction set
- **Z80 CPU** — cycle-accurate interpreter (audio CPU)
- **YM2151 (FM)** — Nuked OPM compiled to WASM for cycle-accurate FM synthesis
- **OKI MSM6295 (ADPCM)** — 4-voice sample playback
- **CPS-A/CPS-B video** — scroll layers + sprites with proper layer priority
- **WebGL2 rendering** with Canvas 2D fallback
- **AudioWorklet** with SharedArrayBuffer ring buffer (low-latency audio)
- **Responsive** — works on desktop and mobile (iOS/Android)
- **Fullscreen** — press F on desktop, double-tap on mobile

## ROM files

**This emulator does not include any ROM files.** You must provide your own.

CPS1 arcade games are copyrighted by Capcom. You may only use ROM dumps that you have legally obtained from arcade hardware you own.

### ROM format

This emulator uses **MAME 0.286 non-merged ROM sets** in ZIP format. The ROM set name must match the MAME convention (e.g. `sf2.zip`, `ffight.zip`, `dino.zip`).

Other MAME versions may work if the ROM file names and layout are compatible, but 0.286 is the reference version.

### Supported games

41 parent ROM sets are supported, including:

| Game | ROM set |
|------|---------|
| Street Fighter II | `sf2` |
| Final Fight | `ffight` |
| Cadillacs and Dinosaurs | `dino` |
| Knights of the Round | `knights` |
| Captain Commando | `captcomm` |
| Mega Man: The Power Battle | `megaman` |
| Strider | `strider` |
| Ghouls'n Ghosts | `ghoul` |
| 1941: Counter Attack | `1941` |
| Pang! 3 | `pang3` |

See the full list in `src/game-catalog.ts` (source: MAME 0.286).

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and drop a ROM ZIP file onto the screen.

### Keyboard controls

| Key | Action |
|-----|--------|
| Arrow keys | Move |
| Z, X, C | Buttons 1, 2, 3 |
| A, S, D | Buttons 4, 5, 6 |
| 5 | Insert coin |
| 1 | 1P Start |
| P | Pause / Resume |
| F | Fullscreen |
| Escape | Quit to menu |

Gamepads are also supported via the Gamepad API.

## Building

```bash
npm run build    # TypeScript + Vite production build → dist/
npm run preview  # Preview the production build
npm test         # Run unit tests (Vitest)
```

### COOP/COEP headers

SharedArrayBuffer (required for AudioWorklet) needs these HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The Vite dev server sets these automatically. For production, configure your hosting to serve these headers.

## Architecture

```
src/
  cpu/
    m68000.ts       — Motorola 68000 interpreter
    z80.ts          — Zilog Z80 interpreter
  video/
    cps1-video.ts   — CPS-A/CPS-B tile decode, scroll layers, sprites
    renderer-webgl.ts — WebGL2 renderer
    renderer.ts     — Canvas 2D fallback
  audio/
    nuked-opm-wasm.ts — YM2151 WASM wrapper (Nuked OPM)
    oki6295.ts      — OKI MSM6295 ADPCM decoder
    audio-output.ts — AudioWorklet + ring buffer + resampling
  memory/
    bus.ts          — M68000 memory map
    z80-bus.ts      — Z80 memory map
    rom-loader.ts   — MAME ZIP ROM loader
  emulator.ts       — Main loop (frame scheduling, CPU/audio/video)
  index.ts          — UI entry point
wasm/
  opm.c, opm.h      — Nuked OPM C source (LGPL 2.1+)
  opm.mjs           — Compiled WASM (Emscripten, SINGLE_FILE)
```

## Hardware reference

| Component | Spec |
|-----------|------|
| Main CPU | Motorola 68000 @ 10 MHz |
| Audio CPU | Zilog Z80 @ 3.579545 MHz |
| Video | CPS-A + CPS-B custom ASICs |
| FM audio | Yamaha YM2151 (OPM) — 8ch, 4-op, 55930 Hz |
| ADPCM audio | OKI MSM6295 — 4 voices, 7575 Hz |
| Resolution | 384 x 224 @ ~59.637 Hz |

## Credits

- [Nuked OPM](https://github.com/nukeykt/Nuked-OPM) by Nuke.YKT — LGPL 2.1+
- Hardware constants and game definitions from [MAME](https://github.com/mamedev/mame)

## License

ISC — see [LICENSE](LICENSE).
