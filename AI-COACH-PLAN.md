# AI Coach — Plan d'implémentation détaillé

**Date** : 2026-04-20
**Branche** : worktree-ai-coach-plan (worktree)
**Statut** : Plan à valider — **aucun code à écrire tant que l'utilisateur n'a pas donné le go**.

---

## 0. TL;DR

Construire un **coach IA live** qui lit l'état d'un émulateur CPS1 en RAM, prédit le comportement de l'IA CPU adverse (Bison dans SF2 Hyper Fighting), et parle au joueur humain en temps réel avec une voix "esports caster" via Claude Haiku + ElevenLabs.

**Objectif final** : une vidéo brute non montée de 60-90s, postable sur X/LinkedIn/developpement.ai, montrant Thibaut battre Bison grâce aux prédictions du coach. Pitch : *"AI reads another AI and coaches you to beat it"*.

**Non-objectif** : un produit fini, un jeu coach multi-titres, un SaaS. C'est une **démo technique virale**.

**Budget temps visé** : 5 jours de dev focused, puis 1-2 jours de polish + captation vidéo.

**Budget API** : <20€ total (Haiku + ElevenLabs dev + démo).

---

## 1. Vision produit

### 1.1 Pitch one-liner

> *An AI that reads another AI in real-time and coaches you to beat it — on a 34-year-old arcade game.*

### 1.2 Pourquoi c'est impressionnant

- **Meta-level inédit** : une IA qui lit une autre IA. Pas une IA qui joue, pas un commentateur passif — un *lecteur stratégique*.
- **Latence résolue par design** : pas de micro-management frame-par-frame (impossible vu les 80ms de startup Shoryuken vs 650ms-1.6s de latence voix). Le coach fait du **préavis long** (2-5s) et de la **macro-stratégie**, comme un vrai coach sportif.
- **Stack IA 2026 complète** : Claude Haiku streaming + prompt engineering + knowledge base + TTS streaming + pipeline temps réel.
- **Accès RAM direct** : zéro computer vision, zéro hallucination sur ce qui se passe à l'écran. Avantage technique défendable vs les démos vision-only qui foisonnent.
- **Reconnaissance universelle** : SF2 est LE jeu arcade le plus iconique. Même les non-gamers comprennent l'enjeu.

### 1.3 Niche confirmée libre (recherche web avril 2026)

4 familles de concurrents, chacun sur un axe différent :

| Concurrent | Axe | Pourquoi c'est pas notre créneau |
|------------|-----|----------------------------------|
| linyiLYi/street-fighter-ai, llm-colosseum, LM Fight Arena | LLM/RL **joue** le jeu | L'IA est joueur, pas coach |
| CerebriumAI, GetStream, AWS Game Tech hackathon | Commentateur **sport live** en vision | Vision-only, pas émulateur, pas prédictif |
| Razer Game Co-AI, iTero, Street Fighter Coach GPT | **Coach statique** text-based ou post-game | Pas live, pas sur émulateur |
| SF6 real-time commentary (Capcom) | **Intégré** au jeu | Pas rétro, pas tiers, pas Claude |

**Personne ne combine** : RAM access + prédiction CPU + coach humain live + arcade rétro + voice streaming. Le pitch est défendable.

### 1.4 Fenêtre temporelle

Le domaine "AI game commentary" chauffe (survey arxiv 2506.17294 recense 45 méthodes, papers récents, AWS hackathons). L'exécution doit être rapide — 2-3 mois max pour être "first" sur ce créneau précis. D'où le focus MVP 5-7j.

---

## 2. MVP scope (strict)

### 2.1 Cible

- **Jeu** : Street Fighter II Hyper Fighting (sf2hf)
- **Personnage joueur humain** : Ryu (universel, connu de tous, spécials iconiques)
- **Adversaire CPU** : M. Bison (Dictator) — final boss, IA réputée cheatée, meme "Yes!", reconnaissance grand public max
- **Langue commentaire** : Anglais (voix ElevenLabs meilleure en EN, portée internationale)
- **Durée démo cible** : 60-90 secondes (1 match ≈ 2 rounds)

### 2.2 Scope IN

- [x] Extraction state 60fps depuis la RAM du 68K (via `bus.ts`)
- [x] Détecteur d'events déterministe + détecteur de macro-states Bison
- [x] Knowledge base Bison complète (patterns, cooldowns, counters Ryu)
- [x] Appel Claude Haiku streaming avec contexte events + historique comments
- [x] TTS ElevenLabs streaming WebSocket, voix "esports caster"
- [x] Overlay sous-titres synchronisés à l'audio
- [x] Architecture anti-répétition + rate limiting
- [x] Samples audio pré-générés pour events prévisibles (round start, KO, perfect)
- [x] Démo capturable via OBS/screencap intégré

