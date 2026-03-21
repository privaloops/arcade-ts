# Backlog

## M68000 CPU — Tom Harte test failures (41 tests)

- [ ] **ADDX.b/MOVE.b/MOVEA avec -(A7)/(A7)+** — Le 68000 force A7 pair: décrémente/incrémente de 2 (pas 1) pour les ops byte sur A7. Fix localisé dans m68000.ts (predecrement/postincrement).
- [ ] **DIVS** — Flags incorrects (N, Z, V, C) sur division signée. 9 vecteurs échouent.
- [ ] **DIVU** — Flags incorrects sur division non-signée. 10 vecteurs échouent.
- [ ] **MULS** — Flags incorrects sur multiplication signée. 11 vecteurs échouent.
- [ ] **MULU** — Flags incorrects sur multiplication non-signée. 11 vecteurs échouent.

## Audio

- [ ] **Web Worker audio** — Déporter la génération audio (Z80 + OPM + OKI) dans un Web Worker séparé du main thread. Résoudrait le crépitement son en mode DOM renderer (les repaints DOM bloquent le main thread et causent des underruns du ring buffer audio).
- [ ] **QSound audio resampling** — `pushSamples` ne resample pas (24038 → 48000 Hz). Ajouter un resampler QSound dans AudioOutput ou utiliser `pushEmulatorSamples` avec un rate QSound.

## QSound (CPS1.5)

- [x] **QSound DSP HLE** — WASM port from MAME (22KB)
- [x] **Z80 bus QSound** — Shared RAM, DSP I/O, 250 Hz IRQ
- [x] **GFX mapper ranges** — Auto-generated from bankSizes when ranges[]
- [x] **Boot handshake** — Pre-run Z80 + DSP ROM loading
- [x] **DSP ROM** — dl-1425.bin loaded from game ZIP
- [ ] **Kabuki Z80 decryption** — Tous les jeux QSound utilisent le chiffrement Kabuki sur le Z80. Dino fonctionne (encryption faible?), mais Punisher/WoF/Slammast nécessitent un décodeur Kabuki. Code MAME: `kabuki.cpp` + tables de décodage par jeu (`dino_decode`, `punisher_decode`, etc.)
- [ ] **Dino layerEnableMask** — Corriger les valeurs (tout à 0x16, devrait avoir des bits distincts)
- [ ] **Dino son** — Pas de son actuellement (resampling manquant + vérifier si le QSound DSP génère bien des samples)

### Jeux QSound — statut

| Jeu | Boot | Video | Son |
|-----|------|-------|-----|
| Cadillacs and Dinosaurs (dino) | OK | OK | Non |
| The Punisher (punisher) | Non (Kabuki) | - | - |
| Saturday Night Slam Masters (slammast) | Non (Kabuki) | - | - |
| Muscle Bomber Duo (mbombrd) | Non (Kabuki) | - | - |
| Warriors of Fate (wof) | Non (Kabuki) | - | - |
