/**
 * Keyboard configuration — key mapping UI for P1 and P2.
 */

import type { Emulator } from "@sprixe/engine/emulator";
import type { KeyMapping } from "@sprixe/engine/input/input";

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

function startKbListening(key: KbMappingKey, btn: HTMLButtonElement, player: number): void {
  if (kbListeningBtn) kbListeningBtn.classList.remove("listening");
  kbListeningKey = key;
  kbListeningBtn = btn;
  kbListeningPlayer = player;
  btn.textContent = "Press...";
  btn.classList.add("listening");
}

function renderKbColumn(emulator: Emulator, player: number, container: HTMLDivElement): void {
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

export function renderKbModal(emulator: Emulator, p1Container: HTMLDivElement, p2Container: HTMLDivElement): void {
  renderKbColumn(emulator, 0, p1Container);
  renderKbColumn(emulator, 1, p2Container);
}

export function cancelKbListening(): void {
  if (kbListeningBtn) kbListeningBtn.classList.remove("listening");
  kbListeningKey = null;
  kbListeningBtn = null;
}

export function initKeyboardCapture(emulator: Emulator): void {
  // Capture keyboard input when listening (capture phase to intercept before other handlers)
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
}
