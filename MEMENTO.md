# Sprixe : Chronique de développement avec Claude

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
| J6 | 25 mars 2026 | ~15 | Sprite Pixel Editor, audio timeline, FM Patch Editor, mic recording, palette ROM patching |
| J7 | 26 mars 2026 | ~15 | Sprite Analyzer, Sprite Sheet Viewer, photo import scroll layers, UI overhaul |
| J8 | 30 mars 2026 | ~20 | Le pivot Aseprite — audit, refactoring massif, suppression photo, palette snapshot, tests E2E |
| **Total** | **8 jours** | **~150 commits** | **~22 000+ lignes TS+C** |

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
- ROM loading depuis fichiers locaux

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

## Jour 6 — L'editeur graphique prend forme (25 mars)

### Le Sprite Pixel Editor : une premiere mondiale

La session du matin attaque le chantier le plus ambitieux depuis le rendu video : l'edition de sprites **en temps reel**, dans un jeu CPS1 qui tourne. Aucun emulateur au monde ne propose ca — les outils de romhacking existants (YY-CHR, TilEd) travaillent offline sur des ROMs figees.

L'architecture est un empilage de couches :
- `inspectSpriteAt()` sur CPS1Video — hit-test des sprites front-to-back avec metadonnees completes (tileCode, paletteIndex, gfxRomOffset, flip, multi-tile info)
- `tile-encoder.ts` — `encodeRow()` (inverse de `decodeRow()`), `writePixel()`, `readPixel()`, `readTile()`. L'encodage 4bpp planar CPS1 est l'inverse exact du decodage qui existait deja
- `palette-editor.ts` — `readPalette()`, `writeColor()`, `encodeColor()` avec conversion lossy RGB vers CPS1 16-bit
- `sprite-editor-ui.ts` — Panneau 360px avec grille tile 16x16 zoomee, outils pencil/fill/eyedropper/eraser, sidebar palette avec color picker, navigation entre tiles voisins, undo/redo (100 niveaux), frame stepping
- Overlay canvas pour la selection de sprite — hover highlight (cyan), tile selectionne (rouge), contours multi-tile

Le systeme de **Tile Reference Counter** (`tile-refs.ts`) est une piece critique : avant d'ecrire un pixel, il faut verifier si le tile est partage par plusieurs sprites. Si oui, dupliquer le tile vers un slot libre avant d'ecrire, sinon on corromprait tous les sprites qui partagent ce tile.

### L'audio timeline et le debt-based timing

En parallele, la timeline audio recoit un ruler frame-synced avec des ticks mineurs (60 frames) et majeurs avec labels (600 frames). Le scroll est lie au `frameCount` de l'emulateur, s'arrete en pause, et va dans le sens inverse (nouvelles donnees a gauche).

Le vrai fix de cette session : **Firefox audio lag**. Le `setInterval(16.77ms)` naif ne fonctionne pas sur Firefox qui throttle les timers differemment de Chrome. Remplacement par un tick 4ms + accumulateur de dette de frames. Le Worker rattrape les frames manquees au lieu de les dropper. Le ring buffer est double de 8192 a 16384 samples (~340ms de marge).

### La soiree : FM Patch Editor — trois approches, trois echecs

L'ambition de la soiree : un editeur de patches FM. Lire les voices du driver son CPS1, modifier les parametres (ADSR, algorithme, niveaux operateurs), entendre le resultat en temps reel.

**Le parser fonctionne** — `cps1-sound-driver.ts` decode le format voice 40-byte du driver v4.x, trouve la table de voices par pointeur de base ou scan brute-force. L'UI macro avec les 4 operateurs, les enveloppes, l'algorithme — tout est la.

**Le playback echoue**. Trois approches tentees :

1. **ROM patching** — Ecrire les registres du patch directement dans la ROM du driver son. Probleme : le Z80 cache les donnees de voice en work RAM. Modifier la ROM n'a aucun effet tant que le Z80 n'a pas recharge la voice.

2. **fmOverride** — Intercepter les ecritures YM2151 dans le Worker et substituer les registres du patch. Partiellement fonctionnel mais sonne faux : le Z80 ajuste dynamiquement les TL (Total Level) pour les enveloppes de volume. Nos valeurs statiques ecrasent ces ajustements dynamiques.

