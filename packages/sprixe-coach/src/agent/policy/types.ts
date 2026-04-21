/**
 * DSL types — the contract between Claude (policy author) and the
 * runtime executor. See agent/DSL-CATALOG.md for the full taxonomy.
 */

export type ConditionId =
  // Distance
  | 'dist_close' | 'dist_mid' | 'dist_far' | 'dist_fullscreen'
  // P1 movement
  | 'p1_idle' | 'p1_walking_forward' | 'p1_walking_back' | 'p1_crouching'
  | 'p1_jump_forward' | 'p1_jump_back' | 'p1_jump_neutral'
  // P1 attacks
  | 'p1_attacking_normal' | 'p1_attacking_special'
  | 'fireball_flying' | 'p1_whiffed_special' | 'p1_recovery_normal'
  // Status
  | 'p1_stunned' | 'me_stunned'
  // Position
  | 'cornered_me' | 'cornered_them' | 'midscreen'
  // HP
  | 'hp_lead_big' | 'hp_lead_small' | 'hp_neutral' | 'hp_behind_small' | 'hp_behind_big'
  | 'near_death_me' | 'near_death_them'
  // Timer
  | 'round_start' | 'timer_low';

export type ActionId =
  // Specials
  | 'hadouken_jab' | 'hadouken_strong' | 'hadouken_fierce'
  | 'shoryu_jab' | 'shoryu_strong' | 'shoryu_fierce'
  | 'tatsu_lk' | 'tatsu_mk' | 'tatsu_hk'
  // Air Tatsus — started from a jump (qcb+K while airborne)
  | 'air_tatsu_lk' | 'air_tatsu_mk' | 'air_tatsu_hk'
  // Normals — 6 standing + 6 crouching
  | 'standing_jab' | 'standing_strong' | 'standing_fierce'
  | 'standing_short' | 'standing_forward' | 'standing_rh'
  | 'crouch_jab' | 'crouch_strong' | 'crouch_fierce'
  | 'crouch_short' | 'crouch_mk' | 'sweep'
  // Jumps — 6 forward + 6 neutral + 6 back variants
  | 'jump_forward_lp' | 'jump_forward_mp' | 'jump_forward_hp'
  | 'jump_forward_lk' | 'jump_forward_mk' | 'jump_forward_hk'
  | 'jump_neutral_lp' | 'jump_neutral_mp' | 'jump_neutral_hp'
  | 'jump_neutral_lk' | 'jump_neutral_mk' | 'jump_neutral_hk'
  | 'jump_back_lp'    | 'jump_back_mp'    | 'jump_back_hp'
  | 'jump_back_lk'    | 'jump_back_mk'    | 'jump_back_hk'
  // Bare jumps (no attack) for mobility / baits
  | 'jump_neutral' | 'jump_back' | 'empty_jump'
  // Movement
  | 'walk_forward' | 'walk_back' | 'neutral'
  // Block
  | 'block_crouch' | 'block_stand'
  // Throws
  | 'throw_forward' | 'throw_back'
  // Losing actions (deliberate mistakes for believable AI)
  | 'walk_into_fireball' | 'whiff_shoryu_midscreen' | 'whiff_throw';

export type Outcome = 'win' | 'neutral' | 'trade' | 'loss';

export interface Rule {
  /** All conditions must be true for the rule to be activable. */
  if: readonly ConditionId[];
  do: ActionId;
  /** Relative weight within matched rules at the same priority group. */
  weight: number;
  /** For adaptive difficulty (future). */
  outcome?: Outcome;
}

export interface Policy {
  plan_tag?: string;
  narration?: string;
  rules: readonly Rule[];
  fallback?: { do: ActionId };
}
