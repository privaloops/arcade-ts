import type { GameState } from '../../types';
import type { ActionId } from '../policy/types';
import {
  InputSequencer,
  type VirtualButton,
  type VirtualInputChannel,
  type InputFrame,
} from '../input-sequencer';
import { resolveMotion } from '../policy/actions';
import { FRAME_STRIDE } from './box-predictor';
import {
  computeKenVsRyuMatrix,
  RYU_MOVE_STARTUPS,
} from './move-range-matrix';
import {
  buildCounterTable,
  pickCounter,
  type CounterTable,
} from './ken-vs-ryu-counters';

/**
 * Deterministic counter-punish AI for Ken vs Ryu.
 *
 * Flow each vblank:
 *   1. Lazy-init: compute the punish-range matrix and counter table from
 *      ROM, build a reverse-map animPtr → ryu move name.
 *   2. Identify the move Ryu just started (rising edge on p1.attacking).
 *   3. Pick the highest-scored Ken counter that fits the current distance.
 *   4. Push the counter's motion frames to the virtual P2 input channel.
 *
 * Bypasses the tier-based policy runner entirely. Ken stays idle between
 * counters — the goal is to prove the counter table converts into real
 * hits in-game, nothing more.
 */

const RYU_MAX_FRAMES = 30;

export class KenCounterAi {
  private readonly sequencer: InputSequencer;
  private matrix: ReturnType<typeof computeKenVsRyuMatrix> | null = null;
  private table: CounterTable | null = null;
  /** animPtr → ryu move name. Populated from a stride walk per move. */
  private ryuMoveByPtr: Map<number, string> = new Map();
  private prevP1Attacking = false;
  private prevP1AnimPtr = 0;
  private prevP1X: number | null = null;
  /** Exponentially smoothed signed dx of P1, in world px per frame.
   *  Positive = P1 moving right. Converted to "dx away from Ken" at
   *  pickCounter call time based on who's on which side. */
  private p1DxSmooth = 0;
  private lastCounterFrame = -Infinity;
  /** Min frames between two counter triggers — prevents spam while our
   *  own attack is still animating. */
  private readonly cooldownFrames = 20;

  constructor(private readonly channel: VirtualInputChannel) {
    this.sequencer = new InputSequencer(channel);
  }

  onVblank(state: GameState, rom: Uint8Array): void {
    const kenPtr = state.p2.hitboxPtr ?? 0;
    const ryuPtr = state.p1.hitboxPtr ?? 0;

    // Always advance the sequencer. tick() consumes the next queued
    // input when busy, and releases all buttons (neutral) when empty.
    // Without this call, the channel stays stuck on the last setHeld()
    // — so Ken keeps holding DOWN after a single-frame c.HP press.
    this.sequencer.tick();

    // Track Ryu's per-frame horizontal velocity. Reject teleport-sized
    // jumps (round reset, position snap) to avoid corrupting the EMA.
    if (this.prevP1X !== null) {
      const raw = state.p1.x - this.prevP1X;
      if (Math.abs(raw) < 10) {
        this.p1DxSmooth = this.p1DxSmooth * 0.6 + raw * 0.4;
      }
    }
    this.prevP1X = state.p1.x;

    if (this.sequencer.busy) return;

    // Lazy init once both hitboxPtrs are available + characters right.
    if (!this.table) {
      if (kenPtr === 0 || ryuPtr === 0) return;
      if (state.p1.charId !== 'ryu' || state.p2.charId !== 'ken') return;
      this.matrix = computeKenVsRyuMatrix(rom, kenPtr, ryuPtr);
      this.table = buildCounterTable(this.matrix);
      this.ryuMoveByPtr = buildRyuPtrMap(rom);
      console.log(
        `[ken-counter-ai] initialized — ${this.ryuMoveByPtr.size} animPtrs mapped`,
      );
    }

    // Cooldown — don't spam counters over the top of our own attack.
    if (state.frameIdx - this.lastCounterFrame < this.cooldownFrames) return;

    // Detect rising edge on p1.attacking: Ryu just launched a move.
    const attacking = state.p1.attacking;
    const prevAttacking = this.prevP1Attacking;
    this.prevP1Attacking = attacking;
    this.prevP1AnimPtr = state.p1.animPtr;
    if (!attacking || prevAttacking) return;

    const ryuMove = this.ryuMoveByPtr.get(state.p1.animPtr);
    if (!ryuMove) return;

    // Ground shoryukens are invincible + airborne — don't waste a counter.
    if (ryuMove.startsWith('shoryuken')) return;

    const dist = Math.abs(state.p1.x - state.p2.x);
    // Convert smoothed world dx into "away from Ken" dx. If Ken (P2)
    // is to the right of Ryu (P1), Ryu moving right = moving toward
    // Ken = negative dxAway.
    const kenOnRight = state.p2.x >= state.p1.x;
    const ryuDxAway = kenOnRight ? -this.p1DxSmooth : this.p1DxSmooth;
    const counter = pickCounter(this.table!, {
      ryuMove,
      dist,
      ryuDxAway,
      detectionLatency: 1,
    });
    if (!counter) {
      console.log(
        `[ken-counter-ai] f=${state.frameIdx} Ryu ${ryuMove}`
        + ` dist=${dist}px ryuDxAway=${ryuDxAway.toFixed(1)} — no viable counter`,
      );
      return;
    }

    const framesToHit = 1 + counter.startup;
    const predictedDist = dist + ryuDxAway * framesToHit;
    console.log(
      `[ken-counter-ai] f=${state.frameIdx} Ryu ${ryuMove} @ ${dist}px`
      + ` ryuDxAway=${ryuDxAway.toFixed(1)}px/f → ${counter.kenMove}`
      + ` (startup=${counter.startup}f, predicted=${predictedDist.toFixed(0)}px, range≤${counter.maxHitDist}px)`,
    );
    this.executeMotion(counter.kenMove, state);
    this.lastCounterFrame = state.frameIdx;
  }

