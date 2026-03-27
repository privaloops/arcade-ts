import { DebugRenderer, type PixelInspectResult } from "./debug-renderer";
import { LAYER_OBJ, LAYER_SCROLL1, LAYER_SCROLL2, LAYER_SCROLL3 } from "../video/cps1-video";
import { SpriteEditorUI } from "../editor/sprite-editor-ui";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../constants";
import type { Emulator } from "../emulator";

// Layer display order (visual, back→front by default)
const LAYER_IDS = [LAYER_SCROLL1, LAYER_OBJ, LAYER_SCROLL2, LAYER_SCROLL3];
const LAYER_SHORT: Record<number, string> = {
  [LAYER_OBJ]: "OBJ",
  [LAYER_SCROLL1]: "S1",
  [LAYER_SCROLL2]: "S2",
  [LAYER_SCROLL3]: "S3",
};

export class DebugPanel {
  private active = false;
  private readonly renderer: DebugRenderer;
  private readonly emulator: Emulator;

  // DOM references
  private readonly container: HTMLDivElement;
  private readonly debugBtn: HTMLElement;
  private readonly layerRows: Map<number, HTMLDivElement> = new Map();
  private readonly layerCheckboxes: Map<number, HTMLInputElement> = new Map();
  private readonly gridEnabled: Map<number, boolean> = new Map();
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

  // Sprite editor (integrated)
  private spriteEditorUI: SpriteEditorUI | null = null;

  getSpriteEditorUI(): SpriteEditorUI | null { return this.spriteEditorUI; }

  // Update throttle
  private updateRafId = 0;

  constructor(emulator: Emulator, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.emulator = emulator;
    this.renderer = new DebugRenderer(emulator, canvas);
    this.container = document.getElementById("dbg-panel") as HTMLDivElement;
    this.debugBtn = document.getElementById("dbg-btn")!;

    this.buildDOM();
    this.bindEvents();

    // If panel was pre-opened via HTML class, fully initialize
    if (this.container.classList.contains("open")) {
      this.open();
    }
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

    // If panel is open, ensure renderer is installed and update loop running
    if (this.active) {
      this.renderer.install();
      this.startUpdateLoop();
      this.spriteEditorUI?.activate();
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
    document.body.classList.add("dbg-active");
    this.debugBtn.classList.add("active");
    this.renderer.install();
    this.startUpdateLoop();

    // Tile inspector: listen for clicks on the game canvas
    this.inspectorClickHandler = (e: MouseEvent) => {
      if (this.renderer.isExplodedActive()) return; // 3D mode: drag only, no tile inspect
      const rect = this.canvas.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / rect.width * SCREEN_WIDTH);
      const py = Math.floor((e.clientY - rect.top) / rect.height * SCREEN_HEIGHT);
      const result = this.renderer.inspectPixel(px, py);
      this.showInspectResult(px, py, result);
    };
    this.canvas.addEventListener("click", this.inspectorClickHandler);

    // Activate sprite editor overlay
    this.spriteEditorUI?.activate();
  }

  private close(): void {
    this.active = false;
    this.container.classList.remove("open");
    document.body.classList.remove("dbg-active");
    this.debugBtn.classList.remove("active");
    this.renderer.uninstall();
    cancelAnimationFrame(this.updateRafId);

    // Deactivate sprite editor overlay
    this.spriteEditorUI?.deactivate();

    if (this.inspectorClickHandler) {
      this.canvas.removeEventListener("click", this.inspectorClickHandler);
      this.inspectorClickHandler = null;
    }
  }

  private buildDOM(): void {
    const c = this.container;
    c.innerHTML = "";

    // Header
    const header = el("div", "dbg-header");
    const title = el("h2");
    title.textContent = "Sprites & Tiles";
    const closeBtn = el("button", "dbg-close");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.toggle());
    header.append(title, closeBtn);
    c.appendChild(header);

