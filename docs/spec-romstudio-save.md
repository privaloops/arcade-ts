# Spec: Fichier de sauvegarde ROMstudio (`.romstudio`)

## Contexte

ROMstudio permet de modifier les graphismes (tiles), palettes (couleurs) et samples audio (OKI ADPCM) d'un jeu CPS1. Actuellement, toutes ces modifications sont perdues au rechargement de la page. L'utilisateur ne peut exporter qu'un ZIP MAME complet.

Le fichier `.romstudio` capture l'etat des modifications de maniere legere (diffs sparse), sans inclure la ROM originale. Il est inutile sans la ROM du jeu.

---

## Format

Extension : `.romstudio`
Contenu : JSON (UTF-8)
Compression : aucune (les diffs sparse sont deja compacts)

### Schema

```json
{
  "version": 1,
  "gameName": "ffight",
  "createdAt": "2026-03-27T14:30:00Z",
  "modifiedAt": "2026-03-27T15:45:00Z",

  "diffs": {
    "graphics": [
      { "offset": 38400, "bytes": "base64..." }
    ],
    "program": [
      { "offset": 4096, "bytes": "base64..." }
    ],
    "oki": [
      { "offset": 1024, "bytes": "base64..." }
    ]
  },

  "poses": [
    {
      "palette": 5,
      "tiles": [
        { "relX": 0, "relY": 0, "mappedCode": 1234, "flipX": false, "flipY": false },
        { "relX": 16, "relY": 0, "mappedCode": 1235, "flipX": false, "flipY": false }
      ]
    }
  ]
}
```

### Champs

| Champ | Type | Description |
|---|---|---|
| `version` | `number` | Version du format (commence a 1) |
| `gameName` | `string` | Identifiant du jeu (nom du ROM set MAME, ex: `"ffight"`) |
| `createdAt` | `string` | Date ISO 8601 de creation du fichier |
| `modifiedAt` | `string` | Date ISO 8601 de derniere modification |
| `diffs` | `object` | Diffs sparse par region ROM |
| `diffs.graphics` | `DiffEntry[]` | Tiles modifies (GFX ROM) |
| `diffs.program` | `DiffEntry[]` | Palettes modifiees (Program ROM) |
| `diffs.oki` | `DiffEntry[]` | Samples remplaces (OKI ROM) |
| `poses` | `PoseEntry[]` | Poses capturees (tile refs, pas de previews) |

### DiffEntry

```typescript
interface DiffEntry {
  offset: number;   // byte offset dans la region ROM
  bytes: string;    // base64 des bytes modifies (run contigu)
}
```

Les diffs sont calcules en comparant `mutableRom` vs `originalRom` du RomStore. Les runs contiguS de bytes modifies sont regroupes en un seul `DiffEntry` pour eviter la fragmentation (un tile entier = 1 entry de 128 bytes, pas 128 entries de 1 byte).

### PoseEntry

```typescript
interface PoseEntry {
  palette: number;
  tiles: Array<{
    relX: number;
    relY: number;
    mappedCode: number;
    flipX: boolean;
    flipY: boolean;
  }>;
}
```

Les previews (`ImageData`) ne sont pas stockees. Elles sont reconstruites au chargement via `assembleCharacter()` depuis le GFX ROM (apres application des diffs).

---

## Calcul des diffs

Algorithme pour une region :

```
Pour chaque byte i de 0 a romLength-1 :
  si mutableRom[i] !== originalRom[i] :
    debut d'un run (ou extension du run courant)
  sinon :
    si un run etait en cours, le clore → DiffEntry
```

Tolerance de gap : si deux zones modifiees sont separees de moins de 8 bytes, on les fusionne en un seul run (evite la fragmentation pour des edits proches, cout negligeable).

---

## Tailles estimees

| Scenario | graphics | program | oki | poses | Total |
|---|---|---|---|---|---|
| 10 tiles modifies | ~1.7 KB | ~100 B | 0 | 0 | ~2 KB |
| 100 tiles + 5 palettes | ~17 KB | ~500 B | 0 | ~1 KB | ~19 KB |
| 100 tiles + 5 palettes + 10 samples | ~17 KB | ~500 B | ~200 KB | ~1 KB | ~220 KB |
| Edition intensive (500 tiles) | ~85 KB | ~2 KB | ~200 KB | ~5 KB | ~292 KB |

