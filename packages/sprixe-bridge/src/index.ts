/**
 * Bridge entry point — invoked by the systemd unit installed by
 * first-boot.sh. Reads its config from environment variables so the
 * unit file can override port / rom dir without rebuilding.
 */

import { BridgeServer } from "./server.js";
import { MameProcess } from "./mame.js";

const port = Number(process.env.SPRIXE_BRIDGE_PORT ?? "7777");
const romDir = process.env.SPRIXE_BRIDGE_ROM_DIR ?? "/tmp/sprixe-roms";
// Debian ships MAME at /usr/games/mame which isn't in systemd's
// default PATH, so a bare "mame" spawn fails with ENOENT under
// systemd even though the binary is installed. Default to the
// canonical Debian path; override via env var on other distros.
const mameBin = process.env.SPRIXE_BRIDGE_MAME_BIN ?? "/usr/games/mame";

const server = new BridgeServer({ port, romDir, mame: new MameProcess({ bin: mameBin }) });

await server.start();
console.log(`[sprixe-bridge] listening on http://127.0.0.1:${port} (romDir: ${romDir})`);

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`[sprixe-bridge] received ${signal}, shutting down`);
  try { await server.stop(); } catch { /* swallow */ }
  process.exit(0);
};

process.on("SIGTERM", (sig) => { void shutdown(sig); });
process.on("SIGINT", (sig) => { void shutdown(sig); });
