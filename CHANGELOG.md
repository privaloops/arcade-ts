# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Aseprite round-trip workflow** — Capture sprites/scrolls → export .aseprite → edit in Aseprite → import back to ROM. Typed manifest (SpriteManifest / ScrollManifest) embedded in User Data
- **Sprite Capture** — REC button in layer panel, auto-capture unique poses by tile hash, live cards during recording, palette RGB snapshot at capture time
- **Scroll Capture** — REC per layer (BG1/BG2/BG3), accumulate tiles during gameplay, palette RGB snapshot at capture time, grouped by palette
- **Sprite Sheet Viewer** — Fullscreen pose viewer with sidebar, tile grid, Export .aseprite button
- **Scroll Set Viewer** — Fullscreen scroll reconstitution with tile strip, Export .aseprite button
- **Layer Panel** — Left sidebar with HW layer toggles, REC buttons, sprite/scroll set cards, 3D exploded view slider, GFX ROM memory indicator, Import .aseprite button
- **`.romstudio` save/load** — JSON save format with sparse ROM diffs (GFX, Program, OKI) + captured poses. Ctrl+S / Ctrl+O, auto-save to IndexedDB with content summary in restore prompt
- **FM Patch Editor** — CPS1 sound driver parser, voice read/write, macro controls (code present, UI tab hidden — see LEARNINGS.md)
- **Audio panel** — Mute/solo per FM/OKI channel, FM timeline, OKI waveforms, sample browser with drag-drop WAV replace, mic recording
- **Palette editing** — Color picker with hue shift (nuances), saturation slider, transparency toggle, ROM patching for persistence
- **3D Exploded View** — CSS 3D layer separation with drag rotation (works when paused)
- **Save states** — 4 slots, localStorage, keyboard shortcuts (F5/F8)
- **DIP switches** — Per-game configs parsed from MAME, persisted to localStorage
- **Sprite Pixel Editor** — `inspectSpriteAt()`, tile encoder, palette editor, tile refs, undo/redo (internal, editing moved to Aseprite)
- **OKI codec** — ADPCM encode/decode, sample replace in ROM, encoder/decoder roundtrip tests
- **Aseprite import integration tests** — 7 tests with real .aseprite fixtures (scroll tilemap pixel-for-pixel + sprite import)
- **E2E tests** — 16 Playwright spec files (~115 tests), Chromium + Firefox
- **Game matrix tests** — Automated boot (title screen snapshot) + audio check for all 29 ROMs in public/roms/
- **Screenshot (F9)** — Capture canvas as `<romName>_capture.png`
- **Release script** — `npm run release` : unit tests → build → E2E → game matrix → version bump → changelog → git tag → GitHub pre-release

### Changed
- **Refactor `sprite-editor-ui.ts`** — Split from 4629 to ~1450 LOC into: `aseprite-io.ts`, `capture-session.ts`, `sheet-viewer.ts`
- **Deduplicate `frame-state.ts`** — Import shared functions from cps1-video.ts
- **Centralize constants** — `CHAR_SIZE_16`, `PIXEL_CLOCK`, `Z80_CLOCK`, `CPS_HTOTAL`, `CPS_VTOTAL`, `FRAME_RATE` in constants.ts
- **Type Aseprite manifest** — Replace `manifest: any` with typed interfaces
- **Rebrand** StudioROM → ROMstudio

### Fixed
- **Palette snapshot** — Sprite and scroll captures now snapshot palette RGB at recording time, preventing fade/flash artifacts
- **3D drag when paused** — `onDragMove` now calls `updateExplodedTransforms()` directly
- **Autosave prompt** — Shows content summary, skips empty saves, improved wording
- **Aseprite import auto-save** — `onModified` now triggered after import
- **Firefox audio lag** — 4ms tick + frame debt accumulator replaces naive setInterval
- **Transparent pen** — CPS1 uses pen 15 (not 0) for transparency
- **Scroll 2 tile inspector** — Accounts for per-row X scroll offset
- **E2E tests** — Fixed page.goto URL (/play/), rewritten for current DOM
- **Sprite editor overlay** — Removed stale tile selection restore on editor toggle (red dashed square appearing without user click)

### Removed
- **Photo layer system** — import/quantize/merge/magic wand removed entirely. Editing happens exclusively in Aseprite
- `photo-import.ts`, `photo-layer-ops.ts`, `magic-wand.test.ts`
