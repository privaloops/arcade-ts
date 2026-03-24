/**
 * Save state modal — slot selection, keyboard navigation, save/load.
 */

import type { Emulator } from "../emulator";
import { getSlotInfo, getNumSlots } from "../save-state";
import { showOverlay, hideOverlay } from "./modal";

export interface SaveStateUIDeps {
  emulator: Emulator;
  ssOverlay: HTMLDivElement;
  ssTitle: HTMLHeadingElement;
  ssSlots: HTMLDivElement;
  ssCloseBtn: HTMLButtonElement;
  canvasWrapper: HTMLDivElement;
  appEl: HTMLDivElement;
  getMuted(): boolean;
  setStatus(msg: string): void;
}

let ssMode: "save" | "load" = "save";
let ssSelectedSlot = 0;
let ssWasPaused = false;

let _deps: SaveStateUIDeps | null = null;

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function highlightSlot(index: number): void {
  if (!_deps) return;
  const slots = _deps.ssSlots.querySelectorAll<HTMLDivElement>(".ss-slot");
  slots.forEach((el, i) => {
    el.style.borderColor = i === index ? "#ff1a50" : "#444";
    el.style.background = i === index ? "#2a2a2a" : "#222";
  });
  ssSelectedSlot = index;
}

async function confirmSlot(index: number): Promise<void> {
  if (!_deps) return;
  const { emulator, setStatus } = _deps;
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
  if (!_deps) return;
  const { emulator, ssTitle, ssSlots } = _deps;
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

export function openSsModal(mode: "save" | "load"): void {
  if (!_deps) return;
  const { emulator } = _deps;
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
  showOverlay(_deps.ssOverlay, _deps.canvasWrapper, _deps.appEl);
}

export function closeSsModal(): void {
  if (!_deps) return;
  const { emulator, ssOverlay, canvasWrapper, appEl, getMuted } = _deps;
  hideOverlay(ssOverlay, canvasWrapper, appEl);

  // Resume if we paused it
  if (!ssWasPaused) {
    emulator.resume();
    if (!getMuted()) emulator.resumeAudio();
  }
}

export function isSsModalOpen(): boolean {
  return _deps?.ssOverlay.classList.contains("open") ?? false;
}

export function initSaveStateUI(deps: SaveStateUIDeps): void {
  _deps = deps;
  const { ssCloseBtn, ssOverlay } = deps;

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
}
