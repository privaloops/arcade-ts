# Arcade Frontend — Product Vision

> **"Your arcade, not your weekend."**

## Le problème

Les solutions existantes pour bornes d'arcade (Recalbox, Batocera, RetroPie, LaunchBox) partagent les mêmes défauts :
- Mises à jour qui cassent les configs (GPIO, manettes, cores)
- Lignes de commande inévitables dès qu'on sort du happy path
- Configuration manettes perdue après chaque update
- Enfer des versions MAME (ROM set 0.220 ≠ core 0.260)
- Setup initial : 1-2h minimum, clavier obligatoire

Même un développeur senior qui écrit un M68000 from scratch galère avec Recalbox. Le papa qui veut jouer avec ses gosses a abandonné au 3ème essai.

## La vision

**Un navigateur. C'est tout.**

Un produit qui transforme n'importe quel Raspberry Pi (ou vieux PC) en borne d'arcade sans rien installer, sans terminal, sans clavier. L'utilisateur ne sait même pas qu'il est dans un navigateur.

## UX cible

### Setup (une seule fois)
1. Flasher l'image SD (Raspberry Pi Imager, un clic)
2. Brancher le RPi à un écran
3. L'écran s'allume → UI arcade plein écran

### Ajout de ROMs (depuis le téléphone)
1. Un QR code s'affiche sur la borne
2. Scanner avec son téléphone → page upload
3. Glisser les ROMs → elles apparaissent sur la borne
4. Zéro clavier, zéro câble, zéro config

### Jouer
- Navigation 100% manette
- Gros visuels, lisibles à 1m
- Sélectionner un jeu → jouer. Point.

## Stack technique

| Couche | Choix | Raison |
|--------|-------|--------|
| Frontend | PWA (HTML/CSS/TS, WebGL2/WebGPU) | Offline, installable, universel |
| Émulation CPS1/Neo Geo | Émulateurs natifs Sprixe (TS/WASM) | Performance optimisée, contrôle total |
| Émulation autres systèmes | EmulatorJS (cores LibRetro WASM) | 60+ systèmes d'un coup, éprouvés |
| Audio | Web Worker + AudioWorklet + SharedArrayBuffer | Autonome, pas de latence |
| Stockage ROMs | IndexedDB (navigateur) | Pas de backend pour le jeu |
| Upload ROMs | Micro serveur local (embarqué dans l'image) | Pont téléphone → borne |
| Manettes | Gamepad API | Natif, tous les navigateurs |
| Kiosk | Chromium --kiosk | Boot direct, pas de desktop |

## Positionnement

| | Sites web (retrogames.cc...) | Recalbox / Batocera | **Ce produit** |
|---|---|---|---|
| Installation | Aucune (site web) | Flasher image + configurer | Flasher image, c'est tout |
| ROMs | Hébergées (illégal) | Transfert réseau/USB | QR code → téléphone |
| UI | Catalogue web, souris | TV/borne, manette | Borne, manette, zéro clavier |
| Clavier nécessaire | Non (c'est un site) | Oui (tôt ou tard) | **Jamais** |
| Mises à jour | Transparentes | Cassent régulièrement | Le navigateur se met à jour tout seul |
| Maintenance | Zéro | Fréquente | Zéro |
| Systèmes | Multi (LibRetro) | Multi (RetroArch) | Multi (EmulatorJS + natifs CPS1/Neo Geo) |
| Offline | Non | Oui | Oui (PWA) |

## Avantage compétitif

- **Émulateurs natifs CPS1/Neo Geo** — performance supérieure sur le cœur du catalogue arcade (Street Fighter, Metal Slug, KoF, Final Fight)
- **Zéro OS custom** — juste Chromium sur un Linux minimal. Moins de couches = moins de casse
- **Le téléphone est la télécommande** — pattern connu (Chromecast, Apple TV), résout le problème du clavier
- **Mises à jour safe** — le navigateur se met à jour indépendamment, l'app est un site web statique

## Benchmark préliminaire

Chrome DevTools, CPU throttle 6x (simule RPi 5 Cortex-A76) :
- **60 fps en croisière** sur CPS1 (Final Fight)
- **Drops à 50-55 fps** sous charge max (beaucoup de sprites)
- Drops brutales, visibles — piste d'optimisation nécessaire
- Verdict : **viable, à confirmer sur vrai hardware**

## Marché

| Donnée | Chiffre |
|--------|---------|
| Retro gaming global (2025) | 3.8 Md$ |
| Communautés Reddit arcade/retro | ~300k membres actifs |
| Seul concurrent commercial (LaunchBox) | 45$ lifetime |
| Hardware de référence (RPi 5) | ~80$ |

### Cibles
1. **Constructeurs DIY** (40%) — RPi + borne maison, veulent du plug & play
2. **Commerciaux** (20%) — bars, restaurants, zéro maintenance
3. **Collectionneurs** (20%) — exigeants sur la précision
4. **Casual** (20%) — canapé, Steam Deck, tablette

## Concurrents browser-based existants

| Site | Tech | Limites |
|------|------|---------|
| retrogames.cc | EmulatorJS, 4000+ jeux | Site web avec pub, pas un produit borne, ROMs hébergées (illégal) |
| playretrogames.com | MAME WASM, 600+ jeux | Idem |
| vizzed.com | RetroArch WASM + EmulatorJS | Idem, UI communautaire |
| webrcade | PWA, feeds JSON | Le plus proche mais UI webapp, pas arcade. Limite 450 Mo iOS |

Aucun ne propose un produit standalone pour borne d'arcade.

## Marketing

### Tagline
**"Your arcade, not your weekend."**

### Vidéo concept (30s, IA)
1. Un mec de 40 ans déballe son RPi, excité
2. Flash Recalbox, sourire confiant
3. Mise à jour bloquée, manettes perdues, lignes de commande debout derrière la borne
4. Sa fille : "papa on peut jouer ?" — "deux minutes..."
5. 3h plus tard, même scène
6. **Cut noir**
7. Même mec. Flash une carte SD. Branche. L'écran s'allume.
8. QR code → téléphone → ROMs envoyées
9. Sa fille prend la manette. Metal Slug démarre.
10. Sourire.

## Relation avec Sprixe

Deux produits distincts :

| | Sprixe | Arcade Frontend |
|---|---|---|
| But | Studio CPS1/Neo Geo (édition, Aseprite, ROM hacking) | Borne d'arcade plug & play |
| Cible | Pixel artists, romhackers | Propriétaires de bornes, grand public |
| Émulateurs | Natifs uniquement (CPS1, Neo Geo) | Natifs (CPS1/Neo Geo) + EmulatorJS (reste) |
| Complexité | Pro | Zéro |

Les émulateurs natifs Sprixe sont un composant réutilisé dans le frontend arcade, pas l'inverse.
