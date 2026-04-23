import type { HitboxRect } from '../../types';
import type { ActionId } from '../policy/types';
import { getFrameData } from '../frame-data';
import {
  resolveBoxFromRom,
  SF2HF_BOX_SPECS,
  ATTACK_BOX_SPEC,
  FRAME_STRIDE,
} from './box-predictor';

/**
 * Pure interception simulator — given an opponent move already in
 * progress and a proposed Ken option, decides whether Ken's attack
 * will physically connect and how much damage Ken takes meanwhile.
 *
 * Scope P2: mono-hit options only (sequence length === 1). Combo
 * chains come in P3.
 *
 * Coordinate conventions
 * ──────────────────────
 *   Ken trajectories are stored as dx / dy offsets + relative boxes
 *   (cx / cy / halfW / halfH) anchored at move start. To project a
 *   sample onto a real Ken position we add (anchorX, anchorY) plus
 *   any facing flip.
 *
 *   The opponent (Ryu) is assumed stationary during his committed
 *   move — true for sweep, cHP, sHP, hadouken startup, etc. We read
 *   his hurtbox at future frames via linear stride walk
 *   (ryuAnimPtr + N * FRAME_STRIDE) — accurate to 1-2f for slow moves
 *   with quasi-linear animation timing, which is the P2 target.
 *
 * Timing model
 * ────────────
 *     t = 0                   — trigger frame (Ken decides now).
 *     t = LATENCY             — input reaches the game (input bus + vblank).
 *     t = LATENCY + startup   — Ken's attackbox is live.
 *     t ∈ [active_start,
 *          active_start+active)— connection window.
 */

/** Input bus + vblank buffer between "decide now" and "game sees press". */
const LATENCY = 2;

/** SF2HF's pre-jump squat: once Ken presses up, he plants at the
 *  ground for ~3 frames before actually leaving the floor. During
 *  this window his hurtboxes are still at idle height, NOT the
 *  airborne trajectory. Without this we'd think jump_back evades a
 *  sweep that actually catches Ken in his squat. */
const JUMP_PREJUMP_FRAMES = 3;

/** Maximum frames looked ahead before giving up. ~1 second in SF2HF. */
const SIM_HORIZON = 60;

/**
 * Ken's hurtbox trio while standing idle (world-relative offsets at
 * x=0, posY=0, facing left). Used during pre-jump frames when the
 * trajectory capture has already placed Ken airborne but the engine
 * hasn't left the ground yet. Values mirror Ryu's idle hurtboxes —
 * shotos share the same skeleton height.
 */
const KEN_IDLE_HURTBOXES: readonly BoxRel[] = [
  { cx: -4, cy: 79, halfW: 12, halfH: 8,  kind: 'hurt_head' },
  { cx:  6, cy: 52, halfW: 20, halfH: 21, kind: 'hurt_body' },
  { cx:  6, cy: 14, halfW: 20, halfH: 16, kind: 'hurt_legs' },
];

/** Estimated damage for each opponent move. Used to compute
 *  kenDamageTaken when an interception starts too late. Values are
 *  SF2HF canonical — tuneable here when new matchups are added. */
const OPPONENT_MOVE_DAMAGE: Record<string, number> = {
  sweep: 21,
  standing_fierce: 21,
  standing_rh: 24,
  crouch_fierce: 17,
  hadouken_jab: 13,
  hadouken_strong: 15,
  hadouken_fierce: 17,
  shoryu_jab: 12,
  shoryu_strong: 17,
  shoryu_fierce: 21,
};

export interface BoxRel {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  kind: HitboxRect['kind'];
}

export interface TrajectorySample {
  frame: number;
  dx: number;
  dy: number;
  attackbox: BoxRel | null;
  hurtboxes: BoxRel[];
  pushbox: BoxRel | null;
}

export type TrajectoryMap = Record<string, TrajectorySample[]>;

export interface PunishOption {
  id: string;
  sequence: ActionId[];
  damage: number;
  notes: string;
}

export interface OpponentSnapshot {
  x: number;
  y: number;
  facingLeft: boolean;
  /** animPtr at the move's startup frame. The simulator walks forward
   *  from here via FRAME_STRIDE for future frames. */
  animPtrAtMoveStart: number;
  /** Frames already elapsed since the opponent's move started. Zero
   *  on rising-edge detection, grows if we react a few frames late. */
  framesSinceMoveStart: number;
  /** Catalog key for damage lookup (e.g. "sweep", "hadouken_fierce"). */
  moveName: string;
  /** Opponent's hitbox-table directory pointer in ROM. */
  hitboxPtr: number;
}

export interface KenSnapshot {
  x: number;
  y: number;
  facingLeft: boolean;
  hp: number;
}

