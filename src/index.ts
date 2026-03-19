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
const statusEl = getElement<HTMLParagraphElement>("status");
const fileInput = getElement<HTMLInputElement>("file-input");

// ── Emulator instance ────────────────────────────────────────────────────────

const emulator = new Emulator(canvas);
// Debug: expose for console access
(window as unknown as Record<string, unknown>).__emu = emulator;

// T = toggle CPU trace. First T starts recording, second T stops + downloads.
let tracing = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyT' || e.key === 't' || e.key === 'T') {
    const cpu = (emulator as unknown as { m68000: { startTrace(n: number): void; _traceEnabled: boolean; _traceLog: string[]; downloadTrace(f: string): void; getTrace(): string } }).m68000;
    if (!tracing) {
      cpu.startTrace(999999);
      tracing = true;
      console.log('TRACE ON — press T again to stop and download');
    } else {
      cpu._traceEnabled = false;
      tracing = false;
      console.log(`TRACE OFF — ${cpu._traceLog.length} instructions captured`);
      cpu.downloadTrace('grab_trace.log');
    }
  }
});


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

// ── Keyboard shortcuts ──────────────────────────────────────────────────────

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") {
    // P = Pause / Resume
    if (emulator.isRunning()) {
      emulator.pause();
      emulator.suspendAudio();
      setStatus("Paused (P to resume)");
    } else {
      emulator.resume();
      emulator.resumeAudio();
      setStatus("Running");
    }
  } else if (e.code === "Escape") {
    // Escape = Stop game, show game selector
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    emulator.stop();
    emulator.suspendAudio();
    dropZone.classList.remove("hidden");
    canvas.style.visibility = "hidden";
    setStatus("Ready. P=Pause F=Fullscreen Esc=Quit");
  } else if (e.code === "KeyF") {
    // F = Toggle fullscreen on canvas itself
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void canvas.requestFullscreen();
    }
  }
});

// ── Double-tap fullscreen (mobile — iOS has no Fullscreen API on canvas) ─────

let lastTapTime = 0;
canvas.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTapTime < 300) {
    e.preventDefault();
    // Toggle pseudo-fullscreen (or native if supported)
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (canvas.requestFullscreen) {
      canvas.requestFullscreen().catch(() => {
        // Fullscreen API failed (iOS) — use pseudo-fullscreen
        document.body.classList.toggle("pseudo-fullscreen");
      });
    } else {
      document.body.classList.toggle("pseudo-fullscreen");
    }
  }
  lastTapTime = now;
});

// Exit pseudo-fullscreen on Escape
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && document.body.classList.contains("pseudo-fullscreen")) {
    document.body.classList.remove("pseudo-fullscreen");
  }
});

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
    await emulator.initAudio();
    await emulator.loadRom(file);
    emulator.resumeAudio();
    dropZone.classList.add("hidden");
    canvas.style.visibility = "visible";
    emulator.start();
    setStatus(`Running: ${file.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${msg}`);
    console.error("ROM load error:", err);
  }
}

// ── File picker ──────────────────────────────────────────────────────────────

dropZone.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    void emulator.initAudio();
    void handleRomFile(file);
  }
  fileInput.value = ""; // allow re-selecting the same file
});

