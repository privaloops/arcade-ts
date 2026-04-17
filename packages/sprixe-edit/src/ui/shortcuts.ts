/**
 * Keyboard shortcuts — consolidated keydown handler for global shortcuts.
 */

import type { Emulator } from "@sprixe/engine/emulator";
import { downloadTextFile } from "../utils/trace-export";
import { updatePauseBtn } from "./controls-bar";

/** Minimal interface for pause/resume/audio — works with both CPS1 and Neo-Geo emulators */
interface Pausable {
  isRunning(): boolean;
  isPaused(): boolean;
  pause(): void;
  resume(): void;
  suspendAudio(): void;
  resumeAudio(): void;
  getGameName(): string;
}

export interface ShortcutsDeps {
  emulator: Emulator;
  /** Returns the currently active emulator (CPS1 or Neo-Geo) */
  getActiveEmulator?: () => Pausable | null;
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
  toggleSynth(): void;
  toggleFullscreen(): void;
  isCtrlModalOpen(): boolean;
  isSsModalOpen(): boolean;
  setStatus(msg: string): void;
  saveStudio(): void;
  loadStudio(): void;
}

export function initShortcuts(deps: ShortcutsDeps): void {
  const {
    emulator, canvasWrapper, emuBar,
    pauseBtn, muteBtn,
    getMuted, setMuted,
    openControlsModal, closeControlsModal,
    openSsModal, closeSsModal,
    toggleDebug, toggleAudio, toggleSynth, toggleFullscreen,
    isCtrlModalOpen, isSsModalOpen,
    setStatus,
  } = deps;

  // T = toggle CPU trace
  let tracing = false;

  const { saveStudio, loadStudio } = deps;

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    // Ctrl+S = save .sprixe, Ctrl+O = load .sprixe
    if (e.ctrlKey && key === 's') { e.preventDefault(); saveStudio(); return; }
    if (e.ctrlKey && key === 'o') { e.preventDefault(); loadStudio(); return; }

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
      const emu = deps.getActiveEmulator?.() ?? emulator;
      setMuted(!getMuted());
      if (getMuted()) {
        emu.suspendAudio();
        muteBtn.textContent = "🔇";
        muteBtn.classList.add("active");
        setStatus("Muted");
      } else {
        emu.resumeAudio();
        muteBtn.textContent = "🔊";
        muteBtn.classList.remove("active");
        setStatus("Running");
      }
      return;
    }

    // P = Pause / Resume
    if (key === "p") {
      const emu = deps.getActiveEmulator?.() ?? emulator;
      if (emu.isRunning()) {
        emu.pause();
        emu.suspendAudio();
        updatePauseBtn(pauseBtn, emuBar, true);
        setStatus("Paused");
      } else if (emu.isPaused()) {
        emu.resume();
        if (!getMuted()) emu.resumeAudio();
        updatePauseBtn(pauseBtn, emuBar, false);
        setStatus("Running");
      }
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

    // F9 = screenshot canvas (requires preserveDrawingBuffer in renderer-webgl.ts)
    if (e.code === "F9") {
      e.preventDefault();
      const canvas = canvasWrapper.querySelector("canvas");
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const name = emulator.getGameName() || "screenshot";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}_capture.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus("Screenshot saved");
      });
      return;
    }

    // F10 = dump Neo-Geo sprite table + enable VRAM trace for Todo sprites
    if (e.code === "F10") {
      e.preventDefault();
      const ngo = (window as unknown as Record<string, unknown>).__ngoEmu;
      if (ngo) {
        const emu = ngo as {
          getVideo: () => { dumpSpriteTable: () => void };
          getBus: () => { enableVramTrace: (s: number[]) => void; disableVramTrace: () => void };
        };
        emu.getVideo().dumpSpriteTable();
        // Trace SCB writes for sprites 89-110 (Todo's suspected range)
        const sprites = Array.from({ length: 22 }, (_, i) => 89 + i);
        emu.getBus().enableVramTrace(sprites);
        console.log('[Debug] VRAM trace ON for sprites 89-110. Press F10 again in 2s to see writes.');
      }
      return;
    }

    // Remaining shortcuts require a game running or paused
    const activeEmu = deps.getActiveEmulator?.() ?? emulator;
    if (!activeEmu.isRunning() && !activeEmu.isPaused()) return;

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
