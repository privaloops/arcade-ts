# Spec: ROMstudio Layer Editor

## Vue d'ensemble

Un éditeur de calques photo non-destructif pour modifier les graphismes CPS1 en temps réel. Fonctionne sur les sprites (personnages) et les scroll layers (décors). Chaque image importée crée un calque indépendant, éditable et positionnable, fusionné dans les tiles de la ROM uniquement au merge.

---

## Architecture

### Layout UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ Colonne gauche     │      Canvas central         │ Colonne droite  │
│ (Panneau calques)  │      (Éditeur visuel)       │ (Outils pixel)  │
│                    │                              │                 │
│ ▾ Scroll 2         │   [Sprite ou scroll affiché  │ Pixel Tools:    │
│   📷 decor.jpg 👁  │    avec calques superposés]  │  Pencil (B)     │
│   📷 graffiti 👁   │                              │  Eraser (X)     │
│ ▾ Scroll 3         │                              │  Eyedropper (I) │
│   📷 ciel.jpg  👁  │                              │  Magic Wand (G) │
│ ▾ Sprite: Guy      │                              │  Fill           │
│   (15 poses)       │                              │                 │
│   📷 visage   👁   │                              │ Palette:        │
│   📷 logo     👁   │                              │  [16 couleurs]  │
│                    │                              │                 │
│ [Drop zone]        │                              │ [Merge All]     │
└─────────────────────────────────────────────────────────────────────┘
```

### Structure des données

```typescript
interface PhotoLayer {
  id: string;
  name: string;              // "visage.jpg", editable
  rgbaData: ImageData;       // photo brute RGBA (affichée avant quantize)
  rgbaOriginal: ImageData;   // original full-res pour resize lossless
  pixels: Uint8Array;        // palette indices (après quantize)
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  quantized: boolean;
  visible: boolean;
}

interface LayerGroup {
  type: 'scroll' | 'sprite';
  layerId?: number;          // LAYER_SCROLL1/2/3 pour les scrolls
  spriteCapture?: {          // pour les sprites
    poses: CapturedPose[];
    palette: number;
  };
  layers: PhotoLayer[];      // calques ordonnés (dernier = dessus)
}
```

### Groupes par layer CPS1

Les calques sont groupés par layer cible. Chaque groupe est dépliable/repliable dans le panneau gauche.

- **Scroll layers** : grille de tiles fixe. Drop → calque → quantize → merge écrit dans le tilemap.
- **Sprite group** : créé par la capture de poses. Les calques se superposent à la même position relative sur chaque pose. Au merge, on écrit dans les tiles de toutes les poses capturées.

---

## Sprites : identification + capture

### Regroupement du personnage

CPS1 compose les personnages à partir de 10-15 sprites individuels 1×1 dans l'OBJ buffer. L'identification repose sur :

1. **Regroupement** : flood-fill sur les OBJ entries partageant la même palette et dont les bounding boxes 16×16 se touchent (tolérance 2px)
2. **Contour rouge** : affiché en temps réel sur le jeu (overlay canvas) pour valider visuellement le regroupement
3. **Tracking** : entre deux frames, le personnage est retrouvé par palette + centre le plus proche

### Capture des poses

```
1. Clic sur un sprite → regroupement → contour rouge → bouton "Start Capture"
2. L'utilisateur joue normalement (marche, frappe, saute...)
3. À chaque frame, le système :
   a. Regroupe les sprites de même palette
   b. Trouve le groupe le plus proche du centre précédent (tracking)
   c. Capture les tile codes + positions relatives
   d. Déduplique par tile codes triés (pose miroir = même pose)
