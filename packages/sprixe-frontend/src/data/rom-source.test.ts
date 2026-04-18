import { describe, it, expect } from "vitest";
import { romRecordToGameEntry } from "./rom-source";
import type { RomRecord } from "../storage/rom-db";

function mockRecord(partial: Partial<RomRecord>): RomRecord {
  return {
    id: "",
    system: "cps1",
    zipData: new ArrayBuffer(0),
    addedAt: 0,
    lastPlayedAt: 0,
    playCount: 0,
    favorite: false,
    size: 0,
    ...partial,
  } as RomRecord;
}

describe("romRecordToGameEntry", () => {
  describe("CPS-1", () => {
    it("resolves a known CPS-1 set against the engine catalogue", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "sf2", system: "cps1" }));
      expect(entry.system).toBe("cps1");
      expect(entry.title).toMatch(/Street Fighter/);
      expect(entry.publisher).toBe("Capcom");
      expect(entry.year).toMatch(/^\d{4}$/);
    });

    it("strips the '(World 900227)' trailer from the title", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "1941", system: "cps1" }));
      expect(entry.title).not.toContain("(");
      expect(entry.year).toBe("1990");
    });

    it("unknown CPS-1 set falls back to id as title, keeps Capcom publisher", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "xyz-unknown", system: "cps1" }));
      expect(entry.title).toBe("xyz-unknown");
      expect(entry.publisher).toBe("Capcom");
      expect(entry.system).toBe("cps1");
    });

    it("screenshotUrl points at the CPS-1 placeholder", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "sf2", system: "cps1" }));
      expect(entry.screenshotUrl).toBe("/media/placeholder-cps1.svg");
    });
  });

  describe("Neo-Geo", () => {
    it("resolves mslug against the bundled Neo-Geo map", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "mslug", system: "neogeo" }));
      expect(entry.title).toBe("Metal Slug");
      expect(entry.year).toBe("1996");
      expect(entry.publisher).toBe("Nazca");
    });

    it("resolves kof97 against the bundled Neo-Geo map", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "kof97", system: "neogeo" }));
      expect(entry.title).toBe("The King of Fighters '97");
      expect(entry.publisher).toBe("SNK");
    });

    it("unknown Neo-Geo set falls back to id + SNK publisher", () => {
      const entry = romRecordToGameEntry(mockRecord({ id: "rarity1", system: "neogeo" }));
      expect(entry.title).toBe("rarity1");
      expect(entry.publisher).toBe("SNK");
      expect(entry.screenshotUrl).toBe("/media/placeholder-neogeo.svg");
    });
  });

  describe("favorite + metadata carryover", () => {
    it("preserves the favorite flag from the record", () => {
      expect(
        romRecordToGameEntry(mockRecord({ id: "sf2", system: "cps1", favorite: true })).favorite
      ).toBe(true);
      expect(
        romRecordToGameEntry(mockRecord({ id: "sf2", system: "cps1", favorite: false })).favorite
      ).toBe(false);
    });

    it("videoUrl stays null — CDN wiring is Phase 4", () => {
      expect(romRecordToGameEntry(mockRecord({ id: "sf2", system: "cps1" })).videoUrl).toBeNull();
    });
  });
});
