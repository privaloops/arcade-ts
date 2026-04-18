/**
 * FilterBar — All / CPS-1 / Neo-Geo / Favorites pills above the game list.
 *
 * Predicates are pure; the UI renders pills that show per-category counts
 * computed from the current games collection. RB/LB cycle through filters
 * via `next()` / `previous()`.
 *
 * Selection preservation is the responsibility of downstream GameList,
 * which tracks selection by id — as long as the currently-selected game
 * still matches the new filter's predicate, it stays selected.
 */

import type { GameEntry } from "../../data/games";

export type FilterId = "all" | "cps1" | "neogeo" | "favorites";

export const isAll = (): boolean => true;
export const isCps1 = (g: GameEntry): boolean => g.system === "cps1";
export const isNeoGeo = (g: GameEntry): boolean => g.system === "neogeo";
export const isFavorite = (g: GameEntry): boolean => g.favorite;

export interface FilterDef {
  id: FilterId;
  label: string;
  predicate: (g: GameEntry) => boolean;
}

export const FILTERS: readonly FilterDef[] = [
  { id: "all", label: "ALL", predicate: isAll },
  { id: "cps1", label: "CPS-1", predicate: isCps1 },
  { id: "neogeo", label: "NEO-GEO", predicate: isNeoGeo },
  { id: "favorites", label: "★ FAVORITES", predicate: isFavorite },
];

type ChangeListener = (id: FilterId, filtered: readonly GameEntry[]) => void;

export class FilterBar {
  readonly root: HTMLDivElement;
  private readonly pillEls = new Map<FilterId, HTMLButtonElement>();
  private readonly countEls = new Map<FilterId, HTMLSpanElement>();
  private readonly listeners = new Set<ChangeListener>();

  private games: readonly GameEntry[] = [];
  private activeId: FilterId = "all";

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "af-filter-bar";
    this.root.setAttribute("role", "tablist");
    this.root.setAttribute("data-testid", "filter-bar");

    for (const filter of FILTERS) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "af-filter-pill";
      pill.dataset.filterId = filter.id;
      pill.setAttribute("role", "tab");
      pill.setAttribute("aria-selected", filter.id === this.activeId ? "true" : "false");
      pill.addEventListener("click", () => this.setActive(filter.id));

      const label = document.createElement("span");
      label.className = "af-filter-label";
      label.textContent = filter.label;

      const count = document.createElement("span");
      count.className = "af-filter-count";
      count.dataset.filterId = filter.id;
      count.textContent = "0";

      pill.appendChild(label);
      pill.appendChild(count);
      this.root.appendChild(pill);

      this.pillEls.set(filter.id, pill);
      this.countEls.set(filter.id, count);
    }

    const visibleCount = document.createElement("span");
    visibleCount.className = "af-filter-visible-count";
    visibleCount.dataset.testid = "visible-count";
    visibleCount.textContent = "0";
    this.root.appendChild(visibleCount);

    container.appendChild(this.root);
    this.applyActiveClass();
  }

  setGames(games: readonly GameEntry[]): void {
    this.games = games;
    this.refreshCounts();
  }

  getActive(): FilterId {
    return this.activeId;
  }

  setActive(id: FilterId): void {
    if (id === this.activeId) return;
    this.activeId = id;
    this.applyActiveClass();
    this.refreshCounts();
    this.emit();
  }

  next(): void {
    const idx = FILTERS.findIndex((f) => f.id === this.activeId);
    const nextIdx = (idx + 1) % FILTERS.length;
    this.setActive(FILTERS[nextIdx]!.id);
  }

  previous(): void {
    const idx = FILTERS.findIndex((f) => f.id === this.activeId);
    const prevIdx = (idx - 1 + FILTERS.length) % FILTERS.length;
    this.setActive(FILTERS[prevIdx]!.id);
  }

  getFiltered(): readonly GameEntry[] {
    const predicate = FILTERS.find((f) => f.id === this.activeId)!.predicate;
    return this.games.filter(predicate);
  }

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private applyActiveClass(): void {
    for (const [id, pill] of this.pillEls) {
      const selected = id === this.activeId;
      pill.classList.toggle("active", selected);
      pill.setAttribute("aria-selected", selected ? "true" : "false");
    }
  }

  private refreshCounts(): void {
    for (const filter of FILTERS) {
      const count = this.games.filter(filter.predicate).length;
      const el = this.countEls.get(filter.id);
      if (el) el.textContent = String(count);
    }
    const visible = this.root.querySelector<HTMLSpanElement>('[data-testid="visible-count"]');
    if (visible) visible.textContent = String(this.getFiltered().length);
  }

  private emit(): void {
    const filtered = this.getFiltered();
    for (const l of this.listeners) l(this.activeId, filtered);
  }
}
