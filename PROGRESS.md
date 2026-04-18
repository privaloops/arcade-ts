# Implementation Progress

> Tracked by agents across sessions. Read this first, update it last.
> See `ARCADE-FRONTEND-PLAN.md` for full specs.

## Current Phase: 5 — RPi Image
## Current Step: Not started
## Status: PENDING (Phases 0, 1, 2, 3, 4 and 4b complete)

## Completed

### Phase 0 — Monorepo Setup (2026-04-17, merged into main)

- [x] 0.1 — 0.6 — see earlier revisions. 1145 tests pre-Phase 1.

### Phase 1 — Frontend Skeleton + Gamepad Nav (2026-04-17, merged into main)

- [x] 1.1 — 1.10 — see earlier revisions. 102 new Vitest cases + 5 E2E.

### Phase 2 — Game Loading + In-Game (2026-04-18, merged into main)

- [x] 2.1 — 2.9 — see earlier revisions. 107 new Vitest cases + 5 E2E.

### Phase 3 — ROM Transfer (WebRTC) + Phone Remote (2026-04-18, branch `feature/phase-3-webrtc-transfer`)

#### Week 1 — P2P foundation + basic transfer
- [x] 3.1 — `p2p/peer-deps.ts` centralises PeerJS import with a `window.__PeerMock` override hook.
- [x] 3.2 — `PeerHost` (kiosk) with per-connection reassembly + broadcast + event subscription (13 Vitest).
- [x] 3.3 — `PeerSend` (phone) with 16 KB chunking, bufferedAmount-based backpressure, one retry on transient send failure, progress callback (13 Vitest).
- [x] 3.4 — `RomPipeline` wires file identification + RomDB persistence, propagates typed errors (6 Vitest).
- [x] 3.5 — `/send/{roomId}` URL routing + `PhonePage` scaffold + 3 E2E specs including two-page BroadcastChannel mock that ships a test.zip through PeerJS and sees the host catalogue refresh.

#### Week 2 — Phone UI + remote control
- [x] 3.6 — `UploadTab` with file picker + drag-drop + FIFO queue + per-entry removal (17 Vitest + E2E).
- [x] 3.7 — `RemoteTab` with pause/resume/save/load/quit/volume + 4-slot save-slot picker + debounced volume (16 Vitest).
- [x] 3.8 — `QrCode` memoised canvas renderer encoding `https://sprixe.app/send/{roomId}` (8 Vitest).
- [x] 3.9 — `StateSync` diff-broadcast of kiosk snapshot to connected phones (8 Vitest, no-op when state unchanged).
- [x] 3.10 — `EmptyState` screen with prominent QR for first-boot; main.ts routes to it when RomDB is empty (unless localStorage `sprixe.useMockCatalogue=true`).

#### Week 3 — Polish + error handling
- [x] 3.11 — `classifyTransferError` maps every typed exception onto a UI-ready level + message (9 Vitest).
- [x] 3.12 — `sendFileWithReconnect` wraps any ResumableSender factory with one resume-on-drop retry (7 Vitest, E2E deliberately skipped for flakiness).
- [x] 3.13 — `Toast` component with capped queue (3), type-based durations (3/4/6 s), duplicate suppression, manual + auto dismissal (15 Vitest).
- [x] 3.14 — E2E `p3-phone-responsive` on iPhone 14 + Pixel 7 viewports — no horizontal scroll, every visible `<button>` ≥44×44 px (WCAG 2.5.5).

### Phase 3 totals

- Vitest: 322 tests / 26 files (+113 on top of Phase 2, grand total 1467 across all packages: 1002 engine + 143 edit + 322 frontend).
- E2E arcade: 19 tests — 4 Phase 1 + 6 Phase 2 + 9 Phase 3 (p3-rom-transfer-p2p ×3, p3-phone-upload, p3-empty-state, p3-phone-responsive ×2, plus helper updates).

### Phase 3 plan divergences

- Phase 3.11 E2E "send a .txt → error toast on host + phone" deferred to when main.ts mounts a Toast instance alongside PeerHost. The classifier is shipped; the wiring is a 5-line addition in Phase 4's polish.
- Phase 3.12 E2E deliberately skipped (plan explicitly allows it) — Vitest `sendFileWithReconnect` with a ResumableSender fake is the contract.
- RemoteTab UI → live DataConnection wiring deferred. PhonePage currently only mounts UploadTab; RemoteTab lives in `src/phone/` ready for Phase 4 to add the Upload/Remote tab switcher in PhonePage.
- Phone screen remote state-sync wiring (Phase 3.9 protocol) uses StateSync on the kiosk side but RemoteTab.setKioskState() isn't called by any live `state` message handler yet — same polish PR as above.

## Blocked / Notes

