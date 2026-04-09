# Neo-Geo Support — Plan d'implementation

> Plan concu pour etre execute par un agent autonome.
> Chaque etape produit un livrable testable avant de passer a la suivante.
> Temps estime : 10 jours.

---

## Contexte

Sprixe est un emulateur CPS1 + editeur de sprites dans le browser. Le code TypeScript existant emule un 68000 + Z80 + YM2151 (WASM) + OKI6295 + video CPS1. L'objectif est d'ajouter le support Neo-Geo (SNK MVS/AES) pour ouvrir le marche KOF/Metal Slug (communaute 10-20x plus grosse).

### Ce qui est reutilisable tel quel

| Composant | Fichier | Pourquoi |
|-----------|---------|----------|
| CPU 68000 | `src/cpu/m68000.ts` | Meme CPU (12 MHz au lieu de 10 MHz, seul le timing change) |
| CPU Z80 | `src/cpu/z80.ts` | Meme CPU (4 MHz au lieu de 3.579545 MHz) |
| WebGL renderer | `src/video/renderer-webgl.ts` | Blit generique framebuffer → GPU (ajuster resolution) |
| Canvas renderer | `src/video/renderer.ts` | Idem |
| Audio output | `src/audio/audio-output.ts` | SharedArrayBuffer + AudioWorklet, generique |
| Resampler | `src/audio/resampler.ts` | LinearResampler generique |
| Aseprite writer | `src/editor/aseprite-writer.ts` | Format .aseprite generique |
| Aseprite reader | `src/editor/aseprite-reader.ts` | Idem |
| Layer model | `src/editor/layer-model.ts` | Pure data model, pas de hardware |
| UI framework | `src/ui/*.ts` | Tooltips, toasts, modals, status bar |
| Types/interfaces | `src/types.ts` | BusInterface, Z80BusInterface, RendererInterface |

### Ce qui doit etre cree (Neo-Geo specifique)

| Composant | Fichier a creer | Equivalent CPS1 |
|-----------|----------------|-----------------|
| Bus 68K Neo-Geo | `src/memory/neogeo-bus.ts` | `bus.ts` |
| Bus Z80 Neo-Geo | `src/memory/neogeo-z80-bus.ts` | `z80-bus.ts` |
| ROM loader Neo-Geo | `src/memory/neogeo-rom-loader.ts` | `rom-loader.ts` |
| Game defs Neo-Geo | `src/memory/neogeo-game-defs.ts` | `game-defs.ts` |
| Video LSPC2 | `src/video/neogeo-video.ts` | `cps1-video.ts` |
| YM2610 WASM wrapper | `src/audio/ym2610-wasm.ts` | `nuked-opm-wasm.ts` |
| Audio worker Neo-Geo | `src/audio/neogeo-audio-worker.ts` | `audio-worker.ts` |
| Sprite analyzer Neo-Geo | `src/editor/neogeo-sprite-analyzer.ts` | `sprite-analyzer.ts` |
| Tile encoder Neo-Geo | `src/editor/neogeo-tile-encoder.ts` | `tile-encoder.ts` |
| WASM wrapper C++ | `wasm/ym2610_wrapper.cpp` | `wasm/opm_wrapper.c` |
| Emulateur Neo-Geo | `src/neogeo-emulator.ts` | `emulator.ts` |
| Constantes Neo-Geo | `src/neogeo-constants.ts` | `src/constants.ts` |

### Differences hardware cles

| Propriete | CPS1 | Neo-Geo |
|-----------|------|---------|
| Resolution | 384x224 | 320x224 |
| 68K clock | 10 MHz | 12 MHz |
| Z80 clock | 3.579545 MHz | 4 MHz |
| Video | 3 scroll layers + 1 sprite layer | 381 sprites + 1 fix layer (tout est sprites) |
| Tile format | 4bpp planar, entrelace (mappers varies) | 4bpp planar, paires C-ROM (impair=bp0+1, pair=bp2+3) |
| Sprite table | 256 OBJ, 8 bytes/OBJ | 381 sprites, 4 SCB blocks separes |
| Transparent pen | Index 15 | Index 0 |
| Palette | VRAM, 6 pages, brightness nibble | Palette RAM separee, 256 palettes x 16 couleurs |
| Son | YM2151 (8ch FM) + OKI6295 (4ch ADPCM) | YM2610 (4ch FM + 3ch SSG + 6ch ADPCM-A + 1ch ADPCM-B) |
| BIOS | Pas de BIOS | BIOS unifie (neogeo.zip) |
| ROM structure | program/gfx/audio/oki, mappers varies | P-ROM/C-ROM(paires)/S-ROM/M-ROM/V-ROM, uniforme |
| Sprites | OBJ individuels 16x16, grouping par heuristique | Chaines verticales (sticky bit), grouping explicite |

---

## Etape 0 — Constantes et types Neo-Geo

**Fichier** : `src/neogeo-constants.ts`

**Contenu** :
```typescript
// Screen
export const NGO_SCREEN_WIDTH = 320;
export const NGO_SCREEN_HEIGHT = 224;
export const NGO_FRAMEBUFFER_SIZE = NGO_SCREEN_WIDTH * NGO_SCREEN_HEIGHT * 4;

// Timing
export const NGO_M68K_CLOCK = 12_000_000;          // 12 MHz
export const NGO_Z80_CLOCK = 4_000_000;            // 4 MHz
export const NGO_PIXEL_CLOCK = 6_000_000;          // 6 MHz
export const NGO_HTOTAL = 384;
export const NGO_VTOTAL = 264;
export const NGO_FRAME_RATE = NGO_PIXEL_CLOCK / (NGO_HTOTAL * NGO_VTOTAL); // ~59.185 Hz
export const NGO_VBLANK_LINE = 224;

// CPU cycles per frame
export const NGO_M68K_CYCLES_PER_FRAME = Math.round(NGO_M68K_CLOCK / NGO_FRAME_RATE);
export const NGO_M68K_CYCLES_PER_SCANLINE = Math.round(NGO_M68K_CYCLES_PER_FRAME / NGO_VTOTAL);
export const NGO_Z80_CYCLES_PER_FRAME = Math.round(NGO_Z80_CLOCK / NGO_FRAME_RATE);

// GFX tile sizes
export const NGO_TILE_SIZE = 16;                    // 16x16 pixels
export const NGO_TILE_BYTES = 128;                  // 4bpp = 128 bytes per tile
export const NGO_FIX_TILE_SIZE = 8;                 // 8x8 fix layer tile
export const NGO_FIX_TILE_BYTES = 32;               // 4bpp = 32 bytes per 8x8 tile

// VRAM
export const NGO_MAX_SPRITES = 381;                 // slots 1-381 (0 = padding)
export const NGO_SPRITES_PER_LINE = 96;
export const NGO_MAX_TILE_HEIGHT = 32;              // tiles per sprite column
export const NGO_SCB1_BASE = 0x0000;                // slow VRAM
export const NGO_SCB2_BASE = 0x8000;                // fast VRAM — shrink
export const NGO_SCB3_BASE = 0x8200;                // fast VRAM — Y, sticky, height
export const NGO_SCB4_BASE = 0x8400;                // fast VRAM — X
export const NGO_FIX_BASE = 0x7000;                 // fix layer tilemap

// Audio
export const NGO_YM2610_CLOCK = 8_000_000;          // 8 MHz (from LSPC2)
export const NGO_YM2610_SAMPLE_RATE = 55556;        // 8 MHz / 144
export const NGO_ADPCMA_SAMPLE_RATE = 18519;        // 8 MHz / 432
```

