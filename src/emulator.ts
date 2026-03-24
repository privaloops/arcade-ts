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
import { Z80BusQSound } from "./memory/z80-bus-qsound";
import { Renderer } from "./video/renderer";
import { FRAMEBUFFER_SIZE, YM2151_SAMPLE_RATE, OKI6295_SAMPLE_RATE, QSOUND_SAMPLE_RATE as QS_RATE } from "./constants";
import { WebGLRenderer } from "./video/renderer-webgl";
import { CPS1Video } from "./video/cps1-video";
import type { RendererInterface } from "./types";
import type { VideoConfig } from "./video/cps1-video";
import { InputManager } from "./input/input";
import { loadRomFromZip, RomSet } from "./memory/rom-loader";
import { NukedOPMWasm, initOPMWasm } from "./audio/nuked-opm-wasm";
import { VizReader, VIZ_SAB_SIZE } from "./audio/audio-viz";
import { QSoundWasm, initQSoundWasm } from "./audio/qsound-wasm";
import { OKI6295 } from "./audio/oki6295";
import { AudioOutput } from "./audio/audio-output";
import { decodeKabuki } from "./memory/kabuki";
import { EEPROM93C46 } from "./memory/eeprom-93c46";
import { type SaveState, saveToSlot, loadFromSlot, bufToB64, b64ToBuf, SAVE_STATE_VERSION } from "./save-state";

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
const FRAME_MS = 1000 / FRAME_RATE;  // ~16.77ms per frame
const Z80_CYCLES_PER_IRQ_QS = Math.round(Z80_CLOCK / 250); // QSound 250Hz IRQ timer
const Z80_CYCLES_PER_SCANLINE = Math.round(Z80_CYCLES_PER_FRAME / CPS_VTOTAL);
const QS_SAMPLES_PER_FRAME = Math.ceil(QS_RATE / FRAME_RATE);
const YM_SAMPLES_PER_FRAME = Math.ceil(YM2151_SAMPLE_RATE / FRAME_RATE);
const OKI_SAMPLES_PER_FRAME = Math.ceil(OKI6295_SAMPLE_RATE / FRAME_RATE);

// ── Emulator state snapshot (for save state / rollback) ─────────────────────

// ── Emulator ────────────────────────────────────────────────────────────────

export class Emulator {
  private readonly m68000: M68000;
  private readonly z80: Z80;
  private readonly bus: Bus;
  private readonly z80Bus: Z80Bus;
  private readonly renderer: RendererInterface;
  private readonly input: InputManager;
  private video: CPS1Video | null = null;
  private _vblankCallback: (() => void) | null = null;
  private _customRenderCallback: (() => void) | null = null;

  // Audio chips
  private ym2151!: NukedOPMWasm;
  private oki6295: OKI6295 | null = null;
  private qsound: QSoundWasm | null = null;
  private audioOutput: AudioOutput;

  // QSound state
  private isQSound = false;
  private z80BusQSound: Z80BusQSound | null = null;
  private qsIrqAccum = 0; // accumulator for 250Hz Z80 IRQ timer

  // Audio worker (standard CPS1 path only)
  private audioWorker: Worker | null = null;
  private audioWorkerReady = false;
  private vizSab: SharedArrayBuffer | null = null;
  private vizReader: VizReader | null = null;
  private pendingSoundLatches: number[] = [];
  private pendingSoundLatches2: number[] = [];

  // Audio scratch buffers (allocated once, reused per frame)
  private ymBufferL: Float32Array;
  private ymBufferR: Float32Array;
  private okiBuffer: Float32Array;
  private qsBufferL: Float32Array;
  private qsBufferR: Float32Array;

  // Framebuffer produced by video layer (384x224 RGBA).
  private readonly framebuffer: Uint8Array;

  private running: boolean = false;
  private paused: boolean = false;
  private animFrameId: number = 0;
  private romLoaded: boolean = false;
  private gameName: string = '';

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
    this.qsBufferL = new Float32Array(1024);
    this.qsBufferR = new Float32Array(1024);

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

