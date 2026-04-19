/**
 * extractDominantColor — read the vibrant dominant colour of a remote
 * image so the UI glow (marquee drop-shadow, media-pane shadow, caption
 * text-shadow) can follow the currently-selected game.
 *
 * The image is loaded a second time with `crossOrigin="anonymous"` into
 * a 32×16 canvas; we then filter out near-black / near-white / near-grey
 * pixels and return the average of what's left. When the source host
 * doesn't serve CORS headers the canvas taints and `getImageData` throws
 * — we swallow it and return null so the caller keeps the default glow.
 */

const SAMPLE_W = 32;
const SAMPLE_H = 16;

/**
 * ArcadeDB doesn't send `Access-Control-Allow-Origin`, so loading the
 * marquee with `crossOrigin="anonymous"` from a different origin taints
 * the canvas and `getImageData` throws. We route the colour probe
 * through a same-origin rewrite (`/arcadedb/...`) mirrored in the Vite
 * dev proxy and the Vercel production rewrite — no cross-origin, no
 * CORS needed. The main UI marquee keeps hitting ArcadeDB direct so the
 * proxy only serves the handful of extractor requests.
 */
const ARCADEDB_ORIGIN = "https://adb.arcadeitalia.net";
const ARCADEDB_PROXY_PATH = "/arcadedb";

function sameOriginRewrite(url: string): string {
  if (url.startsWith(ARCADEDB_ORIGIN)) {
    return ARCADEDB_PROXY_PATH + url.slice(ARCADEDB_ORIGIN.length);
  }
  return url;
}

export async function extractDominantColor(url: string): Promise<string | null> {
  if (!url) return null;
  const proxied = sameOriginRewrite(url);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_W;
        canvas.height = SAMPLE_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
        const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
        resolve(pickVibrantAverage(data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = proxied;
  });
}

function pickVibrantAverage(data: Uint8ClampedArray): string | null {
  // Pass 1 — strict: only strongly saturated mid-luminance pixels. Picks
  // the hero colour on most marquees. Pass 2 loosens the thresholds so
  // we still return *something* for pale or monochromatic images.
  return averageFiltered(data, 0.2, 0.85, 0.35)
      ?? averageFiltered(data, 0.12, 0.92, 0.15)
      ?? averageFiltered(data, 0.08, 0.95, 0);
}

function averageFiltered(
  data: Uint8ClampedArray,
  lumMin: number,
  lumMax: number,
  satMin: number,
): string | null {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i]!;
    const G = data[i + 1]!;
    const B = data[i + 2]!;
    const A = data[i + 3]!;
    if (A < 128) continue;
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const lum = (max + min) / 2 / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (lum < lumMin || lum > lumMax) continue;
    if (sat < satMin) continue;
    r += R;
    g += G;
    b += B;
    count += 1;
  }
  if (count < 4) return null;
  // Boost saturation a touch — averaging naturally washes colours out,
  // so lift the distance from the neutral axis by 1.25×.
  const ar = r / count;
  const ag = g / count;
  const ab = b / count;
  const mean = (ar + ag + ab) / 3;
  const br = Math.max(0, Math.min(255, mean + (ar - mean) * 1.25));
  const bg = Math.max(0, Math.min(255, mean + (ag - mean) * 1.25));
  const bb = Math.max(0, Math.min(255, mean + (ab - mean) * 1.25));
  return `rgb(${Math.round(br)}, ${Math.round(bg)}, ${Math.round(bb)})`;
}
