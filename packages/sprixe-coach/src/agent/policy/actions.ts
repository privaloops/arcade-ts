import type { InputFrame, VirtualButton } from '../input-sequencer';
import type { ActionId } from './types';

/**
 * Resolves a DSL action into either a queued motion (multi-frame input
 * sequence like qcf+P) or a simple held state. The PolicyRunner feeds
 * the result into the InputSequencer.
 *
 * Motions are written for the P2-faces-LEFT orientation (default 2P
 * setup: P2 on the right side, facing P1 on the left). "forward" = LEFT.
 */

export type ActionResult =
  | { kind: 'motion'; frames: readonly InputFrame[]; label: string }
  | { kind: 'held'; held: readonly VirtualButton[]; frames: number; label: string }
  | { kind: 'noop'; label: string };

// ── Motion library (complete, P2-facing-left) ──

const hadouken = (btn: VirtualButton): InputFrame[] => [
  { held: ['down'],         frames: 2 },
  { held: ['down', 'left'], frames: 2 },
  { held: ['left'],         frames: 1 },
  { held: ['left', btn],    frames: 3 },
  { held: [],               frames: 2 },
];

const shoryu = (btn: VirtualButton): InputFrame[] => [
  { held: ['left'],              frames: 2 },
  { held: [],                    frames: 1 },
  { held: ['down'],              frames: 2 },
  { held: ['down', 'left'],      frames: 2 },
  { held: ['down', 'left', btn], frames: 3 },
  { held: [],                    frames: 2 },
];

const tatsu = (btn: VirtualButton): InputFrame[] => [
  { held: ['down'],           frames: 2 },
  { held: ['down', 'right'],  frames: 2 },
  { held: ['right'],           frames: 1 },
  { held: ['right', btn],      frames: 3 },
  { held: [],                  frames: 2 },
];

const jumpWithAttack = (dir: readonly VirtualButton[], btn: VirtualButton): InputFrame[] => [
  { held: [...dir, 'up'],        frames: 3 },
  { held: [...dir, 'up', btn],   frames: 10 },
  { held: [],                    frames: 2 },
];

