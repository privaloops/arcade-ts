# Learnings

## Session 2026-03-17 — Premier boot de SF2

### CPS1 Memory Map (68000)
- Les registres CPS-A sont à **0x800100-0x80013F**, pas 0x800000
- Les I/O ports joueur sont à **0x800000-0x800007**
- Le coin control est à **0x800030-0x800037**
- Le 68000 a un bus 24-bit : toujours masquer `address & 0xFFFFFF`
- Le SSP=0 dans SF2 est normal : le push fait A7-2 = 0xFFFFFE → masqué à 0xFFFFFE → Work RAM

### CPS1 Memory Map (Z80 audio)
- **0xF000** = YM2151 address (write) / status (read)
- **0xF001** = YM2151 data (write) / status (read)
- **0xF002** = OKI6295 (read/write)
- **0xF004** = Bank switch (write)
- **0xF008** = Sound latch from 68000 (read)
- L'audio ROM utilise ROM_LOAD + ROM_CONTINUE : premiers 32KB à 0x0000, suivants 32KB à 0x10000

### GFX ROM Format
- `ROM_LOAD64_WORD` : 4 ROMs par banque, chacune fournit 2 bytes par groupe de 8
- Plane order = {24, 16, 8, 0} → byte[3]=plane0, byte[0]=plane3
- **MSB-first** pixel order : bit 7 = leftmost pixel (contrairement à ce que STEP8(0,1) suggère)
- Chaque char 8x8 = 64 bytes, contient 2 tiles (gfxSet 0 = bytes 0-3, gfxSet 1 = bytes 4-7)
- Le bank mapper (mapper_STF29) est essentiel pour les tiles scroll2/sprites

### CPS-B Protection
- SF2 utilise CPS_B_11 : ID = 0x0401 à l'offset 0x32 des registres CPS-B
- Sans cet ID, le jeu tombe dans une boucle d'erreur après le POST
- Le layer_control est à l'offset 0x26, les priority masks à 0x28/0x2A/0x2C/0x2E

### POST (Power-On Self Test)
- Le POST fait un clear RAM + test de patterns (0xAAAA, 0x5555, 0xFFFF, 0x0000)
- Ça prend ~70-80 frames (1.3 sec) à la vraie vitesse
- Les VBlank IRQ pendant le POST corrompent l'état car le handler VBlank accède à la Work RAM non initialisée
- Solution MAME : le POST tourne avec SR=0x2700 (IPL=7, tous les IRQ masqués), donc le VBlank est ignoré
- La solution avec scanline-accurate timing résout le problème naturellement

### M68000 CPU
- Le prefetch pipeline est critique : `prefetch[1]` doit être rechargé depuis `PC+2`, pas `PC`
- BSET avec register source (bits 7-6 = 11 dans le mode field) ne doit PAS être exclu du décodage
- L'instruction STOP #imm met le CPU en halt, seul un IRQ le réveille

### Tilemap Format MAME
- Scroll1 (8x8): tilemap0Scan = `(row & 0x1f) + ((col & 0x3f) << 5) + ((row & 0x20) << 6)`
- Scroll2 (16x16): tilemap1Scan = `(row & 0x0f) + ((col & 0x3f) << 4) + ((row & 0x30) << 6)`
- Scroll3 (32x32): tilemap2Scan = `(row & 0x07) + ((col & 0x3f) << 3) + ((row & 0x38) << 6)`
- Chaque entrée = 2 words (4 bytes) : tile_code + attributes
- Attributes : palette = bits 0-4, flipX = bit 5, flipY = bit 6
- Scroll3 tile code masqué à 14 bits (& 0x3FFF)

### Sprite Format MAME
- 4 words par sprite : X, Y, tile_code, attributes (PAS code,Y,X,attr)
- Attributes : palette bits 0-4, flipX bit 5, flipY bit 6, nx bits 8-11, ny bits 12-15
- Multi-tile : `(code & ~0xF) + ((code + nxs) & 0xF) + 0x10 * nys`
- End-of-table : attribute word & 0xFF00 === 0xFF00
- Transparent pen = 15 (pas 0)

### Audio Pipeline
- Le sound latch doit être transmis en temps réel (callback immédiat), pas frame-synced
- Les timers YM2151 doivent avancer même sans audio output (ils génèrent les IRQ Z80)
- Le driver son Z80 de SF2 dépend des timer IRQ pour séquencer la musique
- Sans timer IRQ, le driver fonctionne en mode polling (très lent)

### Performance
- Le per-pixel rendering de 4 layers (384×224×4) est le bottleneck principal
- Frame rate limiter nécessaire (requestAnimationFrame peut être > 60Hz)
- Le POST prend ~80 frames, le titre screen apparaît à ~100 frames
