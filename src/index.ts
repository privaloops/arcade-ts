/**
 * Arcade.ts — Entry point (bootstrap)
 *
 * Wires up DOM elements, creates the Emulator, and initializes UI modules.
 */

import { Emulator } from "./emulator";
import { DEFAULT_GP_MAPPING, DEFAULT_P1_MAPPING, DEFAULT_P2_MAPPING, type AutofireKey } from "./input/input";
import { DebugPanel } from "./debug/debug-panel";
import { AudioPanel } from "./audio/audio-panel";
import type { SpriteEditorUI } from "./editor/sprite-editor-ui";
import type { GameScreen } from "./video/GameScreen";

import { showOverlay, hideOverlay } from "./ui/modal";
import { renderGpModal, cancelGpListening, updateGamepadDeviceDropdowns } from "./ui/gamepad-config";
import { renderKbModal, cancelKbListening, initKeyboardCapture } from "./ui/keyboard-config";
import { initSaveStateUI, openSsModal, closeSsModal, isSsModalOpen } from "./ui/save-state-ui";
import { renderDipList } from "./ui/dip-switch-ui";
import { initDropZone, handleRomFile } from "./ui/drop-zone";
import { getRendererMode, setupDomRenderer, initRendererToggle } from "./ui/renderer-toggle";
import { initControlsBar, toggleFullscreen, toggleDebug, toggleAudio, toggleSpriteEditor } from "./ui/controls-bar";
import { initShortcuts } from "./ui/shortcuts";

// ── DOM lookups ──────────────────────────────────────────────────────────────

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
const pauseBtn = getElement<HTMLButtonElement>("pause-btn");
const muteBtn = getElement<HTMLButtonElement>("mute-btn");
const saveBtnCtrl = getElement<HTMLButtonElement>("save-btn");
const loadBtnCtrl = getElement<HTMLButtonElement>("load-btn-ss");
const debugBtn = getElement<HTMLButtonElement>("dbg-btn");
const audBtn = getElement<HTMLButtonElement>("aud-btn");
const quitBtn = getElement<HTMLButtonElement>("quit-btn");
const exportBtn = getElement<HTMLButtonElement>("export-btn");
const editBtn = getElement<HTMLButtonElement>("edit-btn");
const hamburgerBtn = getElement<HTMLButtonElement>("hamburger-btn");
const hamburgerMenu = getElement<HTMLDivElement>("hamburger-menu");
const crtToggle = getElement<HTMLInputElement>("crt-toggle");
const tateToggle = getElement<HTMLInputElement>("tate-toggle");
const controlsBtn = getElement<HTMLButtonElement>("controls-btn");
const ctrlOverlay = getElement<HTMLDivElement>("controls-modal-overlay");
const gpMappingListP1 = getElement<HTMLDivElement>("gp-mapping-list-p1");
const gpMappingListP2 = getElement<HTMLDivElement>("gp-mapping-list-p2");
const kbMappingListP1 = getElement<HTMLDivElement>("kb-mapping-list-p1");
const kbMappingListP2 = getElement<HTMLDivElement>("kb-mapping-list-p2");
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
const ssOverlay = getElement<HTMLDivElement>("savestate-modal-overlay");
const ssTitle = getElement<HTMLHeadingElement>("savestate-title");
const ssSlots = getElement<HTMLDivElement>("savestate-slots");
const ssCloseBtn = getElement<HTMLButtonElement>("ss-close-btn");
const dipList = getElement<HTMLDivElement>("dip-list");
const gameSelect = getElement<HTMLSelectElement>("game-select");
const loadBtn = getElement<HTMLButtonElement>("load-btn");
const romControls = getElement<HTMLDivElement>("rom-controls");

// ── Emulator + shared state ──────────────────────────────────────────────────

const emulator = new Emulator(canvas);
(window as unknown as Record<string, unknown>).__emu = emulator;

