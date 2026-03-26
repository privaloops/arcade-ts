/**
 * Keyboard shortcuts — consolidated keydown handler for global shortcuts.
 */

import type { Emulator } from "../emulator";
import { downloadTextFile } from "../utils/trace-export";
import { updatePauseBtn } from "./controls-bar";

export interface ShortcutsDeps {
  emulator: Emulator;
  canvasWrapper: HTMLDivElement;
  emuBar: HTMLDivElement;
  pauseBtn: HTMLButtonElement;
  muteBtn: HTMLButtonElement;
  getMuted(): boolean;
  setMuted(m: boolean): void;
  togglePause(): void;
  toggleMute(): void;
  openControlsModal(): void;
  closeControlsModal(): void;
  openSsModal(mode: "save" | "load"): void;
  closeSsModal(): void;
  toggleDebug(): void;
  toggleAudio(): void;
  toggleSpriteEditor(): void;
  toggleSynth(): void;
  toggleFullscreen(): void;
  isCtrlModalOpen(): boolean;
  isSsModalOpen(): boolean;
  setStatus(msg: string): void;
}

export function initShortcuts(deps: ShortcutsDeps): void {
  const {
    emulator, canvasWrapper, emuBar,
    pauseBtn, muteBtn,
    getMuted, setMuted,
    openControlsModal, closeControlsModal,
    openSsModal, closeSsModal,
    toggleDebug, toggleAudio, toggleSpriteEditor, toggleSynth, toggleFullscreen,
    isCtrlModalOpen, isSsModalOpen,
    setStatus,
  } = deps;

  // T = toggle CPU trace
  let tracing = false;

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    // T = toggle CPU trace (always active)
    if (e.code === 'KeyT' || key === 't') {
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
      return;
    }

    // Escape = close modals first, then exit pseudo-fullscreen
    if (e.code === "Escape") {
      if (isSsModalOpen()) { closeSsModal(); }
      else if (isCtrlModalOpen()) { closeControlsModal(); }
      else if (document.body.classList.contains("pseudo-fullscreen")) {
        document.body.classList.remove("pseudo-fullscreen");
      }
      return;
    }

    // M = Mute / Unmute
    if (key === "m") {
      setMuted(!getMuted());
      if (getMuted()) {
        emulator.suspendAudio();
        muteBtn.textContent = "🔇";
        muteBtn.classList.add("active");
        setStatus("Muted");
      } else {
        emulator.resumeAudio();
        muteBtn.textContent = "🔊";
        muteBtn.classList.remove("active");
        setStatus("Running");
      }
      return;
    }

    // P = Pause / Resume
    if (key === "p") {
      if (emulator.isRunning()) {
        emulator.pause();
        emulator.suspendAudio();
        updatePauseBtn(pauseBtn, emuBar, true);
        setStatus("Paused");
      } else if (emulator.isPaused()) {
        emulator.resume();
        if (!getMuted()) emulator.resumeAudio();
        updatePauseBtn(pauseBtn, emuBar, false);
        setStatus("Running");
      }
      return;
    }

    // E = Toggle sprite editor
    if (key === "e") {
      toggleSpriteEditor();
      return;
    }

    // F = Toggle fullscreen
    if (key === "f") {
      toggleFullscreen();
      return;
    }

    // Function key shortcuts (modals block all)
    if (isCtrlModalOpen() || isSsModalOpen()) return;

    // F2/F3: toggle panels (always available, even without ROM)
    if (e.code === "F2") {
      e.preventDefault();
      toggleDebug();
      return;
    } else if (e.code === "F3") {
      e.preventDefault();
      toggleAudio();
      return;
    }

    // Remaining shortcuts require a game running or paused
    if (!emulator.isRunning() && !emulator.isPaused()) return;

    if (e.code === "F1") {
      e.preventDefault();
      openControlsModal();
    } else if (e.code === "F4") {
      e.preventDefault();
      toggleSynth();
    } else if (e.code === "F5") {
      e.preventDefault();
      openSsModal("save");
    } else if (e.code === "F8") {
      e.preventDefault();
      openSsModal("load");
    }
  });
}
