# Backlog

## Done (session March 21-22)

- [x] Web Worker audio — Z80+YM2151+OKI off main thread, autonomous timer
- [x] QSound audio resampling (24038 → 48kHz)
- [x] Kabuki Z80 decryption — all QSound games boot with audio
- [x] Gamepad remapping with P1/P2 config, autofire, localStorage persistence
- [x] Keyboard remapping with AZERTY/QWERTY layout detection
- [x] Save states — 4 slots, full audio restore (YM2151 WASM heap snapshot)
- [x] DIP switches — 56 games with real MAME definitions, auto-generated from cps1.cpp
- [x] CRT filter (scanlines + vignetting)
- [x] TATE mode fixes (canvas + DOM)
- [x] DOM renderer sprite flickering fix (putImageData instead of data URLs)
- [x] Unified Config modal (Joypad/Keyboard/Display/DIP tabs)
- [x] Device assignment — per-player gamepad selection with persistence
- [x] Buttons 4-6 (kicks) for SF2 via CPS-B register 0x36
- [x] Ring buffer 4096 → 8192 → 16384 for better audio margin
- [x] ROM cache from public/roms/
- [x] UI redesign, project renamed to Arcade.ts
- [x] Vercel deployment with COOP/COEP headers

## Done (session March 25 — morning)

