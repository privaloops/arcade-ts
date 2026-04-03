# Learnings

## Session April 3

### Pose deduplication — two independent bugs causing duplicates

**Context:** Same pose appeared multiple times in sprite sheet exports (e.g., sf2hf captured 80 poses but 18 groups were duplicates).

**Root cause 1 — inconsistent hash formulas:** Three dedup sites (stop-time, export, save restore) used `[...new Set(codes)].sort().join(',')` which strips intra-group duplicate tile codes, while `poseHash()` (frame-time) preserves them. The formulas could disagree on what constitutes a duplicate.

**Fix:** All sites now use `p.tileHash` / `pose.tileHash` (pre-computed by `poseHash()`). Single source of truth.

**Root cause 2 — multi-palette grouping pollution:** `groupCharacter()` flood-fills across palettes (body + weapon + horse share adjacency). `poseHash()` hashed ALL tiles including adjacent sprites from other palettes. If a nearby sprite from another palette entered/left the adjacency zone between frames, the hash changed, creating false-distinct poses.

**Fix:** `poseHash()` now filters `group.tiles` by `group.palette` before hashing. Adjacent tiles from other palettes are irrelevant to pose identity.

**Key insight:** CPS1 characters are multi-palette by design, but pose identity should be per-palette. Since Aseprite is strictly one palette per indexed file (no per-layer/per-tile palette), multi-palette grouping was carrying dead weight. The solution is mono-palette grouping at capture time — simpler, cleaner, and eliminates a whole class of parasites.

## Session April 2-3

### CPS1 multi-tile sprites — why captures were broken for complex games

**Context:** Sprite capture worked for Final Fight but tiles were misplaced for WoF (Warriors of Fate) in the sprite sheet viewer and layer panel.

**Root cause:** `readAllSprites()` treated each OBJ entry as a single 16×16 tile, but CPS1 hardware supports multi-tile (nx×ny) sprites. A single OBJ entry can generate a grid of tiles (e.g., 4×4 = 16 tiles). The renderer (`cps1-video.ts`) correctly expanded these, but the sprite analyzer didn't.

**Fix:** Replicate the renderer's sub-tile expansion formula: `(mappedBaseCode & ~0x0F) + ((mappedBaseCode + nxs) & 0x0F) + 0x10 * nys` with flip variants. Each sub-tile gets a unique `uid` for grouping deduplication (multiple sub-tiles share the same OBJ `index`).

**Key insight:** The tile code formula is duplicated between `cps1-video.ts` and `sprite-analyzer.ts`. A comment marks this dependency. If the formula changes, both must be updated.

### Per-palette export — why multi-palette import is fundamentally impossible

**Context:** CPS1 tiles are 4bpp indexed with a single 16-color palette per tile. A character spanning multiple palettes (e.g., rider + horse in WoF) cannot be imported as a single Aseprite file because Aseprite uses one palette per frame.

**Decision:** Export per palette instead of per character. Each exported .aseprite file is mono-palette and independently importable. The eye toggle in the sprite palette panel lets users isolate which palette to capture/export.

## Session March 25 (evening)

### FM Patch Editor — Why real-time playback failed

**Context:** Attempted to make FM parameter edits (algorithm, ADSR, volume) audible immediately while the game plays.

**Approaches tried:**
1. **ROM patching only** (`syncAudioRom`) — Z80 caches voice data in work RAM. Only takes effect when the Z80 reloads the voice from ROM (rare, driven by music data). No immediate effect.
2. **Direct WASM writes** (`fmOverride`) — Writes YM2151 registers directly. Works momentarily but Z80 overwrites them on the next frame (continuous TL adjustments for volume envelopes). Also corrupts the WASM address latch between Z80 ticks (Nuked OPM is cycle-accurate; `writeAddress` without intervening `clockCycles` breaks internal state).
3. **Z80 write interception** (`fmEditorActive` + shadow registers) — Intercepts Z80 register writes and substitutes editor values. Race condition: lock message arrives before register data → zeros written → silence. Fixed with atomic message, but TL interception removes Z80 volume dynamics → notes play flat with no velocity/envelope. Excluding TL from interception preserves dynamics but means Volume/Brightness sliders have no effect.

**Root cause:** The Z80 sound driver has two layers of control:
- **Voice loading** (infrequent): reads 40-byte voice from ROM → writes all YM2151 registers
- **Volume envelope** (every frame): adjusts carrier TL = base_TL + channel_volume_offset

These two layers are inseparable without understanding the music sequence format. Any override that touches TL conflicts with the driver's volume control.

**Conclusion:** Real-time FM preview requires reverse-engineering the Z80 music sequencer to either:
- Inject modified voice data into the Z80's work RAM channel state
- Or replace the driver's voice loading routine with a hook

### CPS1 Palette — Brightness fade discovery

**Context:** Palette edits in VRAM weren't persisting across rounds. Attempted to find palette data in program ROM by searching for exact 32-byte VRAM patterns.

**Problem:** Zero matches in 2MB program ROM, even for 8-byte partial matches, even byte-swapped.

**Discovery:** Palette watch trace revealed the 68K runs `ADD.W D2, (A0)+` (opcode 0xD558) in a loop at PC=0x2A6A-0x2A70, adding 0x1000 to each palette word. This is a **brightness fade-in**: CPS1 palette format has brightness in bits 15-12, so +0x1000 = +1 brightness step.

**Solution:** Strip the brightness nibble (bits 15-12) from VRAM values before searching program ROM. The base palette (brightness=0) exists in ROM. When patching, preserve the ROM's original brightness nibble and replace only the RGB nibbles (bits 11-0).

**Key insight:** CPS1 games rarely store final VRAM-ready palette values in ROM. They store base palettes and apply runtime transformations (brightness fades, color cycling, flash effects). Any palette search must account for this.

### Nuked OPM WASM — Address latch sensitivity

**Context:** Adding `ym2151.writeAddress(register)` before every `writeData()` in the Z80 callback killed all audio.

**Cause:** Nuked OPM is cycle-accurate. `OPM_Write(&chip, 0, value)` schedules an address latch update that needs `OPM_Clock()` cycles to process. Calling `writeAddress` twice without intervening clock cycles (once from the Z80's port 0xF000 write, once from our added call) corrupts the chip's internal write-pending state.

**Rule:** Never call `writeAddress`/`writeData` on Nuked OPM without `clockCycles()` between them. The Z80 naturally provides cycles between address and data writes; external code (fmOverride) must explicitly clock.

### Scroll 2 tile inspector — Row scroll offset

**Context:** Clicking on scroll 2 tiles selected wrong tiles on stages with parallax (Ken, Honda, etc.).

**Cause:** The render path applies per-row X scroll offsets for scroll 2 (when videocontrol bit 0 is set), but `inspectScrollAt` used a single fixed scroll X for all rows.

**Fix:** Replicated the render path's row scroll formula in `inspectScrollAt`: read per-row offset from VRAM "other" region, apply to scroll X before coordinate mapping.
