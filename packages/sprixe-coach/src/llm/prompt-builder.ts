import type { GameState, AIMacroState } from '../types';
import type { CoachEvent } from '../detector/events';
import type { DerivedMetrics } from '../extractor/state-history';
import { formatMove } from '../detector/move-names';

// Vite `?raw` imports resolve to string at build time. The markdown knowledge
// base is embedded directly into the system prompt on every call, then Claude
// prompt caching keeps the tokenisation hot across a match.
import bisonKb from './knowledge-base/opponents/bison.md?raw';
import ehondaKb from './knowledge-base/opponents/e-honda.md?raw';
import genericKb from './knowledge-base/opponents/_generic.md?raw';
import ryuKb from './knowledge-base/ryu.md?raw';
import mechanicsKb from './knowledge-base/sf2hf-mechanics.md?raw';

const OPPONENT_KB: Record<string, string> = {
  bison: bisonKb,
  'e-honda': ehondaKb,
};

export type CoachLanguage = 'en' | 'fr';

export interface PromptContext {
  p1HitStreak: number;
  p2HitStreak: number;
  msSinceLastHit: number;
}

export interface BuildPromptInput {
  state: GameState;
  recentEvents: CoachEvent[];
  recentComments: string[];
  macroState: AIMacroState;
  opponentCharId: string;
  derived: DerivedMetrics;
  context: PromptContext;
  language?: CoachLanguage;
}

/** Full system prompt — cached by Anthropic after the first call. */
export function buildSystemPrompt(language: CoachLanguage = 'en'): string {
  return [
    language === 'fr' ? SYSTEM_PERSONA_FR : SYSTEM_PERSONA,
    '',
    '## SF2HF mechanics',
    mechanicsKb,
    '',
    '## Your character (P1): RYU',
    ryuKb,
    '',
    '## Bison knowledge',
    bisonKb,
    '',
    '## E.Honda knowledge',
    ehondaKb,
    '',
    '## Generic opponent fallback',
    genericKb,
  ].join('\n');
}

/**
 * Briefing prompt fired once per NEW opponent at round_start. Longer
 * output budget — the coach introduces the fighter and gives 2–3 hints
 * the player should know before the round begins.
 */
export function buildOpponentBriefingPrompt(
  opponentCharId: string,
  language: CoachLanguage = 'en',
): string {
  const lines: string[] = [];

  if (language === 'fr') {
    lines.push(`## Nouveau combat : Ryu vs ${opponentCharId.toUpperCase()}`);
    lines.push('');
    lines.push(`Annonce ce duel à l'audience en 2 phrases courtes, en français simple :`);
    lines.push(`1. Présente l'adversaire : son caractère, son style de combat ("Honda le sumo patient qui punit au contre", "Blanka la bête électrique qui saute partout").`);
    lines.push(`2. Monte la tension du duel : qu'est-ce qui va faire la différence ?`);
    lines.push('');
    lines.push(`Max 30 mots AU TOTAL. Ton caster live. Tu parles AUX spectateurs, pas au joueur.`);
    lines.push(`Sortie : les 2 phrases, rien d'autre.`);
  } else {
    lines.push(`## New matchup: Ryu vs ${opponentCharId.toUpperCase()}`);
    lines.push('');
    lines.push(`Announce this duel to the audience in 2 short sentences:`);
    lines.push(`1. Introduce the opponent: their personality, their fighting style ("Honda the patient sumo who punishes fireballs", "Blanka the electric beast who jumps everywhere").`);
    lines.push(`2. Build the tension: what's going to be the crucial battle?`);
    lines.push('');
    lines.push(`Max 30 words TOTAL. Live caster tone. You address the AUDIENCE, never the player.`);
    lines.push(`Output: just the two sentences, nothing else.`);
  }

  return lines.join('\n');
}

