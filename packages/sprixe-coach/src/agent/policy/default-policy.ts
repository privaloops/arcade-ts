import type { Policy } from './types';

/**
 * Hardcoded fallback policy for Ryu — uses the FULL move panel so the
 * random picker has enough variety to look alive (no "stuck in 3 moves"
 * feel).
 *
 * Weighting philosophy:
 *   - In air, big buttons dominate (HK/HP), small are rare (LP/LK).
 *   - Specials alternate the 3 strengths naturally per call.
 *   - Close range mixes 6 normals (3 punches + 3 kicks) + throws + specials.
 *   - Block weights are aggressive to stop blockstring chains.
 */
export const DEFAULT_RYU_POLICY: Policy = {
  plan_tag: 'full-panel-ryu',
  rules: [
    // ══ ANTI-AIR (critical priority) ══════════════════════════════════
    { if: ['p1_jump_forward', 'dist_close'], do: 'shoryu_jab',             weight: 0.45, outcome: 'win' },
    { if: ['p1_jump_forward', 'dist_close'], do: 'shoryu_strong',          weight: 0.20, outcome: 'win' },
    { if: ['p1_jump_forward', 'dist_close'], do: 'shoryu_fierce',          weight: 0.25, outcome: 'win' },
    { if: ['p1_jump_forward', 'dist_close'], do: 'block_stand',            weight: 0.10, outcome: 'neutral' },

    { if: ['p1_jump_forward', 'dist_mid'],   do: 'shoryu_jab',             weight: 0.30, outcome: 'win' },
    { if: ['p1_jump_forward', 'dist_mid'],   do: 'shoryu_fierce',          weight: 0.20, outcome: 'win' },
    { if: ['p1_jump_forward', 'dist_mid'],   do: 'walk_back',              weight: 0.30, outcome: 'neutral' },
    { if: ['p1_jump_forward', 'dist_mid'],   do: 'block_crouch',           weight: 0.20, outcome: 'neutral' },

    // ══ STUN / CAPITALIZE ═════════════════════════════════════════════
    { if: ['p1_stunned'],                    do: 'hadouken_fierce',        weight: 0.30, outcome: 'win' },
    { if: ['p1_stunned'],                    do: 'shoryu_fierce',          weight: 0.25, outcome: 'win' },
    { if: ['p1_stunned'],                    do: 'jump_forward_hk',        weight: 0.20, outcome: 'win' },
    { if: ['p1_stunned'],                    do: 'jump_forward_hp',        weight: 0.15, outcome: 'win' },
    { if: ['p1_stunned'],                    do: 'tatsu_hk',               weight: 0.10, outcome: 'win' },

    // ══ PUNISH WHIFF ══════════════════════════════════════════════════
    { if: ['p1_whiffed_special'],            do: 'shoryu_fierce',          weight: 0.40, outcome: 'win' },
    { if: ['p1_whiffed_special'],            do: 'shoryu_strong',          weight: 0.20, outcome: 'win' },
    { if: ['p1_whiffed_special'],            do: 'hadouken_fierce',        weight: 0.20, outcome: 'win' },
    { if: ['p1_whiffed_special'],            do: 'jump_forward_hk',        weight: 0.20, outcome: 'win' },

    // ══ FIREBALL INCOMING — react by distance ══════════════════════════
    { if: ['fireball_flying', 'dist_far'],   do: 'jump_forward_hk',        weight: 0.25, outcome: 'win' },
    { if: ['fireball_flying', 'dist_far'],   do: 'jump_forward_hp',        weight: 0.20, outcome: 'win' },
    { if: ['fireball_flying', 'dist_far'],   do: 'jump_forward_mk',        weight: 0.15, outcome: 'win' },
    { if: ['fireball_flying', 'dist_far'],   do: 'block_crouch',           weight: 0.20, outcome: 'neutral' },
    { if: ['fireball_flying', 'dist_far'],   do: 'hadouken_fierce',        weight: 0.15, outcome: 'trade' },
    { if: ['fireball_flying', 'dist_far'],   do: 'hadouken_strong',        weight: 0.05, outcome: 'trade' },

    { if: ['fireball_flying', 'dist_mid'],   do: 'jump_forward_hk',        weight: 0.25, outcome: 'win' },
    { if: ['fireball_flying', 'dist_mid'],   do: 'jump_forward_mk',        weight: 0.20, outcome: 'win' },
    { if: ['fireball_flying', 'dist_mid'],   do: 'shoryu_fierce',          weight: 0.15, outcome: 'win' },
    { if: ['fireball_flying', 'dist_mid'],   do: 'block_crouch',           weight: 0.40, outcome: 'neutral' },

    { if: ['fireball_flying', 'dist_close'], do: 'block_crouch',           weight: 0.70, outcome: 'neutral' },
    { if: ['fireball_flying', 'dist_close'], do: 'shoryu_jab',             weight: 0.30, outcome: 'win' },

    // ══ P1 ATTACKING — close: mix block + counter + escape ════════════
    { if: ['p1_attacking_normal', 'dist_close'], do: 'block_crouch',       weight: 0.45, outcome: 'neutral' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'shoryu_jab',         weight: 0.12, outcome: 'win' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'shoryu_fierce',      weight: 0.06, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'throw_forward',      weight: 0.12, outcome: 'win' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'throw_back',         weight: 0.06, outcome: 'win' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'sweep',              weight: 0.08, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'crouch_fierce',      weight: 0.05, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_close'], do: 'jump_back',          weight: 0.06, outcome: 'neutral' },

    // ══ P1 ATTACKING — mid: counter-poke + spacing + preempt air ══════
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'block_crouch',       weight: 0.28, outcome: 'neutral' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'walk_back',          weight: 0.22, outcome: 'neutral' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'crouch_mk',          weight: 0.10, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'standing_rh',        weight: 0.10, outcome: 'win' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'sweep',              weight: 0.05, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'jump_back_hk',       weight: 0.08, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'hadouken_jab',       weight: 0.07, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'shoryu_jab',         weight: 0.05, outcome: 'trade' },
    { if: ['p1_attacking_normal', 'dist_mid'],   do: 'walk_forward',       weight: 0.05, outcome: 'neutral' },

    // ══ P1 RECOVERY NORMAL — punish the whiff (12f window) ════════════
    { if: ['p1_recovery_normal'],                do: 'shoryu_fierce',      weight: 0.30, outcome: 'win' },
    { if: ['p1_recovery_normal'],                do: 'shoryu_strong',      weight: 0.15, outcome: 'win' },
    { if: ['p1_recovery_normal'],                do: 'sweep',              weight: 0.15, outcome: 'win' },
    { if: ['p1_recovery_normal'],                do: 'standing_rh',        weight: 0.15, outcome: 'win' },
    { if: ['p1_recovery_normal'],                do: 'throw_forward',      weight: 0.10, outcome: 'win' },
    { if: ['p1_recovery_normal'],                do: 'hadouken_fierce',    weight: 0.10, outcome: 'win' },
    { if: ['p1_recovery_normal'],                do: 'jump_forward_hk',    weight: 0.05, outcome: 'win' },

    // ══ P1 IDLE / DIST_CLOSE — FULL close-range panel (15 options) ═══
    // Heavies dominate, lights sparse.
    { if: ['p1_idle', 'dist_close'],         do: 'standing_fierce',        weight: 0.13, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'standing_rh',            weight: 0.12, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'standing_strong',        weight: 0.08, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'standing_forward',       weight: 0.07, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'standing_jab',           weight: 0.04, outcome: 'neutral' },
    { if: ['p1_idle', 'dist_close'],         do: 'standing_short',         weight: 0.03, outcome: 'neutral' },
    { if: ['p1_idle', 'dist_close'],         do: 'crouch_fierce',          weight: 0.10, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'crouch_strong',          weight: 0.06, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'sweep',                  weight: 0.12, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'throw_forward',          weight: 0.08, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'throw_back',             weight: 0.05, outcome: 'win' },
    { if: ['p1_idle', 'dist_close'],         do: 'shoryu_fierce',          weight: 0.08, outcome: 'trade' },
    { if: ['p1_idle', 'dist_close'],         do: 'tatsu_lk',               weight: 0.04, outcome: 'trade' },
    { if: ['p1_idle', 'dist_close'],         do: 'tatsu_mk',               weight: 0.03, outcome: 'trade' },

    // ══ P1 IDLE / DIST_MID — pokes + varied jumps ═════════════════════
    // Jumps with heavy buttons dominate the air.
    { if: ['p1_idle', 'dist_mid'],           do: 'crouch_mk',              weight: 0.15, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'standing_forward',       weight: 0.08, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'standing_rh',            weight: 0.07, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_forward_hk',        weight: 0.12, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_forward_hp',        weight: 0.10, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_forward_mk',        weight: 0.08, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_forward_mp',        weight: 0.04, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_forward_lk',        weight: 0.02, outcome: 'trade' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_forward_lp',        weight: 0.02, outcome: 'trade' },
    { if: ['p1_idle', 'dist_mid'],           do: 'empty_jump',             weight: 0.04, outcome: 'neutral' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_neutral_hk',        weight: 0.04, outcome: 'neutral' },
    { if: ['p1_idle', 'dist_mid'],           do: 'jump_neutral_hp',        weight: 0.03, outcome: 'neutral' },
    { if: ['p1_idle', 'dist_mid'],           do: 'hadouken_fierce',        weight: 0.06, outcome: 'trade' },
    { if: ['p1_idle', 'dist_mid'],           do: 'hadouken_strong',        weight: 0.05, outcome: 'trade' },
    { if: ['p1_idle', 'dist_mid'],           do: 'hadouken_jab',           weight: 0.03, outcome: 'trade' },
    { if: ['p1_idle', 'dist_mid'],           do: 'tatsu_hk',               weight: 0.04, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'tatsu_mk',               weight: 0.03, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'air_tatsu_hk',           weight: 0.03, outcome: 'win' },
    { if: ['p1_idle', 'dist_mid'],           do: 'air_tatsu_mk',           weight: 0.02, outcome: 'win' },

    // ══ P1 IDLE / DIST_FAR — fireball spam + pressure jumps ═══════════
    { if: ['p1_idle', 'dist_far'],           do: 'hadouken_fierce',        weight: 0.35, outcome: 'win' },
    { if: ['p1_idle', 'dist_far'],           do: 'hadouken_strong',        weight: 0.18, outcome: 'win' },
    { if: ['p1_idle', 'dist_far'],           do: 'hadouken_jab',           weight: 0.10, outcome: 'win' },
    { if: ['p1_idle', 'dist_far'],           do: 'jump_forward_hk',        weight: 0.15, outcome: 'win' },
    { if: ['p1_idle', 'dist_far'],           do: 'jump_forward_hp',        weight: 0.10, outcome: 'win' },
    { if: ['p1_idle', 'dist_far'],           do: 'jump_forward_mk',        weight: 0.07, outcome: 'win' },
    { if: ['p1_idle', 'dist_far'],           do: 'walk_forward',           weight: 0.05, outcome: 'neutral' },

    // ══ P1 IDLE / DIST_FULLSCREEN ═════════════════════════════════════
    { if: ['p1_idle', 'dist_fullscreen'],    do: 'hadouken_fierce',        weight: 0.45, outcome: 'win' },
    { if: ['p1_idle', 'dist_fullscreen'],    do: 'hadouken_strong',        weight: 0.20, outcome: 'win' },
    { if: ['p1_idle', 'dist_fullscreen'],    do: 'hadouken_jab',           weight: 0.10, outcome: 'win' },
    { if: ['p1_idle', 'dist_fullscreen'],    do: 'jump_forward_hk',        weight: 0.15, outcome: 'trade' },
    { if: ['p1_idle', 'dist_fullscreen'],    do: 'walk_forward',           weight: 0.10, outcome: 'neutral' },

    // ══ P1 WALKING BACK — chase ═══════════════════════════════════════
    { if: ['p1_walking_back', 'dist_far'],   do: 'hadouken_fierce',        weight: 0.40, outcome: 'win' },
    { if: ['p1_walking_back', 'dist_far'],   do: 'hadouken_strong',        weight: 0.20, outcome: 'win' },
    { if: ['p1_walking_back', 'dist_far'],   do: 'walk_forward',           weight: 0.20, outcome: 'win' },
    { if: ['p1_walking_back', 'dist_far'],   do: 'jump_forward_hk',        weight: 0.20, outcome: 'win' },
    { if: ['p1_walking_back', 'dist_mid'],   do: 'crouch_mk',              weight: 0.25, outcome: 'win' },
    { if: ['p1_walking_back', 'dist_mid'],   do: 'jump_forward_hk',        weight: 0.25, outcome: 'win' },
    { if: ['p1_walking_back', 'dist_mid'],   do: 'hadouken_fierce',        weight: 0.20, outcome: 'trade' },
    { if: ['p1_walking_back', 'dist_mid'],   do: 'walk_forward',           weight: 0.15, outcome: 'neutral' },
    { if: ['p1_walking_back', 'dist_mid'],   do: 'standing_rh',            weight: 0.15, outcome: 'win' },

    // ══ P1 WALKING FORWARD — counter the approach ═════════════════════
    { if: ['p1_walking_forward', 'dist_mid'], do: 'hadouken_jab',          weight: 0.25, outcome: 'win' },
    { if: ['p1_walking_forward', 'dist_mid'], do: 'hadouken_strong',       weight: 0.15, outcome: 'win' },
    { if: ['p1_walking_forward', 'dist_mid'], do: 'crouch_mk',             weight: 0.20, outcome: 'trade' },
    { if: ['p1_walking_forward', 'dist_mid'], do: 'standing_rh',           weight: 0.15, outcome: 'win' },
    { if: ['p1_walking_forward', 'dist_mid'], do: 'walk_back',             weight: 0.15, outcome: 'neutral' },
    { if: ['p1_walking_forward', 'dist_mid'], do: 'jump_back_hk',          weight: 0.10, outcome: 'trade' },

    // ══ P1 CROUCHING — overhead mixup ═════════════════════════════════
    { if: ['p1_crouching', 'dist_mid'],      do: 'jump_forward_hk',        weight: 0.22, outcome: 'win' },
    { if: ['p1_crouching', 'dist_mid'],      do: 'jump_forward_hp',        weight: 0.18, outcome: 'win' },
    { if: ['p1_crouching', 'dist_mid'],      do: 'jump_forward_mk',        weight: 0.12, outcome: 'win' },
    { if: ['p1_crouching', 'dist_mid'],      do: 'sweep',                  weight: 0.15, outcome: 'trade' },
    { if: ['p1_crouching', 'dist_mid'],      do: 'crouch_mk',              weight: 0.15, outcome: 'win' },
    { if: ['p1_crouching', 'dist_mid'],      do: 'tatsu_hk',               weight: 0.10, outcome: 'win' },
    { if: ['p1_crouching', 'dist_mid'],      do: 'hadouken_strong',        weight: 0.08, outcome: 'trade' },

    { if: ['p1_crouching', 'dist_close'],    do: 'sweep',                  weight: 0.25, outcome: 'win' },
    { if: ['p1_crouching', 'dist_close'],    do: 'shoryu_fierce',          weight: 0.20, outcome: 'win' },
    { if: ['p1_crouching', 'dist_close'],    do: 'throw_forward',          weight: 0.15, outcome: 'win' },
    { if: ['p1_crouching', 'dist_close'],    do: 'throw_back',             weight: 0.10, outcome: 'win' },
    { if: ['p1_crouching', 'dist_close'],    do: 'standing_fierce',        weight: 0.10, outcome: 'win' },
    { if: ['p1_crouching', 'dist_close'],    do: 'standing_rh',            weight: 0.10, outcome: 'win' },
    { if: ['p1_crouching', 'dist_close'],    do: 'tatsu_lk',               weight: 0.05, outcome: 'trade' },
    { if: ['p1_crouching', 'dist_close'],    do: 'tatsu_mk',               weight: 0.05, outcome: 'trade' },

    // ══ P1 JUMP NEUTRAL — bait ════════════════════════════════════════
    { if: ['p1_jump_neutral', 'dist_mid'],   do: 'walk_forward',           weight: 0.50, outcome: 'win' },
    { if: ['p1_jump_neutral', 'dist_mid'],   do: 'hadouken_jab',           weight: 0.25, outcome: 'trade' },
    { if: ['p1_jump_neutral', 'dist_mid'],   do: 'shoryu_jab',             weight: 0.25, outcome: 'trade' },

    // ══ P1 JUMP BACK — fleeing, chase ═════════════════════════════════
    { if: ['p1_jump_back'],                  do: 'walk_forward',           weight: 0.35, outcome: 'win' },
    { if: ['p1_jump_back'],                  do: 'hadouken_fierce',        weight: 0.25, outcome: 'win' },
    { if: ['p1_jump_back'],                  do: 'hadouken_jab',           weight: 0.20, outcome: 'win' },
    { if: ['p1_jump_back'],                  do: 'jump_forward_hk',        weight: 0.20, outcome: 'win' },

    // ══ CORNER them — full offensive panel ════════════════════════════
    { if: ['cornered_them', 'dist_close'],   do: 'throw_forward',          weight: 0.15, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'throw_back',             weight: 0.08, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'sweep',                  weight: 0.15, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'shoryu_fierce',          weight: 0.12, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'standing_fierce',        weight: 0.10, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'standing_rh',            weight: 0.10, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'tatsu_hk',               weight: 0.08, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'crouch_fierce',          weight: 0.08, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'crouch_mk',              weight: 0.07, outcome: 'win' },
    { if: ['cornered_them', 'dist_close'],   do: 'standing_jab',           weight: 0.07, outcome: 'neutral' },

    // ══ CORNERED ME — escape / reversal ═══════════════════════════════
    { if: ['cornered_me'],                   do: 'shoryu_fierce',          weight: 0.30, outcome: 'win' },
    { if: ['cornered_me'],                   do: 'shoryu_jab',             weight: 0.15, outcome: 'trade' },
    { if: ['cornered_me'],                   do: 'jump_back',              weight: 0.20, outcome: 'neutral' },
    { if: ['cornered_me'],                   do: 'jump_back_hk',           weight: 0.10, outcome: 'neutral' },
    { if: ['cornered_me'],                   do: 'block_crouch',           weight: 0.25, outcome: 'neutral' },
  ],
  fallback: { do: 'walk_forward' },
};
