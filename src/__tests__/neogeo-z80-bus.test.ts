import { describe, it, expect } from 'vitest';
import { NeoGeoZ80Bus } from '../memory/neogeo-z80-bus';

describe('NeoGeoZ80Bus', () => {
  describe('Memory access', () => {
    it('reads M-ROM fixed area', () => {
      const bus = new NeoGeoZ80Bus();
      const rom = new Uint8Array(0x8000);
      rom[0] = 0xC3; // JP instruction
      rom[1] = 0x00;
      rom[2] = 0x01;
      bus.loadAudioRom(rom);
      expect(bus.read(0x0000)).toBe(0xC3);
      expect(bus.read(0x0001)).toBe(0x00);
    });

    it('reads and writes work RAM', () => {
      const bus = new NeoGeoZ80Bus();
      bus.write(0xC000, 0x42);
      expect(bus.read(0xC000)).toBe(0x42);
    });

    it('mirrors work RAM at 0xE000', () => {
      const bus = new NeoGeoZ80Bus();
      bus.write(0xC000, 0xAB);
      expect(bus.read(0xE000)).toBe(0xAB);
    });

    it('covers full 8KB work RAM', () => {
      const bus = new NeoGeoZ80Bus();
      bus.write(0xDFFF, 0x99);
      expect(bus.read(0xDFFF)).toBe(0x99);
    });
  });

  describe('I/O ports — YM2610', () => {
    it('writes address port 0 and data port 0', () => {
      const bus = new NeoGeoZ80Bus();
      const writes: Array<[number, number]> = [];
      bus.setYm2610WriteCallback((port, value) => writes.push([port, value]));

      bus.ioWrite(0x04, 0x28); // Address port 0
      bus.ioWrite(0x05, 0xFF); // Data port 0

      expect(writes).toEqual([
        [0, 0x28], // port 0 = address low
        [1, 0xFF], // port 1 = data low
      ]);
    });

    it('writes address port 1 and data port 1', () => {
      const bus = new NeoGeoZ80Bus();
      const writes: Array<[number, number]> = [];
      bus.setYm2610WriteCallback((port, value) => writes.push([port, value]));

      bus.ioWrite(0x06, 0x10); // Address port 1
      bus.ioWrite(0x07, 0x80); // Data port 1

      expect(writes).toEqual([
        [2, 0x10], // port 2 = address high
        [3, 0x80], // port 3 = data high
      ]);
    });

    it('reads YM2610 status', () => {
      const bus = new NeoGeoZ80Bus();
      bus.setYm2610ReadCallback(port => port === 0 ? 0x80 : 0x00);

      expect(bus.ioRead(0x04)).toBe(0x80); // Status port 0
      expect(bus.ioRead(0x05)).toBe(0x00); // Data port 0 read
    });
  });

  describe('I/O ports — Sound latch', () => {
    it('reads sound command from 68K', () => {
      const bus = new NeoGeoZ80Bus();
      bus.pushSoundLatch(0x42);
      expect(bus.ioRead(0x00)).toBe(0x42);
    });

    it('queues multiple commands', () => {
      const bus = new NeoGeoZ80Bus();
      bus.pushSoundLatch(0x01);
      bus.pushSoundLatch(0x02);
      bus.pushSoundLatch(0x03);

      expect(bus.ioRead(0x00)).toBe(0x01);
      // Clear pending — dequeue next
      bus.ioWrite(0x00, 0);
      expect(bus.ioRead(0x00)).toBe(0x02);
      bus.ioWrite(0x00, 0);
      expect(bus.ioRead(0x00)).toBe(0x03);
    });

    it('sends reply to 68K', () => {
      const bus = new NeoGeoZ80Bus();
      let reply = -1;
      bus.setSoundReplyCallback(v => { reply = v; });
      bus.ioWrite(0x0C, 0x55);
      expect(reply).toBe(0x55);
    });
  });

  describe('NMI control', () => {
    it('enables NMI via port 0x08', () => {
      const bus = new NeoGeoZ80Bus();
      bus.ioWrite(0x18, 0); // Disable NMI
      expect(bus.shouldFireNmi()).toBe(false);
      bus.pushSoundLatch(0x01);
      bus.ioWrite(0x08, 0); // Enable NMI
      expect(bus.shouldFireNmi()).toBe(true);
    });

    it('disables NMI via port 0x18', () => {
      const bus = new NeoGeoZ80Bus();
      bus.pushSoundLatch(0x01);
      bus.ioWrite(0x18, 0); // Disable NMI
      expect(bus.shouldFireNmi()).toBe(false);
    });
  });

  describe('ROM banking', () => {
    it('switches bank via port 0x08', () => {
      const bus = new NeoGeoZ80Bus();
      // Create a large ROM with distinct bank data
      const rom = new Uint8Array(0x40000); // 256KB
      rom[0x0000] = 0xAA; // Fixed area
      rom[0x8000] = 0xBB; // Bank 2 (offset 0x8000)
      rom[0xC000] = 0xCC; // Bank 3 (offset 0xC000)
      bus.loadAudioRom(rom);

      // Fixed area always reads from 0x0000
      expect(bus.read(0x0000)).toBe(0xAA);

      // Bank 0 maps to ROM offset 0x8000 (bank index 2)
      bus.ioWrite(0x08, 0);
      expect(bus.read(0x8000)).toBe(0xBB);

      // Bank 1 maps to ROM offset 0xC000 (bank index 3)
      bus.ioWrite(0x08, 1);
      expect(bus.read(0x8000)).toBe(0xCC);
    });
  });

  describe('State management', () => {
    it('saves and restores state', () => {
      const bus = new NeoGeoZ80Bus();
      bus.pushSoundLatch(0x42);
      bus.ioWrite(0x08, 3); // Bank switch

      const state = bus.getState();
      expect(state.soundLatchValue).toBe(0x42);

      const bus2 = new NeoGeoZ80Bus();
      bus2.setState(state);
      expect(bus2.ioRead(0x00)).toBe(0x42);
    });
  });
});
