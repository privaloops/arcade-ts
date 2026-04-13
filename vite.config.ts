import { defineConfig } from "vite";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import type { Plugin } from "vite";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

/** Vite plugin: serves /api/roms listing .zip files in public/roms/ and public/roms/neogeo/ */
function romsListPlugin(): Plugin {
  return {
    name: "roms-list",
    configureServer(server) {
      server.middlewares.use("/api/roms", (_req, res) => {
        try {
          const romsDir = join(process.cwd(), "public", "roms");
          const cps1Dir = join(romsDir, "cps-1");
          const neoDir = join(romsDir, "neogeo");
          const readZips = (dir: string, exclude?: string[]) => {
            try {
              return readdirSync(dir)
                .filter(f => f.endsWith(".zip") && !(exclude ?? []).includes(f))
                .map(f => f.replace(".zip", ""))
                .sort();
            } catch { return []; }
          };
          const cps1 = readZips(cps1Dir);
          const neogeo = readZips(neoDir, ["neogeo.zip"]);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ cps1, neogeo }));
        } catch {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ cps1: [], neogeo: [] }));
        }
      });
    },
  };
}

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '.claude/**',
      'tests/e2e/**',
    ],
  },
  root: ".",
  publicDir: "public",
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        play: resolve(__dirname, "play/index.html"),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    romsListPlugin(),
    // COOP/COEP on all requests except landing page (YouTube embed needs no COEP).
    {
      name: "coop-coep-except-landing",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? "";
          const isLanding = url === "/" || url === "/index.html" || url.startsWith("/?");
          if (!isLanding) {
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          }
          next();
        });
      },
    },
  ],
});
