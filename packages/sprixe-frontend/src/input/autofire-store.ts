/**
 * Autofire storage — shared with @sprixe/engine's InputManager. The
 * engine reads the same localStorage key (`cps1-autofire-p1`) at
 * construction time, so toggling from the frontend settings UI takes
 * effect on the next game launch without extra wiring.
 *
 * The stored payload is a JSON array of button keys:
 *   ["button1", "button4"]  // auto-fire on LP and LK
 *
 * Key names match the engine's `AutofireKey` type (`button1`..`button6`).
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

const STORAGE_KEY_P1 = "cps1-autofire-p1";

export function loadAutofire(): Set<AutofireButton> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_P1);
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

export function saveAutofire(flags: Set<AutofireButton>): void {
  try {
    localStorage.setItem(STORAGE_KEY_P1, JSON.stringify([...flags]));
  } catch {
    // localStorage quota / unavailable — silent: autofire is a comfort
    // feature, losing it shouldn't break the arcade.
  }
}

export function toggleAutofire(button: AutofireButton, enabled: boolean): Set<AutofireButton> {
  const current = loadAutofire();
  if (enabled) current.add(button);
  else current.delete(button);
  saveAutofire(current);
  return current;
}
