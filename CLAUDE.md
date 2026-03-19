# CPS1-Web

Émulateur CPS1 (Capcom Play System 1) from scratch dans le browser.
TypeScript strict + WebGL2 + AudioWorklet + WASM. Zéro dépendance d'émulation.

## Commandes

```bash
npm run dev      # Serveur de développement Vite (hot reload)
npm run build    # Compilation TypeScript + build Vite (sortie dans dist/)
npm run preview  # Prévisualisation du build de production
npm test         # Tests unitaires (vitest)
npm run test:watch  # Tests en mode watch
```

## Structure

```
src/
  cpu/
    m68000.ts       # Motorola 68000 interpréteur (~3000 lignes)
    z80.ts          # Zilog Z80 interpréteur (~2250 lignes)
  video/
    cps1-video.ts   # CPS-A/CPS-B tile decode, layers, sprites, palette
    renderer.ts     # Canvas 2D renderer (fallback)
    renderer-webgl.ts # WebGL2 renderer (texture upload, default)
  audio/
    nuked-opm-wasm.ts # Nuked OPM (YM2151) WASM wrapper — cycle-accurate FM
    nuked-opm.ts      # Nuked OPM port TS (référence, non utilisé en prod)
    ym2151.ts         # YMFM-based YM2151 (fallback léger, non utilisé)
    oki6295.ts        # OKI MSM6295 ADPCM decoder
    audio-output.ts   # AudioWorklet + SharedArrayBuffer ring buffer + resampling
  memory/
    bus.ts          # Bus 68000 — memory map, I/O, CPS-A/B registers
    z80-bus.ts      # Bus Z80 — audio ROM, RAM, YM2151, OKI, sound latch
    rom-loader.ts   # ROM loader ZIP/MAME + 41 GameDefs + CPS-B configs + GFX mappers
  input/
    input.ts        # Keyboard + Gamepad API → CPS1 I/O ports
  game-catalog.ts   # 245 jeux CPS1 (source MAME 0.286) + liens archive.org
  types.ts          # Interfaces partagées (BusInterface, Z80BusInterface)
  index.ts          # Entry point — UI, game selector, shortcuts
  emulator.ts       # Main loop — frame scheduling, CPU/audio/video orchestration
wasm/
  opm.c, opm.h      # Source C Nuked OPM (LGPL 2.1+, github.com/nukeykt/Nuked-OPM)
  opm_wrapper.c     # Wrapper C pour Emscripten
  opm.mjs           # WASM compilé (ESM, SINGLE_FILE)
src/__tests__/
  bus.test.ts       # Tests bus address decoding
  m68000.test.ts    # Tests CPU M68000 (opcodes basiques)
  m68000-tom-harte.test.ts  # Tests M68000 Tom Harte (84 instructions, 200 vecteurs chacune)
  z80-tom-harte.test.ts     # Tests Z80 SingleStepTests (588 instructions, 200 vecteurs chacune)
  oki6295.test.ts   # Tests OKI6295 (ADPCM, commandes)
tests/
  68000/*.json      # Vecteurs Tom Harte M68000 (ProcessorTests)
  z80/*.json        # Vecteurs SingleStepTests Z80 (JSMoo)
```

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Langage | TypeScript (strict: noUncheckedIndexedAccess, exactOptionalPropertyTypes) |
| Build | Vite |
| Rendu | WebGL2 (fallback Canvas 2D) |
| Audio FM | Nuked OPM → WASM (Emscripten, -O3) |
| Audio ADPCM | OKI MSM6295 en TS |
| Audio output | AudioWorklet + SharedArrayBuffer (COOP/COEP requis) |
| Tests | Vitest |
| UI | HTML/CSS vanilla |

## Référence hardware CPS1

| Composant | Spec |
|-----------|------|
| CPU principal | Motorola 68000 @ 10 MHz |
| CPU audio | Zilog Z80 @ 3.579545 MHz |
| Vidéo | CPS-A + CPS-B (3 scroll layers + 1 sprite layer) |
| Audio FM | YM2151 (OPM) — 8 canaux, 4 opérateurs, 55930 Hz |
| Audio ADPCM | OKI MSM6295 — 4 voix, 7575 Hz |
| Résolution | 384×224 @ ~59.637 Hz |
| VRAM | 192 KB |
| Work RAM | 64 KB |
| Palette | 192 entrées × 16 couleurs (16-bit CPS1 format) |

## Performance (profiled)

| Composant | CPU % | Notes |
|-----------|-------|-------|
| M68000 | ~25% | Interpréteur TS, ~168K instructions/frame |
| Z80 + OPM WASM | ~8% | ~60K Z80 cycles + ~30K OPM clocks/frame |
| Vidéo (CPU decode + WebGL2) | ~3% | Tile decode + texture upload |
| **Total** | **~33%** | Sur Mac, Chrome |

## Jeux supportés

41 GameDefs (parent sets) avec ROM layout, CPS-B config, et GFX mapper.
245 jeux listés dans le dropdown (source MAME 0.286).
ROMs téléchargeables depuis archive.org via proxy Vite.

## Raccourcis clavier

| Touche | Action |
|--------|--------|
| P | Pause / Resume |
| F | Fullscreen |
| Escape | Quitter le jeu → sélecteur |
| 5 | Insert coin |
| 1 | 1P Start |

## Architecture audio

```
Z80 → sound latch (1 byte, polled) → YM2151 registers
Z80 → OKI6295 command register → ADPCM playback

YM2151 (WASM) → 55930 Hz stereo
OKI6295 (TS) → 7575 Hz mono

Resampling (LinearResampler) → 48000 Hz
Mixing: ymL*0.35 + ymR*0.35 + oki*0.30
Soft limiter @ ±0.95
→ SharedArrayBuffer ring buffer (4096 samples)
→ AudioWorklet (separate thread)
→ speakers
```

## Headers requis (dev server)

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Sans ces headers, SharedArrayBuffer est indisponible → fallback ScriptProcessorNode (main thread) → crackling audio.

## Build WASM (Nuked OPM)

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

## Sources et crédits

- Nuked OPM: [nukeykt/Nuked-OPM](https://github.com/nukeykt/Nuked-OPM) (LGPL 2.1+)
- Game definitions: [mamedev/mame](https://github.com/mamedev/mame) src/mame/capcom/cps1.cpp + cps1_v.cpp
- ROM catalog: MAME 0.286 via `mame -listxml`

## mdma

- **Workflow** : `default`
- **Git** : `default`

## mdma

- **Workflow** : `default`
- **Git** : `default`
