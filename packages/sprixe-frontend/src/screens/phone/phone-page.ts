/**
 * PhonePage — mounted at /send/{roomId} (§2.9).
 *
 * Phase 4b.5 adds the Upload / Remote tab switcher on top of the
 * existing upload worker. The Remote tab pipes RemoteTab.onCommand
 * down the live PeerSend DataConnection, and listens for the host's
 * 'state' messages (sent via StateSync) so the RemoteTab's enabled
 * matrix reflects what the kiosk is doing.
 */

import { PeerSend, TransferError } from "../../p2p/peer-send";
import { sendFileWithReconnect, type ResumableSender } from "../../p2p/reconnect";
import { UploadTab, type QueueEntry } from "../../phone/upload-tab";
import { RemoteTab, type KioskState, type Command } from "../../phone/remote-tab";
import type { KioskToPhoneMessage } from "../../p2p/protocol";

export interface PhonePageOptions {
  roomId: string;
  /** Injected for tests that don't want a real PeerSend. Controls the
   * persistent state-sync channel. */
  sendFactory?: () => TransferClient;
  /** Optional factory used to build ephemeral senders for retry
   * attempts. Defaults to `new PeerSend(...)`. Keeping this separate
   * from `sendFactory` lets the state-sync connection stay alive even
   * when an upload attempt fails. */
  uploadSendFactory?: () => ResumableSender;
}

export interface TransferClient {
  connect(): Promise<void>;
  sendFile(
    name: string,
    data: ArrayBuffer,
    options?: { onProgress?: (sent: number, total: number) => void; startByte?: number }
  ): Promise<void>;
  close(): void;
  /** Phase 4b.5 — optional live connection exposure so RemoteTab can ride along. */
  getConnection?(): unknown;
}

type Tab = "upload" | "remote";

export class PhonePage {
  readonly root: HTMLDivElement;

  private readonly uploadTab: UploadTab;
  private readonly remoteTab: RemoteTab;
  private readonly uploadPane: HTMLDivElement;
  private readonly remotePane: HTMLDivElement;
  private readonly uploadTabBtn: HTMLButtonElement;
  private readonly remoteTabBtn: HTMLButtonElement;
  private readonly statusEl: HTMLDivElement;
  private readonly retryBtn: HTMLButtonElement;
  private readonly send: TransferClient;
  private readonly uploadSendFactory: () => ResumableSender;
  private readonly processing = new Set<string>();
  private connectPromise: Promise<void> | null = null;
  private activeTab: Tab = "upload";

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

    // Tab switcher
    const tabBar = document.createElement("div");
    tabBar.className = "af-phone-tabs";
    this.uploadTabBtn = this.makeTabBtn("Upload", "upload");
    this.remoteTabBtn = this.makeTabBtn("Remote", "remote");
    tabBar.appendChild(this.uploadTabBtn);
    tabBar.appendChild(this.remoteTabBtn);
    this.root.appendChild(tabBar);

    this.statusEl = document.createElement("div");
    this.statusEl.className = "af-phone-status";
    this.statusEl.setAttribute("data-testid", "phone-status");
    this.statusEl.textContent = "Idle";
    this.root.appendChild(this.statusEl);

    this.retryBtn = document.createElement("button");
    this.retryBtn.type = "button";
    this.retryBtn.className = "af-phone-retry";
    this.retryBtn.setAttribute("data-testid", "phone-retry");
    this.retryBtn.textContent = "Retry connection";
    this.retryBtn.hidden = true;
    this.retryBtn.addEventListener("click", () => {
      this.connectPromise = null;
      this.retryBtn.hidden = true;
      void this.ensureConnected().catch(() => { /* status + button restored by ensureConnected */ });
    });
    this.root.appendChild(this.retryBtn);

    this.uploadPane = document.createElement("div");
    this.uploadPane.className = "af-phone-pane";
    this.uploadPane.setAttribute("data-testid", "phone-pane-upload");
    this.root.appendChild(this.uploadPane);

    this.remotePane = document.createElement("div");
    this.remotePane.className = "af-phone-pane";
    this.remotePane.setAttribute("data-testid", "phone-pane-remote");
    this.root.appendChild(this.remotePane);

    this.send = options.sendFactory
      ? options.sendFactory()
      : new PeerSend({ roomId: options.roomId });
    this.uploadSendFactory = options.uploadSendFactory
      ?? (() => new PeerSend({ roomId: options.roomId }));