    // Frame counter (displayed in header, updated from here)
    this.frameCounter = document.getElementById('frame-counter');
    // Step button (moved to header)
    const stepBtn = document.getElementById('step-btn') as HTMLButtonElement | null;
    stepBtn?.addEventListener("click", () => {
      const pauseBtn = document.getElementById('pause-btn');
      if (!this.emulator.isPaused()) {
        this.emulator.pause();
        this.emulator.suspendAudio();
        if (pauseBtn) pauseBtn.textContent = "Resume (P)";
      }
      this.emulator.stepFrame();
    });

    // ── Sprite / Tile Editor (injected directly, no collapsible wrapper) ──
    {
      const content = el("div");

      this.spriteEditorUI = new SpriteEditorUI(this.emulator, this.canvas);
      this.spriteEditorUI.getEditor().setLayerVisibilityFilter((id) => this.renderer.isLayerEnabled(id));
      this.spriteEditorUI.setInteractionBlocker(() => this.renderer.isExplodedActive());
      this.spriteEditorUI.setGridLayers(this.gridEnabled);
      this.spriteEditorUI.setHwLayerToggle((layerId, visible) => {
        this.renderer.setLayerEnabled(layerId, visible);
        const cb = this.layerCheckboxes.get(layerId);
        if (cb) cb.checked = visible;
        if (this.emulator.isPaused()) this.emulator.rerender();
      });
      this.spriteEditorUI.setSpreadChange((value) => {
        this.renderer.setSpread(value);
        if (this.spreadSlider) this.spreadSlider.value = String(value);
        if (this.spreadValue) this.spreadValue.textContent = String(value);
        if (this.emulator.isPaused()) this.emulator.rerender();
      });
      this.spriteEditorUI.buildInto(content);

      c.appendChild(content);
    }

    // Layers + 3D Exploded View moved to left panel (layer-panel.ts)
    // Keep layer rows for checkbox sync from left panel callbacks
    for (const layerId of LAYER_IDS) {
      this.createLayerRow(layerId);
    }
    this.orderDisplay = el("span", "dbg-order-value");

    {
      // Hidden spread slider (synced from left panel)
      this.spreadSlider = document.createElement("input");
      this.spreadSlider.type = "range";
      this.spreadSlider.min = "0";
      this.spreadSlider.max = "100";
      this.spreadSlider.value = "0";
      this.spreadValue = el("span", "dbg-slider-value");
      this.spreadValue.textContent = "0";

    }

