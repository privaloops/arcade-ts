import { defineConfig } from "vite";
import { resolve } from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import Anthropic from "@anthropic-ai/sdk";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8")
) as { version: string };

/** Pick the first non-internal IPv4 address on the host. Null when no LAN
 * interface is up (pure localhost). */
function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

export default defineConfig(({ command }) => ({
  root: ".",
  publicDir: "public",
  resolve: {
    alias: {
      "@sprixe/engine": resolve(__dirname, "../sprixe-engine/src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    // Bind to every interface so a phone on the same WiFi can reach
    // the kiosk via the Mac's LAN IP. The startup banner lists every
    // reachable URL (Local: + Network:).
    host: true,
    fs: {
      allow: [resolve(__dirname, "../..")],
    },
    // Same-origin proxy to ArcadeDB so the colour extractor can read
    // marquee pixels without tripping CORS (ArcadeDB doesn't send
    // Access-Control-Allow-Origin). Mirrored by the Vercel rewrite in
    // production. Regular marquee display still hits ArcadeDB direct
    // so this proxy only sees the extractor's requests.
    proxy: {
      "/arcadedb": {
        target: "https://adb.arcadeitalia.net",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/arcadedb/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  // __LAN_IP__ is baked into the bundle only in dev; production builds
  // leave it null so the QR falls back to window.location.origin.
  // __APP_VERSION__ comes from package.json so About tab + logs show a
  // real version in both dev ("0.0.0") and production builds.
  define: {
    __LAN_IP__: command === "serve" ? JSON.stringify(getLanIp()) : "null",
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    {
      name: "coop-coep",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          // `credentialless` keeps SharedArrayBuffer available (needed
          // for the audio worker's ring buffer) while letting us load
          // cross-origin images/videos from hosts that don't send
          // CORP or CORS headers (ArcadeDB, third-party marquees).
          // Credentials are stripped from those requests — fine here,
          // every remote asset we hit is public anonymous content.
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          next();
        });
      },
    },
    {
      // PreviewLoader HEAD-probes /media/{system}/{id}/video.mp4 to
      // decide whether to mount a <video>. Vite's default SPA fallback
      // would serve index.html on a miss and the probe would see 200 +
      // HTML, so we return a real 404 for any /media/* path that
      // doesn't resolve to a file on disk.
      name: "media-not-found-is-404",
      configureServer(server) {
        const publicDir = resolve(__dirname, "public");
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0];
          if (!url || !url.startsWith("/media/")) return next();
          const filePath = resolve(publicDir, url.slice(1));
          if (!filePath.startsWith(publicDir)) {
            res.statusCode = 403;
            res.end();
            return;
          }
          if (!existsSync(filePath)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          next();
        });
      },
    },
    {
      // Dev-only proxy for the AI coach. Browser POSTs its prompt
      // payload here; the server reads ANTHROPIC_API_KEY from the Node
      // process env (never shipped to the client) and streams Claude
      // Haiku token deltas back as Server-Sent Events. Production will
      // swap this for a real edge function.
      name: "coach-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url?.split("?")[0];
          if (url !== "/api/coach/generate" || req.method !== "POST") return next();

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not set in server env" }));
            return;
          }

          let body: { systemPrompt: string; userPrompt: string; maxTokens?: number };
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "invalid JSON body" }));
            return;
          }

          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          res.flushHeaders?.();

          try {
            const anthropic = new Anthropic({ apiKey });
            const stream = anthropic.messages.stream({
              model: "claude-haiku-4-5-20251001",
              max_tokens: body.maxTokens ?? 50,
              system: body.systemPrompt,
              messages: [{ role: "user", content: body.userPrompt }],
            });
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
              }
            }
            const final = await stream.finalMessage();
            res.write(`data: ${JSON.stringify({ done: true, usage: final.usage })}\n\n`);
            res.end();
          } catch (e) {
            res.write(`data: ${JSON.stringify({ error: String(e instanceof Error ? e.message : e) })}\n\n`);
            res.end();
          }
        });
      },
    },
    {
      // Dev-only proxy for ElevenLabs text-to-speech. Browser POSTs a
      // short line of text, the server reads ELEVENLABS_API_KEY from the
      // Node env (never shipped to the client) and streams back an MP3
      // audio/mpeg response. Production will swap for an edge function.
      name: "coach-tts",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const [pathname, rawQuery = ""] = (req.url ?? "").split("?");
          if (pathname !== "/api/coach/tts") return next();

          const apiKey = process.env.ELEVENLABS_API_KEY ?? process.env.XI_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "ELEVENLABS_API_KEY not set in server env" }));
            return;
          }

          // GET variant supports `new Audio('/api/coach/tts?text=...')` so
          // the browser plays the MP3 progressively as bytes arrive, which
          // slashes perceived latency vs fetching a full blob then playing.
          let bodyText = "";
          let bodyVoiceId: string | undefined;
          let bodyModelId: string | undefined;
          if (req.method === "GET") {
            const params = new URLSearchParams(rawQuery);
            bodyText = params.get("text") ?? "";
            bodyVoiceId = params.get("voiceId") ?? undefined;
            bodyModelId = params.get("modelId") ?? undefined;
          } else if (req.method === "POST") {
            try {
              const chunks: Buffer[] = [];
              for await (const chunk of req) chunks.push(chunk as Buffer);
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              bodyText = parsed.text ?? "";
              bodyVoiceId = parsed.voiceId;
              bodyModelId = parsed.modelId;
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "invalid JSON body" }));
              return;
            }
          } else {
            res.statusCode = 405;
            res.end();
            return;
          }

          const text = bodyText.trim();
          if (!text) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "empty text" }));
            return;
          }

          const voiceId = bodyVoiceId
            ?? process.env.ELEVENLABS_VOICE_ID
            ?? "nPczCjzI2devNBz1zQrb"; // Brian — hype male caster
          // eleven_flash_v2_5 is the lowest-latency multilingual model,
          // ~75ms TTFB vs ~300-400ms for eleven_multilingual_v2, good
          // enough quality for a short hype caster line.
          const modelId = bodyModelId ?? "eleven_flash_v2_5";

          try {
            const upstream = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
              {
                method: "POST",
                headers: {
                  "xi-api-key": apiKey,
                  "Content-Type": "application/json",
                  "Accept": "audio/mpeg",
                },
                body: JSON.stringify({
                  text,
                  model_id: modelId,
                  voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.75,
                    style: 0.6,
                    use_speaker_boost: true,
                  },
                }),
              },
            );

            if (!upstream.ok || !upstream.body) {
              res.statusCode = upstream.status || 502;
              const err = await upstream.text().catch(() => "");
              res.end(JSON.stringify({ error: `elevenlabs ${upstream.status}: ${err.slice(0, 200)}` }));
              return;
            }

            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("Cache-Control", "no-store");
            const reader = upstream.body.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) res.write(Buffer.from(value));
            }
            res.end();
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
          }
        });
      },
    },
    {
      // Dev-only: expose the sibling sprixe-edit ROM folders so the
      // frontend can bootstrap an empty IndexedDB with a real catalogue
      // at boot. No-op in production builds since this plugin only runs
      // in `configureServer`.
      name: "dev-roms-serve",
      configureServer(server) {
        const romsRoot = resolve(__dirname, "../sprixe-edit/public/roms");
        const SYSTEMS = ["cps-1", "neogeo", "ko"];

        function listZips(): Array<{ system: string; file: string; path: string; size: number }> {
          const result: Array<{ system: string; file: string; path: string; size: number }> = [];
          for (const sys of SYSTEMS) {
            const dir = resolve(romsRoot, sys);
            if (!existsSync(dir)) continue;
            for (const file of readdirSync(dir)) {
              if (!file.toLowerCase().endsWith(".zip")) continue;
              const filePath = resolve(dir, file);
              result.push({
                system: sys,
                file,
                path: `/__dev-roms/${sys}/${file}`,
                size: statSync(filePath).size,
              });
            }
          }
          return result;
        }

        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0] ?? "";
          if (!url.startsWith("/__dev-roms/")) return next();

          if (url === "/__dev-roms/manifest.json") {
            const manifest = listZips();
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(manifest));
            return;
          }

          const match = /^\/__dev-roms\/([a-z0-9-]+)\/([a-z0-9]+\.zip)$/i.exec(url);
          if (!match) { res.statusCode = 404; res.end(); return; }
          const [, system, file] = match;
          if (!SYSTEMS.includes(system!)) { res.statusCode = 404; res.end(); return; }
          const filePath = resolve(romsRoot, system!, file!);
          if (!filePath.startsWith(romsRoot)) { res.statusCode = 403; res.end(); return; }
          if (!existsSync(filePath)) { res.statusCode = 404; res.end(); return; }
          const data = readFileSync(filePath);
          res.setHeader("content-type", "application/zip");
          res.setHeader("content-length", String(data.length));
          res.end(data);
        });
      },
    },
  ],
}));