export function resolveAction(id: ActionId): ActionResult {
  switch (id) {
    // ── Specials ──
    case 'hadouken_jab':    return { kind: 'motion', frames: hadouken('button1'), label: 'Hadouken LP' };
    case 'hadouken_strong': return { kind: 'motion', frames: hadouken('button2'), label: 'Hadouken MP' };
    case 'hadouken_fierce': return { kind: 'motion', frames: hadouken('button3'), label: 'Hadouken HP' };
    case 'shoryu_jab':      return { kind: 'motion', frames: shoryu('button1'),   label: 'Shoryu LP' };
    case 'shoryu_strong':   return { kind: 'motion', frames: shoryu('button2'),   label: 'Shoryu MP' };
    case 'shoryu_fierce':   return { kind: 'motion', frames: shoryu('button3'),   label: 'Shoryu HP' };
    case 'tatsu_lk':        return { kind: 'motion', frames: tatsu('button4'),    label: 'Tatsu LK' };
    case 'tatsu_mk':        return { kind: 'motion', frames: tatsu('button5'),    label: 'Tatsu MK' };
    case 'tatsu_hk':        return { kind: 'motion', frames: tatsu('button6'),    label: 'Tatsu HK' };

    // Air Tatsus — neutral jump up, then execute qcb+K mid-air. The
    // attack timing within the jump varies with the button strength
    // (LK lowest altitude, HK highest).
    case 'air_tatsu_lk':
      return { kind: 'motion', frames: [
        { held: ['up'],                    frames: 2 },
        { held: [],                        frames: 6 },
        { held: ['down'],                  frames: 1 },
        { held: ['down', 'right'],         frames: 1 },
        { held: ['right', 'button4'],      frames: 3 },
        { held: [],                        frames: 2 },
      ], label: 'air Tatsu LK' };
    case 'air_tatsu_mk':
      return { kind: 'motion', frames: [
        { held: ['up'],                    frames: 2 },
        { held: [],                        frames: 10 },
        { held: ['down'],                  frames: 1 },
        { held: ['down', 'right'],         frames: 1 },
        { held: ['right', 'button5'],      frames: 3 },
        { held: [],                        frames: 2 },
      ], label: 'air Tatsu MK' };
    case 'air_tatsu_hk':
      return { kind: 'motion', frames: [
        { held: ['up'],                    frames: 2 },
        { held: [],                        frames: 14 },
        { held: ['down'],                  frames: 1 },
        { held: ['down', 'right'],         frames: 1 },
        { held: ['right', 'button6'],      frames: 3 },
        { held: [],                        frames: 2 },
      ], label: 'air Tatsu HK' };

    // ── Normals ──
    // Standing normals as motions (press → release) so the arcade input
    // buffer reads a clean single press, not a long hold that the game
    // ignores after the first frame.
    case 'standing_jab':
      return { kind: 'motion', frames: [
        { held: ['button1'], frames: 2 },
        { held: [],          frames: 3 },
      ], label: 's.LP' };
    case 'standing_strong':
      return { kind: 'motion', frames: [
        { held: ['button2'], frames: 3 },
        { held: [],          frames: 3 },
      ], label: 's.MP' };
    case 'standing_fierce':
      return { kind: 'motion', frames: [
        { held: ['button3'], frames: 4 },
        { held: [],          frames: 3 },
      ], label: 's.HP' };
    case 'standing_short':
      return { kind: 'motion', frames: [
        { held: ['button4'], frames: 2 },
        { held: [],          frames: 3 },
      ], label: 's.LK' };
    case 'standing_forward':
      return { kind: 'motion', frames: [
        { held: ['button5'], frames: 3 },
        { held: [],          frames: 3 },
      ], label: 's.MK' };
    case 'standing_rh':
      return { kind: 'motion', frames: [
        { held: ['button6'], frames: 4 },
        { held: [],          frames: 3 },
      ], label: 's.HK' };
    // Crouching normals written as short motions (press then release) so
    // the arcade input buffer reads one clean press, not a hold that
    // gets stuck on "charging".
    case 'crouch_jab':
      return { kind: 'motion', frames: [
        { held: ['down'],              frames: 1 },
        { held: ['down', 'button1'],   frames: 2 },
        { held: ['down'],              frames: 1 },
      ], label: 'c.LP' };
    case 'crouch_short':
      return { kind: 'motion', frames: [
        { held: ['down'],              frames: 1 },
        { held: ['down', 'button4'],   frames: 2 },
        { held: ['down'],              frames: 1 },
      ], label: 'c.LK' };
    case 'crouch_strong':
      return { kind: 'motion', frames: [
        { held: ['down'],              frames: 1 },
        { held: ['down', 'button2'],   frames: 3 },
        { held: ['down'],              frames: 1 },
      ], label: 'c.MP' };
    case 'crouch_fierce':
      return { kind: 'motion', frames: [
        { held: ['down'],              frames: 1 },
        { held: ['down', 'button3'],   frames: 4 },
        { held: ['down'],              frames: 1 },
      ], label: 'c.HP' };
    case 'crouch_mk':
      return { kind: 'motion', frames: [
        { held: ['down'],              frames: 1 },
        { held: ['down', 'button5'],   frames: 3 },
        { held: ['down'],              frames: 1 },
      ], label: 'c.MK' };
    case 'sweep':
      return { kind: 'motion', frames: [
        { held: ['down'],              frames: 1 },
        { held: ['down', 'button6'],   frames: 3 },
        { held: ['down'],              frames: 2 },
        { held: [],                    frames: 1 },
      ], label: 'sweep' };

    // ── Jumps — 6 forward + 6 neutral + 6 back variants + bare ──
    case 'jump_forward_lp': return { kind: 'motion', frames: jumpWithAttack(['left'], 'button1'),  label: 'j.LP fwd' };
    case 'jump_forward_mp': return { kind: 'motion', frames: jumpWithAttack(['left'], 'button2'),  label: 'j.MP fwd' };
    case 'jump_forward_hp': return { kind: 'motion', frames: jumpWithAttack(['left'], 'button3'),  label: 'j.HP fwd' };
    case 'jump_forward_lk': return { kind: 'motion', frames: jumpWithAttack(['left'], 'button4'),  label: 'j.LK fwd' };
    case 'jump_forward_mk': return { kind: 'motion', frames: jumpWithAttack(['left'], 'button5'),  label: 'j.MK fwd' };
    case 'jump_forward_hk': return { kind: 'motion', frames: jumpWithAttack(['left'], 'button6'),  label: 'j.HK fwd' };

    case 'jump_neutral_lp': return { kind: 'motion', frames: jumpWithAttack([], 'button1'),        label: 'j.LP neutral' };
    case 'jump_neutral_mp': return { kind: 'motion', frames: jumpWithAttack([], 'button2'),        label: 'j.MP neutral' };
    case 'jump_neutral_hp': return { kind: 'motion', frames: jumpWithAttack([], 'button3'),        label: 'j.HP neutral' };
    case 'jump_neutral_lk': return { kind: 'motion', frames: jumpWithAttack([], 'button4'),        label: 'j.LK neutral' };
    case 'jump_neutral_mk': return { kind: 'motion', frames: jumpWithAttack([], 'button5'),        label: 'j.MK neutral' };
    case 'jump_neutral_hk': return { kind: 'motion', frames: jumpWithAttack([], 'button6'),        label: 'j.HK neutral' };

    case 'jump_back_lp':    return { kind: 'motion', frames: jumpWithAttack(['right'], 'button1'), label: 'j.LP back' };
    case 'jump_back_mp':    return { kind: 'motion', frames: jumpWithAttack(['right'], 'button2'), label: 'j.MP back' };
    case 'jump_back_hp':    return { kind: 'motion', frames: jumpWithAttack(['right'], 'button3'), label: 'j.HP back' };
    case 'jump_back_lk':    return { kind: 'motion', frames: jumpWithAttack(['right'], 'button4'), label: 'j.LK back' };
    case 'jump_back_mk':    return { kind: 'motion', frames: jumpWithAttack(['right'], 'button5'), label: 'j.MK back' };
    case 'jump_back_hk':    return { kind: 'motion', frames: jumpWithAttack(['right'], 'button6'), label: 'j.HK back' };

    // Bare jumps (no attack) — mobility / baits
    case 'jump_neutral':
      return { kind: 'motion', frames: [{ held: ['up'], frames: 3 }, { held: [], frames: 1 }], label: 'jump neutral' };
    case 'jump_back':
      return { kind: 'motion', frames: [{ held: ['up', 'right'], frames: 3 }, { held: [], frames: 1 }], label: 'jump back' };
    case 'empty_jump':
      return { kind: 'motion', frames: [{ held: ['up', 'left'], frames: 3 }, { held: [], frames: 1 }], label: 'empty jump' };

    // ── Movement ──
    case 'walk_forward': return { kind: 'held', held: ['left'],  frames: 20, label: 'walk fwd' };
    case 'walk_back':    return { kind: 'held', held: ['right'], frames: 20, label: 'walk back' };
    case 'neutral':      return { kind: 'held', held: [],        frames: 10, label: 'neutral' };

    // ── Block ──
    case 'block_crouch': return { kind: 'held', held: ['down', 'right'], frames: 30, label: 'block crouch' };
    case 'block_stand':  return { kind: 'held', held: ['right'],         frames: 30, label: 'block stand' };

    // ── Throws (P2 facing left: forward=left, back=right) ──
    case 'throw_forward':
      return { kind: 'held', held: ['left', 'button3'], frames: 4, label: 'throw fwd' };
    case 'throw_back':
      return { kind: 'held', held: ['right', 'button3'], frames: 4, label: 'throw back' };

    // ── Losing (deliberate mistakes) ──
    case 'walk_into_fireball':
      return { kind: 'held', held: ['left'], frames: 25, label: 'walk forward (trap)' };
    case 'whiff_shoryu_midscreen':
      return { kind: 'motion', frames: shoryu('button3'), label: 'whiff Shoryu' };
    case 'whiff_throw':
      return { kind: 'held', held: ['left', 'button3'], frames: 4, label: 'whiff throw' };
  }
}