Le fichier reste leger dans tous les cas. Les samples OKI sont le plus gros contributeur.

---

## Save / Load

### Save (export fichier)

1. Calculer les diffs pour chaque region (graphics, program, oki)
2. Collecter les poses depuis les `layerGroups` de type sprite
3. Serialiser en JSON
4. Telecharger via `<a download="ffight.romstudio">`

L'utilisateur nomme et organise ses fichiers librement (comme tout logiciel).

### Load (import fichier)

1. L'utilisateur drop ou selectionne un `.romstudio`
2. Verifier que `gameName` correspond au jeu charge (sinon erreur)
3. Appliquer les diffs : ecrire les bytes aux offsets dans chaque region du RomStore
4. Reconstruire les poses : creer les `CapturedPose` avec previews via `assembleCharacter()`
5. L'undo stack repart vide — le fichier est un checkpoint

### Ordre de chargement

Le `.romstudio` ne peut etre charge qu'APRES le ROM du jeu (il faut le RomStore initialise). Deux scenarios :

1. **ROM deja charge** → drop/select le `.romstudio` → application immediate
2. **ROM pas encore charge** → drop le `.romstudio` → erreur "Chargez d'abord le ROM du jeu"

Alternative : permettre de drop les deux fichiers ensemble (ZIP + `.romstudio`), le loader detecte l'extension et applique dans le bon ordre.

---

## Auto-save (IndexedDB)

En complement du fichier manuel, un auto-save en IndexedDB protege contre les crashes navigateur.

### Declenchement

Debounce de 2 secondes apres la derniere modification (tile edit, palette edit, sample replace). Pas a chaque pixel peint — seulement quand l'utilisateur arrete d'editer pendant 2s.

### Stockage

- **Base** : IndexedDB (pas de limite de taille comme localStorage)
- **Cle** : `romstudio-autosave-{gameName}`
- **Valeur** : meme structure JSON que le `.romstudio`
- **Un seul slot** par jeu (ecrase a chaque auto-save)

### Restore

Au chargement d'un ROM, verifier si un auto-save existe pour ce jeu :
- Si oui → notification : "Des modifications non sauvegardees ont ete trouvees. Restaurer ?"
- Bouton "Restaurer" → applique les diffs
- Bouton "Ignorer" → supprime l'auto-save, repart de zero

### Purge

L'auto-save est supprime quand :
- L'utilisateur clique "Ignorer" au restore
- L'utilisateur exporte un `.romstudio` manuellement (le fichier fait foi)
- L'utilisateur exporte un ZIP MAME (tout est dans le ZIP)

---

## Ce qui n'est PAS dans le `.romstudio`

| Donnee | Raison |
|---|---|
| ROM originale | Trop lourd, l'utilisateur a deja le ZIP |
| Save states emulateur | Deja en localStorage, pas du travail creatif |
| Undo/redo stack | Repart vide au chargement, le fichier est un checkpoint |
| Photo layers (RGBA, position) | Le resultat merge est dans le diff GFX, l'original n'est pas conserve |
| Tile allocator state | Recalculable depuis le GFX ROM |
| FM patches (audio ROM) | Hors scope pour l'instant (synth = plus tard) |
| Previews des poses | Reconstruites depuis GFX ROM + tile refs |

---

## UX

### Boutons

- **"Save"** dans le header ou menu → exporte le `.romstudio` (download navigateur)
- **"Load"** ou drop zone → importe un `.romstudio`
- Indicateur visuel "modifications non sauvegardees" (point ou asterisque dans le titre)

### Raccourcis

| Raccourci | Action |
|---|---|
| Ctrl+S | Save `.romstudio` |
| Ctrl+O | Load `.romstudio` |

### Messages

- Drop d'un `.romstudio` sans ROM chargee → toast "Chargez d'abord le ROM du jeu"
- Drop d'un `.romstudio` pour un autre jeu → toast "Ce fichier est pour {gameName}, pas pour {currentGame}"
- Auto-save restore → notification non-bloquante avec boutons Restaurer / Ignorer
