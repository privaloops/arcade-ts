# Post-mortem — Ken TAS imbattable sur SF2HF

*Sprixe — tentative de décembre 2025 / avril 2026*
*Branche : `worktree-ai-coach-plan`*

---

## TL;DR

On voulait un TAS "imbattable" pour Ken sur Street Fighter II Hyper
Fighting : une IA qui lit la RAM en direct, anticipe chaque commit de
l'adversaire, et punit frame-perfect. Objectif secondaire : un
angle éditorial fort pour un article et une vidéo YouTube.

**Nous n'y sommes pas arrivés.** L'IA produite gère correctement
certaines situations fermées (punish close-range d'un move commis) mais
joue mal le neutral game et se fait battre par un humain qui sait
jouer la distance et le saut. Le travail accumulé reste exploitable
comme perception debug-tool et comme base d'un futur moteur, mais
la livraison initiale est un échec.

Ce document retrace **ce qu'on a tenté, ce qu'on a appris, les pivots,
les pièges, et les reliquats réutilisables**. Il est écrit pour servir
à une future tentative, à un article, ou les deux.

---

## 0. Chronologie complète — 4 jours, 22 commits

Le projet "coach" a traversé **deux pivots majeurs** que la session
que je documente directement (le quatrième jour) n'a pas vécus en
live. Les voici, reconstitués depuis l'historique git et les
messages de commit.

### Jour 1 — 20 avril 2026 : un commentateur live

Trois commits ce jour-là :

- `6bd72f6` — scaffold `@sprixe/coach`, SF2HF RAM extractor, 13
  tests. Memory map validé contre FBNeo sf2hf.ini + MAME RAM
  scanner. Rolling history 5s avec métriques dérivées.
- `4bd04e1` — event detector, macro-state classifier, opponent
  registry. 11 event variants (hp_hit, combo_connect, knockdown,
  corner_trap, etc.). 7 macro-states (zoning, rush, defensive,
  corner_pressure, charge_building, desperation, teleport_setup).
  Knowledge base markdown pour Bison, E.Honda, Ryu. 21 tests
  additionnels.
- `d4d154f` — **intégration Claude Haiku + ElevenLabs TTS**. Un
  commentateur live qui narre le match à l'audience. Dev proxy
  `/api/coach/generate` pour signer les requêtes Anthropic
  côté Node. `CommentOrchestrator` avec gating (min 4.5s, urgent
  1.5s, anti-repetition 6 lines). Subtitle overlay jumbotron-style.
  Support bilingue FR/EN via `?coachLang=fr`.
- `f9f26bf` — ElevenLabs TTS progressive playback + browser-local
  fallback.

**Le projet original n'était donc pas un TAS**. C'était un
**commentateur vocal** : Claude Haiku analyse le match, émet du
texte, ElevenLabs le synthétise en voix, des sous-titres
s'affichent à l'écran. L'angle éditorial initial était "la caster
virtuel qui commente n'importe quel match arcade".

### Jour 2 — 21 avril 2026 : **Pivot 1 — du commentateur au TAS adversaire**

Deux commits ce jour-là :

- `7065556` — policy DSL engine + P2 AI opponent. Introduction
  d'un moteur de politique déclaratif pour piloter P2.
- `810a2c6` — **"TAS opponent tiered policy + drop voice
  commentator"**. Le pivot complet.

Message du commit, traduit : *"Pivot le package sprixe-coach
d'un coach de narration vocale à un TAS-grade AI opponent driving
P2. Tier-based policy avec 19 frame-locked BnB combos, max-damage
deterministic selection, 4 levels (easy/normal/hard/tas), role-
based character moveset."*

Concrètement :
- **Suppression des composants LLM/TTS** : `llm/`, `tts/`,
  `agent/claude-strategist.ts`, `agent/player-profile.ts`,
  `frontend/src/coach/` — tout retiré (-218 lignes dans
  `coach-controller`).
- **Création d'un rule engine tiered** : combo / optimal / passive
  / losing tracks. Dice roll pondéré par difficulté.
- **19 combos BnB** couvrant chaque condition (close/mid/far,
  idle/crouching/attacking, cornered, jump-forward, whiff punish,
  stun TOD).
- **Frame data complète** pour Ryu/Ken, validation au build des
  link windows.
- **Input sequencer + virtual P2 channel** dans sprixe-engine.
- **URL `?ai=1&engine=policy&level=tas`**.
- Blocker connu documenté : *"P2 kicks never reach the game on
  SF2HF — our CPS-B emulation is missing a read path for the IN2
  port"*. Task 21.

Ce pivot est fondateur : le projet passe d'une démo vocale à un
projet de TAS déterministe. La raison probable : le commentateur
marchait mais était peu "viral" — un TAS imbattable est plus
spectaculaire et plus technique.

### Jour 3 — 22 avril 2026 : géométrie ROM + matrice de portée

Cinq commits :

- `4d3929c` — hitbox extraction pixel-accurate depuis la ROM via
  l'indirection deux niveaux (anim_ptr → box ID → hitbox_ptr +
  subtable). Source : Jesuszilla mame-rr-scripts sf2-hitboxes.lua,
  cross-validé FBNeo cheats. Le HUD F7 original naît ici.
- `23cc87c` — geometry-based threat detector : minimum gap
  attackbox adverse ↔ hurtbox Ken. `threat_imminent` quand `gap ≤
  8px`. **Ce seuil reviendra hanter la session du jour 4.**
- `dc2f15f` — cMK-punish feasibility probe : scénario scripté
  (Ryu sweep → Ken fire cMK same frame, log press-to-hit latency).
- `a6f18ee` — **Ken×Ryu punish-range matrix from ROM geometry**.
  Calcul hors-ligne de la distance max centre-à-centre pour chaque
  paire (kenMove, ryuMove). Flag `?dump-ranges=1`. Révèle *"aucun
  move Ken au sol ne punit un shoryuken Ryu"*.
- `601826e` — Ken counter-picker table dérivée de la range
  matrix. Classement par damage tier, speed, cancel, knockdown.
- `5074802` — deterministic Ken counter-AI avec physical distance
  prediction. Smoothed velocity prediction pour positions futures.

### Jour 4 — 23 avril 2026 : la session documentée (l'échec)

Onze commits, tous dans la session que je documente :

- `9eeab0a` — cLK counter-AI live ROM hitbox (tentative de retour
  au test validé "sweep step-by-step").
- `b7b5c08` — perception HUD complet (posture, phase, gaps,
  history).
