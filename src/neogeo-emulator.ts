/**
 * Neo-Geo Emulator — Main loop
 *
 * Connects M68000, Z80, NeoGeoBus, NeoGeoVideo, Renderer and InputManager
 * into a single runnable emulation loop driven by requestAnimationFrame.
 *
 * Neo-Geo timing:
 *   Pixel clock   : 6 MHz
 *   Frame rate     : ~59.185 Hz
 *   M68000         : 12 MHz → ~202 700 cycles/frame
 *   Z80            : 4 MHz → ~67 600 cycles/frame
 *   VBlank IRQ     : level 1 on the 68000
 *   Timer IRQ      : level 2 (LSPC programmable)
 *   Coldboot IRQ   : level 3 (first frame only)
 */

import { M68000 } from './cpu/m68000';
import { Z80 } from './cpu/z80';
import { NeoGeoBus } from './memory/neogeo-bus';
import { NeoGeoZ80Bus } from './memory/neogeo-z80-bus';
import { NeoGeoVideo } from './video/neogeo-video';
import { WebGLRenderer } from './video/renderer-webgl';
import { Renderer } from './video/renderer';
import { AudioOutput } from './audio/audio-output';
import { InputManager } from './input/input';
import type { RendererInterface } from './types';
import { loadNeoGeoRomFromZip } from './memory/neogeo-rom-loader';
import type { NeoGeoRomSet } from './memory/neogeo-rom-loader';
import {
  NGO_FRAMEBUFFER_SIZE,
  NGO_M68K_CYCLES_PER_SCANLINE,
  NGO_VTOTAL,
  NGO_VBLANK_LINE,
  NGO_FRAME_RATE,
  NGO_SCREEN_WIDTH,
  NGO_SCREEN_HEIGHT,
} from './neogeo-constants';

// ── Timing ────────────────────────────────────────────────────────────────

const FRAME_MS = 1000 / NGO_FRAME_RATE;

// ── Emulator ──────────────────────────────────────────────────────────────

export class NeoGeoEmulator {
  private readonly m68000: M68000;
  private readonly z80: Z80;
  private readonly bus: NeoGeoBus;
  private readonly z80Bus: NeoGeoZ80Bus;
  private readonly video: NeoGeoVideo;
  private renderer: RendererInterface;
  private readonly canvas: HTMLCanvasElement;
  private readonly input: InputManager;
  private readonly audioOutput: AudioOutput;

  // Audio worker
  private audioWorker: Worker | null = null;
  private audioWorkerReady = false;
  private pendingSoundLatches: number[] = [];

  // Framebuffer
  private readonly framebuffer: Uint8Array;

  // State
  private running = false;
  private paused = false;
  private animFrameId = 0;
  private romLoaded = false;
  private gameName = '';
  private prevRafTime = 0;
  private frameDebt = 0;
  private frameCount = 0;
  private firstFrame = true;

