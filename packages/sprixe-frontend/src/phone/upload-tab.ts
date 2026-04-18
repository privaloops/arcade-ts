/**
 * UploadTab — Upload section of the phone page (§2.9).
 *
 * Owns a file picker + drop zone + per-file queue view. Emits one
 * onUpload(file) call per queued entry, driven by the consumer's
 * transfer controller (Phase 3.6 wires PeerSend via PhonePage).
 *
 * Queue ordering is FIFO. Adding a second batch appends to the tail;
 * removing entries preserves the remaining order. Entries in state
 * 'uploading' refuse abort by default so an in-flight transfer can't
 * be silently cancelled mid-stream — Phase 3.12 will re-enable abort
 * once reconnection is wired.
 */

export type QueueStatus = "queued" | "uploading" | "done" | "error" | "aborted";

export interface QueueEntry {
  id: string;
  name: string;
  size: number;
  file: File;
  status: QueueStatus;
  sent: number;
  total: number;
  error?: string;
}

type Listener = (entries: readonly QueueEntry[]) => void;

export interface UploadTabOptions {
  /** Called whenever new files join the queue. */
  onAdd?: (entries: readonly QueueEntry[]) => void;
  /** Called when an entry is removed. */
  onRemove?: (entry: QueueEntry) => void;
}

let nextEntryId = 0;

export class UploadTab {
  readonly root: HTMLDivElement;

  private readonly dropZone: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private readonly queueEl: HTMLUListElement;
  private readonly entries: QueueEntry[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly onAdd: ((entries: readonly QueueEntry[]) => void) | undefined;
  private readonly onRemove: ((entry: QueueEntry) => void) | undefined;

  constructor(container: HTMLElement, options: UploadTabOptions = {}) {
    this.onAdd = options.onAdd;
    this.onRemove = options.onRemove;

    this.root = document.createElement("div");
    this.root.className = "af-upload-tab";
    this.root.setAttribute("data-testid", "upload-tab");

    this.dropZone = document.createElement("div");
    this.dropZone.className = "af-upload-dropzone";
    this.dropZone.setAttribute("data-testid", "upload-dropzone");
    this.dropZone.innerHTML = `
      <div class="af-upload-dropzone-label">Tap to pick ROMs<br>or drag & drop here</div>
      <div class="af-upload-dropzone-hint">.zip files · MAME format</div>
    `;
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".zip";
    this.fileInput.multiple = true;
    this.fileInput.setAttribute("data-testid", "upload-file-input");
    this.fileInput.style.position = "absolute";
    this.fileInput.style.inset = "0";
    this.fileInput.style.opacity = "0";
    this.fileInput.style.cursor = "pointer";
    this.dropZone.appendChild(this.fileInput);
    this.root.appendChild(this.dropZone);

    this.fileInput.addEventListener("change", () => {
      const files = this.fileInput.files;
      if (!files) return;
      this.addFiles(Array.from(files));
      this.fileInput.value = ""; // allow re-adding the same file
    });

    this.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.dropZone.classList.add("is-over");
    });
    this.dropZone.addEventListener("dragleave", () => {
      this.dropZone.classList.remove("is-over");
    });
    this.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      this.dropZone.classList.remove("is-over");
      const files = e.dataTransfer?.files;
      if (!files) return;
      this.addFiles(Array.from(files));
    });

    this.queueEl = document.createElement("ul");
    this.queueEl.className = "af-upload-queue";
    this.queueEl.setAttribute("data-testid", "upload-queue");
    this.root.appendChild(this.queueEl);

    container.appendChild(this.root);
    this.render();
  }

  /** Append `files` to the tail of the queue in iteration order. */
  addFiles(files: File[]): void {
    const added: QueueEntry[] = [];
    for (const file of files) {
      if (!file) continue;
      const entry: QueueEntry = {
        id: `entry-${++nextEntryId}`,
        name: file.name,
        size: file.size,
        file,
        status: "queued",
        sent: 0,
        total: file.size,
      };
      this.entries.push(entry);
      added.push(entry);
    }
    if (added.length > 0) {
      this.onAdd?.(added);
      this.notify();
    }
  }

  /**
   * Remove an entry by id. Entries in state 'uploading' refuse removal
   * — callers must wait for the transfer to complete or error out
   * before calling again.
   */
  remove(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    const entry = this.entries[idx]!;
    if (entry.status === "uploading") return false;
    this.entries.splice(idx, 1);
    this.onRemove?.(entry);
    this.notify();
    return true;
  }

  getEntries(): readonly QueueEntry[] {
    return this.entries;
  }

  updateEntry(id: string, patch: Partial<QueueEntry>): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    Object.assign(entry, patch);
    this.notify();
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Testing helper — render the current queue into the DOM. */
  render(): void {
    this.queueEl.textContent = "";
    for (const entry of this.entries) {
      const li = document.createElement("li");
      li.className = "af-upload-entry";
      li.dataset.entryId = entry.id;
      li.dataset.status = entry.status;

      const nameEl = document.createElement("span");
      nameEl.className = "af-upload-entry-name";
      nameEl.textContent = entry.name;
      li.appendChild(nameEl);

      const statusEl = document.createElement("span");
      statusEl.className = "af-upload-entry-status";
      statusEl.textContent = formatStatus(entry);
      li.appendChild(statusEl);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "af-upload-entry-remove";
      removeBtn.dataset.entryId = entry.id;
      removeBtn.setAttribute("data-testid", "upload-entry-remove");
      removeBtn.textContent = "✕";
      removeBtn.disabled = entry.status === "uploading";
      removeBtn.addEventListener("click", () => this.remove(entry.id));
      li.appendChild(removeBtn);

      this.queueEl.appendChild(li);
    }
  }

  private notify(): void {
    this.render();
    for (const l of this.listeners) l(this.entries);
  }
}

function formatStatus(entry: QueueEntry): string {
  switch (entry.status) {
    case "queued":    return "Queued";
    case "uploading": return `${Math.round((entry.sent * 100) / Math.max(1, entry.total))}%`;
    case "done":      return "✓ Done";
    case "error":     return `Error: ${entry.error ?? "unknown"}`;
    case "aborted":   return "Aborted";
  }
}
