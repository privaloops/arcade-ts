import { describe, it, expect, beforeEach, vi } from "vitest";
import { UploadTab } from "./upload-tab";

function mockFile(name: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type: "application/zip" });
  return new File([blob], name, { type: "application/zip" });
}

describe("UploadTab", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("adding via the file picker API", () => {
    it("queues a single file with initial status 'queued'", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("sf2.zip", 1024)]);
      const entries = tab.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.name).toBe("sf2.zip");
      expect(entries[0]!.size).toBe(1024);
      expect(entries[0]!.status).toBe("queued");
    });

    it("preserves the order across multiple addFiles calls", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 10), mockFile("b.zip", 20)]);
      tab.addFiles([mockFile("c.zip", 30)]);
      expect(tab.getEntries().map((e) => e.name)).toEqual(["a.zip", "b.zip", "c.zip"]);
    });

    it("generates unique ids per entry", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 10), mockFile("a.zip", 10)]);
      const ids = tab.getEntries().map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("fires onAdd with the new entries only", () => {
      const onAdd = vi.fn();
      const tab = new UploadTab(container, { onAdd });
      tab.addFiles([mockFile("a.zip", 1), mockFile("b.zip", 1)]);
      expect(onAdd).toHaveBeenCalledTimes(1);
      const calledWith = onAdd.mock.calls[0]![0];
      expect(calledWith).toHaveLength(2);
      expect(calledWith[0].name).toBe("a.zip");
    });
  });

  describe("adding via drag-and-drop", () => {
    it("reads files from the drop event's DataTransfer", () => {
      const tab = new UploadTab(container);
      const dropzone = container.querySelector<HTMLElement>('[data-testid="upload-dropzone"]')!;

      // jsdom doesn't implement DataTransfer, so we fake the field the
      // handler reads (`e.dataTransfer.files`). The event itself is a
      // normal Event with defaultPrevented wiring.
      const files = [mockFile("drop.zip", 5)];
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { files },
        configurable: true,
      });
      dropzone.dispatchEvent(event);

      expect(tab.getEntries().map((e) => e.name)).toEqual(["drop.zip"]);
    });

    it("dragover event sets the 'is-over' class; dragleave clears it", () => {
      const tab = new UploadTab(container);
      const dropzone = container.querySelector<HTMLElement>('[data-testid="upload-dropzone"]')!;
      void tab;

      dropzone.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
      expect(dropzone.classList.contains("is-over")).toBe(true);

      dropzone.dispatchEvent(new Event("dragleave", { bubbles: true, cancelable: true }));
      expect(dropzone.classList.contains("is-over")).toBe(false);
    });
  });

  describe("removal", () => {
    it("remove() strips an entry and preserves sibling order", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 1), mockFile("b.zip", 1), mockFile("c.zip", 1)]);
      const b = tab.getEntries()[1]!;
      expect(tab.remove(b.id)).toBe(true);
      expect(tab.getEntries().map((e) => e.name)).toEqual(["a.zip", "c.zip"]);
    });

    it("remove() returns false for an unknown id", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 1)]);
      expect(tab.remove("entry-999999")).toBe(false);
      expect(tab.getEntries()).toHaveLength(1);
    });

    it("refuses to remove an entry in state 'uploading'", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 1)]);
      const entry = tab.getEntries()[0]!;
      tab.updateEntry(entry.id, { status: "uploading" });

      expect(tab.remove(entry.id)).toBe(false);
      expect(tab.getEntries()).toHaveLength(1);
    });

    it("fires onRemove with the removed entry", () => {
      const onRemove = vi.fn();
      const tab = new UploadTab(container, { onRemove });
      tab.addFiles([mockFile("a.zip", 1)]);
      const entry = tab.getEntries()[0]!;
      tab.remove(entry.id);
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove.mock.calls[0]![0].id).toBe(entry.id);
    });
  });

  describe("updateEntry", () => {
    it("patches a queued entry in place", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 100)]);
      const entry = tab.getEntries()[0]!;
      tab.updateEntry(entry.id, { status: "uploading", sent: 50 });

      const refreshed = tab.getEntries()[0]!;
      expect(refreshed.status).toBe("uploading");
      expect(refreshed.sent).toBe(50);
    });

    it("is a no-op on unknown ids", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 1)]);
      tab.updateEntry("nope", { status: "done" });
      expect(tab.getEntries()[0]!.status).toBe("queued");
    });
  });

  describe("DOM rendering", () => {
    it("renders one .af-upload-entry per queued file in order", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 1), mockFile("b.zip", 1)]);
      const entries = container.querySelectorAll(".af-upload-entry");
      expect(entries).toHaveLength(2);
      expect(entries[0]!.textContent).toContain("a.zip");
      expect(entries[1]!.textContent).toContain("b.zip");
    });

    it("remove button is disabled while uploading", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 1)]);
      const entry = tab.getEntries()[0]!;
      tab.updateEntry(entry.id, { status: "uploading" });

      const btn = container.querySelector<HTMLButtonElement>('[data-testid="upload-entry-remove"]');
      expect(btn?.disabled).toBe(true);
    });

    it("status column reflects percent while uploading", () => {
      const tab = new UploadTab(container);
      tab.addFiles([mockFile("a.zip", 100)]);
      const entry = tab.getEntries()[0]!;
      tab.updateEntry(entry.id, { status: "uploading", sent: 50 });

      const statusEl = container.querySelector<HTMLElement>(".af-upload-entry-status");
      expect(statusEl?.textContent).toBe("50%");
    });
  });

  describe("onChange subscription", () => {
    it("fires on add, remove, and update", () => {
      const cb = vi.fn();
      const tab = new UploadTab(container);
      tab.onChange(cb);

      tab.addFiles([mockFile("a.zip", 1)]);
      const entry = tab.getEntries()[0]!;
      tab.updateEntry(entry.id, { sent: 1 });
      tab.remove(entry.id);

      expect(cb).toHaveBeenCalledTimes(3);
    });

    it("unsubscribe stops further notifications", () => {
      const cb = vi.fn();
      const tab = new UploadTab(container);
      const off = tab.onChange(cb);
      tab.addFiles([mockFile("a.zip", 1)]);
      off();
      tab.addFiles([mockFile("b.zip", 1)]);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