**Verification** : compile sans erreur (`npm run build`).

---

## Etape 1 — Game Defs + ROM Loader Neo-Geo (2 jours)

### 1.1 Parser du software list MAME

**Fichier** : `src/memory/neogeo-game-defs.ts`

**Source de donnees** : telecharger `hash/neogeo.xml` depuis le repo MAME GitHub.
Lien : `https://raw.githubusercontent.com/mamedev/mame/master/hash/neogeo.xml`

**Approche** : NE PAS parser le XML a runtime. Ecrire un script Node (`scripts/parse-neogeo-xml.ts`) qui :
1. Lit le XML
2. Extrait chaque `<software>` avec ses `<dataarea>` (maincpu, sprites, audiocpu, ymsnd, fixed)
3. Genere un fichier TypeScript avec un tableau `NEOGEO_GAME_DEFS: NeoGeoGameDef[]`

**Interface** :
```typescript
export interface NeoGeoRomEntry {
  name: string;
  offset: number;
  size: number;
  crc?: string;
  loadFlag?: 'load16_word_swap' | 'load16_byte' | 'load8_word' | 'continue';
}

export interface NeoGeoGameDef {
  name: string;              // "kof98" 
  description: string;       // "The King of Fighters '98"
  year: string;
  publisher: string;
  program: NeoGeoRomEntry[];    // P-ROM (68K code)
  sprites: NeoGeoRomEntry[];    // C-ROM pairs (sprite tiles)
  audio: NeoGeoRomEntry[];      // M-ROM (Z80 code)
  voice: NeoGeoRomEntry[];      // V-ROM (ADPCM samples)
  fixed?: NeoGeoRomEntry[];     // S-ROM (fix layer tiles, optionnel si dans C-ROMs)
  encrypted?: boolean;          // NEO-CMC/NEO-SMA (skip pour MVP)
}
```

**Scope MVP** : inclure uniquement les jeux non-encryptes. Liste prioritaire :
- **Fighting** : kof94, kof95, kof96, kof97, kof98, fatfury1, fatfury2, fatfury3, fatfursp, garou (si non-encrypte), samsho, samsho2, samsho3, samsho4, rbff1, rbff2, aof, aof2, aof3, wh1, wh2, matrim, lastblad, lastbld2, kizuna
- **Beat-em-up/action** : mslug, mslug2, sengoku, roboarmy, mutnat, burningf, eightman
- **Run-and-gun** : nam1975, bstars, bstars2, cyberlip
- **Puzzle/sport** : puzzledp, twinspri, pbobblen, magdrop2, magdrop3, socbrawl, supersid
- Total cible : ~50 jeux pour le MVP

Les jeux encryptes (kof99+, mslug3+, garou, matrim selon version) sont exclus. Un message "Encrypted ROM not supported yet" sera affiche si detecte.

### 1.2 ROM Loader

**Fichier** : `src/memory/neogeo-rom-loader.ts`

**Interface de sortie** :
```typescript
export interface NeoGeoRomSet {
  name: string;
  description: string;
  programRom: Uint8Array;     // P-ROM assemble
  spritesRom: Uint8Array;     // C-ROM assemble (paires entrelacees)
  audioRom: Uint8Array;       // M-ROM
  voiceRom: Uint8Array;       // V-ROM (ADPCM-A + ADPCM-B concatenes)
  fixedRom: Uint8Array;       // S-ROM (fix layer)
  biosRom: Uint8Array;        // BIOS 68K (sp-s2.sp1, 128KB)
  biosSRom: Uint8Array;       // BIOS S-ROM (sfix.sfix, 128KB)
  biosZRom: Uint8Array;       // BIOS Z80 (sm1.sm1, 128KB)
  loRom: Uint8Array;          // L0 ROM (shrink tables, 64KB)
  gameDef: NeoGeoGameDef;
  originalFiles: Map<string, Uint8Array>;
}
```

**Logique** :
1. `loadNeoGeoRomFromZip(file)` : extrait le ZIP, identifie le jeu par matching de noms de fichiers (meme pattern que `rom-loader.ts:identifyGame`)
2. `loadNeoGeoBios(file)` : charge `neogeo.zip` separement. Le BIOS est necessaire et doit etre charge une fois.
3. Assemblage P-ROM : `load16_word_swap` = swap chaque paire de bytes. Pattern identique a `assembleProgram` dans `rom-loader.ts`.
4. Assemblage C-ROM : les paires (C1+C2, C3+C4...) sont entrelacees byte-a-byte. Chaque byte du ROM impair fournit bp0+bp1, chaque byte du ROM pair fournit bp2+bp3. L'entrelacement est : pour chaque tile de 128 bytes, les 64 bytes impairs viennent du C-ROM impair, les 64 bytes pairs du C-ROM pair.
5. Assemblage V-ROM : concatenation lineaire.
6. BIOS : rechercher `sp-s2.sp1` (ou variantes regionales) dans neogeo.zip.

**Pattern a suivre** : copier l'architecture de `rom-loader.ts` — memes patterns JSZip, meme gestion d'erreurs, meme type `RomFileEntry`.

**Tests** : `src/__tests__/neogeo-rom-loader.test.ts`
- Test unitaire d'assemblage C-ROM avec donnees synthetiques (4 bytes → verifier l'entrelacement)
- Test unitaire d'assemblage P-ROM word-swap
- Test d'identification de jeu avec des noms de fichiers

---

## Etape 2 — Bus memoire Neo-Geo (2 jours)

### 2.1 Bus 68K

**Fichier** : `src/memory/neogeo-bus.ts`