let muted = false;
let debugPanel: DebugPanel | null = new DebugPanel(emulator, canvas);
let audioPanel: AudioPanel | null = new AudioPanel(emulator);
let gameScreen: GameScreen | null = null;
let spriteEditor: SpriteEditorUI | null = null;
let lastRomFile: File | null = null;

function setStatus(msg: string): void { statusEl.textContent = msg; }
const getMuted = (): boolean => muted;
const setMuted = (m: boolean): void => { muted = m; };
const getDebugPanel = (): DebugPanel | null => debugPanel;
const setDebugPanel = (p: DebugPanel | null): void => { debugPanel = p; };
const getAudioPanel = (): AudioPanel | null => audioPanel;
const setAudioPanel = (p: AudioPanel | null): void => { audioPanel = p; };
const getGameScreen = (): GameScreen | null => gameScreen;
const setGameScreen = (gs: GameScreen | null): void => { gameScreen = gs; };
const getSpriteEditor = (): SpriteEditorUI | null => spriteEditor;
const setSpriteEditor = (se: SpriteEditorUI | null): void => { spriteEditor = se; };
const getLastRomFile = (): File | null => lastRomFile;
const setLastRomFile = (f: File | null): void => { lastRomFile = f; };

// ── Audio init (requires user gesture) ───────────────────────────────────────

const initAudio = (): void => {
  emulator.initAudio().then(() => console.log("Audio initialized successfully"))
    .catch((e) => console.error("Audio init failed:", e));
  window.removeEventListener("click", initAudio);
  window.removeEventListener("keydown", initAudio);
};
window.addEventListener("click", initAudio);
window.addEventListener("keydown", initAudio);

// ── Gamepad status ───────────────────────────────────────────────────────────

window.addEventListener("gamepadconnected", (e) => {
  gamepadStatusEl.textContent = `Gamepad: ${e.gamepad.id.split("(")[0]!.trim()}`;
  if (ctrlOverlay.classList.contains("open")) updateGamepadDeviceDropdowns(emulator, ctrlOverlay);
});
window.addEventListener("gamepaddisconnected", () => {
  const any = navigator.getGamepads().some(gp => gp !== null);
  if (!any) gamepadStatusEl.textContent = "";
});

// ── Config modal (tabs: Joypad / Keyboard / Display / DIP) ──────────────────

type ConfigTab = "joypad" | "keyboard" | "display" | "dip";
const configTabs: { btn: HTMLButtonElement; content: HTMLDivElement; name: ConfigTab }[] = [
  { btn: tabJoypad, content: tabJoypadContent, name: "joypad" },
  { btn: tabKeyboard, content: tabKeyboardContent, name: "keyboard" },
  { btn: tabDisplay, content: tabDisplayContent, name: "display" },
  { btn: tabDip, content: tabDipContent, name: "dip" },
];
function switchTab(index: number): void {
  for (let i = 0; i < configTabs.length; i++) {
    const t = configTabs[i]!;
    const active = i === index;
    t.content.style.display = active ? "" : "none";
    t.btn.classList.toggle("active", active);
    t.btn.setAttribute("aria-selected", String(active));
    t.btn.tabIndex = active ? 0 : -1;
  }
  configTabs[index]!.btn.focus();
  if (configTabs[index]!.name === "dip") renderDipList(emulator, dipList, onDipReload);
}

for (let i = 0; i < configTabs.length; i++) {
  const t = configTabs[i]!;
  t.btn.addEventListener("click", () => switchTab(i));
  t.btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); switchTab((i + 1) % configTabs.length); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); switchTab((i - 1 + configTabs.length) % configTabs.length); }
  });
}

let ctrlWasPaused = false;
const onDipReload = (): void => { closeControlsModal(); if (lastRomFile) void handleRomFile(lastRomFile); };