3. **Shadow registers** — Maintenir un miroir des registres YM2151 et ne substituer que les parametres de timbre (DT, MUL, AR, DR, etc.) en preservant les TL du Z80. Trop de cas limites : le driver change les TL pour le volume ET le timbre (carrier vs modulator).

**Verdict** : l'onglet Synth est code mais cache dans l'UI. Le playback temps reel necessite le reverse-engineering du sequenceur musical Z80 — ajoute au backlog comme projet DAW complet.

### Mic recording et la decouverte des palettes CPS1

Le remplacement de samples OKI par enregistrement micro fonctionne du premier coup : `getUserMedia()` → buffer 3s → low-pass 3kHz → normalize → tanh soft-clip → encode ADPCM. Le traitement lo-fi donne un caractere arcade authentique.

La **palette ROM patching** revele un detail hardware meconnu : les palettes CPS1 ont un **nibble de luminosite** (brightness). Le programme 68K applique un fade de luminosite via une boucle `ADD.W D2, (A0)+` a PC=0x2A6A. La recherche de palette dans la program ROM doit stripper ce nibble avant de comparer, sinon les couleurs editees ne sont pas retrouvees apres un changement de round.

### Le YM2151 WASM et la sensibilite du address latch

Decouverte d'un comportement subtil de Nuked OPM : l'adresse du registre est latchee par `_opm_write_address`, et la donnee par `_opm_write_data`. Si on ecrit l'adresse sans ecrire de donnee, le latch reste. Si on ecrit une donnee sans avoir ecrit d'adresse, elle va au dernier registre latche. Le code du FM Patch Editor supposait des ecritures atomiques (addr+data en paire), mais le Z80 peut ecrire l'adresse, faire autre chose, puis revenir ecrire la donnee bien plus tard. Source de bugs subtils dans l'override de patches.

---

## Jour 7 — Le Sprite Sheet Viewer et la chasse au pen 15 (26 mars)

### Sprite Analyzer : regrouper ce que le hardware disperse

Le CPS1 ne connait pas les "personnages". Il n'a que des OBJ entries de 16x16 pixels dans une table VRAM. Un personnage comme Ryu dans SF2 est un assemblage de 8-12 OBJ entries positionnees en grille. Le **Sprite Analyzer** (`sprite-analyzer.ts`) reconstruit les personnages a partir des primitives :

1. **Groupement par palette** — Flood-fill sur la liste OBJ : deux sprites adjacents avec la meme palette appartiennent probablement au meme personnage
2. **Proximite spatiale** — Les sprites du meme groupe doivent etre physiquement proches (tolerance de quelques pixels pour les gaps entre tiles)
3. **Contour rouge** — Overlay de debug montrant le rectangle englobant de chaque groupe detecte
4. **Center-tracking** — Le centre du groupe est suivi frame a frame, permettant de voir le personnage bouger

### Pose Capture : enregistrer le gameplay

Le Sprite Analyzer capture les poses **pendant que le joueur joue**. A chaque frame, il assemble le personnage suivi, calcule un hash de tile codes (ignorant les miroirs — flip horizontal ne change pas la pose), et compare aux poses deja vues. Les poses uniques sont stockees dans une galerie.

La deduplication par hash est critique : sans elle, une seconde de gameplay a 60fps genererait 60 entries presque identiques. Avec, on capture typiquement 15-30 poses uniques pour un personnage (idle, marche, coups, sauts, touches, KO).

### Sprite Sheet Viewer : l'editeur plein ecran

Le viewer remplace le canvas du jeu par un editeur plein ecran. A gauche, la sidebar avec toutes les poses capturees en miniature. Au centre, le sprite zoome a 4x CSS avec la grille de tiles horizontale en dessous. Cliquer sur un tile dans le strip l'ouvre dans l'editeur pixel existant.

L'architecture est un **mode switch** : le canvas du jeu est cache (`display: none`), le viewer est affiche. L'emulateur reste en pause en arriere-plan. Le bouton "Edit sprites" dans le header permet de revenir au viewer depuis le mode jeu.

### La chasse au pen 15 : le bug le plus traitre de la session

