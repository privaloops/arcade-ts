# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
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
