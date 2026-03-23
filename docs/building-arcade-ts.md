# 20,000 Lines of TypeScript to Hear Ryu's Theme Again

*I built a CPS1 arcade emulator from scratch in the browser — two CPUs, a mass of bugs, and a 12-hour debug session that MAME solved in 2 minutes.*

---

## The idea

I'm 48. For me, Double Dragon and OutRun were my first thrills in an arcade hall. Like many people of my generation, retrogaming revives that nostalgia — MAME, RetroArch and others let us live the dream: playing all those games at home without going broke.

I've been a developer for 20 years, and I was looking for a project that would really push me. The arrival of AI in coding gave me the confidence to attempt something I'd never have tried alone: building an arcade emulator from scratch in TypeScript — a Motorola 68000 CPU, a Z80, video rendering, audio mixing, all running in a browser. The only exception: the YM2151 FM synthesis chip, which uses Nuked OPM compiled from C to WASM for cycle-accuracy. Everything else is pure TypeScript.

I got sucked in. The obsession kicked in immediately. The feeling of victory when just *an image* shows up on screen — even a broken, garbled one — is something I wasn't prepared for.

Not long after, Street Fighter II was running in Chrome with sound.

## From nothing to "something is happening"

The first commit was 8,900 lines. A complete M68000 CPU interpreter, a Z80 CPU, a memory bus, a ROM loader, a video renderer, and an input system.

Here's what it looked like:

![First boot — total chaos](bugs/bug-1-2026-03-17.png)
*The first successful boot of Street Fighter II. Every pixel is wrong.*

This is what you get when the tile decoder reads pixels in the wrong order, the bank mapper is missing, and the transparent color is inverted. But the game is running — the 68000 is executing instructions, reading VRAM, and something is making it to the screen.

### The cascade of graphics bugs

Each fix revealed the next problem:

**Bank mapper** — CPS1 uses a custom PAL chip to translate tile codes through a per-game lookup table. Without it, every tile points to the wrong graphics data.

![Wrong tiles everywhere](bugs/bug-4-2026-03-17.png)
*Same tile repeated across the entire screen — the bank mapper returns the same value for everything.*

**Pixel bit order** — The GFX ROM encodes pixels MSB-first (bit 7 = leftmost pixel). My decoder had it backwards. Everything was horizontally mirrored at the sub-tile level.

![SF2 logo garbled](bugs/bug-8-2026-03-17.png)
*The Street Fighter II logo is recognizable but completely mangled. The text below is gibberish.*

**Plane bit assignment** — CPS1 tiles are 4 bits per pixel, stored across 4 bitplanes. I had the planes in the wrong order, producing psychedelic color artifacts:

![Ryu portrait with red artifacts](bugs/bug-16-2026-03-17.png)
*Ryu's portrait on the character select screen. The colors are close but contaminated with red — one bitplane is swapped.*

**Palette inversion** — I fixed the portraits, but the backgrounds were still in negative. Turns out color index 0 should be transparent, not color index 15. One constant, hours of debugging.

![Inverted colors on the stage](bugs/bug-12-2026-03-17.png)
*The stage background rendered in inverted colors — like a photo negative.*

### The audio battle

When we got a game displaying more or less correctly, I thought the hard part was over. Wrong.

For someone who knew almost nothing about emulation a week ago, I assumed audio would be a formality. It wasn't. With graphics, a pixel is either right or wrong — there's no debate. Audio is different. You can *argue* about synthesis quality. Clipping is barely noticeable on speakers but screams through headphones. The same mix sounds fine in one game and terrible in another.

The CPS1 audio system is its own computer: a Z80 CPU running at 3.58 MHz, connected to a Yamaha YM2151 FM synthesizer and an OKI MSM6295 ADPCM sample player. The main 68000 CPU communicates with the Z80 through a single byte — the "sound latch".

Three bugs stood between silence and music:

1. **Wrong I/O addresses** — The YM2151 and OKI registers were swapped. The Z80 was writing FM data to the sample player and vice versa.
2. **No timer interleaving** — The YM2151 timers only advanced after the Z80 finished its entire frame budget. But the Z80 music driver depends on Timer A interrupts to sequence notes. No interrupts during execution = the sequencer is frozen.
3. **Spurious IRQs** — Every sound latch write was triggering a Z80 interrupt. The CPS1 doesn't do this — the Z80 polls the latch during its Timer A interrupt routine.

