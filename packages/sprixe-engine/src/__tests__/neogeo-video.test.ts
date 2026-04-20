import { describe, it, expect } from 'vitest';
import { NeoGeoVideo, decodeNeoGeoColor } from '../video/neogeo-video';
import { NGO_SCB1_BASE, NGO_SCB3_BASE, NGO_SCB4_BASE, NGO_FIX_BASE } from '../neogeo-constants';

describe('NeoGeoVideo', () => {
  describe('Color decoding', () => {
    // Hardware format: D R0 G0 B0 | R4 R3 R2 R1 | G4 G3 G2 G1 | B4 B3 B2 B1

    it('decodes black (0x0000)', () => {
      const color = decodeNeoGeoColor(0x0000);
      expect(color & 0xFF).toBe(0);
      expect((color >> 8) & 0xFF).toBe(0);
      expect((color >> 16) & 0xFF).toBe(0);
      expect((color >> 24) & 0xFF).toBe(0xFF);
    });

    it('decodes white without dark (0x7FFF)', () => {
      // All 5-bit channels maxed, dark=0 → 6-bit = 0x3E = 62
      // Expanded: (62 << 2) | (62 >> 4) = 248 | 3 = 251
      const color = decodeNeoGeoColor(0x7FFF);
      expect(color & 0xFF).toBe(251);
      expect((color >> 8) & 0xFF).toBe(251);
      expect((color >> 16) & 0xFF).toBe(251);
    });

    it('decodes full white with dark (0xFFFF)', () => {
      // All bits set, dark=1 → 6-bit = 0x3F = 63
      // Expanded: (63 << 2) | (63 >> 4) = 252 | 3 = 255
      const color = decodeNeoGeoColor(0xFFFF);
      expect(color & 0xFF).toBe(255);
      expect((color >> 8) & 0xFF).toBe(255);
      expect((color >> 16) & 0xFF).toBe(255);
    });

    it('decodes pure red (R4-R1=0xF, R0=1)', () => {
      // R4-R1 = bits 11-8 = 0xF, R0 = bit 14 = 1, rest 0
      // word = 0b0_1_00_0_1111_0000_0000 = 0x4F00
      const color = decodeNeoGeoColor(0x4F00);
      expect(color & 0xFF).toBe(251);       // R = 62 → 251
      expect((color >> 8) & 0xFF).toBe(0);   // G = 0
      expect((color >> 16) & 0xFF).toBe(0);  // B = 0
    });

    it('dark bit adds minimal brightness (LSB of 6-bit DAC)', () => {
      // Dark only (0x8000): each channel 6-bit = 1
      // Expanded: (1 << 2) | (1 >> 4) = 4
      const color = decodeNeoGeoColor(0x8000);
      expect(color & 0xFF).toBe(4);
      expect((color >> 8) & 0xFF).toBe(4);
      expect((color >> 16) & 0xFF).toBe(4);
    });
  });

  describe('VRAM access', () => {
    it('reads VRAM word', () => {
      const video = new NeoGeoVideo();
      const vram = video.getVram();
      // Write a word at address 0x100
      const off = 0x100 * 2;
      vram[off] = 0x12;
      vram[off + 1] = 0x34;
      expect(video.readVramWord(0x100)).toBe(0x1234);
    });
  });

  describe('Sprite entry reading', () => {
    it('reads a basic sprite entry', () => {
      const video = new NeoGeoVideo();
      const vram = video.getVram();

      const spriteIdx = 1;

      // SCB3: Y=100, sticky=0, height=2 tiles (stored as 1)
      // Y raw = 0x200 - 100 = 412 = 0x19C, shifted left 7
      // sticky = 0, height = 1 (2 tiles - 1)
      const yRaw = 0x200 - 100;
      const scb3 = (yRaw << 7) | (0 << 6) | 1; // height=1 means 2 tiles
      const scb3Off = (NGO_SCB3_BASE + spriteIdx) * 2;
      vram[scb3Off] = (scb3 >> 8) & 0xFF;
      vram[scb3Off + 1] = scb3 & 0xFF;

      // SCB4: X=50, shifted left 7
      const scb4 = 50 << 7;
      const scb4Off = (NGO_SCB4_BASE + spriteIdx) * 2;
      vram[scb4Off] = (scb4 >> 8) & 0xFF;
      vram[scb4Off + 1] = scb4 & 0xFF;

      // SCB1: tile code 0x100, palette 5, no flip
      const scb1Base = (NGO_SCB1_BASE + spriteIdx * 64) * 2;
      // Word 0: tile code low = 0x100
      vram[scb1Base] = 0x01;
      vram[scb1Base + 1] = 0x00;
      // Word 1: palette 5 (bits 15-8), tile MSB=0 (bits 7-4), no anim, no flip
      vram[scb1Base + 2] = 0x05; // palette
      vram[scb1Base + 3] = 0x00; // flags

      const entry = video.readSpriteEntry(spriteIdx);
      expect(entry.index).toBe(1);
      expect(entry.tileCode).toBe(0x100);
      expect(entry.palette).toBe(5);
      expect(entry.y).toBe(84); // Y=100 in 512-line space → screen Y = 100 - 16
      expect(entry.x).toBe(50);
      expect(entry.height).toBe(2);
      expect(entry.sticky).toBe(false);
      expect(entry.flipH).toBe(false);
      expect(entry.flipV).toBe(false);
    });
  });

  describe('Sprite grouping', () => {
    it('groups sticky sprites into chains', () => {
      const video = new NeoGeoVideo();
      const vram = video.getVram();

      // Sprite 1: master (sticky=0), Y=100, height=2, X=50
      writeSCB(vram, 1, 100, 2, false, 50, 0x10, 3);
      // Sprite 2: sticky (sticky=1), inherits Y/height, X=66 (50+16)
      writeSCB(vram, 2, 0, 0, true, 66, 0x20, 3);

      const groups = video.readAllSpriteGroups();
      // First group should contain sprites 1 and 2
      const group = groups.find(g => g.sprites.some(s => s.index === 1));
      expect(group).toBeDefined();
      expect(group!.sprites.length).toBe(2);
      expect(group!.sprites[0]!.index).toBe(1);
      expect(group!.sprites[1]!.index).toBe(2);
    });
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const video = new NeoGeoVideo();
      video.setRoms(new Uint8Array(0x100000), new Uint8Array(0x20000), new Uint8Array(0x20000));

      const framebuffer = new Uint8Array(320 * 224 * 4);
      expect(() => video.renderFrame(framebuffer)).not.toThrow();
    });

    it('renders fix layer tile', () => {
      const video = new NeoGeoVideo();

      // Create a minimal S-ROM with a visible tile
      const fixRom = new Uint8Array(0x20000);
      // Tile 0x200: all pixels color 1 (column-major nibble-packed)
      // Color 1 in both nibbles = 0x11. Fill all 32 bytes of the tile.
      const tileOffset = 0x200 * 32;
      for (let i = 0; i < 32; i++) {
        fixRom[tileOffset + i] = 0x11; // low nibble = 1, high nibble = 1
      }

      video.setRoms(new Uint8Array(0x100000), fixRom, new Uint8Array(0x20000));
      video.setFixRomMode(false); // Use game fix ROM, not BIOS

      // Set palette 1 color 1 to white
      const palRam = video.getPaletteRam();
      palRam[1 * 16 * 2 + 1 * 2] = 0x7F; // White (high byte)
      palRam[1 * 16 * 2 + 1 * 2 + 1] = 0xFF; // White (low byte)
      video.markPaletteDirty();

      // Write fix layer entry: palette 1, tile 0x200
      const vram = video.getVram();
      const fixAddr = (NGO_FIX_BASE) * 2; // col 0, row 0
      // Fix entry word: palette 1 (bits 15-12) | tile 0x200
      const entry = (1 << 12) | 0x200;
      // But row 0 is off-screen (shifted by 2), so use row 2 for visible pixel
      const visAddr = (NGO_FIX_BASE + 2) * 2; // col 0, row 2 → screenY = 0
      vram[visAddr] = (entry >> 8) & 0xFF;
      vram[visAddr + 1] = entry & 0xFF;

      const framebuffer = new Uint8Array(320 * 224 * 4);
      video.renderFrame(framebuffer);

      // Check pixel at (0, 0) — should be white from fix layer
      const idx = 0; // first pixel
      // At least the pixel should not be backdrop (all zeros)
      const pixel = (framebuffer[idx]! << 16) | (framebuffer[idx + 1]! << 8) | framebuffer[idx + 2]!;
      // Non-zero means something was rendered
      expect(pixel).not.toBe(0);
    });

    it('uses palette[0xFFF] as backdrop, not palette[0]', () => {
      // Regression test: Neo-Geo backdrop color is the LAST palette entry
      // (palette[0xFFF]), not palette[0]. MAME neogeo_v.cpp:71, FBNeo neogeo.cpp.
      const video = new NeoGeoVideo();
      video.setRoms(new Uint8Array(0x100000), new Uint8Array(0x20000), new Uint8Array(0x20000));

      const palRam = video.getPaletteRam();
      // palette[0] = bright red (decoy — this is what the buggy code would use)
      palRam[0] = 0x4F;       // high byte: R4-R1 = 0xF, R0 = 1, dark = 0
      palRam[1] = 0x00;       // low byte
      // palette[0xFFF] = pure blue (the correct backdrop)
      palRam[0xFFF * 2] = 0x10;
      palRam[0xFFF * 2 + 1] = 0x1E;  // B4-B1 = 0xF, B0 = 1
      video.markPaletteDirty();

      const framebuffer = new Uint8Array(320 * 224 * 4);
      video.renderFrame(framebuffer);

      // Pixel (0,0) should be blue (palette[0xFFF]), not red (palette[0]).
      // RGBA byte order: [R, G, B, A].
      expect(framebuffer[0]).toBe(0);          // R = 0 (not red)
      expect(framebuffer[2]).toBeGreaterThan(200); // B is strong (blue backdrop)
    });
  });
});

