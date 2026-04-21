# DSL AI-Fighter — Catalogue conditions & actions

Inventaire des primitives que Claude combine pour composer une policy
dynamique. À valider avant de coder.

Convention : `if` = liste de conditions ANDées (toutes vraies), `do` =
action (motion ou held state), `outcome` = `win` / `neutral` / `loss`
/ `trade` pour la difficulté adaptative.

---

## CONDITIONS

Les conditions sont des **primitives élémentaires** que Claude combine
librement. Une règle matche si **toutes** les conditions listées dans
son `if` sont vraies au tick courant.

### Distance (4 niveaux)
- `dist_close` — `|p1.x - p2.x| < 80`
- `dist_mid` — 80-180
- `dist_far` — 180-280
- `dist_fullscreen` — > 280

### Mouvement P1 (7 états mutuellement exclusifs)
- `p1_idle` — stateByte=0 ET pas d'input (rien ne bouge)
- `p1_walking_forward` — stateByte=0x02, dx vers moi
- `p1_walking_back` — stateByte=0x02, dx s'éloigne
- `p1_crouching` — stateByte=0x06
- `p1_blocking` — détecté via animPtr (à calibrer) ou state défensif
- `p1_jump_forward` — stateByte=0x04 + dx vers moi
- `p1_jump_back` — stateByte=0x04 + dx s'éloigne
- `p1_jump_neutral` — stateByte=0x04 + dx ≈ 0

### Attaques P1 (5)
- `p1_attacking_normal` — stateByte=0x0A + attacking (normal)
- `p1_attacking_special` — stateByte=0x0C + attacking (Hadouken/Shoryu/Tatsu)
- `fireball_flying` — 10-60 frames depuis le dernier special projectile de P1
- `p1_whiffed_special` — special vient de finir sans hit (window 30f)
- `p1_whiffed_normal` — normal fini sans hit

### Statut P1 (3)
- `p1_stunned` — stunCounter > 32 (dizzy, free combo)
- `p1_knockdown` — transition vers stateByte knockdown
- `p1_in_hitstun` — reçoit un coup en ce moment

### Mon statut (3)
- `me_stunned` — ma stunCounter > 32
- `me_knockdown` — je me relève
- `me_in_hitstun` — je suis touché

### Position (3)
- `cornered_me` — ma x < 120 ou > 880
- `cornered_them` — p1.x < 120 ou > 880
- `midscreen` — personne coincé

### HP (5)
- `hp_lead_big` — +50
- `hp_lead_small` — +10 à +50
- `hp_neutral` — -10 à +10
- `hp_behind_small` — -10 à -50
- `hp_behind_big` — -50+

### Vitality seuils (2)
- `near_death_me` — mon HP < 20%
- `near_death_them` — leur HP < 20%

### Timer (3)
- `round_start` — premières 3s
- `timer_low` — < 20s
- `round_finishing` — < 10s

---

## ACTIONS

### Specials (9)
- `hadouken_jab` / `hadouken_strong` / `hadouken_fierce`
- `shoryu_jab` / `shoryu_strong` / `shoryu_fierce`
- `tatsu_lk` / `tatsu_mk` / `tatsu_hk`

### Normals ground (10)
- `standing_jab` / `standing_strong` / `standing_fierce`
- `standing_short` / `standing_forward` / `standing_rh`
- `crouch_jab` / `crouch_short`
- `crouch_mk` (footsie king)
- `sweep` (c.HK knockdown)

### Jumps & air (6)
- `jump_neutral` / `jump_forward_hk` / `jump_forward_mk` / `jump_forward_hp`
- `empty_jump` (bait anti-air)
- `jump_back` (évasion)

### Mouvement (3)
- `walk_forward` / `walk_back` / `neutral` (wait)

### Block (2)
- `block_crouch` / `block_stand`

### Throws (2)
- `throw_forward` / `throw_back`

### Combos enchaînés (5)
- `cr_mk_hadouken` — classic footsie cancel
- `jump_hk_cr_mk_hadouken` — full confirm combo
- `cr_jab_x3_throw` — tick throw
- `standing_hp_tatsu` — buffer
- `jump_mk_cross_combo` — cross-up setup

### Setups oki (3)
- `meaty_cr_mk_on_wakeup`
- `crossup_tatsu`
- `safe_jump_in`

### Losing actions (5 — pour erreurs humaines crédibles)
- `walk_into_fireball` — bête
- `whiff_shoryu_midscreen` — se fait punir
- `whiff_throw` — punishable
- `jump_without_attack` — se prend un anti-air
- `block_stand_on_low` — block la mauvaise hauteur

