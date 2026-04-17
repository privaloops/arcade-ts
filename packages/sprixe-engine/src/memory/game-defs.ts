/**
 * CPS1 Game ROM Definitions
 *
 * Static database of ROM layouts — auto-generated from MAME 0.286.
 * Source: mamedev/mame src/mame/capcom/cps1.cpp + cps1_v.cpp
 */

/** GFX ROM bank mapper configuration (varies per board PAL) */
export interface GfxMapperConfig {
  bankSizes: [number, number, number, number];
  ranges: { type: number; start: number; end: number; bank: number }[];
}

/** CPS-B chip configuration (varies per game/board revision) */
export interface CpsBConfig {
  idOffset: number;
  idValue: number;
  layerControl: number;
  priority: [number, number, number, number];
  paletteControl: number;
  layerEnableMask: [number, number, number, number, number];
  spriteCodeOffset?: number;
}

interface RomRegionDef {
  files: string[];
  size: number;
}

export interface ProgramRomEntry {
  even: string;
  odd: string;
  offset: number;
  size: number;
}

export interface ProgramWordSwapEntry {
  file: string;
  offset: number;
  size: number;
}

export interface ProgramDef {
  entries: ProgramRomEntry[];
  wordSwapEntries?: ProgramWordSwapEntry[];
  size: number;
}

export interface GfxBankDef {
  files: string[];
  offset: number;
  romSize: number;
}

export interface GraphicsDef {
  banks: GfxBankDef[];
  size: number;
}

export interface GameDef {
  name: string;
  program: ProgramDef;
  graphics: GraphicsDef;
  audio: RomRegionDef;
  oki: RomRegionDef;
  cpsBConfig: CpsBConfig;
  gfxMapper: GfxMapperConfig;
  qsound?: boolean;
}

