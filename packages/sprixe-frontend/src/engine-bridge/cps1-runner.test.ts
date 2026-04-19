/**
 * Unit test for the CPS-1 runner adapter — asserts it wires the
 * Emulator lifecycle (load → initAudio → start → saveState → destroy)
 * behind the uniform EmulatorRunner surface. The actual emulation is
 * exercised end-to-end by Playwright (real WebGL + audio), this only
 * protects against adapter regressions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const emulatorInstances: EmulatorMock[] = [];

interface EmulatorMock {
  loadRomFromBuffer: ReturnType<typeof vi.fn>;
  initAudio: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  isPaused: ReturnType<typeof vi.fn>;
  isRunning: ReturnType<typeof vi.fn>;
  exportStateAsBuffer: ReturnType<typeof vi.fn>;
  importStateFromBuffer: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  getInputManager: ReturnType<typeof vi.fn>;
  resumeAudio: ReturnType<typeof vi.fn>;
  suspendAudio: ReturnType<typeof vi.fn>;
  canvas: HTMLCanvasElement;
}

vi.mock("@sprixe/engine/emulator", () => ({
  Emulator: class {
    canvas: HTMLCanvasElement;
    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas;
      const mock: EmulatorMock = {
        canvas,
        loadRomFromBuffer: vi.fn(async () => {}),
        initAudio: vi.fn(async () => {}),
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        isPaused: vi.fn(() => false),
        isRunning: vi.fn(() => true),
        exportStateAsBuffer: vi.fn(async () => new Uint8Array(256 * 1024).buffer),
        importStateFromBuffer: vi.fn(() => true),
        destroy: vi.fn(),
        resumeAudio: vi.fn(),
        suspendAudio: vi.fn(),
        getInputManager: vi.fn(() => ({
          getGamepadMapping: vi.fn(() => ({ up: 12, down: 13, left: 14, right: 15, button1: 0, button2: 1, button3: 2, button4: 3, button5: 4, button6: 5, start: 9, coin: 8 })),
          setGamepadMapping: vi.fn(),
        })),
      };
      emulatorInstances.push(mock);
      Object.assign(this, mock);
    }
  },
}));

import { createCps1Runner } from "./cps1-runner";

describe("createCps1Runner", () => {
  beforeEach(() => {
    emulatorInstances.length = 0;
  });

  it("loads the ROM and initialises audio before the runner is returned", async () => {
    const canvas = document.createElement("canvas");
    const rom = new Uint8Array([1, 2, 3, 4]).buffer;
    await createCps1Runner({ canvas, romBuffer: rom });
    const emu = emulatorInstances[0]!;
    expect(emu.loadRomFromBuffer).toHaveBeenCalledWith(rom);
    expect(emu.initAudio).toHaveBeenCalled();
    expect(emu.canvas).toBe(canvas);
  });

  it("delegates lifecycle methods 1:1 to the underlying emulator", async () => {
    const runner = await createCps1Runner({
      canvas: document.createElement("canvas"),
      romBuffer: new ArrayBuffer(16),
    });
    const emu = emulatorInstances[0]!;
    runner.start(); expect(emu.start).toHaveBeenCalled();
    runner.pause(); expect(emu.pause).toHaveBeenCalled();
    runner.resume(); expect(emu.resume).toHaveBeenCalled();
    runner.stop(); expect(emu.stop).toHaveBeenCalled();
    runner.destroy(); expect(emu.destroy).toHaveBeenCalled();
  });

  it("saveState returns the engine's exported buffer (≥200KB sanity)", async () => {
    const runner = await createCps1Runner({
      canvas: document.createElement("canvas"),
      romBuffer: new ArrayBuffer(16),
    });
    const buf = await runner.saveState!();
    expect(buf).not.toBeNull();
    expect(buf!.byteLength).toBeGreaterThanOrEqual(200 * 1024);
  });

  it("loadState forwards the buffer to importStateFromBuffer", async () => {
    const runner = await createCps1Runner({
      canvas: document.createElement("canvas"),
      romBuffer: new ArrayBuffer(16),
    });
    const emu = emulatorInstances[0]!;
    const snap = new Uint8Array([9, 9, 9]).buffer;
    const ok = runner.loadState!(snap);
    expect(ok).toBe(true);
    expect(emu.importStateFromBuffer).toHaveBeenCalledWith(snap);
  });
});
