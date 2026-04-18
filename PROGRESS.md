# Implementation Progress

> Tracked by agents across sessions. Read this first, update it last.
> See `ARCADE-FRONTEND-PLAN.md` for full specs.

## Current Phase: 3 — ROM Transfer (WebRTC) + Phone Remote
## Current Step: Not started
## Status: PENDING (Phases 0, 1 and 2 complete)

## Completed

### Phase 0 — Monorepo Setup (2026-04-17, merged into main)

- [x] 0.1 — Workspace scaffolding (5 empty packages, tsconfig.base.json, root workspaces)
- [x] 0.2 — Extract `@sprixe/engine` — 24 test files, 1002 tests pass
- [x] 0.3 — Extract `@sprixe/edit` — 14 test files, 143 tests pass
- [x] 0.4 — Extract `@sprixe/site` — dev server serves landing (HTTP 200)
- [x] 0.5 — Scaffold `@sprixe/image` — pi-gen stage + systemd units + plymouth theme
- [x] 0.6 — Final validation — npm test (1145 tests), npm run build (all packages), npm run dev:edit (play/ serves)

### Phase 1 — Frontend Skeleton + Gamepad Nav (2026-04-17, merged into main)

- [x] 1.1 — Scaffold `@sprixe/frontend` (Vite :5174, Vitest jsdom + fake-indexeddb + gamepad mock, Playwright arcade project)
- [x] 1.2 — GamepadNav (polling, down-edge, key-repeat 250/80ms, coin-hold 1s)
- [x] 1.3 — FocusManager (4-direction nav, wrap opt-in, sparse grids)
- [x] 1.4 — ScreenRouter (FSM with DEFAULT_TRANSITIONS, back stack, onEnter/onLeave hooks)
- [x] 1.5 — Game browser (virtualized list ≤20 DOM nodes for 1000 items, selection persists across setItems, video preview panel)
- [x] 1.6 — Filter bar (predicates + 4-pill UI — ALL / CPS-1 / NEO-GEO / FAVORITES with LB/RB cycling)
- [x] 1.7 — CSS design tokens + dark arcade theme (§2.1 tokens, Rajdhani + Inter bundled via @fontsource)
- [x] 1.8 — HTML splash screen (inline CSS, fades on 'app-ready' event)
- [x] 1.9 — Hints bar (context-dependent labels, disabled actions vanish)
- [x] 1.10 — Mock data (10-game catalogue with mixed CPS-1/Neo-Geo + 2 favorites)

### Phase 2 — Game Loading + In-Game (2026-04-18, branch `feature/phase-2-game-loading`)

- [x] 2.1 — `loadRomFromBuffer()` on Emulator + NeoGeoEmulator + engine-bridge `identifyRom()` (CPS1_GAME_CATALOG exported)
- [x] 2.2 — RomDB (IndexedDB 'roms' store, ordered list, markPlayed + setFavorite + totalSize)
- [x] 2.3 — Wire game browser to RomDB (rom-source.ts resolves titles via CPS-1 catalog + Neo-Geo map, MOCK_GAMES fallback on empty DB)
- [x] 2.4 — First-boot input mapping screen (6 sequential prompts, duplicate refusal, axis deadzone 0.3, keyboard-mode auto-detect, localStorage v1)
- [x] 2.5 — InputRouter (mode='menu' forwards NavActions, mode='emu' drops them, coin-hold fires in both modes)
- [x] 2.6 — CoinHoldDetector (standalone module, deterministic tick-driven state machine, tap/hold/long-press-no-commit outcomes)
- [x] 2.7 — PauseOverlay + minimal PlayingScreen (role=dialog + focus trap + 4 menu actions, MockEmulator implementing EmulatorHandle)
- [x] 2.8 — Golden path E2E (browser → playing → pause → quit → browser, selection preserved, heap growth <10 MB)
- [x] 2.9 — SaveStateDB (IndexedDB 'savestates' store, 4 slots/game, migration from legacy localStorage keys)

### Phase 2 totals

- Vitest: 209 tests / 16 files (+107 on top of Phase 1, grand total 1354 across all packages)
- E2E arcade: 10 tests
  - p1-browser-navigation, p1-filter-bar, p1-design-tokens, p1-boot-splash ×2
  - p2-browser-real-roms, p2-first-boot-mapping ×2, p2-pause-flow, p2-select-play-quit
- `npm run dev:frontend` →  mapping screen on first boot, then browser → press A → playing screen → coin hold → pause → resume/quit

### Phase 2 plan divergences

- `loadRom(file)` on `Emulator` is now a thin wrapper around `loadRomFromBuffer(await file.arrayBuffer())`; the prior signature kept working.
- `CPS1_GAME_CATALOG` now exported from `@sprixe/engine/game-catalog` so the frontend resolves titles without re-parsing the MAME .cpp.
- `identifyGame()` exposed from `memory/rom-loader` for the same reason.
- IDB schema bumped to v2 in Phase 2.9 (Phase 2.2 opened v1 for 'roms'; the savestates store lands in the same upgrade path).
- Phase 2.9 E2E (save → quit → reload → load with frame-hash equality) is deferred to Phase 4 — it requires the real emulator serialization which the current MockEmulator doesn't expose. Unit round-trip is covered.
- Phase 2.1's test lives at `engine-bridge/load-rom.test.ts` (plan path) but asserts `identifyRom()` behaviour rather than instantiating a full emulator — Phase 2.8's golden-path E2E covers the runtime instantiation via the mock.

## Blocked / Notes

- `stage-sprixe/02-plymouth/files/logo.png` not committed — Phase 5 generates the boot logo.
- Phase 2.9's save/load flow is NOT wired into PauseOverlay yet — onSaveState/onLoadState hooks exist but fire no-ops. Phase 4 adds the slot picker UI + real emulator state serialization.
- HintsBar context flips to 'paused' on entering play, but the overlay's hint strip isn't re-rendered inside the dialog — deferred polish for Phase 4 animations pass.
- Keyboard fallback for dev/laptop testing without a gamepad is reported under Phase 2 (I-PAC mapping detect), but the browser screen itself still requires a real gamepad to navigate. Phase 3 doesn't change that; Phase 4 polish may add an explicit "use keyboard" debug toggle.

## Next Action

- Start Phase 3, Week 1, Step 1 — Integrate PeerJS (`peerjs@^1.5.4`) and use PeerJS Cloud for signaling (no custom server).
