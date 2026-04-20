/**
 * Uniform surface a PlayingScreen talks to, regardless of whether the
 * backing emulator is the CPS-1 or the Neo-Geo engine. Matches the
 * EmulatorHandle contract consumed by PauseOverlay + SaveStateController
 * so swapping runners doesn't cascade.
 *
 * saveState / loadState are optional because not every system has a
 * buffer-based snapshot API yet (Neo-Geo — Phase 2.10).
 */

export interface EmulatorRunner {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  isRunning(): boolean;
  /**
   * Number of fully-emulated frames since the ROM loaded. Used by
   * tests to prove the engine is actually running (the canvas hash
   * can stay flat on a rom that doesn't visually animate).
   */
  getEngineFrames?(): number;
  /**
   * Resume a suspended AudioContext. Browsers auto-suspend contexts
   * created outside a user-gesture call stack; the caller attaches a
   * one-shot keydown/pointerdown listener and invokes this to kickstart
   * playback.
   */
  resumeAudio?(): void;
  /**
   * Master volume level 0.0 .. 1.0. Called from Settings and the pause
   * overlay so the user's slider change is audible immediately.
   */
  setVolume?(level: number): void;
  /** Async to accommodate engines that gather state from a Web Worker. */
  saveState?(): Promise<ArrayBuffer | null>;
  loadState?(data: ArrayBuffer): boolean;
  /**
   * Read-only view of the 68K Work RAM (64KB). Used by the coach to
   * extract game state each frame without touching the bus API. Only
   * implemented by CPS-1 for now.
   */
  getWorkRam?(): Uint8Array;
  /**
   * Register a callback fired at each VBlank (~60Hz). The coach uses
   * this to tick its extractor in lockstep with the emulator instead
   * of polling on rAF.
   */
  setVblankCallback?(cb: (() => void) | null): void;
  /** Release resources — called on quit to menu. */
  destroy(): void;
}
