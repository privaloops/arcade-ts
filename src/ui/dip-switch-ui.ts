/**
 * DIP switch UI — render DIP switches list in the Config modal.
 */

import type { Emulator } from "../emulator";
import { getDipDef, bankToIndex } from "../dip-switches";

export function saveDipToStorage(gameName: string, ioPorts: Uint8Array): void {
  const data = { a: ioPorts[10], b: ioPorts[12], c: ioPorts[14] };
  try { localStorage.setItem(`cps1-dip-${gameName}`, JSON.stringify(data)); } catch { /* quota */ }
}

export function loadDipFromStorage(gameName: string, ioPorts: Uint8Array): void {
  try {
    const raw = localStorage.getItem(`cps1-dip-${gameName}`);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, number>;
    if (typeof data["a"] === "number") ioPorts[10] = data["a"];
    if (typeof data["b"] === "number") ioPorts[12] = data["b"];
    if (typeof data["c"] === "number") ioPorts[14] = data["c"];
  } catch { /* corrupted */ }
}

export function renderDipList(
  emulator: Emulator,
  dipList: HTMLDivElement,
  onReload: () => void,
): void {
  const gameName = emulator.getGameName();
  const def = getDipDef(gameName);
  const ioPorts = emulator.getIoPorts();
  dipList.innerHTML = "";

  const reloadBtn = document.createElement("button");
  reloadBtn.className = "ctrl-btn";
  reloadBtn.style.cssText = "display:none;margin:14px auto 0;color:#ff1a50;border-color:#ff1a50;";
  reloadBtn.textContent = "Reload Game";
  reloadBtn.addEventListener("click", onReload);

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
