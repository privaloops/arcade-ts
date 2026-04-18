import { defineConfig } from "vite";
import { resolve } from "path";
import os from "node:os";

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
  },
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  // __LAN_IP__ is baked into the bundle only in dev; production builds
  // leave it null so the QR falls back to window.location.origin.
  define: {
    __LAN_IP__: command === "serve" ? JSON.stringify(getLanIp()) : "null",
  },
  plugins: [
    {
      name: "coop-coep",
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        });
      },
    },
  ],
}));
