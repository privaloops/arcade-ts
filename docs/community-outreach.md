# Strategie de communication — Discord Aseprite

## 1. Analyse des canaux

### #aseprite-dev (priorite haute)

Canal technique oriente extensions et plugins Lua Aseprite. Les discussions tournent autour des contraintes hardware retro, profils couleur par console, palettes indexees. C'est l'audience la plus alignee avec ROMstudio.

Precedent positif : le "Retro Color Picker" (Mega Drive/NES/SNES) de DaniSC23 a ete tres bien recu. La philosophie "contraintes hardware + workflow Aseprite" est exactement celle de ROMstudio.

### #game-dev (priorite moyenne)

Canal "show & tell" avec des projets indie. Niveau varie. Culture retro presente (pico-8, GB Studio). Un fighting game pixel art avec MUGEN/Ikemen Go (lien direct Street Fighter / CPS1). Des gens cherchent activement des workflows tilemap. Aucun projet d'emulation ou romhacking — ROMstudio serait unique ici.

### #pixelart (priorite basse)

Contenu visuel. Utile pour poster des captures/GIFs du workflow en action.

---

## 2. Contacts et profils cles

| Profil | Canal | Pertinence |
|--------|-------|------------|
| **DaniSC23** | #aseprite-dev | Retro Color Picker (MD/NES/SNES). Philosophie identique a ROMstudio. Contact prioritaire pour synergie potentielle. |
| **din ven** | #aseprite-dev | 6 mois sur l'API Lua Aseprite (Brush Manager Pro). Connaissance profonde de l'ecosysteme extensions. |
| **Rad Fighter** | #game-dev | Fighting game pixel art avec MUGEN/Ikemen Go. Lien direct avec l'univers CPS1 / Street Fighter. |
| **blip** | #game-dev | Cherche un workflow tilemap Aseprite. Le scroll export de ROMstudio repond exactement a ce besoin. |

---

## 3. Positionnement par canal

### #aseprite-dev

**Angle technique** : ROMstudio comme outil qui lit/ecrit nativement le format .aseprite (indexed 8bpp) avec les contraintes hardware CPS1 (16 couleurs par palette, transparent = index 15). Mettre en avant le round-trip complet ROM <-> Aseprite.

**Ce qui accroche ici** : le fait que le fichier .aseprite embarque un manifeste JSON avec les adresses ROM pour le write-back. C'est un usage technique du format que personne d'autre ne fait.

### #game-dev

**Angle workflow** : "capturer des sprites/tilemaps d'un jeu arcade, les editer dans Aseprite, les reinjecter dans la ROM en temps reel". Montrer le resultat visuel (avant/apres).

**Ce qui accroche ici** : la demo visuelle. Un GIF de Street Fighter avec un sprite modifie dans Aseprite qui apparait immediatement dans le jeu.

### #pixelart

**Angle visuel pur** : captures du sprite sheet viewer, comparaisons avant/apres edition. Pas de technique, juste le rendu.

---

## 4. Templates de messages

### #aseprite-dev

```
I've been building ROMstudio, a CPS1 arcade studio in the browser that uses
Aseprite as its sprite/tilemap editor.

The workflow: capture sprites or scroll layers from a running CPS1 game, export
them as native .aseprite files (indexed 8bpp, 16-color CPS1 palettes), edit in
Aseprite, then import back — tiles are written directly to the GFX ROM and
re-rendered in real-time.

Each .aseprite file embeds a JSON manifest in User Data with ROM addresses for
round-trip write-back. Scroll tilemaps use deduplicated tilesets.

Built in TypeScript with WebGL2. Open source.

Repo: [link]

Would love feedback from people working with indexed palettes and hardware
constraints — this is essentially an Aseprite-native ROM editor.
```

### #game-dev

```
Sharing a project: ROMstudio — a CPS1 (Street Fighter II, Final Fight, etc.)
arcade studio that runs in the browser.

The main feature for pixel artists: you can capture any sprite or background
from a running game, export it as an .aseprite file, edit it in Aseprite, and
import it back. The changes show up in the game immediately.

It handles CPS1 hardware constraints automatically (16-color palettes, tile
deduplication, indexed 8bpp). You work in Aseprite like normal — the tool
handles the ROM encoding.

Open source, runs in any browser with WebGL2.

[link] | [GIF of the workflow]
```

### #pixelart

```
Editing Street Fighter II sprites directly from the arcade ROM — captured in
ROMstudio, edited in Aseprite, re-imported in real-time.

CPS1 hardware: 16-color indexed palettes, 16x16 tiles.

[screenshot or GIF]
```

---

## 5. Recrutement beta testeurs

### Profil recherche

Pixel artists utilisant Aseprite au quotidien. Pas besoin de connaissances en emulation ou romhacking — ROMstudio gere les contraintes hardware. L'ideal : quelqu'un qui edite des sprites, teste le round-trip (export → edit → import), et remonte les frictions dans le workflow.

### Ou recruter

| Canal | Approche |
|-------|----------|
| #aseprite-dev | Demander directement apres le post principal. Les profils techniques ici testeront aussi les edge cases du format .aseprite |
| #game-dev | Cibler les gens qui partagent du pixel art retro ou cherchent des workflows tilemap |
| #pixelart | Poster un avant/apres et proposer l'acces beta en echange de feedback |

### Template de recrutement (a ajouter en fin de post ou en message separe)

```
Looking for a few pixel artists to beta test the Aseprite workflow.

What you'd do: capture sprites from a CPS1 game, export to .aseprite, edit
them in Aseprite, import back, and tell me what feels broken or confusing.

No emulation knowledge needed — just Aseprite. The tool handles the rest.

DM me if interested.
```

---

## 6. Mots-cles par audience

### #aseprite-dev
- indexed 8bpp
- hardware palette constraints
- .aseprite native format
- User Data / JSON manifest
- round-trip write-back
- ROM addresses
- tile deduplication

### #game-dev
- Aseprite workflow
- sprite capture
- tilemap export
- real-time preview
- retro / arcade / CPS1
- Street Fighter, Final Fight
- open source

### #pixelart
- pixel art editing
- arcade sprites
- retro hardware
- before/after
- CPS1 palette
