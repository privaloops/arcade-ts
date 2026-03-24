/**
 * Arcade.ts — Entry point
 *
 * Bootstraps the emulator with drag & drop ROM loading.
 */

import { Emulator } from "./emulator";
import { CPS1_PARENT_GAMES, ROT270_GAMES } from "./game-catalog";
import { FrameStateExtractor } from "./video/frame-state";
import { SpriteSheetManager } from "./video/sprite-sheet";
import { GameScreen } from "./video/GameScreen";
import { DEFAULT_GP_MAPPING, DEFAULT_P1_MAPPING, DEFAULT_P2_MAPPING, type GamepadMapping, type KeyMapping, type AutofireKey } from "./input/input";
import { getSlotInfo, getNumSlots } from "./save-state";
import { getDipDef, bankToIndex, type DipSwitchDef } from "./dip-switches";
import { DebugPanel } from "./debug/debug-panel";
import { AudioPanel } from "./audio/audio-panel";
import { downloadTextFile } from "./utils/trace-export";

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
const canvasWrapper = getElement<HTMLDivElement>("canvas-wrapper");
const gamepadStatusEl = getElement<HTMLSpanElement>("gamepad-status");

const appEl = getElement<HTMLDivElement>("app");

/** Move a modal overlay into canvasWrapper (for fullscreen) or back to #app */
function showOverlay(overlay: HTMLElement): void {
  if (document.fullscreenElement === canvasWrapper) {
    canvasWrapper.appendChild(overlay);
  }
  overlay.classList.add("open");
}

function hideOverlay(overlay: HTMLElement): void {
  overlay.classList.remove("open");
  // Move back to #app if it was moved to canvasWrapper
  if (overlay.parentElement === canvasWrapper) {
    appEl.appendChild(overlay);
  }
}

function getRendererMode(): "canvas" | "dom" {
  const checked = document.querySelector<HTMLInputElement>('input[name="renderer"]:checked');
  return checked?.value === "dom" ? "dom" : "canvas";
}

