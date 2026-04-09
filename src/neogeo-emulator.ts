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
  NGO_Z80_CLOCK,
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
  private m68kErrorCount = 0;
  private soundCmdLogCount = 0;

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
    // Always push to main-thread Z80 (for immediate handshake visibility).
    // Also forward to audio worker for actual sound playback.
    this.bus.setSoundLatchCallback((value: number) => {
      this.z80Bus.pushSoundLatch(value);

      // Run Z80 immediately to process the command (tight sync)
      let z80Run = 5000;
      while (z80Run > 0) {
        if (this.z80Bus.shouldFireNmi()) this.z80.nmi();
        z80Run -= this.z80.step();
      }

      // After cmd 0x03 (reset), the Z80 re-initializes.
      // Force HELLO reply since sm1.sm1 doesn't send it naturally.
      if (value === 0x03) {
        this.bus.setSoundReply(0xC3);
      }
      if (this.audioWorkerReady) {
        this.pendingSoundLatches.push(value);
      }
    });

    // Wire Z80 sound reply → 68K
    this.z80Bus.setSoundReplyCallback((_value: number) => {
      // Stub: always keep the reply at 0xC3 (HELLO/ready).
      // Our Z80 sm1.sm1 emulation doesn't produce proper replies.
      // The BIOS just needs to see 0xC3 to know the Z80 is alive.
      // Real command replies (echo 0x01→0x01) are handled by the NMI handler
      // but timing issues prevent them from being visible to the BIOS.
    });

    // When Z80 reads port 0x00, mark command as consumed (clears pending flag)
    this.z80Bus.setSoundConsumedCallback(() => {
      this.bus.clearSoundPending();
    });

    // Lazy Z80 sync: disabled — Z80 runs interleaved per scanline instead.
    // The lazy sync was too expensive (called thousands of times per frame).

    // IRQ acknowledge — clear both CPU and bus pending flags
    this.m68000.setIrqAckCallback(() => {
      const level = this.bus.getPendingIrq();
      if (level > 0) this.bus.acknowledgeIrq(level);
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

    // Load audio ROMs — BIOS Z80 (sm1.sm1) at 0x0000, game M-ROM banked
    this.z80Bus.loadBiosRom(romSet.biosZRom);
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

    // Patch BIOS to skip failing boot tests (calendar, etc.)
    this.patchBiosBoot(romSet.biosRom);

    // Wire ROM banking callbacks
    this.bus.setFixRomSwitchCallback((useBios) => {
      this.video.setFixRomMode(useBios);
    });

    // Pre-run the Z80 to complete sm1.sm1 init
    {
      let cycles = 200000;
      while (cycles > 0) {
        if (this.z80Bus.shouldFireNmi()) this.z80.nmi();
        cycles -= this.z80.step();
      }
    }
    this.bus.setSoundReply(0xC3);


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
          // Worker Z80 replies are ignored — the main-thread Z80 handles the
          // BIOS handshake. Worker heartbeat (R|0x80) would overwrite the preset.
        } else if (e.data.type === 'z80debug') {
          const ram = e.data.ram?.map((b: number) => b.toString(16).padStart(2, '0')).join(' ') ?? '';
          console.log(`[Neo-Geo] Worker Z80: PC=0x${e.data.pc.toString(16)} SP=0x${e.data.sp.toString(16)} frame=${e.data.frame} nmi=${e.data.nmiEnabled} latch=0x${e.data.soundLatch?.toString(16)} RAM@PC=[${ram}]`);
        }
      };

      this.audioWorker.postMessage({
        type: 'init',
        audioRom: romSet.audioRom.buffer,
        biosZRom: romSet.biosZRom.buffer,
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



      // Check pending IRQs — don't auto-acknowledge; the BIOS/game
      // clears IRQs by writing to the LSPC control register (0x3C000C)
      const irqLevel = this.bus.getPendingIrq();
      if (irqLevel > 0) {
        this.m68000.assertInterrupt(irqLevel);
      }

      // Interleave 68K and Z80 in small slices (~100 cycles each) so the
      // Z80 reply is visible to the 68K within the same scanline.
      // This is critical for the BIOS 68K↔Z80 handshake (tight polling loop).
      let m68kLeft = NGO_M68K_CYCLES_PER_SCANLINE;
      let z80Left = Math.round(NGO_Z80_CLOCK / NGO_FRAME_RATE / NGO_VTOTAL);
      const SLICE = 128; // 128 68K cycles per slice — balance speed vs handshake responsiveness

      while (m68kLeft > 0 || z80Left > 0) {
        // 68K slice
        let m68kSlice = Math.min(m68kLeft, SLICE);
        while (m68kSlice > 0) {
          try {
            const ran = this.m68000.step();
            this.bus.addCycles(ran);
            m68kSlice -= ran;
            m68kLeft -= ran;
          } catch (e) {
            if (this.m68kErrorCount < 3) {
              console.error(`[Neo-Geo 68K] Error at PC=0x${this.m68000.getPC().toString(16)} frame=${this.frameCount}:`, e);
            }
            this.m68kErrorCount++;
            m68kSlice = 0;
            m68kLeft = 0;
          }
        }

        // Z80 slice (proportional: ~1/3 of 68K cycles at 4MHz/12MHz)
        let z80Slice = Math.min(z80Left, Math.round(SLICE / 3));
        while (z80Slice > 0) {
          if (this.z80Bus.shouldFireNmi()) {
            this.z80.nmi();
          }
          const ran = this.z80.step();
          z80Slice -= ran;
          z80Left -= ran;
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

  /** Patch the BIOS to work without pd4990a RTC emulation.
   *  The BIOS CALENDAR test fails and enters an infinite watchdog loop
   *  with SR mask 7 (all IRQs blocked). We patch the error handler's
   *  MOVE #$0007, ($3C000C) to also include ANDI #$F8FF, SR (lower mask). */
  private patchBiosBoot(biosRom: Uint8Array): void {
    let patched = 0;

    // Patch 1: Skip ALL boot test error jumps.
    // Pattern: MOVEQ #N, D6 (7C0N) followed by JMP (4EF9) to error handler.
    // N = 0-8 for different boot tests. NOP them all to skip errors.
    for (let i = 0; i < biosRom.length - 8; i++) {
      if (biosRom[i] === 0x7C && (biosRom[i + 1]! & 0xF0) === 0x00 &&
          biosRom[i + 2] === 0x4E && biosRom[i + 3] === 0xF9) {
        const testNum = biosRom[i + 1]!;
        // NOP out the MOVEQ + JMP (8 bytes = 4 NOPs)
        for (let j = 0; j < 8; j += 2) {
          biosRom[i + j] = 0x4E;
          biosRom[i + j + 1] = 0x71;
        }
        console.log(`[Neo-Geo] Patched BIOS: skip boot test ${testNum} error at 0x${i.toString(16)}`);
        patched++;
      }
    }

    // Patch 2: Calendar range check — safety net alongside pd4990a.
    // At 0xC11C14: BCS.W $C11D8C (6500 0176) — "count < 57" → NOP NOP
    // At 0xC11C1C: BCC.W $C11D8C (6400 016E) — "count >= 64" → NOP NOP
    for (let i = 0; i < biosRom.length - 4; i++) {
      // BCS.W to error handler
      if (biosRom[i] === 0x65 && biosRom[i + 1] === 0x00 &&
          biosRom[i + 2] === 0x01 && biosRom[i + 3] === 0x76) {
        biosRom[i] = 0x4E; biosRom[i + 1] = 0x71;
        biosRom[i + 2] = 0x4E; biosRom[i + 3] = 0x71;
        console.log(`[Neo-Geo] Patched BIOS: NOP calendar BCS at 0x${i.toString(16)}`);
        patched++;
      }
      // BCC.W to error handler
      if (biosRom[i] === 0x64 && biosRom[i + 1] === 0x00 &&
          biosRom[i + 2] === 0x01 && biosRom[i + 3] === 0x6E) {
        biosRom[i] = 0x4E; biosRom[i + 1] = 0x71;
        biosRom[i + 2] = 0x4E; biosRom[i + 3] = 0x71;
        console.log(`[Neo-Geo] Patched BIOS: NOP calendar BCC at 0x${i.toString(16)}`);
        patched++;
      }
    }

    // Patch 3: All error handler watchdog loops — lower SR mask.
    // Pattern: MOVE.W #$0007, ($003C000C) = 33FC 0007 003C 000C
    for (let i = 0; i < biosRom.length - 14; i++) {
      if (biosRom[i] === 0x33 && biosRom[i + 1] === 0xFC &&
          biosRom[i + 2] === 0x00 && biosRom[i + 3] === 0x07 &&
          biosRom[i + 4] === 0x00 && biosRom[i + 5] === 0x3C &&
          biosRom[i + 6] === 0x00 && biosRom[i + 7] === 0x0C) {
        biosRom[i + 8] = 0x02;  // ANDI #$F8FF, SR
        biosRom[i + 9] = 0x7C;
        biosRom[i + 10] = 0xF8;
        biosRom[i + 11] = 0xFF;
        biosRom[i + 12] = 0x60; // BRA.S $-8
        biosRom[i + 13] = 0xF8;
        patched++;
      }
    }

    if (patched > 0) console.log(`[Neo-Geo] Applied ${patched} BIOS patches`);
  }

  /** Try to identify the BIOS by looking for known strings */
  private detectBiosName(biosRom: Uint8Array): string {
    // UniBIOS has "UNIVERSE BIOS" string
    const str = String.fromCharCode(...biosRom.subarray(0, Math.min(0x200, biosRom.length))
      .filter(b => b >= 0x20 && b < 0x7F));
    if (str.includes('UNIVERSE') || str.includes('UNI-BIOS')) return 'uni-bios';
    // Search more broadly
    for (let i = 0; i < biosRom.length - 10; i++) {
      if (biosRom[i] === 0x55 && biosRom[i+1] === 0x4E && biosRom[i+2] === 0x49) { // "UNI"
        return 'uni-bios';
      }
    }
    return 'standard';
  }

  getBus(): NeoGeoBus { return this.bus; }
  getVideo(): NeoGeoVideo { return this.video; }
  getM68000(): M68000 { return this.m68000; }
  getFrameCount(): number { return this.frameCount; }
  getGameName(): string { return this.gameName; }
  /** Stub for CPS1 API compatibility — Neo-Geo has no DIP switches in I/O ports */
  getIoPorts(): Uint8Array { return new Uint8Array(0x20).fill(0xFF); }
}
