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

import { QrCode } from "../../ui/qr-code";

/**
 * __LAN_IP__ is injected by vite.config.ts `define` at dev-server
 * startup — it holds the Mac's first non-internal IPv4 address so a
 * phone that scans the QR lands on the kiosk's LAN IP even when the
 * user happens to load the kiosk via localhost. Production builds
 * replace this at build time with `null`, at which point we fall
 * back to window.location.origin (the sprixe.app host in prod).
 */
declare const __LAN_IP__: string | null;

function defaultBaseUrl(): string {
  if (typeof window === "undefined") return "https://sprixe.app/send";
  try {
    if (typeof __LAN_IP__ === "string" && __LAN_IP__) {
      const port = window.location.port || "5174";
      return `http://${__LAN_IP__}:${port}/send`;
    }
  } catch { /* __LAN_IP__ undefined in non-vite contexts */ }
  return `${window.location.origin}/send`;
}

export interface EmptyStateOptions {
  /** Override the QR target. Defaults to production sprixe.app. */
  baseUrl?: string;
}

export class EmptyState {
  readonly root: HTMLDivElement;

  private readonly qr: QrCode;

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

    const qrWrap = document.createElement("div");
    qrWrap.className = "af-empty-qr";
    this.qr = new QrCode(qrWrap, {
      size: 200,
      baseUrl: options.baseUrl ?? defaultBaseUrl(),
    });
    this.root.appendChild(qrWrap);

    const prompt = document.createElement("p");
    prompt.className = "af-empty-prompt";
    prompt.textContent = "Scan with your phone to add games";
    this.root.appendChild(prompt);

    const wifi = document.createElement("p");
    wifi.className = "af-empty-wifi";
    wifi.textContent = "(same WiFi network)";
    this.root.appendChild(wifi);

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

  unmount(): void {
    this.root.remove();
  }
}
