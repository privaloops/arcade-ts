/**
 * GamepadNav — menu navigation driven by the Gamepad API.
 *
 * Polls navigator.getGamepads() every rAF tick, emits a NavAction on each
 * down-edge (released → pressed), then key-repeats while the button stays
 * pressed: first repeat after `repeatDelay`, subsequent repeats every
 * `repeatRate`.
 *
 * Bindings are typed: each nav action resolves to either a button index
 * (`{ kind: "button", index }`) or an analogue axis threshold
 * (`{ kind: "axis", index, dir, threshold? }`). This is how the first-boot
 * mapping screen can record up/down on a joystick Y-axis without the
 * menu going silent.
 *
 * Coin-hold detection (for opening the pause menu) lives here too: the
 * mapped coin binding fires `coin-hold` exactly once after 1 s of sustained
 * press. The normal down-edge on coin is suppressed so gameplay doesn't
 * eat a coin insert when the user actually meant to pause.
 */

/**
 * Frontend menu actions. The set deliberately mirrors the arcade
 * surface: directions, a confirm/back pair (derived from the 1st/2nd
 * play buttons), a context-menu action (3rd play button), settings
 * (Start), and the coin-hold used by the pause overlay. No bespoke
 * "menu buttons" — the arcade stick drives the whole UI.
 */
export type NavAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "context-menu"
  | "start"
  | "bumper-left"
  | "bumper-right"
  | "coin-hold";

export type NavBinding =
  | { kind: "button"; index: number }
  | { kind: "axis"; index: number; dir: -1 | 1; threshold?: number };

/**
 * Maps semantic nav actions onto gamepad buttons or axes. `null` means
 * the action is disabled — the physical button/axis can still be pressed,
 * it just won't emit anything. This is how we avoid firing actions on
 * buttons the user never mapped.
 */
export interface NavBindings {
  up: NavBinding | null;
  down: NavBinding | null;
  left: NavBinding | null;
  right: NavBinding | null;
  confirm: NavBinding | null;
  back: NavBinding | null;
  contextMenu: NavBinding | null;
  start: NavBinding | null;
  bumperLeft: NavBinding | null;
  bumperRight: NavBinding | null;
  coin: NavBinding | null;
}

const btn = (index: number): NavBinding => ({ kind: "button", index });

/**
 * Defaults for users who haven't gone through the MappingScreen yet
 * (first boot before prompts complete). Mirrors the Xbox standard
 * gamepad: A = confirm, B = back, X = context menu, Start = settings,
 * Select = coin. Once a user mapping exists these are overridden.
 */
export const DEFAULT_BINDINGS: NavBindings = {
  up: btn(12),             // D-pad up
  down: btn(13),           // D-pad down
  left: btn(14),           // D-pad left
  right: btn(15),          // D-pad right
  confirm: btn(0),         // A — Button 1 (LP)
  back: btn(1),            // B — Button 2 (MP)
  contextMenu: btn(2),     // X — Button 3 (HP)
  bumperLeft: btn(4),      // LB — Button 5 (MK) — switches tabs in Settings
  bumperRight: btn(5),     // RB — Button 6 (HK)
  start: btn(9),           // Start — secondary launch in browser
  coin: btn(8),            // Select — coin-hold = pause / Settings
};

export interface GamepadNavOptions {
  bindings?: Partial<NavBindings>;
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

const DEFAULT_AXIS_THRESHOLD = 0.5;

function bindingKey(binding: NavBinding): string {
  return binding.kind === "button"
    ? `btn-${binding.index}`
    : `axis-${binding.index}-${binding.dir}`;
}

function readBinding(pad: Gamepad, binding: NavBinding): boolean {
  if (binding.kind === "button") {
    return Boolean(pad.buttons[binding.index]?.pressed);
  }
  const value = pad.axes[binding.index] ?? 0;
  const threshold = binding.threshold ?? DEFAULT_AXIS_THRESHOLD;
  return binding.dir < 0 ? value <= -threshold : value >= threshold;
}

export class GamepadNav {
  private readonly bindings: NavBindings;
  private readonly repeatDelay: number;
  private readonly repeatRate: number;
  private readonly coinHoldMs: number;

  private readonly listeners = new Set<Listener>();
  private readonly state: Map<string, ButtonState> = new Map();
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
  /**
   * When set, the next tick with a live pad will register any already-
   * pressed buttons/axes into `state` without emitting. Flipped true
   * only by start() — the runtime entry point — so unit tests that
   * drive tick() directly keep their "first press fires" contract.
   * Without this, an Xbox BT controller that reports Start pressed at
   * connect time triggers the 'start' action → launch on boot.
   */
  private needsBaseline = false;

  constructor(options: GamepadNavOptions = {}) {
    this.bindings = { ...DEFAULT_BINDINGS, ...options.bindings };
    this.repeatDelay = options.repeatDelay ?? 250;
    this.repeatRate = options.repeatRate ?? 80;
    this.coinHoldMs = options.coinHoldMs ?? 1000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.needsBaseline = true;
    this.scheduleNextTick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.state.clear();
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
      this.state.clear();
      this.coinHoldFired = false;
      return;
    }

    // First pass after start() with a live pad: record whichever
    // inputs already read as pressed (stuck Start, unmapped triggers,
    // noisy axes) into `state` without emitting. Real down-edges must
    // start from a released sample.
    const firstSeen = this.needsBaseline;
    if (firstSeen) this.needsBaseline = false;

    for (const [action, binding] of this.mappedEntries()) {
      if (binding === null) continue;
      const key = bindingKey(binding);
      const isPressed = readBinding(pad, binding);
      const existing = this.state.get(key);

      if (isPressed && !existing) {
        this.state.set(key, { pressedAt: now, lastRepeatAt: now });
        if (firstSeen) continue; // baseline capture: no emit
        if (action === "coin-hold") continue;
        this.emit(action);
      } else if (isPressed && existing) {
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
        const interval = existing.lastRepeatAt === existing.pressedAt ? this.repeatDelay : this.repeatRate;
        if (sinceLastRepeat >= interval) {
          existing.lastRepeatAt = now;
          this.emit(action);
        }
      } else if (!isPressed && existing) {
        this.state.delete(key);
        if (action === "coin-hold") this.coinHoldFired = false;
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

  /** Yields (action, binding) pairs. Map preserves insertion order. */
  private *mappedEntries(): Iterable<[NavAction, NavBinding | null]> {
    const b = this.bindings;
    yield ["up", b.up];
    yield ["down", b.down];
    yield ["left", b.left];
    yield ["right", b.right];
    yield ["confirm", b.confirm];
    yield ["back", b.back];
    yield ["context-menu", b.contextMenu];
    yield ["bumper-left", b.bumperLeft];
    yield ["bumper-right", b.bumperRight];
    yield ["start", b.start];
    yield ["coin-hold", b.coin];
  }

  private emit(action: NavAction): void {
    for (const l of this.listeners) l(action);
  }
}
