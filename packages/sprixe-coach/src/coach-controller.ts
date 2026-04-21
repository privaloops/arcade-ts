import { EventDetector } from './detector/event-detector';
import type { CoachEvent } from './detector/events';
import { moveName } from './detector/move-names';
import { StateExtractor } from './extractor/state-extractor';
import { StateHistory } from './extractor/state-history';
import { P1_BASE, P2_BASE } from './extractor/sf2hf-memory-map';
import { CommentOrchestrator } from './llm/comment-orchestrator';
import { TtsPlayer } from './tts/tts-player';
import { LocalTtsPlayer } from './tts/local-tts-player';
import { AiFighter } from './agent/ai-fighter';
import { PlayerProfiler } from './agent/player-profile';
import { ClaudeStrategist } from './agent/claude-strategist';
import type { VirtualInputChannel } from './agent/input-sequencer';
import type { GameState } from './types';

/** Common interface shared by ElevenLabs and browser-native TTS. */
interface TtsEngine {
  speak(text: string): void;
  destroy(): void;
}

export type TtsProvider = 'eleven' | 'local' | 'off';

const WORK_RAM_BASE = 0xFF0000;

/**
 * Minimal host surface needed by the coach. PlayingScreen passes in the
 * runner's getWorkRam / setVblankCallback, keeping this package unaware
 * of @sprixe/engine.
 */
export interface CoachHost {
  getWorkRam?(): Uint8Array;
  getIoPorts?(): Uint8Array;
  /** CPS-B registers — CPS-1 routes kick buttons here (cpsbRegs[0x37]
   *  for P1 LK/MK/HK), not the main IO port buffer. */
  getCpsbRegisters?(): Uint8Array;
  /** Persistent virtual input channel for P2. Required for AI-opponent
   *  mode; when null the coach is narration-only. */
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
  /** Called with each LLM token as it streams in. */
  onLlmToken?: (token: string) => void;
  /** Called when a full LLM comment has finished streaming. */
  onLlmComment?: (text: string) => void;
  /** Called when the LLM path errors (network, proxy, API). */
  onLlmError?: (err: string) => void;
  /** Output language for the coach line. Defaults to 'en'. */
  language?: 'en' | 'fr';
  /**
   * Calibration mode: skip EVERYTHING except the `[coach:calibrate]`
   * lines emitted on unknown attack ids. No LLM calls, no TTS, no
   * periodic state log, no event log. Used to fill move-names.ts.
   */
  calibrateOnly?: boolean;
  /**
   * TTS backend selector.
   *   'eleven' (default) — ElevenLabs Flash via the dev proxy, high
   *      quality hype caster voice, ~1.2s latency.
   *   'local' — browser-native Web Speech API, ~0ms latency but uses
   *      the OS voices so the quality / hype factor is limited.
   *   'off' — no voice, subtitles only.
   */
  ttsProvider?: TtsProvider;
  /** Optional voice override forwarded to /api/coach/tts (ElevenLabs). */
  ttsVoiceId?: string;
  /** Enable the AI opponent — drives P2 via virtual inputs with a
   *  deterministic reflex policy. Narration and detection layers keep
   *  working in parallel. Default false. */
  enableAiOpponent?: boolean;
  /** Pick the AI execution engine when the opponent is on.
   *   'mode'   — legacy hand-written modes + Claude picks one of them
   *   'policy' — DSL rules engine, Claude composes live policies */
  aiEngine?: 'mode' | 'policy';
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
 * before the attack button. Motions are universal across SF2 fighters
 * — qcf+P is Hadouken on Ryu, Yoga Fire on Dhalsim, Tiger Shot on
 * Sagat, etc., so we describe them by MOTION CLASS rather than named
 * moves and let the commentary layer re-skin per character.
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
  // Quarter-circle forward: D → F (DF in between is optional/inferred)
  if (/\bD\b.*\bF\b/.test(tail)) return 'qcf';
  // Quarter-circle back: D → B
  if (/\bD\b.*\bB\b/.test(tail)) return 'qcb';
  // Dragon punch: F → D → F (with optional DF)
  if (/\bF\b.*\bD\b.*\bF\b/.test(tail)) return 'dragon';
  // Reverse dragon: B → D → B
  if (/\bB\b.*\bD\b.*\bB\b/.test(tail)) return 'reverse-dragon';
  return null;
}

