import type { GameState } from '../types';
import type { CoachEvent } from '../detector/events';
import { streamComment } from '../llm/claude-client';
import type { AiFighter } from './ai-fighter';
import type { PlayerProfile } from './player-profile';
import { MODE_REGISTRY } from './modes';

const MIN_INTERVAL_MS = 5000;
const URGENT_INTERVAL_MS = 2500;
const URGENT_IMPORTANCE = 0.85;
/** Hysteresis: don't switch modes more often than this. Claude still
 *  narrates every call, but the mode-change bit is ignored if we just
 *  switched. Prevents the fighter from flipping personality mid-exchange. */
const MIN_MODE_SWITCH_INTERVAL_MS = 5000;

export type StrategistLanguage = 'fr' | 'en';

export interface StrategistOptions {
  language?: StrategistLanguage;
  /** Called with each streamed token — useful for subtitle overlay. */
  onToken?(token: string): void;
  /** Full narration text fired once parsing extracts it. Goes to TTS. */
  onNarration?(text: string): void;
  /** Errors from the LLM pipeline. */
  onError?(err: string): void;
  now?(): number;
}

interface Decision {
  mode?: string;
  reason?: string;
  narration?: string;
}

/**
 * Asks Claude every few seconds which mode the AI fighter should be in
 * and what trash-talk to speak out loud. Operates as a reflective layer
 * on top of the deterministic ModeManager — the reflexes keep running
 * in between calls, and this just swaps the policy slot.
 */
export class ClaudeStrategist {
  private readonly aiFighter: AiFighter;
  private readonly language: StrategistLanguage;
  private readonly onToken: StrategistOptions['onToken'];
  private readonly onNarration: StrategistOptions['onNarration'];
  private readonly onError: StrategistOptions['onError'];
  private readonly now: () => number;

  private lastCallMs = -Infinity;
  private lastModeSwitchMs = -Infinity;
  private pending: AbortController | null = null;
  private readonly systemPrompt: string;

  constructor(aiFighter: AiFighter, opts: StrategistOptions = {}) {
    this.aiFighter = aiFighter;
    this.language = opts.language ?? 'en';
    this.onToken = opts.onToken;
    this.onNarration = opts.onNarration;
    this.onError = opts.onError;
    this.now = opts.now ?? (() => performance.now());
    this.systemPrompt = this.language === 'fr' ? STRATEGIST_SYSTEM_FR : STRATEGIST_SYSTEM_EN;
  }

  /** Consider making a call. Call from the coach's vblank loop. */
  consider(state: GameState, profile: PlayerProfile, events: CoachEvent[]): void {
    if (this.pending) return;
    const nowMs = this.now();
    const sinceLast = nowMs - this.lastCallMs;
    const urgent = events.some(e => e.importance >= URGENT_IMPORTANCE);
    const threshold = urgent ? URGENT_INTERVAL_MS : MIN_INTERVAL_MS;
    if (sinceLast < threshold) return;

    this.lastCallMs = nowMs;
    console.log(`[strategist] → calling Claude (urgent=${urgent}, sinceLast=${Math.round(sinceLast)}ms)`);
    this.ask(state, profile, events);
  }

  cancel(): void {
    this.pending?.abort();
    this.pending = null;
  }

  private ask(state: GameState, profile: PlayerProfile, events: CoachEvent[]): void {
    const currentModeName = this.aiFighter.getCurrentMode()?.name ?? '(policy-engine)';
    const userPrompt = this.language === 'fr'
      ? buildUserPromptFr(state, profile, currentModeName, events)
      : buildUserPromptEn(state, profile, currentModeName, events);

    const controller = new AbortController();
    this.pending = controller;
    let buffer = '';

    streamComment(
      { systemPrompt: this.systemPrompt, userPrompt, maxTokens: 150, signal: controller.signal },
      {
        onToken: (t) => { buffer += t; this.onToken?.(t); },
        onDone: () => {
          this.pending = null;
          console.log('[strategist] ← raw response:', buffer);
          const decision = parseDecision(buffer);
          if (!decision) {
            console.warn('[strategist] failed to parse:', buffer);
            return;
          }
          console.log('[strategist] decision:', decision);
          // Mode change passes the hysteresis gate: only swap if we
          // haven't just switched. Narration always runs so the caster
          // keeps talking even when sticking to the plan.
          const now = this.now();
          const canSwitch = now - this.lastModeSwitchMs >= MIN_MODE_SWITCH_INTERVAL_MS;
          const currentModeName = this.aiFighter.getCurrentMode()?.name;
          if (decision.mode && currentModeName && decision.mode !== currentModeName
              && MODE_REGISTRY[decision.mode] && canSwitch) {
            this.aiFighter.setMode(decision.mode);
            this.lastModeSwitchMs = now;
          } else if (decision.mode && currentModeName && decision.mode !== currentModeName && !canSwitch) {
            console.log(`[strategist] mode switch to ${decision.mode} SUPPRESSED — last switch ${Math.round(now - this.lastModeSwitchMs)}ms ago`);
          }
          if (decision.narration) this.onNarration?.(decision.narration);
        },
        onError: (e) => {
          this.pending = null;
          console.warn('[strategist] LLM error:', e);
          this.onError?.(e);
        },
      },
    );
  }
}