**Implemente** : `BusInterface` (de `types.ts`)

**Memory map Neo-Geo MVS** (24-bit, big-endian) :

| Adresse | Taille | Acces | Description |
|---------|--------|-------|-------------|
| 0x000000-0x0FFFFF | 1 MB | R | P-ROM (ou banke si NEO-SMA, hors scope MVP) |
| 0x100000-0x10FFFF | 64 KB | RW | Work RAM |
| 0x200000-0x2FFFFF | 1 MB | R | P-ROM bank (ROM miroir pour jeux <= 1MB) |
| 0x300000-0x300001 | 2B | R | Port P1 (joystick + boutons A/B/C/D) |
| 0x300080-0x300081 | 2B | R | REG_DIPSW (pas utilise en AES) |
| 0x320000-0x320001 | 2B | R | Port P2 |
| 0x340000-0x340001 | 2B | R | Port systeme (start, coin, select) |
| 0x380000-0x380001 | 2B | R | REG_STATUS_B (AES/MVS mode) |
| 0x380040-0x380041 | 2B | W | REG_SWPROM (P-ROM bank switch — MVS) |
| 0x3A0000-0x3A001F | 32B | W | Registres REG_xxx (watchdog, IRQ ack, etc.) |
| 0x3C0000-0x3C0001 | 2B | W | VRAM address |
| 0x3C0002-0x3C0003 | 2B | RW | VRAM data |
| 0x3C0004-0x3C0005 | 2B | W | VRAM modulo (auto-increment) |
| 0x3C0006-0x3C0007 | 2B | R | VRAM counter (current scanline) |
| 0x3C0008-0x3C0009 | 2B | W | LSPC timer high |
| 0x3C000A-0x3C000B | 2B | W | LSPC timer low |
| 0x3C000C-0x3C000D | 2B | W | LSPC IRQ control |
| 0x3C000E-0x3C000F | 2B | W | LSPC timer stop |
| 0x400000-0x401FFF | 8 KB | RW | Palette RAM (4096 mots de 16 bits) |
| 0x800000-0x800FFF | 4 KB | RW | Memory card (optionnel, peut retourner 0xFF) |
| 0xC00000-0xC1FFFF | 128 KB | R | BIOS ROM |
| 0xD00000-0xD0FFFF | 64 KB | RW | BIOS SRAM (sauvegarde, backup RAM) |

**VRAM access** : contrairement a CPS1 ou la VRAM est mappee directement, Neo-Geo utilise un registre indirect :
```typescript
private vramAddr: number = 0;
private vramMod: number = 0;  // auto-increment

write16(address: number, value: number): void {
  if (address === 0x3C0000) { this.vramAddr = value; return; }
  if (address === 0x3C0002) {
    this.vram[this.vramAddr * 2] = value >> 8;
    this.vram[this.vramAddr * 2 + 1] = value & 0xFF;
    this.vramAddr = (this.vramAddr + this.vramMod) & 0xFFFF;
    return;
  }
  if (address === 0x3C0004) { this.vramMod = value; return; }
  // ...
}
```

**Palette RAM** : 4096 entrees de 16 bits. Format couleur Neo-Geo :
- Bit 15 : "dark bit" (reduit la luminosite de 50%)
- Bits 14-11 : Rouge (4 bits) 
- Bits 10-7 : Vert (4 bits)
- Bits 6-3 : Bleu (4 bits)
- Bit 2 : R LSB, Bit 1 : G LSB, Bit 0 : B LSB
- Resultat : 5 bits par composante (bits [14-11,2] pour R, [10-7,1] pour G, [6-3,0] pour B)

**IRQ system** : 3 niveaux d'interruption
- IRQ1 (vecteur 0x64) : VBlank
- IRQ2 (vecteur 0x68) : timer programmable (LSPC)
- IRQ3 (vecteur 0x6C) : reset/coldboot (premiere frame)

Les acquittements sont ecrits a :
- 0x3C000C : controle IRQ (bits pour activer/desactiver chaque IRQ)
- 0x3A000A : acquittement IRQ (ecrire pour clear)

**Sound latch** : 
- 68K ecrit a 0x320000 (ecriture, registre de commande son)
- Le Z80 lit la commande via son bus

**Pattern a suivre** : meme architecture que `bus.ts` — callbacks injectees pour le son, getters pour les raw arrays (VRAM, palette RAM, work RAM), pas de references directes aux puces.

**Tests** : `src/__tests__/neogeo-bus.test.ts`
- Lecture/ecriture work RAM
- VRAM indirect (ecriture adresse, ecriture data, auto-increment)
- Palette RAM encoding/decoding
- I/O ports lecture

### 2.2 Bus Z80

**Fichier** : `src/memory/neogeo-z80-bus.ts`

**Implemente** : `Z80BusInterface`

**Memory map Z80 Neo-Geo** (16-bit) :

| Adresse | Taille | Acces | Description |
|---------|--------|-------|-------------|
| 0x0000-0x7FFF | 32 KB | R | M-ROM fixe (premiers 32 KB) |
| 0x8000-0xBFFF | 16 KB | R | M-ROM banke (via NEO-ZMC2 banking) |
| 0xC000-0xDFFF | 8 KB | RW | Z80 Work RAM (2 KB dans la spec, mais 8 KB alloues pour compatibilite) |
| 0xE000-0xFFFF | — | — | Miroir de Work RAM |
| 0xF800-0xF7FF | — | — | (pas utilise) |

**I/O ports** (contrairement au CPS1 qui est full memory-mapped, le Neo-Geo Z80 utilise des I/O ports) :

| Port | Acces | Description |
|------|-------|-------------|
| 0x00 | R | Sound latch (commande du 68K) |
| 0x00 | W | Clear sound latch pending flag |
| 0x04 | W | YM2610 address port 0 (registres 0x00-0xFF) |
| 0x05 | RW | YM2610 data port 0 / status read |
| 0x06 | W | YM2610 address port 1 (registres 0x100-0x1FF) |
| 0x07 | RW | YM2610 data port 1 / status read |
| 0x08 | W | Set NMI enable |
| 0x0C | W | Sound reply to 68K |
| 0x18 | W | NMI disable |

**IMPORTANT** : contrairement au CPS1 ou le YM2151/OKI sont memory-mapped, ici tout passe par des ports I/O. Les methodes `ioRead(port)` et `ioWrite(port, value)` de `Z80BusInterface` sont donc critiques (elles etaient des no-ops sur CPS1).

