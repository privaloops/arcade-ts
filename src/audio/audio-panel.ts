/**
 * Audio DAW Panel — Cubase Key Editor style.
 *
 * FM section: 3-column grid
 *   Left:   channel strips (M/S, VU, name, note)
 *   Middle: shared vertical piano keyboard (80px, spans all 8 rows)
 *   Right:  per-channel piano roll timelines (note blocks by pitch)
 *
 * OKI section: channel strips + waveforms
 */

import { kcToNoteName, type VizReader } from "./audio-viz";
import { parsePhraseTable, decodeSample, encodeSample, replaceSampleInRom, OKI_SAMPLE_RATE, type PhraseInfo } from "./oki-codec";
import JSZip from "jszip";
import type { Emulator } from "../emulator";

const FM_CHANNELS = 8;
const OKI_VOICES = 4;

// Piano: 3 octaves C2-B4
const PR_FIRST_OCTAVE = 2;
const PR_OCTAVES = 3;
const PR_KEYS = PR_OCTAVES * 12; // 36
const FM_ROW_H = 32; // px per FM channel strip
const FM_TOTAL_H = FM_CHANNELS * FM_ROW_H; // 256
const KB_WIDTH = 44;
const KEY_H = FM_TOTAL_H / PR_KEYS; // ~7px per key
const TIMELINE_W = 400; // shared width for all timelines (FM + OKI)
const RULER_H = 16;     // height of the frame ruler bar
const MAJOR_TICK = 600;  // big tick + label interval (frames)

const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const NOTE_LABELS = ["C", "", "D", "", "E", "F", "", "G", "", "A", "", "B"];

const KC_TO_SEMI = [1, 2, 3, -1, 4, 5, 6, -1, 7, 8, 9, -1, 10, 11, 0, -1];
function kcToAbsSemitone(kc: number): number {
  const octave = (kc >> 4) & 7;
  const noteIdx = kc & 0xF;
  const semi = KC_TO_SEMI[noteIdx];
  if (semi === undefined || semi < 0) return -1;
  return octave * 12 + semi;
}

const CH_COLORS = [
  "#ff1a50", "#ff6b35", "#ffc234", "#4ecb71",
  "#36b5ff", "#8b5cf6", "#d946ef", "#f97316",
  "#06b6d4", "#84cc16", "#f43f5e", "#a78bfa",
];

export class AudioPanel {
  private active = false;
  private readonly emulator: Emulator;

  private readonly container: HTMLDivElement;
  private readonly audBtn: HTMLElement;

  // Per-channel
  private readonly noteEls: HTMLSpanElement[] = [];
  private readonly vuCanvases: HTMLCanvasElement[] = [];
  private readonly vuCtxs: (CanvasRenderingContext2D | null)[] = [];
  private readonly muteButtons: HTMLButtonElement[] = [];
  private readonly soloButtons: HTMLButtonElement[] = [];

  // FM timelines (per-channel canvas, pitch on Y)
  private readonly fmTimeCanvases: HTMLCanvasElement[] = [];
  private readonly fmTimeCtxs: (CanvasRenderingContext2D | null)[] = [];

  // Frame ruler
  private rulerCanvas: HTMLCanvasElement | null = null;
  private rulerCtx: CanvasRenderingContext2D | null = null;
  private rulerInfoEl: HTMLSpanElement | null = null;

  // Shared keyboard canvas — shows notes of the selected FM channel
  private kbCanvas: HTMLCanvasElement | null = null;
  private kbCtx: CanvasRenderingContext2D | null = null;
  private selectedFmChannel = 0; // which FM channel the keyboard follows
  private readonly fmStripEls: HTMLElement[] = [];

  // OKI waveforms
  private readonly waveCanvases: HTMLCanvasElement[] = [];
  private readonly waveCtxs: (CanvasRenderingContext2D | null)[] = [];
  private readonly prevWaveY: number[] = [5, 5, 5, 5];

  // Tabs
  private tracksContent: HTMLDivElement | null = null;
  private samplesContent: HTMLDivElement | null = null;
  private activeTab: "tracks" | "samples" = "tracks";
  private tracksTabBtn: HTMLButtonElement | null = null;
  private samplesTabBtn: HTMLButtonElement | null = null;