After finally getting Street Fighter II to sound right, I discovered that some later CPS1 games use an entirely different audio system — the QSound DSP, found on the so-called "CPS1.5" boards released just before the CPS2. Different chip, different Z80 bus, encrypted CPU, shared memory communication instead of a simple latch. A whole new architecture to implement.

Even today it's not perfect. The FM synthesis is the one component I gave up writing in TypeScript — I ended up compiling Nuked OPM, a cycle-accurate C emulation based on the actual YM2151 die-shot, to WASM. Some battles you don't need to fight twice.

## Making it sound right

Sound came out. Wrong sound. The YM2151 FM synthesis is notoriously difficult to emulate — four operators per channel, feedback loops, envelope generators with precise timing.

After four incremental fixes (busy flag 64x too long, modulation shift missing, envelope clocking wrong, LFO not connected), I gave up on my custom implementation and ported **Nuked OPM** — a transistor-level accurate emulator based on the actual YM2151 die shot.

2,000 lines of C ported to TypeScript. It worked — but consumed 58% CPU. Compiling the original C to WASM via Emscripten brought it down to 33%. Same accuracy, half the CPU cost.

**The critical WASM bug**: `~level & 0xffff` — In C, the bitwise NOT on a signed int preserves the sign for arithmetic shift. In TypeScript, the `& 0xffff` mask converts the result to unsigned 16-bit, inverting the envelope attack curve. Entire channels went silent. One line of code, hours of debugging.

### Multi-game support

With SF2 working, generalizing to 41 games required making every hardware parameter configurable per game: CPS-B ID registers, GFX bank mapper tables, layer priority masks. All extracted from MAME's source code — 400,000 lines of C++ distilled into TypeScript data structures.

## The DOM renderer experiment

I don't know what came over me, but things were going too well. Let's make it harder.

What if instead of rendering frames to a canvas, we displayed everything as DOM elements — actual HTML elements moving around the screen? After all, sprites are just rectangles with pictures. It's not *that* crazy.

The first attempt used React. Components for each sprite, each scroll tile. It worked conceptually but React's virtual DOM diffing is absurd when 100% of the content changes every frame at 60fps.

Stripped React. Rewrote in vanilla TypeScript with direct DOM manipulation. Scroll layers rendered in `<canvas>` (too many tiles for DOM), sprites as individual HTML elements.

Surprisingly, the basic implementation came together quickly. The bugs were entertaining to look at — imagine Street Fighter II characters rendered as a mosaic of misplaced HTML elements. After a few fixes, it actually worked: every sprite on screen is a real DOM element you can inspect in DevTools. You can hover over Ryu, see his bounding box, check his position, mess with his styles.

![Final Fight in DOM mode — almost perfect](bugs/bug-18-2026-03-19.png)
*Final Fight running in DOM mode. Every character on screen is an inspectable HTML element.*

It's less performant, a bit more buggy, but as a developer — I'm sure you understand the appeal.

### Hardware-level testing

Integrated Tom Harte's ProcessorTests: 16,800 test vectors for the M68000, 117,600 for the Z80. Each vector is a complete CPU state (registers, memory, flags) before and after executing a single instruction. This is how you find bugs that no game triggers but that corrupt state over thousands of frames.

## QSound and encrypted CPUs

Some CPS1 games (Cadillacs & Dinosaurs, The Punisher) use a completely different audio system: the QSound DSP. And their Z80 CPUs are **encrypted** — a custom "Kabuki" Z80 that decrypts opcodes on the fly using per-game keys.

Without decryption, the Z80 executes garbage. With decryption but the wrong interrupt mode, it executes the right code but never responds to audio commands.

