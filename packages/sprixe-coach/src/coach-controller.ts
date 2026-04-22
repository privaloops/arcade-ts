import { EventDetector } from './detector/event-detector';
import type { CoachEvent } from './detector/events';
import { moveName } from './detector/move-names';
import { StateExtractor } from './extractor/state-extractor';
import { StateHistory } from './extractor/state-history';
import { P1_BASE, P2_BASE } from './extractor/sf2hf-memory-map';
import { AiFighter } from './agent/ai-fighter';
import type { VirtualInputChannel } from './agent/input-sequencer';
import { KenMoveValidator } from './agent/tas/ken-validator';
import { KenAnimInspector } from './agent/tas/ken-anim-inspector';
import { KenTimelineRecorder } from './agent/tas/ken-timeline-recorder';
import { CMKPunishTest } from './agent/tas/cmk-punish-test';
import { KenCounterAi } from './agent/tas/ken-counter-ai';
import {
  computeKenVsRyuMatrix,
  dumpMatrix,
  dumpPairDetail,
} from './agent/tas/move-range-matrix';
import {
  buildCounterTable,
  dumpCounterTable,
} from './agent/tas/ken-vs-ryu-counters';
import {
  classifyAttackHeight,
  minGapToHurtboxes,
} from './agent/policy/threat-geometry';
import type { GameState } from './types';

const WORK_RAM_BASE = 0xFF0000;

/**
 * Minimal host surface needed by the coach. PlayingScreen passes in the
 * runner's getWorkRam / setVblankCallback, keeping this package unaware
 * of @sprixe/engine.
 */
export interface CoachHost {
  getWorkRam?(): Uint8Array;
  /** 68K program ROM. The extractor reads animation metadata (yoke,
   *  posture, etc.) by dereferencing animPtr into this buffer. */
  getProgramRom?(): Uint8Array;
  getIoPorts?(): Uint8Array;
  /** CPS-B registers — CPS-1 routes kick buttons here (cpsbRegs[0x37]
   *  for P1 LK/MK/HK), not the main IO port buffer. */
  getCpsbRegisters?(): Uint8Array;
  /** Persistent virtual input channel for P2. Required for AI-opponent
   *  mode; without it the AI fighter is never built. */
  getVirtualP2Channel?(): VirtualInputChannel;
  /** Attach/detach the virtual P2 channel to the input layer. Called
   *  every frame by the coach to auto-arm during fights and auto-disarm
   *  during menus (so the user's keyboard still drives P2 between
   *  matches). */
  armVirtualP2?(armed: boolean): void;
  setVblankCallback?(cb: (() => void) | null): void;
}

export interface CoachOptions {
  gameId: string;
  /** Log GameState to the console every N frames. Default 60 (≈ 1Hz). */
  logEveryNFrames?: number;
  /** Override for tests. */
  now?: () => number;
  /**
   * Calibration mode: skip EVERYTHING except the `[coach:calibrate]`
   * lines emitted on unknown attack ids. No periodic state log, no
   * event log. Used to fill move-names.ts.
   */
  calibrateOnly?: boolean;
  /** Enable the AI opponent — drives P2 via virtual inputs with a
   *  deterministic reflex policy. Default false. */
  enableAiOpponent?: boolean;
  /** Pick the AI execution engine when the opponent is on.
   *   'mode'   — legacy hand-written modes
   *   'policy' — DSL rules engine */
  aiEngine?: 'mode' | 'policy';
  aiLevel?: 'easy' | 'normal' | 'hard' | 'tas';
  aiDebugLoopAction?: string;
  /** Phase 1 harness: enable Ken move-map calibration (overrides TAS). */
  calibrateKen?: boolean;
  /** Phase 1 gate: compare predicted vs live Ken attackboxes each frame,
   *  log mismatches >2px. Zero overhead when off. */
  validateKen?: boolean;
  /** Phase 1 investigation: log raw animPtr + 24-byte struct every
   *  vblank while Ken is in an attack state. Used to reverse-engineer
   *  the frame-advance mechanism. */
  inspectKen?: boolean;
  /** Phase 1 pivot: capture the empirical (animPtr, holdFrames)[]
   *  timeline per Ken move. Prints TS snippet on move completion. */
  recordKen?: boolean;
  /** Phase 2: log live threat geometry (attackbox gap + height + whiff) each
   *  frame P1 has an active attackbox. Dry-run for the threat detector. */
  debugThreat?: boolean;
  /** Feasibility probe: on every Ryu sweep, fire a Ken sweep the same
   *  frame and log press-to-hit latency. Bypasses the AI fighter. */
  testCmkPunish?: boolean;
  /** One-shot: compute and log the Ken×Ryu punish-range matrix at the
   *  first vblank where both hitboxPtrs are available. */
  dumpRanges?: boolean;
  /** Run the deterministic Ken counter-punish AI derived from the
   *  Ken×Ryu matrix. Bypasses the tier-based policy runner. */
  aiCounter?: boolean;
}

