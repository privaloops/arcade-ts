import { describe, it, expect } from "vitest";
import {
  computeScale,
  computeOutputSize,
  isTateGame,
  crtFilterCss,
  CPS1_RESOLUTION,
  NEOGEO_RESOLUTION,
  NATIVE_RESOLUTION,
} from "./scaling";

const VIEWPORT_1080P = { width: 1920, height: 1080 };
const VIEWPORT_720P = { width: 1280, height: 720 };

describe("computeScale — integer mode (default)", () => {
  it("CPS-1 at 1080p → ×4", () => {
    expect(computeScale(CPS1_RESOLUTION, VIEWPORT_1080P)).toBe(4);
  });

  it("Neo-Geo at 1080p → ×4", () => {
    // Neo-Geo: 320×224; max integer fit is floor(min(1920/320, 1080/224)) = floor(min(6, 4.82)) = 4
    expect(computeScale(NEOGEO_RESOLUTION, VIEWPORT_1080P)).toBe(4);
  });

  it("CPS-1 at 720p → ×3", () => {
    expect(computeScale(CPS1_RESOLUTION, VIEWPORT_720P)).toBe(3);
  });

  it("clamps to ×1 minimum even on a tiny viewport", () => {
    expect(computeScale(CPS1_RESOLUTION, { width: 100, height: 100 })).toBe(1);
  });

  it("invalid viewport (0 width) → ×1 fallback", () => {
    expect(computeScale(CPS1_RESOLUTION, { width: 0, height: 0 })).toBe(1);
  });
});

describe("computeScale — non-integer", () => {
  it("returns a float that maximises the fit", () => {
    const factor = computeScale(CPS1_RESOLUTION, VIEWPORT_1080P, { integer: false });
    // 1080 / 224 ≈ 4.821… (vertical is the tighter axis)
    expect(factor).toBeCloseTo(4.821, 2);
  });
});

describe("computeOutputSize", () => {
  it("CPS-1 at 1080p × integer → 1536×896", () => {
    expect(computeOutputSize(CPS1_RESOLUTION, VIEWPORT_1080P)).toEqual({ width: 1536, height: 896 });
  });

  it("Neo-Geo at 1080p × integer → 1280×896", () => {
    expect(computeOutputSize(NEOGEO_RESOLUTION, VIEWPORT_1080P)).toEqual({ width: 1280, height: 896 });
  });

  it("non-integer mode returns precise floats", () => {
    const size = computeOutputSize(CPS1_RESOLUTION, VIEWPORT_1080P, { integer: false });
    expect(size.height).toBe(1080);
  });
});

describe("NATIVE_RESOLUTION lookup", () => {
  it("cps1 → 384×224", () => {
    expect(NATIVE_RESOLUTION.cps1).toEqual({ width: 384, height: 224 });
  });
  it("neogeo → 320×224", () => {
    expect(NATIVE_RESOLUTION.neogeo).toEqual({ width: 320, height: 224 });
  });
});

describe("isTateGame", () => {
  it("recognises 1941 and its clones", () => {
    expect(isTateGame("1941")).toBe(true);
    expect(isTateGame("1941j")).toBe(true);
    expect(isTateGame("1941u")).toBe(true);
  });

  it("recognises varth + clones", () => {
    expect(isTateGame("varth")).toBe(true);
    expect(isTateGame("varthj")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isTateGame("MeRcS")).toBe(true);
  });

  it("rejects horizontal titles", () => {
    expect(isTateGame("sf2")).toBe(false);
    expect(isTateGame("mslug")).toBe(false);
    expect(isTateGame("ffight")).toBe(false);
  });
});

describe("crtFilterCss", () => {
  it("returns a CSS filter string containing saturate() and contrast()", () => {
    const css = crtFilterCss();
    expect(css).toMatch(/saturate\(/);
    expect(css).toMatch(/contrast\(/);
  });

  it("scanlineOpacity=0 produces neutral values (1x saturate, 1x contrast)", () => {
    const css = crtFilterCss({ scanlineOpacity: 0 });
    expect(css).toBe("saturate(1) contrast(1)");
  });

  it("scanlineOpacity=1 bumps both saturate + contrast above 1", () => {
    const css = crtFilterCss({ scanlineOpacity: 1 });
    // saturate: 1 + 0.15 = 1.15; contrast: 1 + 0.1 = 1.1
    expect(css).toBe("saturate(1.15) contrast(1.1)");
  });

  it("clamps scanlineOpacity outside [0, 1]", () => {
    expect(crtFilterCss({ scanlineOpacity: 5 })).toBe("saturate(1.15) contrast(1.1)");
    expect(crtFilterCss({ scanlineOpacity: -1 })).toBe("saturate(1) contrast(1)");
  });
});
