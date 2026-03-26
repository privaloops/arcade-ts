/**
 * Layer Model — pure data types for the multi-layer photo system.
 * No DOM, no side effects.
 */

import type { CapturedPose } from './sprite-analyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhotoLayer {
  id: string;
  name: string;
  rgbaData: ImageData;       // current RGBA (may be resized)
  rgbaOriginal: ImageData;   // original full-res for lossless resize
  pixels: Uint8Array;        // palette indices (filled after quantize)
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  quantized: boolean;
  visible: boolean;
}

export interface LayerGroup {
  type: 'scroll' | 'sprite';
  name: string;
  /** CPS1 layer id (LAYER_SCROLL1/2/3) — for scroll groups */
  layerId?: number;
  /** Sprite capture data — for sprite groups */
  spriteCapture?: {
    poses: CapturedPose[];
    palette: number;
    selectedPoseIndex: number;
  };
  layers: PhotoLayer[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let nextId = 0;

export function createLayer(
  name: string,
  rgba: ImageData,
  offsetX: number,
  offsetY: number,
): PhotoLayer {
  return {
    id: `layer-${nextId++}`,
    name,
    rgbaData: rgba,
    rgbaOriginal: new ImageData(
      new Uint8ClampedArray(rgba.data),
      rgba.width,
      rgba.height,
    ),
    pixels: new Uint8Array(rgba.width * rgba.height),
    width: rgba.width,
    height: rgba.height,
    offsetX,
    offsetY,
    quantized: false,
    visible: true,
  };
}

export function createSpriteGroup(
  name: string,
  poses: CapturedPose[],
  palette: number,
): LayerGroup {
  return {
    type: 'sprite',
    name,
    spriteCapture: { poses, palette, selectedPoseIndex: 0 },
    layers: [],
  };
}

export function createScrollGroup(
  name: string,
  layerId: number,
): LayerGroup {
  return {
    type: 'scroll',
    name,
    layerId,
    layers: [],
  };
}
