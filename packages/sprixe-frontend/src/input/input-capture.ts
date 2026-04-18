/**
 * InputCapture — watch the Gamepad API + keyboard for the first
 * "meaningful" input event and surface it as an InputBinding.
 *
 * Gamepad detection:
 *   - Button: pressed transitions from false → true.
 *   - Axis: magnitude crosses the AXIS_DEADZONE (0.3) away from center.
 *
 * Keyboard fallback:
 *   - Any keydown event triggers with the KeyboardEvent.code (e.g.
 *     "KeyA", "ArrowUp"). This is how I-PAC and similar USB encoders
 *     present themselves when no real gamepad is plugged in.
 *
 * The capture auto-arms on start() and fires exactly once per capture
 * cycle. Callers reset state with start() between prompts.
 */

import type { InputBinding } from "./mapping-store";

export const AXIS_DEADZONE = 0.3;

type CaptureListener = (binding: InputBinding) => void;

export class InputCapture {
  private rafId: number | null = null;
  private running = false;
  private listener: CaptureListener | null = null;
  private readonly pressedSnapshot = new Map<number, boolean>();
  private readonly axisSnapshot = new Map<number, number>();
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  constructor() {
    this.onKeyDown = (event: KeyboardEvent) => {
      if (!this.running) return;
      // Ignore modifier-only presses so Alt+Tab doesn't get mapped.
      if (event.key === "Alt" || event.key === "Shift" || event.key === "Control" || event.key === "Meta") {
        return;
      }
      this.emit({ kind: "key", code: event.code });
    };
  }

  /** Arm a single-shot capture. Replaces any previous listener. */
  start(listener: CaptureListener): void {
    this.listener = listener;
    this.running = true;
    this.pressedSnapshot.clear();
    this.axisSnapshot.clear();
    this.takeBaseline();
    window.addEventListener("keydown", this.onKeyDown);
    this.scheduleNextTick();
  }

  stop(): void {
    this.running = false;
    this.listener = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener("keydown", this.onKeyDown);
  }

  /** Public tick entrypoint — tests drive this directly. */
  tick(): void {
    if (!this.running) return;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected !== false);
    if (!pad) return;

    for (let i = 0; i < pad.buttons.length; i++) {
      const before = this.pressedSnapshot.get(i) ?? false;
      const now = Boolean(pad.buttons[i]?.pressed);
      if (!before && now) {
        this.emit({ kind: "button", index: i });
        return;
      }
      this.pressedSnapshot.set(i, now);
    }

    for (let i = 0; i < pad.axes.length; i++) {
      const baseline = this.axisSnapshot.get(i) ?? 0;
      const current = pad.axes[i] ?? 0;
      if (Math.abs(baseline) < AXIS_DEADZONE && Math.abs(current) >= AXIS_DEADZONE) {
        this.emit({ kind: "axis", index: i, dir: current > 0 ? 1 : -1 });
        return;
      }
      this.axisSnapshot.set(i, current);
    }
  }

  private takeBaseline(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected !== false);
    if (!pad) return;
    for (let i = 0; i < pad.buttons.length; i++) {
      this.pressedSnapshot.set(i, Boolean(pad.buttons[i]?.pressed));
    }
    for (let i = 0; i < pad.axes.length; i++) {
      this.axisSnapshot.set(i, pad.axes[i] ?? 0);
    }
  }

  private scheduleNextTick(): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(() => {
      this.tick();
      this.scheduleNextTick();
    });
  }

  private emit(binding: InputBinding): void {
    const cb = this.listener;
    this.stop();
    if (cb) cb(binding);
  }
}
