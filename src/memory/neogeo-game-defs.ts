/**
 * Neo-Geo Game ROM Definitions
 *
 * Auto-generated from MAME neogeo.xml software list.
 * Source: mamedev/mame hash/neogeo.xml
 * Generated: 2026-04-09
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
];
