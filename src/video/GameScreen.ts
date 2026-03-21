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
import type { CPS1Video } from './cps1-video';

import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../constants';
const MAX_SPRITES = 256;
const LAYER_OBJ = 0;

export class GameScreen {
  private readonly root: HTMLDivElement;
  private readonly canvasBehind: HTMLCanvasElement;
  private readonly ctxBehind: CanvasRenderingContext2D;
  private readonly canvasFront: HTMLCanvasElement;
  private readonly ctxFront: CanvasRenderingContext2D;
  private readonly spritePool: HTMLDivElement[] = [];
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
      width: ${SCREEN_WIDTH * scale}px;
      height: ${SCREEN_HEIGHT * scale}px;
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
      top: 0; left: 0;
      transform: scale(${scale});
      transform-origin: top left;
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
      div.style.cssText = 'position:absolute;width:16px;height:16px;background-size:16px 16px;image-rendering:pixelated;display:none;';
      spriteContainer.appendChild(div);
      this.spritePool.push(div);
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

      const tileUrl = isMulti
        ? sheets.getMultiTileUrl(sprite.code, sprite.nx, sprite.ny, sprite.palette, vram, paletteBase)
        : sheets.getTileUrl(sprite.code, 16, sprite.palette, vram, paletteBase);

      if (!tileUrl) {
        if (div.style.display !== 'none') div.style.display = 'none';
        continue;
      }

      const w = sprite.nx * 16;
      const h = sprite.ny * 16;
      if (div.offsetWidth !== w) {
        div.style.width = w + 'px';
        div.style.backgroundSize = w + 'px ' + h + 'px';
      }
      if (div.offsetHeight !== h) {
        div.style.height = h + 'px';
      }

      div.style.left = sprite.screenX + 'px';
      div.style.top = sprite.screenY + 'px';

      const bgUrl = `url(${tileUrl})`;
      if (div.style.backgroundImage !== bgUrl) {
        div.style.backgroundImage = bgUrl;
      }

      let transform = '';
      if (sprite.flipX && sprite.flipY) transform = 'scaleX(-1) scaleY(-1)';
      else if (sprite.flipX) transform = 'scaleX(-1)';
      else if (sprite.flipY) transform = 'scaleY(-1)';
      if (div.style.transform !== transform) {
        div.style.transform = transform;
      }

      div.dataset['sprite'] = `code:${sprite.code} pal:${sprite.palette}${isMulti ? ` ${sprite.nx}x${sprite.ny}` : ''}`;

      if (div.style.display === 'none') div.style.display = '';
    }
  }

  resize(width: number, height: number): void {
    const scaleX = width / SCREEN_WIDTH;
    const scaleY = height / SCREEN_HEIGHT;
    const s = Math.min(scaleX, scaleY);

    this.root.style.width = width + 'px';
    this.root.style.height = height + 'px';

    const scaledW = SCREEN_WIDTH * s;
    const scaledH = SCREEN_HEIGHT * s;
    this.inner.style.transform = `scale(${s})`;
    this.inner.style.left = Math.floor((width - scaledW) / 2) + 'px';
    this.inner.style.top = Math.floor((height - scaledH) / 2) + 'px';
  }

  resetSize(scale: number = 2): void {
    this.scale = scale;
    this.root.style.width = SCREEN_WIDTH * scale + 'px';
    this.root.style.height = SCREEN_HEIGHT * scale + 'px';
    this.inner.style.transform = `scale(${scale})`;
    this.inner.style.left = '0px';
    this.inner.style.top = '0px';
  }

  destroy(): void {
    this.root.remove();
  }
}