    // Wire sound latch: forward from 68000 bus.
    // When audio worker is active, accumulate and flush periodically.
    // Otherwise, forward directly to Z80 bus (QSound or fallback).
    this.bus.setSoundLatchCallback((value: number) => {
      if (this.audioWorkerReady) {
        this.pendingSoundLatches.push(value);
      } else {
        this.z80Bus.setSoundLatch(value);
      }
    });
    this.bus.setSoundLatch2Callback((value: number) => {
      if (this.audioWorkerReady) {
        this.pendingSoundLatches2.push(value);
      } else {
        this.z80Bus.setSoundLatch2(value);
      }
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
    this.terminateAudioWorker();
    this.audioOutput.suspend();
    this.frameCount = 0;
    this.m68kErrorCount = 0;
    this.z80ErrorCount = 0;
    this.prevRafTime = 0;
    this.frameDebt = 0;

    const romSet: RomSet = await loadRomFromZip(file);

    this.isQSound = romSet.qsound;
    this.gameName = romSet.name;
    this.bus.loadProgramRom(romSet.programRom);

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

    if (romSet.qsound) {
      // ── QSound path (CPS1.5: Dino, Punisher, WoF, Slammasters) ──────

      // 1. Init QSound WASM
      await initQSoundWasm();
      this.qsound = new QSoundWasm();
      this.qsound.reset();

      // 2. Load DSP ROM and sample ROM
      if (romSet.qsoundDspRom) {
        this.qsound.loadDspRom(romSet.qsoundDspRom);
      }
      this.qsound.loadSampleRom(romSet.okiRom); // "oki" field is QSound PCM data

      // 3. Kabuki-decrypt the Z80 audio ROM
      const audioRomCopy = new Uint8Array(romSet.audioRom);
      const opcodeRom = decodeKabuki(audioRomCopy, romSet.name);

      // 4. Create QSound Z80 bus and wire it
      this.z80BusQSound = new Z80BusQSound();
      this.z80BusQSound.loadAudioRom(audioRomCopy); // data-decoded
      if (opcodeRom) {
        this.z80BusQSound.loadOpcodeRom(opcodeRom);
      }

      // Wire QSound DSP callbacks
      const qs = this.qsound;
      this.z80BusQSound.setQsoundWriteCallback((offset, data) => {
        qs.write(offset, data);
      });
      this.z80BusQSound.setQsoundReadCallback(() => {
        return qs.read();
      });

      // 5. Switch Z80 to QSound bus
      this.z80.setBus(this.z80BusQSound);

      // 6. Wire shared RAM and EEPROM into 68K bus
      this.bus.setQsoundSharedRam(
        this.z80BusQSound.getSharedRam1(),
        this.z80BusQSound.getSharedRam2(),
      );
      const eeprom = new EEPROM93C46();
      this.bus.setEeprom(eeprom);

      // 7. Reset QSound IRQ accumulator
      this.qsIrqAccum = 0;
      this.oki6295 = null;

    } else {
      // ── Standard CPS1 path (YM2151 + OKI6295) ───────────────────────

      // Clear QSound state from previous load
      this.qsound = null;
      this.z80BusQSound = null;
      this.bus.setQsoundSharedRam(null, null);

      // Initialize Nuked OPM WASM
      await initOPMWasm();
      if (!this.ym2151) {
        this.ym2151 = new NukedOPMWasm();
        this.ym2151.setTimerCallback(() => { this.z80.setIrqLine(true); });
        this.ym2151.setIrqClearCallback(() => { this.z80.setIrqLine(false); });
        this.ym2151.setExternalTimerMode(true);
      }
      this.ym2151.reset();
      this.z80Bus.loadAudioRom(romSet.audioRom);

      // Switch Z80 back to standard bus (in case previous game was QSound)
      this.z80.setBus(this.z80Bus);

      // Create OKI6295 with its ROM data and wire to Z80 bus
      this.oki6295 = new OKI6295(romSet.okiRom);
      this.z80Bus.setOkiWriteCallback((value: number) => {
        this.oki6295!.write(value);
      });

      // Try to create audio worker for off-main-thread audio processing
      await this.initAudioWorker(romSet.audioRom, romSet.okiRom);
    }

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
    this.terminateAudioWorker();
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

  isPaused(): boolean {
    return this.running && this.paused;
  }

  // ── Frame stepping (debug) ────────────────────────────────────────────────

  stepFrame(): void {
    if (!this.romLoaded) return;
    this.runOneFrame();
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

  /** Register a callback invoked at VBlank (scanline 240), before IRQ. */
  setVblankCallback(cb: (() => void) | null): void {
    this._vblankCallback = cb;
  }

  /**
   * Set a custom render callback that replaces the default renderFrame.
   * Pass null to restore the default canvas/WebGL rendering.
   */
  setRenderCallback(cb: (() => void) | null): void {
    this._customRenderCallback = cb;
  }

  /** Expose video config needed by the DOM renderer. Returns null if no ROM loaded. */
  getVideoConfig(): VideoConfig | null {
    return this.video?.getVideoConfig() ?? null;
  }

  /** Expose the video layer (for DOM renderer setComponents). */
  getVideo(): CPS1Video | null {
    return this.video;
  }

  /** Expose bus buffers needed by the DOM renderer. */
  getBusBuffers(): { vram: Uint8Array; cpsaRegs: Uint8Array; cpsbRegs: Uint8Array } {
    return {
      vram: this.bus.getVram(),
      cpsaRegs: this.bus.getCpsaRegisters(),
      cpsbRegs: this.bus.getCpsbRegisters(),
    };
  }

  /** Expose InputManager for gamepad config UI. */
  getInputManager(): InputManager { return this.input; }

  /** Get the current game name (set at ROM load time). */
  getGameName(): string { return this.gameName; }

  /** Expose I/O ports for DIP switch configuration. */
  getIoPorts(): Uint8Array { return this.bus.getIoPorts(); }

  // ── Save State ──────────────────────────────────────────────────────────

  /** Save complete emulator state to a localStorage slot. */
  async saveState(slot: number): Promise<boolean> {
    if (!this.romLoaded) return false;

    // Get audio worker state (Z80 + Z80Bus + OKI)
    let workerState: Record<string, unknown> | null = null;
    if (this.audioWorkerReady && this.audioWorker) {
      workerState = await this.getWorkerState();
    }

    const state: SaveState = {
      version: SAVE_STATE_VERSION,
      gameName: this.gameName,
      timestamp: Date.now(),
      m68k: this.m68000.getState(),
      z80: this.z80.getState(),
      workRam: bufToB64(this.bus.getWorkRam()),
      vram: bufToB64(this.bus.getVram()),
      cpsaRegs: bufToB64(this.bus.getCpsaRegisters()),
      cpsbRegs: bufToB64(this.bus.getCpsbRegisters()),
      ioPorts: bufToB64(this.bus.getIoPorts()),
      coinCtrl: bufToB64(this.bus.getCoinCtrl()),
      z80WorkRam: bufToB64(this.z80Bus.getWorkRam()),
      z80Bus: this.z80Bus.getSerialState(),
      oki: this.oki6295?.getState() ?? null,
      objBuffer: this.video ? bufToB64(this.video.getObjBuffer()) : '',
      frameCount: this.frameCount,
      audioWorkerState: workerState,
    };

    return saveToSlot(slot, state);
  }

  /** Request the audio worker's internal state. */
  private getWorkerState(): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const prev = this.audioWorker!.onmessage;
      this.audioWorker!.onmessage = (e) => {
        if (e.data.type === 'state') {
          this.audioWorker!.onmessage = prev;
          resolve(e.data.state as Record<string, unknown>);
        }
      };
      this.audioWorker!.postMessage({ type: 'getState' });
    });
  }

