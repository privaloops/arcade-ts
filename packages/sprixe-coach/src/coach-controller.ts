import { EventDetector } from './detector/event-detector';
import type { CoachEvent } from './detector/events';
import { StateExtractor } from './extractor/state-extractor';
import { StateHistory } from './extractor/state-history';
import { P1_BASE, P2_BASE } from './extractor/sf2hf-memory-map';
import type { GameState } from './types';

const WORK_RAM_BASE = 0xFF0000;

/**
 * Minimal host surface needed by the coach. PlayingScreen passes in the
 * runner's getWorkRam / setVblankCallback, keeping this package unaware
 * of @sprixe/engine.
 */
export interface CoachHost {
  getWorkRam?(): Uint8Array;
  setVblankCallback?(cb: (() => void) | null): void;
}

export interface CoachOptions {
  gameId: string;
  /** Log GameState to the console every N frames. Default 60 (≈ 1Hz). */
  logEveryNFrames?: number;
  /** Override for tests. */
  now?: () => number;
}

const SUPPORTED_GAMES = new Set(['sf2hf', 'sf2hfj', 'sf2hfu']);

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
      return `${head} ${ev.player} ${ev.character} attack=${ev.attackId}`;
    case 'corner_trap':
      return `${head} ${ev.victim} ${ev.side}`;
    case 'macro_state_change':
      return `${head} P2 ${ev.from} → ${ev.to} [${ev.triggers.join(', ')}]`;
    case 'pattern_prediction':
      return `${head} predict=${ev.predictedAction} in ${ev.preNoticeMs}ms (conf=${ev.confidence.toFixed(2)}) — ${ev.reason}`;
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
  private tickCount = 0;
  private stopped = false;
  private recentEvents: CoachEvent[] = [];
  private readonly RECENT_EVENT_CAP = 32;

  constructor(host: CoachHost, opts: CoachOptions) {
    this.host = host;
    this.gameId = opts.gameId;
    this.logEvery = opts.logEveryNFrames ?? 60;
    this.now = opts.now ?? (() => performance.now());
  }

  start(): boolean {
    if (!SUPPORTED_GAMES.has(this.gameId)) return false;
    if (!this.host.getWorkRam || !this.host.setVblankCallback) return false;

    this.host.setVblankCallback(() => this.onVblank());
    console.log(`[sprixe-coach] armed for ${this.gameId}`);
    return true;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.host.setVblankCallback?.(null);
    this.detector.reset();
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

  private onVblank(): void {
    if (this.stopped) return;
    const ram = this.host.getWorkRam?.();
    if (!ram) return;

    const state = this.extractor.extract(ram, this.now());
    this.history.push(state);

    const events = this.detector.detect(state, this.history);
    for (const ev of events) {
      this.recentEvents.push(ev);
      if (this.recentEvents.length > this.RECENT_EVENT_CAP) {
        this.recentEvents.shift();
      }
      if (ev.importance >= 0.6) {
        console.log(`[coach:event] ${formatEvent(ev)}`);
      }
    }

    if (this.tickCount % this.logEvery === 0) {
      const derived = this.history.derive();
      const p1 = state.p1;
      const p2 = state.p2;
      console.log(
        `[coach] f=${state.frameIdx} t=${state.timer} ${state.roundPhase} | `
        + `P1(${p1.charId} hp=${p1.hp} x=${p1.x} y=${p1.y}) vs `
        + `P2(${p2.charId} hp=${p2.hp} x=${p2.x} y=${p2.y}) | `
        + `dist=${Math.round(derived.avgDistance)} retreat=${derived.p2RetreatCount}`,
      );
    }
    this.tickCount++;
  }
}
