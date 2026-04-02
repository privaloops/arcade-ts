# Release Checklist — v1.0 public launch

## 1. Testing matrix

Test automatisé en 3 niveaux via Playwright (`tests/e2e/game-matrix.spec.ts`).

### Niveau 1 — Boot (automatique) ✅

Pour chaque ROM dans `public/roms/` :
- [x] Charger la ROM, attendre l'écran titre
- [x] Screenshot vs image de référence (`toHaveScreenshot()`)
- [x] Pass/fail automatique

### Niveau 2 — Audio (automatique) ✅

Après coin + start + quelques secondes de gameplay :
- [x] Ouvrir le panneau audio (F3)
- [x] Screenshot de la timeline FM
- [x] Vérifier que les canaux FM ont des animations (barres non vides = audio actif)

### Niveau 3 — Sprites & Scroll REC (semi-automatique) ✅

- [x] Coin + start + spam inputs random (~80 seconds to skip intros)
- [x] Activer REC sur tous les layers (Sprites + BG1/BG2/BG3) automatiquement
- [x] Exporter les captures en PNG dans `test-results/sprite-rec/<rom>/`
- [ ] **Review manuelle** des 29 dossiers (766 captures: 179 sprites + 587 scrolls)

### Post-test

- [ ] Mettre à jour le README (actuellement "32 playable, 8 known issues") avec les résultats
- [ ] Détailler les "known issues" (actuellement juste "Not working" — préciser : crash au boot ? glitch graphique ?)

## 2. Sprite capture

- [ ] Tester le REC sprites sur les jeux denses (Magic Sword, Knights of the Round, King of Dragons)
- [ ] Implémenter le fallback sélection manuelle (ou documenter les limitations)

## 3. Landing page

- [ ] Remplacer tous les `gif-placeholder` par de vrais GIFs/vidéos
- [ ] Retirer "Photo Import" (feature retirée du produit)
- [ ] Retirer "Live Sprite Editor" pixel-by-pixel (l'édition se fait dans Aseprite maintenant)
- [ ] Ajouter le workflow Aseprite (le vrai USP : capture -> export -> Aseprite -> import)
- [ ] Vérifier que `/images/hero-3d.gif` existe

## 4. README

- [ ] Vérifier la cohérence avec l'état actuel (features listees = features reelles)

## 5. Contenu marketing

- [ ] GIFs de demo du workflow Aseprite complet
- [ ] GIF de la vue 3D explosee
- [ ] GIF du sample browser