### 2.3 Scope OUT (explicite)

- ❌ Autres boss SF2 (Vega, Sagat, Balrog) — v2
- ❌ Autres personnages joueur — v2
- ❌ Autres jeux (Metal Slug, KOF…) — v3
- ❌ Localisation FR — v2
- ❌ Offline mode (LLM local, Pi) — v3
- ❌ UI de configuration du coach — hardcodé pour MVP
- ❌ Multi-joueurs humain — v2
- ❌ Replay / analyse post-match — v2
- ❌ LLM local — v3 (Haiku cloud ok pour MVP)

### 2.4 Success criteria

**Technique** :
- Pipeline end-to-end fonctionnel : RAM → event → LLM → voice en < 1.5s
- Zéro hallucination sur events (si Claude dit "Bison teleported", Bison a teleport)
- Anti-répétition : pas deux fois la même phrase dans la fenêtre 20s
- Commentaires pertinents sur au moins 5 patterns Bison différents

**Qualité narrative** :
- Validation par 2-3 joueurs SF2 expérimentés : "oui, le coach comprend ce qui se passe"
- Ton "hype esports" reconnaissable à l'écoute, pas un TTS neutre

**Démo** :
- 1 vidéo brute 60-90s où Thibaut (ou un joueur moyen) bat Bison en s'appuyant sur le coach
- Filmable en 1 prise, pas de montage lourd

---

## 3. Architecture technique

### 3.1 Structure monorepo

```
packages/
  sprixe-engine/           # Existant
  sprixe-frontend/         # Existant
  sprixe-coach/            # ★ Nouveau
    src/
      extractor/           # Couche 1
        memory-map.ts      # Adresses RAM SF2HF
        state-extractor.ts # Lit la RAM et construit GameState
        state-history.ts   # Rolling window 5-10s
        types.ts           # GameState, CharacterState, etc.
      detector/            # Couche 2
        pattern-detector.ts      # Détection macro-states (zoning, rush, etc.)
        bison-patterns.ts        # Knowledge base patterns Bison
        event-emitter.ts         # Event bus typé
        importance-scorer.ts     # Score d'importance par event
      orchestrator/        # Couche 3
        coach-orchestrator.ts    # Chef d'orchestre, décide quand parler
        rate-limiter.ts          # Min interval entre interventions
        anti-repetition.ts       # Buffer N derniers comments
        priority-queue.ts        # File d'attente events
      llm/                 # Couche 4
        claude-client.ts         # Wrapper Anthropic SDK
        prompt-builder.ts        # Construit system + user prompts
        streaming-parser.ts      # Parse tokens streamés
        knowledge-base/
          bison.md               # Knowledge base textuelle Bison
          ryu.md                 # Knowledge base Ryu
          sf2hf-mechanics.md     # Frame data, mécaniques générales
      tts/                 # Couche 5
        elevenlabs-client.ts     # WebSocket streaming
        audio-player.ts          # Web Audio API, queuing, interrupt
        sample-cache.ts          # Samples pré-générés
      ui/                  # Couche 6
        subtitle-overlay.ts      # DOM overlay synchronisé audio
        coach-toggle.ts          # Button on/off dans UI sprixe
        event-debug-panel.ts     # Dev-only, visualise events
      config/
        constants.ts             # Rate limits, thresholds
        env.ts                   # API keys (via proxy)
      __tests__/                 # Vitest tests
```

### 3.2 Pipeline de flux

```
[sprixe-engine]
      ↓ (emulator runs, bus exposes RAM)
[Extractor] ──→ GameState(60 Hz)
      ↓
[StateHistory] (rolling 5-10s)
      ↓
[Detector] ──→ Events(1-20 Hz, filtered)
      ↓
[Orchestrator] (rate limit, prioritize, anti-repeat)
      ↓
[LLM Client] ──→ Claude Haiku stream (1-3 calls/sec max)
      ↓
[TTS Client] ──→ ElevenLabs WS stream
      ↓
[Audio Player + Subtitle UI] ──→ User
```

**Fréquences distinctes par couche :**
- Extractor : 60 Hz (chaque frame)
- StateHistory : 60 Hz mais window slide seulement 10 Hz
- Detector : 10-20 Hz (events filtrés)
- Orchestrator : event-driven, décide ~1-3 fois / 10s de parler
- LLM : 1 appel toutes les 3-10s max (rate limited)
- TTS : streaming continu pendant qu'un comment est en vol
- UI : 60 Hz pour la synchro sous-titres

