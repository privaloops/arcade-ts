/**
 * Audio DAW Panel — real-time visualization of CPS1 audio channels.
 *
 * Displays 8 FM channels (YM2151) and 4 OKI voices with note names,
 * key-on indicators, volume bars, and mute/solo controls.
 * Reads data from a visualization SharedArrayBuffer written by the audio worker.
 */

import { kcToNoteName, type VizReader } from "./audio-viz";
import type { Emulator } from "../emulator";

const FM_CHANNELS = 8;
const OKI_VOICES = 4;
const TOTAL_CHANNELS = FM_CHANNELS + OKI_VOICES;

// Per-channel colors for the piano roll and indicators
const CH_COLORS = [
  "#ff1a50", "#ff6b35", "#ffc234", "#4ecb71",
  "#36b5ff", "#8b5cf6", "#d946ef", "#f97316",
  "#06b6d4", "#84cc16", "#f43f5e", "#a78bfa",
];

export class AudioPanel {
  private active = false;
  private readonly emulator: Emulator;

  // DOM
  private readonly container: HTMLDivElement;
  private readonly audBtn: HTMLElement;
  private readonly channelRows: HTMLDivElement[] = [];
  private readonly noteEls: HTMLSpanElement[] = [];
  private readonly konEls: HTMLSpanElement[] = [];
  private readonly volBars: HTMLDivElement[] = [];

  // Piano roll canvas
  private pianoCanvas: HTMLCanvasElement | null = null;
  private pianoCtx: CanvasRenderingContext2D | null = null;

  // Update loop
  private updateRafId = 0;

  constructor(emulator: Emulator) {
    this.emulator = emulator;
    this.container = document.getElementById("aud-panel") as HTMLDivElement;
    this.audBtn = document.getElementById("aud-btn")!;
    this.buildDOM();

    // Sync if pre-opened via HTML class
    if (this.container.classList.contains("open")) {
      this.active = true;
      this.audBtn.classList.add("active");
    }
  }

  toggle(): void {
    if (this.active) this.close(); else this.open();
  }

  isOpen(): boolean {
    return this.active;
  }

  onGameChange(): void {
    if (this.active) this.startUpdateLoop();
  }

  destroy(): void {
    this.close();
    this.container.innerHTML = "";
  }

  // -- Lifecycle --

  private open(): void {
    this.active = true;
    this.container.classList.add("open");
    document.body.classList.add("aud-active");
    this.audBtn.classList.add("active");
    this.startUpdateLoop();
  }

  private close(): void {
    this.active = false;
    this.container.classList.remove("open");
    document.body.classList.remove("aud-active");
    this.audBtn.classList.remove("active");
    cancelAnimationFrame(this.updateRafId);
  }

  // -- DOM --

  private buildDOM(): void {
    const c = this.container;
    c.innerHTML = "";

    // Header
    const header = el("div", "aud-header");
    const title = el("h2");
    title.textContent = "Audio";
    const closeBtn = el("button", "aud-close");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.toggle());
    header.append(title, closeBtn);
    c.appendChild(header);

    // Channel rows
    const channels = el("div", "aud-channels");

    // FM channels
    for (let i = 0; i < FM_CHANNELS; i++) {
      const row = this.createChannelRow(i, `FM${i + 1}`, CH_COLORS[i]!);
      channels.appendChild(row);
    }

    // Separator
    const sep = el("div", "aud-separator");
    channels.appendChild(sep);

    // OKI voices
    for (let i = 0; i < OKI_VOICES; i++) {
      const row = this.createChannelRow(FM_CHANNELS + i, `PCM${i + 1}`, CH_COLORS[FM_CHANNELS + i]!);
      channels.appendChild(row);
    }

    c.appendChild(channels);

