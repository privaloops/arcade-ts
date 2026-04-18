import { describe, it, expect } from "vitest";
import { MOCK_GAMES } from "./mock-games";
import type { GameEntry } from "./games";

describe("mock games dataset", () => {
  it("ships at least 5 entries", () => {
    expect(MOCK_GAMES.length).toBeGreaterThanOrEqual(5);
  });

  it("ids are unique", () => {
    const ids = new Set<string>();
    for (const game of MOCK_GAMES) {
      expect(ids.has(game.id), `duplicate id: ${game.id}`).toBe(false);
      ids.add(game.id);
    }
  });

  it("every entry matches the GameEntry shape with non-empty title/year/publisher", () => {
    for (const game of MOCK_GAMES) {
      const e: GameEntry = game;
      expect(e.id).toMatch(/^[a-z0-9]+$/);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.year).toMatch(/^\d{4}$/);
      expect(e.publisher.length).toBeGreaterThan(0);
      expect(["cps1", "neogeo"]).toContain(e.system);
      expect(typeof e.favorite).toBe("boolean");
    }
  });

  it("includes at least one entry per supported system", () => {
    const systems = new Set(MOCK_GAMES.map((g) => g.system));
    expect(systems.has("cps1")).toBe(true);
    expect(systems.has("neogeo")).toBe(true);
  });

  it("screenshotUrl points at a known placeholder path", () => {
    for (const game of MOCK_GAMES) {
      expect(game.screenshotUrl).toMatch(/^\/media\/placeholder-(cps1|neogeo)\.svg$/);
    }
  });
});
