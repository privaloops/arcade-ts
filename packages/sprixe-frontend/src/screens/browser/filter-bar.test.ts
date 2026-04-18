import { describe, it, expect, beforeEach, vi } from "vitest";
import { FilterBar, FILTERS, isCps1, isNeoGeo, isFavorite } from "./filter-bar";
import type { GameEntry } from "../../data/games";

function mockGames(): GameEntry[] {
  return [
    { id: "sf2", title: "Street Fighter II", year: "1991", publisher: "Capcom", system: "cps1", screenshotUrl: null, videoUrl: null, favorite: false },
    { id: "ffight", title: "Final Fight", year: "1989", publisher: "Capcom", system: "cps1", screenshotUrl: null, videoUrl: null, favorite: true },
    { id: "mslug", title: "Metal Slug", year: "1996", publisher: "Nazca", system: "neogeo", screenshotUrl: null, videoUrl: null, favorite: true },
    { id: "kof97", title: "KoF '97", year: "1997", publisher: "SNK", system: "neogeo", screenshotUrl: null, videoUrl: null, favorite: false },
  ];
}

describe("FilterBar predicates", () => {
  const games = mockGames();

  it("isCps1 matches only CPS-1 titles", () => {
    expect(games.filter(isCps1).map((g) => g.id)).toEqual(["sf2", "ffight"]);
  });

  it("isNeoGeo matches only Neo-Geo titles", () => {
    expect(games.filter(isNeoGeo).map((g) => g.id)).toEqual(["mslug", "kof97"]);
  });

  it("isFavorite matches favorites from either system", () => {
    expect(games.filter(isFavorite).map((g) => g.id)).toEqual(["ffight", "mslug"]);
  });
});

describe("FilterBar component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders one pill per FILTERS entry with initial counts", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const pills = container.querySelectorAll(".af-filter-pill");
    expect(pills).toHaveLength(FILTERS.length);

    // Count attribute mirrors dataset
    const countEl = (id: string) =>
      container.querySelector<HTMLElement>(`.af-filter-count[data-filter-id="${id}"]`)!;
    expect(countEl("all").textContent).toBe("4");
    expect(countEl("cps1").textContent).toBe("2");
    expect(countEl("neogeo").textContent).toBe("2");
    expect(countEl("favorites").textContent).toBe("2");
  });

  it("starts with ALL active", () => {
    const bar = new FilterBar(container);
    expect(bar.getActive()).toBe("all");
    expect(container.querySelector<HTMLElement>(".af-filter-pill.active")!.dataset.filterId).toBe("all");
  });

  it("setActive updates DOM + fires onChange with filtered collection", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const cb = vi.fn();
    bar.onChange(cb);

    bar.setActive("cps1");

    expect(bar.getActive()).toBe("cps1");
    expect(cb).toHaveBeenCalledTimes(1);
    const [id, filtered] = cb.mock.calls[0]!;
    expect(id).toBe("cps1");
    expect(filtered.map((g: GameEntry) => g.id)).toEqual(["sf2", "ffight"]);
  });

  it("setActive with the current id is a no-op", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const cb = vi.fn();
    bar.onChange(cb);
    bar.setActive("all"); // already active
    expect(cb).not.toHaveBeenCalled();
  });

  it("next() cycles forward through the filter list", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const sequence: string[] = [];
    bar.onChange((id) => sequence.push(id));

    bar.next(); // all → cps1
    bar.next(); // cps1 → neogeo
    bar.next(); // neogeo → favorites
    bar.next(); // favorites → all (wrap)

    expect(sequence).toEqual(["cps1", "neogeo", "favorites", "all"]);
  });

  it("previous() cycles backward through the filter list", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const sequence: string[] = [];
    bar.onChange((id) => sequence.push(id));

    bar.previous(); // all → favorites (wrap)
    bar.previous(); // favorites → neogeo

    expect(sequence).toEqual(["favorites", "neogeo"]);
  });

  it("visible-count data-testid mirrors the active filter's result size", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const visibleCount = () => container.querySelector<HTMLElement>('[data-testid="visible-count"]')!.textContent;

    expect(visibleCount()).toBe("4");   // all
    bar.setActive("favorites");
    expect(visibleCount()).toBe("2");
    bar.setActive("neogeo");
    expect(visibleCount()).toBe("2");
    bar.setActive("cps1");
    expect(visibleCount()).toBe("2");
  });

  it("getFiltered() returns the filtered snapshot at any moment", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    bar.setActive("favorites");
    expect(bar.getFiltered().map((g) => g.id)).toEqual(["ffight", "mslug"]);
  });

  it("setGames() re-computes counts without changing the active filter", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    bar.setActive("favorites");

    // Add a third CPS-1 favorite.
    const extra: GameEntry = { id: "punisher", title: "The Punisher", year: "1993", publisher: "Capcom", system: "cps1", screenshotUrl: null, videoUrl: null, favorite: true };
    bar.setGames([...mockGames(), extra]);
    const countEl = (id: string) =>
      container.querySelector<HTMLElement>(`.af-filter-count[data-filter-id="${id}"]`)!;

    expect(bar.getActive()).toBe("favorites");
    expect(countEl("favorites").textContent).toBe("3");
    expect(bar.getFiltered().map((g) => g.id)).toEqual(["ffight", "mslug", "punisher"]);
  });

  it("unsubscribe stops further onChange notifications", () => {
    const bar = new FilterBar(container);
    bar.setGames(mockGames());
    const cb = vi.fn();
    const off = bar.onChange(cb);
    bar.setActive("cps1");
    off();
    bar.setActive("neogeo");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
