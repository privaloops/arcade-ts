# Backlog

## Done (session March 21-22)

- [x] Web Worker audio — Z80+YM2151+OKI off main thread, autonomous timer
- [x] QSound audio resampling (24038 → 48kHz)
- [x] Kabuki Z80 decryption — all QSound games boot with audio
- [x] Gamepad remapping with P1/P2 config, autofire, localStorage persistence
- [x] Keyboard remapping with AZERTY/QWERTY layout detection
- [x] Save states — 4 slots, full audio restore (YM2151 WASM heap snapshot)
- [x] DIP switches — 56 games with real MAME definitions, auto-generated from cps1.cpp
- [x] CRT filter (scanlines + vignetting)
- [x] TATE mode fixes (canvas + DOM)
- [x] DOM renderer sprite flickering fix (putImageData instead of data URLs)
- [x] Unified Config modal (Joypad/Keyboard/Display/DIP tabs)
- [x] Device assignment — per-player gamepad selection with persistence
- [x] Buttons 4-6 (kicks) for SF2 via CPS-B register 0x36
- [x] Ring buffer 4096 → 8192 → 16384 for better audio margin
- [x] ROM cache from public/roms/
- [x] UI redesign, project renamed to Sprixe
- [x] Vercel deployment with COOP/COEP headers

## Done (session March 25 — morning)

