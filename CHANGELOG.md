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
