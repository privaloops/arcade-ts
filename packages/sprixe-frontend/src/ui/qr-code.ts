/**
 * QrCode — canvas-rendered QR pointing at the phone upload page
 * (§2.9 + §4.11). The encoded URL template is
 * `https://sprixe.app/send/{roomId}` in production; in dev / tests
 * the builder swaps the base via `baseUrl` so Playwright can open
 * the target locally.
 *
 * Re-rendering is memoised on `roomId` + `baseUrl` — setting the
 * same roomId twice is a no-op, so the QR doesn't flash.
 */

import QRCode from "qrcode";

export interface QrCodeOptions {
  /** Canvas pixel size (width == height). Default 200. */
  size?: number;
  /** Base URL before the room id. Default "https://sprixe.app/send". */
  baseUrl?: string;
}

export class QrCode {
  readonly canvas: HTMLCanvasElement;

  private readonly size: number;
  private readonly baseUrl: string;
  private currentRoomId: string | null = null;
  private currentUrl: string | null = null;
  private renderToken = 0;

  constructor(container: HTMLElement, options: QrCodeOptions = {}) {
    this.size = options.size ?? 200;
    this.baseUrl = options.baseUrl ?? "https://sprixe.app/send";

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.className = "af-qr-code";
    this.canvas.setAttribute("data-testid", "qr");
    container.appendChild(this.canvas);
  }

  async setRoomId(roomId: string): Promise<void> {
    if (this.currentRoomId === roomId) return;
    this.currentRoomId = roomId;
    this.currentUrl = `${this.baseUrl}/${roomId}`;
    const token = ++this.renderToken;
    await QRCode.toCanvas(this.canvas, this.currentUrl, {
      width: this.size,
      margin: 1,
      color: { dark: "#f0f0f5", light: "#12121a" },
    });
    if (token !== this.renderToken) return; // superseded by a newer setRoomId
    this.canvas.dataset.roomId = roomId;
    this.canvas.dataset.url = this.currentUrl;
  }

  getRoomId(): string | null {
    return this.currentRoomId;
  }

  getUrl(): string | null {
    return this.currentUrl;
  }
}
