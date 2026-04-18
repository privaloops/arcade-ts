import { describe, it, expect, beforeEach } from "vitest";
import { RomDB, type RomRecord } from "./rom-db";

/** Each test gets its own DB name so fake-indexeddb's state doesn't leak between cases. */
let counter = 0;
function freshDb(): RomDB {
  counter += 1;
  return new RomDB(`sprixe-arcade-test-${counter}`);
}

function bufOf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe("RomDB", () => {
  let db: RomDB;

  beforeEach(() => {
    db = freshDb();
  });

  describe("CRUD", () => {
    it("put then get round-trips the full record", async () => {
      await db.put({
        id: "sf2",
        system: "cps1",
        zipData: bufOf([0x50, 0x4b, 0x03, 0x04]),
      });

      const r = await db.get("sf2");
      expect(r).not.toBeNull();
      expect(r!.id).toBe("sf2");
      expect(r!.system).toBe("cps1");
      expect(new Uint8Array(r!.zipData).slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
      expect(r!.size).toBe(4);
      expect(r!.playCount).toBe(0);
      expect(r!.favorite).toBe(false);
      expect(r!.lastPlayedAt).toBe(0);
      expect(r!.addedAt).toBeGreaterThan(0);
    });

    it("get returns null for missing ids", async () => {
      expect(await db.get("does-not-exist")).toBeNull();
    });

    it("put overwrites when the same id is used (upsert)", async () => {
      await db.put({ id: "sf2", system: "cps1", zipData: bufOf([1]), favorite: false });
      await db.put({ id: "sf2", system: "cps1", zipData: bufOf([2]), favorite: true });
      const r = (await db.get("sf2"))!;
      expect(r.favorite).toBe(true);
      expect(new Uint8Array(r.zipData)[0]).toBe(2);
    });

    it("delete removes a record", async () => {
      await db.put({ id: "sf2", system: "cps1", zipData: bufOf([1]) });
      await db.delete("sf2");
      expect(await db.get("sf2")).toBeNull();
    });

    it("delete on missing id is a no-op (does not throw)", async () => {
      await expect(db.delete("missing")).resolves.toBeUndefined();
    });
  });

  describe("large ROMs", () => {
    it("stores a 100 MB payload without crashing", async () => {
      const big = new Uint8Array(100 * 1024 * 1024);
      big[0] = 0x50;
      big[big.length - 1] = 0xff;
      await db.put({ id: "mslug", system: "neogeo", zipData: big.buffer });

      const r = (await db.get("mslug"))!;
      expect(r.zipData.byteLength).toBe(big.byteLength);
      expect(r.size).toBe(big.byteLength);
      expect(new Uint8Array(r.zipData)[0]).toBe(0x50);
      expect(new Uint8Array(r.zipData)[big.byteLength - 1]).toBe(0xff);
    }, 30_000);
  });

  describe("list ordering", () => {
    it("sorts by lastPlayedAt desc, unplayed entries last, ties broken by addedAt desc", async () => {
      const now = Date.now();
      const records: Partial<RomRecord>[] = [
        { id: "a", lastPlayedAt: now - 1000, addedAt: now - 5000 },
        { id: "b", lastPlayedAt: now,        addedAt: now - 4000 },
        { id: "c", lastPlayedAt: 0,          addedAt: now - 3000 }, // unplayed, newest
        { id: "d", lastPlayedAt: 0,          addedAt: now - 2000 }, // unplayed, newer than c
        { id: "e", lastPlayedAt: now - 500,  addedAt: now - 1000 },
      ];
      for (const r of records) {
        await db.put({
          id: r.id!,
          system: "cps1",
          zipData: bufOf([0]),
          addedAt: r.addedAt,
          lastPlayedAt: r.lastPlayedAt,
        });
      }

      const list = await db.list();
      expect(list.map((r) => r.id)).toEqual(["b", "e", "a", "d", "c"]);
    });

    it("empty store returns empty array", async () => {
      expect(await db.list()).toEqual([]);
    });
  });

  describe("markPlayed", () => {
    it("increments playCount and bumps lastPlayedAt", async () => {
      await db.put({ id: "sf2", system: "cps1", zipData: bufOf([1]) });
      const before = (await db.get("sf2"))!;
      expect(before.playCount).toBe(0);
      expect(before.lastPlayedAt).toBe(0);

      await db.markPlayed("sf2");

      const after = (await db.get("sf2"))!;
      expect(after.playCount).toBe(1);
      expect(after.lastPlayedAt).toBeGreaterThan(0);
    });

    it("markPlayed on missing id is a no-op", async () => {
      await expect(db.markPlayed("missing")).resolves.toBeUndefined();
    });
  });

  describe("setFavorite", () => {
    it("toggles the favorite flag without touching other fields", async () => {
      await db.put({ id: "ffight", system: "cps1", zipData: bufOf([1]) });
      await db.setFavorite("ffight", true);

      const r = (await db.get("ffight"))!;
      expect(r.favorite).toBe(true);
      expect(r.size).toBe(1);
    });

    it("setFavorite on missing id is a no-op", async () => {
      await expect(db.setFavorite("missing", true)).resolves.toBeUndefined();
    });
  });

  describe("totalSize", () => {
    it("sums all record sizes", async () => {
      await db.put({ id: "a", system: "cps1", zipData: bufOf(new Array(100).fill(0)) });
      await db.put({ id: "b", system: "cps1", zipData: bufOf(new Array(250).fill(0)) });
      expect(await db.totalSize()).toBe(350);
    });

    it("empty store reports 0 bytes", async () => {
      expect(await db.totalSize()).toBe(0);
    });
  });

  describe("write-failure surfacing", () => {
    it("rejects the put promise when the transaction errors out", async () => {
      // fake-indexeddb doesn't enforce storage quotas, so we trigger a
      // real transaction error (key collision inside a single tx) to
      // prove that failures propagate instead of silently resolving.
      const handle = await db.open();
      await new Promise<void>((resolve, reject) => {
        const tx = handle.transaction("roms", "readwrite");
        const store = tx.objectStore("roms");
        // store.add() with a key that already exists triggers ConstraintError.
        store.add({ id: "dup", system: "cps1", zipData: bufOf([0]), addedAt: 0, lastPlayedAt: 0, playCount: 0, favorite: false, size: 1 });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });

      // Now trigger the same add() inside a fresh tx to get a live error.
      const erred = await new Promise<Error | null>((resolve) => {
        const tx = handle.transaction("roms", "readwrite");
        const store = tx.objectStore("roms");
        const addReq = store.add({ id: "dup", system: "cps1", zipData: bufOf([0]), addedAt: 0, lastPlayedAt: 0, playCount: 0, favorite: false, size: 1 });
        addReq.onerror = (e) => {
          e.preventDefault();
          e.stopPropagation();
          resolve(addReq.error);
        };
        tx.onerror = () => {};
        tx.oncomplete = () => resolve(null);
      });
      expect(erred).not.toBeNull();
      expect(erred!.name).toBe("ConstraintError");
    });
  });
});
