# Neo-Geo Test Matrix

Test date: 2026-04-14
Tester: Thibaut

## Results

| # | Jeu | Boot | Video | Audio | Jouable | Bugs |
|---|-----|------|-------|-------|---------|------|
| 1 | aof | OK | KO | ? | Non | Sprites ennemis déstructurés (bug CPU, non résolu) |
| 2 | blazstar | OK | ? | OK | ? | ~~son trop aigu~~ ADPCM-B fix (PR #171) |
| 3 | fatfury1 | OK | OK | KO | Partiel | ~~sprites invisibles~~ X position fix. Son in-game absent (Z80 sound driver issue) |
| 4 | garou | OK | OK | OK | OK | ~~fix layer~~ CMC fix (PR #170) + ADPCM-B fix (PR #171) |
| 5 | kof97 | OK | OK | OK | OK | ~~anims trop rapides~~ auto-anim fix (PR #170) |
| 6 | kof98 | OK | OK | OK | OK | ~~anims trop rapides~~ auto-anim fix (PR #170) |
| 7 | kof99 | OK | OK | OK | OK | ~~anims + fix layer~~ auto-anim + CMC fix (PR #170) |
| 8 | lastbld2 | KO | - | - | Non | BIOS eye-catcher boucle, game code s'exécute mais attract mode ne s'affiche pas |
| 9 | maglord | OK | OK | OK | OK | Parfait |
| 10 | mslug | OK | OK | OK | OK | Parfait |
| 11 | mslug2 | OK | OK | OK | OK | ~~synthé manquant~~ ADPCM-B fix (PR #171) |
| 12 | mslug3 | OK | OK | OK | OK | ~~fix layer + scroll + sons~~ CMC fix + ADPCM-B fix (PR #170, #171) |
| 13 | ncombat | OK | OK | OK | OK | Parfait (référence) |

### Non testés

| # | Jeu | Profil technique |
|---|-----|-----------------|
| 14 | kof98 | Banking, zoom |
| 15 | samsho2 | Zoom/shrink |
| 16 | rbff2 | Zoom, gros roster |
| 17 | mslugx | Protection MSLUGX |
| 18 | shocktro | Beaucoup de sprites |
| 19 | pulstar | Shoot, gros assets |
| 20 | sengoku2 | Beat'em'up |
| 21 | wjammers | Baseline |
| 22 | ssideki2 | Sports |
| 23 | pbobbl2n | Puzzle |
| 24 | samsho5 | Très gros, zoom |

---

## Bugs identifiés — par priorité

### ~~BUG 1 — Fix layer non rendu~~ RÉSOLU (PR #170)

### ~~BUG 2 — Animations background trop rapides~~ RÉSOLU (PR #170)

### BUG 3 — Audio in-game absent ou partiel (PARTIELLEMENT RÉSOLU)
**Résolu** : blazstar, mslug2, mslug3 — ADPCM-B fix (PR #171)
**Non résolu** : fatfury1 — son intro/menus OK mais silence dès le combat. Les commandes son arrivent au worker mais le Z80 game sound driver ne produit pas d'audio. Nécessite debug Z80 du M-ROM 033-m1.m1.

### BUG 4 — Sprites déstructurés (NON RÉSOLU)
**Jeux affectés** : aof
**Symptôme** : Sprites ennemis mal assemblés (tiles mélangées, forme correcte). Héros OK.
**Diagnostic** : Rendu vérifié identique à MAME. VRAM SCB2 data correcte. Cause probable : bug CPU 68K dans le code de gestion des ennemis. Nécessite comparaison side-by-side avec MAME debugger.

### ~~BUG 5 — Sprites invisibles par moments~~ RÉSOLU
Sprite X position: seuil signé, masque sticky, off-screen skip alignés sur MAME.

### ~~BUG 6 — Scroll saccadé + bandes verticales~~ RÉSOLU
mslug3 fonctionne correctement après les fixes CMC + ADPCM-B.

### BUG 7 — Boot bloqué au BIOS (NON RÉSOLU)
**Jeux affectés** : lastbld2
**Diagnostic** : Le BIOS eye-catcher boucle. Le game code S'EXÉCUTE (0x1006-0x1974 en attract mode via SWPROM/SWPBIOS). SRAM valide ("BACKUP RAM OK !"). Le problème est que l'attract mode ne s'affiche pas visuellement — bug vidéo spécifique au mode attract, pas un vrai blocage boot.

---

## Bugs restants

| Priorité | Bug | Impact | Jeux |
|----------|-----|--------|------|
| 1 | Audio fatfury1 in-game | Pas de son en combat | fatfury1 |
| 2 | Sprites déstructurés (CPU) | Visuels ennemis cassés | aof |
| 3 | lastbld2 attract mode | Jeu ne s'affiche pas | lastbld2 |

## Jeux OK (référence)

- **ncombat** — Parfait (baseline simple, 1990)
- **maglord** — Parfait (baseline simple, 1990)
- **mslug** — Parfait (run'n'gun, 1996)