`assembleCharacter` construisait l'image composite du personnage en assemblant les tiles individuels. Pour chaque pixel, il lisait le `colorIdx` du tile decode. **Le bug : `colorIdx === 0` etait traite comme transparent.**

Mais le hardware CPS1 utilise **pen 15** comme transparent, pas pen 0. Le renderer du jeu le sait — ligne 892 de `cps1-video.ts` : `if (colorIdx === 15) continue; // transparent pen`. Mais `assembleCharacter` dans sprite-analyzer.ts avait ete ecrit independamment, avec l'hypothese (fausse) que pen 0 = transparent.

**Symptome** : les cheveux et la ceinture de Ryu apparaissaient comme des trous noirs dans le preview du Sprite Sheet Viewer. La palette etait correcte (debug logs confirmaient les changements de couleur), mais le preview ne se mettait pas a jour. Parce que les pixels pen 0 (cheveux noirs) etaient effaces au lieu d'etre dessines.

**Fix** : 1 ligne dans `sprite-analyzer.ts` — `colorIdx === 0` → `colorIdx === 15`. Et la meme correction dans la grille de tiles du viewer.

### Photo import sur scroll layers : le combat des coordonnees

Le systeme de photo import permet de dropper une image sur un scroll layer, de la redimensionner/deplacer en overlay RGBA, puis de la merger dans les tiles GFX ROM via dithering Atkinson et quantization vers la palette CPS1 16 couleurs.

**Le premier bug majeur** : les photos "suivaient la camera". Le systeme positionnait les overlays en coordonnees ecran. Quand le joueur bougeait et que le scroll defilait, la photo restait fixe a l'ecran au lieu d'etre ancree dans le monde du jeu.

**Fix** : helper `getGroupScroll()` lisant les registres de scroll CPS-A. Toutes les interactions (click, drag, resize) sont converties en coordonnees monde. Le render de l'overlay soustrait le scroll courant pour afficher au bon endroit. Les photos restent ancrees a leur position dans le decor.

**Le Tile Allocator** (`tile-allocator.ts`) resout un probleme insidieux : sur les scroll layers, plusieurs positions de la tilemap peuvent referencer le meme tile dans la GFX ROM. Si on merge une photo sur un tile partage, on corrompt tous les endroits qui utilisent ce tile. Le Tile Allocator cree des copies privees avant le merge, avec expansion automatique de la GFX ROM si necessaire. Le reverse bank mapping pour scroll1 (interleave) est particulierement delicat.

### Les commits perdus

Deux commits (`d42971e`, `e5ad1e9`) n'avaient pas ete pushes avant le merge de la PR. Le worktree local les avait, mais la branche mergee sur GitHub ne les contenait pas. Recuperation via cherry-pick depuis les refs orphelines — un rappel que `git push` avant `gh pr merge` n'est pas optionnel.

### WAV import saturation : le boost qui n'aurait pas du etre la

`encodeSample()` appliquait un gain 1.8x + tanh soft-clip a **tous** les WAV importes. Ce traitement avait ete concu pour le micro (signal faible, besoin de boost pour matcher le "hot mastering" des samples CPS1 originaux). Mais pour un WAV deja normalise, ca saturait completement.

**Fix** : parametre `boost` optionnel (default `false`). Le boost n'est applique que pour l'enregistrement micro. Les imports WAV passent sans traitement.

### UI overhaul : les details qui comptent