// Helper to write SCB entries for testing
function writeSCB(
  vram: Uint8Array,
  index: number,
  y: number,
  height: number,
  sticky: boolean,
  x: number,
  tileCode: number,
  palette: number,
): void {
  // SCB3: Y, sticky, height
  const yRaw = 0x200 - y;
  const scb3 = (yRaw << 7) | ((sticky ? 1 : 0) << 6) | ((height - 1) & 0x3F);
  const scb3Off = (NGO_SCB3_BASE + index) * 2;
  vram[scb3Off] = (scb3 >> 8) & 0xFF;
  vram[scb3Off + 1] = scb3 & 0xFF;

  // SCB4: X
  const scb4 = x << 7;
  const scb4Off = (NGO_SCB4_BASE + index) * 2;
  vram[scb4Off] = (scb4 >> 8) & 0xFF;
  vram[scb4Off + 1] = scb4 & 0xFF;

  // SCB1: tile code + palette
  const scb1Base = (NGO_SCB1_BASE + index * 64) * 2;
  vram[scb1Base] = (tileCode >> 8) & 0xFF;
  vram[scb1Base + 1] = tileCode & 0xFF;
  vram[scb1Base + 2] = palette & 0xFF;
  vram[scb1Base + 3] = (tileCode >> 12) & 0xF0; // MSB of tile code
}
