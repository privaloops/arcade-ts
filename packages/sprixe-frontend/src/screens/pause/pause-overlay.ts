/**
 * PauseOverlay — in-game pause menu (§2.6).
 *
 * Triggered by coin-hold (Phase 2.6) or the phone remote's Pause
 * button (Phase 3). Pauses the emulator immediately (CPUs + audio),
 * renders the last frame behind a dark overlay, and offers the
 * four actions called out in the UX spec:
 *
 *   Resume         — close and continue
 *   Save State     — Phase 2.9 wires the slot picker
 *   Load State     — ditto
 *   Quit to Menu   — Phase 2.8 wires the transition back to browser
 *
 * The overlay is a focus trap: Tab cycles only within the menu, and
 * the menu starts focused on the first item (Resume) so gamepad users
 * land on the right action. Escape is a keyboard shortcut for Resume.
 */

import type { NavAction } from "../../input/gamepad-nav";
import type { SettingsStore } from "../settings/settings-store";

/** Minimal surface the overlay needs from the emulator. */
export interface EmulatorHandle {
  pause(): void;
  resume(): void;
  isPaused?(): boolean;
  /**
   * Optional snapshot hooks. saveState is async because the engine has
   * to drain its Web Audio Worker state before it can return a frozen
   * copy. Runners that don't support snapshots yet (Neo-Geo) omit both.
   */
  saveState?(): Promise<ArrayBuffer | null>;
  loadState?(data: ArrayBuffer): boolean;
}

export type PauseAction = "resume" | "save-state" | "load-state" | "quit";

export interface PauseOverlayOptions {
  emulator: EmulatorHandle;
  onResume?: () => void;
  onQuit?: () => void;
  onSaveState?: () => void;
  onLoadState?: () => void;
  /** Phase 4b.4: when provided, the overlay shows a volume slider
   * bound to settings.audio.masterVolume. */
  settings?: SettingsStore;
  /** Override the menu entries. Mostly for tests. */
  actions?: readonly { action: PauseAction; label: string }[];
}

const DEFAULT_ACTIONS: readonly { action: PauseAction; label: string }[] = [
  { action: "resume",     label: "Resume" },
  { action: "save-state", label: "Save State" },
  { action: "load-state", label: "Load State" },
  { action: "quit",       label: "Quit to Menu" },
];

export class PauseOverlay {
  readonly root: HTMLDivElement;

  private readonly emulator: EmulatorHandle;
  private readonly actions: readonly { action: PauseAction; label: string }[];
  private readonly onResume: (() => void) | undefined;
  private readonly onQuit: (() => void) | undefined;
  private readonly onSaveState: (() => void) | undefined;
  private readonly onLoadState: (() => void) | undefined;
  private readonly settings: SettingsStore | undefined;
  private volumeSlider: HTMLInputElement | null = null;
  private settingsUnsub: (() => void) | null = null;

  private readonly itemEls: HTMLElement[] = [];
  private selectedIndex = 0;
  private opened = false;
  private readonly keydownHandler: (event: KeyboardEvent) => void;
  private readonly keyboardTrapHandler: (event: KeyboardEvent) => void;

