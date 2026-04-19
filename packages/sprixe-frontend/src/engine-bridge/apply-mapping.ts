/**
 * Push the user's captured InputMapping onto an engine InputManager.
 *
 * Runs for both CPS-1 and Neo-Geo. For each player slot that exists we
 * merge the captured bindings onto the engine's defaults:
 *   - gamepad button indices → `setGamepadMapping`
 *   - keyboard key codes     → `setKeyMapping`
 *
 * Unmapped roles keep the engine default, so a user who only rebound
 * `coin` and `start` doesn't lose the rest of the arcade controls.
 */

import type { InputMapping } from "../input/mapping-store";
import { mappingToEngineGamepadMapping, mappingToEngineKeyMapping } from "../input/mapping-store";

interface InputManagerLike {
  getGamepadMapping(player: number): Record<string, number>;
  setGamepadMapping(player: number, mapping: Record<string, number>): void;
  getKeyMapping(player: number): Record<string, string>;
  setKeyMapping(player: number, mapping: Record<string, string>): void;
}

export function applyUserMapping(
  input: unknown,
  mapping: InputMapping | null,
): void {
  if (!mapping) return;
  const im = input as InputManagerLike;
  for (const player of [0, 1] as const) {
    const gpPatch = mappingToEngineGamepadMapping(mapping, player);
    if (Object.keys(gpPatch).length > 0) {
      im.setGamepadMapping(player, { ...im.getGamepadMapping(player), ...gpPatch });
    }
    const keyPatch = mappingToEngineKeyMapping(mapping, player);
    if (Object.keys(keyPatch).length > 0) {
      im.setKeyMapping(player, { ...im.getKeyMapping(player), ...keyPatch });
    }
  }
}
