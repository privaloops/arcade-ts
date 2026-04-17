# Sprixe Arcade Frontend — Master Plan

> **"Your arcade, not your weekend."**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [UI/UX Design](#2-uiux-design)
   - 2.1 [Design Language](#21-design-language)
   - 2.2 [Boot Sequence UX](#22-boot-sequence-ux)
   - 2.3 [First Boot / Input Mapping](#23-first-boot--input-mapping)
   - 2.4 [Game Browser Screen](#24-game-browser-screen)
   - 2.5 [In-Game Controls & Hotkeys](#25-in-game-controls--hotkeys)
   - 2.6 [In-Game Pause Menu](#26-in-game-pause-menu)
   - 2.7 [Phone Remote Control](#27-phone-remote-control)
   - 2.8 [Settings Screen](#28-settings-screen)
   - 2.9 [ROM Upload Flow](#29-rom-upload-flow)
3. [Technical Architecture](#3-technical-architecture)
   - 3.1 [Monorepo Structure](#31-monorepo-structure)
   - 3.2 [Shared Emulator Engine Extraction](#32-shared-emulator-engine-extraction)
   - 3.3 [New Modules](#33-new-modules)
   - 3.4 [Build Pipeline](#34-build-pipeline)
   - 3.5 [Monorepo Package Configs](#35-monorepo-package-configs)
   - 3.6 [Frontend Test Setup](#36-frontend-test-setup)
   - 3.7 [Service Worker / PWA](#37-service-worker--pwa)
   - 3.8 [ROM Transfer (WebRTC P2P)](#38-rom-transfer-webrtc-p2p)
   - 3.9 [Input System Architecture](#39-input-system-architecture)
   - 3.10 [Media CDN Pipeline](#310-media-cdn-pipeline)
4. [Kiosk / RPi Image](#4-kiosk--rpi-image)
5. [Implementation Phases](#5-implementation-phases)
   - 5.0 [Test Strategy](#50-test-strategy)
6. [Risks and Mitigations](#6-risks-and-mitigations)
7. [Agent Execution Guide](#7-agent-execution-guide)

---

## 1. Executive Summary

Build **Sprixe Arcade Frontend** — a plug-and-play browser-based arcade cabinet UI that runs on Raspberry Pi 5 in Chromium kiosk mode. Flash an SD card, boot, see a fullscreen arcade game browser. ROMs uploaded from phone via QR code. Navigation 100% gamepad/joystick. V1 supports CPS-1 and Neo-Geo only (native Sprixe emulators, no EmulatorJS).

The product lives in a monorepo with 4 packages: `@sprixe/engine` (shared emulators), `@sprixe/edit` (ROM studio), `@sprixe/site` (landing page), `@sprixe/frontend` (arcade frontend).

### Key decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Layout | Vertical list + video preview | Readable at 1m, video gameplay preview after 1s |
| Package manager | npm workspaces | Already used, no new tooling |
| ROM transfer | WebRTC P2P (PeerJS) | ROMs never touch server, fast on local WiFi |
| Hotkey system | Coin hold 1s = pause menu | No collision with gameplay, works on all encoders |
| Phone | Telecommande + upload | Pause, save, load, quit, volume — résout le problème des panels sans Start/Select |
| Scope V1 | CPS-1 + Neo-Geo only | Native emulators, no EmulatorJS |
| Media | Lazy-loaded from CDN (screenshots, videos, marquees) | Fetched on-demand, cached in IndexedDB |

---

## 2. UI/UX Design

### 2.1 Design Language

#### Color Palette

```
Background layers:
  --af-bg-deep:       #050508      /* deepest background */
  --af-bg-primary:    #0a0a10      /* main background */
  --af-bg-card:       #12121a      /* card surface */
  --af-bg-card-hover: #1a1a28      /* selected state */
  --af-bg-overlay:    rgba(5,5,8,0.92)  /* modal/overlay backdrop */

Accent colors:
  --af-accent:        #00d4ff      /* primary — electric cyan */
  --af-accent-glow:   #00d4ff33    /* glow behind selected elements */
  --af-accent-warm:   #ff6b2e      /* secondary — warm orange */
  --af-accent-gold:   #ffd700      /* favorites star */

System badges:
  --af-badge-cps1:    #e8003c      /* CPS-1 red */
  --af-badge-neogeo:  #00b4d8      /* Neo-Geo blue */

Text:
  --af-text-primary:  #f0f0f5      /* titles, selected items */
  --af-text-secondary:#a0a0b0      /* metadata, labels */
  --af-text-muted:    #606070      /* disabled, hints */
```

#### Typography

All text readable at 1 meter distance (arcade cabinet / TV).

```
--af-font-display:  'Rajdhani', sans-serif;      /* titles, game names */
--af-font-body:     'Inter', sans-serif;          /* metadata, labels */

Size scale (1080p, 1m viewing):
  Game title (list):     clamp(1.4rem, 2.5vw, 2rem)    /* ~24-32px */
  Metadata (year, pub):  clamp(0.9rem, 1.5vw, 1.2rem)   /* ~14-19px */
  System badge:          clamp(0.7rem, 1.2vw, 0.9rem)   /* ~11-14px */
  Section headers:       clamp(1.2rem, 2vw, 1.6rem)     /* ~19-26px */
```

Font loading: Bundle Rajdhani woff2 via `@font-face`, `font-display: swap`.

#### Animation Principles

1. **60fps minimum** — CSS `transform` + `opacity` only (GPU composited)
2. **Respond instantly** — selection highlight on same frame as input
3. **Ease-out** — `cubic-bezier(0.16, 1, 0.3, 1)` for all transitions
4. **Duration budget**: selection = 120ms, screen transition = 250ms, overlay = 200ms
5. **Reducible** — `--af-motion: 1` CSS var, set to 0 via `prefers-reduced-motion` or settings

---

### 2.2 Boot Sequence UX

```
Time    What user sees                        Technical layer
──────  ────────────────────────────────────  ─────────────────────
0s      Black screen                          Linux kernel
~3s     Plymouth splash: Sprixe logo          Plymouth (framebuffer)
        - Logo fade in, subtle glow pulse
~8s     HTML splash (identical to Plymouth)   Chromium --kiosk
        - Progress: "Loading emulators..."
        - WASM modules loading
~11s    Splash fades out (300ms)              App ready
        Game browser / First boot screen
```

**Seamless transition**: Plymouth and HTML splash use identical visuals (same logo, same colors). When Chromium opens, the HTML splash is already showing. No flash.

---

### 2.3 First Boot / Input Mapping

#### No ROMs state

When no ROMs exist in IndexedDB:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              [Sprixe Arcade Logo]                     │
│                                                      │
│         Welcome to your arcade.                      │
│                                                      │
│    ┌─────────────────────────────┐                   │
│    │    [QR CODE - 200x200px]    │                   │
│    │                             │                   │
│    └─────────────────────────────┘                   │
│                                                      │
│    Scan with your phone to add games                 │
│    (same WiFi network)                               │
│                                                      │
│    Supports: CPS-1 · Neo-Geo                         │
│    Format: MAME .zip ROM sets                        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

When the first ROM is uploaded, crossfade (300ms) to input mapping screen.

#### Input Mapping (first time only)

Triggered on first ROM upload OR from Settings. **10 inputs per player, ~30 seconds**.

Compatible with ALL USB encoders: Xin-Mo, Zero Delay, Brook, GP2040-CE, I-PAC (clavier détecté automatiquement si aucun gamepad connecté mais keydown arrive).

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  CONTROLLER SETUP — Player 1                         │
│                                                      │
│  Press the button for:                               │
│                                                      │
│     COIN ................ [awaiting input]            │
│     1P START ............ ✓ Button 9                  │
│     ↑ UP ................ ✓ Axis 1-                   │
│     ↓ DOWN .............. ✓ Axis 1+                   │
│     ← LEFT .............. ✓ Axis 0-                   │
│     → RIGHT ............. ✓ Axis 0+                   │
│     Bouton 1 (LP) ....... ✓ Button 0                  │
│     Bouton 2 (MP) ....... ✓ Button 1                  │
│     Bouton 3 (HP) ....... ✓ Button 2                  │
│     Bouton 4 (LK) ....... ✓ Button 3                  │
│     Bouton 5 (MK) ....... ✓ Button 4                  │
│     Bouton 6 (HK) ....... ✓ Button 5                  │
│                                                      │
│  Hold any mapped button 3s to restart                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- Sequential: each prompt waits for one button press, then advances
- Green checkmark + button index shown on success
- If same button mapped twice → warning, allow to continue or redo
- Mapping saved to localStorage, persists across reboots
- After P1, propose P2 mapping (skip if no second gamepad detected)
- After mapping → game browser with the uploaded ROM visible

---

### 2.4 Game Browser Screen

**Layout: Vertical list + video preview panel**

```
┌─────────────────────────────────────────────────────────────┐
│  SPRIXE ARCADE                              [gear icon]     │
│                                                             │
│  ALL  ·  CPS-1  ·  NEO-GEO  ·  ★ FAVORITES                │
│                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │                          │  │                          │ │
│  │  Street Fighter II       │  │                          │ │
│  │  ▸ Metal Slug            │  │    ▶ VIDEO / SCREENSHOT  │ │
│  │  Final Fight             │  │       (16:9, large)      │ │
│  │  King of Fighters '97    │  │                          │ │
│  │  Ghouls'n Ghosts         │  │    after 1s on selected  │ │
│  │  Knights of the Round    │  │    → MP4 loop with sound │ │
│  │  Punisher                │  │                          │ │
│  │  Art of Fighting          │  │                          │ │
│  │  Dino Crisis             │  └──────────────────────────┘ │
│  │  Mercs                   │                               │
│  │  ...                     │  Metal Slug                   │
│  │                          │  Nazca · 1996 · Neo-Geo       │
│  └──────────────────────────┘  ★ Favorite                   │
│                                                             │
│  [D-pad] Navigate  [Btn1] Play  [Btn4] Favorite  [R1] A-Z  │
└─────────────────────────────────────────────────────────────┘
```

**List (left panel)**:
- Each entry: game title + system badge pill (CPS-1 red / Neo-Geo blue)
- Selected entry: highlighted with accent glow, slight scale
- Favorite games: gold star before title
- Scroll: D-pad Up/Down, with key repeat (400ms delay, 120ms rate)
- Wraps around (bottom → top)

**Preview panel (right)**:
- **Default**: Screenshot (lazy-loaded from CDN, source: ScreenScraper/libretro-thumbnails)
- **After 1s on same game**: Crossfade to MP4 gameplay clip (5-10s loop, with game audio)
- **Fallback** (no screenshot): Placeholder gradient with title text in large font, system color
- Below video: title, year · publisher · system, favorite toggle

**Media assets** (lazy-loaded from CDN):
- Screenshots: PNG, 384×224 or 320×224 native resolution — fetched on-demand when game is selected
- Videos: MP4, 5-10s loop, 384×224, H.264, ~500KB-2MB — fetched after 1s hover on selected game
- Marquees: PNG decorative art — fetched when game detail is visible
- **Nothing pre-bundled** — assets loaded from CDN (e.g. `cdn.sprixe.app/media/{system}/{romName}/`)
- Cached in IndexedDB after first fetch (offline-ready via PWA)
- Placeholder: gradient + title text in system color until screenshot loads

**Filter bar**:
- Horizontal pills: ALL | CPS-1 | NEO-GEO | ★ FAVORITES
- D-pad Up from list → focus filter bar, Left/Right to switch, Btn1 to apply, Down to return
- Active filter: accent underline + glow
- Switching filter: list crossfade (150ms)

**Alphabetical jump**:
- R1 (bumper right, or mapped button) → letter wheel overlay
- A-Z vertical list, D-pad Up/Down to navigate, Btn1 to jump, Btn2/Back to cancel
- Jumps to first game starting with that letter

**Empty states by filter**:
- "No favorites yet — press [Btn4] on any game"
- "No CPS-1 ROMs — scan QR to add games" (inline mini QR)

**Navigation hints bar** (bottom):
- Shows mapped button labels (not "A/B" but the actual physical button name from mapping)
- Adapts to input device: "Btn1" for arcade encoders, "A" for Xbox pads

**Performance**:
- List virtualizes: only ~20 DOM entries rendered, recycled on scroll
- Screenshots lazy-loaded via IntersectionObserver
- Video element: single `<video>` reused, source swapped on selection change
- Video preload: `preload="none"`, loaded only after 1s timer fires

---

### 2.5 In-Game Controls & Hotkeys

**The core problem**: Arcade panels (Xin-Mo, Zero Delay) have no standard Start/Select/L1/R1. Gamepads (Xbox, PS) do. The system must work for both.

**Solution**: One single hotkey — **Coin hold 1s** — opens the pause menu. Everything else goes through the menu or the phone remote.

```
IN-GAME CONTROLS

Physical button          Action
───────────────────────  ──────────────────────
Joystick                 Move (mapped at first boot)
Boutons 1-6              Game buttons (mapped at first boot)
1P Start (tap)           In-game Start (1P Start)
Coin (tap)               Insert coin
Coin (hold ≥1s)          → Opens PAUSE MENU

PHONE REMOTE (always available via WebSocket)
  Pause / Resume
  Save state (slot 1-4)
  Load state (slot 1-4)
  Quit to menu
  Volume +/-
```

**Why Coin hold works**:
- No arcade game uses "hold Coin" — it's always a tap
- Works on every encodeur (Coin is always mapped at first boot)
- Works on gamepads too (Select = Coin in default mapping)
- Single action to remember, no combos

**Coin hold detection**:
- On Coin button down: start 1s timer
- If Coin released before 1s: emit normal Coin tap to emulator
- If Coin held ≥1s: suppress the Coin tap, open pause menu
- Visual hint: after 500ms of holding, a subtle "releasing = pause" indicator appears at screen edge

---

### 2.6 In-Game Pause Menu

Triggered by: Coin hold 1s, OR phone remote "Pause" button.

```
┌────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────┐      │
│  │          (game still visible, dimmed)         │      │
│  │          background: rgba(0,0,0,0.75)         │      │
│  │                                               │      │
│  │          ┌───────────────────────┐            │      │
│  │          │     PAUSED            │            │      │
│  │          │                       │            │      │
│  │          │  ▸ Resume             │            │      │
│  │          │    Save State         │            │      │
│  │          │    Load State         │            │      │
│  │          │    Volume  ████████░░ │            │      │
│  │          │    ────────────────── │            │      │
│  │          │    Quit to Menu       │            │      │
│  │          └───────────────────────┘            │      │
│  │                                               │      │
│  └──────────────────────────────────────────────┘      │
│                                                        │
│  [Joystick] Navigate  [Btn1] Select  [Coin] Resume     │
└────────────────────────────────────────────────────────┘
```

**Behavior**:
- Emulator pauses immediately (CPUs stop, audio suspends)
- Last rendered frame visible behind dark overlay
- Joystick Up/Down navigates, Btn1 confirms
- "Resume" pre-selected
- Coin tap or Coin hold = resume (same button that opened it)
- **Save State**: 4-slot picker, Joystick Left/Right to select slot, Btn1 to save. Shows timestamp.
- **Load State**: Same picker, confirmation dialog before loading
- **Volume**: Joystick Left/Right to adjust
- **Quit to Menu**: Confirmation — "Unsaved progress will be lost" → Btn1 confirm / Btn2 cancel

**Critical**: Input mode switches from emulator → menu when pause opens. Joystick/buttons no longer feed I/O ports, they navigate the overlay.

---

### 2.7 Phone Remote Control

The phone that uploaded ROMs stays connected via WebSocket and becomes a **remote control**. This is the primary way to manage the borne without touching the arcade panel.

#### Phone UI (served at `https://sprixe.app/send/{roomId}`)

Two tabs: **Upload** and **Remote**.

```
┌──────────────────────────────┐
│  SPRIXE ARCADE               │
│                              │
│  [Upload]  [Remote]          │
│                              │
│  ─── REMOTE CONTROL ───      │
│                              │
│  NOW PLAYING:                │
│  Street Fighter II           │
│  CPS-1 · Capcom · 1991      │
│                              │
│  ┌────────┐  ┌────────┐     │
│  │ ⏸ Pause│  │ ▶ Play │     │
│  └────────┘  └────────┘     │
│  ┌────────┐  ┌────────┐     │
│  │ 💾 Save│  │ 📂 Load│     │
│  └────────┘  └────────┘     │
│  ┌────────────────────┐     │
│  │ 🚪 Quit to Menu    │     │
│  └────────────────────┘     │
│                              │
│  Volume  ████████░░  80%     │
│  Save Slot: [1] [2] [3] [4] │
│                              │
│  ── NO GAME RUNNING ──       │
│  (shown when on browser)     │
│  Navigate to a game on the   │
│  arcade and press Play       │
│                              │
└──────────────────────────────┘
```

**Features**:
- Real-time game state from borne via WebSocket (playing/paused/browser)
- Pause / Resume toggle
- Save state with slot selection (shows timestamps)
- Load state with slot selection
- Volume slider
- Quit to menu (with confirmation)
- Disabled buttons when no game running (greyed out)

**WebRTC data channel protocol** (kiosk ↔ phone, P2P):

```
Kiosk → Phone:
  {"type": "state", "screen": "playing", "game": "sf2", "title": "Street Fighter II", "paused": false}
  {"type": "state", "screen": "browser"}
  {"type": "save-slots", "slots": [{"slot":0,"ts":1713020400},{"slot":1,"ts":0},...]}
  {"type": "volume", "level": 80}

Phone → Kiosk:
  {"type": "cmd", "action": "pause"}
  {"type": "cmd", "action": "resume"}
  {"type": "cmd", "action": "save", "slot": 0}
  {"type": "cmd", "action": "load", "slot": 1}
  {"type": "cmd", "action": "quit"}
  {"type": "cmd", "action": "volume", "level": 60}
```

Same data channel used for both ROM transfer and remote control. No server in the loop after initial WebRTC handshake.

---

### 2.8 Settings Screen

Accessible from: gear icon on game browser (Btn1 on icon, or Start button if mapped).

```
┌────────────────────────────────────────────────────────────┐
│  [Back]                          SETTINGS                   │
│                                                            │
│  ┌─────────────┐  ┌──────────────────────────────────┐    │
│  │              │  │                                  │    │
│  │  Display     │  │  DISPLAY                         │    │
│  │  Audio       │  │                                  │    │
│  │  Controls    │  │  CRT Filter         [  OFF  ]    │    │
│  │  Network     │  │  Aspect Ratio       [ 4:3   ]    │    │
│  │  Storage     │  │  Integer Scaling    [  ON   ]    │    │
│  │  About       │  │  Scanline Opacity   ████░░░░    │    │
│  │              │  │  TATE (vertical)    [  OFF  ]    │    │
│  │              │  │                                  │    │
│  └─────────────┘  └──────────────────────────────────┘    │
│                                                            │
│  [Joystick] Navigate  [Btn1] Toggle  [Back] Return         │
└────────────────────────────────────────────────────────────┘
```

**Sections**:

1. **Display**: CRT filter ON/OFF, Aspect ratio (4:3/16:9/Stretch), Integer scaling, Scanline opacity, TATE mode (auto-detected for vertical games)
2. **Audio**: Master volume slider, Audio latency (Low/Medium/High = ring buffer size)
3. **Controls**: Connected devices list, per-player assignment, "Remap" to redo the input mapping, Reset to defaults
4. **Network**: WiFi status + SSID + IP, QR code for upload, Upload server status
5. **Storage**: "12 ROMs · 847 MB used", per-game size list, "Delete All ROMs" with confirmation
6. **About**: Version, "Powered by Sprixe", credits, system info (RPi model, resolution)

All settings persisted to localStorage immediately on change.

---

### 2.9 ROM Upload Flow

#### TV Side

QR code available at:
1. Empty state screen (first boot — large, prominent)
2. Settings > Network
3. Phone already connected → always accessible

QR code encodes: `https://sprixe.app/send/{roomId}`

The room ID is generated by the kiosk and registered with the signaling server.

When upload begins:
- Toast at bottom: "Receiving Metal Slug... 45%"
- On completion: "Metal Slug added!" + game appears in list with "NEW" badge glow (2s)

#### Phone Side (Upload tab)

```
┌──────────────────────────────┐
│  SPRIXE ARCADE               │
│                              │
│  [Upload]  [Remote]          │
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │  Tap to select ROMs    │  │
│  │  or drag & drop here   │  │
│  │  .zip files (MAME)     │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │ sf2.zip        ✓ Done  │  │
│  │ mslug.zip      ██░ 67% │  │
│  │ ffight.zip     Queued  │  │
│  └────────────────────────┘  │
│                              │
│  12 games · 847 MB used      │
│                              │
└──────────────────────────────┘
```

**WebRTC P2P transfer protocol**:

```
1. Kiosk generates roomId, creates RTCPeerConnection + RTCDataChannel
2. Kiosk registers offer with signaling server (WebSocket on Vercel serverless)
3. QR code → phone opens https://sprixe.app/send/{roomId}
4. Phone connects to signaling server, receives offer, sends answer
5. P2P data channel established (same WiFi = fast local transfer)
6. Phone sends ROM files via data channel (chunked, with progress)
7. Kiosk receives chunks, reassembles, identifies ROM, stores in IndexedDB
```

**Signaling server** (Vercel serverless or PeerJS):
- Only exchanges SDP offers/answers + ICE candidates (~1KB)
- ROM data NEVER touches the server — 100% P2P
- Fallback if WebRTC fails: relay through signaling server (slower but works)

**Phone → Kiosk data channel messages**:
```
{"type": "file-start", "name": "mslug.zip", "size": 4521984}
{"type": "chunk", "idx": 0, "data": <ArrayBuffer>}    // 64KB chunks
{"type": "chunk", "idx": 1, "data": <ArrayBuffer>}
{"type": "file-end", "name": "mslug.zip"}
```

**Kiosk → Phone data channel messages**:
```
{"type": "progress", "name": "mslug.zip", "percent": 67}
{"type": "complete", "name": "mslug.zip", "game": "Metal Slug", "system": "neogeo"}
{"type": "error", "name": "bad.zip", "error": "Unknown ROM format"}
```

ROM identification happens in the browser (reuses existing `rom-loader.ts` and `neogeo-rom-loader.ts`). No server-side logic.

---

## 3. Technical Architecture

### 3.1 Monorepo Structure

```
cps1-web/
├── packages/
│   ├── sprixe-engine/              # Shared emulator engines
│   │   ├── src/
│   │   │   ├── cpu/                # m68000.ts, z80.ts
│   │   │   ├── video/              # renderers, cps1-video, neogeo-video
│   │   │   ├── audio/              # workers, WASM wrappers, OKI, resampler
│   │   │   ├── memory/             # bus, ROM loaders, game-defs, decryption
│   │   │   ├── input/              # InputManager (Gamepad API)
│   │   │   ├── emulator.ts         # CPS1 Emulator class
│   │   │   ├── neogeo-emulator.ts  # NeoGeo Emulator class
│   │   │   ├── game-catalog.ts     # 245 CPS1 games
│   │   │   ├── save-state.ts
│   │   │   ├── constants.ts
│   │   │   ├── neogeo-constants.ts
│   │   │   ├── dip-switches.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sprixe-edit/                # ROM studio (current app)
│   │   ├── src/
│   │   │   ├── editor/             # Sprite editor, Aseprite I/O, capture
│   │   │   ├── debug/              # Debug panel, 3D renderer
│   │   │   ├── ui/                 # Current UI (gamepad-config, controls, modals)
│   │   │   ├── audio/              # audio-panel.ts, fm-patch-editor.ts, audio-viz.ts
│   │   │   ├── video/              # GameScreen.ts, frame-state.ts, sprite-sheet.ts
│   │   │   ├── rom-store.ts        # Mutable ROM manager
│   │   │   ├── beta-gate.ts
│   │   │   └── index.ts            # Entry point
│   │   ├── play/index.html
│   │   ├── public/
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── sprixe-site/                # Landing page (sprixe.dev)
│   │   ├── src/
│   │   │   └── landing.ts
│   │   ├── index.html
│   │   ├── public/
│   │   ├── styles/landing.css
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── sprixe-frontend/            # Arcade frontend (NEW)
│       ├── src/
│       │   ├── screens/
│       │   │   ├── game-browser.ts     # Vertical list + video preview
│       │   │   ├── settings.ts         # Settings screen
│       │   │   ├── empty-state.ts      # First boot / no ROMs
│       │   │   ├── input-mapping.ts    # First-time controller setup
│       │   │   └── splash.ts           # Loading splash
│       │   ├── components/
│       │   │   ├── game-list.ts        # Virtual scrolling game list
│       │   │   ├── video-preview.ts    # Screenshot → video crossfade
│       │   │   ├── filter-bar.ts       # System/favorites filter pills
│       │   │   ├── letter-wheel.ts     # Alphabetical jump overlay
│       │   │   ├── pause-overlay.ts    # In-game pause menu
│       │   │   ├── qr-display.ts       # QR code generator
│       │   │   ├── toast.ts            # Notifications
│       │   │   ├── slider.ts           # Volume/opacity slider
│       │   │   ├── save-state-picker.ts
│       │   │   └── nav-hints.ts        # Bottom bar with mapped button labels
│       │   ├── navigation/
│       │   │   ├── gamepad-nav.ts      # Menu navigation (polling + repeat)
│       │   │   ├── focus-manager.ts    # Spatial focus system
│       │   │   ├── input-router.ts     # Menu ↔ Emulator mode switch
│       │   │   └── screen-router.ts    # Screen state machine
│       │   ├── storage/
│       │   │   ├── rom-db.ts           # IndexedDB ROM storage
│       │   │   ├── metadata-db.ts      # Game metadata + screenshots/videos
│       │   │   ├── settings-store.ts   # Settings persistence (localStorage)
│       │   │   └── play-history.ts     # Recently played, favorites, play counts
│       │   ├── transfer/
│       │   │   ├── peer-host.ts        # WebRTC host (kiosk side, creates room)
│       │   │   ├── peer-send.ts        # WebRTC sender (phone side)
│       │   │   └── signaling.ts        # Signaling server client (WebSocket)
│       │   ├── service-worker.ts       # PWA offline support
│       │   ├── main.ts                 # Entry point
│       │   └── styles/
│       │       ├── tokens.css          # Design tokens
│       │       ├── base.css            # Reset, typography
│       │       ├── screens.css         # Per-screen styles
│       │       ├── components.css      # Component styles
│       │       └── animations.css      # Keyframes
│       ├── index.html
│       ├── public/
│       │   ├── fonts/                  # Rajdhani woff2
│       │   └── manifest.json           # PWA manifest (no media bundled)
│       ├── vite.config.ts
│       └── package.json
│
│
├── packages/
│   └── sprixe-image/                  # RPi SD card image builder (pi-gen)
│       ├── stage-sprixe/              # Custom pi-gen stage
│       │   ├── 00-install-deps/
│       │   │   └── 00-run.sh          # apt install chromium-browser xorg unclutter
│       │   ├── 01-kiosk-config/
│       │   │   ├── files/
│       │   │   │   ├── sprixe-kiosk.service    # Chromium → sprixe.app/play/
│       │   │   │   ├── sprixe-watchdog.service # Auto-restart on crash
│       │   │   │   ├── config.txt              # GPU mem=256, KMS, HDMI
│       │   │   │   └── cmdline.txt             # quiet splash loglevel=3
│       │   │   └── 00-run.sh          # Copy configs, enable services, autologin
│       │   ├── 02-plymouth/
│       │   │   ├── files/
│       │   │   │   ├── sprixe.plymouth
│       │   │   │   ├── sprixe.script
│       │   │   │   └── logo.png       # Boot logo (matches HTML splash)
│       │   │   └── 00-run.sh          # Install plymouth theme
│       │   └── 03-optimize/
│       │       └── 00-run.sh          # Disable bluetooth, avahi, apt-daily, etc.
│       ├── config                     # pi-gen config (IMG_NAME, RELEASE, stages)
│       ├── Makefile                   # make image, make clean
│       └── README.md
│
├── package.json                       # Root workspace config
└── tsconfig.base.json                 # Shared TS config
```

### 3.2 Shared Emulator Engine — Stratégie de Mutualisation

Le principe : **logique dans `@sprixe/engine`, UI dans chaque produit**. Les deux produits (edit + frontend) partagent la même logique mais ont des UI radicalement différentes (clavier+souris vs gamepad-only).

#### Ce qui va dans `@sprixe/engine`

**Émulation (déjà identifié)** :
- cpu/, video/, audio/, memory/
- `emulator.ts`, `neogeo-emulator.ts`
- `game-catalog.ts`, `constants.ts`, `neogeo-constants.ts`, `types.ts`

**Input — logique pure** :
- `InputManager` (Gamepad API polling, axis→digital, device assignment, reconnection)
- `InputMapping` type (button index → rôle)
- `InputPersistence` — save/load mappings (localStorage abstrait)
- `GamepadProbe` — écouter un bouton pressé et retourner son index (utilisé par les 2 UIs de config)

**Save state — logique pure** :
- `SaveStateSerializer` — serialize/deserialize CPU+memory snapshots
- `SaveState` interface, `SlotInfo` interface
- `bufToB64()`, `b64ToBuf()` — encodage binaire
- **Pas** le storage (localStorage vs IndexedDB — chaque produit choisit)

**Interface commune `EmulatorLike`** (pour que les composants partagés ne dépendent pas du type concret) :
```ts
interface EmulatorLike {
  // Lifecycle
  isRunning(): boolean;
  isPaused(): boolean;
  pause(): void;
  resume(): void;
  start(): void;
  stop(): void;

  // Audio
  suspendAudio(): void;
  resumeAudio(): void;

  // State
  getFrameCount(): number;
  getFpsDisplay(): number;
  getGameName(): string;

  // Input
  getInputManager(): InputManager;

  // Save state
  saveState(): SaveState;
  loadState(state: SaveState): void;
}
```

Les deux émulateurs (`Emulator` et `NeoGeoEmulator`) implémentent cette interface. Les composants partagés (shortcuts, save state logic) typent contre `EmulatorLike` au lieu de `Emulator`.

**New API needed** : `loadRomFromBuffer(name: string, data: ArrayBuffer)` on both emulators (frontend loads ROMs from IndexedDB, not file picker).

#### Ce qui reste dans `@sprixe/edit`

- editor/, debug/, rom-store.ts, beta-gate.ts
- ui/ (gamepad-config.ts, keyboard-config.ts, save-state-ui.ts, controls-bar.ts, etc.)
- audio-panel.ts, fm-patch-editor.ts, audio-viz.ts
- GameScreen.ts, frame-state.ts, sprite-sheet.ts

Ces modules utilisent les APIs de `@sprixe/engine` mais ont leur propre UI DOM.

#### Ce qui est nouveau dans `@sprixe/frontend`

Le frontend construit sa propre UI pour les mêmes fonctionnalités, optimisée gamepad :

| Fonctionnalité | `@sprixe/engine` (partagé) | `@sprixe/edit` (UI) | `@sprixe/frontend` (UI) |
|---------------|---------------------------|--------------------|-----------------------|
| **Config manette** | `InputManager`, `GamepadProbe` | Modal clavier+souris, dropdown device | Écran premier lancement, séquentiel, gamepad-only |
| **Save/Load state** | `SaveStateSerializer`, `SaveState` | Modal 4 slots, F5/F8 shortcuts | Pause menu slots, gamepad nav, IndexedDB backend |
| **Pause/Resume** | `EmulatorLike.pause/resume()` | Touche P, bouton emu-bar | Coin hold 1s, phone remote |
| **Mute/Volume** | `EmulatorLike.suspendAudio()` | Touche M, bouton emu-bar | Pause menu slider, phone remote |
| **ROM loading** | `loadRomFromZip()`, `loadRomFromBuffer()` | Drag-drop, file picker, game select | IndexedDB + phone upload |
| **FPS display** | `EmulatorLike.getFpsDisplay()` | Debug panel, audio panel | Emu-bar counter |

### 3.3 Key New Modules

#### `input-router.ts` — Input mode switching

```ts
type InputMode = 'menu' | 'emulator';

class InputRouter {
  private mode: InputMode = 'menu';
  private gamepadNav: GamepadNav;       // Menu navigation
  private inputManager: InputManager;    // In-game (from engine)
  private coinHoldTimer: number | null;  // Coin hold detection

  setMode(mode: InputMode): void;
  // In 'menu': gamepadNav polls and emits NavActions
  // In 'emulator': inputManager feeds I/O ports
  // Coin hold detection runs in both modes
}
```

#### `gamepad-nav.ts` — Menu navigation

```ts
type NavAction =
  | 'up' | 'down' | 'left' | 'right'
  | 'confirm'       // Btn1
  | 'back'          // Btn2
  | 'favorite'      // Btn4
  | 'settings'      // Start (if mapped)
  | 'bumper-right'  // Letter jump
  | 'coin-hold';    // Coin held ≥1s → pause menu

class GamepadNav {
  private repeatDelay = 400;   // ms before repeat
  private repeatRate = 120;    // ms between repeats
  start(): void;    // Begin RAF polling
  stop(): void;
  onAction(cb: (action: NavAction) => void): () => void;
}
```

#### `rom-db.ts` — IndexedDB ROM storage

```ts
// Database: 'sprixe-arcade', version 1
// Stores: 'roms', 'metadata', 'savestates'

interface RomRecord {
  id: string;              // MAME ROM set name
  system: 'cps1' | 'neogeo';
  zipData: ArrayBuffer;
  addedAt: number;
  lastPlayedAt: number;
  playCount: number;
  favorite: boolean;
  size: number;
}

interface MetadataRecord {
  id: string;
  title: string;
  year: string;
  publisher: string;
  screenshotBlob: Blob | null;
  videoBlob: Blob | null;
}

interface SaveStateRecord {
  gameId: string;
  slot: number;           // 0-3
  data: ArrayBuffer;      // Binary snapshot (CPU + RAM + VRAM), NOT JSON string
  timestamp: number;
}
```

#### `screen-router.ts` — Screen state machine

```ts
type Screen = 'splash' | 'empty' | 'input-mapping' | 'browser' | 'playing' | 'settings';

interface ScreenController {
  mount(container: HTMLElement): void;
  unmount(): void;
  onFocus(): void;
  onBlur(): void;
  handleInput(action: NavAction): boolean;
}
```

### 3.4 Build Pipeline

**npm workspaces** (`package.json` root):
```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:edit": "npm -w @sprixe/edit run dev",
    "dev:frontend": "npm -w @sprixe/frontend run dev",
    "dev:site": "npm -w @sprixe/site run dev",
    "build": "npm -ws run build",
    "test": "npm -ws run test"
  }
}
```

No build step for `@sprixe/engine` — Vite resolves TS imports directly. Each consumer bundles engine code.

### 3.5 Monorepo Package Configs

These exact configs are required for Vite + TypeScript to resolve `@sprixe/engine` imports without a build step. **Copy these verbatim** — incorrect `exports` or `paths` will cascade into hundreds of TS errors.

#### `packages/sprixe-engine/package.json`
```json
{
  "name": "@sprixe/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./*": "./src/*"
  },
  "types": "./src/index.ts"
}
```

Usage in consumers: `import { Emulator } from '@sprixe/engine/emulator'` resolves to `packages/sprixe-engine/src/emulator.ts`.

#### `packages/sprixe-edit/package.json`
```json
{
  "name": "@sprixe/edit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@sprixe/engine": "*"
  }
}
```

#### `packages/sprixe-frontend/package.json`
```json
{
  "name": "@sprixe/frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@sprixe/engine": "*",
    "peerjs": "^1.5.4"
  }
}
```

#### `tsconfig.base.json` (root)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@sprixe/engine/*": ["./packages/sprixe-engine/src/*"]
    }
  }
}
```

#### Per-package `tsconfig.json` (edit, frontend, site)
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "references": [{ "path": "../sprixe-engine" }]
}
```

#### Vite config (each consumer)
```ts
// vite.config.ts — add to resolve.alias
import path from 'path';
export default defineConfig({
  resolve: {
    alias: {
      '@sprixe/engine': path.resolve(__dirname, '../sprixe-engine/src')
    }
  }
});
```

**Validation checkpoint**: After setting up these configs, run `npx tsc --noEmit` from root. Zero errors = proceed.

### 3.6 Frontend Test Setup

Le package `@sprixe/frontend` doit pouvoir être validé par `npm test -w @sprixe/frontend` (Vitest, jsdom) **et** par `npx playwright test` (E2E navigateur réel). Les autres packages réutilisent la config Vitest existante du repo.

#### Vitest config (`packages/sprixe-frontend/vitest.config.ts`)

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: false,
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@sprixe/engine': path.resolve(__dirname, '../sprixe-engine/src')
    }
  }
});
```

#### Setup file (`packages/sprixe-frontend/src/__tests__/setup.ts`)

```ts
import 'fake-indexeddb/auto';            // IndexedDB en mémoire pour RomDB
import { vi } from 'vitest';

// Gamepad API mock — tests poussent des snapshots via globalThis.__setGamepad()
let _pad: Gamepad | null = null;
(globalThis as any).__setGamepad = (pad: Partial<Gamepad> | null) => {
  _pad = pad as Gamepad | null;
};
vi.stubGlobal('navigator', {
  ...globalThis.navigator,
  getGamepads: () => [_pad, null, null, null] as (Gamepad | null)[]
});

// requestAnimationFrame déterministe (avance manuellement via vi.advanceTimersByTime)
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
```

#### Playwright config (extension de `playwright.config.ts` racine)

Ajouter un nouveau projet `arcade` qui pointe sur le dev server du frontend et injecte le mock gamepad via `addInitScript` :

```ts
{
  name: 'arcade',
  testDir: './tests/e2e/arcade',
  use: {
    baseURL: 'http://localhost:5174',  // port @sprixe/frontend
    launchOptions: {
      args: ['--enable-features=SharedArrayBuffer']
    }
  },
  webServer: {
    command: 'npm run dev:frontend',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI
  }
}
```

#### Helpers E2E (`tests/e2e/arcade/_helpers/gamepad.ts`)

```ts
import type { Page } from '@playwright/test';

export async function installGamepadMock(page: Page) {
  await page.addInitScript(() => {
    let pad: Gamepad | null = null;
    (window as any).__pressButton = (idx: number, ms = 50) => {
      pad = { buttons: Object.assign([], { [idx]: { pressed: true, value: 1 } }) } as any;
      setTimeout(() => { pad = null; }, ms);
    };
    (window as any).__holdButton = (idx: number, ms: number) => {
      pad = { buttons: Object.assign([], { [idx]: { pressed: true, value: 1 } }) } as any;
      return new Promise<void>(r => setTimeout(() => { pad = null; r(); }, ms));
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [pad, null, null, null]
    });
  });
}
```

#### Conventions

- Vitest : `packages/sprixe-frontend/src/<module>/<file>.test.ts` (colocated)
- Playwright arcade : `tests/e2e/arcade/<phase>-<flow>.spec.ts`
- Chaque spec E2E commence par `await installGamepadMock(page)` puis `await page.goto('/')`
- Pas de timeout par défaut > 5s sauf justification (transferts P2P : 15s)

#### Dépendances à ajouter (`packages/sprixe-frontend/package.json`)

```json
{
  "devDependencies": {
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0",
    "fake-indexeddb": "^6.0.0"
  }
}
```

Playwright est déjà installé à la racine (cf. `playwright.config.ts` existant).

### 3.7 Service Worker / PWA (optional offline)

**Online-first by default**. PWA optionnel pour les utilisateurs qui veulent du offline.

- Precache: HTML, CSS, JS, WASM, fonts (static shell only — no media)
- Media assets (screenshots, videos, marquees): cached in IndexedDB on first fetch from CDN
- ROMs: already in IndexedDB
- Strategy: Network-first for app shell, Cache-first for media assets
- Use `vite-plugin-pwa` or manual Workbox

### 3.8 ROM Transfer (WebRTC P2P)

No local server needed. The kiosk and phone connect via WebRTC data channel for ROM transfer.

**Signaling — V1: PeerJS Cloud** (zero server code):
- Use PeerJS Cloud (free, hosted by PeerJS team) for signaling
- Kiosk generates a random `roomId`, creates a `Peer(roomId)` — that's the signaling
- Phone connects with `peer.connect(roomId)` — P2P data channel established
- ROM data is 100% P2P, signaling only exchanges SDP (~1KB)
- **Do NOT build a custom Vercel signaling server for V1** — PeerJS Cloud handles it
- V2: migrate to self-hosted PeerJS server if scale/reliability requires it

**Library**: PeerJS (`peerjs@^1.5.4`) — wraps WebRTC complexity in ~10 lines of code per side.

**Phone remote control**: also via the same WebRTC data channel. Phone page served from `sprixe.app/send/{roomId}` (static, hosted on Vercel).

**Large ROM transfer — flow control** (Neo-Geo ROMs can be 50-200MB):
- Chunk size: 64KB per message (WebRTC data channel default buffer is 256KB)
- **Backpressure**: check `dataChannel.bufferedAmount` before sending next chunk. If > 1MB, wait for `bufferedamountlow` event before resuming
- Progress: emit `{"type": "progress", ...}` every 10 chunks (not every chunk — reduces overhead)
- Timeout: if no chunk received for 10s, show "Transfer stalled" error on both sides
- Retry: on data channel close mid-transfer, attempt one reconnect. If fails, show error with "Try again" button

**Fallback**: if WebRTC fails (corporate firewall, no STUN/TURN), relay ROM data through PeerJS Cloud TURN relay. PeerJS handles this automatically via ICE candidates. If all fails, show clear error message.

### 3.9 Input System Architecture

```
                    ┌──────────────────────┐
                    │    InputRouter       │
                    │                      │
                    │  mode: menu/emulator │
                    └────────┬─────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐     │    ┌─────────▼────────┐
     │  GamepadNav    │     │    │  InputManager    │
     │  (menu mode)   │     │    │  (emulator mode) │
     │                │     │    │                  │
     │  Polls gamepad │     │    │  Reads I/O ports │
     │  Emits NavAct  │     │    │  for CPS1/NeoGeo │
     │  Key repeat    │     │    │  Per-player      │
     └────────────────┘     │    └──────────────────┘
                            │
                   ┌────────▼───────┐
                   │  Coin Hold     │
                   │  Detection     │
                   │  (both modes)  │
                   │                │
                   │  <1s = tap     │
                   │  ≥1s = pause   │
                   └────────────────┘
```

Button mapping from first-boot config stored in localStorage:
```json
{
  "p1": {
    "coin": {"type": "button", "index": 8},
    "start": {"type": "button", "index": 9},
    "up": {"type": "axis", "index": 1, "dir": -1},
    "btn1": {"type": "button", "index": 0},
    ...
  }
}
```

Both GamepadNav and InputManager read from this mapping. GamepadNav translates to NavActions, InputManager translates to CPS1/NeoGeo I/O port values.

I-PAC detection: if no gamepad connected but keyboard events arrive during mapping → switch to keyboard mode. Same mapping structure but `{"type": "key", "code": "KeyA"}`.

### 3.10 Media CDN Pipeline

**CDN URL pattern**: `https://cdn.sprixe.app/media/{system}/{romName}/{asset}`

```
cdn.sprixe.app/media/
  cps1/
    sf2/
      screenshot.png    # 384×224, native resolution
      video.mp4         # 5-10s loop, H.264 baseline, 384×224, ~500KB-2MB
      marquee.png       # Decorative art (optional)
    ffight/
      screenshot.png
      video.mp4
  neogeo/
    mslug/
      screenshot.png    # 320×224
      video.mp4
```

**Manifest** — the frontend needs to know which assets exist per game:

Option A (recommended): **No manifest file**. The frontend tries to fetch each asset type and handles 404 gracefully. Screenshot first, video after 1s hover. If 404 → show placeholder. This avoids maintaining a separate manifest.

```ts
// Pseudo-code for media loading
async function loadMedia(system: string, romName: string): Promise<MediaAssets> {
  const base = `https://cdn.sprixe.app/media/${system}/${romName}`;
  const screenshot = await fetchOrNull(`${base}/screenshot.png`);
  // Video loaded lazily after 1s on same game selection
  return { screenshot, videoUrl: `${base}/video.mp4` };
}
```

Option B: `manifest.json` at CDN root listing all available assets. Fetched once at app boot, cached. More efficient (one request vs many 404s) but requires updating the manifest when assets are added.

**Asset generation pipeline** (run once, offline):
1. Use ScreenScraper API or libretro-thumbnails to fetch existing screenshots
2. Record MP4 gameplay clips: load ROM in Sprixe, capture 5-10s via `MediaRecorder` API or ffmpeg
3. Upload to CDN (Vercel Blob, Cloudflare R2, or S3)
4. Assets are NOT bundled in the app or the RPi image

**Caching**: First fetch from CDN → store in IndexedDB (`metadata-db.ts`). Subsequent loads read from IndexedDB (offline-ready).

---

## 4. Kiosk / RPi Image (`@sprixe/image`)

Le package `sprixe-image` produit une image SD flashable. L'image est un **thin client** : Chromium en kiosk charge l'app depuis `https://sprixe.app/play/`. Aucun serveur local, aucune logique applicative embarquée. Les mises à jour sont instantanées (reload = dernière version).

### 4.1 Architecture online-first

```
RPi (image SD)                     Cloud (Vercel)
──────────────                     ──────────────
Linux minimal                      sprixe.app/play/  ← Frontend
Chromium --kiosk --app=URL    →    sprixe.app/send/  ← Phone upload page
(pas de serveur local)             CDN media assets
                                   Signaling server (WebSocket, serverless)
```

- **Mises à jour** : déployer sur Vercel → tous les kiosks ont la nouvelle version au reload
- **PWA optionnel** : l'utilisateur peut installer la PWA pour du offline (service worker cache les assets)
- **Pas de serveur local** : le QR code pointe vers `sprixe.app/send/{roomId}`, le transfer est P2P via WebRTC

### 4.2 Base OS

**Raspberry Pi OS Lite (64-bit, Bookworm)**. No desktop. Minimal X11 (ou Cage pour Wayland).

### 4.3 Image Build — pi-gen + GitHub Actions CI

L'image est buildée automatiquement en CI à chaque release. Zéro build local nécessaire.

#### pi-gen stage custom (`stage-sprixe/`)

```
stage-sprixe/
  00-install-deps/
    00-run.sh        # apt install chromium-browser xserver-xorg xinit unclutter
  01-kiosk-config/
    files/
      sprixe-kiosk.service     # Chromium → https://sprixe.app/play/
      sprixe-watchdog.service  # Health check + auto-restart
      sprixe-watchdog.timer    # Toutes les 30s
      config.txt               # gpu_mem=256, KMS, HDMI force
      cmdline.txt              # quiet splash loglevel=3
    00-run.sh                  # Copie configs, enable services, autologin
  02-plymouth/
    files/
      sprixe.plymouth          # Theme descriptor
      sprixe.script            # Animation script
      logo.png                 # Boot logo (identique au splash HTML)
    00-run.sh                  # Install plymouth theme, set default
  03-optimize/
    00-run.sh                  # Disable bluetooth, avahi, apt-daily, ModemManager
```

#### pi-gen config

```
IMG_NAME=sprixe-arcade
RELEASE=bookworm
TARGET_HOSTNAME=sprixe
FIRST_USER_NAME=sprixe
FIRST_USER_PASS=sprixe
LOCALE_DEFAULT=en_US.UTF-8
KEYBOARD_KEYMAP=us
ENABLE_SSH=0
STAGE_LIST="stage0 stage1 stage2 stage-sprixe"
```

#### GitHub Actions CI — build automatique à chaque release

```yaml
# .github/workflows/build-image.yml
name: Build RPi Image
on:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build with pi-gen
        uses: usimd/pi-gen-action@v1
        with:
          image-name: sprixe-arcade
          release: bookworm
          hostname: sprixe
          username: sprixe
          password: sprixe
          enable-ssh: false
          stage-list: stage0 stage1 stage2 ./packages/sprixe-image/stage-sprixe
          verbose-output: true

      - name: Compress image
        run: xz -9 deploy/sprixe-arcade.img

      - name: Upload to release
        uses: softprops/action-gh-release@v1
        with:
          files: deploy/sprixe-arcade.img.xz
```

**Output** : `sprixe-arcade.img.xz` (~500-700MB) attaché à la GitHub Release, téléchargeable depuis `sprixe.app/download`.

#### Makefile local (développement/debug uniquement)

```makefile
image:
	cd pi-gen && sudo ./build-docker.sh
clean:
	cd pi-gen && sudo ./build-docker.sh clean
```

### 4.4 Ce que l'image contient

```
Raspberry Pi OS Lite (Bookworm 64-bit)
├── chromium-browser          # Navigateur kiosk
├── xserver-xorg + xinit      # X11 minimal (pas de desktop)
├── unclutter                  # Cache le curseur souris
├── plymouth sprixe theme      # Boot splash (logo identique au HTML)
└── systemd services:
    ├── sprixe-kiosk.service   # Chromium → sprixe.app/play/
    └── sprixe-watchdog.timer  # Health check toutes les 30s
```

**Ce qu'elle ne contient PAS** : Node.js, serveur, frontend bundlé, ROMs, media assets. C'est un **thin client pur**.

### 4.5 Chromium Kiosk Service

```ini
[Unit]
Description=Sprixe Arcade Kiosk
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sprixe
Environment=DISPLAY=:0
ExecStartPre=/usr/bin/xinit -- :0 -nocursor &
ExecStartPre=/bin/sleep 2
ExecStartPre=/usr/bin/xset -dpms
ExecStartPre=/usr/bin/xset s off
ExecStart=/usr/bin/chromium-browser \
  --kiosk --no-first-run --disable-infobars \
  --noerrdialogs --disable-translate \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --autoplay-policy=no-user-gesture-required \
  --enable-features=SharedArrayBuffer \
  --enable-gpu-rasterization --enable-zero-copy \
  --ignore-gpu-blocklist \
  --user-data-dir=/home/sprixe/.chromium \
  https://sprixe.app/play/
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 4.6 Boot Config

```ini
# /boot/firmware/config.txt
gpu_mem=256
hdmi_force_hotplug=1
disable_overscan=1
dtoverlay=vc4-kms-v3d

# /boot/firmware/cmdline.txt
... quiet splash loglevel=3 vt.global_cursor_default=0
```

### 4.7 Plymouth Boot Splash

Logo Sprixe centré, fond noir, glow pulse. Visuellement **identique au splash HTML** pour transition invisible (Plymouth → Chromium).

### 4.8 Network

**V1** : Join existing WiFi. Configuré pendant le flash via Pi Imager (interface graphique, champ WiFi intégré). Aucun fichier à éditer manuellement.

**V2** : WiFi AP mode — le RPi crée son propre réseau "Sprixe-Arcade" (`hostapd` + `dnsmasq`). Pas besoin de routeur/internet pour le P2P local.

### 4.9 Mises à jour

**Frontend** : automatiques. Déployer sur Vercel = tous les kiosks ont la nouvelle version au prochain reload. Zéro intervention.

**Image SD** : V1 manuelles (reflash avec nouvelle image). V2 OTA pour les mises à jour système (kernel, Chromium).

### 4.10 Boot Time Target

Objectif : **< 12 secondes** (power → game browser visible).

| Étape | Durée cible | Optimisation |
|-------|-------------|-------------|
| Kernel boot | ~3s | `quiet splash`, kernel minimal |
| Plymouth splash | 3-5s | Masque le boot, glow animation |
| X11 + Chromium | ~3s | Profil pré-chargé, no first-run |
| App init (WASM) | ~2s | Service worker precache |

### 4.11 Expérience utilisateur finale

```
1. Télécharger sprixe-arcade.img.xz depuis sprixe.app/download
2. Ouvrir Raspberry Pi Imager
3. Sélectionner l'image Sprixe, configurer WiFi (interface graphique)
4. Flasher sur carte SD
5. Insérer SD, brancher HDMI + manette + alimentation
6. Boot → logo Sprixe → écran d'accueil avec QR code
7. Scanner QR → envoyer ROMs depuis le téléphone
8. Jouer

Temps total : ~3 minutes. Zéro terminal. Zéro clavier. Zéro SSH.
```

---

## 5. Implementation Phases

### 5.0 Test Strategy

Chaque sous-étape numérotée des Phases 1→4 doit se terminer par un **bloc « Tests »** standardisé. Aucun passage à la sous-étape suivante tant que le bloc n'est pas vert.

#### Forme imposée

```markdown
**Tests** :
- Vitest : `<chemin/fichier>.test.ts` — <comportements couverts>
- E2E : `tests/e2e/arcade/<scenario>.spec.ts` — <flow utilisateur>
- ✅ Checkpoint : `npm test -w @sprixe/frontend && npx playwright test --project=arcade <scenario>` → 0 fail
```

#### Doctrine

- **Vitest = logique pure**, en jsdom : routers, managers, parsers, wrappers IDB, codecs WebRTC, handlers d'input. Mock systématique de PeerJS, Web Audio, MediaDevices.
- **Playwright = flow utilisateur**, navigateur réel : navigation gamepad, transitions d'écran, bootstrap de l'émulateur, save/load state, transferts P2P (deux contexts Playwright dans le même test).
- **Pas de tests « fumée »** : chaque test doit reproduire un comportement décrit dans le bloc UX (§2) ou architecture (§3).
- **Mock gamepad** : tous les tests E2E utilisent `installGamepadMock(page)` (cf. §3.6) — on n'utilise jamais l'API gamepad réelle en CI.

#### Critère de fin de phase

Le *deliverable* énoncé par chaque phase doit être couvert par **au moins un test E2E end-to-end**. Exemple Phase 2 deliverable « Load ROM manually, see in browser, play, pause, save, quit » → `select-play-quit.spec.ts` doit exécuter ce flow complet.

#### Anti-flaky

- Pas de `page.waitForTimeout()` arbitraire — utiliser `waitForSelector` ou `expect.poll()`.
- Tests P2P : un seul test par PeerJS Cloud ID (ID aléatoire par test, pas de réutilisation).
- Tests vidéo CDN : intercepter via `page.route()` et servir un MP4 fixture local — jamais de fetch réseau réel en CI.
- Si un test devient flaky (>1% en CI), il est désactivé via `test.skip()` avec issue GitHub liée — pas de retry magique.

### Phase 0: Monorepo Setup (1 week)
**Goal**: Convert to monorepo without breaking anything.

> **CRITICAL for agents**: This phase is the most error-prone. Move files in small atomic steps with test validation between each. NEVER move everything at once — a cascade of 200+ TS errors from broken imports is extremely costly to debug.

**Step 0.1 — Workspace scaffolding** (no file moves yet):
1. Create `packages/` directory structure (empty packages)
2. Add root `package.json` with `"workspaces": ["packages/*"]`
3. Create `tsconfig.base.json` at root (see §3.5 for exact content)
4. Create each package's `package.json` and `tsconfig.json` (see §3.5)
5. **Checkpoint**: `npm install` succeeds, no errors

**Step 0.2 — Extract `@sprixe/engine`**:
1. Move `src/cpu/`, `src/audio/`, `src/video/`, `src/memory/` → `packages/sprixe-engine/src/`
2. Move shared files: `emulator.ts`, `neogeo-emulator.ts`, `game-catalog.ts`, `constants.ts`, `neogeo-constants.ts`, `types.ts`, `save-state.ts`, `dip-switches.ts`, `input/input.ts`
3. Create `packages/sprixe-engine/src/index.ts` barrel export
4. Update all import paths in moved files (intra-engine references)
5. **Checkpoint**: `npx tsc --noEmit -p packages/sprixe-engine/tsconfig.json` — zero errors

**Step 0.3 — Extract `@sprixe/edit`**:
1. Move `src/editor/`, `src/debug/`, `src/ui/`, remaining `src/` files → `packages/sprixe-edit/src/`
2. Update imports to use `@sprixe/engine/*` for shared modules
3. Move `vite.config.ts`, `play/index.html`, `public/` → `packages/sprixe-edit/`
4. Update Vite config with engine alias (see §3.5)
5. **Checkpoint**: `npm run dev:edit` launches, game loads, tests pass (`npm test -w @sprixe/edit`)

**Step 0.4 — Extract `@sprixe/site`**:
1. Move `src/landing.ts`, `index.html`, `styles/landing.css` → `packages/sprixe-site/`
2. **Checkpoint**: `npm run dev:site` serves landing page

**Step 0.5 — Scaffold `@sprixe/image`**:
1. Create `packages/sprixe-image/` with Makefile, stage-sprixe/ scripts, configs
2. No runtime code — just infrastructure files
3. **Checkpoint**: directory structure matches §3.1

**Step 0.6 — Final validation**:
1. `npm test` from root — all existing tests pass
2. `npm run build` from root — all packages build
3. `npm run dev:edit` — editor works identically to before
4. No new features — pure refactoring

**Deliverable**: `npm run dev:edit` and `npm run dev:site` launch existing apps, unchanged.

### Phase 1: Frontend Skeleton + Gamepad Nav (2 weeks)
**Goal**: Game browser with gamepad navigation and mock data.

> Chaque sous-étape suit la doctrine §5.0 : pas de passage à la suivante tant que le bloc **Tests** n'est pas vert.

1. **Create `packages/sprixe-frontend/` with Vite config**
   - **Tests** :
     - Vitest : N/A (infra de package)
     - E2E : N/A
     - ✅ Checkpoint : `npm run dev:frontend` démarre sur :5174, page blanche, console sans erreur

2. **Implement `GamepadNav` (polling, actions, key repeat)**
   - **Tests** :
     - Vitest : `src/input/gamepad-nav.test.ts` — émission d'action sur transition `pressed` → `released`, key-repeat (hold initial 250ms puis répétition tous les 80ms), debounce des taps <16ms, ignore les boutons non mappés
     - E2E : couvert indirectement par les sous-étapes 5 et 6
     - ✅ Checkpoint : `npm test -w @sprixe/frontend gamepad-nav` → 0 fail

3. **Implement `FocusManager` (spatial navigation)**
   - **Tests** :
     - Vitest : `src/ui/focus-manager.test.ts` — grille 3×3 mock, navigation UP/DOWN/LEFT/RIGHT, wrap-around opt-in, blocage aux bords sans wrap, focus initial = premier élément focusable
     - E2E : couvert via game browser
     - ✅ Checkpoint : `npm test -w @sprixe/frontend focus-manager` → 0 fail

4. **Implement `ScreenRouter` (state machine)**
   - **Tests** :
     - Vitest : `src/router/screen-router.test.ts` — transitions valides (browser→playing→browser), back stack (push/pop), refus des transitions invalides, hooks `onEnter`/`onLeave` appelés une seule fois
     - E2E : couvert via flows complets
     - ✅ Checkpoint : `npm test -w @sprixe/frontend screen-router` → 0 fail

5. **Build game browser: vertical list + video preview panel**
   - **Tests** :
     - Vitest : `src/screens/browser/game-list.test.ts` — sélection programmatique, scroll virtuel sur 1000 items mock (rendu ≤20 nodes DOM), index sélectionné persiste après filtrage
     - E2E : `tests/e2e/arcade/p1-browser-navigation.spec.ts` — charger page avec 10 jeux mock, gamepad mock DOWN×5 → 6e jeu sélectionné, screenshot du panneau preview présent
     - ✅ Checkpoint : `npm test -w @sprixe/frontend game-list && npx playwright test --project=arcade p1-browser-navigation` → 0 fail

6. **Filter bar (All / CPS-1 / Neo-Geo / Favorites)**
   - **Tests** :
     - Vitest : `src/screens/browser/filter-bar.test.ts` — prédicats `isCps1`/`isNeoGeo`/`isFavorite`, comptage par catégorie sur dataset mock, transition All→CPS-1 ne perd pas la sélection si l'item courant matche
     - E2E : `tests/e2e/arcade/p1-filter-bar.spec.ts` — switcher entre les 4 filtres avec gamepad LB/RB, vérifier `data-testid="visible-count"` cohérent
     - ✅ Checkpoint : `npm test -w @sprixe/frontend filter-bar && npx playwright test --project=arcade p1-filter-bar` → 0 fail

7. **CSS design tokens, dark arcade theme**
   - **Tests** :
     - Vitest : N/A (CSS pur)
     - E2E : `tests/e2e/arcade/p1-design-tokens.spec.ts` — `getComputedStyle` sur `--af-bg-primary` = `#0a0a10`, `--af-accent` = `#00d4ff`, `font-family` du titre = `Rajdhani`
     - ✅ Checkpoint : `npx playwright test --project=arcade p1-design-tokens` → 0 fail

8. **HTML splash screen**
   - **Tests** :
     - Vitest : N/A
     - E2E : `tests/e2e/arcade/p1-boot-splash.spec.ts` — splash visible <100ms après `page.goto()`, fade-out déclenché par event `app-ready`, splash retiré du DOM après 300ms
     - ✅ Checkpoint : `npx playwright test --project=arcade p1-boot-splash` → 0 fail

9. **Navigation hints bar with dynamic button labels**
   - **Tests** :
     - Vitest : `src/ui/hints-bar.test.ts` — labels corrects pour les contextes `browser`, `paused`, `modal-open` ; pas de label pour les actions désactivées
     - E2E : couvert via flows
     - ✅ Checkpoint : `npm test -w @sprixe/frontend hints-bar` → 0 fail

10. **Mock data: 5-10 hardcoded games with placeholder screenshots**
    - **Tests** :
      - Vitest : `src/data/mock-games.test.ts` — ≥5 jeux, IDs uniques, chaque entrée respecte le shape `GameDef` (champs requis : id, title, system, year, publisher), `screenshotUrl` pointe sur asset local existant
      - E2E : consommé par `p1-browser-navigation.spec.ts`
      - ✅ Checkpoint : `npm test -w @sprixe/frontend mock-games` → 0 fail

**Validation Phase 1** : `npm test -w @sprixe/frontend && npx playwright test --project=arcade --grep="^p1-"` → 0 fail.

**Deliverable**: Standalone page with gamepad-navigable game browser. No actual game loading.

### Phase 2: Game Loading + In-Game (2 weeks)
**Goal**: Select → play → pause → quit loop.

> Chaque sous-étape suit la doctrine §5.0.

1. **Add `loadRomFromBuffer()` to Emulator and NeoGeoEmulator**
   - **Tests** :
     - Vitest : `src/engine-bridge/load-rom.test.ts` — charger fixture `tests/fixtures/test.zip` → état émulateur `ready`, charger ROM Neo-Geo mock idem, ROM corrompue (bad magic) → throw `InvalidRomError`, ROM système inconnu → throw `UnsupportedSystemError`
     - E2E : couvert par sous-étape 8
     - ✅ Checkpoint : `npm test -w @sprixe/frontend load-rom` → 0 fail

2. **Implement `RomDB` (IndexedDB)**
   - **Tests** :
     - Vitest : `src/storage/rom-db.test.ts` (avec `fake-indexeddb`) — `put/get/list/delete` round-trip, ROM 100MB ne crashe pas, simulation `QuotaExceededError` capturée et remontée, listage trié par `lastPlayedAt` desc
     - E2E : couvert par sous-étape 3
     - ✅ Checkpoint : `npm test -w @sprixe/frontend rom-db` → 0 fail

3. **Wire game browser to real ROM data**
   - **Tests** :
     - Vitest : `src/screens/browser/rom-source.test.ts` — transformation `RomEntry` (IDB) → `GameDef` (browser), fallback metadata si CDN absent
     - E2E : `tests/e2e/arcade/p2-browser-real-roms.spec.ts` — seed IDB avec 3 ROMs mock via `page.evaluate()` → reload → vérifier 3 cartes visibles avec titres corrects
     - ✅ Checkpoint : `npm test -w @sprixe/frontend rom-source && npx playwright test --project=arcade p2-browser-real-roms` → 0 fail

4. **Input mapping screen (first-time controller setup)**
   - **Tests** :
     - Vitest : `src/screens/mapping/mapper.test.ts` — capture séquence (UP, DOWN, A, B, START, COIN), persistance dans localStorage sous clé `sprixe.input.mapping.v1`, détection axes analogiques (deadzone 0.3), refus si même bouton mappé deux fois
     - E2E : `tests/e2e/arcade/p2-first-boot-mapping.spec.ts` — IDB et localStorage vides → écran mapping s'affiche → séquencer 6 boutons via gamepad mock → écran browser s'affiche → reload → mapping toujours présent (skip écran)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend mapper && npx playwright test --project=arcade p2-first-boot-mapping` → 0 fail

5. **`InputRouter` — menu ↔ emulator mode switching**
   - **Tests** :
     - Vitest : `src/input/input-router.test.ts` — mode `menu` route vers `FocusManager`, mode `emu` route vers émulateur, switch atomique (pas de double-fire), conflit Start mappé sur 2 actions → priorité au mode actif
     - E2E : couvert par sous-étape 8
     - ✅ Checkpoint : `npm test -w @sprixe/frontend input-router` → 0 fail

6. **Coin hold detection (1s threshold)**
   - **Tests** :
     - Vitest : `src/input/coin-hold.test.ts` (avec fake timers) — `fire` après 1000ms maintenu, **pas** de fire si relâché à 999ms, coin-tap court (<200ms) toujours fonctionnel, double-tap n'arme pas le hold
     - E2E : couvert par sous-étape 7
     - ✅ Checkpoint : `npm test -w @sprixe/frontend coin-hold` → 0 fail

7. **Pause overlay (triggered by Coin hold or phone)**
   - **Tests** :
     - Vitest : `src/screens/pause/pause-overlay.test.ts` — ouverture pause l'émulateur (mock), fermeture le reprend, focus trap (Tab cycle reste dans overlay), Escape ferme
     - E2E : `tests/e2e/arcade/p2-pause-flow.spec.ts` — démarrer ROM mock → `__holdButton(COIN, 1200)` → overlay visible → bouton resume → overlay disparaît, FPS reprend
     - ✅ Checkpoint : `npm test -w @sprixe/frontend pause-overlay && npx playwright test --project=arcade p2-pause-flow` → 0 fail

8. **Screen transition: browser → playing → browser**
   - **Tests** :
     - Vitest : N/A (couvert par `ScreenRouter` Phase 1)
     - E2E : `tests/e2e/arcade/p2-select-play-quit.spec.ts` — **golden path** : démarrer sur browser → presser A sur jeu mock → écran playing visible (canvas WebGL non-vide) → coin hold 1.2s → pause → quit → retour browser, sélection préservée. Vérifier `performance.memory.usedJSHeapSize` n'augmente pas de >10MB après cycle complet (anti-leak).
     - ✅ Checkpoint : `npx playwright test --project=arcade p2-select-play-quit` → 0 fail

9. **Save state integration (IndexedDB instead of localStorage)**
   - **Tests** :
     - Vitest : `src/state/save-state-idb.test.ts` — round-trip save→serialize→IDB→deserialize→load identique (deep equal sur RAM 64KB + VRAM 192KB), 4 slots indépendants, migration auto depuis ancien localStorage si présent
     - E2E : `tests/e2e/arcade/p2-save-state.spec.ts` — démarrer ROM → laisser tourner 60 frames → save slot 1 → quitter → relancer → load slot 1 → frame N+1 == frame N pré-save (hash canvas identique)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend save-state-idb && npx playwright test --project=arcade p2-save-state` → 0 fail

**Validation Phase 2** : `npm test -w @sprixe/frontend && npx playwright test --project=arcade --grep="^p2-"` → 0 fail.

**Deliverable**: Load ROM manually, see in browser, play, pause, save, quit.

### Phase 3: ROM Transfer (WebRTC) + Phone Remote (3 weeks)
**Goal**: Transfer ROMs from phone via QR code + remote control.

> **Estimation note**: Originally 2 weeks, extended to 3. WebRTC P2P with chunked file transfer, backpressure, reconnection, plus the phone UI (two tabs, responsive) is more complex than it looks. Plan accordingly.

> **Doctrine de test** : conformément à §5.0, tous les tests P2P **mockent PeerJS** (Vitest et E2E). Le mock E2E utilise une `BroadcastChannel` injectée via `addInitScript` pour piper les messages entre les deux contexts Playwright. Aucun appel réseau réel à PeerJS Cloud en CI.

**Week 1 — P2P foundation + basic transfer**:

1. **Integrate PeerJS (`peerjs@^1.5.4`) — use PeerJS Cloud for signaling**
   - **Tests** :
     - Vitest : N/A (intégration deps)
     - E2E : N/A
     - ✅ Checkpoint : `import { Peer } from 'peerjs'` compile, `npm test -w @sprixe/frontend` baseline reste vert

2. **Implement `peer-host.ts` (kiosk)**
   - **Tests** :
     - Vitest : `src/p2p/peer-host.test.ts` (mock PeerJS) — création room avec `roomId` déterministe, `onConnection` invoqué à l'arrivée d'un peer, handler `onData` reçoit un payload chunked complet réassemblé, fermeture propre libère les listeners
     - E2E : couvert par sous-étape 5
     - ✅ Checkpoint : `npm test -w @sprixe/frontend peer-host` → 0 fail

3. **Implement `peer-send.ts` (phone)**
   - **Tests** :
     - Vitest : `src/p2p/peer-send.test.ts` (mock PeerJS) — chunking par blocs de 16 KB, pause d'envoi quand `bufferedAmount` mock > 1 MB et reprise quand ≤ 256 KB, retry une fois sur erreur transitoire, callback `onProgress(sent, total)` appelé à chaque chunk
     - E2E : couvert par sous-étape 5
     - ✅ Checkpoint : `npm test -w @sprixe/frontend peer-send` → 0 fail

4. **ROM transfer → identification (reuse `rom-loader.ts`) → IndexedDB storage**
   - **Tests** :
     - Vitest : `src/p2p/rom-pipeline.test.ts` — flow complet bytes → `rom-loader.identify()` → `RomDB.put()`, ROM corrompue → erreur typée renvoyée à l'expéditeur (pas swallow)
     - E2E : couvert par sous-étape 5
     - ✅ Checkpoint : `npm test -w @sprixe/frontend rom-pipeline` → 0 fail

5. **End-to-end ROM transfer (formalisation du test « two browser tabs »)**
   - **Tests** :
     - Vitest : N/A (intégration uniquement)
     - E2E : `tests/e2e/arcade/p3-rom-transfer-p2p.spec.ts` — deux `browser.newContext()` (host sur `/`, phone sur `/send/test-room-{nanoid}`), PeerJS remplacé par mock `BroadcastChannel` via `addInitScript`, `setInputFiles` une ROM 5 MB côté phone, vérifier progression visible côté phone, ROM apparaît dans la liste côté host en <3s
     - ✅ Checkpoint : `npx playwright test --project=arcade p3-rom-transfer-p2p` → 0 fail. **Cette étape gate le passage à la Week 2.**

**Week 2 — Phone UI + remote control**:

6. **Build phone page: Upload tab (file picker, drag-drop, progress queue)**
   - **Tests** :
     - Vitest : `src/phone/upload-tab.test.ts` — ajout via file picker, ajout via drag-drop event simulé, ordre de la queue préservé, abort retire l'item de la queue
     - E2E : `tests/e2e/arcade/p3-phone-upload.spec.ts` — `setInputFiles` 3 ROMs mock → 3 cartes en queue dans l'ordre → supprimer la 2e → 2 cartes restent (1ʳᵉ et 3ᵉ)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend upload-tab && npx playwright test --project=arcade p3-phone-upload` → 0 fail

7. **Build phone page: Remote tab (pause, save, load, quit, volume)**
   - **Tests** :
     - Vitest : `src/phone/remote-tab.test.ts` — mapping `action → message` ({type, payload}), actions désactivées selon `kioskState` (save/load grisés en `browser`), volume slider émet messages debouncés (50ms)
     - E2E : `tests/e2e/arcade/p3-phone-remote.spec.ts` — host démarre ROM mock → phone presse Pause → host passe en pause (<300ms), phone presse Volume 50 → host `audioGain` = 0.5
     - ✅ Checkpoint : `npm test -w @sprixe/frontend remote-tab && npx playwright test --project=arcade p3-phone-remote` → 0 fail

8. **QR code display on kiosk**
   - **Tests** :
     - Vitest : `src/ui/qr-code.test.ts` — génération canvas (taille 200×200), contenu URL exact `https://sprixe.app/send/{roomId}`, régénération uniquement quand `roomId` change (memo)
     - E2E : couvert visuellement dans `p3-rom-transfer-p2p.spec.ts` (vérifier `canvas[data-testid="qr"]` non-vide)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend qr-code` → 0 fail

9. **Real-time state sync kiosk → phone (game playing, paused, browser)**
   - **Tests** :
     - Vitest : `src/p2p/state-sync.test.ts` — diff-broadcast (state inchangé → 0 message), changement partiel → message contient seulement les champs modifiés, latence simulée <100ms
     - E2E : `tests/e2e/arcade/p3-state-sync.spec.ts` — host transition browser → playing → phone affiche `state="playing"` dans <500ms
     - ✅ Checkpoint : `npm test -w @sprixe/frontend state-sync && npx playwright test --project=arcade p3-state-sync` → 0 fail

10. **Empty state / first boot experience (QR prominent)**
    - **Tests** :
      - Vitest : N/A
      - E2E : `tests/e2e/arcade/p3-empty-state.spec.ts` — IDB vide au load → écran avec QR ≥200×200px visible et message « Welcome to your arcade » (cf. §2.3) ; aucun élément `game-card` dans le DOM
      - ✅ Checkpoint : `npx playwright test --project=arcade p3-empty-state` → 0 fail

**Week 3 — Polish + error handling**:

11. **Error handling: invalid ROM, unknown format, storage full, transfer timeout**
    - **Tests** :
      - Vitest : `src/p2p/error-handling.test.ts` — 4 cas (invalid magic, format inconnu, `QuotaExceededError` simulée, timeout 10s sans data) → erreurs typées remontées à l'UI avec message i18n-ready
      - E2E : `tests/e2e/arcade/p3-transfer-errors.spec.ts` — envoyer un `.txt` (mauvais magic) → toast erreur côté host + côté phone
      - ✅ Checkpoint : `npm test -w @sprixe/frontend error-handling && npx playwright test --project=arcade p3-transfer-errors` → 0 fail

12. **Reconnection: if data channel drops mid-transfer, attempt one reconnect**
    - **Tests** :
      - Vitest : `src/p2p/reconnect.test.ts` (mock PeerJS) — drop simulé au chunk 50/100 → 1 reconnect → reprise depuis chunk 50 (pas redémarrage), 2ᵉ drop → abandon avec erreur
      - E2E : non couvert (reproduction non-déterministe d'un drop réseau dans Playwright = flaky → laissé en Vitest)
      - ✅ Checkpoint : `npm test -w @sprixe/frontend reconnect` → 0 fail

13. **Toast notifications on kiosk (receiving, complete, error)**
    - **Tests** :
      - Vitest : `src/ui/toast.test.ts` — queue (max 3 visibles), durée par type (info 3s, success 4s, error 6s), dismissal manuel, pas de duplicate consécutif identique
      - E2E : couvert par `p3-rom-transfer-p2p.spec.ts` et `p3-transfer-errors.spec.ts` (assertions sur visibilité du toast)
      - ✅ Checkpoint : `npm test -w @sprixe/frontend toast` → 0 fail

14. **Phone UI responsive polish (tested on iOS Safari + Android Chrome)**
    - **Tests** :
      - Vitest : N/A
      - E2E : `tests/e2e/arcade/p3-phone-responsive.spec.ts` — viewports iPhone 14 (390×844) et Pixel 7 (412×915), pas de scroll horizontal (`document.body.scrollWidth <= viewport.width`), tous les `button` ont une bounding box ≥44×44px (touch target WCAG)
      - ⚠️ Tests Safari/Android Chrome **manuels** en plus (Playwright sur Chromium-only en CI)
      - ✅ Checkpoint : `npx playwright test --project=arcade p3-phone-responsive` → 0 fail + smoke test manuel iOS/Android avant tag de version

**Validation Phase 3** : `npm test -w @sprixe/frontend && npx playwright test --project=arcade --grep="^p3-"` → 0 fail.

**Deliverable**: Scan QR, send ROMs P2P, see them appear, control the borne from phone.

### Phase 4: Polish + Settings (1 week)
**Goal**: Feature-complete V1.

> Chaque sous-étape suit la doctrine §5.0.

1. **Settings screen (display, audio, controls, network, storage, about)**
   - **Tests** :
     - Vitest : `src/screens/settings/settings-store.test.ts` — schema Zod-style validé, persistance localStorage clé `sprixe.settings.v1`, reset to defaults, migration depuis schema v0 si présent
     - E2E : `tests/e2e/arcade/p4-settings-persistence.spec.ts` — modifier 3 settings (volume 60, CRT off, integer scaling on) → reload → valeurs restaurées
     - ✅ Checkpoint : `npm test -w @sprixe/frontend settings-store && npx playwright test --project=arcade p4-settings-persistence` → 0 fail

2. **CRT filter, integer scaling, TATE auto-detect**
   - **Tests** :
     - Vitest : `src/render/scaling.test.ts` — calcul `scaleFactor` pour 1080p (×4 CPS-1, ×3 Neo-Geo), détection TATE (`game.width > game.height` pour pacland, etc.), CRT shader applique `filter:` CSS attendu
     - E2E : couvert par `p4-video-preview.spec.ts` (vérifier transform appliqué)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend scaling` → 0 fail

3. **CDN media pipeline: upload screenshots + MP4 clips to CDN (ScreenScraper scrape)**
   - **Tests** :
     - Vitest : `scripts/cdn-upload/__tests__/scraper.test.ts` — parsing réponse ScreenScraper mock (XML fixture), résolution URL screenshot/MP4, fallback si jeu absent
     - E2E : N/A (script offline, hors runtime arcade)
     - ✅ Checkpoint : `npm test scraper` → 0 fail

4. **Video preview: lazy-fetch screenshot from CDN → MP4 crossfade after 1s**
   - **Tests** :
     - Vitest : `src/media/preview-loader.test.ts` — fetch screenshot, cache dans IDB sous clé `media:{gameId}:screenshot`, fallback placeholder si 404, crossfade vers MP4 démarre après 1000ms (fake timers)
     - E2E : `tests/e2e/arcade/p4-video-preview.spec.ts` — `page.route('**/cdn/**')` sert un MP4 fixture local, sélectionner jeu → screenshot visible → après 1s, `<video>` joue (vérifier `currentTime > 0`)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend preview-loader && npx playwright test --project=arcade p4-video-preview` → 0 fail

5. **Recently played / favorites persistence**
   - **Tests** :
     - Vitest : `src/state/history.test.ts` — `markPlayed(gameId)` ajoute en tête, dedup, limite à 20, `toggleFavorite` persiste, tri stable
     - E2E : couvert via filtres en `p1-filter-bar.spec.ts` (étendre pour assert favorites apparaissent)
     - ✅ Checkpoint : `npm test -w @sprixe/frontend history` → 0 fail

6. **Alphabetical jump (letter wheel)**
   - **Tests** :
     - Vitest : `src/ui/letter-wheel.test.ts` — calcul des lettres présentes (≥1 jeu commençant par cette lettre), jump à `findIndex(g => g.title[0].toUpperCase() === letter)`
     - E2E : `tests/e2e/arcade/p4-letter-wheel.spec.ts` — ouvrir wheel via gamepad Y, naviguer jusqu'à 'S', presser A → premier jeu commençant par 'S' (`Strider` dans dataset mock) sélectionné
     - ✅ Checkpoint : `npm test -w @sprixe/frontend letter-wheel && npx playwright test --project=arcade p4-letter-wheel` → 0 fail

7. **Animation polish (transitions, parallax, glow effects)**
   - **Tests** :
     - Vitest : N/A (CSS)
     - E2E : `tests/e2e/arcade/p4-animations.spec.ts` — `emulateMedia({reducedMotion: 'reduce'})` → CSS var `--af-motion: 0` appliquée, durations `transition-duration: 0s` sur les éléments key
     - ✅ Checkpoint : `npx playwright test --project=arcade p4-animations` → 0 fail

8. **Volume control in pause menu**
   - **Tests** :
     - Vitest : `src/screens/pause/volume.test.ts` — slider 0-100 → `audioContext.gain.value` mappé linéaire 0.0-1.0, persistance dans settings store, mute toggle préserve la valeur précédente
     - E2E : `tests/e2e/arcade/p4-volume-pause.spec.ts` — démarrer ROM → coin hold pause → slider volume à 25 → resume → quit → `settings.audio.volume === 0.25`
     - ✅ Checkpoint : `npm test -w @sprixe/frontend volume && npx playwright test --project=arcade p4-volume-pause` → 0 fail

**Validation Phase 4** : `npm test -w @sprixe/frontend && npx playwright test --project=arcade --grep="^p4-"` → 0 fail.

**Deliverable**: Full arcade frontend, all features, visually polished.

### Phase 5: RPi Image — `@sprixe/image` (1 week)
**Goal**: Flashable SD card (thin client) via `make image`.

> **Doctrine de test** : sous-étapes 1-9 = infra OS (shell scripts, configs systemd, pi-gen), validation par inspection et exécution `make image`. Sous-étapes 10-11 = tests **manuels** sur hardware réel. Sous-étape 12 (nouvelle) = simulation kiosk en CI via Playwright headless pour attraper les régressions liées aux flags Chromium kiosk avant flashage.

1. Configure pi-gen avec stage-sprixe custom
2. `install-deps.sh` : chromium, xorg/cage (NO nodejs, no server)
3. `setup.sh` : user sprixe, autologin, WiFi config
4. Systemd services : sprixe-chromium (→ `https://sprixe.app/play/`), sprixe-watchdog
5. Plymouth boot splash theme (logo + glow, identique au splash HTML)
6. Boot config : config.txt (gpu_mem=256, KMS), cmdline.txt (quiet splash)
7. Network : wpa_supplicant pré-configuré (WiFi join, V1)
8. `optimize-boot.sh` : désactiver bluetooth, avahi, apt-daily, ModemManager
9. Makefile : `make image` (build), `make flash` (écriture SD), `make clean`
   - **Tests** (sous-étapes 1-9) :
     - `make image` produit un fichier `.img.xz` non-vide
     - `shellcheck packages/sprixe-image/stage-sprixe/**/*.sh` → 0 warning
     - Inspection des unités systemd : `systemd-analyze verify <unit>`
     - ✅ Checkpoint : pipeline `make image` réussit en CI Docker

10. Test sur vrai RPi 5 : boot time, FPS, audio latency, gamepad **(manuel)**
11. Fix perf issues GPU (VideoCore VII quirks) **(manuel)**

12. **Kiosk simulation E2E (CI, anti-régression)**
    - **Tests** :
      - E2E : `tests/e2e/arcade/p5-kiosk-simulation.spec.ts` — projet Playwright dédié `kiosk` avec `launchOptions.args` reproduisant le mode kiosk RPi : `--kiosk`, `--enable-features=SharedArrayBuffer`, `--autoplay-policy=no-user-gesture-required`, `--noerrdialogs`, `--disable-translate`, viewport 1920×1080. Assertions :
        1. `crossOriginIsolated === true` (COOP/COEP appliqués)
        2. `typeof SharedArrayBuffer !== 'undefined'`
        3. Flow complet : boot → splash visible <100ms → fade out → seed IDB avec 1 ROM mock → sélectionner → jouer 60 frames → quit → retour browser
        4. Aucun message `console.error` ou `console.warn` pendant le flow (sauf whitelist documentée)
        5. Aucune navigation vers une autre origine (vérifier `page.url()` reste sur `baseURL`)
      - **Anti-flaky** : `expect.poll()` avec timeout 30s pour boot émulateur (WASM lent en CI), pas de `waitForTimeout` arbitraire, screenshot + trace `on-failure`. Si flakiness >1% sur 50 runs CI, désactiver et créer issue.
      - ✅ Checkpoint : `npx playwright test --project=kiosk p5-kiosk-simulation` → 0 fail sur 3 runs consécutifs

**Validation Phase 5** : `make image` produit l'artefact + `npx playwright test --project=kiosk` vert + smoke test manuel sur RPi 5 réel avant tag de release.

**Deliverable**: `make image` produit `sprixe-arcade-v1.0.0.img.xz`. Flash → boot → Chromium ouvre sprixe.app → arcade.

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| RPi 5 Chromium perf insufficient for Neo-Geo | High | Profile early on real hardware (Phase 1). Accept 50-55fps. Optimize later. |
| SharedArrayBuffer not available in kiosk | Critical | COOP/COEP headers + `--enable-features=SharedArrayBuffer` flag. Test early. |
| COOP/COEP breaks WebRTC or cross-origin | High | `same-origin` COOP blocks popups and cross-origin navigation. Ensure: (1) phone page is on same origin (`sprixe.app/send/`), (2) PeerJS Cloud signaling uses WebSocket (not affected by COOP), (3) CDN media uses CORS headers (`Access-Control-Allow-Origin: *`). Test the full flow with COOP/COEP enabled in dev. |
| IndexedDB quota (~20GB on 32GB SD) | Medium | Monitor with `navigator.storage.estimate()`. Warn at 80%. |
| Monorepo extraction breaks tests | Medium | Phase 0 uses atomic steps with test checkpoints between each move (see Phase 0 details). |
| Gamepad compatibility (exotic encoders) | Medium | Universal input mapping at first boot handles any USB HID device. |
| MP4 video playback perf on RPi | Medium | Short clips (5-10s), low res (384×224), H.264 baseline. Hardware decode. |
| WebRTC P2P fails (firewall) | Medium | PeerJS handles STUN/TURN automatically. If all ICE candidates fail, show clear error with "ensure same WiFi network" message. |
| Large ROM transfer stalls (50-200MB Neo-Geo) | Medium | Backpressure via `bufferedAmount` check (see §3.8). Timeout after 10s idle. Retry button on failure. |
| Internet required for kiosk | Medium | PWA install caches app shell + WASM for offline. ROMs already in IndexedDB. |
| CDN media latency | Low | First fetch from CDN, then cached in IndexedDB. Placeholder shown during load. |
| PeerJS Cloud rate limits or downtime | Low | V1 acceptable risk. V2: self-host PeerJS server. Free tier allows ~50 concurrent connections. |

---

## 7. Agent Execution Guide

> This section helps Claude Code (or any AI agent) execute this plan efficiently across multiple sessions.

### 7.1 Session Continuity

Each session should start by reading `PROGRESS.md` (at repo root) to know where the previous session left off. Update it at the end of each session.

`PROGRESS.md` format:
```markdown
# Implementation Progress

## Current Phase: 0 — Monorepo Setup
## Current Step: 0.3 — Extract @sprixe/edit
## Status: IN PROGRESS

## Completed
- [x] Phase 0, Step 0.1 — Workspace scaffolding (2026-04-17)
- [x] Phase 0, Step 0.2 — Extract @sprixe/engine (2026-04-17)

## Blocked / Notes
- None

## Next Action
- Move src/editor/, src/debug/, src/ui/ to packages/sprixe-edit/src/
```

### 7.2 Rules for Agents

1. **One sub-step at a time**: Never move to the next sub-step until the current checkpoint passes
2. **Test after every sub-step**: 3 gates séquentielles obligatoires :
   1. `npx tsc --noEmit` (typage)
   2. `npm test -w <package>` (Vitest unit)
   3. `npx playwright test --project=arcade <scenario>` (E2E si la sous-étape touche UI/flow)

   Aucun passage à la sous-étape suivante tant que les 3 gates ne sont pas vertes. Le bloc **Tests** de chaque sous-étape (Phases 1-4) précise quels fichiers exécuter — voir §5.0 pour la doctrine et §3.6 pour la config.
3. **No speculative code**: Implement exactly what the plan says. If something seems wrong, ask the user
4. **Phase 0 is sacred**: Zero new features. If you notice something to improve, note it in `PROGRESS.md` under "Notes", don't fix it now
5. **Phase 5 is human-assisted**: Agent generates config files, but the user tests on real RPi hardware
6. **Commit granularity**: One commit per completed sub-step (e.g., "refactor: extract @sprixe/engine to monorepo")
7. **Branch per phase**: `feature/phase-0-monorepo`, `feature/phase-1-skeleton`, etc.

### 7.3 Estimated Total Duration

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 0: Monorepo Setup | 1 week | Highest risk — atomic steps critical |
| Phase 1: Frontend Skeleton | 2 weeks | New code, lower risk |
| Phase 2: Game Loading | 2 weeks | Integration with engine |
| Phase 3: WebRTC + Phone | 3 weeks | Extended from 2 — P2P complexity |
| Phase 4: Polish + Settings | 1 week | Assumes CDN assets already prepared |
| Phase 5: RPi Image | 1 week | Human-assisted (hardware testing) |
| **Total** | **10 weeks** | |
