/**
 * Neo-Geo Game ROM Definitions
 *
 * Auto-generated from MAME neogeo.xml software list.
 * Source: mamedev/mame hash/neogeo.xml
 * Generated: 2026-04-10
 */

export interface NeoGeoRomEntry {
  name: string;
  offset: number;
  size: number;
  crc?: string;
  loadFlag?: string;
}

export interface NeoGeoGameDef {
  name: string;
  description: string;
  year: string;
  publisher: string;
  program: NeoGeoRomEntry[];
  sprites: NeoGeoRomEntry[];
  audio: NeoGeoRomEntry[];
  voice: NeoGeoRomEntry[];
  fixed?: NeoGeoRomEntry[];
}

export const NEOGEO_GAME_DEFS: NeoGeoGameDef[] = [
  {
    name: 'nam1975',
    description: 'NAM-1975 (NGM-001 ~ NGH-001)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '001-p1.p1', offset: 0x0, size: 0x80000, crc: 'cc9fc951', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '001-c1.c1', offset: 0x0, size: 0x80000, crc: '32ea98e1', loadFlag: 'load16_byte' },
      { name: '001-c2.c2', offset: 0x1, size: 0x80000, crc: 'cbc4064c', loadFlag: 'load16_byte' },
      { name: '001-c3.c3', offset: 0x100000, size: 0x80000, crc: '0151054c', loadFlag: 'load16_byte' },
      { name: '001-c4.c4', offset: 0x100001, size: 0x80000, crc: '0a32570d', loadFlag: 'load16_byte' },
      { name: '001-c5.c5', offset: 0x200000, size: 0x80000, crc: '90b74cc2', loadFlag: 'load16_byte' },
      { name: '001-c6.c6', offset: 0x200001, size: 0x80000, crc: 'e62bed58', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '001-m1.m1', offset: 0x0, size: 0x40000, crc: 'ba874463' },
    ],
    voice: [
      { name: '001-v11.v11', offset: 0x0, size: 0x80000, crc: 'a7c3d5e5' },
      { name: '001-v21.v21', offset: 0x0, size: 0x80000, crc: '55e670b3' },
      { name: '001-v22.v22', offset: 0x80000, size: 0x80000, crc: 'ab0d8368' },
      { name: '001-v23.v23', offset: 0x100000, size: 0x80000, crc: 'df468e28' },
    ],
    fixed: [
      { name: '001-s1.s1', offset: 0x0, size: 0x20000, crc: '7988ba51' },
    ],
  },
  {
    name: 'bstars',
    description: 'Baseball Stars Professional (NGM-002)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '002-pg.p1', offset: 0x0, size: 0x80000, crc: 'c100b5f5', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '002-c1.c1', offset: 0x0, size: 0x80000, crc: 'aaff2a45', loadFlag: 'load16_byte' },
      { name: '002-c2.c2', offset: 0x1, size: 0x80000, crc: '3ba0f7e4', loadFlag: 'load16_byte' },
      { name: '002-c3.c3', offset: 0x100000, size: 0x80000, crc: '96f0fdfa', loadFlag: 'load16_byte' },
      { name: '002-c4.c4', offset: 0x100001, size: 0x80000, crc: '5fd87f2f', loadFlag: 'load16_byte' },
      { name: '002-c5.c5', offset: 0x200000, size: 0x80000, crc: '807ed83b', loadFlag: 'load16_byte' },
      { name: '002-c6.c6', offset: 0x200001, size: 0x80000, crc: '5a3cad41', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '002-m1.m1', offset: 0x0, size: 0x40000, crc: '4ecaa4ee' },
    ],
    voice: [
      { name: '002-v11.v11', offset: 0x0, size: 0x80000, crc: 'b7b925bd' },
      { name: '002-v12.v12', offset: 0x80000, size: 0x80000, crc: '329f26fc' },
      { name: '002-v13.v13', offset: 0x100000, size: 0x80000, crc: '0c39f3c8' },
      { name: '002-v14.v14', offset: 0x180000, size: 0x80000, crc: 'c7e11c38' },
      { name: '002-v21.v21', offset: 0x0, size: 0x80000, crc: '04a733d1' },
    ],
    fixed: [
      { name: '002-s1.s1', offset: 0x0, size: 0x20000, crc: '1a7fd0c6' },
    ],
  },
  {
    name: 'tpgolf',
    description: 'Top Player\'s Golf (NGM-003 ~ NGH-003)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '003-p1.p1', offset: 0x0, size: 0x80000, crc: 'f75549ba', loadFlag: 'load16_word_swap' },
      { name: '003-p2.p2', offset: 0x80000, size: 0x80000, crc: 'b7809a8f', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '003-c1.c1', offset: 0x0, size: 0x80000, crc: '0315fbaf', loadFlag: 'load16_byte' },
      { name: '003-c2.c2', offset: 0x1, size: 0x80000, crc: 'b4c15d59', loadFlag: 'load16_byte' },
      { name: '003-c3.c3', offset: 0x100000, size: 0x80000, crc: '8ce3e8da', loadFlag: 'load16_byte' },
      { name: '003-c4.c4', offset: 0x100001, size: 0x80000, crc: '29725969', loadFlag: 'load16_byte' },
      { name: '003-c5.c5', offset: 0x200000, size: 0x80000, crc: '9a7146da', loadFlag: 'load16_byte' },
      { name: '003-c6.c6', offset: 0x200001, size: 0x80000, crc: '1e63411a', loadFlag: 'load16_byte' },
      { name: '003-c7.c7', offset: 0x300000, size: 0x80000, crc: '2886710c', loadFlag: 'load16_byte' },
      { name: '003-c8.c8', offset: 0x300001, size: 0x80000, crc: '422af22d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '003-m1.m1', offset: 0x0, size: 0x20000, crc: '4cc545e6' },
    ],
    voice: [
      { name: '003-v11.v11', offset: 0x0, size: 0x80000, crc: 'ff97f1cb' },
      { name: '003-v21.v21', offset: 0x0, size: 0x80000, crc: 'd34960c6' },
      { name: '003-v22.v22', offset: 0x80000, size: 0x80000, crc: '9a5f58d4' },
      { name: '003-v23.v23', offset: 0x100000, size: 0x80000, crc: '30f53e54' },
      { name: '003-v24.v24', offset: 0x180000, size: 0x80000, crc: '5ba0f501' },
    ],
    fixed: [
      { name: '003-s1.s1', offset: 0x0, size: 0x20000, crc: '7b3eb9b1' },
    ],
  },
  {
    name: 'mahretsu',
    description: 'Mahjong Kyo Retsuden (NGM-004 ~ NGH-004)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '004-p1.p1', offset: 0x0, size: 0x80000, crc: 'fc6f53db', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '004-c1.c1', offset: 0x0, size: 0x80000, crc: 'f1ae16bc', loadFlag: 'load16_byte' },
      { name: '004-c2.c2', offset: 0x1, size: 0x80000, crc: 'bdc13520', loadFlag: 'load16_byte' },
      { name: '004-c3.c3', offset: 0x100000, size: 0x80000, crc: '9c571a37', loadFlag: 'load16_byte' },
      { name: '004-c4.c4', offset: 0x100001, size: 0x80000, crc: '7e81cb29', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '004-m1.m1', offset: 0x0, size: 0x20000, crc: 'c71fbb3b' },
    ],
    voice: [
      { name: '004-v11.v11', offset: 0x0, size: 0x80000, crc: 'b2fb2153' },
      { name: '004-v12.v12', offset: 0x80000, size: 0x80000, crc: '8503317b' },
      { name: '004-v21.v21', offset: 0x0, size: 0x80000, crc: '4999fb27' },
      { name: '004-v22.v22', offset: 0x80000, size: 0x80000, crc: '776fa2a2' },
      { name: '004-v23.v23', offset: 0x100000, size: 0x80000, crc: 'b3e7eeea' },
    ],
    fixed: [
      { name: '004-s1.s1', offset: 0x0, size: 0x20000, crc: '2bd05a06' },
    ],
  },
  {
    name: 'maglord',
    description: 'Magician Lord (NGM-005)',
    year: '1990',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '005-pg1.p1', offset: 0x0, size: 0x80000, crc: 'bd0a492d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '005-c1.c1', offset: 0x0, size: 0x80000, crc: '806aee34', loadFlag: 'load16_byte' },
      { name: '005-c2.c2', offset: 0x1, size: 0x80000, crc: '34aa9a86', loadFlag: 'load16_byte' },
      { name: '005-c3.c3', offset: 0x100000, size: 0x80000, crc: 'c4c2b926', loadFlag: 'load16_byte' },
      { name: '005-c4.c4', offset: 0x100001, size: 0x80000, crc: '9c46dcf4', loadFlag: 'load16_byte' },
      { name: '005-c5.c5', offset: 0x200000, size: 0x80000, crc: '69086dec', loadFlag: 'load16_byte' },
      { name: '005-c6.c6', offset: 0x200001, size: 0x80000, crc: 'ab7ac142', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '005-m1.m1', offset: 0x0, size: 0x40000, crc: '26259f0f' },
    ],
    voice: [
      { name: '005-v11.v11', offset: 0x0, size: 0x80000, crc: 'cc0455fd' },
      { name: '005-v21.v21', offset: 0x0, size: 0x80000, crc: 'f94ab5b7' },
      { name: '005-v22.v22', offset: 0x80000, size: 0x80000, crc: '232cfd04' },
    ],
    fixed: [
      { name: '005-s1.s1', offset: 0x0, size: 0x20000, crc: '1c5369a2' },
    ],
  },
  {
    name: 'ridhero',
    description: 'Riding Hero (NGM-006 ~ NGH-006)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '006-p1.p1', offset: 0x0, size: 0x80000, crc: 'd4aaf597', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '006-c1.c1', offset: 0x0, size: 0x80000, crc: '4a5c7f78', loadFlag: 'load16_byte' },
      { name: '006-c2.c2', offset: 0x1, size: 0x80000, crc: 'e0b70ece', loadFlag: 'load16_byte' },
      { name: '006-c3.c3', offset: 0x100000, size: 0x80000, crc: '8acff765', loadFlag: 'load16_byte' },
      { name: '006-c4.c4', offset: 0x100001, size: 0x80000, crc: '205e3208', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '006-m1.m1', offset: 0x0, size: 0x40000, crc: '92e7b4fe' },
    ],
    voice: [
      { name: '006-v11.v11', offset: 0x0, size: 0x80000, crc: 'cdf74a42' },
      { name: '006-v12.v12', offset: 0x80000, size: 0x80000, crc: 'e2fd2371' },
      { name: '006-v21.v21', offset: 0x0, size: 0x80000, crc: '94092bce' },
      { name: '006-v22.v22', offset: 0x80000, size: 0x80000, crc: '4e2cd7c3' },
      { name: '006-v23.v23', offset: 0x100000, size: 0x80000, crc: '069c71ed' },
      { name: '006-v24.v24', offset: 0x180000, size: 0x80000, crc: '89fbb825' },
    ],
    fixed: [
      { name: '006-s1.s1', offset: 0x0, size: 0x20000, crc: 'eb5189f0' },
    ],
  },
  {
    name: 'alpham2',
    description: 'Alpha Mission II / ASO II - Last Guardian (NGM-007 ~ NGH-007)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '007-p1.p1', offset: 0x0, size: 0x80000, crc: '5b266f47', loadFlag: 'load16_word_swap' },
      { name: '007-p2.p2', offset: 0x80000, size: 0x20000, crc: 'eb9c1044', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '007-c1.c1', offset: 0x0, size: 0x100000, crc: '8fba8ff3', loadFlag: 'load16_byte' },
      { name: '007-c2.c2', offset: 0x1, size: 0x100000, crc: '4dad2945', loadFlag: 'load16_byte' },
      { name: '007-c3.c3', offset: 0x200000, size: 0x80000, crc: '68c2994e', loadFlag: 'load16_byte' },
      { name: '007-c4.c4', offset: 0x200001, size: 0x80000, crc: '7d588349', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '007-m1.m1', offset: 0x0, size: 0x20000, crc: '28dfe2cd' },
    ],
    voice: [
      { name: '007-v1.v1', offset: 0x0, size: 0x100000, crc: 'cd5db931' },
      { name: '007-v2.v2', offset: 0x100000, size: 0x100000, crc: '63e9b574' },
    ],
    fixed: [
      { name: '007-s1.s1', offset: 0x0, size: 0x20000, crc: '85ec9acf' },
    ],
  },
  {
    name: 'ncombat',
    description: 'Ninja Combat (NGM-009)',
    year: '1990',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '009-p1.p1', offset: 0x0, size: 0x80000, crc: 'b45fcfbf', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '009-c1.c1', offset: 0x0, size: 0x80000, crc: '33cc838e', loadFlag: 'load16_byte' },
      { name: '009-c2.c2', offset: 0x1, size: 0x80000, crc: '26877feb', loadFlag: 'load16_byte' },
      { name: '009-c3.c3', offset: 0x100000, size: 0x80000, crc: '3b60a05d', loadFlag: 'load16_byte' },
      { name: '009-c4.c4', offset: 0x100001, size: 0x80000, crc: '39c2d039', loadFlag: 'load16_byte' },
      { name: '009-c5.c5', offset: 0x200000, size: 0x80000, crc: '67a4344e', loadFlag: 'load16_byte' },
      { name: '009-c6.c6', offset: 0x200001, size: 0x80000, crc: '2eca8b19', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '009-m1.m1', offset: 0x0, size: 0x20000, crc: 'b5819863' },
    ],
    voice: [
      { name: '009-v11.v11', offset: 0x0, size: 0x80000, crc: 'cf32a59c' },
      { name: '009-v12.v12', offset: 0x80000, size: 0x80000, crc: '7b3588b7' },
      { name: '009-v13.v13', offset: 0x100000, size: 0x80000, crc: '505a01b5' },
      { name: '009-v21.v21', offset: 0x0, size: 0x80000, crc: '365f9011' },
    ],
    fixed: [
      { name: '009-s1.s1', offset: 0x0, size: 0x20000, crc: 'd49afee8' },
    ],
  },
  {
    name: 'cyberlip',
    description: 'Cyber-Lip (NGM-010)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '010-p1.p1', offset: 0x0, size: 0x80000, crc: '69a6b42d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '010-c1.c1', offset: 0x0, size: 0x80000, crc: '8bba5113', loadFlag: 'load16_byte' },
      { name: '010-c2.c2', offset: 0x1, size: 0x80000, crc: 'cbf66432', loadFlag: 'load16_byte' },
      { name: '010-c3.c3', offset: 0x100000, size: 0x80000, crc: 'e4f86efc', loadFlag: 'load16_byte' },
      { name: '010-c4.c4', offset: 0x100001, size: 0x80000, crc: 'f7be4674', loadFlag: 'load16_byte' },
      { name: '010-c5.c5', offset: 0x200000, size: 0x80000, crc: 'e8076da0', loadFlag: 'load16_byte' },
      { name: '010-c6.c6', offset: 0x200001, size: 0x80000, crc: 'c495c567', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '010-m1.m1', offset: 0x0, size: 0x20000, crc: '8be3a078' },
    ],
    voice: [
      { name: '010-v11.v11', offset: 0x0, size: 0x80000, crc: '90224d22' },
      { name: '010-v12.v12', offset: 0x80000, size: 0x80000, crc: 'a0cf1834' },
      { name: '010-v13.v13', offset: 0x100000, size: 0x80000, crc: 'ae38bc84' },
      { name: '010-v14.v14', offset: 0x180000, size: 0x80000, crc: '70899bd2' },
      { name: '010-v21.v21', offset: 0x0, size: 0x80000, crc: '586f4cb2' },
    ],
    fixed: [
      { name: '010-s1.s1', offset: 0x0, size: 0x20000, crc: '79a35264' },
    ],
  },
  {
    name: 'superspy',
    description: 'The Super Spy (NGM-011 ~ NGH-011)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '011-p1.p1', offset: 0x0, size: 0x80000, crc: 'c7f944b5', loadFlag: 'load16_word_swap' },
      { name: 'sp2.p2', offset: 0x80000, size: 0x20000, crc: '811a4faf', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '011-c1.c1', offset: 0x0, size: 0x100000, crc: 'cae7be57', loadFlag: 'load16_byte' },
      { name: '011-c2.c2', offset: 0x1, size: 0x100000, crc: '9e29d986', loadFlag: 'load16_byte' },
      { name: '011-c3.c3', offset: 0x200000, size: 0x100000, crc: '14832ff2', loadFlag: 'load16_byte' },
      { name: '011-c4.c4', offset: 0x200001, size: 0x100000, crc: 'b7f63162', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '011-m1.m1', offset: 0x0, size: 0x40000, crc: 'ca661f1b' },
    ],
    voice: [
      { name: '011-v11.v11', offset: 0x0, size: 0x100000, crc: '5c674d5c' },
      { name: '011-v12.v12', offset: 0x100000, size: 0x80000, crc: '9f513d5a' },
      { name: '011-v21.v21', offset: 0x0, size: 0x80000, crc: '426cd040' },
    ],
    fixed: [
      { name: '011-s1.s1', offset: 0x0, size: 0x20000, crc: 'ec5fdb96' },
    ],
  },
  {
    name: 'mutnat',
    description: 'Mutation Nation (NGM-014 ~ NGH-014)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '014-p1.p1', offset: 0x0, size: 0x80000, crc: '6f1699c8', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '014-c1.c1', offset: 0x0, size: 0x100000, crc: '5e4381bf', loadFlag: 'load16_byte' },
      { name: '014-c2.c2', offset: 0x1, size: 0x100000, crc: '69ba4e18', loadFlag: 'load16_byte' },
      { name: '014-c3.c3', offset: 0x200000, size: 0x100000, crc: '890327d5', loadFlag: 'load16_byte' },
      { name: '014-c4.c4', offset: 0x200001, size: 0x100000, crc: 'e4002651', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '014-m1.m1', offset: 0x0, size: 0x20000, crc: 'b6683092' },
    ],
    voice: [
      { name: '014-v1.v1', offset: 0x0, size: 0x100000, crc: '25419296' },
      { name: '014-v2.v2', offset: 0x100000, size: 0x100000, crc: '0de53d5e' },
    ],
    fixed: [
      { name: '014-s1.s1', offset: 0x0, size: 0x20000, crc: '99419733' },
    ],
  },
  {
    name: 'kotm',
    description: 'King of the Monsters (set 1)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '016-p1.p1', offset: 0x0, size: 0x80000, crc: '1b818731', loadFlag: 'load16_word_swap' },
      { name: '016-p2.p2', offset: 0x80000, size: 0x20000, crc: '12afdc2b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '016-c1.c1', offset: 0x0, size: 0x100000, crc: '71471c25', loadFlag: 'load16_byte' },
      { name: '016-c2.c2', offset: 0x1, size: 0x100000, crc: '320db048', loadFlag: 'load16_byte' },
      { name: '016-c3.c3', offset: 0x200000, size: 0x100000, crc: '98de7995', loadFlag: 'load16_byte' },
      { name: '016-c4.c4', offset: 0x200001, size: 0x100000, crc: '070506e2', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '016-m1.m1', offset: 0x0, size: 0x20000, crc: '9da9ca10' },
    ],
    voice: [
      { name: '016-v1.v1', offset: 0x0, size: 0x100000, crc: '86c0a502' },
      { name: '016-v2.v2', offset: 0x100000, size: 0x100000, crc: '5bc23ec5' },
    ],
    fixed: [
      { name: '016-s1.s1', offset: 0x0, size: 0x20000, crc: '1a2eeeb3' },
    ],
  },
  {
    name: 'sengoku',
    description: 'Sengoku / Sengoku Denshou (NGM-017 ~ NGH-017)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '017-p1.p1', offset: 0x0, size: 0x80000, crc: 'f8a63983', loadFlag: 'load16_word_swap' },
      { name: '017-p2.p2', offset: 0x80000, size: 0x20000, crc: '3024bbb3', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '017-c1.c1', offset: 0x0, size: 0x100000, crc: 'b4eb82a1', loadFlag: 'load16_byte' },
      { name: '017-c2.c2', offset: 0x1, size: 0x100000, crc: 'd55c550d', loadFlag: 'load16_byte' },
      { name: '017-c3.c3', offset: 0x200000, size: 0x100000, crc: 'ed51ef65', loadFlag: 'load16_byte' },
      { name: '017-c4.c4', offset: 0x200001, size: 0x100000, crc: 'f4f3c9cb', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '017-m1.m1', offset: 0x0, size: 0x20000, crc: '9b4f34c6' },
    ],
    voice: [
      { name: '017-v1.v1', offset: 0x0, size: 0x100000, crc: '23663295' },
      { name: '017-v2.v2', offset: 0x100000, size: 0x100000, crc: 'f61e6765' },
    ],
    fixed: [
      { name: '017-s1.s1', offset: 0x0, size: 0x20000, crc: 'b246204d' },
    ],
  },
  {
    name: 'burningf',
    description: 'Burning Fight (NGM-018 ~ NGH-018)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '018-p1.p1', offset: 0x0, size: 0x80000, crc: '4092c8db', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '018-c1.c1', offset: 0x0, size: 0x100000, crc: '25a25e9b', loadFlag: 'load16_byte' },
      { name: '018-c2.c2', offset: 0x1, size: 0x100000, crc: 'd4378876', loadFlag: 'load16_byte' },
      { name: '018-c3.c3', offset: 0x200000, size: 0x100000, crc: '862b60da', loadFlag: 'load16_byte' },
      { name: '018-c4.c4', offset: 0x200001, size: 0x100000, crc: 'e2e0aff7', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '018-m1.m1', offset: 0x0, size: 0x20000, crc: '0c939ee2' },
    ],
    voice: [
      { name: '018-v1.v1', offset: 0x0, size: 0x100000, crc: '508c9ffc' },
      { name: '018-v2.v2', offset: 0x100000, size: 0x100000, crc: '854ef277' },
    ],
    fixed: [
      { name: '018-s1.s1', offset: 0x0, size: 0x20000, crc: '6799ea0d' },
    ],
  },
  {
    name: 'lbowling',
    description: 'League Bowling (NGM-019 ~ NGH-019)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '019-p1.p1', offset: 0x0, size: 0x80000, crc: 'a2de8445', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '019-c1.c1', offset: 0x0, size: 0x80000, crc: '4ccdef18', loadFlag: 'load16_byte' },
      { name: '019-c2.c2', offset: 0x1, size: 0x80000, crc: 'd4dd0802', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '019-m1.m1', offset: 0x0, size: 0x20000, crc: 'd568c17d' },
    ],
    voice: [
      { name: '019-v11.v11', offset: 0x0, size: 0x80000, crc: '0fb74872' },
      { name: '019-v12.v12', offset: 0x80000, size: 0x80000, crc: '029faa57' },
      { name: '019-v21.v21', offset: 0x0, size: 0x80000, crc: '2efd5ada' },
    ],
    fixed: [
      { name: '019-s1.s1', offset: 0x0, size: 0x20000, crc: '5fcdc0ed' },
    ],
  },
  {
    name: 'gpilots',
    description: 'Ghost Pilots (NGM-020 ~ NGH-020)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '020-p1.p1', offset: 0x0, size: 0x80000, crc: 'e6f2fe64', loadFlag: 'load16_word_swap' },
      { name: '020-p2.p2', offset: 0x80000, size: 0x20000, crc: 'edcb22ac', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '020-c1.c1', offset: 0x0, size: 0x100000, crc: 'bd6fe78e', loadFlag: 'load16_byte' },
      { name: '020-c2.c2', offset: 0x1, size: 0x100000, crc: '5f4a925c', loadFlag: 'load16_byte' },
      { name: '020-c3.c3', offset: 0x200000, size: 0x100000, crc: 'd1e42fd0', loadFlag: 'load16_byte' },
      { name: '020-c4.c4', offset: 0x200001, size: 0x100000, crc: 'edde439b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '020-m1.m1', offset: 0x0, size: 0x20000, crc: '48409377' },
    ],
    voice: [
      { name: '020-v11.v11', offset: 0x0, size: 0x100000, crc: '1b526c8b' },
      { name: '020-v12.v12', offset: 0x100000, size: 0x80000, crc: '4a9e6f03' },
      { name: '020-v21.v21', offset: 0x0, size: 0x80000, crc: '7abf113d' },
    ],
    fixed: [
      { name: '020-s1.s1', offset: 0x0, size: 0x20000, crc: 'a6d83d53' },
    ],
  },
  {
    name: 'joyjoy',
    description: 'Puzzled / Joy Joy Kid (NGM-021 ~ NGH-021)',
    year: '1990',
    publisher: 'SNK',
    program: [
      { name: '021-p1.p1', offset: 0x0, size: 0x80000, crc: '39c3478f', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '021-c1.c1', offset: 0x0, size: 0x80000, crc: '509250ec', loadFlag: 'load16_byte' },
      { name: '021-c2.c2', offset: 0x1, size: 0x80000, crc: '09ed5258', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '021-m1.m1', offset: 0x0, size: 0x40000, crc: '5a4be5e8' },
    ],
    voice: [
      { name: '021-v11.v11', offset: 0x0, size: 0x80000, crc: '66c1e5c4' },
      { name: '021-v21.v21', offset: 0x0, size: 0x80000, crc: '8ed20a86' },
    ],
    fixed: [
      { name: '021-s1.s1', offset: 0x0, size: 0x20000, crc: '6956d778' },
    ],
  },
  {
    name: 'bjourney',
    description: 'Blue\'s Journey / Raguy (ALM-001 ~ ALH-001)',
    year: '1990',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '022-p1.p1', offset: 0x0, size: 0x100000, crc: '6a2f6d4a', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '022-c1.c1', offset: 0x0, size: 0x100000, crc: '4d47a48c', loadFlag: 'load16_byte' },
      { name: '022-c2.c2', offset: 0x1, size: 0x100000, crc: 'e8c1491a', loadFlag: 'load16_byte' },
      { name: '022-c3.c3', offset: 0x200000, size: 0x80000, crc: '66e69753', loadFlag: 'load16_byte' },
      { name: '022-c4.c4', offset: 0x200001, size: 0x80000, crc: '71bfd48a', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '022-m1.m1', offset: 0x0, size: 0x20000, crc: '8e1d4ab6' },
    ],
    voice: [
      { name: '022-v11.v11', offset: 0x0, size: 0x100000, crc: '2cb4ad91' },
      { name: '022-v22.v22', offset: 0x100000, size: 0x100000, crc: '65a54d13' },
    ],
    fixed: [
      { name: '022-s1.s1', offset: 0x0, size: 0x20000, crc: '843c3624' },
    ],
  },
  {
    name: 'quizdais',
    description: 'Quiz Daisousa Sen - The Last Count Down (NGM-023 ~ NGH-023)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '023-p1.p1', offset: 0x0, size: 0x100000, crc: 'c488fda3', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '023-c1.c1', offset: 0x0, size: 0x100000, crc: '2999535a', loadFlag: 'load16_byte' },
      { name: '023-c2.c2', offset: 0x1, size: 0x100000, crc: '876a99e6', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '023-m1.m1', offset: 0x0, size: 0x20000, crc: '2a2105e0' },
    ],
    voice: [
      { name: '023-v1.v1', offset: 0x0, size: 0x100000, crc: 'a53e5bd3' },
    ],
    fixed: [
      { name: '023-s1.s1', offset: 0x0, size: 0x20000, crc: 'ac31818a' },
    ],
  },
  {
    name: 'lresort',
    description: 'Last Resort',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '024-p1.p1', offset: 0x0, size: 0x80000, crc: '89c4ab97', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '024-c1.c1', offset: 0x0, size: 0x100000, crc: '3617c2dc', loadFlag: 'load16_byte' },
      { name: '024-c2.c2', offset: 0x1, size: 0x100000, crc: '3f0a7fd8', loadFlag: 'load16_byte' },
      { name: '024-c3.c3', offset: 0x200000, size: 0x80000, crc: 'e9f745f8', loadFlag: 'load16_byte' },
      { name: '024-c4.c4', offset: 0x200001, size: 0x80000, crc: '7382fefb', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '024-m1.m1', offset: 0x0, size: 0x20000, crc: 'cec19742' },
    ],
    voice: [
      { name: '024-v1.v1', offset: 0x0, size: 0x100000, crc: 'efdfa063' },
      { name: '024-v2.v2', offset: 0x100000, size: 0x100000, crc: '3c7997c0' },
    ],
    fixed: [
      { name: '024-s1.s1', offset: 0x0, size: 0x20000, crc: '5cef5cc6' },
    ],
  },
  {
    name: 'eightman',
    description: 'Eight Man (NGM-025 ~ NGH-025)',
    year: '1991',
    publisher: 'SNK / Pallas',
    program: [
      { name: '025-p1.p1', offset: 0x0, size: 0x80000, crc: '43344cb0', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '025-c1.c1', offset: 0x0, size: 0x100000, crc: '555e16a4', loadFlag: 'load16_byte' },
      { name: '025-c2.c2', offset: 0x1, size: 0x100000, crc: 'e1ee51c3', loadFlag: 'load16_byte' },
      { name: '025-c3.c3', offset: 0x200000, size: 0x80000, crc: '0923d5b0', loadFlag: 'load16_byte' },
      { name: '025-c4.c4', offset: 0x200001, size: 0x80000, crc: 'e3eca67b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '025-m1.m1', offset: 0x0, size: 0x20000, crc: '9927034c' },
    ],
    voice: [
      { name: '025-v1.v1', offset: 0x0, size: 0x100000, crc: '4558558a' },
      { name: '025-v2.v2', offset: 0x100000, size: 0x100000, crc: 'c5e052e9' },
    ],
    fixed: [
      { name: '025-s1.s1', offset: 0x0, size: 0x20000, crc: 'a402202b' },
    ],
  },
  {
    name: 'minasan',
    description: 'Minasan no Okagesamadesu! Dai Sugoroku Taikai (MOM-001 ~ MOH-001)',
    year: '1990',
    publisher: 'Monolith Corp.',
    program: [
      { name: '027-p1.p1', offset: 0x0, size: 0x80000, crc: 'c8381327', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '027-c1.c1', offset: 0x0, size: 0x100000, crc: 'd0086f94', loadFlag: 'load16_byte' },
      { name: '027-c2.c2', offset: 0x1, size: 0x100000, crc: 'da61f5a6', loadFlag: 'load16_byte' },
      { name: '027-c3.c3', offset: 0x200000, size: 0x100000, crc: '08df1228', loadFlag: 'load16_byte' },
      { name: '027-c4.c4', offset: 0x200001, size: 0x100000, crc: '54e87696', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '027-m1.m1', offset: 0x0, size: 0x20000, crc: 'add5a226' },
    ],
    voice: [
      { name: '027-v11.v11', offset: 0x0, size: 0x100000, crc: '59ad4459' },
      { name: '027-v21.v21', offset: 0x0, size: 0x100000, crc: 'df5b4eeb' },
    ],
    fixed: [
      { name: '027-s1.s1', offset: 0x0, size: 0x20000, crc: 'e5824baa' },
    ],
  },
  {
    name: 'legendos',
    description: 'Legend of Success Joe / Ashita no Joe Densetsu',
    year: '1991',
    publisher: 'SNK / Wave',
    program: [
      { name: '029-p1.p1', offset: 0x0, size: 0x80000, crc: '9d563f19', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '029-c1.c1', offset: 0x0, size: 0x100000, crc: '2f5ab875', loadFlag: 'load16_byte' },
      { name: '029-c2.c2', offset: 0x1, size: 0x100000, crc: '318b2711', loadFlag: 'load16_byte' },
      { name: '029-c3.c3', offset: 0x200000, size: 0x100000, crc: '6bc52cb2', loadFlag: 'load16_byte' },
      { name: '029-c4.c4', offset: 0x200001, size: 0x100000, crc: '37ef298c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '029-m1.m1', offset: 0x0, size: 0x20000, crc: '6f2843f0' },
    ],
    voice: [
      { name: '029-v1.v1', offset: 0x0, size: 0x100000, crc: '85065452' },
    ],
    fixed: [
      { name: '029-s1.s1', offset: 0x0, size: 0x20000, crc: 'bcd502f0' },
    ],
  },
  {
    name: '2020bb',
    description: '2020 Super Baseball (set 1)',
    year: '1991',
    publisher: 'SNK / Pallas',
    program: [
      { name: '030-p1.p1', offset: 0x0, size: 0x80000, crc: 'd396c9cb', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '030-c1.c1', offset: 0x0, size: 0x100000, crc: '4f5e19bd', loadFlag: 'load16_byte' },
      { name: '030-c2.c2', offset: 0x1, size: 0x100000, crc: 'd6314bf0', loadFlag: 'load16_byte' },
      { name: '030-c3.c3', offset: 0x200000, size: 0x100000, crc: '47fddfee', loadFlag: 'load16_byte' },
      { name: '030-c4.c4', offset: 0x200001, size: 0x100000, crc: '780d1c4e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '030-m1.m1', offset: 0x0, size: 0x20000, crc: '4cf466ec' },
    ],
    voice: [
      { name: '030-v1.v1', offset: 0x0, size: 0x100000, crc: 'd4ca364e' },
      { name: '030-v2.v2', offset: 0x100000, size: 0x100000, crc: '54994455' },
    ],
    fixed: [
      { name: '030-s1.s1', offset: 0x0, size: 0x20000, crc: '7015b8fc' },
    ],
  },
  {
    name: 'socbrawl',
    description: 'Soccer Brawl (NGM-031)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '031-pg1.p1', offset: 0x0, size: 0x80000, crc: '17f034a7', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '031-c1.c1', offset: 0x0, size: 0x100000, crc: 'bd0a4eb8', loadFlag: 'load16_byte' },
      { name: '031-c2.c2', offset: 0x1, size: 0x100000, crc: 'efde5382', loadFlag: 'load16_byte' },
      { name: '031-c3.c3', offset: 0x200000, size: 0x80000, crc: '580f7f33', loadFlag: 'load16_byte' },
      { name: '031-c4.c4', offset: 0x200001, size: 0x80000, crc: 'ed297de8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '031-m1.m1', offset: 0x0, size: 0x20000, crc: 'cb37427c' },
    ],
    voice: [
      { name: '031-v1.v1', offset: 0x0, size: 0x100000, crc: 'cc78497e' },
      { name: '031-v2.v2', offset: 0x100000, size: 0x100000, crc: 'dda043c6' },
    ],
    fixed: [
      { name: '031-s1.s1', offset: 0x0, size: 0x20000, crc: '4c117174' },
    ],
  },
  {
    name: 'roboarmy',
    description: 'Robo Army',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '032-p1.p1', offset: 0x0, size: 0x80000, crc: 'cd11cbd4', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '032-c1.c1', offset: 0x0, size: 0x100000, crc: '97984c6c', loadFlag: 'load16_byte' },
      { name: '032-c2.c2', offset: 0x1, size: 0x100000, crc: '65773122', loadFlag: 'load16_byte' },
      { name: '032-c3.c3', offset: 0x200000, size: 0x80000, crc: '40adfccd', loadFlag: 'load16_byte' },
      { name: '032-c4.c4', offset: 0x200001, size: 0x80000, crc: '462571de', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '032-m1.m1', offset: 0x0, size: 0x20000, crc: '35ec952d' },
    ],
    voice: [
      { name: '032-v1.v1', offset: 0x0, size: 0x100000, crc: '63791533' },
      { name: '032-v2.v2', offset: 0x100000, size: 0x100000, crc: 'eb95de70' },
    ],
    fixed: [
      { name: '032-s1.s1', offset: 0x0, size: 0x20000, crc: 'ac0daa1b' },
    ],
  },
  {
    name: 'roboarmya',
    description: 'Robo Army (NGM-032 ~ NGH-032)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '032-epr.p1', offset: 0x0, size: 0x80000, crc: '27c773cb', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '032-c1.c1', offset: 0x0, size: 0x100000, crc: '97984c6c', loadFlag: 'load16_byte' },
      { name: '032-c2.c2', offset: 0x1, size: 0x100000, crc: '65773122', loadFlag: 'load16_byte' },
      { name: '032-c3.c3', offset: 0x200000, size: 0x80000, crc: '40adfccd', loadFlag: 'load16_byte' },
      { name: '032-c4.c4', offset: 0x200001, size: 0x80000, crc: '462571de', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '032-m1.m1', offset: 0x0, size: 0x20000, crc: '35ec952d' },
    ],
    voice: [
      { name: '032-v1.v1', offset: 0x0, size: 0x100000, crc: '63791533' },
      { name: '032-v2.v2', offset: 0x100000, size: 0x100000, crc: 'eb95de70' },
    ],
    fixed: [
      { name: '032-s1.s1', offset: 0x0, size: 0x20000, crc: 'ac0daa1b' },
    ],
  },
  {
    name: 'fatfury1',
    description: 'Fatal Fury - King of Fighters / Garou Densetsu - Shukumei no Tatakai (NGM-033 ~ NGH-033)',
    year: '1991',
    publisher: 'SNK',
    program: [
      { name: '033-p1.p1', offset: 0x0, size: 0x80000, crc: '47ebdc2f', loadFlag: 'load16_word_swap' },
      { name: '033-p2.p2', offset: 0x80000, size: 0x20000, crc: 'c473af1c', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '033-c1.c1', offset: 0x0, size: 0x100000, crc: '74317e54', loadFlag: 'load16_byte' },
      { name: '033-c2.c2', offset: 0x1, size: 0x100000, crc: '5bb952f3', loadFlag: 'load16_byte' },
      { name: '033-c3.c3', offset: 0x200000, size: 0x100000, crc: '9b714a7c', loadFlag: 'load16_byte' },
      { name: '033-c4.c4', offset: 0x200001, size: 0x100000, crc: '9397476a', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '033-m1.m1', offset: 0x0, size: 0x20000, crc: '5be10ffd' },
    ],
    voice: [
      { name: '033-v1.v1', offset: 0x0, size: 0x100000, crc: '212fd20d' },
      { name: '033-v2.v2', offset: 0x100000, size: 0x100000, crc: 'fa2ae47f' },
    ],
    fixed: [
      { name: '033-s1.s1', offset: 0x0, size: 0x20000, crc: '3c3bdf8c' },
    ],
  },
  {
    name: 'fbfrenzy',
    description: 'Football Frenzy (NGM-034 ~ NGH-034)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '034-p1.p1', offset: 0x0, size: 0x80000, crc: 'cdef6b19', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '034-c1.c1', offset: 0x0, size: 0x100000, crc: '91c56e78', loadFlag: 'load16_byte' },
      { name: '034-c2.c2', offset: 0x1, size: 0x100000, crc: '9743ea2f', loadFlag: 'load16_byte' },
      { name: '034-c3.c3', offset: 0x200000, size: 0x80000, crc: 'e5aa65f5', loadFlag: 'load16_byte' },
      { name: '034-c4.c4', offset: 0x200001, size: 0x80000, crc: '0eb138cc', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '034-m1.m1', offset: 0x0, size: 0x20000, crc: 'f41b16b8' },
    ],
    voice: [
      { name: '034-v1.v1', offset: 0x0, size: 0x100000, crc: '50c9d0dd' },
      { name: '034-v2.v2', offset: 0x100000, size: 0x100000, crc: '5aa15686' },
    ],
    fixed: [
      { name: '034-s1.s1', offset: 0x0, size: 0x20000, crc: '8472ed44' },
    ],
  },
  {
    name: 'bakatono',
    description: 'Bakatonosama Mahjong Manyuuki (MOM-002 ~ MOH-002)',
    year: '1991',
    publisher: 'Monolith Corp.',
    program: [
      { name: '036-p1.p1', offset: 0x0, size: 0x80000, crc: '1c66b6fa', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '036-c1.c1', offset: 0x0, size: 0x100000, crc: 'fe7f1010', loadFlag: 'load16_byte' },
      { name: '036-c2.c2', offset: 0x1, size: 0x100000, crc: 'bbf003f5', loadFlag: 'load16_byte' },
      { name: '036-c3.c3', offset: 0x200000, size: 0x100000, crc: '9ac0708e', loadFlag: 'load16_byte' },
      { name: '036-c4.c4', offset: 0x200001, size: 0x100000, crc: 'f2577d22', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '036-m1.m1', offset: 0x0, size: 0x20000, crc: 'f1385b96' },
    ],
    voice: [
      { name: '036-v1.v1', offset: 0x0, size: 0x100000, crc: '1c335dce' },
      { name: '036-v2.v2', offset: 0x100000, size: 0x100000, crc: 'bbf79342' },
    ],
    fixed: [
      { name: '036-s1.s1', offset: 0x0, size: 0x20000, crc: 'f3ef4485' },
    ],
  },
  {
    name: 'crsword',
    description: 'Crossed Swords (ALM-002 ~ ALH-002)',
    year: '1991',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '037-p1.p1', offset: 0x0, size: 0x80000, crc: 'e7f2553c', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '037-c1.c1', offset: 0x0, size: 0x100000, crc: '09df6892', loadFlag: 'load16_byte' },
      { name: '037-c2.c2', offset: 0x1, size: 0x100000, crc: 'ac122a78', loadFlag: 'load16_byte' },
      { name: '037-c3.c3', offset: 0x200000, size: 0x100000, crc: '9d7ed1ca', loadFlag: 'load16_byte' },
      { name: '037-c4.c4', offset: 0x200001, size: 0x100000, crc: '4a24395d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '037-m1.m1', offset: 0x0, size: 0x20000, crc: '9504b2c6' },
    ],
    voice: [
      { name: '037-v1.v1', offset: 0x0, size: 0x100000, crc: '61fedf65' },
    ],
    fixed: [
      { name: '037-s1.s1', offset: 0x0, size: 0x20000, crc: '74651f27' },
    ],
  },
  {
    name: 'trally',
    description: 'Thrash Rally (ALM-003 ~ ALH-003)',
    year: '1991',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '038-p1.p1', offset: 0x0, size: 0x80000, crc: '1e52a576', loadFlag: 'load16_word_swap' },
      { name: '038-p2.p2', offset: 0x80000, size: 0x80000, crc: 'a5193e2f', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '038-c1.c1', offset: 0x0, size: 0x100000, crc: 'c58323d4', loadFlag: 'load16_byte' },
      { name: '038-c2.c2', offset: 0x1, size: 0x100000, crc: 'bba9c29e', loadFlag: 'load16_byte' },
      { name: '038-c3.c3', offset: 0x200000, size: 0x80000, crc: '3bb7b9d6', loadFlag: 'load16_byte' },
      { name: '038-c4.c4', offset: 0x200001, size: 0x80000, crc: 'a4513ecf', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '038-m1.m1', offset: 0x0, size: 0x20000, crc: '0908707e' },
    ],
    voice: [
      { name: '038-v1.v1', offset: 0x0, size: 0x100000, crc: '5ccd9fd5' },
      { name: '038-v2.v2', offset: 0x100000, size: 0x80000, crc: 'ddd8d1e6' },
    ],
    fixed: [
      { name: '038-s1.s1', offset: 0x0, size: 0x20000, crc: 'fff62ae3' },
    ],
  },
  {
    name: 'kotm2',
    description: 'King of the Monsters 2 - The Next Thing (NGM-039 ~ NGH-039)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '039-p1.p1', offset: 0x0, size: 0x80000, crc: 'b372d54c', loadFlag: 'load16_word_swap' },
      { name: '039-p2.p2', offset: 0x80000, size: 0x80000, crc: '28661afe', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '039-c1.c1', offset: 0x0, size: 0x100000, crc: '6d1c4aa9', loadFlag: 'load16_byte' },
      { name: '039-c2.c2', offset: 0x1, size: 0x100000, crc: 'f7b75337', loadFlag: 'load16_byte' },
      { name: '039-c3.c3', offset: 0x200000, size: 0x80000, crc: 'bfc4f0b2', loadFlag: 'load16_byte' },
      { name: '039-c4.c4', offset: 0x200001, size: 0x80000, crc: '81c9c250', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '039-m1.m1', offset: 0x0, size: 0x20000, crc: '0c5b2ad5' },
    ],
    voice: [
      { name: '039-v2.v2', offset: 0x0, size: 0x200000, crc: '86d34b25' },
      { name: '039-v4.v4', offset: 0x200000, size: 0x100000, crc: '8fa62a0b' },
    ],
    fixed: [
      { name: '039-s1.s1', offset: 0x0, size: 0x20000, crc: '63ee053a' },
    ],
  },
  {
    name: 'sengoku2',
    description: 'Sengoku 2 / Sengoku Denshou 2',
    year: '1993',
    publisher: 'SNK',
    program: [
      { name: '040-p1.p1', offset: 0x0, size: 0x100000, crc: '6dde02c2', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '040-c1.c1', offset: 0x0, size: 0x100000, crc: 'faa8ea99', loadFlag: 'load16_byte' },
      { name: '040-c2.c2', offset: 0x1, size: 0x100000, crc: '87d0ec65', loadFlag: 'load16_byte' },
      { name: '040-c3.c3', offset: 0x200000, size: 0x80000, crc: '24b5ba80', loadFlag: 'load16_byte' },
      { name: '040-c4.c4', offset: 0x200001, size: 0x80000, crc: '1c9e9930', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '040-m1.m1', offset: 0x0, size: 0x20000, crc: 'd4de4bca' },
    ],
    voice: [
      { name: '040-v1.v1', offset: 0x0, size: 0x200000, crc: '71cb4b5d' },
      { name: '040-v2.v2', offset: 0x200000, size: 0x100000, crc: 'c5cece01' },
    ],
    fixed: [
      { name: '040-s1.s1', offset: 0x0, size: 0x20000, crc: 'cd9802a3' },
    ],
  },
  {
    name: 'bstars2',
    description: 'Baseball Stars 2',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '041-p1.p1', offset: 0x0, size: 0x80000, crc: '523567fd', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '041-c1.c1', offset: 0x0, size: 0x100000, crc: 'b39a12e1', loadFlag: 'load16_byte' },
      { name: '041-c2.c2', offset: 0x1, size: 0x100000, crc: '766cfc2f', loadFlag: 'load16_byte' },
      { name: '041-c3.c3', offset: 0x200000, size: 0x100000, crc: 'fb31339d', loadFlag: 'load16_byte' },
      { name: '041-c4.c4', offset: 0x200001, size: 0x100000, crc: '70457a0c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '041-m1.m1', offset: 0x0, size: 0x20000, crc: '15c177a6' },
    ],
    voice: [
      { name: '041-v1.v1', offset: 0x0, size: 0x100000, crc: 'cb1da093' },
      { name: '041-v2.v2', offset: 0x100000, size: 0x100000, crc: '1c954a9d' },
      { name: '041-v3.v3', offset: 0x200000, size: 0x80000, crc: 'afaa0180' },
    ],
    fixed: [
      { name: '041-s1.s1', offset: 0x0, size: 0x20000, crc: '015c5c94' },
    ],
  },
  {
    name: 'quizdai2',
    description: 'Quiz Meitantei Neo &amp; Geo - Quiz Daisousa Sen Part 2 (NGM-042 ~ NGH-042)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '042-p1.p1', offset: 0x0, size: 0x100000, crc: 'ed719dcf', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '042-c1.c1', offset: 0x0, size: 0x100000, crc: 'cb5809a1', loadFlag: 'load16_byte' },
      { name: '042-c2.c2', offset: 0x1, size: 0x100000, crc: '1436dfeb', loadFlag: 'load16_byte' },
      { name: '042-c3.c3', offset: 0x200000, size: 0x80000, crc: 'bcd4a518', loadFlag: 'load16_byte' },
      { name: '042-c4.c4', offset: 0x200001, size: 0x80000, crc: 'd602219b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '042-m1.m1', offset: 0x0, size: 0x20000, crc: 'bb19995d' },
    ],
    voice: [
      { name: '042-v1.v1', offset: 0x0, size: 0x100000, crc: 'af7f8247' },
      { name: '042-v2.v2', offset: 0x100000, size: 0x100000, crc: 'c6474b59' },
    ],
    fixed: [
      { name: '042-s1.s1', offset: 0x0, size: 0x20000, crc: '164fd6e6' },
    ],
  },
  {
    name: '3countb',
    description: '3 Count Bout / Fire Suplex (NGM-043 ~ NGH-043)',
    year: '1993',
    publisher: 'SNK',
    program: [
      { name: '043-p1.p1', offset: 0x0, size: 0x100000, crc: 'ffbdd928', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '043-c1.c1', offset: 0x0, size: 0x100000, crc: 'bad2d67f', loadFlag: 'load16_byte' },
      { name: '043-c2.c2', offset: 0x1, size: 0x100000, crc: 'a7fbda95', loadFlag: 'load16_byte' },
      { name: '043-c3.c3', offset: 0x200000, size: 0x100000, crc: 'f00be011', loadFlag: 'load16_byte' },
      { name: '043-c4.c4', offset: 0x200001, size: 0x100000, crc: '1887e5c0', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '043-m1.m1', offset: 0x0, size: 0x20000, crc: '7eab59cb' },
    ],
    voice: [
      { name: '043-v1.v1', offset: 0x0, size: 0x200000, crc: '63688ce8' },
      { name: '043-v2.v2', offset: 0x200000, size: 0x200000, crc: 'c69a827b' },
    ],
    fixed: [
      { name: '043-s1.s1', offset: 0x0, size: 0x20000, crc: 'c362d484' },
    ],
  },
  {
    name: 'aof',
    description: 'Art of Fighting / Ryuuko no Ken (NGM-044 ~ NGH-044)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '044-p1.p1', offset: 0x0, size: 0x80000, crc: 'ca9f7a6d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '044-c1.c1', offset: 0x0, size: 0x100000, crc: 'ddab98a7', loadFlag: 'load16_byte' },
      { name: '044-c2.c2', offset: 0x1, size: 0x100000, crc: 'd8ccd575', loadFlag: 'load16_byte' },
      { name: '044-c3.c3', offset: 0x200000, size: 0x100000, crc: '403e898a', loadFlag: 'load16_byte' },
      { name: '044-c4.c4', offset: 0x200001, size: 0x100000, crc: '6235fbaa', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '044-m1.m1', offset: 0x0, size: 0x20000, crc: '0987e4bb' },
    ],
    voice: [
      { name: '044-v2.v2', offset: 0x0, size: 0x200000, crc: '3ec632ea' },
      { name: '044-v4.v4', offset: 0x200000, size: 0x200000, crc: '4b0f8e23' },
    ],
    fixed: [
      { name: '044-s1.s1', offset: 0x0, size: 0x20000, crc: '89903f39' },
    ],
  },
  {
    name: 'samsho',
    description: 'Samurai Shodown / Samurai Spirits (NGM-045)',
    year: '1993',
    publisher: 'SNK',
    program: [
      { name: '045-p1.p1', offset: 0x0, size: 0x100000, crc: 'dfe51bf0', loadFlag: 'load16_word_swap' },
      { name: '045-pg2.sp2', offset: 0x100000, size: 0x100000, crc: '46745b94', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '045-c1.c1', offset: 0x0, size: 0x200000, crc: '2e5873a4', loadFlag: 'load16_byte' },
      { name: '045-c2.c2', offset: 0x1, size: 0x200000, crc: '04febb10', loadFlag: 'load16_byte' },
      { name: '045-c3.c3', offset: 0x400000, size: 0x200000, crc: 'f3dabd1e', loadFlag: 'load16_byte' },
      { name: '045-c4.c4', offset: 0x400001, size: 0x200000, crc: '935c62f0', loadFlag: 'load16_byte' },
      { name: '045-c51.c5', offset: 0x800000, size: 0x100000, crc: '81932894', loadFlag: 'load16_byte' },
      { name: '045-c61.c6', offset: 0x800001, size: 0x100000, crc: 'be30612e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '045-m1.m1', offset: 0x0, size: 0x20000, crc: '95170640' },
    ],
    voice: [
      { name: '045-v1.v1', offset: 0x0, size: 0x200000, crc: '37f78a9b' },
      { name: '045-v2.v2', offset: 0x200000, size: 0x200000, crc: '568b20cf' },
    ],
    fixed: [
      { name: '045-s1.s1', offset: 0x0, size: 0x20000, crc: '9142a4d3' },
    ],
  },
  {
    name: 'tophuntr',
    description: 'Top Hunter - Roddy &amp; Cathy (NGM-046)',
    year: '1994',
    publisher: 'SNK',
    program: [
      { name: '046-p1.p1', offset: 0x0, size: 0x100000, crc: '69fa9e29', loadFlag: 'load16_word_swap' },
      { name: '046-p2.sp2', offset: 0x100000, size: 0x100000, crc: 'f182cb3e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '046-c1.c1', offset: 0x0, size: 0x100000, crc: 'fa720a4a', loadFlag: 'load16_byte' },
      { name: '046-c2.c2', offset: 0x1, size: 0x100000, crc: 'c900c205', loadFlag: 'load16_byte' },
      { name: '046-c3.c3', offset: 0x200000, size: 0x100000, crc: '880e3c25', loadFlag: 'load16_byte' },
      { name: '046-c4.c4', offset: 0x200001, size: 0x100000, crc: '7a2248aa', loadFlag: 'load16_byte' },
      { name: '046-c5.c5', offset: 0x400000, size: 0x100000, crc: '4b735e45', loadFlag: 'load16_byte' },
      { name: '046-c6.c6', offset: 0x400001, size: 0x100000, crc: '273171df', loadFlag: 'load16_byte' },
      { name: '046-c7.c7', offset: 0x600000, size: 0x100000, crc: '12829c4c', loadFlag: 'load16_byte' },
      { name: '046-c8.c8', offset: 0x600001, size: 0x100000, crc: 'c944e03d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '046-m1.m1', offset: 0x0, size: 0x20000, crc: '3f84bb9f' },
    ],
    voice: [
      { name: '046-v1.v1', offset: 0x0, size: 0x100000, crc: 'c1f9c2db' },
      { name: '046-v2.v2', offset: 0x100000, size: 0x100000, crc: '56254a64' },
      { name: '046-v3.v3', offset: 0x200000, size: 0x100000, crc: '58113fb1' },
      { name: '046-v4.v4', offset: 0x300000, size: 0x100000, crc: '4f54c187' },
    ],
    fixed: [
      { name: '046-s1.s1', offset: 0x0, size: 0x20000, crc: '14b01d7b' },
    ],
  },
  {
    name: 'fatfury2',
    description: 'Fatal Fury 2 / Garou Densetsu 2 - Arata-naru Tatakai (NGM-047 ~ NGH-047)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '047-p1.p1', offset: 0x0, size: 0x100000, crc: 'ecfdbb69', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '047-c1.c1', offset: 0x0, size: 0x100000, crc: 'f72a939e', loadFlag: 'load16_byte' },
      { name: '047-c2.c2', offset: 0x1, size: 0x100000, crc: '05119a0d', loadFlag: 'load16_byte' },
      { name: '047-c3.c3', offset: 0x200000, size: 0x100000, crc: '01e00738', loadFlag: 'load16_byte' },
      { name: '047-c4.c4', offset: 0x200001, size: 0x100000, crc: '9fe27432', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '047-m1.m1', offset: 0x0, size: 0x20000, crc: '820b0ba7' },
    ],
    voice: [
      { name: '047-v1.v1', offset: 0x0, size: 0x200000, crc: 'd9d00784' },
      { name: '047-v2.v2', offset: 0x200000, size: 0x200000, crc: '2c9a4b33' },
    ],
    fixed: [
      { name: '047-s1.s1', offset: 0x0, size: 0x20000, crc: 'd7dbbf39' },
    ],
  },
  {
    name: 'janshin',
    description: 'Janshin Densetsu - Quest of Jongmaster',
    year: '1994',
    publisher: 'Aicom',
    program: [
      { name: '048-p1.p1', offset: 0x0, size: 0x100000, crc: 'fa818cbb', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '048-c1.c1', offset: 0x0, size: 0x200000, crc: '3fa890e9', loadFlag: 'load16_byte' },
      { name: '048-c2.c2', offset: 0x1, size: 0x200000, crc: '59c48ad8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '048-m1.m1', offset: 0x0, size: 0x20000, crc: '310467c7' },
    ],
    voice: [
      { name: '048-v1.v1', offset: 0x0, size: 0x200000, crc: 'f1947d2b' },
    ],
    fixed: [
      { name: '048-s1.s1', offset: 0x0, size: 0x20000, crc: '8285b25a' },
    ],
  },
  {
    name: 'androdun',
    description: 'Andro Dunos (NGM-049 ~ NGH-049)',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '049-p1.p1', offset: 0x0, size: 0x80000, crc: '3b857da2', loadFlag: 'load16_word_swap' },
      { name: '049-p2.p2', offset: 0x80000, size: 0x80000, crc: '2f062209', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '049-c1.c1', offset: 0x0, size: 0x100000, crc: '7ace6db3', loadFlag: 'load16_byte' },
      { name: '049-c2.c2', offset: 0x1, size: 0x100000, crc: 'b17024f7', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '049-m1.m1', offset: 0x0, size: 0x20000, crc: 'edd2acf4' },
    ],
    voice: [
      { name: '049-v1.v1', offset: 0x0, size: 0x100000, crc: 'ce43cb89' },
    ],
    fixed: [
      { name: '049-s1.s1', offset: 0x0, size: 0x20000, crc: '6349de5d' },
    ],
  },
  {
    name: 'ncommand',
    description: 'Ninja Commando',
    year: '1992',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '050-p1.p1', offset: 0x0, size: 0x100000, crc: '4e097c40', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '050-c1.c1', offset: 0x0, size: 0x100000, crc: '87421a0a', loadFlag: 'load16_byte' },
      { name: '050-c2.c2', offset: 0x1, size: 0x100000, crc: 'c4cf5548', loadFlag: 'load16_byte' },
      { name: '050-c3.c3', offset: 0x200000, size: 0x100000, crc: '03422c1e', loadFlag: 'load16_byte' },
      { name: '050-c4.c4', offset: 0x200001, size: 0x100000, crc: '0845eadb', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '050-m1.m1', offset: 0x0, size: 0x20000, crc: '6fcf07d3' },
    ],
    voice: [
      { name: '050-v1.v1', offset: 0x0, size: 0x100000, crc: '23c3ab42' },
      { name: '050-v2.v2', offset: 0x100000, size: 0x80000, crc: '80b8a984' },
    ],
    fixed: [
      { name: '050-s1.s1', offset: 0x0, size: 0x20000, crc: 'db8f9c8e' },
    ],
  },
  {
    name: 'viewpoin',
    description: 'Viewpoint',
    year: '1992',
    publisher: 'Sammy / Aicom',
    program: [
      { name: '051-p1.p1', offset: 0x0, size: 0x100000, crc: '17aa899d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '051-c1.c1', offset: 0x0, size: 0x100000, crc: 'd624c132', loadFlag: 'load16_byte' },
      { name: '051-c2.c2', offset: 0x1, size: 0x100000, crc: '40d69f1e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '051-m1.m1', offset: 0x0, size: 0x20000, crc: '8e69f29a' },
    ],
    voice: [
      { name: '051-v2.v1', offset: 0x0, size: 0x200000, crc: '019978b6' },
      { name: '051-v4.v2', offset: 0x200000, size: 0x200000, crc: '5758f38c' },
    ],
    fixed: [
      { name: '051-s1.s1', offset: 0x0, size: 0x20000, crc: '9fea5758' },
    ],
  },
  {
    name: 'ssideki',
    description: 'Super Sidekicks / Tokuten Ou',
    year: '1992',
    publisher: 'SNK',
    program: [
      { name: '052-p1.p1', offset: 0x0, size: 0x80000, crc: '9cd97256', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '052-c1.c1', offset: 0x0, size: 0x100000, crc: '53e1c002', loadFlag: 'load16_byte' },
      { name: '052-c2.c2', offset: 0x1, size: 0x100000, crc: '776a2d1f', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '052-m1.m1', offset: 0x0, size: 0x20000, crc: '49f17d2d' },
    ],
    voice: [
      { name: '052-v1.v1', offset: 0x0, size: 0x200000, crc: '22c097a5' },
    ],
    fixed: [
      { name: '052-s1.s1', offset: 0x0, size: 0x20000, crc: '97689804' },
    ],
  },
  {
    name: 'wh1',
    description: 'World Heroes (ALM-005)',
    year: '1992',
    publisher: 'Alpha Denshi Co.',
    program: [
      { name: '053-epr.p1', offset: 0x0, size: 0x80000, crc: 'd42e1e9a', loadFlag: 'load16_word_swap' },
      { name: '053-epr.p2', offset: 0x80000, size: 0x80000, crc: '0e33e8a3', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '053-c1.c1', offset: 0x0, size: 0x100000, crc: '85eb5bce', loadFlag: 'load16_byte' },
      { name: '053-c2.c2', offset: 0x1, size: 0x100000, crc: 'ec93b048', loadFlag: 'load16_byte' },
      { name: '053-c3.c3', offset: 0x200000, size: 0x100000, crc: '0dd64965', loadFlag: 'load16_byte' },
      { name: '053-c4.c4', offset: 0x200001, size: 0x100000, crc: '9270d954', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '053-m1.m1', offset: 0x0, size: 0x20000, crc: '1bd9d04b' },
    ],
    voice: [
      { name: '053-v2.v2', offset: 0x0, size: 0x200000, crc: 'a68df485' },
      { name: '053-v4.v4', offset: 0x200000, size: 0x100000, crc: '7bea8f66' },
    ],
    fixed: [
      { name: '053-s1.s1', offset: 0x0, size: 0x20000, crc: '8c2c2d6b' },
    ],
  },
  {
    name: 'kof94',
    description: 'The King of Fighters \'94 (NGM-055 ~ NGH-055)',
    year: '1994',
    publisher: 'SNK',
    program: [
      { name: '055-p1.p1', offset: 0x100000, size: 0x100000, crc: 'f10a2042', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '055-c1.c1', offset: 0x0, size: 0x200000, crc: 'b96ef460', loadFlag: 'load16_byte' },
      { name: '055-c2.c2', offset: 0x1, size: 0x200000, crc: '15e096a7', loadFlag: 'load16_byte' },
      { name: '055-c3.c3', offset: 0x400000, size: 0x200000, crc: '54f66254', loadFlag: 'load16_byte' },
      { name: '055-c4.c4', offset: 0x400001, size: 0x200000, crc: '0b01765f', loadFlag: 'load16_byte' },
      { name: '055-c5.c5', offset: 0x800000, size: 0x200000, crc: 'ee759363', loadFlag: 'load16_byte' },
      { name: '055-c6.c6', offset: 0x800001, size: 0x200000, crc: '498da52c', loadFlag: 'load16_byte' },
      { name: '055-c7.c7', offset: 0xC00000, size: 0x200000, crc: '62f66888', loadFlag: 'load16_byte' },
      { name: '055-c8.c8', offset: 0xC00001, size: 0x200000, crc: 'fe0a235d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '055-m1.m1', offset: 0x0, size: 0x20000, crc: 'f6e77cf5' },
    ],
    voice: [
      { name: '055-v1.v1', offset: 0x0, size: 0x200000, crc: '8889596d' },
      { name: '055-v2.v2', offset: 0x200000, size: 0x200000, crc: '25022b27' },
      { name: '055-v3.v3', offset: 0x400000, size: 0x200000, crc: '83cf32c0' },
    ],
    fixed: [
      { name: '055-s1.s1', offset: 0x0, size: 0x20000, crc: '825976c1' },
    ],
  },
  {
    name: 'aof2',
    description: 'Art of Fighting 2 / Ryuuko no Ken 2 (NGM-056)',
    year: '1994',
    publisher: 'SNK',
    program: [
      { name: '056-p1.p1', offset: 0x0, size: 0x100000, crc: 'a3b1d021', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '056-c1.c1', offset: 0x0, size: 0x200000, crc: '17b9cbd2', loadFlag: 'load16_byte' },
      { name: '056-c2.c2', offset: 0x1, size: 0x200000, crc: '5fd76b67', loadFlag: 'load16_byte' },
      { name: '056-c3.c3', offset: 0x400000, size: 0x200000, crc: 'd2c88768', loadFlag: 'load16_byte' },
      { name: '056-c4.c4', offset: 0x400001, size: 0x200000, crc: 'db39b883', loadFlag: 'load16_byte' },
      { name: '056-c5.c5', offset: 0x800000, size: 0x200000, crc: 'c3074137', loadFlag: 'load16_byte' },
      { name: '056-c6.c6', offset: 0x800001, size: 0x200000, crc: '31de68d3', loadFlag: 'load16_byte' },
      { name: '056-c7.c7', offset: 0xC00000, size: 0x200000, crc: '3f36df57', loadFlag: 'load16_byte' },
      { name: '056-c8.c8', offset: 0xC00001, size: 0x200000, crc: 'e546d7a8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '056-m1.m1', offset: 0x0, size: 0x20000, crc: 'f27e9d52' },
    ],
    voice: [
      { name: '056-v1.v1', offset: 0x0, size: 0x200000, crc: '4628fde0' },
      { name: '056-v2.v2', offset: 0x200000, size: 0x200000, crc: 'b710e2f2' },
      { name: '056-v3.v3', offset: 0x400000, size: 0x100000, crc: 'd168c301' },
    ],
    fixed: [
      { name: '056-s1.s1', offset: 0x0, size: 0x20000, crc: '8b02638e' },
    ],
  },
  {
    name: 'wh2',
    description: 'World Heroes 2 (ALM-006 ~ ALH-006)',
    year: '1993',
    publisher: 'ADK',
    program: [
      { name: '057-p1.p1', offset: 0x100000, size: 0x100000, crc: '65a891d9', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '057-c1.c1', offset: 0x0, size: 0x200000, crc: '21c6bb91', loadFlag: 'load16_byte' },
      { name: '057-c2.c2', offset: 0x1, size: 0x200000, crc: 'a3999925', loadFlag: 'load16_byte' },
      { name: '057-c3.c3', offset: 0x400000, size: 0x200000, crc: 'b725a219', loadFlag: 'load16_byte' },
      { name: '057-c4.c4', offset: 0x400001, size: 0x200000, crc: '8d96425e', loadFlag: 'load16_byte' },
      { name: '057-c5.c5', offset: 0x800000, size: 0x200000, crc: 'b20354af', loadFlag: 'load16_byte' },
      { name: '057-c6.c6', offset: 0x800001, size: 0x200000, crc: 'b13d1de3', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '057-m1.m1', offset: 0x0, size: 0x20000, crc: '8fa3bc77' },
    ],
    voice: [
      { name: '057-v1.v1', offset: 0x0, size: 0x200000, crc: '8877e301' },
      { name: '057-v2.v2', offset: 0x200000, size: 0x200000, crc: 'c1317ff4' },
    ],
    fixed: [
      { name: '057-s1.s1', offset: 0x0, size: 0x20000, crc: 'fcaeb3a4' },
    ],
  },
  {
    name: 'fatfursp',
    description: 'Fatal Fury Special / Garou Densetsu Special (NGM-058 ~ NGH-058, set 1)',
    year: '1993',
    publisher: 'SNK',
    program: [
      { name: '058-p1.p1', offset: 0x0, size: 0x100000, crc: '2f585ba2', loadFlag: 'load16_word_swap' },
      { name: '058-p2.sp2', offset: 0x100000, size: 0x80000, crc: 'd7c71a6b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '058-c1.c1', offset: 0x0, size: 0x200000, crc: '044ab13c', loadFlag: 'load16_byte' },
      { name: '058-c2.c2', offset: 0x1, size: 0x200000, crc: '11e6bf96', loadFlag: 'load16_byte' },
      { name: '058-c3.c3', offset: 0x400000, size: 0x200000, crc: '6f7938d5', loadFlag: 'load16_byte' },
      { name: '058-c4.c4', offset: 0x400001, size: 0x200000, crc: '4ad066ff', loadFlag: 'load16_byte' },
      { name: '058-c5.c5', offset: 0x800000, size: 0x200000, crc: '49c5e0bf', loadFlag: 'load16_byte' },
      { name: '058-c6.c6', offset: 0x800001, size: 0x200000, crc: '8ff1f43d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '058-m1.m1', offset: 0x0, size: 0x20000, crc: 'ccc5186e' },
    ],
    voice: [
      { name: '058-v1.v1', offset: 0x0, size: 0x200000, crc: '55d7ce84' },
      { name: '058-v2.v2', offset: 0x200000, size: 0x200000, crc: 'ee080b10' },
      { name: '058-v3.v3', offset: 0x400000, size: 0x100000, crc: 'f9eb3d4a' },
    ],
    fixed: [
      { name: '058-s1.s1', offset: 0x0, size: 0x20000, crc: '2df03197' },
    ],
  },
  {
    name: 'savagere',
    description: 'Savage Reign / Fu\'un Mokushiroku - Kakutou Sousei',
    year: '1995',
    publisher: 'SNK',
    program: [
      { name: '059-p1.p1', offset: 0x100000, size: 0x100000, crc: '01d4e9c0', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '059-c1.c1', offset: 0x0, size: 0x200000, crc: '763ba611', loadFlag: 'load16_byte' },
      { name: '059-c2.c2', offset: 0x1, size: 0x200000, crc: 'e05e8ca6', loadFlag: 'load16_byte' },
      { name: '059-c3.c3', offset: 0x400000, size: 0x200000, crc: '3e4eba4b', loadFlag: 'load16_byte' },
      { name: '059-c4.c4', offset: 0x400001, size: 0x200000, crc: '3c2a3808', loadFlag: 'load16_byte' },
      { name: '059-c5.c5', offset: 0x800000, size: 0x200000, crc: '59013f9e', loadFlag: 'load16_byte' },
      { name: '059-c6.c6', offset: 0x800001, size: 0x200000, crc: '1c8d5def', loadFlag: 'load16_byte' },
      { name: '059-c7.c7', offset: 0xC00000, size: 0x200000, crc: 'c88f7035', loadFlag: 'load16_byte' },
      { name: '059-c8.c8', offset: 0xC00001, size: 0x200000, crc: '484ce3ba', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '059-m1.m1', offset: 0x0, size: 0x20000, crc: '29992eba' },
    ],
    voice: [
      { name: '059-v1.v1', offset: 0x0, size: 0x200000, crc: '530c50fd' },
      { name: '059-v2.v2', offset: 0x200000, size: 0x200000, crc: 'eb6f1cdb' },
      { name: '059-v3.v3', offset: 0x400000, size: 0x200000, crc: '7038c2f9' },
    ],
    fixed: [
      { name: '059-s1.s1', offset: 0x0, size: 0x20000, crc: 'e08978ca' },
    ],
  },
  {
    name: 'fightfev',
    description: 'Fight Fever / Wang Jung Wang (set 1)',
    year: '1994',
    publisher: 'Viccom',
    program: [
      { name: '060-p1.p1', offset: 0x0, size: 0x100000, crc: '2a104b50', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '060-c1.c1', offset: 0x0, size: 0x200000, crc: '8908fff9', loadFlag: 'load16_byte' },
      { name: '060-c2.c2', offset: 0x1, size: 0x200000, crc: 'c6649492', loadFlag: 'load16_byte' },
      { name: '060-c3.c3', offset: 0x400000, size: 0x200000, crc: '0956b437', loadFlag: 'load16_byte' },
      { name: '060-c4.c4', offset: 0x400001, size: 0x200000, crc: '026f3b62', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '060-m1.m1', offset: 0x0, size: 0x20000, crc: '0b7c4e65' },
    ],
    voice: [
      { name: '060-v1.v1', offset: 0x0, size: 0x200000, crc: 'f417c215' },
      { name: '060-v2.v2', offset: 0x200000, size: 0x100000, crc: 'efcff7cf' },
    ],
    fixed: [
      { name: '060-s1.s1', offset: 0x0, size: 0x20000, crc: 'd62a72e9' },
    ],
  },
  {
    name: 'ssideki2',
    description: 'Super Sidekicks 2 - The World Championship / Tokuten Ou 2 - Real Fight Football (NGM-061 ~ NGH-061)',
    year: '1994',
    publisher: 'SNK',
    program: [
      { name: '061-p1.p1', offset: 0x0, size: 0x100000, crc: '5969e0dc', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '061-c1-16.c1', offset: 0x0, size: 0x200000, crc: 'a626474f', loadFlag: 'load16_byte' },
      { name: '061-c2-16.c2', offset: 0x1, size: 0x200000, crc: 'c3be42ae', loadFlag: 'load16_byte' },
      { name: '061-c3-16.c3', offset: 0x400000, size: 0x200000, crc: '2a7b98b9', loadFlag: 'load16_byte' },
      { name: '061-c4-16.c4', offset: 0x400001, size: 0x200000, crc: 'c0be9a1f', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '061-m1.m1', offset: 0x0, size: 0x20000, crc: '156f6951' },
    ],
    voice: [
      { name: '061-v1.v1', offset: 0x0, size: 0x200000, crc: 'f081c8d3' },
      { name: '061-v2.v2', offset: 0x200000, size: 0x200000, crc: '7cd63302' },
    ],
    fixed: [
      { name: '061-s1.s1', offset: 0x0, size: 0x20000, crc: '226d1b68' },
    ],
  },
  {
    name: 'spinmast',
    description: 'Spin Master / Miracle Adventure',
    year: '1993',
    publisher: 'Data East Corporation',
    program: [
      { name: '062-p1.p1', offset: 0x0, size: 0x100000, crc: '37aba1aa', loadFlag: 'load16_word_swap' },
      { name: '062-p2.sp2', offset: 0x100000, size: 0x100000, crc: 'f025ab77', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '062-c1.c1', offset: 0x0, size: 0x100000, crc: 'a9375aa2', loadFlag: 'load16_byte' },
      { name: '062-c2.c2', offset: 0x1, size: 0x100000, crc: '0e73b758', loadFlag: 'load16_byte' },
      { name: '062-c3.c3', offset: 0x200000, size: 0x100000, crc: 'df51e465', loadFlag: 'load16_byte' },
      { name: '062-c4.c4', offset: 0x200001, size: 0x100000, crc: '38517e90', loadFlag: 'load16_byte' },
      { name: '062-c5.c5', offset: 0x400000, size: 0x100000, crc: '7babd692', loadFlag: 'load16_byte' },
      { name: '062-c6.c6', offset: 0x400001, size: 0x100000, crc: 'cde5ade5', loadFlag: 'load16_byte' },
      { name: '062-c7.c7', offset: 0x600000, size: 0x100000, crc: 'bb2fd7c0', loadFlag: 'load16_byte' },
      { name: '062-c8.c8', offset: 0x600001, size: 0x100000, crc: '8d7be933', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '062-m1.m1', offset: 0x0, size: 0x20000, crc: '76108b2f' },
    ],
    voice: [
      { name: '062-v1.v1', offset: 0x0, size: 0x100000, crc: 'cc281aef' },
    ],
    fixed: [
      { name: '062-s1.s1', offset: 0x0, size: 0x20000, crc: '289e2bbe' },
    ],
  },
  {
    name: 'samsho2',
    description: 'Samurai Shodown II / Shin Samurai Spirits - Haohmaru Jigokuhen (NGM-063 ~ NGH-063)',
    year: '1994',
    publisher: 'SNK',
    program: [
      { name: '063-p1.p1', offset: 0x100000, size: 0x100000, crc: '22368892', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '063-c1.c1', offset: 0x0, size: 0x200000, crc: '86cd307c', loadFlag: 'load16_byte' },
      { name: '063-c2.c2', offset: 0x1, size: 0x200000, crc: 'cdfcc4ca', loadFlag: 'load16_byte' },
      { name: '063-c3.c3', offset: 0x400000, size: 0x200000, crc: '7a63ccc7', loadFlag: 'load16_byte' },
      { name: '063-c4.c4', offset: 0x400001, size: 0x200000, crc: '751025ce', loadFlag: 'load16_byte' },
      { name: '063-c5.c5', offset: 0x800000, size: 0x200000, crc: '20d3a475', loadFlag: 'load16_byte' },
      { name: '063-c6.c6', offset: 0x800001, size: 0x200000, crc: 'ae4c0a88', loadFlag: 'load16_byte' },
      { name: '063-c7.c7', offset: 0xC00000, size: 0x200000, crc: '2df3cbcf', loadFlag: 'load16_byte' },
      { name: '063-c8.c8', offset: 0xC00001, size: 0x200000, crc: '1ffc6dfa', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '063-m1.m1', offset: 0x0, size: 0x20000, crc: '56675098' },
    ],
    voice: [
      { name: '063-v1.v1', offset: 0x0, size: 0x200000, crc: '37703f91' },
      { name: '063-v2.v2', offset: 0x200000, size: 0x200000, crc: '0142bde8' },
      { name: '063-v3.v3', offset: 0x400000, size: 0x200000, crc: 'd07fa5ca' },
      { name: '063-v4.v4', offset: 0x600000, size: 0x100000, crc: '24aab4bb' },
    ],
    fixed: [
      { name: '063-s1.s1', offset: 0x0, size: 0x20000, crc: '64a5cd66' },
    ],
  },
  {
    name: 'wh2j',
    description: 'World Heroes 2 Jet (ADM-007 ~ ADH-007)',
    year: '1994',
    publisher: 'ADK / SNK',
    program: [
      { name: '064-p1.p1', offset: 0x100000, size: 0x100000, crc: '385a2e86', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '064-c1.c1', offset: 0x0, size: 0x200000, crc: '2ec87cea', loadFlag: 'load16_byte' },
      { name: '064-c2.c2', offset: 0x1, size: 0x200000, crc: '526b81ab', loadFlag: 'load16_byte' },
      { name: '064-c3.c3', offset: 0x400000, size: 0x200000, crc: '436d1b31', loadFlag: 'load16_byte' },
      { name: '064-c4.c4', offset: 0x400001, size: 0x200000, crc: 'f9c8dd26', loadFlag: 'load16_byte' },
      { name: '064-c5.c5', offset: 0x800000, size: 0x200000, crc: '8e34a9f4', loadFlag: 'load16_byte' },
      { name: '064-c6.c6', offset: 0x800001, size: 0x200000, crc: 'a43e4766', loadFlag: 'load16_byte' },
      { name: '064-c7.c7', offset: 0xC00000, size: 0x200000, crc: '59d97215', loadFlag: 'load16_byte' },
      { name: '064-c8.c8', offset: 0xC00001, size: 0x200000, crc: 'fc092367', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '064-m1.m1', offset: 0x0, size: 0x20000, crc: 'd2eec9d3' },
    ],
    voice: [
      { name: '064-v1.v1', offset: 0x0, size: 0x200000, crc: 'aa277109' },
      { name: '064-v2.v2', offset: 0x200000, size: 0x200000, crc: 'b6527edd' },
    ],
    fixed: [
      { name: '064-s1.s1', offset: 0x0, size: 0x20000, crc: '2a03998a' },
    ],
  },
  {
    name: 'wjammers',
    description: 'Windjammers / Flying Power Disc',
    year: '1994',
    publisher: 'Data East Corporation',
    program: [
      { name: '065-p1.p1', offset: 0x0, size: 0x100000, crc: '6692c140', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '065-c1.c1', offset: 0x0, size: 0x100000, crc: 'c7650204', loadFlag: 'load16_byte' },
      { name: '065-c2.c2', offset: 0x1, size: 0x100000, crc: 'd9f3e71d', loadFlag: 'load16_byte' },
      { name: '065-c3.c3', offset: 0x200000, size: 0x100000, crc: '40986386', loadFlag: 'load16_byte' },
      { name: '065-c4.c4', offset: 0x200001, size: 0x100000, crc: '715e15ff', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '065-m1.m1', offset: 0x0, size: 0x20000, crc: '52c23cfc' },
    ],
    voice: [
      { name: '065-v1.v1', offset: 0x0, size: 0x100000, crc: 'ce8b3698' },
      { name: '065-v2.v2', offset: 0x100000, size: 0x100000, crc: '659f9b96' },
      { name: '065-v3.v3', offset: 0x200000, size: 0x100000, crc: '39f73061' },
      { name: '065-v4.v4', offset: 0x300000, size: 0x100000, crc: '5dee7963' },
    ],
    fixed: [
      { name: '065-s1.s1', offset: 0x0, size: 0x20000, crc: '074b5723' },
    ],
  },
  {
    name: 'karnovr',
    description: 'Karnov\'s Revenge / Fighter\'s History Dynamite',
    year: '1994',
    publisher: 'Data East Corporation',
    program: [
      { name: '066-p1.p1', offset: 0x0, size: 0x100000, crc: '8c86fd22', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '066-c1.c1', offset: 0x0, size: 0x200000, crc: '09dfe061', loadFlag: 'load16_byte' },
      { name: '066-c2.c2', offset: 0x1, size: 0x200000, crc: 'e0f6682a', loadFlag: 'load16_byte' },
      { name: '066-c3.c3', offset: 0x400000, size: 0x200000, crc: 'a673b4f7', loadFlag: 'load16_byte' },
      { name: '066-c4.c4', offset: 0x400001, size: 0x200000, crc: 'cb3dc5f4', loadFlag: 'load16_byte' },
      { name: '066-c5.c5', offset: 0x800000, size: 0x200000, crc: '9a28785d', loadFlag: 'load16_byte' },
      { name: '066-c6.c6', offset: 0x800001, size: 0x200000, crc: 'c15c01ed', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '066-m1.m1', offset: 0x0, size: 0x20000, crc: '030beae4' },
    ],
    voice: [
      { name: '066-v1.v1', offset: 0x0, size: 0x200000, crc: '0b7ea37a' },
    ],
    fixed: [
      { name: '066-s1.s1', offset: 0x0, size: 0x20000, crc: 'bae5d5e5' },
    ],
  },
  {
    name: 'gururin',
    description: 'Gururin',
    year: '1994',
    publisher: 'Face',
    program: [
      { name: '067-p1.p1', offset: 0x0, size: 0x80000, crc: '4cea8a49', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '067-c1.c1', offset: 0x0, size: 0x200000, crc: '35866126', loadFlag: 'load16_byte' },
      { name: '067-c2.c2', offset: 0x1, size: 0x200000, crc: '9db64084', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '067-m1.m1', offset: 0x0, size: 0x20000, crc: '9e3c6328' },
    ],
    voice: [
      { name: '067-v1.v1', offset: 0x0, size: 0x80000, crc: 'cf23afd0' },
    ],
    fixed: [
      { name: '067-s1.s1', offset: 0x0, size: 0x20000, crc: 'b119e1eb' },
    ],
  },
  {
    name: 'pspikes2',
    description: 'Power Spikes II (NGM-068)',
    year: '1994',
    publisher: 'Video System Co.',
    program: [
      { name: '068-pg1.p1', offset: 0x0, size: 0x100000, crc: '105a408f', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '068-c1.c1', offset: 0x0, size: 0x100000, crc: '7f250f76', loadFlag: 'load16_byte' },
      { name: '068-c2.c2', offset: 0x1, size: 0x100000, crc: '20912873', loadFlag: 'load16_byte' },
      { name: '068-c3.c3', offset: 0x200000, size: 0x100000, crc: '4b641ba1', loadFlag: 'load16_byte' },
      { name: '068-c4.c4', offset: 0x200001, size: 0x100000, crc: '35072596', loadFlag: 'load16_byte' },
      { name: '068-c5.c5', offset: 0x400000, size: 0x100000, crc: '151dd624', loadFlag: 'load16_byte' },
      { name: '068-c6.c6', offset: 0x400001, size: 0x100000, crc: 'a6722604', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '068-mg1.m1', offset: 0x0, size: 0x20000, crc: 'b1c7911e' },
    ],
    voice: [
      { name: '068-v1.v1', offset: 0x0, size: 0x100000, crc: '2ced86df' },
      { name: '068-v2.v2', offset: 0x100000, size: 0x100000, crc: '970851ab' },
      { name: '068-v3.v3', offset: 0x200000, size: 0x100000, crc: '81ff05aa' },
    ],
    fixed: [
      { name: '068-sg1.s1', offset: 0x0, size: 0x20000, crc: '18082299' },
    ],
  },
  {
    name: 'fatfury3',
    description: 'Fatal Fury 3 - Road to the Final Victory / Garou Densetsu 3 - Haruka-naru Tatakai (NGM-069 ~ NGH-069)',
    year: '1995',
    publisher: 'SNK',
    program: [
      { name: '069-p1.p1', offset: 0x0, size: 0x100000, crc: 'a8bcfbbc', loadFlag: 'load16_word_swap' },
      { name: '069-sp2.sp2', offset: 0x100000, size: 0x200000, crc: 'dbe963ed', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '069-c1.c1', offset: 0x0, size: 0x400000, crc: 'e302f93c', loadFlag: 'load16_byte' },
      { name: '069-c2.c2', offset: 0x1, size: 0x400000, crc: '1053a455', loadFlag: 'load16_byte' },
      { name: '069-c3.c3', offset: 0x800000, size: 0x400000, crc: '1c0fde2f', loadFlag: 'load16_byte' },
      { name: '069-c4.c4', offset: 0x800001, size: 0x400000, crc: 'a25fc3d0', loadFlag: 'load16_byte' },
      { name: '069-c5.c5', offset: 0x1000000, size: 0x200000, crc: 'b3ec6fa6', loadFlag: 'load16_byte' },
      { name: '069-c6.c6', offset: 0x1000001, size: 0x200000, crc: '69210441', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '069-m1.m1', offset: 0x0, size: 0x20000, crc: 'fce72926' },
    ],
    voice: [
      { name: '069-v1.v1', offset: 0x0, size: 0x400000, crc: '2bdbd4db' },
      { name: '069-v2.v2', offset: 0x400000, size: 0x400000, crc: 'a698a487' },
      { name: '069-v3.v3', offset: 0x800000, size: 0x200000, crc: '581c5304' },
    ],
    fixed: [
      { name: '069-s1.s1', offset: 0x0, size: 0x20000, crc: '0b33a800' },
    ],
  },
  {
    name: 'zupapa',
    description: 'Zupapa!',
    year: '2001',
    publisher: 'SNK',
    program: [
      { name: '070-p1.p1', offset: 0x0, size: 0x100000, crc: '5a96203e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '070-c1.c1', offset: 0x0, size: 0x800000, crc: 'f8ad02d8', loadFlag: 'load16_byte' },
      { name: '070-c2.c2', offset: 0x1, size: 0x800000, crc: '70156dde', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '070-epr.m1', offset: 0x0, size: 0x20000, crc: '5a3b3191' },
    ],
    voice: [
      { name: '070-v1.v1', offset: 0x0, size: 0x200000, crc: 'd3a7e1ff' },
    ],
  },
  {
    name: 'panicbom',
    description: 'Panic Bomber',
    year: '1994',
    publisher: 'Eighting / Hudson',
    program: [
      { name: '073-p1.p1', offset: 0x0, size: 0x80000, crc: 'adc356ad', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '073-c1.c1', offset: 0x0, size: 0x100000, crc: '8582e1b5', loadFlag: 'load16_byte' },
      { name: '073-c2.c2', offset: 0x1, size: 0x100000, crc: 'e15a093b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '073-m1.m1', offset: 0x0, size: 0x20000, crc: '3cdf5d88' },
    ],
    voice: [
      { name: '073-v1.v1', offset: 0x0, size: 0x200000, crc: '7fc86d2f' },
      { name: '073-v2.v2', offset: 0x200000, size: 0x100000, crc: '082adfc7' },
    ],
    fixed: [
      { name: '073-s1.s1', offset: 0x0, size: 0x20000, crc: 'b876de7e' },
    ],
  },
  {
    name: 'aodk',
    description: 'Aggressors of Dark Kombat / Tsuukai GANGAN Koushinkyoku (ADM-008 ~ ADH-008)',
    year: '1994',
    publisher: 'ADK / SNK',
    program: [
      { name: '074-p1.p1', offset: 0x100000, size: 0x100000, crc: '62369553', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '074-c1.c1', offset: 0x0, size: 0x200000, crc: 'a0b39344', loadFlag: 'load16_byte' },
      { name: '074-c2.c2', offset: 0x1, size: 0x200000, crc: '203f6074', loadFlag: 'load16_byte' },
      { name: '074-c3.c3', offset: 0x400000, size: 0x200000, crc: '7fff4d41', loadFlag: 'load16_byte' },
      { name: '074-c4.c4', offset: 0x400001, size: 0x200000, crc: '48db3e0a', loadFlag: 'load16_byte' },
      { name: '074-c5.c5', offset: 0x800000, size: 0x200000, crc: 'c74c5e51', loadFlag: 'load16_byte' },
      { name: '074-c6.c6', offset: 0x800001, size: 0x200000, crc: '73e8e7e0', loadFlag: 'load16_byte' },
      { name: '074-c7.c7', offset: 0xC00000, size: 0x200000, crc: 'ac7daa01', loadFlag: 'load16_byte' },
      { name: '074-c8.c8', offset: 0xC00001, size: 0x200000, crc: '14e7ad71', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '074-m1.m1', offset: 0x0, size: 0x20000, crc: '5a52a9d1' },
    ],
    voice: [
      { name: '074-v1.v1', offset: 0x0, size: 0x200000, crc: '7675b8fa' },
      { name: '074-v2.v2', offset: 0x200000, size: 0x200000, crc: 'a9da86e9' },
    ],
    fixed: [
      { name: '074-s1.s1', offset: 0x0, size: 0x20000, crc: '96148d2b' },
    ],
  },
  {
    name: 'sonicwi2',
    description: 'Aero Fighters 2 / Sonic Wings 2',
    year: '1994',
    publisher: 'Video System Co.',
    program: [
      { name: '075-p1.p1', offset: 0x100000, size: 0x100000, crc: '92871738', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '075-c1.c1', offset: 0x0, size: 0x200000, crc: '3278e73e', loadFlag: 'load16_byte' },
      { name: '075-c2.c2', offset: 0x1, size: 0x200000, crc: 'fe6355d6', loadFlag: 'load16_byte' },
      { name: '075-c3.c3', offset: 0x400000, size: 0x200000, crc: 'c1b438f1', loadFlag: 'load16_byte' },
      { name: '075-c4.c4', offset: 0x400001, size: 0x200000, crc: '1f777206', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '075-m1.m1', offset: 0x0, size: 0x20000, crc: 'bb828df1' },
    ],
    voice: [
      { name: '075-v1.v1', offset: 0x0, size: 0x200000, crc: '7577e949' },
      { name: '075-v2.v2', offset: 0x200000, size: 0x100000, crc: '021760cd' },
    ],
    fixed: [
      { name: '075-s1.s1', offset: 0x0, size: 0x20000, crc: 'c9eec367' },
    ],
  },
  {
    name: 'zedblade',
    description: 'Zed Blade / Operation Ragnarok',
    year: '1994',
    publisher: 'NMK',
    program: [
      { name: '076-p1.p1', offset: 0x0, size: 0x80000, crc: 'd7c1effd', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '076-c1.c1', offset: 0x0, size: 0x200000, crc: '4d9cb038', loadFlag: 'load16_byte' },
      { name: '076-c2.c2', offset: 0x1, size: 0x200000, crc: '09233884', loadFlag: 'load16_byte' },
      { name: '076-c3.c3', offset: 0x400000, size: 0x200000, crc: 'd06431e3', loadFlag: 'load16_byte' },
      { name: '076-c4.c4', offset: 0x400001, size: 0x200000, crc: '4b1c089b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '076-m1.m1', offset: 0x0, size: 0x20000, crc: '7b5f3d0a' },
    ],
    voice: [
      { name: '076-v1.v1', offset: 0x0, size: 0x200000, crc: '1a21d90c' },
      { name: '076-v2.v2', offset: 0x200000, size: 0x200000, crc: 'b61686c3' },
      { name: '076-v3.v3', offset: 0x400000, size: 0x100000, crc: 'b90658fa' },
    ],
    fixed: [
      { name: '076-s1.s1', offset: 0x0, size: 0x20000, crc: 'f4c25dd5' },
    ],
  },
  {
    name: 'galaxyfg',
    description: 'Galaxy Fight - Universal Warriors',
    year: '1995',
    publisher: 'Sunsoft',
    program: [
      { name: '078-p1.p1', offset: 0x100000, size: 0x100000, crc: '45906309', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '078-c1.c1', offset: 0x0, size: 0x200000, crc: 'c890c7c0', loadFlag: 'load16_byte' },
      { name: '078-c2.c2', offset: 0x1, size: 0x200000, crc: 'b6d25419', loadFlag: 'load16_byte' },
      { name: '078-c3.c3', offset: 0x400000, size: 0x200000, crc: '9d87e761', loadFlag: 'load16_byte' },
      { name: '078-c4.c4', offset: 0x400001, size: 0x200000, crc: '765d7cb8', loadFlag: 'load16_byte' },
      { name: '078-c5.c5', offset: 0x800000, size: 0x200000, crc: 'e6b77e6a', loadFlag: 'load16_byte' },
      { name: '078-c6.c6', offset: 0x800001, size: 0x200000, crc: 'd779a181', loadFlag: 'load16_byte' },
      { name: '078-c7.c7', offset: 0xC00000, size: 0x100000, crc: '4f27d580', loadFlag: 'load16_byte' },
      { name: '078-c8.c8', offset: 0xC00001, size: 0x100000, crc: '0a7cc0d8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '078-m1.m1', offset: 0x0, size: 0x20000, crc: '8e9e3b10' },
    ],
    voice: [
      { name: '078-v1.v1', offset: 0x0, size: 0x200000, crc: 'e3b735ac' },
      { name: '078-v2.v2', offset: 0x200000, size: 0x200000, crc: '6a8e78c2' },
      { name: '078-v3.v3', offset: 0x400000, size: 0x100000, crc: '70bca656' },
    ],
    fixed: [
      { name: '078-s1.s1', offset: 0x0, size: 0x20000, crc: '72f8923e' },
    ],
  },
  {
    name: 'strhoop',
    description: 'Street Hoop / Street Slam / Dunk Dream (DEM-004 ~ DEH-004)',
    year: '1994',
    publisher: 'Data East Corporation',
    program: [
      { name: '079-p1.p1', offset: 0x0, size: 0x100000, crc: '5e78328e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '079-c1.c1', offset: 0x0, size: 0x200000, crc: '0581c72a', loadFlag: 'load16_byte' },
      { name: '079-c2.c2', offset: 0x1, size: 0x200000, crc: '5b9b8fb6', loadFlag: 'load16_byte' },
      { name: '079-c3.c3', offset: 0x400000, size: 0x200000, crc: 'cd65bb62', loadFlag: 'load16_byte' },
      { name: '079-c4.c4', offset: 0x400001, size: 0x200000, crc: 'a4c90213', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '079-m1.m1', offset: 0x0, size: 0x20000, crc: 'bee3455a' },
    ],
    voice: [
      { name: '079-v1.v1', offset: 0x0, size: 0x200000, crc: '718a2400' },
      { name: '079-v2.v2', offset: 0x200000, size: 0x100000, crc: '720774eb' },
    ],
    fixed: [
      { name: '079-s1.s1', offset: 0x0, size: 0x20000, crc: '3ac06665' },
    ],
  },
  {
    name: 'quizkof',
    description: 'Quiz King of Fighters (SAM-080 ~ SAH-080)',
    year: '1995',
    publisher: 'Saurus (SNK license)',
    program: [
      { name: '080-p1.p1', offset: 0x0, size: 0x100000, crc: '4440315e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '080-c1.c1', offset: 0x0, size: 0x200000, crc: 'ea1d764a', loadFlag: 'load16_byte' },
      { name: '080-c2.c2', offset: 0x1, size: 0x200000, crc: 'd331d4a4', loadFlag: 'load16_byte' },
      { name: '080-c3.c3', offset: 0x400000, size: 0x200000, crc: 'b4851bfe', loadFlag: 'load16_byte' },
      { name: '080-c4.c4', offset: 0x400001, size: 0x200000, crc: 'ca6f5460', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '080-m1.m1', offset: 0x0, size: 0x20000, crc: 'f5f44172' },
    ],
    voice: [
      { name: '080-v1.v1', offset: 0x0, size: 0x200000, crc: '0be18f60' },
      { name: '080-v2.v2', offset: 0x200000, size: 0x200000, crc: '4abde3ff' },
      { name: '080-v3.v3', offset: 0x400000, size: 0x200000, crc: 'f02844e2' },
    ],
    fixed: [
      { name: '080-s1.s1', offset: 0x0, size: 0x20000, crc: 'd7b86102' },
    ],
  },
  {
    name: 'ssideki3',
    description: 'Super Sidekicks 3 - The Next Glory / Tokuten Ou 3 - Eikou e no Chousen',
    year: '1995',
    publisher: 'SNK',
    program: [
      { name: '081-p1.p1', offset: 0x100000, size: 0x100000, crc: '6bc27a3d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '081-c1.c1', offset: 0x0, size: 0x200000, crc: '1fb68ebe', loadFlag: 'load16_byte' },
      { name: '081-c2.c2', offset: 0x1, size: 0x200000, crc: 'b28d928f', loadFlag: 'load16_byte' },
      { name: '081-c3.c3', offset: 0x400000, size: 0x200000, crc: '3b2572e8', loadFlag: 'load16_byte' },
      { name: '081-c4.c4', offset: 0x400001, size: 0x200000, crc: '47d26a7c', loadFlag: 'load16_byte' },
      { name: '081-c5.c5', offset: 0x800000, size: 0x200000, crc: '17d42f0d', loadFlag: 'load16_byte' },
      { name: '081-c6.c6', offset: 0x800001, size: 0x200000, crc: '6b53fb75', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '081-m1.m1', offset: 0x0, size: 0x20000, crc: '82fcd863' },
    ],
    voice: [
      { name: '081-v1.v1', offset: 0x0, size: 0x200000, crc: '201fa1e1' },
      { name: '081-v2.v2', offset: 0x200000, size: 0x200000, crc: 'acf29d96' },
      { name: '081-v3.v3', offset: 0x400000, size: 0x200000, crc: 'e524e415' },
    ],
    fixed: [
      { name: '081-s1.s1', offset: 0x0, size: 0x20000, crc: '7626da34' },
    ],
  },
  {
    name: 'doubledr',
    description: 'Double Dragon (Neo-Geo)',
    year: '1995',
    publisher: 'Technos Japan',
    program: [
      { name: '082-p1.p1', offset: 0x100000, size: 0x100000, crc: '34ab832a', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '082-c1.c1', offset: 0x0, size: 0x200000, crc: 'b478c725', loadFlag: 'load16_byte' },
      { name: '082-c2.c2', offset: 0x1, size: 0x200000, crc: '2857da32', loadFlag: 'load16_byte' },
      { name: '082-c3.c3', offset: 0x400000, size: 0x200000, crc: '8b0d378e', loadFlag: 'load16_byte' },
      { name: '082-c4.c4', offset: 0x400001, size: 0x200000, crc: 'c7d2f596', loadFlag: 'load16_byte' },
      { name: '082-c5.c5', offset: 0x800000, size: 0x200000, crc: 'ec87bff6', loadFlag: 'load16_byte' },
      { name: '082-c6.c6', offset: 0x800001, size: 0x200000, crc: '844a8a11', loadFlag: 'load16_byte' },
      { name: '082-c7.c7', offset: 0xC00000, size: 0x100000, crc: '727c4d02', loadFlag: 'load16_byte' },
      { name: '082-c8.c8', offset: 0xC00001, size: 0x100000, crc: '69a5fa37', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '082-m1.m1', offset: 0x0, size: 0x20000, crc: '10b144de' },
    ],
    voice: [
      { name: '082-v1.v1', offset: 0x0, size: 0x200000, crc: 'cc1128e4' },
      { name: '082-v2.v2', offset: 0x200000, size: 0x200000, crc: 'c3ff5554' },
    ],
    fixed: [
      { name: '082-s1.s1', offset: 0x0, size: 0x20000, crc: 'bef995c5' },
    ],
  },
  {
    name: 'pbobblen',
    description: 'Puzzle Bobble / Bust-A-Move (Neo-Geo, NGM-083)',
    year: '1994',
    publisher: 'Taito',
    program: [
      { name: 'd96-07.ep1', offset: 0x0, size: 0x80000, crc: '6102ca14', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '068-c1.c1', offset: 0x0, size: 0x100000, crc: '7f250f76', loadFlag: 'load16_byte' },
      { name: '068-c2.c2', offset: 0x1, size: 0x100000, crc: '20912873', loadFlag: 'load16_byte' },
      { name: '068-c3.c3', offset: 0x200000, size: 0x100000, crc: '4b641ba1', loadFlag: 'load16_byte' },
      { name: '068-c4.c4', offset: 0x200001, size: 0x100000, crc: '35072596', loadFlag: 'load16_byte' },
      { name: 'd96-02.c5', offset: 0x400000, size: 0x80000, crc: 'e89ad494', loadFlag: 'load16_byte' },
      { name: 'd96-03.c6', offset: 0x400001, size: 0x80000, crc: '4b42d7eb', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'd96-06.m1', offset: 0x0, size: 0x20000, crc: 'f424368a' },
    ],
    voice: [
      { name: '068-v1.v1', offset: 0x0, size: 0x100000, crc: '2ced86df' },
      { name: '068-v2.v2', offset: 0x100000, size: 0x100000, crc: '970851ab' },
      { name: 'd96-01.v3', offset: 0x200000, size: 0x100000, crc: '0840cbc4' },
      { name: 'd96-05.v4', offset: 0x300000, size: 0x80000, crc: '0a548948' },
    ],
    fixed: [
      { name: 'd96-04.s1', offset: 0x0, size: 0x20000, crc: '9caae538' },
    ],
  },
  {
    name: 'kof95',
    description: 'The King of Fighters \'95 (NGM-084)',
    year: '1995',
    publisher: 'SNK',
    program: [
      { name: '084-p1.p1', offset: 0x100000, size: 0x100000, crc: '2cba2716', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '084-c1.c1', offset: 0x0, size: 0x400000, crc: 'fe087e32', loadFlag: 'load16_byte' },
      { name: '084-c2.c2', offset: 0x1, size: 0x400000, crc: '07864e09', loadFlag: 'load16_byte' },
      { name: '084-c3.c3', offset: 0x800000, size: 0x400000, crc: 'a4e65d1b', loadFlag: 'load16_byte' },
      { name: '084-c4.c4', offset: 0x800001, size: 0x400000, crc: 'c1ace468', loadFlag: 'load16_byte' },
      { name: '084-c5.c5', offset: 0x1000000, size: 0x200000, crc: '8a2c1edc', loadFlag: 'load16_byte' },
      { name: '084-c6.c6', offset: 0x1000001, size: 0x200000, crc: 'f593ac35', loadFlag: 'load16_byte' },
      { name: '084-c7.c7', offset: 0x1800000, size: 0x100000, crc: '9904025f', loadFlag: 'load16_byte' },
      { name: '084-c8.c8', offset: 0x1800001, size: 0x100000, crc: '78eb0f9b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '084-m1.m1', offset: 0x0, size: 0x20000, crc: '6f2d7429' },
    ],
    voice: [
      { name: '084-v1.v1', offset: 0x0, size: 0x400000, crc: '84861b56' },
      { name: '084-v2.v2', offset: 0x400000, size: 0x200000, crc: 'b38a2803' },
      { name: '084-v3.v3', offset: 0x800000, size: 0x100000, crc: 'd683a338' },
    ],
    fixed: [
      { name: '084-s1.s1', offset: 0x0, size: 0x20000, crc: 'de716f8a' },
    ],
  },
  {
    name: 'twsoc96',
    description: 'Tecmo World Soccer \'96',
    year: '1996',
    publisher: 'Tecmo',
    program: [
      { name: '086-p1.p1', offset: 0x0, size: 0x100000, crc: '03e20ab6', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '086-c1.c1', offset: 0x0, size: 0x400000, crc: '2611bc2a', loadFlag: 'load16_byte' },
      { name: '086-c2.c2', offset: 0x1, size: 0x400000, crc: '6b0d6827', loadFlag: 'load16_byte' },
      { name: '086-c3.c3', offset: 0x800000, size: 0x100000, crc: '750ddc0c', loadFlag: 'load16_byte' },
      { name: '086-c4.c4', offset: 0x800001, size: 0x100000, crc: '7a6e7d82', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '086-m1.m1', offset: 0x0, size: 0x20000, crc: 'cb82bc5d' },
    ],
    voice: [
      { name: '086-v1.v1', offset: 0x0, size: 0x200000, crc: '97bf1986' },
      { name: '086-v2.v2', offset: 0x200000, size: 0x200000, crc: 'b7eb05df' },
    ],
    fixed: [
      { name: '086-s1.s1', offset: 0x0, size: 0x20000, crc: '6f5e2b3a' },
    ],
  },
  {
    name: 'samsho3',
    description: 'Samurai Shodown III / Samurai Spirits - Zankurou Musouken (NGM-087)',
    year: '1995',
    publisher: 'SNK',
    program: [
      { name: '087-epr.ep1', offset: 0x0, size: 0x80000, crc: '23e09bb8', loadFlag: 'load16_word_swap' },
      { name: '087-epr.ep2', offset: 0x80000, size: 0x80000, crc: '256f5302', loadFlag: 'load16_word_swap' },
      { name: '087-epr.ep3', offset: 0x100000, size: 0x80000, crc: 'bf2db5dd', loadFlag: 'load16_word_swap' },
      { name: '087-epr.ep4', offset: 0x180000, size: 0x80000, crc: '53e60c58', loadFlag: 'load16_word_swap' },
      { name: '087-p5.p5', offset: 0x200000, size: 0x100000, crc: 'e86ca4af', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '087-c1.c1', offset: 0x0, size: 0x400000, crc: '07a233bc', loadFlag: 'load16_byte' },
      { name: '087-c2.c2', offset: 0x1, size: 0x400000, crc: '7a413592', loadFlag: 'load16_byte' },
      { name: '087-c3.c3', offset: 0x800000, size: 0x400000, crc: '8b793796', loadFlag: 'load16_byte' },
      { name: '087-c4.c4', offset: 0x800001, size: 0x400000, crc: '728fbf11', loadFlag: 'load16_byte' },
      { name: '087-c5.c5', offset: 0x1000000, size: 0x400000, crc: '172ab180', loadFlag: 'load16_byte' },
      { name: '087-c6.c6', offset: 0x1000001, size: 0x400000, crc: '002ff8f3', loadFlag: 'load16_byte' },
      { name: '087-c7.c7', offset: 0x1800000, size: 0x100000, crc: 'ae450e3d', loadFlag: 'load16_byte' },
      { name: '087-c8.c8', offset: 0x1800001, size: 0x100000, crc: 'a9e82717', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '087-m1.m1', offset: 0x0, size: 0x20000, crc: '8e6440eb' },
    ],
    voice: [
      { name: '087-v1.v1', offset: 0x0, size: 0x400000, crc: '84bdd9a0' },
      { name: '087-v2.v2', offset: 0x400000, size: 0x200000, crc: 'ac0f261a' },
    ],
    fixed: [
      { name: '087-s1.s1', offset: 0x0, size: 0x20000, crc: '74ec7d9f' },
    ],
  },
  {
    name: 'stakwin',
    description: 'Stakes Winner / Stakes Winner - GI Kinzen Seiha e no Michi',
    year: '1995',
    publisher: 'Saurus',
    program: [
      { name: '088-p1.p1', offset: 0x100000, size: 0x100000, crc: 'bd5814f6', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '088-c1.c1', offset: 0x0, size: 0x200000, crc: '6e733421', loadFlag: 'load16_byte' },
      { name: '088-c2.c2', offset: 0x1, size: 0x200000, crc: '4d865347', loadFlag: 'load16_byte' },
      { name: '088-c3.c3', offset: 0x400000, size: 0x200000, crc: '8fa5a9eb', loadFlag: 'load16_byte' },
      { name: '088-c4.c4', offset: 0x400001, size: 0x200000, crc: '4604f0dc', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '088-m1.m1', offset: 0x0, size: 0x20000, crc: '2fe1f499' },
    ],
    voice: [
      { name: '088-v1.v1', offset: 0x0, size: 0x200000, crc: 'b7785023' },
    ],
    fixed: [
      { name: '088-s1.s1', offset: 0x0, size: 0x20000, crc: '073cb208' },
    ],
  },
  {
    name: 'pulstar',
    description: 'Pulstar',
    year: '1995',
    publisher: 'Aicom',
    program: [
      { name: '089-p1.p1', offset: 0x0, size: 0x100000, crc: '5e5847a2', loadFlag: 'load16_word_swap' },
      { name: '089-p2.sp2', offset: 0x100000, size: 0x200000, crc: '028b774c', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '089-c1.c1', offset: 0x0, size: 0x400000, crc: 'f4e97332', loadFlag: 'load16_byte' },
      { name: '089-c2.c2', offset: 0x1, size: 0x400000, crc: '836d14da', loadFlag: 'load16_byte' },
      { name: '089-c3.c3', offset: 0x800000, size: 0x400000, crc: '913611c4', loadFlag: 'load16_byte' },
      { name: '089-c4.c4', offset: 0x800001, size: 0x400000, crc: '44cef0e3', loadFlag: 'load16_byte' },
      { name: '089-c5.c5', offset: 0x1000000, size: 0x400000, crc: '89baa1d7', loadFlag: 'load16_byte' },
      { name: '089-c6.c6', offset: 0x1000001, size: 0x400000, crc: 'b2594d56', loadFlag: 'load16_byte' },
      { name: '089-c7.c7', offset: 0x1800000, size: 0x200000, crc: '6a5618ca', loadFlag: 'load16_byte' },
      { name: '089-c8.c8', offset: 0x1800001, size: 0x200000, crc: 'a223572d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '089-m1.m1', offset: 0x0, size: 0x20000, crc: 'ff3df7c7' },
    ],
    voice: [
      { name: '089-v1.v1', offset: 0x0, size: 0x400000, crc: '6f726ecb' },
      { name: '089-v2.v2', offset: 0x400000, size: 0x400000, crc: '9d2db551' },
    ],
    fixed: [
      { name: '089-s1.s1', offset: 0x0, size: 0x20000, crc: 'c79fc2c8' },
    ],
  },
  {
    name: 'whp',
    description: 'World Heroes Perfect',
    year: '1995',
    publisher: 'ADK / SNK',
    program: [
      { name: '090-p1.p1', offset: 0x100000, size: 0x100000, crc: 'afaa4702', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '090-c1.c1', offset: 0x0, size: 0x400000, crc: 'cd30ed9b', loadFlag: 'load16_byte' },
      { name: '090-c2.c2', offset: 0x1, size: 0x400000, crc: '10eed5ee', loadFlag: 'load16_byte' },
      { name: '064-c3.c3', offset: 0x800000, size: 0x200000, crc: '436d1b31', loadFlag: 'load16_byte' },
      { name: '064-c4.c4', offset: 0x800001, size: 0x200000, crc: 'f9c8dd26', loadFlag: 'load16_byte' },
      { name: '064-c5.c5', offset: 0x1000000, size: 0x200000, crc: '8e34a9f4', loadFlag: 'load16_byte' },
      { name: '064-c6.c6', offset: 0x1000001, size: 0x200000, crc: 'a43e4766', loadFlag: 'load16_byte' },
      { name: '064-c7.c7', offset: 0x1800000, size: 0x200000, crc: '59d97215', loadFlag: 'load16_byte' },
      { name: '064-c8.c8', offset: 0x1800001, size: 0x200000, crc: 'fc092367', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '090-m1.m1', offset: 0x0, size: 0x20000, crc: '28065668' },
    ],
    voice: [
      { name: '090-v1.v1', offset: 0x0, size: 0x200000, crc: '30cf2709' },
      { name: '064-v2.v2', offset: 0x200000, size: 0x200000, crc: 'b6527edd' },
      { name: '090-v3.v3', offset: 0x400000, size: 0x200000, crc: '1908a7ce' },
    ],
    fixed: [
      { name: '090-s1.s1', offset: 0x0, size: 0x20000, crc: '174a880f' },
    ],
  },
  {
    name: 'kabukikl',
    description: 'Far East of Eden - Kabuki Klash / Tengai Makyou - Shin Den',
    year: '1995',
    publisher: 'Hudson',
    program: [
      { name: '092-p1.p1', offset: 0x100000, size: 0x100000, crc: '28ec9b77', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '092-c1.c1', offset: 0x0, size: 0x400000, crc: '2a9fab01', loadFlag: 'load16_byte' },
      { name: '092-c2.c2', offset: 0x1, size: 0x400000, crc: '6d2bac02', loadFlag: 'load16_byte' },
      { name: '092-c3.c3', offset: 0x800000, size: 0x400000, crc: '5da735d6', loadFlag: 'load16_byte' },
      { name: '092-c4.c4', offset: 0x800001, size: 0x400000, crc: 'de07f997', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '092-m1.m1', offset: 0x0, size: 0x20000, crc: '91957ef6' },
    ],
    voice: [
      { name: '092-v1.v1', offset: 0x0, size: 0x200000, crc: '69e90596' },
      { name: '092-v2.v2', offset: 0x200000, size: 0x200000, crc: '7abdb75d' },
      { name: '092-v3.v3', offset: 0x400000, size: 0x200000, crc: 'eccc98d3' },
      { name: '092-v4.v4', offset: 0x600000, size: 0x100000, crc: 'a7c9c949' },
    ],
    fixed: [
      { name: '092-s1.s1', offset: 0x0, size: 0x20000, crc: 'a3d68ee2' },
    ],
  },
  {
    name: 'neobombe',
    description: 'Neo Bomberman',
    year: '1997',
    publisher: 'Hudson',
    program: [
      { name: '093-p1.p1', offset: 0x0, size: 0x100000, crc: 'a1a71d0d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '093-c1.c1', offset: 0x0, size: 0x400000, crc: 'd1f328f8', loadFlag: 'load16_byte' },
      { name: '093-c2.c2', offset: 0x1, size: 0x400000, crc: '82c49540', loadFlag: 'load16_byte' },
      { name: '093-c3.c3', offset: 0x800000, size: 0x80000, crc: 'e37578c5', loadFlag: 'load16_byte' },
      { name: '093-c4.c4', offset: 0x800001, size: 0x80000, crc: '59826783', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '093-m1.m1', offset: 0x0, size: 0x20000, crc: 'e81e780b' },
    ],
    voice: [
      { name: '093-v1.v1', offset: 0x0, size: 0x400000, crc: '02abd4b0' },
      { name: '093-v2.v2', offset: 0x400000, size: 0x200000, crc: 'a92b8b3d' },
    ],
    fixed: [
      { name: '093-s1.s1', offset: 0x0, size: 0x20000, crc: '4b3fa119' },
    ],
  },
  {
    name: 'gowcaizr',
    description: 'Voltage Fighter - Gowcaizer / Choujin Gakuen Gowcaizer',
    year: '1995',
    publisher: 'Technos Japan',
    program: [
      { name: '094-p1.p1', offset: 0x100000, size: 0x100000, crc: '33019545', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '094-c1.c1', offset: 0x0, size: 0x200000, crc: '042f6af5', loadFlag: 'load16_byte' },
      { name: '094-c2.c2', offset: 0x1, size: 0x200000, crc: '0fbcd046', loadFlag: 'load16_byte' },
      { name: '094-c3.c3', offset: 0x400000, size: 0x200000, crc: '58bfbaa1', loadFlag: 'load16_byte' },
      { name: '094-c4.c4', offset: 0x400001, size: 0x200000, crc: '9451ee73', loadFlag: 'load16_byte' },
      { name: '094-c5.c5', offset: 0x800000, size: 0x200000, crc: 'ff9cf48c', loadFlag: 'load16_byte' },
      { name: '094-c6.c6', offset: 0x800001, size: 0x200000, crc: '31bbd918', loadFlag: 'load16_byte' },
      { name: '094-c7.c7', offset: 0xC00000, size: 0x200000, crc: '2091ec04', loadFlag: 'load16_byte' },
      { name: '094-c8.c8', offset: 0xC00001, size: 0x200000, crc: 'd80dd241', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '094-m1.m1', offset: 0x0, size: 0x20000, crc: '78c851cb' },
    ],
    voice: [
      { name: '094-v1.v1', offset: 0x0, size: 0x200000, crc: '6c31223c' },
      { name: '094-v2.v2', offset: 0x200000, size: 0x200000, crc: '8edb776c' },
      { name: '094-v3.v3', offset: 0x400000, size: 0x100000, crc: 'c63b9285' },
    ],
    fixed: [
      { name: '094-s1.s1', offset: 0x0, size: 0x20000, crc: '2f8748a2' },
    ],
  },
  {
    name: 'rbff1',
    description: 'Real Bout Fatal Fury / Real Bout Garou Densetsu (NGM-095 ~ NGH-095)',
    year: '1995',
    publisher: 'SNK',
    program: [
      { name: '095-p1.p1', offset: 0x0, size: 0x100000, crc: '63b4d8ae', loadFlag: 'load16_word_swap' },
      { name: '095-p2.sp2', offset: 0x100000, size: 0x200000, crc: 'cc15826e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '069-c1.c1', offset: 0x0, size: 0x400000, crc: 'e302f93c', loadFlag: 'load16_byte' },
      { name: '069-c2.c2', offset: 0x1, size: 0x400000, crc: '1053a455', loadFlag: 'load16_byte' },
      { name: '069-c3.c3', offset: 0x800000, size: 0x400000, crc: '1c0fde2f', loadFlag: 'load16_byte' },
      { name: '069-c4.c4', offset: 0x800001, size: 0x400000, crc: 'a25fc3d0', loadFlag: 'load16_byte' },
      { name: '095-c5.c5', offset: 0x1000000, size: 0x400000, crc: '8b9b65df', loadFlag: 'load16_byte' },
      { name: '095-c6.c6', offset: 0x1000001, size: 0x400000, crc: '3e164718', loadFlag: 'load16_byte' },
      { name: '095-c7.c7', offset: 0x1800000, size: 0x200000, crc: 'ca605e12', loadFlag: 'load16_byte' },
      { name: '095-c8.c8', offset: 0x1800001, size: 0x200000, crc: '4e6beb6c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '095-m1.m1', offset: 0x0, size: 0x20000, crc: '653492a7' },
    ],
    voice: [
      { name: '069-v1.v1', offset: 0x0, size: 0x400000, crc: '2bdbd4db' },
      { name: '069-v2.v2', offset: 0x400000, size: 0x400000, crc: 'a698a487' },
      { name: '095-v3.v3', offset: 0x800000, size: 0x400000, crc: '189d1c6c' },
    ],
    fixed: [
      { name: '095-s1.s1', offset: 0x0, size: 0x20000, crc: 'b6bf5e08' },
    ],
  },
  {
    name: 'aof3',
    description: 'Art of Fighting 3 - The Path of the Warrior / Art of Fighting - Ryuuko no Ken Gaiden',
    year: '1996',
    publisher: 'SNK',
    program: [
      { name: '096-p1.p1', offset: 0x0, size: 0x100000, crc: '9edb420d', loadFlag: 'load16_word_swap' },
      { name: '096-p2.sp2', offset: 0x100000, size: 0x200000, crc: '4d5a2602', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '096-c1.c1', offset: 0x0, size: 0x400000, crc: 'f17b8d89', loadFlag: 'load16_byte' },
      { name: '096-c2.c2', offset: 0x1, size: 0x400000, crc: '3840c508', loadFlag: 'load16_byte' },
      { name: '096-c3.c3', offset: 0x800000, size: 0x400000, crc: '55f9ee1e', loadFlag: 'load16_byte' },
      { name: '096-c4.c4', offset: 0x800001, size: 0x400000, crc: '585b7e47', loadFlag: 'load16_byte' },
      { name: '096-c5.c5', offset: 0x1000000, size: 0x400000, crc: 'c75a753c', loadFlag: 'load16_byte' },
      { name: '096-c6.c6', offset: 0x1000001, size: 0x400000, crc: '9a9d2f7a', loadFlag: 'load16_byte' },
      { name: '096-c7.c7', offset: 0x1800000, size: 0x200000, crc: '51bd8ab2', loadFlag: 'load16_byte' },
      { name: '096-c8.c8', offset: 0x1800001, size: 0x200000, crc: '9a34f99c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '096-m1.m1', offset: 0x0, size: 0x20000, crc: 'cb07b659' },
    ],
    voice: [
      { name: '096-v1.v1', offset: 0x0, size: 0x200000, crc: 'e2c32074' },
      { name: '096-v2.v2', offset: 0x200000, size: 0x200000, crc: 'a290eee7' },
      { name: '096-v3.v3', offset: 0x400000, size: 0x200000, crc: '199d12ea' },
    ],
    fixed: [
      { name: '096-s1.s1', offset: 0x0, size: 0x20000, crc: 'cc7fd344' },
    ],
  },
  {
    name: 'sonicwi3',
    description: 'Aero Fighters 3 / Sonic Wings 3',
    year: '1995',
    publisher: 'Video System Co.',
    program: [
      { name: '097-p1.p1', offset: 0x100000, size: 0x100000, crc: '0547121d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '097-c1.c1', offset: 0x0, size: 0x400000, crc: '33d0d589', loadFlag: 'load16_byte' },
      { name: '097-c2.c2', offset: 0x1, size: 0x400000, crc: '186f8b43', loadFlag: 'load16_byte' },
      { name: '097-c3.c3', offset: 0x800000, size: 0x200000, crc: 'c339fff5', loadFlag: 'load16_byte' },
      { name: '097-c4.c4', offset: 0x800001, size: 0x200000, crc: '84a40c6e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '097-m1.m1', offset: 0x0, size: 0x20000, crc: 'b20e4291' },
    ],
    voice: [
      { name: '097-v1.v1', offset: 0x0, size: 0x400000, crc: '6f885152' },
      { name: '097-v2.v2', offset: 0x400000, size: 0x200000, crc: '3359e868' },
    ],
    fixed: [
      { name: '097-s1.s1', offset: 0x0, size: 0x20000, crc: '8dd66743' },
    ],
  },
  {
    name: 'turfmast',
    description: 'Neo Turf Masters / Big Tournament Golf',
    year: '1996',
    publisher: 'Nazca',
    program: [
      { name: '200-p1.p1', offset: 0x100000, size: 0x100000, crc: '28c83048', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '200-c1.c1', offset: 0x0, size: 0x400000, crc: '8e7bf41a', loadFlag: 'load16_byte' },
      { name: '200-c2.c2', offset: 0x1, size: 0x400000, crc: '5a65a8ce', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '200-m1.m1', offset: 0x0, size: 0x20000, crc: '9994ac00' },
    ],
    voice: [
      { name: '200-v1.v1', offset: 0x0, size: 0x200000, crc: '00fd48d2' },
      { name: '200-v2.v2', offset: 0x200000, size: 0x200000, crc: '082acb31' },
      { name: '200-v3.v3', offset: 0x400000, size: 0x200000, crc: '7abca053' },
      { name: '200-v4.v4', offset: 0x600000, size: 0x200000, crc: '6c7b4902' },
    ],
    fixed: [
      { name: '200-s1.s1', offset: 0x0, size: 0x20000, crc: '9a5402b2' },
    ],
  },
  {
    name: 'mslug',
    description: 'Metal Slug - Super Vehicle-001',
    year: '1996',
    publisher: 'Nazca',
    program: [
      { name: '201-p1.p1', offset: 0x100000, size: 0x100000, crc: '08d8daa5', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '201-c1.c1', offset: 0x0, size: 0x400000, crc: '72813676', loadFlag: 'load16_byte' },
      { name: '201-c2.c2', offset: 0x1, size: 0x400000, crc: '96f62574', loadFlag: 'load16_byte' },
      { name: '201-c3.c3', offset: 0x800000, size: 0x400000, crc: '5121456a', loadFlag: 'load16_byte' },
      { name: '201-c4.c4', offset: 0x800001, size: 0x400000, crc: 'f4ad59a3', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '201-m1.m1', offset: 0x0, size: 0x20000, crc: 'c28b3253' },
    ],
    voice: [
      { name: '201-v1.v1', offset: 0x0, size: 0x400000, crc: '23d22ed1' },
      { name: '201-v2.v2', offset: 0x400000, size: 0x400000, crc: '472cf9db' },
    ],
    fixed: [
      { name: '201-s1.s1', offset: 0x0, size: 0x20000, crc: '2f55958d' },
    ],
  },
  {
    name: 'puzzledp',
    description: 'Puzzle De Pon!',
    year: '1995',
    publisher: 'Visco',
    program: [
      { name: '202-p1.p1', offset: 0x0, size: 0x80000, crc: '2b61415b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '202-c1.c1', offset: 0x0, size: 0x100000, crc: 'cc0095ef', loadFlag: 'load16_byte' },
      { name: '202-c2.c2', offset: 0x1, size: 0x100000, crc: '42371307', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '202-m1.m1', offset: 0x0, size: 0x20000, crc: '9c0291ea' },
    ],
    voice: [
      { name: '202-v1.v1', offset: 0x0, size: 0x80000, crc: 'debeb8fb' },
    ],
    fixed: [
      { name: '202-s1.s1', offset: 0x0, size: 0x20000, crc: 'cd19264f' },
    ],
  },
  {
    name: 'moshougi',
    description: 'Shougi no Tatsujin - Master of Shougi',
    year: '1995',
    publisher: 'ADK / SNK',
    program: [
      { name: '203-p1.p1', offset: 0x0, size: 0x100000, crc: '7ba70e2d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '203-c1.c1', offset: 0x0, size: 0x200000, crc: 'bba9e8c0', loadFlag: 'load16_byte' },
      { name: '203-c2.c2', offset: 0x1, size: 0x200000, crc: '2574be03', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '203-m1.m1', offset: 0x0, size: 0x20000, crc: 'a602c2c2' },
    ],
    voice: [
      { name: '203-v1.v1', offset: 0x0, size: 0x200000, crc: 'baa2b9a5' },
    ],
    fixed: [
      { name: '203-s1.s1', offset: 0x0, size: 0x20000, crc: 'bfdc8309' },
    ],
  },
  {
    name: 'marukodq',
    description: 'Chibi Maruko-chan: Maruko Deluxe Quiz',
    year: '1995',
    publisher: 'Takara',
    program: [
      { name: '206-p1.p1', offset: 0x0, size: 0x100000, crc: 'c33ed21e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '206-c1.c1', offset: 0x0, size: 0x400000, crc: '846e4e8e', loadFlag: 'load16_byte' },
      { name: '206-c2.c2', offset: 0x1, size: 0x400000, crc: '1cba876d', loadFlag: 'load16_byte' },
      { name: '206-c3.c3', offset: 0x800000, size: 0x100000, crc: '79aa2b48', loadFlag: 'load16_byte' },
      { name: '206-c4.c4', offset: 0x800001, size: 0x100000, crc: '55e1314d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '206-m1.m1', offset: 0x0, size: 0x20000, crc: '0e22902e' },
    ],
    voice: [
      { name: '206-v1.v1', offset: 0x0, size: 0x200000, crc: '5385eca8' },
      { name: '206-v2.v2', offset: 0x200000, size: 0x200000, crc: 'f8c55404' },
    ],
    fixed: [
      { name: '206-s1.s1', offset: 0x0, size: 0x20000, crc: 'f0b68780' },
    ],
  },
  {
    name: 'neomrdo',
    description: 'Neo Mr. Do!',
    year: '1996',
    publisher: 'Visco',
    program: [
      { name: '207-p1.p1', offset: 0x0, size: 0x100000, crc: '334ea51e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '207-c1.c1', offset: 0x0, size: 0x200000, crc: 'c7541b9d', loadFlag: 'load16_byte' },
      { name: '207-c2.c2', offset: 0x1, size: 0x200000, crc: 'f57166d2', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '207-m1.m1', offset: 0x0, size: 0x20000, crc: 'b5b74a95' },
    ],
    voice: [
      { name: '207-v1.v1', offset: 0x0, size: 0x200000, crc: '4143c052' },
    ],
    fixed: [
      { name: '207-s1.s1', offset: 0x0, size: 0x20000, crc: '6aebafce' },
    ],
  },
  {
    name: 'sdodgeb',
    description: 'Super Dodge Ball / Kunio no Nekketsu Toukyuu Densetsu',
    year: '1996',
    publisher: 'Technos Japan',
    program: [
      { name: '208-p1.p1', offset: 0x100000, size: 0x100000, crc: '127f3d32', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '208-c1.c1', offset: 0x0, size: 0x400000, crc: '93d8619b', loadFlag: 'load16_byte' },
      { name: '208-c2.c2', offset: 0x1, size: 0x400000, crc: '1c737bb6', loadFlag: 'load16_byte' },
      { name: '208-c3.c3', offset: 0x800000, size: 0x200000, crc: '14cb1703', loadFlag: 'load16_byte' },
      { name: '208-c4.c4', offset: 0x800001, size: 0x200000, crc: 'c7165f19', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '208-m1.m1', offset: 0x0, size: 0x20000, crc: '0a5f3325' },
    ],
    voice: [
      { name: '208-v1.v1', offset: 0x0, size: 0x400000, crc: 'e7899a24' },
    ],
    fixed: [
      { name: '208-s1.s1', offset: 0x0, size: 0x20000, crc: '64abd6b3' },
    ],
  },
  {
    name: 'goalx3',
    description: 'Goal! Goal! Goal!',
    year: '1995',
    publisher: 'Visco',
    program: [
      { name: '209-p1.p1', offset: 0x100000, size: 0x100000, crc: '2a019a79', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '209-c1.c1', offset: 0x0, size: 0x400000, crc: 'b49d980e', loadFlag: 'load16_byte' },
      { name: '209-c2.c2', offset: 0x1, size: 0x400000, crc: '5649b015', loadFlag: 'load16_byte' },
      { name: '209-c3.c3', offset: 0x800000, size: 0x100000, crc: '5f91bace', loadFlag: 'load16_byte' },
      { name: '209-c4.c4', offset: 0x800001, size: 0x100000, crc: '1e9f76f2', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '209-m1.m1', offset: 0x0, size: 0x20000, crc: 'cd758325' },
    ],
    voice: [
      { name: '209-v1.v1', offset: 0x0, size: 0x200000, crc: 'ef214212' },
    ],
    fixed: [
      { name: '209-s1.s1', offset: 0x0, size: 0x20000, crc: 'c0eaad86' },
    ],
  },
  {
    name: 'overtop',
    description: 'Over Top',
    year: '1996',
    publisher: 'ADK',
    program: [
      { name: '212-p1.p1', offset: 0x100000, size: 0x100000, crc: '16c063a9', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '212-c1.c1', offset: 0x0, size: 0x400000, crc: '50f43087', loadFlag: 'load16_byte' },
      { name: '212-c2.c2', offset: 0x1, size: 0x400000, crc: 'a5b39807', loadFlag: 'load16_byte' },
      { name: '212-c3.c3', offset: 0x800000, size: 0x400000, crc: '9252ea02', loadFlag: 'load16_byte' },
      { name: '212-c4.c4', offset: 0x800001, size: 0x400000, crc: '5f41a699', loadFlag: 'load16_byte' },
      { name: '212-c5.c5', offset: 0x1000000, size: 0x200000, crc: 'fc858bef', loadFlag: 'load16_byte' },
      { name: '212-c6.c6', offset: 0x1000001, size: 0x200000, crc: '0589c15e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '212-m1.m1', offset: 0x0, size: 0x20000, crc: 'fcab6191' },
    ],
    voice: [
      { name: '212-v1.v1', offset: 0x0, size: 0x400000, crc: '013d4ef9' },
    ],
    fixed: [
      { name: '212-s1.s1', offset: 0x0, size: 0x20000, crc: '481d3ddc' },
    ],
  },
  {
    name: 'neodrift',
    description: 'Neo Drift Out - New Technology',
    year: '1996',
    publisher: 'Visco',
    program: [
      { name: '213-p1.p1', offset: 0x100000, size: 0x100000, crc: 'e397d798', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '213-c1.c1', offset: 0x0, size: 0x400000, crc: '3edc8bd3', loadFlag: 'load16_byte' },
      { name: '213-c2.c2', offset: 0x1, size: 0x400000, crc: '46ae5f16', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '213-m1.m1', offset: 0x0, size: 0x20000, crc: '200045f1' },
    ],
    voice: [
      { name: '213-v1.v1', offset: 0x0, size: 0x200000, crc: 'a421c076' },
      { name: '213-v2.v2', offset: 0x200000, size: 0x200000, crc: '233c7dd9' },
    ],
    fixed: [
      { name: '213-s1.s1', offset: 0x0, size: 0x20000, crc: 'b76b61bc' },
    ],
  },
  {
    name: 'kof96',
    description: 'The King of Fighters \'96 (NGM-214)',
    year: '1996',
    publisher: 'SNK',
    program: [
      { name: '214-p1.p1', offset: 0x0, size: 0x100000, crc: '52755d74', loadFlag: 'load16_word_swap' },
      { name: '214-p2.sp2', offset: 0x100000, size: 0x200000, crc: '002ccb73', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '214-c1.c1', offset: 0x0, size: 0x400000, crc: '7ecf4aa2', loadFlag: 'load16_byte' },
      { name: '214-c2.c2', offset: 0x1, size: 0x400000, crc: '05b54f37', loadFlag: 'load16_byte' },
      { name: '214-c3.c3', offset: 0x800000, size: 0x400000, crc: '64989a65', loadFlag: 'load16_byte' },
      { name: '214-c4.c4', offset: 0x800001, size: 0x400000, crc: 'afbea515', loadFlag: 'load16_byte' },
      { name: '214-c5.c5', offset: 0x1000000, size: 0x400000, crc: '2a3bbd26', loadFlag: 'load16_byte' },
      { name: '214-c6.c6', offset: 0x1000001, size: 0x400000, crc: '44d30dc7', loadFlag: 'load16_byte' },
      { name: '214-c7.c7', offset: 0x1800000, size: 0x400000, crc: '3687331b', loadFlag: 'load16_byte' },
      { name: '214-c8.c8', offset: 0x1800001, size: 0x400000, crc: 'fa1461ad', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '214-m1.m1', offset: 0x0, size: 0x20000, crc: 'dabc427c' },
    ],
    voice: [
      { name: '214-v1.v1', offset: 0x0, size: 0x400000, crc: '63f7b045' },
      { name: '214-v2.v2', offset: 0x400000, size: 0x400000, crc: '25929059' },
      { name: '214-v3.v3', offset: 0x800000, size: 0x200000, crc: '92a2257d' },
    ],
    fixed: [
      { name: '214-s1.s1', offset: 0x0, size: 0x20000, crc: '1254cbdb' },
    ],
  },
  {
    name: 'ssideki4',
    description: 'The Ultimate 11 - The SNK Football Championship / Tokuten Ou - Honoo no Libero',
    year: '1996',
    publisher: 'SNK',
    program: [
      { name: '215-p1.p1', offset: 0x100000, size: 0x100000, crc: '519b4ba3', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '215-c1.c1', offset: 0x0, size: 0x400000, crc: '8ff444f5', loadFlag: 'load16_byte' },
      { name: '215-c2.c2', offset: 0x1, size: 0x400000, crc: '5b155037', loadFlag: 'load16_byte' },
      { name: '215-c3.c3', offset: 0x800000, size: 0x400000, crc: '456a073a', loadFlag: 'load16_byte' },
      { name: '215-c4.c4', offset: 0x800001, size: 0x400000, crc: '43c182e1', loadFlag: 'load16_byte' },
      { name: '215-c5.c5', offset: 0x1000000, size: 0x200000, crc: '0c6f97ec', loadFlag: 'load16_byte' },
      { name: '215-c6.c6', offset: 0x1000001, size: 0x200000, crc: '329c5e1b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '215-m1.m1', offset: 0x0, size: 0x20000, crc: 'a932081d' },
    ],
    voice: [
      { name: '215-v1.v1', offset: 0x0, size: 0x400000, crc: '877d1409' },
      { name: '215-v2.v2', offset: 0x400000, size: 0x200000, crc: '1bfa218b' },
    ],
    fixed: [
      { name: '215-s1.s1', offset: 0x0, size: 0x20000, crc: 'f0fe5c36' },
    ],
  },
  {
    name: 'kizuna',
    description: 'Kizuna Encounter - Super Tag Battle / Fu\'un Super Tag Battle',
    year: '1996',
    publisher: 'SNK',
    program: [
      { name: '216-p1.p1', offset: 0x100000, size: 0x100000, crc: '75d2b3de', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '059-c1.c1', offset: 0x0, size: 0x200000, crc: '763ba611', loadFlag: 'load16_byte' },
      { name: '059-c2.c2', offset: 0x1, size: 0x200000, crc: 'e05e8ca6', loadFlag: 'load16_byte' },
      { name: '216-c3.c3', offset: 0x800000, size: 0x400000, crc: '665c9f16', loadFlag: 'load16_byte' },
      { name: '216-c4.c4', offset: 0x800001, size: 0x400000, crc: '7f5d03db', loadFlag: 'load16_byte' },
      { name: '059-c5.c5', offset: 0x1000000, size: 0x200000, crc: '59013f9e', loadFlag: 'load16_byte' },
      { name: '059-c6.c6', offset: 0x1000001, size: 0x200000, crc: '1c8d5def', loadFlag: 'load16_byte' },
      { name: '059-c7.c7', offset: 0x1800000, size: 0x200000, crc: 'c88f7035', loadFlag: 'load16_byte' },
      { name: '059-c8.c8', offset: 0x1800001, size: 0x200000, crc: '484ce3ba', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '216-m1.m1', offset: 0x0, size: 0x20000, crc: '1b096820' },
    ],
    voice: [
      { name: '059-v1.v1', offset: 0x0, size: 0x200000, crc: '530c50fd' },
      { name: '216-v2.v2', offset: 0x200000, size: 0x200000, crc: '03667a8d' },
      { name: '059-v3.v3', offset: 0x400000, size: 0x200000, crc: '7038c2f9' },
      { name: '216-v4.v4', offset: 0x600000, size: 0x200000, crc: '31b99bd6' },
    ],
    fixed: [
      { name: '216-s1.s1', offset: 0x0, size: 0x20000, crc: 'efdc72d7' },
    ],
  },
  {
    name: 'ninjamas',
    description: 'Ninja Master\'s - Haoh-ninpo-cho',
    year: '1996',
    publisher: 'ADK / SNK',
    program: [
      { name: '217-p1.p1', offset: 0x0, size: 0x100000, crc: '3e97ed69', loadFlag: 'load16_word_swap' },
      { name: '217-p2.sp2', offset: 0x100000, size: 0x200000, crc: '191fca88', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '217-c1.c1', offset: 0x0, size: 0x400000, crc: '5fe97bc4', loadFlag: 'load16_byte' },
      { name: '217-c2.c2', offset: 0x1, size: 0x400000, crc: '886e0d66', loadFlag: 'load16_byte' },
      { name: '217-c3.c3', offset: 0x800000, size: 0x400000, crc: '59e8525f', loadFlag: 'load16_byte' },
      { name: '217-c4.c4', offset: 0x800001, size: 0x400000, crc: '8521add2', loadFlag: 'load16_byte' },
      { name: '217-c5.c5', offset: 0x1000000, size: 0x400000, crc: 'fb1896e5', loadFlag: 'load16_byte' },
      { name: '217-c6.c6', offset: 0x1000001, size: 0x400000, crc: '1c98c54b', loadFlag: 'load16_byte' },
      { name: '217-c7.c7', offset: 0x1800000, size: 0x400000, crc: '8b0ede2e', loadFlag: 'load16_byte' },
      { name: '217-c8.c8', offset: 0x1800001, size: 0x400000, crc: 'a085bb61', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '217-m1.m1', offset: 0x0, size: 0x20000, crc: 'd00fb2af' },
    ],
    voice: [
      { name: '217-v1.v1', offset: 0x0, size: 0x400000, crc: '1c34e013' },
      { name: '217-v2.v2', offset: 0x400000, size: 0x200000, crc: '22f1c681' },
    ],
    fixed: [
      { name: '217-s1.s1', offset: 0x0, size: 0x20000, crc: '8ff782f0' },
    ],
  },
  {
    name: 'ragnagrd',
    description: 'Ragnagard / Shin-Oh-Ken',
    year: '1996',
    publisher: 'Saurus',
    program: [
      { name: '218-p1.p1', offset: 0x100000, size: 0x100000, crc: 'ca372303', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '218-c1.c1', offset: 0x0, size: 0x400000, crc: 'c31500a4', loadFlag: 'load16_byte' },
      { name: '218-c2.c2', offset: 0x1, size: 0x400000, crc: '98aba1f9', loadFlag: 'load16_byte' },
      { name: '218-c3.c3', offset: 0x800000, size: 0x400000, crc: '833c163a', loadFlag: 'load16_byte' },
      { name: '218-c4.c4', offset: 0x800001, size: 0x400000, crc: 'c1a30f69', loadFlag: 'load16_byte' },
      { name: '218-c5.c5', offset: 0x1000000, size: 0x400000, crc: '6b6de0ff', loadFlag: 'load16_byte' },
      { name: '218-c6.c6', offset: 0x1000001, size: 0x400000, crc: '94beefcf', loadFlag: 'load16_byte' },
      { name: '218-c7.c7', offset: 0x1800000, size: 0x400000, crc: 'de6f9b28', loadFlag: 'load16_byte' },
      { name: '218-c8.c8', offset: 0x1800001, size: 0x400000, crc: 'd9b311f6', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '218-m1.m1', offset: 0x0, size: 0x20000, crc: '17028bcf' },
    ],
    voice: [
      { name: '218-v1.v1', offset: 0x0, size: 0x400000, crc: '61eee7f4' },
      { name: '218-v2.v2', offset: 0x400000, size: 0x400000, crc: '6104e20b' },
    ],
    fixed: [
      { name: '218-s1.s1', offset: 0x0, size: 0x20000, crc: '7d402f9a' },
    ],
  },
  {
    name: 'pgoal',
    description: 'Pleasure Goal / Futsal - 5 on 5 Mini Soccer (NGM-219)',
    year: '1996',
    publisher: 'Saurus',
    program: [
      { name: '219-p1.p1', offset: 0x100000, size: 0x100000, crc: '6af0e574', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '219-c1.c1', offset: 0x0, size: 0x400000, crc: '67fec4dc', loadFlag: 'load16_byte' },
      { name: '219-c2.c2', offset: 0x1, size: 0x400000, crc: '86ed01f2', loadFlag: 'load16_byte' },
      { name: '219-c3.c3', offset: 0x800000, size: 0x200000, crc: '5fdad0a5', loadFlag: 'load16_byte' },
      { name: '219-c4.c4', offset: 0x800001, size: 0x200000, crc: 'f57b4a1c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '219-m1.m1', offset: 0x0, size: 0x20000, crc: '958efdc8' },
    ],
    voice: [
      { name: '219-v1.v1', offset: 0x0, size: 0x400000, crc: 'd0ae33d9' },
    ],
    fixed: [
      { name: '219-s1.s1', offset: 0x0, size: 0x20000, crc: '002f3c88' },
    ],
  },
  {
    name: 'ironclad',
    description: 'Choutetsu Brikin\'ger / Iron Clad (prototype)',
    year: '1996',
    publisher: 'Saurus',
    program: [
      { name: 'proto_220-p1.p1', offset: 0x100000, size: 0x100000, crc: '62a942c6', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'proto_220-c1.c1', offset: 0x0, size: 0x400000, crc: '9aa2b7dc', loadFlag: 'load16_byte' },
      { name: 'proto_220-c2.c2', offset: 0x1, size: 0x400000, crc: '8a2ad708', loadFlag: 'load16_byte' },
      { name: 'proto_220-c3.c3', offset: 0x800000, size: 0x400000, crc: 'd67fb15a', loadFlag: 'load16_byte' },
      { name: 'proto_220-c4.c4', offset: 0x800001, size: 0x400000, crc: 'e73ea38b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'proto_220-m1.m1', offset: 0x0, size: 0x20000, crc: '3a08bb63' },
    ],
    voice: [
      { name: 'proto_220-v1.v1', offset: 0x0, size: 0x400000, crc: '8f30a215' },
    ],
    fixed: [
      { name: 'proto_220-s1.s1', offset: 0x0, size: 0x20000, crc: '372fe217' },
    ],
  },
  {
    name: 'magdrop2',
    description: 'Magical Drop II',
    year: '1996',
    publisher: 'Data East Corporation',
    program: [
      { name: '221-p1.p1', offset: 0x0, size: 0x80000, crc: '7be82353', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '221-c1.c1', offset: 0x0, size: 0x400000, crc: '1f862a14', loadFlag: 'load16_byte' },
      { name: '221-c2.c2', offset: 0x1, size: 0x400000, crc: '14b90536', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '221-m1.m1', offset: 0x0, size: 0x20000, crc: 'bddae628' },
    ],
    voice: [
      { name: '221-v1.v1', offset: 0x0, size: 0x200000, crc: '7e5e53e4' },
    ],
    fixed: [
      { name: '221-s1.s1', offset: 0x0, size: 0x20000, crc: '2a4063a3' },
    ],
  },
  {
    name: 'samsho4',
    description: 'Samurai Shodown IV - Amakusa\'s Revenge / Samurai Spirits - Amakusa Kourin (NGM-222 ~ NGH-222)',
    year: '1996',
    publisher: 'SNK',
    program: [
      { name: '222-p1.p1', offset: 0x0, size: 0x100000, crc: '1a5cb56d', loadFlag: 'load16_word_swap' },
      { name: '222-p2.sp2', offset: 0x100000, size: 0x400000, crc: 'b023cd8b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '222-c1.c1', offset: 0x0, size: 0x400000, crc: '68f2ed95', loadFlag: 'load16_byte' },
      { name: '222-c2.c2', offset: 0x1, size: 0x400000, crc: 'a6e9aff0', loadFlag: 'load16_byte' },
      { name: '222-c3.c3', offset: 0x800000, size: 0x400000, crc: 'c91b40f4', loadFlag: 'load16_byte' },
      { name: '222-c4.c4', offset: 0x800001, size: 0x400000, crc: '359510a4', loadFlag: 'load16_byte' },
      { name: '222-c5.c5', offset: 0x1000000, size: 0x400000, crc: '9cfbb22d', loadFlag: 'load16_byte' },
      { name: '222-c6.c6', offset: 0x1000001, size: 0x400000, crc: '685efc32', loadFlag: 'load16_byte' },
      { name: '222-c7.c7', offset: 0x1800000, size: 0x400000, crc: 'd0f86f0d', loadFlag: 'load16_byte' },
      { name: '222-c8.c8', offset: 0x1800001, size: 0x400000, crc: 'adfc50e3', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '222-m1.m1', offset: 0x0, size: 0x20000, crc: '7615bc1b' },
    ],
    voice: [
      { name: '222-v1.v1', offset: 0x0, size: 0x400000, crc: '7d6ba95f' },
      { name: '222-v2.v2', offset: 0x400000, size: 0x400000, crc: '6c33bb5d' },
      { name: '222-v3.v3', offset: 0x800000, size: 0x200000, crc: '831ea8c0' },
    ],
    fixed: [
      { name: '222-s1.s1', offset: 0x0, size: 0x20000, crc: '8d3d3bf9' },
    ],
  },
  {
    name: 'rbffspec',
    description: 'Real Bout Fatal Fury Special / Real Bout Garou Densetsu Special',
    year: '1996',
    publisher: 'SNK',
    program: [
      { name: '223-p1.p1', offset: 0x0, size: 0x100000, crc: 'f84a2d1d', loadFlag: 'load16_word_swap' },
      { name: '223-p2.sp2', offset: 0x100000, size: 0x400000, crc: 'addd8f08', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '223-c1.c1', offset: 0x0, size: 0x400000, crc: 'ebab05e2', loadFlag: 'load16_byte' },
      { name: '223-c2.c2', offset: 0x1, size: 0x400000, crc: '641868c3', loadFlag: 'load16_byte' },
      { name: '223-c3.c3', offset: 0x800000, size: 0x400000, crc: 'ca00191f', loadFlag: 'load16_byte' },
      { name: '223-c4.c4', offset: 0x800001, size: 0x400000, crc: '1f23d860', loadFlag: 'load16_byte' },
      { name: '223-c5.c5', offset: 0x1000000, size: 0x400000, crc: '321e362c', loadFlag: 'load16_byte' },
      { name: '223-c6.c6', offset: 0x1000001, size: 0x400000, crc: 'd8fcef90', loadFlag: 'load16_byte' },
      { name: '223-c7.c7', offset: 0x1800000, size: 0x400000, crc: 'bc80dd2d', loadFlag: 'load16_byte' },
      { name: '223-c8.c8', offset: 0x1800001, size: 0x400000, crc: '5ad62102', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '223-m1.m1', offset: 0x0, size: 0x20000, crc: '3fee46bf' },
    ],
    voice: [
      { name: '223-v1.v1', offset: 0x0, size: 0x400000, crc: '76673869' },
      { name: '223-v2.v2', offset: 0x400000, size: 0x400000, crc: '7a275acd' },
      { name: '223-v3.v3', offset: 0x800000, size: 0x400000, crc: '5a797fd2' },
    ],
    fixed: [
      { name: '223-s1.s1', offset: 0x0, size: 0x20000, crc: '7ecd6e8c' },
    ],
  },
  {
    name: 'twinspri',
    description: 'Twinkle Star Sprites',
    year: '1996',
    publisher: 'ADK / SNK',
    program: [
      { name: '224-p1.p1', offset: 0x100000, size: 0x100000, crc: '7697e445', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '224-c1.c1', offset: 0x0, size: 0x400000, crc: 'f7da64ab', loadFlag: 'load16_byte' },
      { name: '224-c2.c2', offset: 0x1, size: 0x400000, crc: '4c09bbfb', loadFlag: 'load16_byte' },
      { name: '224-c3.c3', offset: 0x800000, size: 0x100000, crc: 'c59e4129', loadFlag: 'load16_byte' },
      { name: '224-c4.c4', offset: 0x800001, size: 0x100000, crc: 'b5532e53', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '224-m1.m1', offset: 0x0, size: 0x20000, crc: '364d6f96' },
    ],
    voice: [
      { name: '224-v1.v1', offset: 0x0, size: 0x400000, crc: 'ff57f088' },
      { name: '224-v2.v2', offset: 0x400000, size: 0x200000, crc: '7ad26599' },
    ],
    fixed: [
      { name: '224-s1.s1', offset: 0x0, size: 0x20000, crc: 'eeed5758' },
    ],
  },
  {
    name: 'wakuwak7',
    description: 'Waku Waku 7',
    year: '1996',
    publisher: 'Sunsoft',
    program: [
      { name: '225-p1.p1', offset: 0x0, size: 0x100000, crc: 'b14da766', loadFlag: 'load16_word_swap' },
      { name: '225-p2.sp2', offset: 0x100000, size: 0x200000, crc: 'fe190665', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '225-c1.c1', offset: 0x0, size: 0x400000, crc: 'ee4fea54', loadFlag: 'load16_byte' },
      { name: '225-c2.c2', offset: 0x1, size: 0x400000, crc: '0c549e2d', loadFlag: 'load16_byte' },
      { name: '225-c3.c3', offset: 0x800000, size: 0x400000, crc: 'af0897c0', loadFlag: 'load16_byte' },
      { name: '225-c4.c4', offset: 0x800001, size: 0x400000, crc: '4c66527a', loadFlag: 'load16_byte' },
      { name: '225-c5.c5', offset: 0x1000000, size: 0x400000, crc: '8ecea2b5', loadFlag: 'load16_byte' },
      { name: '225-c6.c6', offset: 0x1000001, size: 0x400000, crc: '0eb11a6d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '225-m1.m1', offset: 0x0, size: 0x20000, crc: '0634bba6' },
    ],
    voice: [
      { name: '225-v1.v1', offset: 0x0, size: 0x400000, crc: '6195c6b4' },
      { name: '225-v2.v2', offset: 0x400000, size: 0x400000, crc: '6159c5fe' },
    ],
    fixed: [
      { name: '225-s1.s1', offset: 0x0, size: 0x20000, crc: '71c4b4b5' },
    ],
  },
  {
    name: 'stakwin2',
    description: 'Stakes Winner 2',
    year: '1996',
    publisher: 'Saurus',
    program: [
      { name: '227-p1.p1', offset: 0x100000, size: 0x100000, crc: 'daf101d2', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '227-c1.c1', offset: 0x0, size: 0x400000, crc: '7d6c2af4', loadFlag: 'load16_byte' },
      { name: '227-c2.c2', offset: 0x1, size: 0x400000, crc: '7e402d39', loadFlag: 'load16_byte' },
      { name: '227-c3.c3', offset: 0x800000, size: 0x200000, crc: '93dfd660', loadFlag: 'load16_byte' },
      { name: '227-c4.c4', offset: 0x800001, size: 0x200000, crc: '7efea43a', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '227-m1.m1', offset: 0x0, size: 0x20000, crc: 'c8e5e0f9' },
    ],
    voice: [
      { name: '227-v1.v1', offset: 0x0, size: 0x400000, crc: 'b8f24181' },
      { name: '227-v2.v2', offset: 0x400000, size: 0x400000, crc: 'ee39e260' },
    ],
    fixed: [
      { name: '227-s1.s1', offset: 0x0, size: 0x20000, crc: '2a8c4462' },
    ],
  },
  {
    name: 'ghostlop',
    description: 'Ghostlop (prototype)',
    year: '1996',
    publisher: 'Data East Corporation',
    program: [
      { name: 'proto_228-p1.p1', offset: 0x0, size: 0x100000, crc: '6033172e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'proto_228-c1.c1', offset: 0x0, size: 0x400000, crc: 'bfc99efe', loadFlag: 'load16_byte' },
      { name: 'proto_228-c2.c2', offset: 0x1, size: 0x400000, crc: '69788082', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'proto_228-m1.m1', offset: 0x0, size: 0x20000, crc: 'fd833b33' },
    ],
    voice: [
      { name: 'proto_228-v1.v1', offset: 0x0, size: 0x200000, crc: 'c603fce6' },
    ],
    fixed: [
      { name: 'proto_228-s1.s1', offset: 0x0, size: 0x20000, crc: '83c24e81' },
    ],
  },
  {
    name: 'breakers',
    description: 'Breakers',
    year: '1996',
    publisher: 'Visco',
    program: [
      { name: '230-p1.p1', offset: 0x100000, size: 0x100000, crc: 'ed24a6e6', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '230-c1.c1', offset: 0x0, size: 0x400000, crc: '68d4ae76', loadFlag: 'load16_byte' },
      { name: '230-c2.c2', offset: 0x1, size: 0x400000, crc: 'fdee05cd', loadFlag: 'load16_byte' },
      { name: '230-c3.c3', offset: 0x800000, size: 0x400000, crc: '645077f3', loadFlag: 'load16_byte' },
      { name: '230-c4.c4', offset: 0x800001, size: 0x400000, crc: '63aeb74c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '230-m1.m1', offset: 0x0, size: 0x20000, crc: '3951a1c1' },
    ],
    voice: [
      { name: '230-v1.v1', offset: 0x0, size: 0x400000, crc: '7f9ed279' },
      { name: '230-v2.v2', offset: 0x400000, size: 0x400000, crc: '1d43e420' },
    ],
    fixed: [
      { name: '230-s1.s1', offset: 0x0, size: 0x20000, crc: '076fb64c' },
    ],
  },
  {
    name: 'miexchng',
    description: 'Money Puzzle Exchanger / Money Idol Exchanger',
    year: '1997',
    publisher: 'Face',
    program: [
      { name: '231-p1.p1', offset: 0x0, size: 0x80000, crc: '61be1810', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '231-c1.c1', offset: 0x0, size: 0x200000, crc: '6c403ba3', loadFlag: 'load16_byte' },
      { name: '231-c2.c2', offset: 0x1, size: 0x200000, crc: '554bcd9b', loadFlag: 'load16_byte' },
      { name: '231-c3.c3', offset: 0x400000, size: 0x100000, crc: '4f6f7a63', loadFlag: 'load16_byte' },
      { name: '231-c4.c4', offset: 0x400001, size: 0x100000, crc: '2e35e71b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '231-m1.m1', offset: 0x0, size: 0x20000, crc: 'de41301b' },
    ],
    voice: [
      { name: '231-v1.v1', offset: 0x0, size: 0x400000, crc: '113fb898' },
    ],
    fixed: [
      { name: '231-s1.s1', offset: 0x0, size: 0x20000, crc: 'fe0c0c53' },
    ],
  },
  {
    name: 'kof97',
    description: 'The King of Fighters \'97 (NGM-2320)',
    year: '1997',
    publisher: 'SNK',
    program: [
      { name: '232-p1.p1', offset: 0x0, size: 0x100000, crc: '7db81ad9', loadFlag: 'load16_word_swap' },
      { name: '232-p2.sp2', offset: 0x100000, size: 0x400000, crc: '158b23f6', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '232-c1.c1', offset: 0x0, size: 0x800000, crc: '5f8bf0a1', loadFlag: 'load16_byte' },
      { name: '232-c2.c2', offset: 0x1, size: 0x800000, crc: 'e4d45c81', loadFlag: 'load16_byte' },
      { name: '232-c3.c3', offset: 0x1000000, size: 0x800000, crc: '581d6618', loadFlag: 'load16_byte' },
      { name: '232-c4.c4', offset: 0x1000001, size: 0x800000, crc: '49bb1e68', loadFlag: 'load16_byte' },
      { name: '232-c5.c5', offset: 0x2000000, size: 0x400000, crc: '34fc4e51', loadFlag: 'load16_byte' },
      { name: '232-c6.c6', offset: 0x2000001, size: 0x400000, crc: '4ff4d47b', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '232-m1.m1', offset: 0x0, size: 0x20000, crc: '45348747' },
    ],
    voice: [
      { name: '232-v1.v1', offset: 0x0, size: 0x400000, crc: '22a2b5b5' },
      { name: '232-v2.v2', offset: 0x400000, size: 0x400000, crc: '2304e744' },
      { name: '232-v3.v3', offset: 0x800000, size: 0x400000, crc: '759eb954' },
    ],
    fixed: [
      { name: '232-s1.s1', offset: 0x0, size: 0x20000, crc: '8514ecf5' },
    ],
  },
  {
    name: 'magdrop3',
    description: 'Magical Drop III',
    year: '1997',
    publisher: 'Data East Corporation',
    program: [
      { name: '233-p1.p1', offset: 0x0, size: 0x100000, crc: '931e17fa', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '233-c1.c1', offset: 0x0, size: 0x400000, crc: '65e3f4c4', loadFlag: 'load16_byte' },
      { name: '233-c2.c2', offset: 0x1, size: 0x400000, crc: '35dea6c9', loadFlag: 'load16_byte' },
      { name: '233-c3.c3', offset: 0x800000, size: 0x400000, crc: '0ba2c502', loadFlag: 'load16_byte' },
      { name: '233-c4.c4', offset: 0x800001, size: 0x400000, crc: '70dbbd6d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '233-m1.m1', offset: 0x0, size: 0x20000, crc: '5beaf34e' },
    ],
    voice: [
      { name: '233-v1.v1', offset: 0x0, size: 0x400000, crc: '58839298' },
      { name: '233-v2.v2', offset: 0x400000, size: 0x80000, crc: 'd5e30df4' },
    ],
    fixed: [
      { name: '233-s1.s1', offset: 0x0, size: 0x20000, crc: '7399e68a' },
    ],
  },
  {
    name: 'lastblad',
    description: 'The Last Blade / Bakumatsu Roman - Gekka no Kenshi (NGM-2340)',
    year: '1997',
    publisher: 'SNK',
    program: [
      { name: '234-p1.p1', offset: 0x0, size: 0x100000, crc: 'e123a5a3', loadFlag: 'load16_word_swap' },
      { name: '234-p2.sp2', offset: 0x100000, size: 0x400000, crc: '0fdc289e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '234-c1.c1', offset: 0x0, size: 0x800000, crc: '9f7e2bd3', loadFlag: 'load16_byte' },
      { name: '234-c2.c2', offset: 0x1, size: 0x800000, crc: '80623d3c', loadFlag: 'load16_byte' },
      { name: '234-c3.c3', offset: 0x1000000, size: 0x800000, crc: '91ab1a30', loadFlag: 'load16_byte' },
      { name: '234-c4.c4', offset: 0x1000001, size: 0x800000, crc: '3d60b037', loadFlag: 'load16_byte' },
      { name: '234-c5.c5', offset: 0x2000000, size: 0x400000, crc: '1ba80cee', loadFlag: 'load16_byte' },
      { name: '234-c6.c6', offset: 0x2000001, size: 0x400000, crc: 'beafd091', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '234-m1.m1', offset: 0x0, size: 0x20000, crc: '087628ea' },
    ],
    voice: [
      { name: '234-v1.v1', offset: 0x0, size: 0x400000, crc: 'ed66b76f' },
      { name: '234-v2.v2', offset: 0x400000, size: 0x400000, crc: 'a0e7f6e2' },
      { name: '234-v3.v3', offset: 0x800000, size: 0x400000, crc: 'a506e1e2' },
      { name: '234-v4.v4', offset: 0xC00000, size: 0x400000, crc: '0e34157f' },
    ],
    fixed: [
      { name: '234-s1.s1', offset: 0x0, size: 0x20000, crc: '95561412' },
    ],
  },
  {
    name: 'puzzldpr',
    description: 'Puzzle De Pon! R!',
    year: '1997',
    publisher: 'Visco',
    program: [
      { name: '235-p1.p1', offset: 0x0, size: 0x80000, crc: 'afed5de2', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '202-c1.c1', offset: 0x0, size: 0x100000, crc: 'cc0095ef', loadFlag: 'load16_byte' },
      { name: '202-c2.c2', offset: 0x1, size: 0x100000, crc: '42371307', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '202-m1.m1', offset: 0x0, size: 0x20000, crc: '9c0291ea' },
    ],
    voice: [
      { name: '202-v1.v1', offset: 0x0, size: 0x80000, crc: 'debeb8fb' },
    ],
    fixed: [
      { name: '235-s1.s1', offset: 0x0, size: 0x20000, crc: '3b13a22f' },
    ],
  },
  {
    name: 'irrmaze',
    description: 'The Irritating Maze / Ultra Denryu Iraira Bou',
    year: '1997',
    publisher: 'SNK / Saurus',
    program: [
      { name: '236-p1.p1', offset: 0x100000, size: 0x100000, crc: '4c2ff660', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '236-c1.c1', offset: 0x0, size: 0x400000, crc: 'c1d47902', loadFlag: 'load16_byte' },
      { name: '236-c2.c2', offset: 0x1, size: 0x400000, crc: 'e15f972e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '236-m1.m1', offset: 0x0, size: 0x20000, crc: '880a1abd' },
    ],
    voice: [
      { name: '236-v1.v1', offset: 0x0, size: 0x200000, crc: '5f89c3b4' },
      { name: '236-v2.v2', offset: 0x200000, size: 0x100000, crc: '72e3add7' },
    ],
    fixed: [
      { name: '236-s1.s1', offset: 0x0, size: 0x20000, crc: '5d1ca640' },
    ],
  },
  {
    name: 'popbounc',
    description: 'Pop \'n Bounce / Gapporin',
    year: '1997',
    publisher: 'Video System Co.',
    program: [
      { name: '237-p1.p1', offset: 0x0, size: 0x100000, crc: 'be96e44f', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '237-c1.c1', offset: 0x0, size: 0x200000, crc: 'eda42d66', loadFlag: 'load16_byte' },
      { name: '237-c2.c2', offset: 0x1, size: 0x200000, crc: '5e633c65', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '237-m1.m1', offset: 0x0, size: 0x20000, crc: 'd4c946dd' },
    ],
    voice: [
      { name: '237-v1.v1', offset: 0x0, size: 0x200000, crc: 'edcb1beb' },
    ],
    fixed: [
      { name: '237-s1.s1', offset: 0x0, size: 0x20000, crc: 'b61cf595' },
    ],
  },
  {
    name: 'shocktro',
    description: 'Shock Troopers (set 1)',
    year: '1997',
    publisher: 'Saurus',
    program: [
      { name: '238-pg1.p1', offset: 0x0, size: 0x100000, crc: 'efedf8dc', loadFlag: 'load16_word_swap' },
      { name: '238-p2.sp2', offset: 0x100000, size: 0x400000, crc: '5b4a09c5', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '238-c1.c1', offset: 0x0, size: 0x400000, crc: '90c6a181', loadFlag: 'load16_byte' },
      { name: '238-c2.c2', offset: 0x1, size: 0x400000, crc: '888720f0', loadFlag: 'load16_byte' },
      { name: '238-c3.c3', offset: 0x800000, size: 0x400000, crc: '2c393aa3', loadFlag: 'load16_byte' },
      { name: '238-c4.c4', offset: 0x800001, size: 0x400000, crc: 'b9e909eb', loadFlag: 'load16_byte' },
      { name: '238-c5.c5', offset: 0x1000000, size: 0x400000, crc: 'c22c68eb', loadFlag: 'load16_byte' },
      { name: '238-c6.c6', offset: 0x1000001, size: 0x400000, crc: '119323cd', loadFlag: 'load16_byte' },
      { name: '238-c7.c7', offset: 0x1800000, size: 0x400000, crc: 'a72ce7ed', loadFlag: 'load16_byte' },
      { name: '238-c8.c8', offset: 0x1800001, size: 0x400000, crc: '1c7c2efb', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '238-m1.m1', offset: 0x0, size: 0x20000, crc: '075b9518' },
    ],
    voice: [
      { name: '238-v1.v1', offset: 0x0, size: 0x400000, crc: '260c0bef' },
      { name: '238-v2.v2', offset: 0x400000, size: 0x200000, crc: '4ad7d59e' },
    ],
    fixed: [
      { name: '238-s1.s1', offset: 0x0, size: 0x20000, crc: '1f95cedb' },
    ],
  },
  {
    name: 'blazstar',
    description: 'Blazing Star',
    year: '1998',
    publisher: 'Yumekobo',
    program: [
      { name: '239-p1.p1', offset: 0x0, size: 0x100000, crc: '183682f8', loadFlag: 'load16_word_swap' },
      { name: '239-p2.sp2', offset: 0x100000, size: 0x200000, crc: '9a9f4154', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '239-c1.c1', offset: 0x0, size: 0x400000, crc: '84f6d584', loadFlag: 'load16_byte' },
      { name: '239-c2.c2', offset: 0x1, size: 0x400000, crc: '05a0cb22', loadFlag: 'load16_byte' },
      { name: '239-c3.c3', offset: 0x800000, size: 0x400000, crc: '5fb69c9e', loadFlag: 'load16_byte' },
      { name: '239-c4.c4', offset: 0x800001, size: 0x400000, crc: '0be028c4', loadFlag: 'load16_byte' },
      { name: '239-c5.c5', offset: 0x1000000, size: 0x400000, crc: '74bae5f8', loadFlag: 'load16_byte' },
      { name: '239-c6.c6', offset: 0x1000001, size: 0x400000, crc: '4e0700d2', loadFlag: 'load16_byte' },
      { name: '239-c7.c7', offset: 0x1800000, size: 0x400000, crc: '010ff4fd', loadFlag: 'load16_byte' },
      { name: '239-c8.c8', offset: 0x1800001, size: 0x400000, crc: 'db60460e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '239-m1.m1', offset: 0x0, size: 0x20000, crc: 'd31a3aea' },
    ],
    voice: [
      { name: '239-v1.v1', offset: 0x0, size: 0x400000, crc: '1b8d5bf7' },
      { name: '239-v2.v2', offset: 0x400000, size: 0x400000, crc: '74cf0a70' },
    ],
    fixed: [
      { name: '239-s1.s1', offset: 0x0, size: 0x20000, crc: 'd56cb498' },
    ],
  },
  {
    name: 'rbff2',
    description: 'Real Bout Fatal Fury 2 - The Newcomers / Real Bout Garou Densetsu 2 - The Newcomers (NGM-2400)',
    year: '1998',
    publisher: 'SNK',
    program: [
      { name: '240-p1.p1', offset: 0x0, size: 0x100000, crc: '80e41205', loadFlag: 'load16_word_swap' },
      { name: '240-p2.sp2', offset: 0x100000, size: 0x400000, crc: '960aa88d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '240-c1.c1', offset: 0x0, size: 0x800000, crc: 'effac504', loadFlag: 'load16_byte' },
      { name: '240-c2.c2', offset: 0x1, size: 0x800000, crc: 'ed182d44', loadFlag: 'load16_byte' },
      { name: '240-c3.c3', offset: 0x1000000, size: 0x800000, crc: '22e0330a', loadFlag: 'load16_byte' },
      { name: '240-c4.c4', offset: 0x1000001, size: 0x800000, crc: 'c19a07eb', loadFlag: 'load16_byte' },
      { name: '240-c5.c5', offset: 0x2000000, size: 0x800000, crc: '244dff5a', loadFlag: 'load16_byte' },
      { name: '240-c6.c6', offset: 0x2000001, size: 0x800000, crc: '4609e507', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '240-m1.m1', offset: 0x0, size: 0x40000, crc: 'ed482791' },
    ],
    voice: [
      { name: '240-v1.v1', offset: 0x0, size: 0x400000, crc: 'f796265a' },
      { name: '240-v2.v2', offset: 0x400000, size: 0x400000, crc: '2cb3f3bb' },
      { name: '240-v3.v3', offset: 0x800000, size: 0x400000, crc: '8fe1367a' },
      { name: '240-v4.v4', offset: 0xC00000, size: 0x200000, crc: '996704d8' },
    ],
    fixed: [
      { name: '240-s1.s1', offset: 0x0, size: 0x20000, crc: 'da3b40de' },
    ],
  },
  {
    name: 'mslug2',
    description: 'Metal Slug 2 - Super Vehicle-001/II (NGM-2410 ~ NGH-2410)',
    year: '1998',
    publisher: 'SNK',
    program: [
      { name: '241-p1.p1', offset: 0x0, size: 0x100000, crc: '2a53c5da', loadFlag: 'load16_word_swap' },
      { name: '241-p2.sp2', offset: 0x100000, size: 0x200000, crc: '38883f44', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '241-c1.c1', offset: 0x0, size: 0x800000, crc: '394b5e0d', loadFlag: 'load16_byte' },
      { name: '241-c2.c2', offset: 0x1, size: 0x800000, crc: 'e5806221', loadFlag: 'load16_byte' },
      { name: '241-c3.c3', offset: 0x1000000, size: 0x800000, crc: '9f6bfa6f', loadFlag: 'load16_byte' },
      { name: '241-c4.c4', offset: 0x1000001, size: 0x800000, crc: '7d3e306f', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '241-m1.m1', offset: 0x0, size: 0x20000, crc: '94520ebd' },
    ],
    voice: [
      { name: '241-v1.v1', offset: 0x0, size: 0x400000, crc: '99ec20e8' },
      { name: '241-v2.v2', offset: 0x400000, size: 0x400000, crc: 'ecb16799' },
    ],
    fixed: [
      { name: '241-s1.s1', offset: 0x0, size: 0x20000, crc: 'f3d32f0f' },
    ],
  },
  {
    name: 'kof98',
    description: 'The King of Fighters \'98 - The Slugfest / King of Fighters \'98 - Dream Match Never Ends (NGM-2420)',
    year: '1998',
    publisher: 'SNK',
    program: [
      { name: '242-p1.p1', offset: 0x0, size: 0x200000, crc: '8893df89', loadFlag: 'load16_word_swap' },
      { name: '242-p2.sp2', offset: 0x200000, size: 0x400000, crc: '980aba4c', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '242-c1.c1', offset: 0x0, size: 0x800000, crc: 'e564ecd6', loadFlag: 'load16_byte' },
      { name: '242-c2.c2', offset: 0x1, size: 0x800000, crc: 'bd959b60', loadFlag: 'load16_byte' },
      { name: '242-c3.c3', offset: 0x1000000, size: 0x800000, crc: '22127b4f', loadFlag: 'load16_byte' },
      { name: '242-c4.c4', offset: 0x1000001, size: 0x800000, crc: '0b4fa044', loadFlag: 'load16_byte' },
      { name: '242-c5.c5', offset: 0x2000000, size: 0x800000, crc: '9d10bed3', loadFlag: 'load16_byte' },
      { name: '242-c6.c6', offset: 0x2000001, size: 0x800000, crc: 'da07b6a2', loadFlag: 'load16_byte' },
      { name: '242-c7.c7', offset: 0x3000000, size: 0x800000, crc: 'f6d7a38a', loadFlag: 'load16_byte' },
      { name: '242-c8.c8', offset: 0x3000001, size: 0x800000, crc: 'c823e045', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '242-m1.m1', offset: 0x0, size: 0x40000, crc: '4ef7016b' },
    ],
    voice: [
      { name: '242-v1.v1', offset: 0x0, size: 0x400000, crc: 'b9ea8051' },
      { name: '242-v2.v2', offset: 0x400000, size: 0x400000, crc: 'cc11106e' },
      { name: '242-v3.v3', offset: 0x800000, size: 0x400000, crc: '044ea4e1' },
      { name: '242-v4.v4', offset: 0xC00000, size: 0x400000, crc: '7985ea30' },
    ],
    fixed: [
      { name: '242-s1.s1', offset: 0x0, size: 0x20000, crc: '7f7b4805' },
    ],
  },
  {
    name: 'lastbld2',
    description: 'The Last Blade 2 / Bakumatsu Roman - Dai Ni Maku Gekka no Kenshi (NGM-2430 ~ NGH-2430)',
    year: '1998',
    publisher: 'SNK',
    program: [
      { name: '243-pg1.p1', offset: 0x0, size: 0x100000, crc: 'af1e6554', loadFlag: 'load16_word_swap' },
      { name: '243-pg2.sp2', offset: 0x100000, size: 0x400000, crc: 'add4a30b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '243-c1.c1', offset: 0x0, size: 0x800000, crc: '5839444d', loadFlag: 'load16_byte' },
      { name: '243-c2.c2', offset: 0x1, size: 0x800000, crc: 'dd087428', loadFlag: 'load16_byte' },
      { name: '243-c3.c3', offset: 0x1000000, size: 0x800000, crc: '6054cbe0', loadFlag: 'load16_byte' },
      { name: '243-c4.c4', offset: 0x1000001, size: 0x800000, crc: '8bd2a9d2', loadFlag: 'load16_byte' },
      { name: '243-c5.c5', offset: 0x2000000, size: 0x800000, crc: '6a503dcf', loadFlag: 'load16_byte' },
      { name: '243-c6.c6', offset: 0x2000001, size: 0x800000, crc: 'ec9c36d0', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '243-m1.m1', offset: 0x0, size: 0x20000, crc: 'acf12d10' },
    ],
    voice: [
      { name: '243-v1.v1', offset: 0x0, size: 0x400000, crc: 'f7ee6fbb' },
      { name: '243-v2.v2', offset: 0x400000, size: 0x400000, crc: 'aa9e4df6' },
      { name: '243-v3.v3', offset: 0x800000, size: 0x400000, crc: '4ac750b2' },
      { name: '243-v4.v4', offset: 0xC00000, size: 0x400000, crc: 'f5c64ba6' },
    ],
    fixed: [
      { name: '243-s1.s1', offset: 0x0, size: 0x20000, crc: 'c9cd2298' },
    ],
  },
  {
    name: 'neocup98',
    description: 'Neo-Geo Cup \'98 - The Road to the Victory',
    year: '1998',
    publisher: 'SNK',
    program: [
      { name: '244-p1.p1', offset: 0x100000, size: 0x100000, crc: 'f8fdb7a5', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '244-c1.c1', offset: 0x0, size: 0x800000, crc: 'c7a62b23', loadFlag: 'load16_byte' },
      { name: '244-c2.c2', offset: 0x1, size: 0x800000, crc: '33aa0f35', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '244-m1.m1', offset: 0x0, size: 0x20000, crc: 'a701b276' },
    ],
    voice: [
      { name: '244-v1.v1', offset: 0x0, size: 0x400000, crc: '79def46d' },
      { name: '244-v2.v2', offset: 0x400000, size: 0x200000, crc: 'b231902f' },
    ],
    fixed: [
      { name: '244-s1.s1', offset: 0x0, size: 0x20000, crc: '9bddb697' },
    ],
  },
  {
    name: 'breakrev',
    description: 'Breakers Revenge',
    year: '1998',
    publisher: 'Visco',
    program: [
      { name: '245-p1.p1', offset: 0x100000, size: 0x100000, crc: 'c828876d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '245-c1.c1', offset: 0x0, size: 0x400000, crc: '68d4ae76', loadFlag: 'load16_byte' },
      { name: '245-c2.c2', offset: 0x1, size: 0x400000, crc: 'fdee05cd', loadFlag: 'load16_byte' },
      { name: '245-c3.c3', offset: 0x800000, size: 0x400000, crc: '645077f3', loadFlag: 'load16_byte' },
      { name: '245-c4.c4', offset: 0x800001, size: 0x400000, crc: '63aeb74c', loadFlag: 'load16_byte' },
      { name: '245-c5.c5', offset: 0x1000000, size: 0x400000, crc: 'b5f40e7f', loadFlag: 'load16_byte' },
      { name: '245-c6.c6', offset: 0x1000001, size: 0x400000, crc: 'd0337328', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '245-m1.m1', offset: 0x0, size: 0x20000, crc: '00f31c66' },
    ],
    voice: [
      { name: '245-v1.v1', offset: 0x0, size: 0x400000, crc: 'e255446c' },
      { name: '245-v2.v2', offset: 0x400000, size: 0x400000, crc: '9068198a' },
    ],
    fixed: [
      { name: '245-s1.s1', offset: 0x0, size: 0x20000, crc: 'e7660a5d' },
    ],
  },
  {
    name: 'shocktr2',
    description: 'Shock Troopers - 2nd Squad',
    year: '1998',
    publisher: 'Saurus',
    program: [
      { name: '246-p1.p1', offset: 0x0, size: 0x100000, crc: '6d4b7781', loadFlag: 'load16_word_swap' },
      { name: '246-p2.sp2', offset: 0x100000, size: 0x400000, crc: '72ea04c3', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '246-c1.c1', offset: 0x0, size: 0x800000, crc: '47ac9ec5', loadFlag: 'load16_byte' },
      { name: '246-c2.c2', offset: 0x1, size: 0x800000, crc: '7bcab64f', loadFlag: 'load16_byte' },
      { name: '246-c3.c3', offset: 0x1000000, size: 0x800000, crc: 'db2f73e8', loadFlag: 'load16_byte' },
      { name: '246-c4.c4', offset: 0x1000001, size: 0x800000, crc: '5503854e', loadFlag: 'load16_byte' },
      { name: '246-c5.c5', offset: 0x2000000, size: 0x800000, crc: '055b3701', loadFlag: 'load16_byte' },
      { name: '246-c6.c6', offset: 0x2000001, size: 0x800000, crc: '7e2caae1', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '246-m1.m1', offset: 0x0, size: 0x20000, crc: 'd0604ad1' },
    ],
    voice: [
      { name: '246-v1.v1', offset: 0x0, size: 0x400000, crc: '16986fc6' },
      { name: '246-v2.v2', offset: 0x400000, size: 0x400000, crc: 'ada41e83' },
      { name: '246-v3.v3', offset: 0x800000, size: 0x200000, crc: 'a05ba5db' },
    ],
    fixed: [
      { name: '246-s1.s1', offset: 0x0, size: 0x20000, crc: '2a360637' },
    ],
  },
  {
    name: 'flipshot',
    description: 'Flip Shot',
    year: '1998',
    publisher: 'Visco',
    program: [
      { name: '247-p1.p1', offset: 0x0, size: 0x100000, crc: '95779094', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '247-c1.c1', offset: 0x0, size: 0x200000, crc: 'c9eedcb2', loadFlag: 'load16_byte' },
      { name: '247-c2.c2', offset: 0x1, size: 0x200000, crc: '7d6d6e87', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '247-m1.m1', offset: 0x0, size: 0x20000, crc: 'a9fe0144' },
    ],
    voice: [
      { name: '247-v1.v1', offset: 0x0, size: 0x200000, crc: '42ec743d' },
    ],
    fixed: [
      { name: '247-s1.s1', offset: 0x0, size: 0x20000, crc: '6300185c' },
    ],
  },
  {
    name: 'pbobbl2n',
    description: 'Puzzle Bobble 2 / Bust-A-Move Again (Neo-Geo)',
    year: '1999',
    publisher: 'Taito (SNK license)',
    program: [
      { name: '248-p1.p1', offset: 0x0, size: 0x100000, crc: '9d6c0754', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '248-c1.c1', offset: 0x0, size: 0x400000, crc: 'd9115327', loadFlag: 'load16_byte' },
      { name: '248-c2.c2', offset: 0x1, size: 0x400000, crc: '77f9fdac', loadFlag: 'load16_byte' },
      { name: '248-c3.c3', offset: 0x800000, size: 0x100000, crc: '8890bf7c', loadFlag: 'load16_byte' },
      { name: '248-c4.c4', offset: 0x800001, size: 0x100000, crc: '8efead3f', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '248-m1.m1', offset: 0x0, size: 0x20000, crc: '883097a9' },
    ],
    voice: [
      { name: '248-v1.v1', offset: 0x0, size: 0x400000, crc: '57fde1fa' },
      { name: '248-v2.v2', offset: 0x400000, size: 0x400000, crc: '4b966ef3' },
    ],
    fixed: [
      { name: '248-s1.s1', offset: 0x0, size: 0x20000, crc: '0a3fee41' },
    ],
  },
  {
    name: 'b2b',
    description: 'Bang Bang Busters',
    year: '2001',
    publisher: 'Visco',
    program: [
      { name: '071.p1', offset: 0x0, size: 0x80000, crc: '7687197d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '071.c1', offset: 0x0, size: 0x200000, crc: '23d84a7a', loadFlag: 'load16_byte' },
      { name: '071.c2', offset: 0x1, size: 0x200000, crc: 'ce7b6248', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '071.m1', offset: 0x0, size: 0x20000, crc: '6da739ad' },
    ],
    voice: [
      { name: '071.v1', offset: 0x0, size: 0x100000, crc: '50feffb0' },
    ],
    fixed: [
      { name: '071.s1', offset: 0x0, size: 0x20000, crc: '44e5f154' },
    ],
  },
  {
    name: 'ctomaday',
    description: 'Captain Tomaday',
    year: '1999',
    publisher: 'Visco',
    program: [
      { name: '249-p1.p1', offset: 0x100000, size: 0x100000, crc: 'c9386118', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '249-c1.c1', offset: 0x0, size: 0x400000, crc: '041fb8ee', loadFlag: 'load16_byte' },
      { name: '249-c2.c2', offset: 0x1, size: 0x400000, crc: '74f3cdf4', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '249-m1.m1', offset: 0x0, size: 0x20000, crc: '80328a47' },
    ],
    voice: [
      { name: '249-v1.v1', offset: 0x0, size: 0x400000, crc: 'de7c8f27' },
      { name: '249-v2.v2', offset: 0x400000, size: 0x100000, crc: 'c8e40119' },
    ],
    fixed: [
      { name: '249-s1.s1', offset: 0x0, size: 0x20000, crc: 'dc9eb372' },
    ],
  },
  {
    name: 'mslugx',
    description: 'Metal Slug X - Super Vehicle-001 (NGM-2500 ~ NGH-2500)',
    year: '1999',
    publisher: 'SNK',
    program: [
      { name: '250-p1.p1', offset: 0x0, size: 0x100000, crc: '81f1f60b', loadFlag: 'load16_word_swap' },
      { name: '250-p2.ep1', offset: 0x100000, size: 0x400000, crc: '1fda2e12', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '250-c1.c1', offset: 0x0, size: 0x800000, crc: '09a52c6f', loadFlag: 'load16_byte' },
      { name: '250-c2.c2', offset: 0x1, size: 0x800000, crc: '31679821', loadFlag: 'load16_byte' },
      { name: '250-c3.c3', offset: 0x1000000, size: 0x800000, crc: 'fd602019', loadFlag: 'load16_byte' },
      { name: '250-c4.c4', offset: 0x1000001, size: 0x800000, crc: '31354513', loadFlag: 'load16_byte' },
      { name: '250-c5.c5', offset: 0x2000000, size: 0x800000, crc: 'a4b56124', loadFlag: 'load16_byte' },
      { name: '250-c6.c6', offset: 0x2000001, size: 0x800000, crc: '83e3e69d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '250-m1.m1', offset: 0x0, size: 0x20000, crc: 'fd42a842' },
    ],
    voice: [
      { name: '250-v1.v1', offset: 0x0, size: 0x400000, crc: 'c79ede73' },
      { name: '250-v2.v2', offset: 0x400000, size: 0x400000, crc: 'ea9aabe1' },
      { name: '250-v3.v3', offset: 0x800000, size: 0x200000, crc: '2ca65102' },
    ],
    fixed: [
      { name: '250-s1.s1', offset: 0x0, size: 0x20000, crc: 'fb6f441d' },
    ],
  },
  {
    name: 'kof99',
    description: 'The King of Fighters \'99 - Millennium Battle (NGM-2510)',
    year: '1999',
    publisher: 'SNK',
    program: [
      { name: 'ka.neo-sma', offset: 0xC0000, size: 0x40000, crc: '7766d09e', loadFlag: 'load16_word_swap' },
      { name: '251-p1.p1', offset: 0x100000, size: 0x400000, crc: '006e4532', loadFlag: 'load16_word_swap' },
      { name: '251-p2.p2', offset: 0x500000, size: 0x400000, crc: '90175f15', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '251-c1.c1', offset: 0x0, size: 0x800000, crc: '0f9e93fe', loadFlag: 'load16_byte' },
      { name: '251-c2.c2', offset: 0x1, size: 0x800000, crc: 'e71e2ea3', loadFlag: 'load16_byte' },
      { name: '251-c3.c3', offset: 0x1000000, size: 0x800000, crc: '238755d2', loadFlag: 'load16_byte' },
      { name: '251-c4.c4', offset: 0x1000001, size: 0x800000, crc: '438c8b22', loadFlag: 'load16_byte' },
      { name: '251-c5.c5', offset: 0x2000000, size: 0x800000, crc: '0b0abd0a', loadFlag: 'load16_byte' },
      { name: '251-c6.c6', offset: 0x2000001, size: 0x800000, crc: '65bbf281', loadFlag: 'load16_byte' },
      { name: '251-c7.c7', offset: 0x3000000, size: 0x800000, crc: 'ff65f62e', loadFlag: 'load16_byte' },
      { name: '251-c8.c8', offset: 0x3000001, size: 0x800000, crc: '8d921c68', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '251-m1.m1', offset: 0x0, size: 0x20000, crc: '5e74539c' },
    ],
    voice: [
      { name: '251-v1.v1', offset: 0x0, size: 0x400000, crc: 'ef2eecc8' },
      { name: '251-v2.v2', offset: 0x400000, size: 0x400000, crc: '73e211ca' },
      { name: '251-v3.v3', offset: 0x800000, size: 0x400000, crc: '821901da' },
      { name: '251-v4.v4', offset: 0xC00000, size: 0x200000, crc: 'b49e6178' },
    ],
  },
  {
    name: 'ganryu',
    description: 'Ganryu / Musashi Ganryuki',
    year: '1999',
    publisher: 'Visco',
    program: [
      { name: '252-p1.p1', offset: 0x100000, size: 0x100000, crc: '4b8ac4fb', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '252-c1.c1', offset: 0x0, size: 0x800000, crc: '50ee7882', loadFlag: 'load16_byte' },
      { name: '252-c2.c2', offset: 0x1, size: 0x800000, crc: '62585474', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '252-m1.m1', offset: 0x0, size: 0x20000, crc: '30cc4099' },
    ],
    voice: [
      { name: '252-v1.v1', offset: 0x0, size: 0x400000, crc: 'e5946733' },
    ],
  },
  {
    name: 'garou',
    description: 'Garou - Mark of the Wolves (NGM-2530)',
    year: '1999',
    publisher: 'SNK',
    program: [
      { name: 'kf.neo-sma', offset: 0xC0000, size: 0x40000, crc: '98bc93dc', loadFlag: 'load16_word_swap' },
      { name: '253-ep1.p1', offset: 0x100000, size: 0x200000, crc: 'ea3171a4', loadFlag: 'load16_word_swap' },
      { name: '253-ep2.p2', offset: 0x300000, size: 0x200000, crc: '382f704b', loadFlag: 'load16_word_swap' },
      { name: '253-ep3.p3', offset: 0x500000, size: 0x200000, crc: 'e395bfdd', loadFlag: 'load16_word_swap' },
      { name: '253-ep4.p4', offset: 0x700000, size: 0x200000, crc: 'da92c08e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '253-c1.c1', offset: 0x0, size: 0x800000, crc: '0603e046', loadFlag: 'load16_byte' },
      { name: '253-c2.c2', offset: 0x1, size: 0x800000, crc: '0917d2a4', loadFlag: 'load16_byte' },
      { name: '253-c3.c3', offset: 0x1000000, size: 0x800000, crc: '6737c92d', loadFlag: 'load16_byte' },
      { name: '253-c4.c4', offset: 0x1000001, size: 0x800000, crc: '5ba92ec6', loadFlag: 'load16_byte' },
      { name: '253-c5.c5', offset: 0x2000000, size: 0x800000, crc: '3eab5557', loadFlag: 'load16_byte' },
      { name: '253-c6.c6', offset: 0x2000001, size: 0x800000, crc: '308d098b', loadFlag: 'load16_byte' },
      { name: '253-c7.c7', offset: 0x3000000, size: 0x800000, crc: 'c0e995ae', loadFlag: 'load16_byte' },
      { name: '253-c8.c8', offset: 0x3000001, size: 0x800000, crc: '21a11303', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '253-m1.m1', offset: 0x0, size: 0x40000, crc: '36a806be' },
    ],
    voice: [
      { name: '253-v1.v1', offset: 0x0, size: 0x400000, crc: '263e388c' },
      { name: '253-v2.v2', offset: 0x400000, size: 0x400000, crc: '2c6bc7be' },
      { name: '253-v3.v3', offset: 0x800000, size: 0x400000, crc: '0425b27d' },
      { name: '253-v4.v4', offset: 0xC00000, size: 0x400000, crc: 'a54be8a9' },
    ],
  },
  {
    name: 's1945p',
    description: 'Strikers 1945 Plus',
    year: '1999',
    publisher: 'Psikyo',
    program: [
      { name: '254-p1.p1', offset: 0x0, size: 0x100000, crc: 'ff8efcff', loadFlag: 'load16_word_swap' },
      { name: '254-p2.sp2', offset: 0x100000, size: 0x400000, crc: 'efdfd4dd', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '254-c1.c1', offset: 0x0, size: 0x800000, crc: 'ae6fc8ef', loadFlag: 'load16_byte' },
      { name: '254-c2.c2', offset: 0x1, size: 0x800000, crc: '436fa176', loadFlag: 'load16_byte' },
      { name: '254-c3.c3', offset: 0x1000000, size: 0x800000, crc: 'e53ff2dc', loadFlag: 'load16_byte' },
      { name: '254-c4.c4', offset: 0x1000001, size: 0x800000, crc: '818672f0', loadFlag: 'load16_byte' },
      { name: '254-c5.c5', offset: 0x2000000, size: 0x800000, crc: '4580eacd', loadFlag: 'load16_byte' },
      { name: '254-c6.c6', offset: 0x2000001, size: 0x800000, crc: 'e34970fc', loadFlag: 'load16_byte' },
      { name: '254-c7.c7', offset: 0x3000000, size: 0x800000, crc: 'f2323239', loadFlag: 'load16_byte' },
      { name: '254-c8.c8', offset: 0x3000001, size: 0x800000, crc: '66848c7d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '254-m1.m1', offset: 0x0, size: 0x20000, crc: '994b4487' },
    ],
    voice: [
      { name: '254-v1.v1', offset: 0x0, size: 0x400000, crc: '844f58fb' },
      { name: '254-v2.v2', offset: 0x400000, size: 0x400000, crc: 'd9a248f0' },
      { name: '254-v3.v3', offset: 0x800000, size: 0x400000, crc: '0b0d2d33' },
      { name: '254-v4.v4', offset: 0xC00000, size: 0x400000, crc: '6d13dc91' },
    ],
  },
  {
    name: 'preisle2',
    description: 'Prehistoric Isle 2',
    year: '1999',
    publisher: 'Yumekobo / Saurus',
    program: [
      { name: '255-p1.p1', offset: 0x0, size: 0x100000, crc: 'dfa3c0f3', loadFlag: 'load16_word_swap' },
      { name: '255-p2.sp2', offset: 0x100000, size: 0x400000, crc: '42050b80', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '255-c1.c1', offset: 0x0, size: 0x800000, crc: 'ea06000b', loadFlag: 'load16_byte' },
      { name: '255-c2.c2', offset: 0x1, size: 0x800000, crc: '04e67d79', loadFlag: 'load16_byte' },
      { name: '255-c3.c3', offset: 0x1000000, size: 0x800000, crc: '60e31e08', loadFlag: 'load16_byte' },
      { name: '255-c4.c4', offset: 0x1000001, size: 0x800000, crc: '40371d69', loadFlag: 'load16_byte' },
      { name: '255-c5.c5', offset: 0x2000000, size: 0x800000, crc: '0b2e6adf', loadFlag: 'load16_byte' },
      { name: '255-c6.c6', offset: 0x2000001, size: 0x800000, crc: 'b001bdd3', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '255-m1.m1', offset: 0x0, size: 0x20000, crc: '8efd4014' },
    ],
    voice: [
      { name: '255-v1.v1', offset: 0x0, size: 0x400000, crc: '5a14543d' },
      { name: '255-v2.v2', offset: 0x400000, size: 0x200000, crc: '6610d91a' },
    ],
  },
  {
    name: 'mslug3',
    description: 'Metal Slug 3 (NGM-2560)',
    year: '2000',
    publisher: 'SNK',
    program: [
      { name: 'green.neo-sma', offset: 0xC0000, size: 0x40000, crc: '9cd55736', loadFlag: 'load16_word_swap' },
      { name: '256-pg1.p1', offset: 0x100000, size: 0x400000, crc: 'b07edfd5', loadFlag: 'load16_word_swap' },
      { name: '256-pg2.p2', offset: 0x500000, size: 0x400000, crc: '6097c26b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '256-c1.c1', offset: 0x0, size: 0x800000, crc: '5a79c34e', loadFlag: 'load16_byte' },
      { name: '256-c2.c2', offset: 0x1, size: 0x800000, crc: '944c362c', loadFlag: 'load16_byte' },
      { name: '256-c3.c3', offset: 0x1000000, size: 0x800000, crc: '6e69d36f', loadFlag: 'load16_byte' },
      { name: '256-c4.c4', offset: 0x1000001, size: 0x800000, crc: 'b755b4eb', loadFlag: 'load16_byte' },
      { name: '256-c5.c5', offset: 0x2000000, size: 0x800000, crc: '7aacab47', loadFlag: 'load16_byte' },
      { name: '256-c6.c6', offset: 0x2000001, size: 0x800000, crc: 'c698fd5d', loadFlag: 'load16_byte' },
      { name: '256-c7.c7', offset: 0x3000000, size: 0x800000, crc: 'cfceddd2', loadFlag: 'load16_byte' },
      { name: '256-c8.c8', offset: 0x3000001, size: 0x800000, crc: '4d9be34c', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '256-m1.m1', offset: 0x0, size: 0x80000, crc: 'eaeec116' },
    ],
    voice: [
      { name: '256-v1.v1', offset: 0x0, size: 0x400000, crc: 'f2690241' },
      { name: '256-v2.v2', offset: 0x400000, size: 0x400000, crc: '7e2a10bd' },
      { name: '256-v3.v3', offset: 0x800000, size: 0x400000, crc: '0eaec17c' },
      { name: '256-v4.v4', offset: 0xC00000, size: 0x400000, crc: '9b4b22d4' },
    ],
  },
  {
    name: 'kof2000',
    description: 'The King of Fighters 2000 (NGM-2570 ~ NGH-2570)',
    year: '2000',
    publisher: 'SNK',
    program: [
      { name: 'neo-sma', offset: 0xC0000, size: 0x40000, crc: '71c6e6bb', loadFlag: 'load16_word_swap' },
      { name: '257-p1.p1', offset: 0x100000, size: 0x400000, crc: '60947b4c', loadFlag: 'load16_word_swap' },
      { name: '257-p2.p2', offset: 0x500000, size: 0x400000, crc: '1b7ec415', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '257-c1.c1', offset: 0x0, size: 0x800000, crc: 'cef1cdfa', loadFlag: 'load16_byte' },
      { name: '257-c2.c2', offset: 0x1, size: 0x800000, crc: 'f7bf0003', loadFlag: 'load16_byte' },
      { name: '257-c3.c3', offset: 0x1000000, size: 0x800000, crc: '101e6560', loadFlag: 'load16_byte' },
      { name: '257-c4.c4', offset: 0x1000001, size: 0x800000, crc: 'bd2fc1b1', loadFlag: 'load16_byte' },
      { name: '257-c5.c5', offset: 0x2000000, size: 0x800000, crc: '89775412', loadFlag: 'load16_byte' },
      { name: '257-c6.c6', offset: 0x2000001, size: 0x800000, crc: 'fa7200d5', loadFlag: 'load16_byte' },
      { name: '257-c7.c7', offset: 0x3000000, size: 0x800000, crc: '7da11fe4', loadFlag: 'load16_byte' },
      { name: '257-c8.c8', offset: 0x3000001, size: 0x800000, crc: 'b1afa60b', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '257-v1.v1', offset: 0x0, size: 0x400000, crc: '17cde847' },
      { name: '257-v2.v2', offset: 0x400000, size: 0x400000, crc: '1afb20ff' },
      { name: '257-v3.v3', offset: 0x800000, size: 0x400000, crc: '4605036a' },
      { name: '257-v4.v4', offset: 0xC00000, size: 0x400000, crc: '764bbd6b' },
    ],
  },
  {
    name: 'bangbead',
    description: 'Bang Bead',
    year: '2000',
    publisher: 'Visco',
    program: [
      { name: '259-p1.p1', offset: 0x100000, size: 0x100000, crc: '88a37f8b', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '259-c1.c1', offset: 0x0, size: 0x800000, crc: '1f537f74', loadFlag: 'load16_byte' },
      { name: '259-c2.c2', offset: 0x1, size: 0x800000, crc: '0efd98ff', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '259-m1.m1', offset: 0x0, size: 0x20000, crc: '85668ee9' },
    ],
    voice: [
      { name: '259-v1.v1', offset: 0x0, size: 0x400000, crc: '088eb8ab' },
      { name: '259-v2.v2', offset: 0x400000, size: 0x100000, crc: '97528fe9' },
    ],
  },
  {
    name: 'nitd',
    description: 'Nightmare in the Dark',
    year: '2000',
    publisher: 'Eleven / Gavaking',
    program: [
      { name: '260-p1.p1', offset: 0x0, size: 0x80000, crc: '61361082', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '260-c1.c1', offset: 0x0, size: 0x800000, crc: '147b0c7f', loadFlag: 'load16_byte' },
      { name: '260-c2.c2', offset: 0x1, size: 0x800000, crc: 'd2b04b0d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '260-m1.m1', offset: 0x0, size: 0x80000, crc: '6407c5e5' },
    ],
    voice: [
      { name: '260-v1.v1', offset: 0x0, size: 0x400000, crc: '24b0480c' },
    ],
  },
  {
    name: 'sengoku3',
    description: 'Sengoku 3 / Sengoku Densho 2001 (set 1)',
    year: '2001',
    publisher: 'Noise Factory / SNK',
    program: [
      { name: '261-ph1.p1', offset: 0x100000, size: 0x100000, crc: 'e0d4bc0a', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '261-c1.c1', offset: 0x0, size: 0x800000, crc: 'ded84d9c', loadFlag: 'load16_byte' },
      { name: '261-c2.c2', offset: 0x1, size: 0x800000, crc: 'b8eb4348', loadFlag: 'load16_byte' },
      { name: '261-c3.c3', offset: 0x1000000, size: 0x800000, crc: '84e2034a', loadFlag: 'load16_byte' },
      { name: '261-c4.c4', offset: 0x1000001, size: 0x800000, crc: '0b45ae53', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '261-m1.m1', offset: 0x0, size: 0x80000, crc: '7d501c39' },
    ],
    voice: [
      { name: '261-v1.v1', offset: 0x0, size: 0x400000, crc: '64c30081' },
      { name: '261-v2.v2', offset: 0x400000, size: 0x400000, crc: '392a9c47' },
      { name: '261-v3.v3', offset: 0x800000, size: 0x400000, crc: 'c1a7ebe3' },
      { name: '261-v4.v4', offset: 0xC00000, size: 0x200000, crc: '9000d085' },
    ],
  },
  {
    name: 'kof2001',
    description: 'The King of Fighters 2001 (NGM-262?)',
    year: '2001',
    publisher: 'Eolith / SNK',
    program: [
      { name: '262-p1-08-e0.p1', offset: 0x0, size: 0x100000, crc: '9381750d', loadFlag: 'load16_word_swap' },
      { name: '262-p2-08-e0.sp2', offset: 0x100000, size: 0x400000, crc: '8e0d8329', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '262-c1-08-e0.c1', offset: 0x0, size: 0x800000, crc: '99cc785a', loadFlag: 'load16_byte' },
      { name: '262-c2-08-e0.c2', offset: 0x1, size: 0x800000, crc: '50368cbf', loadFlag: 'load16_byte' },
      { name: '262-c3-08-e0.c3', offset: 0x1000000, size: 0x800000, crc: 'fb14ff87', loadFlag: 'load16_byte' },
      { name: '262-c4-08-e0.c4', offset: 0x1000001, size: 0x800000, crc: '4397faf8', loadFlag: 'load16_byte' },
      { name: '262-c5-08-e0.c5', offset: 0x2000000, size: 0x800000, crc: '91f24be4', loadFlag: 'load16_byte' },
      { name: '262-c6-08-e0.c6', offset: 0x2000001, size: 0x800000, crc: 'a31e4403', loadFlag: 'load16_byte' },
      { name: '262-c7-08-e0.c7', offset: 0x3000000, size: 0x800000, crc: '54d9d1ec', loadFlag: 'load16_byte' },
      { name: '262-c8-08-e0.c8', offset: 0x3000001, size: 0x800000, crc: '59289a6b', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '262-v1-08-e0.v1', offset: 0x0, size: 0x400000, crc: '83d49ecf' },
      { name: '262-v2-08-e0.v2', offset: 0x400000, size: 0x400000, crc: '003f1843' },
      { name: '262-v3-08-e0.v3', offset: 0x800000, size: 0x400000, crc: '2ae38dbe' },
      { name: '262-v4-08-e0.v4', offset: 0xC00000, size: 0x400000, crc: '26ec4dd9' },
    ],
  },
  {
    name: 'mslug4',
    description: 'Metal Slug 4 (NGM-2630)',
    year: '2002',
    publisher: 'Mega / Noise Factory / Playmore',
    program: [
      { name: '263-p1.p1', offset: 0x0, size: 0x100000, crc: '27e4def3', loadFlag: 'load16_word_swap' },
      { name: '263-p2.sp2', offset: 0x100000, size: 0x400000, crc: 'fdb7aed8', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '263-c1.c1', offset: 0x0, size: 0x800000, crc: '84865f8a', loadFlag: 'load16_byte' },
      { name: '263-c2.c2', offset: 0x1, size: 0x800000, crc: '81df97f2', loadFlag: 'load16_byte' },
      { name: '263-c3.c3', offset: 0x1000000, size: 0x800000, crc: '1a343323', loadFlag: 'load16_byte' },
      { name: '263-c4.c4', offset: 0x1000001, size: 0x800000, crc: '942cfb44', loadFlag: 'load16_byte' },
      { name: '263-c5.c5', offset: 0x2000000, size: 0x800000, crc: 'a748854f', loadFlag: 'load16_byte' },
      { name: '263-c6.c6', offset: 0x2000001, size: 0x800000, crc: '5c8ba116', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '263-v1.v1', offset: 0x0, size: 0x800000, crc: '01e9b9cd' },
      { name: '263-v2.v2', offset: 0x800000, size: 0x800000, crc: '4ab2bf81' },
    ],
  },
  {
    name: 'rotd',
    description: 'Rage of the Dragons (NGM-2640?)',
    year: '2002',
    publisher: 'Evoga / Playmore',
    program: [
      { name: '264-p1.p1', offset: 0x0, size: 0x800000, crc: 'b8cc969d', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '264-c1.c1', offset: 0x0, size: 0x800000, crc: '4f148fee', loadFlag: 'load16_byte' },
      { name: '264-c2.c2', offset: 0x1, size: 0x800000, crc: '7cf5ff72', loadFlag: 'load16_byte' },
      { name: '264-c3.c3', offset: 0x1000000, size: 0x800000, crc: '64d84c98', loadFlag: 'load16_byte' },
      { name: '264-c4.c4', offset: 0x1000001, size: 0x800000, crc: '2f394a95', loadFlag: 'load16_byte' },
      { name: '264-c5.c5', offset: 0x2000000, size: 0x800000, crc: '6b99b978', loadFlag: 'load16_byte' },
      { name: '264-c6.c6', offset: 0x2000001, size: 0x800000, crc: '847d5c7d', loadFlag: 'load16_byte' },
      { name: '264-c7.c7', offset: 0x3000000, size: 0x800000, crc: '231d681e', loadFlag: 'load16_byte' },
      { name: '264-c8.c8', offset: 0x3000001, size: 0x800000, crc: 'c5edb5c4', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '264-v1.v1', offset: 0x0, size: 0x800000, crc: 'fa005812' },
      { name: '264-v2.v2', offset: 0x800000, size: 0x800000, crc: 'c3dc8bf0' },
    ],
  },
  {
    name: 'kof2002',
    description: 'The King of Fighters 2002 (NGM-2650 ~ NGH-2650)',
    year: '2002',
    publisher: 'Eolith / Playmore',
    program: [
      { name: '265-p1.p1', offset: 0x0, size: 0x100000, crc: '9ede7323', loadFlag: 'load16_word_swap' },
      { name: '265-p2.sp2', offset: 0x100000, size: 0x400000, crc: '327266b8', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '265-c1.c1', offset: 0x0, size: 0x800000, crc: '2b65a656', loadFlag: 'load16_byte' },
      { name: '265-c2.c2', offset: 0x1, size: 0x800000, crc: 'adf18983', loadFlag: 'load16_byte' },
      { name: '265-c3.c3', offset: 0x1000000, size: 0x800000, crc: '875e9fd7', loadFlag: 'load16_byte' },
      { name: '265-c4.c4', offset: 0x1000001, size: 0x800000, crc: '2da13947', loadFlag: 'load16_byte' },
      { name: '265-c5.c5', offset: 0x2000000, size: 0x800000, crc: '61bd165d', loadFlag: 'load16_byte' },
      { name: '265-c6.c6', offset: 0x2000001, size: 0x800000, crc: '03fdd1eb', loadFlag: 'load16_byte' },
      { name: '265-c7.c7', offset: 0x3000000, size: 0x800000, crc: '1a2749d8', loadFlag: 'load16_byte' },
      { name: '265-c8.c8', offset: 0x3000001, size: 0x800000, crc: 'ab0bb549', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '265-v1.v1', offset: 0x0, size: 0x800000, crc: '15e8f3f5' },
      { name: '265-v2.v2', offset: 0x800000, size: 0x800000, crc: 'da41d6f9' },
    ],
  },
  {
    name: 'matrim',
    description: 'Matrimelee / Shin Gouketsuji Ichizoku Toukon (NGM-2660 ~ NGH-2660)',
    year: '2003',
    publisher: 'Noise Factory / Atlus',
    program: [
      { name: '266-p1.p1', offset: 0x0, size: 0x100000, crc: '5d4c2dc7', loadFlag: 'load16_word_swap' },
      { name: '266-p2.sp2', offset: 0x100000, size: 0x400000, crc: 'a14b1906', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '266-c1.c1', offset: 0x0, size: 0x800000, crc: '505f4e30', loadFlag: 'load16_byte' },
      { name: '266-c2.c2', offset: 0x1, size: 0x800000, crc: '3cb57482', loadFlag: 'load16_byte' },
      { name: '266-c3.c3', offset: 0x1000000, size: 0x800000, crc: 'f1cc6ad0', loadFlag: 'load16_byte' },
      { name: '266-c4.c4', offset: 0x1000001, size: 0x800000, crc: '45b806b7', loadFlag: 'load16_byte' },
      { name: '266-c5.c5', offset: 0x2000000, size: 0x800000, crc: '9a15dd6b', loadFlag: 'load16_byte' },
      { name: '266-c6.c6', offset: 0x2000001, size: 0x800000, crc: '281cb939', loadFlag: 'load16_byte' },
      { name: '266-c7.c7', offset: 0x3000000, size: 0x800000, crc: '4b71f780', loadFlag: 'load16_byte' },
      { name: '266-c8.c8', offset: 0x3000001, size: 0x800000, crc: '29873d33', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '266-v1.v1', offset: 0x0, size: 0x800000, crc: 'a4f83690' },
      { name: '266-v2.v2', offset: 0x800000, size: 0x800000, crc: 'd0f69eda' },
    ],
  },
  {
    name: 'pnyaa',
    description: 'Pochi and Nyaa (Ver 2.02)',
    year: '2003',
    publisher: 'Aiky / Taito',
    program: [
      { name: 'pn202.p1', offset: 0x0, size: 0x100000, crc: 'bf34e71c', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '267-c1.c1', offset: 0x0, size: 0x800000, crc: '5eebee65', loadFlag: 'load16_byte' },
      { name: '267-c2.c2', offset: 0x1, size: 0x800000, crc: '2b67187b', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '267-v1.v1', offset: 0x0, size: 0x400000, crc: 'e2e8e917' },
    ],
  },
  {
    name: 'mslug5',
    description: 'Metal Slug 5 (NGM-2680)',
    year: '2003',
    publisher: 'SNK Playmore',
    program: [
      { name: '268-p1cr.p1', offset: 0x0, size: 0x400000, crc: 'd0466792', loadFlag: 'load32_word_swap' },
      { name: '268-p2cr.p2', offset: 0x2, size: 0x400000, crc: 'fbf6b61e', loadFlag: 'load32_word_swap' },
    ],
    sprites: [
      { name: '268-c1c.c1', offset: 0x0, size: 0x800000, crc: 'ab7c389a', loadFlag: 'load16_byte' },
      { name: '268-c2c.c2', offset: 0x1, size: 0x800000, crc: '3560881b', loadFlag: 'load16_byte' },
      { name: '268-c3c.c3', offset: 0x1000000, size: 0x800000, crc: '3af955ea', loadFlag: 'load16_byte' },
      { name: '268-c4c.c4', offset: 0x1000001, size: 0x800000, crc: 'c329c373', loadFlag: 'load16_byte' },
      { name: '268-c5c.c5', offset: 0x2000000, size: 0x800000, crc: '959c8177', loadFlag: 'load16_byte' },
      { name: '268-c6c.c6', offset: 0x2000001, size: 0x800000, crc: '010a831b', loadFlag: 'load16_byte' },
      { name: '268-c7c.c7', offset: 0x3000000, size: 0x800000, crc: '6d72a969', loadFlag: 'load16_byte' },
      { name: '268-c8c.c8', offset: 0x3000001, size: 0x800000, crc: '551d720e', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '268-v1c.v1', offset: 0x0, size: 0x800000, crc: 'ae31d60c' },
      { name: '268-v2c.v2', offset: 0x800000, size: 0x800000, crc: 'c40613ed' },
    ],
  },
  {
    name: 'svc',
    description: 'SNK vs. Capcom - SVC Chaos (NGM-2690 ~ NGH-2690)',
    year: '2003',
    publisher: 'Playmore / Capcom',
    program: [
      { name: '269-p1.p1', offset: 0x0, size: 0x400000, crc: '38e2005e', loadFlag: 'load32_word_swap' },
      { name: '269-p2.p2', offset: 0x2, size: 0x400000, crc: '6d13797c', loadFlag: 'load32_word_swap' },
    ],
    sprites: [
      { name: '269-c1r.c1', offset: 0x0, size: 0x800000, crc: '887b4068', loadFlag: 'load16_byte' },
      { name: '269-c2r.c2', offset: 0x1, size: 0x800000, crc: '4e8903e4', loadFlag: 'load16_byte' },
      { name: '269-c3r.c3', offset: 0x1000000, size: 0x800000, crc: '7d9c55b0', loadFlag: 'load16_byte' },
      { name: '269-c4r.c4', offset: 0x1000001, size: 0x800000, crc: '8acb5bb6', loadFlag: 'load16_byte' },
      { name: '269-c5r.c5', offset: 0x2000000, size: 0x800000, crc: '097a4157', loadFlag: 'load16_byte' },
      { name: '269-c6r.c6', offset: 0x2000001, size: 0x800000, crc: 'e19df344', loadFlag: 'load16_byte' },
      { name: '269-c7r.c7', offset: 0x3000000, size: 0x800000, crc: 'd8f0340b', loadFlag: 'load16_byte' },
      { name: '269-c8r.c8', offset: 0x3000001, size: 0x800000, crc: '2570b71b', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '269-v1.v1', offset: 0x0, size: 0x800000, crc: 'c659b34c' },
      { name: '269-v2.v2', offset: 0x800000, size: 0x800000, crc: 'dd903835' },
    ],
  },
  {
    name: 'samsho5',
    description: 'Samurai Shodown V / Samurai Spirits Zero (NGM-2700, set 1)',
    year: '2003',
    publisher: 'Yuki Enterprise / SNK Playmore',
    program: [
      { name: '270-p1.p1', offset: 0x0, size: 0x400000, crc: '4a2a09e6', loadFlag: 'load16_word_swap' },
      { name: '270-p2.sp2', offset: 0x400000, size: 0x400000, crc: 'e0c74c85', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '270-c1.c1', offset: 0x0, size: 0x800000, crc: '14ffffac', loadFlag: 'load16_byte' },
      { name: '270-c2.c2', offset: 0x1, size: 0x800000, crc: '401f7299', loadFlag: 'load16_byte' },
      { name: '270-c3.c3', offset: 0x1000000, size: 0x800000, crc: '838f0260', loadFlag: 'load16_byte' },
      { name: '270-c4.c4', offset: 0x1000001, size: 0x800000, crc: '041560a5', loadFlag: 'load16_byte' },
      { name: '270-c5.c5', offset: 0x2000000, size: 0x800000, crc: 'bd30b52d', loadFlag: 'load16_byte' },
      { name: '270-c6.c6', offset: 0x2000001, size: 0x800000, crc: '86a69c70', loadFlag: 'load16_byte' },
      { name: '270-c7.c7', offset: 0x3000000, size: 0x800000, crc: 'd28fbc3c', loadFlag: 'load16_byte' },
      { name: '270-c8.c8', offset: 0x3000001, size: 0x800000, crc: '02c530a6', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '270-v1.v1', offset: 0x0, size: 0x800000, crc: '62e434eb' },
      { name: '270-v2.v2', offset: 0x800000, size: 0x800000, crc: '180f3c9a' },
    ],
  },
  {
    name: 'kof2003',
    description: 'The King of Fighters 2003 (NGM-2710, Export)',
    year: '2003',
    publisher: 'SNK Playmore',
    program: [
      { name: '271-p1c.p1', offset: 0x0, size: 0x400000, crc: '530ecc14', loadFlag: 'load32_word_swap' },
      { name: '271-p2c.p2', offset: 0x2, size: 0x400000, crc: 'fd568da9', loadFlag: 'load32_word_swap' },
      { name: '271-p3c.p3', offset: 0x800000, size: 0x100000, crc: 'aec5b4a9', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '271-c1c.c1', offset: 0x0, size: 0x800000, crc: 'b1dc25d0', loadFlag: 'load16_byte' },
      { name: '271-c2c.c2', offset: 0x1, size: 0x800000, crc: 'd5362437', loadFlag: 'load16_byte' },
      { name: '271-c3c.c3', offset: 0x1000000, size: 0x800000, crc: '0a1fbeab', loadFlag: 'load16_byte' },
      { name: '271-c4c.c4', offset: 0x1000001, size: 0x800000, crc: '87b19a0c', loadFlag: 'load16_byte' },
      { name: '271-c5c.c5', offset: 0x2000000, size: 0x800000, crc: '704ea371', loadFlag: 'load16_byte' },
      { name: '271-c6c.c6', offset: 0x2000001, size: 0x800000, crc: '20a1164c', loadFlag: 'load16_byte' },
      { name: '271-c7c.c7', offset: 0x3000000, size: 0x800000, crc: '189aba7f', loadFlag: 'load16_byte' },
      { name: '271-c8c.c8', offset: 0x3000001, size: 0x800000, crc: '20ec4fdc', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '271-v1c.v1', offset: 0x0, size: 0x800000, crc: 'ffa3f8c7' },
      { name: '271-v2c.v2', offset: 0x800000, size: 0x800000, crc: '5382c7d1' },
    ],
  },
  {
    name: 'samsh5sp',
    description: 'Samurai Shodown V Special / Samurai Spirits Zero Special (NGM-2720)',
    year: '2004',
    publisher: 'Yuki Enterprise / SNK Playmore',
    program: [
      { name: '272-p1.p1', offset: 0x0, size: 0x400000, crc: 'fb7a6bba', loadFlag: 'load16_word_swap' },
      { name: '272-p2.sp2', offset: 0x400000, size: 0x400000, crc: '63492ea6', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '272-c1.c1', offset: 0x0, size: 0x800000, crc: '4f97661a', loadFlag: 'load16_byte' },
      { name: '272-c2.c2', offset: 0x1, size: 0x800000, crc: 'a3afda4f', loadFlag: 'load16_byte' },
      { name: '272-c3.c3', offset: 0x1000000, size: 0x800000, crc: '8c3c7502', loadFlag: 'load16_byte' },
      { name: '272-c4.c4', offset: 0x1000001, size: 0x800000, crc: '32d5e2e2', loadFlag: 'load16_byte' },
      { name: '272-c5.c5', offset: 0x2000000, size: 0x800000, crc: '6ce085bc', loadFlag: 'load16_byte' },
      { name: '272-c6.c6', offset: 0x2000001, size: 0x800000, crc: '05c8dc8e', loadFlag: 'load16_byte' },
      { name: '272-c7.c7', offset: 0x3000000, size: 0x800000, crc: '1417b742', loadFlag: 'load16_byte' },
      { name: '272-c8.c8', offset: 0x3000001, size: 0x800000, crc: 'd49773cd', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '272-v1.v1', offset: 0x0, size: 0x800000, crc: '76a94127' },
      { name: '272-v2.v2', offset: 0x800000, size: 0x800000, crc: '4ba507f1' },
    ],
  },
  {
    name: 'jockeygp',
    description: 'Jockey Grand Prix (set 1)',
    year: '2001',
    publisher: 'Sun Amusement / BrezzaSoft',
    program: [
      { name: '008-epr.p1', offset: 0x0, size: 0x100000, crc: '2fb7f388', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '008-c1.c1', offset: 0x0, size: 0x800000, crc: 'a9acbf18', loadFlag: 'load16_byte' },
      { name: '008-c2.c2', offset: 0x1, size: 0x800000, crc: '6289eef9', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: '008-v1.v1', offset: 0x0, size: 0x200000, crc: '443eadba' },
    ],
  },
  {
    name: 'dragonsh',
    description: 'Dragon\'s Heaven (development board)',
    year: '1997',
    publisher: 'Face',
    program: [
      { name: 'EP2.bin', offset: 0x0, size: 0x80000, crc: 'f25c71ad', loadFlag: 'load16_byte' },
      { name: 'EP1.bin', offset: 0x1, size: 0x80000, crc: 'f353448c', loadFlag: 'load16_byte' },
    ],
    sprites: [
      { name: 'no3.bin', offset: 0x0, size: 0x1000000, crc: '81821826', loadFlag: 'load16_byte' },
      { name: 'no4.bin', offset: 0x1, size: 0x1000000, crc: '3601d568', loadFlag: 'load16_byte' },
    ],
    audio: [],
    voice: [
      { name: 'sram.v1', offset: 0x0, size: 0x200000 },
    ],
    fixed: [
      { name: 's1.s1', offset: 0x0, size: 0x20000, crc: '706477a7' },
    ],
  },
  {
    name: 'zintrckb',
    description: 'Zintrick / Oshidashi Zentrix (bootleg of CD version)',
    year: '1996',
    publisher: 'bootleg',
    program: [
      { name: 'zin-p1.bin', offset: 0x0, size: 0x100000, crc: '06c8fca7', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'zin-c1.bin', offset: 0x0, size: 0x200000, crc: '76aee189', loadFlag: 'load16_byte' },
      { name: 'zin-c2.bin', offset: 0x1, size: 0x200000, crc: '844ed4b3', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'zin-m1.bin', offset: 0x0, size: 0x20000, crc: 'fd9627ca' },
    ],
    voice: [
      { name: 'zin-v1.bin', offset: 0x0, size: 0x200000, crc: 'c09f74f1' },
    ],
    fixed: [
      { name: 'zin-s1.bin', offset: 0x0, size: 0x20000, crc: 'a7ab0e81' },
    ],
  },
  {
    name: 'froman2b',
    description: 'Idol Mahjong Final Romance 2 (Neo-Geo, bootleg of CD version)',
    year: '1995',
    publisher: 'bootleg',
    program: [
      { name: '098.p1', offset: 0x0, size: 0x80000, crc: '09675541', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '098.c1', offset: 0x0, size: 0x400000, crc: '29148bf7', loadFlag: 'load16_byte' },
      { name: '098.c2', offset: 0x1, size: 0x400000, crc: '226b1263', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '098.m1', offset: 0x0, size: 0x20000, crc: 'da4878cf' },
    ],
    voice: [
      { name: '098.v1', offset: 0x0, size: 0x100000, crc: '6f8ccddc' },
    ],
    fixed: [
      { name: '098.s1', offset: 0x0, size: 0x20000, crc: '0e6a7c73' },
    ],
  },
  {
    name: 'crswd2bl',
    description: 'Crossed Swords 2 (bootleg of CD version)',
    year: '1995',
    publisher: 'bootleg',
    program: [
      { name: '054-p1.p1', offset: 0x100000, size: 0x100000, crc: '64836147', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '054-c1.c1', offset: 0x0, size: 0x400000, crc: '8221b712', loadFlag: 'load16_byte' },
      { name: '054-c2.c2', offset: 0x1, size: 0x400000, crc: 'd6c6183d', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '054-m1.m1', offset: 0x0, size: 0x20000, crc: '63e28343' },
    ],
    voice: [
      { name: '054-v1.v1', offset: 0x0, size: 0x200000, crc: '22d4b93b' },
    ],
    fixed: [
      { name: '054-s1.s1', offset: 0x0, size: 0x20000, crc: '22e02ddd' },
    ],
  },
  {
    name: 'sbp',
    description: 'Super Bubble Pop (MVS)',
    year: '2004',
    publisher: 'Vektorlogic',
    program: [
      { name: '001-003-02a.u2', offset: 0x0, size: 0x80000, crc: 'd054d264', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '001-003-03b.u3', offset: 0x0, size: 0x200000, crc: '44791317', loadFlag: 'load16_byte' },
      { name: '001-003-04b.u4', offset: 0x1, size: 0x200000, crc: 'a3a1c0df', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '001-003-01b.u1', offset: 0x0, size: 0x80000, crc: '7b1f86f7' },
    ],
    voice: [
      { name: '001-003-12a.u12', offset: 0x0, size: 0x400000, crc: 'c96723b9' },
      { name: '001-003-13a.u13', offset: 0x400000, size: 0x400000, crc: '08c339a5' },
    ],
    fixed: [
      { name: '001-003-02b.u2', offset: 0x0, size: 0x20000, crc: '2fd04b2a' },
    ],
  },
  {
    name: 'diggerma',
    description: 'Digger Man (prototype)',
    year: '2000',
    publisher: 'Kyle Hodgetts',
    program: [
      { name: 'dig-p1.bin', offset: 0x0, size: 0x80000, crc: 'eda433d7', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'dig-c1.bin', offset: 0x0, size: 0x80000, crc: '3db0a4ed', loadFlag: 'load16_byte' },
      { name: 'dig-c2.bin', offset: 0x1, size: 0x80000, crc: '3e632161', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'dig-m1.bin', offset: 0x0, size: 0x20000, crc: 'e777a234' },
    ],
    voice: [
      { name: 'dig-v1.bin', offset: 0x0, size: 0x80000, crc: 'ee15bda4' },
    ],
    fixed: [
      { name: 'dig-s1.bin', offset: 0x0, size: 0x20000, crc: '9b3168f0' },
    ],
  },
  {
    name: '19yy',
    description: '19YY - Ichikyo Wai Wai',
    year: '2022',
    publisher: 'Ekorz',
    program: [
      { name: '19yy-p1.p1', offset: 0x100000, size: 0x100000, crc: '59374c47', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '19yy-c1.c1', offset: 0x0, size: 0x400000, crc: '622719d5', loadFlag: 'load16_byte' },
      { name: '19yy-c2.c2', offset: 0x1, size: 0x400000, crc: '41b07be5', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '19yy-m1.m1', offset: 0x0, size: 0x20000, crc: '636d8ac8' },
    ],
    voice: [
      { name: '19yy-v1.v1', offset: 0x0, size: 0x400000, crc: '7bb79a6a' },
      { name: '19yy-v2.v2', offset: 0x400000, size: 0x200000, crc: '1908a7ce' },
    ],
    fixed: [
      { name: '19yy-s1.s1', offset: 0x0, size: 0x20000, crc: '219b6f40' },
    ],
  },
  {
    name: 'baddudes',
    description: 'Bad Dudes - Burger Edition (20250628)',
    year: '2025',
    publisher: 'OzzyOuzo',
    program: [
      { name: 'bdudes-p1.bin', offset: 0x0, size: 0x100000, crc: '77a74315', loadFlag: 'load16_word_swap' },
      { name: 'bdudes-p2.bin', offset: 0x100000, size: 0x700000, crc: 'f827dd6e', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'bdudes-c1.bin', offset: 0x0, size: 0x1000000, crc: 'fe7bb928', loadFlag: 'load16_byte' },
      { name: 'bdudes-c2.bin', offset: 0x1, size: 0x1000000, crc: '68deb392', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'bdudes-m1.bin', offset: 0x0, size: 0x10000, crc: '2854b516' },
    ],
    voice: [
      { name: 'bdudes-v1.bin', offset: 0x0, size: 0x800000, crc: 'd8ac5857' },
      { name: 'bdudes-v2.bin', offset: 0x800000, size: 0x800000, crc: 'f37bd666' },
    ],
    fixed: [
      { name: 'bdudes-s1.bin', offset: 0x0, size: 0x20000, crc: '83b0f6c4' },
    ],
  },
  {
    name: 'bbb2',
    description: 'Bang Bang Busters 2 (demo v2.0)',
    year: '2025',
    publisher: 'PixelHeart',
    program: [
      { name: '070-p1.bin', offset: 0x0, size: 0x100000, crc: 'b6f02669', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '070-c1.bin', offset: 0x0, size: 0x800000, crc: 'c887be9b', loadFlag: 'load16_byte' },
      { name: '070-c2.bin', offset: 0x1, size: 0x800000, crc: '13c6dd38', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '070-m1.bin', offset: 0x0, size: 0x10000, crc: '4c134828' },
    ],
    voice: [
      { name: '070-v1.bin', offset: 0x0, size: 0x400000, crc: 'da7cb2b8' },
      { name: '070-v2.bin', offset: 0x400000, size: 0x400000, crc: '0043d4f2' },
    ],
    fixed: [
      { name: '070-s1.bin', offset: 0x0, size: 0x20000, crc: 'e53ef3d0' },
    ],
  },
  {
    name: 'cpbarrel',
    description: 'Captain Barrel',
    year: '2024',
    publisher: 'Neo Byte Force',
    program: [
      { name: 'captain-p1.bin', offset: 0x0, size: 0x100000, crc: '6da1737d', loadFlag: 'load16_word_swap' },
      { name: 'captain-p2.bin', offset: 0x100000, size: 0x100000, crc: 'f6f90237', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'captain-c1.bin', offset: 0x0, size: 0x200000, crc: 'bce671cd', loadFlag: 'load16_byte' },
      { name: 'captain-c2.bin', offset: 0x1, size: 0x200000, crc: '843e16ac', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'captain-m1.bin', offset: 0x0, size: 0x10000, crc: 'ed6260d2' },
    ],
    voice: [
      { name: 'captain-v1.bin', offset: 0x0, size: 0x800000, crc: '8cfcceb7' },
      { name: 'captain-v2.bin', offset: 0x800000, size: 0x800000, crc: 'd1080962' },
    ],
    fixed: [
      { name: 'captain-s1.bin', offset: 0x0, size: 0x20000, crc: '9785df9c' },
    ],
  },
  {
    name: 'cybforce',
    description: 'Cyborg Force',
    year: '2023',
    publisher: 'Neo Byte Force',
    program: [
      { name: 'cyborg-p1.bin', offset: 0x0, size: 0x100000, crc: '89e1c728', loadFlag: 'load16_word_swap' },
      { name: 'cyborg-p2.bin', offset: 0x100000, size: 0x300000, crc: 'e4a8b27a', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'cyborg-c1.bin', offset: 0x0, size: 0x1000000, crc: '77078687', loadFlag: 'load16_byte' },
      { name: 'cyborg-c2.bin', offset: 0x1, size: 0x1000000, crc: 'a5abdb83', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'cyborg-m1.bin', offset: 0x0, size: 0x10000, crc: '06da3cec' },
    ],
    voice: [
      { name: 'cyborg-v1.bin', offset: 0x0, size: 0x800000, crc: 'dc50718c' },
      { name: 'cyborg-v2.bin', offset: 0x800000, size: 0x800000, crc: '8135d5a8' },
    ],
    fixed: [
      { name: 'cyborg-s1.bin', offset: 0x0, size: 0x20000, crc: '5bd29810' },
    ],
  },
  {
    name: 'ddragon1',
    description: 'Double Dragon One (beta 3, 20250916)',
    year: '2025',
    publisher: 'OzzyOuzo',
    program: [
      { name: 'doubled-p1.bin', offset: 0x0, size: 0x100000, crc: '5991da92', loadFlag: 'load16_word_swap' },
      { name: 'doubled-p2.bin', offset: 0x100000, size: 0x400000, crc: '7e5ed6b8', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'doubled-c1.bin', offset: 0x0, size: 0x1000000, crc: 'fd883db8', loadFlag: 'load16_byte' },
      { name: 'doubled-c2.bin', offset: 0x1, size: 0x1000000, crc: '718050d3', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'doubled-m1.bin', offset: 0x0, size: 0x10000, crc: '43295479' },
    ],
    voice: [
      { name: 'doubled-v1.bin', offset: 0x0, size: 0x800000, crc: 'f01e97dc' },
      { name: 'doubled-v2.bin', offset: 0x800000, size: 0x800000, crc: '79156c41' },
    ],
    fixed: [
      { name: 'doubled-s1.bin', offset: 0x0, size: 0x20000, crc: '714afb4b' },
    ],
  },
  {
    name: 'etyphoon',
    description: 'The Eye of Typhoon (Tsunami Edition, beta 7)',
    year: '2022',
    publisher: 'OzzyOuzo',
    program: [
      { name: 'teot-p1.bin', offset: 0x0, size: 0x100000, crc: 'c0ae0a56', loadFlag: 'load16_word_swap' },
      { name: 'teot-p2.bin', offset: 0x100000, size: 0x800000, crc: '68dc7463', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'teot-c1.bin', offset: 0x0, size: 0x1000000, crc: '2fdbfbef', loadFlag: 'load16_byte' },
      { name: 'teot-c2.bin', offset: 0x1, size: 0x1000000, crc: '4b953a79', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'teot-m1.bin', offset: 0x0, size: 0x10000, crc: '0c17ccac' },
    ],
    voice: [
      { name: 'teot-v1.bin', offset: 0x0, size: 0x800000, crc: 'd2911e9c' },
      { name: 'teot-v2.bin', offset: 0x800000, size: 0x800000, crc: '49e3afe6' },
    ],
    fixed: [
      { name: 'teot-s1.bin', offset: 0x0, size: 0x20000, crc: '6d05f74b' },
    ],
  },
  {
    name: 'gladmort',
    description: 'GladMort (demo²)',
    year: '2024',
    publisher: 'PixelHeart',
    program: [
      { name: 'dod-p1.bin', offset: 0x0, size: 0x100000, crc: 'd7712425', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'dod-c1.bin', offset: 0x0, size: 0x1400000, crc: 'bcb081ba', loadFlag: 'load16_byte' },
      { name: 'dod-c2.bin', offset: 0x1, size: 0x1400000, crc: '1b927329', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'dod-m1.bin', offset: 0x0, size: 0x10000, crc: '0dfddae3' },
    ],
    voice: [
      { name: 'dod-v1.bin', offset: 0x0, size: 0x400000, crc: '3b5e1408' },
      { name: 'dod-v2.bin', offset: 0x400000, size: 0x400000, crc: 'd44f004d' },
      { name: 'dod-v3.bin', offset: 0x800000, size: 0x400000, crc: 'e9e8de2f' },
      { name: 'dod-v4.bin', offset: 0xC00000, size: 0x400000, crc: 'aaf3f4e2' },
    ],
    fixed: [
      { name: 'dod-s1.bin', offset: 0x0, size: 0x20000, crc: '8304be52' },
    ],
  },
  {
    name: 'goldnaxe',
    description: 'Golden Axe',
    year: '2025',
    publisher: 'The Twitch Elite',
    program: [
      { name: 'golden axe-p1.bin', offset: 0x0, size: 0x100000, crc: '3c3ed057', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'golden axe-c1.bin', offset: 0x0, size: 0x200000, crc: '7540f3d6', loadFlag: 'load16_byte' },
      { name: 'golden axe-c2.bin', offset: 0x1, size: 0x200000, crc: 'a78a6647', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'golden axe-m1.bin', offset: 0x0, size: 0x10000, crc: '7805d21b' },
    ],
    voice: [
      { name: 'golden axe-v1.bin', offset: 0x0, size: 0x400000, crc: '5ed99267' },
      { name: 'golden axe-v2.bin', offset: 0x400000, size: 0x400000, crc: 'd30632dd' },
    ],
    fixed: [
      { name: 'golden axe-s1.bin', offset: 0x0, size: 0x20000, crc: '707d91c0' },
    ],
  },
  {
    name: 'hypernoid',
    description: 'Hypernoid',
    year: '2021',
    publisher: 'NeoHomeBrew',
    program: [
      { name: '447.p1', offset: 0x0, size: 0x100000, crc: 'e024fa76', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '447.c1', offset: 0x0, size: 0x200000, crc: '41d6140a', loadFlag: 'load16_byte' },
      { name: '447.c2', offset: 0x1, size: 0x200000, crc: '36f35df2', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '447.m1', offset: 0x0, size: 0x80000, crc: '6c8eaacc' },
    ],
    voice: [
      { name: '447.v1', offset: 0x0, size: 0x400000, crc: 'dafa1bdd' },
      { name: '447.v2', offset: 0x400000, size: 0x400000, crc: '85ad8283' },
      { name: '447.v3', offset: 0x800000, size: 0x400000, crc: '86c27f0c' },
      { name: '447.v4', offset: 0xC00000, size: 0x400000, crc: 'a3982244' },
    ],
    fixed: [
      { name: '447.s1', offset: 0x0, size: 0x20000, crc: 'bb82ab71' },
    ],
  },
  {
    name: 'inthunt',
    description: 'In The Hunt (demo 20250518)',
    year: '2025',
    publisher: 'OzzyOuzo',
    program: [
      { name: 'inthehunt-p1.bin', offset: 0x0, size: 0x100000, crc: '58e3317a', loadFlag: 'load16_word_swap' },
      { name: 'inthehunt-p2.bin', offset: 0x100000, size: 0x100000, crc: 'c6494f12', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'inthehunt-c1.bin', offset: 0x0, size: 0x1000000, crc: '1b32eaf5', loadFlag: 'load16_byte' },
      { name: 'inthehunt-c2.bin', offset: 0x1, size: 0x1000000, crc: '87b8def8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'inthehunt-m1.bin', offset: 0x0, size: 0x10000, crc: 'dd055711' },
    ],
    voice: [
      { name: 'inthehunt-v1.bin', offset: 0x0, size: 0x800000, crc: 'eb947c63' },
      { name: 'inthehunt-v2.bin', offset: 0x800000, size: 0x800000, crc: '79156c41' },
    ],
    fixed: [
      { name: 'inthehunt-s1.bin', offset: 0x0, size: 0x20000, crc: '35c8a6e0' },
    ],
  },
  {
    name: 'lasthope',
    description: 'Last Hope',
    year: '2005',
    publisher: 'NG:DEV.TEAM',
    program: [
      { name: 'NGDT-300-P1.bin', offset: 0x0, size: 0x100000, crc: '3776a88f', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'NGDT-300-C1.bin', offset: 0x0, size: 0x400000, crc: '53ef41b5', loadFlag: 'load16_byte' },
      { name: 'NGDT-300-C2.bin', offset: 0x1, size: 0x400000, crc: 'f9b15ab3', loadFlag: 'load16_byte' },
      { name: 'NGDT-300-C3.bin', offset: 0x800000, size: 0x400000, crc: '50cc21cf', loadFlag: 'load16_byte' },
      { name: 'NGDT-300-C4.bin', offset: 0x800001, size: 0x400000, crc: '8486ad9e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'NGDT-300-M1.bin', offset: 0x0, size: 0x20000, crc: '113c870f' },
    ],
    voice: [
      { name: 'NGDT-300-V1.bin', offset: 0x0, size: 0x200000, crc: 'b765bafe' },
      { name: 'NGDT-300-V2.bin', offset: 0x200000, size: 0x200000, crc: '9fd0d559' },
      { name: 'NGDT-300-V3.bin', offset: 0x400000, size: 0x200000, crc: '6d5107e2' },
    ],
    fixed: [
      { name: 'NGDT-300-S1.bin', offset: 0x0, size: 0x10000, crc: '0c0ff9e6' },
    ],
  },
  {
    name: 'totc',
    description: 'Treasures of The Caribbean',
    year: '2010',
    publisher: 'Face / NCI',
    program: [
      { name: '316.p1', offset: 0x0, size: 0x100000, crc: '99604539', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '316.c1', offset: 0x0, size: 0x200000, crc: 'cdd6600f', loadFlag: 'load16_byte' },
      { name: '316.c2', offset: 0x1, size: 0x200000, crc: 'f362c271', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '316.m1', offset: 0x0, size: 0x20000, crc: '18b23ace' },
    ],
    voice: [
      { name: '316.v1', offset: 0x0, size: 0x200000, crc: '15c7f9e6' },
      { name: '316.v2', offset: 0x200000, size: 0x200000, crc: '1b264559' },
      { name: '316.v3', offset: 0x400000, size: 0x100000, crc: '84b62c5d' },
    ],
    fixed: [
      { name: '316.s1', offset: 0x0, size: 0x20000, crc: '0a3fee41' },
    ],
  },
  {
    name: 'looptris',
    description: 'Looptris',
    year: '2021',
    publisher: 'Blastar',
    program: [
      { name: 'looptris.p1', offset: 0x0, size: 0x80000, crc: '8fcb5104', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'looptris.c1', offset: 0x0, size: 0x80000, crc: 'b9413f13', loadFlag: 'load16_byte' },
      { name: 'looptris.c2', offset: 0x1, size: 0x80000, crc: '9409dbe8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'looptris.m1', offset: 0x0, size: 0x20000, crc: 'e7105df8' },
    ],
    voice: [
      { name: 'looptris.v1', offset: 0x0, size: 0x80000, crc: 'dfa63cd2' },
    ],
    fixed: [
      { name: 'looptris.s1', offset: 0x0, size: 0x20000, crc: '70e70448' },
    ],
  },
  {
    name: 'looptrsp',
    description: 'Looptris Plus',
    year: '2022',
    publisher: 'Blastar',
    program: [
      { name: 'looptrsp.p1', offset: 0x0, size: 0x80000, crc: '894bb290', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'looptrsp.c1', offset: 0x0, size: 0x80000, crc: 'b9413f13', loadFlag: 'load16_byte' },
      { name: 'looptrsp.c2', offset: 0x1, size: 0x80000, crc: '9409dbe8', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'looptrsp.m1', offset: 0x0, size: 0x20000, crc: '249bba11' },
    ],
    voice: [
      { name: 'looptrsp.v1', offset: 0x0, size: 0x80000, crc: 'c9f86637' },
      { name: 'looptrsp.v2', offset: 0x80000, size: 0x80000, crc: '41b3e17a' },
      { name: 'looptrsp.v3', offset: 0x100000, size: 0x80000, crc: '1ed4e538' },
      { name: 'looptrsp.v4', offset: 0x180000, size: 0x80000, crc: '705e7065' },
    ],
    fixed: [
      { name: 'looptrsp.s1', offset: 0x0, size: 0x20000, crc: '70e70448' },
    ],
  },
  {
    name: 'neotris',
    description: 'NeoTRIS',
    year: '2020',
    publisher: 'Chips on Steroids',
    program: [
      { name: 'neotris-p1.bin', offset: 0x0, size: 0x80000, crc: '4cd619cf', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'neotris-c1.bin', offset: 0x0, size: 0x400000, crc: 'e1c8eca9', loadFlag: 'load16_byte' },
      { name: 'neotris-c2.bin', offset: 0x1, size: 0x400000, crc: '11ca6e64', loadFlag: 'load16_byte' },
      { name: 'neotris-c3.bin', offset: 0x800000, size: 0x400000, crc: '1d9e2046', loadFlag: 'load16_byte' },
      { name: 'neotris-c4.bin', offset: 0x800001, size: 0x400000, crc: '9091e795', loadFlag: 'load16_byte' },
      { name: 'neotris-c5.bin', offset: 0x1000000, size: 0x400000, crc: 'bf278afe', loadFlag: 'load16_byte' },
      { name: 'neotris-c6.bin', offset: 0x1000001, size: 0x400000, crc: '8eb17e24', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'neotris-m1.bin', offset: 0x0, size: 0x10000, crc: '5a63bb9d' },
    ],
    voice: [
      { name: 'neotris-v1.bin', offset: 0x0, size: 0x400000, crc: 'fef16eb4' },
      { name: 'neotris-v2.bin', offset: 0x400000, size: 0x400000, crc: 'f0d28e19' },
      { name: 'neotris-v3.bin', offset: 0x800000, size: 0x400000, crc: 'fc652c8b' },
      { name: 'neotris-v4.bin', offset: 0xC00000, size: 0x400000, crc: 'c25764ca' },
    ],
    fixed: [
      { name: 'neotris-s1.bin', offset: 0x0, size: 0x20000, crc: '6809043a' },
    ],
  },
  {
    name: 'nblktiger',
    description: 'NeoBlack Tiger (demo)',
    year: '2020',
    publisher: 'OzzyOuzo',
    program: [
      { name: '202-p1.bin', offset: 0x0, size: 0x100000, crc: '18f34200', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: '202-c1.bin', offset: 0x0, size: 0x800000, crc: 'aa469494', loadFlag: 'load16_byte' },
      { name: '202-c2.bin', offset: 0x1, size: 0x800000, crc: 'fa07ba1e', loadFlag: 'load16_byte' },
      { name: '202-c3.bin', offset: 0x1000000, size: 0x800000, crc: 'aa469494', loadFlag: 'load16_byte' },
      { name: '202-c4.bin', offset: 0x1000001, size: 0x800000, crc: 'fa07ba1e', loadFlag: 'load16_byte' },
      { name: '202-c5.bin', offset: 0x2000000, size: 0x800000, crc: 'aa469494', loadFlag: 'load16_byte' },
      { name: '202-c6.bin', offset: 0x2000001, size: 0x800000, crc: 'fa07ba1e', loadFlag: 'load16_byte' },
      { name: '202-c7.bin', offset: 0x3000000, size: 0x800000, crc: 'aa469494', loadFlag: 'load16_byte' },
      { name: '202-c8.bin', offset: 0x3000001, size: 0x800000, crc: 'fa07ba1e', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: '202-m1.bin', offset: 0x0, size: 0x10000, crc: '2037dc19' },
    ],
    voice: [
      { name: '202-v1.bin', offset: 0x0, size: 0x100000, crc: '3ac066e1' },
      { name: '202-v2.bin', offset: 0x100000, size: 0x100000, crc: 'c5a12987' },
      { name: '202-v3.bin', offset: 0x200000, size: 0x100000, crc: '3c623679' },
      { name: '202-v4.bin', offset: 0x300000, size: 0x100000, crc: 'fbf00c96' },
      { name: '202-v5.bin', offset: 0x400000, size: 0x100000, crc: '9b2031d4' },
      { name: '202-v6.bin', offset: 0x500000, size: 0x100000, crc: '107cfc89' },
      { name: '202-v7.bin', offset: 0x600000, size: 0x100000, crc: '0703b761' },
      { name: '202-v8.bin', offset: 0x700000, size: 0x100000, crc: '8d525588' },
      { name: '202-v9.bin', offset: 0x800000, size: 0x100000, crc: '97f073b6' },
    ],
    fixed: [
      { name: '202-s1.bin', offset: 0x0, size: 0x20000, crc: 'a545b593' },
    ],
  },
  {
    name: 'violentv',
    description: 'Violent Vengeance (beta 3.28)',
    year: '2026',
    publisher: 'Balek Corp.',
    program: [
      { name: 'violentv-b3-p1.bin', offset: 0x0, size: 0x100000, crc: '59b78bc5', loadFlag: 'load16_word_swap' },
      { name: 'violentv-b3-p2.bin', offset: 0x100000, size: 0x800000, crc: 'fdad36d7', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'violentv-b3-c1.bin', offset: 0x0, size: 0x1000000, crc: '5b3ef4e1', loadFlag: 'load16_byte' },
      { name: 'violentv-b3-c2.bin', offset: 0x1, size: 0x1000000, crc: '970ba8c2', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'violentv-b3-m1.bin', offset: 0x0, size: 0x10000, crc: '2cf78121' },
    ],
    voice: [
      { name: 'violentv-b3-v1.bin', offset: 0x0, size: 0x800000, crc: 'dd128a57' },
      { name: 'violentv-b3-v2.bin', offset: 0x400000, size: 0x800000, crc: 'b6ff9217' },
    ],
    fixed: [
      { name: 'violentv-b3-s1.bin', offset: 0x0, size: 0x20000, crc: 'f7302142' },
    ],
  },
  {
    name: 'xenocris',
    description: 'Xeno Crisis',
    year: '2021',
    publisher: 'Bitmap Bureau',
    program: [
      { name: 'BB01-p1.p1', offset: 0x0, size: 0x100000, crc: '637605a6', loadFlag: 'load16_word_swap' },
      { name: 'BB01-p2.p2', offset: 0x100000, size: 0x100000, crc: '84838145', loadFlag: 'load16_word_swap' },
    ],
    sprites: [
      { name: 'BB01-c1.c1', offset: 0x0, size: 0x200000, crc: 'ae51ef89', loadFlag: 'load16_byte' },
      { name: 'BB01-c2.c2', offset: 0x1, size: 0x200000, crc: 'a8610100', loadFlag: 'load16_byte' },
    ],
    audio: [
      { name: 'BB01-m1.m1', offset: 0x0, size: 0x10000, crc: '28c13ed9' },
    ],
    voice: [
      { name: 'BB01-v1.v1', offset: 0x0, size: 0x1000000, crc: '60d57867' },
    ],
    fixed: [
      { name: 'BB01-s1.s1', offset: 0x0, size: 0x20000, crc: '7537ea79' },
    ],
  },
];