**ROM banking** : le registre de bank est ecrit via les ports 0x08-0x0B (4 registres de banking). Le NEO-ZMC2 peut adresser jusqu'a 4 MB de M-ROM. Pour le MVP, un banking simple suffit (la plupart des jeux ont des M-ROM <= 512 KB).

**Pattern a suivre** : meme architecture que `z80-bus.ts` — callbacks pour le YM2610, queue de sound latch, serialisation d'etat pour les save states.

**Tests** : `src/__tests__/neogeo-z80-bus.test.ts`
- I/O ports YM2610 (ecriture adresse/data, lecture status)
- Sound latch queue
- ROM banking

---

## Etape 3 — Video LSPC2 (3 jours)

### 3.1 Decodeur de tiles Neo-Geo

**Fichier** : `src/editor/neogeo-tile-encoder.ts`

**Format C-ROM** : tiles 16x16, 4bpp, 128 bytes/tile. Les bitplanes sont distribues sur les paires C-ROM :
- C-ROM impair (C1, C3, C5...) : bitplanes 0 et 1
- C-ROM pair (C2, C4, C6...) : bitplanes 2 et 3

Apres assemblage par le ROM loader, les bytes sont entrelaces dans `spritesRom`. Le decodage d'un pixel :
```typescript
// Pour le pixel p (0-7) dans un groupe de 8 pixels :
const bitPos = 7 - p;  // MSB = pixel gauche
const color =
  ((oddByte0 >> bitPos) & 1)       |  // bp0
  (((oddByte1 >> bitPos) & 1) << 1) |  // bp1
  (((evenByte0 >> bitPos) & 1) << 2) | // bp2
  (((evenByte1 >> bitPos) & 1) << 3);  // bp3
```

**ATTENTION** : le format est different du CPS1. Sur CPS1, les 4 planes sont dans 4 bytes consecutifs. Sur Neo-Geo, les planes sont separees entre ROM impaire et paire. Le `decodeRow` CPS1 ne peut PAS etre reutilise tel quel.

Implementer :
- `decodeNeoGeoRow(rom: Uint8Array, offset: number, out: Uint8Array, outOffset: number): void`
- `encodeNeoGeoRow(pixels: Uint8Array, out: Uint8Array, offset: number): void`
- `readNeoGeoTile(rom: Uint8Array, tileCode: number): Uint8Array` (16x16 palette indices)
- `writeNeoGeoPixel(rom: Uint8Array, tileCode: number, localX: number, localY: number, colorIndex: number): void`

**Fix layer** (S-ROM) : tiles 8x8, 4bpp, 32 bytes/tile. Format plus simple — 4 bytes par ligne, 8 lignes. Pattern similaire au scroll1 CPS1 mais sans le quirk d'entrelacement.

**Tests** : `src/__tests__/neogeo-tile-encoder.test.ts`
- Roundtrip encode/decode d'un tile synthetique
- Verification du transparent pen (index 0, pas 15 !)

### 3.2 Rasteriseur LSPC2

**Fichier** : `src/video/neogeo-video.ts`

C'est le fichier le plus complexe. L'architecture interne sera similaire a `cps1-video.ts` mais avec une logique de rendu fondamentalement differente.

**Classe** : `NeoGeoVideo`

**Donnees** :
```typescript
class NeoGeoVideo {
  private vram: Uint8Array;           // 68 KB (slow 64KB + fast 4KB)
  private spritesRom: Uint8Array;     // C-ROM assemblee
  private fixedRom: Uint8Array;       // S-ROM
  private biosFixedRom: Uint8Array;   // sfix.sfix (BIOS fix tiles)
  private loRom: Uint8Array;          // L0 ROM (shrink tables, 64KB)
  private paletteRam: Uint8Array;     // 8 KB (4096 x 16-bit)
  private paletteCache: Uint32Array;  // 4096 entrees, ABGR Uint32
  private fb32: Uint32Array;          // framebuffer 320x224
  private lineBuffer: Uint16Array;    // double line buffer 320 pixels
}
```

**Pipeline de rendu par frame** :

1. **Parse des 381 sprites** (SCB1-SCB4) et construction d'une active list par scanline
2. **Pour chaque scanline** (0-223) :
   a. Identifier les sprites actifs (Y check via SCB3 : `496 - y_value` donne la position ecran, hauteur donne le nombre de tiles)
   b. Limiter a 96 sprites par scanline (les sprites au-dela sont clippes)
   c. Pour chaque sprite actif, de droite a gauche (priorite : sprite index bas = devant) :
      - Lire le tile code depuis SCB1 (2 mots par tile : code + attributs)
      - Appliquer le shrink horizontal (SCB2 bits 8-11) et vertical (SCB2 bits 0-7) via les lookup tables L0-ROM
      - Decoder les pixels du tile, ecrire dans le line buffer
   d. Composer la fix layer par-dessus (40 tiles de 8x8 sur chaque ligne)
3. **Copier le line buffer dans le framebuffer**

**SIMPLIFICATION MVP** : ignorer le shrink (sprite scaling) pour la premiere version. La grande majorite des jeux de fighting n'utilisent le shrink que pour des effets mineurs (ombres, intro). Les sprites seront rendus a 100% de taille. Le shrink pourra etre ajoute plus tard en utilisant les tables L0-ROM.

**Sticky bit** (le point cle pour le grouping) :
```typescript
// SCB3 pour le sprite N :
const scb3 = this.readVramWord(NGO_SCB3_BASE + spriteIndex);
const yPos = (scb3 >> 9) & 0x7F;   // bits 15-9 (en realite 496 - y)
const sticky = (scb3 >> 8) & 1;     // bit 8
const height = scb3 & 0xFF;         // bits 7-0 (nombre de tiles verticaux)

// Si sticky=1, ce sprite herite Y, height et shrinkV du sprite precedent
// et se place a droite (+16px) du sprite precedent
```

**SCB1 — Tile data** : 64 mots par sprite (32 tiles max). Chaque tile occupe 2 mots :
- Mot pair : bits 15-0 = tile number (16 bits bas du code C-ROM)
- Mot impair : bits 15-8 = palette index (0-255), bits 7-4 = tile number MSB (4 bits, total 20 bits de tile code), bit 3 = auto-anim 8 frames, bit 2 = auto-anim 4 frames, bit 1 = flip V, bit 0 = flip H

**Fix layer** : 40x32 grille de tiles 8x8. VRAM a `0x7000-0x74FF`. Chaque entree = 1 mot : bits 15-12 = palette, bits 11-0 = tile code S-ROM. La fix layer a la priorite absolue sur les sprites (composee par-dessus).