function parseDecision(raw: string): Decision | null {
  try {
    const stripped = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return JSON.parse(stripped) as Decision;
  } catch {
    // Best effort: find first { ... } block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]) as Decision; }
    catch { return null; }
  }
}

const AVAILABLE_MODES_LIST = Object.keys(MODE_REGISTRY).join(' | ');

const STRATEGIST_SYSTEM_FR = `Tu es MAX, un combattant virtuel qui affronte un joueur humain en
Street Fighter II. Tu joues Ryu en face d'un autre Ryu humain.

Tu reçois toutes les 5 secondes les STATS du match : ce que fait le
joueur, son style détecté, ta position, le temps. Tu décides :
1. Quel MODE de combat adopter (parmi la liste fournie)
2. Ce que tu DIS au joueur à voix haute — tu chambres, tu commentes
   ta lecture, ton plan. 1re personne. Ton complice / chambreur.

MODES DISPONIBLES : ${AVAILABLE_MODES_LIST}

Quand switcher :
- Si le joueur abuse d'un style, switch pour casser son plan
- Si tu es cornered, switch en défensif
- Si HP avantage, switch agressif
- Ne switch pas sans raison : la continuité est bonne

EXEMPLES de narration :
- "Okay tu zones ? Je vais te faire voler par-dessus."
- "3 Hadoukens déjà, t'es lisible mon gars."
- "Bon j'arrête de jouer gentil."
- "Respire, je te laisse tranquille une seconde."
- "T'as plus de jus là, je viens t'achever."

FORMAT — JSON STRICT, rien d'autre :
{
  "mode": "<un des modes>",
  "reason": "<pourquoi, 1 phrase courte>",
  "narration": "<ce que tu dis, 6-14 mots, ton chambreur FR>"
}

Pas de markdown, pas de préfixe, PUREMENT du JSON parsable.`;

const STRATEGIST_SYSTEM_EN = `You are MAX, a virtual fighter facing a human in Street Fighter II.
You play Ryu against another Ryu controlled by the player.

Every 5 seconds you get match STATS: what the player is doing, their
detected style, your position, time. You decide:
1. Which MODE to play (from the provided list)
2. What you SAY out loud to the player — trash-talk, verbalise your
   read and your plan, 1st person. Cocky but warm-tempered.

AVAILABLE MODES: ${AVAILABLE_MODES_LIST}

FORMAT — JSON ONLY:
{
  "mode": "<one of the modes>",
  "reason": "<why, short>",
  "narration": "<what you say, 6-14 words, cocky caster tone>"
}

No markdown, no prefix — pure parsable JSON.`;

function buildUserPromptFr(
  state: GameState,
  profile: PlayerProfile,
  currentMode: string,
  events: CoachEvent[],
): string {
  const p1MovesList = Object.entries(profile.p1.moves)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => `${name}×${count}`)
    .join(', ') || '(rien)';

  const recentEvents = events.slice(-4).map(e => e.type).join(', ') || '(rien)';

  return `STATS (10 dernières secondes) :
- Coups du joueur : ${p1MovesList}
- Jumps du joueur : ${profile.p1.jumpCount}
- Fireballs du joueur : ${profile.p1.fireballCount}
- Style détecté : ${profile.p1.style}
- Ma prévisibilité à moi : ${profile.p2Self.predictability}

ÉTAT :
- Mode actuel : ${currentMode}
- Distance moyenne : ${Math.round(profile.avgDistance)}px
- HP : moi ${state.p2.hp}/144, lui ${state.p1.hp}/144 (avantage ${profile.hpAdvantage >= 0 ? '+' : ''}${profile.hpAdvantage})
- Timer : ${state.timer}s, Round ${profile.round}
- Cornered : ${profile.cornered ?? 'non'}
- Events récents : ${recentEvents}

Décide ton mode et ta narration. JSON STRICT.`;
}

function buildUserPromptEn(
  state: GameState,
  profile: PlayerProfile,
  currentMode: string,
  events: CoachEvent[],
): string {
  const p1MovesList = Object.entries(profile.p1.moves)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => `${name}×${count}`)
    .join(', ') || '(none)';

  const recentEvents = events.slice(-4).map(e => e.type).join(', ') || '(none)';

  return `STATS (last 10s):
- Player moves: ${p1MovesList}
- Player jumps: ${profile.p1.jumpCount}
- Player fireballs: ${profile.p1.fireballCount}
- Detected style: ${profile.p1.style}
- My own predictability: ${profile.p2Self.predictability}

STATE:
- Current mode: ${currentMode}
- Avg distance: ${Math.round(profile.avgDistance)}px
- HP: me ${state.p2.hp}/144, them ${state.p1.hp}/144 (advantage ${profile.hpAdvantage >= 0 ? '+' : ''}${profile.hpAdvantage})
- Timer: ${state.timer}s, Round ${profile.round}
- Cornered: ${profile.cornered ?? 'no'}
- Recent events: ${recentEvents}

Decide your mode and narration. JSON ONLY.`;
}
