/**
 * PhonePage — mounted at /send/{roomId} (§2.9).
 *
 * Phase 3.6 switches the scaffold to a real UploadTab with a FIFO
 * upload worker: PeerSend connects once on mount, then every queued
 * entry is streamed in order. Per-entry progress flows through
 * UploadTab.updateEntry() → DOM row refresh. Errors mark the entry
 * as 'error' without blocking the worker on subsequent files.
 *
 * Phase 3.7 will add a tab switcher and a RemoteTab sibling; until
 * then the page shows only the upload view.
 */

import { PeerSend, TransferError } from "../../p2p/peer-send";
import { UploadTab, type QueueEntry } from "../../phone/upload-tab";

export interface PhonePageOptions {
  roomId: string;
  /** Injected for tests that don't want a real PeerSend. */
  sendFactory?: () => TransferClient;
}

export interface TransferClient {
  connect(): Promise<void>;
  sendFile(name: string, data: ArrayBuffer, options?: { onProgress?: (sent: number, total: number) => void }): Promise<void>;
  close(): void;
}

export class PhonePage {
  readonly root: HTMLDivElement;

  private readonly uploadTab: UploadTab;
  private readonly statusEl: HTMLDivElement;
  private readonly send: TransferClient;
  private readonly processing = new Set<string>();
  private connectPromise: Promise<void> | null = null;

  constructor(container: HTMLElement, options: PhonePageOptions) {
    this.root = document.createElement("div");
    this.root.className = "af-phone-page";
    this.root.setAttribute("data-testid", "phone-page");
    this.root.dataset.roomId = options.roomId;

    const title = document.createElement("h1");
    title.className = "af-phone-title";
    title.textContent = "Sprixe Arcade";
    this.root.appendChild(title);

    const sub = document.createElement("p");
    sub.className = "af-phone-sub";
    sub.textContent = `Room: ${options.roomId}`;
    this.root.appendChild(sub);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "af-phone-status";
    this.statusEl.setAttribute("data-testid", "phone-status");
    this.statusEl.textContent = "Idle";
    this.root.appendChild(this.statusEl);

    this.send = options.sendFactory
      ? options.sendFactory()
      : new PeerSend({ roomId: options.roomId });

    this.uploadTab = new UploadTab(this.root, {
      onAdd: (entries) => this.queueAll(entries),
    });

    container.appendChild(this.root);
  }

  getUploadTab(): UploadTab {
    return this.uploadTab;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.setStatus("Connecting…");
      this.connectPromise = this.send.connect().then(
        () => { this.setStatus("Ready"); },
        (err) => {
          this.setStatus(`Connect failed: ${describeError(err)}`);
          throw err;
        }
      );
    }
    return this.connectPromise;
  }

  private async queueAll(entries: readonly QueueEntry[]): Promise<void> {
    for (const entry of entries) {
      if (this.processing.has(entry.id)) continue;
      this.processing.add(entry.id);
      try {
        await this.ensureConnected();
        await this.uploadOne(entry);
      } catch {
        // Per-entry errors are already surfaced on the entry itself;
        // keep draining the queue so one bad file doesn't stall the rest.
      } finally {
        this.processing.delete(entry.id);
      }
    }
  }

  private async uploadOne(entry: QueueEntry): Promise<void> {
    this.uploadTab.updateEntry(entry.id, { status: "uploading", sent: 0 });
    this.setStatus(`Sending ${entry.name}`);
    try {
      const data = await entry.file.arrayBuffer();
      await this.send.sendFile(entry.name, data, {
        onProgress: (sent, total) => {
          this.uploadTab.updateEntry(entry.id, { sent, total });
        },
      });
      this.uploadTab.updateEntry(entry.id, {
        status: "done",
        sent: entry.file.size,
        total: entry.file.size,
      });
      this.setStatus(`${entry.name} uploaded`);
    } catch (e) {
      this.uploadTab.updateEntry(entry.id, {
        status: "error",
        error: describeError(e),
      });
      this.setStatus(`Error on ${entry.name}`);
      throw e;
    }
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }
}

function describeError(e: unknown): string {
  if (e instanceof TransferError) return e.message;
  if (e instanceof Error) return e.message;
  return "unknown error";
}