**Palette decoding** (format Neo-Geo) :
```typescript
function decodeNeoGeoColor(word: number): number {
  const dark = (word >> 15) & 1;
  const r5 = ((word >> 8) & 0x0F) << 1 | ((word >> 2) & 1);
  const g5 = ((word >> 4) & 0x0F) << 1 | ((word >> 1) & 1);
  const b5 = ((word >> 0) & 0x0F) << 1 | (word & 1);
  // wait, re-check the bit layout
  // Neo-Geo: D R0 G0 B0 R1 G1 B1 R2 G2 B2 R3 G3 B3 R4 G4 B4
  // Actually the format is:
  // Bit 15: dark bit
  // Bits 14-8: R3 R2 R1 R0 G3 G2 G1 (wait this isn't right either)
  // Let me use the correct layout from Neo-Geo Dev Wiki:
  // Bit 15: dark bit
  // Bits 14-11: Red (high nibble)
  // Bits 10-7: Green (high nibble)
  // Bits 6-3: Blue (high nibble)
  // Bit 2: Red LSB
  // Bit 1: Green LSB
  // Bit 0: Blue LSB
  
  let r = ((word >> 8) & 0x0F) << 1 | ((word >> 2) & 1);  // 5-bit red
  let g = ((word >> 4) & 0x0F) << 1 | ((word >> 1) & 1);  // 5-bit green  
  let b = (word & 0x0F) << 1 | (word & 1);                 // WRONG — recheck

  // CORRECT bit extraction:
  const rHi = (word >> 11) & 0x0F;  // bits 14-11
  const gHi = (word >> 7) & 0x0F;   // bits 10-7
  const bHi = (word >> 3) & 0x0F;   // bits 6-3
  const rLo = (word >> 2) & 1;      // bit 2
  const gLo = (word >> 1) & 1;      // bit 1
  const bLo = word & 1;             // bit 0
  
  let r8 = (rHi << 4 | rHi) | rLo;  // expand 5-bit to 8-bit
  let g8 = (gHi << 4 | gHi) | gLo;
  let b8 = (bHi << 4 | bHi) | bLo;
  
  // Note: l'expansion correcte de 5 bits vers 8 bits :
  // r8 = (r5 << 3) | (r5 >> 2)
  r8 = ((rHi << 1 | rLo) << 3) | ((rHi << 1 | rLo) >> 2);
  g8 = ((gHi << 1 | gLo) << 3) | ((gHi << 1 | gLo) >> 2);
  b8 = ((bHi << 1 | bLo) << 3) | ((bHi << 1 | bLo) >> 2);
  
  if (dark) {
    r8 >>= 1;
    g8 >>= 1;
    b8 >>= 1;
  }
  
  return (255 << 24) | (b8 << 16) | (g8 << 8) | r8;  // ABGR Uint32
}
```

**ATTENTION** : bien verifier le format exact des couleurs Neo-Geo avec la doc Neo-Geo Dev Wiki. Le pseudo-code ci-dessus est un guide, pas une reference — valider chaque champ bit par bit.

**`renderFrame(framebuffer: Uint8Array)`** : meme signature que `CPS1Video.renderFrame()` pour rester compatible avec `RendererInterface`.

**`bufferSprites()`** : sur Neo-Geo il n'y a pas de double-buffering OBJ comme sur CPS1. La VRAM est lue directement. Mais il faut quand meme snapshot l'etat au VBlank pour la coherence.

**Methodes pour l'editeur** (necessaires pour le sprite analyzer) :
- `readSpriteEntry(index: number): { tileCode, palette, flipH, flipV, x, y, height, sticky }` — lit les 4 SCB pour un sprite
- `readAllSpriteGroups(): SpriteGroup[]` — lit tous les sprites, groupe par sticky chain

**Tests** : `src/__tests__/neogeo-video.test.ts`
- Decodage de couleur Neo-Geo (dark bit, LSBs)
- Lecture/ecriture VRAM indirecte
- Parse SCB entries synthetiques
- Rendering d'un tile unique sur framebuffer

---

## Etape 4 — Audio YM2610 WASM (2 jours)

### 4.1 Cloner ymfm et ecrire le wrapper

**Dependance** : `ymfm` par Aaron Giles (BSD-3-Clause)
- Repo : https://github.com/aaronsgiles/ymfm
- Fichiers necessaires : `src/ymfm_opn.cpp`, `src/ymfm_opn.h`, `src/ymfm_adpcm.cpp`, `src/ymfm_adpcm.h`, `src/ymfm_ssg.cpp`, `src/ymfm_ssg.h`, `src/ymfm_fm.h`, `src/ymfm.h`, `src/ymfm_fm.ipp`, `src/ymfm_misc.h`, `src/ymfm_misc.cpp`

**Action** : cloner les fichiers source de ymfm dans `wasm/ymfm/` (pas de submodule git, copie directe pour simplicite).

**Fichier wrapper** : `wasm/ym2610_wrapper.cpp`

