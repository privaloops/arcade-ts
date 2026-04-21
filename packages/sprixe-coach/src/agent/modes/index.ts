export { ModeManager } from './mode-manager';
export type { Mode, ModeContext, ModeOutput } from './types';
export { TurtleSpaceControl } from './turtle-space-control';
export { RushDownCorner } from './rush-down-corner';

import { TurtleSpaceControl } from './turtle-space-control';
import { RushDownCorner } from './rush-down-corner';
import type { Mode } from './types';

/** Registry of implemented modes, keyed by name. */
export const MODE_REGISTRY: Readonly<Record<string, Mode>> = {
  [TurtleSpaceControl.name]: TurtleSpaceControl,
  [RushDownCorner.name]: RushDownCorner,
  // TODO: ANTI_FIREBALL_MOBILE, TRAP_SETUP, DESPERATION_BLITZ,
  // GROUND_FOOTSIES, WAKEUP_PRESSURE, DEFENSIVE_SWITCH
};