export const GAME_DEFS: GameDef[] = [
  // Street Fighter II: The World Warrior
  {
    name: 'sf2',
    program: {
      entries: [
        { even: 'sf2e_30g.11e', odd: 'sf2e_37g.11f', offset: 0x00000, size: 0x20000 },
        { even: 'sf2e_31g.12e', odd: 'sf2e_38g.12f', offset: 0x40000, size: 0x20000 },
        { even: 'sf2e_28g.9e',  odd: 'sf2e_35g.9f',  offset: 0x80000, size: 0x20000 },
        { even: 'sf2_29b.10e',  odd: 'sf2_36b.10f',  offset: 0xc0000, size: 0x20000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        {
          // ROM_LOAD64_WORD offsets 0x000000, 0x000002, 0x000004, 0x000006
          files: ['sf2-5m.4a', 'sf2-7m.6a', 'sf2-1m.3a', 'sf2-3m.5a'],
          offset: 0x000000,
          romSize: 0x80000,
        },
        {
          // ROM_LOAD64_WORD offsets 0x200000, 0x200002, 0x200004, 0x200006
          files: ['sf2-6m.4c', 'sf2-8m.6c', 'sf2-2m.3c', 'sf2-4m.5c'],
          offset: 0x200000,
          romSize: 0x80000,
        },
        {
          // ROM_LOAD64_WORD offsets 0x400000, 0x400002, 0x400004, 0x400006
          files: ['sf2-13m.4d', 'sf2-15m.6d', 'sf2-9m.3d', 'sf2-11m.5d'],
          offset: 0x400000,
          romSize: 0x80000,
        },
      ],
      size: 0x600000,
    },
    audio: {
      files: ['sf2_9.12a'],
      size: 0x18000,
    },
    oki: {
      files: ['sf2_18.11c', 'sf2_19.12c'],
      size: 0x40000,
    },
    cpsBConfig: {
      idOffset: 0x32, idValue: 0x0401,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x08, 0x10, 0x20, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 1, start: 0x08000, end: 0x0ffff, bank: 1 },
        { type: 1, start: 0x10000, end: 0x11fff, bank: 2 },
        { type: 8, start: 0x02000, end: 0x03fff, bank: 2 },
        { type: 2, start: 0x04000, end: 0x04fff, bank: 2 },
        { type: 4, start: 0x05000, end: 0x07fff, bank: 2 },
      ],
    },
  },

  // Final Fight
  // Source: MAME cps1.cpp ROM_START(ffight)
  {
    name: 'ffight',
    program: {
      entries: [
        { even: 'ff_36.11f',  odd: 'ff_42.11h',  offset: 0x00000, size: 0x20000 },
        { even: 'ff_37.12f',  odd: 'ffe_43.12h',  offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'ff-32m.8h', offset: 0x80000, size: 0x80000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        {
          files: ['ff-5m.7a', 'ff-7m.9a', 'ff-1m.3a', 'ff-3m.5a'],
          offset: 0x000000,
          romSize: 0x80000,
        },
      ],
      size: 0x200000,
    },
    audio: {
      files: ['ff_09.12b'],
      size: 0x18000,
    },
    oki: {
      files: ['ff_18.11c', 'ff_19.12c'],
      size: 0x40000,
    },
    cpsBConfig: {
      idOffset: 0x20, idValue: 0x0004,
      layerControl: 0x2e,
      priority: [0x26, 0x30, 0x28, 0x32],
      paletteControl: 0x2a,
      layerEnableMask: [0x02, 0x04, 0x08, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x0000, end: 0x43ff, bank: 0 },
        { type: 2, start: 0x4400, end: 0x4bff, bank: 0 },
        { type: 8, start: 0x4c00, end: 0x5fff, bank: 0 },
        { type: 4, start: 0x6000, end: 0x7fff, bank: 0 },
      ],
    },
  },

  // 1941
  {
    name: '1941',
    program: {
      entries: [
        { even: '41em_30.11f', odd: '41em_35.11h', offset: 0x00000, size: 0x20000 },
        { even: '41em_31.12f', odd: '41em_36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: '41-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['41-5m.7a', '41-7m.9a', '41-1m.3a', '41-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['41_9.12b'], size: 0x18000 },
    oki: { files: ['41_18.11c', '41_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x20, idValue: 0x0005,
      layerControl: 0x28,
      priority: [0x2a, 0x2c, 0x2e, 0x30],
      paletteControl: 0x32,
      layerEnableMask: [0x02, 0x08, 0x20, 0x14, 0x14],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x01fff, bank: 0 },
        { type: 8, start: 0x02000, end: 0x03fff, bank: 0 },
        { type: 2, start: 0x04000, end: 0x047ff, bank: 0 },
        { type: 4, start: 0x04800, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // 3wonders
  {
    name: '3wonders',
    program: {
      entries: [
        { even: 'rte_30a.11f', odd: 'rte_35a.11h', offset: 0x00000, size: 0x20000 },
        { even: 'rte_31a.12f', odd: 'rte_36a.12h', offset: 0x40000, size: 0x20000 },
        { even: 'rt_28a.9f', odd: 'rt_33a.9h', offset: 0x80000, size: 0x20000 },
        { even: 'rte_29a.10f', odd: 'rte_34a.10h', offset: 0xc0000, size: 0x20000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['rt-5m.7a', 'rt-7m.9a', 'rt-1m.3a', 'rt-3m.5a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['rt-6m.8a', 'rt-8m.10a', 'rt-2m.4a', 'rt-4m.6a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['rt_9.12b'], size: 0x18000 },
    oki: { files: ['rt_18.11c', 'rt_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: 0x0800,
      layerControl: 0x28,
      priority: [0x26, 0x24, 0x22, 0x20],
      paletteControl: 0x30,
      layerEnableMask: [0x20, 0x04, 0x08, 0x12, 0x12],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x053ff, bank: 0 },
        { type: 2, start: 0x05400, end: 0x06fff, bank: 0 },
        { type: 8, start: 0x07000, end: 0x07fff, bank: 0 },
        { type: 8, start: 0x00000, end: 0x03fff, bank: 1 },
        { type: 4, start: 0x02800, end: 0x07fff, bank: 1 },
        { type: 1, start: 0x05400, end: 0x07fff, bank: 1 },
      ],
    },
  },

  // captcomm
  {
    name: 'captcomm',
    program: {
      entries: [
        { even: 'cc_24f.9e', odd: 'cc_28f.9f', offset: 0x100000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'cce_23f.8f', offset: 0x00000, size: 0x080000 },
        { file: 'cc_22f.7f', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['cc-5m.3a', 'cc-7m.5a', 'cc-1m.4a', 'cc-3m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['cc-6m.7a', 'cc-8m.9a', 'cc-2m.8a', 'cc-4m.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['cc_09.11a'], size: 0x18000 },
    oki: { files: ['cc_18.11c', 'cc_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x20,
      priority: [0x2e, 0x2c, 0x2a, 0x28],
      paletteControl: 0x30,
      layerEnableMask: [0x20, 0x12, 0x12, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 1, start: 0x08000, end: 0x0ffff, bank: 1 },
        { type: 2, start: 0x08000, end: 0x0ffff, bank: 1 },
        { type: 4, start: 0x08000, end: 0x0ffff, bank: 1 },
        { type: 8, start: 0x08000, end: 0x0ffff, bank: 1 },
      ],
    },
  },

  // cawing
  {
    name: 'cawing',
    program: {
      entries: [
        { even: 'cae_30a.11f', odd: 'cae_35a.11h', offset: 0x00000, size: 0x20000 },
        { even: 'cae_31a.12f', odd: 'cae_36a.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'ca-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['ca-5m.7a', 'ca-7m.9a', 'ca-1m.3a', 'ca-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['ca_9.12b'], size: 0x18000 },
    oki: { files: ['ca_18.11c', 'ca_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x00, idValue: 0x0406,
      layerControl: 0x0c,
      priority: [0x0a, 0x08, 0x06, 0x04],
      paletteControl: 0x02,
      layerEnableMask: [0x10, 0x0a, 0x0a, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x02fff, bank: 0 },
        { type: 4, start: 0x00000, end: 0x02fff, bank: 0 },
        { type: 8, start: 0x03000, end: 0x04fff, bank: 0 },
        { type: 2, start: 0x05000, end: 0x057ff, bank: 0 },
        { type: 1, start: 0x05800, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x05800, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // cworld2j
  {
    name: 'cworld2j',
    program: {
      entries: [
        { even: 'q5_36.12f', odd: 'q5_42.12h', offset: 0x00000, size: 0x20000 },
        { even: 'q5_37.13f', odd: 'q5_43.13h', offset: 0x40000, size: 0x20000 },
        { even: 'q5_34.10f', odd: 'q5_40.10h', offset: 0x80000, size: 0x20000 },
        { even: 'q5_35.11f', odd: 'q5_41.11h', offset: 0xc0000, size: 0x20000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['q5_09.4b', 'q5_01.4a', 'q5_13.9b', 'q5_05.9a', 'q5_24.5e', 'q5_17.5c', 'q5_38.8h', 'q5_32.8f'], offset: 0x000000, romSize: 0x20000 },
        { files: ['q5_10.5b', 'q5_02.5a', 'q5_14.10b', 'q5_06.10a', 'q5_25.7e', 'q5_18.7c', 'q5_39.9h', 'q5_33.9f'], offset: 0x100000, romSize: 0x20000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['q5_23.13b'], size: 0x18000 },
    oki: { files: ['q5_30.12c', 'q5_31.13c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x20,
      priority: [0x2e, 0x2c, 0x2a, 0x28],
      paletteControl: 0x30,
      layerEnableMask: [0x20, 0x14, 0x14, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x4000, 0x4000, 0, 0],
      ranges: [
        { type: 8, start: 0x07000, end: 0x077ff, bank: 1 },
        { type: 2, start: 0x07800, end: 0x07fff, bank: 1 },
      ],
    },
  },

  // dino
  {
    name: 'dino',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'cde_23a.8f', offset: 0x00000, size: 0x080000 },
        { file: 'cde_22a.7f', offset: 0x80000, size: 0x080000 },
        { file: 'cde_21a.6f', offset: 0x100000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['cd-1m.3a', 'cd-3m.5a', 'cd-2m.4a', 'cd-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['cd-5m.7a', 'cd-7m.9a', 'cd-6m.8a', 'cd-8m.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['cd_q.5k'], size: 0x20000 },
    oki: { files: ['cd-q1.1k', 'cd-q2.2k', 'cd-q3.3k', 'cd-q4.4k'], size: 0x200000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x0a,
      priority: [0x0c, 0x0e, 0x00, 0x02],
      paletteControl: 0x04,
      layerEnableMask: [0x16, 0x16, 0x16, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [],
    },
  },

  // dynwar
  {
    name: 'dynwar',
    program: {
      entries: [
        { even: '30.11f', odd: '35.11h', offset: 0x00000, size: 0x20000 },
        { even: '31.12f', odd: '36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'tkm-9.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['tkm-5.7a', 'tkm-8.9a', 'tkm-6.3a', 'tkm-7.5a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['tkm-1.8a', 'tkm-4.10a', 'tkm-2.4a', 'tkm-3.6a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['tke_17.12b'], size: 0x18000 },
    oki: { files: ['tke_18.11c', 'tke_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x20, idValue: 0x0002,
      layerControl: 0x2c,
      priority: [0x2a, 0x28, 0x26, 0x24],
      paletteControl: 0x22,
      layerEnableMask: [0x02, 0x04, 0x08, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x05fff, bank: 0 },
        { type: 2, start: 0x06000, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x04000, end: 0x07fff, bank: 1 },
        { type: 8, start: 0x00000, end: 0x03fff, bank: 1 },
      ],
    },
  },

  // forgottn
  {
    name: 'forgottn',
    program: {
      entries: [
        { even: 'lw40.12f', odd: 'lw41.12h', offset: 0x00000, size: 0x20000 },
        { even: 'lw42.13f', odd: 'lw43.13h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'lw-07.10g', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['lw_2.2b', 'lw_1.2a'], offset: 0x000000, romSize: 0x20000 },
        { files: ['lw-08.9b'], offset: 0x000002, romSize: 0x80000 },
        { files: ['lw_18.5e', 'lw_17.5c', 'lw_30.8h', 'lw_29.8f'], offset: 0x000004, romSize: 0x20000 },
        { files: ['lw_4.3b', 'lw_3.3a'], offset: 0x100000, romSize: 0x20000 },
        { files: ['lw_20.7e', 'lw_19.7c', 'lw_32.9h', 'lw_31.9f'], offset: 0x100004, romSize: 0x20000 },
        { files: ['lw-02.6b'], offset: 0x200000, romSize: 0x80000 },
        { files: ['lw_14.10b', 'lw_13.10a'], offset: 0x200002, romSize: 0x20000 },
        { files: ['lw-06.9d'], offset: 0x200004, romSize: 0x80000 },
        { files: ['lw_26.10e', 'lw_25.10c'], offset: 0x200006, romSize: 0x20000 },
        { files: ['lw_16.11b', 'lw_15.11a'], offset: 0x300002, romSize: 0x20000 },
        { files: ['lw_28.11e', 'lw_27.11c'], offset: 0x300006, romSize: 0x20000 },
      ],
      size: 0x380006,
    },
    audio: { files: ['lw_37.13c'], size: 0x18000 },
    oki: { files: ['lw-03u.12e', 'lw-04u.13e'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 2, start: 0x00000, end: 0x1ffff, bank: 0 },
        { type: 0, start: 0x00000, end: 0x1ffff, bank: 1 },
        { type: 4, start: 0x00000, end: 0x1ffff, bank: 1 },
        { type: 8, start: 0x00000, end: 0x1ffff, bank: 1 },
      ],
    },
  },

  // ganbare
  {
    name: 'ganbare',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'mrnj_23d.8f', offset: 0x00000, size: 0x080000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['mrnj_01.3a', 'mrnj_02.4a', 'mrnj_03.5a', 'mrnj_04.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['mrnj_05.7a', 'mrnj_06.8a', 'mrnj_07.9a', 'mrnj_08.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['mrnj_09.12a'], size: 0x18000 },
    oki: { files: ['mrnj_18.11c', 'mrnj_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 2, start: 0x04000, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x08000, end: 0x0bfff, bank: 1 },
        { type: 8, start: 0x0c000, end: 0x0ffff, bank: 1 },
      ],
    },
  },

  // ghouls
  {
    name: 'ghouls',
    program: {
      entries: [
        { even: 'dme_29.10h', odd: 'dme_30.10j', offset: 0x00000, size: 0x20000 },
        { even: 'dme_27.9h', odd: 'dme_28.9j', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'dm-17.7j', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['dm-05.3a', 'dm-07.3f', 'dm-06.3c', 'dm-08.3g'], offset: 0x000000, romSize: 0x80000 },
        { files: ['09.4a', '18.7a', '13.4e', '22.7e', '11.4c', '20.7c', '15.4g', '24.7g'], offset: 0x200000, romSize: 0x10000 },
        { files: ['10.4b', '19.7b', '14.4f', '23.7f', '12.4d', '21.7d', '16.4h', '25.7h'], offset: 0x280000, romSize: 0x10000 },
      ],
      size: 0x300000,
    },
    audio: { files: ['26.10a'], size: 0x18000 },
    oki: { files: [], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
      spriteCodeOffset: 0x4000,
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x2000, 0x2000, 0],
      ranges: [
        { type: 8, start: 0x08000, end: 0x0bfff, bank: 1 },
        { type: 1, start: 0x02000, end: 0x03fff, bank: 2 },
      ],
    },
  },

  // gulunpa
  {
    name: 'gulunpa',
    program: {
      entries: [
        { even: '26', odd: '30', offset: 0x00000, size: 0x20000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['1', '2', '3', '4'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['9'], size: 0x18000 },
    oki: { files: ['18', '19'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 2, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 8, start: 0x04000, end: 0x05fff, bank: 0 },
        { type: 4, start: 0x02000, end: 0x03fff, bank: 0 },
        { type: 1, start: 0x06000, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // knights
  {
    name: 'knights',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'kr_23e.8f', offset: 0x00000, size: 0x080000 },
        { file: 'kr_22.7f', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['kr-5m.3a', 'kr-7m.5a', 'kr-1m.4a', 'kr-3m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['kr-6m.7a', 'kr-8m.9a', 'kr-2m.8a', 'kr-4m.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['kr_09.11a'], size: 0x18000 },
    oki: { files: ['kr_18.11c', 'kr_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x28,
      priority: [0x26, 0x24, 0x22, 0x20],
      paletteControl: 0x30,
      layerEnableMask: [0x20, 0x10, 0x02, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 2, start: 0x08000, end: 0x09fff, bank: 1 },
        { type: 1, start: 0x08000, end: 0x0cfff, bank: 1 },
        { type: 4, start: 0x08000, end: 0x0cfff, bank: 1 },
        { type: 8, start: 0x0d000, end: 0x0ffff, bank: 1 },
      ],
    },
  },

  // kod
  {
    name: 'kod',
    program: {
      entries: [
        { even: 'kde_30a.11e', odd: 'kde_37a.11f', offset: 0x00000, size: 0x20000 },
        { even: 'kde_31a.12e', odd: 'kde_38a.12f', offset: 0x40000, size: 0x20000 },
        { even: 'kd_28.9e', odd: 'kd_35.9f', offset: 0x80000, size: 0x20000 },
        { even: 'kd_29.10e', odd: 'kd_36a.10f', offset: 0xc0000, size: 0x20000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['kd-5m.4a', 'kd-7m.6a', 'kd-1m.3a', 'kd-3m.5a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['kd-6m.4c', 'kd-8m.6c', 'kd-2m.3c', 'kd-4m.5c'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['kd_9.12a'], size: 0x18000 },
    oki: { files: ['kd_18.11c', 'kd_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x20,
      priority: [0x2e, 0x2c, 0x2a, 0x28],
      paletteControl: 0x30,
      layerEnableMask: [0x30, 0x08, 0x30, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 1, start: 0x08000, end: 0x08fff, bank: 1 },
        { type: 4, start: 0x09000, end: 0x0bfff, bank: 1 },
        { type: 2, start: 0x0c000, end: 0x0d7ff, bank: 1 },
        { type: 8, start: 0x0d800, end: 0x0ffff, bank: 1 },
      ],
    },
  },

  // mbombrd
  {
    name: 'mbombrd',
    program: {
      entries: [
        { even: 'mbde_26.11e', odd: 'mbde_30.11f', offset: 0x00000, size: 0x20000 },
        { even: 'mbde_27.12e', odd: 'mbde_31.12f', offset: 0x40000, size: 0x20000 },
        { even: 'mbde_24.9e', odd: 'mbde_28.9f', offset: 0x80000, size: 0x20000 },
        { even: 'mbde_25.10e', odd: 'mbde_29.10f', offset: 0xc0000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'mbde_21.6f', offset: 0x100000, size: 0x080000 },
        { file: 'mbde_20.5f', offset: 0x180000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['mb-1m.3a', 'mb-3m.5a', 'mb-2m.4a', 'mb-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['mb-5m.7a', 'mb-7m.9a', 'mb-6m.8a', 'mb-8m.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['mb-10m.3c', 'mb-12m.5c', 'mb-11m.4c', 'mb-13m.6c'], offset: 0x400000, romSize: 0x80000 },
      ],
      size: 0x600000,
    },
    audio: { files: ['mb_q.5k'], size: 0x20000 },
    oki: { files: ['mb-q1.1k', 'mb-q2.2k', 'mb-q3.3k', 'mb-q4.4k', 'mb-q5.1m', 'mb-q6.2m', 'mb-q7.3m', 'mb-q8.4m'], size: 0x400000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: 0x1e, idValue: 0x0c02,
      layerControl: 0x2a,
      priority: [0x2c, 0x2e, 0x30, 0x32],
      paletteControl: 0x1c,
      layerEnableMask: [0x04, 0x08, 0x10, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [],
    },
  },

  // mbomberj
  {
    name: 'mbomberj',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'mbj_23e.8f', offset: 0x00000, size: 0x080000 },
        { file: 'mbj_22b.7f', offset: 0x80000, size: 0x080000 },
        { file: 'mbj_21a.6f', offset: 0x100000, size: 0x080000 },
        { file: 'mbj_20a.5f', offset: 0x180000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['mb_01.3a', 'mb_02.4a', 'mb_03.5a', 'mb_04.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['mb_05.7a', 'mb_06.8a', 'mb_07.9a', 'mb_08.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['mb_10.3c', 'mb_11.4c', 'mb_12.5c', 'mb_13.6c'], offset: 0x400000, romSize: 0x80000 },
      ],
      size: 0x600000,
    },
    audio: { files: ['mb_qa.5k'], size: 0x20000 },
    oki: { files: ['mb-q1.1k', 'mb-q2.2k', 'mb-q3.3k', 'mb-q4.4k', 'mb-q5.1m', 'mb-q6.2m', 'mb-q7.3m', 'mb-q8.4m'], size: 0x400000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: 0x2e, idValue: 0x0c01,
      layerControl: 0x16,
      priority: [0x00, 0x02, 0x28, 0x2a],
      paletteControl: 0x2c,
      layerEnableMask: [0x04, 0x08, 0x10, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [],
    },
  },

  // megaman
  {
    name: 'megaman',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'rcmu_23b.8f', offset: 0x00000, size: 0x080000 },
        { file: 'rcmu_22b.7f', offset: 0x80000, size: 0x080000 },
        { file: 'rcmu_21a.6f', offset: 0x100000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['rcm_01.3a', 'rcm_02.4a', 'rcm_03.5a', 'rcm_04.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['rcm_05.7a', 'rcm_06.8a', 'rcm_07.9a', 'rcm_08.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['rcm_10.3c', 'rcm_11.4c', 'rcm_12.5c', 'rcm_13.6c'], offset: 0x400000, romSize: 0x80000 },
        { files: ['rcm_14.7c', 'rcm_15.8c', 'rcm_16.9c', 'rcm_17.10c'], offset: 0x600000, romSize: 0x80000 },
      ],
      size: 0x800000,
    },
    audio: { files: ['rcm_09.11a'], size: 0x18000 },
    oki: { files: ['rcm_18.11c', 'rcm_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0x8000],
      ranges: [],
    },
  },

  // mercs
  {
    name: 'mercs',
    program: {
      entries: [
        { even: 'so2_30e.11f', odd: 'so2_35e.11h', offset: 0x00000, size: 0x20000 },
        { even: 'so2_31e.12f', odd: 'so2_36e.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'so2-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['so2-6m.8a', 'so2-8m.10a', 'so2-2m.4a', 'so2-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['so2_24.7d', 'so2_14.7c', 'so2_26.9d', 'so2_16.9c', 'so2_20.3d', 'so2_10.3c', 'so2_22.5d', 'so2_12.5c'], offset: 0x200000, romSize: 0x20000 },
      ],
      size: 0x300000,
    },
    audio: { files: ['so2_09.12b'], size: 0x18000 },
    oki: { files: ['so2_18.11c', 'so2_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x20, idValue: 0x0402,
      layerControl: 0x2c,
      priority: [0x2a, 0x28, 0x26, 0x24],
      paletteControl: 0x22,
      layerEnableMask: [0x02, 0x04, 0x08, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x4000, 0, 0],
      ranges: [
        { type: 2, start: 0x00000, end: 0x00bff, bank: 0 },
        { type: 4, start: 0x00c00, end: 0x03bff, bank: 0 },
        { type: 8, start: 0x03c00, end: 0x04bff, bank: 0 },
        { type: 1, start: 0x04c00, end: 0x07fff, bank: 0 },
        { type: 1, start: 0x08000, end: 0x0a7ff, bank: 1 },
        { type: 4, start: 0x0a800, end: 0x0b7ff, bank: 1 },
        { type: 8, start: 0x0b800, end: 0x0bfff, bank: 1 },
      ],
    },
  },

  // mpumpkin
  {
    name: 'mpumpkin',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'mpa_23.8f', offset: 0x00000, size: 0x080000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['mpa_01.3a', 'mpa_02.4a', 'mpa_03.5a', 'mpa_04.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['mpa_05.7a', 'mpa_06.8a', 'mpa_07.9a', 'mpa_08.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['mpa_10.3c', 'mpa_11.4c', 'mpa_12.5c', 'mpa_13.6c'], offset: 0x400000, romSize: 0x80000 },
      ],
      size: 0x600000,
    },
    audio: { files: ['mpa_09.12a'], size: 0x18000 },
    oki: { files: ['mpa_18.11c', 'mpa_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0x8000],
      ranges: [],
    },
  },

  // msword
  {
    name: 'msword',
    program: {
      entries: [
        { even: 'mse_30.11f', odd: 'mse_35.11h', offset: 0x00000, size: 0x20000 },
        { even: 'mse_31.12f', odd: 'mse_36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'ms-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['ms-5m.7a', 'ms-7m.9a', 'ms-1m.3a', 'ms-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['ms_09.12b'], size: 0x18000 },
    oki: { files: ['ms_18.11c', 'ms_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x2e, idValue: 0x0403,
      layerControl: 0x22,
      priority: [0x24, 0x26, 0x28, 0x2a],
      paletteControl: 0x2c,
      layerEnableMask: [0x20, 0x02, 0x04, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 2, start: 0x04000, end: 0x04fff, bank: 0 },
        { type: 4, start: 0x05000, end: 0x06fff, bank: 0 },
        { type: 8, start: 0x07000, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // mtwins
  {
    name: 'mtwins',
    program: {
      entries: [
        { even: 'che_30.11f', odd: 'che_35.11h', offset: 0x00000, size: 0x20000 },
        { even: 'che_31.12f', odd: 'che_36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'ck-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['ck-5m.7a', 'ck-7m.9a', 'ck-1m.3a', 'ck-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['ch_09.12b'], size: 0x18000 },
    oki: { files: ['ch_18.11c', 'ch_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x1e, idValue: 0x0404,
      layerControl: 0x12,
      priority: [0x14, 0x16, 0x18, 0x1a],
      paletteControl: 0x1c,
      layerEnableMask: [0x08, 0x20, 0x10, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x02fff, bank: 0 },
        { type: 2, start: 0x03000, end: 0x03fff, bank: 0 },
        { type: 4, start: 0x04000, end: 0x06fff, bank: 0 },
        { type: 8, start: 0x07000, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // nemo
  {
    name: 'nemo',
    program: {
      entries: [
        { even: 'nme_30a.11f', odd: 'nme_35a.11h', offset: 0x00000, size: 0x20000 },
        { even: 'nme_31a.12f', odd: 'nme_36a.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'nm-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['nm-5m.7a', 'nm-7m.9a', 'nm-1m.3a', 'nm-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['nme_09.12b'], size: 0x18000 },
    oki: { files: ['nme_18.11c', 'nme_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x0e, idValue: 0x0405,
      layerControl: 0x02,
      priority: [0x04, 0x06, 0x08, 0x0a],
      paletteControl: 0x0c,
      layerEnableMask: [0x04, 0x02, 0x20, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 4, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 2, start: 0x04000, end: 0x047ff, bank: 0 },
        { type: 1, start: 0x04800, end: 0x067ff, bank: 0 },
        { type: 4, start: 0x04800, end: 0x067ff, bank: 0 },
        { type: 8, start: 0x06800, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // pang3
  {
    name: 'pang3',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'pa3e_17a.11l', offset: 0x00000, size: 0x080000 },
        { file: 'pa3e_16a.10l', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['pa3-01m.2c', 'pa3-07m.2f'], offset: 0x000000, romSize: 0x200000 },
      ],
      size: 0x800000,
    },
    audio: { files: ['pa3_11.11f'], size: 0x20000 },
    oki: { files: ['pa3_05.10d', 'pa3_06.11d'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x10000, 0, 0, 0],
      ranges: [],
    },
  },

  // pmonster
  {
    name: 'pmonster',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'gbpj_23a.8f', offset: 0x00000, size: 0x080000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['gbpj_01.3a', 'gbpj_02.4a', 'gbpj_03.5a', 'gbpj_04.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['gbpj_05.7a', 'gbpj_06.8a', 'gbpj_07.9a', 'gbpj_08.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['gbpj_09.12a'], size: 0x18000 },
    oki: { files: ['gbpj_18.11c', 'gbpj_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 2, start: 0x04000, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x08000, end: 0x0bfff, bank: 1 },
        { type: 8, start: 0x0c000, end: 0x0ffff, bank: 1 },
      ],
    },
  },

  // pnickj
  {
    name: 'pnickj',
    program: {
      entries: [
        { even: 'pnij_36.12f', odd: 'pnij_42.12h', offset: 0x00000, size: 0x20000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['pnij_09.4b', 'pnij_01.4a', 'pnij_13.9b', 'pnij_05.9a', 'pnij_26.5e', 'pnij_18.5c', 'pnij_38.8h', 'pnij_32.8f'], offset: 0x000000, romSize: 0x20000 },
        { files: ['pnij_10.5b', 'pnij_02.5a', 'pnij_14.10b', 'pnij_06.10a', 'pnij_27.7e', 'pnij_19.7c', 'pnij_39.9h', 'pnij_33.9f'], offset: 0x100000, romSize: 0x20000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['pnij_17.13b'], size: 0x18000 },
    oki: { files: ['pnij_24.12c', 'pnij_25.13c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 2, start: 0x00000, end: 0x00fff, bank: 0 },
        { type: 8, start: 0x06000, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // pokonyan
  {
    name: 'pokonyan',
    program: {
      entries: [
        { even: 'xmqq-12f.bin', odd: 'xmqq-12h.bin', offset: 0x00000, size: 0x20000 },
        { even: 'xmqq-13f.bin', odd: 'xmqq-13h.bin', offset: 0x40000, size: 0x20000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['xmqq-4b.bin', 'xmqq-4a.bin', 'xmqq-9b.bin', 'xmqq-9a.bin', 'xmqq-5e.bin', 'xmqq-5c.bin', 'xmqq-8h.bin', 'xmqq-8f.bin'], offset: 0x000000, romSize: 0x20000 },
        { files: ['xmqq-5b.bin', 'xmqq-5a.bin', 'xmqq-10b.bin', 'xmqq-10a.bin', 'xmqq-7e.bin', 'xmqq-7c.bin', 'xmqq-9h.bin', 'xmqq-9f.bin'], offset: 0x100000, romSize: 0x20000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['xmqq-13b.bin'], size: 0x18000 },
    oki: { files: ['xmqq-12c.bin', 'xmqq-13c.bin'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x02fff, bank: 0 },
        { type: 2, start: 0x07000, end: 0x07fff, bank: 0 },
        { type: 8, start: 0x03000, end: 0x03fff, bank: 0 },
        { type: 4, start: 0x04000, end: 0x06fff, bank: 0 },
      ],
    },
  },

  // punisher
  {
    name: 'punisher',
    program: {
      entries: [
        { even: 'pse_26.11e', odd: 'pse_30.11f', offset: 0x00000, size: 0x20000 },
        { even: 'pse_27.12e', odd: 'pse_31.12f', offset: 0x40000, size: 0x20000 },
        { even: 'pse_24.9e', odd: 'pse_28.9f', offset: 0x80000, size: 0x20000 },
        { even: 'pse_25.10e', odd: 'pse_29.10f', offset: 0xc0000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'ps_21.6f', offset: 0x100000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['ps-1m.3a', 'ps-3m.5a', 'ps-2m.4a', 'ps-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['ps-5m.7a', 'ps-7m.9a', 'ps-6m.8a', 'ps-8m.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['ps_q.5k'], size: 0x20000 },
    oki: { files: ['ps-q1.1k', 'ps-q2.2k', 'ps-q3.3k', 'ps-q4.4k'], size: 0x200000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: 0x0e, idValue: 0x0c00,
      layerControl: 0x12,
      priority: [0x14, 0x16, 0x08, 0x0a],
      paletteControl: 0x0c,
      layerEnableMask: [0x04, 0x02, 0x20, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [],
    },
  },

  // qad
  {
    name: 'qad',
    program: {
      entries: [
        { even: 'qdu_36a.12f', odd: 'qdu_42a.12h', offset: 0x00000, size: 0x20000 },
        { even: 'qdu_37a.13f', odd: 'qdu_43a.13h', offset: 0x40000, size: 0x20000 },
      ],
      size: 0x080000,
    },
    graphics: {
      banks: [
        { files: ['qd_09.4b', 'qd_01.4a', 'qd_13.9b', 'qd_05.9a', 'qd_24.5e', 'qd_17.5c', 'qd_38.8h', 'qd_32.8f'], offset: 0x000000, romSize: 0x20000 },
      ],
      size: 0x100000,
    },
    audio: { files: ['qd_23.13b'], size: 0x18000 },
    oki: { files: ['qdu_30.12c', 'qdu_31.13c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x2c,
      priority: [-1, -1, -1, -1],
      paletteControl: 0x12,
      layerEnableMask: [0x14, 0x02, 0x14, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x4000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 2, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 4, start: 0x00000, end: 0x03fff, bank: 0 },
        { type: 8, start: 0x00000, end: 0x03fff, bank: 0 },
      ],
    },
  },

  // qadjr
  {
    name: 'qadjr',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'qad_23a.8f', offset: 0x00000, size: 0x080000 },
        { file: 'qad_22a.7f', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['qad_01.3a', 'qad_02.4a', 'qad_03.5a', 'qad_04.6a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['qad_09.12a'], size: 0x18000 },
    oki: { files: ['qad_18.11c', 'qad_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [],
    },
  },

  // qtono2j
  {
    name: 'qtono2j',
    program: {
      entries: [
        { even: 'tn2j_30.11e', odd: 'tn2j_37.11f', offset: 0x00000, size: 0x20000 },
        { even: 'tn2j_31.12e', odd: 'tn2j_38.12f', offset: 0x40000, size: 0x20000 },
        { even: 'tn2j_28.9e', odd: 'tn2j_35.9f', offset: 0x80000, size: 0x20000 },
        { even: 'tn2j_29.10e', odd: 'tn2j_36.10f', offset: 0xc0000, size: 0x20000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['tn2-02m.4a', 'tn2-04m.6a', 'tn2-01m.3a', 'tn2-03m.5a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['tn2-11m.4c', 'tn2-13m.6c', 'tn2-10m.3c', 'tn2-12m.5c'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['tn2j_09.12a'], size: 0x18000 },
    oki: { files: ['tn2j_18.11c', 'tn2j_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [],
    },
  },

  // sf2ce
  {
    name: 'sf2ce',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 's92e_23b.8f', offset: 0x00000, size: 0x080000 },
        { file: 's92_22b.7f', offset: 0x80000, size: 0x080000 },
        { file: 's92_21a.6f', offset: 0x100000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['s92-1m.3a', 's92-3m.5a', 's92-2m.4a', 's92-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['s92-5m.7a', 's92-7m.9a', 's92-6m.8a', 's92-8m.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['s92-10m.3c', 's92-12m.5c', 's92-11m.4c', 's92-13m.6c'], offset: 0x400000, romSize: 0x80000 },
      ],
      size: 0x600000,
    },
    audio: { files: ['s92_09.11a'], size: 0x18000 },
    oki: { files: ['s92_18.11c', 's92_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 1, start: 0x08000, end: 0x0ffff, bank: 1 },
        { type: 1, start: 0x10000, end: 0x11fff, bank: 2 },
        { type: 8, start: 0x02000, end: 0x03fff, bank: 2 },
        { type: 2, start: 0x04000, end: 0x04fff, bank: 2 },
        { type: 4, start: 0x05000, end: 0x07fff, bank: 2 },
      ],
    },
  },

  // sf2hf
  {
    name: 'sf2hf',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 's2te_23.8f', offset: 0x00000, size: 0x080000 },
        { file: 's2te_22.7f', offset: 0x80000, size: 0x080000 },
        { file: 's2te_21.6f', offset: 0x100000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['s92-1m.3a', 's92-3m.5a', 's92-2m.4a', 's92-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['s92-5m.7a', 's92-7m.9a', 's92-6m.8a', 's92-8m.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['s92-10m.3c', 's92-12m.5c', 's92-11m.4c', 's92-13m.6c'], offset: 0x400000, romSize: 0x80000 },
      ],
      size: 0x600000,
    },
    audio: { files: ['s92_09.11a'], size: 0x18000 },
    oki: { files: ['s92_18.11c', 's92_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x07fff, bank: 0 },
        { type: 1, start: 0x08000, end: 0x0ffff, bank: 1 },
        { type: 1, start: 0x10000, end: 0x11fff, bank: 2 },
        { type: 8, start: 0x02000, end: 0x03fff, bank: 2 },
        { type: 2, start: 0x04000, end: 0x04fff, bank: 2 },
        { type: 4, start: 0x05000, end: 0x07fff, bank: 2 },
      ],
    },
  },

  // sfzch
  {
    name: 'sfzch',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'sfzch23', offset: 0x00000, size: 0x080000 },
        { file: 'sfza22', offset: 0x80000, size: 0x080000 },
        { file: 'sfzch21', offset: 0x100000, size: 0x080000 },
        { file: 'sfza20', offset: 0x180000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['sfz_01.3a', 'sfz_02.4a', 'sfz_03.5a', 'sfz_04.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['sfz_05.7a', 'sfz_06.8a', 'sfz_07.9a', 'sfz_08.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['sfz_10.3c', 'sfz_11.4c', 'sfz_12.5c', 'sfz_13.6c'], offset: 0x400000, romSize: 0x80000 },
        { files: ['sfz_14.7c', 'sfz_15.8c', 'sfz_16.9c', 'sfz_17.10c'], offset: 0x600000, romSize: 0x80000 },
      ],
      size: 0x800000,
    },
    audio: { files: ['sfz_09.12a'], size: 0x18000 },
    oki: { files: ['sfz_18.11c', 'sfz_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0x8000],
      ranges: [],
    },
  },

  // slammast
  {
    name: 'slammast',
    program: {
      entries: [
        { even: 'mbe_24b.9e', odd: 'mbe_28b.9f', offset: 0x80000, size: 0x20000 },
        { even: 'mbe_25b.10e', odd: 'mbe_29b.10f', offset: 0xc0000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'mbe_23e.8f', offset: 0x00000, size: 0x080000 },
        { file: 'mbe_21a.6f', offset: 0x100000, size: 0x080000 },
        { file: 'mbe_20a.5f', offset: 0x180000, size: 0x080000 },
      ],
      size: 0x200000,
    },
    graphics: {
      banks: [
        { files: ['mb-1m.3a', 'mb-3m.5a', 'mb-2m.4a', 'mb-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['mb-5m.7a', 'mb-7m.9a', 'mb-6m.8a', 'mb-8m.10a'], offset: 0x200000, romSize: 0x80000 },
        { files: ['mb-10m.3c', 'mb-12m.5c', 'mb-11m.4c', 'mb-13m.6c'], offset: 0x400000, romSize: 0x80000 },
      ],
      size: 0x600000,
    },
    audio: { files: ['mb_qa.5k'], size: 0x20000 },
    oki: { files: ['mb-q1.1k', 'mb-q2.2k', 'mb-q3.3k', 'mb-q4.4k', 'mb-q5.1m', 'mb-q6.2m', 'mb-q7.3m', 'mb-q8.4m'], size: 0x400000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: 0x2e, idValue: 0x0c01,
      layerControl: 0x16,
      priority: [0x00, 0x02, 0x28, 0x2a],
      paletteControl: 0x2c,
      layerEnableMask: [0x04, 0x08, 0x10, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0x8000, 0],
      ranges: [],
    },
  },

  // strider
  {
    name: 'strider',
    program: {
      entries: [
        { even: '30.11f', odd: '35.11h', offset: 0x00000, size: 0x20000 },
        { even: '31.12f', odd: '36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'st-14.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['st-2.8a', 'st-11.10a', 'st-5.4a', 'st-9.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['st-1.7a', 'st-10.9a', 'st-4.3a', 'st-8.5a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['09.12b'], size: 0x18000 },
    oki: { files: ['18.11c', '19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [
        { type: 0, start: 0x00000, end: 0x003ff, bank: 0 },
        { type: 1, start: 0x00000, end: 0x04fff, bank: 0 },
        { type: 4, start: 0x04000, end: 0x07fff, bank: 0 },
        { type: 8, start: 0x00000, end: 0x07fff, bank: 1 },
        { type: 2, start: 0x07000, end: 0x07fff, bank: 1 },
      ],
    },
  },

  // unsquad
  {
    name: 'unsquad',
    program: {
      entries: [
        { even: 'aru_30.11f', odd: 'aru_35.11h', offset: 0x00000, size: 0x20000 },
        { even: 'aru_31.12f', odd: 'aru_36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'ar-32m.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['ar-5m.7a', 'ar-7m.9a', 'ar-1m.3a', 'ar-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['ar_09.12b'], size: 0x18000 },
    oki: { files: ['aru_18.11c'], size: 0x20000 },
    cpsBConfig: {
      idOffset: 0x32, idValue: 0x0401,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x08, 0x10, 0x20, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x02fff, bank: 0 },
        { type: 2, start: 0x03000, end: 0x03fff, bank: 0 },
        { type: 4, start: 0x04000, end: 0x05fff, bank: 0 },
        { type: 8, start: 0x06000, end: 0x07fff, bank: 0 },
      ],
    },
  },

  // varth
  {
    name: 'varth',
    program: {
      entries: [
        { even: 'vae_30b.11f', odd: 'vae_35b.11h', offset: 0x00000, size: 0x20000 },
        { even: 'vae_31b.12f', odd: 'vae_36b.12h', offset: 0x40000, size: 0x20000 },
        { even: 'vae_28b.9f', odd: 'vae_33b.9h', offset: 0x80000, size: 0x20000 },
        { even: 'vae_29b.10f', odd: 'vae_34b.10h', offset: 0xc0000, size: 0x20000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['va-5m.7a', 'va-7m.9a', 'va-1m.3a', 'va-3m.5a'], offset: 0x000000, romSize: 0x80000 },
      ],
      size: 0x200000,
    },
    audio: { files: ['va_09.12b'], size: 0x18000 },
    oki: { files: ['va_18.11c', 'va_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x20, idValue: 0x0004,
      layerControl: 0x2e,
      priority: [0x26, 0x30, 0x28, 0x32],
      paletteControl: 0x2a,
      layerEnableMask: [0x02, 0x04, 0x08, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0, 0, 0],
      ranges: [],
    },
  },

  // willow
  {
    name: 'willow',
    program: {
      entries: [
        { even: 'wle_30.11f', odd: 'wle_35.11h', offset: 0x00000, size: 0x20000 },
        { even: 'wlu_31.12f', odd: 'wlu_36.12h', offset: 0x40000, size: 0x20000 },
      ],
      wordSwapEntries: [
        { file: 'wlm-32.8h', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['wlm-7.7a', 'wlm-5.9a', 'wlm-3.3a', 'wlm-1.5a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['wl_24.7d', 'wl_14.7c', 'wl_26.9d', 'wl_16.9c', 'wl_20.3d', 'wl_10.3c', 'wl_22.5d', 'wl_12.5c'], offset: 0x200000, romSize: 0x20000 },
      ],
      size: 0x300000,
    },
    audio: { files: ['wl_09.12b'], size: 0x18000 },
    oki: { files: ['wl_18.11c', 'wl_19.12c'], size: 0x40000 },
    cpsBConfig: {
      idOffset: 0x24, idValue: 0x0003,
      layerControl: 0x30,
      priority: [0x2e, 0x2c, 0x2a, 0x28],
      paletteControl: 0x26,
      layerEnableMask: [0x20, 0x10, 0x08, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x4000, 0, 0],
      ranges: [
        { type: 1, start: 0x00000, end: 0x04fff, bank: 0 },
        { type: 8, start: 0x05000, end: 0x06fff, bank: 0 },
        { type: 2, start: 0x07000, end: 0x07fff, bank: 0 },
        { type: 4, start: 0x00000, end: 0x03fff, bank: 1 },
      ],
    },
  },

  // wof
  {
    name: 'wof',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'tk2e_23c.8f', offset: 0x00000, size: 0x080000 },
        { file: 'tk2e_22c.7f', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['tk2-1m.3a', 'tk2-3m.5a', 'tk2-2m.4a', 'tk2-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['tk2-5m.7a', 'tk2-7m.9a', 'tk2-6m.8a', 'tk2-8m.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['tk2_qa.5k'], size: 0x20000 },
    oki: { files: ['tk2-q1.1k', 'tk2-q2.2k', 'tk2-q3.3k', 'tk2-q4.4k'], size: 0x200000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: -1, idValue: -1,
      layerControl: 0x22,
      priority: [0x24, 0x26, 0x28, 0x2a],
      paletteControl: 0x2c,
      layerEnableMask: [0x10, 0x08, 0x04, 0x00, 0x00],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [],
    },
  },

  // wofch
  {
    name: 'wofch',
    program: {
      entries: [],
      wordSwapEntries: [
        { file: 'tk2=ch=_23.8f', offset: 0x00000, size: 0x080000 },
        { file: 'tk2=ch=_22.7f', offset: 0x80000, size: 0x080000 },
      ],
      size: 0x100000,
    },
    graphics: {
      banks: [
        { files: ['tk2-1m.3a', 'tk2-3m.5a', 'tk2-2m.4a', 'tk2-4m.6a'], offset: 0x000000, romSize: 0x80000 },
        { files: ['tk2=ch=_05.7a', 'tk2=ch=_06.8a', 'tk2=ch=_07.9a', 'tk2=ch=_08.10a'], offset: 0x200000, romSize: 0x80000 },
      ],
      size: 0x400000,
    },
    audio: { files: ['tk2_qa.5k'], size: 0x20000 },
    oki: { files: ['tk2-q1.1k', 'tk2-q2.2k', 'tk2-q3.3k', 'tk2-q4.4k'], size: 0x200000 },  // QSound
    qsound: true,
    cpsBConfig: {
      idOffset: 0x32, idValue: -1,
      layerControl: 0x26,
      priority: [0x28, 0x2a, 0x2c, 0x2e],
      paletteControl: 0x30,
      layerEnableMask: [0x02, 0x04, 0x08, 0x30, 0x30],
    },
    gfxMapper: {
      bankSizes: [0x8000, 0x8000, 0, 0],
      ranges: [],
    },
  },

  // Synthetic test ROM (e2e tests only)
  {
    name: 'test',
    program: {
      entries: [
        { even: 'test_e.rom', odd: 'test_o.rom', offset: 0x00000, size: 0x8000 },
      ],
      size: 0x10000,
    },
    graphics: {
      banks: [
        { files: ['test_gfx0.rom', 'test_gfx1.rom', 'test_gfx2.rom', 'test_gfx3.rom'], offset: 0x000000, romSize: 0x4000 },
      ],
      size: 0x10000,
    },
    audio: { files: ['test_snd.rom'], size: 0x1000 },
    oki: { files: ['test_oki.rom'], size: 0x1000 },
    cpsBConfig: {
      idOffset: 0x00, idValue: 0x0000,
      layerControl: 0x26, priority: [0x28, 0x2A, 0x2C, 0x2E],
      paletteControl: 0x30, layerEnableMask: [0x02, 0x08, 0x10, 0x20, 0x02],
    },
    gfxMapper: {
      bankSizes: [0x4000, 0, 0, 0],
      ranges: [],
    },
  },

];
