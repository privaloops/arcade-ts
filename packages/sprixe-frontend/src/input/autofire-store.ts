/**
 * Autofire storage — shared with @sprixe/engine's InputManager. The
 * engine reads `cps1-autofire-p1` / `cps1-autofire-p2` at construction
 * time, so toggling from the frontend settings UI takes effect on the
 * next game launch without extra wiring.
 *
 * Stored payload per key is a JSON array of button keys:
 *   ["button1", "button4"]  // auto-fire on LP and LK
 *
 * Autofire is a per-player setting: the same physical button on a
 * device is auto-fired for P1 but not P2 (or vice versa) — the device
 * itself doesn't carry the flag, the player does.
 */

export type AutofireButton = "button1" | "button2" | "button3" | "button4" | "button5" | "button6";

export const AUTOFIRE_BUTTONS: readonly AutofireButton[] = [
  "button1",
  "button2",
  "button3",
  "button4",
  "button5",
  "button6",
];

export type PlayerIndex = 0 | 1;

const STORAGE_KEYS: Readonly<Record<PlayerIndex, string>> = {
  0: "cps1-autofire-p1",
  1: "cps1-autofire-p2",
};

export function loadAutofire(player: PlayerIndex): Set<AutofireButton> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[player]);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<AutofireButton>();
    for (const entry of parsed) {
      if (typeof entry === "string" && (AUTOFIRE_BUTTONS as readonly string[]).includes(entry)) {
        out.add(entry as AutofireButton);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

export function saveAutofire(player: PlayerIndex, flags: Set<AutofireButton>): void {
  try {
    localStorage.setItem(STORAGE_KEYS[player], JSON.stringify([...flags]));
  } catch {
    // localStorage quota / unavailable — silent: autofire is a comfort
    // feature, losing it shouldn't break the arcade.
  }
}

export function toggleAutofire(
  player: PlayerIndex,
  button: AutofireButton,
  enabled: boolean,
): Set<AutofireButton> {
  const current = loadAutofire(player);
  if (enabled) current.add(button);
  else current.delete(button);
  saveAutofire(player, current);
  return current;
}