La fin de session est un marathon de polish UI :
- **Tool cursors** — Curseurs canvas generes programmatiquement en PNG data URL pour chaque outil (pencil, bucket, eyedropper, eraser). Plus de curseur par defaut quand on peint.
- **Layer panel open by default** — Le panneau de layers est visible au lancement avec bouton de fermeture.
- **Hamburger menu** — "Video (F2)" toggle les deux colonnes, suppression de l'entree "Sprite Editor" redondante.
- **F2/F3 shortcuts** — Fonctionnent maintenant sans ROM chargee (les panneaux sont independants de l'etat du jeu).

---

## Jour 8 — Le pivot Aseprite et l'audit (30 mars)

### L'audit qui change tout

La session commence par une demande inhabituelle : un audit complet du codebase. Structure, best practices, decoupe, testabilite. Trois agents d'exploration paralleles scannent ~31 000 lignes de source.

Le diagnostic est sans appel :
- **`sprite-editor-ui.ts` : 4 629 lignes** — le fichier le plus gros du projet. Une seule classe avec ~10 responsabilites distinctes, 12 methodes de plus de 100 lignes, zero test unitaire.
- **`frame-state.ts`** duplique byte-for-byte 5 fonctions de `cps1-video.ts`
- **`CHAR_SIZE_16 = 128`** defini 5 fois dans 5 fichiers differents
- Constantes de timing (`PIXEL_CLOCK`, `Z80_CLOCK`) dupliquees entre `emulator.ts` et `audio-worker.ts`
- Le type `manifest: any` se propage dans toute la chaine Aseprite

### Le refactoring chirurgical

L'approche : 5 extractions atomiques, chacune validee par build + 903 tests unitaires avant la suivante.

1. **`aseprite-io.ts`** (541 LOC) — Import/export Aseprite. Le plus auto-contenu : zero state interne, pur I/O fichier. Extrait en premier pour valider la methode.

2. **`capture-session.ts`** (222 LOC) — Logique de capture sprites + scroll. Une classe `CaptureManager` qui encapsule l'etat des sessions actives. Decouverte de dead code au passage : `toggleScrollCapture` etait declare mais jamais appele.

3. **Dead code** (-320 LOC) — `importTilePng`, `processImportTilePng`, `exportCurrentTile`, `importImageOnCurrentTile` — quatre methodes d'import PNG tile-par-tile qui n'etaient appelees nulle part. Remplacees par le workflow Aseprite.

4. **`sheet-viewer.ts`** (1 115 LOC) — Le plus gros morceau. Le sprite sheet viewer et le scroll set viewer partageaient beaucoup de code (lifecycle enter/exit, rendu de tiles, tile strip). Fusionnes dans un seul module `SheetViewer` avec une interface host. Le code de rendu de tile factorise dans `renderTileToImageData`.

5. **`photo-layer-ops.ts`** (340 LOC) — Operations pures photo layer (quantize, merge, magic wand, composite). Extrait en fonctions standalone.

**Resultat intermediaire** : 4 629 → 2 355 LOC. Le fichier est passable.

### Le pivot : "Work in Aseprite, play in Sprixe"

Puis vient la revelation. L'utilisateur demande : "la drop zone photo, le capture panel, c'est elimine depuis longtemps, regarde l'historique". Le systeme photo layer — import, quantize Atkinson, merge sur tiles, magic wand, drag/resize layers — est du code mort. Le workflow a pivote vers Aseprite sans que la codebase suive.

**Suppression massive** :
- `photo-layer-ops.ts` (340 LOC) — supprime entierement
- `photo-import.ts` (854 LOC) — supprime entierement
- `magic-wand.test.ts` (245 LOC) — supprime entierement
- `PhotoLayer` type, `createLayer`, champ `layers` sur `LayerGroup` — supprimes
- Drag/resize layers sur l'overlay, head selector, quantize/merge buttons dans le sheet viewer — tout supprime
- Callbacks layer panel (`onDropPhoto`, `onQuantizeLayer`, `onMergeGroup`, etc.) — supprimes

**sprite-editor-ui.ts** : 2 355 → **1 454 LOC**. Reduction totale depuis le debut de la session : **-69%**.

Le pivot est materialise dans le code : Sprixe est un pont entre la ROM et Aseprite. On capture, on exporte, on edite dans Aseprite, on reimporte. Zero edition in-app.

### La palette fantome

Bug rapporte en live : les personnages de l'ecran de selection (Punisher) apparaissent avec des couleurs fausses — violacees, fadees. Le personnage est correct dans le jeu mais les cards et le viewer montrent une palette degradee.

**Cause racine** : la palette RGB est lue depuis la VRAM au moment du rendu, pas au moment de la capture. Sur CPS1, les palettes VRAM sont dynamiques — le jeu les reecrit a chaque frame pour les effets de fade, flash, selection. Si le jeu est pause pendant un fade, ou si l'ecran a change entre la capture et le viewer, les couleurs sont fausses.

**La discussion sur "la bonne palette"** est revelante. L'utilisateur pose la question : "au moment de la capture tu n'es pas plus sur de la palette que quand on prend celle de la VRAM, il n'y a pas de bonne palette". C'est vrai — un snapshot isole n'est pas plus fiable qu'un autre. Mais l'utilisateur tranche pragmatiquement : "il suffit de REC au bon moment et basta".

**Fix scroll** : `captureScrollFrame` snapshote les 16 couleurs RGB lors de la premiere rencontre de chaque palette index. Le `ScrollSet` embarque le `capturedColors` utilise par le viewer et l'export Aseprite, avec fallback VRAM pour les anciennes captures.

**Fix sprite** : meme approche — `CapturedPose.capturedColors` stocke la palette au moment de `capturePose`. Le sheet viewer, le tile grid, et l'export Aseprite utilisent cette palette snapshotee.

### Les tests E2E : 226 echecs

En voulant valider les changements, decouverte que les tests E2E Playwright sont entierement casses. Pas a cause du refactoring — ils l'etaient deja. La cause racine : `page.goto('/')` pointait vers la **landing page** (`index.html`) au lieu de l'app (`/play/index.html`). Les tests referençaient aussi des elements DOM supprimes depuis longtemps (hamburger menu, tool buttons, undo/redo).

**Reecriture complete** : 16 fichiers de specs, ~115 tests. Chaque selecteur verifie contre le DOM actuel. Ajout d'une spec 16 dediee au workflow REC → cards → sheet → close (17 tests).

Un bug subtil dans le helper `loadTestRom` : `waitForSelector('#drop-zone.hidden')` attendait un element **visible** — mais l'element avec `.hidden` a `display: none`. Fix : `state: 'attached'` au lieu de `state: 'visible'`.

### L'auto-save : le prompt qui ment

Bug UX : "Modifications non sauvegardees trouvees" s'affiche alors qu'il n'y a aucune modification. L'auto-save cree une entree IndexedDB vide au chargement du jeu (un `onModified` spurious). Le prompt s'affiche des qu'une entree existe, sans verifier le contenu.

**Fix** : parser le JSON de l'auto-save avant d'afficher le prompt. Compter les diffs (graphics, program, OKI) et les poses. Si tout est vide, ne pas afficher. Sinon, montrer un resume : "3 tiles · 1 palette · 2 poses". Le wording passe de "Modifications non sauvegardees trouvees" a "Sauvegarde automatique trouvee".

Aussi decouvert que l'import Aseprite ne triggait pas `onModified` → pas d'auto-save apres import. Corrige.

### Le 3D qui ne tourne plus

Bug mineur mais visible : le drag rotation du mode 3D explode ne fonctionne pas quand le jeu est en pause. `onDragMove` modifiait `rotateX`/`rotateY` mais ne rappelait pas `updateExplodedTransforms()`. Quand l'emulateur tourne, le render loop applique les transforms a chaque frame. En pause, rien ne se passe.

**Fix** : une ligne — `this.updateExplodedTransforms()` a la fin de `onDragMove`.

### Lecon du jour

> La session la plus productive n'est pas celle ou on ecrit le plus de code — c'est celle ou on en supprime le plus. 4 629 → 1 454 lignes dans le fichier principal. ~3 200 lignes de dead code eliminees (photo layer, PNG import, magic wand). Et le produit est meilleur : un workflow clair (capture → Aseprite → import), des previews avec les bonnes couleurs, des tests qui passent.

> Le pivot "editing happens in Aseprite" n'etait pas un choix architectural delibere. C'est un constat. Le code photo import etait mort depuis des jours, personne ne s'en servait. L'audit l'a revele. La suppression l'a officialise. Parfois la meilleure feature c'est celle qu'on enleve.
- **Panel titles** — "Video" renomme "Tile Editor" pour le panneau droit, styles harmonises.
- **HW layer checkboxes** remplaces par des icones oeil, coherents avec les toggles de sous-layers.

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
| Durée totale | 7 jours (17-26 mars 2026) |
| Commits | ~130 |
| Lignes TypeScript | ~22 000+ |
| Insertions source totales | ~35 000+ |
| Fichiers éditeur (src/editor/) | 11 |
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

*Derniere mise a jour : 26 mars 2026*
*Sprite Analyzer, Sprite Sheet Viewer, photo import sur scroll layers, UI overhaul. Le studio prend forme.*
