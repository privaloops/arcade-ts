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
import {
  getProtectionType, Kof98Protection, kof98Decrypt68k,
  MslugxProtection, SmaProtection, smaDecrypt68k,
} from './memory/neogeo-protection';
import { CMC42_KEYS, CMC50_KEYS, CMC_SFIX_SIZES, CMC_SFIX_DEFAULT, CMC_FIX_BANK_TYPE, FixBankType, cmcGfxDecrypt, cmcSfixDecrypt } from './memory/neogeo-cmc';
import { initYM2610Wasm, YM2610Wasm } from './audio/ym2610-wasm';
import { InputManager } from './input/input';
import { VizReader, VIZ_SAB_SIZE } from './audio/audio-viz';
import type { RendererInterface } from './types';
import { loadNeoGeoRomFromZip } from './memory/neogeo-rom-loader';
import type { NeoGeoRomSet } from './memory/neogeo-rom-loader';
import {
  NGO_FRAMEBUFFER_SIZE,
  NGO_M68K_CYCLES_PER_SCANLINE,
  NGO_Z80_CLOCK,
  NGO_YM2610_CLOCK,
  NGO_VTOTAL,
  NGO_VBLANK_LINE,
  NGO_FRAME_RATE,
  NGO_SCREEN_WIDTH,
  NGO_SCREEN_HEIGHT,
} from './neogeo-constants';

// ── Timing ────────────────────────────────────────────────────────────────

