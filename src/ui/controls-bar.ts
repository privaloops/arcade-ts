/**
 * Controls bar — pause, mute, save/load, debug, audio, quit, CRT, TATE toggles.
 */

import type { Emulator } from "../emulator";
import { DebugPanel } from "../debug/debug-panel";
import { AudioPanel } from "../audio/audio-panel";
import type { GameScreen } from "../video/GameScreen";
import { openSsModal } from "./save-state-ui";

export interface ControlsBarDeps {
  emulator: Emulator;
  canvas: HTMLCanvasElement;
  domScreen: HTMLDivElement;
  dropZone: HTMLDivElement;
  controlsEl: HTMLDivElement;
  canvasWrapper: HTMLDivElement;
  pauseBtn: HTMLButtonElement;
  muteBtn: HTMLButtonElement;
  saveBtnCtrl: HTMLButtonElement;
  loadBtnCtrl: HTMLButtonElement;
  debugBtn: HTMLButtonElement;
  audBtn: HTMLButtonElement;
  quitBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  editBtn: HTMLButtonElement;
  hamburgerBtn: HTMLButtonElement;
  hamburgerMenu: HTMLDivElement;
  crtToggle: HTMLInputElement;
  tateToggle: HTMLInputElement;
  gameSelect: HTMLSelectElement;
  loadBtn: HTMLButtonElement;
  getMuted(): boolean;
  setMuted(m: boolean): void;
  getDebugPanel(): DebugPanel | null;
  setDebugPanel(p: DebugPanel | null): void;
  getAudioPanel(): AudioPanel | null;
  setAudioPanel(p: AudioPanel | null): void;
  getGameScreen(): GameScreen | null;
  setGameScreen(gs: GameScreen | null): void;
  setStatus(msg: string): void;
}

export function toggleFullscreen(canvasWrapper: HTMLDivElement): void {
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

export function toggleDebug(deps: ControlsBarDeps): void {
  let debugPanel = deps.getDebugPanel();
  if (!debugPanel) {
    debugPanel = new DebugPanel(deps.emulator, deps.canvas);
    deps.setDebugPanel(debugPanel);
  }
  debugPanel.toggle();
}

export function toggleSpriteEditor(deps: ControlsBarDeps): void {
  // Sprite editor is integrated in the debug panel — just open it
  toggleDebug(deps);
}

export function toggleAudio(deps: ControlsBarDeps): void {
  let audioPanel = deps.getAudioPanel();
  if (!audioPanel) {
    audioPanel = new AudioPanel(deps.emulator);
    deps.setAudioPanel(audioPanel);
  }
  audioPanel.toggle();
}

export function initControlsBar(deps: ControlsBarDeps): void {
  const {
    emulator, canvas, domScreen, dropZone, controlsEl, canvasWrapper,
    pauseBtn, muteBtn, saveBtnCtrl, loadBtnCtrl, debugBtn, audBtn, quitBtn, exportBtn, editBtn,
    hamburgerBtn, hamburgerMenu,
    crtToggle, tateToggle, gameSelect, loadBtn,
    getMuted, setMuted, getDebugPanel, setDebugPanel, getAudioPanel, setAudioPanel,
    getGameScreen, setGameScreen, setStatus,
  } = deps;

  // Hamburger menu toggle
  function closeHamburger(): void { hamburgerMenu.classList.remove("open"); }

  hamburgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hamburgerMenu.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!hamburgerMenu.contains(e.target as Node) && e.target !== hamburgerBtn) {
      closeHamburger();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && hamburgerMenu.classList.contains("open")) {
      closeHamburger();
    }
  });

  // Close hamburger when any button inside is clicked
  hamburgerMenu.querySelectorAll(".ctrl-btn").forEach(btn => {
    btn.addEventListener("click", () => closeHamburger());
  });

  pauseBtn.addEventListener("click", () => {
    if (emulator.isRunning()) {
      emulator.pause();
      emulator.suspendAudio();
      pauseBtn.textContent = "Resume (P)";
      pauseBtn.classList.add("active");
      setStatus("Paused");
    } else if (emulator.isPaused()) {
      emulator.resume();
      if (!getMuted()) emulator.resumeAudio();
      pauseBtn.textContent = "Pause (P)";
      pauseBtn.classList.remove("active");
      setStatus("Running");
    }
  });

  muteBtn.addEventListener("click", () => {
    setMuted(!getMuted());
    if (getMuted()) { emulator.suspendAudio(); muteBtn.classList.add("active"); setStatus("Muted"); }
    else { emulator.resumeAudio(); muteBtn.classList.remove("active"); setStatus("Running"); }
  });

  saveBtnCtrl.addEventListener("click", () => openSsModal("save"));
  loadBtnCtrl.addEventListener("click", () => openSsModal("load"));

  debugBtn.addEventListener("click", () => toggleDebug(deps));
  audBtn.addEventListener("click", () => toggleAudio(deps));
  editBtn.addEventListener("click", () => toggleSpriteEditor(deps));

  // Export ROM
  exportBtn.addEventListener("click", async () => {
    const romStore = emulator.getRomStore();
    if (!romStore) return;
    setStatus("Exporting ROM...");
    const blob = await romStore.exportZip();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    a.download = `${romStore.name}_${ts}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("ROM exported");
  });

  // CRT toggle (in Config > Display tab)
  crtToggle.addEventListener("change", () => {
    canvasWrapper.classList.toggle("crt", crtToggle.checked);
    try { localStorage.setItem("cps1-crt", crtToggle.checked ? "1" : "0"); } catch {}
  });
  if (localStorage.getItem("cps1-crt") === "1") {
    canvasWrapper.classList.add("crt");
    crtToggle.checked = true;
  }

  // TATE mode
  tateToggle.addEventListener("change", () => {
    canvasWrapper.classList.toggle("tate", tateToggle.checked);
  });

  // Quit button
  quitBtn.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    getDebugPanel()?.destroy();
    setDebugPanel(null);
    getAudioPanel()?.destroy();
    setAudioPanel(null);
    emulator.stop();
    emulator.suspendAudio();
    dropZone.classList.remove("hidden");
    canvas.style.visibility = "hidden";
    domScreen.style.display = "none";
    setGameScreen(null);
    controlsEl.classList.remove("visible");
    pauseBtn.textContent = "Pause (P)";
    pauseBtn.classList.remove("active");
    loadBtn.disabled = !gameSelect.value;
    setStatus("");
  });

  // Double-click / double-tap fullscreen
  canvasWrapper.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (document.body.classList.contains('edit-active')) return;
    toggleFullscreen(canvasWrapper);
  });

  let lastTapTime = 0;
  canvasWrapper.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      e.preventDefault();
      toggleFullscreen(canvasWrapper);
    }
    lastTapTime = now;
  });
}
