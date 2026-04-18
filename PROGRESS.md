# Implementation Progress

> Tracked by agents across sessions. Read this first, update it last.
> See `ARCADE-FRONTEND-PLAN.md` for full specs.

## Current Phase: 4 — Polish + Settings
## Current Step: Not started
## Status: PENDING (Phases 0, 1, 2 and 3 complete)

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

## Next Action

- Start Phase 4, Step 1 — Settings screen (display / audio / controls / network / storage / about) with localStorage-backed `settings-store`.
