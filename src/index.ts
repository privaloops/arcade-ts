/**
 * CPS1-Web — Entry point
 *
 * Bootstraps the emulator with drag & drop ROM loading.
 */

import { Emulator } from "./emulator";
import { CPS1_PARENT_GAMES, getArchiveOrgUrl } from "./game-catalog";

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

const canvas = getElement<HTMLCanvasElement>("screen");
const dropZone = getElement<HTMLDivElement>("drop-zone");
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

// Debug: expose emulator for Playwright audio testing
(window as unknown as Record<string, unknown>).__emulator = emulator;

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

// ── Game selector (dropdown + archive.org download) ──────────────────────────

const gameSelect = getElement<HTMLSelectElement>("game-select");
const loadBtn = getElement<HTMLButtonElement>("load-btn");

// Populate dropdown with all parent CPS1 games
for (const game of CPS1_PARENT_GAMES) {
  const opt = document.createElement("option");
  opt.value = game.name;
  opt.textContent = game.description;
  gameSelect.appendChild(opt);
}

gameSelect.addEventListener("change", () => {
  loadBtn.disabled = !gameSelect.value;
});

loadBtn.addEventListener("click", () => {
  const gameName = gameSelect.value;
  if (!gameName) return;

  // Start audio init NOW in the user gesture call stack
  // (creates AudioContext synchronously, worklet setup is async)
  void emulator.initAudio();

  loadBtn.disabled = true;
  gameSelect.disabled = true;

  // Download via server proxy (archive.org) — avoids CORS
  const proxyUrl = `/api/rom/${gameName}.zip`;

  setStatus(`Downloading ${gameName} from archive.org…`);

  fetch(proxyUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      return r.blob();
    })
    .then((blob) => {
      const file = new File([blob], `${gameName}.zip`, { type: "application/zip" });
      return handleRomFile(file);
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    })
    .finally(() => {
      loadBtn.disabled = false;
      gameSelect.disabled = false;
    });
});

