/**
 * PlayingScreen — arcade playing context.
 *
 * Mounts the DOM scaffolding (title + canvas + FPS readout), instantiates
 * the right engine runner for the game's system through the registry, and
 * exposes the runner to callers (PauseOverlay, SaveStateController).
 *
 * Instances are built via the async factory PlayingScreen.create() so the
 * runner's async setup (engine boot, BIOS lookup, audio init) can surface
 * typed errors (e.g. MissingBiosError) before the screen is mounted.
 */

import { CoachController } from "@sprixe/coach/coach-controller";
import type { GameEntry } from "../../data/games";
import type { EmulatorRunner } from "../../engine-bridge/emulator-runner";
import { HitboxOverlay } from "../../engine-bridge/hitbox-overlay";
import { identifyRom } from "../../engine-bridge/identify";
import { createRunner } from "../../engine-bridge/systems";
import { loadMapping } from "../../input/mapping-store";
import type { RomDB } from "../../storage/rom-db";

export interface PlayingScreenOptions {
  game: GameEntry;
  romBuffer: ArrayBuffer;
  romDb: RomDB;
}

export class PlayingScreen {
  readonly root: HTMLDivElement;

  private readonly game: GameEntry;
  private readonly canvas: HTMLCanvasElement;
  private readonly fpsEl: HTMLDivElement;
  private readonly runner: EmulatorRunner;
  private coach: CoachController | null = null;
  private hitboxOverlay: HitboxOverlay | null = null;
  private rafId: number | null = null;
  private lastFpsUpdate = performance.now();
  private lastFpsFrames = 0;
  private frameTick = 0;
  private gestureCleanup: (() => void) | null = null;
  /**
   * Tracks whether the player explicitly left fullscreen via the
   * browser's Escape handling. Once true, any queued one-shot gesture
   * listener skips the requestFullscreen() call — so a later keystroke
   * doesn't drag the user back against their wishes.
   */
  private userExitedFullscreen = false;
  private fullscreenChangeHandler: (() => void) | null = null;

  private constructor(
    container: HTMLElement,
    game: GameEntry,
    canvas: HTMLCanvasElement,
    runner: EmulatorRunner,
  ) {
    this.game = game;
    this.canvas = canvas;
    this.runner = runner;

    this.root = document.createElement("div");
    this.root.className = "af-playing-screen";
    this.root.setAttribute("data-testid", "playing-screen");
    this.root.dataset.gameId = this.game.id;

    this.canvas.className = "af-playing-canvas";
    this.canvas.setAttribute("data-testid", "playing-canvas");
    this.root.appendChild(this.canvas);

    // FPS counter is kept in the DOM so the E2E suites can read the
    // value, but it is visually hidden — the playing screen is
    // chrome-free by design (2026-04 UX pass).
    this.fpsEl = document.createElement("div");
    this.fpsEl.className = "af-playing-fps";
    this.fpsEl.setAttribute("data-testid", "playing-fps");
    this.fpsEl.textContent = "FPS: 0";
    this.root.appendChild(this.fpsEl);

    container.appendChild(this.root);
  }

  /**
   * Build + mount the playing screen. Throws MissingBiosError / other
   * typed errors from the runner factory so callers can route the user
   * back to the browser with a system-specific message.
   */
  static async create(
    container: HTMLElement,
    options: PlayingScreenOptions,
  ): Promise<PlayingScreen> {
    const identified = await identifyRom(options.romBuffer);
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 224;
    const runner = await createRunner(identified.system, {
      canvas,
      romBuffer: options.romBuffer,
      romDb: options.romDb,
      // Forward the user's full captured mapping (P1 + optional P2,
      // keyboard + gamepad) so the engine binds to the buttons the
      // user actually picked instead of the hardcoded defaults.
      mapping: loadMapping(),
    });
    return new PlayingScreen(container, options.game, canvas, runner);
  }

