/**
 * Sample Browser — list, preview, replace, and export OKI ADPCM samples.
 */

import JSZip from "jszip";
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
    const importBtn = el("button", "ctrl-btn smp-export") as HTMLButtonElement;
    importBtn.textContent = "Import Set";
    importBtn.title = "Import multiple WAV files (filename must contain sample number, e.g. 00.wav)";
    importBtn.addEventListener("click", () => this.importSamples());
    const exportBtn = el("button", "ctrl-btn smp-export") as HTMLButtonElement;
    exportBtn.textContent = "Export Set";
    exportBtn.title = "Download all samples as individual WAV files";
    exportBtn.addEventListener("click", () => this.exportSamples());
    const closeBtn = el("button", "smp-close");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.toggle());
    header.append(title, importBtn, exportBtn, closeBtn);
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
        this.showToast(`Sample #${phraseId} replaced`, true);
        setTimeout(() => this.refreshTable(), 1000);
      } else {
        dropZone.textContent = "ROM full";
        this.showToast(`Sample #${phraseId}: ROM full`, false);
      }
    } catch (err) {
      dropZone.textContent = "Error";
      this.showToast(`Sample #${phraseId}: import error`, false);
      console.error("Sample replace error:", err);
    }
  }

  // -- Record from mic --

  private async recordMic(phraseId: number, btn: HTMLButtonElement): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = this.getAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const sampleRate = ctx.sampleRate;
      const duration = 3; // seconds
      const bufferSize = Math.ceil(sampleRate * duration);
      const pcmChunks: Float32Array[] = [];

      btn.textContent = "\u23F9"; // ⏹
      btn.classList.add("recording");

      // Use ScriptProcessorNode to capture raw PCM (works everywhere)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      let samplesCollected = 0;

      processor.onaudioprocess = (e) => {
        if (samplesCollected >= bufferSize) return;
        const input = e.inputBuffer.getChannelData(0);
        pcmChunks.push(new Float32Array(input));
        samplesCollected += input.length;
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      setTimeout(() => {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
        btn.textContent = "...";

        // Concatenate PCM chunks
        const totalSamples = Math.min(samplesCollected, bufferSize);
        const pcm = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of pcmChunks) {
          const copy = Math.min(chunk.length, totalSamples - offset);
          pcm.set(chunk.subarray(0, copy), offset);
          offset += copy;
          if (offset >= totalSamples) break;
        }

        const adpcm = encodeSample(pcm, sampleRate);
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
      }, duration * 1000);
    } catch (err) {
      console.error("Mic recording error:", err);
      btn.textContent = "\uD83C\uDFA4";
    }
  }

  // -- Export Set (ZIP of WAVs) --

  private async exportSamples(): Promise<void> {
    const rom = this.emulator.getOkiRom();
    if (!rom || this.phrases.length === 0) return;

    const gameName = this.emulator.getGameName();
    const zip = new JSZip();

    for (const phrase of this.phrases) {
      const pcm = decodeSample(rom, phrase);
      if (pcm.length === 0) continue;
      const wav = pcmToWav(pcm, OKI_SAMPLE_RATE);
      zip.file(`${String(phrase.id).padStart(2, "0")}.wav`, wav);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${gameName}_samples.zip`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`Exported ${this.phrases.length} samples`, true);
  }

  // -- Import Set (ZIP of WAVs) or individual WAVs --

  private importSamples(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.wav,audio/*";
    input.multiple = true;
    input.addEventListener("change", async () => {
      const files = input.files;
      if (!files || files.length === 0) return;

      // If a ZIP file, extract and import all WAVs from it
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
        const arrayBuf = await entry.async("arraybuffer");
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        const pcm = audioBuf.getChannelData(0);
        const adpcm = encodeSample(pcm, audioBuf.sampleRate);
        if (replaceSampleInRom(rom, phraseId, adpcm)) replaced++;
      } catch (err) {
        console.warn(`Failed to import ${filename}:`, err);
      }
    }

    if (replaced > 0) {
      this.emulator.updateOkiRom(rom);
      this.refreshTable();
    }
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
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        const pcm = audioBuf.getChannelData(0);
        const adpcm = encodeSample(pcm, audioBuf.sampleRate);
        if (replaceSampleInRom(rom, phraseId, adpcm)) replaced++;
      } catch (err) {
        console.warn(`Failed to import ${file.name}:`, err);
      }
    }

    if (replaced > 0) {
      this.emulator.updateOkiRom(rom);
      this.refreshTable();
    }
    this.showToast(replaced > 0 ? `Imported ${replaced} sample${replaced > 1 ? "s" : ""}` : "No samples imported", replaced > 0);
  }

  private showToast(message: string, success: boolean): void {
    const toast = document.createElement("div");
    toast.className = `smp-toast ${success ? "success" : "error"}`;
    toast.textContent = message;
    this.container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  private extractPhraseId(filename: string): number {
    // Match "XX.wav" or "*_sample_XX.wav" or "XX_something.wav"
    const match = filename.match(/(\d{1,3})\.wav$/i) ?? filename.match(/sample_(\d{1,3})/i) ?? filename.match(/^(\d{1,3})[_.\-]/);
    if (!match) return -1;
    const id = parseInt(match[1]!, 10);
    return (id >= 0 && id < 128) ? id : -1;
  }
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/** Convert Float32 PCM to WAV file bytes. */
function pcmToWav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = pcm.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // PCM samples (Float32 → Int16)
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
