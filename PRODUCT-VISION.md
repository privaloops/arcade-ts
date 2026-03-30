# Product Vision

## One-liner

The first arcade game development platform — create, test, and ship physical cartridges for CPS1 and Neo Geo hardware, entirely from the browser.

## The Stack

```
┌─────────────────────────────────────────────────┐
│                  ArcadeStudio                    │
│                                                  │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │ SDK       │  │ IDE       │  │ Emulator    │  │
│  │           │  │           │  │             │  │
│  │ libcps1   │  │ Sprite    │  │ CPS1        │  │
│  │ libneogeo │  │ Tile map  │  │ Neo Geo     │  │
│  │ gcc-m68k  │  │ Audio     │  │ (future)    │  │
│  │           │  │ Scene     │  │             │  │
│  │ C → 68K   │  │ Scripting │  │ Live test   │  │
│  └───────────┘  └───────────┘  └─────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ Asset Pipeline                            │   │
│  │ PNG → tiles │ WAV → ADPCM │ AI upscale   │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │ Export                                    │   │
│  │ .zip ROM │ Flash image │ Cartridge order  │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Phases

### Phase 1 — ROMstudio (now)
CPS1 emulator + inspection + ROM editing tools in the browser.

**Status:** Working. Aseprite round-trip workflow (capture → export → edit → import), sample editor, audio DAW, ROM export. In-app editing removed — Aseprite is the editor, ROMstudio is the bridge.

**Goal:** Landing page on romstudio.app, capture GIFs, build community awareness.

### Phase 2 — CPS1 SDK
The first CPS1 development kit. Write games in C targeting CPS1 hardware.

- `libcps1` — C library wrapping CPS1 hardware (video init, sprites, scroll, palette, input, audio)
- Cross-compiler integration (gcc-m68k / vasm)
- Asset pipeline (PNG → CPS1 tiles, WAV → OKI ADPCM)
- Starter templates (shmup, platformer, beat-em-up)
- Documentation: full CPS1 register reference (already known from emulator work)

**Proof of concept:** Port Sonic 1 (Mega Drive disassembly) to CPS1 hardware.

### Phase 3 — Visual Game Editor
GB Studio for CPS1. No-code game creation.

- Scene/level editor (tile map placement)
- Sprite animation editor (frame sequences)
- Visual scripting (state machines, triggers, events)
- Enemy AI templates (patrol, chase, attack patterns)
- FM music tracker (YM2151 sequencer)
- One-click build → playable ROM

### Phase 4 — Neo Geo
Port the platform to Neo Geo MVS/AES.

The Neo Geo shares 80% of the architecture (68000, Z80, FM audio). Key differences:
- Video: 100% sprite-based (no tile scroll layers)
- Audio: YM2610 (superset of YM2151, with built-in ADPCM)
- Larger ROM capacity

The Neo Geo community is large, passionate, and actively buying homebrew.

### Phase 5 — Physical Cartridges
Complete the loop: browser → real hardware.

- Flash image export (ready to burn to EPROM)
- Partnership with PCB manufacturers for blank cartridge boards
- Cartridge-as-a-service: upload ROM, receive physical cartridge
- Kit sales: blank PCB + EPROM + case

## Business Model

| Layer | Model | Revenue |
|-------|-------|---------|
| SDK + IDE | Open source (free) | Community, adoption, contributions |
| Emulator | Free (web) | Traffic, brand |
| Cartridge kits | Physical product | $50-100 per kit |
| Cartridge service | Print-on-demand | $150-300 per cartridge |
| Marketplace | Platform fee | % on homebrew game sales |
| Premium assets | AI-enhanced sprite packs, FM sound banks | $10-30 per pack |

## Why This Works

1. **No competition** — No CPS1 SDK exists. No Neo Geo browser IDE exists. First mover.
2. **Community ready** — Retro gaming / homebrew is booming. Neo Geo collectors pay $200+ per cart.
3. **Tech moat** — Building a CPS1 emulator from scratch is a multi-month effort. The SDK/IDE on top makes it a multi-year moat.
4. **Arduino model** — Free tools, paid hardware. Proven model.
5. **Organic growth** — SDK is open source → devs make games → games need cartridges → revenue.

## Target Audience

1. **Retro homebrew developers** — Currently using painful command-line toolchains
2. **Pixel artists** — Want to see their art on real arcade hardware
3. **Chiptune musicians** — YM2151 FM synthesis is a beloved sound
4. **Collectors** — Will buy unique homebrew cartridges
5. **Educators** — Teaching hardware architecture, assembly, game design

## Name

- **ROMstudio** — Current emulator/editor (Phase 1)
- **ArcadeStudio** — Full platform name (Phase 2+)
- Domain: romstudio.app (acquired), arcadestudio.dev (TBD)
