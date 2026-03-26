# Spec: Tile Import/Export PNG

## Contexte

Les tiles CPS1 sont la brique atomique des graphismes : 16x16 pixels (scroll2/sprites), 8x8 (scroll1), 32x32 (scroll3), chacun indexé sur une palette de 16 couleurs. Un tile peut etre partage entre plusieurs positions dans le tilemap ou plusieurs poses d'un sprite.

### Contraintes hardware

- **16 couleurs max par tile** (4 bits par pixel)
- **Pen 15 = transparent** (sprites et scrolls)
- **Tiles partages** : un meme tile code peut apparaitre a N positions dans la VRAM (tilemap scroll ou OBJ table)
- **Bank mapper** : les tile codes sont mappes via un PAL physique — la taille de la GFX ROM est fixe, pas d'expansion possible pour un export MAME compatible
- **Palette par tile** : pour les scroll layers, chaque entree du tilemap a son propre index de palette. Pour les sprites, tous les tiles d'un OBJ entry partagent la meme palette.

### Pourquoi pas d'import PNG sur une pose complete ou un scroll

- **Tiles partages** : importer une image complete ecrit dans les tiles de la ROM. Si un tile est utilise ailleurs, l'ailleurs change aussi. L'artiste ne peut pas le savoir sans visualiser le refCount.
- **Palette par tile (scrolls)** : chaque tile du tilemap peut avoir une palette differente. Un degrede peint par l'artiste a travers 4 tiles avec 4 palettes = desastre a la re-quantization.
- **Aucun outil externe** ne connait le format CPS1. Aseprite, Photoshop, YY-CHR — aucun ne gere le bank mapper, les tiles partages, la palette par sprite.

---

## Export PNG

### Export de pose (sprite sheet viewer)

- **Quoi** : la pose selectionnee, assemblee depuis les tiles GFX ROM + palette
- **Format** : PNG transparent (pen 15 = alpha 0), taille native (ex: 32x96)
- **Usage** : reference visuelle pour l'artiste, pas pour re-import direct
- **Ou** : bouton "Export Pose" dans le header du sprite sheet viewer
- **Nom** : `pose_{index}.png`

### Export de tile individuel

- **Quoi** : un seul tile 16x16 (ou 8x8 / 32x32 selon le layer)
- **Format** : PNG indexe 16 couleurs, palette embarquee, pen 15 = alpha 0
- **Usage** : l'artiste edite ce tile dans son outil (Aseprite, Photoshop, GIMP)
- **Ou** :
  - Panneau droit (tile editor) : bouton "Export Tile" sous le canvas de tile zoome
  - Sprite sheet viewer : bouton sur chaque mini-tile de la tile strip
- **Nom** : `tile_{hex_code}.png`

---

## Import PNG (tile individuel uniquement)

### Principe

L'import se fait sur **un seul tile a la fois**. L'artiste a edite le PNG exporte, il le reimporte. Le systeme :

1. Charge le PNG
2. Verifie les dimensions (doit matcher le tile : 16x16, 8x8, ou 32x32)
3. Quantize chaque pixel vers la palette du tile (nearest color RGB euclidean)
4. Pixel transparent (alpha < 128) = pen 15
5. Ecrit dans la GFX ROM a l'offset du tile

### Warning "Shared"

Avant l'ecriture, si le tile est partage (refCount > 1) :

```
Ce tile est utilise a {N} positions.
Modifier ce tile affectera :
- Pose 0 (idle), Pose 3 (walk1), Pose 7 (punch)
- Scroll 2 : 2 positions dans le tilemap

[Ecrire quand meme] [Annuler]
```

L'artiste decide en connaissance de cause.

### Ou

- **Panneau droit** (tile editor) : bouton "Import Tile" a cote de "Export Tile"
  - Importe sur le tile actuellement selectionne (`editor.currentTile`)
  - La palette utilisee est celle du tile selectionne

- **Sprite sheet viewer** (tile strip) : bouton/drop zone sur chaque mini-tile
  - Importe sur le tile clique
  - La palette utilisee est celle du sprite group (`spriteCapture.palette`)

### Validation a l'import

| Controle | Action si KO |
|----------|-------------|
| Dimensions != tile size | Erreur : "Image must be {W}x{H} pixels" |
| Plus de 15 couleurs opaques + 1 transparente | Warning : "Image has {N} colors, will be quantized to 16" |
| Alpha partielle (0 < a < 128) | Traite comme opaque (a >= 128) ou transparent (a < 128) |

---

## Hors scope

- **Import PNG sur pose complete** : trop de risques (tiles partages, palette unique pour tous les tiles mais refCount variable)
- **Import PNG sur scroll layer** : impossible proprement (palette par tile differente dans le tilemap)
- **Format .cps1sprite** : format de projet avec metadonnees (palette, refCount, layout). A specifier separement si besoin d'un workflow externe avance.
- **Expansion GFX ROM** : ne pas proposer — l'export MAME serait incompatible. Si pas assez de tiles libres, refuser l'operation.

---

## Warning MAME (lie mais separe)

### Au merge photo (scroll layers)

Si le merge declenche une expansion GFX ROM (`gfxRom.length > originalSize`) :

```
GFX ROM expanded ({old} -> {new} bytes).
Export will NOT be MAME compatible.
```

Toast warning visible 5 secondes.

### A l'export ZIP

Si `gfxRom.length > originalGraphicsRom.length` :

```
Warning: GFX ROM has been expanded.
The exported ROM set may not work in MAME.
Continue anyway?

[Export] [Cancel]
```

---

## Implementation

### Fichiers a modifier

| Fichier | Changement |
|---------|-----------|
| `src/editor/sprite-editor-ui.ts` | Boutons export/import tile dans le panneau droit + sprite sheet viewer |
| `src/editor/sprite-editor-ui.ts` | Modifier `importPosePng` → `importTilePng` (un seul tile) |
| `src/editor/sprite-editor-ui.ts` | Warning shared avant ecriture |
| `src/editor/sprite-editor-ui.ts` | Warning MAME au merge |
| `src/rom-store.ts` | Warning MAME a l'export ZIP |
| `src/editor/tile-refs.ts` | Deja OK (`findTileReferences`) |

### Raccourcis

| Action | Raccourci |
|--------|-----------|
| Export tile | (bouton uniquement) |
| Import tile | (bouton uniquement) |
