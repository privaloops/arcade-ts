/**
 * HintsBar — bottom-of-screen contextual hint strip.
 *
 * Tells the player what each physical button does in the current context
 * (§2.4). Each context declares a list of hints; hints whose action is
 * disabled via `setEnabled(action, false)` vanish entirely — we do NOT
 * render greyed-out hints because cluttering the bar with noise defeats
 * the whole purpose of the strip.
 *
 * Labels are read from `buttonLabels` so downstream code can swap the
 * label set when the input profile changes (arcade encoder → Xbox pad →
 * I-PAC keyboard). Phase 1 ships a single gamepad-standard profile.
 */

import type { NavAction } from "../input/gamepad-nav";

export type HintContext = "browser" | "paused" | "modal-open";

export interface Hint {
  action: NavAction;
  label: string;
}

export type ButtonLabels = Partial<Record<NavAction, string>>;

export const STANDARD_LABELS: ButtonLabels = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  confirm: "Btn1",
  back: "Btn2",
  favorite: "Btn4",
  settings: "Start",
  "bumper-left": "LB",
  "bumper-right": "RB",
  "coin-hold": "Coin-hold",
};

export const CONTEXT_HINTS: Record<HintContext, readonly Hint[]> = {
  browser: [
    { action: "down", label: "Navigate" },
    { action: "confirm", label: "Play" },
    { action: "favorite", label: "Favorite" },
    { action: "bumper-right", label: "A-Z" },
    { action: "settings", label: "Settings" },
  ],
  paused: [
    { action: "down", label: "Navigate" },
    { action: "confirm", label: "Select" },
    { action: "coin-hold", label: "Resume" },
  ],
  "modal-open": [
    { action: "confirm", label: "OK" },
    { action: "back", label: "Cancel" },
  ],
};

export interface HintsBarOptions {
  labels?: ButtonLabels;
}

export class HintsBar {
  readonly root: HTMLDivElement;

  private labels: ButtonLabels;
  private context: HintContext = "browser";
  private disabled = new Set<NavAction>();

  constructor(container: HTMLElement, options: HintsBarOptions = {}) {
    this.labels = { ...STANDARD_LABELS, ...options.labels };

    this.root = document.createElement("div");
    this.root.className = "af-hints-bar";
    this.root.setAttribute("role", "toolbar");
    this.root.setAttribute("aria-label", "Button hints");
    this.root.setAttribute("data-testid", "hints-bar");
    container.appendChild(this.root);

    this.render();
  }

  setContext(ctx: HintContext): void {
    if (ctx === this.context) return;
    this.context = ctx;
    this.render();
  }

  getContext(): HintContext {
    return this.context;
  }

  setEnabled(action: NavAction, enabled: boolean): void {
    if (enabled) {
      if (!this.disabled.has(action)) return;
      this.disabled.delete(action);
    } else {
      if (this.disabled.has(action)) return;
      this.disabled.add(action);
    }
    this.render();
  }

  isEnabled(action: NavAction): boolean {
    return !this.disabled.has(action);
  }

  setLabels(labels: ButtonLabels): void {
    this.labels = { ...STANDARD_LABELS, ...labels };
    this.render();
  }

  /** Testing helper — returns the list of visible hint entries. */
  getVisibleHints(): { action: NavAction; button: string; label: string }[] {
    const hints = CONTEXT_HINTS[this.context];
    return hints
      .filter((h) => !this.disabled.has(h.action))
      .map((h) => ({ action: h.action, button: this.labels[h.action] ?? "?", label: h.label }));
  }

  private render(): void {
    this.root.textContent = "";
    for (const hint of this.getVisibleHints()) {
      const el = document.createElement("span");
      el.className = "af-hint";
      el.dataset.action = hint.action;

      const button = document.createElement("span");
      button.className = "af-hint-button";
      button.textContent = `[${hint.button}]`;

      const label = document.createElement("span");
      label.className = "af-hint-label";
      label.textContent = hint.label;

      el.appendChild(button);
      el.appendChild(label);
      this.root.appendChild(el);
    }
  }
}
