/**
 * CPS1 Emulator — Main loop
 *
 * Connects M68000, Z80, Bus, Video, Renderer and InputManager into a
 * single runnable emulation loop driven by requestAnimationFrame.
 *
 * CPS1 timing:
 *   Pixel clock   : 8 MHz
 *   Frame rate     : 59.63 Hz
 *   M68000         : 10 MHz → ~167 700 cycles/frame
 *   Z80            : 3.579545 MHz → ~60 040 cycles/frame
 *   VBlank IRQ     : level 2 on the 68000 every frame
 */

import { M68000, CpuState } from "./cpu/m68000";
import { Z80, Z80State } from "./cpu/z80";
import { Bus } from "./memory/bus";
import { Z80Bus } from "./memory/z80-bus";
import { Renderer, FRAMEBUFFER_SIZE } from "./video/renderer";
import { WebGLRenderer } from "./video/renderer-webgl";
import { CPS1Video } from "./video/cps1-video";
import { InputManager } from "./input/input";
import { loadRomFromZip, RomSet } from "./memory/rom-loader";
import { NukedOPMWasm, initOPMWasm } from "./audio/nuked-opm-wasm";
import { OKI6295 } from "./audio/oki6295";
import { AudioOutput } from "./audio/audio-output";

// ── Timing constants (from MAME cps1.h) ─────────────────────────────────────
//
// CPS1 screen timing:
//   Pixel clock  : 8 MHz (16 MHz XTAL / 2)
//   H total      : 512 pixels
//   V total      : 262 scanlines
//   Visible area : 384 x 224 (H: 64..448, V: 16..240)
//   VBlank start : scanline 240
//   Frame rate   : 8_000_000 / (512 * 262) ≈ 59.637 Hz
//
// The M68000 runs at 10 MHz. Per scanline:
//   10_000_000 / (512 * 262 * (10/8)) ... simpler: cycles/frame / vtotal
//

const M68K_CLOCK = 10_000_000;        // 10 MHz
const Z80_CLOCK = 3_579_545;          // 3.579545 MHz
const PIXEL_CLOCK = 8_000_000;        // 8 MHz
const CPS_HTOTAL = 512;
const CPS_VTOTAL = 262;
const CPS_VBLANK_LINE = 240;          // VBlank asserted at this scanline
const FRAME_RATE = PIXEL_CLOCK / (CPS_HTOTAL * CPS_VTOTAL); // ~59.637 Hz
const M68K_CYCLES_PER_FRAME = Math.round(M68K_CLOCK / FRAME_RATE); // ~167 700
const M68K_CYCLES_PER_SCANLINE = Math.round(M68K_CYCLES_PER_FRAME / CPS_VTOTAL); // ~640
const Z80_CYCLES_PER_FRAME = Math.round(Z80_CLOCK / FRAME_RATE);   // ~60 040
const VBLANK_IRQ_LEVEL = 2;           // CPS1 VBlank = 68000 IRQ level 2 (IPL1)

// ── Emulator state snapshot (for save state / rollback) ─────────────────────

export interface EmulatorState {
  m68kState: CpuState;
  z80State: Z80State;
  workRam: Uint8Array;       // 64KB
  vram: Uint8Array;          // 192KB
  z80WorkRam: Uint8Array;    // 2KB
  soundLatch: Uint8Array;    // 8 bytes
  cpsaRegisters: Uint8Array; // 42 bytes
  cpsbRegisters: Uint8Array; // 64 bytes
  ioPorts: Uint8Array;       // 64 bytes
}

// ── Emulator ────────────────────────────────────────────────────────────────

export class Emulator {
  private readonly m68000: M68000;
  private readonly z80: Z80;
  private readonly bus: Bus;
  private readonly z80Bus: Z80Bus;
  private readonly renderer: Renderer | WebGLRenderer;
  private readonly input: InputManager;
  private video: CPS1Video | null = null;

