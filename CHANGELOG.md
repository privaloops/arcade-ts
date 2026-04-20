# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **CRT filter on video preview** — Scanlines, radial vignette, chromatic aberration and a subtle perspective tilt applied to the hover preview `<video>` via pure CSS. Overlays (`::before` / `::after`) track the real video aspect ratio (pushed via the `--af-video-ar` custom property at `loadeddata`) so the CRT bezel hugs the actual image edges, not the letterboxed box. The `<video>` stays hidden until it actually decodes a frame, so 404 cascades no longer flash a black rectangle in front of the fallback screenshot.
- **Video preview cache + 5s trim + LRU** — Previews on hover now cache a 5-second loop per game in IndexedDB (same `MediaCache` store as screenshots/marquees). First hover still streams from ArcadeDB directly (no UX delay) while `primeVideoCache` fetches the full clip through the `/arcadedb` proxy, trims it to 5s via `<video>` + canvas + MediaRecorder (WebM VP9/VP8 fallback), and stores the clip. Next hovers play the cached trimmed blob instantly. LRU eviction caps the video cache at 500 MB (configurable via `videoCacheBytes`). Concurrent prime calls for the same key dedupe via an inflight map. Falls back gracefully to the untrimmed blob when `MediaRecorder` is unavailable (jsdom tests, older Safari).
- **Tooling: tsconfig hardening + ESLint monorepo** — base `tsconfig` now enables `noImplicitReturns`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`, `isolatedModules`, `forceConsistentCasingInFileNames`. Flat ESLint config (`eslint.config.js`) with `@typescript-eslint` type-checked rules applied across all workspaces. Root scripts `npm run typecheck` and `npm run lint` wired up. Vite `sourcemap: false` made explicit on production builds, and `tsc --noEmit` used for pre-build typecheck (prevents double emit overwritten by Vite).
- **Phase 4b polish (frontend)** — `__APP_VERSION__` injected from `package.json` via Vite `define`; `SaveStateController` wires F5/F8 + Pause overlay items to `SaveStateDB` slot 0 with toast feedback; SettingsScreen gains Controls / Network / Storage tabs (current mapping + reset, room id + signal + regenerate, `navigator.storage.estimate()` + per-ROM delete); E2E `p4-video-preview` covers the CDN screenshot swap and the 404 video fallback.
- **Phase 5 — RPi kiosk image (`@sprixe/image`)** — replaces the earlier pi-gen scaffold with a Raspberry Pi Imager + first-boot.sh workflow. The script provisions Chromium under cage (Wayland kiosk compositor), autologin sprixe on tty1, `.bash_profile` exec start-kiosk.sh for auto-restart on Chromium crash. `test-first-boot.sh` smoke-tests the script in a Debian arm64 container with mocked apt/systemctl/reboot.
- **Phase 5 — E2E kiosk simulation** — new Playwright project `kiosk` reproduces the on-device Chromium flags (`--kiosk --noerrdialogs --disable-translate --enable-features=SharedArrayBuffer --autoplay-policy=no-user-gesture-required`, viewport 1920×1080); `p5-kiosk-simulation.spec.ts` asserts `crossOriginIsolated`, `SharedArrayBuffer`, the boot → play → quit flow, a clean console (whitelisted PeerHost / RomDB / `/media/*/video.mp4` 404), and that the URL stays on baseURL.

### Fixed
- **Settings > Audio > Latency now actually applies** — the `low` / `medium` / `high` toggle was defined in the UI but never consumed. It now maps to the `AudioContext`'s `latencyHint` (`interactive` / `balanced` / `playback`), threaded through the emulator constructors and runner bridges, so users can trade responsiveness for stability when their machine can't keep up.
- **P2P ROM transfer reliability** — Phone-to-kiosk ROM upload was "rarement" (rarely) working with various symptoms. Seven root causes addressed:
  - **Connect timeouts** — `PeerSend.connect()` now bounds both `Peer 'open'` and `DataConnection 'open'` phases to 15 s (configurable via `connectTimeoutMs`). A dead PeerJS signaling channel surfaces as a `TransferError` instead of a permanent "Connecting…" spinner. On timeout, the half-open peer/conn is torn down so the retry wrapper gets a clean slate.
  - **`PeerHost.start()` retry with UI feedback** — kiosk boot now retries `host.start()` 3 times with 2s/4s/8s backoff before giving up, and replaces the EmptyState QR with a "Phone pairing unavailable" panel + Retry button when all attempts fail.
  - **`bufferedamountlow` listener leak + timeout** — the default backpressure wait now detaches its handler on resolve/reject and rejects with `TransferError("backpressure drain stalled", "stalled")` after 10 s (configurable via `backpressureTimeoutMs`) so a silently-dead channel can't freeze the upload indefinitely.
  - **Drain watchdog after `file-end`** — `sendFile()` polls `bufferedAmount` until it reaches 0 (or the 30 s `drainTimeoutMs` fires), ensuring the caller only resolves once bytes have actually left the device.
  - **Incomplete transfer guard on host** — `PeerHost` now detects `receivedBytes !== size` or missing chunk indices on `file-end` and sends an `error` message back to the phone instead of letting `concatChunks` zero-pad the gap and hand a corrupted ZIP to the pipeline.
  - **Exponential backoff in `sendFileWithReconnect`** — default `maxRetries` bumped from 1 to 2, retries now wait `baseBackoffMs * 2^(n-1)` (1s / 2s by default) between attempts, preventing retry storms on flaky WiFi.
  - **STUN servers configured** — both PeerSend and PeerHost pass a shared `DEFAULT_ICE_SERVERS` list (Google STUN + Cloudflare) to `new Peer()`, instead of relying on PeerJS Cloud's defaults which are rate-limited and unreachable on some corporate / cellular networks.
  - **Phone retry button** — when `ensureConnected()` fails eagerly, the phone UI surfaces a "Retry connection" button instead of a silent status line. Uploads now route through `sendFileWithReconnect` with a persistent first attempt (reusing the state-sync channel) and ephemeral fresh senders for subsequent retries, so retry cycles don't knock down the live state / volume / save-slots feed.
- **Neo-Geo sprite X position** — Sprites disappeared when scrolling backward. Three issues: signed conversion threshold was wrong (0x1E0 vs MAME's 0x1F0), sticky chain X lacked 9-bit mask (`& 0x1FF`), and off-screen skip range didn't match MAME (`0x140..0x1F0`).
- **Neo-Geo worker Z80 ROM switch** — Reset Z80 when switching from BIOS to game ROM so the game sound driver starts cleanly from address 0x0000.
- **Neo-Geo ADPCM-B silence** — Games with a single V-ROM pool (fatfury1, blazstar, mslug2, etc.) had no in-game audio because ADPCM-B reads were offset by the full ROM size, reading zeros. The YM2610 WASM wrapper now reads from the same address space when there is no A/B split.
- **Neo-Geo auto-animation speed** — Background animations on kof97/kof98/kof99 were cycling at 60fps instead of the game's programmed speed. The LSPC2 speed divider register (0x3C0006 upper byte) was stored but never consulted. Counter now increments every (speed+1) VBlanks.
- **Neo-Geo CMC fix layer (HUD)** — Games with CMC encryption (garou, kof99, mslug3) now display their HUD correctly (health bars, timer, score, combos). Three bugs fixed:
  - S-ROM buffer allocation when no `fixed` ROM files in game def (was 0 bytes → no fix tiles)
  - Per-game S-ROM size (garou/mslug3 need 512KB, not 128KB) — wrong size shifted the extraction offset in the C-ROM
  - Fix layer banking (VRAM $7500/$7580) for games with S-ROM > 128KB — extends 12-bit tile codes to 14-bit via per-row (Garou type) or per-tile (KOF2000 type) bank registers

## [1.0.0-beta.2] - 2026-04-06

### Added
- **Center-bottom sprite alignment** — Multi-frame .aseprite exports align all poses by their center-bottom anchor (feet), with a canvas sized to the bounding box of all poses. Manifest stores original tile coords + per-frame `alignOffset` for correct round-trip import
- **Aseprite grid alignment** — Exported .aseprite files set the grid origin so Aseprite's View > Grid overlays exactly on 16×16 tile boundaries
- **Landing page demo videos** — Three workflow steps (Capture, Edit, Import) now show looping MP4/WebM videos instead of placeholders (total 1.4 MB vs 18 MB in GIFs)
- **Beta gate** — Client-side password screen on `/play/` (sessionStorage, once per session)
- **Scroll tile selection** — Scroll set viewer now has a clickable tile grid (same as sprites): crosshair cursor, tile grid overlay, dashed red highlight on selected tile, zoom in right panel with palette
- **Multi-tile sprite expansion** — `readAllSprites()` now expands CPS1 multi-tile (nx×ny) OBJ entries into individual sub-tiles with correct positions and tile codes, matching the hardware renderer formula. Fixes misplaced tiles for games like WoF
- **Per-palette export** — PNG and .aseprite export per palette in sprite sheet viewer (replaces global export). Each .aseprite file is mono-palette (16 colors) with manifest for round-trip import
- **Live sprite palette panel** — "Sprite Palettes" section in editor right panel shows active OBJ palettes with eye toggle to hide/show sprites by palette in the game renderer
- **Palette-aware capture** — Hidden palettes are excluded from sprite grouping during capture, so the REC bounds and captured poses match what's visible
- **Inline export/import on cards** — Export .aseprite and Import buttons directly on sprite capture cards in the layer panel
- **Palette ROM patching** — Palette color changes traced via M68K A0 register to find the source ROM address. Edits persist across rounds by patching the ROM, not just VRAM
- **Palette override on import** — Importing a .aseprite with modified palette colors applies persistent overrides (VRAM + ROM patch) that survive round transitions
- **Capture delete** — Delete button (×) on capture cards in left panel
- **Pose deduplication** — Duplicate poses removed at capture finalization and in .aseprite export (by unique tile code set)
- **Capture reset on game change** — Layer groups and palette state cleared when loading a new ROM
- **Unit tests for 10 untested modules** — rom-loader, game-defs, z80-bus-qsound, sprite-analyzer, tile-allocator, scroll-capture, resampler, capture-session, save-state, sprite-editor (+103 tests, 1016 total)
- **Game matrix Level 3** — automated sprite & scroll REC on all 29 ROMs, PNG export to `test-results/sprite-rec/` for manual review

### Fixed
- **Scroll palette snapshot at STOP** — Palette RGB captured when recording stops (stable state) instead of first frame (may be mid-fade/flash). Fixes washed-out scroll captures
- **Scroll capture reset on game change** — Active scroll sessions and finalized scroll sets now cleared when loading a new ROM
- **Pose deduplication broken** — Unified all dedup hash formulas to use `poseHash()` consistently (stop-time, export, save restore). Additionally, `poseHash()` now filters by the group's main palette so adjacent sprites from other palettes don't pollute the hash and create false-distinct poses
- **Sprite tile z-order** — `assembleCharacter()` now draws tiles back-to-front (matching CPS1 hardware priority)
- **Tile click palette** — Clicking a tile in sprite sheet selects its own palette (not the group's main palette)
- **Frame cropping in per-palette export** — Uses max dimensions across all poses
- **Palette persistence in sheet viewer** — Palette visibility state persists across pose changes
- **Manifest truncation** — Compressed manifest with deflate+base64 to prevent Aseprite truncating long User Data strings
- **Transparent tile filtering** — Fully transparent tiles (all pen 15) excluded from sprite capture
- **E shortcut removed** — Redundant E key shortcut removed (use F2 for sprite editor)
- **E2E tests updated for F2 shortcut** — Replaced obsolete E key with F2 in 4 test files, added beta gate bypass in helpers, fixed eye toggle assertion (opacity instead of text), reduced timeouts (30s→10s test, 5s→2s expect)

### Performance
- **M68000 flags as direct booleans** — CCR flags (C, V, Z, N, X) stored as boolean fields instead of getter/setter proxies to the SR register. SR reconstructed on demand only (exceptions, save state, MOVE from SR). Eliminates ~10 function calls per instruction on the hottest path (~50K instructions/frame)
- **M68000 prefetch as scalars** — Prefetch queue changed from `number[]` to two scalar fields, removing array indirection on every instruction fetch
- **Cached framebuffer Uint32Array view** — Reuse a single Uint32Array view across renderScrollLayer, renderObjects, and renderFrame instead of allocating 3 per frame
- **Row-scroll tile-based rendering** — Scroll2 row-scroll path refactored from pixel-by-pixel (86K iterations) to tile-based (~26 cols × 224 rows), reducing gfxromBankMapper calls ~24×

### Added
- **CPS-B multiplication tests** — 5 tests covering the hardware multiply used by SF2CE/SF2HF (factor writes, result reads, edge cases 0×max, max×max)
- **M68000 interrupt tests** — 5 tests covering IRQ level masking, NMI (level 7 never masked), one-shot vs level-triggered, irqAckCallback
- **`inspectScrollAt` tests** — 5 tests covering scroll2 tile lookup, out-of-bounds, invalid layer, transparent pixel handling, `boundsOnly` mode
- **E2E button + shortcut tests** — 11 new tests: click pause/mute/save/load/config/step/close buttons, F/F9/Ctrl+S keyboard shortcuts, pseudo-fullscreen toggle

### Fixed
- **E2E selector 16.15** — `.ctrl-btn` → `.layer-import-btn` (broken after layer panel refactor)
- **E2E test 10.4** — Rewrote dead layer toggle test to use `.layer-eye-btn` in layer panel (was silently skipping)

### Changed
- **Rebrand ROMstudio → Sprixe** — All references renamed: file extension `.sprixe`, binary prefix `SPRIXE:`, IndexedDB `sprixe`, UI titles, landing page, docs. Files renamed (`sprixe-save.ts`, `sprixe-autosave.ts`). No backward compatibility with `.romstudio` files
- **Hero video updated** — New 39s demo video with Sprixe branding, encoded at 720p H.264+AAC / VP9+Opus
- **E2E test split** — `npm run test:e2e` now excludes Game Matrix (fast); `test:e2e:all` runs everything; `test:matrix` unchanged
- **Hero video** — Replace hero GIF with 37s MP4/WebM video (with audio). Native browser controls, no autoplay. Encoded at 720p H.264+AAC / VP9+Opus (~4 MB each)
- **Color picker extracted** — `openColorPicker` (162 lines) moved from `SpriteEditorUI` class to standalone `color-picker.ts` module. Reduces `sprite-editor-ui.ts` from 1,521 to 1,363 lines
- **`loadRom` split** — 122-line method split into `loadQSoundAudio()` and `loadStandardAudio()` private methods in `emulator.ts`

### Fixed
- **Save state worker timeout** — `getWorkerState()` now rejects after 2s instead of hanging forever if the audio worker doesn't respond. Save state proceeds without audio state on timeout
- **Save state validation** — `loadFromSlot()` validates required fields before casting, preventing silent crashes on corrupted localStorage data
- **Tom Harte test fail-safe** — M68000 and Z80 Tom Harte tests now fail explicitly if fixtures are missing instead of silently passing with zero tests

### Removed
- **Dead code cleanup** — Removed `nuked-opm.ts` (2,318 lines) and `ym2151.ts` (1,246 lines), both unused reference implementations replaced by WASM. Removed 8 dead exports, 2 unused imports, internalized 2 exports used only internally
- **Production console.log** — Removed 6 informational logs from runtime paths (renderer init, audio ready, ROM loaded, GFX expand, mute/solo)
- **CSS dead code** — Removed ~360 lines of orphan CSS classes (1,412 → 1,052 lines, -25%): unused debug panel viewers, sprite analyzer UI, variant gallery, head section, layer list items, synth FM operators, sprite sheet grid, edit tools/neighbors/frame

### Changed
- **Mono-palette sprite capture** — `groupCharacter()` flood-fill restricted to the target palette only. Eliminates parasites from adjacent sprites/decor of other palettes. Cleaner captures, simpler code
- **Capture resumption** — Re-clicking a sprite whose palette was already captured resumes the existing group instead of creating a new one. New poses append live to the same card
- **Editor layout refactored** — Import button moved to bottom "Aseprite" section in left panel; Export button unified in right panel (shown in sheet viewer for both sprites and scrolls); removed inline card features (chevron, pose strip, See all) — simplified cards in left panel, sheet viewer for full view
- **Palette panel sprite cards + REC** — Captured sprite cards moved from left panel to right palette panel, grouped under their palette. Each palette has a REC button to start/stop capture directly
- **Large manifest import fix** — .aseprite files with manifests >65535 bytes (UINT16 overflow) now import correctly
- **Palette import from .aseprite** — Importing a .aseprite with modified palette colors applies them as VRAM overrides that persist across rounds (re-applied every frame)
- **Autosave disabled** — Manual .sprixe save only (Ctrl+S). Autosave was triggering restore prompts with empty saves
- **Grouping tolerance reduced** — Sprite adjacency tolerance lowered from 20px to 4px to avoid merging distinct characters

## [1.0.0-beta.1] - 2026-04-02

### Added
- **Aseprite round-trip workflow** — Capture sprites/scrolls → export .aseprite → edit in Aseprite → import back to ROM. Typed manifest (SpriteManifest / ScrollManifest) embedded in User Data
- **Sprite Capture** — REC button in layer panel, auto-capture unique poses by tile hash, live cards during recording, palette RGB snapshot at capture time
- **Scroll Capture** — REC per layer (BG1/BG2/BG3), accumulate tiles during gameplay, palette RGB snapshot at capture time, grouped by palette
- **Sprite Sheet Viewer** — Fullscreen pose viewer with sidebar, tile grid, Export .aseprite button
- **Scroll Set Viewer** — Fullscreen scroll reconstitution with tile strip, Export .aseprite button
- **Layer Panel** — Left sidebar with HW layer toggles, REC buttons, sprite/scroll set cards, 3D exploded view slider, GFX ROM memory indicator, Import .aseprite button
- **`.sprixe` save/load** — JSON save format with sparse ROM diffs (GFX, Program, OKI) + captured poses. Ctrl+S / Ctrl+O, auto-save to IndexedDB with content summary in restore prompt
- **FM Patch Editor** — CPS1 sound driver parser, voice read/write, macro controls (code present, UI tab hidden — see LEARNINGS.md)
- **Audio panel** — Mute/solo per FM/OKI channel, FM timeline, OKI waveforms, sample browser with drag-drop WAV replace, mic recording
- **Palette editing** — Color picker with hue shift (nuances), saturation slider, transparency toggle, ROM patching for persistence
- **3D Exploded View** — CSS 3D layer separation with drag rotation (works when paused)
- **Save states** — 4 slots, localStorage, keyboard shortcuts (F5/F8)
- **DIP switches** — Per-game configs parsed from MAME, persisted to localStorage
- **Sprite Pixel Editor** — `inspectSpriteAt()`, tile encoder, palette editor, tile refs, undo/redo (internal, editing moved to Aseprite)
- **OKI codec** — ADPCM encode/decode, sample replace in ROM, encoder/decoder roundtrip tests
- **Aseprite import integration tests** — 7 tests with real .aseprite fixtures (scroll tilemap pixel-for-pixel + sprite import)
- **E2E tests** — 16 Playwright spec files (~115 tests), Chromium + Firefox
- **Game matrix tests** — Automated boot (title screen snapshot) + audio check for all 29 ROMs in public/roms/
- **Screenshot (F9)** — Capture canvas as `<romName>_capture.png`
- **Release script** — `npm run release` : unit tests → build → E2E → game matrix → version bump → changelog → git tag → GitHub pre-release

### Changed
- **Refactor `sprite-editor-ui.ts`** — Split from 4629 to ~1450 LOC into: `aseprite-io.ts`, `capture-session.ts`, `sheet-viewer.ts`
- **Deduplicate `frame-state.ts`** — Import shared functions from cps1-video.ts
- **Centralize constants** — `CHAR_SIZE_16`, `PIXEL_CLOCK`, `Z80_CLOCK`, `CPS_HTOTAL`, `CPS_VTOTAL`, `FRAME_RATE` in constants.ts
- **Type Aseprite manifest** — Replace `manifest: any` with typed interfaces
- **Rebrand** StudioROM → ROMstudio

### Fixed
- **Palette snapshot** — Sprite and scroll captures now snapshot palette RGB at recording time, preventing fade/flash artifacts
- **3D drag when paused** — `onDragMove` now calls `updateExplodedTransforms()` directly
- **Autosave prompt** — Shows content summary, skips empty saves, improved wording
- **Aseprite import auto-save** — `onModified` now triggered after import
- **Firefox audio lag** — 4ms tick + frame debt accumulator replaces naive setInterval
- **Transparent pen** — CPS1 uses pen 15 (not 0) for transparency
- **Scroll 2 tile inspector** — Accounts for per-row X scroll offset
- **E2E tests** — Fixed page.goto URL (/play/), rewritten for current DOM
- **Sprite editor overlay** — Removed stale tile selection restore on editor toggle (red dashed square appearing without user click)

### Removed
- **Photo layer system** — import/quantize/merge/magic wand removed entirely. Editing happens exclusively in Aseprite
- `photo-import.ts`, `photo-layer-ops.ts`, `magic-wand.test.ts`
