import { describe, it, expect } from 'vitest';
import { NeoGeoVideo, decodeNeoGeoColor } from '../video/neogeo-video';
import { NGO_SCB1_BASE, NGO_SCB3_BASE, NGO_SCB4_BASE, NGO_FIX_BASE } from '../neogeo-constants';

describe('NeoGeoVideo', () => {
  describe('Color decoding', () => {
    it('decodes black (0x0000)', () => {
      const color = decodeNeoGeoColor(0x0000);
      // ABGR: 0xFF000000
      expect(color & 0xFF).toBe(0);       // R
      expect((color >> 8) & 0xFF).toBe(0); // G
      expect((color >> 16) & 0xFF).toBe(0); // B
      expect((color >> 24) & 0xFF).toBe(0xFF); // A
    });

    it('decodes white (0x7FFF)', () => {
      const color = decodeNeoGeoColor(0x7FFF);
      const r = color & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;
      // All 5-bit components maxed (31), expanded to 8-bit: (31 << 3) | (31 >> 2) = 255
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    });

    it('decodes pure red', () => {
      // Red high nibble = 0xF (bits 14-11), Red LSB = 1 (bit 2)
      // = 0b0_1111_0000000_1_00 = 0x7804
      const color = decodeNeoGeoColor(0x7804);
      const r = color & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('applies dark bit', () => {
      // White with dark bit: 0xFFFF
      const color = decodeNeoGeoColor(0xFFFF);
      const r = color & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;
      // Dark bit halves: 255 >> 1 = 127
      expect(r).toBe(127);
      expect(g).toBe(127);
      expect(b).toBe(127);
    });

    it('decodes LSB bits correctly', () => {
      // Only LSBs set: bit 2 (R), bit 1 (G), bit 0 (B) = 0x0007
      const color = decodeNeoGeoColor(0x0007);
      const r = color & 0xFF;
      const g = (color >> 8) & 0xFF;
      const b = (color >> 16) & 0xFF;
      // R: 5-bit = 1, expanded: (1 << 3) | (1 >> 2) = 8
      expect(r).toBe(8);
      expect(g).toBe(8);
      expect(b).toBe(8);
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
      expect(entry.y).toBe(100);
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
