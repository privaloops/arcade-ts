/**
 * Sample Browser — list, preview, replace, and export OKI ADPCM samples.
 */

import { parsePhraseTable, decodeSample, encodeSample, replaceSampleInRom, OKI_SAMPLE_RATE, type PhraseInfo } from "./oki-codec";
import type { Emulator } from "../emulator";

export class SampleBrowser {
  private active = false;
  private readonly emulator: Emulator;
  private readonly container: HTMLDivElement;
  private readonly sampleBtn: HTMLElement;
  private tableBody: HTMLElement | null = null;
  private phrases: PhraseInfo[] = [];
  private audioCtx: AudioContext | null = null;

  constructor(emulator: Emulator) {
    this.emulator = emulator;
    this.container = document.getElementById("sample-panel") as HTMLDivElement;
    this.sampleBtn = document.getElementById("sample-btn")!;
    this.buildDOM();
    if (this.container.classList.contains("open")) {
      this.active = true;
      this.sampleBtn.classList.add("active");
    }
  }

  toggle(): void { if (this.active) this.close(); else this.open(); }
  isOpen(): boolean { return this.active; }

  onGameChange(): void {
    this.refreshTable();
  }

  destroy(): void { this.close(); this.container.innerHTML = ""; }

  private open(): void {
    this.active = true;
    this.container.classList.add("open");
    this.sampleBtn.classList.add("active");
    this.refreshTable();
  }

  private close(): void {
    this.active = false;
    this.container.classList.remove("open");
    this.sampleBtn.classList.remove("active");
  }

  // -- DOM --

  private buildDOM(): void {
    const c = this.container;
    c.innerHTML = "";

    // Header
    const header = el("div", "smp-header");
    const title = el("h2");
    title.textContent = "Samples";
    const exportBtn = el("button", "ctrl-btn smp-export") as HTMLButtonElement;
    exportBtn.textContent = "Export ROM";
    exportBtn.addEventListener("click", () => this.exportRom());
    const closeBtn = el("button", "smp-close");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.toggle());
    header.append(title, exportBtn, closeBtn);
    c.appendChild(header);

    // Table
    const table = el("table", "smp-table");
    const thead = el("thead");
    thead.innerHTML = `<tr><th>#</th><th>Duration</th><th>Size</th><th>Play</th><th>Replace</th></tr>`;
    table.appendChild(thead);
    this.tableBody = el("tbody");
    table.appendChild(this.tableBody);
    c.appendChild(table);
  }

  private refreshTable(): void {
    if (!this.tableBody) return;
    const rom = this.emulator.getOkiRom();
    if (!rom) {
      this.tableBody.innerHTML = `<tr><td colspan="5" style="color:#555;text-align:center;padding:12px;">No OKI ROM loaded</td></tr>`;
      return;
    }

    this.phrases = parsePhraseTable(rom);
    this.tableBody.innerHTML = "";

    for (const phrase of this.phrases) {
      const tr = document.createElement("tr");

      // ID
      const tdId = el("td");
      tdId.textContent = String(phrase.id).padStart(2, "0");
      tr.appendChild(tdId);

      // Duration
      const tdDur = el("td");
      tdDur.textContent = `${(phrase.durationMs / 1000).toFixed(2)}s`;
      tr.appendChild(tdDur);

      // Size
      const tdSize = el("td");
      tdSize.textContent = phrase.sizeBytes > 1024
        ? `${(phrase.sizeBytes / 1024).toFixed(1)} KB`
        : `${phrase.sizeBytes} B`;
      tr.appendChild(tdSize);

      // Play button
      const tdPlay = el("td");
      const playBtn = el("button", "smp-play-btn") as HTMLButtonElement;
      playBtn.textContent = "\u25B6";
      playBtn.title = "Preview sample";
      playBtn.addEventListener("click", () => this.playSample(phrase));
      tdPlay.appendChild(playBtn);
      tr.appendChild(tdPlay);

      // Replace: drop zone + mic button
      const tdReplace = el("td", "smp-replace-cell");

      // Drop zone
      const dropZone = el("div", "smp-drop") as HTMLDivElement;
      dropZone.textContent = "Drop WAV";
      dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        const file = (e as DragEvent).dataTransfer?.files[0];
        if (file) this.replaceWithFile(phrase.id, file, dropZone);
      });
      // Also click to browse
      dropZone.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".wav,audio/*";
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (file) this.replaceWithFile(phrase.id, file, dropZone);
        });
        input.click();
      });
      tdReplace.appendChild(dropZone);

      // Mic button
      const micBtn = el("button", "smp-mic-btn") as HTMLButtonElement;
      micBtn.textContent = "\uD83C\uDFA4"; // 🎤
      micBtn.title = "Record from microphone";
      micBtn.addEventListener("click", () => this.recordMic(phrase.id, micBtn));
      tdReplace.appendChild(micBtn);

      tr.appendChild(tdReplace);
      this.tableBody!.appendChild(tr);
    }
  }

  // -- Audio preview --

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    return this.audioCtx;
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

  // -- Replace with WAV file --

  private async replaceWithFile(phraseId: number, file: File, dropZone: HTMLElement): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;

    try {
      dropZone.textContent = "Encoding...";
      const ctx = this.getAudioCtx();
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);

      // Get mono PCM
      const pcm = audioBuf.getChannelData(0);
      const adpcm = encodeSample(pcm, audioBuf.sampleRate);

      if (replaceSampleInRom(rom, phraseId, adpcm)) {
        this.emulator.updateOkiRom(rom);
        dropZone.textContent = "\u2713 Replaced";
        dropZone.classList.add("replaced");
        // Refresh table to show new size/duration
        setTimeout(() => this.refreshTable(), 1000);
      } else {
        dropZone.textContent = "Error: ROM full";
      }
    } catch (err) {
      dropZone.textContent = "Error";
      console.error("Sample replace error:", err);
    }
  }

  // -- Record from mic --

  private async recordMic(phraseId: number, btn: HTMLButtonElement): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      btn.textContent = "\u23F9"; // ⏹
      btn.classList.add("recording");

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        btn.textContent = "...";

        const blob = new Blob(chunks, { type: "audio/webm" });
        const ctx = this.getAudioCtx();
        const arrayBuf = await blob.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        const pcm = audioBuf.getChannelData(0);
        const adpcm = encodeSample(pcm, audioBuf.sampleRate);

        if (replaceSampleInRom(rom, phraseId, adpcm)) {
          this.emulator.updateOkiRom(rom);
          btn.textContent = "\u2713";
          setTimeout(() => {
            btn.textContent = "\uD83C\uDFA4";
            btn.classList.remove("recording");
            this.refreshTable();
          }, 1000);
        } else {
          btn.textContent = "\uD83C\uDFA4";
          btn.classList.remove("recording");
        }
      };

      mediaRecorder.start();
      // Stop after 3 seconds (OKI samples are short)
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 3000);
    } catch (err) {
      console.error("Mic recording error:", err);
      btn.textContent = "\uD83C\uDFA4";
    }
  }

  // -- Export ROM --

  private exportRom(): void {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;
    const blob = new Blob([new Uint8Array(rom)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.emulator.getGameName()}_oki.bin`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