  // Audio chips
  private ym2151!: NukedOPMWasm;
  private oki6295: OKI6295 | null = null;
  private audioOutput: AudioOutput;

  // Audio scratch buffers (allocated once, reused per frame)
  private ymBufferL: Float32Array;
  private ymBufferR: Float32Array;
  private okiBuffer: Float32Array;

  // Framebuffer produced by video layer (384x224 RGBA).
  private readonly framebuffer: Uint8Array;

  private running: boolean = false;
  private paused: boolean = false;
  private animFrameId: number = 0;
  private romLoaded: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.bus = new Bus();
    this.z80Bus = new Z80Bus();
    this.m68000 = new M68000(this.bus);
    this.z80 = new Z80(this.z80Bus);
    // Try WebGL2 first, fallback to Canvas 2D
    try {
      this.renderer = new WebGLRenderer(canvas);
      console.log('Using WebGL2 renderer');
    } catch {
      this.renderer = new Renderer(canvas);
      console.log('Using Canvas 2D renderer (WebGL2 unavailable)');
    }
    this.input = new InputManager();
    this.framebuffer = new Uint8Array(FRAMEBUFFER_SIZE);

    // Audio output
    this.audioOutput = new AudioOutput();

    // Pre-allocate audio scratch buffers for one frame
    this.ymBufferL = new Float32Array(1024);
    this.ymBufferR = new Float32Array(1024);
    this.okiBuffer = new Float32Array(256);

    // Wire Z80 bus → YM2151 chip (uses late binding since ym2151 is initialized async)
    this.z80Bus.setYm2151AddressWriteCallback((value: number) => {
      this.ym2151?.writeAddress(value);
    });
    this.z80Bus.setYm2151WriteCallback((_register: number, data: number) => {
      this.ym2151?.writeData(data);
    });
    this.z80Bus.setYm2151ReadStatusCallback(() => {
      return this.ym2151?.readStatus() ?? 0;
    });

    // Wire Z80 bus → OKI6295 chip (connected in loadRom when ROM is available)
    this.z80Bus.setOkiReadStatusCallback(() => {
      return this.oki6295 !== null ? this.oki6295.read() : 0;
    });

    // Wire sound latch: immediate forwarding from 68000 bus to Z80 bus.
    // The latch does NOT trigger a Z80 IRQ (confirmed via MAME).
    // The Z80 polls the latch at 0xF008 during the YM2151 Timer A ISR.
    this.bus.setSoundLatchCallback((value: number) => {
      this.z80Bus.setSoundLatch(value);
    });
    this.bus.setSoundLatch2Callback((value: number) => {
      this.z80Bus.setSoundLatch2(value);
    });

