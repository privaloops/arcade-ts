/**
 * Gamepad configuration — button mapping UI for P1 and P2.
 */

import type { Emulator } from "@sprixe/engine/emulator";
import type { GamepadMapping, AutofireKey } from "@sprixe/engine/input/input";

type MappingKey = keyof GamepadMapping;

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

export const GP_CONFIG_ROWS: { key: MappingKey; label: string }[] = [
  { key: "button1", label: "Button 1" },
  { key: "button2", label: "Button 2" },
  { key: "button3", label: "Button 3" },
  { key: "button4", label: "Button 4" },
  { key: "button5", label: "Button 5" },
  { key: "button6", label: "Button 6" },
  { key: "start",   label: "Start" },
  { key: "coin",    label: "Coin" },
];

const AUTOFIRE_ELIGIBLE: Set<string> = new Set(["button1", "button2", "button3", "button4", "button5", "button6"]);

let listeningKey: MappingKey | null = null;
let listeningBtn: HTMLButtonElement | null = null;
let listeningPlayer = 0;
let listenRafId = 0;

function captureButton(emulator: Emulator, index: number): void {
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

function startListening(emulator: Emulator, key: MappingKey, btn: HTMLButtonElement, player: number = 0): void {
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
          captureButton(emulator, i);
          return;
        }
      }
    }
    listenRafId = requestAnimationFrame(poll);
  }
  listenRafId = requestAnimationFrame(poll);
}

function renderGpColumn(emulator: Emulator, player: number, container: HTMLDivElement): void {
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
    renderGpColumn(emulator, player, container); // re-render to show/hide mapping rows
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
    btn.addEventListener("click", () => startListening(emulator, row.key, btn, player));
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

export function renderGpModal(emulator: Emulator, p1Container: HTMLDivElement, p2Container: HTMLDivElement): void {
  renderGpColumn(emulator, 0, p1Container);
  renderGpColumn(emulator, 1, p2Container);
}

export function cancelGpListening(): void {
  if (listeningBtn) listeningBtn.classList.remove("listening");
  cancelAnimationFrame(listenRafId);
  listeningKey = null;
  listeningBtn = null;
}

export function updateGamepadDeviceDropdowns(
  emulator: Emulator,
  ctrlOverlay: HTMLDivElement,
): void {
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
}
