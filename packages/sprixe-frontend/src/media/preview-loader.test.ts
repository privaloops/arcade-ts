import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PreviewLoader,
  scheduleVideoFade,
  DEFAULT_CROSSFADE_DELAY_MS,
} from "./preview-loader";
import { MediaCache } from "./media-cache";

function makeBlob(contents: string): Blob {
  return new Blob([contents], { type: "image/png" });
}

let cacheCounter = 0;
function freshCache(): MediaCache {
  cacheCounter += 1;
  return new MediaCache(`sprixe-arcade-media-test-${cacheCounter}`);
}

describe("PreviewLoader", () => {
  const CDN = "https://cdn.sprixe.app/media";

  describe("URL builders", () => {
    it("screenshotUrl joins system + id + screenshot.png", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      expect(loader.screenshotUrl("sf2", "cps1")).toBe(
        "https://cdn.sprixe.app/media/cps1/sf2/screenshot.png",
      );
    });

    it("videoUrl joins system + id + video.mp4", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      expect(loader.videoUrl("mslug", "neogeo")).toBe(
        "https://cdn.sprixe.app/media/neogeo/mslug/video.mp4",
      );
    });

    it("marqueeUrl joins system + id + marquee.png", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      expect(loader.marqueeUrl("sf2", "cps1")).toBe(
        "https://cdn.sprixe.app/media/cps1/sf2/marquee.png",
      );
    });

    it("trailing slash on cdnBase is stripped", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN + "/" });
      expect(loader.screenshotUrl("sf2", "cps1")).toBe(
        "https://cdn.sprixe.app/media/cps1/sf2/screenshot.png",
      );
    });

    it("cacheKey follows media:{gameId}:{kind}", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      expect(loader.cacheKey("sf2", "screenshot")).toBe("media:sf2:screenshot");
      expect(loader.cacheKey("mslug", "video")).toBe("media:mslug:video");
    });
  });

  describe("cascades", () => {
    it("screenshotCandidates lists operator CDN first, then ArcadeDB", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      const urls = loader.screenshotCandidates("sf2", "cps1");
      expect(urls).toEqual([
        "https://cdn.sprixe.app/media/cps1/sf2/screenshot.png",
        "https://adb.arcadeitalia.net/media/mame.current/ingames/sf2.png",
      ]);
    });

    it("marqueeCandidates lists operator CDN first, then ArcadeDB", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      const urls = loader.marqueeCandidates("mslug", "neogeo");
      expect(urls).toEqual([
        "https://cdn.sprixe.app/media/neogeo/mslug/marquee.png",
        "https://adb.arcadeitalia.net/media/mame.current/marquees/mslug.png",
      ]);
    });

    it("videoCandidates lists operator CDN first, then ArcadeDB", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      const urls = loader.videoCandidates("kof97", "neogeo");
      expect(urls).toEqual([
        "https://cdn.sprixe.app/media/neogeo/kof97/video.mp4",
        "https://adb.arcadeitalia.net/media/mame.current/videos/kof97.mp4",
      ]);
    });
  });

  describe("generateMarqueeUrl", () => {
    it("delegates to the generator and persists the blob to cache", async () => {
      const blob = makeBlob("generated");
      const marqueeGenImpl = vi.fn(async () => blob);
      const cache = freshCache();
      const loader = new PreviewLoader({ cache, cdnBase: CDN, marqueeGenImpl });

      const url = await loader.generateMarqueeUrl("sf2", "Street Fighter II");
      expect(url).not.toBeNull();
      expect(marqueeGenImpl).toHaveBeenCalledWith("Street Fighter II");

      // Confirm the blob was persisted — skip the cache-hit URL check
      // because fake-indexeddb unwraps Blobs into plain Objects that
      // URL.createObjectURL rejects.
      const cached = await cache.get("media:sf2:marquee");
      expect(cached).not.toBeNull();
    });

    it("returns null when the generator itself yields null", async () => {
      const marqueeGenImpl = vi.fn(async () => null);
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN, marqueeGenImpl });
      expect(await loader.generateMarqueeUrl("sf2", "Street Fighter II")).toBeNull();
    });
  });
});

describe("scheduleVideoFade", () => {
  let timers: { setTimeout: (cb: () => void, ms: number) => number; clearTimeout: (id: number) => void; fire: (id: number) => void };

  beforeEach(() => {
    const pending = new Map<number, () => void>();
    let idGen = 0;
    timers = {
      setTimeout: (cb) => {
        const id = ++idGen;
        pending.set(id, cb);
        return id;
      },
      clearTimeout: (id) => { pending.delete(id); },
      fire: (id) => {
        const cb = pending.get(id);
        if (cb) { pending.delete(id); cb(); }
      },
    };
  });

  it("fires the callback after the specified delay", () => {
    const cb = vi.fn();
    scheduleVideoFade(1000, cb, {
      setTimeout: timers.setTimeout as unknown as typeof setTimeout,
      clearTimeout: timers.clearTimeout as unknown as typeof clearTimeout,
    });
    expect(cb).not.toHaveBeenCalled();
    timers.fire(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("returns a cancel that prevents firing", () => {
    const cb = vi.fn();
    const cancel = scheduleVideoFade(1000, cb, {
      setTimeout: timers.setTimeout as unknown as typeof setTimeout,
      clearTimeout: timers.clearTimeout as unknown as typeof clearTimeout,
    });
    cancel();
    timers.fire(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it("default delay constant is 1000 ms", () => {
    expect(DEFAULT_CROSSFADE_DELAY_MS).toBe(1000);
  });
});
