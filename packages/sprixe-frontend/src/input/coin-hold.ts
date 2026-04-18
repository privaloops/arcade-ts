/**
 * CoinHoldDetector — the single "hold coin for 1 second to open the
 * pause menu" gesture (§2.5).
 *
 * Three outcomes from a press/release cycle:
 *   - release  < tapMax (200 ms)              → onTap() fires
 *   - release  < threshold (1000 ms)           → nothing (long press
 *                                                   with no commitment)
 *   - held    ≥ threshold                      → onHold() fires exactly
 *                                                   once; the tap is
 *                                                   suppressed
 *
 * This sits alongside GamepadNav's coin detection so the pause
 * overlay works identically whether the player is browsing the game
 * list (menu mode) or inside a running game (emu mode).
 *
 * Usage shape: a caller plugs press(now)/release(now) into whatever
 * coin-button source they have (gamepad polling, keyboard keydown/
 * keyup, phone remote) and drives tick(now) from their animation
 * frame. The detector owns no timers itself so it stays deterministic
 * for Vitest (fake timers) and trivial to wire into existing RAF loops.
 */

export interface CoinHoldOptions {
  /** ms of sustained press before onHold fires. Defaults to 1000. */
  threshold?: number;
  /** ms under which a quick release counts as a tap. Defaults to 200. */
  tapMax?: number;
}

type Listener = () => void;

export class CoinHoldDetector {
  private readonly threshold: number;
  private readonly tapMax: number;

  private pressedAt: number | null = null;
  private holdFired = false;
  private readonly tapListeners = new Set<Listener>();
  private readonly holdListeners = new Set<Listener>();

  constructor(options: CoinHoldOptions = {}) {
    this.threshold = options.threshold ?? 1000;
    this.tapMax = options.tapMax ?? 200;
  }

  press(now: number): void {
    if (this.pressedAt !== null) return; // already pressed, ignore re-press
    this.pressedAt = now;
    this.holdFired = false;
  }

  release(now: number): void {
    if (this.pressedAt === null) return;
    const duration = now - this.pressedAt;
    const alreadyFired = this.holdFired;
    this.pressedAt = null;
    this.holdFired = false;

    if (alreadyFired) return; // hold already committed; no tap follow-up
    if (duration < this.tapMax) {
      for (const l of this.tapListeners) l();
    }
    // Long press with no commitment (tapMax ≤ duration < threshold)
    // intentionally produces nothing. The player released too early
    // for a tap and too late for a hold; the gesture is ambiguous.
  }

  /** Call from a RAF loop — checks whether the hold threshold is met. */
  tick(now: number): void {
    if (this.pressedAt === null || this.holdFired) return;
    if (now - this.pressedAt >= this.threshold) {
      this.holdFired = true;
      for (const l of this.holdListeners) l();
    }
  }

  onTap(cb: Listener): () => void {
    this.tapListeners.add(cb);
    return () => {
      this.tapListeners.delete(cb);
    };
  }

  onHold(cb: Listener): () => void {
    this.holdListeners.add(cb);
    return () => {
      this.holdListeners.delete(cb);
    };
  }

  /** Reset state — used when the gamepad disconnects mid-press. */
  reset(): void {
    this.pressedAt = null;
    this.holdFired = false;
  }

  /** Testing helper — true if the coin is currently depressed. */
  isPressed(): boolean {
    return this.pressedAt !== null;
  }
}
