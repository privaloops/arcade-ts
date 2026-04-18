/**
 * ScreenRouter — finite state machine for top-level arcade screens.
 *
 * Drives which screen is currently active, enforces the legal-transition
 * table, and maintains a back stack so `back()` restores the previous
 * screen (used by settings/modals that should return to wherever the
 * user came from).
 *
 * The router is pure state — it does not mount/unmount DOM. Consumers
 * subscribe to onEnter/onLeave to render the matching ScreenController.
 */

export type Screen =
  | "splash"
  | "empty"
  | "input-mapping"
  | "browser"
  | "playing"
  | "settings";

export type TransitionMap = {
  readonly [K in Screen]?: readonly Screen[];
};

/**
 * Default legal transitions. Tightens the state machine to what the UX
 * spec actually calls out (§2) — anything else is refused.
 */
export const DEFAULT_TRANSITIONS: TransitionMap = {
  splash: ["empty", "input-mapping", "browser"],
  empty: ["input-mapping", "browser"],
  "input-mapping": ["browser"],
  browser: ["settings", "playing", "input-mapping", "empty"],
  playing: ["browser"],
  settings: ["browser"],
};

export interface ScreenRouterOptions {
  initial?: Screen;
  transitions?: TransitionMap;
}

type Listener = () => void;

export class ScreenRouter {
  private currentScreen: Screen;
  private readonly stack: Screen[] = [];
  private readonly transitions: TransitionMap;

  private readonly enterListeners = new Map<Screen, Set<Listener>>();
  private readonly leaveListeners = new Map<Screen, Set<Listener>>();

  constructor(options: ScreenRouterOptions = {}) {
    this.currentScreen = options.initial ?? "splash";
    this.transitions = options.transitions ?? DEFAULT_TRANSITIONS;
  }

  current(): Screen {
    return this.currentScreen;
  }

  stackSize(): number {
    return this.stack.length;
  }

  canNavigate(to: Screen): boolean {
    if (to === this.currentScreen) return false;
    const allowed = this.transitions[this.currentScreen];
    return Array.isArray(allowed) && allowed.includes(to);
  }

  /**
   * Transition to `to`, pushing the current screen on the back stack.
   * Returns false if the transition is illegal (and nothing changes).
   */
  navigate(to: Screen): boolean {
    if (!this.canNavigate(to)) return false;
    const from = this.currentScreen;
    this.stack.push(from);
    this.performTransition(from, to);
    return true;
  }

  /**
   * Pop the back stack — restore the previously-current screen without
   * consulting the transition table (back moves are always legal from
   * the user's perspective). Returns false if the stack is empty.
   */
  back(): boolean {
    const previous = this.stack.pop();
    if (previous === undefined) return false;
    const from = this.currentScreen;
    this.performTransition(from, previous);
    return true;
  }

  /**
   * Replace the current screen without pushing onto the back stack.
   * Used by transitions that conceptually cancel the previous screen
   * (e.g. quit-to-menu clears any "playing → back → playing" history).
   */
  replace(to: Screen): boolean {
    if (!this.canNavigate(to)) return false;
    const from = this.currentScreen;
    this.performTransition(from, to);
    return true;
  }

  /** Clear the back stack. Useful after login/boot flows. */
  clearStack(): void {
    this.stack.length = 0;
  }

  onEnter(screen: Screen, cb: Listener): () => void {
    return this.subscribe(this.enterListeners, screen, cb);
  }

  onLeave(screen: Screen, cb: Listener): () => void {
    return this.subscribe(this.leaveListeners, screen, cb);
  }

  private performTransition(from: Screen, to: Screen): void {
    this.currentScreen = to;
    this.fire(this.leaveListeners, from);
    this.fire(this.enterListeners, to);
  }

  private subscribe(map: Map<Screen, Set<Listener>>, screen: Screen, cb: Listener): () => void {
    let set = map.get(screen);
    if (!set) {
      set = new Set();
      map.set(screen, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
    };
  }

  private fire(map: Map<Screen, Set<Listener>>, screen: Screen): void {
    const set = map.get(screen);
    if (!set) return;
    for (const cb of set) cb();
  }
}
