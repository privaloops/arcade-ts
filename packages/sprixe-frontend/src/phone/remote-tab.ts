/**
 * RemoteTab — Remote section of the phone page (§2.7).
 *
 * Exposes pause/resume/save/load/quit/volume controls mapped onto
 * the PhoneToKioskMessage protocol's `cmd` messages. Buttons that
 * don't make sense in the current kiosk state are disabled rather
 * than hidden — the Grid layout stays stable between transitions.
 *
 * Volume slider input fires a debounced 'cmd volume' so a dragging
 * user doesn't flood the data channel at input-event rate.
 */

import type { PhoneToKioskMessage } from "../p2p/protocol";

export type KioskState = "browser" | "playing" | "paused";

export type Command = Extract<PhoneToKioskMessage, { type: "cmd" }>;

export interface RemoteTabOptions {
  onCommand: (cmd: Command) => void;
  /** Milliseconds to debounce volume slider events. Defaults to 50. */
  volumeDebounceMs?: number;
}

export interface SlotInfo {
  slot: number;
  ts: number;
}

export class RemoteTab {
  readonly root: HTMLDivElement;

  private readonly onCommand: (cmd: Command) => void;
  private readonly volumeDebounceMs: number;

  private readonly pauseBtn: HTMLButtonElement;
  private readonly resumeBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly loadBtn: HTMLButtonElement;
  private readonly quitBtn: HTMLButtonElement;
  private readonly volumeEl: HTMLInputElement;
  private readonly volumeReadoutEl: HTMLSpanElement;
  private readonly slotPickerEl: HTMLDivElement;
  private readonly stateReadoutEl: HTMLDivElement;

  private kioskState: KioskState = "browser";
  private selectedSlot = 0;
  private volumeTimer: number | null = null;

  constructor(container: HTMLElement, options: RemoteTabOptions) {
    this.onCommand = options.onCommand;
    this.volumeDebounceMs = options.volumeDebounceMs ?? 50;

    this.root = document.createElement("div");
    this.root.className = "af-remote-tab";
    this.root.setAttribute("data-testid", "remote-tab");

    this.stateReadoutEl = document.createElement("div");
    this.stateReadoutEl.className = "af-remote-state";
    this.stateReadoutEl.setAttribute("data-testid", "remote-state");
    this.root.appendChild(this.stateReadoutEl);

    const controlGrid = document.createElement("div");
    controlGrid.className = "af-remote-grid";
    this.root.appendChild(controlGrid);

    this.pauseBtn = this.makeButton(controlGrid, "⏸ Pause", "remote-pause", () =>
      this.emit({ type: "cmd", action: "pause" })
    );
    this.resumeBtn = this.makeButton(controlGrid, "▶ Resume", "remote-resume", () =>
      this.emit({ type: "cmd", action: "resume" })
    );
    this.saveBtn = this.makeButton(controlGrid, "💾 Save", "remote-save", () =>
      this.emit({ type: "cmd", action: "save", payload: { slot: this.selectedSlot } })
    );
    this.loadBtn = this.makeButton(controlGrid, "📂 Load", "remote-load", () =>
      this.emit({ type: "cmd", action: "load", payload: { slot: this.selectedSlot } })
    );
    this.quitBtn = this.makeButton(controlGrid, "🚪 Quit", "remote-quit", () =>
      this.emit({ type: "cmd", action: "quit" })
    );

    this.slotPickerEl = document.createElement("div");
    this.slotPickerEl.className = "af-remote-slots";
    this.slotPickerEl.setAttribute("data-testid", "remote-slots");
    this.root.appendChild(this.slotPickerEl);
    for (let i = 0; i < 4; i++) this.appendSlot(i);

    const volumeRow = document.createElement("div");
    volumeRow.className = "af-remote-volume";
    const label = document.createElement("label");
    label.className = "af-remote-volume-label";
    label.textContent = "Volume";
    volumeRow.appendChild(label);

    this.volumeEl = document.createElement("input");
    this.volumeEl.type = "range";
    this.volumeEl.min = "0";
    this.volumeEl.max = "100";
    this.volumeEl.value = "80";
    this.volumeEl.setAttribute("data-testid", "remote-volume");
    this.volumeEl.addEventListener("input", () => this.scheduleVolume(Number(this.volumeEl.value)));
    volumeRow.appendChild(this.volumeEl);

    this.volumeReadoutEl = document.createElement("span");
    this.volumeReadoutEl.className = "af-remote-volume-readout";
    this.volumeReadoutEl.setAttribute("data-testid", "remote-volume-readout");
    this.volumeReadoutEl.textContent = "80";
    volumeRow.appendChild(this.volumeReadoutEl);

    this.root.appendChild(volumeRow);

    container.appendChild(this.root);
    this.setKioskState("browser");
    this.selectSlot(0);
  }