export interface SimulationResult {
  /** True when Ken's attackbox would overlap at least one opponent
   *  hurtbox during the option's active frames. */
  connects: boolean;
  /** Absolute frame (counting from trigger) at which the first
   *  connection lands. Null when connects is false. */
  connectFrame: number | null;
  /** Damage Ken receives before his attack lands (or would have
   *  landed). 0 when the opponent's attack whiffs entirely. */
  kenDamageTaken: number;
  /** Diagnostic message when the option was rejected. Empty string
   *  on success. */
  reason: string;
}

/**
 * Main entry point: evaluate whether `option` is a viable punish for
 * the opponent's currently-committed move.
 */
export function simulateOption(
  option: PunishOption,
  opponent: OpponentSnapshot,
  ken: KenSnapshot,
  trajectories: TrajectoryMap,
  rom: Uint8Array,
): SimulationResult {
  // P2 scope: single-hit options. Combos deferred to P3 — fail
  // explicitly with a marker reason so the engine doesn't silently
  // prefer a mono-hit when a combo would have been better.
  if (option.sequence.length > 1) {
    return fail(0, 'combo option — not simulated in P2');
  }

  const move = option.sequence[0]!;

  // Block / evasion options don't connect but don't take damage
  // either. The engine treats them as zero-damage-both-sides; they
  // sort to the bottom and only win when everything else fails.
  if (isBlock(move)) return { connects: false, connectFrame: null, kenDamageTaken: 0, reason: 'block — safe fallback' };
  if (isPureEvade(move)) return { connects: false, connectFrame: null, kenDamageTaken: 0, reason: 'pure evasion' };

  const traj = resolveTrajectory(move, trajectories);
  if (!traj || traj.length === 0) return fail(0, `no trajectory captured for ${move}`);

  const fd = getFrameData(move);
  if (!fd) return fail(0, `no frame data for ${move}`);

  // Jumps carry a pre-jump squat where Ken is grounded before the
  // trajectory starts. Everything downstream shifts by this offset
  // so frame 0 of the capture aligns with LATENCY+prejumpDelay.
  const prejumpDelay = isJumpMove(move) ? JUMP_PREJUMP_FRAMES : 0;
  const kenActiveStart = LATENCY + prejumpDelay + fd.startup;
  const kenActiveEnd = kenActiveStart + fd.active;

  // ── Ken → Opponent connection check ──
  // Walk every active frame; look up Ken's attackbox from the
  // trajectory (indexed by "frames since move animation started",
  // which is t - LATENCY - prejumpDelay), project onto Ken's world
  // position, and test overlap against every opponent hurtbox.
  let connectFrame: number | null = null;
  for (let t = kenActiveStart; t < Math.min(kenActiveEnd, SIM_HORIZON); t++) {
    const trajIdx = t - LATENCY - prejumpDelay;
    if (trajIdx < 0 || trajIdx >= traj.length) break;
    const sample = traj[trajIdx]!;
    if (!sample.attackbox) continue;
    const kenAtk = projectBox(sample.attackbox, ken.x + sample.dx, ken.y + sample.dy, ken.facingLeft);
    const opponentHurts = opponentHurtboxesAt(opponent, rom, t);
    if (opponentHurts.some((h) => boxesOverlap(kenAtk, h))) {
      connectFrame = t;
      break;
    }
  }

  // ── Opponent → Ken damage check ──
  // Walk every frame from trigger up to Ken's connection (or active
  // end if whiff). If the opponent's live attackbox ever overlaps any
  // Ken hurtbox, Ken eats the move. Full damage, no chip-block model.
  const opponentHitEnd = connectFrame !== null ? connectFrame : kenActiveEnd;
  let kenDamageTaken = 0;
  for (let t = 0; t < Math.min(opponentHitEnd, SIM_HORIZON); t++) {
    const opponentAtk = opponentAttackboxAt(opponent, rom, t);
    if (!opponentAtk) continue;
    const kenHurts = kenHurtboxesAt(traj, t, ken, move);
    if (kenHurts.some((h) => boxesOverlap(opponentAtk, h))) {
      kenDamageTaken = OPPONENT_MOVE_DAMAGE[opponent.moveName] ?? 15;
      break;
    }
  }

  if (connectFrame !== null) {
    return {
      connects: true,
      connectFrame,
      kenDamageTaken,
      reason: '',
    };
  }
  return fail(kenDamageTaken, 'whiff: Ken attackbox never overlaps opponent hurtbox in active window');
}

function fail(kenDamageTaken: number, reason: string): SimulationResult {
  return { connects: false, connectFrame: null, kenDamageTaken, reason };
}

/**
 * Resolve a move's trajectory, handling the jump_back_* → jump_forward_*
 * aliasing. SF2HF back-jumps share the exact same animation as forward
 * jumps — only the horizontal velocity is flipped. The recorder only
 * captures the forward variant; here we mirror dx on the fly so the
 * simulator can treat back-jumps as first-class options.
 */
