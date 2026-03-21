/**
 * CPS1-Web — Entry point
 *
 * Bootstraps the emulator with drag & drop ROM loading.
 */

import { Emulator } from "./emulator";
import { CPS1_PARENT_GAMES, ROT270_GAMES } from "./game-catalog";
import { FrameStateExtractor } from "./video/frame-state";
import { SpriteSheetManager } from "./video/sprite-sheet";
import { GameScreen } from "./video/GameScreen";

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

const canvas = getElement<HTMLCanvasElement>("screen");
const domScreen = getElement<HTMLDivElement>("dom-screen");
const dropZone = getElement<HTMLDivElement>("drop-zone");
const statusEl = getElement<HTMLParagraphElement>("status");
const fileInput = getElement<HTMLInputElement>("file-input");
const controlsEl = getElement<HTMLDivElement>("controls");
const gamepadStatusEl = getElement<HTMLSpanElement>("gamepad-status");

function getRendererMode(): "canvas" | "dom" {
  const checked = document.querySelector<HTMLInputElement>('input[name="renderer"]:checked');
  return checked?.value === "dom" ? "dom" : "canvas";
}

/** Set up or re-create the DOM renderer using emulator public API. */
function setupDomRenderer(): void {
  const videoConfig = emulator.getVideoConfig();
  const video = emulator.getVideo();
  if (!videoConfig || !video) return;

  const bufs = emulator.getBusBuffers();
  const sheets = new SpriteSheetManager(videoConfig.graphicsRom);
  const extractor = new FrameStateExtractor(
    bufs.vram, bufs.cpsaRegs, bufs.cpsbRegs,
    { layerControl: videoConfig.layerCtrlOffset, paletteControl: 0x30, priority: [0,0,0,0],
      layerEnableMask: [videoConfig.enableScroll1, videoConfig.enableScroll2, videoConfig.enableScroll3, 0, 0],
      idOffset: -1, idValue: 0 },
    { ranges: videoConfig.mapperTable, bankSizes: videoConfig.bankSizes },
  );
  gameScreen = new GameScreen(domScreen);
  gameScreen.setComponents(video, extractor, sheets, bufs.vram);
  resizeDomScreen();
  emulator.setVblankCallback(() => extractor.bufferSprites());
  emulator.setRenderCallback(() => { gameScreen?.updateFrame(); });
}

// Listen for renderer toggle changes during gameplay
document.querySelectorAll<HTMLInputElement>('input[name="renderer"]').forEach(radio => {
  radio.addEventListener("change", () => {
    if (!emulator.isRunning()) return;
    const mode = getRendererMode();
    if (mode === "dom") {
      canvas.style.visibility = "hidden";
      domScreen.style.display = "block";
      if (!gameScreen) setupDomRenderer();
      else emulator.setRenderCallback(() => { gameScreen?.updateFrame(); });
    } else {
      domScreen.style.display = "none";
      canvas.style.visibility = "visible";
      emulator.setVblankCallback(null);
      emulator.setRenderCallback(null);
    }
    setStatus(`Renderer: ${mode}`);
  });
});

// Resize DOM renderer to fit container
function resizeDomScreen(): void {
  if (!gameScreen) return;
  const { width, height } = domScreen.getBoundingClientRect();
  if (width > 0 && height > 0) gameScreen.resize(width, height);
}

new ResizeObserver(resizeDomScreen).observe(domScreen);

// ── Emulator instance ────────────────────────────────────────────────────────

const emulator = new Emulator(canvas);
let gameScreen: GameScreen | null = null;
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

// ── Gamepad status ──────────────────────────────────────────────────────────

window.addEventListener("gamepadconnected", (e) => {
  gamepadStatusEl.textContent = `Gamepad: ${e.gamepad.id.split("(")[0]!.trim()}`;
});

window.addEventListener("gamepaddisconnected", () => {
  const any = navigator.getGamepads().some(gp => gp !== null);
  if (!any) gamepadStatusEl.textContent = "";
});

// ── Keyboard shortcuts ──────────────────────────────────────────────────────

