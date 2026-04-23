import type { ActionId } from '../policy/types';
import hierarchyData from './ken-punish-hierarchy.json';
import trajectoriesData from './ken-trajectories.json';
import {
  simulateOption,
  type KenSnapshot,
  type OpponentSnapshot,
  type PunishOption,
  type SimulationResult,
  type TrajectoryMap,
} from './punish-sim';

/**
 * Punish decision engine — walks the damage-ranked hierarchy, simulates
 * every option, picks the net-HP-best one that survives the
 * death-guard. Pure function, no state, safe to call every vblank.
 *
 * Policy (validated with the user):
 *   1. Every viable option scores deltaHp = damage_inflicted - damage_taken.
 *   2. Options that would kill Ken on the trade are rejected (death-
 *      guard: sim.kenDamageTaken >= ken.hp → skip).
 *   3. Viable candidates are sorted by deltaHp descending, with the
 *      hierarchy-file order as a stable tie-breaker.
 *   4. When the candidate pool is empty, the engine returns null and
 *      the caller falls back to `block_crouch` or walks.
 *
 * Why a pure function: the engine is called inside the 60 Hz vblank
 * loop. Zero allocations beyond the per-call results array, no
 * side effects — the caller decides what to do with the verdict.
 */

const HIERARCHY: readonly PunishOption[] = (hierarchyData as { options: PunishOption[] }).options;
const TRAJECTORIES: TrajectoryMap = trajectoriesData as TrajectoryMap;

export interface PunishDecision {
  option: PunishOption;
  simResult: SimulationResult;
  /** Net HP change for Ken if the option resolves (inflicted - taken).
   *  Block / evasion options report 0 regardless of the simulator's
   *  `connects` field, since they exchange no HP either way. */
  deltaHp: number;
}

/**
 * Main entry point. Returns the best viable punish decision, or null
 * when every option in the hierarchy whiffs or would kill Ken on the
 * trade. Callers should default to block_crouch on null.
 */
export function pickPunish(
  opponent: OpponentSnapshot,
  ken: KenSnapshot,
  rom: Uint8Array,
): PunishDecision | null {
  const viable: PunishDecision[] = [];

  for (const option of HIERARCHY) {
    const sim = simulateOption(option, opponent, ken, TRAJECTORIES, rom);
    if (sim.kenDamageTaken >= ken.hp) continue;            // death-guard

    if (sim.connects) {
      viable.push({
        option,
        simResult: sim,
        deltaHp: option.damage - sim.kenDamageTaken,
      });
      continue;
    }

    // Block and pure evasion never "connect" but are always safe
    // fallbacks. deltaHp = 0 keeps them at the bottom of the ranking;
    // any actual hit beats them.
    const first = option.sequence[0];
    const isBlock = first === 'block_crouch' || first === 'block_stand';
    const isPureEvade = first === 'jump_back' || first === 'jump_neutral' || first === 'empty_jump';
    if (isBlock || isPureEvade) {
      viable.push({ option, simResult: sim, deltaHp: 0 });
    }
  }

  if (viable.length === 0) return null;

  // Stable sort: preserves hierarchy order when deltaHp ties.
  viable.sort((a, b) => b.deltaHp - a.deltaHp);
  return viable[0]!;
}

/**
 * Convenience accessor for the first move of the chosen option —
 * useful when the caller only wants to push the initial action into
 * the sequencer. Combo options return the first hit; P3 will add a
 * full-sequence executor.
 */
export function pickPunishAction(
  opponent: OpponentSnapshot,
  ken: KenSnapshot,
  rom: Uint8Array,
): ActionId | null {
  const decision = pickPunish(opponent, ken, rom);
  if (!decision) return null;
  return decision.option.sequence[0] ?? null;
}