- [x] Sprite Pixel Editor — WYSIWYG sprite editing (#27, PR #29)
- [x] Audio timeline ruler with frame-synced scroll (PR #30)
- [x] Debt-based audio timing — fixes Firefox audio lag (PR #31)
- [x] Ring buffer 8192 → 16384 samples
- [x] Rebrand StudioROM → ROMstudio
- [x] UI polish: text colors boosted, backgrounds lightened

## Done (session March 25 — evening)

- [x] FM Patch Editor — voice read/write, macro UI, ROM export (code present, UI hidden)
- [x] Mic recording — record OKI samples from mic, lo-fi processing
- [x] Audio panel — mute/solo, FM timeline, OKI waveforms, sortable sample table
- [x] Palette ROM patching — brightness-aware search, program ROM export
- [x] Scroll 2 row scroll fix for tile inspector
- [x] 3D drag fix — overlay pointer-events disabled in exploded mode
- [x] Layer grid default off

## M68000 CPU — Tom Harte test failures

- [ ] **ADDX.b/MOVE.b/MOVEA with -(A7)/(A7)+** — 68000 forces A7 even: decrement/increment by 2 for byte ops on A7
- [ ] **DIVS** — Incorrect flags (N, Z, V, C) on signed division. 9 vectors fail.
- [ ] **DIVU** — Incorrect flags on unsigned division. 10 vectors fail.
- [ ] **MULS** — Incorrect flags on signed multiplication. 11 vectors fail.
- [ ] **MULU** — Incorrect flags on unsigned multiplication. 11 vectors fail.
- [ ] **DBcc** — SSP/PC incorrect on some edge cases

## Z80 — Tom Harte test failures

- [ ] **SCF/CCF** — Undocumented flag bits 3, 5
- [ ] **BIT b,(HL)** — Undocumented flag bits 3, 5
- [ ] **Block I/O (INIR, OTIR, etc.)** — Complex flag calculation not implemented

## Video

- [ ] **Row scroll on scroll1/scroll3** — Only scroll2 supports row scroll currently
- [ ] **Column scroll** — Not implemented
- [ ] **Star field** — Background effect used by some games (1941)
- [ ] **P2 buttons 4-6** — May not work on some games (needs testing)

## Audio

- [x] **Web Worker audio** — Z80 + YM2151 + OKI off main thread, autonomous timer
- [x] **QSound audio resampling** — 24038 Hz → 48kHz via LinearResampler
- [x] **QSound stereo** — True stereo output with independent L/R resampling
- [x] **Debt-based audio timing** — 4ms tick + frame debt accumulator, fixes Firefox audio lag
- [x] **Audio timeline ruler** — Frame-synced ruler with minor/major ticks, FPS display
- [x] **Timeline scroll sync** — Scroll tied to frameCount, stops on pause, reversed direction
- [ ] **Audio worker state on save/load** — Music resumes but YM2151 envelope state may be slightly off
- [ ] **OKI sample crackling** — Slight crackling on some OKI samples, may need better interpolation
- [ ] **Volume per channel** — Allow user to adjust YM2151 / OKI / QSound balance
- [ ] **Audio timeline frame grid** — Vertical grid lines on FM/OKI timelines aligned to frames

## ROM Editor

- [x] **RomStore** — Central mutable ROM manager with ZIP export ([#22](https://github.com/privaloops/arcade-ts/issues/22))
- [x] **Sprite Pixel Editor** — WYSIWYG sprite editing with palette & tile tools ([#27](https://github.com/privaloops/arcade-ts/issues/27))
- [x] **FM Patch Editor** — Voice read/write + macro UI done, real-time playback deferred (Z80 conflict). Code in `fm-patch-editor.ts` + `cps1-sound-driver.ts`, Synth tab hidden ([#20](https://github.com/privaloops/arcade-ts/issues/20))
- [ ] **FM real-time preview** — Requires Z80 music sequencer reverse-engineering to avoid TL/volume conflicts
- [ ] **Mute/Solo ROM export** — Requires reverse-engineering CPS1 music sequence format (note commands per-track)
- [ ] **Scroll Layer Editor** — Edit scroll 1/2/3 tiles (same architecture as sprite editor)
- [ ] **Tile Allocation Manager** — Track free/used tiles across entire GFX ROM
- [ ] **Image Import** — PNG → tile conversion with palette quantization

## UI / UX

- [ ] **Mobile touch controls** — Virtual d-pad and buttons for phones/tablets
- [ ] **Speed control** — Fast forward / slow motion
- [ ] **FPS counter** — Optional display
- [ ] **Screenshot button** — Save current frame as PNG
- [ ] **Rewind** — Save N frames in circular buffer, hold button to rewind

## Platform expansion

- [ ] **Neo Geo (MVS)** — Same CPUs (68000 + Z80), different video (sprite-only), YM2610 audio
- [ ] **CPS2** — Evolution of CPS1, encrypted 68000, QSound standard
- [ ] **CPS3** — SH-2 CPU, very different architecture

## Homebrew / Portage CPS1

### Portage Sonic the Hedgehog → CPS1

Le code 68000 de Sonic 1 (Mega Drive) est entièrement désassemblé et buildable (projet sonicretro).
La Mega Drive partage le 68000 (main) et le Z80 (audio) avec le CPS1. Le portage consiste à
remplacer les couches hardware-spécifiques tout en gardant la logique de jeu intacte.

**Ce qu'on garde tel quel :**
- Physique du personnage (vitesse, accélération, pentes, anneaux)
- Logique des ennemis et patterns
- State machine du jeu (titre, zones, transitions, game over)
- Structure des niveaux (layout data)

**Ce qu'il faut adapter :**

| Composant | Mega Drive (VDP) | CPS1 (CPS-A/CPS-B) | Travail |
|-----------|------------------|---------------------|---------|
| Scroll planes | 2 planes (A/B) + window, registres `$C00000` | 3 scroll layers, registres `$800100+` | Réécrire le driver vidéo |
| Sprites | 80 max, 8×8 à 32×32, table à `$C00000` | 256 max, 16×16, table VRAM `$900000` | Nouveau sprite manager |
| Tiles | 8×8, 4bpp, layout VDP | 16×16, 4bpp, layout CPS1 | Conversion de tous les assets |
| Palette | 4×16 couleurs, 9-bit RGB (512 couleurs) | 192×16 couleurs, 16-bit RGB (65536 couleurs) | Conversion + enrichissement |
| DMA/VRAM | DMA fill/copy via port VDP | Écriture directe VRAM | Remplacer toutes les routines DMA |
| Scrolling | Row scroll, column scroll via VDP | Row/column scroll via registres CPS-A | Adapter les offsets |
| Audio | YM2612 (FM) + PSG, Z80 driver | YM2151 (FM) + OKI (ADPCM), Z80 driver | Réécrire le driver audio |

**Gains visuels attendus :**
- 3 layers de parallax au lieu de 2 → profondeur de décor supplémentaire
- 256 sprites vs 80 → plus d'éléments à l'écran simultanément
- Palette 65536 couleurs vs 512 → dégradés, shading, reflets impossibles sur MD
- Résolution 384×224 vs 320×224 → image plus large

**Gains audio :**
- YM2151 : son FM plus propre/brillant que le YM2612 (grain MD en moins)
- OKI : 4 voix ADPCM simultanées vs 1 canal DAC → SFX plus riches

**Étapes :**
- [ ] Étudier le désassemblage Sonic 1 (sonicretro), identifier les modules hardware-dépendants
- [ ] Écrire un driver vidéo CPS1 en 68K (init, scroll, sprites, palette)
- [ ] Convertir les tiles 8×8 → 16×16 (upscale ou redesign)
- [ ] Convertir les palettes MD → CPS1
- [ ] Convertir les niveaux (tile maps) vers le format scroll CPS1
- [ ] Réécrire le driver audio Z80 pour YM2151 + OKI
- [ ] Convertir les instruments FM (YM2612 patches → YM2151 patches)
- [ ] Encoder les SFX en ADPCM OKI
- [ ] Packager en ROM set MAME-compatible (.zip)
- [ ] Tester dans ROMstudio

### AI Tile Upscaler

Pipeline d'upscale des tiles pixel art assisté par IA, intégrable dans ROMstudio.

**Cas d'usage :**
- Portage Mega Drive → CPS1 : tiles 8×8 → 16×16
- Amélioration de tiles existants (plus de détail, meilleur shading)
- Feature standalone de ROMstudio ("enhance sprites")

**Pipeline :**
1. Extraire les tiles depuis la ROM (déjà possible via `tile-encoder.ts`)
2. Reconstruire le contexte : assembler les tiles adjacents en sprites/blocs complets
3. Upscale IA ×2 avec modèle spécialisé pixel art (pas de lissage, pas d'anti-aliasing)
4. Quantizer la sortie vers la palette CPS1 cible (16 couleurs par tile max)
5. Découper en tiles 16×16 CPS1
6. Encoder au format GFX ROM CPS1 (via `tile-encoder.ts`)
7. Review/retouche dans le sprite editor
8. Preview live dans l'émulateur

**Outils/modèles à évaluer :**
- Pixelover (spécialisé pixel art upscale)
- Stable Diffusion + LoRA pixel art
- ESRGAN avec modèle pixel art (4x-PixelPerfect)
- Modèle custom entraîné sur des tiles arcade (CPS1, Neo Geo, CPS2)

**Contraintes hardware CPS1 à respecter :**
- 16 couleurs max par tile (4bpp)
- Taille fixe 16×16 pixels
- Pas d'anti-aliasing (contours nets obligatoires)
- Cohérence entre tiles adjacents (pas de coutures)

**Étapes :**
- [ ] Benchmark des modèles d'upscale existants sur des tiles Mega Drive/CPS1
- [ ] Développer le pipeline extract → upscale → quantize → encode
- [ ] Intégrer dans ROMstudio (bouton "AI Enhance" dans le sprite editor)
- [ ] Gérer le contexte multi-tiles (sprites composés de plusieurs tiles)
- [ ] Permettre la retouche manuelle post-upscale

### Éditeur de jeu CPS1 (vision long terme)

Type GB Studio mais pour CPS1. Éditeur visuel pour créer des jeux CPS1 jouables sur émulateur ou hardware réel.

**Approche recommandée : cibler un genre (beat-em-up)**
- Templates : personnage jouable, ennemis, décors scrollants, boss
- Runtime 68K fixe, seuls les assets et paramètres changent
- State machine IA basique (marcher vers joueur, attaquer à portée, reculer)
- Moins ambitieux qu'un éditeur générique, mais déjà unique au monde

**Briques existantes dans ROMstudio :**
- Sprite editor (dessin, palette, tiles) ✅
- Sample editor (OKI ADPCM) ✅
- ROM export (.zip MAME) ✅
- Émulateur pour test live ✅

**Briques manquantes :**
- Éditeur de niveaux / scenes (tile map editor)
- Système de scripting (visuel ou DSL)
- Compilateur/assembleur 68K intégré
- Runtime 68K (game engine CPS1)
- Éditeur de musique FM (tracker → YM2151)
- Éditeur de collision maps

## Infrastructure

- [ ] **GitHub Pages** as alternative hosting (with service worker for COOP/COEP headers)
- [ ] **PWA** — Offline support via service worker
- [ ] **CI** — Run tests on PR