  reset(): void {
    this.sequencer.clear();
    this.channel.releaseAll();
    this.prevP1Attacking = false;
    this.prevP1AnimPtr = 0;
    this.prevP1X = null;
    this.p1DxSmooth = 0;
    this.lastCounterFrame = -Infinity;
  }

  private executeMotion(action: ActionId, state: GameState): void {
    const result = resolveMotion(action);
    const facingLeft = state.p2.x >= state.p1.x;
    if (result.kind === 'motion') {
      this.sequencer.push(flipFrames(result.frames, facingLeft));
    } else if (result.kind === 'held') {
      this.sequencer.push([{
        held: flipButtons(result.held, facingLeft),
        frames: result.frames,
      }]);
    }
    this.sequencer.tick();
  }
}

/**
 * Build animPtr → moveName map for Ryu by stride-walking each startup
 * until we hit another startup or a blank frame.
 */
function buildRyuPtrMap(rom: Uint8Array): Map<number, string> {
  const startups = new Set<number>(Object.values(RYU_MOVE_STARTUPS));
  const map = new Map<number, string>();
  for (const [moveName, startup] of Object.entries(RYU_MOVE_STARTUPS)) {
    for (let i = 0; i < RYU_MAX_FRAMES; i++) {
      const ptr = startup + i * FRAME_STRIDE;
      if (i > 0 && startups.has(ptr)) break;
      const atkId = rom[ptr + 0x0C] ?? 0;
      const headId = rom[ptr + 0x08] ?? 0;
      const bodyId = rom[ptr + 0x09] ?? 0;
      const legsId = rom[ptr + 0x0A] ?? 0;
      if (atkId === 0 && headId === 0 && bodyId === 0 && legsId === 0) break;
      if (!map.has(ptr)) map.set(ptr, moveName);
    }
  }
  return map;
}

function flipButtons(buttons: readonly VirtualButton[], facingLeft: boolean): readonly VirtualButton[] {
  if (facingLeft) return buttons;
  return buttons.map(b => (b === 'left' ? 'right' : b === 'right' ? 'left' : b));
}

function flipFrames(frames: readonly InputFrame[], facingLeft: boolean): InputFrame[] {
  if (facingLeft) return frames.map(f => ({ ...f }));
  return frames.map(f => ({ ...f, held: flipButtons(f.held, false) }));
}
