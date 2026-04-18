/**
 * Input mapping storage — persists the first-boot controller setup to
 * localStorage under the versioned key `sprixe.input.mapping.v1`.
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
  | "confirm"
  | "back";

export const MAPPING_ROLES: readonly MappingRole[] = [
  "coin",
  "start",
  "up",
  "down",
  "confirm",
  "back",
];

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