  // Callbacks
  private _vblankCallback: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, renderer: RendererInterface) {
    this.bus = new NeoGeoBus();
    this.z80Bus = new NeoGeoZ80Bus();
    this.m68000 = new M68000(this.bus);
    this.z80 = new Z80(this.z80Bus);
    this.video = new NeoGeoVideo();
    this.canvas = canvas;
    this.renderer = renderer;
    this.audioOutput = new AudioOutput();
    this.input = new InputManager();
    this.framebuffer = new Uint8Array(NGO_FRAMEBUFFER_SIZE);

    // Wire sound latch: 68K → Z80
    this.bus.setSoundLatchCallback((value: number) => {
      if (this.frameCount < 5) {
        console.log(`[Neo-Geo SND] 68K→Z80 latch=0x${value.toString(16)} frame=${this.frameCount} workerReady=${this.audioWorkerReady}`);
      }
      if (this.audioWorkerReady) {
        this.pendingSoundLatches.push(value);
      } else {
        this.z80Bus.pushSoundLatch(value);
      }
    });

    // Wire Z80 sound reply → 68K
    this.z80Bus.setSoundReplyCallback((value: number) => {
      console.log(`[Neo-Geo] Z80 main-thread reply=0x${value.toString(16)}`);
      this.bus.setSoundReply(value);
    });

    // IRQ acknowledge
    this.m68000.setIrqAckCallback(() => {
      this.m68000.clearAllInterrupts();
    });
  }

  // ── Audio init (compatible with CPS1 Emulator API) ─────────────────────

  async initAudio(): Promise<void> {
    await this.audioOutput.init();
  }

  resumeAudio(): void {
    this.audioOutput.resume();
  }

  // ── ROM loading ───────────────────────────────────────────────────────────

  /** Load from a File (ZIP) — compatible with CPS1 Emulator.loadRom() API */
  async loadRomFromFile(file: File, biosFile?: File): Promise<void> {
    // Auto-fetch neogeo.zip BIOS from /roms/ if not provided
    let bios = biosFile;
    if (!bios) {
      bios = await this.fetchBios();
    }
    const romSet = await loadNeoGeoRomFromZip(file, bios);
    await this.loadRom(romSet);
  }

  /** Try to fetch neogeo.zip from the server */
  private async fetchBios(): Promise<File | undefined> {
    try {
      const resp = await fetch('/roms/neogeo.zip');
      if (!resp.ok) throw new Error(`${resp.status}`);
      const blob = await resp.blob();
      return new File([blob], 'neogeo.zip', { type: 'application/zip' });
    } catch {
      console.warn('[Neo-Geo] neogeo.zip not found at /roms/neogeo.zip — BIOS required for boot');
      return undefined;
    }
  }

  async loadRom(romSet: NeoGeoRomSet): Promise<void> {
    this.stop();
    this.frameCount = 0;
    this.prevRafTime = 0;
    this.frameDebt = 0;
    this.firstFrame = true;

    // Resize the renderer for Neo-Geo resolution (320x224)
    this.renderer.resize?.(NGO_SCREEN_WIDTH, NGO_SCREEN_HEIGHT);

    // Load ROMs into bus
    this.bus.loadProgramRom(romSet.programRom);
    this.bus.loadBiosRom(romSet.biosRom);

    // Load audio ROM
    this.z80Bus.loadAudioRom(romSet.audioRom);

    // Load video ROMs
    this.video.setRoms(romSet.spritesRom, romSet.fixedRom, romSet.biosSRom);
    // Share VRAM and palette RAM between bus and video
    this.video.setVram(this.bus.getVram());
    this.video.setPaletteRam(this.bus.getPaletteRam());

    this.gameName = romSet.name;
    this.romLoaded = true;

    // Initialize audio worker
    await this.initAudioWorker(romSet);

    // Reset bus and CPUs (bus must reset first — sets BIOS mode for 68K vectors)
    this.bus.resetBus();
    this.m68000.reset();
    this.z80.reset();

    console.log(`[Neo-Geo] Loaded ${romSet.name}: ${romSet.description}`);
  }

  // ── Audio worker ──────────────────────────────────────────────────────────

  private async initAudioWorker(romSet: NeoGeoRomSet): Promise<void> {
    try {
      const sab = this.audioOutput.getSAB();
      if (!sab) {
        console.warn('[Neo-Geo] SharedArrayBuffer not available, audio will be silent');
        return;
      }

      this.audioWorker = new Worker(
        new URL('./audio/neogeo-audio-worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.audioWorker.onmessage = (e) => {
        if (e.data.type === 'ready') {
          this.audioWorkerReady = true;
          console.log('[Neo-Geo] Audio worker ready');
        } else if (e.data.type === 'reply') {
          console.log(`[Neo-Geo] Z80 reply=0x${e.data.value.toString(16)}`);
          this.bus.setSoundReply(e.data.value);
        } else if (e.data.type === 'z80debug') {
          console.log(`[Neo-Geo] Worker Z80 PC=0x${e.data.pc.toString(16)} at frame ${e.data.frame}`);
        }
      };

      this.audioWorker.postMessage({
        type: 'init',
        audioRom: romSet.audioRom.buffer,
        voiceRom: romSet.voiceRom.buffer,
        sab,
        sampleRate: this.audioOutput.getSampleRate(),
      });
    } catch (err) {
      console.warn('[Neo-Geo] Audio worker init failed:', err);
    }
  }

  // ── Frame loop ────────────────────────────────────────────────────────────

  start(): void {
    if (this.running || !this.romLoaded) return;
    this.running = true;
    this.prevRafTime = 0;
    this.frameDebt = 0;
    this.audioOutput.resume();
    this.animFrameId = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.audioOutput.suspend();
  }

  pause(): void { this.paused = !this.paused; }
  isPaused(): boolean { return this.paused; }
  isRunning(): boolean { return this.running; }

  setVblankCallback(cb: () => void): void { this._vblankCallback = cb; }

  private onFrame = (timestamp: number): void => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.onFrame);

    if (this.paused) return;

    // Debt-based frame scheduling
    if (this.prevRafTime === 0) {
      this.prevRafTime = timestamp;
      this.frameDebt = FRAME_MS; // Run at least one frame
    } else {
      this.frameDebt += timestamp - this.prevRafTime;
    }
    this.prevRafTime = timestamp;

    // Cap to avoid spiral of death
    if (this.frameDebt > FRAME_MS * 3) this.frameDebt = FRAME_MS * 3;

    while (this.frameDebt >= FRAME_MS) {
      this.frameDebt -= FRAME_MS;
      this.runOneFrame();
    }

    // Render
    this.video.renderFrame(this.framebuffer);
    this.renderer.render(this.framebuffer);
  };

  private runOneFrame(): void {
    // Update input ports
    this.updateInputPorts();

    // Flush sound latches to worker
    if (this.audioWorkerReady && this.audioWorker && this.pendingSoundLatches.length > 0) {
      for (const latch of this.pendingSoundLatches) {
        this.audioWorker.postMessage({ type: 'latch', value: latch });
      }
      this.pendingSoundLatches.length = 0;
    }

    // Run scanlines
    for (let scanline = 0; scanline < NGO_VTOTAL; scanline++) {
      this.bus.setScanline(scanline);

      // VBlank at line 224
      if (scanline === NGO_VBLANK_LINE) {
        this.video.markPaletteDirty();
        this.video.tickAutoAnim();
        this.bus.assertIrq(1); // IRQ1 = VBlank

        this._vblankCallback?.();
      }

      // Coldboot IRQ on first frame
      if (this.firstFrame && scanline === 0) {
        this.bus.assertIrq(3); // IRQ3 = coldboot
      }

      // Timer tick
      this.bus.tickTimer();

      // Synthetic Z80 reply: toggle bit 6 every 8 scanlines to unblock BIOS handshake.
      // The 68K tight-loops polling 0x320001 — it needs to see a 0→1 transition within a frame.
      if (this.frameCount < 300 && (scanline & 7) === 0) {
        this.bus.setSoundReply((scanline & 8) ? 0x40 : 0x00);
      }

      // Check pending IRQs — don't auto-acknowledge; the BIOS/game
      // clears IRQs by writing to the LSPC control register (0x3C000C)
      const irqLevel = this.bus.getPendingIrq();
      if (irqLevel > 0) {
        this.m68000.assertInterrupt(irqLevel);
      }

      // Run 68000 for one scanline
      let cyclesLeft = NGO_M68K_CYCLES_PER_SCANLINE;
      while (cyclesLeft > 0) {
        try {
          const ran = this.m68000.step();
          cyclesLeft -= ran;
        } catch {
          cyclesLeft = 0;
        }
      }

      // Run Z80 on main thread when audio worker isn't ready yet.
      if (!this.audioWorkerReady && scanline === 0 && this.frameCount < 3) {
        console.log(`[Neo-Geo] Z80 main-thread running, frame=${this.frameCount}`);
      }
      if (!this.audioWorkerReady) {
        let z80Cycles = 256;
        while (z80Cycles > 0) {
          if (this.z80Bus.shouldFireNmi()) {
            this.z80.nmi();
          }
          z80Cycles -= this.z80.step();
        }
      }
    }

    this.firstFrame = false;
    this.frameCount++;
  }

  // ── Input mapping ─────────────────────────────────────────────────────────

  private updateInputPorts(): void {
    // Neo-Geo uses same active LOW convention as CPS1.
    // InputManager.readPort() returns bytes with pressed buttons as 0.
    // Port 0 = P1 low (directions + buttons 1-3), Port 1 = P1 high (buttons 4-6)
    // Port 2 = P2 low, Port 3 = P2 high, Port 4 = system (coins, starts)

    // P1: directions + A/B/C from port 0, D from port 1 bit 4
    const p1Lo = this.input.readPort(0);
    const p1Hi = this.input.readPort(1);
    // Map CPS1 6-button layout to Neo-Geo 4-button:
    // port 0 bits: 0=up, 1=down, 2=left, 3=right, 4=btn1(A), 5=btn2(B), 6=btn3(C)
    // Neo-Geo P1: 0=up, 1=down, 2=left, 3=right, 4=A, 5=B, 6=C, 7=D
    const p1 = (p1Lo & 0x7F) | ((p1Hi & 0x10) ? 0x80 : 0); // D from btn4
    this.bus.setPortP1(p1);

    const p2Lo = this.input.readPort(2);
    const p2Hi = this.input.readPort(3);
    const p2 = (p2Lo & 0x7F) | ((p2Hi & 0x10) ? 0x80 : 0);
    this.bus.setPortP2(p2);

    // System: coin/start
    const sys = this.input.readPort(4);
    this.bus.setPortSystem(sys);
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  getBus(): NeoGeoBus { return this.bus; }
  getVideo(): NeoGeoVideo { return this.video; }
  getM68000(): M68000 { return this.m68000; }
  getFrameCount(): number { return this.frameCount; }
  getGameName(): string { return this.gameName; }
  /** Stub for CPS1 API compatibility — Neo-Geo has no DIP switches in I/O ports */
  getIoPorts(): Uint8Array { return new Uint8Array(0x20).fill(0xFF); }
}