```cpp
#include <emscripten.h>
#include <cstring>
#include <cstdint>
#include "ymfm/ymfm_opn.h"

// Interface ymfm : callback pour lire les samples ADPCM dans V-ROM
class NeoGeoYmInterface : public ymfm::ymfm_interface {
public:
    uint8_t* adpcm_rom = nullptr;
    uint32_t adpcm_rom_size = 0;
    
    virtual uint8_t ymfm_external_read(ymfm::access_class type, uint32_t address) override {
        if (type == ymfm::ACCESS_ADPCM_A || type == ymfm::ACCESS_ADPCM_B) {
            if (address < adpcm_rom_size) return adpcm_rom[address];
            return 0;
        }
        return 0;
    }
    
    virtual void ymfm_external_write(ymfm::access_class type, uint32_t address, uint8_t data) override {
        // V-ROM is read-only
    }
    
    virtual void ymfm_set_timer(uint32_t tnum, int32_t duration) override {
        // Timer tracking for IRQ generation
        timer_active[tnum] = (duration >= 0);
        timer_duration[tnum] = duration;
    }
    
    virtual void ymfm_update_irq(bool asserted) override {
        irq_state = asserted;
    }
    
    virtual bool ymfm_is_busy() override { return false; }
    
    bool irq_state = false;
    bool timer_active[2] = {false, false};
    int32_t timer_duration[2] = {0, 0};
};

static NeoGeoYmInterface ym_interface;
static ymfm::ym2610* ym_chip = nullptr;

#define SAMPLE_BUF_SIZE 4096
static float sample_buf_l[SAMPLE_BUF_SIZE];
static float sample_buf_r[SAMPLE_BUF_SIZE];
static int sample_buf_pos = 0;
static int clock_counter = 0;
// YM2610 output rate = clock / 144 = 8MHz / 144 = 55556 Hz
#define CLOCKS_PER_SAMPLE 144

extern "C" {

EMSCRIPTEN_KEEPALIVE
void ym2610_init() {
    if (ym_chip) delete ym_chip;
    ym_chip = new ymfm::ym2610(ym_interface);
    ym_chip->reset();
    sample_buf_pos = 0;
    clock_counter = 0;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_reset() {
    if (ym_chip) ym_chip->reset();
    sample_buf_pos = 0;
    clock_counter = 0;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_set_rom(uint8_t* rom_ptr, uint32_t rom_size) {
    ym_interface.adpcm_rom = rom_ptr;
    ym_interface.adpcm_rom_size = rom_size;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_write(uint32_t port, uint8_t data) {
    // port 0 = addr low, 1 = data low, 2 = addr high, 3 = data high
    if (ym_chip) ym_chip->write(port & 3, data);
}

EMSCRIPTEN_KEEPALIVE
uint8_t ym2610_read(uint32_t port) {
    if (!ym_chip) return 0;
    return ym_chip->read(port & 3);
}

EMSCRIPTEN_KEEPALIVE
int ym2610_generate(int num_samples) {
    if (!ym_chip) return 0;
    ymfm::ym2610::output_data output;
    int generated = 0;
    for (int i = 0; i < num_samples && sample_buf_pos < SAMPLE_BUF_SIZE; i++) {
        ym_chip->generate(&output, 1);
        // output.data[0] = left, output.data[1] = right (signed 16-bit)
        sample_buf_l[sample_buf_pos] = output.data[0] / 32768.0f;
        sample_buf_r[sample_buf_pos] = output.data[1] / 32768.0f;
        sample_buf_pos++;
        generated++;
    }
    return generated;
}

EMSCRIPTEN_KEEPALIVE
int ym2610_clock_cycles(int num_cycles) {
    // Alternative API : clock par cycles au lieu de samples
    if (!ym_chip) return 0;
    int irq_flags = 0;
    ymfm::ym2610::output_data output;
    for (int c = 0; c < num_cycles; c++) {
        bool irq_before = ym_interface.irq_state;
        // ymfm uses generate() not clock(), so we accumulate clocks
        clock_counter++;
        if (clock_counter >= CLOCKS_PER_SAMPLE) {
            clock_counter = 0;
            ym_chip->generate(&output, 1);
            if (sample_buf_pos < SAMPLE_BUF_SIZE) {
                sample_buf_l[sample_buf_pos] = output.data[0] / 32768.0f;
                sample_buf_r[sample_buf_pos] = output.data[1] / 32768.0f;
                sample_buf_pos++;
            }
        }
        bool irq_after = ym_interface.irq_state;
        if (!irq_before && irq_after) irq_flags |= 1;
        if (irq_before && !irq_after) irq_flags |= 2;
    }
    return irq_flags;
}

EMSCRIPTEN_KEEPALIVE int ym2610_get_sample_count() { return sample_buf_pos; }
EMSCRIPTEN_KEEPALIVE float* ym2610_get_samples_l() { return sample_buf_l; }
EMSCRIPTEN_KEEPALIVE float* ym2610_get_samples_r() { return sample_buf_r; }
EMSCRIPTEN_KEEPALIVE void ym2610_drain_samples(int count) {
    if (count >= sample_buf_pos) { sample_buf_pos = 0; return; }
    memmove(sample_buf_l, sample_buf_l + count, (sample_buf_pos - count) * sizeof(float));
    memmove(sample_buf_r, sample_buf_r + count, (sample_buf_pos - count) * sizeof(float));
    sample_buf_pos -= count;
}
EMSCRIPTEN_KEEPALIVE int ym2610_get_sample_rate() { return 55556; }

EMSCRIPTEN_KEEPALIVE
uint8_t* ym2610_alloc_rom(uint32_t size) {
    uint8_t* ptr = new uint8_t[size];
    ym2610_set_rom(ptr, size);
    return ptr;
}

EMSCRIPTEN_KEEPALIVE
bool ym2610_get_irq() { return ym_interface.irq_state; }

} // extern "C"
```

**ATTENTION sur l'API ymfm** : ymfm utilise `generate()` et non `clock()`. Un appel `generate(&output, 1)` produit UN sample de sortie. Ce n'est pas cycle-accurate comme Nuked-OPM — c'est HLE. La relation cycles ↔ samples est `CLOCKS_PER_SAMPLE = 144` (clock 8 MHz / sample rate 55556 Hz).

**Verification CRITIQUE** : avant d'implementer, verifier dans le header `ymfm_opn.h` :
1. Le type exact de `output_data` (nombre de canaux : 2 pour stereo, ou plus ?)
2. La methode `write(uint32_t offset, uint8_t data)` — verifier que offset 0-3 correspond bien aux ports A0/D0/A1/D1
3. Le constructeur `ym2610(ymfm_interface&)` — pas de channel_mask ou parametre supplementaire ?

### 4.2 Compilation WASM

**Commande** (a ajouter dans un script `wasm/build-ym2610.sh`) :
```bash
source ~/emsdk/emsdk_env.sh
cd wasm
em++ -O3 -std=c++17 \
  ym2610_wrapper.cpp \
  ymfm/ymfm_opn.cpp \
  ymfm/ymfm_adpcm.cpp \
  ymfm/ymfm_ssg.cpp \
  ymfm/ymfm_misc.cpp \
  -o ym2610.mjs \
  -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME='createYM2610' -s EXPORT_ES6=1 \
  -s SINGLE_FILE=1 -s FILESYSTEM=0 -s ENVIRONMENT='web' \
  -s INITIAL_MEMORY=4194304 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='["_ym2610_init","_ym2610_reset","_ym2610_write","_ym2610_read","_ym2610_clock_cycles","_ym2610_generate","_ym2610_get_sample_count","_ym2610_get_samples_l","_ym2610_get_samples_r","_ym2610_drain_samples","_ym2610_get_sample_rate","_ym2610_alloc_rom","_ym2610_get_irq","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF32"]'
```

**Note** : `INITIAL_MEMORY=4194304` (4 MB) car les V-ROMs Neo-Geo peuvent faire jusqu'a 16 MB. Avec `ALLOW_MEMORY_GROWTH`, le WASM peut grossir si necessaire.

### 4.3 Wrapper TypeScript

**Fichier** : `src/audio/ym2610-wasm.ts`

