# Arcade.ts — Roadmap

## Vision

Arcade.ts n'est pas un émulateur de plus. C'est un **studio CPS1 dans le navigateur** : jouer, comprendre, modifier, créer. Tout en un, zero install.

L'avantage structurel : tout est décodé en TypeScript. Chaque layer, sprite, palette, canal audio existe comme un objet JavaScript inspectable et modifiable. C'est ce que les émulateurs compilés en WASM ne peuvent pas offrir.

---

## Phase 1 — Debug Mode ✅ (livré)

> Voir comment le hardware dessine chaque frame.

- [x] Layer toggles (Scroll 1/2/3, Sprites on/off)
- [x] Vue éclatée 3D avec CSS perspective + drag rotation
- [x] Flash (highlight un layer, dim les autres)
- [x] Palette viewer (6 pages × 32 palettes, hover inspect)
- [x] Tile inspector (clic → layer + couleur + position)
- [x] Sprite list (code, position, palette, flip)
- [x] Register viewer (scroll XY, layer order, enables)
- [x] Frame-by-frame (pause / step)
- [x] Sections collapsibles avec tooltips hardware
- [x] Panel ouvert par défaut au chargement

---

## Phase 2 — Audio DAW ✅ (livré)

> Voir et entendre chaque instrument séparément.

### Visualisation ✅
- [x] Piano roll Cubase-style (clavier vertical + blocs de notes scrollant)
- [x] Waveform temps réel des 4 voix OKI (ADPCM signal)
- [x] VU-mètre vertical par canal
- [x] Note actuelle affichée par canal FM
- [x] Hit timelines par piste FM
- [x] Sélection de piste FM → clavier + piano roll suivent la piste

### Contrôle ✅
- [x] Mute / Solo par canal (FM via interception TL+RL+KON, OKI via voiceMask)
- [ ] Export pistes séparées (WAV par canal) — nécessite per-channel WASM output

### Export MIDI
- [ ] Enregistrer les notes FM (canal, note, durée, velocity) pendant N secondes
- [ ] Exporter en fichier MIDI standard (8 pistes = 8 canaux FM)
- [ ] Ouvrir dans n'importe quel DAW (Cubase, Ableton, FL Studio, GarageBand)

### Remplacement de samples
- [ ] Clic sur un sample OKI → lecture du sample original
- [ ] "Replace" → upload WAV ou enregistrement micro
- [ ] Encodage WAV → ADPCM OKI en temps réel
- [ ] Preview dans le jeu qui tourne
- [ ] Export ROM audio modifiée

### Technique ✅
- [x] SharedArrayBuffer (vizSAB 128 bytes) pour les métriques audio (Worker → Main thread)
- [x] Shadow YM2151 register file dans le Worker
- [x] Panel sous le canvas, toute largeur, collapsible
- [x] Header StudioROM avec contrôles intégrés

---

## Phase 3 — Sprite Recorder

> Capturer automatiquement les animations d'un jeu qui tourne.

### Recorder
- [ ] Bouton "Record" dans le debug panel
- [ ] Capture de l'OBJ buffer à chaque frame pendant N secondes
- [ ] Identification du personnage par palette index
- [ ] Groupement des sprites multi-tiles en images composites
- [ ] Déduplication des frames identiques

### Frise d'animation
- [ ] Affichage horizontal de tous les frames uniques (filmstrip)
- [ ] Navigation : clic sur un frame → preview agrandi
- [ ] Metadata par frame : tile codes, palette, flip, dimensions
- [ ] Export sprite sheet (PNG)

### Technique
- [ ] Réutilise FrameStateExtractor + SpriteSheetManager existants
- [ ] Stockage en mémoire : tableau de FrameState par frame enregistré
- [ ] Déduplication par hash des tile codes + positions relatives

---

## Phase 4 — Sprite Editor

> Modifier les graphismes et voir le résultat en temps réel.

### Éditeur de tiles
- [ ] Canvas pixel editor (grille 16×16 ou 8×8)
- [ ] Palette 16 couleurs à côté, pick color
- [ ] Zoom, grille, preview
- [ ] Undo/redo

### Reconstitution
- [ ] Assemblage automatique des tiles d'un sprite multi-tile en image composite
- [ ] Édition de l'image composite entière (pas tile par tile)
- [ ] Re-découpage automatique en tiles 16×16

### Écriture ROM
- [ ] Encodage pixels → 4bpp planar
- [ ] Écriture dans le buffer GFX ROM en mémoire
- [ ] Preview en temps réel dans le jeu qui tourne
- [ ] Palette editor (modifier les 16 couleurs)

### Export
- [ ] Ré-entrelacement des fichiers ROM (inverse du loader)
- [ ] Reconstruction du ZIP MAME
- [ ] Roundtrip test : load → export sans modif → comparaison bit-à-bit
- [ ] Export du sprite sheet modifié (PNG)

---

## Phase 5 — ROM Patcher

> Exporter une ROM modifiée jouable partout.

- [ ] Diff binaire entre ROM originale et modifiée
- [ ] Export en format IPS/BPS patch (standard romhacking)
- [ ] Export ROM complète modifiée (.zip MAME)
- [ ] Galerie de patches communautaire (upload/download)

---

## Audiences cibles

| Audience | Phase | Ce qu'ils y trouvent |
|----------|-------|---------------------|
| Développeurs | 1 | Comprendre le hardware CPS1, s'inspirer |
| YouTubeurs retro | 1-2 | Contenu visuel unique (layers 3D, piano roll) |
| Fans de musique retro | 2 | Écouter les pistes séparées, remixer |
| Romhackers | 3-4-5 | Workflow visuel moderne vs outils des années 90 |
| Créatifs / trolls | 4-5 | Mettre sa tête sur Guy dans Final Fight |

---

## Principes

1. **Tout dans le navigateur** — zero install, zero backend
2. **Bring your own ROMs** — on ne distribue aucun asset Capcom
3. **Preview temps réel** — chaque modif est visible instantanément dans le jeu
4. **L'avantage TypeScript** — tout est inspectable, modifiable, exportable