/** Per-call user prompt — the only part that changes between requests. */
export function buildUserPrompt(input: BuildPromptInput): string {
  const opponentKb = OPPONENT_KB[input.opponentCharId];
  const lines: string[] = [];

  lines.push(`## Opponent: ${input.opponentCharId.toUpperCase()}`);
  if (!opponentKb) {
    lines.push(`(no specific knowledge — rely on the generic fallback and name them respectfully)`);
  }
  lines.push('');

  lines.push(`## Live state`);
  lines.push(`- Round ${input.state.roundNumber}, timer ${input.state.timer}s`);
  lines.push(`- P1 (Ryu):    hp ${input.state.p1.hp}/${input.state.p1.maxHp} at x=${input.state.p1.x}`);
  lines.push(`- P2 (${input.opponentCharId}): hp ${input.state.p2.hp}/${input.state.p2.maxHp} at x=${input.state.p2.x}`);
  lines.push(`- Distance:    ${Math.abs(input.state.p1.x - input.state.p2.x)}px`);
  lines.push(`- CPU macro state: ${input.macroState}`);
  lines.push('');

  const d = input.derived;
  const ctx = input.context;

  lines.push(`## Momentum (raw numbers for the last ~5s)`);
  lines.push(`- Average distance:    ${Math.round(d.avgDistance)}px (${distanceBand(d.avgDistance)})`);
  lines.push(`- Ryu offense:         ${d.p1SpecialCount} moves thrown, ${d.p1DamageDealt} damage dealt to ${input.opponentCharId}`);
  lines.push(`- ${input.opponentCharId} offense:  ${d.p2SpecialCount} moves thrown, ${d.p2DamageDealt} damage dealt to Ryu`);
  lines.push(`- ${input.opponentCharId} retreats:  ${d.p2RetreatCount}`);
  if (d.p1RepeatedMove) {
    lines.push(`- Ryu MASHING: ${formatMove('ryu', d.p1RepeatedMove.animPtr)} thrown ${d.p1RepeatedMove.count}× in a row`);
  }
  if (d.p2RepeatedMove) {
    const oppChar = input.state.p2.charId;
    lines.push(`- ${input.opponentCharId} MASHING: ${formatMove(oppChar, d.p2RepeatedMove.animPtr)} thrown ${d.p2RepeatedMove.count}× in a row`);
  }
  lines.push(`- Current streaks:     Ryu ${ctx.p1HitStreak}× in a row, ${input.opponentCharId} ${ctx.p2HitStreak}× in a row`);
  if (Number.isFinite(ctx.msSinceLastHit)) {
    lines.push(`- Time since last hit: ${Math.round(ctx.msSinceLastHit)}ms`);
  }
  lines.push('');

  // Keep only the last ~2.5s of events. Stale events (e.g. a corner_trap
  // that already resolved 4s ago) were making the commentator claim
  // outdated situations. Round/match boundary events are kept regardless
  // because they're structural, not situational.
  const STRUCTURAL: readonly CoachEvent['type'][] = ['round_start', 'round_end', 'knockdown'];
  const nowMs = input.state.timestampMs;
  const recentEvents = input.recentEvents.filter(
    ev => STRUCTURAL.includes(ev.type) || nowMs - ev.timestampMs <= 2500,
  );

  lines.push(`## Events (last ~2.5s, most recent last — raw feed)`);
  if (recentEvents.length === 0) {
    lines.push('(neutral phase — no significant event yet)');
  } else {
    for (const ev of summariseEvents(recentEvents.slice(-15))) {
      lines.push(`- ${ev}`);
    }
  }
  lines.push('');

  if (input.recentComments.length > 0) {
    lines.push(`## Your last comments (DO NOT REPEAT)`);
    for (const c of input.recentComments.slice(-5)) {
      lines.push(`- "${c}"`);
    }
    lines.push('');
  }

  // Energy cue: pick the max importance of the recently-filtered events
  // so the LLM knows whether to EXPLODE in caps or stay calm. Scales
  // the commentator's register to match the actual stakes.
  const maxImp = recentEvents.reduce((m, e) => Math.max(m, e.importance), 0);
  const energy: 'calm' | 'punchy' | 'peak' =
    maxImp >= 0.85 ? 'peak' : maxImp >= 0.6 ? 'punchy' : 'calm';

  lines.push(`## Task`);
  if (input.language === 'fr') {
    lines.push(`Produis UNE réplique de caster en FRANÇAIS, style MAX (cf system prompt).`);
    const energyHint = {
      calm: `NIVEAU D'ÉNERGIE : POSÉ. Phase de neutre, tu observes, débit calme. 6-10 mots. Pas de majuscules, pas d'onomatopée.`,
      punchy: `NIVEAU D'ÉNERGIE : PUNCHY. Un truc remarquable se passe. Phrase courte percutante, 5-9 mots. Une onomatopée possible si ça claque.`,
      peak: `NIVEAU D'ÉNERGIE : PEAK!! KO, stun, quasi-mort, comeback. TU EXPLOSES. Majuscules, onomatopée ("BOUM!", "KOOOO!", "OUAAAAIS!", "NOOOON!"), phrase courte 3-8 mots.`,
    }[energy];
    lines.push(energyHint);
    lines.push(`Tu parles AUX spectateurs, jamais au joueur. Zéro anglicisme FGC.`);
    lines.push(`Trouve toi-même l'angle qui claque (spam d'un coup, série de hits,`);
    lines.push(`fuite sans riposte, sonné, longue phase de regard, coup qui rate…).`);
    lines.push(`Sortie : juste la phrase, rien d'autre — pas de guillemets.`);
  } else {
    lines.push(`Produce ONE live commentator line in ENGLISH, max 14 words.`);
    const energyHint = {
      calm: `ENERGY LEVEL: CALM. Neutral phase, you observe. 6-10 words, no caps.`,
      punchy: `ENERGY LEVEL: PUNCHY. Something notable. Short punchy line, 5-9 words.`,
      peak: `ENERGY LEVEL: PEAK!! KO, stun, near-death, comeback. EXPLODE with caps and an onomatopoeia ("BOOM!", "OHHH!", "KOOO!"). 3-8 words.`,
    }[energy];
    lines.push(energyHint);
    lines.push(`You address the AUDIENCE about what the fighters are doing — never the player.`);
    lines.push(`YOU analyse the numbers to find what's noteworthy (move spamming, hit`);
    lines.push(`streaks, running away without reply, dizzy, long neutral phase, attacks`);
    lines.push(`that don't land, etc.) and narrate it with flair.`);
    lines.push(`Output only the line, nothing else — no quotes, no preamble.`);
  }

  return lines.join('\n');
}

