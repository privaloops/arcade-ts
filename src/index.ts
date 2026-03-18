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

// ── Pause toggle (P key) ─────────────────────────────────────────────────────

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") {
    if (emulator.isRunning()) {
      emulator.pause();
      emulator.suspendAudio();
      setStatus("Paused (P to resume)");
    } else {
      emulator.resume();
      emulator.resumeAudio();
      setStatus("Running");
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

  loadBtn.disabled = true;
  gameSelect.disabled = true;

  // Try local public/ first, then archive.org
  const localUrl = `/${gameName}.zip`;
  const archiveUrl = getArchiveOrgUrl(gameName);

  setStatus(`Loading ${gameName}… (checking local)…`);

  fetch(localUrl, { method: "HEAD" })
    .then((res) => {
      if (res.ok) {
        setStatus(`Loading ${gameName} (local)…`);
        return fetch(localUrl).then((r) => r.blob());
      }
      setStatus(`Downloading ${gameName} from archive.org…`);
      return fetch(archiveUrl).then((r) => {
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        return r.blob();
      });
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

// Also detect local ROMs in public/ and add quick-load buttons
const romButtons = getElement<HTMLDivElement>("rom-buttons");
const LOCAL_ROMS = ["sf2.zip", "ffight.zip"];

for (const romName of LOCAL_ROMS) {
  fetch(`/${romName}`, { method: "HEAD" })
    .then((res) => {
      if (!res.ok) return;
      const btn = document.createElement("button");
      btn.textContent = romName.replace(".zip", "").toUpperCase();
      btn.style.cssText = "padding:6px 16px;background:#1a1a1a;color:#e8003c;border:1px solid #333;cursor:pointer;font-family:inherit;font-size:0.8rem;letter-spacing:0.1em;";
      btn.addEventListener("click", () => {
        fetch(`/${romName}`)
          .then(r => r.blob())
          .then(blob => {
            const file = new File([blob], romName, { type: "application/zip" });
            void handleRomFile(file);
          });
      });
      romButtons.appendChild(btn);
    })
    .catch(() => {});
}
