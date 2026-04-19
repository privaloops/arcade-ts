/**
 * Unit test for the Neo-Geo runner — focuses on the BIOS handshake with
 * RomDB. Asserts that the factory throws MissingBiosError when the user
 * hasn't uploaded `neogeo.zip` yet, before any emulator is instantiated.
 * The positive path (BIOS present → runner starts) is covered by manual
 * testing with the user's own BIOS (DMCA: no fixture in the repo).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const emulatorConstructorCalls: unknown[] = [];

vi.mock("@sprixe/engine/neogeo-emulator", () => ({
  NeoGeoEmulator: class {
    constructor(...args: unknown[]) {
      emulatorConstructorCalls.push(args);
    }
    loadRomFromBuffer = vi.fn(async () => {});
    initAudio = vi.fn(async () => {});
    start = vi.fn();
    stop = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    isPaused = vi.fn(() => false);
    isRunning = vi.fn(() => true);
    getInputManager = vi.fn(() => ({
      getGamepadMapping: () => ({}),
      setGamepadMapping: vi.fn(),
      getKeyMapping: () => ({}),
      setKeyMapping: vi.fn(),
    }));
  },
}));

vi.mock("@sprixe/engine/video/renderer-webgl", () => ({
  WebGLRenderer: class { constructor(_c: HTMLCanvasElement) {} resize() {} },
}));

vi.mock("@sprixe/engine/video/renderer", () => ({
  Renderer: class { constructor(_c: HTMLCanvasElement) {} resize() {} },
}));

import { createNeoGeoRunner } from "./neogeo-runner";
import { MissingBiosError } from "./errors";
import { RomDB } from "../storage/rom-db";

let dbCounter = 0;
function freshDb(): RomDB {
  dbCounter += 1;
  return new RomDB(`sprixe-arcade-ngo-test-${dbCounter}`);
}

describe("createNeoGeoRunner", () => {
  beforeEach(() => {
    emulatorConstructorCalls.length = 0;
  });

  it("throws MissingBiosError when the neogeo record is absent", async () => {
    const romDb = freshDb();
    await expect(createNeoGeoRunner({
      canvas: document.createElement("canvas"),
      romBuffer: new ArrayBuffer(16),
      romDb,
    })).rejects.toBeInstanceOf(MissingBiosError);
    expect(emulatorConstructorCalls).toHaveLength(0);
  });

  it("MissingBiosError carries the system + bios id for the dialog", async () => {
    const romDb = freshDb();
    try {
      await createNeoGeoRunner({
        canvas: document.createElement("canvas"),
        romBuffer: new ArrayBuffer(16),
        romDb,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingBiosError);
      const err = e as MissingBiosError;
      expect(err.system).toBe("neogeo");
      expect(err.biosId).toBe("neogeo");
    }
  });

  it("instantiates the emulator when a BIOS record is available", async () => {
    const romDb = freshDb();
    await romDb.put({
      id: "neogeo",
      system: "neogeo",
      kind: "bios",
      zipData: new ArrayBuffer(64),
    });
    const runner = await createNeoGeoRunner({
      canvas: document.createElement("canvas"),
      romBuffer: new ArrayBuffer(16),
      romDb,
    });
    expect(emulatorConstructorCalls).toHaveLength(1);
    runner.start();
    runner.stop();
  });
});
