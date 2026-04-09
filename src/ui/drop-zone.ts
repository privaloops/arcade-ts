/**
 * Drop zone — ROM file loading via drag & drop, file picker, and game selector.
 * Supports both CPS1 and Neo-Geo ROMs with auto-detection.
 */

import type { Emulator } from "../emulator";
import { CPS1_PARENT_GAMES, ROT270_GAMES } from "../game-catalog";
import { DebugPanel } from "../debug/debug-panel";
import type { AudioPanel } from "../audio/audio-panel";
import { loadDipFromStorage } from "./dip-switch-ui";
import { isNeoGeoRom } from "../memory/neogeo-rom-loader";
import type { NeoGeoEmulator } from "../neogeo-emulator";
import JSZip from "jszip";

export interface DropZoneDeps {
  emulator: Emulator;
  /** Factory to create a NeoGeoEmulator on demand, reusing the CPS1 renderer */
  createNeoGeoEmulator?: () => NeoGeoEmulator;
  /** Currently active Neo-Geo emulator (if a Neo-Geo ROM was loaded) */
  neoGeoEmulator?: NeoGeoEmulator | null;
  canvas: HTMLCanvasElement;
  domScreen: HTMLDivElement;
  dropZone: HTMLDivElement;
  fileInput: HTMLInputElement;
  emuBar: HTMLDivElement;
  canvasWrapper: HTMLDivElement;
  tateToggle: HTMLInputElement;
  gameSelect: HTMLSelectElement;
  loadBtn: HTMLButtonElement;
  romControls: HTMLDivElement;
  exportBtn: HTMLButtonElement;
  statusEl: HTMLParagraphElement;
  getRendererMode(): "canvas" | "dom";
  setupDomRenderer(): void;
  getDebugPanel(): DebugPanel | null;
  setDebugPanel(p: DebugPanel | null): void;
  getAudioPanel(): AudioPanel | null;
  setLastRomFile(f: File | null): void;
  getLastRomFile(): File | null;
  setStatus(msg: string): void;
  onSprixeFile(file: File): void;
  onRomLoaded(gameName: string): void;
}

let _deps: DropZoneDeps | null = null;

async function handleRomFile(file: File): Promise<void> {
  if (!_deps) return;
  const {
    emulator, dropZone, emuBar, canvas, domScreen,
    canvasWrapper, tateToggle, getRendererMode, setupDomRenderer,
    getDebugPanel, setDebugPanel, getAudioPanel, setLastRomFile, setStatus,
  } = _deps;

  if (file.name.endsWith(".sprixe")) {
    _deps.onSprixeFile(file);
    return;
  }

  if (!file.name.endsWith(".zip")) {
    setStatus("Error: expected a .zip or .sprixe file.");
    return;
  }

  setLastRomFile(file);
  setStatus(`Loading: ${file.name}...`);

  try {
    // Pre-inspect ZIP to detect Neo-Geo vs CPS1
    const zipBuf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(zipBuf);
    const fileNames: string[] = [];
    zip.forEach((path, entry) => {
      if (!entry.dir) {
        const name = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
        fileNames.push(name);
      }
    });

    const isNeoGeo = isNeoGeoRom(fileNames);

    if (isNeoGeo && _deps.createNeoGeoEmulator) {
      // Stop CPS1 emulator — release the canvas/WebGL context
      emulator.stop();

      // Neo-Geo path
      let ngoEmu = _deps.neoGeoEmulator;
      if (!ngoEmu) {
        ngoEmu = _deps.createNeoGeoEmulator();
        _deps.neoGeoEmulator = ngoEmu;
      }
      await ngoEmu.initAudio();
      await ngoEmu.loadRomFromFile(file);
      ngoEmu.resumeAudio();

      // Expose on window for E2E tests / debugging
      (window as unknown as Record<string, unknown>).__ngoEmu = ngoEmu;

      dropZone.classList.add("hidden");
      emuBar.classList.add("visible", "hidden-by-user");
      _deps.exportBtn.style.display = "";
      canvas.style.visibility = "visible";
      domScreen.style.display = "none";

      ngoEmu.start();
      _deps.onRomLoaded(ngoEmu.getGameName());
      setStatus(`Running: ${file.name} (Neo-Geo)`);
    } else {
      // CPS1 path (original)
      await emulator.initAudio();
      await emulator.loadRom(file);
      emulator.resumeAudio();

      // Stop any active Neo-Geo emulator
      if (_deps.neoGeoEmulator) {
        _deps.neoGeoEmulator.stop();
        _deps.neoGeoEmulator = null;
      }

      dropZone.classList.add("hidden");
      emuBar.classList.add("visible", "hidden-by-user");
      _deps.exportBtn.style.display = "";

      const mode = getRendererMode();
      if (mode !== "dom") {
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
      let debugPanel = getDebugPanel();
      if (!debugPanel) {
        debugPanel = new DebugPanel(emulator, canvas);
        setDebugPanel(debugPanel);
      }
      debugPanel.onGameChange();
      if (!debugPanel.isOpen()) {
        debugPanel.toggle();
      }

      // Setup DOM renderer AFTER debug panel
      if (mode === "dom") {
        canvas.style.visibility = "hidden";
        domScreen.style.display = "block";
        setupDomRenderer();
      }

      // Update audio panel
      getAudioPanel()?.onGameChange();

      emulator.start();
      _deps.onRomLoaded(emulator.getGameName());
      setStatus(`Running: ${file.name} (${mode}${isTate ? ', TATE' : ''})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${msg}`);
    console.error("ROM load error:", err);
  }
}

export { handleRomFile };

export function initDropZone(deps: DropZoneDeps): void {
  _deps = deps;
  const { emulator, dropZone, fileInput, gameSelect, loadBtn, romControls, setStatus } = deps;

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
      setStatus(`Loading ${gameName}...`);
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
}
