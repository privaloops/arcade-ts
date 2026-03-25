# Spec: Sprite Analyzer + Photo Import

## Vue d'ensemble

Deux features complémentaires pour ROMstudio :

1. **Sprite Analyzer** — Analyse un sprite multi-tile, scanne la GFX ROM pour trouver toutes les variantes (frames d'animation, poses), expose le personnage complet dans toutes ses déclinaisons.

2. **Photo Import** — Upload une photo, détourage, pixelisation, quantization palette, placement sur le sprite (entier ou partiel), nettoyage des pixels résiduels, propagation sur toutes les variantes trouvées par l'Analyzer.

---

## Phase 1 : Sprite Analyzer

### Objectif

Quand l'utilisateur clique sur "Analyze" sur un sprite sélectionné :
- Pause le jeu
- Lit le sprite complet (tous les tiles nx × ny)
- Scanne la GFX ROM pour trouver les variantes
- Affiche toutes les variantes dans un panneau galerie

### Entrée

Le sprite sélectionné via `SpriteEditor._currentTile`, qui contient :
- `tileCode` : code du tile dans la GFX ROM (mappé)
- `rawCode` : code brut dans l'OBJ buffer
- `paletteIndex` : index palette (groupe 0x00-0x1F pour sprites)
- `nx`, `ny` : dimensions du sprite en tiles (ex: 2×4 = 32×64 pixels)
- `nxs`, `nys` : position du sous-tile sélectionné dans le sprite
- `flipX`, `flipY` : état flip du sprite
- `spriteIndex` : index dans l'OBJ buffer (pour retrouver la position écran)
- `gfxRomOffset` : offset dans la graphics ROM
- `charSize` : CHAR_SIZE_16 = 128 bytes par tile

### Étape 1 : Lire le sprite complet

```typescript
// Depuis sprite-editor.ts, on a déjà le tile sélectionné.
// Pour le sprite complet, calculer les tile codes de tous les sous-tiles.
// CPS1 multi-tile sprites : base_code + sub_offset selon nx/ny.
// Voir selectNeighborTile() dans sprite-editor.ts pour la formule exacte.

interface SpriteFrame {
  tileCodes: number[];   // nx*ny tile codes (GFX ROM mapped)
  pixels: Uint8Array[];  // nx*ny arrays de 256 pixels (16x16 chacun, valeurs 0-15)
  paletteIndex: number;
  nx: number;
  ny: number;
  flipX: boolean;
  flipY: boolean;
}
```

Pour lire les pixels d'un tile : utiliser `readTile(gfxRom, tileCode, CHAR_SIZE_16)` de `tile-encoder.ts`.

### Étape 2 : Scanner la GFX ROM

**Approche : scan par base tile code**

Les sprites CPS1 multi-tiles utilisent des tile codes consécutifs. Un sprite 2×4 avec base code 0x100 utilise les tiles 0x100-0x107 (arrangement ligne par ligne). Le même personnage dans une autre frame d'animation aura un autre base code (ex: 0x110-0x117).

Algorithme :
1. Calculer le `baseCode` du sprite actuel (le premier tile code du sprite)
2. Lire les pixels des nx×ny tiles du sprite → `referencePixels[]`
3. Pour chaque `candidateBase` de 0 à `maxTileCode` (= gfxRom.length / CHAR_SIZE_16) :
   - Assembler les nx×ny tiles à partir de `candidateBase` (même layout que le sprite original)
   - Comparer pixel par pixel avec `referencePixels[]`
   - Calculer le score : `matchingPixels / totalPixels`
   - Si score > seuil (configurable, défaut 60%) → ajouter aux résultats
4. Aussi tester les variantes flippées (H, V, H+V)

**Optimisations :**
- Skip les tiles vides (tous pixels = 0)
- Early exit : si les 2 premiers tiles matchent < 30%, skip le reste
- Comparer d'abord un sous-ensemble de pixels (1 sur 4) pour un filtre rapide, puis comparer tous les pixels sur les candidats qui passent

**Seuil de similarité :**
- Exact match (>95%) : même frame, probablement mirroré
- High match (70-95%) : variante légère (bouche ouverte/fermée, yeux)
- Medium match (50-70%) : pose différente mais même personnage
- Low match (<50%) : probablement un autre personnage → exclure

### Étape 3 : Grouper les résultats

```typescript
interface AnalysisResult {
  reference: SpriteFrame;           // le sprite source
  variants: SpriteVariant[];        // toutes les variantes trouvées
}

interface SpriteVariant {
  baseCode: number;                 // base tile code dans GFX ROM
  tileCodes: number[];              // tous les tile codes
  gfxRomOffsets: number[];          // offsets dans la GFX ROM (pour écriture)
  score: number;                    // 0-1, similarité avec la référence
  flipH: boolean;                   // true si match trouvé en flip horizontal
  flipV: boolean;                   // true si match trouvé en flip vertical
  assembled: ImageData;             // sprite assemblé pour preview (canvas)
}
```

### Étape 4 : UI

**Bouton "Analyze"** dans le sprite editor (à côté des outils), visible seulement quand un sprite multi-tile est sélectionné.

**Panneau résultats** (nouvelle zone sous l'éditeur ou panneau flottant) :
- Header : "Found X variants of [nx×ny] sprite"
- Grille de miniatures : chaque variante rendue comme un petit canvas
- Miniature cliquable → sélectionne cette variante dans l'éditeur
- Checkbox "Select all" pour les opérations batch
- Slider de seuil de similarité (60-95%) pour affiner les résultats
- Badge de score sur chaque miniature

---

## Phase 2 : Photo Import

### Objectif

Importer une photo sur un sprite (ou une sélection de tiles), avec détourage automatique, pixelisation, et placement propre.

### Entrée

- Une image uploadée par l'utilisateur (photo, PNG, JPG)
- Le sprite cible (soit le sprite courant, soit une variante de l'Analyzer)
- Mode : "Full body" ou "Head only" (l'utilisateur choisit la zone)

### Pipeline

#### Étape 1 : Upload + Crop interactif

```typescript
// Input: File depuis <input type="file"> ou drag & drop
// Output: ImageData recadrée sur la zone d'intérêt

// 1. Charger l'image dans un canvas
const img = new Image();
img.src = URL.createObjectURL(file);
// 2. Afficher un outil de crop (rectangle redimensionnable)
// 3. L'utilisateur ajuste le cadrage
// 4. Extraire la zone croppée comme ImageData
```

Alternative simplifiée V1 : pas de crop interactif, l'image entière est utilisée. Le détourage fait le reste.

#### Étape 2 : Détourage (background removal)

**Approche simple (V1) :**
- Détecter la couleur de fond (coin top-left ou couleur la plus fréquente sur les bords)
- Flood fill depuis les bords avec tolérance couleur
- Les pixels du fond → transparent (alpha = 0)

**Approche avancée (V2) :**
- Utiliser `OffscreenCanvas` avec un modèle ML (optionnel, futur)
- Ou demander à l'utilisateur d'uploader une image déjà détourée (PNG avec alpha)

```typescript
function removeBackground(imageData: ImageData, tolerance: number = 30): ImageData {
  // 1. Sample background color from corners
  // 2. For each pixel: if distance to bg color < tolerance → set alpha to 0
  // 3. Flood fill from edges for connected component removal
  return cleanedImageData;
}
```

#### Étape 3 : Resize

Redimensionner l'image détourée aux dimensions exactes du sprite :
- Largeur = nx × 16 pixels
- Hauteur = ny × 16 pixels

Utiliser un resize nearest-neighbor (pas de lissage — on veut du pixel art net).

```typescript
function resizeNearestNeighbor(src: ImageData, targetW: number, targetH: number): ImageData {
  const dst = new ImageData(targetW, targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.floor(x * src.width / targetW);
      const srcY = Math.floor(y * src.height / targetH);
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * targetW + x) * 4;
      dst.data[di] = src.data[si];       // R
      dst.data[di+1] = src.data[si+1];   // G
      dst.data[di+2] = src.data[si+2];   // B
      dst.data[di+3] = src.data[si+3];   // A
    }
  }
  return dst;
}
```

#### Étape 4 : Quantization palette

Mapper chaque pixel de l'image vers la couleur la plus proche dans la palette 16 couleurs du sprite.

```typescript
function quantizeToPalette(
  image: ImageData,
  palette: Array<[number, number, number]> // 16 couleurs RGB du sprite
): Uint8Array {
  // Output: array de palette indices (0-15), un par pixel
  const indices = new Uint8Array(image.width * image.height);
  for (let i = 0; i < indices.length; i++) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    const a = image.data[i * 4 + 3];
    if (a < 128) {
      indices[i] = 0; // transparent → color 0
    } else {
      indices[i] = findClosestPaletteIndex(r, g, b, palette);
    }
  }
  return indices;
}

function findClosestPaletteIndex(
  r: number, g: number, b: number,
  palette: Array<[number, number, number]>
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 1; i < palette.length; i++) { // skip index 0 (transparent)
    const [pr, pg, pb] = palette[i];
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}
```

#### Étape 4b : Mode "Custom Palette" (option 2)

Au lieu de mapper vers la palette existante, recalculer une palette optimale pour la photo importée.

**Quand l'utiliser :** quand les couleurs du sprite original sont trop éloignées de la photo (ex: photo bleue sur un sprite beige). L'utilisateur active ce mode via un toggle "Custom Palette".

**Algorithme : Median Cut (quantization optimale)**

```typescript
function generateOptimalPalette(
  image: ImageData,
  numColors: number = 15, // 15 car color 0 = transparent (réservé)
): Array<[number, number, number]> {
  // 1. Collecter tous les pixels non-transparents
  const pixels: Array<[number, number, number]> = [];
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3]! >= 128) { // ignorer transparent
      pixels.push([image.data[i]!, image.data[i + 1]!, image.data[i + 2]!]);
    }
  }

  // 2. Median Cut : diviser récursivement l'espace couleur
  //    en numColors buckets, prendre la moyenne de chaque bucket
  const palette = medianCut(pixels, numColors);

  // 3. Slot 0 = transparent (noir/0x0000), slots 1-15 = couleurs calculées
  return [[0, 0, 0], ...palette];
}

function medianCut(
  pixels: Array<[number, number, number]>,
  numBuckets: number,
): Array<[number, number, number]> {
  if (numBuckets <= 1 || pixels.length === 0) {
    // Moyenne du bucket
    if (pixels.length === 0) return [[0, 0, 0]];
    let r = 0, g = 0, b = 0;
    for (const [pr, pg, pb] of pixels) { r += pr; g += pg; b += pb; }
    const n = pixels.length;
    return [[Math.round(r / n), Math.round(g / n), Math.round(b / n)]];
  }

  // Trouver le canal avec la plus grande étendue (range)
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const [r, g, b] of pixels) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (g < minG) minG = g; if (g > maxG) maxG = g;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
  }
  const rangeR = maxR - minR, rangeG = maxG - minG, rangeB = maxB - minB;
  const channel = rangeR >= rangeG && rangeR >= rangeB ? 0 : (rangeG >= rangeB ? 1 : 2);

  // Trier par ce canal et couper au milieu
  pixels.sort((a, b) => a[channel]! - b[channel]!);
  const mid = Math.floor(pixels.length / 2);
  const left = pixels.slice(0, mid);
  const right = pixels.slice(mid);

  const leftBuckets = Math.ceil(numBuckets / 2);
  const rightBuckets = numBuckets - leftBuckets;
  return [
    ...medianCut(left, leftBuckets),
    ...medianCut(right, rightBuckets),
  ];
}
```

**Écriture de la palette dans la ROM :**

```typescript
function applyCustomPalette(
  vram: Uint8Array,
  programRom: Uint8Array,
  romStore: RomStore,
  paletteBase: number,
  paletteIndex: number,
  newPalette: Array<[number, number, number]>,
): void {
  // Écrire chaque couleur dans VRAM + program ROM
  for (let i = 0; i < 16; i++) {
    const [r, g, b] = newPalette[i]!;
    // 1. Patch program ROM (brightness-aware search, déjà implémenté)
    const newWord = encodeColor(r, g, b);
    romStore.patchProgramPalette(vram, paletteBase, paletteIndex, i, newWord);
    // 2. Écrire dans VRAM pour effet immédiat
    writeColor(vram, paletteBase, paletteIndex, i, r, g, b);
  }
}
```

**Encodage CPS1 :** `encodeColor(r, g, b)` de `palette-editor.ts` gère la conversion lossy RGB → 16-bit CPS1 (4-bit brightness + 4-bit R + 4-bit G + 4-bit B). La palette effective sera une approximation 12-bit des couleurs calculées.

**Warning palette partagée :**

Avant d'appliquer, le système doit :
1. Scanner la GFX ROM pour trouver TOUS les tiles qui utilisent cette palette index
2. Compter combien de sprites/tiles distincts l'utilisent
3. Afficher un warning : "Cette palette est utilisée par X sprites. Modifier la palette affectera tous ces sprites."
4. Preview : afficher quelques sprites impactés avec l'ancienne et la nouvelle palette
5. L'utilisateur confirme ou annule

```typescript
function findPaletteUsers(
  video: CPS1Video,
  paletteIndex: number,
): { spriteCount: number; tileCount: number; sampleSprites: number[] } {
  const objBuffer = video.getObjBuffer();
  const sprites: number[] = [];

  // Scanner l'OBJ buffer (256 sprites max en CPS1)
  for (let i = 0; i < 256; i++) {
    const entryOff = i * 8;
    const attribs = (objBuffer[entryOff + 4]! << 8) | objBuffer[entryOff + 5]!;
    const spritePalette = (attribs >> 8) & 0x1F; // bits 12-8 = palette group
    if (spritePalette === (paletteIndex & 0x1F)) {
      sprites.push(i);
    }
  }

  return {
    spriteCount: sprites.length,
    tileCount: sprites.length, // approximation, 1 sprite = 1+ tiles
    sampleSprites: sprites.slice(0, 5), // 5 premiers pour preview
  };
}
```

**Résumé des deux modes :**

| Mode | Palette | Avantage | Risque |
|------|---------|----------|--------|
| "Match Palette" (défaut) | Garde la palette existante du sprite | Aucun impact sur les autres sprites | Couleurs limitées, résultat parfois éloigné de la photo |
| "Custom Palette" | Recalcule 15 couleurs optimales pour la photo | Rendu fidèle, couleurs adaptées | Tous les sprites partageant cette palette changent de couleurs |

#### Étape 5 : Placement dans les tiles

Découper l'image quantizée en blocs de 16×16 et écrire dans chaque tile.

```typescript
function placeOnSprite(
  gfxRom: Uint8Array,
  tileCodes: number[],     // nx*ny tile codes du sprite
  quantized: Uint8Array,   // palette indices (nx*16 × ny*16)
  nx: number, ny: number,
  charSize: number,        // CHAR_SIZE_16 = 128
  flipX: boolean,
  flipY: boolean,
): void {
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const tileIdx = ty * nx + tx; // ou l'arrangement CPS1 approprié
      const tileCode = tileCodes[tileIdx];

      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          // Coordonnées dans l'image complète
          let imgX = tx * 16 + px;
          let imgY = ty * 16 + py;

          // Appliquer les flips si nécessaire
          if (flipX) imgX = nx * 16 - 1 - imgX;
          if (flipY) imgY = ny * 16 - 1 - imgY;

          const colorIndex = quantized[imgY * (nx * 16) + imgX];
          writePixel(gfxRom, tileCode, charSize, px, py, colorIndex);
          // writePixel existe déjà dans tile-encoder.ts
        }
      }
    }
  }
}
```

#### Étape 6 : Nettoyage

Si l'image importée ne couvre pas tout le sprite (ex: juste la tête sur un sprite corps entier), les tiles non couvertes doivent être nettoyées :
- Pixels de l'ancien sprite qui sont EN DEHORS de la zone importée → mis à 0 (transparent)
- Cela évite les résidus de l'ancien design

```typescript
// Pour chaque pixel du sprite :
// - Si dans la zone importée : écrire le pixel quantizé
// - Si hors zone importée ET mode "clean" : écrire 0 (transparent)
// - Si hors zone importée ET mode "preserve" : ne pas toucher (garder l'ancien)
```

L'utilisateur choisit le mode via un toggle "Clean surrounding" (défaut: ON).

#### Étape 7 : Propagation (avec Sprite Analyzer)

Si l'Analyzer a trouvé des variantes :
1. Pour chaque variante cochée dans la galerie
2. Appliquer le même placement (mêmes pixels quantizés)
3. Ajuster les flips si la variante est flippée

```typescript
for (const variant of selectedVariants) {
  placeOnSprite(
    gfxRom,
    variant.tileCodes,
    quantized,
    nx, ny,
    CHAR_SIZE_16,
    variant.flipH !== reference.flipX, // XOR des flips
    variant.flipV !== reference.flipY,
  );
}
```

**Note importante :** La propagation est "best effort". Les variantes avec des poses très différentes (ex: personnage accroupi vs debout) ne peuvent pas recevoir la même image. L'utilisateur doit pouvoir décocher les variantes inadaptées dans la galerie.

#### Étape 8 : Preview + Confirmation

Avant d'écrire dans la ROM :
1. Afficher un preview du résultat (sprite assemblé avec la nouvelle image)
2. Bouton "Apply" pour confirmer
3. Bouton "Cancel" pour annuler
4. Le preview est rendu dans un canvas temporaire, pas dans la ROM

Après "Apply" :
1. Écrire dans la GFX ROM via `writePixel` (tile-encoder.ts)
2. Appeler `emulator.rerender()` pour voir le résultat en direct
3. Le RomStore détecte automatiquement `isModified('graphics')` → exportable

---

## Fichiers à créer / modifier

### Nouveaux fichiers

| Fichier | Rôle |
|---------|------|
| `src/editor/sprite-analyzer.ts` | Logique de scan GFX ROM, comparaison tiles, groupement variantes |
| `src/editor/photo-import.ts` | Pipeline photo : détourage, resize, quantize, placement |

### Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/editor/sprite-editor-ui.ts` | Bouton "Analyze", bouton "Import Photo", panneau galerie, panneau preview |
| `src/editor/sprite-editor.ts` | Méthode `getFullSprite()` pour lire tous les tiles du sprite courant |
| `src/editor/tile-encoder.ts` | Aucune modif nécessaire (`readTile`, `writePixel`, `readPixel` existent déjà) |
| `src/styles/main.css` | Styles pour galerie variantes + panneau import photo |

### Dépendances existantes utilisées

| Module | Fonctions utilisées |
|--------|-------------------|
| `tile-encoder.ts` | `readTile()`, `writePixel()`, `readPixel()`, `CHAR_SIZE_16` |
| `palette-editor.ts` | `readPalette()`, `decodeColor()` |
| `sprite-editor.ts` | `_currentTile`, `selectNeighborTile()` (formule de layout multi-tile) |
| `cps1-video.ts` | `getGraphicsRom()`, `inspectSpriteAt()`, `getObjBuffer()` |

---

## Contraintes techniques CPS1

- **16 couleurs max par tile** (4 bits par pixel)
- **Tiles 16×16 fixes** — pas de taille variable
- **Palette partagée** — tous les tiles d'un sprite utilisent la même palette
- **Color 0 = transparent** — réservé, ne pas utiliser pour des pixels visibles
- **Flip H/V** — géré au niveau sprite (OBJ buffer), pas au niveau tile
- **GFX ROM mappée** — les tile codes passent par `gfxromBankMapper()` avant d'accéder à la ROM

---

## UX Flow

```
1. Utilisateur sélectionne un sprite (clic sur l'écran)
2. Clic "Analyze" → pause + scan GFX ROM
3. Galerie s'affiche avec toutes les variantes trouvées
4. Clic "Import Photo" → file picker
5. Image chargée → preview du détourage
6. Ajustement crop si nécessaire
7. Preview du résultat pixelisé sur le sprite
8. Cocher les variantes à propager
9. Clic "Apply" → écriture GFX ROM
10. Résultat visible en direct dans l'émulateur
11. Export ROM → ZIP avec les modifications
```

---

## Phase 3 : Mobile Photo Booth

### Objectif

Scanner un QR code avec son mobile, se positionner dans les contours du sprite en temps réel via la caméra, capturer la photo, la transférer automatiquement au desktop.

### Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Desktop   │         │  Vercel (relay)   │         │   Mobile    │
│  ROMstudio  │         │                  │         │  Navigateur │
│             │         │                  │         │             │
│ 1. Génère   │─ GET ──→│ /api/capture/:id │←─ POST ─│ 4. Envoie   │
│    session  │         │                  │         │    la photo │
│    ID       │         │  Vercel KV       │         │             │
│             │         │  (Redis, TTL 60s)│         │ 3. Capture  │
│ 2. Affiche  │         │                  │         │    photo    │
│    QR code  │         │                  │         │             │
│             │         │                  │         │ 2. Caméra + │
│ 5. Poll GET │─ GET ──→│  Retourne image  │         │    overlay  │
│    récupère │←────────│  si disponible   │         │    contours │
│    la photo │         │                  │         │             │
│             │         │                  │         │ 1. Scan QR  │
│ 6. Pipeline │         └──────────────────┘         │    → ouvre  │
│    import   │                                      │    la page  │
└─────────────┘                                      └─────────────┘
```

### Côté Desktop (ROMstudio)

#### Étape 1 : Générer la session

```typescript
// Générer un ID unique
const sessionId = crypto.randomUUID().slice(0, 8); // ex: "a3f7c2b1"

// Données à transmettre au mobile via l'URL
const spriteData = {
  sessionId,
  // Contours du sprite pour l'overlay mobile
  outlineImage: spriteOutlineAsDataURL, // PNG transparent, contours blancs
  width: nx * 16,   // largeur sprite en pixels
  height: ny * 16,  // hauteur sprite en pixels
};
```

#### Étape 2 : Afficher le QR code

```typescript
// URL encodée dans le QR code
const captureUrl = `https://romstudio.vercel.app/capture/${sessionId}`;

// Générer le QR code (librairie: qrcode-generator ou canvas natif)
// L'afficher dans un modal/panneau du sprite editor
```

Le QR code contient l'URL. Les données sprite (contours) sont stockées côté serveur dans Vercel KV au moment de la création de session.

#### Étape 3 : Polling

```typescript
async function pollForCapture(sessionId: string): Promise<Blob | null> {
  const maxAttempts = 120; // 60 secondes à 500ms
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`/api/capture/${sessionId}`);
    if (res.status === 200) {
      return res.blob(); // Photo reçue
    }
    // 204 = pas encore de photo
    await new Promise(r => setTimeout(r, 500));
  }
  return null; // Timeout
}
```

### Côté Serveur (Vercel API Routes)

#### Route POST : Mobile envoie la photo

```typescript
// api/capture/[id].ts (Vercel Edge Function)
import { kv } from '@vercel/kv';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  // Vérifier que la session existe
  const session = await kv.get(`session:${id}`);
  if (!session) return new Response('Session expired', { status: 404 });

  // Stocker la photo (base64, max ~5MB)
  const imageBuffer = await request.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString('base64');
  await kv.set(`photo:${id}`, base64, { ex: 60 }); // expire 60s

  return new Response('OK', { status: 200 });
}
```

#### Route GET : Desktop récupère la photo

```typescript
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const base64 = await kv.get<string>(`photo:${id}`);
  if (!base64) return new Response(null, { status: 204 }); // Pas encore de photo

  const buffer = Buffer.from(base64, 'base64');
  // Supprimer après récupération (one-shot)
  await kv.del(`photo:${id}`);

  return new Response(buffer, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  });
}
```

#### Route POST : Desktop crée la session + envoie les contours

```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await request.json();

  // Stocker la session avec les contours du sprite
  await kv.set(`session:${id}`, {
    outlineImage: body.outlineImage, // data URL PNG
    width: body.width,
    height: body.height,
  }, { ex: 120 }); // expire 2 minutes

  return new Response('OK', { status: 200 });
}
```

### Côté Mobile (Page web servie par Vercel)

#### Page `/capture/[id]` (HTML/JS statique servi par Vercel)

```typescript
// 1. Récupérer les données de session
const session = await fetch(`/api/session/${sessionId}`).then(r => r.json());