  /** Load emulator state from a localStorage slot. */
  loadState(slot: number): boolean {
    const state = loadFromSlot(slot);
    if (!state) return false;
    if (state.gameName !== this.gameName) {
      console.warn(`Save state is for ${state.gameName}, current game is ${this.gameName}`);
      return false;
    }

    // Restore CPUs
    this.m68000.setState(state.m68k);
    this.z80.setState(state.z80);

    // Restore memory
    this.bus.getWorkRam().set(b64ToBuf(state.workRam));
    this.bus.getVram().set(b64ToBuf(state.vram));
    this.bus.getCpsaRegisters().set(b64ToBuf(state.cpsaRegs));
    this.bus.getCpsbRegisters().set(b64ToBuf(state.cpsbRegs));
    this.bus.getIoPorts().set(b64ToBuf(state.ioPorts));
    this.bus.getCoinCtrl().set(b64ToBuf(state.coinCtrl));
    this.z80Bus.getWorkRam().set(b64ToBuf(state.z80WorkRam));
    this.z80Bus.setSerialState(state.z80Bus);

    // Restore OKI
    if (state.oki && this.oki6295) {
      this.oki6295.setState(state.oki);
    }

    // Restore video sprite buffer
    if (state.objBuffer && this.video) {
      this.video.setObjBuffer(b64ToBuf(state.objBuffer));
    }

    // Restore frame count
    this.frameCount = state.frameCount;

    // Restore audio worker state (Z80 + Z80Bus RAM + OKI)
    if (this.audioWorkerReady && this.audioWorker) {
      if (state.audioWorkerState) {
        this.audioWorker.postMessage({ type: 'setState', state: state.audioWorkerState });
      } else {
        this.audioWorker.postMessage({ type: 'reset' });
      }
    }

    return true;
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
  suspendAudio(): void {
    this.audioOutput.suspend();
    this.audioWorker?.postMessage({ type: 'suspend' });
  }

  /** Resume audio (e.g. when unpaused). */
  resumeAudio(): void {
    this.audioOutput.resume();
    this.audioWorker?.postMessage({ type: 'resume' });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.stop();
    this.input.destroy();
    this.audioOutput.suspend();
    this.qsound?.destroy();
  }

  // ── Private: main loop ────────────────────────────────────────────────────

  private prevRafTime = 0;
  private frameDebt = 0; // accumulated time debt in ms
  private scheduleFrame(): void {
    if (!this.running || this.paused) return;
    this.animFrameId = requestAnimationFrame((ts) => {
      const elapsed = this.prevRafTime > 0 ? ts - this.prevRafTime : FRAME_MS;
      this.prevRafTime = ts;

      // Frame rate limiter: run exactly at CPS1 native rate (~59.637 Hz).
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

  getFrameCount(): number {
    return this.frameCount;
  }

  getRenderer(): RendererInterface {
    return this.renderer;
  }

  getFramebuffer(): Uint8Array {
    return this.framebuffer;
  }

  getFpsDisplay(): number {
    return this.fpsDisplay;
  }

  getVizReader(): VizReader | null {
    return this.vizReader;
  }

  isAudioWorkerActive(): boolean {
    return this.audioWorkerReady;
  }

  private m68kErrorCount = 0;
  private z80ErrorCount = 0;
  private fpsFrames = 0;
  private fpsLastTime = 0;
  private fpsDisplay = 0;

  private runOneFrame(): void {
    this.input.updateBusPorts(this.bus.getIoPorts(), this.bus.getCpsbRegisters());
    this.runCpuFrame();
    this.generateAudio();
    this.frameCount++;
    this.updateFps();
    this.renderFrame();
  }

  /** Run M68000 + Z80 (QSound interleaved) for one frame with scanline-accurate VBlank. */
  private runCpuFrame(): void {
    let m68kCycles = 0;
    try {
      for (let scanline = 0; scanline < CPS_VTOTAL; scanline++) {
        if (scanline === CPS_VBLANK_LINE) {
          if (this.video) this.video.bufferSprites();
          if (this._vblankCallback) this._vblankCallback();
          this.m68000.assertInterrupt(VBLANK_IRQ_LEVEL);
        }

        const targetCycles = m68kCycles + M68K_CYCLES_PER_SCANLINE;
        while (m68kCycles < targetCycles) {
          m68kCycles += this.m68000.step();
        }

        // QSound: interleave Z80 per scanline so shared RAM is visible in real-time
        if (this.isQSound) {
          let z80Done = 0;
          try {
            while (z80Done < Z80_CYCLES_PER_SCANLINE) {
              const cyc = this.z80.step();
              z80Done += cyc;
              this.qsIrqAccum += cyc;
              if (this.qsIrqAccum >= Z80_CYCLES_PER_IRQ_QS) {
                this.qsIrqAccum -= Z80_CYCLES_PER_IRQ_QS;
                this.z80.requestInterrupt();
              }
            }
          } catch (e) {
            this.z80ErrorCount++;
            if (this.z80ErrorCount <= 5 || this.z80ErrorCount % 600 === 0) {
              console.error(`Z80 error #${this.z80ErrorCount} at frame ${this.frameCount}:`, e);
            }
          }
        }
      }
    } catch (e) {
      this.m68kErrorCount++;
      if (this.m68kErrorCount <= 5 || this.m68kErrorCount % 600 === 0) {
        console.error(`M68000 error #${this.m68kErrorCount} at frame ${this.frameCount}:`, e);
      }
    }
  }

  /** Create audio worker for off-main-thread standard audio processing. */
  private async initAudioWorker(audioRom: Uint8Array, okiRom: Uint8Array): Promise<void> {
    if (typeof Worker === 'undefined') return;

    // Ensure audio is initialized so the SAB exists
    await this.audioOutput.init();
    const sab = this.audioOutput.getSAB();
    if (!sab) return; // No SAB = no SharedArrayBuffer support, skip worker

    try {
      this.audioWorker = new Worker(
        new URL('./audio/audio-worker.ts', import.meta.url),
        { type: 'module' },
      );

      // Wait for 'ready' from worker
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Audio worker init timeout'));
        }, 10000);

        this.audioWorker!.onmessage = (e) => {
          if (e.data.type === 'ready') {
            clearTimeout(timeout);
            this.audioWorkerReady = true;
            console.log('Audio worker ready — Z80+YM2151+OKI running off main thread');
            resolve();
          }
        };

        this.audioWorker!.onerror = (e) => {
          clearTimeout(timeout);
          console.warn('Audio worker error, falling back to main thread:', e.message);
          this.terminateAudioWorker();
          resolve(); // Don't reject — fallback to inline
        };

        // Send init with Transferable buffers (zero-copy)
        const audioRomCopy = audioRom.slice();
        const okiRomCopy = okiRom.slice();
        // Allocate visualization SharedArrayBuffer
        this.vizSab = new SharedArrayBuffer(VIZ_SAB_SIZE);
        this.vizReader = new VizReader(this.vizSab);

        this.audioWorker!.postMessage(
          {
            type: 'init',
            audioRom: audioRomCopy.buffer,
            okiRom: okiRomCopy.buffer,
            sab,
            vizSab: this.vizSab,
            sampleRate: this.audioOutput.getSampleRate(),
          },
          [audioRomCopy.buffer, okiRomCopy.buffer],
        );
      });
    } catch (e) {
      console.warn('Audio worker creation failed, using main thread:', e);
      this.terminateAudioWorker();
    }
  }

