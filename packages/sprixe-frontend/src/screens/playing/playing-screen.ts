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
import { SubtitleOverlay } from "../../coach/subtitle-overlay";
import type { GameEntry } from "../../data/games";
import type { EmulatorRunner } from "../../engine-bridge/emulator-runner";
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
  private coachOverlay: SubtitleOverlay | null = null;
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

    this.coachOverlay = new SubtitleOverlay(document.body);
    const overlay = this.coachOverlay;
    const params = new URLSearchParams(window.location.search);
    const coachLang = params.get("coachLang");
    const language: "en" | "fr" = coachLang === "fr" ? "fr" : "en";
    const ttsParam = params.get("tts");
    const ttsProvider: "eleven" | "local" | "off" =
      ttsParam === "0" || ttsParam === "off" ? "off"
      : ttsParam === "local" ? "local"
      : "eleven";
    const ttsVoiceId = params.get("coachVoice") ?? undefined;
    this.coach = new CoachController(this.runner, {
      gameId: this.game.id,
      language,
      ttsProvider,
      ...(ttsVoiceId ? { ttsVoiceId } : {}),
      onLlmToken: (t) => overlay.appendToken(t),
      onLlmComment: () => overlay.endStream(),
      onLlmError: (err) => {
        console.warn("[coach] llm error:", err);
        overlay.showError(err);
      },
    });
    if (!this.coach.start()) {
      this.coach = null;
      this.coachOverlay.destroy();
      this.coachOverlay = null;
    } else if (typeof window !== "undefined") {
      (window as unknown as { __coach?: CoachController }).__coach = this.coach;
    }
  }

  stop(): void {
    this.coach?.stop();
    this.coach = null;
    this.coachOverlay?.destroy();
    this.coachOverlay = null;
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
