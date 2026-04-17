# Implementation Progress

> Tracked by agents across sessions. Read this first, update it last.
> See `ARCADE-FRONTEND-PLAN.md` for full specs.

## Current Phase: 1 — Frontend Skeleton + Gamepad Nav
## Current Step: Not started
## Status: PENDING (Phase 0 complete)

## Completed

### Phase 0 — Monorepo Setup (2026-04-17, branch `feature/phase-0-monorepo`)

- [x] 0.1 — Workspace scaffolding (5 empty packages, tsconfig.base.json, root workspaces)
- [x] 0.2 — Extract `@sprixe/engine` — 24 test files, 1002 tests pass
- [x] 0.3 — Extract `@sprixe/edit` — 14 test files, 143 tests pass
- [x] 0.4 — Extract `@sprixe/site` — dev server serves landing (HTTP 200)
- [x] 0.5 — Scaffold `@sprixe/image` — pi-gen stage + systemd units + plymouth theme
- [x] 0.6 — Final validation — npm test (1145 tests), npm run build (all packages), npm run dev:edit (play/ serves)

### Divergences from ARCADE-FRONTEND-PLAN.md §3.1 (forced by engine↔edit dependencies)

- `rom-store.ts` → `@sprixe/engine` (plan: edit). Reason: `emulator.ts` instantiates RomStore.
- `audio/audio-viz.ts` → `@sprixe/engine` (plan: edit). Reason: audio workers + emulators import VizReader/VizWriter.
- `audio/audio-shared.ts` → `@sprixe/engine` (missed in plan audio list). Reason: imported by audio workers.
- `editor/neogeo-tile-encoder.ts` → `@sprixe/engine/video/neogeo-tile-encoder.ts` (plan: edit).
  Reason: `neogeo-video.ts` imports decodeNeoGeoRow/decodeFixRow.
- `wasm/` → `packages/sprixe-engine/wasm/` (plan did not specify). Reason: engine audio imports `../../wasm/*.mjs`.
- `tests/68000/`, `tests/z80/` → `packages/sprixe-engine/tests/` (plan did not specify). Reason: CPU test fixtures belong to engine.
- `tsconfig.json` at repo root: removed (each package has its own, extending `tsconfig.base.json`).
- `vite.config.ts` at repo root: removed (each consumer package has its own).
- `@sprixe/edit/tsconfig.json`: no `rootDir` (allows TS to include `@sprixe/engine/*` files outside edit's src/).

## Blocked / Notes

- `stage-sprixe/02-plymouth/files/logo.png` not committed — Phase 5 generates the boot logo.
- Root `tsconfig.json` removed — VSCode users rely on per-package tsconfig.json.
- Playwright `webServer.command` now targets `@sprixe/edit` workspace; full e2e run not re-validated (Phase 0 goal was `npm run dev:edit` only).
- `og-image.png` and `manifest.json` duplicated between `@sprixe/edit/public/` and `@sprixe/site/public/` — both pages reference them via their respective `/og-image.png` URLs.

## Next Action

- Start Phase 1, Step 1 — Create `packages/sprixe-frontend/` with Vite config (dev server on port 5174).