- [x] Sprite Pixel Editor — WYSIWYG sprite editing (#27, PR #29)
- [x] Audio timeline ruler with frame-synced scroll (PR #30)
- [x] Debt-based audio timing — fixes Firefox audio lag (PR #31)
- [x] Ring buffer 8192 → 16384 samples
- [x] Rebrand StudioROM → ROMstudio → Sprixe
- [x] UI polish: text colors boosted, backgrounds lightened

## Done (session March 25 — evening)

- [x] FM Patch Editor — voice read/write, macro UI, ROM export (code present, UI hidden)
- [x] Mic recording — record OKI samples from mic, lo-fi processing
- [x] Audio panel — mute/solo, FM timeline, OKI waveforms, sortable sample table
- [x] Palette ROM patching — brightness-aware search, program ROM export
- [x] Scroll 2 row scroll fix for tile inspector
- [x] 3D drag fix — overlay pointer-events disabled in exploded mode
- [x] Layer grid default off

## Done (session March 26)

- [x] Sprite Analyzer — character grouping (palette + proximity), red contour overlay, center-tracking
- [x] Pose Capture — gameplay recording of unique sprite poses, deduplication by tile code hash
- [x] Sprite Sheet Viewer — fullscreen pose editor, sidebar with all poses, zoomed editing at 4x
- [x] Export/Import PNG — export pose as transparent PNG, import PNG on individual tiles only (not full poses, see docs/spec-tile-import-export.md)
- [x] Photo Import on Scroll Layers — multi-layer system, Atkinson dithering, world coords positioning
- [x] Tile Allocator — private tile copies, auto GFX ROM expansion, reverse bank mapping
- [x] Layer Panel — left sidebar, visibility eye icons, drag-drop reorder, 3D slider, memory indicator
- [x] Tool Cursors — per-tool canvas cursors generated as PNG data URLs
- [x] OKI codec unit tests — encoder/decoder roundtrip, ADPCM step table, phrase table parsing
- [x] FPS counter display
- [x] UI overhaul — panels, hamburger menu, F2/F3 shortcuts without ROM, header controls
- [x] Transparent pen fix (pen 15, not pen 0)
- [x] Photo layer world coordinates fix
- [x] WAV import saturation fix (boost mic-only)

## M68000 CPU — Tom Harte test failures

- [x] **ADDX.b/MOVE.b/MOVEA with -(A7)/(A7)+** — Fixed: A7 even alignment handled
- [x] **DIVS** — Fixed: overflow flags correct (N/Z undefined per spec)
- [x] **DIVU** — Fixed: overflow flags correct
- [x] **MULS** — Fixed: flags correct
- [x] **MULU** — Fixed: flags correct
- [x] **DBcc** — Fixed: counter wrap correct

## Z80 — Tom Harte test failures

- [ ] **SCF/CCF** — Q register never cleared by non-flag-modifying instructions (latent bug: NOP between two SCF gives wrong bits 3/5)
- [ ] **BIT b,(HL)** — WZ register never written (always 0 after reset), bits 3/5 always wrong
- [x] **Block I/O (INIR, OTIR, etc.)** — Fixed: full undocumented PV/H/bits-3-5 via adjustRepeatIOFlags

## Video

- [ ] **Row scroll on scroll1/scroll3** — Only scroll2 supports row scroll currently
- [ ] **Column scroll** — Not implemented
- [ ] **Star field** — Background effect used by some games (1941)
- [x] **P2 buttons 4-6** — Implemented (P2: G/H/N, CPS-B reg 0x36)

## Audio

- [x] **Web Worker audio** — Z80 + YM2151 + OKI off main thread, autonomous timer
- [x] **QSound audio resampling** — 24038 Hz → 48kHz via LinearResampler
- [x] **QSound stereo** — True stereo output with independent L/R resampling
- [x] **Debt-based audio timing** — 4ms tick + frame debt accumulator, fixes Firefox audio lag
- [x] **Audio timeline ruler** — Frame-synced ruler with minor/major ticks, FPS display
- [x] **Timeline scroll sync** — Scroll tied to frameCount, stops on pause, reversed direction
- [x] **Audio worker state on save/load** — Implemented (Z80 + YM2151 heap snapshot via postMessage)
- [ ] **OKI sample crackling** — Slight crackling on some OKI samples, may need better interpolation
- [ ] **Volume per channel** — Allow user to adjust YM2151 / OKI / QSound balance
- [x] **Audio timeline frame grid** — Implemented (frame ticks + per-channel FM timeline)

## ROM Editor

- [x] **RomStore** — Central mutable ROM manager with ZIP export ([#22](https://github.com/privaloops/sprixe/issues/22))
- [x] **Sprite Pixel Editor** — WYSIWYG sprite editing with palette & tile tools ([#27](https://github.com/privaloops/sprixe/issues/27))
- [x] **FM Patch Editor** — Voice read/write + macro UI done, real-time playback deferred (Z80 conflict). Code in `fm-patch-editor.ts` + `cps1-sound-driver.ts`, Synth tab hidden ([#20](https://github.com/privaloops/sprixe/issues/20))
- [ ] **FM real-time preview** — Bouton "Test" existe (playTestNote), mais pas de preview live pendant l'édition des paramètres
- [ ] **Mute/Solo ROM export** — Requires reverse-engineering CPS1 music sequence format (note commands per-track)
- [x] **Sprite Analyzer** — Character grouping (palette + proximity), red contour overlay, tracking, pose capture, gallery. Multi-tile expansion for complex games (WoF). Per-palette export (PNG + .aseprite). Palette visibility toggles in editor + sheet viewer. Pose deduplication
- [x] **Tile allocator + GFX ROM expansion** — Private tile allocation for scroll merge, dynamic ROM expansion, reverse bank mapper
- [x] **Shared tile indicator** — Badge ×N on shared tiles in sprite sheet viewer + warning toast on edit
- [x] **Palette recoloring (Nuances)** — Hue shift on manually selected color group (Shift+click). Preserves saturation/luminosity. Auto-detect by hue ±30°. Reset palette.
- [x] **Save/load (.sprixe)** — JSON with sparse ROM diffs (GFX, Program, OKI) + poses. Ctrl+S/O, drag & drop. Auto-save IndexedDB 2s debounce. Spec: `docs/spec-sprixe-save.md`
- [x] ~~**Photo Import**~~ — Added then removed. Editing now happens exclusively in Aseprite.
- [x] ~~**Multi-layer panel**~~ — Added then removed. Layer panel now manages HW layers, REC, and capture sets only.
- [ ] **Full undo stack** — Tile pixel undo/redo fonctionne (100 entries). Manque : undo palette, stroke grouping (1 drag = 1 undo), persistance cross-session.

### YM2151 Sequencer (browser-first, world's first)

Full FM music editor integrated into Sprixe, served on `/daw` (separate Vite multi-page entry).
No external DAW needed. No existing browser-based YM2151 sequencer exists
(Furnace and DefleMask are desktop only, and neither targets arcade ROM editing).
This approach bypasses the need to reverse-engineer per-game Z80 drivers entirely.

**Project context for implementors:**

This is part of Sprixe, a CPS1 arcade emulator/editor built in TypeScript.
Key existing files to understand before implementing:

| File | Role |
|------|------|
| `src/audio/audio-worker.ts` | Web Worker running Z80 + YM2151 WASM + OKI. Debt-based timing at 4ms intervals. This is where register writes flow to the YM2151. The synthetic clock for the DAW should reuse this architecture. |
| `src/audio/audio-output.ts` | AudioWorklet + SharedArrayBuffer ring buffer. Connects Worker output to speakers. DAW preview reuses this pipeline. |
| `src/audio/nuked-opm-wasm.ts` | Nuked OPM (YM2151) WASM wrapper. Key functions: `_opm_write_address`, `_opm_write_data`, `_opm_clock_cycles`, `_opm_get_samples_l/r`. The DAW drives this directly. |
| `src/audio/audio-panel.ts` | Current audio DAW panel (F3) with tracks tab (8 FM + 4 OKI channels, VU meters, mute/solo) and samples tab. The piano roll visualization is here — it needs to become interactive. |
| `src/audio/audio-viz.ts` | SharedArrayBuffer bridge between Worker and main thread for visualization data (channel states, note info). Capture hooks go here. |
| `src/audio/fm-patch-editor.ts` | Existing FM patch editor UI (4 operators, envelopes). Partially built, synth tab currently hidden. |
| `src/memory/z80-bus.ts` | Z80 bus with YM2151 I/O at ports 0x00-0x03. The sound latch from 68K arrives here. Capture intercepts writes at this level. |
| `vite.config.ts` | Already configured for multi-page (index.html, play/index.html). Add `daw/index.html` entry. |
| `wasm/opm.mjs` | Compiled WASM module (Emscripten, SINGLE_FILE). |

**YM2151 register map (essential for implementation):**

| Register | Function | DAW relevance |
|----------|----------|---------------|
| 0x01 | LFO reset / test | Automation |
| 0x08 | Key-on/off (bits 6-3 = operators, bits 2-0 = channel) | Core — note start/stop |
| 0x0F | Noise enable + frequency | Percussion |
| 0x10-0x17 | Timer A/B, IRQ | Ignored in DAW |
| 0x18 | LFO frequency | Automation |
| 0x19 | PMD/AMD (LFO depth) | Automation |
| 0x1B | CT/W (waveform) | Automation |
| 0x20-0x27 | RL/FB/CON per channel (stereo, feedback, algorithm) | Patch data |
| 0x28-0x2F | KC (key code = note) per channel | Core — pitch |
| 0x30-0x37 | KF (key fraction = fine tune) per channel | Pitch fine-tuning |
| 0x38-0x3F | PMS/AMS per channel | Patch data |
| 0x40-0x5F | DT1/MUL per operator (4 ops × 8 channels) | Patch data |
| 0x60-0x7F | TL per operator (total level = volume) | Velocity + patch |
| 0x80-0x9F | KS/AR per operator (key scale + attack rate) | Patch data |
| 0xA0-0xBF | AMS-EN/D1R per operator | Patch data |
| 0xC0-0xDF | DT2/D2R per operator | Patch data |
| 0xE0-0xFF | D1L/RR per operator (sustain level + release rate) | Patch data |

**Note-to-register conversion (for keyboard input / note insertion):**

To play a note on channel N:
1. Write patch registers (0x20+N, 0x40-0xFF for channel's operators) — only needed if patch changed
2. Write KC (0x28+N) = note code (octave × 16 + note, where C=0,C#=1,D=2...B=14)
3. Write KF (0x30+N) = fine tune (0-63, usually 0)
4. Write key-on: 0x08 = (operator mask << 3) | channel (operator mask = 0x0F for all 4 ops)
5. To stop: write key-off: 0x08 = 0x00 | channel (operator mask = 0)

**Concept: Capture → Edit → Preview → Reinject**

The game's Z80 driver sends register writes to the YM2151. Instead of understanding the
driver format (proprietary, different per game), we work at the hardware level:

1. **Capture**: user clicks Record, plays the game, all YM2151 register writes are stored with frame timestamps + periodic YM2151 state snapshots (keyframes for seek)
2. **Edit**: modify the captured sequence in an interactive piano roll (frame-based grid)
3. **Preview**: restore YM2151 state from nearest snapshot, inject edited writes via synthetic clock at ~59.637 Hz, hear the result without the game running
4. **Reinject**: during gameplay, sequencer overrides Z80 output on music channels

This is game-agnostic — works on sf2, ffight, dino, any CPS1 game without reverse engineering.

**Why capture is needed (not just the timeline):**

The existing piano roll displays notes in real-time but doesn't store them persistently.
More importantly, preview/seek requires restoring the full YM2151 state (all registers,
envelope positions, LFO phase) at an arbitrary point in time. This is only possible with
periodic state snapshots taken during capture — like keyframes in a video codec.
Without snapshots, you can't seek or preview edits.

**Register write categories:**

| Type | Registers | Sequencer handling |
|------|-----------|-------------------|
| Notes (key-on/off, frequency) | 0x08, 0x28-0x2F | Editable in piano roll — the core musical content |
| Patches (TL, DT, MUL, AR, DR, envelopes) | 0x40-0xFF | Stored per-channel, editable in FM patch editor |
| LFO / vibrato / tremolo | 0x01, 0x18-0x19 | Stored as automation lanes, preserved by default |
| Volume changes | TL registers | Editable as velocity/volume curves |
| Noise | 0x0F | Stored, editable for percussion channels |

**Architecture:**

```
=== CAPTURE MODE (in-game) ===

Game running → 68K sends sound latch command
                    ↓
              Z80 executes driver → YM2151 register writes
                    ↓
              Store writes + frame timestamp → sequence buffer
              Every N frames → snapshot full YM2151 state (keyframe)
              Sound latch change → new segment boundary

=== EDITOR MODE (standalone, game paused/not needed) ===

Piano roll ← sequence buffer (editable)
    ↓ user edits notes
    ↓ user clicks Preview
Restore YM2151 snapshot (nearest keyframe)
Synthetic clock @ 59.637 Hz ticks the WASM
Sequencer injects edited writes per frame → YM2151 → AudioWorklet → sound
    ↓ user plays keyboard
Key press → key-on write on selected channel → immediate sound

=== REINJECT MODE (in-game) ===

Game running, Z80 muted on music channels
Sequencer feeds edited writes per frame → YM2151
SFX channels remain driven by Z80 (gameplay sounds preserved)
```

**Grid and timing:**

The native time unit is the **frame** (~16.77ms at 59.637 Hz). The piano roll grid
is frame-based. This is NOT a MIDI sequencer — there are no ticks, no BPM, no time
signatures at the data level.

An optional musical grid overlay (BPM + time signature, user-defined) can be displayed
on top of the frame grid for visual reference, but it's cosmetic only.
All data is stored and edited in frames.

**Synthetic clock for preview/editor:**

When previewing edits or playing the keyboard, the game loop is not running.
A synthetic timer at ~59.637 Hz drives the YM2151 WASM:
- Advances the WASM the correct number of cycles per frame
- Injects scheduled register writes at their target frame
- Pushes generated samples into the ring buffer → AudioWorklet → speakers

This reuses the existing audio-worker debt-based timing architecture,
replacing the Z80 as the source of register writes.

**Keyboard input (play mode):**

Once a capture exists and patches are loaded, the user can play notes live
using the computer keyboard as a piano:
- Select a channel in the piano roll (inherits its captured FM patch)
- Press key → generate key-on + frequency writes for that channel
- Release → key-off
- Notes are optionally recorded into the sequence at the current frame position

This makes Sprixe a **playable FM synthesizer** using authentic game instrument sounds.

**UI Layout:**

```
┌─────────┬──────────────────────────────────────────────────┐
│ Tracks  │  Frames →                                        │
│         │  |    |    |    |    |    |    |    |    |    |   │
│ ►FM 0 ♪ │  ██▓░░░░██████████░░░░░░██░░░░░░░░░░░░░░░░░░░░  │
│  FM 1   │  ░░░░░░░░░░░░░░████████████████░░░░░░░░░░░░░░░  │
│  FM 2   │  ██████████████░░░░░░░░░░░░░░░░████░░░░░░░░░░░  │
│  FM 3   │  ░░░░██░░░░██░░░░██░░░░██░░░░██░░░░██░░░░░░░░░  │
│  FM 4   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  FM 5   │  ████░░████░░████░░████░░░░░░░░░░░░░░░░░░░░░░░  │
│  FM 6   │  (SFX — locked)                                  │
│  FM 7   │  (SFX — locked)                                  │
├─────────┴──────────────────────────────────────────────────┤
│                                                            │
│  ┌──┬┬──┬──┬──┬┬──┬┬──┬──┬──┬┬──┬──┬──┬┬──┬┬──┬──┐       │
│  │  ││  │  │  ││  ││  │  │  ││  │  │  ││  ││  │  │       │
│  │  │█  │█ │  │█  │█  │█ │  │█  │█ │  │█  │█  │█ │       │
│  │  └┤  └┤ │  └┤  └┤  └┤ │  └┤  └┤ │  └┤  └┤  └┤ │       │
│  │ C │ D │E│ F │ G │ A │B│ C │ D │E│ F │ G │ A │B│       │
│  └───┴───┴─┴───┴───┴───┴─┴───┴───┴─┴───┴───┴───┴─┘       │
│  ▲ Plays patch of selected track (►FM 0)                   │
│  ▲ Highlights active note during playback & on click       │
└────────────────────────────────────────────────────────────┘
```

**Tracks panel (left):**
- 8 FM channels listed vertically
- Click to select → ► indicator, keyboard below plays this channel's patch
- SFX channels (6-7 typically) grayed out / locked
- Mute/solo per track

**Grid (center):**
- Horizontal axis = frames (native unit, ~16.77ms per tick)
- Vertical position within a track = pitch (higher = higher note)
- Notes displayed as horizontal bars: start frame → end frame (key-on → key-off)
- Bar length = note duration in frames
- Click a bar → selects it, highlights corresponding key on keyboard below, note sounds
- Drag bar edges → resize duration
- Drag bar vertically → change pitch
- Click empty space → insert new note at that frame/pitch
- Optional BPM/time signature overlay grid (cosmetic, user-defined)

**Keyboard (bottom, full width):**
- Visual piano spanning the YM2151's note range
- Bidirectional — both display and input:
  - **During playback**: keys illuminate in real-time as notes play on the selected track
  - **On note click**: the corresponding key highlights + note sounds (synth clock kick)
  - **On key click/press**: plays the note using selected track's FM patch, optionally records to sequence
  - **To change a note**: select a bar in the grid → click a different key on the keyboard → pitch updates
- Synth clock starts on key press (restore snapshot → inject key-on → WASM generates samples), stops on release (key-off → clock winds down)

**Web MIDI support:**
- `navigator.requestMIDIAccess()` — native browser API, zero dependencies
- Plug USB MIDI keyboard → note-on/off events mapped to YM2151 key-on/off
- Velocity mapped to TL (volume)
- Channel = currently selected FM track
- Optional record-to-sequence (notes written to timeline at current frame position)
- MIDI keyboard plays the real captured FM patches — authentic arcade sounds from hardware controller

**Sound latch segmentation:**

Sound latch commands (0x01 = stage 1 music, 0x02 = boss music, etc.) naturally
segment the capture into individual tracks. Each command = start of a new segment.

**Music loops:** CPS1 music loops indefinitely until the next sound latch command.
No duration constraint — the 68K decides when to switch. The sequencer just needs
a clean loop point in each segment.

**SFX coexistence:** the Z80 reserves specific FM channels for sound effects.
The sequencer must respect this allocation (typically channels 6-7 for SFX,
0-5 for music). Channel allocation is visible in the capture data.

**Steps:**

Phase 1 — Capture + Playback:
- [ ] Record button: store YM2151 register writes with frame timestamps
- [ ] Periodic YM2151 state snapshots (every ~60 frames = ~1 sec) for seek
- [ ] Segment captures by sound latch command (automatic track splitting)
- [ ] Synthetic clock: timer @ 59.637 Hz to drive YM2151 WASM independently of game loop
- [ ] Playback engine: restore snapshot → inject writes per frame → AudioWorklet
- [ ] Loop detection: identify the loop point in each captured segment

Phase 2 — Interactive Piano Roll + Keyboard:
- [ ] Dedicated page `/daw` (separate from emulator, Vite multi-page)
- [ ] Track list (left panel): 8 FM channels, select/mute/solo, SFX channels locked
- [ ] Frame-based grid (native unit = frame, ~16.77ms)
- [ ] Notes as horizontal bars: click to select, drag to move/resize, click empty to insert
- [ ] Visual piano keyboard (bottom, full width): plays selected track's FM patch
- [ ] Bidirectional keyboard: highlights during playback + on note select, input on click/press
- [ ] Note editing via keyboard: select bar in grid → click different key → pitch changes
- [ ] Computer keyboard mapping (Z/S/X/D/C... = piano keys) with record-to-sequence
- [ ] Web MIDI support: `navigator.requestMIDIAccess()`, USB MIDI keyboard → key-on/off, velocity
- [ ] Inherit patch from channel (captured FM voice reused automatically)
- [ ] Optional BPM/time signature overlay (cosmetic grid, user-defined)

Phase 3 — FM Patch Editor Integration:
- [ ] Visual 4-operator FM editor (envelopes, ratios, feedback) — partially exists
- [ ] Patch library: extract all unique patches from captures across games
- [ ] Apply patch to channel: swap the FM voice on a track
- [ ] Real-time preview: edit patch parameters, hear result instantly via synthetic clock

Phase 4 — Advanced:
- [ ] Automation lanes for LFO, volume, panning
- [ ] Copy/paste patterns across segments
- [ ] In-game reinject mode (override Z80 on music channels, preserve SFX)
- [ ] MIDI export as approximate reference (notes only, no FM effects, user sets BPM/time sig)
- [ ] MIDI import with patch mapping (notes from MIDI, patches from capture)
- [ ] Capture 10+ minutes of gameplay → edit entire game soundtrack at once

**Capture data format (for serialization/tests):**

```typescript
interface CaptureFrame {
  frame: number;                         // absolute frame number since record start
  writes: { addr: number; data: number }[];  // YM2151 register writes this frame
}

interface YM2151Snapshot {
  frame: number;                         // frame at which snapshot was taken
  registers: Uint8Array;                 // all 256 YM2151 registers
  wasmHeap?: ArrayBuffer;               // optional: full WASM heap for perfect restore
}

interface CaptureSegment {
  latchCommand: number;                  // sound latch value that triggered this segment
  startFrame: number;
  frames: CaptureFrame[];
  snapshots: YM2151Snapshot[];           // keyframes every ~60 frames for seek
  loopFrame?: number;                    // detected loop point (frame index)
  channelAllocation: {
    music: number[];                     // e.g. [0,1,2,3,4,5]
    sfx: number[];                       // e.g. [6,7]
  };
}

interface CaptureFile {
  version: 1;
  gameName: string;                      // e.g. 'sf2hf'
  captureDate: string;                   // ISO 8601
  segments: CaptureSegment[];
}
```

Capture files saved as JSON (or MessagePack for size). Exported from `/play`, imported into `/daw`.

**Tests (Vitest):**

Phase 1 tests (`src/__tests__/daw-capture.test.ts`):
- [ ] Capture records register writes with correct frame timestamps
- [ ] Capture creates snapshots at regular intervals (~60 frames)
- [ ] Sound latch change creates new segment boundary
- [ ] Snapshot restore: write all 256 registers to fresh YM2151 instance, verify state matches
- [ ] Playback engine: inject writes from capture, verify YM2151 output matches original
- [ ] Loop detection: identify repeated register write patterns
- [ ] Synthetic clock: verify tick rate produces correct number of samples per frame (55930 Hz / 59.637 fps ≈ 938 samples/frame)

Phase 2 tests (`src/__tests__/daw-sequencer.test.ts`):
- [ ] Note insertion: generate correct key-on/KC/KF/key-off writes for a given pitch + channel
- [ ] Note deletion: remove writes from sequence, verify gap
- [ ] Note move (pitch): update KC register in existing writes
- [ ] Note move (time): shift writes to different frame
- [ ] Note resize: move key-off write to extend/shorten duration
- [ ] Patch inheritance: new note on channel N uses channel N's last loaded patch registers
- [ ] Frame-based grid: verify all operations snap to frame boundaries
- [ ] Computer keyboard → note mapping roundtrip (key press → write → read back = same note)
- [ ] Web MIDI → note mapping (MIDI note number → YM2151 KC conversion, velocity → TL)

Phase 3 tests (`src/__tests__/daw-patches.test.ts`):
- [ ] Patch extraction: scan capture, identify unique patches per channel
- [ ] Patch application: swap all operator registers for a channel, verify writes updated
- [ ] Patch roundtrip: extract → serialize → deserialize → apply → YM2151 output matches

Integration tests (`tests/e2e/daw.spec.ts` — Playwright):
- [ ] `/daw` page loads and renders track list + grid + keyboard
- [ ] Load capture file → tracks populated with notes
- [ ] Click note → keyboard highlights correct key
- [ ] Click keyboard key → sound plays (verify AudioContext active)
- [ ] Playback: press play → notes scroll, keyboard animates
- [ ] Basic edit flow: select note → change pitch via keyboard → verify updated in grid
- [x] **Scroll Layer Editor** — Works via existing sprite editor (click scroll tile → edit → patches GFX ROM)
- [x] **Sprite Analyzer** — Select a multi-tile sprite → scan GFX ROM for all similar tile groups (animation frames, poses). Compare pixel-by-pixel, assemble nx×ny layout, score >70% = match. Display all variants in a gallery panel. Stores tile addresses for batch operations.
- [x] **Photo Import** — Upload photo → background removal → resize to sprite dimensions (nx×16 × ny×16) → quantize to sprite's 16-color palette → write pixels across all tiles. Combined with Sprite Analyzer: apply to ALL found variants (every animation frame gets the new face).
- [x] **Tile Allocation Manager** — Track free/used tiles across entire GFX ROM

## UI / UX

- [ ] **Mobile touch controls** — Virtual d-pad and buttons for phones/tablets
- [ ] **Speed control** — Fast forward / slow motion
- [x] **FPS counter** — Optional display
- [ ] **Screenshot button** — Save current frame as PNG
- [ ] **Rewind** — Save N frames in circular buffer, hold button to rewind
- [ ] **Sprite highlight colors** — Unique color per detected multi-tile sprite to distinguish overlapping characters
- [ ] **Sprite grouping improvements** — L'auto-grouping actuel (palette + proximité spatiale) échoue sur les jeux denses (Magic Sword, etc.) où tout se touche. Deux axes : (1) Réduire les faux positifs en combinant 4 critères : palette commune + proximité réduite (0px) + tile codes proches dans la ROM + index OBJ consécutifs. (2) Fallback sélection manuelle pour les cas où aucune heuristique ne peut résoudre l'ambiguïté (aucun signal technique ne relie les tiles d'un "sprite" — c'est une intention graphique, pas un concept hardware CPS1).

## Platform expansion

- [ ] **Neo Geo (MVS)** — Same CPUs (68000 + Z80), different video (sprite-only), YM2610 audio
- [ ] **CPS2** — Evolution of CPS1, encrypted 68000, QSound standard
- [ ] **CPS3** — SH-2 CPU, very different architecture

## Homebrew / Portage CPS1

### Portage Sonic the Hedgehog → CPS1

Le code 68000 de Sonic 1 (Mega Drive) est entièrement désassemblé et buildable (projet sonicretro).
La Mega Drive partage le 68000 (main) et le Z80 (audio) avec le CPS1. Le portage consiste à
remplacer les couches hardware-spécifiques tout en gardant la logique de jeu intacte.

**Ce qu'on garde tel quel :**
- Physique du personnage (vitesse, accélération, pentes, anneaux)
- Logique des ennemis et patterns
- State machine du jeu (titre, zones, transitions, game over)
- Structure des niveaux (layout data)

**Ce qu'il faut adapter :**

| Composant | Mega Drive (VDP) | CPS1 (CPS-A/CPS-B) | Travail |
|-----------|------------------|---------------------|---------|
| Scroll planes | 2 planes (A/B) + window, registres `$C00000` | 3 scroll layers, registres `$800100+` | Réécrire le driver vidéo |
| Sprites | 80 max, 8×8 à 32×32, table à `$C00000` | 256 max, 16×16, table VRAM `$900000` | Nouveau sprite manager |
| Tiles | 8×8, 4bpp, layout VDP | 16×16, 4bpp, layout CPS1 | Conversion de tous les assets |
| Palette | 4×16 couleurs, 9-bit RGB (512 couleurs) | 192×16 couleurs, 16-bit RGB (65536 couleurs) | Conversion + enrichissement |
| DMA/VRAM | DMA fill/copy via port VDP | Écriture directe VRAM | Remplacer toutes les routines DMA |
| Scrolling | Row scroll, column scroll via VDP | Row/column scroll via registres CPS-A | Adapter les offsets |
| Audio | YM2612 (FM) + PSG, Z80 driver | YM2151 (FM) + OKI (ADPCM), Z80 driver | Réécrire le driver audio |

**Gains visuels attendus :**
- 3 layers de parallax au lieu de 2 → profondeur de décor supplémentaire
- 256 sprites vs 80 → plus d'éléments à l'écran simultanément
- Palette 65536 couleurs vs 512 → dégradés, shading, reflets impossibles sur MD
- Résolution 384×224 vs 320×224 → image plus large

**Gains audio :**
- YM2151 : son FM plus propre/brillant que le YM2612 (grain MD en moins)
- OKI : 4 voix ADPCM simultanées vs 1 canal DAC → SFX plus riches

**Étapes :**
- [ ] Étudier le désassemblage Sonic 1 (sonicretro), identifier les modules hardware-dépendants
- [ ] Écrire un driver vidéo CPS1 en 68K (init, scroll, sprites, palette)
- [ ] Convertir les tiles 8×8 → 16×16 (upscale ou redesign)
- [ ] Convertir les palettes MD → CPS1
- [ ] Convertir les niveaux (tile maps) vers le format scroll CPS1
- [ ] Réécrire le driver audio Z80 pour YM2151 + OKI
- [ ] Convertir les instruments FM (YM2612 patches → YM2151 patches)
- [ ] Encoder les SFX en ADPCM OKI
- [ ] Packager en ROM set MAME-compatible (.zip)
- [ ] Tester dans Sprixe

### AI Tile Upscaler

Pipeline d'upscale des tiles pixel art assisté par IA, intégrable dans Sprixe.

**Cas d'usage :**
- Portage Mega Drive → CPS1 : tiles 8×8 → 16×16
- Amélioration de tiles existants (plus de détail, meilleur shading)
- Feature standalone de Sprixe ("enhance sprites")

**Pipeline :**
1. Extraire les tiles depuis la ROM (déjà possible via `tile-encoder.ts`)
2. Reconstruire le contexte : assembler les tiles adjacents en sprites/blocs complets
3. Upscale IA ×2 avec modèle spécialisé pixel art (pas de lissage, pas d'anti-aliasing)
4. Quantizer la sortie vers la palette CPS1 cible (16 couleurs par tile max)
5. Découper en tiles 16×16 CPS1
6. Encoder au format GFX ROM CPS1 (via `tile-encoder.ts`)
7. Review/retouche dans le sprite editor
8. Preview live dans l'émulateur

**Outils/modèles à évaluer :**
- Pixelover (spécialisé pixel art upscale)
- Stable Diffusion + LoRA pixel art
- ESRGAN avec modèle pixel art (4x-PixelPerfect)
- Modèle custom entraîné sur des tiles arcade (CPS1, Neo Geo, CPS2)

**Contraintes hardware CPS1 à respecter :**
- 16 couleurs max par tile (4bpp)
- Taille fixe 16×16 pixels
- Pas d'anti-aliasing (contours nets obligatoires)
- Cohérence entre tiles adjacents (pas de coutures)

**Étapes :**
- [ ] Benchmark des modèles d'upscale existants sur des tiles Mega Drive/CPS1
- [ ] Développer le pipeline extract → upscale → quantize → encode
- [ ] Intégrer dans Sprixe (bouton "AI Enhance" dans le sprite editor)
- [ ] Gérer le contexte multi-tiles (sprites composés de plusieurs tiles)
- [ ] Permettre la retouche manuelle post-upscale

### Éditeur de jeu CPS1 (vision long terme)

Type GB Studio mais pour CPS1. Éditeur visuel pour créer des jeux CPS1 jouables sur émulateur ou hardware réel.

**Approche recommandée : cibler un genre (beat-em-up)**
- Templates : personnage jouable, ennemis, décors scrollants, boss
- Runtime 68K fixe, seuls les assets et paramètres changent
- State machine IA basique (marcher vers joueur, attaquer à portée, reculer)
- Moins ambitieux qu'un éditeur générique, mais déjà unique au monde

**Briques existantes dans Sprixe :**
- Sprite editor (dessin, palette, tiles) ✅
- Sample editor (OKI ADPCM) ✅
- ROM export (.zip MAME) ✅
- Émulateur pour test live ✅

**Briques manquantes :**
- Éditeur de niveaux / scenes (tile map editor)
- Système de scripting (visuel ou DSL)
- Compilateur/assembleur 68K intégré
- Runtime 68K (game engine CPS1)
- Éditeur de musique FM (tracker → YM2151)
- Éditeur de collision maps

## Infrastructure

- [ ] **GitHub Pages** as alternative hosting (with service worker for COOP/COEP headers)
- [ ] **PWA** — manifest.json existe, manque le service worker pour offline/installable
- [x] **CI** — GitHub Actions (.github/workflows/ci.yml) : npm ci → test → build sur push/PR main

## Aseprite Export

- [ ] **Multi-palette per-frame Aseprite export** (Low priority) — Export sprite/scroll captures with multiple palette variations in a single .aseprite file. Each frame can have its own palette (Aseprite supports per-frame palette chunks). This allows capturing all visual states of a character (normal, selected/flashing, faded) in one file. Requires changes to `aseprite-writer.ts` (per-frame palette chunks), `aseprite-reader.ts` (read per-frame palettes on import), and the capture system (accumulate palette variations over time). Lower priority since users can already capture at the right moment to get the desired palette.
