import type { InputFrame } from './input-sequencer';

/**
 * Ryu motion library, in the "P2 faces LEFT" orientation (default 2P
 * setup: P1 on left side, P2 on right, P2 facing towards P1).
 *
 * Each motion is a sequence of 5-12 one-frame states following SF2's
 * input buffer. A 2-frame hold per direction transitions reliably
 * without being read as a walking step.
 *
 * "forward" for this orientation = LEFT (towards P1).
 * "back"    for this orientation = RIGHT (away from P1).
 */
export const RYU_MOTIONS_FACING_LEFT: Record<string, readonly InputFrame[]> = {
  // qcf + LP — quarter-circle FORWARD = down → down-left → left + punch.
  hadoukenJab: [
    { held: ['down'],                    frames: 2 },
    { held: ['down', 'left'],            frames: 2 },
    { held: ['left'],                    frames: 1 },
    { held: ['left', 'button1'],         frames: 3 },
    { held: [],                          frames: 2 },
  ],

  // F, D, DF + P (dragon punch) — forward, down, down-forward + punch.
  // Key timing: the "forward" flick must release before the "down" is
  // held, otherwise the motion reads as a walk-down.
  shoryukenJab: [
    { held: ['left'],                    frames: 2 },
    { held: [],                          frames: 1 },
    { held: ['down'],                    frames: 2 },
    { held: ['down', 'left'],            frames: 2 },
    { held: ['down', 'left', 'button1'], frames: 3 },
    { held: [],                          frames: 2 },
  ],

  // qcb + LK — quarter-circle BACK = down → down-right → right + kick.
  tatsumakiJab: [
    { held: ['down'],                    frames: 2 },
    { held: ['down', 'right'],           frames: 2 },
    { held: ['right'],                   frames: 1 },
    { held: ['right', 'button4'],        frames: 3 },
    { held: [],                          frames: 2 },
  ],

  // Walk forward 20 frames (~1/3 of a second at 60Hz).
  walkForward: [
    { held: ['left'],                    frames: 20 },
    { held: [],                          frames: 1 },
  ],

  // Block crouching back — stays still with back+down held. 30 frames.
  blockCrouch: [
    { held: ['down', 'right'],           frames: 30 },
    { held: [],                          frames: 1 },
  ],

  // Standing jab as a quick pressure tool.
  standingJab: [
    { held: ['button1'],                 frames: 3 },
    { held: [],                          frames: 2 },
  ],
};
