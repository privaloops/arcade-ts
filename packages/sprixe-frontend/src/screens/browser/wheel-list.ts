/**
 * WheelList — HyperSpin-style vertical wheel of games.
 *
 * Renders a curved cylinder of game logos (reusing the ArcadeDB marquee
 * as wheel art). Each DOM node is keyed by game index so items keep
 * their identity as they slide past the centre — only the transform
 * changes on navigation, which gives the true "wheel rolling" feel.
 *
 * Only a small window (±visibleRadius) lives in the DOM regardless of
 * catalogue size. Large catalogues wrap around so navigating past the
 * last entry continues at the first.
 */

import type { GameEntry } from "../../data/games";
import type { PreviewLoader } from "../../media/preview-loader";

export interface WheelListOptions {
  loader: PreviewLoader;
  /** Items on each side of the centre (default 4 → 9 visible). */
  visibleRadius?: number;
  /** Angular step between items, in degrees (default 15). */
  angleStep?: number;
  /** Cylinder radius in px — distance from rotation axis (default 520). */
  radius?: number;
}

type Listener = (game: GameEntry, index: number) => void;

export class WheelList {
  readonly root: HTMLDivElement;

  private readonly stage: HTMLDivElement;
  private readonly loader: PreviewLoader;
  private readonly visibleRadius: number;
  private readonly angleStep: number;
  private readonly radius: number;

  private items: readonly GameEntry[] = [];
  private selectedId: string | null = null;
  private readonly selectListeners = new Set<Listener>();
  private readonly changeListeners = new Set<Listener>();

  constructor(container: HTMLElement, options: WheelListOptions) {
    this.loader = options.loader;
    this.visibleRadius = options.visibleRadius ?? 5;
    this.angleStep = options.angleStep ?? 14;
    this.radius = options.radius ?? 380;

    this.root = document.createElement("div");
    this.root.className = "af-wheel";
    this.root.setAttribute("role", "listbox");
    this.root.setAttribute("aria-label", "Games");

    this.stage = document.createElement("div");
    this.stage.className = "af-wheel-stage";
    this.root.appendChild(this.stage);

    container.appendChild(this.root);
  }

  setItems(items: readonly GameEntry[]): void {
    this.items = items;
    if (items.length === 0) {
      this.selectedId = null;
      this.render();
      return;
    }
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

  confirm(): void {
    const idx = this.getSelectedIndex();
    if (idx === -1) return;
    this.fire(this.selectListeners, this.items[idx]!, idx);
  }

  onSelect(cb: Listener): () => void {
    this.selectListeners.add(cb);
    return () => { this.selectListeners.delete(cb); };
  }

  onChange(cb: Listener): () => void {
    this.changeListeners.add(cb);
    return () => { this.changeListeners.delete(cb); };
  }

  /** Testing helper — number of .af-wheel-item nodes in the DOM. */
  getRenderedCount(): number {
    return this.stage.querySelectorAll(".af-wheel-item").length;
  }

  private render(): void {
    const n = this.items.length;
    if (n === 0) {
      for (const el of Array.from(this.stage.querySelectorAll(".af-wheel-item"))) el.remove();
      return;
    }

    const selected = Math.max(0, this.getSelectedIndex());
    const radius = this.visibleRadius;
    const shouldWrap = n > 2 * radius + 1;

    // Desired: index → delta (signed distance from centre). For small
    // catalogues the window may collide with itself; keep the nearest
    // delta so the item stays closest to centre where it's most legible.
    const desired = new Map<number, number>();
    for (let d = -radius; d <= radius; d++) {
      let idx = selected + d;
      if (shouldWrap) {
        idx = ((idx % n) + n) % n;
      } else if (idx < 0 || idx >= n) {
        continue;
      }
      const existing = desired.get(idx);
      if (existing === undefined || Math.abs(d) < Math.abs(existing)) {
        desired.set(idx, d);
      }
    }

    // Diff against the DOM — keyed by gameId so insertions/reorders
    // (e.g. after a phone upload re-sorts the catalogue) carry each
    // node's content with it instead of recycling stale marquee/title
    // into a different game's slot.
    const existingNodes = new Map<string, HTMLElement>();
    for (const el of Array.from(this.stage.querySelectorAll<HTMLElement>(".af-wheel-item"))) {
      const id = el.dataset.gameId;
      if (id) existingNodes.set(id, el);
    }

    const desiredGameIds = new Set<string>();
    for (const idx of desired.keys()) desiredGameIds.add(this.items[idx]!.id);

    for (const [gameId, el] of existingNodes) {
      if (!desiredGameIds.has(gameId)) el.remove();
    }

    for (const [idx, delta] of desired) {
      const game = this.items[idx]!;
      let el = existingNodes.get(game.id);
      if (!el) {
        el = this.createItem(game, idx);
        this.stage.appendChild(el);
      } else {
        el.dataset.index = String(idx);
      }
      this.positionItem(el, delta);
    }
  }

  private positionItem(el: HTMLElement, delta: number): void {
    const angle = delta * this.angleStep;
    const absDelta = Math.abs(delta);
    const opacity = Math.max(0, 1 - absDelta * 0.18);
    const scale = 1 - Math.min(0.3, absDelta * 0.08);
    // With `transform-style: preserve-3d` on the stage, the browser
    // z-sorts children by their actual 3D position, not z-index. Pushing
    // the selected plate further along Z makes it sit clearly in front
    // of its neighbours so they visually pass behind instead of through.
    const popZ = delta === 0 ? 60 : 0;
    // Shift items right so the projected width of the selected plate
    // (scaled up by perspective + popZ) never bleeds into the media
    // pane on the left. Padding on the wheel-pane has no effect because
    // perspective ignores block-level layout.
    const SHIFT_X = 10;
    el.style.transform = `translate(calc(-50% + ${SHIFT_X}px), -50%) rotateX(${-angle}deg) translateZ(${this.radius + popZ}px) scale(${scale})`;
    el.style.opacity = String(opacity);
    el.style.zIndex = String(100 - absDelta);
    el.classList.toggle("selected", delta === 0);
    el.setAttribute("aria-selected", delta === 0 ? "true" : "false");
  }

  private createItem(game: GameEntry, index: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "af-wheel-item";
    el.dataset.index = String(index);
    el.dataset.gameId = game.id;
    el.setAttribute("role", "option");

    const logo = document.createElement("img");
    logo.className = "af-wheel-item-logo";
    logo.alt = "";
    logo.addEventListener("load", () => el.classList.add("has-logo"));
    el.appendChild(logo);

    const title = document.createElement("div");
    title.className = "af-wheel-item-title";
    title.textContent = game.title;
    el.appendChild(title);

    // Resolve the marquee through the IDB cache (hits first, fetches
    // via /arcadedb proxy on miss). Guarded against the item being
    // recycled for a different game before the promise resolves.
    const candidates = this.loader.marqueeCandidates(game.id, game.system);
    const cacheKey = this.loader.cacheKey(game.id, "marquee");
    void this.loader
      .getCachedOrFetchImage(cacheKey, candidates)
      .then((url) => {
        if (el.dataset.gameId !== game.id) return;
        if (url) logo.src = url;
      });

    return el;
  }

  private fire(listeners: Set<Listener>, game: GameEntry, index: number): void {
    for (const l of listeners) l(game, index);
  }
}
