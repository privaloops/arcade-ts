/**
 * @sprixe/frontend — arcade UI entry point.
 *
 * Phase 1: mounts the browser screen with the MOCK_GAMES dataset and
 * connects it to GamepadNav. Later phases will swap MOCK_GAMES for the
 * real catalogue and layer the pause overlay / settings on top.
 */

import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "./styles/tokens.css";
import "./styles/base.css";

import { MOCK_GAMES } from "./data/mock-games";
import { romRecordToGameEntry } from "./data/rom-source";
import type { GameEntry } from "./data/games";
import { GamepadNav } from "./input/gamepad-nav";
import { BrowserScreen } from "./screens/browser/browser-screen";
import { HintsBar } from "./ui/hints-bar";
import { RomDB } from "./storage/rom-db";

const app = document.getElementById("app");
if (!app) throw new Error("#app container missing");

async function loadCatalogue(): Promise<GameEntry[]> {
  const db = new RomDB();
  try {
    const records = await db.list();
    if (records.length > 0) return records.map(romRecordToGameEntry);
  } catch (e) {
    console.warn("[arcade] RomDB unavailable, falling back to mock catalogue:", e);
  }
  // Empty DB → Phase 3 will wire the first-boot empty state (QR upload).
  // Until then, fall back to the mock catalogue so dev mode stays usable.
  return [...MOCK_GAMES];
}

const games = await loadCatalogue();
const browser = new BrowserScreen(app, { initialGames: games });
const hints = new HintsBar(app);
hints.setContext("browser");

const gamepad = new GamepadNav();
gamepad.onAction((action) => {
  browser.handleNavAction(action);
});
gamepad.start();

// Signal that the app finished booting — used by the splash screen
// (Phase 1.8) and by p1-boot-splash.spec.ts.
window.dispatchEvent(new CustomEvent("app-ready"));
