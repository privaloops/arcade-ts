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
   - 3.5 [IndexedDB ROM Storage](#35-indexeddb-rom-storage)
   - 3.6 [Service Worker / PWA](#36-service-worker--pwa)
   - 3.7 [ROM Transfer (WebRTC P2P)](#36-rom-transfer-webrtc-p2p)
   - 3.8 [Input System Architecture](#38-input-system-architecture)
4. [Kiosk / RPi Image](#4-kiosk--rpi-image)
5. [Implementation Phases](#5-implementation-phases)
6. [Risks and Mitigations](#6-risks-and-mitigations)

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
  data: string;           // JSON serialized
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

### 3.5 Service Worker / PWA (optional offline)

**Online-first by default**. PWA optionnel pour les utilisateurs qui veulent du offline.

- Precache: HTML, CSS, JS, WASM, fonts (static shell only — no media)
- Media assets (screenshots, videos, marquees): cached in IndexedDB on first fetch from CDN
- ROMs: already in IndexedDB
- Strategy: Network-first for app shell, Cache-first for media assets
- Use `vite-plugin-pwa` or manual Workbox

### 3.6 ROM Transfer (WebRTC P2P)

No local server needed. The kiosk and phone connect via WebRTC data channel for ROM transfer.

**Signaling**: Vercel serverless WebSocket (or PeerJS cloud) — exchanges SDP offers/answers only (~1KB). ROM data is 100% P2P.

**Library**: PeerJS (`peerjs`) — wraps WebRTC complexity in ~10 lines of code per side.

**Phone remote control**: also via the same WebRTC data channel. Phone page served from `sprixe.app/send/{roomId}` (static, hosted on Vercel).

**Fallback**: if WebRTC fails (corporate firewall, no STUN/TURN), relay ROM data through the signaling server. Slower but always works.

### 3.7 Input System Architecture

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

### Phase 0: Monorepo Setup (1 week)
**Goal**: Convert to monorepo without breaking anything.

1. Init npm workspaces
2. Create `packages/sprixe-engine/` — move shared emulator files
3. Create `packages/sprixe-edit/` — move editor + UI
4. Create `packages/sprixe-site/` — extract landing page
5. Create `packages/sprixe-image/` — scaffold RPi image package (Makefile, scripts, configs)
6. Update all imports to use `@sprixe/engine`
7. Verify tests pass, dev server works, build works
7. No new features — pure refactoring

**Deliverable**: `npm run dev:edit` and `npm run dev:site` launch existing apps, unchanged.

### Phase 1: Frontend Skeleton + Gamepad Nav (2 weeks)
**Goal**: Game browser with gamepad navigation and mock data.

1. Create `packages/sprixe-frontend/` with Vite config
2. Implement `GamepadNav` (polling, actions, key repeat)
3. Implement `FocusManager` (spatial navigation)
4. Implement `ScreenRouter` (state machine)
5. Build game browser: vertical list + video preview panel
6. Filter bar (All / CPS-1 / Neo-Geo / Favorites)
7. CSS design tokens, dark arcade theme
8. HTML splash screen
9. Navigation hints bar with dynamic button labels
10. Mock data: 5-10 hardcoded games with placeholder screenshots

**Deliverable**: Standalone page with gamepad-navigable game browser. No actual game loading.

### Phase 2: Game Loading + In-Game (2 weeks)
**Goal**: Select → play → pause → quit loop.

1. Add `loadRomFromBuffer()` to Emulator and NeoGeoEmulator
2. Implement `RomDB` (IndexedDB)
3. Wire game browser to real ROM data
4. Input mapping screen (first-time controller setup)
5. `InputRouter` — menu ↔ emulator mode switching
6. Coin hold detection (1s threshold)
7. Pause overlay (triggered by Coin hold or phone)
8. Screen transition: browser → playing → browser
9. Save state integration (IndexedDB instead of localStorage)

**Deliverable**: Load ROM manually, see in browser, play, pause, save, quit.

### Phase 3: ROM Transfer (WebRTC) + Phone Remote (2 weeks)
**Goal**: Transfer ROMs from phone via QR code + remote control.

1. Integrate PeerJS for WebRTC data channel
2. Implement `peer-host.ts` (kiosk: create room, listen for connections)
3. Implement `peer-send.ts` (phone: connect to room, send files)
4. Build phone page: Upload tab (file picker, drag-drop, progress, queue)
5. Build phone page: Remote tab (pause, save, load, quit, volume)
6. QR code display on frontend (`sprixe.app/send/{roomId}`)
7. Signaling via Vercel serverless WebSocket (or PeerJS cloud)
8. ROM transfer → identification → IndexedDB pipeline
9. Real-time progress on both phone and TV
10. Empty state / first boot experience
11. Error handling (invalid ROM, unknown format, storage full, WebRTC fallback)

**Deliverable**: Scan QR, send ROMs P2P, see them appear, control the borne from phone.

### Phase 4: Polish + Settings (1 week)
**Goal**: Feature-complete V1.

1. Settings screen (display, audio, controls, network, storage, about)
2. CRT filter, integer scaling, TATE auto-detect
3. CDN media pipeline: upload screenshots + MP4 clips to CDN (ScreenScraper scrape)
4. Video preview: lazy-fetch screenshot from CDN → MP4 crossfade after 1s
5. Recently played / favorites persistence
6. Alphabetical jump (letter wheel)
7. Animation polish (transitions, parallax, glow effects)
8. Volume control in pause menu

**Deliverable**: Full arcade frontend, all features, visually polished.

### Phase 5: RPi Image — `@sprixe/image` (1 week)
**Goal**: Flashable SD card (thin client) via `make image`.

1. Configure pi-gen avec stage-sprixe custom
2. `install-deps.sh` : chromium, xorg/cage (NO nodejs, no server)
3. `setup.sh` : user sprixe, autologin, WiFi config
4. Systemd services : sprixe-chromium (→ `https://sprixe.app/play/`), sprixe-watchdog
5. Plymouth boot splash theme (logo + glow, identique au splash HTML)
6. Boot config : config.txt (gpu_mem=256, KMS), cmdline.txt (quiet splash)
7. Network : wpa_supplicant pré-configuré (WiFi join, V1)
8. `optimize-boot.sh` : désactiver bluetooth, avahi, apt-daily, ModemManager
9. Makefile : `make image` (build), `make flash` (écriture SD), `make clean`
10. Test sur vrai RPi 5 : boot time, FPS, audio latency, gamepad
11. Fix perf issues GPU (VideoCore VII quirks)

**Deliverable**: `make image` produit `sprixe-arcade-v1.0.0.img.xz`. Flash → boot → Chromium ouvre sprixe.app → arcade.

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| RPi 5 Chromium perf insufficient for Neo-Geo | High | Profile early on real hardware (Phase 1). Accept 50-55fps. Optimize later. |
| SharedArrayBuffer not available in kiosk | Critical | COOP/COEP headers + `--enable-features=SharedArrayBuffer` flag. Test early. |
| IndexedDB quota (~20GB on 32GB SD) | Medium | Monitor with `navigator.storage.estimate()`. Warn at 80%. |
| Monorepo extraction breaks tests | Medium | Phase 0 is pure refactoring, full test validation. |
| Gamepad compatibility (exotic encoders) | Medium | Universal input mapping at first boot handles any USB HID device. |
| MP4 video playback perf on RPi | Medium | Short clips (5-10s), low res (384×224), H.264 baseline. Hardware decode. |
| WebRTC P2P fails (firewall) | Medium | Fallback: relay through signaling server. PeerJS handles STUN/TURN automatically. |
| Internet required for kiosk | Medium | PWA install caches app shell + WASM for offline. ROMs already in IndexedDB. |
| CDN media latency | Low | First fetch from CDN, then cached in IndexedDB. Placeholder shown during load. |