// 2. Ouvrir la caméra
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: 640, height: 480 }
});
const video = document.querySelector('video');
video.srcObject = stream;

// 3. Overlay des contours du sprite
const overlayCanvas = document.querySelector('#overlay');
const overlayCtx = overlayCanvas.getContext('2d');
const outlineImg = new Image();
outlineImg.src = session.outlineImage;
// Dessiner les contours en semi-transparent par-dessus le flux caméra
// Centré, mis à l'échelle pour matcher la zone de capture

// 4. Bouton "Capture"
captureBtn.addEventListener('click', async () => {
  // Prendre un snapshot du flux vidéo
  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = session.width;
  captureCanvas.height = session.height;
  const ctx = captureCanvas.getContext('2d');

  // Calculer le crop pour extraire la zone alignée aux contours
  // (centre du flux vidéo, mis à l'échelle)
  const scale = Math.min(video.videoWidth / session.width, video.videoHeight / session.height);
  const sx = (video.videoWidth - session.width * scale) / 2;
  const sy = (video.videoHeight - session.height * scale) / 2;
  ctx.drawImage(video, sx, sy, session.width * scale, session.height * scale,
                        0, 0, session.width, session.height);

  // Convertir en JPEG et envoyer
  const blob = await new Promise(r => captureCanvas.toBlob(r, 'image/jpeg', 0.9));
  await fetch(`/api/capture/${sessionId}`, {
    method: 'POST',
    body: blob,
  });

  // Confirmation visuelle
  document.body.textContent = 'Photo envoyée !';
  stream.getTracks().forEach(t => t.stop());
});
```

#### Style de la page mobile

- Plein écran, pas de chrome navigateur (mode immersif)
- Flux caméra en fond, contours du sprite en overlay semi-transparent (blanc, 50% opacité)
- Les contours reprennent le **style graphique du jeu** : outlines épaisses pixel-art, couleurs du sprite en transparence pour guider le placement
- Gros bouton "Capture" en bas
- Feedback visuel : flash blanc au moment de la capture

### Style imitation sprite

Le pipeline de quantization (Phase 2, Étape 4) produit naturellement un rendu pixel-art puisqu'il :
1. Resize en nearest-neighbor (pas de lissage → pixels nets)
2. Réduit à 16 couleurs exactes du sprite (même palette = même style visuel)
3. Résolution très basse (32×64 pour un sprite typique)

Pour renforcer le style du jeu :
- **Contours noirs** : détecter les bords du sujet (différence de luminosité > seuil entre pixels voisins) et forcer ces pixels à la couleur la plus sombre de la palette. Les sprites CPS1 (SF2, Final Fight) ont des outlines noires caractéristiques.
- **Ombrage simplifié** : les zones sombres de la photo → couleurs sombres de la palette, zones claires → couleurs claires. Le nearest-color matching fait ça naturellement.
- **Pas de dithering** : contrairement à certains convertisseurs, ne PAS appliquer de dithering (Floyd-Steinberg etc.). Les sprites CPS1 utilisent des aplats de couleur, pas du dithering.

---

## Fichiers supplémentaires (Phase 3)

| Fichier | Rôle |
|---------|------|
| `src/editor/photo-booth.ts` | Logique desktop : génération session, QR code, polling, réception photo |
| `api/capture/[id].ts` | Vercel API route : stockage/récupération photo via KV |
| `api/session/[id].ts` | Vercel API route : stockage/récupération données session |
| `public/capture/index.html` | Page mobile : caméra + overlay contours + bouton capture |
| `public/capture/capture.js` | JS mobile : getUserMedia, overlay, envoi photo |

### Dépendances à ajouter

| Package | Usage |
|---------|-------|
| `@vercel/kv` | Redis KV pour relay photo (gratuit, tier hobby) |
| `qrcode` (ou génération canvas) | Génération QR code côté client |

---

## Résumé des phases

| Phase | Feature | Complexité | Dépendance |
|-------|---------|-----------|------------|
| 1 | Sprite Analyzer | Moyenne | Aucune |
| 2 | Photo Import (fichier) | Moyenne | Phase 1 pour propagation |
| 3 | Mobile Photo Booth | Haute | Phase 2 + Vercel KV |

Chaque phase est livrable indépendamment. Phase 1 est utile seule (exploration ROM). Phase 2 fonctionne avec un simple file picker. Phase 3 ajoute le "wow factor" mobile.
