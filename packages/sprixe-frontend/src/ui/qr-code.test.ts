import { describe, it, expect, beforeEach, vi } from "vitest";
import { QrCode } from "./qr-code";
import QRCode from "qrcode";

vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockedQrcode = vi.mocked(QRCode, true);

describe("QrCode", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    mockedQrcode.toCanvas.mockClear();
    mockedQrcode.toCanvas.mockResolvedValue(undefined);
  });

  describe("construction", () => {
    it("mounts a 200x200 canvas by default with data-testid=qr", () => {
      const qr = new QrCode(container);
      expect(qr.canvas.width).toBe(200);
      expect(qr.canvas.height).toBe(200);
      expect(qr.canvas.getAttribute("data-testid")).toBe("qr");
      expect(container.contains(qr.canvas)).toBe(true);
    });

    it("honours a custom size", () => {
      const qr = new QrCode(container, { size: 320 });
      expect(qr.canvas.width).toBe(320);
      expect(qr.canvas.height).toBe(320);
    });
  });

  describe("setRoomId", () => {
    it("renders with the canonical base URL and passes the exact URL to QRCode.toCanvas", async () => {
      const qr = new QrCode(container);
      await qr.setRoomId("room-abc");

      expect(qr.getUrl()).toBe("https://sprixe.app/send/room-abc");
      expect(mockedQrcode.toCanvas).toHaveBeenCalledTimes(1);
      const [, url] = mockedQrcode.toCanvas.mock.calls[0]!;
      expect(url).toBe("https://sprixe.app/send/room-abc");
    });

    it("respects a custom baseUrl override", async () => {
      const qr = new QrCode(container, { baseUrl: "http://localhost:5174/send" });
      await qr.setRoomId("dev-xyz");
      expect(qr.getUrl()).toBe("http://localhost:5174/send/dev-xyz");
    });

    it("is memoised — re-setting the same room id does NOT re-render", async () => {
      const qr = new QrCode(container);
      await qr.setRoomId("room-abc");
      await qr.setRoomId("room-abc");
      await qr.setRoomId("room-abc");
      expect(mockedQrcode.toCanvas).toHaveBeenCalledTimes(1);
    });

    it("re-renders when the room id changes", async () => {
      const qr = new QrCode(container);
      await qr.setRoomId("room-a");
      await qr.setRoomId("room-b");
      expect(mockedQrcode.toCanvas).toHaveBeenCalledTimes(2);
      expect(qr.getRoomId()).toBe("room-b");
    });

    it("canvas dataset.roomId + dataset.url mirror the last successful render", async () => {
      const qr = new QrCode(container);
      await qr.setRoomId("kiosk-7");
      expect(qr.canvas.dataset.roomId).toBe("kiosk-7");
      expect(qr.canvas.dataset.url).toBe("https://sprixe.app/send/kiosk-7");
    });
  });

  describe("initial state", () => {
    it("getRoomId/getUrl return null before setRoomId is called", () => {
      const qr = new QrCode(container);
      expect(qr.getRoomId()).toBeNull();
      expect(qr.getUrl()).toBeNull();
    });
  });
});
