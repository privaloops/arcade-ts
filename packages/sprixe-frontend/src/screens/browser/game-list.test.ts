import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameList } from "./game-list";
import type { GameEntry } from "../../data/games";

function makeGames(n: number, seed: string = "g"): GameEntry[] {
  const items: GameEntry[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      id: `${seed}-${i}`,
      title: `Game ${i}`,
      year: "1990",
      publisher: "Test",
      system: i % 2 === 0 ? "cps1" : "neogeo",
      screenshotUrl: null,
      videoUrl: null,
      favorite: i % 7 === 0,
    });
  }
  return items;
}

describe("GameList", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("programmatic selection", () => {
    it("defaults selected to the first item after setItems", () => {
      const list = new GameList(container);
      list.setItems(makeGames(10));
      expect(list.getSelectedIndex()).toBe(0);
      expect(list.getSelectedGame()!.id).toBe("g-0");
    });

    it("setSelectedIndex updates DOM `selected` class", () => {
      const list = new GameList(container);
      list.setItems(makeGames(10));
      list.setSelectedIndex(3);

      const selected = container.querySelector<HTMLElement>(".af-game-list-item.selected");
      expect(selected).not.toBeNull();
      expect(selected!.dataset.gameId).toBe("g-3");
    });

    it("setSelectedIndex is bounds-checked", () => {
      const list = new GameList(container);
      list.setItems(makeGames(5));
      list.setSelectedIndex(99);
      expect(list.getSelectedIndex()).toBe(0);
      list.setSelectedIndex(-1);
      expect(list.getSelectedIndex()).toBe(0);
    });

    it("moveSelection wraps around", () => {
      const list = new GameList(container);
      list.setItems(makeGames(4));
      list.setSelectedIndex(3);
      list.moveSelection(1);
      expect(list.getSelectedIndex()).toBe(0);
      list.moveSelection(-1);
      expect(list.getSelectedIndex()).toBe(3);
    });
  });

  describe("virtualization", () => {
    it("renders ≤20 DOM nodes for 1000 items", () => {
      const list = new GameList(container);
      list.setItems(makeGames(1000));
      expect(list.getRenderedCount()).toBeLessThanOrEqual(20);
    });

    it("rendered window follows the selection", () => {
      const list = new GameList(container, { windowSize: 10 });
      list.setItems(makeGames(1000));
      list.setSelectedIndex(500);

      const rendered = Array.from(container.querySelectorAll<HTMLElement>(".af-game-list-item"));
      const indices = rendered.map((el) => Number(el.dataset.index)).sort((a, b) => a - b);
      // Selected index must be inside the rendered window.
      expect(indices[0]!).toBeLessThanOrEqual(500);
      expect(indices[indices.length - 1]!).toBeGreaterThanOrEqual(500);
      // Window size respected.
      expect(rendered.length).toBe(10);
    });

    it("renders all items when count ≤ windowSize", () => {
      const list = new GameList(container, { windowSize: 16 });
      list.setItems(makeGames(5));
      expect(list.getRenderedCount()).toBe(5);
    });
  });

  describe("selection persistence across setItems", () => {
    it("preserves the selected id if the item survives the filter", () => {
      const list = new GameList(container);
      list.setItems(makeGames(10));
      list.setSelectedIndex(3); // id g-3

      // New set contains g-3 at a different index.
      const filtered: GameEntry[] = [
        ...makeGames(2, "other"),
        ...makeGames(10).filter((g) => g.id === "g-3" || g.id === "g-7"),
      ];
      list.setItems(filtered);
      expect(list.getSelectedGame()!.id).toBe("g-3");
      expect(list.getSelectedIndex()).toBe(2);
    });

    it("falls back to index 0 when previous selection is filtered out", () => {
      const list = new GameList(container);
      list.setItems(makeGames(10));
      list.setSelectedIndex(5); // g-5

      const filtered = makeGames(10).filter((g) => g.id !== "g-5");
      list.setItems(filtered);
      expect(list.getSelectedIndex()).toBe(0);
    });

    it("empty item set clears selection", () => {
      const list = new GameList(container);
      list.setItems(makeGames(3));
      list.setItems([]);
      expect(list.getSelectedIndex()).toBe(-1);
      expect(list.getSelectedGame()).toBeNull();
      expect(list.getRenderedCount()).toBe(0);
    });
  });

  describe("events", () => {
    it("onChange fires on setSelectedIndex with the new game", () => {
      const list = new GameList(container);
      const cb = vi.fn();
      list.setItems(makeGames(5));
      list.onChange(cb);

      list.setSelectedIndex(2);
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ id: "g-2" }), 2);
    });

    it("onChange does not fire when selection doesn't change", () => {
      const list = new GameList(container);
      list.setItems(makeGames(5));
      const cb = vi.fn();
      list.onChange(cb);
      list.setSelectedIndex(0); // already 0
      expect(cb).not.toHaveBeenCalled();
    });

    it("confirm() fires onSelect with current game", () => {
      const list = new GameList(container);
      list.setItems(makeGames(5));
      list.setSelectedIndex(2);

      const cb = vi.fn();
      list.onSelect(cb);
      list.confirm();
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ id: "g-2" }), 2);
    });

    it("unsubscribes correctly", () => {
      const list = new GameList(container);
      list.setItems(makeGames(5));
      const cb = vi.fn();
      const off = list.onChange(cb);
      off();
      list.setSelectedIndex(3);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("DOM output", () => {
    it("renders a role=listbox root and role=option children", () => {
      const list = new GameList(container);
      list.setItems(makeGames(3));
      expect(list.root.getAttribute("role")).toBe("listbox");
      const options = container.querySelectorAll('[role="option"]');
      expect(options.length).toBe(3);
    });

    it("marks the selected item with aria-selected and .selected", () => {
      const list = new GameList(container);
      list.setItems(makeGames(3));
      list.setSelectedIndex(1);
      const selected = container.querySelector(".af-game-list-item.selected")!;
      expect(selected.getAttribute("aria-selected")).toBe("true");
      expect(selected.getAttribute("data-game-id")).toBe("g-1");
    });

    it("renders system badge text", () => {
      const list = new GameList(container);
      list.setItems(makeGames(2));
      const badges = Array.from(container.querySelectorAll(".af-badge"));
      expect(badges[0]!.textContent).toBe("CPS-1");
      expect(badges[1]!.textContent).toBe("Neo-Geo");
    });

    it("shows favorite star only on favorite items", () => {
      const list = new GameList(container);
      list.setItems(makeGames(10));
      const stars = container.querySelectorAll(".af-game-list-favorite");
      // indices 0 and 7 are favorites (i % 7 === 0)
      expect(stars.length).toBe(2);
    });
  });
});