    // ── Palette (closed by default) ──
    {
      const CELL_W = 15;
      const CELL_H = 7;

      const [sec, content] = collapsibleSection("Palette",
        "The CPS1 doesn't store pixel colors directly — it uses a color lookup table (palette).\n\n" +
        "Each tile stores color indices (0-15) that point to a palette of 16 colors. " +
        "The hardware has 192 palettes organized in 6 pages of 32:\n" +
        "• Page 0: Sprite palettes (characters, projectiles)\n" +
        "• Page 1: Scroll 1 palettes (HUD, text)\n" +
        "• Page 2: Scroll 2 palettes (main background)\n" +
        "• Page 3: Scroll 3 palettes (far background)\n\n" +
        "Watch palettes change live during fades, hit flashes, and character recolors (P1 vs P2).", false);

      const pageRow = el("div", "dbg-palette-pages");
      for (let p = 0; p < 6; p++) {
        const btn = el("button", "dbg-page-btn") as HTMLButtonElement;
        btn.textContent = String(p);
        if (p === 0) btn.classList.add("active");
        btn.addEventListener("click", () => {
          this.palettePage = p;
          pageRow.querySelectorAll(".dbg-page-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
        });
        pageRow.appendChild(btn);
      }
      const pageLabel = el("span");
      pageLabel.style.cssText = "font-size:0.65rem;color:#555;margin-left:6px;";
      pageLabel.textContent = "page";
      pageRow.appendChild(pageLabel);
      content.appendChild(pageRow);

      const palCanvas = document.createElement("canvas");
      palCanvas.width = 16 * CELL_W;
      palCanvas.height = 32 * CELL_H;
      palCanvas.className = "dbg-palette-canvas";
      this.paletteCanvas = palCanvas;
      this.paletteCtx = palCanvas.getContext("2d")!;
      content.appendChild(palCanvas);

      this.paletteInfo = el("div", "dbg-palette-info") as HTMLDivElement;
      this.paletteInfo.textContent = "Hover to inspect";
      content.appendChild(this.paletteInfo);

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
        const r = packed & 0xFF;
        const g = (packed >> 8) & 0xFF;
        const b = (packed >> 16) & 0xFF;
        const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

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

      c.appendChild(sec);
    }

    // ── Tile Inspector (closed by default) ──
    {
      const [sec, content] = collapsibleSection("Tile Inspector",
        "Click any pixel on the game screen to find out which hardware layer drew it.\n\n" +
        "The CPS1 renders each pixel from multiple overlapping layers. " +
        "This tool scans layers front-to-back to identify the first non-transparent layer " +
        "that owns the clicked pixel, showing its color and position.", false);

      const inspHint = el("div");
      inspHint.style.cssText = "font-size:0.7rem;color:#555;padding:0 0 8px;";
      inspHint.textContent = "Click on the game screen to inspect a pixel";
      content.appendChild(inspHint);

      this.inspectorInfo = el("div", "dbg-inspector-info") as HTMLDivElement;
      this.inspectorInfo.textContent = "No pixel selected";
      content.appendChild(this.inspectorInfo);

      c.appendChild(sec);
    }

    // ── Sprites (closed by default) ──
    {
      const [sec, content] = collapsibleSection("Sprites",
        "Live list of active sprite objects on screen.\n\n" +
        "Each sprite entry shows:\n" +
        "• # — index in the sprite table (lower = drawn on top)\n" +
        "• Code — tile number in the graphics ROM\n" +
        "• (X,Y) — screen position in pixels\n" +
        "• P — palette index (0-31)\n" +
        "• Flip — X/Y mirroring (used for left/right facing)\n\n" +
        "CPS1 supports up to 256 sprites per frame. Characters are typically multi-tile sprites.", false);

      this.spriteListDiv = el("div", "dbg-sprite-list") as HTMLDivElement;
      content.appendChild(this.spriteListDiv);

      c.appendChild(sec);
    }

    // ── Registers (closed by default) ──
    {
      const [sec, content] = collapsibleSection("Registers",
        "Live hardware register values from the CPS-A and CPS-B custom chips.\n\n" +
        "• Scroll XY — the camera offset for each background layer (in pixels)\n" +
        "• Layer order — which layers are drawn first (back) to last (front)\n" +
        "• Layer enables — whether each scroll layer is active\n\n" +
        "Games manipulate these registers every frame to scroll backgrounds, " +
        "enable/disable layers during transitions, and change draw priority.", false);

      this.registerDiv = el("div", "dbg-register-view") as HTMLDivElement;
      content.appendChild(this.registerDiv);

      c.appendChild(sec);
    }
  }

