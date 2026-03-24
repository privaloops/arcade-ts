import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from "../video/cps1-video";
import { SCREEN_WIDTH, SCREEN_HEIGHT, FRAMEBUFFER_SIZE } from "../constants";
import type { CPS1Video } from "../video/cps1-video";
import type { RendererInterface } from "../types";
import type { Emulator } from "../emulator";

const LAYER_NAMES = ["Sprites", "Scroll 1", "Scroll 2", "Scroll 3"];
const LAYER_BADGES = ["OBJ 16×16", "8×8 HUD", "16×16", "32×32"];

export interface PixelInspectResult {
  layerId: number;
  layerName: string;
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

export class XRayRenderer {
  // Layer visibility mask: [OBJ, S1, S2, S3]
  private readonly layerMask: boolean[] = [true, true, true, true];

  // Exploded 3D state
  private explodedActive = false;
  private spread = 0;

  // Flash state
  private flashLayerId = -1;
  private flashEnd = 0;

  // References
  private readonly emulator: Emulator;
  private video: CPS1Video | null = null;
  private readonly renderer: RendererInterface;
  private readonly framebuffer: Uint8Array;

  // Exploded view DOM
  private explodedContainer: HTMLDivElement | null = null;
  private readonly layerCanvases: HTMLCanvasElement[] = [];
  private readonly layerCtxs: CanvasRenderingContext2D[] = [];
  private readonly layerFBs: Uint8Array[] = [];
  private readonly layerImgDatas: ImageData[] = [];
  private readonly layerLabels: HTMLDivElement[] = [];
  private readonly canvasWrapper: HTMLElement;
  private readonly mainCanvas: HTMLCanvasElement;

  // Drag rotation
  private rotateX = 8;
  private rotateY = -15;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartRotX = 0;
  private dragStartRotY = 0;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
    this.emulator = emulator;
    this.renderer = emulator.getRenderer();
    this.framebuffer = emulator.getFramebuffer();
    this.mainCanvas = canvas;
    this.canvasWrapper = canvas.parentElement!;
    this.video = emulator.getVideo();

