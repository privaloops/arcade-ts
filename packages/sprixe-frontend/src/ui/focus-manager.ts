/**
 * FocusManager — spatial navigation for menu grids.
 *
 * Items declare their (row, col) position; the manager resolves UP/DOWN/
 * LEFT/RIGHT against the set of currently registered items. The grid can
 * be sparse (no item at (r,c) is fine) — navigation picks the nearest
 * item on the perpendicular axis when the exact target is missing.
 *
 * Wrap is opt-in per direction via `options.wrap`:
 *   - false (default): edges block, move() returns false.
 *   - true: off-grid moves re-enter from the opposite edge.
 *
 * This module is pure logic; it does not touch the DOM. Screen-specific
 * UI (game browser, settings) reads `getFocusedId()` to apply visual
 * highlight. `focusedEl` is exposed purely as a convenience for callers
 * that want to call HTMLElement.focus() / scrollIntoView().
 */

export type Direction = "up" | "down" | "left" | "right";

export interface FocusableItem {
  id: string;
  row: number;
  col: number;
  el?: HTMLElement;
}

export interface FocusManagerOptions {
  wrap?: boolean;
  /** id to focus initially. Falls back to the first registered item. */
  initial?: string;
}

type Listener = (id: string | null) => void;

export class FocusManager {
  private items: FocusableItem[] = [];
  private focusedId: string | null = null;
  private readonly wrap: boolean;
  private readonly listeners = new Set<Listener>();

  constructor(items: FocusableItem[] = [], options: FocusManagerOptions = {}) {
    this.wrap = options.wrap ?? false;
    this.setItems(items, options.initial);
  }

  /** Replace the registered items. Preserves focus when possible. */
  setItems(items: FocusableItem[], preferredInitial?: string): void {
    this.items = [...items];
    if (this.items.length === 0) {
      this.setFocus(null);
      return;
    }
    const targetId = preferredInitial ?? this.focusedId ?? this.items[0]!.id;
    const match = this.items.find((i) => i.id === targetId);
    this.setFocus(match ? match.id : this.items[0]!.id);
  }

  getFocusedId(): string | null {
    return this.focusedId;
  }

  getFocusedItem(): FocusableItem | null {
    if (this.focusedId === null) return null;
    return this.items.find((i) => i.id === this.focusedId) ?? null;
  }

  setFocus(id: string | null): void {
    if (id === null) {
      if (this.focusedId !== null) {
        this.focusedId = null;
        this.emit(null);
      }
      return;
    }
    if (!this.items.some((i) => i.id === id)) return;
    if (this.focusedId === id) return;
    this.focusedId = id;
    this.emit(id);
  }

  /** Move focus in the given direction. Returns true if focus actually moved. */
  move(direction: Direction): boolean {
    const current = this.getFocusedItem();
    if (!current) return false;

    const candidate = this.findNeighbor(current, direction);
    if (candidate) {
      this.setFocus(candidate.id);
      return true;
    }
    if (!this.wrap) return false;

    const wrapped = this.findWrapAround(current, direction);
    if (wrapped && wrapped.id !== current.id) {
      this.setFocus(wrapped.id);
      return true;
    }
    return false;
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private findNeighbor(from: FocusableItem, direction: Direction): FocusableItem | null {
    // Select items strictly "beyond" the current position along the
    // primary axis. Tie-break by smallest step on primary axis then by
    // smallest perpendicular distance (closest column for vertical
    // moves, closest row for horizontal).
    type Scored = { item: FocusableItem; primary: number; perp: number };
    const candidates: Scored[] = [];
    for (const item of this.items) {
      if (item.id === from.id) continue;
      switch (direction) {
        case "up":
          if (item.row < from.row) candidates.push({ item, primary: from.row - item.row, perp: Math.abs(item.col - from.col) });
          break;
        case "down":
          if (item.row > from.row) candidates.push({ item, primary: item.row - from.row, perp: Math.abs(item.col - from.col) });
          break;
        case "left":
          if (item.col < from.col) candidates.push({ item, primary: from.col - item.col, perp: Math.abs(item.row - from.row) });
          break;
        case "right":
          if (item.col > from.col) candidates.push({ item, primary: item.col - from.col, perp: Math.abs(item.row - from.row) });
          break;
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.primary - b.primary || a.perp - b.perp);
    return candidates[0]!.item;
  }

  private findWrapAround(from: FocusableItem, direction: Direction): FocusableItem | null {
    // Pick the item furthest along the opposite edge, nearest on the perp axis.
    type Scored = { item: FocusableItem; primary: number; perp: number };
    const candidates: Scored[] = [];
    for (const item of this.items) {
      if (item.id === from.id) continue;
      switch (direction) {
        case "up":
          // Wrap: pick the item with the greatest row (bottom of grid).
          candidates.push({ item, primary: -item.row, perp: Math.abs(item.col - from.col) });
          break;
        case "down":
          candidates.push({ item, primary: item.row, perp: Math.abs(item.col - from.col) });
          break;
        case "left":
          candidates.push({ item, primary: -item.col, perp: Math.abs(item.row - from.row) });
          break;
        case "right":
          candidates.push({ item, primary: item.col, perp: Math.abs(item.row - from.row) });
          break;
      }
    }
    if (candidates.length === 0) return null;
    // Sort: most extreme primary position first, then closest perpendicular.
    candidates.sort((a, b) => a.primary - b.primary || a.perp - b.perp);
    return candidates[0]!.item;
  }

  private emit(id: string | null): void {
    for (const l of this.listeners) l(id);
  }
}