![Ghouls'n Ghosts — sprites missing](bugs/bug-25-2026-03-20.png)
*Ghouls'n Ghosts with only hearts and two green sprites visible. The GFX bank mapper fallback was wrong for sprite tiles.*

![Ghouls'n Ghosts — sprites as white squares](bugs/bug-27-2026-03-20.png)
*Getting closer — the background is perfect but sprites are white squares. Bank mapping works but the sprite tile lookup is off.*

## The 12-hour debug session

I mentioned the QSound plot twist earlier. What I didn't describe is what those 12 hours felt like.

QSound games had no audio. Everything was wired correctly. The DSP produced sound when fed data directly. But the Z80 never sent any data.

Forward, backward, hope, disappointment, loop. I was so deep in the tunnel I didn't see the hours pass. Out of pride, I wanted to avoid relying on existing tools as much as possible — I wanted to figure it out myself.

12 hours. I added logging to every bus write, every Z80 instruction, every QSound register. The Z80 was reaching the audio write subroutine, but all parameters were zero. I tried hacks — wake signals, direct bypass, force ready flags. Nothing.

Then I caved and opened MAME's debugger. Two minutes. The MAME trace showed:
```
0001: im 1     ← Interrupt mode 1
```

Our trace showed:
```
0001: im 0     ← Interrupt mode 0
```

**The bug**: the Z80 instruction decoder was reading the second byte of prefixed instructions (CB, ED, DD, FD) from the **data ROM** instead of the **opcode ROM**. With Kabuki encryption, opcodes and data are decrypted differently. `ED 56` (IM 1) was being decoded as `ED 66` (IM 0).

In IM 0, the Z80 never calls the interrupt service routine at 0x0038. The ISR never captures sound commands. The QSound voices are never configured. Total silence.

**The fix**: three lines changed. `fetchByte()` → `fetchOpcode()` in three methods. Sound poured out of the speakers.

At some point you have to admit defeat. Even with experience and a good AI at your side, you can't challenge a project like MAME — 25 years of accumulated knowledge, hundreds of contributors who've already conquered every one of these problems. The further I go in this project, the deeper my respect for MAME grows.

## Architecture

The final architecture mirrors the real hardware more closely than I expected:

```
Main Thread                     Audio Worker
───────────                     ────────────
68000 @ 10 MHz                  Z80 @ 3.58 MHz
CPS-A/B video                   YM2151 (WASM)
Input, UI, WebGL2               OKI MSM6295
         │                              │
         │ sound latch                  │ samples
         └──── postMessage ────────────→│
                                        ↓
                                SharedArrayBuffer
                                        ↓
                                  AudioWorklet
                                   → speakers
```

The audio Z80 runs in a **Web Worker** on its own timer — independent from the main thread, just like the real hardware where the audio CPU has its own crystal oscillator. The main thread only sends sound commands through a "latch" (a single byte), exactly like the real CPS1.

The audio output uses an **AudioWorklet** reading from a **SharedArrayBuffer** ring buffer — the worklet thread pulls samples at the audio hardware's rate, decoupled from both the emulation and the rendering.

## The numbers

| Metric | Value |
|--------|-------|
| Lines of TypeScript | ~20,000 |
| Games supported | 39 parent ROM sets (~20-25 fully playable, others with varying bugs) |
| CPU usage | ~33% on a modern Mac |
| M68000 test vectors | 16,800 |
| Z80 test vectors | 117,600 |
| YM2151 implementations | 3 (custom → Nuked OPM TS → Nuked OPM WASM) |
| Most time spent on a single bug | 12 hours (fetchByte vs fetchOpcode) |
| Time for MAME debugger to find it | 2 minutes |

## What I learned

**Get out of the tunnel.** I know, you know, we all know: locking yourself in a debug session for hours feels necessary and inevitable. It's not. Set a timer — one hour, two hours max — then stop coding and think. I didn't do this. I burned 12 hours on a bug that MAME's debugger found in two minutes.

**Building from zero is addictive.** Seeing a single pixel appear on screen, hearing a first beep come out of your speakers — these hit different. A serotonin hit you don't get from adding a feature to an existing codebase.

**You're not smarter than everyone who came before you.** The classic side-project trap. You think you're on virgin ground, but pioneers have already walked this path — and suffered through the same problems. There's comfort in knowing you're not alone. And honestly, we shouldn't complain too much — they didn't have Claude Code.

**Endianness will ruin your week.** CPS1 is big-endian. JavaScript is little-endian. Five bugs. Pixels, planes, input ports, sprite words, decode rows. Every single time I thought "no way it's a byte swap issue", it was a byte swap issue.

**One bit matters.** A bitplane swap turns Ryu's face red. A mask (`& 0xffff`) silences entire channels. A fetch method (`fetchByte` vs `fetchOpcode`) makes QSound mute. That last one cost 12 hours.

**The real hardware is humbling.** The CPS1 does scroll layers, sprites, palette animation, and stereo FM audio with two CPUs, two custom ASICs, and a handful of standard chips — on a board the size of a paperback book. I needed 20,000 lines of TypeScript and a computer a million times more powerful to approximate what it does.

---

*Built with [Claude](https://claude.ai) as AI pair programmer — I drove the architecture, testing, and debugging, Claude helped with implementation speed.*

*[Arcade.ts](https://github.com/privaloops/arcade-ts) is open source. Try the [live demo](https://arcade-ts.vercel.app) — bring your own ROMs.*
