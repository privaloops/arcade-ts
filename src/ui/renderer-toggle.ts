/**
 * Renderer toggle — switch between Canvas 2D / WebGL2 and DOM renderers.
 */

import type { Emulator } from "../emulator";
import { FrameStateExtractor } from "../video/frame-state";
import { SpriteSheetManager } from "../video/sprite-sheet";
import { GameScreen } from "../video/GameScreen";

export interface RendererToggleDeps {
  emulator: Emulator;
  canvas: HTMLCanvasElement;
  domScreen: HTMLDivElement;
  getGameScreen(): GameScreen | null;
  setGameScreen(gs: GameScreen | null): void;
  setStatus(msg: string): void;
}

export function getRendererMode(): "canvas" | "dom" {
  const checked = document.querySelector<HTMLInputElement>('input[name="renderer"]:checked');
  return checked?.value === "dom" ? "dom" : "canvas";
}

export function setupDomRenderer(deps: RendererToggleDeps): void {
  const { emulator, domScreen, getGameScreen, setGameScreen } = deps;
  const videoConfig = emulator.getVideoConfig();
  const video = emulator.getVideo();
  if (!videoConfig || !video) return;

  // Destroy previous DOM renderer if any
  const prev = getGameScreen();
  if (prev) {
    prev.destroy();
    setGameScreen(null);
  }
  domScreen.innerHTML = "";

  const bufs = emulator.getBusBuffers();
  const sheets = new SpriteSheetManager(videoConfig.graphicsRom);
  const extractor = new FrameStateExtractor(
    bufs.vram, bufs.cpsaRegs, bufs.cpsbRegs,
    { layerControl: videoConfig.layerCtrlOffset, paletteControl: 0x30, priority: [0,0,0,0],
      layerEnableMask: [videoConfig.enableScroll1, videoConfig.enableScroll2, videoConfig.enableScroll3, 0, 0],
      idOffset: -1, idValue: 0 },
    { ranges: videoConfig.mapperTable, bankSizes: videoConfig.bankSizes },
  );
  const gs = new GameScreen(domScreen);
  gs.setComponents(video, extractor, sheets, bufs.vram);
  setGameScreen(gs);
  emulator.setVblankCallback(() => extractor.bufferSprites());
  emulator.setRenderCallback(() => { getGameScreen()?.updateFrame(); });
}

export function initRendererToggle(deps: RendererToggleDeps): void {
  const { emulator, canvas, domScreen, getGameScreen, setStatus } = deps;

  document.querySelectorAll<HTMLInputElement>('input[name="renderer"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (!emulator.isRunning()) return;
      const mode = getRendererMode();
      if (mode === "dom") {
        canvas.style.visibility = "hidden";
        domScreen.style.display = "block";
        if (!getGameScreen()) setupDomRenderer(deps);
        else emulator.setRenderCallback(() => { getGameScreen()?.updateFrame(); });
      } else {
        domScreen.style.display = "none";
        canvas.style.visibility = "visible";
        emulator.setVblankCallback(null);
        emulator.setRenderCallback(null);
      }
      setStatus(`Renderer: ${mode}`);
    });
  });
}
