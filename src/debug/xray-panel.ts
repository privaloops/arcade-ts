import { XRayRenderer } from "./xray-renderer";
import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from "../video/cps1-video";
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

  // Update throttle
  private updateRafId = 0;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
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
  }

  private close(): void {
    this.active = false;
    this.container.classList.remove("open");
    document.body.classList.remove("xray-active");
    this.xrayBtn.classList.remove("active");
    this.renderer.uninstall();
    cancelAnimationFrame(this.updateRafId);
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
      // Disable parallax if exploded is active
      if (val > 0 && this.renderer.isParallaxActive()) {
        this.renderer.setParallax(false);
        parallaxCb.checked = false;
      }
    });

    // Parallax 2.5D section
    const parallaxTitle = el("div", "xray-section-title");
    parallaxTitle.textContent = "2.5D Parallax";
    c.appendChild(parallaxTitle);

    const parallaxToggleRow = el("div", "xray-toggle-row");
    const parallaxCb = document.createElement("input");
    parallaxCb.type = "checkbox";
    parallaxCb.id = "xray-parallax-toggle";
    const parallaxLabel = el("label", "xray-toggle-label") as HTMLLabelElement;
    parallaxLabel.htmlFor = parallaxCb.id;
    parallaxLabel.textContent = "Enable (mouse tracking)";
    parallaxToggleRow.append(parallaxCb, parallaxLabel);
    c.appendChild(parallaxToggleRow);

    const parallaxSliderRow = el("div", "xray-slider-row");
    const parallaxSlider = document.createElement("input");
    parallaxSlider.type = "range";
    parallaxSlider.min = "0";
    parallaxSlider.max = "100";
    parallaxSlider.value = "50";
    const parallaxSliderVal = el("span", "xray-slider-value");
    parallaxSliderVal.textContent = "50";
    parallaxSliderRow.append(parallaxSlider, parallaxSliderVal);
    c.appendChild(parallaxSliderRow);

    const parallaxHint = el("div");
    parallaxHint.style.cssText = "font-size:0.65rem;color:#444;padding:4px 0;";
    parallaxHint.textContent = "Move mouse over the game to shift layers by depth";
    c.appendChild(parallaxHint);

    parallaxCb.addEventListener("change", () => {
      this.renderer.setParallax(parallaxCb.checked);
      // Disable exploded if parallax is activated
      if (parallaxCb.checked && this.renderer.getSpread() > 0) {
        this.renderer.setSpread(0);
        this.spreadSlider!.value = "0";
        this.spreadValue!.textContent = "0";
      }
    });

    parallaxSlider.addEventListener("input", () => {
      const val = parseInt(parallaxSlider.value, 10);
      this.renderer.setParallaxIntensity(val);
      parallaxSliderVal.textContent = String(val);
    });
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
