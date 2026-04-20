import { describe, it, expect, beforeEach } from 'vitest';
import { SpriteEditor } from '../editor/sprite-editor';
import type { TileContext } from '../editor/sprite-editor';
import { writePixel, readPixel } from '../editor/tile-encoder';

// Minimal mock emulator — only what SpriteEditor needs
function createMockEmulator(gfxRom: Uint8Array) {
  return {
    getVideo: () => ({
      getGraphicsRom: () => gfxRom,
      getPaletteBase: () => 0,
      getMapperTable: () => [],
      getBankSizes: () => [],
      getBankBases: () => [],
      getLayerOrder: () => [0, 1, 2, 3],
      inspectSpriteAt: () => null,
      inspectScrollAt: () => null,
    }),
    getBusBuffers: () => ({
      vram: new Uint8Array(0x30000),
      workRam: new Uint8Array(0x10000),
    }),
    getRomStore: () => ({
      getOriginal: () => new Uint8Array(gfxRom.length),
      patchPaletteViaSrc: () => false,
    }),
    getWorkRam: () => new Uint8Array(0x10000),
    stepFrame: () => {},
  } as any;  
}

const CHAR_SIZE = 128; // 16x16 tile

function makeTileContext(tileCode = 0): TileContext {
  return {
    layerId: 0, // LAYER_OBJ
    tileCode,
    rawCode: tileCode,
    paletteIndex: 0,
    gfxRomOffset: tileCode * CHAR_SIZE,
    tileW: 16,
    tileH: 16,
    charSize: CHAR_SIZE,
    flipX: false,
    flipY: false,
    paletteBase: 0,
  };
}

describe('SpriteEditor', () => {
  let gfxRom: Uint8Array;
  let editor: SpriteEditor;

  beforeEach(() => {
    gfxRom = new Uint8Array(CHAR_SIZE * 4); // 4 tiles
    const emu = createMockEmulator(gfxRom);
    editor = new SpriteEditor(emu);
  });

  // -- Activation --

  it('starts inactive', () => {
    expect(editor.active).toBe(false);
  });

  it('activate/deactivate toggles state', () => {
    editor.activate();
    expect(editor.active).toBe(true);
    editor.deactivate();
    expect(editor.active).toBe(false);
  });

  // -- Tool selection --

  it('default tool is pencil', () => {
    expect(editor.tool).toBe('pencil');
  });

  it('setTool changes the active tool', () => {
    editor.setTool('fill');
    expect(editor.tool).toBe('fill');
    editor.setTool('eraser');
    expect(editor.tool).toBe('eraser');
  });

  it('setActiveColor masks to 4 bits (0-15)', () => {
    editor.setActiveColor(7);
    expect(editor.activeColorIndex).toBe(7);
    editor.setActiveColor(0xFF);
    expect(editor.activeColorIndex).toBe(0x0F);
  });

  // -- Paint pixel --

  it('paintPixel writes the active color to GFX ROM', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));
    editor.setActiveColor(5);

    editor.paintPixel(0, 0);

    const pixel = readPixel(gfxRom, 0, 0, 0, CHAR_SIZE);
    expect(pixel).toBe(5);
  });

  it('eraser tool paints with pen 15 (CPS1 transparent)', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));

    // First paint a non-transparent pixel
    editor.setActiveColor(3);
    editor.paintPixel(4, 4);
    expect(readPixel(gfxRom, 0, 4, 4, CHAR_SIZE)).toBe(3);

    // Switch to eraser and paint same pixel
    editor.setTool('eraser');
    editor.paintPixel(4, 4);
    expect(readPixel(gfxRom, 0, 4, 4, CHAR_SIZE)).toBe(15);
  });

  it('painting with transparent pen (index 15) writes index 15, not 0', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));
    editor.setActiveColor(15);

    editor.paintPixel(7, 7);
    expect(readPixel(gfxRom, 0, 7, 7, CHAR_SIZE)).toBe(15);
  });

  // -- Undo/Redo --

  it('undo restores previous GFX ROM bytes', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));
    editor.setActiveColor(9);

    // Paint a pixel
    editor.paintPixel(2, 3);
    expect(readPixel(gfxRom, 0, 2, 3, CHAR_SIZE)).toBe(9);

    // Undo
    editor.undo();
    expect(readPixel(gfxRom, 0, 2, 3, CHAR_SIZE)).toBe(0);
  });

  it('redo re-applies the undone change', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));
    editor.setActiveColor(11);

    editor.paintPixel(5, 5);
    editor.undo();
    expect(readPixel(gfxRom, 0, 5, 5, CHAR_SIZE)).toBe(0);

    editor.redo();
    expect(readPixel(gfxRom, 0, 5, 5, CHAR_SIZE)).toBe(11);
  });

  it('canUndo / canRedo reflect stack state', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));

    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(false);

    editor.setActiveColor(1);
    editor.paintPixel(0, 0);
    expect(editor.canUndo).toBe(true);

    editor.undo();
    expect(editor.canRedo).toBe(true);
    expect(editor.canUndo).toBe(false);
  });

  it('painting after undo clears redo stack', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));
    editor.setActiveColor(1);

    editor.paintPixel(0, 0);
    editor.undo();
    expect(editor.canRedo).toBe(true);

    editor.setActiveColor(2);
    editor.paintPixel(1, 1);
    expect(editor.canRedo).toBe(false);
  });

  // -- Deactivation resets state --

  it('deactivate clears undo/redo stacks and current tile', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));
    editor.setActiveColor(1);
    editor.paintPixel(0, 0);

    editor.deactivate();
    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(false);
    expect(editor.currentTile).toBeNull();
  });

  // -- Eyedropper --

  it('eyedrop reads the pixel color and sets it as active', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));

    // Write a known pixel directly
    writePixel(gfxRom, 0, 3, 3, 12, CHAR_SIZE);

    editor.eyedrop(3, 3);
    expect(editor.activeColorIndex).toBe(12);
  });

  // -- Flood fill --

  it('floodFill fills connected same-color region', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));

    // All pixels start at 0. Fill from (0,0) with color 7
    editor.setActiveColor(7);
    editor.floodFill(0, 0);

    // Entire tile should be 7
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(readPixel(gfxRom, 0, x, y, CHAR_SIZE)).toBe(7);
      }
    }
  });

  it('floodFill does not cross color boundaries', () => {
    editor.activate();
    editor.restoreSelection(makeTileContext(0));

    // Draw a horizontal line of color 5 at y=8
    for (let x = 0; x < 16; x++) {
      writePixel(gfxRom, 0, x, 8, 5, CHAR_SIZE);
    }

    // Fill from top-left (color 0) with color 3
    editor.setActiveColor(3);
    editor.floodFill(0, 0);

    // Above the line should be 3
    expect(readPixel(gfxRom, 0, 0, 0, CHAR_SIZE)).toBe(3);
    expect(readPixel(gfxRom, 0, 0, 7, CHAR_SIZE)).toBe(3);

    // The line itself should still be 5
    expect(readPixel(gfxRom, 0, 0, 8, CHAR_SIZE)).toBe(5);

    // Below the line should still be 0 (not filled)
    expect(readPixel(gfxRom, 0, 0, 9, CHAR_SIZE)).toBe(0);
  });
});
