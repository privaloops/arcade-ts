import { describe, it, expect, beforeEach, vi } from "vitest";
import { History, STORAGE_KEY, DEFAULT_HISTORY } from "./history";

describe("History", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("markPlayed", () => {
    it("prepends new entries", () => {
      const h = new History();
      h.markPlayed("a");
      h.markPlayed("b");
      h.markPlayed("c");
      expect(h.getRecent()).toEqual(["c", "b", "a"]);
    });

    it("dedupes — playing an existing entry moves it to the front", () => {
      const h = new History();
      h.markPlayed("a");
      h.markPlayed("b");
      h.markPlayed("c");
      h.markPlayed("a");
      expect(h.getRecent()).toEqual(["a", "c", "b"]);
    });

    it("caps the list at maxRecent entries (default 20)", () => {
      const h = new History();
      for (let i = 0; i < 30; i++) h.markPlayed(`game-${i}`);
      expect(h.getRecent()).toHaveLength(20);
      expect(h.getRecent()[0]).toBe("game-29");
      expect(h.getRecent()[19]).toBe("game-10");
    });

    it("honours a custom maxRecent option", () => {
      const h = new History({ maxRecent: 3 });
      h.markPlayed("a");
      h.markPlayed("b");
      h.markPlayed("c");
      h.markPlayed("d");
      expect(h.getRecent()).toEqual(["d", "c", "b"]);
    });

    it("empty / null-ish ids are ignored", () => {
      const h = new History();
      h.markPlayed("");
      expect(h.getRecent()).toEqual([]);
    });
  });

  describe("toggleFavorite", () => {
    it("adds then removes on consecutive calls", () => {
      const h = new History();
      expect(h.toggleFavorite("sf2")).toBe(true);
      expect(h.isFavorite("sf2")).toBe(true);
      expect(h.toggleFavorite("sf2")).toBe(false);
      expect(h.isFavorite("sf2")).toBe(false);
    });

    it("favorites are sorted alphabetically (stable output)", () => {
      const h = new History();
      h.toggleFavorite("zeta");
      h.toggleFavorite("alpha");
      h.toggleFavorite("mu");
      expect(h.getFavorites()).toEqual(["alpha", "mu", "zeta"]);
    });

    it("dedupes when the same id is toggled on twice in a row via replace", () => {
      const h = new History();
      h.toggleFavorite("sf2");
      // Simulate the user adding it via a different path; store should
      // end up holding just one copy.
      const payload = { version: 1, recent: [], favorites: ["sf2", "sf2"] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      const h2 = new History();
      expect(h2.getFavorites()).toEqual(["sf2"]);
    });
  });

  describe("persistence", () => {
    it("writes to localStorage on every mutation", () => {
      const h = new History();
      h.markPlayed("a");
      h.toggleFavorite("a");

      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(raw.recent).toEqual(["a"]);
      expect(raw.favorites).toEqual(["a"]);
      expect(raw.version).toBe(1);
    });

    it("round-trips across a fresh History instance", () => {
      const a = new History();
      a.markPlayed("x");
      a.toggleFavorite("y");
      const b = new History();
      expect(b.getRecent()).toEqual(["x"]);
      expect(b.getFavorites()).toEqual(["y"]);
    });

    it("malformed JSON falls back to defaults", () => {
      localStorage.setItem(STORAGE_KEY, "not json");
      const h = new History();
      expect(h.getRecent()).toEqual(DEFAULT_HISTORY.recent);
      expect(h.getFavorites()).toEqual(DEFAULT_HISTORY.favorites);
    });

    it("foreign version → defaults", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 2, recent: ["a"], favorites: ["a"] })
      );
      const h = new History();
      expect(h.getRecent()).toEqual([]);
    });

    it("legacy array entries with non-string contents are filtered", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, recent: ["a", 1, null, "b"], favorites: ["x", 2] })
      );
      const h = new History();
      expect(h.getRecent()).toEqual(["a", "b"]);
      expect(h.getFavorites()).toEqual(["x"]);
    });

    it("storage quota errors are swallowed (in-memory state still updates)", () => {
      const throwing: Storage = {
        length: 0,
        clear: () => {},
        getItem: () => null,
        key: () => null,
        removeItem: () => {},
        setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
      };
      const h = new History({ storage: throwing });
      expect(() => h.markPlayed("a")).not.toThrow();
      expect(h.getRecent()).toEqual(["a"]);
    });
  });

  describe("reset", () => {
    it("empties both lists and persists", () => {
      const h = new History();
      h.markPlayed("a");
      h.toggleFavorite("b");
      h.reset();
      expect(h.getRecent()).toEqual([]);
      expect(h.getFavorites()).toEqual([]);
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(raw).toEqual({ version: 1, recent: [], favorites: [] });
    });
  });

  describe("onChange subscription", () => {
    it("fires on markPlayed / toggleFavorite / reset", () => {
      const h = new History();
      const cb = vi.fn();
      h.onChange(cb);
      h.markPlayed("a");
      h.toggleFavorite("b");
      h.reset();
      expect(cb).toHaveBeenCalledTimes(3);
    });

    it("unsubscribe stops further notifications", () => {
      const h = new History();
      const cb = vi.fn();
      const off = h.onChange(cb);
      h.markPlayed("a");
      off();
      h.markPlayed("b");
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
