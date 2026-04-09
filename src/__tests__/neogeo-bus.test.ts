import { describe, it, expect } from 'vitest';
import { NeoGeoBus } from '../memory/neogeo-bus';

describe('NeoGeoBus', () => {
  describe('Work RAM', () => {
    it('reads and writes 8-bit values', () => {
      const bus = new NeoGeoBus();
      bus.write8(0x100000, 0x42);
      expect(bus.read8(0x100000)).toBe(0x42);
    });

    it('reads and writes 16-bit values', () => {
      const bus = new NeoGeoBus();
      bus.write16(0x100000, 0x1234);
      expect(bus.read16(0x100000)).toBe(0x1234);
    });

    it('reads and writes 32-bit values', () => {
      const bus = new NeoGeoBus();
      bus.write32(0x100000, 0xDEADBEEF);
      expect(bus.read32(0x100000)).toBe(0xDEADBEEF);
    });

    it('covers full 64KB range', () => {
      const bus = new NeoGeoBus();
      bus.write8(0x10FFFF, 0xAB);
      expect(bus.read8(0x10FFFF)).toBe(0xAB);
    });
  });

  describe('VRAM indirect access', () => {
    it('writes and reads via VRAM address/data registers', () => {
      const bus = new NeoGeoBus();
      // Set VRAM address to 0x0100
      bus.write16(0x3C0000, 0x0100);
      // Write data 0x1234
      bus.write16(0x3C0002, 0x1234);
      // Read back: set address again, then read
      bus.write16(0x3C0000, 0x0100);
      expect(bus.read16(0x3C0002)).toBe(0x1234);
    });

    it('auto-increments VRAM address by modulo', () => {
      const bus = new NeoGeoBus();
      // Set modulo to 1
      bus.write16(0x3C0004, 1);
      // Set address to 0x0000
      bus.write16(0x3C0000, 0x0000);
      // Write two words
      bus.write16(0x3C0002, 0xAAAA);
      bus.write16(0x3C0002, 0xBBBB);
      // Verify: addr 0 = 0xAAAA, addr 1 = 0xBBBB
      bus.write16(0x3C0000, 0x0000);
      expect(bus.read16(0x3C0002)).toBe(0xAAAA);
      bus.write16(0x3C0000, 0x0001);
      expect(bus.read16(0x3C0002)).toBe(0xBBBB);
    });

    it('auto-increments with large modulo (32)', () => {
      const bus = new NeoGeoBus();
      bus.write16(0x3C0004, 32); // modulo = 32 (used for SCB writes)
      bus.write16(0x3C0000, 0x0000);
      bus.write16(0x3C0002, 0x1111);
      // Next write should go to addr 32
      bus.write16(0x3C0002, 0x2222);
      bus.write16(0x3C0000, 0x0020); // addr 32
      expect(bus.read16(0x3C0002)).toBe(0x2222);
    });
  });

  describe('Palette RAM', () => {
    it('reads and writes palette entries', () => {
      const bus = new NeoGeoBus();
      bus.write16(0x400000, 0x7FFF); // white
      expect(bus.read16(0x400000)).toBe(0x7FFF);
    });

    it('covers full 8KB range', () => {
      const bus = new NeoGeoBus();
      bus.write16(0x401FFE, 0xABCD);
      expect(bus.read16(0x401FFE)).toBe(0xABCD);
    });
  });

  describe('I/O ports', () => {
    it('reads P1 port (active LOW, default all released)', () => {
      const bus = new NeoGeoBus();
      // Default: 0xFF (all buttons released)
      expect(bus.read8(0x300001)).toBe(0xFF);
    });

    it('reflects P1 port changes', () => {
      const bus = new NeoGeoBus();
      bus.setPortP1(0xFE); // button A pressed (bit 0 low)
      expect(bus.read8(0x300001)).toBe(0xFE);
    });

    it('reads P2 port via REG_STATUS_A', () => {
      const bus = new NeoGeoBus();
      bus.setPortP2(0xFD);
      // P2 is in the high byte of REG_STATUS_A (0x340000)
      expect(bus.read8(0x340000)).toBe(0xFD);
    });

    it('reads system port', () => {
      const bus = new NeoGeoBus();
      bus.setPortSystem(0xFB);
      expect(bus.read8(0x340001)).toBe(0xFB);
    });

    it('returns 0xFF for memory card', () => {
      const bus = new NeoGeoBus();
      expect(bus.read8(0x800000)).toBe(0xFF);
    });
  });

  describe('P-ROM', () => {
    it('reads program ROM after BIOS switch', () => {
      const bus = new NeoGeoBus();
      const rom = new Uint8Array([0x00, 0x10, 0x00, 0x00]);
      bus.loadProgramRom(rom);
      // At reset, BIOS is at 0x000000 — switch to P-ROM first
      bus.write8(0x3A0003, 0); // REG_SWPROM
      expect(bus.read8(0x000000)).toBe(0x00);
      expect(bus.read8(0x000001)).toBe(0x10);
    });

    it('reads BIOS at 0x000000 at reset (default)', () => {
      const bus = new NeoGeoBus();
      const bios = new Uint8Array(0x20000);
      bios[0] = 0x00;
      bios[1] = 0xC0;
      bus.loadBiosRom(bios);
      // At reset, BIOS is mapped at 0x000000
      expect(bus.read8(0x000000)).toBe(0x00);
      expect(bus.read8(0x000001)).toBe(0xC0);
    });

    it('switches back to BIOS with REG_SWPBIOS', () => {
      const bus = new NeoGeoBus();
      const bios = new Uint8Array(0x20000);
      bios[0] = 0xAA;
      bus.loadBiosRom(bios);
      bus.loadProgramRom(new Uint8Array([0xBB]));
      bus.write8(0x3A0003, 0); // Switch to P-ROM
      expect(bus.read8(0x000000)).toBe(0xBB);
      bus.write8(0x3A0001, 0); // Switch back to BIOS
      expect(bus.read8(0x000000)).toBe(0xAA);
    });

    it('returns 0xFF for unmapped ROM area', () => {
      const bus = new NeoGeoBus();
      bus.loadProgramRom(new Uint8Array(4));
      bus.write8(0x3A0003, 0); // Switch to P-ROM
      expect(bus.read8(0x0FFFFF)).toBe(0xFF);
    });
  });

  describe('BIOS ROM', () => {
    it('reads BIOS at 0xC00000', () => {
      const bus = new NeoGeoBus();
      const bios = new Uint8Array(0x20000);
      bios[0] = 0x00;
      bios[1] = 0xC0; // reset vector high word
      bus.loadBiosRom(bios);
      expect(bus.read8(0xC00000)).toBe(0x00);
      expect(bus.read8(0xC00001)).toBe(0xC0);
    });
  });

  describe('IRQ system', () => {
    it('starts with IRQ3 (coldboot) pending', () => {
      const bus = new NeoGeoBus();
      expect(bus.getPendingIrq()).toBe(3);
    });

    it('acknowledges IRQs', () => {
      const bus = new NeoGeoBus();
      bus.acknowledgeIrq(3);
      expect(bus.getPendingIrq()).toBe(0);
    });

    it('asserts VBlank IRQ', () => {
      const bus = new NeoGeoBus();
      bus.acknowledgeIrq(3); // Clear coldboot
      bus.assertIrq(1); // VBlank
      expect(bus.getPendingIrq()).toBe(1);
    });

    it('prioritizes IRQ3 over IRQ1', () => {
      const bus = new NeoGeoBus();
      bus.assertIrq(1);
      // IRQ3 already pending from boot
      expect(bus.getPendingIrq()).toBe(3);
    });
  });

  describe('Sound latch', () => {
    it('sends sound command to callback', () => {
      const bus = new NeoGeoBus();
      let received = -1;
      bus.setSoundLatchCallback(v => { received = v; });
      bus.write16(0x320000, 0x42);
      expect(received).toBe(0x42);
      expect(bus.getSoundLatch()).toBe(0x42);
    });
  });
});