Meme pattern que `nuked-opm-wasm.ts` :
```typescript
export class YM2610Wasm {
  private module: YM2610Module;
  
  async init(): Promise<void>;
  loadVRom(vromData: Uint8Array): void;  // copie dans le heap WASM
  write(port: number, value: number): void;  // port 0-3
  read(port: number): number;
  clockCycles(numCycles: number): number;  // retourne IRQ flags
  generateSamples(bufL: Float32Array, bufR: Float32Array, count: number): number;
  getSampleRate(): number;  // 55556
  reset(): void;
  getHeapSnapshot(): string;  // pour save states
  setHeapSnapshot(data: string): void;
}
```

**Difference majeure avec nuked-opm-wasm.ts** : la V-ROM doit etre copiee dans le heap WASM pour que le callback `ymfm_external_read` puisse y acceder. Utiliser `_ym2610_alloc_rom(size)` qui alloue dans le heap WASM, puis `HEAPU8.set(vromData, ptr)`.

### 4.4 Audio Worker Neo-Geo

**Fichier** : `src/audio/neogeo-audio-worker.ts`

Meme architecture que `audio-worker.ts` :
- `setInterval(runAudioTick, 4)` avec debt accumulator
- Z80 tourne en autonome, clocke le YM2610
- Mixing : le YM2610 sort deja en stereo (FM + SSG + ADPCM-A + ADPCM-B sont mixes en interne par ymfm), donc pas besoin de mixer manuellement comme CPS1 (YM2151 + OKI separement). Un seul resampler stereo suffit.

**Pipeline simplifie** :
```
Z80 step() × N cycles → ym2610.clockCycles(cycles)
→ ym2610.generateSamples() (55556 Hz stereo)
→ LinearResampler L+R (55556 Hz → contextRate)
→ clip() → RingBufferWriter
```

**Message protocol** : identique a `audio-worker.ts` (`init`, `latch`, `reset`, `getState`, `setState`, `suspend`, `resume`, `terminate`). Ajouter `loadVRom` pour charger les samples ADPCM dans le WASM.

**Tests** : pas de test unitaire pour le worker (il depend du WASM), mais verifier que le module ym2610.mjs compile et s'initialise sans erreur.

---

## Etape 5 — Sprite Analyzer Neo-Geo (1 jour)

**Fichier** : `src/editor/neogeo-sprite-analyzer.ts`

### Differences cles avec `sprite-analyzer.ts`

1. **Pas d'heuristique de proximite pour le grouping vertical** : le sticky bit donne explicitement les chaines. Le grouping est deterministe, pas probabiliste.

2. **Grouping horizontal par proximite** : les colonnes (chaines sticky) sont des sprites independants positionnes par X. Deux colonnes adjacentes d'un meme personnage sont a 16px l'une de l'autre. Tolerance : 4px (meme que CPS1).

3. **Transparent pen = index 0** (pas 15 comme CPS1).

4. **Pas de multi-tile blocking** : sur Neo-Geo, chaque sprite est deja une colonne de tiles (via height dans SCB3). Pas besoin d'expandre nx*ny comme sur CPS1.

**Algorithme** :
```
1. Lire les 381 sprites (SCB1-SCB4)
2. Pour chaque sprite avec sticky=0 : c'est un master → demarrer un nouveau StickyChain
3. Pour chaque sprite avec sticky=1 : l'ajouter au StickyChain precedent
4. Chaque StickyChain = une colonne verticale de tiles, avec X, Y, height
5. Grouper les StickyChains par proximite X (tolerance 4px) ET meme palette
6. Chaque groupe = un personnage (SpriteGroup)
```

**Interface de sortie** : reutiliser `SpriteGroup` et `CapturedPose` de `sprite-analyzer.ts` (ou les re-exporter depuis un fichier commun). Le format est identique — c'est juste la methode de grouping qui change.

**`poseHash`** : meme logique (tri des codes, join). Le hash est independant du hardware.

**`assembleCharacter`** : meme logique de rendu back-to-front mais avec transparent pen = 0 au lieu de 15.

---

## Etape 6 — Emulateur Neo-Geo (2 jours — integration)

**Fichier** : `src/neogeo-emulator.ts`

### Architecture

Meme pattern que `emulator.ts` mais avec les composants Neo-Geo. La classe `NeoGeoEmulator` :

```typescript
class NeoGeoEmulator {
  private bus: NeoGeoBus;
  private z80Bus: NeoGeoZ80Bus;
  private m68000: M68000;        // reutilise tel quel
  private z80: Z80;              // reutilise tel quel
  private video: NeoGeoVideo;
  private renderer: RendererInterface;  // WebGL ou Canvas
  private audioOutput: AudioOutput;     // reutilise tel quel
  private input: InputManager;          // adaptee (voir ci-dessous)
  private framebuffer: Uint8Array;      // 320x224x4
}
```

### Frame loop

```
for scanline in 0..263 (NGO_VTOTAL):
    if scanline == 224 (NGO_VBLANK_LINE):
        video.bufferSprites()
        m68000.assertInterrupt(1)    // IRQ1 = VBlank (niveau 1, pas 2 comme CPS1 !)
    
    run M68000 for NGO_M68K_CYCLES_PER_SCANLINE cycles
```

**ATTENTION** : sur Neo-Geo, le VBlank est IRQ niveau 1 (pas 2 comme CPS1). Le BIOS utilise :
- IRQ1 (vecteur 0x64) : VBlank
- IRQ2 (vecteur 0x68) : timer LSPC programmable
- IRQ3 (vecteur 0x6C) : coldboot (premiere frame seulement)

Le BIOS gere l'init et appelle le programme du jeu via des vecteurs en RAM. Le flow de boot est :
1. BIOS demarre a l'adresse reset (dans la BIOS ROM a 0xC00000)
2. BIOS initialise le hardware, configure la RAM
3. BIOS saute au vecteur utilisateur en RAM (copie depuis P-ROM)
4. Le jeu prend le controle

### Input mapping Neo-Geo

Le Neo-Geo a des layouts de boutons differents :
- **4 boutons** : A, B, C, D (la plupart des fighting games)
- Select/Start/Coin

I/O ports :
- 0x300000 : P1 (bits 0-7 = Up, Down, Left, Right, A, B, C, D, active LOW)
- 0x320000 : P2 (meme layout, lecture seule)
- 0x340000 : Systeme (Start1, Select1, Start2, Select2, Coin1, Coin2...)
- 0x380000 : Status (AES/MVS flag, etc.)

Adapter `InputManager.updateBusPorts()` pour ecrire dans les ports Neo-Geo au lieu des ports CPS1. Le mapping clavier par defaut :
- Fleches : directions
- A → bouton A, S → B, D → C, Z → D
- 5 → Coin, 1 → Start