/** Set up or re-create the DOM renderer using emulator public API. */
function setupDomRenderer(): void {
  const videoConfig = emulator.getVideoConfig();
  const video = emulator.getVideo();
  if (!videoConfig || !video) return;

  // Destroy previous DOM renderer if any
  if (gameScreen) {
    gameScreen.destroy();
    gameScreen = null;
  }
  domScreen.innerHTML = "";

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
// DOM renderer auto-resizes via its own ResizeObserver (see GameScreen).

// ── Emulator instance ────────────────────────────────────────────────────────

const emulator = new Emulator(canvas);
let gameScreen: GameScreen | null = null;
// Debug: expose for console access
(window as unknown as Record<string, unknown>).__emu = emulator;

// T = toggle CPU trace. First T starts recording, second T stops + downloads.
let tracing = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyT' || e.key === 't' || e.key === 'T') {
    const cpu = (emulator as unknown as { m68000: { startTrace(n: number): void; _traceEnabled: boolean; _traceLog: string[]; getTrace(): string } }).m68000;
    if (!tracing) {
      cpu.startTrace(999999);
      tracing = true;
      console.log('TRACE ON — press T again to stop and download');
    } else {
      cpu._traceEnabled = false;
      tracing = false;
      console.log(`TRACE OFF — ${cpu._traceLog.length} instructions captured`);
      downloadTextFile(cpu.getTrace(), 'grab_trace.log');
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

// ── Control bar buttons ──────────────────────────────────────────────────

const pauseBtn = getElement<HTMLButtonElement>("pause-btn");
const muteBtn = getElement<HTMLButtonElement>("mute-btn");
const saveBtnCtrl = getElement<HTMLButtonElement>("save-btn");
const loadBtnCtrl = getElement<HTMLButtonElement>("load-btn-ss");
const debugBtn = getElement<HTMLButtonElement>("dbg-btn");

// Create debug panel immediately so it's visible on page load
let debugPanel: DebugPanel | null = new DebugPanel(emulator, canvas);

function toggleDebug(): void {
  if (!debugPanel) {
    debugPanel = new DebugPanel(emulator, canvas);
  }
  debugPanel.toggle();
}

debugBtn.addEventListener("click", toggleDebug);

const audBtn = getElement<HTMLButtonElement>("aud-btn");
let audioPanel: AudioPanel | null = new AudioPanel(emulator);

function toggleAudio(): void {
  if (!audioPanel) {
    audioPanel = new AudioPanel(emulator);
  }
  audioPanel.toggle();
}

audBtn.addEventListener("click", toggleAudio);

pauseBtn.addEventListener("click", () => {
  if (emulator.isRunning()) {
    emulator.pause();
    emulator.suspendAudio();
    pauseBtn.textContent = "Resume (P)";
    pauseBtn.classList.add("active");
    setStatus("Paused");
  } else if (emulator.isPaused()) {
    emulator.resume();
    if (!muted) emulator.resumeAudio();
    pauseBtn.textContent = "Pause (P)";
    pauseBtn.classList.remove("active");
    setStatus("Running");
  }
});

muteBtn.addEventListener("click", () => {
  muted = !muted;
  if (muted) { emulator.suspendAudio(); muteBtn.classList.add("active"); setStatus("Muted"); }
  else { emulator.resumeAudio(); muteBtn.classList.remove("active"); setStatus("Running"); }
});

saveBtnCtrl.addEventListener("click", () => openSsModal("save"));
loadBtnCtrl.addEventListener("click", () => openSsModal("load"));

// CRT toggle (in Config > Display tab)
const crtToggle = getElement<HTMLInputElement>("crt-toggle");
crtToggle.addEventListener("change", () => {
  canvasWrapper.classList.toggle("crt", crtToggle.checked);
  try { localStorage.setItem("cps1-crt", crtToggle.checked ? "1" : "0"); } catch {}
});
if (localStorage.getItem("cps1-crt") === "1") {
  canvasWrapper.classList.add("crt");
  crtToggle.checked = true;
}

const quitBtn = getElement<HTMLButtonElement>("quit-btn");
quitBtn.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  debugPanel?.destroy();
  debugPanel = null;
  audioPanel?.destroy();
  audioPanel = null;
  emulator.stop();
  emulator.suspendAudio();
  dropZone.classList.remove("hidden");
  canvas.style.visibility = "hidden";
  domScreen.style.display = "none";
  gameScreen = null;
  controlsEl.classList.remove("visible");
  pauseBtn.textContent = "Pause (P)";
  pauseBtn.classList.remove("active");
  loadBtn.disabled = !gameSelect.value;
  setStatus("");
});


let muted = false;

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "m") {
    // M = Mute / Unmute
    muted = !muted;
    if (muted) { emulator.suspendAudio(); muteBtn.classList.add("active"); setStatus("Muted"); }
    else { emulator.resumeAudio(); muteBtn.classList.remove("active"); setStatus("Running"); }
  } else if (key === "p") {
    // P = Pause / Resume
    if (emulator.isRunning()) {
      emulator.pause();
      emulator.suspendAudio();
      pauseBtn.textContent = "Resume (P)";
      pauseBtn.classList.add("active");
      setStatus("Paused");
    } else if (emulator.isPaused()) {
      emulator.resume();
      if (!muted) emulator.resumeAudio();
      pauseBtn.textContent = "Pause (P)";
      pauseBtn.classList.remove("active");
      setStatus("Running");
    }
  } else if (e.code === "Escape") {
    // Escape = close modals first, then exit fullscreen
    if (ssOverlay.classList.contains("open")) { closeSsModal(); }
    else if (ctrlOverlay.classList.contains("open")) { closeControlsModal(); }
    else if (document.body.classList.contains("pseudo-fullscreen")) { document.body.classList.remove("pseudo-fullscreen"); }
    // Note: browser handles Escape→exit fullscreen automatically, we can't prevent it
  } else if (key === "f") {
    // F = Toggle fullscreen
    toggleFullscreen();
  }
});

// ── TATE mode ────────────────────────────────────────────────────────────────