const SUPPORTED_GAMES = new Set(['sf2hf', 'sf2hfj', 'sf2hfu']);

/** Default sprixe keyboard mapping, see CLAUDE.md. */
const BUTTON_CLASS: Record<string, { kind: 'punch' | 'kick'; strength: 'light' | 'medium' | 'heavy' }> = {
  a: { kind: 'punch', strength: 'light' },
  s: { kind: 'punch', strength: 'medium' },
  d: { kind: 'punch', strength: 'heavy' },
  z: { kind: 'kick',  strength: 'light' },
  x: { kind: 'kick',  strength: 'medium' },
  c: { kind: 'kick',  strength: 'heavy' },
};

/**
 * Classify an attack from the directional keys pressed in the ~300ms
 * before the attack button. Motions are universal across SF2 fighters.
 */
function classifyMoveFromHistory(
  history: Array<{ key: string; atMs: number }>,
  button: { kind: 'punch' | 'kick'; strength: 'light' | 'medium' | 'heavy' },
): string {
  const now = performance.now();
  const WINDOW = 350;
  const directions = history
    .filter(h => now - h.atMs <= WINDOW)
    .map(h => DIR_MAP[h.key])
    .filter((d): d is Direction => !!d);

  const motion = detectMotion(directions);
  const side = `${button.strength} ${button.kind}`;

  switch (motion) {
    case 'qcf': return button.kind === 'punch' ? `projectile (qcf+P, ${side})` : `qcf+K special (${side})`;
    case 'qcb': return button.kind === 'kick'  ? `hurricane/rolling (qcb+K, ${side})` : `qcb+P special (${side})`;
    case 'dragon': return `dragon punch motion (F,D,DF+P, ${side})`;
    case 'reverse-dragon': return `reverse dragon (B,D,DB+P, ${side})`;
    case 'charge-fb': return `charge forward special (${side})`;
    case 'charge-up': return `charge up special (${side})`;
    default: return `${side} (no motion)`;
  }
}

type Direction = 'U' | 'D' | 'F' | 'B' | 'DF' | 'DB' | 'UF' | 'UB';

const DIR_MAP: Record<string, Direction> = {
  arrowup: 'U',
  arrowdown: 'D',
  arrowleft: 'B',
  arrowright: 'F',
};

type Motion = 'qcf' | 'qcb' | 'dragon' | 'reverse-dragon' | 'charge-fb' | 'charge-up' | null;

/**
 * Detect classic motion inputs from a sequence of directions. Only
 * looks at the tail of the array (the most recent keys).
 */
function detectMotion(directions: Direction[]): Motion {
  const tail = directions.slice(-6).join(',');
  if (/\bD\b.*\bF\b/.test(tail)) return 'qcf';
  if (/\bD\b.*\bB\b/.test(tail)) return 'qcb';
  if (/\bF\b.*\bD\b.*\bF\b/.test(tail)) return 'dragon';
  if (/\bB\b.*\bD\b.*\bB\b/.test(tail)) return 'reverse-dragon';
  return null;
}

