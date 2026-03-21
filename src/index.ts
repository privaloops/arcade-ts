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
import { DEFAULT_GP_MAPPING, type GamepadMapping, type AutofireKey } from "./input/input";

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

// ── Gamepad config modal ──────────────────────────────────────────────────────

const configBtn = getElement<HTMLButtonElement>("config-btn");
const gpOverlay = getElement<HTMLDivElement>("gamepad-modal-overlay");
const gpMappingList = getElement<HTMLDivElement>("gp-mapping-list");
const gpResetBtn = getElement<HTMLButtonElement>("gp-reset-btn");
const gpCloseBtn = getElement<HTMLButtonElement>("gp-close-btn");

const GP_BUTTON_NAMES: Record<number, string> = {
  0: "A", 1: "B", 2: "X", 3: "Y",
  4: "LB", 5: "RB", 6: "LT", 7: "RT",
  8: "Select", 9: "Start", 10: "L3", 11: "R3",
  12: "D-Up", 13: "D-Down", 14: "D-Left", 15: "D-Right",
  16: "Home",
};

function gpBtnName(index: number): string {
  return GP_BUTTON_NAMES[index] ?? `Btn ${index}`;
}

type MappingKey = keyof GamepadMapping;

const GP_CONFIG_ROWS: { key: MappingKey; label: string }[] = [
  { key: "button1", label: "Button 1" },
  { key: "button2", label: "Button 2" },
  { key: "button3", label: "Button 3" },
  { key: "button4", label: "Button 4" },
  { key: "button5", label: "Button 5" },
  { key: "button6", label: "Button 6" },
  { key: "start",   label: "Start" },
  { key: "coin",    label: "Coin" },
];

let listeningKey: MappingKey | null = null;
let listeningBtn: HTMLButtonElement | null = null;
let listenRafId = 0;

const AUTOFIRE_ELIGIBLE: Set<string> = new Set(["button1", "button2", "button3", "button4", "button5", "button6"]);

function renderGpModal(): void {
  const input = emulator.getInputManager();
  const mapping = input.getGamepadMapping(0);
  const autofireFlags = input.getAutofireFlags(0);
  gpMappingList.innerHTML = "";

  for (const row of GP_CONFIG_ROWS) {
    const div = document.createElement("div");
    div.className = "gp-row";

    const label = document.createElement("span");
    label.className = "gp-label";
    label.textContent = row.label;

    const right = document.createElement("div");
    right.className = "gp-right";

    const btn = document.createElement("button");
    btn.className = "gp-btn";
    btn.textContent = gpBtnName(mapping[row.key]);
    btn.addEventListener("click", () => startListening(row.key, btn));
    right.appendChild(btn);

    // Autofire checkbox (only for action buttons)
    if (AUTOFIRE_ELIGIBLE.has(row.key)) {
      const afKey = row.key as AutofireKey;
      const afLabel = document.createElement("label");
      afLabel.className = "gp-autofire" + (autofireFlags.has(afKey) ? " active" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = autofireFlags.has(afKey);
      cb.addEventListener("change", () => {
        input.setAutofire(0, afKey, cb.checked);
        afLabel.classList.toggle("active", cb.checked);
      });

      afLabel.appendChild(cb);
      afLabel.appendChild(document.createTextNode("AUTO"));
      right.appendChild(afLabel);
    }

    div.appendChild(label);
    div.appendChild(right);
    gpMappingList.appendChild(div);
  }
}

function startListening(key: MappingKey, btn: HTMLButtonElement): void {
  // Cancel previous listening
  if (listeningBtn) listeningBtn.classList.remove("listening");
  cancelAnimationFrame(listenRafId);

  listeningKey = key;
  listeningBtn = btn;
  btn.textContent = "Press...";
  btn.classList.add("listening");

  // Record which buttons are already pressed so we can ignore them
  const alreadyPressed = new Set<number>();
  const gamepads = navigator.getGamepads();
  for (const gp of gamepads) {
    if (!gp) continue;
    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i]!.pressed) alreadyPressed.add(i);
    }
  }

  function poll(): void {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i]!.pressed && !alreadyPressed.has(i)) {
          captureButton(i);
          return;
        }
      }
    }
    listenRafId = requestAnimationFrame(poll);
  }
  listenRafId = requestAnimationFrame(poll);
}

function captureButton(index: number): void {
  if (!listeningKey || !listeningBtn) return;

  const input = emulator.getInputManager();
  const mapping = input.getGamepadMapping(0);
  mapping[listeningKey] = index;
  input.setGamepadMapping(0, mapping);

  listeningBtn.textContent = gpBtnName(index);
  listeningBtn.classList.remove("listening");
  listeningKey = null;
  listeningBtn = null;
}

function openGpModal(): void {
  renderGpModal();
  gpOverlay.classList.add("open");
}

function closeGpModal(): void {
  if (listeningBtn) listeningBtn.classList.remove("listening");
  cancelAnimationFrame(listenRafId);
  listeningKey = null;
  listeningBtn = null;
  gpOverlay.classList.remove("open");
}

configBtn.addEventListener("click", openGpModal);
gpCloseBtn.addEventListener("click", closeGpModal);
gpOverlay.addEventListener("click", (e) => {
  if (e.target === gpOverlay) closeGpModal();
});

gpResetBtn.addEventListener("click", () => {
  const input = emulator.getInputManager();
  input.setGamepadMapping(0, { ...DEFAULT_GP_MAPPING });
  // Clear all autofire flags
  for (const key of AUTOFIRE_ELIGIBLE) {
    input.setAutofire(0, key as AutofireKey, false);
  }
  renderGpModal();
});

