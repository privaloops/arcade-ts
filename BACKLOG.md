# Backlog

## Done (session March 21-22)

- [x] Web Worker audio — Z80+YM2151+OKI off main thread, autonomous timer
- [x] QSound audio resampling (24038 → 48kHz)
- [x] Kabuki Z80 decryption — all QSound games boot with audio
- [x] Gamepad remapping with P1/P2 config, autofire, localStorage persistence
- [x] Keyboard remapping with AZERTY/QWERTY layout detection
- [x] Save states — 4 slots, full audio restore (YM2151 WASM heap snapshot)
- [x] DIP switches — 56 games with real MAME definitions, auto-generated from cps1.cpp
- [x] CRT filter (scanlines + vignetting)
- [x] TATE mode fixes (canvas + DOM)
- [x] DOM renderer sprite flickering fix (putImageData instead of data URLs)
- [x] Unified Config modal (Joypad/Keyboard/Display/DIP tabs)
- [x] Device assignment — per-player gamepad selection with persistence
- [x] Buttons 4-6 (kicks) for SF2 via CPS-B register 0x36
- [x] Ring buffer 4096 → 8192 for better audio margin
- [x] ROM cache from public/roms/
- [x] UI redesign, project renamed to Arcade.ts
- [x] Vercel deployment with COOP/COEP headers

## M68000 CPU — Tom Harte test failures

- [ ] **ADDX.b/MOVE.b/MOVEA with -(A7)/(A7)+** — 68000 forces A7 even: decrement/increment by 2 for byte ops on A7
- [ ] **DIVS** — Incorrect flags (N, Z, V, C) on signed division. 9 vectors fail.
- [ ] **DIVU** — Incorrect flags on unsigned division. 10 vectors fail.
- [ ] **MULS** — Incorrect flags on signed multiplication. 11 vectors fail.
- [ ] **MULU** — Incorrect flags on unsigned multiplication. 11 vectors fail.
- [ ] **DBcc** — SSP/PC incorrect on some edge cases

## Z80 — Tom Harte test failures

- [ ] **SCF/CCF** — Undocumented flag bits 3, 5
- [ ] **BIT b,(HL)** — Undocumented flag bits 3, 5
- [ ] **Block I/O (INIR, OTIR, etc.)** — Complex flag calculation not implemented

## Video

- [ ] **Row scroll on scroll1/scroll3** — Only scroll2 supports row scroll currently
- [ ] **Column scroll** — Not implemented
- [ ] **Star field** — Background effect used by some games (1941)
- [ ] **P2 buttons 4-6** — May not work on some games (needs testing)

## Audio

- [x] **Web Worker audio** — Z80 + YM2151 + OKI off main thread, autonomous timer
- [x] **QSound audio resampling** — 24038 Hz → 48kHz via LinearResampler
- [x] **QSound stereo** — True stereo output with independent L/R resampling
- [ ] **Audio worker state on save/load** — Music resumes but YM2151 envelope state may be slightly off
- [ ] **OKI sample crackling** — Slight crackling on some OKI samples, may need better interpolation
- [ ] **Volume per channel** — Allow user to adjust YM2151 / OKI / QSound balance

## ROM Editor

- [x] **RomStore** — Central mutable ROM manager with ZIP export ([#22](https://github.com/privaloops/arcade-ts/issues/22))
- [x] **Sprite Pixel Editor** — WYSIWYG sprite editing with palette & tile tools ([#27](https://github.com/privaloops/arcade-ts/issues/27))
- [ ] **FM Patch Editor** — Live synth UI, ROM-level editing (depends on RomStore) ([#20](https://github.com/privaloops/arcade-ts/issues/20))
- [ ] **Scroll Layer Editor** — Edit scroll 1/2/3 tiles (same architecture as sprite editor)
- [ ] **Tile Allocation Manager** — Track free/used tiles across entire GFX ROM
- [ ] **Image Import** — PNG → tile conversion with palette quantization

## UI / UX

- [ ] **Mobile touch controls** — Virtual d-pad and buttons for phones/tablets
- [ ] **Speed control** — Fast forward / slow motion
- [ ] **FPS counter** — Optional display
- [ ] **Screenshot button** — Save current frame as PNG
- [ ] **Rewind** — Save N frames in circular buffer, hold button to rewind

## Platform expansion

- [ ] **Neo Geo (MVS)** — Same CPUs (68000 + Z80), different video (sprite-only), YM2610 audio
- [ ] **CPS2** — Evolution of CPS1, encrypted 68000, QSound standard
- [ ] **CPS3** — SH-2 CPU, very different architecture

## Infrastructure

- [ ] **GitHub Pages** as alternative hosting (with service worker for COOP/COEP headers)
- [ ] **PWA** — Offline support via service worker
- [ ] **CI** — Run tests on PR