    this.uploadTab = new UploadTab(this.uploadPane, {
      onAdd: (entries) => this.queueAll(entries),
    });

    this.remoteTab = new RemoteTab(this.remotePane, {
      onCommand: (cmd) => this.forwardCommand(cmd),
    });

    container.appendChild(this.root);
    this.setActiveTab("upload");

    // Establish the PeerSend connection eagerly so the RemoteTab sees
    // live 'state' / 'volume' / 'save-slots' messages from the kiosk
    // even before the user switches to the Remote tab. The
    // disconnection is cheap; the upside is the phone always reflects
    // what the kiosk is actually doing.
    void this.ensureConnected().catch(() => {
      // Status bar already surfaces the failure for the user.
    });
  }

  getUploadTab(): UploadTab {
    return this.uploadTab;
  }

  getRemoteTab(): RemoteTab {
    return this.remoteTab;
  }

  getActiveTab(): Tab {
    return this.activeTab;
  }

  setActiveTab(tab: Tab): void {
    this.activeTab = tab;
    this.uploadPane.hidden = tab !== "upload";
    this.remotePane.hidden = tab !== "remote";
    this.uploadTabBtn.classList.toggle("active", tab === "upload");
    this.uploadTabBtn.setAttribute("aria-selected", tab === "upload" ? "true" : "false");
    this.remoteTabBtn.classList.toggle("active", tab === "remote");
    this.remoteTabBtn.setAttribute("aria-selected", tab === "remote" ? "true" : "false");
  }

  private makeTabBtn(label: string, tab: Tab): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "af-phone-tab";
    btn.setAttribute("role", "tab");
    btn.setAttribute("data-testid", `phone-tab-${tab}`);
    btn.textContent = label;
    btn.addEventListener("click", () => this.setActiveTab(tab));
    return btn;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.setStatus("Connecting…");
      this.retryBtn.hidden = true;
      this.connectPromise = this.send.connect().then(
        () => {
          this.setStatus("Ready");
          this.subscribeKioskMessages();
        },
        (err) => {
          this.setStatus(`Connect failed: ${describeError(err)}`);
          this.retryBtn.hidden = false;
          this.connectPromise = null;
          throw err;
        }
      );
    }
    return this.connectPromise;
  }

  private subscribeKioskMessages(): void {
    const conn = this.send.getConnection?.() as
      | { on?: (event: "data", cb: (data: unknown) => void) => void }
      | null
      | undefined;
    if (!conn || typeof conn.on !== "function") return;
    conn.on("data", (data: unknown) => {
      const msg = data as KioskToPhoneMessage;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "state") {
        const payload = msg.payload as { screen?: KioskState } | undefined;
        if (payload?.screen) this.remoteTab.setKioskState(payload.screen);
      } else if (msg.type === "volume") {
        this.remoteTab.setVolume(msg.level);
      } else if (msg.type === "save-slots") {
        this.remoteTab.setSaveSlots(msg.slots);
      }
    });
  }

  private forwardCommand(cmd: Command): void {
    // Best-effort: if not yet connected, the command is dropped.
    // Phase 4b.5b can queue them if we end up needing it.
    void this.ensureConnected().then(() => {
      const conn = this.send.getConnection?.() as { send: (data: unknown) => void } | null | undefined;
      if (!conn) return;
      try {
        conn.send(cmd);
      } catch { /* connection just died — let the user retry */ }
    }).catch(() => { /* connect already failed — status bar shows why */ });
  }

  private async queueAll(entries: readonly QueueEntry[]): Promise<void> {
    for (const entry of entries) {
      if (this.processing.has(entry.id)) continue;
      this.processing.add(entry.id);
      try {
        await this.ensureConnected();
        await this.uploadOne(entry);
      } catch {
        // Per-entry errors surface on the entry itself; keep draining.
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
      // First attempt reuses the persistent state-sync connection; if
      // it drops mid-transfer, subsequent attempts spin up fresh
      // ephemeral senders so the retry can't cascade into the
      // state-sync channel.
      let usePersistent = true;
      const factory = (): ResumableSender => {
        if (usePersistent) {
          usePersistent = false;
          return {
            connect: () => this.ensureConnected(),
            sendFile: (n, d, opts) => this.send.sendFile(n, d, opts),
            close: () => { /* keep state-sync alive */ },
          };
        }
        return this.uploadSendFactory();
      };
      await sendFileWithReconnect(factory, entry.name, data, {
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