const tateToggle = getElement<HTMLInputElement>("tate-toggle");

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

let lastRomFile: File | null = null;

async function handleRomFile(file: File): Promise<void> {
  if (!file.name.endsWith(".zip")) {
    setStatus("Error: expected a .zip file.");
    return;
  }

  lastRomFile = file;
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

    // Restore saved DIP switches before starting
    loadDipFromStorage(emulator.getGameName(), emulator.getIoPorts());

    // Open debug panel by default
    if (!debugPanel) {
      debugPanel = new DebugPanel(emulator, canvas);
    }
    debugPanel.onGameChange();
    if (!debugPanel.isOpen()) {
      debugPanel.toggle();
    }

    // Update audio panel
    audioPanel?.onGameChange();

    emulator.start();
    setStatus(`Running: ${file.name} (${mode}${isTate ? ', TATE' : ''})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${msg}`);
    console.error("ROM load error:", err);
  }
}

// ── File picker + drag & drop ────────────────────────────────────────────────

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

// HTML5 drag & drop on the entire page
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!dropZone.classList.contains("hidden")) {
    dropZone.classList.add("drag-over");
  }
});

document.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) {
    dropZone.classList.remove("drag-over");
  }
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) {
    void handleRomFile(file);
  }
});

// ── Game selector (loads from public/roms/) ──────────────────────────────────

const gameSelect = getElement<HTMLSelectElement>("game-select");
const loadBtn = getElement<HTMLButtonElement>("load-btn");
const romControls = getElement<HTMLDivElement>("rom-controls");

// Build game selector from available ROMs in public/roms/
const gameDescriptions = new Map(CPS1_PARENT_GAMES.map(g => [g.name, g.description]));

fetch("/api/roms").then(r => {
  if (!r.ok) throw new Error("not available");
  return r.json();
}).then((roms: string[]) => {
  if (roms.length === 0) return;
  romControls.style.display = "flex";
  for (const name of roms) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = gameDescriptions.get(name) ?? name;
    gameSelect.appendChild(opt);
  }
}).catch(() => {
  // No local ROMs available — stays hidden, drag & drop only
});

gameSelect.addEventListener("change", () => {
  loadBtn.disabled = !gameSelect.value;
});