  constructor(container: HTMLElement, options: PauseOverlayOptions) {
    this.emulator = options.emulator;
    this.actions = options.actions ?? DEFAULT_ACTIONS;
    this.onResume = options.onResume;
    this.onQuit = options.onQuit;
    this.onSaveState = options.onSaveState;
    this.onLoadState = options.onLoadState;
    this.settings = options.settings;

    this.root = document.createElement("div");
    this.root.className = "af-pause-overlay";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Paused");
    this.root.setAttribute("data-testid", "pause-overlay");
    this.root.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "af-pause-backdrop";
    this.root.appendChild(backdrop);

    const dialog = document.createElement("div");
    dialog.className = "af-pause-dialog";
    this.root.appendChild(dialog);

    const title = document.createElement("h2");
    title.className = "af-pause-title";
    title.textContent = "PAUSED";
    dialog.appendChild(title);

    const list = document.createElement("ul");
    list.className = "af-pause-list";
    for (const { action, label } of this.actions) {
      const li = document.createElement("li");
      li.className = "af-pause-item";
      li.setAttribute("role", "menuitem");
      li.setAttribute("tabindex", "0");
      li.dataset.action = action;
      li.textContent = label;
      li.addEventListener("click", () => this.activate(action));
      list.appendChild(li);
      this.itemEls.push(li);
    }
    dialog.appendChild(list);

    if (this.settings) {
      const volRow = document.createElement("div");
      volRow.className = "af-pause-volume";
      volRow.setAttribute("data-testid", "pause-volume");
      const label = document.createElement("label");
      label.className = "af-pause-volume-label";
      label.textContent = "Volume";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "100";
      slider.value = String(this.settings.get().audio.masterVolume);
      slider.className = "af-pause-volume-slider";
      slider.setAttribute("data-testid", "pause-volume-slider");
      slider.addEventListener("input", () => {
        const v = Number(slider.value);
        this.settings!.update({ audio: { masterVolume: v } });
      });
      label.appendChild(slider);
      volRow.appendChild(label);
      dialog.appendChild(volRow);
      this.volumeSlider = slider;
      this.settingsUnsub = this.settings.onChange((s) => {
        const value = String(s.audio.masterVolume);
        if (slider.value !== value) slider.value = value;
      });
    }

    container.appendChild(this.root);
    this.refreshSelection();

    this.keydownHandler = (event: KeyboardEvent) => {
      if (!this.opened) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.activate("resume");
      }
    };
    this.keyboardTrapHandler = (event: KeyboardEvent) => {
      if (!this.opened) return;
      if (event.key !== "Tab") return;
      event.preventDefault();
      this.moveSelection(event.shiftKey ? -1 : 1);
    };
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.root.hidden = false;
    this.selectedIndex = 0;
    this.refreshSelection();
    this.emulator.pause();
    window.addEventListener("keydown", this.keydownHandler);
    window.addEventListener("keydown", this.keyboardTrapHandler);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.emulator.resume();
    window.removeEventListener("keydown", this.keydownHandler);
    window.removeEventListener("keydown", this.keyboardTrapHandler);
  }

  /** Tear down subscriptions — call before removing root from the DOM. */
  dispose(): void {
    this.settingsUnsub?.();
    this.settingsUnsub = null;
  }

  isOpen(): boolean {
    return this.opened;
  }

  getSelectedAction(): PauseAction {
    return this.actions[this.selectedIndex]!.action;
  }

  handleNavAction(action: NavAction): boolean {
    if (!this.opened) return false;
    switch (action) {
      case "up":
        this.moveSelection(-1);
        return true;
      case "down":
        this.moveSelection(1);
        return true;
      case "left":
        this.adjustVolume(-5);
        return true;
      case "right":
        this.adjustVolume(5);
        return true;
      case "confirm":
        this.activate(this.getSelectedAction());
        return true;
      case "back":
      case "coin-hold":
        this.activate("resume");
        return true;
      default:
        return false;
    }
  }

  /**
   * Nudge the master volume in 5 % increments. The slider fires the
   * same 'input' event browsers emit on keyboard arrows, so the
   * SettingsStore subscriber persists the new value just like a drag.
   */
  private adjustVolume(delta: number): void {
    if (!this.volumeSlider) return;
    const current = Number(this.volumeSlider.value) || 0;
    const next = Math.max(0, Math.min(100, current + delta));
    if (next === current) return;
    this.volumeSlider.value = String(next);
    this.volumeSlider.dispatchEvent(new Event("input", { bubbles: true }));
  }

  private moveSelection(delta: number): void {
    const len = this.actions.length;
    this.selectedIndex = (this.selectedIndex + delta + len) % len;
    this.refreshSelection();
  }

  private refreshSelection(): void {
    this.itemEls.forEach((el, i) => {
      const selected = i === this.selectedIndex;
      el.classList.toggle("selected", selected);
      el.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) el.focus({ preventScroll: true });
    });
  }

  private activate(action: PauseAction): void {
    switch (action) {
      case "resume":
        this.close();
        this.onResume?.();
        return;
      case "save-state":
        this.onSaveState?.();
        return;
      case "load-state":
        this.onLoadState?.();
        return;
      case "quit":
        // Close the overlay first so onQuit handlers can mount a
        // fresh screen on top of a clean DOM.
        this.close();
        this.onQuit?.();
        return;
    }
  }
}