  start(): void {
    this.runner.start();
    this.startFpsLoop();
    this.attachAudioGestureBootstrap();

    const params = new URLSearchParams(window.location.search);
    const calibrateOnly = params.get("calibrate") === "1";
    const enableAiOpponent = params.get("ai") === "1";
    const aiEngine: "mode" | "policy" = params.get("engine") === "policy" ? "policy" : "mode";
    const levelParam = params.get("level");
    // DEBUG default: 'tas' — we want the unbeatable baseline first,
    // then tune the optimal tier before re-enabling easier presets.
    const aiLevel: "easy" | "normal" | "hard" | "tas" =
      levelParam === "easy" || levelParam === "normal" || levelParam === "hard" || levelParam === "tas"
        ? levelParam
        : "tas";
    // ?debug=<action> forces the AI to repeat one action (bypasses policy).
    // Used to isolate motion-library bugs.
    const debugParam = params.get("debug");
    const aiDebugLoopAction = debugParam && debugParam.length > 0 ? debugParam : undefined;
    // ?calibrate-ken=1 — runs the Ken move-map calibration harness in
    // place of the TAS pilot. Prints the animPtr table to the console
    // once every move in CALIBRATION_MOVES has been observed.
    const calibrateKen = params.get("calibrate-ken") === "1";
    // ?validate-ken=1 — cross-checks predictKenAttackBox vs live attackbox
    // every frame. Zero console noise on a clean round.
    const validateKen = params.get("validate-ken") === "1";
    // ?inspect-ken=1 — dumps raw Ken animPtr + 24-byte struct each
    // vblank. Used to reverse-engineer SF2HF's frame-advance mechanism.
    const inspectKen = params.get("inspect-ken") === "1";
    // ?record-ken=1 — captures Ken move timelines (animPtr + hold
    // frames) and prints TS snippets ready to paste into ken-move-timelines.ts.
    const recordKen = params.get("record-ken") === "1";
    // ?debug-threat=1 — logs P1 attackbox gap + height classification on
    // every transition. Dry-run for the geometry-based threat detector.
    const debugThreat = params.get("debug-threat") === "1";
    // ?test-cmk-punish=1 — feasibility probe. On every Ryu sweep, Ken
    // fires a sweep the SAME frame and logs press-to-hit latency. The
    // normal AI policy is bypassed for the duration of the test.
    const testCmkPunish = params.get("test-cmk-punish") === "1";
    // ?dump-ranges=1 — one-shot: at the first vblank where both
    // hitboxPtrs are populated, compute and print the Ken×Ryu
    // punish-range matrix (max hit distance per move pair).
    const dumpRanges = params.get("dump-ranges") === "1";
    // ?ai-counter=1 — deterministic counter-punish AI derived from
    // the Ken×Ryu matrix. Bypasses the tier-based policy runner.
    const aiCounter = params.get("ai-counter") === "1";
    // Note: the CoachController auto-arms the virtual P2 channel only
    // while a fight is active, so the keyboard still drives P2 during
    // menu navigation and character select.

    this.coach = new CoachController(this.runner, {
      gameId: this.game.id,
      calibrateOnly,
      // Force-enable the AI opponent under calibration / feasibility tests —
      // those harnesses drive P2 via virtual inputs, so a spectator/manual
      // P2 is useless.
      enableAiOpponent: enableAiOpponent || calibrateKen || testCmkPunish || aiCounter,
      aiEngine,
      aiLevel,
      ...(aiDebugLoopAction ? { aiDebugLoopAction } : {}),
      ...(calibrateKen ? { calibrateKen: true } : {}),
      ...(validateKen ? { validateKen: true } : {}),
      ...(inspectKen ? { inspectKen: true } : {}),
      ...(recordKen ? { recordKen: true } : {}),
      ...(debugThreat ? { debugThreat: true } : {}),
      ...(testCmkPunish ? { testCmkPunish: true } : {}),
      ...(dumpRanges ? { dumpRanges: true } : {}),
      ...(aiCounter ? { aiCounter: true } : {}),
    });
    if (!this.coach.start()) {
      this.coach = null;
    } else if (typeof window !== "undefined") {
      (window as unknown as { __coach?: CoachController }).__coach = this.coach;
      // Hitbox debug overlay — F7 to toggle. Uses live RAM hitboxes from
      // the state extractor (attackbox/hurtboxes/pushbox). Needs the game
      // canvas as parent for positioning.
      this.hitboxOverlay = new HitboxOverlay(this.canvas, this.coach);
      (window as unknown as { __hitboxOverlay?: HitboxOverlay }).__hitboxOverlay = this.hitboxOverlay;
    }

    // Expose the virtual P2 input channel on window so the AI opponent
    // can be driven from the console during prototyping:
    //   __virtualP2.press('right'); __virtualP2.press('button1');
    //   setTimeout(() => __virtualP2.releaseAll(), 200);
    if (typeof window !== "undefined" && this.runner.getVirtualP2Channel) {
      (window as { __virtualP2?: ReturnType<NonNullable<EmulatorRunner['getVirtualP2Channel']>> } & typeof window)
        .__virtualP2 = this.runner.getVirtualP2Channel();
    }
  }

