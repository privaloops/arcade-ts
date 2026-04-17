/**
 * Generate a synthetic test ROM fixture for e2e tests.
 *
 * Creates tests/fixtures/test.zip — a minimal MAME-compatible ROM set
 * with the filename pattern expected by the "test" GameDef.
 *
 * Run: npx tsx tests/generate-fixture.ts
 */

import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 68K vector table: SP=0x00FF8000, PC=0x000200 (jump to main)
// Then at 0x200: infinite loop (BRA.S $200 = 0x60FE)
function createProgramRom(size: number): Uint8Array {
  const rom = new Uint8Array(size);

  // Vector table at 0x000000 (big-endian)
  // Initial SP = 0x00FF8000
  rom[0] = 0x00; rom[1] = 0xFF; rom[2] = 0x80; rom[3] = 0x00;
  // Initial PC = 0x000200
  rom[4] = 0x00; rom[5] = 0x00; rom[6] = 0x02; rom[7] = 0x00;

  // VBlank vector (offset 0x70) → point to a simple RTE at 0x000210
  rom[0x70] = 0x00; rom[0x71] = 0x00; rom[0x72] = 0x02; rom[0x73] = 0x10;

  // Main code at 0x200: set up basic VRAM then loop
  let pc = 0x200;

  // MOVE.W #0x0080, (0x800100).l — set OBJ_BASE CPS-A register
  // Actually just write to palette base and do a simple loop
  // For simplicity: just NOP loop with VBlank enabled
  // MOVE.W #0x2000, SR — enable interrupts
  rom[pc] = 0x46; rom[pc+1] = 0xFC; rom[pc+2] = 0x20; rom[pc+3] = 0x00;
  pc += 4;

  // Infinite loop: BRA.S -2 (0x60FE)
  rom[pc] = 0x60; rom[pc+1] = 0xFE;
  pc += 2;

  // RTE at 0x210
  rom[0x210] = 0x4E; rom[0x211] = 0x73; // RTE

  return rom;
}

// GFX ROM: interleaved 4bpp planar tiles
// Tile 0x00: solid color 1 (all pixels = 1)
// Tile 0x01: checkerboard (alternating 0 and 5)
// Tile 0x10: gradient (row = color index)
function createGfxRom(size: number): Uint8Array {
  const rom = new Uint8Array(size);
  const TILE_SIZE = 128; // 16x16 tile

  // Tile 0: solid color 1 — plane 0 all 0xFF, planes 1-3 all 0x00
  for (let row = 0; row < 16; row++) {
    const base = row * 8;
    rom[base] = 0xFF;     // left half plane 0
    rom[base + 4] = 0xFF; // right half plane 0
  }

  // Tile 1: checkerboard — color 5 (planes 0+2) at even pixels
  for (let row = 0; row < 16; row++) {
    const base = TILE_SIZE + row * 8;
    const pattern = row % 2 === 0 ? 0xAA : 0x55;
    rom[base] = pattern;     // plane 0 left
    rom[base + 2] = pattern; // plane 2 left
    rom[base + 4] = pattern; // plane 0 right
    rom[base + 6] = pattern; // plane 2 right
  }

  // Tile 0x10: each row has a different color (row index)
  for (let row = 0; row < 16; row++) {
    const base = 0x10 * TILE_SIZE + row * 8;
    const colorIdx = row;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    for (let px = 0; px < 8; px++) {
      const bit = 7 - px;
      if (colorIdx & 1) b0 |= (1 << bit);
      if (colorIdx & 2) b1 |= (1 << bit);
      if (colorIdx & 4) b2 |= (1 << bit);
      if (colorIdx & 8) b3 |= (1 << bit);
    }
    rom[base] = b0; rom[base + 1] = b1; rom[base + 2] = b2; rom[base + 3] = b3;
    rom[base + 4] = b0; rom[base + 5] = b1; rom[base + 6] = b2; rom[base + 7] = b3;
  }

  return rom;
}

// Audio ROM: Z80 code — just HALT
function createAudioRom(size: number): Uint8Array {
  const rom = new Uint8Array(size);
  rom[0] = 0x76; // HALT
  return rom;
}

// OKI ROM: valid phrase table (128 entries × 8 bytes) + empty sample data
function createOkiRom(size: number): Uint8Array {
  const rom = new Uint8Array(size);
  // Phrase table: all entries point to 0x400 with zero length
  for (let i = 0; i < 128; i++) {
    const off = i * 8;
    // Start = 0x000400, End = 0x000400 (empty)
    rom[off] = 0x00; rom[off + 1] = 0x04; rom[off + 2] = 0x00;
    rom[off + 3] = 0x00; rom[off + 4] = 0x04; rom[off + 5] = 0x00;
  }
  return rom;
}

async function main() {
  const zip = new JSZip();

  // Program ROM: split into even/odd halves (byte-interleaved)
  const progFull = createProgramRom(0x10000); // 64KB
  const halfSize = 0x8000; // 32KB per half
  const even = new Uint8Array(halfSize);
  const odd = new Uint8Array(halfSize);
  for (let i = 0; i < halfSize; i++) {
    even[i] = progFull[i * 2]!;
    odd[i] = progFull[i * 2 + 1]!;
  }
  zip.file('test_e.rom', even);
  zip.file('test_o.rom', odd);

  // GFX ROM: 4 files (interleaved, as per CPS1 ROM_LOAD64_WORD format)
  // For simplicity: put all data in file 0, others empty
  const gfxSize = 0x4000; // 16KB per file
  const gfxData = createGfxRom(gfxSize * 4);

  // CPS1 GFX interleaving: 4 files, each contributes 2 bytes out of every 8
  // File layout: for each group of 8 bytes in final ROM,
  // file0 has bytes 0,1; file1 has bytes 2,3; file2 has bytes 4,5; file3 has bytes 6,7
  const gfxFiles = [new Uint8Array(gfxSize), new Uint8Array(gfxSize), new Uint8Array(gfxSize), new Uint8Array(gfxSize)];
  for (let i = 0; i < gfxData.length; i += 8) {
    const group = i / 8;
    const dstOff = group * 2;
    if (dstOff + 1 >= gfxSize) break;
    for (let f = 0; f < 4; f++) {
      gfxFiles[f]![dstOff] = gfxData[i + f * 2]!;
      gfxFiles[f]![dstOff + 1] = gfxData[i + f * 2 + 1]!;
    }
  }
  zip.file('test_gfx0.rom', gfxFiles[0]!);
  zip.file('test_gfx1.rom', gfxFiles[1]!);
  zip.file('test_gfx2.rom', gfxFiles[2]!);
  zip.file('test_gfx3.rom', gfxFiles[3]!);

  // Audio ROM
  zip.file('test_snd.rom', createAudioRom(0x1000)); // 4KB

  // OKI ROM
  zip.file('test_oki.rom', createOkiRom(0x1000)); // 4KB

  const buf = await zip.generateAsync({ type: 'uint8array' });
  const outDir = join(__dirname, 'fixtures');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'test.zip');
  writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
}

main().catch(console.error);
