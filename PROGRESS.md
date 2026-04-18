# Implementation Progress

> Tracked by agents across sessions. Read this first, update it last.
> See `ARCADE-FRONTEND-PLAN.md` for full specs.

## Current Phase: 2 — Game Loading + In-Game
## Current Step: Not started
## Status: PENDING (Phases 0 and 1 complete)

## Completed

### Phase 0 — Monorepo Setup (2026-04-17, merged into main)

- [x] 0.1 — Workspace scaffolding (5 empty packages, tsconfig.base.json, root workspaces)
- [x] 0.2 — Extract `@sprixe/engine` — 24 test files, 1002 tests pass
- [x] 0.3 — Extract `@sprixe/edit` — 14 test files, 143 tests pass
- [x] 0.4 — Extract `@sprixe/site` — dev server serves landing (HTTP 200)
- [x] 0.5 — Scaffold `@sprixe/image` — pi-gen stage + systemd units + plymouth theme
- [x] 0.6 — Final validation — npm test (1145 tests), npm run build (all packages), npm run dev:edit (play/ serves)

### Phase 0 divergences from ARCADE-FRONTEND-PLAN.md §3.1

Forced by engine↔edit dependencies detected via grep on engine imports:

- `rom-store.ts` → `@sprixe/engine` (plan: edit). Reason: `emulator.ts` instantiates RomStore.
- `audio/audio-viz.ts` → `@sprixe/engine` (plan: edit). Reason: audio workers + emulators import VizReader/VizWriter.
- `audio/audio-shared.ts` → `@sprixe/engine` (missed in plan audio list). Reason: imported by audio workers.
- `editor/neogeo-tile-encoder.ts` → `@sprixe/engine/video/neogeo-tile-encoder.ts` (plan: edit).
  Reason: `neogeo-video.ts` imports decodeNeoGeoRow/decodeFixRow.
- `wasm/` → `packages/sprixe-engine/wasm/` (plan did not specify). Reason: engine audio imports `../../wasm/*.mjs`.
- `tests/68000/`, `tests/z80/` → `packages/sprixe-engine/tests/` (plan did not specify). Reason: CPU test fixtures belong to engine.
- Root `tsconfig.json`: removed (each package extends `tsconfig.base.json`).
- Root `vite.config.ts`: removed (each consumer package has its own).
- `@sprixe/edit/tsconfig.json`: no `rootDir` (allows TS to include `@sprixe/engine/*` files outside edit's src/).

### Phase 1 — Frontend Skeleton + Gamepad Nav (2026-04-17, branch `feature/phase-1-skeleton`)

- [x] 1.1 — Scaffold `@sprixe/frontend` (Vite :5174, Vitest jsdom + fake-indexeddb + gamepad mock, Playwright arcade project)
- [x] 1.2 — GamepadNav (12 Vitest cases — polling, down-edge, key-repeat 250/80ms, coin-hold 1s)
- [x] 1.3 — FocusManager (21 Vitest cases — 4-direction nav, wrap opt-in, sparse grids)
- [x] 1.4 — ScreenRouter (18 Vitest cases — FSM with DEFAULT_TRANSITIONS, back stack, onEnter/onLeave hooks)
- [x] 1.5 — Game browser (21 Vitest cases — virtualized list ≤20 DOM nodes for 1000 items, selection persists across setItems, video preview panel)
- [x] 1.6 — Filter bar (13 Vitest cases — predicates + 4-pill UI — ALL / CPS-1 / NEO-GEO / FAVORITES with LB/RB cycling, visible-count coherent)
- [x] 1.7 — CSS design tokens + dark arcade theme (§2.1 tokens, Rajdhani + Inter bundled via @fontsource, reduced-motion cascades via --af-motion)
- [x] 1.8 — HTML splash screen (inline CSS for <100ms paint, fades on 'app-ready' event, removed from DOM after 300ms)
- [x] 1.9 — Hints bar (17 Vitest cases — context-dependent labels, disabled actions vanish, override labels for input profile changes)
- [x] 1.10 — Mock data (5 Vitest cases — 10-game catalogue with mixed CPS-1/Neo-Geo + 2 favorites, shape validation)

### Phase 1 totals

- Vitest: 102 tests / 7 files pass (added to the 1145 pre-existing tests → grand total 1247)
- E2E arcade: 5 tests (p1-browser-navigation, p1-filter-bar, p1-design-tokens, p1-boot-splash ×2) — all green
- npm run dev:frontend → HTTP 200 on :5174 with COOP/COEP headers

## Blocked / Notes

- `stage-sprixe/02-plymouth/files/logo.png` not committed — Phase 5 generates the boot logo.
- Phase 1 added `bumper-left` NavAction to GamepadNav (plan §3.3 had only `bumper-right`); needed for LB/RB filter cycling in §2.4.
- HintsBar currently hardcodes `STANDARD_LABELS`; Phase 2's input mapping flow will swap in user-mapped labels via `setLabels()`.
- `og-image.png` + `manifest.json` remain duplicated between `@sprixe/edit/public/` and `@sprixe/site/public/` (both HTML pages reference `/og-image.png` on their own origin).

## Next Action

- Start Phase 2, Step 2.1 — Add `loadRomFromBuffer()` to `Emulator` and `NeoGeoEmulator` in `@sprixe/engine` so the frontend can load ROMs from IndexedDB instead of a file picker.
