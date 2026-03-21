# CPS1-Web : Chronique de développement avec Claude

> Mémento exhaustif du développement d'un émulateur CPS1 from scratch dans le browser, en pair-programming avec Claude. Destiné à servir de matière première pour un article de blog. À compléter au fil de l'eau.

---

## Le pitch

Un émulateur Capcom Play System 1 (l'arcade de Street Fighter II, Final Fight, Cadillacs and Dinosaurs...) écrit entièrement en TypeScript, qui tourne dans un navigateur. Zéro dépendance d'émulation. 18 500+ lignes de code. Du boot au gameplay jouable en 5 jours.

Et l'idée folle : un renderer DOM où **chaque sprite est un `<div>`**, le jeu tourne dans les DevTools.

---

## Timeline

| Jour | Date | Commits | Résumé |
|------|------|---------|--------|
| J1 | 17 mars 2026 | 22 | Du master plan au jeu jouable — CPU, vidéo, audio, input |
| J2 | 18 mars 2026 | 36 | Audio Nuked OPM, WASM, multi-jeu, UI complète, mobile |
| J3 | 19 mars 2026 | 22 | DOM renderer, React puis vanilla, tests Tom Harte |
| J4 | 20 mars 2026 | 19 | QSound, Kabuki, TATE mode, batch OPM |
| J5 | 21 mars 2026 | 1 (squashé) | QSound audio fonctionne ! Bug Z80 préfixe opcode trouvé via MAME debugger |
| **Total** | **5 jours** | **100 commits** | **~20 000 lignes TS+C, ~30K insertions source** |

---

## Jour 1 — Du néant au jeu jouable (17 mars)

### Le premier commit : 8 900 lignes d'un coup

Le projet démarre par un commit massif : `feat: CPS1 emulator running Street Fighter II in the browser`. Claude génère en une seule passe :
- **M68000** — interpréteur cycle-accurate (2 937 lignes), 56+ instructions, 12 modes d'adressage, pipeline prefetch
- **Z80** — interpréteur complet avec préfixes CB/DD/FD/ED (2 220 lignes)
- **Bus mémoire** — memory map CPS1 complète (68000 + Z80), 24-bit
- **ROM loader** — parsing ZIP MAME avec interleave ROM_LOAD16_BYTE et ROM_LOAD64_WORD
- **Vidéo CPS-A/CPS-B** — 3 scroll layers + sprites, palette, layer priority
- **Canvas 2D** — renderer 384x224 avec pixel-perfect scaling
- **Input** — clavier + Gamepad API

SF2 boote, passe le POST, affiche le title screen. Les graphiques ont des artefacts.

### La cascade de bugs graphiques

Chaque fix en révèle un autre :

1. **Bank mapper manquant** — Les tiles scroll2 affichaient les mauvais graphiques. Il manquait le `gfxrom_bank_mapper` (mapper_STF29 pour SF2) qui traduit les tile codes via le CPS1 PAL. Fix : porter la logique de MAME.

2. **Pixel order inversé** — Le texte et les sprites étaient mirrorés horizontalement. Le décodage des pixels GFX ROM était LSB-first au lieu de MSB-first (bit 7 = pixel le plus à gauche). Un sub-agent avait même tenté de "corriger" vers LSB à un moment, ce qui garblait tout — revert nécessaire.

3. **Transparent pen** — Pen 0 était marqué transparent au lieu de pen 15. Résultat : des trous dans les sprites là où il y avait du noir opaque.

4. **CPS-B ID register** — Sans l'ID register correct (SF2 CPS_B_11 = 0x0401 à l'offset 0x32), le jeu tombait dans une boucle d'erreur après le POST. Un registre de protection anti-piratage qui bloquait tout.

5. **Plane bit order** — `decodeRow()` assignait les planes dans le mauvais ordre. MAME planeoffset {24,16,8,0} signifie byte[3]=plane0(bit0), byte[0]=plane3(bit3). L'inversion causait des artefacts de couleur rouge sur les portraits.

6. **Sprite format** — L'ordre des words dans la table sprites était faux (X, Y, code, attributes — pas code, Y, X, attr). Découvert en lisant MAME mot à mot.