### 3.3 Intégration dans sprixe-frontend

Le coach vit comme un **panel activable** dans l'UI existante (comme F2/F3/F4), avec une touche raccourci (proposition : **F6**).

- Bouton dans `controls-bar.ts` : "AI Coach" toggle
- Overlay sous-titres au-dessus du canvas, bas de l'écran
- Panel settings simple : volume voix, mute, voice selection
- Aucune modif du core emulator/CPU/video

---

## 4. Couche 1 — Extractor (RAM)

### 4.1 Adresses mémoire SF2HF à identifier

Source primaire : MAME cheat files (`src/mame/cheat/cps1.xml` section sf2hf), TASVideos submission notes, SRK wiki, disassembly Ghidra disponibles publiquement.

**Variables à extraire (68K RAM) :**

| Variable | Description | Source confirmée |
|----------|-------------|------------------|
| `p1_hp` | Health player 1 (0-176) | MAME cheat ok |
| `p2_hp` | Health player 2 | MAME cheat ok |
| `p1_x`, `p1_y` | Position P1 | MAME cheat ok |
| `p2_x`, `p2_y` | Position P2 | MAME cheat ok |
| `p1_char_id` | Personnage P1 | MAME cheat ok |
| `p2_char_id` | Personnage P2 | MAME cheat ok |
| `timer` | Round timer | MAME cheat ok |
| `round_number` | Round courant | À rechercher |
| `p1_anim_state` | État animation P1 | À rechercher (TAS) |
| `p2_anim_state` | État animation P2 | À rechercher (TAS) |
| `p1_stun_counter` | Hit stun P1 | À rechercher (TAS) |
| `p2_stun_counter` | Hit stun P2 | À rechercher (TAS) |
| `p1_combo_count` | Combo hits P1 | À rechercher |
| `p2_combo_count` | Combo hits P2 | À rechercher |
| `p2_ai_state` | Macro state Bison IA | **Critique** — disassembly |
| `p2_attack_id` | ID attaque en cours | Disassembly |
| `p2_move_phase` | Phase d'exécution du move | Disassembly |
| `p2_charge_counter` | Frames depuis début charge | Disassembly |
| `p2_retreat_counter` | Nombre de reculs récents | Dérivé (calcul) |

### 4.2 Effort d'identification

- **80% déjà documenté** dans MAME cheats + TASVideos (HP, position, char_id, timer, combo)
- **20% à reverse** : AI state, attack_id, move_phase, charge_counter
- Outil : MAME debugger + watchpoints + Ghidra disassembly
- Temps estimé : **1.5 jours** pour tout cartographier Bison

### 4.3 Struct TypeScript

```typescript
// packages/sprixe-coach/src/extractor/types.ts
export interface CharacterState {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  charId: CharacterId;
  animState: number;
  stunCounter: number;
  comboCount: number;
  isBlocking: boolean;
  isJumping: boolean;
  isCrouching: boolean;
  isAirborne: boolean;
  currentAttackId: number | null;
  attackPhase: 'startup' | 'active' | 'recovery' | null;
}

export interface CPUState extends CharacterState {
  aiState: AIMacroState; // 'zoning' | 'rush' | 'defensive' | ...
  chargeCounter: number;
  retreatCounter: number;
  lastSpecialFrame: number;
}

export interface GameState {
  frameIdx: number;
  timestampMs: number;
  p1: CharacterState;
  p2: CPUState;
  timer: number;
  roundNumber: number;
  roundPhase: 'fight' | 'ko' | 'intro' | 'outro';
}
```

### 4.4 Accès RAM

