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

function makeResponse(ok: boolean, blob?: Blob): Response {
  return {
    ok,
    blob: async () => blob ?? new Blob([]),
  } as unknown as Response;
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
      expect(loader.screenshotUrl("sf2", "cps1")).toBe("https://cdn.sprixe.app/media/cps1/sf2/screenshot.png");
    });

    it("videoUrl joins system + id + video.mp4", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      expect(loader.videoUrl("mslug", "neogeo")).toBe("https://cdn.sprixe.app/media/neogeo/mslug/video.mp4");
    });

    it("trailing slash on cdnBase is stripped", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN + "/" });
      expect(loader.screenshotUrl("sf2", "cps1")).toBe("https://cdn.sprixe.app/media/cps1/sf2/screenshot.png");
    });

    it("cacheKey follows media:{gameId}:{kind}", () => {
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN });
      expect(loader.cacheKey("sf2", "screenshot")).toBe("media:sf2:screenshot");
      expect(loader.cacheKey("mslug", "video")).toBe("media:mslug:video");
    });
  });

  describe("loadScreenshot — cache miss + fetch", () => {
    it("fetches from CDN, caches the blob, returns it", async () => {
      const blob = makeBlob("screenshot bytes");
      const fetchImpl = vi.fn(async () => makeResponse(true, blob)) as unknown as typeof fetch;
      const cache = freshCache();
      const loader = new PreviewLoader({ cache, cdnBase: CDN, fetchImpl });

      const result = await loader.loadScreenshot("sf2", "cps1");
      expect(result).toBe(blob);

      // Was persisted.
      const cached = await cache.get("media:sf2:screenshot");
      expect(cached).not.toBeNull();
    });

    it("returns null on 404", async () => {
      const fetchImpl = vi.fn(async () => makeResponse(false)) as unknown as typeof fetch;
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN, fetchImpl });
      expect(await loader.loadScreenshot("xyz", "cps1")).toBeNull();
    });

    it("network error → null (no throw)", async () => {
      const fetchImpl = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN, fetchImpl });
      expect(await loader.loadScreenshot("xyz", "cps1")).toBeNull();
    });
  });

  describe("loadScreenshot — cache hit", () => {
    it("returns the cached blob without fetching", async () => {
      const cache = freshCache();
      const blob = makeBlob("cached bytes");
      await cache.put("media:sf2:screenshot", blob);

      const fetchImpl = vi.fn(async () => { throw new Error("should not fetch"); }) as unknown as typeof fetch;
      const loader = new PreviewLoader({ cache, cdnBase: CDN, fetchImpl });

      const result = await loader.loadScreenshot("sf2", "cps1");
      expect(result).not.toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("hasVideo", () => {
    it("HEAD 200 → true", async () => {
      const fetchMock = vi.fn(async (_url: unknown, init?: unknown) => {
        void _url; void init;
        return makeResponse(true);
      });
      const loader = new PreviewLoader({
        cache: freshCache(),
        cdnBase: CDN,
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      expect(await loader.hasVideo("sf2", "cps1")).toBe(true);
      const call = fetchMock.mock.calls[0] as unknown as [unknown, { method: string }];
      expect(call[1].method).toBe("HEAD");
    });

    it("HEAD 404 → false", async () => {
      const fetchImpl = vi.fn(async () => makeResponse(false)) as unknown as typeof fetch;
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN, fetchImpl });
      expect(await loader.hasVideo("xyz", "cps1")).toBe(false);
    });

    it("network error → false", async () => {
      const fetchImpl = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
      const loader = new PreviewLoader({ cache: freshCache(), cdnBase: CDN, fetchImpl });
      expect(await loader.hasVideo("xyz", "cps1")).toBe(false);
    });
  });
});

describe("scheduleVideoFade", () => {
  let timers: { setTimeout: (cb: () => void, ms: number) => number; clearTimeout: (id: number) => void; fire: (id: number) => void };

  beforeEach(() => {
    const pending = new Map<number, () => void>();
    let idGen = 0;
    timers = {
      setTimeout: (cb, ms) => {
        void ms;
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
    timers.fire(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("the returned cancel handle prevents the fire", () => {
    const cb = vi.fn();
    const cancel = scheduleVideoFade(1000, cb, {
      setTimeout: timers.setTimeout as unknown as typeof setTimeout,
      clearTimeout: timers.clearTimeout as unknown as typeof clearTimeout,
    });
    cancel();
    timers.fire(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it("DEFAULT_CROSSFADE_DELAY_MS = 1000", () => {
    expect(DEFAULT_CROSSFADE_DELAY_MS).toBe(1000);
  });
});