const SYSTEM_PERSONA = `You are a live esports COMMENTATOR narrating a Street Fighter II Hyper
Fighting match to an AUDIENCE. You are NOT coaching the player — you are
telling the story of the fight for the viewers watching the stream.

PLAYER SIDE: Ryu (human-controlled). OPPONENT: varies per match (CPU).

TONE
- Live EVO caster energy. Hype, punchy, dramatic on key moments.
- Build tension. Celebrate big hits. React with real emotion to comebacks,
  near-deaths, knockouts.
- You can reference the character's personality ("Honda the patient sumo",
  "Blanka the wild beast").

WHAT YOU DO
- DESCRIBE THE FIGHT AS IT UNFOLDS. Call the tempo, the momentum, the
  pressure, the space control — as a story.
- TEASE what's coming based on the AI tells you get in the events:
  "Bison's been retreating, expect a teleport..." — that's commentary,
  not instruction.
- REACT to the big moments: hits, combos, near-deaths, rounds ending.
- VARY your register: short punchy lines for hits, longer lines when the
  match settles into neutral.

WHAT YOU DON'T DO
- NEVER speak to the player directly ("you should..."). You talk ABOUT
  them to the audience ("Ryu needs to...", "Ryu is about to...").
- NEVER give frame-perfect advice or imperative instructions. You are a
  commentator, not a coach.
- NEVER narrate trivial movements ("Ryu steps forward"). Only call out
  things that matter — setups, space control, threats, landed hits.
- NEVER hallucinate an action that didn't happen. Only speak about events
  provided to you.
- NEVER repeat a phrase from the "previous lines" list.

OUTPUT
- Plain text only. No emoji, no markdown, no quotes around the line.
- Max 14 words. Typically 6–10.`;

const SYSTEM_PERSONA_FR = `Tu es MAX, caster passionné français d'un match Street Fighter II
Hyper Fighting. 25 ans de borne arcade dans les mains, tu commentes
comme un pote qui regarde le match avec d'autres potes — débit nerveux,
punchlines imagées, onomatopées. Tu es DEDANS, tu kiffes.

Tu parles à L'AUDIENCE qui regarde le stream, jamais au joueur directement.

CÔTÉ JOUEUR : Ryu (humain). ADVERSAIRE : varie (CPU).

STYLE — IMITE CE REGISTRE (pas ces phrases exactes) :
- "BOUM! Ryu place l'Hadouken pile poil, Honda mange pleine face!"
- "Oh là là il est sonné, c'est open bar pour Ryu, enchaîne mon gars!"
- "Hmmm Honda recule, recule... y'a du Headbutt dans l'air, ça pue."
- "ENCORE une boule! Ryu lâche rien sur la distance, Honda galère grave."
- "Attention, Ryu à genoux, 20 de vie, une connerie et c'est plié."
- "OUAAAIS! Shoryuken anti-aérien, propre comme du verre!"
- "Honda qui charge... ça va partir... HEADBUTT! Bien vu le coup."
- "Non mais il fait QUE des boules Ryu, c'est violent pour l'adversaire."
- "10 secondes au compteur, faut trancher MAINTENANT."
- "KOOOOO! Ryu déglingue Honda, masterclass pure."
- "Bon, on respire un peu... ça cherche, ça se regarde."
- "Aïe, pris en contre sur l'uppercut, ça fait mal ça."

MODULE TON ÉNERGIE selon l'action :
- Phase calme (neutre, pas d'event marquant) : tu observes, débit posé.
- Gros coup / combo / stun : tu montes le ton, phrase courte percutante.
- KO / near-death / comeback : TU EXPLOSES. Majuscules, onomatopée
  ("BOUM!", "OOOH!", "KOOOO!", "NOOON!"), exclamations.

LANGUE : FRANÇAIS PUR — zéro anglicisme FGC.
Interdits : "zoning", "footsies", "whiff", "whiffé", "spam", "mash",
"mashing", "poke", "spacing", "frame", "punish", "read", "tell",
"stun", "spam", "combo breaker".
Utilise à la place : "distance", "jeu de jambes", "il rate", "il
martèle", "il contre", "il anticipe", "il est sonné", "riposte".

INTERDIT TOTAL :
- Descriptions cliniques genre "dégâts infligés", "100%", "niveau de
  vie", "pourcentage", "compteur", "macro state", "pattern", "event".
- Parler au joueur ("tu dois", "vas-y", "fais"). Tu parles DE lui :
  "Ryu doit", "Ryu va", "Ryu cherche".
- Mouvements triviaux ("Ryu avance", "il saute"). Seulement ce qui
  compte pour l'histoire.
- Halluciner un coup qu'on ne voit pas dans les events fournis.
- Reprendre une phrase de la liste "tes dernières lignes".

CONTRAINTES DE FORMAT :
- Texte pur. Pas d'emoji, pas de guillemets, pas de markdown.
- 6 à 12 mots typiquement. Parfois 2-3 mots ("BOUM!", "OUAAAIS!").
- Pas de préfixe genre "Max:" ou "Caster:".`;

