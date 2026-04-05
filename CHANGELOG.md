# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Center-bottom sprite alignment** — Multi-frame .aseprite exports align all poses by their center-bottom anchor (feet), with a canvas sized to the bounding box of all poses. Manifest stores original tile coords + per-frame `alignOffset` for correct round-trip import
- **Aseprite grid alignment** — Exported .aseprite files set the grid origin so Aseprite's View > Grid overlays exactly on 16×16 tile boundaries
- **Landing page demo videos** — Three workflow steps (Capture, Edit, Import) now show looping MP4/WebM videos instead of placeholders (total 1.4 MB vs 18 MB in GIFs)
- **Beta gate** — Client-side password screen on `/play/` (sessionStorage, once per session)
- **Scroll tile selection** — Scroll set viewer now has a clickable tile grid (same as sprites): crosshair cursor, tile grid overlay, dashed red highlight on selected tile, zoom in right panel with palette
- **Multi-tile sprite expansion** — `readAllSprites()` now expands CPS1 multi-tile (nx×ny) OBJ entries into individual sub-tiles with correct positions and tile codes, matching the hardware renderer formula. Fixes misplaced tiles for games like WoF
- **Per-palette export** — PNG and .aseprite export per palette in sprite sheet viewer (replaces global export). Each .aseprite file is mono-palette (16 colors) with manifest for round-trip import
- **Live sprite palette panel** — "Sprite Palettes" section in editor right panel shows active OBJ palettes with eye toggle to hide/show sprites by palette in the game renderer
- **Palette-aware capture** — Hidden palettes are excluded from sprite grouping during capture, so the REC bounds and captured poses match what's visible
- **Inline export/import on cards** — Export .aseprite and Import buttons directly on sprite capture cards in the layer panel
- **Palette ROM patching** — Palette color changes traced via M68K A0 register to find the source ROM address. Edits persist across rounds by patching the ROM, not just VRAM
- **Palette override on import** — Importing a .aseprite with modified palette colors applies persistent overrides (VRAM + ROM patch) that survive round transitions
- **Capture delete** — Delete button (×) on capture cards in left panel
- **Pose deduplication** — Duplicate poses removed at capture finalization and in .aseprite export (by unique tile code set)
- **Capture reset on game change** — Layer groups and palette state cleared when loading a new ROM
- **Unit tests for 10 untested modules** — rom-loader, game-defs, z80-bus-qsound, sprite-analyzer, tile-allocator, scroll-capture, resampler, capture-session, save-state, sprite-editor (+103 tests, 1016 total)
- **Game matrix Level 3** — automated sprite & scroll REC on all 29 ROMs, PNG export to `test-results/sprite-rec/` for manual review

### Fixed
- **Scroll palette snapshot at STOP** — Palette RGB captured when recording stops (stable state) instead of first frame (may be mid-fade/flash). Fixes washed-out scroll captures
- **Scroll capture reset on game change** — Active scroll sessions and finalized scroll sets now cleared when loading a new ROM
- **Pose deduplication broken** — Unified all dedup hash formulas to use `poseHash()` consistently (stop-time, export, save restore). Additionally, `poseHash()` now filters by the group's main palette so adjacent sprites from other palettes don't pollute the hash and create false-distinct poses
- **Sprite tile z-order** — `assembleCharacter()` now draws tiles back-to-front (matching CPS1 hardware priority)
- **Tile click palette** — Clicking a tile in sprite sheet selects its own palette (not the group's main palette)
- **Frame cropping in per-palette export** — Uses max dimensions across all poses
- **Palette persistence in sheet viewer** — Palette visibility state persists across pose changes
- **Manifest truncation** — Compressed manifest with deflate+base64 to prevent Aseprite truncating long User Data strings
- **Transparent tile filtering** — Fully transparent tiles (all pen 15) excluded from sprite capture
- **E shortcut removed** — Redundant E key shortcut removed (use F2 for sprite editor)

### Performance
- **M68000 flags as direct booleans** — CCR flags (C, V, Z, N, X) stored as boolean fields instead of getter/setter proxies to the SR register. SR reconstructed on demand only (exceptions, save state, MOVE from SR). Eliminates ~10 function calls per instruction on the hottest path (~50K instructions/frame)
- **M68000 prefetch as scalars** — Prefetch queue changed from `number[]` to two scalar fields, removing array indirection on every instruction fetch

### Changed
- **Mono-palette sprite capture** — `groupCharacter()` flood-fill restricted to the target palette only. Eliminates parasites from adjacent sprites/decor of other palettes. Cleaner captures, simpler code
- **Capture resumption** — Re-clicking a sprite whose palette was already captured resumes the existing group instead of creating a new one. New poses append live to the same card
- **Editor layout refactored** — Import button moved to bottom "Aseprite" section in left panel; Export button unified in right panel (shown in sheet viewer for both sprites and scrolls); removed inline card features (chevron, pose strip, See all) — simplified cards in left panel, sheet viewer for full view
- **Palette panel sprite cards + REC** — Captured sprite cards moved from left panel to right palette panel, grouped under their palette. Each palette has a REC button to start/stop capture directly
- **Large manifest import fix** — .aseprite files with manifests >65535 bytes (UINT16 overflow) now import correctly
- **Palette import from .aseprite** — Importing a .aseprite with modified palette colors applies them as VRAM overrides that persist across rounds (re-applied every frame)
- **Autosave disabled** — Manual .romstudio save only (Ctrl+S). Autosave was triggering restore prompts with empty saves
- **Grouping tolerance reduced** — Sprite adjacency tolerance lowered from 20px to 4px to avoid merging distinct characters

## [1.0.0-beta.1] - 2026-04-02

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