function formatEvent(ev: CoachEvent): string {
  const head = `f=${ev.frameIdx} ${ev.type} (imp=${ev.importance.toFixed(2)})`;
  switch (ev.type) {
    case 'hp_hit':
      return `${head} ${ev.attacker}→ dmg=${ev.damage} victim_hp=${ev.victimHpAfter} (${Math.round(ev.victimHpPercent * 100)}%)`;
    case 'combo_connect':
      return `${head} ${ev.attacker} ${ev.hits}-hit combo`;
    case 'knockdown':
      return `${head} ${ev.victim} down`;
    case 'near_death':
      return `${head} ${ev.victim} at ${Math.round(ev.hpPercent * 100)}%`;
    case 'low_hp_warning':
      return `${head} ${ev.victim} low (${Math.round(ev.hpPercent * 100)}%)`;
    case 'round_start':
      return `${head} round=${ev.roundNumber}`;
    case 'round_end':
      return `${head} winner=${ev.winner}`;
    case 'special_startup':
      return `${head} ${ev.player} ${ev.character} animPtr=0x${ev.animPtr.toString(16).toUpperCase().padStart(8, '0')} state=0x${ev.stateByte.toString(16).padStart(2, '0')}`;
    case 'corner_trap':
      return `${head} ${ev.victim} ${ev.side}`;
    case 'macro_state_change':
      return `${head} P2 ${ev.from} → ${ev.to} [${ev.triggers.join(', ')}]`;
    case 'pattern_prediction':
      return `${head} predict=${ev.predictedAction} in ${ev.preNoticeMs}ms (conf=${ev.confidence.toFixed(2)}) — ${ev.reason}`;
    case 'stunned':
      return `${head} ${ev.victim} DIZZY`;
    case 'hit_streak':
      return `${head} ${ev.attacker} streak ×${ev.count}`;
    case 'timer_warning':
      return `${head} ${ev.secondsLeft}s left`;
    case 'timer_critical':
      return `${head} ${ev.secondsLeft}s LEFT`;
  }
}

export class CoachController {
  private readonly extractor = new StateExtractor();
  private readonly history = new StateHistory(5);
  private readonly detector = new EventDetector();
  private readonly host: CoachHost;
  private readonly gameId: string;
  private readonly logEvery: number;
  private readonly now: () => number;
  private readonly calibrateOnly: boolean;
  private readonly aiFighter: AiFighter | null;
  private readonly kenValidator: KenMoveValidator | null;
  private readonly kenInspector: KenAnimInspector | null;
  private readonly kenRecorder: KenTimelineRecorder | null;
  private readonly debugThreat: boolean;
  private readonly cmkPunishTest: CMKPunishTest | null;
  private readonly counterAi: KenCounterAi | null;
  private readonly dumpRanges: boolean;
  private rangesDumped = false;
  private prevThreatKey = '';
  private tickCount = 0;
  private stopped = false;
  // Calibration state — previous frame's P1 input bytes and P1 struct
  // snapshot. ioPorts[1] holds P1 dirs + LP/MP/HP (active LOW); kicks
  // live separately in cpsbRegs[0x37] because CPS-1 routes buttons 4-6
  // through the CPS-B chip, not the main IO port bus.
  private previousP1Io = 0xFF;
  private previousP1Kicks = 0xFF;
  private p1StructSnapshot: Uint8Array | null = null;
  // Post-press tracing: capture animPtr transitions over ~15 frames so
  // we see the move's startup/active/recovery animation pointer chain.
  private calibTraceFramesLeft = 0;
  private calibTraceStartFrame = 0;
  private calibTracePrevPtr = 0;
  private keyHistory: Array<{ key: string; atMs: number }> = [];
  private keyListener: ((e: KeyboardEvent) => void) | null = null;
  private recentEvents: CoachEvent[] = [];
  private readonly RECENT_EVENT_CAP = 32;
  private latestState: GameState | null = null;

  /** Last extracted GameState (updated each vblank). Useful for overlays
   *  and debug tools. Returns null before the first vblank or after stop(). */
  getLatestState(): GameState | null {
    return this.latestState;
  }

