# Architecture Decision Records

## ADR-001: ROM version — MAME current (0.270+)

**Date** : 2026-03-17
**Statut** : Accepted

### Contexte

CPS1-web charge des ROMs au format MAME ZIP. Les romsets MAME existent en plusieurs "générations" (0.78, 0.139u1/FBNeo, current). Le choix de la version cible impacte :
- La définition des `GameDef` dans le ROM loader (noms de fichiers, tailles, offsets)
- La compatibilité avec les romsets que les utilisateurs possèdent
- L'exactitude des données (dumps corrigés au fil du temps)

### Décision

Cibler les romsets **MAME current (0.270+)**, format parent.

### Justification

1. **Exactitude** — Les romsets récents intègrent les corrections de dumps (bad dumps remplacés, CRC vérifiés). Cohérent avec l'objectif cycle-accurate du projet.
2. **Stabilité CPS1** — Les romsets CPS1 sont matures et ne changent quasiment plus depuis MAME ~0.220. Risque de casse entre versions quasi nul.
3. **Source de vérité unique** — Chaque `GameDef` est calquée directement sur `ROM_START()` dans `cps1.cpp` du source MAME. Pas d'ambiguïté.
4. **Outillage** — Les utilisateurs sérieux reconstruisent leurs romsets avec ClrMAME Pro / RomVault. MAME current est le format cible de ces outils.

### Conséquences

- Chaque `GameDef` dans `rom-loader.ts` doit référencer le `ROM_START()` correspondant avec un commentaire (ex: `// MAME 0.272 cps1.cpp ROM_START(sf2)`)
- Documenter la version MAME cible dans le README
- Optionnel : supporter les clones populaires (`sf2ua`, `sf2ce`, etc.) car les utilisateurs n'ont pas toujours le romset parent