const FRAME_MS = 1000 / NGO_FRAME_RATE;
const YM_CLOCK_RATIO = NGO_YM2610_CLOCK / NGO_Z80_CLOCK; // 8 MHz / 4 MHz = 2
// Z80 cycles to run when processing a sound command handshake
const Z80_HANDSHAKE_BURST = 10_000;
// Z80 cycles to pre-run during ROM load (sm1.sm1 init sequence)
const Z80_PRERUN_CYCLES = 500_000;

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

  // Audio visualization
  private vizSab: SharedArrayBuffer | null = null;
  private vizReader: VizReader | null = null;

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
  private fpsFrames = 0;
  private fpsLastTime = 0;
  private fpsDisplay = 0;
  private voiceRom: Uint8Array | null = null;
  private audioRom: Uint8Array | null = null;
  private adpcmASize = 0;
  private biosZRom: Uint8Array | null = null;
  private scannedSamples: { startByte: number; endByte: number; type: 'A' | 'B' }[] = [];
  private mainYm2610: YM2610Wasm | null = null;

  // Callbacks
  private _vblankCallback: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: RendererInterface,
    options: { latencyHint?: AudioContextLatencyCategory } = {}
  ) {
    this.bus = new NeoGeoBus();
    this.z80Bus = new NeoGeoZ80Bus();
    this.m68000 = new M68000(this.bus);
    this.z80 = new Z80(this.z80Bus);
    this.video = new NeoGeoVideo();
    this.canvas = canvas;
    this.renderer = renderer;
    this.audioOutput = new AudioOutput({
      ...(options.latencyHint ? { latencyHint: options.latencyHint } : {}),
    });
    this.input = new InputManager();
    this.framebuffer = new Uint8Array(NGO_FRAMEBUFFER_SIZE);

    // Wire sound latch: 68K → Z80
    // Always push to main-thread Z80 (for immediate handshake visibility).
    // Also forward to audio worker for actual sound playback.
    this.bus.setSoundLatchCallback((value: number) => {
      this.z80Bus.pushSoundLatch(value);

      // Run Z80 to process the command via NMI
      let z80Run = Z80_HANDSHAKE_BURST;
      while (z80Run > 0) {
        if (this.z80Bus.shouldFireNmi()) this.z80.nmi();
        z80Run -= this.z80.step();
      }

      // Force known BIOS handshake replies (Z80 may not have had enough
      // cycles to process them during the 10k burst above)
      if (value === 0x03) {
        this.bus.setSoundReply(0xC3); // Reset → HELLO
      } else if (value === 0x01) {
        this.bus.setSoundReply(0x01); // Slot switch echo
      }
      if (this.audioWorkerReady) {
        this.pendingSoundLatches.push(value);
      }
    });

    // Wire Z80 sound reply → 68K (port 0x0C writes propagate to 68K bus)
    this.z80Bus.setSoundReplyCallback((value: number) => {
      this.bus.setSoundReply(value);
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

  suspendAudio(): void {
    this.audioOutput.suspend();
    if (this.audioWorker) this.audioWorker.postMessage({ type: 'suspend' });
  }

  resumeAudio(): void {
    this.audioOutput.resume();
    if (this.audioWorker) this.audioWorker.postMessage({ type: 'resume' });
  }

  /** Master volume 0.0 .. 1.0 (mirrors CPS-1 Emulator.setVolume). */
  setVolume(level: number): void {
    this.audioOutput.setVolume(level);
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

  /**
   * Load a Neo-Geo ROM from an ArrayBuffer — used by the arcade frontend
   * which reads ROMs out of IndexedDB. `biosData` is optional; if omitted,
   * the neogeo.zip BIOS is auto-fetched from the dev server (same path
   * resolution as loadRomFromFile).
   */
  async loadRomFromBuffer(data: ArrayBuffer, biosData?: ArrayBuffer): Promise<void> {
    let bios: File | ArrayBuffer | undefined = biosData;
    if (!bios) {
      bios = await this.fetchBios();
    }
    const romSet = await loadNeoGeoRomFromZip(data, bios);
    await this.loadRom(romSet);
  }

  /** Try to fetch neogeo.zip from the server (checks neogeo/ subfolder first, then root) */
  private async fetchBios(): Promise<File | undefined> {
    for (const path of ['/roms/neogeo/neogeo.zip', '/roms/neogeo.zip']) {
      try {
        const resp = await fetch(path);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        return new File([blob], 'neogeo.zip', { type: 'application/zip' });
      } catch { /* try next */ }
    }
    console.warn('[Neo-Geo] neogeo.zip not found — BIOS required for boot');
    return undefined;
  }

  async loadRom(romSet: NeoGeoRomSet): Promise<void> {
    this.stop();
    this.frameCount = 0;
    this.prevRafTime = 0;
    this.frameDebt = 0;
    this.firstFrame = true;

    // Resize the renderer for Neo-Geo resolution (320x224)
    this.renderer.resize?.(NGO_SCREEN_WIDTH, NGO_SCREEN_HEIGHT);

    // Apply game-specific protection (ROM decrypt + runtime handler)
    const protType = getProtectionType(romSet.name);
    if (protType === 'kof98') {
      const defaults = kof98Decrypt68k(romSet.programRom, romSet.programRom.length);
      const prot = new Kof98Protection();
      prot.setDefaultRom(defaults[0], defaults[1]);
      this.bus.setProtection(prot);
      console.log(`[Neo-Geo] KOF98 protection: P-ROM decrypted, runtime overlay active`);
    } else if (protType === 'mslugx') {
      const prot = new MslugxProtection((addr) => this.bus.read16(addr));
      this.bus.setProtection(prot);
      console.log(`[Neo-Geo] MSLUGX protection: bit counter active`);
    } else if (protType === 'sma') {
      smaDecrypt68k(romSet.programRom, romSet.name);
      const prot = new SmaProtection(
        romSet.name,
        (offset) => { this.bus.setPRomBankOffset(offset); },
      );
      this.bus.setProtection(prot);
      console.log(`[Neo-Geo] SMA protection: P-ROM decrypted, bankswitch + RNG active`);
    } else {
      this.bus.setProtection(null);
    }

    // CMC GFX decryption — applies to C-ROM (sprites) + S-ROM (fix layer)
    // SMA games also need CMC (they have both P-ROM and C-ROM encryption)
    // CMC games extract their S-ROM (fix tiles) from the end of the C-ROM.
    // Size varies per game (128KB–512KB), from MAME neogeo.xml "fixed" region.
    const cmcKey42 = CMC42_KEYS[romSet.name];
    const cmcKey50 = CMC50_KEYS[romSet.name];
    if ((cmcKey42 !== undefined || cmcKey50 !== undefined) && romSet.fixedRom.length === 0) {
      const sfixSize = CMC_SFIX_SIZES[romSet.name] ?? CMC_SFIX_DEFAULT;
      romSet.fixedRom = new Uint8Array(sfixSize);
    }
    if (cmcKey42 !== undefined) {
      console.log(`[Neo-Geo] CMC42 GFX decrypt (key=0x${cmcKey42.toString(16)}): ${romSet.spritesRom.length / 1024 / 1024}MB`);
      cmcGfxDecrypt(romSet.spritesRom, romSet.spritesRom.length, cmcKey42, false);
      cmcSfixDecrypt(romSet.spritesRom, romSet.spritesRom.length, romSet.fixedRom, romSet.fixedRom.length);
      console.log(`[Neo-Geo] CMC42 GFX + SFIX decrypt complete`);
    } else if (cmcKey50 !== undefined) {
      console.log(`[Neo-Geo] CMC50 GFX decrypt (key=0x${cmcKey50.toString(16)}): ${romSet.spritesRom.length / 1024 / 1024}MB`);
      cmcGfxDecrypt(romSet.spritesRom, romSet.spritesRom.length, cmcKey50, true);
      cmcSfixDecrypt(romSet.spritesRom, romSet.spritesRom.length, romSet.fixedRom, romSet.fixedRom.length);
      console.log(`[Neo-Geo] CMC50 GFX + SFIX decrypt complete`);
    }

    // Load ROMs into bus
    this.bus.loadProgramRom(romSet.programRom);
    this.bus.loadBiosRom(romSet.biosRom);

    // Load audio ROMs — BIOS Z80 (sm1.sm1) at 0x0000, game M-ROM banked
    this.z80Bus.loadBiosRom(romSet.biosZRom);
    this.z80Bus.loadAudioRom(romSet.audioRom);

    // Load video ROMs (including L0 shrink table for sprite scaling)
    this.video.setRoms(romSet.spritesRom, romSet.fixedRom, romSet.biosSRom, romSet.loRom);
    this.video.setFixBankType(CMC_FIX_BANK_TYPE[romSet.name] ?? FixBankType.NONE);
    // Share VRAM and palette RAM between bus and video
    this.video.setVram(this.bus.getVram());
    this.video.setPaletteRam(this.bus.getPaletteRam());
    this.video.setAutoAnimSource(() => this.bus.getAutoAnimCounter());

    this.gameName = romSet.name;
    this.romLoaded = true;
    this.voiceRom = romSet.voiceRom;
    this.audioRom = romSet.audioRom;
    this.biosZRom = romSet.biosZRom;
    this.adpcmASize = romSet.adpcmASize;

    // Initialize audio worker
    await this.initAudioWorker(romSet);

    // Configure MVS mode (arcade board) — affects BIOS boot path
    this.bus.setMvsMode(true);

    // Reset bus and CPUs
    this.bus.resetBus();

    this.m68000.reset();
    this.z80.reset();

    // Assert IRQ3 (coldboot) on first frame — MAME: m_irq3_pending = 1
    // The BIOS IRQ3 handler initializes the system on first boot.
    this.bus.assertIrq(3);


    // Watchdog reset: full soft reset when watchdog expires
    this.bus.setWatchdogResetCallback(() => {
      console.log('[Neo-Geo] Watchdog reset triggered');
      this.bus.resetBus();
      this.m68000.reset();
      this.z80.reset();
    });

    // Wire ROM banking callbacks
    this.bus.setFixRomSwitchCallback((useBios) => {
      this.video.setFixRomMode(useBios);
    });
    this.bus.setZ80RomSwitchCallback((useBios) => {
      this.z80Bus.setUseGameRom(!useBios);
      // Forward ROM switch to audio worker
      if (this.audioWorker) {
        this.audioWorker.postMessage({ type: 'rom-switch', useGameRom: !useBios });
      }
    });
    this.bus.setPaletteBankCallback((bank) => {
      this.video.setPaletteBank(bank);
    });

    // Initialize YM2610 on main thread for Z80 sound handshake
    try {
      await initYM2610Wasm();
      this.mainYm2610 = new YM2610Wasm();
      this.mainYm2610.loadVRom(romSet.voiceRom, romSet.adpcmASize);
      // Wire YM2610 to Z80 bus
      this.z80Bus.setYm2610WriteCallback((port, value) => {
        this.mainYm2610!.write(port, value);
      });
      this.z80Bus.setYm2610ReadCallback((port) => {
        return this.mainYm2610!.read(port);
      });
    } catch (e) {
      console.warn('[Neo-Geo] YM2610 main-thread init failed:', e);
    }

    // Pre-run the Z80 with YM2610 connected to complete sm1.sm1 init
    {
      let cycles = Z80_PRERUN_CYCLES;
      while (cycles > 0) {
        if (this.z80Bus.shouldFireNmi()) this.z80.nmi();
        const ran = this.z80.step();
        cycles -= ran;
        if (this.mainYm2610) {
          this.mainYm2610.clockCycles(ran * YM_CLOCK_RATIO);
          this.z80.setIrqLine(this.mainYm2610.getIrq());
        }
      }
    }


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
        } else if (e.data.type === 'samples') {
          // Merge new samples with existing ones (dedup by start:end:type key)
          const existing = new Map(this.scannedSamples.map(s => [`${s.type}:${s.startByte}:${s.endByte}`, s]));
          for (const s of e.data.samples) {
            existing.set(`${s.type}:${s.startByte}:${s.endByte}`, s);
          }
          this.scannedSamples = Array.from(existing.values()).sort((a, b) => a.startByte - b.startByte);
          console.log(`[Neo-Geo] Samples: ${this.scannedSamples.length} total`);
        } else if (e.data.type === 'error') {
          console.error('[Neo-Geo] Audio worker error:', e.data.message);
        } else if (e.data.type === 'reply') {
          // Worker replies ignored — main-thread Z80 handles BIOS handshake
        } else if (e.data.type === 'z80debug') {
          const ram = e.data.ram?.map((b: number) => b.toString(16).padStart(2, '0')).join(' ') ?? '';
          console.log(`[Neo-Geo] Worker Z80: PC=0x${e.data.pc.toString(16)} SP=0x${e.data.sp.toString(16)} frame=${e.data.frame} nmi=${e.data.nmiEnabled} latch=0x${e.data.soundLatch?.toString(16)} RAM@PC=[${ram}]`);
        }
      };

      // Allocate visualization SharedArrayBuffer
      this.vizSab = new SharedArrayBuffer(VIZ_SAB_SIZE);
      this.vizReader = new VizReader(this.vizSab);
      this.vizReader.setChannelMask(0xFFFF); // all channels audible

      this.audioWorker.postMessage({
        type: 'init',
        audioRom: romSet.audioRom.buffer,
        biosZRom: romSet.biosZRom.buffer,
        voiceRom: romSet.voiceRom.buffer,
        adpcmASize: romSet.adpcmASize,
        sab,
        vizSab: this.vizSab,
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

  pause(): void {
    if (!this.running) return;
    this.paused = true;
  }
  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    // Reset RAF timestamp so next frame doesn't include pause duration
    this.prevRafTime = 0;
  }
  isPaused(): boolean { return this.running && this.paused; }
  isRunning(): boolean { return this.running && !this.paused; }

  /** Expose the shared InputManager so the arcade frontend can
   * propagate the user's gamepad mapping (coin / start / buttons). */
  getInputManager(): InputManager { return this.input; }

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

    // Copy slice-rendered framebuffer to output
    this.video.copyFramebuffer(this.framebuffer);
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

    // Slice rendering: render visible scanlines in chunks between IRQ2 boundaries
    this.video.beginFrame();
    let sliceStart = 0;

    // Run scanlines
    for (let scanline = 0; scanline < NGO_VTOTAL; scanline++) {
      this.bus.setScanline(scanline);

      // VBlank at line 224 — flush remaining visible slice
      if (scanline === NGO_VBLANK_LINE) {
        if (sliceStart < NGO_VBLANK_LINE) {
          this.video.renderSlice(sliceStart, NGO_VBLANK_LINE);
          sliceStart = NGO_VBLANK_LINE;
        }
        this.video.markPaletteDirty();
        this.bus.tickAutoAnim();

        this.bus.assertIrq(1); // IRQ1 = VBlank

        // Watchdog: decrement each VBlank, reset system if expired
        this.bus.tickWatchdog();

        this._vblankCallback?.();
      }

      // IRQ3 (coldboot) is asserted once at loadRom() — not per-frame.

      // Timer tick — flush slice before IRQ2 handler modifies VRAM
      const timerFired = this.bus.tickTimer();
      if (timerFired && scanline < NGO_VBLANK_LINE && scanline > sliceStart) {
        this.video.renderSlice(sliceStart, scanline);
        sliceStart = scanline;
      }





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
          if (this.mainYm2610) {
            this.mainYm2610.clockCycles(ran * YM_CLOCK_RATIO);
            this.z80.setIrqLine(this.mainYm2610.getIrq());
          }
        }
      }
    }

    this.firstFrame = false;
    this.frameCount++;
    this.updateFps();
  }

  private updateFps(): void {
    const now = performance.now();
    this.fpsFrames++;
    if (this.fpsLastTime === 0) {
      // First call — initialize without emitting a value
      this.fpsLastTime = now;
      return;
    }
    if (now - this.fpsLastTime >= 1000) {
      this.fpsDisplay = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsLastTime = now;
      // Update emu-bar counter (debug panel doesn't know about Neo-Geo)
      const el = document.getElementById('frame-counter');
      if (el) el.textContent = `${this.fpsDisplay} FPS`;
    }
  }

  // ── Input mapping ─────────────────────────────────────────────────────────

  private updateInputPorts(): void {
    // CPS1 InputManager bit layout (active LOW):
    //   readPlayerLow: bit 0=Right, 1=Left, 2=Down, 3=Up, 4=Btn1(A), 5=Btn2(B), 6=Btn3(C)
    //   readPlayerHigh: bit 0=Btn4(D)
    //   readSystem: bit 0=Coin1, 1=Coin2, 4=Start1, 5=Start2
    //
    // Neo-Geo MVS port layout (active LOW):
    //   0x300001 P1: bit 0=Up, 1=Down, 2=Left, 3=Right, 4=A, 5=B, 6=C, 7=D
    //   0x340000 P2: same as P1
    //   0x340001 System: bit 0=Start1, 1=Start2, 2=Select1, 3=Select2
    //   0x380001 Coins: bit 0=Coin1, 1=Coin2, 2=Service

    // Without this tick the autofire counter stays at 0, isPressed()
    // always returns true, and the "rapid fire" just holds the button.
    this.input.tickAutofire();

    const p1Lo = this.input.readPort(0);
    const p1Hi = this.input.readPort(1);
    // Remap CPS1 directions (R/L/D/U bits 0-3) → Neo-Geo (U/D/L/R bits 0-3)
    const up1    = (p1Lo >> 3) & 1;  // CPS1 bit 3 (Up)
    const down1  = (p1Lo >> 2) & 1;  // CPS1 bit 2 (Down)
    const left1  = (p1Lo >> 1) & 1;  // CPS1 bit 1 (Left)
    const right1 = (p1Lo >> 0) & 1;  // CPS1 bit 0 (Right)
    const a1 = (p1Lo >> 4) & 1;      // Btn1 = A
    const b1 = (p1Lo >> 5) & 1;      // Btn2 = B
    const c1 = (p1Lo >> 6) & 1;      // Btn3 = C
    const d1 = (p1Hi >> 0) & 1;      // Btn4 = D
    const p1Neo = (up1) | (down1 << 1) | (left1 << 2) | (right1 << 3) |
                  (a1 << 4) | (b1 << 5) | (c1 << 6) | (d1 << 7);
    this.bus.setPortP1(p1Neo);

    const p2Lo = this.input.readPort(2);
    const p2Hi = this.input.readPort(3);
    const up2    = (p2Lo >> 3) & 1;
    const down2  = (p2Lo >> 2) & 1;
    const left2  = (p2Lo >> 1) & 1;
    const right2 = (p2Lo >> 0) & 1;
    const a2 = (p2Lo >> 4) & 1;
    const b2 = (p2Lo >> 5) & 1;
    const c2 = (p2Lo >> 6) & 1;
    const d2 = (p2Hi >> 0) & 1;
    const p2Neo = (up2) | (down2 << 1) | (left2 << 2) | (right2 << 3) |
                  (a2 << 4) | (b2 << 5) | (c2 << 6) | (d2 << 7);
    this.bus.setPortP2(p2Neo);

    // System port at 0x380000: bit0=Start1, bit1=Select1, bit2=Start2, bit3=Select2
    const sys = this.input.readPort(4);
    const start1 = (sys >> 4) & 1;  // CPS1 bit 4
    const start2 = (sys >> 5) & 1;  // CPS1 bit 5
    const sysNeo = 0xFA | start1 | (start2 << 2); // select1/2 = 1 (released)
    this.bus.setPortSystem(sysNeo);

    // Coins at 0x320001: bit0=Coin1, bit1=Coin2, bit2=Service (active LOW)
    const coin1 = (sys >> 0) & 1;   // CPS1 bit 0
    const coin2 = (sys >> 1) & 1;   // CPS1 bit 1
    const coinsNeo = 0x3C | coin1 | (coin2 << 1); // service=1, bits 3-5=1
    this.bus.setPortCoins(coinsNeo);
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  getBus(): NeoGeoBus { return this.bus; }
  getVideo(): NeoGeoVideo { return this.video; }
  getM68000(): M68000 { return this.m68000; }
  getFrameCount(): number { return this.frameCount; }
  getFpsDisplay(): number { return this.fpsDisplay; }
  getGameName(): string { return this.gameName; }
  getVizReader(): VizReader | null { return this.vizReader; }
  getVoiceRom(): Uint8Array | null { return this.voiceRom; }
  getAudioRom(): Uint8Array | null { return this.audioRom; }
  getAdpcmASize(): number { return this.adpcmASize; }
  getScannedSamples(): { startByte: number; endByte: number; type: 'A' | 'B' }[] { return this.scannedSamples; }

  /** Request live-captured samples from the audio worker (accumulated during gameplay) */
  requestLiveSamples(): void {
    if (this.audioWorker && this.audioWorkerReady) {
      this.audioWorker.postMessage({ type: 'get-live-samples' });
    }
  }

  /** Trigger ADPCM sample scan (sends all sound commands to Z80, captures addresses) */
  scanSamples(): void {
    if (this.audioWorker && this.audioWorkerReady && this.audioRom) {
      this.audioWorker.postMessage({
        type: 'scan-samples',
        audioRom: this.audioRom.buffer.slice(0),
        biosZRom: this.biosZRom?.buffer.slice(0),
        adpcmASize: this.adpcmASize,
      });
    }
  }

  /** Update V-ROM after sample replacement and sync to worker WASM */
  updateVoiceRom(offset: number, data: Uint8Array): void {
    if (!this.voiceRom) return;
    this.voiceRom.set(data, offset);
    // Sync to audio worker (worker patches WASM heap)
    if (this.audioWorker) {
      this.audioWorker.postMessage({
        type: 'patch-vrom',
        offset,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      });
    }
  }

  /** Stub for CPS1 API compatibility — Neo-Geo has no DIP switches in I/O ports */
  getIoPorts(): Uint8Array { return new Uint8Array(0x20).fill(0xFF); }
}
