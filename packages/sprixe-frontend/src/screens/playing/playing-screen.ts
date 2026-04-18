/**
 * PlayingScreen — arcade playing context.
 *
 * Phase 2.7 ships a minimal mock emulator (black canvas + rAF-driven
 * frame counter) so we can exercise the pause overlay flow end-to-end
 * without loading a real ROM. Phase 2.8 swaps the mock for the actual
 * @sprixe/engine Emulator / NeoGeoEmulator depending on the ROM's
 * system.
 *
 * The screen exposes a `getEmulator()` handle that implements the
 * EmulatorHandle surface used by PauseOverlay — same shape whether
 * the backing implementation is the mock or the real engine.
 */

import type { GameEntry } from "../../data/games";
import type { EmulatorHandle } from "../pause/pause-overlay";

export interface PlayingScreenOptions {
  game: GameEntry;
}

class MockEmulator implements EmulatorHandle {
  private running = false;
  private paused = false;
  private frames = 0;
  private rafId: number | null = null;
  private readonly onFrame: (frames: number) => void;

  constructor(onFrame: (frames: number) => void) {
    this.onFrame = onFrame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.frames = 0;
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  getFrames(): number {
    return this.frames;
  }

  private loop = (): void => {
    if (!this.running) return;
    if (!this.paused) {
      this.frames += 1;
      this.onFrame(this.frames);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}

export class PlayingScreen {
  readonly root: HTMLDivElement;

  private readonly game: GameEntry;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fpsEl: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly emulator: MockEmulator;
  private lastFpsUpdate = performance.now();
  private lastFpsFrame = 0;

  constructor(container: HTMLElement, options: PlayingScreenOptions) {
    this.game = options.game;

    this.root = document.createElement("div");
    this.root.className = "af-playing-screen";
    this.root.setAttribute("data-testid", "playing-screen");
    this.root.dataset.gameId = this.game.id;

    this.titleEl = document.createElement("div");
    this.titleEl.className = "af-playing-title";
    this.titleEl.textContent = this.game.title;
    this.root.appendChild(this.titleEl);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "af-playing-canvas";
    this.canvas.width = 384;
    this.canvas.height = 224;
    this.canvas.setAttribute("data-testid", "playing-canvas");
    this.root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;

    this.fpsEl = document.createElement("div");
    this.fpsEl.className = "af-playing-fps";
    this.fpsEl.setAttribute("data-testid", "playing-fps");
    this.fpsEl.textContent = "FPS: 0";
    this.root.appendChild(this.fpsEl);

    container.appendChild(this.root);

    this.emulator = new MockEmulator((frames) => this.render(frames));
  }

  start(): void {
    this.emulator.start();
  }

  stop(): void {
    this.emulator.stop();
    this.root.remove();
  }

  getEmulator(): EmulatorHandle & { getFrames(): number } {
    return this.emulator;
  }

  private render(frames: number): void {
    // Mock rendering: animated gradient + frame counter so the canvas
    // is never blank (helps the E2E assertion `canvas non-empty`).
    const t = frames * 0.01;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const r = Math.floor(32 + 32 * Math.sin(t));
    const g = Math.floor(16 + 16 * Math.sin(t + 2));
    const b = Math.floor(64 + 32 * Math.sin(t + 4));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f0f0f5";
    ctx.font = "16px sans-serif";
    ctx.fillText(`frame ${frames}`, 16, h / 2);

    // FPS readout — recompute once per second.
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      const fps = Math.round(((frames - this.lastFpsFrame) * 1000) / (now - this.lastFpsUpdate));
      this.fpsEl.textContent = `FPS: ${fps}`;
      this.lastFpsUpdate = now;
      this.lastFpsFrame = frames;
    }
  }
}
