#!/usr/bin/env npx tsx
/**
 * Parse MAME neogeo.xml software list and generate neogeo-game-defs.ts
 *
 * Usage: npx tsx scripts/parse-neogeo-xml.ts
 * Downloads the XML from MAME GitHub, extracts game definitions,
 * and writes src/memory/neogeo-game-defs.ts
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const NEOGEO_XML_URL = 'https://raw.githubusercontent.com/mamedev/mame/master/hash/neogeo.xml';

// MVP target games (non-encrypted)
const TARGET_GAMES = new Set([
  // Fighting
  'kof94', 'kof95', 'kof96', 'kof97', 'kof98',
  'fatfury1', 'fatfury2', 'fatfury3', 'fatfursp',
  'samsho', 'samsho2', 'samsho3', 'samsho4',
  'rbff1', 'rbff2', 'aof', 'aof2', 'aof3',
  'wh1', 'wh2', 'lastblad', 'lastbld2', 'kizuna',
  // Beat-em-up / action
  'mslug', 'mslug2', 'sengoku', 'roboarmy', 'mutnat', 'burningf', 'eightman',
  // Run-and-gun
  'nam1975', 'bstars', 'bstars2', 'cyberlip',
  // Puzzle / sport
  'puzzledp', 'twinspri', 'pbobblen', 'magdrop2', 'magdrop3', 'socbrawl', 'supersid',
  // Popular extras
  'turfmast', 'stakwin', 'galaxyfg', 'wjammers', 'viewpoin', 'kotm', 'kotm2',
  'savagere', 'tpgolf', 'joyjoy', 'ridhero', 'alpham2',
]);

interface RomEntry {
  name: string;
  size: number;
  offset: number;
  crc: string;
  loadflag?: string;
}

interface DataArea {
  name: string;
  size: number;
  roms: RomEntry[];
}

interface GameEntry {
  name: string;
  description: string;
  year: string;
  publisher: string;
  dataareas: DataArea[];
  cloneof?: string;
}

function parseXml(xml: string): GameEntry[] {
  const games: GameEntry[] = [];
  // Match each <software> block
  const softwareRegex = /<software\s+name="([^"]+)"(?:\s+cloneof="([^"]+)")?[^>]*>([\s\S]*?)<\/software>/g;
  let match;

  while ((match = softwareRegex.exec(xml)) !== null) {
    const name = match[1]!;
    const cloneof = match[2];
    const body = match[3]!;

    // Only include target games (parent sets, not clones)
    if (!TARGET_GAMES.has(name)) continue;
    if (cloneof) continue; // Skip clones

    const descMatch = /<description>([^<]+)<\/description>/.exec(body);
    const yearMatch = /<year>([^<]+)<\/year>/.exec(body);
    const pubMatch = /<publisher>([^<]+)<\/publisher>/.exec(body);

    const dataareas: DataArea[] = [];
    // Match dataarea with name and size in any order
    const daRegex = /<dataarea\s+([^>]+)>([\s\S]*?)<\/dataarea>/g;
    let daMatch;

    while ((daMatch = daRegex.exec(body)) !== null) {
      const daAttrs = daMatch[1]!;
      const daBody = daMatch[2]!;
      const daNameMatch = /name="([^"]+)"/.exec(daAttrs);
      const daSizeMatch = /size="([^"]+)"/.exec(daAttrs);
      if (!daNameMatch || !daSizeMatch) continue;
      const daName = daNameMatch[1]!;
      const daSize = parseInt(daSizeMatch[1]!, daSizeMatch[1]!.startsWith('0x') ? 16 : 10);

      const roms: RomEntry[] = [];
      const romRegex = /<rom\s+([^>]+?)\/>/g;
      let romMatch;

      while ((romMatch = romRegex.exec(daBody)) !== null) {
        const attrs = romMatch[1]!;
        const nameAttr = /name="([^"]+)"/.exec(attrs);
        const sizeAttr = /size="([^"]+)"/.exec(attrs);
        const offsetAttr = /offset="([^"]+)"/.exec(attrs);
        const crcAttr = /crc="([^"]+)"/.exec(attrs);
        const loadflagAttr = /loadflag="([^"]+)"/.exec(attrs);

        if (nameAttr && sizeAttr) {
          roms.push({
            name: nameAttr[1]!,
            size: parseInt(sizeAttr[1]!, sizeAttr[1]!.startsWith('0x') ? 16 : 10),
            offset: offsetAttr ? parseInt(offsetAttr[1]!, offsetAttr[1]!.startsWith('0x') ? 16 : 10) : 0,
            crc: crcAttr ? crcAttr[1]! : '',
            loadflag: loadflagAttr ? loadflagAttr[1]! : undefined,
          });
        }
      }

      dataareas.push({ name: daName, size: daSize, roms });
    }

    games.push({
      name,
      description: descMatch ? descMatch[1]! : name,
      year: yearMatch ? yearMatch[1]! : '',
      publisher: pubMatch ? pubMatch[1]! : '',
      dataareas,
      cloneof,
    });
  }

  return games;
}

function mapDataArea(game: GameEntry, areaName: string): string {
  const area = game.dataareas.find(d => d.name === areaName);
  if (!area || area.roms.length === 0) return '[]';

  const entries = area.roms.map(r => {
    const parts = [`name: '${r.name}'`, `offset: 0x${r.offset.toString(16).toUpperCase()}`, `size: 0x${r.size.toString(16).toUpperCase()}`];
    if (r.crc) parts.push(`crc: '${r.crc}'`);
    if (r.loadflag) parts.push(`loadFlag: '${r.loadflag}'`);
    return `      { ${parts.join(', ')} }`;
  });

  return `[\n${entries.join(',\n')},\n    ]`;
}

function generateTypeScript(games: GameEntry[]): string {
  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * Neo-Geo Game ROM Definitions`);
  lines.push(` *`);
  lines.push(` * Auto-generated from MAME neogeo.xml software list.`);
  lines.push(` * Source: mamedev/mame hash/neogeo.xml`);
  lines.push(` * Generated: ${new Date().toISOString().split('T')[0]}`);
  lines.push(` */`);
  lines.push('');
  lines.push(`export interface NeoGeoRomEntry {`);
  lines.push(`  name: string;`);
  lines.push(`  offset: number;`);
  lines.push(`  size: number;`);
  lines.push(`  crc?: string;`);
  lines.push(`  loadFlag?: string;`);
  lines.push(`}`);
  lines.push('');
  lines.push(`export interface NeoGeoGameDef {`);
  lines.push(`  name: string;`);
  lines.push(`  description: string;`);
  lines.push(`  year: string;`);
  lines.push(`  publisher: string;`);
  lines.push(`  program: NeoGeoRomEntry[];`);
  lines.push(`  sprites: NeoGeoRomEntry[];`);
  lines.push(`  audio: NeoGeoRomEntry[];`);
  lines.push(`  voice: NeoGeoRomEntry[];`);
  lines.push(`  fixed?: NeoGeoRomEntry[];`);
  lines.push(`}`);
  lines.push('');
  lines.push(`export const NEOGEO_GAME_DEFS: NeoGeoGameDef[] = [`);

  for (const game of games) {
    // Map dataarea names to our fields
    const program = mapDataArea(game, 'maincpu');
    const sprites = mapDataArea(game, 'sprites');
    const audio = mapDataArea(game, 'audiocpu');
    // Voice can be in ymsnd, ymsnd:adpcma, or ymsnd:adpcmb
    const voiceAreas = game.dataareas.filter(d =>
      d.name === 'ymsnd' || d.name === 'ymsnd:adpcma' || d.name === 'ymsnd:adpcmb'
    );
    let voiceRoms: string;
    if (voiceAreas.length > 0) {
      const allRoms = voiceAreas.flatMap(a => a.roms);
      const entries = allRoms.map(r => {
        const parts = [`name: '${r.name}'`, `offset: 0x${r.offset.toString(16).toUpperCase()}`, `size: 0x${r.size.toString(16).toUpperCase()}`];
        if (r.crc) parts.push(`crc: '${r.crc}'`);
        if (r.loadflag) parts.push(`loadFlag: '${r.loadflag}'`);
        return `      { ${parts.join(', ')} }`;
      });
      voiceRoms = `[\n${entries.join(',\n')},\n    ]`;
    } else {
      voiceRoms = '[]';
    }
    const fixed = mapDataArea(game, 'fixed');

    lines.push(`  {`);
    lines.push(`    name: '${game.name}',`);
    lines.push(`    description: '${game.description.replace(/'/g, "\\'")}',`);
    lines.push(`    year: '${game.year}',`);
    lines.push(`    publisher: '${game.publisher.replace(/'/g, "\\'")}',`);
    lines.push(`    program: ${program},`);
    lines.push(`    sprites: ${sprites},`);
    lines.push(`    audio: ${audio},`);
    lines.push(`    voice: ${voiceRoms},`);
    if (fixed !== '[]') {
      lines.push(`    fixed: ${fixed},`);
    }
    lines.push(`  },`);
  }

  lines.push(`];`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  console.log('Downloading neogeo.xml from MAME repository...');
  const response = await fetch(NEOGEO_XML_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  const xml = await response.text();
  console.log(`Downloaded ${(xml.length / 1024 / 1024).toFixed(1)} MB`);

  console.log('Parsing game definitions...');
  const games = parseXml(xml);
  console.log(`Found ${games.length} target games`);

  if (games.length === 0) {
    console.error('No games found! Check TARGET_GAMES set against neogeo.xml content.');
    process.exit(1);
  }

  const output = generateTypeScript(games);
  const outPath = join(import.meta.dirname ?? __dirname, '..', 'src', 'memory', 'neogeo-game-defs.ts');
  writeFileSync(outPath, output, 'utf-8');
  console.log(`Generated ${outPath} (${games.length} games)`);

  // Print summary
  for (const g of games) {
    const spritesArea = g.dataareas.find(d => d.name === 'sprites');
    const spriteSize = spritesArea ? `${(spritesArea.size / 1024 / 1024).toFixed(1)}MB` : '?';
    console.log(`  ${g.name.padEnd(12)} — ${g.description} (sprites: ${spriteSize})`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
