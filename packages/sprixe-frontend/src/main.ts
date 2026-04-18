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
import { PhonePage } from "./screens/phone/phone-page";
import { EmptyState } from "./screens/empty/empty-state";
import { SettingsScreen } from "./screens/settings/settings-screen";
import { SettingsStore } from "./screens/settings/settings-store";
import { LetterWheel } from "./ui/letter-wheel";
import { Toast } from "./ui/toast";
import { classifyTransferError } from "./p2p/error-handling";
import { PeerHost } from "./p2p/peer-host";
import { RomPipeline } from "./p2p/rom-pipeline";
import { RomDB, type RomRecord } from "./storage/rom-db";

const app = document.getElementById("app");
if (!app) throw new Error("#app container missing");

const SEND_PATH_RE = /^\/send\/([^/]+)/;
const USE_MOCK_KEY = "sprixe.useMockCatalogue";

async function loadCatalogue(db: RomDB): Promise<{ games: GameEntry[]; source: "idb" | "mock" | "empty" }> {
  let records: RomRecord[] = [];
  try {
    records = await db.list();
  } catch (e) {
    console.warn("[arcade] RomDB unavailable:", e);
  }
  if (records.length > 0) {
    return { games: records.map(romRecordToGameEntry), source: "idb" };
  }
  // Dev / test escape hatch: only fall back to MOCK_GAMES when a local
  // flag is set. Production first boot hits the empty state instead.
  const wantMock = (() => {
    try { return localStorage.getItem(USE_MOCK_KEY) === "true"; }
    catch { return false; }
  })();
  if (wantMock) {
    return { games: [...MOCK_GAMES], source: "mock" };
  }
  return { games: [], source: "empty" };
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

function pickRoomId(): string {
  try {
    const stored = localStorage.getItem("sprixe.roomId");
    if (stored) return stored;
  } catch { /* ignore */ }
  const rand = Math.random().toString(36).slice(2, 10);
  const id = `sprixe-${rand}`;
  try { localStorage.setItem("sprixe.roomId", id); } catch { /* ignore */ }
  return id;
}

function startBrowser(
  games: GameEntry[],
  db: RomDB,
  host: PeerHost,
  settings: SettingsStore,
  toast: Toast
): void {
  const browser = new BrowserScreen(app!, { initialGames: games });
  const hints = new HintsBar(app!);
  hints.setContext("browser");

  const router = new InputRouter("menu");
  let playing: PlayingScreen | null = null;
  let overlay: PauseOverlay | null = null;
  let settingsScreen: SettingsScreen | null = null;

  const letterWheel = new LetterWheel(app!, {
    onJump: (index) => {
      browser.getList().setSelectedIndex(index);
    },
  });
  letterWheel.setGames(games);
  browser.getList().onChange(() => {
    letterWheel.setGames(browser.getList().getItems());
  });

  function exitToMenu(): void {
    overlay?.close();
    overlay?.dispose();
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
      settings,
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
      router.setMode("menu");
    }
  });

  router.onNavAction((action) => {
    if (settingsScreen) {
      if (settingsScreen.handleNavAction(action)) return;
      return;
    }
    if (overlay?.isOpen()) {
      overlay.handleNavAction(action);
      return;
    }
    if (letterWheel.isOpen()) {
      if (letterWheel.handleNavAction(action)) return;
      return;
    }
    if (action === "favorite") {
      letterWheel.open();
      return;
    }
    if (action === "settings") {
      browser.root.hidden = true;
      settingsScreen = new SettingsScreen(app!, {
        settings,
        version: "dev",
        onClose: () => {
          settingsScreen = null;
          browser.root.hidden = false;
        },
      });
      return;
    }
    browser.handleNavAction(action);
  });

  const gamepad = new GamepadNav();
  gamepad.onAction((action) => router.feedAction(action));
  gamepad.start();

  const pipeline = new RomPipeline({ db });
  host.onFile(async (file, conn) => {
    try {
      const { record } = await pipeline.process(file);
      const refreshed = (await db.list()).map(romRecordToGameEntry);
      browser.setGames(refreshed);
      toast.show("success", `Added ${record.id}`);
      try {
        (conn as unknown as { send: (m: unknown) => void }).send({
          type: "complete",
          name: file.name,
          game: record.id,
          system: record.system,
        });
      } catch { /* phone closed? ignore */ }
    } catch (e) {
      const classified = classifyTransferError(e);
      toast.show(classified.level, classified.message);
      try {
        (conn as unknown as { send: (m: unknown) => void }).send({
          type: "error",
          name: file.name,
          error: classified.message,
        });
      } catch { /* phone closed? ignore */ }
    }
  });
}

async function bootKiosk(): Promise<void> {
  window.dispatchEvent(new CustomEvent("app-ready"));

  if (!loadMapping()) {
    await showMappingFlow();
  }

  const db = new RomDB();
  const settings = new SettingsStore();
  const toast = new Toast(app!);
  const host = new PeerHost({ roomId: pickRoomId() });
  host.start().catch((e) => console.warn("[arcade] PeerHost start failed:", e));

  const { games, source } = await loadCatalogue(db);

  if (source === "empty") {
    const empty = new EmptyState(app!);
    await empty.setRoomId(host.roomId);
    // When a ROM lands, swap the empty state for the real browser.
    const pipeline = new RomPipeline({ db });
    host.onFile(async (file, conn) => {
      try {
        const { record } = await pipeline.process(file);
        const refreshed = (await db.list()).map(romRecordToGameEntry);
        if (refreshed.length > 0) {
          toast.show("success", `Added ${record.id}`);
          try {
            (conn as unknown as { send: (m: unknown) => void }).send({
              type: "complete", name: file.name, game: record.id, system: record.system,
            });
          } catch { /* ignore */ }
          empty.unmount();
          startBrowser(refreshed, db, host, settings, toast);
        }
      } catch (e) {
        const classified = classifyTransferError(e);
        toast.show(classified.level, classified.message);
        try {
          (conn as unknown as { send: (m: unknown) => void }).send({
            type: "error", name: file.name, error: classified.message,
          });
        } catch { /* ignore */ }
      }
    });
    return;
  }

  startBrowser(games, db, host, settings, toast);
}

function bootPhone(roomId: string): void {
  window.dispatchEvent(new CustomEvent("app-ready"));
  new PhonePage(app!, { roomId });
}

const match = SEND_PATH_RE.exec(window.location.pathname);
if (match) {
  bootPhone(match[1]!);
} else {
  bootKiosk().catch((e) => console.error("[arcade] boot failed:", e));
}
