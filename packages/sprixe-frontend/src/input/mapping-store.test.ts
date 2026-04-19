import { describe, it, expect, beforeEach } from "vitest";
import {
  loadMapping,
  saveMapping,
  clearMapping,
  bindingsEqual,
  findDuplicate,
  STORAGE_KEY,
  type InputMapping,
} from "./mapping-store";

describe("mapping-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("saveMapping + loadMapping", () => {
    it("round-trips a gamepad mapping", () => {
      const mapping: InputMapping = {
        version: 1,
        type: "gamepad",
        p1: {
          coin: { kind: "button", index: 8 },
          start: { kind: "button", index: 9 },
          up: { kind: "axis", index: 1, dir: -1 },
        },
      };
      saveMapping(mapping);
      expect(loadMapping()).toEqual(mapping);
    });

    it("round-trips a keyboard mapping", () => {
      const mapping: InputMapping = {
        version: 1,
        type: "keyboard",
        p1: { button1: { kind: "key", code: "Enter" } },
      };
      saveMapping(mapping);
      expect(loadMapping()).toEqual(mapping);
    });

    it("loadMapping returns null when nothing is stored", () => {
      expect(loadMapping()).toBeNull();
    });

    it("loadMapping rejects a payload with a different version", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, type: "gamepad", p1: {} }));
      expect(loadMapping()).toBeNull();
    });

    it("loadMapping rejects a garbage payload", () => {
      localStorage.setItem(STORAGE_KEY, "not JSON");
      expect(loadMapping()).toBeNull();
    });

    it("clearMapping removes the stored value", () => {
      saveMapping({ version: 1, type: "gamepad", p1: {} });
      clearMapping();
      expect(loadMapping()).toBeNull();
    });
  });

  describe("bindingsEqual", () => {
    it("matches button equality by index", () => {
      expect(bindingsEqual({ kind: "button", index: 0 }, { kind: "button", index: 0 })).toBe(true);
      expect(bindingsEqual({ kind: "button", index: 0 }, { kind: "button", index: 1 })).toBe(false);
    });

    it("matches axis equality by index + direction", () => {
      expect(
        bindingsEqual({ kind: "axis", index: 1, dir: -1 }, { kind: "axis", index: 1, dir: -1 })
      ).toBe(true);
      expect(
        bindingsEqual({ kind: "axis", index: 1, dir: -1 }, { kind: "axis", index: 1, dir: 1 })
      ).toBe(false);
    });

    it("matches key equality by code", () => {
      expect(bindingsEqual({ kind: "key", code: "KeyA" }, { kind: "key", code: "KeyA" })).toBe(true);
      expect(bindingsEqual({ kind: "key", code: "KeyA" }, { kind: "key", code: "KeyB" })).toBe(false);
    });

    it("different kinds never match", () => {
      expect(bindingsEqual({ kind: "button", index: 0 }, { kind: "key", code: "KeyA" })).toBe(false);
    });
  });

  describe("findDuplicate", () => {
    it("returns the role already bound to the given binding", () => {
      const mapping = {
        coin: { kind: "button" as const, index: 8 },
        start: { kind: "button" as const, index: 9 },
      };
      expect(findDuplicate(mapping, { kind: "button", index: 8 })).toBe("coin");
    });

    it("returns null when the binding is free", () => {
      const mapping = { coin: { kind: "button" as const, index: 8 } };
      expect(findDuplicate(mapping, { kind: "button", index: 9 })).toBeNull();
    });

    it("ignores undefined role slots", () => {
      const mapping = { coin: { kind: "button" as const, index: 8 } };
      // @ts-expect-error — start is intentionally missing
      mapping.start = undefined;
      expect(findDuplicate(mapping, { kind: "button", index: 0 })).toBeNull();
    });
  });
});