### BIOS integration

Le BIOS Neo-Geo est critique — il gere :
- L'ecran de verification (eye catcher)
- Le menu de selection (MVS)
- L'initialisation du hardware
- Les vecteurs d'interruption
- La communication son (envoi de commandes au Z80)

Le programme tourne depuis la BIOS, pas directement depuis la P-ROM. La BIOS copie les vecteurs du jeu en RAM basse (0x100000-0x10FFFF) et les appelle via des sauts indirects.

**Implementation** :
1. Charger la BIOS ROM a 0xC00000
2. Le vecteur reset du 68K pointe vers la BIOS (pas vers la P-ROM)
3. La BIOS lira les metadata du jeu depuis la P-ROM (header a 0x000100+)
4. La BIOS initialisera le Z80, le YM2610, et appellera le jeu

### Point d'entree

Modifier `src/index.ts` pour detecter si le ZIP charge est un jeu Neo-Geo (presence de fichiers BIOS ou pattern de noms C-ROM) et instancier `NeoGeoEmulator` au lieu de `Emulator`.

Ou mieux : ajouter un selecteur UI "CPS1 / Neo-Geo" dans le drop zone, pour que l'utilisateur choisisse explicitement.

**Alternative recommandee** : detection automatique. Si le ZIP contient des fichiers matchant `NEOGEO_GAME_DEFS`, utiliser `NeoGeoEmulator`. Sinon, tenter `GAME_DEFS` CPS1. Fallback : demander a l'utilisateur.

---

## Etape 7 — Aseprite integration Neo-Geo (inclus dans etape 5)

Reutiliser `aseprite-writer.ts` et `aseprite-reader.ts` tels quels. Les seuls changements :

1. **Manifest** : ajouter un champ `platform: 'cps1' | 'neogeo'` pour que l'import sache quel tile encoder utiliser
2. **Transparent pen** : pen 0 (pas 15). Dans `aseprite-io.ts`, le pen transparent est actuellement hardcode a 15. Il faut le parametrer selon la plateforme.
3. **Tile encode/decode** : appeler `neogeo-tile-encoder.ts` au lieu de `tile-encoder.ts` selon le manifest

---

## Ordre d'execution recommande

```
Jour 1-2 : Etape 0 + Etape 1 (constantes + game defs + ROM loader)
           Livrable : un test qui charge un ZIP Neo-Geo et retourne un NeoGeoRomSet

Jour 3-4 : Etape 2 (bus 68K + bus Z80)
           Livrable : tests unitaires du bus, VRAM indirecte, I/O ports

Jour 5-7 : Etape 3 (video LSPC2)
           Livrable : rendu de la fix layer + sprites basiques (sans shrink)
           Test visuel : le BIOS Neo-Geo affiche l'eye catcher

Jour 8-9 : Etape 4 (audio YM2610 WASM)
           Livrable : WASM compile, wrapper TS, audio worker
           Test : son au boot BIOS (jingle SNK)

Jour 10  : Etape 5 + 6 (sprite analyzer + integration emulateur)
           Livrable : un jeu Neo-Geo jouable dans le browser
           Test : KOF98 ou Metal Slug demarre et est jouable
```

---

## Pieges connus (tires de l'experience CPS1)

### 1. Ne pas polluer les fichiers core CPS1
> **Feedback** : "Keep debug code out of core emulation files, only add minimal hooks"

Creer des fichiers separes `neogeo-*.ts` plutot que de modifier les fichiers CPS1 existants. Les seules modifications aux fichiers existants doivent etre :
- `src/index.ts` : ajouter la detection Neo-Geo et l'instanciation de `NeoGeoEmulator`
- `src/types.ts` : aucune modification (les interfaces sont deja generiques)
- `src/editor/aseprite-io.ts` : parametrer le transparent pen (15 ou 0) selon la plateforme

### 2. Tester le roundtrip tile encoder tot
> **Learning** : le tile encoder CPS1 a eu des bugs subtils d'entrelacement

Ecrire les tests de roundtrip pour `neogeo-tile-encoder.ts` DES le jour 1. Ne pas attendre que le rendu marche pour decouvrir des bugs d'encodage.

### 3. Le BIOS est le premier test
> Le BIOS Neo-Geo est le "hello world". S'il ne boot pas, rien ne marchera.

Prioriser le boot BIOS avant tout jeu. L'eye catcher (ecran SNK avec le logo) est le premier test visuel. Il ne necessite que :
- Bus 68K (lecture BIOS ROM, ecriture RAM)
- VRAM indirecte
- Fix layer rendering (pour le texte/logo)
- Palette RAM
- IRQ VBlank

Les sprites et le son peuvent attendre.

### 4. Ne jamais commiter sans validation explicite
> **Feedback** : "NEVER commit without explicit user approval"

### 5. Le YM2610 est un chip different du YM2151
Ne pas essayer de reutiliser `nuked-opm-wasm.ts`. C'est un chip completement different (OPN vs OPM). ymfm a une API differente. Le wrapper doit etre ecrit from scratch.

### 6. I/O ports Z80 sont critiques sur Neo-Geo
Sur CPS1, `ioRead/ioWrite` etaient des no-ops. Sur Neo-Geo, c'est par la que passent TOUS les acces au YM2610. Ne pas oublier d'implementer `ioRead` et `ioWrite` dans le bus Z80.

### 7. Resolution 320x224 vs 384x224
Le framebuffer est plus petit que CPS1. S'assurer que le WebGL renderer gere les deux tailles (il devrait — `texSubImage2D` prend width/height en parametre). Verifier que le canvas CSS scale correctement.

---

## Critere de succes

Le MVP est valide quand :
1. Un ZIP Neo-Geo est charge et identifie automatiquement
2. Le BIOS boot et affiche l'eye catcher
3. Un jeu de fighting (KOF98 ou Fatal Fury Special) demarre et est jouable
4. Le son fonctionne (FM + ADPCM)
5. Le sprite analyzer groupe les personnages par sticky chain
6. L'export Aseprite fonctionne (capture → export → reimport)
7. Tous les tests passent (`npm test`)

---

## Hors scope MVP (Phase 2)

- Sprite shrink (scaling hardware via L0-ROM)
- Jeux encryptes (NEO-CMC, NEO-SMA)
- Auto-animation (flip-book hardware)
- Memory card
- Save states Neo-Geo
- Audio panel/DAW pour YM2610
- FM Patch Editor pour YM2610
- Debug panel 3D pour Neo-Geo
- Neo-Geo CD support