    // Wire up IRQ acknowledge: when the 68000 processes an interrupt,
    // it performs an IACK cycle that clears all interrupt lines.
    // This matches MAME's irqack_r which clears both IPL1 and IPL2.
    this.m68000.setIrqAckCallback(() => {
      this.m68000.clearAllInterrupts();
    });
  }

  // ── ROM loading ───────────────────────────────────────────────────────────

  async loadRom(file: File): Promise<void> {
    // Stop any running emulation and reset state
    this.stop();
    this.audioOutput.suspend();
    this.frameCount = 0;
    this.m68kErrorCount = 0;
    this.z80ErrorCount = 0;
    this.prevRafTime = 0;
    this.frameDebt = 0;

    const romSet: RomSet = await loadRomFromZip(file);

    // Initialize Nuked OPM WASM (first call loads the module, subsequent calls are no-ops)
    await initOPMWasm();
    if (!this.ym2151) {
      this.ym2151 = new NukedOPMWasm();
      this.ym2151.setTimerCallback(() => { this.z80.setIrqLine(true); });
      this.ym2151.setIrqClearCallback(() => { this.z80.setIrqLine(false); });
      this.ym2151.setExternalTimerMode(true);
    }
    this.ym2151.reset();
    this.bus.loadProgramRom(romSet.programRom);
    this.z80Bus.loadAudioRom(romSet.audioRom);

    // Apply CPS-B ID for this game
    if (romSet.cpsBConfig.idOffset >= 0) {
      this.bus.setCpsBId(romSet.cpsBConfig.idOffset, romSet.cpsBConfig.idValue);
    }

    // Wire up CPS1 video with VRAM, graphics ROM, and per-game config
    this.video = new CPS1Video(
      this.bus.getVram(),
      romSet.graphicsRom,
      this.bus.getCpsaRegisters(),
      this.bus.getCpsbRegisters(),
      romSet.cpsBConfig,
      romSet.gfxMapper,
    );

    // Create OKI6295 with its ROM data and wire to Z80 bus
    this.oki6295 = new OKI6295(romSet.okiRom);
    this.z80Bus.setOkiWriteCallback((value: number) => {
      this.oki6295!.write(value);
    });

    this.romLoaded = true;

    // Reset both CPUs — the game boots naturally from the reset vector.
    // The POST runs with SR=0x2700 (IPL=7) which masks all interrupts,
    // so VBlank IRQs cannot corrupt the initialization.
    this.m68000.reset();
    this.z80.reset();
  }

  // ── Emulation control ─────────────────────────────────────────────────────

  start(): void {
    if (!this.romLoaded) {
      throw new Error("Emulator.start: no ROM loaded");
    }
    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    if (this.animFrameId !== 0) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  pause(): void {
    if (!this.running) return;
    this.paused = true;
  }

  resume(): void {
    if (!this.running) return;
    if (!this.paused) return;
    this.paused = false;
    this.scheduleFrame();
  }

  isRunning(): boolean {
    return this.running && !this.paused;
  }

  // ── Frame stepping (debug) ────────────────────────────────────────────────

  stepFrame(): void {
    if (!this.romLoaded) return;
    this.runOneFrame();
  }

  // ── Save state / restore ──────────────────────────────────────────────────

  saveState(): EmulatorState {
    return {
      m68kState: this.m68000.getState(),
      z80State: this.z80.getState(),
      workRam: new Uint8Array(this.bus.getWorkRam()),
      vram: new Uint8Array(this.bus.getVram()),
      z80WorkRam: new Uint8Array(this.z80Bus.getWorkRam()),
      soundLatch: new Uint8Array(this.bus.getSoundLatch()),
      cpsaRegisters: new Uint8Array(this.bus.getCpsaRegisters()),
      cpsbRegisters: new Uint8Array(this.bus.getCpsbRegisters()),
      ioPorts: new Uint8Array(this.bus.getIoPorts()),
    };
  }

  loadState(state: EmulatorState): void {
    this.m68000.setState(state.m68kState);
    this.z80.setState(state.z80State);
    this.bus.getWorkRam().set(state.workRam);
    this.bus.getVram().set(state.vram);
    this.z80Bus.getWorkRam().set(state.z80WorkRam);
    this.bus.getSoundLatch().set(state.soundLatch);
    this.bus.getCpsaRegisters().set(state.cpsaRegisters);
    this.bus.getCpsbRegisters().set(state.cpsbRegisters);
    this.bus.getIoPorts().set(state.ioPorts);
  }

  // ── Audio ────────────────────────────────────────────────────────────────

  /**
   * Initialize audio output. Must be called from a user gesture (click/keydown).
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async initAudio(): Promise<void> {
    try {
      await this.audioOutput.init();
    } catch (e) {
      console.warn('Audio initialization failed (game will run without sound):', e);
    }
  }

  /** Debug: expose YM2151 for audio testing */
  getYm2151(): NukedOPMWasm { return this.ym2151; }

  /**
   * Debug: watch VRAM writes in the palette area and log entries with G=0xF.
   * Useful for diagnosing palette corruption. Activate via console:
   *   window.__emu.debugWatchPalette()
   */
  debugWatchPalette(maxHits: number = 50): void {
    const hits: Array<string> = [];
    const cpu = this.m68000 as unknown as {
      pc: number;
      d: Int32Array;
      a: Int32Array;
      opcode: number;
    };
    let pendingHi: { addr: number; value: number } | null = null;

    this.bus.setVramWatchCallback((addr, value) => {
      if (hits.length >= maxHits) return;
      if (addr < 0x910000 || addr > 0x912FFF) return;

      if ((addr & 1) === 0) {
        pendingHi = { addr, value };
      } else if (pendingHi !== null && addr === pendingHi.addr + 1) {
        const word = (pendingHi.value << 8) | value;
        const msg = `[PAL] PC=0x${cpu.pc.toString(16)} op=0x${cpu.opcode.toString(16).padStart(4, '0')} ` +
          `addr=0x${pendingHi.addr.toString(16)} word=0x${word.toString(16).padStart(4, '0')} ` +
          `D2=0x${(cpu.d[2]! >>> 0).toString(16).padStart(8, '0')} D3=0x${(cpu.d[3]! >>> 0).toString(16).padStart(8, '0')} ` +
          `A0=0x${(cpu.a[0]! >>> 0).toString(16)} A1=0x${(cpu.a[1]! >>> 0).toString(16)}`;
        hits.push(msg);
        console.log(msg);
        pendingHi = null;
      }
    });
    console.log('[PALETTE WATCH] Active — monitoring palette VRAM writes (0x910000-0x912FFF)');
  }

  /** Debug: stop palette watch */
  debugStopWatch(): void {
    this.bus.setVramWatchCallback(null);
    console.log('[PALETTE WATCH] Stopped');
  }

  /** Suspend audio (e.g. when paused). */
  suspendAudio(): void { this.audioOutput.suspend(); }

  /** Resume audio (e.g. when unpaused). */
  resumeAudio(): void { this.audioOutput.resume(); }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.stop();
    this.input.destroy();
    this.audioOutput.suspend();
  }

  // ── Private: main loop ────────────────────────────────────────────────────

  private prevRafTime = 0;
  private frameDebt = 0; // accumulated time debt in ms
  private scheduleFrame(): void {
    if (!this.running || this.paused) return;
    this.animFrameId = requestAnimationFrame((ts) => {
      const elapsed = this.prevRafTime > 0 ? ts - this.prevRafTime : 16.77;
      this.prevRafTime = ts;

      // Frame rate limiter: run exactly at CPS1 native rate (~59.637 Hz).
      // Skip this rAF if not enough time has passed for a full frame.
      const FRAME_MS = 1000 / FRAME_RATE; // ~16.77ms
      this.frameDebt += elapsed;
      if (this.frameDebt >= FRAME_MS) {
        this.runOneFrame();
        this.frameDebt -= FRAME_MS;
        // Clamp debt to prevent runaway after tab backgrounding
        if (this.frameDebt > FRAME_MS) this.frameDebt = 0;
      }

      this.scheduleFrame();
    });
  }

  private frameCount = 0;
  private m68kErrorCount = 0;
  private z80ErrorCount = 0;
  private fpsFrames = 0;
  private fpsLastTime = 0;
  private fpsDisplay = 0;

  private runOneFrame(): void {
    // 1. Update input ports on the bus
    this.input.updateBusPorts(this.bus.getIoPorts());

    const tCpu0 = performance.now();
    // 3. Run M68000 with scanline-accurate VBlank timing.
    //
    // Like real CPS1 hardware (and MAME), we iterate through 262 scanlines.
    // At scanline 240 (CPS_VBLANK_LINE), we assert IRQ level 2.
    // The interrupt line stays asserted until the CPU acknowledges it
    // (via the IACK callback wired in the constructor).
    //
    // During POST, the SR is 0x2700 (IPL=7), masking all interrupts.
    // The VBlank is asserted but never serviced until the game lowers the mask.
    // This is exactly how the real hardware works.

    let m68kCycles = 0;
    try {
      for (let scanline = 0; scanline < CPS_VTOTAL; scanline++) {
        // At VBlank (scanline 240): buffer sprites BEFORE asserting IRQ.
        // The game's IRQ handler will update OBJ_BASE for the next frame,
        // so we must capture the current sprite table first (matches MAME's
        // screen_vblank_cps1 which copies m_obj to m_buffered_obj).
        if (scanline === CPS_VBLANK_LINE) {
          if (this.video) {
            this.video.bufferSprites();
          }
          this.m68000.assertInterrupt(VBLANK_IRQ_LEVEL);
        }

        // Run 68000 for one scanline worth of cycles (~640)
        const targetCycles = m68kCycles + M68K_CYCLES_PER_SCANLINE;
        while (m68kCycles < targetCycles) {
          m68kCycles += this.m68000.step();
        }
      }
    } catch (e) {
      this.m68kErrorCount++;
      if (this.m68kErrorCount <= 5 || this.m68kErrorCount % 600 === 0) {
        console.error(`M68000 error #${this.m68kErrorCount} at frame ${this.frameCount}:`, e);
      }
    }

    // 4. Advance sound latch queue: feed the next queued command to the Z80.
    //    This emulates MAME's synchronize() which ensures the Z80 sees each
    //    command the 68K wrote, even when multiple are written per frame.
    this.z80Bus.advanceSoundLatch();

    // 5. Run Z80 with interleaved YM2151 clocking.
    //
    // Nuked OPM WASM: clockCycles() clocks the chip and collects samples.
    // Prescale of 2: one OPM_Clock = 2 Z80 T-states.
    let z80Cycles = 0;
    let opmAccum = 0;
    try {
      while (z80Cycles < Z80_CYCLES_PER_FRAME) {
        const cyc = this.z80.step();
        z80Cycles += cyc;
        opmAccum += cyc;
        const opmClocks = opmAccum >> 1;
        opmAccum &= 1;
        if (opmClocks > 0) {
          this.ym2151.clockCycles(opmClocks);
        }
      }
    } catch (e) {
      this.z80ErrorCount++;
      if (this.z80ErrorCount <= 5 || this.z80ErrorCount % 600 === 0) {
        console.error(`Z80 error #${this.z80ErrorCount} at frame ${this.frameCount}:`, e);
      }
    }

    // 5. Generate audio samples for this frame and push to output.
    //    Timers are already advanced above, so generateSamples only
    //    produces audio waveforms (no timer advancement).
    {
      const ymSamplesPerFrame = Math.ceil(this.ym2151.getSampleRate() / FRAME_RATE);
      this.ym2151.generateSamples(this.ymBufferL, this.ymBufferR, ymSamplesPerFrame);

      let okiSamplesPerFrame = 0;
      if (this.oki6295 !== null) {
        okiSamplesPerFrame = Math.ceil(this.oki6295.getSampleRate() / FRAME_RATE);
        this.oki6295.generateSamples(this.okiBuffer, okiSamplesPerFrame);
      }

      // Push to audio output if initialized
      if (this.audioOutput.isInitialized()) {
        this.audioOutput.pushEmulatorSamples(
          this.ymBufferL, this.ymBufferR, ymSamplesPerFrame,
          this.okiBuffer, okiSamplesPerFrame,
        );
      }
    }

    this.frameCount++;

    const tCpu1 = performance.now();

    // 7. FPS counter
    const now = performance.now();
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 1000) {
      this.fpsDisplay = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }

    // 8. Render the frame
    const t0 = performance.now();
    this.renderFrame();
    const t1 = performance.now();
  }

  private renderFrame(): void {
    if (this.video) {
      this.video.renderFrame(this.framebuffer);
    }
    this.renderer.render(this.framebuffer);
    // FPS overlay on canvas
    this.renderer.drawText(`${this.fpsDisplay} FPS`, 384 - 60, 12);
  }
}
