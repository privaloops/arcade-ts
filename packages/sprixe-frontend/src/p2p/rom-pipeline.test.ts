import { describe, it, expect, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RomPipeline, InvalidRomError, UnsupportedSystemError } from "./rom-pipeline";
import { RomDB } from "../storage/rom-db";
import type { Identification } from "../engine-bridge/identify";

const FIXTURE_PATH = resolve(__dirname, "../../tests/fixtures/test.zip");

async function bufferFromFixture(): Promise<ArrayBuffer> {
  const buf = await readFile(FIXTURE_PATH);
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

let dbCounter = 0;
function freshDb(): RomDB {
  dbCounter += 1;
  return new RomDB(`sprixe-arcade-pipeline-test-${dbCounter}`);
}

describe("RomPipeline", () => {
  let db: RomDB;

  beforeEach(() => {
    db = freshDb();
  });

  describe("happy path", () => {
    it("identifies a real CPS-1 fixture and persists it into RomDB", async () => {
      const pipeline = new RomPipeline({ db });
      const data = await bufferFromFixture();

      const result = await pipeline.process({ name: "sf2.zip", data });

      expect(result.identification.system).toBe("cps1");
      expect(result.record.size).toBe(data.byteLength);
      expect(result.record.zipData.byteLength).toBe(data.byteLength);
      expect(result.record.favorite).toBe(false);
      expect(result.record.playCount).toBe(0);
      expect(result.record.lastPlayedAt).toBe(0);
      expect(result.record.addedAt).toBeGreaterThan(0);

      const stored = await db.get(result.record.id);
      expect(stored).not.toBeNull();
      expect(stored!.zipData.byteLength).toBe(data.byteLength);
    });

    it("uses the catalogue set name as the id when identification resolves it", async () => {
      const identify = async (): Promise<Identification> => ({
        system: "cps1",
        fileNames: [],
        setName: "sf2",
      });
      const pipeline = new RomPipeline({ db, identify });

      const { record } = await pipeline.process({
        name: "weird-filename-xyz.zip",
        data: new ArrayBuffer(16),
      });

      expect(record.id).toBe("sf2");
    });

    it("falls back to a sanitized filename when identification has no set name", async () => {
      const identify = async (): Promise<Identification> => ({
        system: "neogeo",
        fileNames: [],
        setName: null,
      });
      const pipeline = new RomPipeline({ db, identify });

      const { record } = await pipeline.process({
        name: "Some-Folder/mSlUg.ZIP",
        data: new ArrayBuffer(16),
      });

      expect(record.id).toBe("mslug");
    });

    it("overwrites an existing record for the same id (upsert semantics)", async () => {
      const identify = async (): Promise<Identification> => ({
        system: "cps1",
        fileNames: [],
        setName: "sf2",
      });
      const pipeline = new RomPipeline({ db, identify });

      await pipeline.process({ name: "sf2.zip", data: new Uint8Array([1, 1]).buffer });
      await pipeline.process({ name: "sf2.zip", data: new Uint8Array([2, 2]).buffer });

      const stored = (await db.get("sf2"))!;
      expect(new Uint8Array(stored.zipData)[0]).toBe(2);
    });
  });

  describe("typed errors propagate", () => {
    it("InvalidRomError surfaces from identify() unchanged", async () => {
      const identify = async (): Promise<Identification> => {
        throw new InvalidRomError("Not a valid ZIP archive");
      };
      const pipeline = new RomPipeline({ db, identify });

      await expect(pipeline.process({ name: "bad.zip", data: new ArrayBuffer(0) }))
        .rejects.toBeInstanceOf(InvalidRomError);

      // Nothing persisted on error.
      expect(await db.list()).toEqual([]);
    });

    it("UnsupportedSystemError surfaces with file names for the UI", async () => {
      const identify = async (): Promise<Identification> => {
        throw new UnsupportedSystemError("Unknown system", ["readme.txt"]);
      };
      const pipeline = new RomPipeline({ db, identify });

      try {
        await pipeline.process({ name: "zz.zip", data: new ArrayBuffer(0) });
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(UnsupportedSystemError);
        expect((e as UnsupportedSystemError).fileNames).toContain("readme.txt");
      }
    });
  });
});