  private createLayerRow(layerId: number): HTMLDivElement {
    const row = el("div", "dbg-layer-row") as HTMLDivElement;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.id = `dbg-cb-${layerId}`;
    this.layerCheckboxes.set(layerId, cb);

    const label = el("label", "dbg-layer-label") as HTMLLabelElement;
    label.htmlFor = cb.id;
    label.textContent = DebugRenderer.LAYER_NAMES[layerId]!;

    const badge = el("span", "dbg-badge");
    badge.textContent = DebugRenderer.LAYER_BADGES[layerId]!;

    const flashBtn = el("button", "dbg-flash-btn") as HTMLButtonElement;
    flashBtn.textContent = "Flash";

    cb.addEventListener("change", () => {
      this.renderer.setLayerEnabled(layerId, cb.checked);
      if (this.emulator.isPaused()) this.emulator.rerender();
    });

    const gridCb = document.createElement("input");
    gridCb.type = "checkbox";
    gridCb.checked = false;
    gridCb.title = "Show tile grid";
    gridCb.className = "dbg-grid-cb";
    this.gridEnabled.set(layerId, gridCb.checked);
    gridCb.addEventListener("change", () => {
      this.gridEnabled.set(layerId, gridCb.checked);
      this.spriteEditorUI?.setGridLayers(this.gridEnabled);
    });

    flashBtn.addEventListener("click", () => {
      this.renderer.flashLayer(layerId);
    });

    row.append(cb, label, badge, gridCb, flashBtn);
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
      html += `<div class="dbg-sprite-entry">` +
        `<span class="dbg-spr-idx">#${i}</span>` +
        `<span class="dbg-spr-code">0x${code.toString(16).padStart(4, "0").toUpperCase()}</span>` +
        `<span class="dbg-spr-pos">(${sx},${sy})</span>` +
        `<span class="dbg-spr-pal">P:${pal.toString().padStart(2, "0")}</span>` +
        `<span class="dbg-spr-flip">${flip}</span>` +
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
      `<div><span class="dbg-reg-label">Scroll 1 XY</span> <code>${hex4(scr1X)} ${hex4(scr1Y)}</code></div>` +
      `<div><span class="dbg-reg-label">Scroll 2 XY</span> <code>${hex4(scr2X)} ${hex4(scr2Y)}</code></div>` +
      `<div><span class="dbg-reg-label">Scroll 3 XY</span> <code>${hex4(scr3X)} ${hex4(scr3Y)}</code></div>` +
      `<div><span class="dbg-reg-label">Layer order</span> <code>${orderStr}</code></div>` +
      `<div><span class="dbg-reg-label">S1 enabled</span> <code>${video.isLayerEnabled(LAYER_SCROLL1) ? "yes" : "no"}</code></div>` +
      `<div><span class="dbg-reg-label">S2 enabled</span> <code>${video.isLayerEnabled(LAYER_SCROLL2) ? "yes" : "no"}</code></div>` +
      `<div><span class="dbg-reg-label">S3 enabled</span> <code>${video.isLayerEnabled(LAYER_SCROLL3) ? "yes" : "no"}</code></div>`;
  }

  private startUpdateLoop(): void {
    let tick = 0;
    const update = (): void => {
      if (!this.active) return;

      tick++;

      // Update frame counter every 10 frames
      if (tick % 10 === 0 && this.frameCounter) {
        this.frameCounter.textContent = `Frame: ${this.emulator.getFrameCount()} | ${this.emulator.getFpsDisplay()} FPS`;
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

/**
 * Creates a collapsible section: clickable title + content container.
 * Returns [wrapper, contentDiv]. Append children to contentDiv.
 */
function collapsibleSection(text: string, tooltip: string, open = true): [HTMLDivElement, HTMLDivElement] {
  const wrapper = document.createElement("div");
  wrapper.className = "dbg-section";

  const header = document.createElement("div");
  header.className = "dbg-section-title";
  header.title = tooltip;

  const arrow = document.createElement("span");
  arrow.className = "dbg-section-arrow";
  arrow.textContent = open ? "\u25BE" : "\u25B8"; // ▾ or ▸

  const label = document.createElement("span");
  label.textContent = text;

  header.append(arrow, label);
  wrapper.appendChild(header);

  const content = document.createElement("div");
  content.className = "dbg-section-content";
  if (!open) content.style.display = "none";
  wrapper.appendChild(content);

  header.addEventListener("click", () => {
    const visible = content.style.display !== "none";
    content.style.display = visible ? "none" : "";
    arrow.textContent = visible ? "\u25B8" : "\u25BE";
  });

  return [wrapper, content];
}
