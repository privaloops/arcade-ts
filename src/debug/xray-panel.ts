import { XRayRenderer, type PixelInspectResult } from "./xray-renderer";
import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from "../video/cps1-video";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../constants";
import type { Emulator } from "../emulator";

// Layer display order (visual, back→front by default)
const LAYER_IDS = [LAYER_SCROLL3, LAYER_SCROLL2, LAYER_OBJ, LAYER_SCROLL1];
const LAYER_SHORT: Record<number, string> = {
  [LAYER_OBJ]: "OBJ",
  [LAYER_SCROLL1]: "S1",
  [LAYER_SCROLL2]: "S2",
  [LAYER_SCROLL3]: "S3",
};

export class XRayPanel {
  private active = false;
  private readonly renderer: XRayRenderer;
  private readonly emulator: Emulator;

  // DOM references
  private readonly container: HTMLDivElement;
  private readonly xrayBtn: HTMLElement;
  private readonly layerRows: Map<number, HTMLDivElement> = new Map();
  private readonly layerCheckboxes: Map<number, HTMLInputElement> = new Map();
  private orderDisplay: HTMLSpanElement | null = null;
  private frameCounter: HTMLSpanElement | null = null;
  private playPauseBtn: HTMLButtonElement | null = null;
  private spreadSlider: HTMLInputElement | null = null;
  private spreadValue: HTMLSpanElement | null = null;

  // Palette viewer
  private paletteCanvas: HTMLCanvasElement | null = null;
  private paletteCtx: CanvasRenderingContext2D | null = null;
  private paletteInfo: HTMLDivElement | null = null;
  private palettePage = 0; // 0..5

  // Tile inspector
  private inspectorInfo: HTMLDivElement | null = null;
  private readonly canvas: HTMLCanvasElement;
  private inspectorClickHandler: ((e: MouseEvent) => void) | null = null;

  // Sprite list & registers
  private spriteListDiv: HTMLDivElement | null = null;
  private registerDiv: HTMLDivElement | null = null;

  // Update throttle
  private updateRafId = 0;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.emulator = emulator;
    this.renderer = new XRayRenderer(emulator, canvas);
    this.container = document.getElementById("xray-panel") as HTMLDivElement;
    this.xrayBtn = document.getElementById("xray-btn")!;