function resolveTrajectory(move: string, trajectories: TrajectoryMap): TrajectorySample[] | undefined {
  if (trajectories[move]) return trajectories[move];
  const mirror = BACK_TO_FORWARD_JUMP[move];
  if (!mirror) return undefined;
  const base = trajectories[mirror];
  if (!base) return undefined;
  return base.map((s) => ({ ...s, dx: -s.dx }));
}

const BACK_TO_FORWARD_JUMP: Record<string, string> = {
  jump_back_lp: 'jump_forward_lp',
  jump_back_mp: 'jump_forward_mp',
  jump_back_hp: 'jump_forward_hp',
  jump_back_lk: 'jump_forward_lk',
  jump_back_mk: 'jump_forward_mk',
  jump_back_hk: 'jump_forward_hk',
};

function isBlock(move: ActionId): boolean {
  return move === 'block_crouch' || move === 'block_stand';
}

function isPureEvade(move: ActionId): boolean {
  return move === 'jump_back' || move === 'jump_neutral' || move === 'empty_jump';
}

/**
 * Project a relative box (anchored at 0,0 in capture space) onto the
 * world, mirroring X when the character now faces the other side
 * from what the capture assumed. The trajectories were captured with
 * Ken facing left; if Ken faces right now, flip cx.
 */
function projectBox(rel: BoxRel, x: number, y: number, facingLeft: boolean): HitboxRect {
  const signX = facingLeft ? 1 : -1; // captured with facingLeft=true
  return {
    cx: x + rel.cx * signX,
    cy: y + rel.cy,
    halfW: rel.halfW,
    halfH: rel.halfH,
    kind: rel.kind,
  };
}

/** AABB overlap test. Boxes are centre + half-extent in both axes. */
function boxesOverlap(a: HitboxRect, b: HitboxRect): boolean {
  const dx = Math.abs(a.cx - b.cx);
  const dy = Math.abs(a.cy - b.cy);
  return dx < a.halfW + b.halfW && dy < a.halfH + b.halfH;
}

/**
 * Opponent's hurtboxes at `simFrame` frames after trigger. Linear
 * stride walk — accurate for slow committed moves (sweep, fierce,
 * hadouken startup) where the animation advances by FRAME_STRIDE per
 * frame. Returns an empty array when ptr / spec have no box.
 */
function opponentHurtboxesAt(
  opponent: OpponentSnapshot,
  rom: Uint8Array,
  simFrame: number,
): HitboxRect[] {
  const animPtr = opponent.animPtrAtMoveStart
    + (opponent.framesSinceMoveStart + simFrame) * FRAME_STRIDE;
  const out: HitboxRect[] = [];
  for (const spec of SF2HF_BOX_SPECS) {
    if (!spec.kind.startsWith('hurt')) continue;
    const box = resolveBoxFromRom(
      rom, animPtr, opponent.hitboxPtr,
      opponent.x, opponent.y, opponent.facingLeft, spec,
    );
    if (box) out.push(box);
  }
  return out;
}

/** Opponent attackbox at a given simulated frame, or null. */
function opponentAttackboxAt(
  opponent: OpponentSnapshot,
  rom: Uint8Array,
  simFrame: number,
): HitboxRect | null {
  const animPtr = opponent.animPtrAtMoveStart
    + (opponent.framesSinceMoveStart + simFrame) * FRAME_STRIDE;
  return resolveBoxFromRom(
    rom, animPtr, opponent.hitboxPtr,
    opponent.x, opponent.y, opponent.facingLeft, ATTACK_BOX_SPEC,
  );
}

/**
 * Ken's world hurtboxes at `simFrame` frames after trigger. Two
 * regimes:
 *   - Before LATENCY+prejumpDelay: Ken is still on the ground in
 *     his trigger pose (input lag + pre-jump squat for jumps). We
 *     use the hardcoded idle hurtbox set anchored at his trigger
 *     (x, y) — this prevents under-counting damage on options like
 *     jump_back_hk whose captured trajectory starts airborne.
 *   - After: Ken is executing the move. Pull the corresponding
 *     trajectory sample and project it onto his live position.
 */
function kenHurtboxesAt(
  traj: TrajectorySample[],
  simFrame: number,
  ken: KenSnapshot,
  moveName: string,
): HitboxRect[] {
  const prejumpDelay = isJumpMove(moveName) ? JUMP_PREJUMP_FRAMES : 0;
  const trajStartsAt = LATENCY + prejumpDelay;
  if (simFrame < trajStartsAt) {
    return KEN_IDLE_HURTBOXES.map((h) =>
      projectBox(h, ken.x, ken.y, ken.facingLeft),
    );
  }
  const trajIdx = simFrame - trajStartsAt;
  const sample = traj[Math.min(trajIdx, traj.length - 1)]!;
  return sample.hurtboxes.map((h) =>
    projectBox(h, ken.x + sample.dx, ken.y + sample.dy, ken.facingLeft),
  );
}

function isJumpMove(move: string): boolean {
  return move.startsWith('jump_');
}
