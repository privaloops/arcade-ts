/**
 * EmptyState — first-boot screen shown when RomDB has no ROMs (§2.3).
 *
 * Big QR code centred on the screen plus the welcome copy from the
 * UX spec. Phase 3.10 mounts it when the catalogue is empty; Phase 4
 * adds favorite / recent filtering on the browser so EmptyState is
 * reached naturally again after the user wipes their ROMs.
 *
 * The QR re-renders whenever setRoomId() receives a different id,
 * so the same screen handles kiosk boot (fresh random id) and the
 * "retry with a new room" fallback when PeerJS rejects an id.
 */

import { QrCode, resolvePhoneBaseUrl } from "../../ui/qr-code";

export interface EmptyStateOptions {
  /** Override the QR target. Defaults to production sprixe.app. */
  baseUrl?: string;
}

export class EmptyState {
  readonly root: HTMLDivElement;

  private readonly qr: QrCode;
  private readonly qrWrap: HTMLDivElement;
  private readonly prompt: HTMLParagraphElement;
  private readonly wifi: HTMLParagraphElement;
  private serverDownEl: HTMLDivElement | null = null;

  constructor(container: HTMLElement, options: EmptyStateOptions = {}) {
    this.root = document.createElement("div");
    this.root.className = "af-empty-state";
    this.root.setAttribute("data-testid", "empty-state");

    const logo = document.createElement("div");
    logo.className = "af-empty-logo";
    logo.textContent = "SPRIXE";
    this.root.appendChild(logo);

    const headline = document.createElement("h1");
    headline.className = "af-empty-headline";
    headline.textContent = "Welcome to your arcade.";
    this.root.appendChild(headline);

    this.qrWrap = document.createElement("div");
    this.qrWrap.className = "af-empty-qr";
    this.qr = new QrCode(this.qrWrap, {
      size: 200,
      baseUrl: options.baseUrl ?? resolvePhoneBaseUrl(),
    });
    this.root.appendChild(this.qrWrap);

    this.prompt = document.createElement("p");
    this.prompt.className = "af-empty-prompt";
    this.prompt.textContent = "Scan with your phone to add games";
    this.root.appendChild(this.prompt);

    this.wifi = document.createElement("p");
    this.wifi.className = "af-empty-wifi";
    this.wifi.textContent = "(same WiFi network)";
    this.root.appendChild(this.wifi);

    const systems = document.createElement("p");
    systems.className = "af-empty-systems";
    systems.textContent = "Supports: CPS-1 · Neo-Geo";
    this.root.appendChild(systems);

    const format = document.createElement("p");
    format.className = "af-empty-format";
    format.textContent = "Format: MAME .zip ROM sets";
    this.root.appendChild(format);

    container.appendChild(this.root);
  }

  async setRoomId(roomId: string): Promise<void> {
    await this.qr.setRoomId(roomId);
  }

  /** Swap the QR for a "server unreachable" banner when the kiosk
   * can't bind to a PeerJS room (signaling down, rate-limited, etc.).
   * The user at least sees *why* their phone can't connect. */
  setServerDown(message: string, onRetry?: () => void): void {
    if (this.serverDownEl) return;
    this.qrWrap.hidden = true;
    this.prompt.hidden = true;
    this.wifi.hidden = true;

    const panel = document.createElement("div");
    panel.className = "af-empty-server-down";
    panel.setAttribute("data-testid", "empty-state-server-down");

    const title = document.createElement("p");
    title.className = "af-empty-server-down-title";
    title.textContent = "Phone pairing unavailable";
    panel.appendChild(title);

    const detail = document.createElement("p");
    detail.className = "af-empty-server-down-detail";
    detail.textContent = message;
    panel.appendChild(detail);

    if (onRetry) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "af-empty-server-down-retry";
      btn.textContent = "Retry";
      btn.addEventListener("click", () => onRetry());
      panel.appendChild(btn);
    }

    this.root.insertBefore(panel, this.qrWrap);
    this.serverDownEl = panel;
  }

  /** Restore the QR flow after a successful retry. */
  clearServerDown(): void {
    if (!this.serverDownEl) return;
    this.serverDownEl.remove();
    this.serverDownEl = null;
    this.qrWrap.hidden = false;
    this.prompt.hidden = false;
    this.wifi.hidden = false;
  }

  unmount(): void {
    this.root.remove();
  }
}