  setKioskState(state: KioskState): void {
    this.kioskState = state;
    this.stateReadoutEl.textContent = `Kiosk: ${state}`;
    this.stateReadoutEl.dataset.state = state;

    const inGame = state !== "browser";
    this.saveBtn.disabled = !inGame;
    this.loadBtn.disabled = !inGame;
    this.quitBtn.disabled = !inGame;

    // Toggle pause/resume visually; both buttons stay mounted so the
    // grid layout stays stable across transitions.
    this.pauseBtn.disabled = state !== "playing";
    this.resumeBtn.disabled = state !== "paused";
  }

  setVolume(level: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    this.volumeEl.value = String(clamped);
    this.volumeReadoutEl.textContent = String(clamped);
  }

  setSaveSlots(slots: readonly SlotInfo[]): void {
    const slotToTs = new Map<number, number>();
    for (const s of slots) slotToTs.set(s.slot, s.ts);
    const buttons = this.slotPickerEl.querySelectorAll<HTMLButtonElement>(".af-remote-slot");
    for (const btn of Array.from(buttons)) {
      const slot = Number(btn.dataset.slot);
      const ts = slotToTs.get(slot);
      btn.setAttribute("data-populated", ts !== undefined && ts > 0 ? "true" : "false");
      btn.title = ts !== undefined && ts > 0 ? new Date(ts).toLocaleString() : "Empty";
    }
  }

  getKioskState(): KioskState {
    return this.kioskState;
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  /** Flushes any pending debounced volume emit. Used on page unload. */
  flushVolume(): void {
    if (this.volumeTimer !== null) {
      clearTimeout(this.volumeTimer);
      this.volumeTimer = null;
      this.emit({ type: "cmd", action: "volume", payload: { level: Number(this.volumeEl.value) } });
    }
  }

  private appendSlot(slot: number): void {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "af-remote-slot";
    btn.dataset.slot = String(slot);
    btn.setAttribute("data-testid", `remote-slot-${slot}`);
    btn.textContent = `${slot + 1}`;
    btn.addEventListener("click", () => this.selectSlot(slot));
    this.slotPickerEl.appendChild(btn);
  }

  private selectSlot(slot: number): void {
    this.selectedSlot = slot;
    for (const btn of Array.from(this.slotPickerEl.querySelectorAll<HTMLButtonElement>(".af-remote-slot"))) {
      const s = Number(btn.dataset.slot);
      btn.classList.toggle("selected", s === slot);
    }
  }

  private makeButton(
    parent: HTMLElement,
    label: string,
    testId: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "af-remote-btn";
    btn.textContent = label;
    btn.setAttribute("data-testid", testId);
    btn.addEventListener("click", onClick);
    parent.appendChild(btn);
    return btn;
  }

  private scheduleVolume(level: number): void {
    this.volumeReadoutEl.textContent = String(level);
    if (this.volumeTimer !== null) {
      clearTimeout(this.volumeTimer);
    }
    this.volumeTimer = window.setTimeout(() => {
      this.volumeTimer = null;
      this.emit({ type: "cmd", action: "volume", payload: { level } });
    }, this.volumeDebounceMs);
  }

  private emit(cmd: Command): void {
    this.onCommand(cmd);
  }
}