interface BuildTtsOptions {
  provider: TtsProvider;
  language?: 'en' | 'fr';
  voiceId?: string;
  onStart?(): void;
  onEnd?(): void;
}

function buildTtsEngine(opts: BuildTtsOptions): TtsEngine | null {
  if (typeof window === 'undefined') return null;
  if (opts.provider === 'off') return null;
  if (opts.provider === 'local') {
    const lang = opts.language === 'fr' ? 'fr-FR' : 'en-US';
    return new LocalTtsPlayer({
      lang,
      onError: (err) => console.warn('[coach:tts:local]', err),
      ...(opts.onStart ? { onStart: opts.onStart } : {}),
      ...(opts.onEnd ? { onEnd: opts.onEnd } : {}),
    });
  }
  return new TtsPlayer({
    ...(opts.voiceId ? { voiceId: opts.voiceId } : {}),
    onError: (err) => console.warn('[coach:tts:eleven]', err),
    ...(opts.onStart ? { onStart: opts.onStart } : {}),
    ...(opts.onEnd ? { onEnd: opts.onEnd } : {}),
  });
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
  private readonly commentator: CommentOrchestrator | null;
  private readonly ttsPlayer: TtsEngine | null;
  private readonly calibrateOnly: boolean;
  private readonly aiFighter: AiFighter | null;
  private readonly aiProfiler: PlayerProfiler | null;
  private readonly aiStrategist: ClaudeStrategist | null;
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

  constructor(host: CoachHost, opts: CoachOptions) {
    this.host = host;
    this.gameId = opts.gameId;
    this.logEvery = opts.logEveryNFrames ?? 60;
    this.now = opts.now ?? (() => performance.now());
    this.calibrateOnly = opts.calibrateOnly === true;

    // Build the commentator first so we can wire the TTS engine's
    // onStart/onEnd callbacks back into its overlap-prevention lock.
    // When AI-opponent mode is on, the ClaudeStrategist speaks in the
    // fighter's first person instead — we disable the passive coach to
    // avoid two voices stepping on each other.
    this.commentator = !this.calibrateOnly && opts.onLlmToken && !opts.enableAiOpponent
      ? new CommentOrchestrator({
          onToken: opts.onLlmToken,
          onCommentDone: (text) => {
            this.ttsPlayer?.speak(text);
            opts.onLlmComment?.(text);
          },
          ...(opts.onLlmError ? { onError: opts.onLlmError } : {}),
          ...(opts.language ? { language: opts.language } : {}),
          now: this.now,
        })
      : null;

    const commentator = this.commentator;
    this.ttsPlayer = this.calibrateOnly ? null : buildTtsEngine({
      provider: opts.ttsProvider ?? 'eleven',
      ...(opts.language ? { language: opts.language } : {}),
      ...(opts.ttsVoiceId ? { voiceId: opts.ttsVoiceId } : {}),
      ...(commentator ? {
        onStart: () => commentator.notifyTtsStart(),
        onEnd: () => commentator.notifyTtsEnd(),
      } : {}),
    });

    // AI opponent — off by default. Requires a virtual P2 channel from
    // the host; in its absence (e.g. tests) the fighter is never built.
    const vp2 = opts.enableAiOpponent ? host.getVirtualP2Channel?.() : undefined;
    this.aiFighter = vp2 ? new AiFighter(vp2, { enginePolicy: opts.aiEngine === 'policy' }) : null;
    this.aiProfiler = this.aiFighter ? new PlayerProfiler() : null;
    // Disable Claude strategist in policy mode — we want to lock the AI
    // on the hardcoded default policy while tuning it. Re-enable once
    // the policy baseline feels right.
    const strategistEnabled = this.aiFighter !== null && opts.aiEngine !== 'policy';
    this.aiStrategist = strategistEnabled ? new ClaudeStrategist(this.aiFighter!, {
      ...(opts.language ? { language: opts.language } : {}),
      onToken: (t) => opts.onLlmToken?.(t),
      onNarration: (text) => {
        this.ttsPlayer?.speak(text);
        opts.onLlmComment?.(text);
      },
      onError: (err) => opts.onLlmError?.(err),
      now: this.now,
    }) : null;
    if (this.aiFighter) {
      console.log('[sprixe-coach] AI opponent ARMED — mode policy + Claude strategist driving P2');
      if (typeof window !== 'undefined') {
        (window as unknown as { __aiFighter?: AiFighter }).__aiFighter = this.aiFighter;
      }
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
    this.commentator?.cancel();
    this.ttsPlayer?.destroy();
    this.aiFighter?.reset();
    if (this.keyListener && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keyListener);
      this.keyListener = null;
    }
  }

  /** Expose the orchestrator so callers can cancel mid-stream if needed. */
  cancelLlm(): void {
    this.commentator?.cancel();
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
   *   __coach.mark(0xFF83BE, 64)
   *   // ...walk right in the game...
   *   __coach.diffFrom(0xFF83BE, 64)
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

  /** Print the last N recorded events, most recent first. */
  eventsTail(n = 10): void {
    const tail = this.recentEvents.slice(-n).reverse();
    console.log(tail.map(formatEvent).join('\n'));
  }

  /**
   * Calibration tick: decode P1's arcade input bytes + snapshot the P1
   * struct so we can see which RAM byte reacts to each press.
   *
   * ioPorts[1] = P1 low byte (active-LOW):
   *   bits 0-3 = Right / Left / Down / Up
   *   bits 4-6 = LP / MP / HP
   * cpsbRegs[0x37] = P1 kicks byte (active-LOW):
   *   bits 0-2 = LK / MK / HK
   * (kicks don't route through ioPorts on CPS-1 — they live in CPS-B).
   */
  private logCalibration(state: GameState, ram: Uint8Array): void {
    const io = this.host.getIoPorts?.();
    const cpsb = this.host.getCpsbRegisters?.();
    const p1Byte = io?.[1] ?? 0xFF;
    const kickByte = cpsb?.[0x37] ?? 0xFF;

    // Detect 1→0 transitions on the 6 button bits only. Directions are
    // reported as held-state below, not as press events, because what
    // matters is which direction was held at the frame of the press.
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

    // Snapshot for next frame's diff. Always taken so the diff always
    // represents a 1-frame delta rather than stale history.
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
      // Skip ±1 ticks on animation frame counters — keep everything else
      // (including ±2..±4 pointer LSB deltas which were lost before).
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

    const state = this.extractor.extract(ram, this.now());
    this.history.push(state);

    // AI opponent plumbing. Auto-arm the virtual P2 channel only during
    // an active fight, so the keyboard/gamepad can still drive P2
    // through the menu and character select.
    if (this.aiFighter) {
      const fightActive = state.p1.hp > 0 && state.p2.hp > 0
        && state.p1.charId !== state.p2.charId
        && state.p1.charId !== 'unknown' && state.p2.charId !== 'unknown';
      this.host.armVirtualP2?.(fightActive);
      if (fightActive) {
        this.aiFighter.onVblank(state);
        this.aiProfiler?.observe(state);
        // Ask the strategist every ~250ms — its own throttle (5s min,
        // 1.8s urgent) suppresses calls that are still on cooldown.
        if (this.aiProfiler && this.aiStrategist && this.tickCount % 15 === 0) {
          const profile = this.aiProfiler.snapshot(state, this.history.derive());
          this.aiStrategist.consider(state, profile, this.recentEvents);
        }
      } else {
        this.aiFighter.reset();
        this.aiProfiler?.reset();
        this.aiStrategist?.cancel();
      }
    }

    // Calibration mode: one line per button press with direction held +
    // the post-press animPtr trace (15 frames) so a new unknown move's
    // startup pointer can be read off directly and added to move-names.ts.
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
      if (!this.calibrateOnly && ev.importance >= 0.6) {
        console.log(`[coach:event] ${formatEvent(ev)}`);
      }
      // Runtime move logger. When the detector fires special_startup
      // and we have a name for the animPtr, log "Ryu → Hadouken jab".
      // Unknown ptrs print the hex so we can extend move-names.ts
      // incrementally without a fresh calibration run.
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

    if (this.commentator) {
      this.commentator.ingest(
        state,
        events,
        this.recentEvents,
        this.detector.getLastCpuMacroState(),
        this.history.derive(),
        this.detector.getContext(state.timestampMs),
      );
    }

    this.tickCount++;
  }
}
