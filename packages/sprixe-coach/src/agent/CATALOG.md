# AI Fighter — Catalogue modes & personas

Document de design pour l'IA-adversaire contrôlable par Claude.
Deux tables : (1) les MODES, templates de comportement exécutés en 60Hz ;
(2) les PERSONAS, personnalités qui biaisent le choix de mode et donnent
une voix au combattant.

---

## 1. MODES (comportement paramétrique)

Un mode est une fonction `onTick(state, ctx) → action` appelée chaque frame.
Priorités descendantes dans la décision : réflexes critiques (anti-air,
block projectile) > buts spécifiques au mode > neutre.

### A. `TURTLE_SPACE_CONTROL` — Zoner patient
Garde la distance, spam Hadouken, anti-air sur jump.

| Distance | Action |
|---|---|
| P1 saute en range 40-160px | **Anti-air Shoryu** |
| P1 attaque et dist < 120px | **Block crouch** |
| dist > 180px + sequencer libre | **Hadouken jab** |
| dist < 150px | **Walk back** |
| sinon | neutre |

### B. `RUSH_DOWN_CORNER` — Pression close
Agressif rapproché, throws et pokes rapides.

| Condition | Action |
|---|---|
| P1 saute en range 40-160px | **Anti-air Shoryu** |
| P1 fireball (state=0x0C) | **Block** |
| dist < 60px | **Standing jab pressure** |
| dist > 80px | **Walk forward** |

### C. `ANTI_FIREBALL_MOBILE` — Sauts par-dessus
Quand le joueur zone trop, on vole au-dessus des boules.

| Condition | Action |
|---|---|
| P1 lance fireball + dist 200-320px | **Jump forward + HP** (saut MP en attaque) |
| P1 saute en range | **Anti-air Shoryu** |
| dist < 100px et au sol | **Tatsumaki** (traverse) |
| sinon | Walk forward patient |

### D. `TRAP_SETUP` — Feintes et lectures
Simule un pattern pour inciter une réaction prévisible, puis punish.

| Phase | Action |
|---|---|
| Setup (5s) | **Fake Hadouken** (motion sans release = bluff) |
| Si P1 réagit (jump-in ou dash) | **Shoryu ou throw** |
| Si pas de réaction | Retourne mode précédent |

### E. `DESPERATION_BLITZ` — Panique haute vitesse
HP < 20%, il reste peu de temps. Tout ou rien.

| Condition | Action |
|---|---|
| dist < 120px | **Jump-in + Tatsu** |
| dist > 150px | **Run + Hadouken jab (spam)** |
| cornered | **Reversal Shoryu sur wakeup** |

### F. `GROUND_FOOTSIES` — Combat de jambes sobre
Jeu d'espacement pur, pokes au sol (cr.MK), pas de jumps.

| Condition | Action |
|---|---|
| dist 100-160px | **Crouching MK** (poke) |
| dist < 100px | **Throw attempt** |
| P1 saute | **Anti-air Shoryu** |
| dist > 200px | Walk forward |

### G. `WAKEUP_PRESSURE` — Oki après knockdown
P1 est tombé, on enchaîne la pression.

| Phase | Action |
|---|---|
| P1 en knockdown (state=0x14) | **Walk forward près** |
| P1 wakeup détecté | **Mix-up** : 50% jump-in, 50% throw |
| P1 reversal | **Block** |

### H. `DEFENSIVE_SWITCH` — Répli en panique
HP désavantage critique, on bétonne en attendant une ouverture.

| Condition | Action |
|---|---|
| P1 attaque | **Block crouch** |
| P1 whiff | **Walk back** (pas de punish direct) |
| Timer < 20s et HP avantage | reste passif |

---

## 2. PERSONAS (personnalité IA)

Chaque persona a : un nom, une voix ElevenLabs FR, un prompt système
spécifique, et un biais de sélection de modes.

### I. `DAIGO` — Le sage patient
- **Voix** : grave, posée
- **Biais** : démarre TURTLE_SPACE_CONTROL, évite DESPERATION_BLITZ
- **Narration** : phrases longues, analytiques. *"Il est impatient, j'attends."*

### II. `TOKIDO` — Le boucher
- **Voix** : rapide, sec
- **Biais** : démarre RUSH_DOWN_CORNER, enchaîne vite avec WAKEUP_PRESSURE
- **Narration** : phrases courtes, chambreuses. *"Pas le temps."*

### III. `BOGARD_TRICKSTER` — Le piégeur
- **Voix** : malicieuse, narquoise
- **Biais** : démarre TRAP_SETUP, beaucoup de switches entre modes
- **Narration** : *"Tu vas tomber dans le piège, attends."*

### IV. `HYPE_BOY` — Le débutant agité
- **Voix** : jeune, excitée
- **Biais** : switch aléatoirement entre RUSH_DOWN et DESPERATION_BLITZ
- **Narration** : *"YOLOOO !"*, se fait surprendre, commente panique

### V. `MAX_RETRO` — Le vieux caster (la persona de Max qu'on a déjà)
- **Voix** : caster FR passionné
- **Biais** : moyennement équilibré, mix modes
- **Narration** : *"Allez j'y vais pépère, technique propre."*

---

## 3. Player profiler (stats calculées en live)

Claude reçoit toutes les 5s :

```
FENÊTRE 10s RÉCENTES :
- Moves P1 utilisés : Hadouken×3 whiff, Shoryu×1 hit, jump-in×2, throw×0
- Moves P2 (moi) : walk-fwd×5, cr.MK×3, Hadouken×2, Shoryu×1 whiff
- Style P1 détecté : ZONER AGRESSIF (ratio fireball/rush élevé)
- Style P2 (moi) : devenu PRÉVISIBLE (même séquence 3x)
- HP : 75 vs 85  |  Distance moyenne : 200px  |  Corner : non
- Timer : 62s   |  Round : 1   |  Avantage : moi (+10 HP)
- Ma phase : fin mode TURTLE, temps de switcher
```

---

## 4. Ordre d'implémentation

1. ✅ InputSequencer + motions library (fait)
2. ✅ Hook InputManager virtual P2 (fait)
3. ✅ AiFighter avec anti-air réflexe (fait)
4. **En cours** : Mode interface + ModeManager + 2 modes codés (A, B)
5. Player profiler (basique : comptages + style labels)
6. Claude analyste : prompt + appel périodique, choix de mode
7. Personas : prompt par persona + voix assignée
8. 6 modes restants (C à H)
9. Tuning et tests