---

## EXEMPLES DE RÈGLES COMPOSÉES

```json
{
  "rules": [
    // JUMP ADVERSE — priorité max quand proche, ignoré si loin
    { "if": ["p1_jump_forward", "dist_close"], "do": "shoryu_jab",          "weight": 0.75, "outcome": "win" },
    { "if": ["p1_jump_forward", "dist_close"], "do": "shoryu_fierce",       "weight": 0.15, "outcome": "win" },
    { "if": ["p1_jump_forward", "dist_close"], "do": "jump_without_attack", "weight": 0.10, "outcome": "loss" },

    { "if": ["p1_jump_forward", "dist_mid"],   "do": "walk_back",           "weight": 0.50, "outcome": "neutral" },
    { "if": ["p1_jump_forward", "dist_mid"],   "do": "shoryu_jab",          "weight": 0.30, "outcome": "trade" },
    { "if": ["p1_jump_forward", "dist_mid"],   "do": "block_crouch",        "weight": 0.20, "outcome": "neutral" },

    { "if": ["p1_jump_back", "dist_mid"],      "do": "walk_forward",        "weight": 0.50, "outcome": "win" },
    { "if": ["p1_jump_back", "dist_mid"],      "do": "hadouken_jab",        "weight": 0.50, "outcome": "win" },

    { "if": ["p1_jump_neutral", "dist_mid"],   "do": "walk_forward",        "weight": 0.60, "outcome": "win" },
    { "if": ["p1_jump_neutral", "dist_mid"],   "do": "hadouken_jab",        "weight": 0.40, "outcome": "trade" },

    // FIREBALL — chaque distance appelle une réponse différente
    { "if": ["fireball_flying", "dist_far"],   "do": "jump_forward_hk",     "weight": 0.30, "outcome": "win" },
    { "if": ["fireball_flying", "dist_far"],   "do": "block_crouch",        "weight": 0.30, "outcome": "neutral" },
    { "if": ["fireball_flying", "dist_far"],   "do": "hadouken_fierce",     "weight": 0.25, "outcome": "trade" },
    { "if": ["fireball_flying", "dist_far"],   "do": "walk_into_fireball",  "weight": 0.05, "outcome": "loss" },
    { "if": ["fireball_flying", "dist_far"],   "do": "empty_jump",          "weight": 0.10, "outcome": "neutral" },

    { "if": ["fireball_flying", "dist_mid"],   "do": "jump_forward_mk",     "weight": 0.40, "outcome": "win" },
    { "if": ["fireball_flying", "dist_mid"],   "do": "shoryu_fierce",       "weight": 0.20, "outcome": "win" },
    { "if": ["fireball_flying", "dist_mid"],   "do": "block_crouch",        "weight": 0.40, "outcome": "neutral" },

    { "if": ["fireball_flying", "dist_close"], "do": "block_crouch",        "weight": 0.80, "outcome": "neutral" },
    { "if": ["fireball_flying", "dist_close"], "do": "shoryu_jab",          "weight": 0.20, "outcome": "win" },

    // P1 IDLE — réponses par distance
    { "if": ["p1_idle", "dist_close"],         "do": "throw_forward",       "weight": 0.35, "outcome": "win" },
    { "if": ["p1_idle", "dist_close"],         "do": "cr_jab_x3_throw",     "weight": 0.25, "outcome": "win" },
    { "if": ["p1_idle", "dist_close"],         "do": "tatsu_lk",            "weight": 0.15, "outcome": "trade" },
    { "if": ["p1_idle", "dist_close"],         "do": "whiff_throw",         "weight": 0.10, "outcome": "loss" },
    { "if": ["p1_idle", "dist_close"],         "do": "standing_jab",        "weight": 0.15, "outcome": "neutral" },

    { "if": ["p1_idle", "dist_mid"],           "do": "walk_forward",        "weight": 0.40, "outcome": "win" },
    { "if": ["p1_idle", "dist_mid"],           "do": "crouch_mk",           "weight": 0.30, "outcome": "win" },
    { "if": ["p1_idle", "dist_mid"],           "do": "hadouken_jab",        "weight": 0.15, "outcome": "trade" },
    { "if": ["p1_idle", "dist_mid"],           "do": "neutral",             "weight": 0.15, "outcome": "neutral" },

    { "if": ["p1_idle", "dist_far"],           "do": "hadouken_fierce",     "weight": 0.50, "outcome": "win" },
    { "if": ["p1_idle", "dist_far"],           "do": "walk_forward",        "weight": 0.30, "outcome": "win" },
    { "if": ["p1_idle", "dist_far"],           "do": "hadouken_strong",     "weight": 0.20, "outcome": "win" },

    // P1 WALKING BACK — il fuit, on le poursuit
    { "if": ["p1_walking_back", "dist_far"],   "do": "hadouken_fierce",     "weight": 0.50, "outcome": "win" },
    { "if": ["p1_walking_back", "dist_far"],   "do": "walk_forward",        "weight": 0.50, "outcome": "win" },
    { "if": ["p1_walking_back", "dist_mid"],   "do": "walk_forward",        "weight": 0.60, "outcome": "win" },
    { "if": ["p1_walking_back", "dist_mid"],   "do": "crouch_mk",           "weight": 0.40, "outcome": "win" },

    // P1 CROUCHING — overhead mix-up potentiel
    { "if": ["p1_crouching", "dist_mid"],      "do": "jump_forward_mk",     "weight": 0.40, "outcome": "win" },
    { "if": ["p1_crouching", "dist_mid"],      "do": "crouch_mk",           "weight": 0.40, "outcome": "trade" },
    { "if": ["p1_crouching", "dist_mid"],      "do": "sweep",               "weight": 0.20, "outcome": "win" },

    // PUNISH WINDOW — moments faciles, on ne se trompe pas
    { "if": ["p1_whiffed_special"],            "do": "cr_mk_hadouken",      "weight": 0.5, "outcome": "win" },
    { "if": ["p1_whiffed_special"],            "do": "shoryu_fierce",       "weight": 0.3, "outcome": "win" },
    { "if": ["p1_whiffed_special"],            "do": "walk_forward",        "weight": 0.2, "outcome": "win" },

    { "if": ["p1_stunned"],                    "do": "jump_hk_cr_mk_hadouken", "weight": 1.0, "outcome": "win" },

    // CORNER — situations clés
    { "if": ["cornered_them", "dist_close"],   "do": "meaty_cr_mk_on_wakeup","weight": 0.40, "outcome": "win" },
    { "if": ["cornered_them", "dist_close"],   "do": "throw_forward",       "weight": 0.30, "outcome": "win" },
    { "if": ["cornered_them", "dist_close"],   "do": "cr_jab_x3_throw",     "weight": 0.30, "outcome": "win" },

    { "if": ["cornered_me"],                   "do": "shoryu_fierce",       "weight": 0.40, "outcome": "win" },
    { "if": ["cornered_me"],                   "do": "jump_back",           "weight": 0.30, "outcome": "neutral" },
    { "if": ["cornered_me"],                   "do": "block_crouch",        "weight": 0.30, "outcome": "neutral" }
  ],
  "fallback": { "do": "walk_forward" }
}
```