    this.buildDOM();
    this.bindEvents();
  }

  toggle(): void {
    if (this.active) {
      this.close();
    } else {
      this.open();
    }
  }

  isOpen(): boolean {
    return this.active;
  }

  onGameChange(): void {
    this.renderer.updateVideo();
    this.renderer.resetLayers();
    this.renderer.setSpread(0);

    // Reset UI
    for (const [, cb] of this.layerCheckboxes) {
      cb.checked = true;
    }
    if (this.spreadSlider) {
      this.spreadSlider.value = "0";
      if (this.spreadValue) this.spreadValue.textContent = "0";
    }
  }

  destroy(): void {
    this.close();
    this.container.innerHTML = "";
    cancelAnimationFrame(this.updateRafId);
  }

  // -- Private --

  private open(): void {
    this.active = true;
    this.container.classList.add("open");
    document.body.classList.add("xray-active");
    this.xrayBtn.classList.add("active");
    this.renderer.install();
    this.startUpdateLoop();

    // Tile inspector: listen for clicks on the game canvas
    this.inspectorClickHandler = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / rect.width * SCREEN_WIDTH);
      const py = Math.floor((e.clientY - rect.top) / rect.height * SCREEN_HEIGHT);
      const result = this.renderer.inspectPixel(px, py);
      this.showInspectResult(px, py, result);
    };
    this.canvas.addEventListener("click", this.inspectorClickHandler);
  }

  private close(): void {
    this.active = false;
    this.container.classList.remove("open");
    document.body.classList.remove("xray-active");
    this.xrayBtn.classList.remove("active");
    this.renderer.uninstall();
    cancelAnimationFrame(this.updateRafId);

    if (this.inspectorClickHandler) {
      this.canvas.removeEventListener("click", this.inspectorClickHandler);
      this.inspectorClickHandler = null;
    }
  }

  private buildDOM(): void {
    const c = this.container;
    c.innerHTML = "";

    // Header
    const header = el("div", "xray-header");
    const title = el("h2");
    title.textContent = "X-Ray";
    const closeBtn = el("button", "xray-close");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.toggle());
    header.append(title, closeBtn);
    c.appendChild(header);

    // Frame controls
    const frameCtrls = el("div", "xray-frame-controls");

    this.playPauseBtn = el("button", "ctrl-btn") as HTMLButtonElement;
    this.playPauseBtn.textContent = "Pause";

    const stepBtn = el("button", "ctrl-btn") as HTMLButtonElement;
    stepBtn.textContent = "Step";

    this.frameCounter = el("span", "xray-frame-count");
    this.frameCounter.textContent = "Frame: 0";

    frameCtrls.append(this.playPauseBtn, stepBtn, this.frameCounter);
    c.appendChild(frameCtrls);

    this.playPauseBtn.addEventListener("click", () => {
      if (this.emulator.isPaused()) {
        this.emulator.resume();
        this.playPauseBtn!.textContent = "Pause";
      } else {
        this.emulator.pause();
        this.playPauseBtn!.textContent = "Play";
      }
    });

    stepBtn.addEventListener("click", () => {
      if (!this.emulator.isPaused()) {
        this.emulator.pause();
        this.playPauseBtn!.textContent = "Play";
      }
      this.emulator.stepFrame();
    });

    // Layers section
    const layersTitle = el("div", "xray-section-title");
    layersTitle.textContent = "Layers";
    c.appendChild(layersTitle);

    const layersContainer = el("div");
    layersContainer.id = "xray-layers-container";

    for (const layerId of LAYER_IDS) {
      const row = this.createLayerRow(layerId);
      this.layerRows.set(layerId, row);
      layersContainer.appendChild(row);
    }
    c.appendChild(layersContainer);

    // Draw order
    const orderDiv = el("div", "xray-order");
    orderDiv.textContent = "Draw order: ";
    this.orderDisplay = el("span", "xray-order-value");
    this.orderDisplay.textContent = "...";
    orderDiv.appendChild(this.orderDisplay);
    c.appendChild(orderDiv);

    // Exploded 3D section
    const explodedTitle = el("div", "xray-section-title");
    explodedTitle.textContent = "3D Exploded View";
    c.appendChild(explodedTitle);

    const sliderRow = el("div", "xray-slider-row");
    this.spreadSlider = document.createElement("input");
    this.spreadSlider.type = "range";
    this.spreadSlider.min = "0";
    this.spreadSlider.max = "100";
    this.spreadSlider.value = "0";

    this.spreadValue = el("span", "xray-slider-value");
    this.spreadValue.textContent = "0";

    sliderRow.append(this.spreadSlider, this.spreadValue);
    c.appendChild(sliderRow);

    this.spreadSlider.addEventListener("input", () => {
      const val = parseInt(this.spreadSlider!.value, 10);
      this.renderer.setSpread(val);
      this.spreadValue!.textContent = String(val);
    });

    // Palette section
    const palTitle = el("div", "xray-section-title");
    palTitle.textContent = "Palette";
    c.appendChild(palTitle);

    // Page selector (6 pages × 32 palettes each)
    const pageRow = el("div", "xray-palette-pages");
    for (let p = 0; p < 6; p++) {
      const btn = el("button", "xray-page-btn") as HTMLButtonElement;
      btn.textContent = String(p);
      if (p === 0) btn.classList.add("active");
      btn.addEventListener("click", () => {
        this.palettePage = p;
        pageRow.querySelectorAll(".xray-page-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
      pageRow.appendChild(btn);
    }
    const pageLabel = el("span");
    pageLabel.style.cssText = "font-size:0.65rem;color:#555;margin-left:6px;";
    pageLabel.textContent = "page";
    pageRow.appendChild(pageLabel);
    c.appendChild(pageRow);

    // Palette canvas: 16 colors × 32 palettes, cell = 15×7
    const CELL_W = 15;
    const CELL_H = 7;
    const palCanvas = document.createElement("canvas");
    palCanvas.width = 16 * CELL_W;  // 240
    palCanvas.height = 32 * CELL_H; // 224
    palCanvas.className = "xray-palette-canvas";
    this.paletteCanvas = palCanvas;
    this.paletteCtx = palCanvas.getContext("2d")!;
    c.appendChild(palCanvas);

    // Palette info on hover
    this.paletteInfo = el("div", "xray-palette-info") as HTMLDivElement;
    this.paletteInfo.textContent = "Hover to inspect";
    c.appendChild(this.paletteInfo);

    palCanvas.addEventListener("mousemove", (e) => {
      const rect = palCanvas.getBoundingClientRect();
      const sx = palCanvas.width / rect.width;
      const sy = palCanvas.height / rect.height;
      const cx = Math.floor((e.clientX - rect.left) * sx);
      const cy = Math.floor((e.clientY - rect.top) * sy);
      const colIdx = Math.floor(cx / CELL_W);
      const palIdx = Math.floor(cy / CELL_H);
      if (colIdx < 0 || colIdx >= 16 || palIdx < 0 || palIdx >= 32) return;

      const video = this.emulator.getVideo();
      if (!video) return;
      const cache = video.getPaletteCache();
      const absIdx = (this.palettePage * 32 + palIdx) * 16 + colIdx;
      const packed = cache[absIdx] ?? 0;
      // Packed is ABGR: 0xFFBBGGRR
      const r = packed & 0xFF;
      const g = (packed >> 8) & 0xFF;
      const b = (packed >> 16) & 0xFF;
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

      // Palette group labels
      const absPal = this.palettePage * 32 + palIdx;
      let group = "";
      if (absPal < 32) group = " (Sprites)";
      else if (absPal < 64) group = " (Scroll 1)";
      else if (absPal < 96) group = " (Scroll 2)";
      else if (absPal < 128) group = " (Scroll 3)";

      this.paletteInfo!.innerHTML =
        `<span style="display:inline-block;width:12px;height:12px;background:${hex};border:1px solid #333;vertical-align:middle;margin-right:4px;"></span>` +
        `Pal <b>${absPal}</b>${group} · Col <b>${colIdx}</b> · <code>${hex.toUpperCase()}</code>`;
    });

    palCanvas.addEventListener("mouseleave", () => {
      this.paletteInfo!.textContent = "Hover to inspect";
    });

    // Tile Inspector section
    const inspTitle = el("div", "xray-section-title");
    inspTitle.textContent = "Tile Inspector";
    c.appendChild(inspTitle);

    const inspHint = el("div");
    inspHint.style.cssText = "font-size:0.7rem;color:#555;padding:0 0 8px;";
    inspHint.textContent = "Click on the game screen to inspect a pixel";
    c.appendChild(inspHint);

    this.inspectorInfo = el("div", "xray-inspector-info") as HTMLDivElement;
    this.inspectorInfo.textContent = "No pixel selected";
    c.appendChild(this.inspectorInfo);

    // Sprite List section
    const sprTitle = el("div", "xray-section-title");
    sprTitle.textContent = "Sprites";
    c.appendChild(sprTitle);

    this.spriteListDiv = el("div", "xray-sprite-list") as HTMLDivElement;
    c.appendChild(this.spriteListDiv);

    // Register Viewer section
    const regTitle = el("div", "xray-section-title");
    regTitle.textContent = "Registers";
    c.appendChild(regTitle);

    this.registerDiv = el("div", "xray-register-view") as HTMLDivElement;
    c.appendChild(this.registerDiv);
  }

  private createLayerRow(layerId: number): HTMLDivElement {
    const row = el("div", "xray-layer-row") as HTMLDivElement;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.id = `xray-cb-${layerId}`;
    this.layerCheckboxes.set(layerId, cb);

    const label = el("label", "xray-layer-label") as HTMLLabelElement;
    label.htmlFor = cb.id;
    label.textContent = XRayRenderer.LAYER_NAMES[layerId]!;

    const badge = el("span", "xray-badge");
    badge.textContent = XRayRenderer.LAYER_BADGES[layerId]!;

    const flashBtn = el("button", "xray-flash-btn") as HTMLButtonElement;
    flashBtn.textContent = "Flash";

    cb.addEventListener("change", () => {
      this.renderer.setLayerEnabled(layerId, cb.checked);
    });

    flashBtn.addEventListener("click", () => {
      this.renderer.flashLayer(layerId);
    });

    row.append(cb, label, badge, flashBtn);
    return row;
  }

  private bindEvents(): void {
    // No additional bindings needed — events are bound in buildDOM
  }

  private showInspectResult(px: number, py: number, result: PixelInspectResult | null): void {
    if (!this.inspectorInfo) return;
    if (!result) {
      this.inspectorInfo.innerHTML = `<b>(${px}, ${py})</b> — transparent / empty`;
      return;
    }
    const hex = `#${result.r.toString(16).padStart(2, "0")}${result.g.toString(16).padStart(2, "0")}${result.b.toString(16).padStart(2, "0")}`;
    this.inspectorInfo.innerHTML =
      `<div style="margin-bottom:4px;">` +
        `<span style="display:inline-block;width:14px;height:14px;background:${hex};border:1px solid #333;vertical-align:middle;margin-right:6px;border-radius:2px;"></span>` +
        `<code>${hex.toUpperCase()}</code>` +
      `</div>` +
      `<div>Layer: <b>${result.layerName}</b></div>` +
      `<div>Position: <b>(${result.x}, ${result.y})</b></div>`;
  }

  private renderPalette(): void {
    const ctx = this.paletteCtx;
    const video = this.emulator.getVideo();
    if (!ctx || !video) return;

    const cache = video.getPaletteCache();
    const CELL_W = 15;
    const CELL_H = 7;
    const pageBase = this.palettePage * 32 * 16; // 32 palettes × 16 colors

    for (let pal = 0; pal < 32; pal++) {
      for (let col = 0; col < 16; col++) {
        const packed = cache[pageBase + pal * 16 + col] ?? 0;
        const r = packed & 0xFF;
        const g = (packed >> 8) & 0xFF;
        const b = (packed >> 16) & 0xFF;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(col * CELL_W, pal * CELL_H, CELL_W, CELL_H);
      }
    }
  }

  private renderSpriteList(): void {
    const div = this.spriteListDiv;
    const video = this.emulator.getVideo();
    if (!div || !video) return;

    const objBuf = video.getObjBuffer();
    const MAX = 256;
    let html = "";
    let count = 0;

    for (let i = 0; i < MAX; i++) {
      const off = i * 8;
      if (off + 7 >= objBuf.length) break;
      const colour = (objBuf[off + 6]! << 8) | objBuf[off + 7]!;
      if ((colour & 0xFF00) === 0xFF00) break;

      let sx = (objBuf[off]! << 8) | objBuf[off + 1]!;
      let sy = (objBuf[off + 2]! << 8) | objBuf[off + 3]!;
      const code = (objBuf[off + 4]! << 8) | objBuf[off + 5]!;
      const pal = colour & 0x1F;
      const flipX = (colour >> 5) & 1;
      const flipY = (colour >> 6) & 1;

      if (sx >= 512) sx -= 1024;
      if (sy >= 512) sy -= 1024;
      sx += 64;
      sy += 16;

      // Skip off-screen
      if (sx < -32 || sx >= SCREEN_WIDTH + 32 || sy < -32 || sy >= SCREEN_HEIGHT + 32) continue;

      const flip = (flipX ? "X" : "") + (flipY ? "Y" : "") || "--";
      html += `<div class="xray-sprite-entry">` +
        `<span class="xray-spr-idx">#${i}</span>` +
        `<span class="xray-spr-code">0x${code.toString(16).padStart(4, "0").toUpperCase()}</span>` +
        `<span class="xray-spr-pos">(${sx},${sy})</span>` +
        `<span class="xray-spr-pal">P:${pal.toString().padStart(2, "0")}</span>` +
        `<span class="xray-spr-flip">${flip}</span>` +
        `</div>`;
      count++;
      if (count >= 32) break; // cap display for perf
    }

    div.innerHTML = html || `<div style="color:#444;font-size:0.7rem;">No sprites</div>`;
  }

  private renderRegisters(): void {
    const div = this.registerDiv;
    const video = this.emulator.getVideo();
    if (!div || !video) return;

    const bufs = this.emulator.getBusBuffers();
    const cpsa = bufs.cpsaRegs;
    const cpsb = bufs.cpsbRegs;

    const readWord = (buf: Uint8Array, off: number) => (buf[off]! << 8) | buf[off + 1]!;

    const scr1X = readWord(cpsa, 0x0C);
    const scr1Y = readWord(cpsa, 0x0E);
    const scr2X = readWord(cpsa, 0x10);
    const scr2Y = readWord(cpsa, 0x12);
    const scr3X = readWord(cpsa, 0x14);
    const scr3Y = readWord(cpsa, 0x16);

    const layerOrder = video.getLayerOrder();
    const orderStr = layerOrder.map(id => LAYER_SHORT[id] ?? "?").join(" > ");

    div.innerHTML =
      `<div><span class="xray-reg-label">Scroll 1 XY</span> <code>${hex4(scr1X)} ${hex4(scr1Y)}</code></div>` +
      `<div><span class="xray-reg-label">Scroll 2 XY</span> <code>${hex4(scr2X)} ${hex4(scr2Y)}</code></div>` +
      `<div><span class="xray-reg-label">Scroll 3 XY</span> <code>${hex4(scr3X)} ${hex4(scr3Y)}</code></div>` +
      `<div><span class="xray-reg-label">Layer order</span> <code>${orderStr}</code></div>` +
      `<div><span class="xray-reg-label">S1 enabled</span> <code>${video.isLayerEnabled(LAYER_SCROLL1) ? "yes" : "no"}</code></div>` +
      `<div><span class="xray-reg-label">S2 enabled</span> <code>${video.isLayerEnabled(LAYER_SCROLL2) ? "yes" : "no"}</code></div>` +
      `<div><span class="xray-reg-label">S3 enabled</span> <code>${video.isLayerEnabled(LAYER_SCROLL3) ? "yes" : "no"}</code></div>`;
  }

  private startUpdateLoop(): void {
    let tick = 0;
    const update = (): void => {
      if (!this.active) return;

      tick++;

      // Update frame counter every 10 frames
      if (tick % 10 === 0 && this.frameCounter) {
        this.frameCounter.textContent = `Frame: ${this.emulator.getFrameCount()}`;
      }

      // Update draw order every 30 frames
      if (tick % 30 === 0 && this.orderDisplay) {
        const video = this.emulator.getVideo();
        if (video) {
          const order = video.getLayerOrder();
          this.orderDisplay.textContent = order
            .map(id => LAYER_SHORT[id] ?? "?")
            .join(" > ");
        }
      }

      // Update play/pause button state
      if (tick % 15 === 0 && this.playPauseBtn) {
        this.playPauseBtn.textContent = this.emulator.isPaused() ? "Play" : "Pause";
      }

      // Update palette grid every 15 frames (~4Hz)
      if (tick % 15 === 0) {
        this.renderPalette();
        this.renderSpriteList();
        this.renderRegisters();
      }

      this.updateRafId = requestAnimationFrame(update);
    };

    this.updateRafId = requestAnimationFrame(update);
  }
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function hex4(n: number): string {
  return "0x" + n.toString(16).padStart(4, "0").toUpperCase();
}
