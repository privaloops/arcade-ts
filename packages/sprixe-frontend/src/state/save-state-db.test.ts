import { describe, it, expect, beforeEach } from "vitest";
import { SaveStateDB, SLOT_COUNT } from "./save-state-db";

let counter = 0;
function freshDb(): SaveStateDB {
  counter += 1;
  return new SaveStateDB(`sprixe-arcade-savestates-test-${counter}`);
}

function makeBuffer(size: number, seed: number): ArrayBuffer {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = (seed + i) & 0xff;
  return buf.buffer;
}

function bufferEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

describe("SaveStateDB", () => {
  let db: SaveStateDB;

  beforeEach(() => {
    db = freshDb();
    localStorage.clear();
  });

  describe("CRUD round-trip", () => {
    it("save + load round-trips a ~256 KB binary snapshot byte-for-byte", async () => {
      // CPS1 RAM 64KB + VRAM 192KB = 256KB; realistic state size.
      const data = makeBuffer(256 * 1024, 42);
      await db.save("sf2", 0, data);
      const record = await db.load("sf2", 0);
      expect(record).not.toBeNull();
      expect(record!.gameId).toBe("sf2");
      expect(record!.slot).toBe(0);
      expect(bufferEqual(record!.data, data)).toBe(true);
      expect(record!.timestamp).toBeGreaterThan(0);
    });

    it("load returns null for unknown gameId/slot", async () => {
      expect(await db.load("nope", 0)).toBeNull();
    });

    it("save overwrites when called twice on the same slot", async () => {
      await db.save("sf2", 0, makeBuffer(16, 1));
      await db.save("sf2", 0, makeBuffer(16, 2));
      const r = (await db.load("sf2", 0))!;
      expect(new Uint8Array(r.data)[0]).toBe(2);
    });

    it("delete removes a single slot without touching others", async () => {
      await db.save("sf2", 0, makeBuffer(8, 1));
      await db.save("sf2", 1, makeBuffer(8, 2));
      await db.delete("sf2", 0);
      expect(await db.load("sf2", 0)).toBeNull();
      expect(await db.load("sf2", 1)).not.toBeNull();
    });

    it("rejects out-of-range slots", async () => {
      await expect(db.save("sf2", -1, new ArrayBuffer(4))).rejects.toBeInstanceOf(RangeError);
      await expect(db.save("sf2", SLOT_COUNT, new ArrayBuffer(4))).rejects.toBeInstanceOf(RangeError);
    });
  });

  describe("4 independent slots", () => {
    it("slots for the same game hold distinct data", async () => {
      for (let i = 0; i < SLOT_COUNT; i++) {
        await db.save("sf2", i, makeBuffer(128, i));
      }
      for (let i = 0; i < SLOT_COUNT; i++) {
        const r = (await db.load("sf2", i))!;
        expect(new Uint8Array(r.data)[0]).toBe(i & 0xff);
      }
    });

    it("slots are isolated across games", async () => {
      await db.save("sf2", 0, makeBuffer(8, 10));
      await db.save("mslug", 0, makeBuffer(8, 20));
      expect(new Uint8Array((await db.load("sf2", 0))!.data)[0]).toBe(10);
      expect(new Uint8Array((await db.load("mslug", 0))!.data)[0]).toBe(20);
    });

    it("listSlots returns the populated slots for a single game, sorted by slot index", async () => {
      await db.save("sf2", 2, makeBuffer(8, 2));
      await db.save("sf2", 0, makeBuffer(8, 0));
      await db.save("sf2", 3, makeBuffer(8, 3));
      await db.save("mslug", 0, makeBuffer(8, 99));

      const slots = await db.listSlots("sf2");
      expect(slots.map((s) => s.slot)).toEqual([0, 2, 3]);
      expect(slots.every((s) => s.size === 8)).toBe(true);
      expect(slots.every((s) => s.timestamp > 0)).toBe(true);
    });

    it("listSlots returns empty for an unknown game", async () => {
      expect(await db.listSlots("ffight")).toEqual([]);
    });
  });

  describe("migration from legacy localStorage", () => {
    it("migrates `sprixe-savestate-{id}-{slot}` entries into IDB and removes them", async () => {
      // Legacy payload is base64 of a tiny binary.
      const bin = new Uint8Array([1, 2, 3, 4]);
      let b64 = "";
      for (const byte of bin) b64 += String.fromCharCode(byte);
      const encoded = btoa(b64);

      localStorage.setItem("sprixe-savestate-sf2-0", encoded);
      localStorage.setItem("sprixe-savestate-sf2-2", encoded);
      localStorage.setItem("sprixe-savestate-ffight-1", encoded);
      localStorage.setItem("unrelated-key", "ignore me");

      const migrated = await db.migrateFromLocalStorage();
      expect(migrated).toBe(3);

      // Legacy keys gone.
      expect(localStorage.getItem("sprixe-savestate-sf2-0")).toBeNull();
      expect(localStorage.getItem("sprixe-savestate-ffight-1")).toBeNull();
      // Unrelated key untouched.
      expect(localStorage.getItem("unrelated-key")).toBe("ignore me");

      // IDB now holds the payload.
      const row = await db.load("sf2", 0);
      expect(row).not.toBeNull();
      expect(new Uint8Array(row!.data)).toEqual(bin);
    });

    it("is idempotent — calling twice migrates nothing the second time", async () => {
      localStorage.setItem("sprixe-savestate-sf2-0", btoa("\x00\x01"));
      const first = await db.migrateFromLocalStorage();
      const second = await db.migrateFromLocalStorage();
      expect(first).toBe(1);
      expect(second).toBe(0);
    });

    it("skips malformed base64 payloads without throwing", async () => {
      localStorage.setItem("sprixe-savestate-sf2-0", "not-base64-!!!");
      const migrated = await db.migrateFromLocalStorage();
      expect(migrated).toBe(0);
      // The malformed key is left in place — a future version can clean up.
      expect(localStorage.getItem("sprixe-savestate-sf2-0")).not.toBeNull();
    });
  });
});