  stop(): void {
    this.hitboxOverlay?.destroy();
    this.hitboxOverlay = null;
    this.coach?.stop();
    this.coach = null;
    this.stopFpsLoop();
    this.gestureCleanup?.();
    this.gestureCleanup = null;
    if (this.fullscreenChangeHandler) {
      document.removeEventListener("fullscreenchange", this.fullscreenChangeHandler);
      this.fullscreenChangeHandler = null;
    }
    this.runner.stop();
    this.runner.destroy();
    // Exit fullscreen on quit so the browser / Settings reappear
    // in the normal windowed state. Silently ignored if we weren't
    // actually fullscreen.
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    this.root.remove();
  }

  /**
   * Browsers tie two critical features to a fresh user-gesture stack:
   *   - AudioContext.resume() (Chrome autoplay policy)
   *   - element.requestFullscreen() (Fullscreen API)
   *
   * Gamepad presses do NOT count. We attach a one-shot listener on
   * pointerdown / keydown / touchstart; the first real DOM gesture
   * after launch unmutes the engine AND takes the page fullscreen.
   * On the kiosk Chromium (--kiosk + --autoplay-policy=no-user-
   * gesture-required) both are already satisfied and this is a no-op.
   */
  private attachAudioGestureBootstrap(): void {
    const handler = (): void => {
      this.runner.resumeAudio?.();
      this.requestFullscreen();
      this.gestureCleanup?.();
      this.gestureCleanup = null;
    };
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener("pointerdown", handler, opts);
    window.addEventListener("keydown", handler, opts);
    window.addEventListener("touchstart", handler, opts);
    this.gestureCleanup = () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("touchstart", handler);
    };
    // If the call stack that created PlayingScreen already carries a
    // gesture (mouse click on a browser card, keyboard launch), act
    // immediately — the browser silently ignores the call when the
    // gesture token is missing.
    this.runner.resumeAudio?.();
    this.requestFullscreen();

    // Watch for the user pressing Escape (or hitting the system
    // fullscreen exit). Once they leave fullscreen of their own accord
    // we must NOT drag them back in on the next keystroke — clear the
    // remaining one-shot listeners and remember the decision for the
    // rest of this playing session.
    this.fullscreenChangeHandler = () => {
      if (document.fullscreenElement) return;
      if (!this.userExitedFullscreen) {
        this.userExitedFullscreen = true;
        this.gestureCleanup?.();
        this.gestureCleanup = null;
      }
    };
    document.addEventListener("fullscreenchange", this.fullscreenChangeHandler);
  }

  private requestFullscreen(): void {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) return;
    // Respect a previous Escape — see fullscreenchange handler above.
    if (this.userExitedFullscreen) return;
    // Target <html> (not just the playing root) so sibling overlays —
    // the pause menu, toasts, missing-bios dialog — stay visible when
    // fullscreen. A per-element fullscreen would hide them entirely.
    const target = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const req = target.requestFullscreen?.bind(target) ?? target.webkitRequestFullscreen?.bind(target);
    if (!req) return;
    req().catch(() => {
      // Browsers reject the call outside a user-gesture stack; harmless
      // — the kiosk is already fullscreen and the dev user can always
      // F11 / click to re-arm.
    });
  }

  /** Expose the runner so the pause overlay + save controller share it. */
  getRunner(): EmulatorRunner {
    return this.runner;
  }

  // ── FPS readout (lightweight, decoupled from the engine loop) ──────────

  private startFpsLoop(): void {
    const tick = (now: number): void => {
      // Freeze both the counter and the on-screen label while the
      // engine is paused, so p2-pause-flow can assert the FPS readout
      // stays stable across the pause window.
      if (!this.runner.isPaused()) {
        this.frameTick += 1;
        if (now - this.lastFpsUpdate >= 1000) {
          const fps = Math.round(((this.frameTick - this.lastFpsFrames) * 1000) / (now - this.lastFpsUpdate));
          this.fpsEl.textContent = `FPS: ${fps}`;
          this.lastFpsUpdate = now;
          this.lastFpsFrames = this.frameTick;
        }
      } else {
        this.lastFpsUpdate = now;
        this.lastFpsFrames = this.frameTick;
      }
      // Publish the true engine frame count so tests can prove the
      // runner is actually emulating even when the canvas content is
      // visually static (e.g. synthetic test ROMs).
      const engineFrames = this.runner.getEngineFrames?.();
      if (engineFrames !== undefined) {
        this.root.dataset.engineFrames = String(engineFrames);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopFpsLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