4. "Stop Capture" → galerie de toutes les poses uniques
5. Clic sur une pose dans la galerie → l'affiche dans l'éditeur central
```

---

## Pipeline photo

### Chargement (RGBA, non-destructif)

```
1. Drop image → loadImageData()
2. cropToContent() → retire les bords vides
3. resizeBilinear() → fit dans les bounds max, aspect ratio préservé
4. → Calque RGBA créé (photo brute, pleine qualité)
```

La photo reste en RGBA tant que l'utilisateur ne quantize pas. Le resize se fait toujours depuis l'original (pas de dégradation compound).

### Quantization (Atkinson dithering)

Via la lib `image-q` (TypeScript natif, ~30 KB) :

```
1. Boost saturation (+30%) → couleurs plus vives
2. image-q PointContainer depuis les pixels RGBA
3. Palette CPS1 fixe (16 couleurs du layer cible, skip index 0 = transparent)
4. Atkinson dithering + EuclideanBT709 distance
5. → Palette indices (Uint8Array), prêt pour l'édition pixel et le merge
```

Atkinson est préféré à Floyd-Steinberg car il ne propage que 6/8 de l'erreur → highlights/shadows restent nets au lieu de ditherer en bruit. Meilleur rendu pixel art.

---

## Panneau calques (colonne gauche)

| Élément | Action |
|---------|--------|
| Groupe (▾ Scroll 2, ▾ Sprite: Guy) | Clic = déplie/replie les calques |
| Calque (📷 visage.jpg) | Clic = sélectionne le calque actif |
| Oeil (👁) | Toggle visibilité |
| Drag & drop entre calques | Réordonne dans le groupe |
| Bouton Quantize (par calque) | RGBA → palette indices |
| Bouton Delete (par calque) | Supprime le calque |
| Drop zone en bas | Drop image = nouveau calque dans le groupe actif |

---

## Outils pixel (colonne droite)

S'appliquent au calque actif sélectionné (quantizé uniquement) :

| Outil | Raccourci | Action |
|-------|-----------|--------|
| Pencil | B | Peint avec la couleur active |
| Eraser | X | Met le pixel du calque à transparent → tile original visible |
| Eyedropper | I | Pick depuis le composite (calque + tiles) |
| Magic Wand | G | Flood fill par couleur similaire → efface une zone du calque |
| Fill | F | Remplit une zone avec la couleur active |

### Contrôles du calque sélectionné

| Action | Raccourci |
|--------|-----------|
| Déplacer | Shift+flèches (pixel par pixel) ou drag sur le canvas |
| Resize | +/- (proportionnel, depuis l'original RGBA, bilinéaire) |

---

## État d'un calque

| État | Resize | Move | Edit pixels | Merge |
|------|--------|------|-------------|-------|
| RGBA (brut) | Oui | Oui | Non | Non |
| Quantized | Non (re-quantize si besoin) | Oui | Oui | Oui |

---

## Rendu composite

```
Pour chaque pixel de l'éditeur :
  1. Lire le pixel original du tile (GFX ROM)
  2. Pour chaque calque du groupe (du bas vers le haut) :
     - Si visible ET pixel non-transparent → ce pixel gagne
  Le dernier calque visible avec un pixel non-transparent s'affiche.
```

---

## Merge

- **Par groupe** : fusionne tous les calques quantizés dans les tiles du layer cible
- **Scrolls** : écrit dans les tiles du tilemap
- **Sprites** : écrit dans les tiles de toutes les poses capturées
- Les calques mergés sont supprimés
- Les calques non-quantizés ne sont pas mergés (warning)

---

## Recoloration costume

Alternative au photo import pour le corps : changer la couleur des vêtements via la palette.

**Principe :** un pantalon utilise 3-4 indices de palette (base, ombre, highlight). Changer ces entrées recolore instantanément tous les tiles, toutes les frames.

**Flow :**
1. Clic sur une zone du personnage (pantalon)
2. Système identifie la famille de couleurs (même teinte, luminosités différentes)
3. Color picker → nouvelle couleur de base
4. Recalcul des variantes en préservant les rapports de luminosité
5. Preview live → Apply → patch palette VRAM + program ROM

---

## Phase future : déformation faciale

Utiliser MediaPipe Face Mesh (478 landmarks, browser WASM) pour générer des variantes de la photo importée : bouche ouverte/fermée, yeux plissés, tête penchée. À la résolution CPS1 (32×48px pour une tête), des changements de 2-3 pixels suffisent.

## Phase future : Mobile Photo Booth

Scanner un QR code, se positionner dans les contours du sprite via la caméra mobile, capturer et transférer au desktop via Vercel KV relay.

---

## Contraintes techniques CPS1

- **16 couleurs max par tile** (4 bits par pixel)
- **Tiles 16×16 fixes**
- **Palette partagée** — tous les tiles d'un sprite/scroll utilisent la même palette
- **Color 0 = transparent**
- **Flip H/V** — géré au niveau sprite (OBJ buffer)
- **GFX ROM mappée** — les tile codes passent par `gfxromBankMapper()`

---

## Fichiers

| Fichier | Rôle |
|---------|------|
| `src/editor/sprite-analyzer.ts` | Regroupement sprites OBJ, tracking, capture poses, dédoublonnage |
| `src/editor/photo-import.ts` | Pipeline photo : load RGBA, resize, quantize (image-q Atkinson), placement tiles |
| `src/editor/sprite-editor-ui.ts` | UI : bouton capture, galerie poses, canvas éditeur, calques, outils pixel |
| `src/editor/sprite-editor.ts` | Logique outils pixel, undo/redo, palette |
| `src/styles/main.css` | Styles panneau calques, éditeur, galerie |

## Dépendances

| Package | Usage |
|---------|-------|
| `image-q` | Quantization Atkinson dithering + distance perceptuelle (~30 KB) |

---

## Résumé des phases

| Phase | Feature | Complexité | Statut |
|-------|---------|-----------|--------|
| 1a | Regroupement sprites + contour rouge | Faible | Done |
| 1b | Capture poses par gameplay + galerie | Moyenne | Done |
| 1c | Calque photo unique (RGBA → quantize → merge) | Moyenne | Done (V1) |
| 2a | Système multi-calques + panneau gauche | Haute | À faire |
| 2b | Support scroll layers | Moyenne | À faire |
| 2c | Recoloration costume (palette swap) | Faible | À faire |
| 3a | Déformation faciale (Face Mesh) | Haute | Futur |
| 3b | Mobile Photo Booth | Haute | Futur |
