# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **FM Patch Editor** (code present, UI tab hidden) — CPS1 sound driver voice read/write (40-byte format), macro controls (volume, brightness, ADSR), algorithm selection, ROM export. Voice table auto-detection via base pointer or brute-force scan.
- **Mic recording** — Record OKI samples from microphone with 3s auto-stop, lo-fi processing (3kHz low-pass + normalize + tanh soft-clip) to match arcade hardware character
- **Audio panel enhancements** — Mute/solo per FM/OKI channel, FM timeline visualization, OKI waveforms, sortable sample table (click column headers)
- **Palette ROM patching** — Palette color edits persist across rounds and in ZIP export. Brightness-aware search (strips CPS1 brightness nibble before matching program ROM). Program ROM reconstruction (ROM_LOAD16_BYTE deinterleave) added to export.
- **CPS1 Sound Driver parser** (`cps1-sound-driver.ts`) — Reverse-engineered v4.x voice format, voice table scanner, `patchToRegisters()` for YM2151 register generation

### Fixed
- **Scroll 2 tile inspector** — Now accounts for per-row X scroll offset (row scroll), fixing wrong tile selection on stages with parallax effects (e.g., Ken's stage)
- **3D exploded view drag** — Overlay pointer-events disabled in 3D mode, allowing drag-to-rotate without tile inspector interference
- **Layer grid default** — Sprite grid checkbox off by default for all layers

### Changed
- **Synth tab hidden** — FM Patch Editor UI deferred (real-time register override conflicts with Z80 sound driver; see LEARNINGS.md)
- **OKI sample encoding** — Boosted gain (1.8x + tanh 2.0 soft-clip) to match hot mastering of original CPS1 samples

### Not shipped (investigated, deferred)
- **FM Patch Editor real-time playback** — Multiple approaches attempted (ROM patching, fmOverride, Z80 write interception with shadow registers). Fundamental conflict: Z80 caches voice data in work RAM and continuously adjusts TL for volume envelopes. Intercepting timbre writes works partially but sounds wrong because the Z80's dynamic volume offsets are lost. Deferred until Z80 music sequencer format is reverse-engineered.
- **Mute/Solo in ROM export** — Mute/solo is a runtime concept (which channel is audible). Persisting in ROM would require reverse-engineering the CPS1 music sequence format to remove note commands per-track. Noted in BACKLOG.

- **Sprite Pixel Editor** — WYSIWYG sprite editing with palette & tile tools (#27)
  - `inspectSpriteAt()` on CPS1Video — hit-test sprites front-to-back with full tile metadata
  - `PixelInspectResult` enriched with tileCode, paletteIndex, gfxRomOffset, localX/Y, flip, multi-tile info
  - Tile Encoder (`src/editor/tile-encoder.ts`) — `encodeRow()` (inverse of `decodeRow()`), `writePixel()`, `readPixel()`, `readTile()`
  - Palette Editor (`src/editor/palette-editor.ts`) — `readPalette()`, `writeColor()`, `encodeColor()` (lossy RGB↔CPS1 conversion)
  - Sprite Editor UI (`src/editor/sprite-editor-ui.ts`) — 360px panel with 16x16 zoomed tile grid, pencil/fill/eyedropper/eraser tools, palette sidebar with color picker, tile neighbor navigation, undo/redo (100 levels), frame stepping
  - Canvas overlay for sprite selection — hover highlight (cyan), selected tile (red), multi-tile dim outlines
  - Tile Reference Counter (`src/editor/tile-refs.ts`) — `findTileReferences()`, `findFreeTileSlot()`, `duplicateTile()`
  - Keyboard shortcuts: B/G/I/X (tools), Ctrl+Z/Ctrl+Shift+Z (undo/redo), [/] (prev/next color), Arrow keys (neighbor tiles), Right arrow (frame step), E (toggle editor)
  - "Edit Sprites (E)" button in hamburger menu (visible after ROM load)
  - New getters on CPS1Video: `getGraphicsRom()`, `getVram()`, `getCpsaRegs()`, `getCpsbRegs()`, `getMapperTable()`, `getBankSizes()`, `getBankBases()`
  - Exported `GfxRange` interface from cps1-video.ts
- **Audio timeline ruler** — frame-synced ruler bar with minor ticks (60f) and major ticks + labels (600f)
- **FPS + frame counter** display on audio timeline ruler
- **Timeline scroll sync** — tied to emulator frameCount, stops on pause, reversed direction (new data on left)

### Fixed
- **Firefox audio lag** — replaced naive `setInterval(16.77ms)` with 4ms tick + frame debt accumulator. Worker catches up missed frames instead of dropping them.
- **Ring buffer** doubled from 8192 → 16384 samples (~340ms margin)

### Changed
- **Rebrand** StudioROM → ROMstudio
- **UI colors** — `--color-text-muted` #888→#aaa, `--color-text-dim` #666→#888, timeline backgrounds lightened