function openControlsModal(): void {
  renderGpModal(emulator, gpMappingListP1, gpMappingListP2);
  renderKbModal(emulator, kbMappingListP1, kbMappingListP2);
  renderDipList(emulator, dipList, onDipReload);
  ctrlWasPaused = emulator.isPaused();
  if (!ctrlWasPaused && emulator.isRunning()) { emulator.pause(); emulator.suspendAudio(); }
  showOverlay(ctrlOverlay, canvasWrapper, appEl);
}

function closeControlsModal(): void {
  cancelGpListening();
  cancelKbListening();
  hideOverlay(ctrlOverlay, canvasWrapper, appEl);
  if (!ctrlWasPaused && emulator.isPaused()) { emulator.resume(); if (!muted) emulator.resumeAudio(); }
}

controlsBtn.addEventListener("click", openControlsModal);
ctrlCloseBtn.addEventListener("click", closeControlsModal);
ctrlOverlay.addEventListener("click", (e) => { if (e.target === ctrlOverlay) closeControlsModal(); });

ctrlResetBtn.addEventListener("click", () => {
  const input = emulator.getInputManager();
  const AUTOFIRE_ELIGIBLE: Set<string> = new Set(["button1", "button2", "button3", "button4", "button5", "button6"]);
  for (const p of [0, 1]) {
    input.setGamepadMapping(p, { ...DEFAULT_GP_MAPPING });
    for (const key of AUTOFIRE_ELIGIBLE) input.setAutofire(p, key as AutofireKey, false);
    input.setKeyMapping(p, p === 0 ? { ...DEFAULT_P1_MAPPING } : { ...DEFAULT_P2_MAPPING });
  }
  renderGpModal(emulator, gpMappingListP1, gpMappingListP2);
  renderKbModal(emulator, kbMappingListP1, kbMappingListP2);
});

// ── Init UI modules ──────────────────────────────────────────────────────────

const rendererDeps = { emulator, canvas, domScreen, getGameScreen, setGameScreen, setStatus };
const controlsBarDeps = {
  emulator, canvas, domScreen, dropZone, controlsEl, canvasWrapper,
  pauseBtn, muteBtn, saveBtnCtrl, loadBtnCtrl, debugBtn, audBtn, quitBtn, exportBtn, editBtn,
  hamburgerBtn, hamburgerMenu,
  crtToggle, tateToggle, gameSelect, loadBtn,
  getMuted, setMuted, getDebugPanel, setDebugPanel, getAudioPanel, setAudioPanel,
  getGameScreen, setGameScreen, getSpriteEditor, setSpriteEditor, setStatus,
};

initKeyboardCapture(emulator);
initRendererToggle(rendererDeps);
initControlsBar(controlsBarDeps);
initSaveStateUI({ emulator, ssOverlay, ssTitle, ssSlots, ssCloseBtn, canvasWrapper, appEl, getMuted, setStatus });
initDropZone({
  emulator, canvas, domScreen, dropZone, fileInput, controlsEl, canvasWrapper,
  tateToggle, gameSelect, loadBtn, romControls, exportBtn, editBtn, statusEl,
  getRendererMode, setupDomRenderer: () => setupDomRenderer(rendererDeps),
  getDebugPanel, setDebugPanel, getAudioPanel: () => audioPanel, setLastRomFile, getLastRomFile, setStatus,
});
initShortcuts({
  emulator, canvasWrapper, pauseBtn, muteBtn, getMuted, setMuted,
  togglePause: () => pauseBtn.click(),
  toggleMute: () => muteBtn.click(),
  openControlsModal, closeControlsModal,
  openSsModal, closeSsModal,
  toggleDebug: () => toggleDebug(controlsBarDeps),
  toggleAudio: () => toggleAudio(controlsBarDeps),
  toggleSpriteEditor: () => toggleSpriteEditor(controlsBarDeps),
  toggleFullscreen: () => toggleFullscreen(canvasWrapper),
  isCtrlModalOpen: () => ctrlOverlay.classList.contains("open"),
  isSsModalOpen, setStatus,
});
