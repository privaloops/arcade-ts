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
   * Read-only view of the mapped I/O port bytes (player inputs, active
   * LOW). Lets the coach calibration capture which arcade button was
   * pressed independently of the input source (keyboard, gamepad,
   * phone remote).
   */
  getIoPorts?(): Uint8Array;
  /**
   * Read-only view of the CPS-B registers. On CPS-1, kick buttons
   * (LK/MK/HK) are routed to cpsbRegs[0x36..0x37], not the main IO
   * port buffer, so the coach needs this to see the full 6-button
   * input surface.
   */
  getCpsbRegisters?(): Uint8Array;
  /**
   * Return a persistent virtual input channel that drives P2
   * programmatically. Calling press()/release() on this object has
   * the same effect as a 2nd physical pad being pressed. Used by the
   * AI opponent in 2P vs Human mode.
   */
  getVirtualP2Channel?(): import("@sprixe/engine/input/virtual-input-channel").VirtualInputChannel;
  /**
   * Attach/detach the virtual P2 channel to the InputManager. While
   * unarmed (default), P2 reads from keyboard/gamepad as usual; while
   * armed, the virtual channel REPLACES them. Toggle on when the AI
   * opponent takes control, off when the user resumes human 2P play.
   */
  armVirtualP2?(armed: boolean): void;
  /**
   * Register a callback fired at each VBlank (~60Hz). The coach uses
   * this to tick its extractor in lockstep with the emulator instead
   * of polling on rAF.
   */
  setVblankCallback?(cb: (() => void) | null): void;
  /** Release resources — called on quit to menu. */
  destroy(): void;
}
