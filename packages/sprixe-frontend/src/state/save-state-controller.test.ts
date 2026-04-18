import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SaveStateController } from "./save-state-controller";
import { SaveStateDB } from "./save-state-db";
import { Toast } from "../ui/toast";
import type { EmulatorHandle } from "../screens/pause/pause-overlay";

let counter = 0;
function freshDb(): SaveStateDB {
  counter += 1;
  return new SaveStateDB(`sprixe-arcade-ssc-test-${counter}`);
}

function makeBuffer(value: number): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value);
  return buf;
}

interface MockEmulator extends EmulatorHandle {
  saveState(): ArrayBuffer | null;
  loadState(data: ArrayBuffer): boolean;
  lastLoaded: ArrayBuffer | null;
}

function makeEmulator(initialSnapshot: number = 42): MockEmulator {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    saveState: vi.fn(() => makeBuffer(initialSnapshot)) as () => ArrayBuffer,
    loadState: vi.fn(function (this: MockEmulator, data: ArrayBuffer) {
      this.lastLoaded = data;
      return true;
    }) as (data: ArrayBuffer) => boolean,
    lastLoaded: null,
  };
}

describe("SaveStateController", () => {
  let db: SaveStateDB;
  let toastContainer: HTMLDivElement;
  let toast: Toast;

  beforeEach(() => {
    db = freshDb();
    toastContainer = document.createElement("div");
    document.body.appendChild(toastContainer);
    toast = new Toast(toastContainer);
  });

  afterEach(() => {
    toastContainer.remove();
  });

  it("save() persists a snapshot and shows a success toast", async () => {
    const emulator = makeEmulator(7);
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast, skipKeyBindings: true,
    });

    await controller.save();
    const rec = await db.load("sf2", 0);
    expect(rec).not.toBeNull();
    expect(new DataView(rec!.data).getFloat64(0)).toBe(7);

    const entries = toast.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe("success");
    expect(entries[0]!.message).toBe("Saved slot 1");

    controller.dispose();
  });

  it("load() replays a saved snapshot into the emulator", async () => {
    const emulator = makeEmulator();
    await db.save("sf2", 0, makeBuffer(99));
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast, skipKeyBindings: true,
    });

    await controller.load();
    expect(emulator.loadState).toHaveBeenCalledTimes(1);
    expect(emulator.lastLoaded).not.toBeNull();
    expect(new DataView(emulator.lastLoaded!).getFloat64(0)).toBe(99);

    const entries = toast.getEntries();
    expect(entries[0]!.type).toBe("success");
    expect(entries[0]!.message).toBe("Loaded slot 1");

    controller.dispose();
  });

  it("load() on an empty slot shows an info toast and skips loadState", async () => {
    const emulator = makeEmulator();
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast, skipKeyBindings: true,
    });

    await controller.load();
    expect(emulator.loadState).not.toHaveBeenCalled();
    const entries = toast.getEntries();
    expect(entries[0]!.type).toBe("info");
    expect(entries[0]!.message).toBe("Slot 1 empty");

    controller.dispose();
  });

  it("save() when emulator lacks saveState shows an info toast", async () => {
    const emulator: EmulatorHandle = { pause: vi.fn(), resume: vi.fn() };
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast, skipKeyBindings: true,
    });

    await controller.save();
    const entries = toast.getEntries();
    expect(entries[0]!.type).toBe("info");
    expect(entries[0]!.message).toBe("Save state unavailable");

    controller.dispose();
  });

  it("F5 and F8 trigger save and load via the window listener", async () => {
    const emulator = makeEmulator(123);
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F5" }));
    // Yield twice — controller.save() is async (awaits db.save()).
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(emulator.saveState).toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F8" }));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(emulator.loadState).toHaveBeenCalled();
    expect(new DataView(emulator.lastLoaded!).getFloat64(0)).toBe(123);

    controller.dispose();
  });

  it("dispose() detaches the F5/F8 listener", async () => {
    const emulator = makeEmulator();
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast,
    });
    controller.dispose();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "F5" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(emulator.saveState).not.toHaveBeenCalled();
  });

  it("respects a non-default slot", async () => {
    const emulator = makeEmulator(55);
    const controller = new SaveStateController({
      emulator, db, gameId: "sf2", toast, slot: 2, skipKeyBindings: true,
    });

    await controller.save();
    expect((await db.load("sf2", 0))).toBeNull();
    const rec = await db.load("sf2", 2);
    expect(rec).not.toBeNull();
    expect(toast.getEntries()[0]!.message).toBe("Saved slot 3");

    controller.dispose();
  });
});