loadBtn.addEventListener("click", async () => {
  const gameName = gameSelect.value;
  if (!gameName) return;

  loadBtn.disabled = true;
  void emulator.initAudio();

  try {
    setStatus(`Loading ${gameName}…`);
    const resp = await fetch(`/roms/${gameName}.zip`);
    if (!resp.ok) throw new Error(`ROM not found: ${gameName}.zip`);
    const blob = await resp.blob();
    const file = new File([blob], `${gameName}.zip`, { type: "application/zip" });
    await handleRomFile(file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Download failed: ${msg}`);
    loadBtn.disabled = false;
  }
});

// ── Controls modal (Joypad + Keyboard tabs) ──────────────────────────────────

const controlsBtn = getElement<HTMLButtonElement>("controls-btn");
const ctrlOverlay = getElement<HTMLDivElement>("controls-modal-overlay");
const gpMappingListP1 = getElement<HTMLDivElement>("gp-mapping-list-p1");
const gpMappingListP2 = getElement<HTMLDivElement>("gp-mapping-list-p2");
const ctrlResetBtn = getElement<HTMLButtonElement>("controls-reset-btn");
const ctrlCloseBtn = getElement<HTMLButtonElement>("controls-close-btn");
const tabJoypad = getElement<HTMLButtonElement>("tab-joypad");
const tabKeyboard = getElement<HTMLButtonElement>("tab-keyboard");
const tabDisplay = getElement<HTMLButtonElement>("tab-display");
const tabDip = getElement<HTMLButtonElement>("tab-dip");
const tabJoypadContent = getElement<HTMLDivElement>("tab-joypad-content");
const tabKeyboardContent = getElement<HTMLDivElement>("tab-keyboard-content");
const tabDisplayContent = getElement<HTMLDivElement>("tab-display-content");
const tabDipContent = getElement<HTMLDivElement>("tab-dip-content");

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
let listeningPlayer = 0;
let listenRafId = 0;

const AUTOFIRE_ELIGIBLE: Set<string> = new Set(["button1", "button2", "button3", "button4", "button5", "button6"]);

function renderGpColumn(player: number, container: HTMLDivElement): void {
  const input = emulator.getInputManager();
  const mapping = input.getGamepadMapping(player);
  const autofireFlags = input.getAutofireFlags(player);
  container.innerHTML = "";

  // Device assignment dropdown
  const deviceRow = document.createElement("div");
  deviceRow.className = "gp-row";
  deviceRow.style.borderBottom = "1px solid #333";
  deviceRow.style.marginBottom = "6px";
  deviceRow.style.paddingBottom = "10px";

  const deviceLabel = document.createElement("span");
  deviceLabel.className = "gp-label";
  deviceLabel.textContent = "Device";

  const deviceSelect = document.createElement("select");
  deviceSelect.dataset["deviceSelect"] = "1";
  deviceSelect.style.cssText = "background:#1a1a1a;border:1px solid #333;color:#ccc;font-family:inherit;font-size:0.8rem;padding:4px 8px;border-radius:3px;cursor:pointer;";

  const noneOpt = document.createElement("option");
  noneOpt.value = "none";
  noneOpt.textContent = "None (keyboard only)";
  deviceSelect.appendChild(noneOpt);

  const connectedPads = input.getConnectedGamepads();
  for (const gp of connectedPads) {
    const opt = document.createElement("option");
    opt.value = String(gp.index);
    opt.textContent = gp.id;
    opt.dataset["gp"] = "1";
    deviceSelect.appendChild(opt);
  }

  const currentGp = input.getPlayerGamepad(player);
  const savedId = input.getSavedGamepadId(player);

  // If a gamepad was saved but not yet connected, show it as a pending option
  if (currentGp === null && savedId) {
    const shortId = savedId.split("(")[0]!.trim();
    const pendingOpt = document.createElement("option");
    pendingOpt.value = "saved";
    pendingOpt.textContent = `${shortId} `;
    pendingOpt.dataset["gp"] = "1";
    deviceSelect.appendChild(pendingOpt);
    deviceSelect.value = "saved";
  } else {
    deviceSelect.value = currentGp === null ? "none" : String(currentGp);
  }

  deviceSelect.addEventListener("change", () => {
    const val = deviceSelect.value;
    input.setPlayerGamepad(player, val === "none" ? null : parseInt(val, 10));
    renderGpColumn(player, container); // re-render to show/hide mapping rows
  });

  deviceRow.appendChild(deviceLabel);
  deviceRow.appendChild(deviceSelect);
  container.appendChild(deviceRow);

  // If no gamepad assigned and none saved, keyboard only
  if (currentGp === null && !savedId) {
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:0.8rem;color:#444;text-align:center;padding:16px 0;";
    msg.textContent = "Keyboard only — no gamepad mapping";
    container.appendChild(msg);
    return;
  }

  // If saved but not yet connected, show status + mapping (optimistic)
  if (currentGp === null && savedId) {
    const status = document.createElement("div");
    status.style.cssText = "font-size:0.75rem;color:#666;text-align:center;padding:4px 0 8px;";
    const shortId = savedId.split("(")[0]!.trim();
    status.innerHTML = `<span style="color:#ff1a50;">${shortId}</span>`;
    container.appendChild(status);
  }

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
    btn.addEventListener("click", () => startListening(row.key, btn, player));
    right.appendChild(btn);

    if (AUTOFIRE_ELIGIBLE.has(row.key)) {
      const afKey = row.key as AutofireKey;
      const afLabel = document.createElement("label");
      afLabel.className = "gp-autofire" + (autofireFlags.has(afKey) ? " active" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = autofireFlags.has(afKey);
      cb.addEventListener("change", () => {
        input.setAutofire(player, afKey, cb.checked);
        afLabel.classList.toggle("active", cb.checked);
      });

      afLabel.appendChild(cb);
      afLabel.appendChild(document.createTextNode("AUTO"));
      right.appendChild(afLabel);
    }

    div.appendChild(label);
    div.appendChild(right);
    container.appendChild(div);
  }
}

function renderGpModal(): void {
  renderGpColumn(0, gpMappingListP1);
  renderGpColumn(1, gpMappingListP2);
}

function startListening(key: MappingKey, btn: HTMLButtonElement, player: number = 0): void {
  if (listeningBtn) listeningBtn.classList.remove("listening");
  cancelAnimationFrame(listenRafId);

  listeningKey = key;
  listeningBtn = btn;
  listeningPlayer = player;
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
  const mapping = input.getGamepadMapping(listeningPlayer);
  mapping[listeningKey] = index;
  input.setGamepadMapping(listeningPlayer, mapping);

  listeningBtn.textContent = gpBtnName(index);
  listeningBtn.classList.remove("listening");
  listeningKey = null;
  listeningBtn = null;
}

type ConfigTab = "joypad" | "keyboard" | "display" | "dip";
const configTabs: { btn: HTMLButtonElement; content: HTMLDivElement; name: ConfigTab }[] = [
  { btn: tabJoypad, content: tabJoypadContent, name: "joypad" },
  { btn: tabKeyboard, content: tabKeyboardContent, name: "keyboard" },
  { btn: tabDisplay, content: tabDisplayContent, name: "display" },
  { btn: tabDip, content: tabDipContent, name: "dip" },
];

function switchTab(tab: ConfigTab): void {
  for (const t of configTabs) {
    t.content.style.display = t.name === tab ? "" : "none";
    t.btn.classList.toggle("active", t.name === tab);
  }
  if (tab === "dip") renderDipList();
}

for (const t of configTabs) {
  t.btn.addEventListener("click", () => switchTab(t.name));
}

let ctrlWasPaused = false;

function openControlsModal(): void {
  renderGpModal();
  renderKbModal();
  renderDipList();
  // Pause while config is open
  ctrlWasPaused = emulator.isPaused();
  if (!ctrlWasPaused && emulator.isRunning()) {
    emulator.pause();
    emulator.suspendAudio();
  }
  showOverlay(ctrlOverlay);
}


// Update device dropdowns when a gamepad connects (no full re-render)
window.addEventListener("gamepadconnected", () => {
  if (!ctrlOverlay.classList.contains("open")) return;
  const input = emulator.getInputManager();
  const pads = input.getConnectedGamepads();
  const selects = ctrlOverlay.querySelectorAll<HTMLSelectElement>("[data-device-select]");
  for (const sel of selects) {
    // Remove old gamepad options, keep "none" and "saved"
    for (const opt of [...sel.options]) {
      if (opt.value !== "none" && opt.value !== "saved" && opt.dataset["gp"]) opt.remove();
    }
    // Remove "saved" placeholder if real pad connected
    for (const opt of [...sel.options]) {
      if (opt.value === "saved") opt.remove();
    }
    // Add connected gamepads
    for (const gp of pads) {
      if (!sel.querySelector(`option[value="${gp.index}"]`)) {
        const opt = document.createElement("option");
        opt.value = String(gp.index);
        opt.textContent = gp.id;
        opt.dataset["gp"] = "1";
        sel.appendChild(opt);
      }
    }
  }
  // Update selected values
  for (let p = 0; p < 2; p++) {
    const gp = input.getPlayerGamepad(p);
    if (gp !== null && selects[p]) selects[p]!.value = String(gp);
  }
});

function closeControlsModal(): void {
  if (listeningBtn) listeningBtn.classList.remove("listening");
  cancelAnimationFrame(listenRafId);
  listeningKey = null;
  listeningBtn = null;
  if (kbListeningBtn) kbListeningBtn.classList.remove("listening");
  kbListeningKey = null;
  kbListeningBtn = null;
  hideOverlay(ctrlOverlay);
  // Resume if we paused it
  if (!ctrlWasPaused && emulator.isPaused()) {
    emulator.resume();
    if (!muted) emulator.resumeAudio();
  }
}

controlsBtn.addEventListener("click", openControlsModal);
ctrlCloseBtn.addEventListener("click", closeControlsModal);
ctrlOverlay.addEventListener("click", (e) => {
  if (e.target === ctrlOverlay) closeControlsModal();
});

ctrlResetBtn.addEventListener("click", () => {
  const input = emulator.getInputManager();
  for (const p of [0, 1]) {
    input.setGamepadMapping(p, { ...DEFAULT_GP_MAPPING });
    for (const key of AUTOFIRE_ELIGIBLE) {
      input.setAutofire(p, key as AutofireKey, false);
    }
    input.setKeyMapping(p, p === 0 ? { ...DEFAULT_P1_MAPPING } : { ...DEFAULT_P2_MAPPING });
  }
  renderGpModal();
  renderKbModal();
});

// ── Save state modal ──────────────────────────────────────────────────────

const ssOverlay = getElement<HTMLDivElement>("savestate-modal-overlay");
const ssTitle = getElement<HTMLHeadingElement>("savestate-title");
const ssSlots = getElement<HTMLDivElement>("savestate-slots");
const ssCloseBtn = getElement<HTMLButtonElement>("ss-close-btn");

let ssMode: "save" | "load" = "save";
let ssSelectedSlot = 0;
let ssWasPaused = false;

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function highlightSlot(index: number): void {
  const slots = ssSlots.querySelectorAll<HTMLDivElement>(".ss-slot");
  slots.forEach((el, i) => {
    el.style.borderColor = i === index ? "#ff1a50" : "#444";
    el.style.background = i === index ? "#2a2a2a" : "#222";
  });
  ssSelectedSlot = index;
}

async function confirmSlot(index: number): Promise<void> {
  if (ssMode === "save") {
    const ok = await emulator.saveState(index);
    setStatus(ok ? `Saved to slot ${index + 1}` : "Save failed");
  } else {
    const ok = emulator.loadState(index);
    setStatus(ok ? `Loaded from slot ${index + 1}` : "Load failed — empty or wrong game");
  }
  closeSsModal();
}

function renderSsModal(): void {
  const gameName = emulator.getGameName();
  ssTitle.textContent = ssMode === "save" ? "SAVE STATE" : "LOAD STATE";
  ssSlots.innerHTML = "";

  for (let i = 0; i < getNumSlots(); i++) {
    const info = getSlotInfo(i);
    const div = document.createElement("div");
    div.className = "ss-slot";

    const num = document.createElement("span");
    num.className = "ss-slot-num";
    num.textContent = `${i + 1}`;

    const infoEl = document.createElement("span");
    infoEl.className = "ss-slot-info";

    if (info && info.gameName === gameName) {
      infoEl.textContent = info.gameName;
      const dateEl = document.createElement("div");
      dateEl.className = "ss-slot-date";
      dateEl.textContent = formatDate(info.timestamp);
      infoEl.appendChild(dateEl);
    } else {
      infoEl.textContent = "Empty";
      infoEl.classList.add("ss-slot-empty");
    }

    div.appendChild(num);
    div.appendChild(infoEl);

    div.addEventListener("click", () => confirmSlot(i));

    ssSlots.appendChild(div);
  }

  highlightSlot(0);
}

function openSsModal(mode: "save" | "load"): void {
  if (!emulator.isRunning() && !emulator.isPaused()) return;
  ssMode = mode;
  ssSelectedSlot = 0;

  // Pause the game while modal is open
  ssWasPaused = emulator.isPaused();
  if (!ssWasPaused) {
    emulator.pause();
    emulator.suspendAudio();
  }

  renderSsModal();
  showOverlay(ssOverlay);
}

function closeSsModal(): void {
  hideOverlay(ssOverlay);

  // Resume if we paused it
  if (!ssWasPaused) {
    emulator.resume();
    if (!muted) emulator.resumeAudio();
  }
}

ssCloseBtn.addEventListener("click", closeSsModal);
ssOverlay.addEventListener("click", (e) => {
  if (e.target === ssOverlay) closeSsModal();
});

// Keyboard navigation in save state modal
window.addEventListener("keydown", (e) => {
  if (!ssOverlay.classList.contains("open")) return;

  e.preventDefault();
  const numSlots = getNumSlots();

  if (e.key === "ArrowUp") {
    highlightSlot((ssSelectedSlot - 1 + numSlots) % numSlots);
  } else if (e.key === "ArrowDown") {
    highlightSlot((ssSelectedSlot + 1) % numSlots);
  } else if (e.key === "Enter") {
    confirmSlot(ssSelectedSlot);
  } else if (e.key === "Escape") {
    closeSsModal();
  }
});

// Keyboard shortcuts S = save, L = load
window.addEventListener("keydown", (e) => {
  if (!emulator.isRunning() && !emulator.isPaused()) return;
  // Don't trigger when a modal is open
  if (ctrlOverlay.classList.contains("open") || ssOverlay.classList.contains("open")) return;

  if (e.code === "F1") {
    e.preventDefault();
    openControlsModal();
  } else if (e.code === "F2") {
    e.preventDefault();
    toggleDebug();
  } else if (e.code === "F3") {
    e.preventDefault();
    toggleAudio();
  } else if (e.code === "F5") {
    e.preventDefault();
    openSsModal("save");
  } else if (e.code === "F8") {
    e.preventDefault();
    openSsModal("load");
  }
});

// ── Keyboard config (tab content) ─────────────────────────────────────────

const kbMappingListP1 = getElement<HTMLDivElement>("kb-mapping-list-p1");
const kbMappingListP2 = getElement<HTMLDivElement>("kb-mapping-list-p2");

type KbMappingKey = keyof KeyMapping;

const KB_CONFIG_ROWS: { key: KbMappingKey; label: string }[] = [
  { key: "up",      label: "Up" },
  { key: "down",    label: "Down" },
  { key: "left",    label: "Left" },
  { key: "right",   label: "Right" },
  { key: "button1", label: "Button 1" },
  { key: "button2", label: "Button 2" },
  { key: "button3", label: "Button 3" },
  { key: "button4", label: "Button 4" },
  { key: "button5", label: "Button 5" },
  { key: "button6", label: "Button 6" },
  { key: "start",   label: "Start" },
  { key: "coin",    label: "Coin" },
];

let kbListeningKey: KbMappingKey | null = null;
let kbListeningBtn: HTMLButtonElement | null = null;
let kbListeningPlayer = 0;

// Keyboard layout map for correct key labels (AZERTY/QWERTY)
let layoutMap: Map<string, string> | null = null;
if ('keyboard' in navigator && 'getLayoutMap' in (navigator as Navigator & { keyboard: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard) {
  (navigator as Navigator & { keyboard: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard
    .getLayoutMap()
    .then(map => { layoutMap = map; })
    .catch(() => {});
}

function keyCodeLabel(code: string): string {
  // Try keyboard layout map first (gives correct letter for AZERTY/QWERTY)
  if (layoutMap) {
    const key = layoutMap.get(code);
    if (key) return key.toUpperCase();
  }
  // Fallback
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code === "Enter") return "Enter";
  if (code === "Space") return "Space";
  if (code === "Escape") return "Esc";
  return code;
}

function renderKbColumn(player: number, container: HTMLDivElement): void {
  const mapping = emulator.getInputManager().getKeyMapping(player);
  container.innerHTML = "";

  for (const row of KB_CONFIG_ROWS) {
    const div = document.createElement("div");
    div.className = "gp-row";

    const label = document.createElement("span");
    label.className = "gp-label";
    label.textContent = row.label;

    const right = document.createElement("div");
    right.className = "gp-right";

    const btn = document.createElement("button");
    btn.className = "gp-btn";
    btn.textContent = keyCodeLabel(mapping[row.key]);
    btn.addEventListener("click", () => startKbListening(row.key, btn, player));
    right.appendChild(btn);

    div.appendChild(label);
    div.appendChild(right);
    container.appendChild(div);
  }
}

function renderKbModal(): void {
  renderKbColumn(0, kbMappingListP1);
  renderKbColumn(1, kbMappingListP2);
}

function startKbListening(key: KbMappingKey, btn: HTMLButtonElement, player: number): void {
  if (kbListeningBtn) kbListeningBtn.classList.remove("listening");
  kbListeningKey = key;
  kbListeningBtn = btn;
  kbListeningPlayer = player;
  btn.textContent = "Press...";
  btn.classList.add("listening");
}

// Capture keyboard input when listening
window.addEventListener("keydown", (e) => {
  if (!kbListeningKey || !kbListeningBtn) return;
  e.preventDefault();
  e.stopPropagation();

  const input = emulator.getInputManager();
  const mapping = input.getKeyMapping(kbListeningPlayer);
  mapping[kbListeningKey] = e.code;
  input.setKeyMapping(kbListeningPlayer, mapping);

  // Use e.key for display (real letter on current layout), e.code for mapping (physical position)
  kbListeningBtn.textContent = e.key.length === 1 ? e.key.toUpperCase() : keyCodeLabel(e.code);
  kbListeningBtn.classList.remove("listening");
  kbListeningKey = null;
  kbListeningBtn = null;
}, true); // capture phase to intercept before other handlers


// ── DIP switches (inside Config > DIP tab) ───────────────────────────────

const dipList = getElement<HTMLDivElement>("dip-list");

function saveDipToStorage(gameName: string, ioPorts: Uint8Array): void {
  const data = { a: ioPorts[10], b: ioPorts[12], c: ioPorts[14] };
  try { localStorage.setItem(`cps1-dip-${gameName}`, JSON.stringify(data)); } catch { /* quota */ }
}

function loadDipFromStorage(gameName: string, ioPorts: Uint8Array): void {
  try {
    const raw = localStorage.getItem(`cps1-dip-${gameName}`);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, number>;
    if (typeof data["a"] === "number") ioPorts[10] = data["a"];
    if (typeof data["b"] === "number") ioPorts[12] = data["b"];
    if (typeof data["c"] === "number") ioPorts[14] = data["c"];
  } catch { /* corrupted */ }
}

function renderDipList(): void {
  const gameName = emulator.getGameName();
  const def = getDipDef(gameName);
  const ioPorts = emulator.getIoPorts();
  dipList.innerHTML = "";

  const reloadBtn = document.createElement("button");
  reloadBtn.className = "ctrl-btn";
  reloadBtn.style.cssText = "display:none;margin:14px auto 0;color:#ff1a50;border-color:#ff1a50;";
  reloadBtn.textContent = "Reload Game";
  reloadBtn.addEventListener("click", () => {
    closeControlsModal();
    if (lastRomFile) void handleRomFile(lastRomFile);
  });

  if (def.switches.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:0.85rem;color:#444;text-align:center;padding:20px 0;";
    empty.textContent = "No DIP switches for this game.";
    dipList.appendChild(empty);
    return;
  }

  for (const sw of def.switches) {
    const ioIdx = bankToIndex(sw.bank);
    const currentByte = ioPorts[ioIdx]!;
    const currentVal = currentByte & sw.mask;

    const div = document.createElement("div");
    div.className = "gp-row";

    const label = document.createElement("span");
    label.className = "gp-label";
    label.textContent = sw.name;

    const select = document.createElement("select");
    select.style.cssText = "background:#1a1a1a;border:1px solid #333;color:#ccc;font-family:inherit;font-size:0.8rem;padding:4px 8px;border-radius:3px;cursor:pointer;";

    for (const opt of sw.options) {
      const option = document.createElement("option");
      option.value = String(opt.value);
      option.textContent = opt.label;
      if (opt.value === currentVal) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener("change", () => {
      const newVal = parseInt(select.value, 10);
      ioPorts[ioIdx] = (ioPorts[ioIdx]! & ~sw.mask) | newVal;
      saveDipToStorage(gameName, ioPorts);
      reloadBtn.style.display = "block";
    });

    div.appendChild(label);
    div.appendChild(select);
    dipList.appendChild(div);
  }

  dipList.appendChild(reloadBtn);
}

