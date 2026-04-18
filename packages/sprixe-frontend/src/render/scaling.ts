/**
 * scaling — pure helpers for arcade display scaling (§2.8 + §4.2).
 *
 * Native arcade resolutions:
 *   CPS-1  — 384×224
 *   Neo-Geo — 320×224
 *
 * At 1080p (1920×1080) with integer scaling:
 *   CPS-1  → ×4 (1536×896)
 *   Neo-Geo → ×4 (1280×896)  (old spec said ×3; ×4 fits in 1080p)
 *
 * Non-integer scaling picks the maximum fractional factor that fits;
 * the caller wraps the canvas with aspect-ratio CSS if they want
 * 4:3 vs 16:9 letterboxing.
 *
 * TATE detection is a hand-curated list of vertical arcade titles;
 * heuristic based on the game id. When Phase 4.3 lands the CDN
 * metadata, we'll swap the list for a data-driven check.
 */

import type { GameEntry } from "../data/games";

export interface Resolution {
  width: number;
  height: number;
}

export const CPS1_RESOLUTION: Resolution = { width: 384, height: 224 };
export const NEOGEO_RESOLUTION: Resolution = { width: 320, height: 224 };

export const NATIVE_RESOLUTION: Record<GameEntry["system"], Resolution> = {
  cps1: CPS1_RESOLUTION,
  neogeo: NEOGEO_RESOLUTION,
};

export interface ScaleOptions {
  integer?: boolean;
}

/**
 * Compute the scale factor that fits `source` inside `viewport`
 * with the largest magnification that still fits on both axes.
 * When `options.integer` is true (default), the result is floored
 * to the nearest whole number; otherwise it's a float.
 */
export function computeScale(
  source: Resolution,
  viewport: Resolution,
  options: ScaleOptions = {}
): number {
  const useInteger = options.integer ?? true;
  const horizontal = viewport.width / source.width;
  const vertical = viewport.height / source.height;
  const fit = Math.min(horizontal, vertical);
  if (!isFinite(fit) || fit <= 0) return 1;
  return useInteger ? Math.max(1, Math.floor(fit)) : fit;
}

/**
 * Scaled output size for the canvas. Integer mode wraps computeScale.
 * Useful for Settings > Display preview + the playing screen renderer.
 */
export function computeOutputSize(
  source: Resolution,
  viewport: Resolution,
  options: ScaleOptions = {}
): Resolution {
  const factor = computeScale(source, viewport, options);
  return { width: source.width * factor, height: source.height * factor };
}

/**
 * Titles that shipped on vertical cabinets. TATE mode rotates the
 * canvas 90° so a vertical monitor displays the game upright.
 *
 * List sourced from MAME's cps1.cpp + neogeo.cpp screen attributes;
 * add to it as new vertical titles ship.
 */
const TATE_GAME_IDS = new Set<string>([
  "1941",
  "1941j",
  "1941r1",
  "1941u",
  "varth",
  "varthj",
  "varthr1",
  "varthu",
  "19xx",
  "mercs",
  "mercsj",
  "mercsu",
  "unsquad",
  "area88",
]);

export function isTateGame(id: string): boolean {
  return TATE_GAME_IDS.has(id.toLowerCase());
}

export interface CrtFilterOptions {
  scanlineOpacity?: number; // 0..1
}

/**
 * CSS `filter` string for a minimal CRT look. Consumers apply the
 * return value directly to a canvas wrapper element. Phase 5 swaps
 * this for a WebGL shader on the RPi; the CSS path keeps the preview
 * functional on every renderer in the meantime.
 */
export function crtFilterCss(options: CrtFilterOptions = {}): string {
  const opacity = clamp(options.scanlineOpacity ?? 0.5, 0, 1);
  // saturate + contrast bring back the punchy look of a CRT tube;
  // the opacity is later combined with a scanline overlay pseudo-
  // element (that element is added in the runtime theme, not here).
  return `saturate(${1 + opacity * 0.15}) contrast(${1 + opacity * 0.1})`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
