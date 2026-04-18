/**
 * GamepadNav — menu navigation driven by the Gamepad API.
 *
 * Polls navigator.getGamepads() every rAF tick, emits a NavAction on each
 * down-edge (released → pressed), then key-repeats while the button stays
 * pressed: first repeat after `repeatDelay`, subsequent repeats every
 * `repeatRate`.
 *
 * Buttons not present in the mapping are ignored — prevents ghost emissions
 * on exotic arcade encoders that report spurious button indices.
 *
 * Coin-hold detection (for opening the pause menu) lives here too: the
 * mapped coin button fires `coin-hold` exactly once after 1 s of sustained
 * press. The normal down-edge on coin is suppressed so gameplay doesn't
 * eat a coin insert when the user actually meant to pause.
 */

export type NavAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "favorite"
  | "settings"
  | "bumper-left"
  | "bumper-right"
  | "coin-hold";

/** Maps semantic nav actions onto standard-gamepad button indices. */
export interface ButtonMapping {
  up: number;
  down: number;
  left: number;
  right: number;
  confirm: number;
  back: number;
  favorite: number;
  settings: number;
  bumperLeft: number;
  bumperRight: number;
  coin: number;
}

export const DEFAULT_MAPPING: ButtonMapping = {
  up: 12,            // D-pad up
  down: 13,          // D-pad down
  left: 14,          // D-pad left
  right: 15,         // D-pad right
  confirm: 0,        // A / cross
  back: 1,           // B / circle
  favorite: 3,       // Y / triangle
  settings: 9,       // Start
  bumperLeft: 4,     // LB / L1
  bumperRight: 5,    // RB / R1
  coin: 8,           // Select
};

export interface GamepadNavOptions {
  mapping?: Partial<ButtonMapping>;
  /** Delay before the first key-repeat fires (ms). */
  repeatDelay?: number;
  /** Interval between repeats once repeating starts (ms). */
  repeatRate?: number;
  /** Coin hold threshold for pause action (ms). */
  coinHoldMs?: number;
}

type Listener = (action: NavAction) => void;

interface ButtonState {
  pressedAt: number;
  lastRepeatAt: number;
}

export class GamepadNav {
  private readonly mapping: ButtonMapping;
  private readonly repeatDelay: number;
  private readonly repeatRate: number;
  private readonly coinHoldMs: number;

  private readonly listeners = new Set<Listener>();
  private readonly button: Map<number, ButtonState> = new Map();
  /** Tracks which action keys are allowed to repeat. `coin-hold` is one-shot. */
  private readonly repeatable: ReadonlySet<NavAction> = new Set([
    "up",
    "down",
    "left",
    "right",
  ]);

  private running = false;
  private rafId: number | null = null;
  private coinHoldFired = false;

  constructor(options: GamepadNavOptions = {}) {
    this.mapping = { ...DEFAULT_MAPPING, ...options.mapping };
    this.repeatDelay = options.repeatDelay ?? 250;
    this.repeatRate = options.repeatRate ?? 80;
    this.coinHoldMs = options.coinHoldMs ?? 1000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextTick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.button.clear();
    this.coinHoldFired = false;
  }

  onAction(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Exposed for tests — advances state using the provided timestamp. */
  tick(now: number = performance.now()): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected !== false) ?? null;
    if (!pad) {
      // No pad plugged in → drop all state so a reconnect starts fresh.
      this.button.clear();
      this.coinHoldFired = false;
      return;
    }

    for (const [action, idx] of this.mappedEntries()) {
      const isPressed = Boolean(pad.buttons[idx]?.pressed);
      const existing = this.button.get(idx);

      if (isPressed && !existing) {
        // Down-edge
        this.button.set(idx, { pressedAt: now, lastRepeatAt: now });
        if (action === "coin-hold") {
          // Don't fire on press — wait for hold threshold.
          continue;
        }
        this.emit(action);
      } else if (isPressed && existing) {
        // Held
        if (action === "coin-hold") {
          if (!this.coinHoldFired && now - existing.pressedAt >= this.coinHoldMs) {
            this.coinHoldFired = true;
            this.emit("coin-hold");
          }
          continue;
        }
        if (!this.repeatable.has(action)) continue;
        const heldFor = now - existing.pressedAt;
        if (heldFor < this.repeatDelay) continue;
        const sinceLastRepeat = now - existing.lastRepeatAt;
        // First repeat is delayed by repeatDelay since press; subsequent repeats every repeatRate.
        const interval = existing.lastRepeatAt === existing.pressedAt ? this.repeatDelay : this.repeatRate;
        if (sinceLastRepeat >= interval) {
          existing.lastRepeatAt = now;
          this.emit(action);
        }
      } else if (!isPressed && existing) {
        // Release
        this.button.delete(idx);
        if (action === "coin-hold") {
          // If released before the hold threshold, emit the normal tap
          // (subscribers that care about the coin tap react to "coin-tap";
          // GamepadNav is menu-only, so we just clear state).
          this.coinHoldFired = false;
        }
      }
    }
  }

  private scheduleNextTick(): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame((t) => {
      this.tick(t);
      this.scheduleNextTick();
    });
  }

  /**
   * Iterates the mapping as (action, buttonIndex) pairs. The Map preserves
   * insertion order, so unit tests can rely on deterministic ordering.
   */
  private *mappedEntries(): Iterable<[NavAction, number]> {
    const m = this.mapping;
    yield ["up", m.up];
    yield ["down", m.down];
    yield ["left", m.left];
    yield ["right", m.right];
    yield ["confirm", m.confirm];
    yield ["back", m.back];
    yield ["favorite", m.favorite];
    yield ["settings", m.settings];
    yield ["bumper-left", m.bumperLeft];
    yield ["bumper-right", m.bumperRight];
    yield ["coin-hold", m.coin];
  }

  private emit(action: NavAction): void {
    for (const l of this.listeners) l(action);
  }
}