    // Pre-allocate 4 layer framebuffers for exploded view
    for (let i = 0; i < 4; i++) {
      this.layerFBs.push(new Uint8Array(FRAMEBUFFER_SIZE));
      this.layerImgDatas.push(new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT));
    }
  }

  // -- Public API --

  install(): void {
    this.video = this.emulator.getVideo();
    this.emulator.setRenderCallback(() => this.render());
  }

  uninstall(): void {
    this.emulator.setRenderCallback(null);
    this.deactivateExploded();
  }

  updateVideo(): void {
    this.video = this.emulator.getVideo();
  }

  setLayerEnabled(layerId: number, enabled: boolean): void {
    this.layerMask[layerId] = enabled;
  }

  isLayerEnabled(layerId: number): boolean {
    return this.layerMask[layerId] ?? false;
  }

  toggleLayer(layerId: number): void {
    this.layerMask[layerId] = !this.layerMask[layerId];
  }

  resetLayers(): void {
    for (let i = 0; i < 4; i++) this.layerMask[i] = true;
  }

  flashLayer(layerId: number): void {
    this.flashLayerId = layerId;
    this.flashEnd = performance.now() + 600;
  }

  setSpread(value: number): void {
    this.spread = value;
    if (value > 0 && !this.explodedActive) {
      this.activateExploded();
    } else if (value === 0 && this.explodedActive) {
      this.deactivateExploded();
    }
    this.updateExplodedTransforms();
  }

  getSpread(): number {
    return this.spread;
  }

  isExplodedActive(): boolean {
    return this.explodedActive;
  }

  // -- Tile inspector --

  /** Identify which layer owns the pixel at (x, y), front-to-back. */
  inspectPixel(x: number, y: number): PixelInspectResult | null {
    const video = this.video;
    if (!video || x < 0 || y < 0 || x >= SCREEN_WIDTH || y >= SCREEN_HEIGHT) return null;

    const layerOrder = video.getLayerOrder();
    const pixelIdx = (y * SCREEN_WIDTH + x) * 4;
    const tempFb = this.layerFBs[0]!;

    // Scan front-to-back (reverse layer order)
    for (let slot = layerOrder.length - 1; slot >= 0; slot--) {
      const layerId = layerOrder[slot]!;
      if (!video.isLayerEnabled(layerId)) continue;

      tempFb.fill(0);
      video.invalidatePaletteCache();
      if (layerId === LAYER_OBJ) {
        video.renderObjects(tempFb);
      } else {
        video.renderScrollLayer(layerId, tempFb);
      }

      // Check if pixel is non-transparent (alpha > 0 in ABGR packed)
      const r = tempFb[pixelIdx]!;
      const g = tempFb[pixelIdx + 1]!;
      const b = tempFb[pixelIdx + 2]!;
      const a = tempFb[pixelIdx + 3]!;
      if (a === 0 && r === 0 && g === 0 && b === 0) continue;

      return {
        layerId,
        layerName: LAYER_NAMES[layerId]!,
        x, y,
        r, g, b,
      };
    }

    return null;
  }

  // -- Render --

  private render(): void {
    if (!this.video) return;

    // Clear flash if expired
    if (this.flashLayerId >= 0 && performance.now() > this.flashEnd) {
      this.flashLayerId = -1;
    }

    if (this.explodedActive) {
      this.renderExploded();
    } else {
      this.renderMasked();
    }
  }

  private renderMasked(): void {
    const video = this.video!;
    video.invalidatePaletteCache();

    // Clear to opaque black
    const fb32 = new Uint32Array(
      this.framebuffer.buffer,
      this.framebuffer.byteOffset,
      this.framebuffer.byteLength / 4
    );
    fb32.fill(0xFF000000);

    const layerOrder = video.getLayerOrder();

    // Render layers back to front, respecting mask
    for (let slot = 0; slot < layerOrder.length; slot++) {
      const layerId = layerOrder[slot]!;
      if (!this.layerMask[layerId]) continue;
      if (!video.isLayerEnabled(layerId)) continue;

      if (layerId === LAYER_OBJ) {
        video.renderObjects(this.framebuffer);
      } else {
        video.renderScrollLayer(layerId, this.framebuffer);
      }
    }

    // Flash effect: dim non-flashed pixels
    if (this.flashLayerId >= 0) {
      this.applyFlashDim(fb32, video);
    }

    this.renderer.render(this.framebuffer);
    this.renderer.drawText(`${this.emulator.getFpsDisplay()} FPS`, SCREEN_WIDTH - 60, 12);
  }

  private applyFlashDim(fb32: Uint32Array, video: CPS1Video): void {
    // Render only the flashed layer to a temp buffer
    const tempFb = this.layerFBs[0]!;
    tempFb.fill(0);
    const temp32 = new Uint32Array(tempFb.buffer, tempFb.byteOffset, tempFb.byteLength / 4);

    video.invalidatePaletteCache();
    if (this.flashLayerId === LAYER_OBJ) {
      video.renderObjects(tempFb);
    } else {
      video.renderScrollLayer(this.flashLayerId, tempFb);
    }

    // Dim pixels not belonging to the flashed layer
    for (let i = 0; i < fb32.length; i++) {
      if (temp32[i] === 0) {
        // Pixel not in flashed layer — dim it (multiply RGB by ~0.25)
        const px = fb32[i]!;
        const r = (px & 0xFF) >> 2;
        const g = ((px >> 8) & 0xFF) >> 2;
        const b = ((px >> 16) & 0xFF) >> 2;
        fb32[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
      }
    }
  }

  // -- Exploded 3D view --

  private activateExploded(): void {
    if (this.explodedActive) return;
    this.explodedActive = true;

    // Create container
    const container = document.createElement("div");
    container.className = "exploded-container";
    this.explodedContainer = container;

    // Create 4 layer canvases
    const layerOrder = this.video?.getLayerOrder() ?? [LAYER_SCROLL3, LAYER_SCROLL2, LAYER_OBJ, LAYER_SCROLL1];
    for (let slot = 0; slot < 4; slot++) {
      const layerId = layerOrder[slot]!;

      const wrapper = document.createElement("div");
      wrapper.className = "exploded-layer";
      wrapper.dataset["layerId"] = String(layerId);

      const cvs = document.createElement("canvas");
      cvs.width = SCREEN_WIDTH;
      cvs.height = SCREEN_HEIGHT;
      cvs.style.cssText = "width:100%;height:100%;image-rendering:pixelated;";
      const ctx = cvs.getContext("2d")!;

      const label = document.createElement("div");
      label.className = "exploded-label";
      label.textContent = LAYER_NAMES[layerId]!;

      wrapper.appendChild(cvs);
      wrapper.appendChild(label);
      container.appendChild(wrapper);

      this.layerCanvases[slot] = cvs;
      this.layerCtxs[slot] = ctx;
      this.layerLabels[slot] = label;
    }

    // Insert in canvas wrapper, hide main canvas
    this.mainCanvas.style.display = "none";
    this.canvasWrapper.appendChild(container);

    // Drag rotation
    container.addEventListener("mousedown", this.onDragStart);
    window.addEventListener("mousemove", this.onDragMove);
    window.addEventListener("mouseup", this.onDragEnd);

    this.updateExplodedTransforms();
  }

  private deactivateExploded(): void {
    if (!this.explodedActive) return;
    this.explodedActive = false;

    if (this.explodedContainer) {
      this.explodedContainer.removeEventListener("mousedown", this.onDragStart);
      window.removeEventListener("mousemove", this.onDragMove);
      window.removeEventListener("mouseup", this.onDragEnd);
      this.explodedContainer.remove();
      this.explodedContainer = null;
    }

    this.layerCanvases.length = 0;
    this.layerCtxs.length = 0;
    this.layerLabels.length = 0;

    this.mainCanvas.style.display = "";
  }

  private renderExploded(): void {
    const video = this.video!;
    const layerOrder = video.getLayerOrder();

    for (let slot = 0; slot < 4; slot++) {
      const layerId = layerOrder[slot]!;
      const fb = this.layerFBs[slot]!;
      const imgData = this.layerImgDatas[slot]!;

      // Clear to transparent
      fb.fill(0);

      video.invalidatePaletteCache();

      if (this.layerMask[layerId] && video.isLayerEnabled(layerId)) {
        if (layerId === LAYER_OBJ) {
          video.renderObjects(fb);
        } else {
          video.renderScrollLayer(layerId, fb);
        }
      }

      // Flash: dim this layer if it's not the flashed one
      if (this.flashLayerId >= 0 && layerId !== this.flashLayerId) {
        const fb32 = new Uint32Array(fb.buffer, fb.byteOffset, fb.byteLength / 4);
        for (let i = 0; i < fb32.length; i++) {
          const px = fb32[i]!;
          if (px === 0) continue;
          const r = (px & 0xFF) >> 2;
          const g = ((px >> 8) & 0xFF) >> 2;
          const b = ((px >> 16) & 0xFF) >> 2;
          const a = (px >> 24) & 0xFF;
          fb32[i] = (a << 24) | (b << 16) | (g << 8) | r;
        }
      }

      // Upload to canvas
      imgData.data.set(fb);
      const ctx = this.layerCtxs[slot];
      if (ctx) ctx.putImageData(imgData, 0, 0);

      // Update wrapper position & label
      const wrapper = this.layerCanvases[slot]?.parentElement as HTMLElement | undefined;
      if (wrapper) {
        wrapper.dataset["layerId"] = String(layerId);
        wrapper.style.zIndex = String(slot);
        const lbl = this.layerLabels[slot];
        if (lbl) lbl.textContent = LAYER_NAMES[layerId]!;
      }
    }

    this.updateExplodedTransforms();
  }

  private updateExplodedTransforms(): void {
    if (!this.explodedContainer) return;

    this.explodedContainer.style.transform =
      `rotateX(${this.rotateX}deg) rotateY(${this.rotateY}deg)`;

    const layers = this.explodedContainer.querySelectorAll<HTMLElement>(".exploded-layer");
    const count = layers.length;
    for (let i = 0; i < count; i++) {
      const z = (i - (count - 1) / 2) * this.spread * 2;
      layers[i]!.style.transform = `translateZ(${z}px)`;
    }
  }

  // -- Drag handlers (bound) --

  private onDragStart = (e: MouseEvent): void => {
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartRotX = this.rotateX;
    this.dragStartRotY = this.rotateY;
    e.preventDefault();
  };

  private onDragMove = (e: MouseEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.rotateY = this.dragStartRotY + dx * 0.3;
    this.rotateX = Math.max(-60, Math.min(60, this.dragStartRotX - dy * 0.3));
  };

  private onDragEnd = (): void => {
    this.dragging = false;
  };

  // -- Static info --

  static readonly LAYER_NAMES = LAYER_NAMES;
  static readonly LAYER_BADGES = LAYER_BADGES;
}
