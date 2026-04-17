/**
 * DOM Game Screen — vanilla TypeScript, zero frameworks
 *
 * Respects CPS-B layer ordering: scroll layers can be behind AND in front
 * of sprites. Two canvases sandwich the sprite div pool:
 *
 *   [canvas: scroll layers BEHIND sprites]  z-index: 0
 *   [div pool: sprites]                     z-index: 1
 *   [canvas: scroll layers IN FRONT]        z-index: 2
 *
 * 60fps. No virtual DOM. Direct style assignments.
 */

import type { FrameStateExtractor } from './frame-state';
import type { SpriteSheetManager } from './sprite-sheet';
import type { CPS1Video } from '@sprixe/engine/video/cps1-video';

import { SCREEN_WIDTH, SCREEN_HEIGHT } from '@sprixe/engine/constants';
const MAX_SPRITES = 256;
const LAYER_OBJ = 0;

export class GameScreen {
  private readonly root: HTMLDivElement;
  private readonly canvasBehind: HTMLCanvasElement;
  private readonly ctxBehind: CanvasRenderingContext2D;
  private readonly canvasFront: HTMLCanvasElement;
  private readonly ctxFront: CanvasRenderingContext2D;
  private readonly spritePool: HTMLDivElement[] = [];
  private readonly spriteCanvases: HTMLCanvasElement[] = [];
  private readonly spriteCtxs: CanvasRenderingContext2D[] = [];
  private readonly fbBehind: Uint8Array;
  private readonly fbFront: Uint8Array;
  private readonly imgBehind: ImageData;
  private readonly imgFront: ImageData;

  private video: CPS1Video | null = null;
  private extractor: FrameStateExtractor | null = null;
  private sheets: SpriteSheetManager | null = null;
  private vram: Uint8Array | null = null;

  private readonly inner: HTMLDivElement;
  private scale: number;

  constructor(parent: HTMLElement, scale: number = 2) {
    this.scale = scale;

    this.root = document.createElement('div');
    this.root.style.cssText = `
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      background: #000;
      image-rendering: pixelated;
    `;

    this.inner = document.createElement('div');
    this.inner.style.cssText = `
      width: ${SCREEN_WIDTH}px;
      height: ${SCREEN_HEIGHT}px;
      position: absolute;
      inset: 0;
      margin: auto;
      transform-origin: center;
      scale: 1;
    `;

    // Canvas for scroll layers BEHIND sprites
    this.canvasBehind = document.createElement('canvas');
    this.canvasBehind.width = SCREEN_WIDTH;
    this.canvasBehind.height = SCREEN_HEIGHT;
    this.canvasBehind.style.cssText = 'position:absolute;inset:0;z-index:0;image-rendering:pixelated;';
    this.ctxBehind = this.canvasBehind.getContext('2d')!;
    this.fbBehind = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
    this.imgBehind = new ImageData(
      new Uint8ClampedArray(this.fbBehind.buffer as ArrayBuffer),
      SCREEN_WIDTH, SCREEN_HEIGHT,
    );

    // Sprite container
    const spriteContainer = document.createElement('div');
    spriteContainer.style.cssText = 'position:absolute;inset:0;z-index:1;';

    for (let i = 0; i < MAX_SPRITES; i++) {
      const div = document.createElement('div');
      div.style.cssText = 'position:absolute;display:none;image-rendering:pixelated;';
      const cvs = document.createElement('canvas');
      cvs.width = 16;
      cvs.height = 16;
      cvs.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;';
      div.appendChild(cvs);
      spriteContainer.appendChild(div);
      this.spritePool.push(div);
      this.spriteCanvases.push(cvs);
      this.spriteCtxs.push(cvs.getContext('2d')!);
    }

    // Canvas for scroll layers IN FRONT of sprites
    this.canvasFront = document.createElement('canvas');
    this.canvasFront.width = SCREEN_WIDTH;
    this.canvasFront.height = SCREEN_HEIGHT;
    this.canvasFront.style.cssText = 'position:absolute;inset:0;z-index:2;image-rendering:pixelated;pointer-events:none;';
    this.ctxFront = this.canvasFront.getContext('2d')!;
    this.fbFront = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
    this.imgFront = new ImageData(
      new Uint8ClampedArray(this.fbFront.buffer as ArrayBuffer),
      SCREEN_WIDTH, SCREEN_HEIGHT,
    );

    this.inner.appendChild(this.canvasBehind);
    this.inner.appendChild(spriteContainer);
    this.inner.appendChild(this.canvasFront);
    this.root.appendChild(this.inner);
    parent.appendChild(this.root);

    // Auto-resize when parent changes size (fullscreen, window resize, etc.)
    new ResizeObserver(() => this.resize()).observe(this.root);
  }

