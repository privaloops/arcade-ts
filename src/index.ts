/**
 * CPS1-Web — Entry point
 *
 * Bootstraps the emulator with drag & drop ROM loading.
 */

import { Emulator } from "./emulator";

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

const canvas = getElement<HTMLCanvasElement>("screen");
const dropZone = getElement<HTMLDivElement>("drop-zone");
const fileInput = getElement<HTMLInputElement>("file-input");
const statusEl = getElement<HTMLParagraphElement>("status");

// ── Canvas init ──────────────────────────────────────────────────────────────

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Could not get 2D context from canvas");
}
ctx.fillStyle = "#000";
ctx.fillRect(0, 0, canvas.width, canvas.height);

// ── Emulator instance ────────────────────────────────────────────────────────

const emulator = new Emulator(canvas);

// ── Audio init (requires user gesture) ──────────────────────────────────────

const initAudio = (): void => {
  emulator.initAudio().then(() => {
    console.log("Audio initialized successfully");
  }).catch((e) => {
    console.error("Audio init failed:", e);
  });
  window.removeEventListener("click", initAudio);
  window.removeEventListener("keydown", initAudio);
};
window.addEventListener("click", initAudio);
window.addEventListener("keydown", initAudio);

// ── ROM drag & drop ──────────────────────────────────────────────────────────

function setStatus(message: string): void {
  statusEl.textContent = message;
}

async function handleRomFile(file: File): Promise<void> {
  if (!file.name.endsWith(".zip")) {
    setStatus("Error: expected a .zip file.");
    return;
  }

  setStatus(`Loading: ${file.name}…`);

  try {
    await emulator.loadRom(file);
    setStatus(`ROM loaded: ${file.name}. Starting emulation…`);
    dropZone.classList.add("hidden");
    emulator.start();
    setStatus(`Running: ${file.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${msg}`);
    console.error("ROM load error:", err);
  }
}

// Drag & drop events
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) void handleRomFile(file);
});

// Click to browse
dropZone.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void handleRomFile(file);
});

// Auto-load sf2.zip from the public folder if available
fetch("/sf2.zip")
  .then((res) => {
    if (!res.ok) return;
    return res.blob();
  })
  .then((blob) => {
    if (!blob) return;
    const file = new File([blob], "sf2.zip", { type: "application/zip" });
    void handleRomFile(file);
  })
  .catch(() => {
    // No auto-load ROM available, user must drag & drop
  });
