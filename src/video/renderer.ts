/**
 * Sprixe — Canvas 2D Renderer
 *
 * Fallback renderer (Phase 1/2). Takes a 384×224 RGBA framebuffer produced by
 * the CPS-A/B emulation layer and blits it to an HTMLCanvasElement.
 *
 * The internal canvas is always 384×224 (native CPS1 resolution). CSS scaling
 * fills the container while preserving the native aspect ratio (384:224 ≈ 1.714:1).
 *
 * WebGPU renderer (Phase 6) will replace this; keep the same interface.
 */

import type { RendererInterface } from '../types';
import { SCREEN_WIDTH, SCREEN_HEIGHT, FRAMEBUFFER_SIZE } from '../constants';
export { SCREEN_WIDTH, SCREEN_HEIGHT, FRAMEBUFFER_SIZE } from '../constants';

export class Renderer implements RendererInterface {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private imageData: ImageData;

  constructor(canvas: HTMLCanvasElement, width = SCREEN_WIDTH, height = SCREEN_HEIGHT) {
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Renderer: could not obtain 2D rendering context");
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.imageData = new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

    // Apply CSS scaling so the canvas fills its container while keeping ratio.
    this.resize();
  }

  /**
   * Blit `framebuffer` (384×224 RGBA, Uint8Array) to the canvas.
   *
   * We write directly into `this.imageData.data` (a Uint8ClampedArray) to
   * avoid an extra allocation every frame, then call `putImageData` which
   * uploads the pixel buffer in a single DMA-like operation.
   */
  render(framebuffer: Uint8Array): void {
    if (framebuffer.length !== FRAMEBUFFER_SIZE) {
      throw new Error(
        `Renderer.render: expected ${FRAMEBUFFER_SIZE} bytes, got ${framebuffer.length}`
      );
    }

    this.imageData.data.set(framebuffer);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  /** Draw text overlay on the canvas (called after render) */
  drawText(text: string, x: number, y: number): void {
    this.ctx.font = '10px monospace';
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.ctx.fillRect(x - 2, y - 10, text.length * 7, 13);
    this.ctx.fillStyle = '#0f0';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Recalculate CSS dimensions so the canvas fills its parent while keeping
   * the native 384:224 aspect ratio (letterboxed / pillarboxed as needed).
   *
   * Call this on `window` "resize" events.
   */
  resize(newWidth?: number, newHeight?: number): void {
    // Change native resolution if requested
    if (newWidth !== undefined && newHeight !== undefined) {
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      this.imageData = this.ctx.createImageData(newWidth, newHeight);
    }
    const parent = this.canvas.parentElement;

    let availableWidth: number;
    let availableHeight: number;

    if (parent) {
      availableWidth = parent.clientWidth;
      availableHeight = parent.clientHeight;
    } else {
      availableWidth = window.innerWidth;
      availableHeight = window.innerHeight;
    }

    const scaleX = availableWidth / SCREEN_WIDTH;
    const scaleY = availableHeight / SCREEN_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    const displayWidth = Math.floor(SCREEN_WIDTH * scale);
    const displayHeight = Math.floor(SCREEN_HEIGHT * scale);

    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
    // Centre inside the parent with CSS absolute positioning if needed.
    this.canvas.style.imageRendering = "pixelated";
  }

  /**
   * Toggle the browser's native fullscreen API on the canvas element.
   * Falls back silently if the API is unavailable (e.g. during tests).
   */
  toggleFullscreen(): void {
    if (!document.fullscreenEnabled) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Ignore — nothing meaningful to do if exit fails.
      });
    } else {
      this.canvas.requestFullscreen().catch(() => {
        // Ignore — can fail if not triggered by a user gesture.
      });
    }
  }
}