// Detect AZERTY and update control labels
window.addEventListener("keydown", function detectLayout(e) {
  // On AZERTY, physical KeyQ produces "a", physical KeyA produces "q"
  if (e.code === "KeyQ" && e.key === "a") {
    const labels = document.getElementById("btn-labels");
    if (labels) {
      labels.innerHTML = '<kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> LP/MP/HP ' +
        '<kbd>W</kbd><kbd>X</kbd><kbd>C</kbd> LK/MK/HK';
    }
  }
  window.removeEventListener("keydown", detectLayout);
}, { once: true });

let muted = false;

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "m") {
    // M = Mute / Unmute
    muted = !muted;
    if (muted) { emulator.suspendAudio(); setStatus("Muted"); }
    else { emulator.resumeAudio(); setStatus("Running"); }
  } else if (key === "p") {
    // P = Pause / Resume
    if (emulator.isRunning()) {
      emulator.pause();
      emulator.suspendAudio();
      setStatus("Paused (P to resume)");
    } else {
      emulator.resume();
      if (!muted) emulator.resumeAudio();
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
    domScreen.style.display = "none";
    gameScreen = null;
    controlsEl.classList.remove("visible");
    setStatus("");
  } else if (key === "f") {
    // F = Toggle fullscreen
    toggleFullscreen();
  }
});

// ── TATE mode ────────────────────────────────────────────────────────────────

const tateToggle = getElement<HTMLInputElement>("tate-toggle");
const canvasWrapper = getElement<HTMLDivElement>("canvas-wrapper");

tateToggle.addEventListener("change", () => {
  canvasWrapper.classList.toggle("tate", tateToggle.checked);
});

// ── Double-click / double-tap fullscreen ─────────────────────────────────────

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else if (canvasWrapper.requestFullscreen) {
    canvasWrapper.requestFullscreen().catch(() => {
      document.body.classList.toggle("pseudo-fullscreen");
    });
  } else {
    document.body.classList.toggle("pseudo-fullscreen");
  }
}

canvasWrapper.addEventListener("dblclick", (e) => {
  e.preventDefault();
  toggleFullscreen();
});

let lastTapTime = 0;
canvasWrapper.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTapTime < 300) {
    e.preventDefault();
    toggleFullscreen();
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
    controlsEl.classList.add("visible");

    const mode = getRendererMode();
    if (mode === "dom") {
      canvas.style.visibility = "hidden";
      domScreen.style.display = "block";
      setupDomRenderer();
    } else {
      canvas.style.visibility = "visible";
      domScreen.style.display = "none";
    }

    // Auto-detect TATE (ROT270) games
    const romName = file.name.replace('.zip', '');
    const isTate = ROT270_GAMES.has(romName);
    canvasWrapper.classList.toggle("tate", isTate);
    tateToggle.checked = isTate;

    emulator.start();
    setStatus(`Running: ${file.name} (${mode}${isTate ? ', TATE' : ''})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${msg}`);
    console.error("ROM load error:", err);
  }
}

// ── File picker ──────────────────────────────────────────────────────────────

dropZone.addEventListener("click", () => {
  if (!dropZone.classList.contains("hidden")) {
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    void emulator.initAudio();
    void handleRomFile(file);
  }
  fileInput.value = ""; // allow re-selecting the same file
});

// ── Game selector (dropdown + archive.org download) ──────────────────────────

const gameSelect = getElement<HTMLSelectElement>("game-select");
const loadBtn = getElement<HTMLButtonElement>("load-btn");

for (const game of CPS1_PARENT_GAMES) {
  const opt = document.createElement("option");
  opt.value = game.name;
  opt.textContent = game.description;
  gameSelect.appendChild(opt);
}

gameSelect.addEventListener("change", () => {
  loadBtn.disabled = !gameSelect.value;
});

loadBtn.addEventListener("click", async () => {
  const gameName = gameSelect.value;
  if (!gameName) return;

  loadBtn.disabled = true;
  void emulator.initAudio();
  setStatus(`Downloading ${gameName} from archive.org…`);

  try {
    const proxyUrl = `/api/rom/${gameName}.zip`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const file = new File([blob], `${gameName}.zip`, { type: "application/zip" });
    await handleRomFile(file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Download failed: ${msg}`);
    loadBtn.disabled = false;
  }
});