  setComponents(
    video: CPS1Video,
    extractor: FrameStateExtractor,
    sheets: SpriteSheetManager,
    vram: Uint8Array,
  ): void {
    this.video = video;
    this.extractor = extractor;
    this.sheets = sheets;
    this.vram = vram;
  }

  getElement(): HTMLDivElement {
    return this.root;
  }

  updateFrame(): void {
    if (!this.video || !this.extractor || !this.sheets || !this.vram) return;

    const frame = this.extractor.extractFrame();
    const layerOrder = frame.layerOrder;

    // Find where sprites sit in the layer order
    const spriteSlot = layerOrder.indexOf(LAYER_OBJ);

    // Layers before sprites → behind canvas
    const behindIds = layerOrder.slice(0, spriteSlot).filter(id => id !== LAYER_OBJ);
    // Layers after sprites → front canvas
    const frontIds = layerOrder.slice(spriteSlot + 1).filter(id => id !== LAYER_OBJ);

    // Render behind layers
    this.video.renderScrollLayers(behindIds, this.fbBehind);
    this.ctxBehind.putImageData(this.imgBehind, 0, 0);

    // Render front layers
    if (frontIds.length > 0) {
      this.video.renderScrollLayers(frontIds, this.fbFront);
      this.ctxFront.putImageData(this.imgFront, 0, 0);
      this.canvasFront.style.display = '';
    } else {
      this.canvasFront.style.display = 'none';
    }

    // Update sprite divs
    const sprites = frame.sprites;
    const paletteBase = frame.paletteBase;
    const sheets = this.sheets;
    const vram = this.vram;

    for (let i = 0; i < MAX_SPRITES; i++) {
      const div = this.spritePool[i]!;

      if (i >= sprites.length) {
        if (div.style.display !== 'none') div.style.display = 'none';
        continue;
      }

      const sprite = sprites[i]!;
      const isMulti = sprite.nx > 1 || sprite.ny > 1;

      const imgData = isMulti
        ? sheets.getMultiTileImageData(sprite.code, sprite.nx, sprite.ny, sprite.palette, vram, paletteBase)
        : sheets.getTileImageData(sprite.code, 16, sprite.palette, vram, paletteBase);

      if (!imgData) {
        if (div.style.display !== 'none') div.style.display = 'none';
        continue;
      }

      const w = sprite.nx * 16;
      const h = sprite.ny * 16;
      const cvs = this.spriteCanvases[i]!;
      const ctx = this.spriteCtxs[i]!;

      // Resize canvas if sprite dimensions changed
      if (cvs.width !== w || cvs.height !== h) {
        cvs.width = w;
        cvs.height = h;
        div.style.width = w + 'px';
        div.style.height = h + 'px';
      }

      ctx.putImageData(imgData, 0, 0);

      div.style.left = sprite.screenX + 'px';
      div.style.top = sprite.screenY + 'px';

      let transform = '';
      if (sprite.flipX && sprite.flipY) transform = 'scaleX(-1) scaleY(-1)';
      else if (sprite.flipX) transform = 'scaleX(-1)';
      else if (sprite.flipY) transform = 'scaleY(-1)';
      if (div.style.transform !== transform) {
        div.style.transform = transform;
      }

      if (div.style.display === 'none') div.style.display = '';
    }
  }

  resize(_width?: number, _height?: number): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.scale = Math.min(w / SCREEN_WIDTH, h / SCREEN_HEIGHT);
    this.inner.style.scale = String(this.scale);
  }

  destroy(): void {
    this.root.remove();
  }
}