  constructor(host: CoachHost, opts: CoachOptions) {
    this.host = host;
    this.gameId = opts.gameId;
    this.logEvery = opts.logEveryNFrames ?? 60;
    this.now = opts.now ?? (() => performance.now());
    this.calibrateOnly = opts.calibrateOnly === true;

    // AI opponent — off by default. Requires a virtual P2 channel from
    // the host; in its absence (e.g. tests) the fighter is never built.
    const vp2 = opts.enableAiOpponent ? host.getVirtualP2Channel?.() : undefined;
    this.aiFighter = vp2 ? new AiFighter(vp2, {
      enginePolicy: opts.aiEngine === 'policy',
      ...(opts.aiLevel ? { level: opts.aiLevel } : {}),
      ...(opts.aiDebugLoopAction ? { debugLoopAction: opts.aiDebugLoopAction } : {}),
      ...(opts.calibrateKen ? { calibrateKen: true } : {}),
    }) : null;
    if (this.aiFighter) {
      console.log('[sprixe-coach] AI opponent ARMED — driving P2');
      if (typeof window !== 'undefined') {
        (window as unknown as { __aiFighter?: AiFighter }).__aiFighter = this.aiFighter;
      }
    }
    this.kenValidator = opts.validateKen ? new KenMoveValidator() : null;
    if (this.kenValidator) {
      console.log('[sprixe-coach] Ken move validator ARMED — predicted vs live attackbox');
    }
    this.kenInspector = opts.inspectKen ? new KenAnimInspector() : null;
    if (this.kenInspector) {
      console.log('[sprixe-coach] Ken animPtr inspector ARMED — raw struct dump');
    }
    this.kenRecorder = opts.recordKen ? new KenTimelineRecorder() : null;
    if (this.kenRecorder) {
      console.log('[sprixe-coach] Ken timeline recorder ARMED — captures (animPtr, holdFrames)[]');
    }
    this.debugThreat = opts.debugThreat === true;
    if (this.debugThreat) {
      console.log('[sprixe-coach] threat detector dry-run ARMED — per-frame gap/height log');
    }
    // Feasibility probe — owns P2 channel, no AI fighter plumbing.
    // Built only when a virtual P2 channel is available.
    const vp2Test = opts.testCmkPunish ? host.getVirtualP2Channel?.() : undefined;
    this.cmkPunishTest = vp2Test ? new CMKPunishTest(vp2Test) : null;
    if (this.cmkPunishTest) {
      console.log('[sprixe-coach] cMK punish feasibility test ARMED — AI fighter bypassed');
    }
    this.dumpRanges = opts.dumpRanges === true;
    if (this.dumpRanges) {
      console.log('[sprixe-coach] punish-range matrix dump ARMED — waits for both hitboxPtrs');
    }
    const vp2Counter = opts.aiCounter ? host.getVirtualP2Channel?.() : undefined;
    this.counterAi = vp2Counter ? new KenCounterAi(vp2Counter) : null;
    if (this.counterAi) {
      console.log('[sprixe-coach] deterministic counter-punish AI ARMED — tier policy bypassed');
    }
  }

