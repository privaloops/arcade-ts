import { describe, it, expect } from 'vitest';
import { assembleProgramRom, assembleSpritesRom, assembleVoiceRom, isNeoGeoRom } from '../memory/neogeo-rom-loader';
import { NEOGEO_GAME_DEFS } from '../memory/neogeo-game-defs';
import type { NeoGeoRomEntry } from '../memory/neogeo-game-defs';

describe('Neo-Geo ROM Loader', () => {
  describe('game identification', () => {
    it('identifies nam1975 from filenames', () => {
      const files = ['001-p1.p1', '001-s1.s1', '001-m1.m1', '001-c1.c1', '001-c2.c2'];
      expect(isNeoGeoRom(files)).toBe(true);
    });

    it('identifies kof98 from filenames', () => {
      const files = [
        '242-p1.p1', '242-p2.sp2',
        '242-c1.c1', '242-c2.c2', '242-c3.c3', '242-c4.c4',
        '242-c5.c5', '242-c6.c6', '242-c7.c7', '242-c8.c8',
        '242-m1.m1', '242-v1.v1', '242-v2.v2',
      ];
      expect(isNeoGeoRom(files)).toBe(true);
    });

    it('rejects random filenames', () => {
      expect(isNeoGeoRom(['random.bin', 'stuff.dat'])).toBe(false);
    });

    it('rejects CPS1 ROM filenames', () => {
      const cps1Files = ['sf2e_30g.11e', 'sf2e_37g.11f', 'sf2-5m.4a'];
      expect(isNeoGeoRom(cps1Files)).toBe(false);
    });
  });

  describe('P-ROM assembly (word swap)', () => {
    it('swaps bytes for load16_word_swap', () => {
      const entries: NeoGeoRomEntry[] = [
        { name: 'test-p1.p1', offset: 0, size: 4, loadFlag: 'load16_word_swap' },
      ];
      const fileMap = new Map<string, Uint8Array>();
      fileMap.set('test-p1.p1', new Uint8Array([0x12, 0x34, 0x56, 0x78]));

      const result = assembleProgramRom(entries, fileMap);

      // Word swap: pairs [0x12,0x34] → [0x34,0x12], [0x56,0x78] → [0x78,0x56]
      expect(result[0]).toBe(0x34);
      expect(result[1]).toBe(0x12);
      expect(result[2]).toBe(0x78);
      expect(result[3]).toBe(0x56);
    });

    it('handles multiple P-ROM entries at different offsets', () => {
      const entries: NeoGeoRomEntry[] = [
        { name: 'p1.p1', offset: 0, size: 4, loadFlag: 'load16_word_swap' },
        { name: 'p2.sp2', offset: 4, size: 4, loadFlag: 'load16_word_swap' },
      ];
      const fileMap = new Map<string, Uint8Array>();
      fileMap.set('p1.p1', new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]));
      fileMap.set('p2.sp2', new Uint8Array([0x11, 0x22, 0x33, 0x44]));

      const result = assembleProgramRom(entries, fileMap);
      expect(result.length).toBe(8);
      expect(result[0]).toBe(0xBB);
      expect(result[1]).toBe(0xAA);
      expect(result[4]).toBe(0x22);
      expect(result[5]).toBe(0x11);
    });
  });

  describe('C-ROM assembly (byte interleave)', () => {
    it('interleaves C-ROM pair correctly', () => {
      // C1 at offset 0 (odd bytes), C2 at offset 1 (even bytes)
      const entries: NeoGeoRomEntry[] = [
        { name: 'c1.c1', offset: 0, size: 4, loadFlag: 'load16_byte' },
        { name: 'c2.c2', offset: 1, size: 4, loadFlag: 'load16_byte' },
      ];
      const fileMap = new Map<string, Uint8Array>();
      fileMap.set('c1.c1', new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]));
      fileMap.set('c2.c2', new Uint8Array([0x11, 0x22, 0x33, 0x44]));

      const result = assembleSpritesRom(entries, fileMap);

      // Interleaved: [C1[0], C2[0], C1[1], C2[1], ...]
      expect(result[0]).toBe(0xAA);
      expect(result[1]).toBe(0x11);
      expect(result[2]).toBe(0xBB);
      expect(result[3]).toBe(0x22);
      expect(result[4]).toBe(0xCC);
      expect(result[5]).toBe(0x33);
      expect(result[6]).toBe(0xDD);
      expect(result[7]).toBe(0x44);
    });

    it('handles multiple C-ROM pairs at different offsets', () => {
      const entries: NeoGeoRomEntry[] = [
        { name: 'c1.c1', offset: 0, size: 2, loadFlag: 'load16_byte' },
        { name: 'c2.c2', offset: 1, size: 2, loadFlag: 'load16_byte' },
        { name: 'c3.c3', offset: 0x100000, size: 2, loadFlag: 'load16_byte' },
        { name: 'c4.c4', offset: 0x100001, size: 2, loadFlag: 'load16_byte' },
      ];
      const fileMap = new Map<string, Uint8Array>();
      fileMap.set('c1.c1', new Uint8Array([0xAA, 0xBB]));
      fileMap.set('c2.c2', new Uint8Array([0x11, 0x22]));
      fileMap.set('c3.c3', new Uint8Array([0xCC, 0xDD]));
      fileMap.set('c4.c4', new Uint8Array([0x33, 0x44]));

      const result = assembleSpritesRom(entries, fileMap);

      // First pair at offset 0
      expect(result[0]).toBe(0xAA);
      expect(result[1]).toBe(0x11);
      expect(result[2]).toBe(0xBB);
      expect(result[3]).toBe(0x22);

      // Second pair at offset 0x100000
      expect(result[0x100000]).toBe(0xCC);
      expect(result[0x100001]).toBe(0x33);
    });
  });

  describe('V-ROM assembly', () => {
    it('assembles single ADPCM region linearly', () => {
      const entries: NeoGeoRomEntry[] = [
        { name: 'v1.v1', offset: 0, size: 4 },
        { name: 'v2.v2', offset: 4, size: 4 },
      ];
      const fileMap = new Map<string, Uint8Array>();
      fileMap.set('v1.v1', new Uint8Array([1, 2, 3, 4]));
      fileMap.set('v2.v2', new Uint8Array([5, 6, 7, 8]));

      const result = assembleVoiceRom(entries, fileMap);
      expect(result.data.length).toBe(8);
      expect(Array.from(result.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.adpcmASize).toBe(8);
    });

    it('handles ADPCM-A + ADPCM-B (offset reset)', () => {
      // ADPCM-A at offset 0, then ADPCM-B restarts at offset 0
      const entries: NeoGeoRomEntry[] = [
        { name: 'v11.v11', offset: 0, size: 4 },
        { name: 'v21.v21', offset: 0, size: 4 },
        { name: 'v22.v22', offset: 4, size: 4 },
      ];
      const fileMap = new Map<string, Uint8Array>();
      fileMap.set('v11.v11', new Uint8Array([0xA1, 0xA2, 0xA3, 0xA4]));
      fileMap.set('v21.v21', new Uint8Array([0xB1, 0xB2, 0xB3, 0xB4]));
      fileMap.set('v22.v22', new Uint8Array([0xB5, 0xB6, 0xB7, 0xB8]));

      const result = assembleVoiceRom(entries, fileMap);
      // ADPCM-A (4 bytes) then ADPCM-B (8 bytes) = 12 bytes total
      expect(result.data.length).toBe(12);
      expect(result.adpcmASize).toBe(4);
      expect(result.data[0]).toBe(0xA1); // ADPCM-A start
      expect(result.data[3]).toBe(0xA4); // ADPCM-A end
      expect(result.data[4]).toBe(0xB1); // ADPCM-B start
      expect(result.data[7]).toBe(0xB4);
      expect(result.data[8]).toBe(0xB5);
    });
  });

  describe('game defs integrity', () => {
    it('has at least 40 game definitions', () => {
      expect(NEOGEO_GAME_DEFS.length).toBeGreaterThanOrEqual(40);
    });

    it('all games have program ROMs', () => {
      for (const def of NEOGEO_GAME_DEFS) {
        expect(def.program.length, `${def.name} has no program ROMs`).toBeGreaterThan(0);
      }
    });

    it('all games have sprite ROMs', () => {
      for (const def of NEOGEO_GAME_DEFS) {
        expect(def.sprites.length, `${def.name} has no sprite ROMs`).toBeGreaterThan(0);
      }
    });

    it('most games have audio ROMs (some encrypted games may not)', () => {
      const noAudio = NEOGEO_GAME_DEFS.filter(d => d.audio.length === 0);
      // A few late encrypted games (kof2000+) use audiocrypt dataareas not yet supported
      expect(noAudio.length, `Too many games without audio: ${noAudio.map(d => d.name).join(', ')}`).toBeLessThan(20);
    });

    it('C-ROM entries come in pairs (even count)', () => {
      for (const def of NEOGEO_GAME_DEFS) {
        const loadByteEntries = def.sprites.filter(e => e.loadFlag === 'load16_byte');
        expect(
          loadByteEntries.length % 2,
          `${def.name} has odd number of load16_byte C-ROM entries`
        ).toBe(0);
      }
    });

    it('includes key games', () => {
      const names = new Set(NEOGEO_GAME_DEFS.map(d => d.name));
      expect(names.has('kof98')).toBe(true);
      expect(names.has('mslug')).toBe(true);
      expect(names.has('samsho')).toBe(true);
      expect(names.has('fatfury2')).toBe(true);
    });
  });
});
