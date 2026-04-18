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
import { loadMapping, MAPPING_ROLES } from "./input/mapping-store";
import { InputRouter } from "./input/input-router";
import { BrowserScreen } from "./screens/browser/browser-screen";
import { HintsBar } from "./ui/hints-bar";
import { MappingScreen } from "./screens/mapping/mapping-screen";
import { PlayingScreen } from "./screens/playing/playing-screen";
import { PauseOverlay } from "./screens/pause/pause-overlay";
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
  return [...MOCK_GAMES];
}

function showMappingFlow(): Promise<void> {
  return new Promise((resolve) => {
    const screen = new MappingScreen(app!, {
      roles: MAPPING_ROLES,
      onComplete: () => {
        screen.unmount();
        resolve();
      },
    });
  });
}

function startBrowser(games: GameEntry[]): void {
  const browser = new BrowserScreen(app!, { initialGames: games });
  const hints = new HintsBar(app!);
  hints.setContext("browser");

  const router = new InputRouter("menu");
  let playing: PlayingScreen | null = null;
  let overlay: PauseOverlay | null = null;

  function exitToMenu(): void {
    overlay?.close();
    overlay?.root.remove();
    overlay = null;
    playing?.stop();
    playing = null;
    browser.root.hidden = false;
    hints.setContext("browser");
    router.setMode("menu");
  }

  browser.getList().onSelect((game) => {
    browser.root.hidden = true;
    hints.setContext("paused");
    playing = new PlayingScreen(app!, { game });
    playing.start();
    overlay = new PauseOverlay(app!, {
      emulator: playing.getEmulator(),
      onResume: () => router.setMode("emu"),
      onQuit: () => exitToMenu(),
    });
    router.setMode("emu");
  });

  router.onCoinHold(() => {
    if (!playing || !overlay) return;
    if (overlay.isOpen()) {
      overlay.close();
      router.setMode("emu");
    } else {
      overlay.open();
      // Overlay needs NavActions — temporarily switch back to menu mode.
      router.setMode("menu");
    }
  });

  router.onNavAction((action) => {
    if (overlay?.isOpen()) {
      overlay.handleNavAction(action);
      return;
    }
    browser.handleNavAction(action);
  });

  const gamepad = new GamepadNav();
  gamepad.onAction((action) => router.feedAction(action));
  gamepad.start();
}

async function boot(): Promise<void> {
  window.dispatchEvent(new CustomEvent("app-ready"));

  if (!loadMapping()) {
    await showMappingFlow();
  }

  const games = await loadCatalogue();
  startBrowser(games);
}

boot().catch((e) => {
  console.error("[arcade] boot failed:", e);
});
