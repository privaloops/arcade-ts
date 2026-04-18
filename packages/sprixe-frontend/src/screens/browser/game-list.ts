/**
 * GameList — virtualized vertical list of games.
 *
 * Instead of the usual scrollTop-driven virtualization (which is awkward
 * under jsdom and doesn't match how a gamepad-only UI actually navigates),
 * the list renders a fixed-size window (`windowSize` items) centered on
 * the currently selected item. Moving the selection slides the window,
 * keeping the DOM node count bounded regardless of dataset size.
 *
 * Selection is tracked by id (stable across filter/sort transitions)
 * rather than by numeric index, so `setItems()` preserves the user's
 * current game when filters change.
 */

import type { GameEntry } from "../../data/games";

export interface GameListOptions {
  /** Number of items kept in the DOM at once. */
  windowSize?: number;
  /** Height of each item in CSS pixels — used to position items. */
  itemHeight?: number;
}

type Listener = (game: GameEntry, index: number) => void;

export class GameList {
  readonly root: HTMLDivElement;

  private readonly viewport: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly windowSize: number;
  private readonly itemHeight: number;

  private items: readonly GameEntry[] = [];
  private selectedId: string | null = null;
  private readonly selectListeners = new Set<Listener>();
  private readonly changeListeners = new Set<Listener>();

  constructor(container: HTMLElement, options: GameListOptions = {}) {
    this.windowSize = options.windowSize ?? 16;
    this.itemHeight = options.itemHeight ?? 56;

    this.root = document.createElement("div");
    this.root.className = "af-game-list";
    this.root.setAttribute("role", "listbox");
    this.root.setAttribute("aria-label", "Games");

    this.spacer = document.createElement("div");
    this.spacer.className = "af-game-list-spacer";

    this.viewport = document.createElement("div");
    this.viewport.className = "af-game-list-viewport";
    this.viewport.appendChild(this.spacer);

    this.root.appendChild(this.viewport);
    container.appendChild(this.root);
  }

  setItems(items: readonly GameEntry[]): void {
    this.items = items;
    this.spacer.style.height = `${items.length * this.itemHeight}px`;

    if (items.length === 0) {
      this.selectedId = null;
      this.render();
      return;
    }

    // Preserve selection across setItems if the id still exists.
    const stillPresent = this.selectedId !== null && items.some((g) => g.id === this.selectedId);
    if (!stillPresent) this.selectedId = items[0]!.id;
    this.render();
  }

  getItems(): readonly GameEntry[] {
    return this.items;
  }

  getSelectedIndex(): number {
    if (this.selectedId === null) return -1;
    return this.items.findIndex((g) => g.id === this.selectedId);
  }

  getSelectedGame(): GameEntry | null {
    const idx = this.getSelectedIndex();
    return idx === -1 ? null : this.items[idx]!;
  }

  setSelectedIndex(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    const game = this.items[index]!;
    if (this.selectedId === game.id) return;
    this.selectedId = game.id;
    this.render();
    this.fire(this.changeListeners, game, index);
  }

  /** Move selection by ±n. Wraps at the boundaries. */
  moveSelection(delta: number): void {
    if (this.items.length === 0) return;
    const current = Math.max(0, this.getSelectedIndex());
    let next = (current + delta) % this.items.length;
    if (next < 0) next += this.items.length;
    this.setSelectedIndex(next);
  }

  /** Confirms the current selection (user pressed Btn1 / A). */
  confirm(): void {
    const idx = this.getSelectedIndex();
    if (idx === -1) return;
    this.fire(this.selectListeners, this.items[idx]!, idx);
  }

  onSelect(cb: Listener): () => void {
    this.selectListeners.add(cb);
    return () => {
      this.selectListeners.delete(cb);
    };
  }

  onChange(cb: Listener): () => void {
    this.changeListeners.add(cb);
    return () => {
      this.changeListeners.delete(cb);
    };
  }

  /** Testing helper — returns the number of rendered item nodes. */
  getRenderedCount(): number {
    return this.viewport.querySelectorAll(".af-game-list-item").length;
  }

  private render(): void {
    const { start, end } = this.visibleWindow();

    // Remove items that fell outside the window.
    for (const el of Array.from(this.viewport.querySelectorAll<HTMLElement>(".af-game-list-item"))) {
      const idx = Number(el.dataset.index);
      if (idx < start || idx >= end) el.remove();
    }

    // Add/update items inside the window.
    const existing = new Map<number, HTMLElement>();
    for (const el of Array.from(this.viewport.querySelectorAll<HTMLElement>(".af-game-list-item"))) {
      existing.set(Number(el.dataset.index), el);
    }

    for (let i = start; i < end; i++) {
      const game = this.items[i]!;
      let el = existing.get(i);
      if (!el) {
        el = this.createItemElement(game, i);
        this.viewport.appendChild(el);
      } else {
        this.updateItemElement(el, game, i);
      }
    }
  }

  private visibleWindow(): { start: number; end: number } {
    if (this.items.length <= this.windowSize) {
      return { start: 0, end: this.items.length };
    }
    const selected = Math.max(0, this.getSelectedIndex());
    const half = Math.floor(this.windowSize / 2);
    let start = selected - half;
    if (start < 0) start = 0;
    let end = start + this.windowSize;
    if (end > this.items.length) {
      end = this.items.length;
      start = end - this.windowSize;
    }
    return { start, end };
  }

  private createItemElement(game: GameEntry, index: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "af-game-list-item";
    el.dataset.index = String(index);
    el.dataset.gameId = game.id;
    el.setAttribute("role", "option");
    this.updateItemElement(el, game, index);
    return el;
  }

  private updateItemElement(el: HTMLElement, game: GameEntry, index: number): void {
    el.dataset.index = String(index);
    el.dataset.gameId = game.id;
    el.style.top = `${index * this.itemHeight}px`;
    el.setAttribute("aria-selected", game.id === this.selectedId ? "true" : "false");
    el.classList.toggle("selected", game.id === this.selectedId);
    el.textContent = "";

    if (game.favorite) {
      const star = document.createElement("span");
      star.className = "af-game-list-favorite";
      star.setAttribute("aria-hidden", "true");
      star.textContent = "★";
      el.appendChild(star);
    }

    const title = document.createElement("span");
    title.className = "af-game-list-title";
    title.textContent = game.title;
    el.appendChild(title);

    const badge = document.createElement("span");
    badge.className = `af-badge af-badge--${game.system}`;
    badge.textContent = game.system === "cps1" ? "CPS-1" : "Neo-Geo";
    el.appendChild(badge);
  }

  private fire(listeners: Set<Listener>, game: GameEntry, index: number): void {
    for (const l of listeners) l(game, index);
  }
}
