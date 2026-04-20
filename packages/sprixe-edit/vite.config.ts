import { defineConfig } from "vite";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import type { Plugin } from "vite";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8"));

/** Vite plugin: serves /api/roms listing .zip files in public/roms/ and public/roms/neogeo/ */
function romsListPlugin(): Plugin {
  return {
    name: "roms-list",
    configureServer(server) {
      server.middlewares.use("/api/roms", (_req, res) => {
        try {
          const romsDir = join(__dirname, "public", "roms");
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
  resolve: {
    alias: {
      '@sprixe/engine': resolve(__dirname, '../sprixe-engine/src'),
    },
  },
  server: {
    fs: {
      // Allow serving files from the monorepo root so Vite can resolve
      // @sprixe/engine imports located in ../sprixe-engine/.
      allow: [resolve(__dirname, '../..')],
    },
  },
  root: ".",
  publicDir: "public",
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: {
        play: resolve(__dirname, "play/index.html"),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    romsListPlugin(),
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
});
