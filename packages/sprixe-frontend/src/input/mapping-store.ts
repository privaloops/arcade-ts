/**
 * Input mapping storage — persists the first-boot controller setup to
 * localStorage under the versioned key `sprixe.input.mapping.v1`.
 *
 * The mapping covers the full arcade surface: coin, start, directions
 * and 6 play buttons (the shape SF2 / CPS-1 expects). Frontend menu
 * navigation is *derived* from those play buttons — button1 always
 * acts as confirm, button2 as back, button3 opens the context menu,
 * start opens settings, coin-hold triggers the pause overlay. This way
 * the user never needs to bind a bespoke "menu button" — the arcade
 * stick naturally drives both gameplay and UI.
 *
 * Version field is load-bearing: any future schema bump will read the
 * old payload, migrate, and rewrite under v2 without losing mappings.
 */

export const STORAGE_KEY = "sprixe.input.mapping.v1";

export type MappingRole =
  | "coin"
  | "start"
  | "up"
  | "down"
  | "left"
  | "right"
  | "button1"
  | "button2"
  | "button3"
  | "button4"
  | "button5"
  | "button6";

/**
 * Order of the prompts during the first-boot / reset mapping flow.
 * Ordered so the arcade sequence (coin → start → directions → 6 game
 * buttons) feels natural — the user walks their stick left-to-right.
 */
export const MAPPING_ROLES: readonly MappingRole[] = [
  "coin",
  "start",
  "up",
  "down",
  "left",
  "right",
  "button1",
  "button2",
  "button3",
  "button4",
  "button5",
  "button6",
];

/**
 * Human-readable labels for each role — consumed by the MappingScreen
 * prompt and by the Settings → Controls tab listing.
 */
export const MAPPING_ROLE_LABELS: Readonly<Record<MappingRole, string>> = {
  coin: "Coin (Insert)",
  start: "1P Start",
  up: "↑ Up",
  down: "↓ Down",
  left: "← Left",
  right: "→ Right",
  button1: "Button 1 (LP)",
  button2: "Button 2 (MP)",
  button3: "Button 3 (HP)",
  button4: "Button 4 (LK)",
  button5: "Button 5 (MK)",
  button6: "Button 6 (HK)",
};

export type InputBinding =
  | { kind: "button"; index: number }
  | { kind: "axis"; index: number; dir: -1 | 1 }
  | { kind: "key"; code: string };

export interface InputMapping {
  version: 1;
  type: "gamepad" | "keyboard";
  p1: Partial<Record<MappingRole, InputBinding>>;
}

export function loadMapping(): InputMapping | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InputMapping;
    if (parsed?.version !== 1 || (parsed.type !== "gamepad" && parsed.type !== "keyboard")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveMapping(mapping: InputMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

export function clearMapping(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function bindingsEqual(a: InputBinding, b: InputBinding): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "button" && b.kind === "button") return a.index === b.index;
  if (a.kind === "axis" && b.kind === "axis") return a.index === b.index && a.dir === b.dir;
  if (a.kind === "key" && b.kind === "key") return a.code === b.code;
  return false;
}

/**
 * Returns the role already bound to `binding` in `mapping`, or null if
 * the binding is free. Used by the mapping screen to refuse duplicate
 * assignments.
 */
export function findDuplicate(
  mapping: Partial<Record<MappingRole, InputBinding>>,
  binding: InputBinding
): MappingRole | null {
  for (const [role, existing] of Object.entries(mapping) as [MappingRole, InputBinding][]) {
    if (existing && bindingsEqual(existing, binding)) return role;
  }
  return null;
}

import type { NavBinding } from "./gamepad-nav";

/**
 * Frontend menu bindings exposed by `GamepadNav`. confirm/back/settings/
 * contextMenu/coin are *derived* from the arcade play buttons — the
 * first-boot mapping never asks for them directly.
 */
export interface GamepadNavBindingsPatch {
  up?: NavBinding | null;
  down?: NavBinding | null;
  left?: NavBinding | null;
  right?: NavBinding | null;
  confirm?: NavBinding | null;
  back?: NavBinding | null;
  contextMenu?: NavBinding | null;
  start?: NavBinding | null;
  bumperLeft?: NavBinding | null;
  bumperRight?: NavBinding | null;
  coin?: NavBinding | null;
}

function navFromRole(mapping: InputMapping, role: MappingRole): NavBinding | undefined {
  const b = mapping.p1[role];
  if (!b) return undefined;
  if (b.kind === "button") return { kind: "button", index: b.index };
  if (b.kind === "axis") return { kind: "axis", index: b.index, dir: b.dir };
  return undefined;
}

/**
 * Projects the user's first-boot mapping onto GamepadNav's bindings
 * using the arcade derivation:
 *
 *   button1 → confirm      (launch / OK)
 *   button2 → back         (cancel / close)
 *   button3 → contextMenu  (per-game actions)
 *   button5 → bumperLeft   (previous tab in Settings)
 *   button6 → bumperRight  (next tab in Settings)
 *   start   → start        (secondary launch in browser)
 *   coin    → coin-hold    (Settings in browser, pause overlay in-game)
 *
 * Roles without a user binding stay `null` so the menu never fires
 * actions on buttons the user didn't map — that was the root cause of
 * the "Y opens a mysterious overlay" bug.
 */
export function mappingToGamepadNavBindings(
  mapping: InputMapping | null,
): GamepadNavBindingsPatch {
  if (!mapping || mapping.type !== "gamepad") return {};
  const patch: GamepadNavBindingsPatch = {
    up: navFromRole(mapping, "up") ?? null,
    down: navFromRole(mapping, "down") ?? null,
    left: navFromRole(mapping, "left") ?? null,
    right: navFromRole(mapping, "right") ?? null,
    confirm: navFromRole(mapping, "button1") ?? null,
    back: navFromRole(mapping, "button2") ?? null,
    contextMenu: navFromRole(mapping, "button3") ?? null,
    bumperLeft: navFromRole(mapping, "button5") ?? null,
    bumperRight: navFromRole(mapping, "button6") ?? null,
    start: navFromRole(mapping, "start") ?? null,
    coin: navFromRole(mapping, "coin") ?? null,
  };
  return patch;
}

/**
 * Project the first-boot mapping onto the engine's InputManager gamepad
 * mapping so the emulator's I/O ports react to the *actual* buttons the
 * user picked — including the 6 play buttons.
 *
 * Only `button` bindings are forwarded; the engine's GamepadMapping
 * stores numeric indices only. Axes (joystick-style directions) are
 * read directly by InputManager from `pad.axes` regardless of mapping.
 */
export interface EngineGamepadMappingPatch {
  up?: number;
  down?: number;
  left?: number;
  right?: number;
  button1?: number;
  button2?: number;
  button3?: number;
  button4?: number;
  button5?: number;
  button6?: number;
  start?: number;
  coin?: number;
}

export function mappingToEngineGamepadMapping(
  mapping: InputMapping | null,
): EngineGamepadMappingPatch {
  if (!mapping || mapping.type !== "gamepad") return {};
  const patch: EngineGamepadMappingPatch = {};
  const pick = (role: MappingRole, key: keyof EngineGamepadMappingPatch): void => {
    const b = mapping.p1[role];
    if (b?.kind === "button") patch[key] = b.index;
  };
  pick("up", "up");
  pick("down", "down");
  pick("left", "left");
  pick("right", "right");
  pick("button1", "button1");
  pick("button2", "button2");
  pick("button3", "button3");
  pick("button4", "button4");
  pick("button5", "button5");
  pick("button6", "button6");
  pick("start", "start");
  pick("coin", "coin");
  return patch;
}