- `0a73700` — trajectory recorder + 36 trajectoires Ken.
- `aabae5a` — punish hierarchy 14 options.
- `7f67bd1` — simulateur mono-hit + 8 tests.
- `0115671` — moteur de décision + 3 tests.
- `e64ec05` — intégration KenCounterAi → pickPunish.
- `c80b1e9` — mirror jump_back_* trajectories.
- `88b695f` — pre-jump squat modeling.
- `cc856e3` — options jump-in solo.
- `789949e` — **per-frame decision loop avec neutral zone**
  (la tentative finale, qui n'a pas suffi).

---

## 0bis. Contexte stratégique et business

*Source : mémoires projet et échanges réguliers*

### Pourquoi ce projet existe

Sprixe est un produit b2c qui n'a pas encore trouvé son public
auprès des fans rétro (observation documentée en mémoire :
*"Sprixe Edit n'a pas tilté chez les fans retro, éviter
surinvestissement éditeur"*). L'auteur Thibaut Lion a besoin
d'un angle viral grand public, plutôt qu'une évolution interne
du produit.

Deux objectifs visés par le projet coach :

1. **Image société / positionnement `developpement.ai`** — démontrer
   qu'on maîtrise vraiment Claude au-delà d'un simple chatbot.
2. **Vidéo YouTube 60-90s virale** — une prise brute, pas montée,
   où l'IA produite fait quelque chose d'impressionnant.

Pas un pivot produit Sprixe, pas une vente ARTE (qui est client
sur un autre dossier). Un asset de communication.

### Le pivot sous le pivot

En regardant l'historique, le projet a connu **au moins trois
pivots d'objectif**, pas un seul :

1. **Commentateur vocal** (20 avril) — narrateur qui décrit le
   match à l'audience. *"Ryu lance un hadouken"* — jugé ensuite
   "naze, on voit déjà ce qui se passe" en mémoire.
2. **Coach humain** (planifié 20-21 avril) — une IA qui **aide
   le joueur Thibaut à gagner** contre Bison. Pitch : *"AI who
   reads the fight like a veteran coach and calls another AI's
   patterns"*. Jamais implémenté à cause du pivot suivant.
3. **TAS adversaire** (21 avril, commit `810a2c6`) — l'IA
   **devient** l'adversaire, pilote Ken contre le joueur. Un TAS
   "imbattable". C'est le projet de la session que je documente.

Le pivot 1 → 2 avait une justification solide (*"latence joue EN
FAVEUR (prédictif = 500ms avant l'action), pitch vendable"*). Le
pivot 2 → 3 n'est pas documenté dans les mémoires — il a eu lieu
entre le plan et l'implémentation, probablement parce que "une IA
qui bat un humain" sonne plus viral que "une IA qui aide un
humain".

### Les lignes rouges apprises en cours de session

Plusieurs contraintes méthodologiques sont apparues dans cette
session (et sont maintenant mémorisées) :

- **ALWAYS follow mdma workflow steps, no shortcuts even for tiny
  changes** (constant reminder après que j'aie sauté plusieurs
  fois la phase de plan / review / test).
- **NEVER guess hardware — read FBNeo/MAME source FIRST, translate
  don't interpret**. Rappelé après ma tentative ratée de deviner
  le signe des reach sans dumper empiriquement.
- **NEVER code when user is just talking, wait for explicit go**.
  Conseil après plusieurs itérations où j'ai anticipé le code
  avant la validation utilisateur.
- **NEVER commit/merge before user has tested — wait for explicit
  "commit"**. Évite les commits prématurés qui masquent des bugs
  non testés.
- **AI fighter policies: cap weights at 0.30 and always include
  punish options alongside defense**. Apprentissage du jour 2 sur
  l'équilibrage tier-based.
- **Check obvious causes (paths, config) before deep code
  analysis**. Apprentissage après une session où j'ai investigué
  un bug de code qui était en fait un problème d'URL.

Ces règles ne sont pas anecdotiques. Plusieurs des frictions de la
session ont été le résultat direct de leur non-respect par
l'assistant (moi).

---

## 1. Contexte et ambition initiale

### Le projet Sprixe

Sprixe est un studio arcade CPS1 browser-based, TypeScript strict +
WebGL2 + WASM audio. Son cœur technique — M68000 + Z80 interpreter,
Nuked OPM FM en WASM, CPS1 video pipeline — est déjà en production.
41 GameDefs arcade, 245 jeux catalogués. Une brique exceptionnellement
capable pour un projet web.

Sur cette base, l'ambition : construire **un TAS Ken vs Ryu
"imbattable"**. Autrement dit une IA qui pilote P2 (Ken), lit l'état
du jeu en RAM à chaque vblank, et fait des choix frame-perfect.

### Pourquoi c'était attirant

- Toute la plomberie existait : state extractor SF2HF, hitbox/hurtbox
  extraction pixel-accurate depuis la ROM, virtual-P2 input channel
  pour piloter Ken sans clavier, flag URL dédié (`?ai-counter=1`).
- Un article ou une vidéo "j'ai construit une IA qui bat n'importe
  quel joueur sur le jeu de combat le plus iconique de l'histoire"
  est un angle grand public accessible.
- Plus profondément : l'auteur voulait démontrer que le produit
  Sprixe peut servir de plateforme pour des démos techniques ambitieuses.

### Ce qu'on n'a pas chiffré au départ

- Le coût réel d'un neutral game (décider quoi faire quand personne
  n'attaque).
- L'asymétrie entre punir (tâche bornée, géométrique) et jouer
  (tâche ouverte, stratégique).
- La quantité de données calibrées nécessaires quand aucune source
  externe n'est disponible (pas de frame-data public complet pour
  SF2HF, pas de TAS inputs publics accessibles, etc.).

---

## 2. Architecture conceptuelle — comment on a pensé le problème

### Modèle mental initial

Un jeu de combat 2D comme SF2HF est un système déterministe à
information parfaite. La RAM à chaque frame encode **tout** l'état
pertinent : positions, animPtrs, hitboxes actives, recovery flags,
HP. La ROM encode toutes les animations possibles sous forme de
tables (24 bytes par frame d'animation). Un TAS humain tune
manuellement ses inputs contre une IA CPU déterministe.

Si on a la RAM **et** la ROM **et** l'entrée Ken, on devrait pouvoir :
1. Détecter l'état courant.
2. Calculer la meilleure action possible.
3. L'exécuter avant que l'adversaire ne puisse réagir.

Cette intuition est correcte. Elle mène à l'architecture :

```
                    ┌──────────────────┐
    vblank  ─────►  │ state-extractor │  → GameState
                    └──────────────────┘        │
                                                ▼
                    ┌──────────────────┐
                    │  decision engine │  → ActionId
                    └──────────────────┘        │
                                                ▼
                    ┌──────────────────┐
                    │ input-sequencer  │  → virtual P2 channel
                    └──────────────────┘
```

### Ce qui a mené à se casser les dents

La **decision engine** est la boîte noire. Dire "calculer la meilleure
action possible" suppose qu'on a défini :

1. Un **catalogue d'actions** disponibles pour Ken.
2. Un **modèle** qui évalue l'issue probable de chaque action.
3. Une **fonction d'utilité** qui transforme les issues en un score
   comparable.
4. Une **politique de choix** (maximisation, sampling, etc.).

Chacun de ces points s'est révélé plus dur que prévu.

---

## 3. Chronologie des tentatives et pivots

### Tentative 1 — La matrice de portée (pre-session)

**Approche** : pour chaque paire (kenMove, ryuMove), précalculer la
distance maximale à laquelle Ken peut toucher Ryu. Stocker dans une
table statique. À chaque trigger (Ryu attaque), chercher la meilleure
option dans la table.

**Ce qui a cassé** :
- La matrice est quasi-identique pour tous les ryuMoves, parce que
  les hurtboxes de Ryu convergent (head, body, legs ont des reach
  similaires peu importe l'animation).
- Résultat : le moteur pick toujours les mêmes options (shoryu_fierce
  en tête parce que damage × speed × knockdown).

**Pivot** : scoring contextuel avec bans (DP bannie contre normaux
groundés). Ça a produit de la diversité mais au prix d'ajouts de
règles ad-hoc qui ne scalent pas.

### Tentative 2 — Le bug de signe imaginaire

**Hypothèse** : j'ai soupçonné que la formule `hitDistForPair` avait
un bug de signe asymétrique (Ken face-left vs Ryu face-right).

**Vérification empirique** (demandée par l'utilisateur, pas par moi) :
via `dumpPairDetail`, les reaches étaient positifs des deux côtés.

**Leçon** : je me suis accroché à une hypothèse mathématique
intuitive mais fausse. L'utilisateur a insisté pour valider par
observation avant de patcher. Sans cette insistance, j'aurais
introduit un vrai bug en voulant en corriger un imaginaire.

### Tentative 3 — Le counter-AI géométrique live

**Pivot** : abandonner la matrice précalculée, calculer **live** à
chaque frame la proximité attackbox adverse ↔ hurtbox Ken. Si
`gap ≤ 8px`, déclencher la réponse.

**Origine** : un test validé par l'utilisateur des mois plus tôt.
Un principe simple :
> "Je faisais un sweep par étape en avançant doucement et quand le
> hitbox était atteinte Ken envoyait systématiquement un petit coup
> de pied bas qui annulait le sweep et me touchait."

**Ce qui a cassé** :
- Reproduire le scénario originel : la fenêtre `gap ≤ 8` n'est
  jamais atteinte dans le jeu réel parce que l'attackbox de Ryu
  apparaît à une position fixe pendant l'active phase (Ryu ne bouge
  pas pendant son sweep), et cette position est soit trop loin
  (gap=16 stable, whiff) soit déjà en overlap (-5, trop tard).
- Le principe marche dans un scénario contrôlé où l'humain avance
  pixel par pixel, pas dans un jeu normal.

**Leçon** : un test "qui marchait" dans des conditions spécifiques
ne généralise pas. L'utilisateur se souvenait d'un succès mais pas
des conditions précises qui produisaient ce succès.

### Tentative 4 — Le LLM comme coach offense (abandonné)

**Pivot** : puisque la logique géométrique est complexe à régler,
déléguer la décision à Claude. Un appel API toutes les 800 ms, prompt
minimal avec l'état courant, réponse sous forme d'action.

**Infrastructure** :
- `ken-offense-llm.ts` avec polling consécutif
- Proxy dev `/api/coach/generate` dans `vite.config.ts`
- Sonnet 4.6 puis bascule Haiku 4.5 pour latence

**Ce qui a cassé** :
- Latence API réelle : 1.5 à 3.5 secondes (Sonnet), 400-700 ms
  (Haiku). Trop pour du jeu 60Hz.
- Les décisions arrivent obsolètes : "Ryu airborne in recovery,
  anti-air" alors qu'il a déjà atterri et relancé un hadouken.
- Spam répétitif du LLM (3 hadoukens d'affilée "zone from safe
  distance") sans adaptation à l'évolution du match.

**Citation utilisateur** : *"concept qui pue la merde"*.

**Leçon** : la latence LLM est incompatible avec la réactivité 60Hz
d'un fighting game, même pour une offense "macro". La décision doit
être locale, déterministe, microseconde-level.

### Tentative 5 — Le retour aux bases : perception avant décision

**Pivot conceptuel (demandé par l'utilisateur)** : "On ne peut pas
décider juste sans avoir une perception juste."

Construction d'un **HUD de debug** qui affiche en overlay sur le
jeu, frame par frame, tout ce que l'IA "voit" :

- Position (x, y ground-relative)
- Posture dérivée (idle / walk+ / walk- / crouch / attacking /
  special / hurt / block / airborne neutral|directional)
- Raw stateByte, yoke
- animPtr en hex, move name (quand connu)
- dx signé (vitesse horizontale)
- Phase du move en cours (startup / active / recovery) + frames
  écoulées / total
- `recov_left` : frames restantes avant que l'adversaire puisse agir
- Géométrie live : dist centre-centre, pushGap, attackbox vs hurtbox
- Historique 5 derniers moves par joueur

**Ce qui a marché** : 5 étapes validées visuellement, une par une,
sans avancer tant que l'utilisateur ne confirmait pas pixel-par-pixel.
Fin : **perception complète à pixel près**.

**Leçon majeure** : avant de construire un module de décision,
valider que le module de perception est fiable à 100%. Si l'IA
"voit" faux, elle décide faux. Cette phase a aussi produit la
**découverte inattendue** que `stateByte=0x02 = crouch` en SF2HF
(le code extractor supposait 0x02=walk, ce qui était faux).

**Commit** : `b7b5c08 — feat(coach): pixel-accurate perception HUD`

### Tentative 6 — Capture des trajectoires Ken

**Objectif** : pour que l'IA simule "si je fais cMK maintenant, où
sera mon attackbox à chaque frame ?", il faut une table
frame-par-frame de la trajectoire de chaque move Ken (dx, dy,
attackbox, hurtboxes, pushbox).

**Approche** : un `KenTrajectoryRecorder` qui observe Ken pendant
qu'il exécute chaque move, enregistre la trajectoire relative à
l'anchor de début de move, produit un JSON.

**Pipeline** : réutiliser `KenCalibrationPilot` (pilote auto
existant) pour enchaîner les 42 moves du catalogue automatiquement.
Le recorder capture en parallèle. À la fin, `copy(window.__kenTrajectories)`
et paste dans `ken-trajectories.json`.

**Problèmes rencontrés, dans l'ordre** :

1. Le recorder ratait 38/42 moves au premier essai : l'`animPtr`
   au rising edge de `stateByte=0x0A` est souvent transient. Le jeu
   settle sur le vrai startup animPtr quelques frames plus tard.
   → Fix : démarrer la capture en "name pending", fixer le nom dès
   qu'un animPtr catalogué apparaît, re-anchor frame 0 à ce moment.

2. Le pilote plantait Ken dans les coins de stage (back jumps le
   poussent contre le mur). Trajectoires tronquées, hurtboxes
   faussées.
   → Fix : walk de repositionnement avant chaque move si Ken trop
   près d'un bord (x < 200 ou x > 800).

3. Ryu (CPU) interrompait Ken pendant sa capture — hit, cross-up,
   side switch. Les trajectoires subsequences étaient corrompues.
   → Fix : détection de poison (Ken passe en stateByte 0x0E ou
   facingLeft change mid-capture), capture invalidée, pilot retente
   au prochain round.

4. Le timer du round ne permettait pas 42 moves en un seul round
   (42 moves × ~4s = 168s vs 99s max par round SF2HF).
   → Fix : reprise multi-rounds via `window.__kenTrajectories`. Le
   pilot skip les moves déjà capturés.

5. Ryu CPU se baladait partout, rendait les captures erratiques
   même avec les fixes 1-3.
   → Fix final : **training-mode emulation en RAM**. Ryu pinned à
   x=100, stateByte=0x00, attacking=0. On écrase ces valeurs chaque
   vblank avant extraction. Le 68K tente de les modifier, on le
   corrige. Résultat : Ryu immobile, Ken opère dans un stage vide.

6. Ken back_jump avait encore des cas où il touchait le mur droit.
   → Fix : anchor Ken à x=300 spécifiquement avant les `jump_back_*`,
   x=500 partout ailleurs.

7. `jump_back_*` et `jump_forward_*` partagent le même animPtr
   startup en SF2HF (l'animation est identique, seule la vitesse x
   diffère). Le recorder écrasait la trajectoire forward avec la
   back.
   → Fix : refuser l'écrasement. Les back-jumps sont reconstruits
   au moment de la simulation en miroitant `dx`.

**Livrable final** : 36 trajectoires Ken propres, frame-par-frame,
dans `ken-trajectories.json`.

**Leçon** : la capture "simple" d'animations de jeu est remplie de
pièges système. Chaque fix résout un symptôme et en révèle un autre.
Le training-mode-emulation (écraser la RAM de l'adversaire chaque
frame) est un hack qui a sauvé le workflow.

**Commit** : `0a73700 — feat(coach): Ken trajectory recorder + 36 moves`

### Tentative 7 — Hiérarchie + simulateur + moteur de décision

Une fois la perception et les données en place, la chaîne de décision
a été construite en trois paliers testables isolément :

**P1 — Hiérarchie des options (`ken-punish-hierarchy.json`)** :
14 options classées par damage descendant, de `combo_jhp_chp_dpHP`
(50 damage) à `defend_block_crouch` (0 damage). Fichier hand-editable.
Chaque option : `id`, `sequence` (ActionIds), `damage`, `notes`.

**P2 — Simulateur d'interception (`punish-sim.ts`)** :
fonction pure `simulateOption(option, opponent, ken, trajectories, rom)`
qui :
- Charge la trajectoire Ken du move.
- Pour chaque frame active Ken, projette l'attackbox sur la position
  courante (avec facing flip), résout les hurtboxes opponent via
  `resolveBoxFromRom` à l'animPtr + N × FRAME_STRIDE, test AABB
  overlap.
- Symétriquement, check si l'attackbox adverse touche Ken pendant
  les frames de startup.
- Retourne `{ connects, connectFrame, kenDamageTaken, reason }`.

Scope v1 : mono-hit. Combos (`sequence.length > 1`) deferred à P3.
Block / pure evasion traités comme cas spéciaux.

8 tests unitaires : connect-in-range, whiff, trade, block, evasion,
combo-deferred, unknown-move, symmetric reach.

**P4 — Moteur de décision (`punish-engine.ts`)** :
`pickPunish(opponent, ken, rom)` parcourt la hiérarchie, appelle
`simulateOption` pour chaque option, rejette celles qui tueraient
Ken (death-guard), classe par `deltaHp = damage_inflicted -
damage_taken` descendant, retourne la meilleure.

3 tests unitaires supplémentaires.

**P5 — Intégration (`KenCounterAi`)** :
Remplacement de la logique géométrique ad-hoc par un thin orchestrator
autour de `pickPunish`. Trigger initial : rising edge sur
`stateByte ∈ {0x0A, 0x0C}`. Bug : le transient animPtr au premier
frame faisait que `actionForAnimPtr` retournait null et Ken ratait
le move entier (pas de retry).

**Commits** : `aabae5a`, `7f67bd1`, `0115671`, `e64ec05`.

### Tentative 8 — Les fixes tactiques (mirror jump_back, pre-jump squat, jump-in solo)

Tests en jeu → l'IA choisissait `evade_jback` (deltaHp=0) au lieu
d'options offensives. Trois bugs identifiés :

1. **jump_back_hk** n'avait pas de trajectoire (dédupliqué). Le
   simulator renvoyait "no trajectory" → option rejetée.
   → Fix : aliasing `jump_back_X` → `jump_forward_X` avec
   mirroring de `dx`. Commit `c80b1e9`.

2. **Pre-jump squat** non modélisé : le simulator pensait Ken en
   l'air dès `t=LATENCY`, mais SF2HF ajoute ~3 frames de squat au
   sol avant le décollage réel. Un jump_back évaluait
   `kenDamageTaken=0` alors que Ryu sweep touchait Ken pendant son
   squat.
   → Fix : `JUMP_PREJUMP_FRAMES=3`, hurtboxes idle hardcodées
   pendant ce window. Commit `88b695f`.

3. **Options jump-in solo** manquaient dans la hiérarchie. Ken
   n'avait aucune façon de considérer `jump_forward_hk` par-dessus
   un hadouken lointain.
   → Fix : ajout `solo_jfwd_hk`, `solo_jfwd_hp`, `solo_jfwd_mk`
   dans le tier mono-hit. Commit `cc856e3`.

### Tentative 9 — Le pivot neutral game

**Constat en jeu** : Ken joue bien dans une zone étroite (punish
close-range d'un commit). Dès que l'utilisateur ne commit rien et
avance, Ken reste idle. Dès que l'utilisateur commit loin, Ken
whiff tout.

**Diagnostic** : le moteur est **purement réactif**. Son unique
trigger est le rising edge sur `stateByte ∈ {0x0A, 0x0C}`. Tant
que l'adversaire walk / crouch / stand, Ken attend.

**Pivot architectural** : retrait du rising edge. Décision à
**chaque frame** où Ken peut agir (idle + cooldown écoulé +
sequencer libre). Deux branches :

- **PUNISH mode** : si l'adversaire commit, `pickPunish` comme avant.
- **NEUTRAL mode** : hadouken à distance (dist > 120), idle sinon.

**Commit** : `789949e — feat(coach): per-frame decision loop with
neutral zone behaviour`.

### Tentative 10 — Le test final

L'utilisateur teste. Ken spam des hadoukens à distance, l'utilisateur
encaisse et prend un KO. Mais l'utilisateur finit par sauter
par-dessus et punir Ken.

**Cette dernière itération est à la fois un succès partiel et
l'échec qui a mené à l'abandon** :
- Succès : Ken n'est plus passif, il zone agressivement.
- Échec : l'anti-air ne se déclenche pas correctement quand
  l'adversaire saute par-dessus. Ken ne DP pas. Il se fait frapper
  gratos.

**Citation utilisateur** : *"ah non non il a bombardé de boules il
m'a saoulé j'ai même été KO. mais j'ai sauté au dessus je l'ai eu"*.

**Diagnostic** : le rising edge sur `isAirborne` devait déclencher
un shoryu_fierce anti-air via la branche PUNISH. Plusieurs causes
possibles sans que nous ayons pu vérifier :
- Trigger pas armé (notre nouvelle boucle per-frame ne considère
  pas explicitement `isAirborne` comme attack state).
- Shoryu picked mais whiff (géométrie aérienne mal simulée).
- Cooldown en cours au moment du saut.

---

## 4bis. Découvertes techniques SF2HF-spécifiques

Au fil des 4 jours, plusieurs faits techniques non documentés dans
les sources publiques ont été vérifiés empiriquement. Ils ont
leur valeur archéologique :

### Memory map validé

- `p1_hp` word à `0xFF83DC` (initial commit `6bd72f6`).
- `p1_state` byte à `0xFF83C1`. Codes observés : `0x00` idle,
  `0x02` **crouch** (non documenté ailleurs — on pensait que
  c'était walk), `0x04` airborne, `0x0A` normal attack, `0x0C`
  special attack, `0x0E` hurt, `0x14` throw.
- `p1_anim_ptr` DWORD BE à `0xFF83D8`. **Signature canonique du
  move courant** (il n'y a pas d'octet move-ID séparé).
- `p1_attacking` flag à `0xFF8549` — seulement levé pendant
  l'active phase de certains moves, **pas pour les normaux au
  sol** (découvert jour 4). Donc ne pas l'utiliser comme trigger.
- `p1_pos_y` signed word à `0xFF83C8`. Y math convention (grow
  up). Idle au sol = ~40.
- `p1_flip_x` byte à `0xFF83D0`. 0x01 = facing left.
- `p1_hitbox_ptr` DWORD BE à `0xFF83F2` — pointeur ROM vers la
  table des hitbox subtables.
- `camera_x` signed word à `0xFF8BC4`.

### Pièges empiriques

- **Le byte `max_hp`** (censément à `0xFF83EA`) contient des
  garbage. Le commit `d4d154f` documente la correction :
  hardcoder `MAX_HP = 144` (vrai pour tous les personnages SF2HF).
- **Le byte à `player_base+0xA`** (anciennement appelé
  `p1_y` dans le legacy mapping) est en fait une **anim byte**,
  pas un compteur de hauteur de saut. On garde `animState` pour
  compatibilité mais `y = 0` tant qu'on n'a pas le vrai.
- **`round_number` et `round_phase` addresses inconnues**.
  Commit `d4d154f` les marque `todo` et retourne des valeurs par
  défaut safe pour ne pas triggerer `round_start` sur 0xFF.
- **Les animPtrs ne sont pas linéaires** par `+0x18` (stride).
  Certaines anims tiennent le même animPtr pendant plusieurs
  vblanks (découvert jour 4 pendant la capture des trajectoires
  Ken). Stride linéaire ≠ timeline réelle. Ça justifie la capture
  live frame-par-frame.
- **`jump_back_*` et `jump_forward_*` partagent le même
  animPtr startup**. Le catalogue map les deux sur le même nom.
  Différenciation par vitesse x uniquement.

### Le blocker CPS-B IN2 port

Documenté par commit `810a2c6` : **"P2 kicks never reach the
game on SF2HF"**. La ROM ne lit jamais l'adresse `0x800176`.
Probablement une read path manquante dans notre émulation
CPS-B pour le port IN2 (kicks P2).

Ce blocker n'a pas été résolu. Les kicks P2 via virtual-P2
channel ne fonctionnent pas (ou pas bien). Le workaround a été
de privilégier les moves à base de punches pour le coach, mais
ça limite le répertoire.

Je n'ai pas vu confirmation que ce bug est fixé. Tout TAS
offensif Ken qui utilise des kicks (crouch_mk, sweep, standing_rh)
pourrait ne pas exécuter correctement en pratique. **À vérifier
en priorité** si quelqu'un reprend le projet.

### Hitbox system

- Chaque frame d'animation fait 24 bytes (`FRAME_STRIDE = 0x18`).
- Offsets internes (source : Jesuszilla) :
  - `+0x08` head hurt ID
  - `+0x09` body hurt ID
  - `+0x0A` legs hurt ID
  - `+0x0C` attack ID (12-byte entries, contre 4-byte pour hurts)
  - `+0x0D` push ID
  - `+0x11` block type (0=none, 1=stand, 2=crouch)
  - `+0x13` posture (0=standing, 1=crouching)
  - `+0x16` yoke2 (0=startup/active, 1=recovery)
  - `+0x17` yoke (0xFF stand/walk, 0x17 neutral jump, 0x06 dir
    jump, autre = attack-specific)
- Les subtables sont dans la ROM à `hitbox_ptr + offset` où
  l'offset est lu comme signed word à `hitbox_ptr + addrTable`.
- Un box = 4 bytes : `val_x` (i8), `val_y` (i8), `rad_x` (u8),
  `rad_y` (u8). Sauf l'attackbox, 12 bytes (dont `val_x val_y
  rad_x rad_y` dans les 4 premiers).

### Le 68K est mutable depuis notre code

Découverte du jour 4 : `host.getWorkRam()` retourne une
`Uint8Array` qui est **la vraie** RAM partagée avec
l'émulateur. Écrire dans cette array modifie l'état du 68K.
Conséquences pratiques :

- On peut **figer** un personnage (write stateByte=0x00 et x=100
  chaque vblank). Le 68K le modifie au tick suivant, on l'écrase
  au vblank suivant. Training-mode gratuit.
- On peut **téléporter** Ken entre les moves. Utilisé pour la
  calibration trajectoire.
- **Mais** si on pousse trop agressivement (trop de fields,
  flags système), le jeu peut freezer ou glitcher. Tester
  incrémentalement.

---

## 4. Ce qui a marché — les vrais gains durables

Malgré l'échec de la livraison "Ken imbattable", plusieurs briques
produites sont solides et réutilisables :

### a) Le HUD de perception

Panneau overlay pixel-accurate qui expose tout l'état du jeu
frame-par-frame. Utile pour **tout** futur reverse engineering
SF2HF : hitboxes, phases, recovery, historique des moves. Activable
par F7 en jeu. Robuste, maintenu, documenté.

### b) Les 36 trajectoires Ken calibrées

Un JSON de ~35 000 lignes qui contient, pour 36 moves Ken, chaque
frame de la trajectoire (dx, dy, attackbox, hurtboxes, pushbox).
Aucune source publique n'avait ces données. C'est un **asset
indépendant** qui peut alimenter d'autres projets (analyse frame
data, tools de TAS traditionnels, bots de training).

### c) L'infrastructure de capture

`KenTrajectoryRecorder` + `KenCalibrationPilot` avec training-mode
emulation (Ryu pinned en RAM). Adaptable à d'autres personnages ou
jeux avec peu de modifications. Le pattern "écraser les fields
P1 chaque vblank pour figer l'opposition" est généralisable.

### d) Le simulateur d'interception

`simulateOption` — fonction pure, testée, qui répond à "si Ken
fait X à l'instant T0, que se passe-t-il ?" via simulation AABB
sur N frames. Utilisable pour :
- Analyse frame-by-frame de matchups.
- Tooling de TAS humain (vérifier qu'un combo théorique connecte).
- Base d'un futur moteur plus sophistiqué.

### e) Le hitbox overlay debug

Activable F7. Affiche toutes les hitboxes/hurtboxes/pushboxes en
live. Outil de référence pour tout débogage SF2HF futur.

### f) Les pivots méthodologiques

Plusieurs leçons transposables à d'autres projets d'IA de jeu :

1. **Perception avant décision**. Construire un HUD de debug avant
   le moteur de décision. Si on décide faux, il faut savoir si
   c'est parce qu'on voit faux ou parce qu'on raisonne faux.

2. **Pures functions + tests unitaires**. `simulateOption` est pure
   et testée ; `pickPunish` est pure et testée. Chaque bug en
   production peut être reproduit en 10 lignes de TS.

3. **Training-mode emulation**. Geler l'adversaire en RAM pour
   capturer des données propres, au lieu de dépendre de
   save-states externes.

4. **Alias géométrique**. `jump_back_X` = `jump_forward_X` avec
   `dx → -dx`. Reconnaître ces symétries évite des captures
   redondantes.

---

## 5. Ce qui n'a pas marché — les pièges concrets

### a) La sous-estimation du neutral game

Le vrai piège. On a construit un **punisher**, pas un **joueur**.
Les deux ne sont pas équivalents.

- Punir : bornée, géométrique, calculable (l'adversaire est dans
  un move connu, nous avons des options quantifiables).
- Jouer le neutral : ouverte, stratégique, méta (décider quoi faire
  quand personne ne commit, anticiper les baits, lire l'adversaire).

Notre hiérarchie de 14 options est une hiérarchie de **punition**.
Un vrai joueur a une autre hiérarchie pour le neutral (hadouken
zoning, cMK whiff-bait, walk forward into throw range, etc.). On
n'a jamais construit cette seconde hiérarchie.

### b) La latence LLM est fatale à 60Hz

400-700 ms minimum pour Haiku. Le temps que la décision arrive,
l'état du jeu a complètement changé. Le LLM suggère un anti-air
sur un adversaire qui a déjà atterri et relancé un hadouken.

La latence LLM convient à des décisions **stratégiques** (macro,
secondes à minutes) mais pas à du **tactique** (réactions 1-20
frames).

### c) Les données propres demandent plus de travail que prévu

Capturer 36 trajectoires Ken propres a demandé 7 rounds d'itération
sur le pipeline de capture, avec 7 bugs successifs. Chaque fix
exposait le suivant. Sans le training-mode-emulation final, le
workflow aurait été impraticable.

Leçon : **budgeter le temps de data-capture** en fighting games
est difficile. Les animations non-linéaires, les interactions
adverses, les bordures de stage, tout conspire à produire des
données sales.

### d) La hiérarchie de damage pur est trompeuse

Notre premier moteur `pickPunish` classait par damage descendant.
Shoryu fierce (21) picked en priorité. Mais **shoryu whiff =
-30 HP à l'adversaire qui punit**. En neutral le shoryu est une
**très mauvaise option**.

La bonne métrique n'est pas damage infligé mais **deltaHP
contextuel** : damage infligé moins risque d'être puni, modulé
par position (cornered / midscreen), HP lead, timer.

On a corrigé partiellement avec le death-guard et le delta_HP, mais
la notion de "safe on whiff" n'est toujours pas encodée.

### e) Le trigger rising-edge rate les fenêtres critiques

Au rising edge `stateByte → 0x0A`, l'animPtr est souvent transient.
`actionForAnimPtr` renvoie null. Notre code return → on perd le
trigger pour toute la durée du move adverse (plus de rising edge
avant la fin du move). Ken rate un punish entier.

Fix passé : démarrer la capture en mode "name pending" et setter
le nom dès qu'un animPtr catalogué apparaît. Mais la même logique
doit être appliquée côté décideur — ce qu'on n'a pas fait en P5.

### f) Le dialogue utilisateur/assistant a dérivé

Plusieurs fois pendant la session, j'ai :
- Proposé des plans à trois options quand l'utilisateur voulait
  juste une action.
- Spéculé au lieu de vérifier empiriquement.
- Multiplié les questions au lieu d'agir.
- Raisonné en chiffres pour justifier un comportement décevant.
- Dépassé les 25-100 mots de limite de réponse à de multiples reprises.

L'utilisateur a dû me recadrer plusieurs fois :
- *"on est déjà passer par cette phase sans succès"*
- *"arrête avec tes question on dirait un intrrogatoire de police"*
- *"ne t'excite pas on discute restons calme"*
- *"putain mais ca marche pas j'en ai marre"*

Une part non négligeable de la friction venait de mon style de
réponse, pas de la difficulté technique. Un collaborateur humain
aurait probablement livré plus vite en étant plus sec.

### g) Abandon d'une piste avant validation

La tentative LLM a consommé du temps pour aboutir à un
désengagement rapide. Les fichiers créés (`ken-offense-llm.ts`,
proxy dev `/api/coach/generate`) sont dans le code source mais
non utilisés. C'est de la dette technique qui n'a pas été
nettoyée avant de passer à autre chose.

---

## 6. La leçon conceptuelle centrale

**Un fighting game AI n'est pas une fonction `state → action` pure.**

C'est un système à **plusieurs régimes** :

1. **Réflexe** (1-5 frames) : anti-air DP, reversal, tech d'un
   throw. Quasi-instantané, géométrique, punit un commit adverse.
2. **Punish** (5-30 frames) : enchaînements contre une recovery,
   tilting, hit confirm. Exige connaissance des link windows et
   des cancel rules.
3. **Footsie** (30-180 frames) : whiff punish, poke baiting, walk
   pressure. Exige un modèle probabiliste de l'adversaire.
4. **Meta** (180 frames - round entier) : préserver le HP lead,
   pousser au coin, brûler le timer. Exige une vision stratégique
   du match.

Notre moteur couvre niveau 1 (partiellement, anti-air fail) et
niveau 2 (punish close-range OK). Niveaux 3 et 4 absents.

**Un TAS humain** couvre les 4 niveaux en faisant des choix
manuels pour chacun. **Un bot scripté** (FightCade random CPU)
couvre les 4 niveaux avec des tables ad-hoc encodées par le
développeur. **Un humain en live** les couvre par intuition et
lecture de l'adversaire.

Reproduire automatiquement les 4 niveaux, sans une source externe
(dataset de replays, TAS input files publics, etc.), est un
projet qui dépasse largement le scope de "une démo pour un article".

---

## 7. Reliquats utilisables et état de la branche

### Sur la branche `worktree-ai-coach-plan`

**Commits principaux, dans l'ordre** :

```
b7b5c08 — HUD perception (5 étapes validées)
0a73700 — recorder + 36 trajectoires
aabae5a — hiérarchie 14 options
7f67bd1 — simulateur mono-hit + 8 tests
0115671 — moteur de décision + 3 tests
e64ec05 — intégration KenCounterAi
c80b1e9 — mirror jump_back
88b695f — pre-jump squat modeling
cc856e3 — options jump-in solo
789949e — per-frame decision loop + neutral zone hadouken
```

**Fichiers clés produits** :

- `packages/sprixe-frontend/src/engine-bridge/hitbox-overlay.ts` —
  HUD F7 complet.
- `packages/sprixe-coach/src/agent/tas/ken-trajectory-recorder.ts`
  et `ken-trajectories.json` — recorder + données.
- `packages/sprixe-coach/src/agent/tas/punish-sim.ts` — simulateur
  pure (testé).
- `packages/sprixe-coach/src/agent/tas/punish-engine.ts` — moteur
  de décision (testé).
- `packages/sprixe-coach/src/agent/tas/ken-punish-hierarchy.json`
  — hiérarchie éditable.
- `packages/sprixe-coach/src/agent/tas/ken-counter-ai.ts` — bridge
  per-frame loop.
- `packages/sprixe-coach/src/agent/tas/calibration-pilot.ts` —
  pilote auto de capture (training-mode-emulation inside).

**Fichiers de code mort / à nettoyer** :

- `packages/sprixe-coach/src/agent/tas/ken-offense-llm.ts` — LLM
  tentative abandonnée.
- `packages/sprixe-coach/src/agent/tas/ken-vs-ryu-counters.ts`,
  `move-range-matrix.ts` — restes des premières tentatives, plus
  utilisés par le pipeline courant mais encore testés.

**Tests** :

```
npx vitest run punish   # 11 tests pass
```

---

## 8. Recommandations pour une future tentative

Si quelqu'un (l'utilisateur dans quelques mois, un contributeur,
un fork) veut reprendre :

### Option A — Scope étroit mais fini : le "Master Punisher"

**Objectif** : un bot qui **ne joue pas en neutral** mais qui
punit tout commit adverse frame-perfect. Ken reste statique par
défaut. L'adversaire commit une erreur (whiff sweep, whiff DP,
recovery d'un fireball à portée) → punish combo maximal.

**Réaliste**. Le travail déjà fait couvre ça à 80%. Il manque :
- Fix le trigger perdu sur transient animPtr.
- Implémenter P3 : simulation de combos (chaînage jump_forward_hp
  → crouch_fierce → shoryu_fierce).
- Fixer l'anti-air (simuler correctement quand l'adversaire est
  airborne et comparer aux hurtboxes aériennes).

**Angle éditorial** : "on peut dominer un humain qui fait des
erreurs sans jouer en neutral". Vrai, mais spécialisé.

### Option B — Clone un TAS humain avec ML

**Objectif** : enregistrer 50-100 replays d'un top-player Ken vs
Ryu (fightcade, tournament VODs, etc.), extraire les inputs
frame-par-frame, entraîner un réseau (MLP ou small transformer)
à prédire `action_t = f(state_t, state_{t-30})`.

Le réseau apprend implicitement le neutral, le spacing, la
pression. Pas besoin de formaliser les 4 régimes.

**Difficile** : accès aux replays, alignement des inputs avec les
frames RAM, training infrastructure. Mais c'est la voie
académiquement "propre" et elle donnerait un bot qui **ressemble**
à un humain.

**Angle éditorial** : "une IA qui imite un pro SF2HF en
apprenant ses games". Très viral.

### Option C — Rules explicites, acceptant d'être sous-optimal

**Objectif** : coder manuellement les 4 régimes avec des règles
ad-hoc par matchup. Dire "contre Ryu, Ken hadouken à dist > 180,
walk forward à 120-180, sweep whiff à 80-120, throw à <40".
Pas un TAS, un **bot scripté** classique.

**Réaliste**. Le travail existant (trajectoires, simulator,
engine) est overkill pour ça mais réutilisable.

**Angle éditorial** : faible. Tout le monde fait ça depuis les
années 90.

### Option D — Retour au commentateur vocal (pre-pivot jour 2)

Le commentateur Claude Haiku + ElevenLabs **fonctionnait** avant
d'être supprimé le jour 2 (commit `810a2c6`). Récupérable via
`git show 810a2c6^:` pour les fichiers :

- `packages/sprixe-coach/src/llm/` — prompt builder + knowledge base
- `packages/sprixe-coach/src/tts/` — ElevenLabs client
- `packages/sprixe-coach/src/agent/claude-strategist.ts` —
  orchestration Haiku
- `packages/sprixe-coach/src/agent/player-profile.ts` — profil joueur
- `packages/sprixe-frontend/src/coach/` — subtitle overlay

Proxies dev serveur (`/api/coach/generate`, `/api/coach/tts`) **sont
toujours dans `vite.config.ts`** — la suppression côté client
n'a pas retiré l'infra serveur. Déjà utilisable.

**Angle éditorial** : *"caster virtuel qui commente n'importe quel
match arcade avec la voix d'un vrai caster esport"*. Simple à
démontrer, pas de défi technique profond, utilitaire réel pour
l'audience. Plus facile à livrer que le TAS.

L'inconvénient identifié en mémoire : *"pas un commentateur
descriptif, on voit déjà ce qui se passe"*. Il faudrait pivoter
vers le **coach humain** (aide à gagner) pour que ça vale la
peine — mais ça c'est dans la même zone de latence absorbable
par la narration.

### Mes suggestions si je reprenais le projet

1. **Option A (Master Punisher)** comme livraison immédiate.
   Finir P3 (combos), fixer l'anti-air, nettoyer la dette LLM.
   Ken ne joue pas en neutral, mais sa punition est frame-perfect.
   Article : *"J'ai fait un Ken qui punit tout move adverse
   optimalement, sans neutral game. Résultat : il dépend
   complètement de l'adversaire."*

2. **Plus tard, Option B** si le projet a du temps et un dataset.
   C'est le Graal, mais c'est un projet en soi (3-6 mois).

---

## 8bis. Apprentissages méta-méthodologiques

Cette session a produit plusieurs conclusions transposables qui
dépassent SF2HF. Elles valent d'être articulées explicitement :

### Sur la collaboration humain/assistant

- **Laisser l'humain dicter, transcrire sans spéculer.** Quand
  l'auteur savait quoi faire (ordonnancement des options, ban
  shoryu en neutral, positionnement Ken x=300 pour back jumps),
  les résultats étaient nets. Quand l'assistant proposait des
  options multiples, la friction augmentait.
- **Prouver avant de patcher.** L'assistant a gagné du temps
  quand il acceptait de vérifier empiriquement (dump, console
  logs, test unitaire) avant de coder. Il en a perdu à chaque
  fois qu'il a corrigé un bug supposé sans vérifier.
- **Accepter l'échec comme signal informatif.** "Ça ne marche
  pas" n'est pas un problème à cacher par des chiffres. Une
  réponse "je ne sais pas pourquoi, investiguons" est plus
  utile qu'une justification rationnalisante.
- **Limiter la longueur des réponses quand l'humain est fatigué.**
  Les messages de fin de session étaient longs et remplis de
  questions. Ils coûtaient à l'humain plus qu'ils n'apportaient.

### Sur l'architecture d'un bot de fighting game

- **Perception avant décision.** Un HUD frame-exact est un
  investissement qui rembourse dix fois. Sans lui, chaque bug
  est une spéculation.
- **Séparer le simulateur du moteur.** `simulateOption` pure,
  `pickPunish` pure, intégration séparée. Permet de tester chaque
  couche isolément. C'est ce qui a sauvé la confiance quand Ken
  a joué bizarre en prod.
- **Training-mode emulation est un super-pouvoir.** Écraser la
  RAM adverse chaque vblank permet de capturer des données
  propres dans un environnement aléatoire. Généralisable.
- **Ne pas hardcoder les constantes reach.** Résoudre depuis le
  ROM au moment de la simulation. Plus robuste, plus portable.
- **Les données externes (frame data, TAS inputs) peuvent être
  inexistantes pour des jeux rétro.** Budget de capture à
  anticiper.

### Sur l'ambition d'un TAS temps-réel

- **Un TAS réactif couvre 25% du boulot d'un bot de fighting
  game.** Le neutral, la lecture adverse, le meta (life lead,
  corner control, timer) sont des régimes distincts.
- **Le LLM a une place, mais pas au niveau frame.** 400ms+ de
  latence condamne toute décision réflexive. Utile pour
  coaching macro (stratégie de match) ou commentaire, pas pour
  dicter les inputs.
- **Un "TAS imbattable" grand public exige une démo courte et
  ciblée.** La scène où Ken punit un whiff sweep avec un
  jHP→cHP→DP fait ~60 frames. On peut la scripter
  parfaitement avec les briques existantes. Une vidéo "60s
  montage des 10 meilleures punitions" est plus livrable
  qu'un bot qui joue un round entier.

### Sur le pivotage

- **Trois pivots en quatre jours**, c'est beaucoup. Le commentateur
  → coach humain → TAS adversaire représente trois métiers
  différents, trois architectures différentes, et on n'a
  finalement livré aucun des trois à l'état "démo publiable".
  Possible leçon : **lock le scope plus tôt**, quitte à livrer
  moins ambitieux.
- **Les reliquats des pivots précédents sont encore dans le
  code**, partiellement morts, partiellement réutilisables. Plus
  longtemps on pivote sans nettoyer, plus la dette augmente.

---

## 9. Timeline personnelle (opinion subjective assistant)

Cette session a eu un coût émotionnel. L'utilisateur a exprimé
plusieurs fois sa fatigue, sa frustration, et finalement son
renoncement. C'est légitime et attendu — tenter de faire en 1-2
journées ce que la communauté SF2 a passé 30 ans à optimiser à
la main est ambitieux par construction.

L'assistant (moi) a oscillé entre moments de vraie utilité
(validation empirique du HUD, capture des trajectoires,
simulateur testé) et moments de friction (spéculation, propositions
multiples quand une seule décision était attendue, tendance à
justifier les échecs par des chiffres plutôt qu'à reconnaître
l'impasse).

Le projet peut être raconté comme "une tentative honnête qui a
échoué dans son ambition première mais qui a livré des briques
techniques qui valent d'être conservées et un apprentissage sur
la nature réelle du problème". C'est un récit d'échec utile.

---

## 10. Pour finir

Ce post-mortem est **long par dessein**. Les échecs doivent être
documentés autant que les succès, peut-être plus, parce qu'ils
sont plus instructifs. Tout ce qu'on a tenté, tout ce qui n'a pas
marché, tout ce qu'on a pivoté, est utile à quelqu'un.

Si tu écris un article, tu as ici la trame chronologique complète,
les citations, les pivots conceptuels, et les leçons méthodologiques.
Si tu reprends le projet dans six mois, tu as l'état des lieux
technique précis, les reliquats utilisables, et trois voies
possibles pour continuer.

La conclusion honnête : **un TAS Ken imbattable est un projet
plus gros qu'une démo de week-end**. Pas impossible. Pas en une
session.

---

*Document généré le 22 avril 2026, sur la branche
`worktree-ai-coach-plan`. Dernier commit de session : `789949e`.
Rédigé en français, comme demandé.*
