/**
 * PhonePage — minimal upload UI shown at /send/{roomId} (§2.9).
 *
 * Phase 3.5 scaffold: file input + upload button + progress label.
 * Phase 3.6 replaces the skeleton with a proper tab switcher (Upload
 * / Remote), drag-and-drop, and a queue view. The scaffold is just
 * enough for the Week 1 end-to-end transfer E2E to exercise the
 * PeerSend plumbing end-to-end.
 */

import { PeerSend, TransferError } from "../../p2p/peer-send";

export interface PhonePageOptions {
  roomId: string;
}

export class PhonePage {
  readonly root: HTMLDivElement;

  private readonly fileInput: HTMLInputElement;
  private readonly uploadBtn: HTMLButtonElement;
  private readonly statusEl: HTMLDivElement;
  private readonly progressEl: HTMLDivElement;
  private readonly send: PeerSend;

  constructor(container: HTMLElement, options: PhonePageOptions) {
    this.root = document.createElement("div");
    this.root.className = "af-phone-page";
    this.root.setAttribute("data-testid", "phone-page");
    this.root.dataset.roomId = options.roomId;

    const title = document.createElement("h1");
    title.className = "af-phone-title";
    title.textContent = "Sprixe Arcade — Upload ROMs";
    this.root.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "af-phone-sub";
    sub.textContent = `Room: ${options.roomId}`;
    this.root.appendChild(sub);

    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".zip";
    this.fileInput.multiple = false;
    this.fileInput.setAttribute("data-testid", "phone-file-input");
    this.root.appendChild(this.fileInput);

    this.uploadBtn = document.createElement("button");
    this.uploadBtn.type = "button";
    this.uploadBtn.textContent = "Upload";
    this.uploadBtn.className = "af-phone-upload";
    this.uploadBtn.setAttribute("data-testid", "phone-upload-btn");
    this.uploadBtn.addEventListener("click", () => this.handleUpload());
    this.root.appendChild(this.uploadBtn);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "af-phone-status";
    this.statusEl.setAttribute("data-testid", "phone-status");
    this.statusEl.textContent = "Idle";
    this.root.appendChild(this.statusEl);

    this.progressEl = document.createElement("div");
    this.progressEl.className = "af-phone-progress";
    this.progressEl.setAttribute("data-testid", "phone-progress");
    this.progressEl.textContent = "0%";
    this.root.appendChild(this.progressEl);

    container.appendChild(this.root);
    this.send = new PeerSend({ roomId: options.roomId });
  }

  private async handleUpload(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) {
      this.setStatus("Pick a .zip first");
      return;
    }

    this.uploadBtn.disabled = true;
    try {
      this.setStatus("Connecting…");
      await this.send.connect();

      this.setStatus(`Sending ${file.name}`);
      const data = await file.arrayBuffer();
      await this.send.sendFile(file.name, data, {
        onProgress: (sent, total) => {
          this.setProgress(Math.round((sent * 100) / total));
        },
      });
      this.setStatus("Done");
      this.setProgress(100);
    } catch (e) {
      if (e instanceof TransferError) {
        this.setStatus(`Error: ${e.message}`);
      } else if (e instanceof Error) {
        this.setStatus(`Unexpected: ${e.message}`);
      } else {
        this.setStatus("Unknown transfer failure");
      }
    } finally {
      this.uploadBtn.disabled = false;
    }
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  private setProgress(percent: number): void {
    this.progressEl.textContent = `${percent}%`;
  }
}