  start(): boolean {
    if (!SUPPORTED_GAMES.has(this.gameId)) return false;
    if (!this.host.getWorkRam || !this.host.setVblankCallback) return false;

    this.host.setVblankCallback(() => this.onVblank());
    if (this.calibrateOnly) {
      console.log(`[sprixe-coach] CALIBRATE mode — press a move, read the line.`);
      if (typeof window !== 'undefined') {
        this.keyListener = (e: KeyboardEvent) => {
          const key = e.key.toLowerCase();
          const atMs = performance.now();
          this.keyHistory.push({ key, atMs });
          // Keep only the last ~500ms — enough for any motion input.
          while (this.keyHistory.length > 0 && atMs - this.keyHistory[0]!.atMs > 500) {
            this.keyHistory.shift();
          }
          // If it's an attack button, classify the move now from the
          // preceding motion and log one clear line.
          const btn = BUTTON_CLASS[key];
          if (btn) {
            const moveName = classifyMoveFromHistory(this.keyHistory, btn);
            console.log(`[coach:calibrate] ${moveName}`);
          }
        };
        window.addEventListener('keydown', this.keyListener);
      }
    } else {
      console.log(`[sprixe-coach] armed for ${this.gameId}`);
    }
    return true;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.host.setVblankCallback?.(null);
    this.detector.reset();
    this.aiFighter?.reset();
    if (this.kenValidator) {
      console.log(this.kenValidator.summary());
      this.kenValidator.reset();
    }
    if (this.keyListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
  }

  latest(): GameState | null {
    return this.history.latest();
  }

  events(): readonly CoachEvent[] {
    return this.recentEvents;
  }

  /**
   * Dump a window of Work RAM around an address. Useful in console:
   *   __coach.dump(0xFF83BE, 64)
   */
  dump(addr: number, length = 32): void {
    const ram = this.host.getWorkRam?.();
    if (!ram) return;
    const start = addr - WORK_RAM_BASE;
    const rows: string[] = [];
    for (let i = 0; i < length; i += 16) {
      const a = addr + i;
      const chunk: string[] = [];
      for (let j = 0; j < 16 && i + j < length; j++) {
        const v = ram[start + i + j] ?? 0;
        chunk.push(v.toString(16).padStart(2, '0'));
      }
      rows.push(`${a.toString(16).toUpperCase().padStart(6, '0')}: ${chunk.join(' ')}`);
    }
    console.log(rows.join('\n'));
  }

  /**
   * Snapshot a RAM window, then call `diffFrom(addr, length)` later
   * after doing an action in-game to see which bytes changed.
   */
  mark(addr: number, length = 64): void {
    const ram = this.host.getWorkRam?.();
    if (!ram) return;
    const start = addr - WORK_RAM_BASE;
    this.markedAddr = addr;
    this.markedSnapshot = ram.slice(start, start + length);
    console.log(`[sprixe-coach] marked ${length} bytes at 0x${addr.toString(16).toUpperCase()}`);
  }

  diffFrom(addr = this.markedAddr, length = this.markedSnapshot?.length ?? 64): void {
    const ram = this.host.getWorkRam?.();
    if (!ram || this.markedSnapshot === null || addr === null) {
      console.warn('[sprixe-coach] no marked snapshot — call mark() first');
      return;
    }
    const start = addr - WORK_RAM_BASE;
    const changes: string[] = [];
    for (let i = 0; i < length; i++) {
      const before = this.markedSnapshot[i] ?? 0;
      const after = ram[start + i] ?? 0;
      if (before !== after) {
        const a = (addr + i).toString(16).toUpperCase().padStart(6, '0');
        changes.push(`${a}: ${before.toString(16).padStart(2, '0')} → ${after.toString(16).padStart(2, '0')}  (Δ ${after - before})`);
      }
    }
    if (changes.length === 0) {
      console.log('[sprixe-coach] no changes');
    } else {
      console.log(`[sprixe-coach] ${changes.length} bytes changed:\n${changes.join('\n')}`);
    }
  }

  /** Quick helpers for the two player structs. */
  p1(): void { this.dump(P1_BASE, 64); }
  p2(): void { this.dump(P2_BASE, 64); }

  private markedAddr: number | null = null;
  private markedSnapshot: Uint8Array | null = null;

  /**
   * Emit one log line per transition when a P1 attackbox becomes active
   * or its threat classification changes. Deduped against the previous
   * frame so the console stays readable even at 60fps.
   */
  private logThreat(state: GameState): void {
    const atk = state.p1.attackbox;
    if (!atk) {
      if (this.prevThreatKey !== '') {
        this.prevThreatKey = '';
      }
      return;
    }
    const gap = minGapToHurtboxes(atk, state.p2);
    const height = classifyAttackHeight(atk, state.p2);
    const whiff = gap !== null && gap > 20 && state.p1.isRecovery;
    const key = `${height}|${gap ?? '?'}|${whiff ? 'w' : '-'}`;
    if (key === this.prevThreatKey) return;
    this.prevThreatKey = key;
    const gapStr = gap === null ? '?' : gap.toFixed(0);
    console.log(
      `[coach:threat] f=${state.frameIdx} gap=${gapStr}px height=${height} ${whiff ? 'WHIFF' : ''}`,
    );
  }

  /** Print the last N recorded events, most recent first. */
  eventsTail(n = 10): void {
    const tail = this.recentEvents.slice(-n).reverse();
    console.log(tail.map(formatEvent).join('\n'));
  }

  /**
   * Calibration tick: decode P1's arcade input bytes + snapshot the P1
   * struct so we can see which RAM byte reacts to each press.
   */
  private logCalibration(state: GameState, ram: Uint8Array): void {
    const io = this.host.getIoPorts?.();
    const cpsb = this.host.getCpsbRegisters?.();
    const p1Byte = io?.[1] ?? 0xFF;
    const kickByte = cpsb?.[0x37] ?? 0xFF;

    const pressed: string[] = [];
    if ((this.previousP1Io & 0x10) !== 0 && (p1Byte & 0x10) === 0) pressed.push('LP');
    if ((this.previousP1Io & 0x20) !== 0 && (p1Byte & 0x20) === 0) pressed.push('MP');
    if ((this.previousP1Io & 0x40) !== 0 && (p1Byte & 0x40) === 0) pressed.push('HP');
    if ((this.previousP1Kicks & 0x01) !== 0 && (kickByte & 0x01) === 0) pressed.push('LK');
    if ((this.previousP1Kicks & 0x02) !== 0 && (kickByte & 0x02) === 0) pressed.push('MK');
    if ((this.previousP1Kicks & 0x04) !== 0 && (kickByte & 0x04) === 0) pressed.push('HK');
    this.previousP1Io = p1Byte;
    this.previousP1Kicks = kickByte;

    const up    = (p1Byte & 0x08) === 0;
    const down  = (p1Byte & 0x04) === 0;
    const left  = (p1Byte & 0x02) === 0;
    const right = (p1Byte & 0x01) === 0;
    const vert  = up ? 'UP' : down ? 'DOWN' : '';
    const horiz = left ? 'LEFT' : right ? 'RIGHT' : '';
    const dir   = [vert, horiz].filter(Boolean).join('-') || 'NEUTRAL';

    const ptr = state.p1.animPtr;
    const ptrHex = `0x${ptr.toString(16).padStart(8, '0').toUpperCase()}`;
    const stBy = state.p1.stateByte;
    const atk = state.p1.attacking ? 'ATK' : '---';
    const stHex = `0x${stBy.toString(16).padStart(2, '0')}`;

    if (pressed.length > 0) {
      console.log(`[coach:calibrate] ${pressed.join('+')} | dir=${dir}  (trace 15f)`);
      console.log(`[coach:calibrate:f+0] animPtr=${ptrHex} state=${stHex} ${atk}`);
      this.logP1StructDiffNow(ram);
      this.calibTraceFramesLeft = 15;
      this.calibTraceStartFrame = state.frameIdx;
      this.calibTracePrevPtr = ptr;
    } else if (this.calibTraceFramesLeft > 0) {
      this.calibTraceFramesLeft--;
      if (ptr !== this.calibTracePrevPtr) {
        const elapsed = state.frameIdx - this.calibTraceStartFrame;
        console.log(`[coach:calibrate:f+${elapsed}] animPtr=${ptrHex} state=${stHex} ${atk}`);
        this.calibTracePrevPtr = ptr;
      }
    }

    this.snapshotP1Struct(ram);
  }

  private snapshotP1Struct(ram: Uint8Array): void {
    const start = P1_BASE - WORK_RAM_BASE;
    const length = 0x80;
    this.p1StructSnapshot = ram.slice(start, start + length);
  }

  private logP1StructDiffNow(ram: Uint8Array): void {
    if (!this.p1StructSnapshot) return;
    const start = P1_BASE - WORK_RAM_BASE;
    const length = this.p1StructSnapshot.length;
    const changes: string[] = [];
    for (let i = 0; i < length; i++) {
      const before = this.p1StructSnapshot[i] ?? 0;
      const after  = ram[start + i] ?? 0;
      if (before === after) continue;
      // Skip ±1 ticks on animation frame counters.
      const delta = Math.abs(after - before);
      if (delta === 1 && before !== 0 && after !== 0) continue;
      const addr = (P1_BASE + i).toString(16).toUpperCase();
      changes.push(`${addr}:${before.toString(16).padStart(2, '0')}→${after.toString(16).padStart(2, '0')}`);
    }
    if (changes.length > 0) {
      console.log(`[coach:calibrate:ram] ${changes.join(' ')}`);
    }
  }

  private onVblank(): void {
    if (this.stopped) return;
    const ram = this.host.getWorkRam?.();
    if (!ram) return;

    const rom = this.host.getProgramRom?.();
    const state = this.extractor.extract(ram, this.now(), rom);
    this.history.push(state);
    this.latestState = state;

    if (this.kenValidator && rom) {
      this.kenValidator.onFrame(state, rom);
    }
    if (this.kenInspector && rom) {
      this.kenInspector.onFrame(state, rom);
    }
    this.kenRecorder?.onFrame(state);

    if (this.debugThreat) {
      this.logThreat(state);
    }

    // One-shot: compute and log the Ken×Ryu punish-range matrix the
    // first time we see both hitboxPtrs populated in Work RAM.
    if (this.dumpRanges && !this.rangesDumped && rom) {
      // p1 = Ryu (player), p2 = Ken (CPU) by convention for this setup.
      const kenPtr = state.p2.hitboxPtr ?? 0;
      const ryuPtr = state.p1.hitboxPtr ?? 0;
      if (kenPtr !== 0 && ryuPtr !== 0
          && state.p1.charId === 'ryu' && state.p2.charId === 'ken') {
        const matrix = computeKenVsRyuMatrix(rom, kenPtr, ryuPtr);
        console.log(
          `[sprixe-coach] punish-range matrix (kenHitboxPtr=0x${kenPtr.toString(16)}, ryuHitboxPtr=0x${ryuPtr.toString(16)}):`,
        );
        // Split per-Ken-move to avoid console truncation on long dumps.
        for (const kenMove of Object.keys(matrix)) {
          const sub = { [kenMove]: matrix[kenMove]! };
          console.log(dumpMatrix(sub));
        }
        console.log(
          dumpPairDetail(rom, kenPtr, ryuPtr, 'crouch_short', 'sweep'),
        );
        const counterTable = buildCounterTable(matrix);
        console.log(dumpCounterTable(counterTable));
        this.rangesDumped = true;
      }
    }

    // Feasibility probe takes over P2 — bypass AI fighter entirely.
    if (this.cmkPunishTest) {
      const fightActive = state.roundPhase === 'fight'
        && state.p1.hp > 0 && state.p2.hp > 0;
      this.host.armVirtualP2?.(fightActive);
      if (fightActive) {
        this.cmkPunishTest.onVblank(state);
      } else {
        this.cmkPunishTest.reset();
      }
      return;
    }

    // Deterministic counter-punish AI. Owns P2 like the feasibility
    // probe, also bypasses the tier policy.
    if (this.counterAi && rom) {
      const fightActive = state.roundPhase === 'fight'
        && state.p1.hp > 0 && state.p2.hp > 0;
      this.host.armVirtualP2?.(fightActive);
      if (fightActive) {
        this.counterAi.onVblank(state, rom);
      } else {
        this.counterAi.reset();
      }
      return;
    }

    // AI opponent plumbing. Auto-arm the virtual P2 channel only during
    // an active fight, so the keyboard/gamepad can still drive P2
    // through the menu and character select.
    if (this.aiFighter) {
      const fightActive = state.roundPhase === 'fight'
        && state.p1.hp > 0 && state.p2.hp > 0;
      this.host.armVirtualP2?.(fightActive);
      if (fightActive) {
        this.aiFighter.onVblank(state);
      } else {
        this.aiFighter.reset();
      }
    }

    // Calibration mode: one line per button press with direction held +
    // the post-press animPtr trace (15 frames).
    if (this.calibrateOnly) {
      this.logCalibration(state, ram);
      return;
    }

    const events = this.detector.detect(state, this.history);
    for (const ev of events) {
      this.recentEvents.push(ev);
      if (this.recentEvents.length > this.RECENT_EVENT_CAP) {
        this.recentEvents.shift();
      }
      if (ev.importance >= 0.6) {
        console.log(`[coach:event] ${formatEvent(ev)}`);
      }
      // Runtime move logger. When the detector fires special_startup
      // and we have a name for the animPtr, log "Ryu → Hadouken jab".
      if (ev.type === 'special_startup') {
        const resolved = moveName(ev.character, ev.animPtr);
        const ptrHex = `0x${ev.animPtr.toString(16).toUpperCase().padStart(8, '0')}`;
        if (resolved) {
          console.log(`[coach:move] ${ev.player} ${ev.character} → ${resolved}`);
        } else {
          const self = ev.player === 'p1' ? state.p1 : state.p2;
          const foe  = ev.player === 'p1' ? state.p2 : state.p1;
          const dist = Math.round(Math.abs(self.x - foe.x));
          console.log(
            `[coach:move:unknown] ${ev.player} ${ev.character} animPtr=${ptrHex} state=0x${ev.stateByte.toString(16).padStart(2, '0')} dist=${dist}px`,
          );
        }
      }
    }

    this.tickCount++;
  }
}
