/**
 * ScreenScraper response parser — offline script helper (§3.10 + §4.3).
 *
 * Pulls media URLs out of the ScreenScraper JSON response so the
 * cdn-upload pipeline (run once per release) can mirror screenshots
 * + MP4 clips onto sprixe.app's CDN without the runtime frontend
 * ever hitting ScreenScraper itself.
 *
 * Lives under `src/scripts/` so the repo's existing Vitest config
 * picks up the unit tests without a second workspace config.
 *
 * Response shape approximation (the real API returns more fields;
 * we only need the media URLs):
 *
 *   {
 *     "response": {
 *       "jeu": {
 *         "id": "3",
 *         "noms": { ... },
 *         "dates": [ { "region": "wor", "text": "1991" } ],
 *         "developpeur": { "text": "Capcom" },
 *         "medias": [
 *           { "type": "ss",          "url": "https://…/ss.png" },
 *           { "type": "video",       "url": "https://…/demo.mp4" }
 *         ]
 *       }
 *     }
 *   }
 *
 * Types are intentionally permissive — ScreenScraper adds fields and
 * renames them over time, so the parser tolerates unknown structure.
 */

export interface ScraperResult {
  title: string | null;
  year: string | null;
  publisher: string | null;
  screenshotUrl: string | null;
  videoUrl: string | null;
}

/** Known ScreenScraper media `type` values for the two assets we mirror. */
export const SCREENSHOT_MEDIA_TYPES = new Set(["ss", "mixrbv1", "mixrbv2", "screenshot"]);
export const VIDEO_MEDIA_TYPES = new Set(["video", "video-normalized"]);

/**
 * Resolve the best screenshot + video URLs from a raw ScreenScraper
 * response object. Missing fields become null so the caller can
 * either skip the game or use fallback art.
 */
export function parseScreenScraperResponse(response: unknown): ScraperResult {
  const empty: ScraperResult = {
    title: null,
    year: null,
    publisher: null,
    screenshotUrl: null,
    videoUrl: null,
  };
  if (!response || typeof response !== "object") return empty;

  const jeu = pickPath(response, ["response", "jeu"]);
  if (!jeu || typeof jeu !== "object") return empty;

  const noms = (jeu as Record<string, unknown>).noms;
  const publisher = pickString(jeu, ["developpeur", "text"]);
  const year = pickYear(jeu);
  const title = pickTitle(noms);
  const medias = (jeu as Record<string, unknown>).medias;

  let screenshotUrl: string | null = null;
  let videoUrl: string | null = null;
  if (Array.isArray(medias)) {
    for (const m of medias as Array<Record<string, unknown>>) {
      const t = typeof m.type === "string" ? m.type : null;
      const url = typeof m.url === "string" ? m.url : null;
      if (!t || !url) continue;
      if (!screenshotUrl && SCREENSHOT_MEDIA_TYPES.has(t)) screenshotUrl = url;
      if (!videoUrl && VIDEO_MEDIA_TYPES.has(t)) videoUrl = url;
    }
  }

  return { title, year, publisher, screenshotUrl, videoUrl };
}

function pickPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function pickString(obj: unknown, path: string[]): string | null {
  const v = pickPath(obj, path);
  return typeof v === "string" ? v : null;
}

function pickYear(jeu: unknown): string | null {
  const dates = (jeu as { dates?: unknown }).dates;
  if (!Array.isArray(dates)) return null;
  const preferred = ["wor", "us", "eu", "jp"];
  const rows = dates as Array<Record<string, unknown>>;
  for (const region of preferred) {
    for (const row of rows) {
      if (row.region === region && typeof row.text === "string") {
        return extractYear(row.text);
      }
    }
  }
  // Fall back to the first date of any region.
  for (const row of rows) {
    if (typeof row.text === "string") return extractYear(row.text);
  }
  return null;
}

function extractYear(text: string): string | null {
  const m = text.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : null;
}

function pickTitle(noms: unknown): string | null {
  if (!noms) return null;
  if (typeof noms === "string") return noms;
  if (Array.isArray(noms)) {
    for (const entry of noms) {
      if (entry && typeof (entry as Record<string, unknown>).text === "string") {
        return (entry as { text: string }).text;
      }
    }
  }
  if (typeof noms === "object") {
    const text = (noms as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return null;
}
