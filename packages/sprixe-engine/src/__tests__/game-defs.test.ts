import { describe, it, expect } from 'vitest';
import { GAME_DEFS } from '../memory/game-defs';

describe('GameDefs structural validation', () => {
  it('every GameDef has a non-empty name', () => {
    for (const def of GAME_DEFS) {
      expect(def.name.length).toBeGreaterThan(0);
    }
  });

  it('no two GameDefs share the same name', () => {
    const names = GAME_DEFS.map(d => d.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every GameDef has program ROM entries or wordSwapEntries', () => {
    for (const def of GAME_DEFS) {
      const hasEntries = def.program.entries.length > 0;
      const hasWordSwap = (def.program.wordSwapEntries?.length ?? 0) > 0;
      expect(hasEntries || hasWordSwap, `${def.name} has no program ROM entries`).toBe(true);
    }
  });

  it('every program entry has non-empty even and odd filenames', () => {
    for (const def of GAME_DEFS) {
      for (const entry of def.program.entries) {
        expect(entry.even.length, `${def.name} even`).toBeGreaterThan(0);
        expect(entry.odd.length, `${def.name} odd`).toBeGreaterThan(0);
      }
    }
  });

  it('program size is positive and accommodates all entries', () => {
    for (const def of GAME_DEFS) {
      expect(def.program.size).toBeGreaterThan(0);
      for (const entry of def.program.entries) {
        // entry.offset + entry.size*2 should fit within program.size
        expect(entry.offset + entry.size * 2).toBeLessThanOrEqual(def.program.size);
      }
    }
  });

  it('every GameDef has at least one GFX bank', () => {
    for (const def of GAME_DEFS) {
      expect(def.graphics.banks.length, def.name).toBeGreaterThan(0);
    }
  });

  it('every GFX bank has at least one file', () => {
    for (const def of GAME_DEFS) {
      for (const bank of def.graphics.banks) {
        expect(bank.files.length, `${def.name} bank at ${bank.offset}`).toBeGreaterThan(0);
      }
    }
  });

  it('GFX bank offsets + data fit within graphics.size', () => {
    for (const def of GAME_DEFS) {
      for (const bank of def.graphics.banks) {
        const multiplier = bank.files.length === 8 ? 8 : 4;
        const interleaved = (bank.romSize / (bank.files.length === 8 ? 1 : 2)) * multiplier;
        expect(bank.offset + interleaved, `${def.name} bank@${bank.offset}`).toBeLessThanOrEqual(def.graphics.size);
      }
    }
  });

  it('every GameDef has audio files', () => {
    for (const def of GAME_DEFS) {
      expect(def.audio.files.length, def.name).toBeGreaterThan(0);
      expect(def.audio.size, def.name).toBeGreaterThan(0);
    }
  });

  it('every GameDef has OKI config defined', () => {
    for (const def of GAME_DEFS) {
      expect(def.oki, def.name).toBeDefined();
      expect(def.oki.files, def.name).toBeDefined();
      // Some early CPS1 games (ghouls) and QSound games have no OKI chip
      expect(def.oki.size, def.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('every GameDef has a valid CPS-B config', () => {
    for (const def of GAME_DEFS) {
      const cfg = def.cpsBConfig;
      expect(cfg.priority.length, def.name).toBe(4);
      expect(cfg.layerEnableMask.length, def.name).toBe(5);
      // Register offsets should be even (word-aligned) or -1 (unused sentinel)
      if (cfg.layerControl !== -1) {
        expect(cfg.layerControl % 2, `${def.name} layerControl`).toBe(0);
      }
      if (cfg.paletteControl !== -1) {
        expect(cfg.paletteControl % 2, `${def.name} paletteControl`).toBe(0);
      }
      for (const p of cfg.priority) {
        if (p !== -1) {
          expect(p % 2, `${def.name} priority`).toBe(0);
        }
      }
    }
  });

  it('every GameDef has a valid gfxMapper with 4 bankSizes', () => {
    for (const def of GAME_DEFS) {
      expect(def.gfxMapper.bankSizes.length, def.name).toBe(4);
      for (const size of def.gfxMapper.bankSizes) {
        expect(size, `${def.name} bankSize`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gfxMapper ranges reference valid bank indices (0-3)', () => {
    for (const def of GAME_DEFS) {
      for (const range of def.gfxMapper.ranges) {
        expect(range.bank, `${def.name} range bank`).toBeGreaterThanOrEqual(0);
        expect(range.bank, `${def.name} range bank`).toBeLessThanOrEqual(3);
        expect(range.start, `${def.name} range`).toBeLessThanOrEqual(range.end);
      }
    }
  });

  it('CPS-B idValue is a 16-bit value or -1 (unused)', () => {
    for (const def of GAME_DEFS) {
      const val = def.cpsBConfig.idValue;
      expect(val === -1 || (val >= 0 && val <= 0xFFFF), `${def.name}: ${val}`).toBe(true);
    }
  });
});
