/**
 * Toast — transient on-screen notifications for the kiosk (§3.10).
 *
 * Queue caps at 3 visible entries; oldest vanishes when a fourth
 * arrives. Duration defaults per type:
 *   info    — 3 s
 *   success — 4 s
 *   error   — 6 s
 * Dismissal: automatic after the type duration, or manual via the
 * per-toast ✕ button. Consecutive duplicates (same message + type)
 * are collapsed — showing the same error twice in a row would just
 * noise the screen without conveying new information.
 */

export type ToastType = "info" | "success" | "error";

export interface ToastEntry {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

export interface ToastOptions {
  /** Max visible toasts. Default 3. */
  maxVisible?: number;
  /** Override per-type durations. */
  durations?: Partial<Record<ToastType, number>>;
  /** Injected for deterministic tests. Defaults to Date.now(). */
  now?: () => number;
  /** Injected for deterministic tests. Defaults to setTimeout. */
  setTimer?: (cb: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  info: 3000,
  success: 4000,
  error: 6000,
};

let nextToastId = 0;

export class Toast {
  readonly root: HTMLDivElement;

  private readonly maxVisible: number;
  private readonly durations: Record<ToastType, number>;
  private readonly now: () => number;
  private readonly setTimer: (cb: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;

  private readonly entries: ToastEntry[] = [];
  private readonly timers = new Map<string, number>();
  private lastEntry: { type: ToastType; message: string } | null = null;

  constructor(container: HTMLElement, options: ToastOptions = {}) {
    this.maxVisible = options.maxVisible ?? 3;
    this.durations = { ...DEFAULT_DURATIONS, ...options.durations };
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((cb, ms) => window.setTimeout(cb, ms) as unknown as number);
    this.clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));

    this.root = document.createElement("div");
    this.root.className = "af-toast-stack";
    this.root.setAttribute("data-testid", "toast-stack");
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
    container.appendChild(this.root);
  }

  /**
   * Show a new toast. Returns the entry id (useful for manual dismiss
   * in tests). Returns null when the toast is suppressed as a
   * consecutive duplicate.
   */
  show(type: ToastType, message: string): string | null {
    if (this.lastEntry && this.lastEntry.type === type && this.lastEntry.message === message) {
      return null;
    }
    const entry: ToastEntry = {
      id: `toast-${++nextToastId}`,
      type,
      message,
      createdAt: this.now(),
    };
    this.entries.push(entry);
    this.lastEntry = { type, message };

    // Cap the visible queue — oldest evicted first.
    while (this.entries.length > this.maxVisible) {
      const evicted = this.entries.shift()!;
      this.clearTimerFor(evicted.id);
    }

    const timerId = this.setTimer(() => this.dismiss(entry.id), this.durations[type]);
    this.timers.set(entry.id, timerId);
    this.render();
    return entry.id;
  }

  /** Manually dismiss a toast by id. No-op on unknown ids. */
  dismiss(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    this.entries.splice(idx, 1);
    this.clearTimerFor(id);
    this.render();
    return true;
  }

  /** Clear every toast — used on screen transitions. */
  clearAll(): void {
    for (const id of Array.from(this.timers.keys())) this.clearTimerFor(id);
    this.entries.length = 0;
    this.lastEntry = null;
    this.render();
  }

  /** Testing helper — current queue snapshot. */
  getEntries(): readonly ToastEntry[] {
    return this.entries;
  }

  private clearTimerFor(id: string): void {
    const timerId = this.timers.get(id);
    if (timerId !== undefined) {
      this.clearTimer(timerId);
      this.timers.delete(id);
    }
  }

  private render(): void {
    this.root.textContent = "";
    for (const entry of this.entries) {
      const el = document.createElement("div");
      el.className = `af-toast af-toast--${entry.type}`;
      el.dataset.toastId = entry.id;
      el.dataset.type = entry.type;
      el.setAttribute("data-testid", "toast");

      const msg = document.createElement("span");
      msg.className = "af-toast-message";
      msg.textContent = entry.message;
      el.appendChild(msg);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "af-toast-close";
      close.setAttribute("aria-label", "Dismiss");
      close.setAttribute("data-testid", "toast-close");
      close.textContent = "✕";
      close.addEventListener("click", () => this.dismiss(entry.id));
      el.appendChild(close);

      this.root.appendChild(el);
    }
  }
}