---

## ORDRE D'ÉVALUATION

À chaque tick, le moteur :

1. Évalue toutes les conditions (bool par primitive)
2. Liste les règles dont TOUTES les conditions matchent
3. Parmi les matched, trouve le groupe de priorité le plus haut :
   - 🔴 CRITIQUE : `p1_jump_forward + dist_close` (anti-air)
   - 🟠 URGENT : `me_stunned`, `me_knockdown`, `p1_stunned`, `p1_whiffed_special`
   - 🟡 NORMAL : fireball, cornered_me, p1_attacking_close
   - 🟢 NEUTRE : p1_idle, p1_walking_*, dist_only
4. Tirage pondéré par `weight` parmi ce groupe
5. Si sequencer busy → skip, continuer la motion en cours
6. Si aucune règle → `fallback`

---

## PRIORITY GROUPS (à définir plus finement)

| Group | Conditions clés | Pourquoi |
|---|---|---|
| CRITICAL | `p1_jump_forward + dist_close/mid` | fenêtre anti-air = 5 frames, pas négociable |
| SURVIVAL | `me_knockdown`, `cornered_me + near_death_me` | vie en jeu |
| CAPITALIZE | `p1_stunned`, `p1_knockdown`, `p1_whiffed_special` | gros damage gratuit |
| DEFENSIVE | `p1_attacking_close`, `fireball_flying` | block obligatoire |
| NEUTRAL | `p1_idle_*`, `p1_walking_*`, `dist_*` | jeu de neutre, liberté |

---

## VALIDATION

- [ ] Conditions : distances, états mouvement, attaques, statuts, HP, timer, position — complet ?
- [ ] Actions : specials, normals, jumps, moves, block, throws, combos, setups, losing — complet ?
- [ ] Priority groups cohérents ?
- [ ] Des règles manquantes sur des situations qu'on veut couvrir ?
- [ ] Exemple de policy couvre bien les 4 distances × 7 états P1 ?