Le bus 68K de `sprixe-engine` expose déjà les lectures RAM. On ajoute une méthode `readRam(addr: number, bytes: number): Uint8Array` (ou on utilise l'API existante) et on l'appelle depuis `state-extractor.ts` à chaque tick d'émulation.

**Point à vérifier** : l'API exacte exposée par `packages/sprixe-engine` actuel. Si elle n'existe pas, il faut l'ajouter (une fonction `peek(addr)` non intrusive).

### 4.5 StateHistory (fenêtre glissante)

Maintient les N dernières secondes d'états pour permettre aux détecteurs de calculer des dérivées :
- Distance moyenne 3s
- Nombre de specials 5s
- Durée cumulée en `defensive` state
- Ratio agressif/défensif
- Retreat count (nombre de reculs P2 dans les 3 dernières secondes)

Taille : `5 secondes × 60 fps = 300 states`. Structure : ring buffer.

---

## 5. Couche 2 — Detector (patterns)

### 5.1 Events atomiques (détection frame-by-frame)

| Event | Trigger | Importance (0-1) |
|-------|---------|------------------|
| `hp_hit` | `prev.p2.hp - curr.p2.hp > 0` | 0.3-0.7 selon damage |
| `special_startup` | `p2.currentAttackId in SPECIALS && phase=startup` | 0.6 |
| `special_active` | phase=active | 0.5 |
| `special_whiff` | special recovery sans hit | 0.8 (exploitable) |
| `combo_connect` | `combo_count > prev` | 0.7 |
| `block_success` | hit sur blocking char | 0.4 |
| `knockdown` | anim transition → knockdown | 0.7 |
| `near_death` | hp < 25% | 0.9 |
| `round_start` | roundPhase → fight | 1.0 |
| `round_end` | roundPhase → ko | 1.0 |
| `corner_trap` | p1.x close to screen edge | 0.6 |

### 5.2 Macro-states de l'IA CPU (Bison)

À partir de signaux RAM + dérivés, classifier Bison dans un des états :

- `zoning` : Bison garde distance moyenne > 120px, pas de specials offensifs récents
- `rush` : Bison s'approche rapidement, jumps, pression
- `defensive` : Bison bloque, recule, health < 40%
- `corner_pressure` : P1 en coin + Bison en range
- `charge_building` : retreat + hold back (construit charge Psycho Crusher)
- `desperation` : health < 20%, comportement erratique/agressif
- `teleport_setup` : pattern retreat répété (3 reculs < 2s)

### 5.3 Knowledge base Bison (patterns connus FGC)

Source : EventHubs, Sirlin.net, SRK wiki, expérience FGC collective.

**Patterns prédictibles de l'IA Bison :**

1. **Teleport trigger** : après 3 reculs en < 2s OU quand cornered sous pression → teleport aléatoire. Préavis 300-500ms.
2. **Psycho Crusher spam** : si Ryu throws fireballs à distance, Bison charge 40 frames puis PC. Détectable dès la 30e frame de charge.
3. **Head Stomp / Devil Reverse** : Bison jump vertical quand Ryu throw fireball ou recule. Très prévisible.
4. **Scissor Kick** : pressure close-range, charge back + forward+kick. Préavis si Bison charge + Ryu near.
5. **Slide** : anti-zoning, déclenché si Ryu throw fireball au sol. Très fast startup (~7 frames) mais précédé de 20 frames de "commit" dans le state.
6. **Corner trap loop** : Bison enchaîne Scissor → Psycho → repeat quand P1 coin.
7. **Knee press on wakeup** : 70% chance post-knockdown P1.
8. **"Bullshit" AI reads** : Bison réagit aux inputs P1 (shoryuken anti-air quasi-garanti si P1 jump-in depuis > 1 char distance).

### 5.4 Output du détecteur

Deux types de streams :

```typescript
// Atomic events (high frequency)
interface Event {
  type: EventType;
  frameIdx: number;
  importance: number;
  payload: Record<string, unknown>;
}

// Macro state transitions (low frequency)
interface StateTransition {
  from: AIMacroState;
  to: AIMacroState;
  triggers: string[];   // ex: ['retreat_x3', 'low_hp']
  predictedNextAction?: {
    action: string;      // 'teleport', 'psycho_crusher', etc.
    confidenceMs: number;
    preNoticeMs: number;
  };
}
```

Le détecteur émet des events atomiques ET des prédictions nommées ("Bison va teleport dans ~500ms").

---

## 6. Couche 3 — Orchestrator

### 6.1 Rôle

Décide **quand** parler et **quoi** envoyer au LLM. Sans cet étage, le coach radote ou se tait mal.

### 6.2 Règles

**Rate limiting :**
- Minimum 3 secondes entre 2 interventions
- Sauf event critique (importance > 0.9 : near_death, round_end, knockdown) → minimum 1s
- Max 1 appel LLM toutes les 2s même si events s'empilent

**Décision de commenter :**
```
shouldSpeak() = (
  time_since_last > minInterval
  && (
    hasImportantEvent(importance > 0.7)
    || hasActionablePrediction(preNoticeMs in [1500, 5000])
    || time_since_last > maxSilence  // break awkward silence
  )
  && !currentlySpeaking
)
```

**Priorité quand plusieurs candidats :**
1. Prédictions pré-emptives (préavis long) — highest
2. Events critiques (knockdown, near_death)
3. Macro state transitions
4. Post-hoc teaching (après 2s de calme)

### 6.3 Anti-répétition

Buffer des **5 derniers commentaires** générés. Passé en contexte au LLM :

> "Previous comments (don't repeat): [...]"

En plus, fingerprint par type d'event + perso. Si "teleport warning" a été prononcé il y a < 10s et que Bison va re-teleport, reformuler différemment ou skip.

### 6.4 Interruption

Si un event critique (near_death, round end) arrive pendant qu'une phrase non-critique est en cours de TTS, **couper le stream audio** et laisser passer l'urgent. Comme un vrai commentateur.

Implémenté via `AudioContext.close()` ou gain=0 avec crossfade 50ms.

---

## 7. Couche 4 — LLM (Claude Haiku)

### 7.1 Modèle choisi

**`claude-haiku-4-5-20251001`** — le plus rapide du line-up, suffisant pour la génération courte. Coût négligeable (~0.0005€/comment).

### 7.2 System prompt (draft)

```
You are an esports fighting game commentator coaching a human player
in real-time during a match of Street Fighter II Hyper Fighting.

The human plays RYU against the CPU-controlled M. BISON (final boss).

You receive structured game events as JSON every few seconds. Your job:

1. PREDICT and WARN about Bison's upcoming actions when patterns emerge
   (e.g. 3 retreats → teleport incoming).
2. Give MACRO strategy advice in the flow of the match
   (e.g. "stay patient, he's whiffing specials").
3. Never describe what just happened frame-by-frame — the viewer already sees it.
4. Never give frame-perfect inputs — you speak slower than the action.
5. You have a hype, energetic, veteran-FGC tone. Short punchy phrases.

CONSTRAINTS:
- Max 12 words per line. Usually 6-8.
- Never repeat a previous comment (shown below).
- Only comment on events provided. No hallucination.
- Use character names: Ryu, Bison. Moves: Hadouken, Shoryuken, Tatsu,
  Psycho Crusher, Scissor Kick, Teleport, Head Stomp, Devil Reverse, Slide.

KNOWLEDGE BASE:
[inject contents of bison.md, ryu.md, sf2hf-mechanics.md here]

OUTPUT FORMAT:
Just the commentary line, no JSON, no markdown, no prefix.
```

### 7.3 User prompt (per tick)

```
RECENT EVENTS (last 5s):
[...events JSON...]

MACRO STATE: Bison is [current state], trend: [approach/retreat/stall]
PREDICTION: [optional: "Bison likely to teleport in ~500ms"]
P1 HP: 80/176, P2 HP: 45/176, Round: 2, Timer: 38

PREVIOUS COMMENTS (do not repeat):
- "He's whiffing fireballs, punish him"
- "Corner him now, he's out of specials"
- "Watch for the teleport"
```

### 7.4 Streaming

Utiliser l'API streaming d'Anthropic :

```typescript
const stream = await anthropic.messages.stream({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 50,
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: userPrompt }],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    ttsClient.pushToken(event.delta.text);
  }
}
```

Les premiers tokens arrivent ~300-500ms après l'appel, et TTS streame en parallèle.

### 7.5 Proxy API

**Ne jamais exposer la clé Anthropic côté browser.** Mettre un petit serveur proxy Node (peut être une Vercel function) :
- POST `/api/coach/generate` → reçoit events JSON → streame SSE depuis Anthropic → relaye au client
- Idem pour ElevenLabs (`/api/coach/tts`)

Quand on passera offline (RPi), remplacer par appel direct à Ollama local.

### 7.6 Prompt caching

Le system prompt + knowledge base est long (~3-5k tokens). Utiliser **prompt caching Anthropic** (TTL 5min) :
- Hit rate attendu : ~95% (un match entier = mêmes prompts)
- Réduction coût : ~90% sur les tokens d'input

---

## 8. Couche 5 — TTS (ElevenLabs)

### 8.1 Voix choisie

Voix preset "esports caster" ou "aggressive male" d'ElevenLabs. À shortlister en test :
- `Brian` — énergique, bon fallback
- `Dan` — plus hype
- `Ryan Kurk` — commentateur-style
- Custom voice clone si besoin d'un ton spécifique (env 30€ one-shot)

### 8.2 Streaming WebSocket

ElevenLabs supporte l'API `/v1/text-to-speech/:voice_id/stream-input` en WebSocket :
- Envoyer des tokens au fil de l'eau depuis le LLM stream
- L'audio sort mot par mot avec ~150-300ms de latence après le premier token
- Format : MP3 ou PCM 16-bit 22050 Hz

### 8.3 Player audio

Web Audio API avec buffer queue :
- `AudioContext` créé à l'init (réutilisé, pas recréé — safari lourd au boot)
- Chaque chunk MP3 décodé en `AudioBuffer` et queued
- Crossfade 30-50ms entre chunks pour éviter clics

### 8.4 Interrupt

`source.stop()` + fade-out 50ms + flush du buffer. Sync avec Orchestrator (couche 3).

### 8.5 Samples pré-générés

Générer en avance (one-shot, au développement) des samples audio pour events 100% prévisibles :

- `round_start_1.mp3` — "Round 1, Fight!"
- `round_start_2.mp3` — "Round 2, let's go!"
- `ko_win_1.mp3` — "You got him! Big win!"
- `ko_win_2.mp3`, `ko_win_3.mp3` — variantes
- `ko_loss_1.mp3` — "Ouch, he got you. Reset."
- `perfect.mp3` — "Perfect! Clean!"
- `near_death_warning.mp3` — "Careful! Low health!"
- Intro match : 2-3 variantes

**Avantage** : zéro latence sur ces moments clés. Jouables instantanément sans appel API.

**Stockage** : 10-20 fichiers, ~500 KB total, bundlés dans le package ou sur CDN.

---

## 9. Couche 6 — UI Overlay

### 9.1 Sous-titres

Overlay DOM au bas de l'écran :
- Font grande (48px), sans-serif, outline noir épais
- Position : bottom-center, 20% height
- Animation : fade-in rapide (200ms), fade-out (500ms) 1.5s après fin de l'audio
- Caractère par caractère ? Ou mot par mot ? → **Mot par mot, synchro avec chunks audio TTS**

### 9.2 Toggle coach on/off

- Bouton dans `controls-bar.ts` : icône micro + label "AI Coach"
- Raccourci clavier : **F6** (pour coacher l'humain, cohérent avec F2/F3/F4/F5)
- État persisté dans localStorage

### 9.3 Debug panel (dev only)

Panel optionnel (`?debug=1` URL param) :
- Timeline des events détectés
- Macro state courant de Bison
- Derniers 5 commentaires
- Latences mesurées (LLM ttft, TTS first audio, total)
- FPS de l'extractor

Utile pour valider que tout fonctionne, à cacher en démo.

---

## 10. Knowledge bases (textuelles)

### 10.1 `bison.md`

```markdown
# M. Bison (Dictator) — SF2 Hyper Fighting

## Specials
- Psycho Crusher (PC): charge back + forward+punch. 40f charge. Full-screen.
- Scissor Kick: charge back + forward+kick. Mid-range pressure.
- Head Stomp: charge down + up+kick. Anti-zoning, jumps over fireballs.
- Devil Reverse: down+up+punch during head stomp. Mixup.
- Teleport: input varies by version. Escape tool.

## AI Patterns (sf2hf CPU)
- Spams Psycho Crusher if P1 throws fireballs at mid-range
- Teleports after 3+ retreats in 2s, or when cornered
- Shoryuken-reads every jump-in from > 1 char distance (not true in sf2hf, it's "slide")
- Head Stomp on every anticipated fireball
- Corner trap: scissor loop until player blocks 3 times, then throw
- Desperation (HP < 20%): aggressive jumps + Psycho Crusher

## Counters (for Ryu)
- Patient footsies: his big hitboxes whiff easily
- Punish whiffed PC: free 40% combo on recovery
- Anti-air Shoryuken on Head Stomp
- Don't corner yourself — his scissor loop is deadly
- Jump-in carefully, use empty jumps to bait AI reads
```

### 10.2 `ryu.md`

```markdown
# Ryu — SF2 Hyper Fighting

## Specials
- Hadouken (fireball): qcf+punch. Zoning tool.
- Shoryuken (uppercut): f,d,df+punch. Anti-air, combo ender.
- Tatsu (hurricane kick): qcb+kick. Approach / cross-up.

## Strengths vs Bison
- Hadouken control at mid-screen
- Crouching MK → Hadouken (footsies extender)
- Strong jump-in with j.HK
- c.MK is a great poke, beats scissor kick low

## Weaknesses vs Bison
- Shoryu whiff = huge punish
- Zoning game weak vs Head Stomp / slide
- Corner means death in sf2hf
```

### 10.3 `sf2hf-mechanics.md`

```markdown
# SF2 Hyper Fighting — General Mechanics

## Frame data approximations
- Shoryuken startup: 5-8 frames
- Psycho Crusher startup: ~10 frames after charge release
- Hadouken startup: 12 frames
- Teleport: ~5 frames startup, invincible

## Round structure
- Health: 176 HP
- Timer: 99 seconds by default
- Perfect: round won without losing HP
- Best of 3 rounds

## Stun / dizzy
- Taking repeated hits builds stun
- Dizzy = free combo window

## Corner
- Death trap vs Bison
- Always prioritize escaping corner
```

**Ces knowledge bases sont injectées dans le system prompt à chaque appel LLM** (mais cachées via prompt caching Anthropic pour n'être tokenisées qu'une fois / 5min).

---

## 11. Planning jour par jour (5j dev + 1-2j polish)

### Jour 1 — Extractor + State history

- [ ] Scaffolder `packages/sprixe-coach/` (package.json, tsconfig, vitest setup)
- [ ] Identifier adresses RAM SF2HF (MAME cheats + MAME debugger pour AI state)
- [ ] Vérifier / étendre l'API RAM de `sprixe-engine` (peek non intrusif)
- [ ] Implémenter `StateExtractor` + types GameState
- [ ] Implémenter `StateHistory` (ring buffer)
- [ ] Tests unitaires sur fixtures RAM
- [ ] **Milestone** : afficher en console le `GameState` à chaque frame pendant un match Ryu vs Bison

### Jour 2 — Pattern detector + events

- [ ] Implémenter détecteurs events atomiques (hp_hit, special_startup, etc.)
- [ ] Implémenter classifier macro-states Bison
- [ ] Implémenter 5-7 patterns prédictifs Bison (teleport_setup, charge_building, etc.)
- [ ] Tests sur enregistrements de match (si on a de l'enregistrement RAM sinon manuel)
- [ ] **Milestone** : console logs des events + state transitions cohérents pendant match

### Jour 3 — LLM + Orchestrator

- [ ] Setup proxy Vercel function `/api/coach/generate`
- [ ] Implémenter `ClaudeClient` avec streaming
- [ ] Écrire knowledge bases (bison.md, ryu.md, sf2hf-mechanics.md)
- [ ] Implémenter `PromptBuilder` (system + user template)
- [ ] Implémenter `Orchestrator` (rate limit, anti-repeat, priority)
- [ ] **Milestone** : en jouant contre Bison, le texte généré par Claude s'affiche en console, cohérent et non-répétitif

### Jour 4 — TTS + audio pipeline

- [ ] Setup proxy Vercel function `/api/coach/tts` (WebSocket ElevenLabs)
- [ ] Implémenter `ElevenLabsClient` (WS streaming)
- [ ] Implémenter `AudioPlayer` (Web Audio queue + crossfade + interrupt)
- [ ] Générer les 10-20 samples pré-générés
- [ ] Intégrer `sample-cache` dans l'orchestrator
- [ ] **Milestone** : en jouant, la voix hype sort du haut-parleur, synchro approx

### Jour 5 — UI + polish + tuning

- [ ] Implémenter `SubtitleOverlay` (DOM, animation)
- [ ] Ajouter toggle F6 + bouton controls-bar
- [ ] Debug panel (`?debug=1`)
- [ ] Tuning prompt : 10-20 passes de test pour affiner le ton
- [ ] Tuning rate limits et thresholds
- [ ] Mesure latences bout-en-bout sur 10 matches
- [ ] **Milestone** : une session 5 min ressemble vraiment à un coach live

### Jour 6-7 — Captation + validation + vidéo

- [ ] Demander à 2-3 joueurs SF2 de tester et feedback
- [ ] Ajuster prompts selon feedback FGC
- [ ] Enregistrer 10-20 prises de match vs Bison en condition démo
- [ ] Sélectionner meilleure prise (critères : victoire + commentaire varié + timings justes)
- [ ] Post-production minimale (titrage intro "commented by Claude in real-time", end card developpement.ai)
- [ ] Export 1080p60 format X/LinkedIn
- [ ] **Milestone** : vidéo finale 60-90s prête à poster

---

## 12. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Adresses RAM AI state non trouvables en 1j | Moyenne | Haut | Fallback sur patterns purement dérivés (retreat count, distance, etc.) — moins fin mais fonctionne |
| Latence Haiku variable (> 1.5s peak) | Haute | Moyen | Buffer + samples pré-gen pour moments clés. Skip comment si trop en retard. |
| Hallucinations Claude (invente un teleport) | Moyenne | Haut | System prompt strict "only comment on events provided", filtrage output, test validation |
| Ton de voix "naze" TTS | Moyenne | Haut | A/B test 3-5 voix ElevenLabs. Si aucune ne va, voice clone custom (30€) |
| Répétitions / radotage | Haute | Moyen | Buffer 5 derniers + fingerprint par type. Si détecté, skip ou rephrase |
| FGC trouve les prédictions fausses | Moyenne | Haut | Validation avec 2-3 joueurs SF2 avant vidéo publique |
| Budget API dépassé en dev | Basse | Bas | Haiku = 0.25€/1M input tokens. Prompt cache → <10€ sur 1000 calls test |
| SharedArrayBuffer / CORS bloque en prod | Basse | Moyen | Déjà géré dans Sprixe (vercel.json COOP/COEP) |

---

## 13. Estimation coûts

**Dev** :
- Haiku tests : ~2000 calls × 2000 tokens avg = 4M tokens × 0.25€/1M = **1€**
- ElevenLabs tests : ~10k chars × 0.15€/1000 = **1.5€**
- Voice clone optional : **30€ one-shot**

**Production démo** :
- 20 prises de match × 30 comments × 40 tokens output = 24k tokens output, 20 × 30 × 200 tokens cached input = ~120k input (post cache). **<1€ total**
- ElevenLabs : 20 × 30 × 8 mots × 5 chars = 24k chars = **4€**

**Total ≈ 10-40€** (hors voice clone custom).

---

## 14. Métriques de succès mesurables

### Technique
- [ ] Time-to-first-sound end-to-end < 1500ms (p50), < 2500ms (p95)
- [ ] Zéro hallucination détectée sur 10 matches
- [ ] Anti-repetition : 0 duplicate dans 20s window
- [ ] Pipeline tient 60fps émulation sans dégrader

### Qualité narrative
- [ ] 3 joueurs SF2 externes valident "oui, ce coach comprend SF2"
- [ ] 5+ patterns Bison différents commentés correctement dans une session
- [ ] Voix perçue "hype esports" et non "TTS classique"

### Démo
- [ ] Vidéo 60-90s capturée en 1 prise
- [ ] Le joueur gagne (ou donne un match serré) grâce au coach
- [ ] Vidéo postée avec tag developpement.ai
- [ ] Engagement cible : 50+ reactions first week (LinkedIn/X)

---

## 15. Hors-scope MVP (roadmap v2/v3)

### v2 (post vidéo, si traction)
- Autres boss (Vega, Sagat, Balrog)
- Autre personnage joueur (Ken, Chun-Li, Guile)
- Localisation FR (voix FR ElevenLabs, prompts traduits)
- UI configuration coach (voix, verbosité, langue)
- Mode "silent coach" (sous-titres only, sans voix)

### v3 (produit vs démo)
- Extension multi-jeux : Metal Slug (patterns boss scriptés), KOF98, Garou
- Mode offline Raspberry Pi (Llama 3 local + Piper TTS)
- Intégration OBS pour streamers
- Replay analysis / post-match breakdown
- Export clips "best moments" auto

### Long terme (si pivot produit)
- SaaS coach multi-jeux pour communauté FGC
- Training mode interactif (pratique de punitions)
- Analyse replays Fightcade

---

## 16. Décisions à valider AVANT le go code

**Questions bloquantes :**

1. **Timing** : on finit `fix/phase-2-real-emulator-wiring` (branche actuelle) d'abord ou on démarre le coach en parallèle dans une nouvelle branche ?
   - Recommandé : finir phase 2 d'abord (dette mentale sinon).
2. **Boss cible confirmé** : Bison ? Ou autre (Vega, Sagat, Balrog) ?
   - Recommandé : Bison pour reconnaissance max.
3. **Voix coach** : Brian / Dan / Ryan Kurk (ElevenLabs preset) ou voice clone custom ?
   - Recommandé : tester les 3 presets d'abord, voice clone si aucun ne va.
4. **Format vidéo final** : toi filmé au pad (incarné, risque humain) ou démo clean screen only (propre, moins chaleureux) ?
   - Recommandé : démo screen only pour v1 (moins de variables à gérer).
5. **Où héberger le proxy API** : Vercel (cohérent avec hosting sprixe) ou autre ?
   - Recommandé : Vercel functions, déjà utilisé.
6. **Compte Anthropic / ElevenLabs** : quelles clés API utiliser ? Créer des clés dédiées à developpement.ai ou réutiliser personnelles ?
   - Recommandé : clés dédiées dès le début pour tracking.

---

## 17. Questions à me reposer après validation

- Faut-il anticiper l'extension à d'autres personnages joueur pour ne pas refactorer plus tard ? Ou hardcoder Ryu pour MVP (recommandé : hardcoder, YAGNI) ?
- Prévoir un mode "training" où le coach explique plutôt que de coacher ? (v2)
- Comment gérer les inputs non-détectables en RAM (ex: inputs charge de Bison avant qu'ils soient "engagés" en state machine) ? → accepter la limite, préavis plus court.

---

**FIN DU PLAN**

À valider avant d'écrire la moindre ligne de code de production. Je peux clarifier n'importe quelle section, ajouter/retirer du scope, ou détailler plus les points techniques flous (adresses RAM exactes à chercher, etc.).
