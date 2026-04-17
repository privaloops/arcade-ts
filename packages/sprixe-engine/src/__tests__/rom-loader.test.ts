import { describe, it, expect } from 'vitest';
import { loadRomFromZip, getSupportedGames } from '../memory/rom-loader';
import { GAME_DEFS } from '../memory/game-defs';
import JSZip from 'jszip';

/**
 * Build a minimal ZIP ArrayBuffer containing fake ROM files for a given GameDef.
 * Each file is filled with a recognizable pattern (filename hash).
 */
async function buildFakeZip(gameName: string): Promise<ArrayBuffer> {
  const def = GAME_DEFS.find(d => d.name === gameName);
  if (!def) throw new Error(`Unknown game: ${gameName}`);

  const zip = new JSZip();

  // Collect all required filenames
  const files: Array<{ name: string; size: number }> = [];

  for (const entry of def.program.entries) {
    files.push({ name: entry.even, size: entry.size });
    files.push({ name: entry.odd, size: entry.size });
  }
  if (def.program.wordSwapEntries) {
    for (const entry of def.program.wordSwapEntries) {
      files.push({ name: entry.file, size: entry.size });
    }
  }
  for (const bank of def.graphics.banks) {
    for (const f of bank.files) {
      files.push({ name: f, size: bank.romSize / (bank.files.length === 8 ? 1 : 2) });
    }
  }
  for (const f of def.audio.files) {
    files.push({ name: f, size: def.audio.size });
  }
  for (const f of def.oki.files) {
    files.push({ name: f, size: Math.ceil(def.oki.size / def.oki.files.length) });
  }

  for (const { name, size } of files) {
    const data = new Uint8Array(size);
    // Fill with a pattern derived from filename
    const seed = name.charCodeAt(0);
    for (let i = 0; i < size; i++) data[i] = (seed + i) & 0xFF;
    zip.file(name, data);
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('rom-loader', () => {
  describe('loadRomFromZip', () => {
    it('loads ffight ROM set correctly', async () => {
      const zipBuf = await buildFakeZip('ffight');
      const romSet = await loadRomFromZip(zipBuf);

      expect(romSet.name).toBe('ffight');
      expect(romSet.programRom.length).toBe(GAME_DEFS.find(d => d.name === 'ffight')!.program.size);
      expect(romSet.graphicsRom.length).toBe(GAME_DEFS.find(d => d.name === 'ffight')!.graphics.size);
      expect(romSet.qsound).toBe(false);
      expect(romSet.qsoundDspRom).toBeNull();
    });

    it('loads sf2 ROM set correctly', async () => {
      const zipBuf = await buildFakeZip('sf2');
      const romSet = await loadRomFromZip(zipBuf);

      expect(romSet.name).toBe('sf2');
      expect(romSet.cpsBConfig).toBeDefined();
      expect(romSet.gfxMapper).toBeDefined();
      expect(romSet.gameDef.name).toBe('sf2');
    });

    it('program ROM has correct size', async () => {
      const zipBuf = await buildFakeZip('ffight');
      const romSet = await loadRomFromZip(zipBuf);
      const def = GAME_DEFS.find(d => d.name === 'ffight')!;

      expect(romSet.programRom.length).toBe(def.program.size);
    });

    it('preserves original files for export', async () => {
      const zipBuf = await buildFakeZip('ffight');
      const romSet = await loadRomFromZip(zipBuf);

      expect(romSet.originalFiles.size).toBeGreaterThan(0);
      // All filenames should be lowercased
      for (const key of romSet.originalFiles.keys()) {
        expect(key).toBe(key.toLowerCase());
      }
    });

    it('CPS-B config is correctly selected per game', async () => {
      const zipBuf = await buildFakeZip('sf2');
      const romSet = await loadRomFromZip(zipBuf);
      const def = GAME_DEFS.find(d => d.name === 'sf2')!;

      expect(romSet.cpsBConfig.idValue).toBe(def.cpsBConfig.idValue);
      expect(romSet.cpsBConfig.layerControl).toBe(def.cpsBConfig.layerControl);
    });
  });

  describe('error handling', () => {
    it('throws on empty ZIP', async () => {
      const zip = new JSZip();
      const buf = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(loadRomFromZip(buf)).rejects.toThrow('ZIP archive is empty');
    });

    it('throws on unrecognized ROM files', async () => {
      const zip = new JSZip();
      zip.file('random_file.bin', new Uint8Array(100));
      const buf = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(loadRomFromZip(buf)).rejects.toThrow('Unable to identify CPS1 game');
    });

    it('throws when program ROM files are missing', async () => {
      const def = GAME_DEFS.find(d => d.name === 'ffight')!;
      const zip = new JSZip();
      // Add only the even file of the first entry, skip the odd
      zip.file(def.program.entries[0]!.even, new Uint8Array(def.program.entries[0]!.size));
      // Add enough GFX/audio files to pass identification threshold
      for (const bank of def.graphics.banks) {
        for (const f of bank.files) {
          zip.file(f, new Uint8Array(10));
        }
      }
      for (const f of def.audio.files) zip.file(f, new Uint8Array(10));
      for (const f of def.oki.files) zip.file(f, new Uint8Array(10));

      const buf = await zip.generateAsync({ type: 'arraybuffer' });
      await expect(loadRomFromZip(buf)).rejects.toThrow('Missing program ROM');
    });
  });

  describe('getSupportedGames', () => {
    it('returns all game names from GAME_DEFS', () => {
      const names = getSupportedGames();
      expect(names.length).toBe(GAME_DEFS.length);
      for (const def of GAME_DEFS) {
        expect(names).toContain(def.name);
      }
    });
  });

  describe('GFX mapper produces correct byte layout', () => {
    it('graphics ROM size matches game definition', async () => {
      for (const gameName of ['ffight', 'sf2']) {
        const zipBuf = await buildFakeZip(gameName);
        const romSet = await loadRomFromZip(zipBuf);
        const def = GAME_DEFS.find(d => d.name === gameName)!;

        expect(romSet.graphicsRom.length).toBe(def.graphics.size);
      }
    });

    it('graphics ROM is not all zeros (interleave works)', async () => {
      const zipBuf = await buildFakeZip('ffight');
      const romSet = await loadRomFromZip(zipBuf);

      // At least some bytes should be non-zero
      let nonZero = 0;
      for (let i = 0; i < Math.min(1024, romSet.graphicsRom.length); i++) {
        if (romSet.graphicsRom[i] !== 0) nonZero++;
      }
      expect(nonZero).toBeGreaterThan(0);
    });
  });
});