  /** Flush accumulated sound latches to the audio worker. */
  private flushSoundLatches(): void {
    if (!this.audioWorkerReady || !this.audioWorker) return;
    if (this.pendingSoundLatches.length === 0 && this.pendingSoundLatches2.length === 0) return;

    this.audioWorker.postMessage({
      type: 'latch',
      latches: this.pendingSoundLatches.splice(0),
      latches2: this.pendingSoundLatches2.length > 0
        ? this.pendingSoundLatches2.splice(0)
        : undefined,
    });
  }

  /** Terminate the audio worker and reset state. */
  private terminateAudioWorker(): void {
    if (this.audioWorker) {
      this.audioWorker.postMessage({ type: 'terminate' });
      this.audioWorker.terminate();
      this.audioWorker = null;
    }
    this.audioWorkerReady = false;
    this.pendingSoundLatches.length = 0;
    this.pendingSoundLatches2.length = 0;
  }

  /** Generate audio samples for one frame (QSound or standard YM2151+OKI path). */
  private generateAudio(): void {
    if (this.isQSound) {
      if (this.qsound && this.audioOutput.isInitialized()) {
        this.qsound.generateSamples(this.qsBufferL, this.qsBufferR, QS_SAMPLES_PER_FRAME);
        this.audioOutput.pushQSoundSamples(this.qsBufferL, this.qsBufferR, QS_SAMPLES_PER_FRAME);
      }
      return;
    }

    // Audio worker runs autonomously — just flush pending latches
    if (this.audioWorkerReady) {
      this.flushSoundLatches();
      return;
    }

    // Fallback: inline processing (worker not available)
    this.z80Bus.advanceSoundLatch();
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

    this.ym2151.generateSamples(this.ymBufferL, this.ymBufferR, YM_SAMPLES_PER_FRAME);
    let okiSamplesThisFrame = 0;
    if (this.oki6295 !== null) {
      okiSamplesThisFrame = OKI_SAMPLES_PER_FRAME;
      this.oki6295.generateSamples(this.okiBuffer, okiSamplesThisFrame);
    }
    if (this.audioOutput.isInitialized()) {
      this.audioOutput.pushEmulatorSamples(
        this.ymBufferL, this.ymBufferR, YM_SAMPLES_PER_FRAME,
        this.okiBuffer, okiSamplesThisFrame,
      );
    }
  }

  private updateFps(): void {
    const now = performance.now();
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 1000) {
      this.fpsDisplay = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }
  }

  private renderFrame(): void {
    if (this._customRenderCallback) {
      this._customRenderCallback();
      return;
    }
    if (this.video) {
      this.video.renderFrame(this.framebuffer);
    }
    this.renderer.render(this.framebuffer);
    this.renderer.drawText(`${this.fpsDisplay} FPS`, 384 - 60, 12);
  }
}
