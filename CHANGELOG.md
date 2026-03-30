# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed
- **Refactor `sprite-editor-ui.ts`** — Split from 4629 LOC into focused modules: `aseprite-io.ts`, `capture-session.ts`, `sheet-viewer.ts`. Removed entire photo layer system (~3000 LOC). Main file reduced to ~1450 LOC
- **Deduplicate `frame-state.ts`** — Replace private copies of tilemap scan, readWord, gfxromBankMapper with imports from cps1-video.ts
- **Centralize constants** — `CHAR_SIZE_16`, `PIXEL_CLOCK`, `Z80_CLOCK`, `CPS_HTOTAL`, `CPS_VTOTAL`, `FRAME_RATE` moved to constants.ts (single source of truth)
- **Type Aseprite manifest** — Replace `manifest: any` with `SpriteManifest` / `ScrollManifest` typed interfaces

### Removed
- Photo layer system (import/quantize/merge/magic wand) — editing happens exclusively in Aseprite
- `photo-import.ts`, `photo-layer-ops.ts`, `magic-wand.test.ts`

### Added
- **`.romstudio` save/load** — JSON save format with sparse ROM diffs (GFX, Program, OKI) + captured poses. Ctrl+S / Ctrl+O, drag & drop support. Auto-save to IndexedDB with 2s debounce, restore prompt on reload
- **ROM round-trip E2E test** — Loads ROM, modifies tiles/palettes/samples, exports ZIP, re-imports, verifies conformity. MAME headless validation (local only)
- **Palette hue shift (Nuances)** — Shift+click palette swatches to select a nuance group, then hue-rotate them together. Preserves saturation/luminosity. Fallback auto-detect by hue (±30°) if no manual selection. Reset button to restore original palette
- **Palette transparency toggle** — Checkbox in color picker to replace all pixels of a color with pen 15 (transparent), reversible
- **Tile export PNG** — Export button next to Import, exports tile at native resolution with transparency
- **Erase Tile** — Button to clear all pixels to transparent (pen 15), with undo
- **Scroll tile highlight** — Pink rectangle on game canvas when selecting scroll tiles (not just sprites)
- **HUD toggle** — Button bottom-right of canvas to hide/show emu controls bar
- **Dynamic layer order** — Layer panel and click priority follow CPS-B register (game-specific, updates at runtime)
- **Tile selection persistence** — Selection preserved across Video panel toggle (F2 off/on)
- **Sprite Analyzer** — Character grouping by palette + spatial proximity, red contour overlay, center-tracking across frames
- **Pose Capture** — Gameplay recording of unique sprite poses with deduplication by tile code hash (mirrors = same pose)
- **Sprite Sheet Viewer** — Fullscreen pose editor replacing game canvas. Left sidebar with all poses, central zoomed sprite at 4x CSS scale, horizontal tile strip, click-to-edit tiles
- **Export/Import PNG** — Export any pose as transparent PNG at native resolution. Import PNG on individual tiles only with nearest-color quantization to CPS1 16-color palette (pen 15 = transparent)
- **Photo Import on Scroll Layers** — Multi-layer photo system with Photoshop-like layers. Drop photo → RGBA overlay → resize/move → Atkinson dithering quantization → merge into GFX ROM tiles
- **Tile Allocator** — Private tile copies to prevent shared-tile corruption on merge. Auto GFX ROM expansion when needed. Reverse bank mapping for scroll1 interleave
- **Layer Panel** — Left sidebar with per-group layers, visibility toggles (eye icons), drag-drop reorder, quantize/delete per layer, 3D exploded view slider, GFX ROM memory indicator
- **Tool Cursors** — Per-tool canvas cursors (pencil, bucket, eyedropper, eraser) generated programmatically as PNG data URLs
- **"Edit sprites" button** — Re-enter sprite sheet viewer from game mode after capture
- **OKI codec unit tests** — Encoder/decoder roundtrip, ADPCM step table, phrase table parsing

### Fixed
- **Transparent pen** — `assembleCharacter` and tile grid used pen 0 as transparent, but CPS1 hardware uses pen 15. Hair/belt appeared as black holes in sprite preview
- **Photo layer world coordinates** — Photo layers now positioned in scroll-relative world coords, not fixed screen coords. Photos stay anchored to the game world when scrolling
- **HW layer visibility** — Checkboxes reset to "visible" on every panel refresh. Now tracked in persistent state
- **Click suppression** — Drag/resize mouseup no longer triggers group-switching click event (capture phase suppression)
- **Shift+click all groups** — Layer selection now searches ALL groups, not just the active one
- **WAV import saturation** — 1.8x gain boost + tanh soft-clip now only applied for mic recording, not WAV file import
- **F2/F3 shortcuts** — Now work without a ROM loaded (panels toggle independently of game state)
- **Scroll merge palette mismatch** — Re-quantizes per tile using destination palette instead of global quantization palette. Fixes color explosion on multi-palette scroll areas
- **Scroll click priority** — Click traverses transparent pixels (pen 15) to reach layers beneath. No more scroll1 intercepting clicks meant for scroll2
- **Flipped tile display** — Tile grid shows tiles in screen orientation (flip applied). Paint tools write to correct ROM position
- **Escape** — No longer closes tile editor panels, only exits fullscreen/modals
- **Import tile refresh** — Now refreshes tile grid, palette, neighbors, emu and auto-save after import

### Changed
- **Tile editor layout** — Action buttons (undo/redo/reset/erase/import/export) moved above tile grid. Better section spacing in right panel
- **`loadRomFromZip`** — Accepts `File | ArrayBuffer` for Node/test usage
- **Panel titles** — "Video" → "Tile Editor" (right panel), harmonized styles (0.85rem, neutral color instead of red)
- **Pause/Step/Frame moved to header** — Removed from right panel, added as header control buttons
- **Layer panel open by default** — Visible at app launch with close button
- **HW layer checkboxes → eye icons** — Consistent with sub-layer visibility toggles
- **Hamburger menu** — "Video (F2)" toggles both columns, removed "Sprite Editor" entry
- **WAV format hint** — "WAV mono 7575 Hz" shown next to Import/Export Set buttons
- **OKI encoding** — `encodeSample` takes optional `boost` param (true for mic only)

---

### Added (March 25 — evening)
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
- **OKI sample encoding** — Boosted gain (1.8x + tanh 2.0 soft-clip) now mic-only. `encodeSample` takes optional `boost` param (default false). WAV file imports are no longer saturated.

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