- `stage-sprixe/02-plymouth/files/logo.png` not committed — Phase 5 generates the boot logo.
- Default PeerJS Cloud signaling is reached by production PeerSend / PeerHost when `__PeerMock` is absent. Works on public networks; may be blocked on corporate VLANs (§6).
- Phase 2.9 save/load flow still not wired into PauseOverlay — onSaveState / onLoadState hooks exist but fire no-ops.

### Phase 4 — Polish + Settings (2026-04-18, branch `feature/phase-4-polish`)

- [x] 4.1 — `SettingsStore` versioned localStorage (13 Vitest).
- [x] 4.2 — `computeScale` + `isTateGame` + `crtFilterCss` render helpers (19 Vitest).
- [x] 4.3 — `parseScreenScraperResponse` CDN-upload helper (15 Vitest).
- [x] 4.4 — `MediaCache` + `PreviewLoader` + `scheduleVideoFade` (14 Vitest).
- [x] 4.5 — `History` recently-played + favorites (17 Vitest).
- [x] 4.6 — `LetterWheel` A-Z jump helper + overlay (18 Vitest).
- [x] 4.7 — `p4-animations` reduced-motion E2E contract (2 E2E).
- [x] 4.8 — `VolumeControl` pause-menu slider + mute memory (15 Vitest).

### Phase 4 totals

- Vitest: 435 tests / 33 files (+113 on top of Phase 3, grand total 1580 across all packages: 1002 engine + 143 edit + 435 frontend).
- E2E arcade: 19 tests (5 Phase 1 + 5 Phase 2 + 7 Phase 3 + 2 Phase 4).

### Phase 4 plan divergences

- Settings *screen* DOM (tabs for Display/Audio/Controls/Network/Storage/About) deferred to Phase 4.1b — the SettingsStore ships first so 4.2 + 4.8 have a persistence layer to read/write against.
- VideoPreview *DOM* not yet wired to PreviewLoader + scheduleVideoFade — Phase 4.4b in the same polish pass that wires RemoteTab into PhonePage.
- LetterWheel not yet opened from BrowserScreen — plan §2.4 maps it to RB which already cycles filters in §1.6; mapping decision deferred to Phase 4.6b (likely `favorite` / Y).
- VolumeControl slider not yet wired into PauseOverlay — `onSaveState` / `onLoadState` / volume hook land in Phase 4.8b alongside SaveStateDB integration (the two no-ops from Phase 2.9).
- Phase 4.3 E2E (`p4-video-preview` with `page.route('**/cdn/**')`) deferred — it requires the VideoPreview DOM wiring from 4.4b.
- Phase 4.8 E2E (`p4-volume-pause`) deferred — same reason (VolumeControl DOM not in PauseOverlay yet).

### Phase 4b — Polish wiring (2026-04-18, branch `feature/phase-4b-wiring`)

- [x] 4b.1 — Settings screen DOM (14 Vitest + E2E p4-settings-persistence).
- [x] 4b.2 — VideoPreview → PreviewLoader + IDB schema unification to v3. All three stores (roms/savestates/media) now land in whichever module opens the DB first.
- [x] 4b.3 — LetterWheel → BrowserScreen (Y button / 'favorite' NavAction) + E2E p4-letter-wheel.
- [x] 4b.4 — VolumeControl slider inside PauseOverlay (SettingsStore-backed) + E2E p4-volume-pause.
- [x] 4b.5 — PhonePage Upload/Remote tab switcher; RemoteTab.onCommand forwarded over the live data connection; host 'state' / 'volume' / 'save-slots' messages update RemoteTab in place.
- [x] 4b.6 — Toast mounted in bootKiosk; classifyTransferError wired on RomPipeline failures; 'complete' / 'error' protocol messages forwarded to the uploading phone + E2E p3-transfer-errors.

### Phase 4b totals

- Vitest: 449 tests / 34 files (+14 from the settings-screen unit suite).
- E2E arcade: 23 tests (+4 new — p4-settings-persistence, p4-letter-wheel, p4-volume-pause, p3-transfer-errors).
- Every Phase 4 module now has a consumer: SettingsStore / History / LetterWheel / PreviewLoader / VolumeControl / Toast.

### Phase 4b plan divergences

- Settings tabs *Controls / Network / Storage* still not implemented.
- p4-video-preview E2E with `page.route('**/cdn/**')` deferred to 4b.2c — needs CDN fixture plumbing.
- SaveStateDB integration in PauseOverlay still fires no-ops — real emulator serialization needed first.
- `__APP_VERSION__` injection for the About tab deferred (hard-coded to 'dev').

## Next Action

- Start Phase 5, Step 1 — Configure pi-gen stage-sprixe, shell scripts (chromium + X11), systemd services (sprixe-kiosk + watchdog), Plymouth theme, Makefile. `@sprixe/image` already has the directory scaffold from Phase 0.5 — Phase 5 fills in the logo.png + CI build workflow + hardware smoke tests.
