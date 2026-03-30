/**
 * Layer Model — data types for the layer group system.
 * No DOM, no side effects.
 */

import type { CapturedPose } from './sprite-analyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSpriteGroup(
  name: string,
  poses: CapturedPose[],
  palette: number,
): LayerGroup {
  return {
    type: 'sprite',
    name,
    spriteCapture: { poses, palette, selectedPoseIndex: 0 },
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
  };
}