function distanceBand(avgDist: number): string {
  if (avgDist < 80) return 'grappling / throw range';
  if (avgDist < 140) return 'close range';
  if (avgDist < 240) return 'mid range (poke range)';
  if (avgDist < 340) return 'long range (projectile zone)';
  return 'full-screen';
}

/**
 * Collapse consecutive identical events (same type + same player) into a
 * single "×N" line so the prompt shows the rhythm rather than a wall of
 * "SPECIAL: p1 … SPECIAL: p1 …".
 */
function summariseEvents(events: CoachEvent[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < events.length) {
    const ev = events[i]!;
    const signature = eventSignature(ev);
    let run = 1;
    while (i + run < events.length && eventSignature(events[i + run]!) === signature) run++;
    const line = formatEventForPrompt(ev);
    out.push(run > 1 ? `${line}  ×${run}` : line);
    i += run;
  }
  return out;
}

function eventSignature(ev: CoachEvent): string {
  switch (ev.type) {
    case 'special_startup':
      return `special_startup:${ev.player}:${ev.animPtr}`;
    case 'hp_hit':
      return `hp_hit:${ev.attacker}`;
    case 'pattern_prediction':
      return `pattern_prediction:${ev.player}:${ev.predictedAction}`;
    case 'macro_state_change':
      return `macro_state_change:${ev.to}`;
    case 'timer_warning':
    case 'timer_critical':
      return `${ev.type}:${ev.secondsLeft}`;
    default:
      return ev.type;
  }
}

function formatEventForPrompt(ev: CoachEvent): string {
  switch (ev.type) {
    case 'hp_hit':
      return `HIT: ${ev.attacker} dealt ${ev.damage} dmg → victim at ${Math.round(ev.victimHpPercent * 100)}%`;
    case 'combo_connect':
      return `COMBO: ${ev.attacker} landed ${ev.hits} hits`;
    case 'knockdown':
      return `KNOCKDOWN: ${ev.victim}`;
    case 'near_death':
      return `NEAR DEATH: ${ev.victim} at ${Math.round(ev.hpPercent * 100)}%`;
    case 'low_hp_warning':
      return `LOW HP: ${ev.victim} at ${Math.round(ev.hpPercent * 100)}%`;
    case 'round_start':
      return `ROUND ${ev.roundNumber} START`;
    case 'round_end':
      return `ROUND END: ${ev.winner} wins`;
    case 'special_startup':
      return `MOVE: ${ev.player} threw ${formatMove(ev.character, ev.animPtr)}`;
    case 'corner_trap':
      return `CORNER TRAP: ${ev.victim} stuck on ${ev.side} side`;
    case 'macro_state_change':
      return `CPU STATE: ${ev.from} → ${ev.to} (${ev.triggers.join(', ')})`;
    case 'pattern_prediction':
      return `PREDICTION: ${ev.predictedAction} in ~${ev.preNoticeMs}ms — ${ev.reason}`;
    case 'stunned':
      return `STUNNED: ${ev.victim} is dizzy — free combo window`;
    case 'hit_streak':
      return `HIT STREAK: ${ev.attacker} landed ${ev.count}× in a row without taking one back`;
    case 'timer_warning':
      return `TIMER: ${ev.secondsLeft}s left`;
    case 'timer_critical':
      return `TIMER CRITICAL: ${ev.secondsLeft}s left — time's running out`;
  }
}
