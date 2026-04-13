# Neo-Geo Sound — Plan d'implémentation

## Contexte actuel

L'audio Neo-Geo est partiellement implémenté :
- **Z80 CPU** : tourne dans un Web Worker (`audio/neogeo-audio-worker.ts`)
- **YM2610 WASM** : FM synthesis compilé depuis C (Nuked OPM adapté)
- **Architecture** : Z80 autonome dans le Worker, SharedArrayBuffer ring buffer vers AudioWorklet
- **Sound latch** : 68K → Z80 via postMessage, handshake fonctionnel (KOF97, Metal Slug bootent avec son)

### Problèmes connus
1. **Pas de son audible** sur la plupart des jeux (le Worker tourne mais le son ne sort pas ou est garbled)
2. **PCM2** : V-ROM (samples ADPCM) encrypté pour les jeux CMC50 tardifs (~8 jeux)
3. **M1 decrypt** : Z80 audio ROM encryptée pour les jeux CMC50 (le Z80 exécute du code garbled)
4. **YM2610 vs YM2151** : le YM2610 est un chip différent du YM2151 (CPS1). Vérifier que le WASM wrapper est bien adapté

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/audio/neogeo-audio-worker.ts` | Web Worker : Z80 + YM2610 WASM + resampling |
| `src/audio/audio-output.ts` | AudioWorklet + SharedArrayBuffer ring buffer |
| `src/audio/ym2610-wasm.ts` | WASM wrapper pour le YM2610 |
| `src/memory/neogeo-z80-bus.ts` | Z80 bus : ROM, RAM, ports I/O (YM2610, sound latch) |
| `src/neogeo-emulator.ts` | Branchement audio : latch callback, Worker init |
| `src/memory/neogeo-cmc.ts` | CMC50 M1 decrypt (à implémenter — tables déjà présentes) |
| `wasm/` | Sources C du YM2610 WASM (à vérifier) |

## Plan d'exécution (par ordre de priorité)

### Étape 1 : Diagnostic — comprendre pourquoi le son ne sort pas

**Oracle : FBNeo `neo_run.cpp` + `neogeo-audio-worker.ts`**

1. Lire `neogeo-audio-worker.ts` en entier — comprendre le flow audio actuel
2. Lire `ym2610-wasm.ts` — vérifier que c'est bien un YM2610 (pas un YM2151 renommé)
3. Comparer avec FBNeo `neo_run.cpp` : comment le Z80 est clocké, comment le YM2610 est connecté
4. Vérifier le ring buffer SharedArrayBuffer : est-ce que des samples non-nuls arrivent dans l'AudioWorklet ?
5. Ajouter un diagnostic : logger les premiers samples produits par le Worker

**Résultat attendu** : savoir si le problème est (a) pas de samples produits, (b) samples produits mais pas routés, ou (c) YM2610 WASM cassé.

### Étape 2 : Fix du pipeline audio Worker ↔ AudioWorklet

Selon le diagnostic :
- Si pas de samples : le Z80 ou le YM2610 ne produit rien → vérifier le clocking Z80 dans le Worker
- Si samples mais pas de son : problème de ring buffer ou AudioWorklet → vérifier `audio-output.ts`
- Si YM2610 cassé : comparer l'API avec FBNeo/MAME YM2610 (registres, timing, sample rate)

**Oracle : MAME `src/devices/sound/ym2610.cpp` ou FBNeo `burn_ym2610.cpp`**

### Étape 3 : Vérifier le Z80 bus audio (ports I/O)

Comparer `neogeo-z80-bus.ts` avec FBNeo/MAME :
- Port 0x00 : sound latch read
- Port 0x04/05 : YM2610 address/data port 0
- Port 0x06/07 : YM2610 address/data port 1
- Port 0x08 : NMI enable + bank switch
- Port 0x0C : sound reply to 68K
- Port 0x18 : NMI disable

Vérifier que le bank switching Z80 (NEO-ZMC2) est correct — le Z80 accède à la game M-ROM via des banques de 16KB.

### Étape 4 : YM2610 ADPCM-A et ADPCM-B

Le YM2610 a 3 canaux audio :
- **FM** : 4 canaux FM (comme YM2151 mais 4 au lieu de 8)
- **ADPCM-A** : 6 canaux samples 18.5 kHz (percussions, SFX)
- **ADPCM-B** : 1 canal sample variable rate (voix, musique)

Vérifier que le WASM expose les 3 types. Les ADPCM lisent directement depuis la V-ROM.

**Oracle : MAME `ym2610.cpp` — registres ADPCM-A (0x100-0x12D) et ADPCM-B (0x010-0x01C)**

### Étape 5 : PCM2 V-ROM decryption

Pour les jeux CMC50 tardifs, les V-ROM (samples ADPCM) sont encryptées.

**Source : MAME `src/devices/bus/neogeo/prot_pcm2.cpp`**

Jeux concernés : MSlug4, ROTD, Matrim, KOF2002, SamSho5, MSlug5, SVC, KOF2003.

Implémentation : decrypt à l'init dans `neogeo-emulator.ts`, similaire au CMC GFX decrypt. C'est une table XOR + address scramble sur la V-ROM.

### Étape 6 : CMC50 M1 decrypt (Z80 audio ROM)

Les tables M1 sont déjà dans `neogeo-cmc.ts` (`m1_address_8_15_xor`, `m1_address_0_7_xor`).
La fonction `cmc50_m1_decrypt` dans MAME fait un address scramble basé sur un checksum des premiers 64KB.

Implémentation : ajouter `cmcM1Decrypt()` dans `neogeo-cmc.ts`, appeler dans l'émulateur pour les jeux CMC50.

### Étape 7 : Mixing et niveaux

FBNeo mixing Neo-Geo : `nBurnSoundLen` samples par frame, FM + ADPCM mixés.
Vérifier les niveaux de mix : FM vs ADPCM-A vs ADPCM-B.

## Règles

- **TOUJOURS** lire FBNeo/MAME comme oracle avant d'implémenter
- **JAMAIS** deviner le comportement hardware
- Tester avec un jeu simple (Metal Slug 1 — pas de protection audio)
- Vérifier le son dans la console avant de toucher au code
