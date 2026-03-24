/**
 * RomStore unit tests — mutable regions, reset, isModified, export.
 */

import { describe, it, expect } from 'vitest';
import { RomStore } from '../rom-store';
import type { RomSet } from '../memory/rom-loader';

function makeMockRomSet(): RomSet {
  return {
    name: 'test',
    programRom: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    graphicsRom: new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]),
    audioRom: new Uint8Array(0x18000), // big enough for audio layout
    okiRom: new Uint8Array([0x30, 0x31, 0x32, 0x33]),
    cpsBConfig: {
      idOffset: 0, idValue: 0,
      layerControl: 0x26,
      priority: [0, 0, 0, 0],
      paletteControl: 0x30,
      layerEnableMask: [0x08, 0x10, 0x20, 0, 0],
    },
    gfxMapper: { bankSizes: [0, 0, 0, 0], ranges: [] },
    qsound: false,
    qsoundDspRom: null,
    originalFiles: new Map([
      ['test_prog.bin', new Uint8Array([0x00, 0x01, 0x02, 0x03])],
      ['test_gfx.bin', new Uint8Array([0x10, 0x11, 0x12, 0x13])],
      ['test_audio.bin', new Uint8Array([0xA0, 0xA1])],
      ['test_oki.bin', new Uint8Array([0x30, 0x31, 0x32, 0x33])],
    ]),
    gameDef: {
      name: 'test',
      program: { entries: [], size: 4 },
      graphics: { banks: [], size: 8 },
      audio: { files: ['test_audio.bin'], size: 0x18000 },
      oki: { files: ['test_oki.bin'], size: 4 },
      cpsBConfig: {
        idOffset: 0, idValue: 0,
        layerControl: 0x26, priority: [0, 0, 0, 0],
        paletteControl: 0x30, layerEnableMask: [0x08, 0x10, 0x20, 0, 0],
      },
      gfxMapper: { bankSizes: [0, 0, 0, 0], ranges: [] },
    },
  };
}

describe('RomStore', () => {
  it('stores all regions', () => {
    const romSet = makeMockRomSet();
    const store = new RomStore(romSet);
    expect(store.name).toBe('test');
    expect(store.programRom).toBe(romSet.programRom);
    expect(store.graphicsRom).toBe(romSet.graphicsRom);
    expect(store.audioRom).toBe(romSet.audioRom);
    expect(store.okiRom).toBe(romSet.okiRom);
  });

  it('isModified returns false initially', () => {
    const store = new RomStore(makeMockRomSet());
    expect(store.isModified('program')).toBe(false);
    expect(store.isModified('graphics')).toBe(false);
    expect(store.isModified('audio')).toBe(false);
    expect(store.isModified('oki')).toBe(false);
  });

  it('isModified returns true after mutation', () => {
    const store = new RomStore(makeMockRomSet());
    store.graphicsRom[0] = 0xFF;
    expect(store.isModified('graphics')).toBe(true);
    expect(store.isModified('program')).toBe(false);
  });

  it('resetRegion restores original bytes', () => {
    const store = new RomStore(makeMockRomSet());
    const original = store.graphicsRom[0];
    store.graphicsRom[0] = 0xFF;
    expect(store.isModified('graphics')).toBe(true);

    store.resetRegion('graphics');
    expect(store.graphicsRom[0]).toBe(original);
    expect(store.isModified('graphics')).toBe(false);
  });

  it('isModified returns false after resetRegion', () => {
    const store = new RomStore(makeMockRomSet());
    store.audioRom[0] = 0xDE;
    store.resetRegion('audio');
    expect(store.isModified('audio')).toBe(false);
  });

  it('getOriginal returns pristine copy', () => {
    const store = new RomStore(makeMockRomSet());
    const orig = store.getOriginal('graphics');
    store.graphicsRom[0] = 0xFF;
    expect(orig[0]).toBe(0x10); // unchanged
  });

  it('mutation does not affect pristine copy', () => {
    const store = new RomStore(makeMockRomSet());
    store.programRom[0] = 0xAB;
    expect(store.getOriginal('program')[0]).toBe(0x00);
  });

  it('exportZipAsArrayBuffer returns non-empty buffer', async () => {
    const store = new RomStore(makeMockRomSet());
    const buf = await store.exportZipAsArrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('exportZip with no modifications contains original files', async () => {
    const store = new RomStore(makeMockRomSet());
    const buf = await store.exportZipAsArrayBuffer();

    // Parse the ZIP to verify contents
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const files = Object.keys(zip.files);
    expect(files).toContain('test_audio.bin');
    expect(files).toContain('test_oki.bin');
    expect(files).toContain('test_prog.bin');
    expect(files).toContain('test_gfx.bin');
  });
});