  // Sample browser
  private sampleTableBody: HTMLElement | null = null;
  private phrases: PhraseInfo[] = [];
  private sampleAudioCtx: AudioContext | null = null;

  // Mute/Solo
  private readonly muted = new Set<number>();
  private readonly soloed = new Set<number>();

  private updateRafId = 0;

  // Frame tick tracking for timeline grid
  private lastFrameCount = 0;
  private tickAccumulator = 0; // sub-pixel accumulator for frame ticks

  constructor(emulator: Emulator) {
    this.emulator = emulator;
    this.container = document.getElementById("aud-panel") as HTMLDivElement;
    this.audBtn = document.getElementById("aud-btn")!;
    this.buildDOM();
    if (this.container.classList.contains("open")) {
      this.active = true;
      this.audBtn.classList.add("active");
    }
  }

  toggle(): void { if (this.active) this.close(); else this.open(); }
  isOpen(): boolean { return this.active; }

  onGameChange(): void {
    this.muted.clear();
    this.soloed.clear();
    for (const btn of this.muteButtons) btn?.classList.remove("active");
    for (const btn of this.soloButtons) btn?.classList.remove("active");
    const viz = this.emulator.getVizReader();
    if (viz) viz.setChannelMask(0xFFF);
    if (this.active) this.startUpdateLoop();
  }

  destroy(): void { this.close(); this.container.innerHTML = ""; }

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

    // Header with tabs
    const header = el("div", "aud-header");
    const title = el("h2");
    title.textContent = "Audio";

    this.tracksTabBtn = el("button", "aud-tab-btn active") as HTMLButtonElement;
    this.tracksTabBtn.textContent = "Tracks";
    this.tracksTabBtn.addEventListener("click", () => this.switchTab("tracks"));

    this.samplesTabBtn = el("button", "aud-tab-btn") as HTMLButtonElement;
    this.samplesTabBtn.textContent = "Samples";
    this.samplesTabBtn.addEventListener("click", () => this.switchTab("samples"));