7. **Sprite bank mapping** — Le bank mapping était appliqué au tile code de base, puis l'arithmétique multi-tile faite sur le code mappé. MAME fait l'inverse : arithmétique sur le code brut, puis bank-map chaque sub-tile individuellement.

### L'audio : du silence au son

L'audio a été un combat en plusieurs rounds :

**Round 1 — Mauvaise memory map Z80** : Les adresses YM2151 et OKI6295 étaient inversées (YM2151 à 0xF006 au lieu de 0xF000, OKI à 0xF000 au lieu de 0xF002). Le Z80 écrivait ses registres audio dans le vide.

**Round 2 — Timers non interleaved** : Les timers YM2151 n'avançaient qu'après la fin du budget Z80 par frame. Le driver son de SF2 dépend des Timer A IRQ pour séquencer la musique. Sans interruption pendant l'exécution Z80, le séquenceur restait bloqué. Fix : interleaver `ym2151.tickTimers()` toutes les 64 T-states Z80.

**Round 3 — Sound latch** : Confusion entre IRQ-driven et polling. MAME confirme que seul le YM2151 drive le Z80 INT. Le sound latch est pollé par la routine Timer A ISR, pas par IRQ. Un IRQ spurious sur chaque écriture du latch perturbait le séquenceur.

**Commit pivot : `e003189` — "AUDIO WORKS"** — Le moment où le premier son reconnaissable sort des haut-parleurs.

### Les inputs : dernier kilomètre

Deux bugs séquentiels :
- Start 1 était mappé au bit 2 au lieu du bit 4 dans IN0
- Les bytes joueur étaient inversés (big-endian : P1 à l'octet impair 0x800001, P2 à l'octet pair)

**Commit pivot : `b3f9dfb` — "GAME IS PLAYABLE"** — Coin, Start, mouvement, attaques — SF2 jouable de bout en bout.

---

## Jour 2 — L'audio parfait et le multi-jeu (18 mars)

### L'odyssée du YM2151

Le son marchait mais ne sonnait pas "bien". S'ensuit une série de corrections de plus en plus fines :

1. **Busy flag 64x trop long** — `busyCycles = 64` décrementé une fois par tick timer (tous les 64 clocks Z80) = 4 096 cycles de busy. Le Z80 busy-wait sur ce flag avant chaque écriture YM → il passait ~80% de son temps à tourner dans le vide. Le tempo de la musique était dramatiquement trop lent.

2. **Modulation >> 1** — Tous les outputs modulateurs étaient passés bruts aux opérateurs modulés. YMFM les shift right d'1 bit. Résultat : timbres FM 2x trop agressifs/distordus.

3. **Envelope clocking** — Le compteur d'enveloppe était per-operator au lieu de global, et clocké à chaque sample au lieu de tous les 4 samples. Les enveloppes ADSR tournaient ~2x trop vite : decay et release trop courts.

