/**
 * InputRouter — picks whether a NavAction is forwarded to the menu
 * (browser / settings / pause overlay) or suppressed so the active
 * emulator's InputManager owns the physical buttons without fighting
 * over the same frame.
 *
 * Menu mode: feedAction() forwards to registered nav listeners.
 * Emu mode:  feedAction() drops NavActions silently. The emulator
 *            reads raw I/O ports from @sprixe/engine's InputManager
 *            (wired in Phase 2.8).
 *
 * One action that must survive in both modes: `coin-hold`. It's how
 * the player opens the pause overlay while the game is running, so
 * feedAction() forwards it to a separate coin-hold listener chain
 * regardless of mode. Phase 2.6 factors the coin-hold detector out
 * of GamepadNav into a shared component; for now the router is the
 * bridge.
 */

import type { NavAction } from "./gamepad-nav";

export type InputMode = "menu" | "emu";

type NavListener = (action: NavAction) => void;
type CoinHoldListener = () => void;

export class InputRouter {
  private mode: InputMode = "menu";
  private readonly navListeners = new Set<NavListener>();
  private readonly coinHoldListeners = new Set<CoinHoldListener>();

  constructor(initialMode: InputMode = "menu") {
    this.mode = initialMode;
  }

  getMode(): InputMode {
    return this.mode;
  }

  /**
   * Switch between menu and emu. The transition is atomic: any
   * feedAction() call resolved after setMode() uses the new mode,
   * and the setMode itself never replays buffered actions (callers
   * must not mix ordering).
   */
  setMode(mode: InputMode): void {
    this.mode = mode;
  }

  /** Subscribe to menu-mode NavActions. Returns unsubscribe. */
  onNavAction(cb: NavListener): () => void {
    this.navListeners.add(cb);
    return () => {
      this.navListeners.delete(cb);
    };
  }

  /**
   * Subscribe to the coin-hold event. Fires in both menu and emu
   * modes. Typical consumer is the pause overlay trigger.
   */
  onCoinHold(cb: CoinHoldListener): () => void {
    this.coinHoldListeners.add(cb);
    return () => {
      this.coinHoldListeners.delete(cb);
    };
  }

  /**
   * Entry point driven by GamepadNav.onAction(). The router inspects
   * the current mode and decides who hears the action.
   */
  feedAction(action: NavAction): void {
    if (action === "coin-hold") {
      for (const l of this.coinHoldListeners) l();
      return;
    }
    if (this.mode !== "menu") return;
    for (const l of this.navListeners) l(action);
  }
}