    const closeBtn = el("button", "aud-close");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.toggle());
    header.append(title, this.tracksTabBtn, this.samplesTabBtn, closeBtn);
    c.appendChild(header);

    // -- Tracks tab content --
    this.tracksContent = el("div", "aud-tab-content") as HTMLDivElement;

    // Frame ruler (above the FM grid)
    const rulerWrap = el("div", "aud-ruler-wrap") as HTMLDivElement;
    const rulerCvs = document.createElement("canvas");
    rulerCvs.width = TIMELINE_W;
    rulerCvs.height = RULER_H;
    rulerCvs.className = "aud-ruler";
    this.rulerCanvas = rulerCvs;
    this.rulerCtx = rulerCvs.getContext("2d")!;
    this.rulerCtx.fillStyle = "#141414";
    this.rulerCtx.fillRect(0, 0, TIMELINE_W, RULER_H);
    rulerWrap.appendChild(rulerCvs);
    this.rulerInfoEl = el("span", "aud-ruler-info") as HTMLSpanElement;
    rulerWrap.appendChild(this.rulerInfoEl);
    this.tracksContent.appendChild(rulerWrap);

    // FM Section — 3-column grid: controls | keyboard | timelines
    const fmGrid = el("div", "aud-fm-grid") as HTMLDivElement;
    fmGrid.style.cssText = `display:grid; grid-template-columns: auto ${KB_WIDTH}px 1fr; grid-template-rows: repeat(${FM_CHANNELS}, ${FM_ROW_H}px); gap:0;`;

    // Column 1: channel strips
    for (let ch = 0; ch < FM_CHANNELS; ch++) {
      const strip = el("div", "aud-fm-strip");
      strip.append(
        this.createMuteBtn(ch),
        this.createSoloBtn(ch),
        this.createVu(ch),
      );
      const colorDot = el("span", "aud-ch-color");
      colorDot.style.background = CH_COLORS[ch]!;
      strip.appendChild(colorDot);
      const nameEl = el("span", "aud-ch-name");
      nameEl.textContent = `FM${ch + 1}`;
      strip.appendChild(nameEl);
      const noteEl = el("span", "aud-ch-note") as HTMLSpanElement;
      noteEl.textContent = "--";
      strip.appendChild(noteEl);
      this.noteEls[ch] = noteEl;

      // Click to select this channel for the keyboard
      strip.addEventListener("click", () => this.selectFmChannel(ch));
      if (ch === 0) strip.classList.add("selected");
      this.fmStripEls[ch] = strip;

      fmGrid.appendChild(strip);
    }

    // Column 2: shared keyboard (spans all 8 rows)
    this.kbCanvas = document.createElement("canvas");
    this.kbCanvas.width = KB_WIDTH;
    this.kbCanvas.height = FM_TOTAL_H;
    this.kbCanvas.className = "aud-kb-canvas";
    this.kbCanvas.style.cssText = `grid-column:2; grid-row:1/${FM_CHANNELS + 1};`;
    this.kbCtx = this.kbCanvas.getContext("2d")!;
    this.drawKeyboard();
    fmGrid.appendChild(this.kbCanvas);

    // Column 3: per-channel timelines (one canvas per row)
    for (let ch = 0; ch < FM_CHANNELS; ch++) {
      const cvs = document.createElement("canvas");
      cvs.width = TIMELINE_W;
      cvs.height = FM_ROW_H;
      cvs.className = "aud-fm-timeline";
      cvs.style.cssText = `grid-column:3; grid-row:${ch + 1};`;
      const ctx = cvs.getContext("2d")!;
      ctx.fillStyle = "#181818";
      ctx.fillRect(0, 0, TIMELINE_W, FM_ROW_H);
      fmGrid.appendChild(cvs);
      this.fmTimeCanvases[ch] = cvs;
      this.fmTimeCtxs[ch] = ctx;
    }

    this.tracksContent.appendChild(fmGrid);
    this.tracksContent.appendChild(el("div", "aud-separator"));

    const okiSection = el("div", "aud-channels");
    for (let v = 0; v < OKI_VOICES; v++) {
      okiSection.appendChild(this.createOkiRow(v));
    }
    this.tracksContent.appendChild(okiSection);
    c.appendChild(this.tracksContent);

    // -- Samples tab content --
    this.samplesContent = el("div", "aud-tab-content") as HTMLDivElement;
    this.samplesContent.style.display = "none";
    this.buildSamplesTab();
    c.appendChild(this.samplesContent);
  }

  private buildSamplesTab(): void {
    const sc = this.samplesContent!;
    sc.innerHTML = "";

    // Import/Export buttons
    const actions = el("div", "smp-actions");
    const importBtn = el("button", "ctrl-btn") as HTMLButtonElement;
    importBtn.textContent = "Import Set";
    importBtn.style.cssText = "font-size:0.6rem;padding:3px 8px;";
    importBtn.addEventListener("click", () => this.importSamples());
    const exportBtn = el("button", "ctrl-btn") as HTMLButtonElement;
    exportBtn.textContent = "Export Set";
    exportBtn.style.cssText = "font-size:0.6rem;padding:3px 8px;";
    exportBtn.addEventListener("click", () => this.exportSamples());
    actions.append(importBtn, exportBtn);
    sc.appendChild(actions);

    // Table
    const table = el("table", "smp-table");
    const thead = el("thead");
    thead.innerHTML = `<tr><th>#</th><th>Duration</th><th>Size</th><th>Play</th><th>Replace</th></tr>`;
    table.appendChild(thead);
    this.sampleTableBody = el("tbody");
    table.appendChild(this.sampleTableBody);
    sc.appendChild(table);
  }

  private switchTab(tab: "tracks" | "samples"): void {
    this.activeTab = tab;
    if (this.tracksContent) this.tracksContent.style.display = tab === "tracks" ? "" : "none";
    if (this.samplesContent) this.samplesContent.style.display = tab === "samples" ? "" : "none";
    this.tracksTabBtn?.classList.toggle("active", tab === "tracks");
    this.samplesTabBtn?.classList.toggle("active", tab === "samples");
    if (tab === "samples") this.refreshSampleTable();
  }

  private refreshSampleTable(): void {
    if (!this.sampleTableBody) return;
    const rom = this.emulator.getOkiRom();
    if (!rom) {
      this.sampleTableBody.innerHTML = `<tr><td colspan="5" style="color:#555;text-align:center;padding:12px;">No OKI ROM</td></tr>`;
      return;
    }
    this.phrases = parsePhraseTable(rom);
    this.sampleTableBody.innerHTML = "";

    for (const phrase of this.phrases) {
      const tr = document.createElement("tr");
      const tdId = el("td"); tdId.textContent = String(phrase.id).padStart(2, "0");
      const tdDur = el("td"); tdDur.textContent = `${(phrase.durationMs / 1000).toFixed(2)}s`;
      const tdSize = el("td"); tdSize.textContent = phrase.sizeBytes > 1024 ? `${(phrase.sizeBytes / 1024).toFixed(1)} KB` : `${phrase.sizeBytes} B`;

      const tdPlay = el("td");
      const playBtn = el("button", "smp-play-btn") as HTMLButtonElement;
      playBtn.textContent = "\u25B6";
      playBtn.addEventListener("click", () => this.playSample(phrase));
      tdPlay.appendChild(playBtn);

      const tdReplace = el("td", "smp-replace-cell");
      const dropZone = el("div", "smp-drop") as HTMLDivElement;
      dropZone.textContent = "Drop WAV";
      dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault(); dropZone.classList.remove("drag-over");
        const file = (e as DragEvent).dataTransfer?.files[0];
        if (file) this.replaceWithFile(phrase.id, file, dropZone);
      });
      dropZone.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".wav,audio/*";
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (file) this.replaceWithFile(phrase.id, file, dropZone);
        });
        input.click();
      });
      tdReplace.appendChild(dropZone);

      tr.append(tdId, tdDur, tdSize, tdPlay, tdReplace);
      this.sampleTableBody.appendChild(tr);
    }
  }

  private createVu(idx: number): HTMLCanvasElement {
    const vu = document.createElement("canvas");
    vu.width = 4; vu.height = 16; vu.className = "aud-vu";
    this.vuCanvases[idx] = vu;
    this.vuCtxs[idx] = vu.getContext("2d");
    return vu;
  }

  private createOkiRow(voice: number): HTMLDivElement {
    const idx = FM_CHANNELS + voice;
    const color = CH_COLORS[idx]!;
    const row = el("div", "aud-ch-row") as HTMLDivElement;

    row.append(this.createMuteBtn(idx), this.createSoloBtn(idx), this.createVu(idx));

    const colorDot = el("span", "aud-ch-color");
    colorDot.style.background = color;
    row.appendChild(colorDot);
    const nameEl = el("span", "aud-ch-name");
    nameEl.textContent = `PCM${voice + 1}`;
    row.appendChild(nameEl);
    const noteEl = el("span", "aud-ch-note") as HTMLSpanElement;
    noteEl.textContent = "--";
    row.appendChild(noteEl);
    this.noteEls[idx] = noteEl;

    const wave = document.createElement("canvas");
    wave.width = 300; wave.height = 10;
    wave.className = "aud-hit-timeline";
    const wctx = wave.getContext("2d")!;
    wctx.fillStyle = "#1a1a1a";
    wctx.fillRect(0, 0, 300, 10);
    row.appendChild(wave);
    this.waveCanvases[voice] = wave;
    this.waveCtxs[voice] = wctx;

    return row;
  }

  private createMuteBtn(idx: number): HTMLButtonElement {
    const btn = el("button", "aud-ms-btn") as HTMLButtonElement;
    btn.textContent = "M";
    btn.addEventListener("click", () => {
      if (this.muted.has(idx)) this.muted.delete(idx); else this.muted.add(idx);
      btn.classList.toggle("active", this.muted.has(idx));
      this.updateChannelMask();
    });
    this.muteButtons[idx] = btn;
    return btn;
  }

  private createSoloBtn(idx: number): HTMLButtonElement {
    const btn = el("button", "aud-ms-btn aud-solo-btn") as HTMLButtonElement;
    btn.textContent = "S";
    btn.addEventListener("click", () => {
      if (this.soloed.has(idx)) this.soloed.delete(idx); else this.soloed.add(idx);
      btn.classList.toggle("active", this.soloed.has(idx));
      this.updateChannelMask();
    });
    this.soloButtons[idx] = btn;
    return btn;
  }

  // -- Sample operations --

  private getAudioCtx(): AudioContext {
    if (!this.sampleAudioCtx) this.sampleAudioCtx = new AudioContext();
    return this.sampleAudioCtx;
  }

  private playSample(phrase: PhraseInfo): void {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;
    const pcm = decodeSample(rom, phrase);
    const ctx = this.getAudioCtx();
    const buffer = ctx.createBuffer(1, pcm.length, OKI_SAMPLE_RATE);
    buffer.getChannelData(0).set(pcm);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }

  private async replaceWithFile(phraseId: number, file: File, dropZone: HTMLElement): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;
    try {
      dropZone.textContent = "Encoding...";
      const ctx = this.getAudioCtx();
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const pcm = audioBuf.getChannelData(0);
      const adpcm = encodeSample(pcm, audioBuf.sampleRate);
      const result = replaceSampleInRom(rom, phraseId, adpcm);
      if (result.success) {
        this.emulator.updateOkiRom(rom);
        dropZone.textContent = "\u2713 OK";
        dropZone.classList.add("replaced");
        if (result.truncated) {
          this.showToast(`Sample #${phraseId} replaced (truncated: ${result.keptMs}ms / ${result.originalMs}ms)`, true);
        } else {
          this.showToast(`Sample #${phraseId} replaced`, true);
        }
        setTimeout(() => this.refreshSampleTable(), 1000);
      } else {
        this.showToast(`Sample #${phraseId}: invalid slot`, false);
      }
    } catch (err) {
      this.showToast(`Sample #${phraseId}: error`, false);
      console.error("Replace error:", err);
    }
  }

  private async exportSamples(): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom || this.phrases.length === 0) return;
    const gameName = this.emulator.getGameName();
    const zip = new JSZip();
    for (const phrase of this.phrases) {
      const pcm = decodeSample(rom, phrase);
      if (pcm.length === 0) continue;
      zip.file(`${String(phrase.id).padStart(2, "0")}.wav`, pcmToWav(pcm, OKI_SAMPLE_RATE));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${gameName}_samples.zip`; a.click();
    URL.revokeObjectURL(url);
    this.showToast(`Exported ${this.phrases.length} samples`, true);
  }

  private importSamples(): void {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".zip,.wav,audio/*"; input.multiple = true;
    input.addEventListener("change", async () => {
      const files = input.files;
      if (!files || files.length === 0) return;
      if (files.length === 1 && files[0]!.name.endsWith(".zip")) {
        await this.importFromZip(files[0]!);
      } else {
        await this.importFromFiles(Array.from(files));
      }
    });
    input.click();
  }

  private async importFromZip(file: File): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const ctx = this.getAudioCtx();
    let replaced = 0;
    for (const [filename, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const phraseId = this.extractPhraseId(filename);
      if (phraseId < 0) continue;
      try {
        const buf = await entry.async("arraybuffer");
        const audioBuf = await ctx.decodeAudioData(buf);
        const adpcm = encodeSample(audioBuf.getChannelData(0), audioBuf.sampleRate);
        if (replaceSampleInRom(rom, phraseId, adpcm)) replaced++;
      } catch { /* skip bad files */ }
    }
    if (replaced > 0) { this.emulator.updateOkiRom(rom); this.refreshSampleTable(); }
    this.showToast(replaced > 0 ? `Imported ${replaced} sample${replaced > 1 ? "s" : ""}` : "No samples imported", replaced > 0);
  }

  private async importFromFiles(files: File[]): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;
    const ctx = this.getAudioCtx();
    let replaced = 0;
    for (const file of files) {
      const phraseId = this.extractPhraseId(file.name);
      if (phraseId < 0) continue;
      try {
        const buf = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(buf);
        const adpcm = encodeSample(audioBuf.getChannelData(0), audioBuf.sampleRate);
        if (replaceSampleInRom(rom, phraseId, adpcm)) replaced++;
      } catch { /* skip */ }
    }
    if (replaced > 0) { this.emulator.updateOkiRom(rom); this.refreshSampleTable(); }
    this.showToast(replaced > 0 ? `Imported ${replaced} sample${replaced > 1 ? "s" : ""}` : "No samples imported", replaced > 0);
  }

  private extractPhraseId(filename: string): number {
    const match = filename.match(/(\d{1,3})\.wav$/i) ?? filename.match(/sample_(\d{1,3})/i) ?? filename.match(/^(\d{1,3})[_.\-]/);
    if (!match) return -1;
    const id = parseInt(match[1]!, 10);
    return (id >= 0 && id < 128) ? id : -1;
  }

  private showToast(message: string, success: boolean): void {
    const toast = document.createElement("div");
    toast.className = `smp-toast ${success ? "success" : "error"}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  private selectFmChannel(ch: number): void {
    this.selectedFmChannel = ch;
    for (let i = 0; i < FM_CHANNELS; i++) {
      this.fmStripEls[i]?.classList.toggle("selected", i === ch);
    }
  }

  private updateChannelMask(): void {
    const viz = this.emulator.getVizReader();
    if (!viz) return;
    let mask = 0;
    if (this.soloed.size > 0) {
      for (const ch of this.soloed) mask |= (1 << ch);
    } else {
      mask = 0xFFF;
      for (const ch of this.muted) mask &= ~(1 << ch);
    }
    console.log(`[audio] channelMask=0x${mask.toString(16)} soloed=${[...this.soloed]} muted=${[...this.muted]}`);
    viz.setChannelMask(mask);
  }

  // -- Keyboard Drawing --

  private drawKeyboard(activeNotes?: Map<number, string>): void {
    const ctx = this.kbCtx!;
    const w = KB_WIDTH;
    const h = FM_TOTAL_H;
    const blackW = Math.round(w * 0.55);

    // Fill entire keyboard white
    ctx.fillStyle = "#ccc";
    ctx.fillRect(0, 0, w, h);

    // Draw white key separators (between E/F and B/C — the naturals without sharps between)
    for (let i = 0; i < PR_KEYS; i++) {
      const semi = i % 12;
      if (IS_BLACK[semi]) continue;
      const y = (PR_KEYS - 1 - i) * KEY_H;
      // Bottom border of each white key
      ctx.fillStyle = "#999";
      ctx.fillRect(0, y + KEY_H - 1, w, 1);
    }

    // Draw black keys on top (shorter, only covers left portion)
    for (let i = 0; i < PR_KEYS; i++) {
      const semi = i % 12;
      if (!IS_BLACK[semi]) continue;
      const y = (PR_KEYS - 1 - i) * KEY_H;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, y, blackW, KEY_H);
      // Highlight edge
      ctx.fillStyle = "#333";
      ctx.fillRect(blackW - 1, y, 1, KEY_H);
    }

    // C labels
    for (let i = 0; i < PR_KEYS; i += 12) {
      const y = (PR_KEYS - 1 - i) * KEY_H;
      const octave = PR_FIRST_OCTAVE + Math.floor(i / 12);
      ctx.fillStyle = "#666";
      ctx.font = `${Math.min(KEY_H - 1, 9)}px Courier New`;
      ctx.fillText(`C${octave}`, blackW + 2, y + KEY_H - 1);
    }

    // Highlight active notes (pressed keys)
    if (activeNotes) {
      for (const [absSemi, color] of activeNotes) {
        const offset = absSemi - PR_FIRST_OCTAVE * 12;
        if (offset < 0 || offset >= PR_KEYS) continue;
        const y = (PR_KEYS - 1 - offset) * KEY_H;
        const semi = offset % 12;
        const isBlack = IS_BLACK[semi];

        // Colored pressed key
        ctx.fillStyle = color;
        if (isBlack) {
          ctx.fillRect(0, y, blackW, KEY_H);
        } else {
          ctx.fillRect(0, y, w, KEY_H - 1);
        }
        // Glow
        ctx.fillStyle = color + "33";
        ctx.fillRect(0, Math.max(0, y - 1), w, KEY_H + 2);
      }
    }
  }

  // -- Update --

  private startUpdateLoop(): void {
    cancelAnimationFrame(this.updateRafId);
    let tick = 0;
    const update = (): void => {
      if (!this.active) return;
      tick++;
      if (tick % 3 === 0) this.updateAll();
      this.updateRafId = requestAnimationFrame(update);
    };
    this.updateRafId = requestAnimationFrame(update);
  }

  private updateAll(): void {
    const viz = this.emulator.getVizReader();
    if (!viz) return;

    const curFrame = this.emulator.getFrameCount();
    const advancing = curFrame > this.lastFrameCount;

    // Scroll 1px per update, only when the game is advancing
    if (advancing) {
      // Ruler
      if (this.rulerCtx && this.rulerCanvas) {
        const rCtx = this.rulerCtx;
        rCtx.drawImage(this.rulerCanvas, 1, 0);
        rCtx.fillStyle = "#141414";
        rCtx.fillRect(0, 0, 1, RULER_H);

        // Tick at leftmost pixel based on current frame
        if (curFrame % MAJOR_TICK === 0 && curFrame > 0) {
          rCtx.fillStyle = "rgba(255,255,255,0.35)";
          rCtx.fillRect(0, 0, 1, RULER_H);
        } else if (curFrame % 60 === 0) {
          rCtx.fillStyle = "rgba(255,255,255,0.18)";
          rCtx.fillRect(0, RULER_H - 5, 1, 5);
        }
      }

      // FM timelines — scroll + clear leftmost pixel
      for (let ch = 0; ch < FM_CHANNELS; ch++) {
        const tCtx = this.fmTimeCtxs[ch];
        const tCvs = this.fmTimeCanvases[ch];
        if (!tCtx || !tCvs) continue;
        tCtx.drawImage(tCvs, 1, 0);
        tCtx.fillStyle = "#181818";
        tCtx.fillRect(0, 0, 1, FM_ROW_H);
      }

      // OKI waveforms — scroll + clear leftmost pixel
      for (let v = 0; v < OKI_VOICES; v++) {
        const wCvs = this.waveCanvases[v];
        const wCtx = this.waveCtxs[v];
        if (!wCtx || !wCvs) continue;
        wCtx.drawImage(wCvs, 1, 0);
        wCtx.fillStyle = "#1a1a1a";
        wCtx.fillRect(0, 0, 1, 10);
      }

      this.lastFrameCount = curFrame;
    }

    // FPS + frame counter (DOM, no canvas text)
    if (this.rulerInfoEl) {
      this.rulerInfoEl.textContent = `F${curFrame}  ${this.emulator.getFpsDisplay()}fps`;
    }

    // FM channels — update strips (VU, note name) + draw current pixel
    for (let ch = 0; ch < FM_CHANNELS; ch++) {
      const fm = viz.getFm(ch);
      const color = CH_COLORS[ch]!;

      this.noteEls[ch]!.textContent = fm.kon ? kcToNoteName(fm.kc) : "--";

      const vol = fm.kon ? Math.max(0, (127 - fm.tl) / 127 * 100) : 0;
      const vuCtx = this.vuCtxs[ch];
      if (vuCtx) this.drawVuMeter(vuCtx, vol, color);

      if (advancing) {
        const tCtx = this.fmTimeCtxs[ch];
        if (tCtx && fm.kon) {
          tCtx.fillStyle = color;
          tCtx.fillRect(0, 2, 1, FM_ROW_H - 4);
        }
      }
    }

    // Keyboard + piano roll
    const selCh = this.selectedFmChannel;
    const selFm = viz.getFm(selCh);
    const selColor = CH_COLORS[selCh]!;
    const activeNotes = new Map<number, string>();
    if (selFm.kon) {
      activeNotes.set(kcToAbsSemitone(selFm.kc), selColor);
    }
    this.drawKeyboard(activeNotes);

    // OKI voices — update strips + draw current pixel
    for (let v = 0; v < OKI_VOICES; v++) {
      const oki = viz.getOki(v);
      const idx = FM_CHANNELS + v;
      const color = CH_COLORS[idx]!;

      this.noteEls[idx]!.textContent = oki.playing ? `#${oki.phraseId}` : "--";

      const vol = oki.playing ? (oki.volume / 255 * 100) : 0;
      const vuCtx = this.vuCtxs[idx];
      if (vuCtx) this.drawVuMeter(vuCtx, vol, color);

      if (advancing) {
        const wCtx = this.waveCtxs[v];
        if (wCtx) {
          const signal = oki.playing ? oki.signal : 128;
          const h = 10;
          const y = h - (signal / 255) * h;
          const prevY = this.prevWaveY[v]!;
          const minY = Math.min(y, prevY);
          const maxY = Math.max(y, prevY);
          wCtx.fillStyle = color;
          wCtx.fillRect(0, minY, 1, Math.max(1, maxY - minY + 1));
          this.prevWaveY[v] = y;
        }
      }
    }
  }

  private drawVuMeter(ctx: CanvasRenderingContext2D, level: number, color: string): void {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 4, 16);
    if (level > 0) {
      const barH = (level / 100) * 16;
      ctx.fillStyle = color;
      ctx.fillRect(0, 16 - barH, 4, barH);
    }
  }

}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function pcmToWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = pcm.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);
  const w = (off: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}