4. **LFO Phase Modulation** — Complètement non-fonctionnel (le paramètre `_lfoPhase` n'était pas utilisé). Vibrato totalement absent.

### Le pivot Nuked OPM

Après 4 corrections incrémentales du YM2151, décision de pivoter vers **Nuked OPM** — une émulation transistor-level du YM2151 basée sur le decap du chip (die shots). Port de 2 000+ lignes de C vers TypeScript.

**Bug critique du port** : `~level & 0xffff` — Le NOT signé en C préserve le signe pour le shift arithmétique `>> 5`. En TypeScript, le masque `& 0xffff` convertissait le résultat signé en unsigned 16-bit, causant l'inversion de la courbe d'attaque des enveloppes. Les canaux restaient coincés à atténuation maximale (silencieux). Fix : retirer le masque `& 0xffff`.

### De TypeScript à WASM

Le port TS de Nuked OPM marchait mais consommait ~58% CPU. Décision de compiler le C original vers WASM via Emscripten. Résultat : **25% de réduction CPU** (33% vs 58%). Le hot loop `clockCycles` bénéficie directement des optimisations natives.

### L'OKI6295 : trois tentatives

Le décodeur ADPCM OKI6295 a nécessité trois réécritures :

1. **Protocole inversé** — Bit 7 set = phrase select (pas stop). Bit 7 clear = stop (pas select). L'inverse de la première implémentation.
2. **Adresses nibble vs byte** — La phrase table contenait des adresses byte, pas nibble. Lecture aux mauvaises positions ROM.
3. **Normalisation** — Diviseur 8 192 (trop silencieux) → 1 024 avec volumes entiers (16x trop fort) → 2 048 avec volumes float (correct, matching MAME `stream.add_int(..., 2048)`).

### Multi-jeu et catalogue

Passage de SF2-only à 41 jeux supportés :
- Architecture CPS-B configurable par jeu (ID, layer control, priority masks, palette control)
- GFX mapper par jeu (remplacement du mapper_STF29 hardcodé)
- 245 jeux dans le catalogue (source MAME 0.286)
- Téléchargement depuis archive.org via proxy Vite (CORS)

### Le fullscreen : 4 commits pour un feature

La séquence `1ef18bc` → `b951efa` → `ba528bb` → `040d7dc` illustre bien le tâtonnement typique avec les APIs browser :
1. Le fullscreen ne stretch pas → fix CSS
2. Vendor prefix manquant → ajout webkitRequestFullscreen
3. Fullscreen sur le wrapper au lieu du canvas → switch
4. Audio suspendu au retour → resume

### L'audio dans le browser : user gesture hell

Le browser bloque la création d'AudioContext hors d'un geste utilisateur. Trois commits pour résoudre :
1. `initAudio` appelé après le download async → bloqué
2. Déplacé dans le click handler → fonctionne mais worklet pas prêt
3. Split : création AudioContext synchrone dans le click, setup worklet async mais awaité avant le premier frame

Le `SharedArrayBuffer` nécessite des headers COOP/COEP. Sans eux, fallback ScriptProcessorNode (main thread) → crackling audio permanent. Fix : ajouter les headers dans la config Vite.

---

## Jour 3 — Le DOM renderer et la rigueur des tests (19 mars)

### L'idée folle : chaque sprite est un `<div>`

Le MASTER-PLAN décrit la vision : réinterpréter le hardware graphique CPS1 à travers les primitives du web. Chaque sprite est un `<div>`, chaque tile un élément DOM, le jeu "tourne dans les DevTools".

**Première implémentation : React** — Composants `<ScrollLayer>`, `<Tile>`, `<Sprite>` avec sprite sheets en blob URL. Le concept fonctionne mais React est over-engineered pour 60fps de mise à jour DOM brute.

**Pivot : vanilla TypeScript** — React supprimé (`d93dd8a`). Le renderer DOM est réécrit en vanilla TS avec manipulation directe du DOM. Plus léger, plus prévisible, pas de diffing virtuel inutile pour du contenu qui change intégralement chaque frame.

**Pivot #2 : hybrid renderer** — Les scroll layers en canvas (trop de tiles pour le DOM), les sprites en DOM. Meilleur des deux mondes : les sprites sont inspectables dans DevTools, les backgrounds performants.

### Bugs du DOM renderer

- **Palette hash** — Le cache de sprite sheets ne détectait pas les changements de palette. Sprites avec les couleurs du frame précédent.
- **Layer order CPS-B** — Les sprites doivent être sandwichés entre les scroll layers selon la priorité CPS-B, pas toujours au-dessus.
- **Tilemap wrapping** — Les tiles de scroll layers doivent être positionnées en espace écran, pas en espace tilemap.

### Tom Harte : la validation hardware

Intégration des vecteurs de test Tom Harte pour le M68000 et SingleStepTests pour le Z80 :

**M68000** : 84 groupes d'instructions, 200 vecteurs chacun. Chaque vecteur contient l'état CPU initial, la mémoire, et l'état attendu après exécution. Bugs trouvés et corrigés :
- ASR avec grand compteur : flags incorrects
- Plusieurs bugs de calcul d'adresse effective
- Address Error frame : l'adresse 32-bit complète doit être dans le frame d'exception

**Z80** : 588 groupes d'instructions (base + CB + ED), 200 vecteurs chacun. 565 passent 200/200. Les 23 échecs restants :
- Flags undocumented (bits 3, 5) de SCF/CCF et BIT b,(HL)
- Block I/O : calcul de flags complexe non implémenté
- HALT : gestion dans le setup de test

### Bug YM2151 IRQ clear

`6afbb34` — L'IRQ clear du YM2151 n'était jamais détecté après écriture registre. Le timer IRQ restait actif indéfiniment, bloquant les futurs IRQ. Le séquenceur musical se désynchronisait progressivement.

---

## Jour 4 — QSound, Kabuki et le hardware exotique (20 mars)

### QSound : un DSP dans l'arcade

Les jeux CPS1.5/CPS2 (Dino, Punisher, Slam Masters...) utilisent un chip QSound (DSP custom) au lieu du YM2151. Architecture radicalement différente :
- DSP séparé avec sa propre ROM de programme (`dl-1425.bin`)
- Communication Z80 → QSound via registres mappés en mémoire
- Audio surround avec spatialisation

**Approche** : Port WASM de l'implémentation HLE (High-Level Emulation) de MAME. Le DSP n'est pas émulé cycle-accurate mais fonctionnellement.

### Kabuki : le Z80 chiffré

Découverte que les jeux QSound utilisent un **Kabuki Z80** — un Z80 custom avec déchiffrement des opcodes intégré. Sans la clé de déchiffrement, le Z80 exécute du garbage.

Chaque jeu a une clé unique (swap_key1, swap_key2, addr_key, xor_key). Implémentation du déchiffrement → tous les jeux QSound bootent.

### TATE mode

Pour les jeux verticaux (1941, Varth, Mercs...), auto-rotation CSS du canvas à 90°. Détection automatique via les métadonnées du jeu.

### Dino boots : la séquence de debug

`84c6ea3` — Pour faire booter Cadillacs and Dinosaurs :
- **QSound handshake** — Le 68000 attend une réponse du DSP QSound au démarrage
- **EEPROM stubs** — Le jeu lit/écrit une EEPROM série 93C46 pour les paramètres opérateur
- **Z80 pre-run** — Le Z80 doit tourner quelques frames avant que le 68000 ne commence

### Batch OPM clocking

`cf90be5` — Optimisation : au lieu d'appeler le WASM clock-par-clock (~30K appels JS→WASM par frame), on batch les clocks. Réduction significative de l'overhead d'appel inter-language.

---

## Jour 5 — De "pas de son" à "ça marche l'ami" (21 mars)

### La chasse au bug QSound : 12 heures de debug

Session marathon de debugging de l'audio QSound. Le pipeline était silencieux malgré tout étant en place. Chronologie de la chasse :

1. **Pipeline vérifié** — Le QSound DSP HLE produit du son en écrivant les registres directement (bypass). Le problème est côté Z80.
2. **EEPROM 93C46** — Implémentation du protocole série (CS/CLK/DI/DO). Sans EEPROM, le 68K ne génère pas de commandes son (le jeu est en mode "factory reset").
3. **Interleave CPU** — Passage de l'exécution séquentielle (68K puis Z80) à l'interleave par scanline (comme MAME). Le 68K et le Z80 voient les écritures shared RAM en temps réel.
4. **Wake hack** — Tentative de réveiller le Z80 quand le 68K poste une commande. Le Z80 se réveille mais efface tout (code de clear). L'ISR n'a pas le temps de capturer la commande.
5. **Le bypass direct** — Écriture directe des registres QSound quand le 68K envoie une commande → du son ! Le pipeline DSP fonctionne de bout en bout.
6. **Traçage Z80** — Le Z80 atteint la subroutine QSound write (0x0A1B) 6000+ fois, mais DE=0x0000 pour tous les paramètres de voix.

### Le coup de grâce : MAME debugger

Après des heures de traçage manuel, l'utilisateur propose d'utiliser MAME en mode debug. **En 2 minutes**, la comparaison des traces révèle le bug :

```
MAME:  0001: im   1     ← Mode d'interruption 1
Notre: 0001: im   0     ← Mode d'interruption 0 (!!)
```

**Cause racine** : les instructions Z80 préfixées (CB, ED, DD, FD) lisaient le second byte d'opcode depuis la **DATA ROM** au lieu de l'**OPCODE ROM**. Avec le chiffrement Kabuki (qui décode opcodes et données différemment), `ED 56` (IM 1) était décodé comme `ED 66` (IM 0, un miroir de `ED 46`).

En IM 0, le Z80 n'appelait jamais l'ISR à 0x0038. L'ISR ne capturait jamais les commandes son. Les voix QSound n'étaient jamais configurées. Silence total.

**Fix : 3 lignes changées** — `fetchByte()` → `fetchOpcode()` dans `execCB()`, `execED()`, `execDDFD()`.

### Leçon

> On a passé 12 heures à tracer manuellement le Z80, tenter des hacks (wake, bypass, force ready flag), instrumenter chaque étape du pipeline. Le bug était un `fetchByte` au lieu de `fetchOpcode` dans 3 méthodes. MAME debugger l'a trouvé en 2 minutes en comparant la trace de boot.

---

## Patterns et observations

### Ce qui a bien marché

1. **MAME comme source de vérité** — Chaque fois qu'un comportement était incertain, la lecture du code source MAME (~400K lignes de C++) a tranché. Les commentaires dans les commits citent systématiquement les fichiers et lignes MAME.

2. **Commits granulaires** — 104 commits en 5 jours, chacun focalisé sur un changement logique. Facilite le bisect et le rollback.

3. **Approche incrémentale** — Faire marcher SF2 d'abord, puis généraliser. Pas de sur-architecture initiale.

4. **Port WASM pour la perf** — Quand le port TS de Nuked OPM était fonctionnel mais trop lent, compiler le C original vers WASM a donné 25% de réduction CPU sans changer le comportement.

5. **Tom Harte tests** — 84 × 200 = 16 800 vecteurs M68000 et 588 × 200 = 117 600 vecteurs Z80. Validation rigoureuse impossible manuellement.

### Patterns d'erreurs récurrents

1. **Endianness et byte order** — Au moins 5 bugs liés à l'ordre des bytes (pixels MSB vs LSB, plane order, input byte order, sprite word order, decodeRow byte order). Le CPS1 est big-endian, le web est little-endian. Source constante de confusion.

2. **Off-by-one dans les masques de bits** — Busy flag YM2151 (64 vs 1), OKI normalisation (8192 vs 2048), transparent pen (0 vs 15). Chaque constante numérique est un piège potentiel.

3. **Séquencement inter-CPU** — Le timing relatif entre M68000, Z80 et les chips audio est critique. Trois bugs majeurs causés par un mauvais interleave (timers YM2151, QSound handshake, Z80 pre-run).

4. **APIs browser** — Fullscreen (4 tentatives), AudioContext user gesture (3 commits), CORS archive.org (2 approches), SharedArrayBuffer headers. Le browser est un environnement hostile pour l'émulation.

5. **Signed vs unsigned** — Le bug Nuked OPM (`~level & 0xffff`) est le plus critique : une seule ligne qui change la sémantique signée du C vers unsigned en JavaScript, rendant des canaux entiers silencieux.

6. **Opcode vs data space** — Le bug Z80 `fetchByte` vs `fetchOpcode` pour les préfixes CB/ED/DD/FD. Avec le chiffrement Kabuki, lire le second byte d'opcode depuis le mauvais espace mémoire change l'instruction décodée (IM 1 → IM 0). Trouvé uniquement via comparaison avec MAME debugger.

### Pivots architecturaux

| Quand | De | Vers | Pourquoi |
|-------|-----|------|----------|
| J2 | YM2151 custom | Nuked OPM (TS port) | 4 corrections incrémentales insuffisantes, besoin de cycle-accuracy |
| J2 | Nuked OPM TS | Nuked OPM WASM | Performance (58% → 33% CPU) |
| J3 | React DOM renderer | Vanilla TS DOM | React over-engineered pour 60fps full-refresh |
| J3 | Full DOM renderer | Hybrid canvas+DOM | Trop de tiles DOM pour les scroll layers |
| J4-5 | YM2151 only | + QSound HLE WASM | Nécessaire pour les jeux CPS1.5 (Dino, Punisher...) |
| J5 | 68K puis Z80 séquentiel | Interleave par scanline | Communication shared RAM nécessite timing concurrent |

### Ce que Claude fait bien dans ce contexte

- **Volume de code** : 8 900 lignes en premier commit, avec architecture cohérente
- **Connaissance hardware** : les spécifications CPU M68000 et Z80 sont dans ses données d'entraînement
- **Lecture de code MAME** : capacité à extraire la logique pertinente d'une codebase C++ massive
- **Debugging systématique** : suivre les signaux du boot au pixel, du register au son
- **Itération rapide** : 104 commits en 5 jours = ~1 commit toutes les ~45 minutes (8h/jour)

### Ce que Claude fait mal dans ce contexte

- **Conversion C → JS signée** : le bug `& 0xffff` montre une tendance à ajouter des masques de bits "de sécurité" qui changent la sémantique
- **Byte order intuition** : le CPS1 est big-endian, et Claude commet régulièrement l'erreur d'assumer little-endian
- **Sub-agents contradictoires** : un agent a tenté de "corriger" le pixel order vers LSB-first alors que MSB-first était correct — revert nécessaire
- **APIs browser edge cases** : fullscreen, AudioContext, CORS — beaucoup de tâtonnement
- **Constantes magiques** : les normalisations audio (diviseurs, volumes) nécessitent une lecture très précise de MAME, et Claude a souvent besoin de 2-3 tentatives

---

## Chiffres clés

| Métrique | Valeur |
|----------|--------|
| Durée totale | 5 jours (17-21 mars 2026) |
| Commits | 104 |
| Lignes TypeScript | ~18 500 |
| Insertions source totales | ~28 000 |
| Jeux supportés (GameDefs) | 41 parents |
| Jeux dans le catalogue | 245 |
| Vecteurs de test M68000 | 16 800 (84 × 200) |
| Vecteurs de test Z80 | 117 600 (588 × 200) |
| Composants hardware émulés | 7 (M68000, Z80, YM2151, OKI6295, QSound, CPS-A, CPS-B) |
| Renderers | 3 (WebGL2, Canvas 2D, DOM hybrid) |
| Réécriture audio YM2151 | 3 versions (custom → Nuked OPM TS → Nuked OPM WASM) |
| Bug le plus vicieux | `fetchByte` au lieu de `fetchOpcode` dans CB/ED/DD/FD (3 lignes, QSound muet) |
| Bug le plus sournois | `~level & 0xffff` (1 ligne, canaux YM2151 silencieux) |
| Bug le plus fréquent (catégorie) | Byte order / endianness (5+ occurrences) |
| Temps de debug le plus long | QSound audio (~12h) — résolu en 2min via MAME debugger |

---

## Ligne de temps détaillée des commits

### Jour 1 — 17 mars 2026 (22 commits)

```
eaf3deb  docs: add master plan for CPS1 browser emulator
0316202  feat: CPS1 emulator running Street Fighter II in the browser ← 8900 lignes
aff6fa1  fix: graphics rendering - bank mapper, MSB-first pixels, transparent pen
1befeed  feat: audio subsystem - YM2151 FM synthesis + OKI6295 ADPCM ← +2142 lignes audio
0a1c87a  fix: Z80 sound memory map and audio ROM loading ← adresses YM2151/OKI inversées
3823a71  fix: frame rate limiter, sound latch real-time sync, timer generation
84c0815  docs: add CHANGELOG.md and LEARNINGS.md
4a1356c  fix: sound latch write triggers Z80 IRQ + timer IRQ working
e003189  fix: YM2151 timer interleaving with Z80 execution ← AUDIO WORKS
f086e5c  fix: input mapping - Start at bit 4, coin/start I/O at correct offset
b3f9dfb  fix: input byte order + Start bit position ← GAME IS PLAYABLE
c36794b  fix: revert LSB pixel order (keep MSB-first), improve YM2151 FM synth
7ab3ddf  perf: tile-based rendering + frame limiter fix
1c14c78  fix: correct plane bit assignment in GFX tile decoder
693947d  fix: compensate browser 30fps rAF throttling
9acb882  fix: scroll/sprite framing with CPS_HBEND/CPS_VBEND offsets
ace90d6  feat: row scroll (line scroll) for scroll2 layer
1a93e23  fix: row scroll offset calculation simplified
24030ab  fix: sprite double-buffering (like MAME's m_buffered_obj)
6d83078  fix: bank-map each sprite sub-tile individually (not base code)
d7cf98f  fix: decodeRow byte order matches MAME planeoffset {24,16,8,0}
85174c5  fix: row scroll plane order + sprite bank mapping alignment
```

### Jour 2 — 18 mars 2026 (36 commits)

```
b1ddb1d  feat: YM2151 rewrite with YMFM hardware tables + audio pipeline fixes
aa58fdd  fix: YM2151 busy flag 64x too long + Z80 EI timing + sound latch cleanup
08a0a23  fix: OKI6295 complete rewrite matching MAME okim6295.cpp
30b19a9  fix: YM2151 modulation >> 1 matching YMFM
efd9931  fix: YM2151 envelope clocking + LFO PM matching YMFM
f819e6b  feat: replace YM2151 with Nuked OPM (cycle-accurate from die-shot) ← PIVOT
5bbfb8d  fix: Nuked OPM envelope attack — signed NOT was masked to uint16 ← BUG CRITIQUE
722aa11  fix: audio mix matching MAME CPS1 mono output
43a4416  fix: OKI6295 levels matching MAME + FPS overlay + cleanup
30bcb43  fix: OKI6295 MAME-exact ADPCM decode + soft limiter
69d6764  docs: update CHANGELOG with audio session fixes
86f8bfa  chore: add test scripts, configs and decisions doc
73a5795  feat: multi-game support with configurable CPS-B and GFX mapper
59a9b20  fix: audio crackling — COOP/COEP headers, limiter and buffer fixes
ca0aa93  feat: pause/resume with P key
5b23207  refactor: audit fixes — shared types, dead code removal, testability
57cb424  feat: CPS1 game catalog with archive.org ROM download
e9e1682  feat: add 41 CPS1 game definitions from MAME 0.286
73c840a  fix: handle archive.org CORS redirect in ROM downloader
20001d9  fix: ROM download via Vite proxy to archive.org
556bc9c  feat: UI cleanup — Escape/F/P shortcuts, reset on load, fixed canvas
1ef18bc  fix: fullscreen stretches canvas to fill screen
b951efa  fix: fullscreen with vendor prefix and !important overrides
ba528bb  fix: fullscreen on canvas element directly
040d7dc  fix: audio resume on game load, Escape hides canvas
398361a  fix: remove 13 MAME device entries from game catalog (not actual games)
38a43c0  fix: init audio on LOAD click (user gesture), not after async download
5b3cc9a  fix: audio ready before first frame — split context creation from worklet setup
4241904  fix: reset YM2151 on game load, cleanup debug code
e5ad1ed  feat: WebGL2 renderer with Canvas 2D fallback
509b740  fix: remove 2D context init that blocked WebGL2 on canvas
c69417b  perf: optimize Nuked OPM clockCycles hot loop
cf9182f  feat: Nuked OPM compiled to WASM — 25% CPU reduction ← PIVOT PERF
5f41f5a  docs: update CLAUDE.md with full project documentation
ba9d39b  feat: responsive mobile + pseudo-fullscreen iOS
d971bb7  chore: prepare for public release
```

### Jour 3 — 19 mars 2026 (22 commits)

```
6967d7e  feat: React DOM renderer — every sprite is a <div>
c80e702  fix: scroll layer tilemap wrapping — position tiles in screen space
ce7b9c9  feat: add keyboard shortcuts to DOM renderer (M=mute, P=pause)
8535d1c  perf: hybrid renderer — canvas for scroll layers, DOM for sprites
d93dd8a  refactor: remove React — pure vanilla TypeScript DOM renderer ← PIVOT
504a7ae  fix: palette hash + multi-tile sprites + fullscreen + remove React
fa3b0c7  fix: respect CPS-B layer order — sprites sandwiched between scroll layers
fda72e0  fix: palette cache checked before tile lookup — fixes stale sprite colors
86e7b93  fix: row scroll other index offset — add CPS_VBEND to match MAME
c0cf034  fix: frame pacing + blur keyState clear + I/O debug hook
7a2ddc3  feat: input debug overlay + cleanup I/O debug
1de2c74  feat: M68000 instruction tracer + fix PC offset in trace log
af8ae07  feat: CPU trace toggle (T key) + auto-download trace log
86af1cc  feat: Tom Harte M68000 test vectors + address error detection
5568d61  fix: M68000 instruction bugs found by Tom Harte tests
3528c48  test: expand Tom Harte M68000 tests to 84 instruction groups
e33c4b2  fix: M68000 ASR flags for large counts + Address Error frame accuracy
04c3309  test: Z80 SingleStepTests vectors + test runner (565/588 pass)
8136524  docs: document CPU test vectors in CLAUDE.md
abf2d88  fix: Z80 I/O block instructions C/H flags always zero
6afbb34  fix: YM2151 IRQ clear never detected after register write
3fd1dc8  fix: Z80 HALT should not decrement PC
```

### Jour 4 — 20 mars 2026 (19 commits)

```
147595c  feat: major emulation fixes + UI overhaul
39232ae  fix: auto-detect ROM_LOAD16_WORD_SWAP byte order for pre-swapped ROM sets
ee14f08  fix: buffer sprites at VBlank time instead of render time
29db54e  fix: Ghouls'n Ghosts sprites — correct GFX bank mapper fallback
a66288a  fix: sprite bank mapper fallback — bank 0 for sprites only
2798ef5  fix: remove spriteCodeOffset from sprite rendering path
e8c6581  fix: sync DOM renderer with Canvas sprite fixes
cf90be5  perf: batch OPM clocking to reduce JS→WASM call overhead
d75abaa  feat: QSound HLE DSP — WASM port from MAME
7e6edbc  feat: Z80 bus for QSound games
fd68fb4  feat: integrate QSound into emulator pipeline
84c6ea3  fix: Dino boots — QSound handshake, EEPROM stubs, Z80 pre-run
b6c9535  fix: load QSound DSP ROM (dl-1425.bin) from ZIP
ecd2489  fix: auto-generate GFX mapper ranges for QSound games
94b0815  docs: update BACKLOG with QSound progress and Kabuki discovery
9e2e575  feat: Kabuki Z80 decryption — unlocks all QSound games
c9910f5  wip: QSound audio pipeline (no sound yet)
129fc45  feat: game selector dropdown with archive.org auto-download
d7ccce6  feat: TATE mode — auto-rotate for vertical CPS1 games
```

### Jour 5 — 21 mars 2026 (1 commit squashé, 17 WIP condensés)

```
9772e5a  feat: QSound audio support + OPM batch clocking + UI improvements ← QSOUND AUDIO WORKS
```

Ce commit squash regroupe :
- QSound HLE WASM (port MAME, 22KB)
- Z80 bus QSound (shared RAM, DSP I/O, 250Hz IRQ)
- Kabuki Z80 decryption (4 jeux + clones)
- EEPROM 93C46 serial protocol
- Interleaved 68K/Z80 per scanline
- QSound audio resampling (24038 Hz → 48kHz)
- Auto-generate GFX mapper ranges
- Audio ROM region fix (0x28000)
- **Fix critique : fetchByte→fetchOpcode pour CB/ED/DD/FD**
- Game selector + archive.org download
- TATE mode (ROT270)
- OPM batch clocking (seuil 16)

---

## Glossaire technique

| Terme | Explication |
|-------|-------------|
| CPS1 | Capcom Play System 1 — hardware arcade (1988-1995) |
| CPS-A / CPS-B | Les deux ASICs custom du CPS1. CPS-A gère la vidéo, CPS-B la protection et les priorités |
| M68000 | Motorola 68000 — CPU principal @ 10 MHz, bus 24-bit |
| Z80 | Zilog Z80 — CPU audio @ 3.579545 MHz |
| YM2151 (OPM) | Yamaha — synthétiseur FM 8 canaux, 4 opérateurs |
| OKI MSM6295 | OKI — décodeur ADPCM 4 voix |
| QSound | DSP audio custom pour les jeux CPS1.5/CPS2 — spatialisation surround |
| Kabuki | Z80 custom avec déchiffrement d'opcodes intégré |
| Nuked OPM | Émulation transistor-level du YM2151 par Nuke.YKT, basée sur die-shot |
| YMFM | Bibliothèque d'émulation FM par Aaron Giles (auteur de MAME) |
| MAME | Multiple Arcade Machine Emulator — référence pour les specs hardware |
| Tom Harte | Auteur de ProcessorTests — vecteurs de test CPU exhaustifs |
| TATE mode | Mode vertical (portrait) pour les jeux orientés verticalement |
| HLE | High-Level Emulation — émulation fonctionnelle (vs cycle-accurate) |
| ADPCM | Adaptive Differential Pulse Code Modulation — compression audio |

---

*Dernière mise à jour : 21 mars 2026*
*QSound audio fonctionnel — Dino et Punisher jouables avec son.*