    // Piano roll canvas
    const pianoWrapper = el("div", "aud-piano-wrapper");
    this.pianoCanvas = document.createElement("canvas");
    this.pianoCanvas.className = "aud-piano-canvas";
    this.pianoCanvas.height = TOTAL_CHANNELS * 16;
    this.pianoCanvas.width = 400;
    this.pianoCtx = this.pianoCanvas.getContext("2d")!;
    this.pianoCtx.fillStyle = "#0a0a0a";
    this.pianoCtx.fillRect(0, 0, this.pianoCanvas.width, this.pianoCanvas.height);
    pianoWrapper.appendChild(this.pianoCanvas);
    c.appendChild(pianoWrapper);
  }

  private createChannelRow(idx: number, name: string, color: string): HTMLDivElement {
    const row = el("div", "aud-ch-row") as HTMLDivElement;

    // Color indicator
    const colorDot = el("span", "aud-ch-color");
    colorDot.style.background = color;
    row.appendChild(colorDot);

    // Name
    const nameEl = el("span", "aud-ch-name");
    nameEl.textContent = name;
    row.appendChild(nameEl);

    // Note (FM only)
    const noteEl = el("span", "aud-ch-note") as HTMLSpanElement;
    noteEl.textContent = "--";
    row.appendChild(noteEl);
    this.noteEls[idx] = noteEl;

    // Key-on indicator
    const konEl = el("span", "aud-ch-kon") as HTMLSpanElement;
    row.appendChild(konEl);
    this.konEls[idx] = konEl;

    // Volume bar container + fill
    const volContainer = el("div", "aud-vol-container");
    const volBar = el("div", "aud-vol-bar") as HTMLDivElement;
    volBar.style.background = color;
    volBar.style.width = "0%";
    volContainer.appendChild(volBar);
    row.appendChild(volContainer);
    this.volBars[idx] = volBar;

    this.channelRows[idx] = row;
    return row;
  }

  // -- Update loop --

  private startUpdateLoop(): void {
    cancelAnimationFrame(this.updateRafId);
    let tick = 0;

    const update = (): void => {
      if (!this.active) return;
      tick++;

      // Update at ~20Hz (every 3 frames at 60fps)
      if (tick % 3 === 0) {
        this.updateChannels();
        this.updatePianoRoll();
      }

      this.updateRafId = requestAnimationFrame(update);
    };

    this.updateRafId = requestAnimationFrame(update);
  }

  private updateChannels(): void {
    const viz = this.emulator.getVizReader();
    if (!viz) return;

    // FM channels
    for (let ch = 0; ch < FM_CHANNELS; ch++) {
      const fm = viz.getFm(ch);
      this.noteEls[ch]!.textContent = fm.kon ? kcToNoteName(fm.kc) : "--";
      this.konEls[ch]!.classList.toggle("active", fm.kon);
      const vol = Math.max(0, (127 - fm.tl) / 127 * 100);
      this.volBars[ch]!.style.width = `${fm.kon ? vol : 0}%`;
    }

    // OKI voices
    for (let v = 0; v < OKI_VOICES; v++) {
      const oki = viz.getOki(v);
      const idx = FM_CHANNELS + v;
      this.noteEls[idx]!.textContent = oki.playing ? `#${oki.phraseId}` : "--";
      this.konEls[idx]!.classList.toggle("active", oki.playing);
      const vol = oki.volume / 255 * 100;
      this.volBars[idx]!.style.width = `${oki.playing ? vol : 0}%`;
    }
  }

  private updatePianoRoll(): void {
    const ctx = this.pianoCtx;
    const cvs = this.pianoCanvas;
    const viz = this.emulator.getVizReader();
    if (!ctx || !cvs || !viz) return;

    const w = cvs.width;
    const rowH = 16;

    // Scroll left by 1 pixel
    ctx.drawImage(cvs, -1, 0);

    // Clear rightmost column
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(w - 1, 0, 1, cvs.height);

    // Draw active channels on the rightmost column
    for (let ch = 0; ch < FM_CHANNELS; ch++) {
      const fm = viz.getFm(ch);
      if (fm.kon) {
        ctx.fillStyle = CH_COLORS[ch]!;
        ctx.fillRect(w - 1, ch * rowH + 2, 1, rowH - 4);
      }
    }

    for (let v = 0; v < OKI_VOICES; v++) {
      const oki = viz.getOki(v);
      if (oki.playing) {
        ctx.fillStyle = CH_COLORS[FM_CHANNELS + v]!;
        ctx.fillRect(w - 1, (FM_CHANNELS + v) * rowH + 2, 1, rowH - 4);
      }
    }
  }
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
