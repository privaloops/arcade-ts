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
import { KeyboardNav } from "./input/keyboard-nav";
import { computeKeyboardNavBindings } from "./input/nav-bindings";
import { loadMapping, clearMapping, MAPPING_ROLES, mappingToGamepadNavBindings } from "./input/mapping-store";
import { InputRouter } from "./input/input-router";
import { BrowserScreen } from "./screens/browser/browser-screen";
import { HintsBar } from "./ui/hints-bar";
import { MappingScreen } from "./screens/mapping/mapping-screen";
import { PlayingScreen } from "./screens/playing/playing-screen";
import { PauseOverlay } from "./screens/pause/pause-overlay";
import { MissingBiosDialog } from "./screens/missing-bios/missing-bios-dialog";
import { MissingBiosError } from "./engine-bridge/errors";
import { PhonePage } from "./screens/phone/phone-page";
import { EmptyState } from "./screens/empty/empty-state";
import { SettingsScreen } from "./screens/settings/settings-screen";
import { SettingsStore, type AudioLatency } from "./screens/settings/settings-store";
import { ContextMenu } from "./screens/context-menu/context-menu";
import { Toast } from "./ui/toast";
import { classifyTransferError } from "./p2p/error-handling";
import { PeerHost } from "./p2p/peer-host";
import { RomPipeline } from "./p2p/rom-pipeline";
import { StateSync } from "./p2p/state-sync";
import { RomDB, type RomRecord } from "./storage/rom-db";
import { PreviewLoader } from "./media/preview-loader";
import { MediaCache } from "./media/media-cache";
import { MediaScraper } from "./media/media-scraper";
import { SaveStateDB } from "./state/save-state-db";
import { SaveStateController } from "./state/save-state-controller";
import { crtFilterCss } from "./render/scaling";
import { bootstrapDevRoms } from "./data/dev-roms";
import { BridgeClient, type BridgeSubscription } from "./bridge/bridge-client";

declare const __APP_VERSION__: string;

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

function showMappingFlow(player: 0 | 1 = 0): Promise<void> {
  return new Promise((resolve) => {
    const screen = new MappingScreen(app!, {
      roles: MAPPING_ROLES,
      player,
      existing: loadMapping(),
      onComplete: () => {
        screen.unmount();
        resolve();
      },
    });
  });
}

/** Map Settings > Audio > Latency → AudioContext latencyHint.
 *  'medium' stays as the browser default ('interactive' on most)
 *  so existing behaviour doesn't regress for users who never touched
 *  the setting. */
function audioLatencyToHint(level: AudioLatency): AudioContextLatencyCategory {
  if (level === "low") return "interactive";
  if (level === "high") return "playback";
  return "balanced";
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

async function startHostWithRetry(
  host: PeerHost,
  onAttemptFailed?: (err: Error, attempt: number, remaining: number) => void
): Promise<void> {
  const backoffs = [2000, 4000, 8000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      await host.start();
      return;
    } catch (err) {
      lastError = err;
      const remaining = backoffs.length - attempt;
      onAttemptFailed?.(err instanceof Error ? err : new Error(String(err)), attempt, remaining);
      if (remaining <= 0) break;
      await new Promise<void>((r) => setTimeout(r, backoffs[attempt] ?? 8000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function startBrowser(
  games: GameEntry[],
  db: RomDB,
  host: PeerHost,
  settings: SettingsStore,
  toast: Toast
): void {
  // Operators can self-host a CDN that overrides ArcadeDB by setting
  // __CDN_BASE__ at build time (Phase 5 release workflow). In dev we
  // leave it undefined so the preview loader skips straight to
  // ArcadeDB instead of spamming localhost/media/... 404s.
  const cdnBase = typeof (globalThis as unknown as { __CDN_BASE__?: string }).__CDN_BASE__ === "string"
    ? (globalThis as unknown as { __CDN_BASE__?: string }).__CDN_BASE__
    : undefined;
  const loader = new PreviewLoader({
    cache: new MediaCache(),
    ...(cdnBase ? { cdnBase } : {}),
  });
  const browser = new BrowserScreen(app!, { initialGames: games, previewLoader: loader });
  const hints = new HintsBar(app!);
  hints.setContext("browser");

  // Kick off the background media scraper once the browser is mounted.
  // It walks the whole catalogue, caching screenshots + marquees so the
  // next session doesn't depend on ArcadeDB being reachable. No-op when
  // every asset is already cached.
  const scraper = new MediaScraper(loader);
  scraper.enqueue(games);
  scraper.start();

  const router = new InputRouter("menu");
  let playing: PlayingScreen | null = null;
  let overlay: PauseOverlay | null = null;
  let settingsScreen: SettingsScreen | null = null;
  let saveController: SaveStateController | null = null;
  let missingBios: MissingBiosDialog | null = null;
  let launching = false;
  let gamepad: GamepadNav | null = null;
  const saveDb = new SaveStateDB();
  // Best-effort migration from the legacy edit-app localStorage keys.
  saveDb.migrateFromLocalStorage().catch(() => {});

  // Phase 3.9 state sync: broadcast screen / game / paused / volume to
  // every connected phone so the RemoteTab can enable/disable controls.
  const stateSync = new StateSync((msg) => host.broadcast(msg));
  host.onConnection(() => stateSync.broadcastFullState());
  // Phase 4b: keep the phone's volume readout in step with the kiosk.
  stateSync.setState({ volume: settings.get().audio.masterVolume });
  settings.onChange((s) => {
    stateSync.setState({ volume: s.audio.masterVolume });
    // Pipe the master volume down to the live engine so the slider
    // actually changes what the speakers play. Without this the UI
    // value updates while audio stays at its initial level.
    playing?.getRunner().setVolume?.(s.audio.masterVolume / 100);
  });

  // Apply the display settings to the live playing canvas via CSS
  // variables — `--af-playing-filter` drives the saturate/contrast
  // boost on the canvas itself, `--af-crt-enabled` toggles the
  // scanline overlay painted by `.af-playing-screen::after`.
  const applyDisplayFilters = (): void => {
    const s = settings.get();
    const filterCss = s.display.crtFilter
      ? crtFilterCss({ scanlineOpacity: s.display.scanlineOpacity })
      : "none";
    document.documentElement.style.setProperty("--af-playing-filter", filterCss);
    document.documentElement.style.setProperty("--af-crt-enabled", s.display.crtFilter ? "1" : "0");
  };
  applyDisplayFilters();
  settings.onChange(applyDisplayFilters);

  let contextMenu: ContextMenu | null = null;
  // Drained catalogues fall back to the QR-code EmptyState so the user
  // always has a path back to uploading. Lazily created the first time
  // the list goes empty.
  let emptyOverlay: EmptyState | null = null;

  // Bridge probe: if a local @sprixe/bridge daemon is reachable we
  // route launches through it (native MAME on Pi). Otherwise we keep
  // the embedded TS engine path — same UI, no separate build.
  const bridge = new BridgeClient();
  let bridgeAvailable = false;
  let bridgeRunning = false;
  let bridgeSubscription: BridgeSubscription | null = null;
  void bridge.probe().then((ok) => {
    bridgeAvailable = ok;
    if (ok) {
      console.log("[arcade] native bridge detected — launches will spawn MAME");
      bridgeSubscription = bridge.subscribe((event) => {
        if (event.type === "exited" || event.type === "error") {
          if (event.type === "error") {
            toast.show("error", `MAME: ${event.message}`);
          }
          bridgeRunning = false;
          exitToMenu();
        }
      });
    }
  });

  function syncHomeVisibility(): void {
    // Only flip visibility when the home screen is actually the active
    // surface — playing / settings / overlays manage their own hidden
    // flags and shouldn't be perturbed by a catalogue change underneath.
    if (playing) return;
    const isEmpty = browser.getAllGames().length === 0;
    if (isEmpty) {
      if (!emptyOverlay) {
        emptyOverlay = new EmptyState(app!);
        void emptyOverlay.setRoomId(host.roomId);
      }
      browser.root.hidden = true;
      hints.root.hidden = true;
    } else {
      if (emptyOverlay) {
        emptyOverlay.unmount();
        emptyOverlay = null;
      }
      if (!overlay && !settingsScreen) {
        browser.root.hidden = false;
        hints.root.hidden = false;
      }
    }
  }

  function refreshCatalogueFromDb(): Promise<void> {
    return db.list().then((records) => {
      const refreshed = records.map(romRecordToGameEntry);
      browser.setGames(refreshed);
      syncHomeVisibility();
    });
  }

  function exitToMenu(): void {
    saveController?.dispose();
    saveController = null;
    overlay?.close();
    overlay?.dispose();
    overlay?.root.remove();
    overlay = null;
    playing?.stop();
    playing = null;
    browser.root.hidden = false;
    // Restart the preview clip we paused on launch.
    browser.getPreview().resumeVideo();
    hints.root.hidden = false;
    hints.setContext("browser");
    router.setMode("menu");
    // Explicit empty strings reset the phone's readout — StateSync's
    // diff broadcast skips undefined, so we must send a discernible value.
    stateSync.setState({ screen: "browser", paused: false, game: "", title: "" });
  }

  function openContextMenuForSelection(): void {
    if (playing || overlay || settingsScreen || missingBios || contextMenu) return;
    const game = browser.getWheel().getSelectedGame();
    if (!game) return;
    void db.get(game.id).then((rec) => {
      if (!rec) return;
      contextMenu = new ContextMenu(app!, {
        gameId: game.id,
        gameTitle: game.title,
        isFavorite: Boolean(rec.favorite),
        onLaunch: () => {
          contextMenu = null;
          browser.getWheel().confirm();
        },
        onToggleFavorite: () => {
          void db.setFavorite(game.id, !rec.favorite).then(() => {
            void refreshCatalogueFromDb().then(() => {
              toast.show("success", rec.favorite ? "Removed from favorites" : "Added to favorites");
            });
          });
        },
        onDelete: () => {
          void db.delete(game.id).then(() => {
            void refreshCatalogueFromDb().then(() => {
              toast.show("success", `Deleted ${game.id}`);
            });
          });
        },
        onClose: () => {
          contextMenu = null;
        },
      });
    });
  }

  function openPauseOverlay(): void {
    if (!playing || !overlay || overlay.isOpen()) return;
    overlay.open();
    router.setMode("menu");
    stateSync.setState({ screen: "paused", paused: true });
  }

  function closePauseOverlay(): void {
    if (!playing || !overlay || !overlay.isOpen()) return;
    overlay.close();
    router.setMode("emu");
    stateSync.setState({ screen: "playing", paused: false });
  }

  async function launchViaBridge(game: GameEntry, rec: RomRecord): Promise<void> {
    bridgeRunning = true;
    browser.root.hidden = true;
    browser.getPreview().pauseVideo();
    hints.root.hidden = true;
    router.setMode("emu");
    stateSync.setState({
      screen: "playing",
      game: game.id,
      title: game.title,
      paused: false,
      volume: settings.get().audio.masterVolume,
    });
    db.markPlayed(game.id).catch((err) => {
      console.warn(`[arcade] markPlayed(${game.id}) failed:`, err);
    });
    try {
      await bridge.launch(game.id, rec.zipData);
    } catch (e) {
      bridgeRunning = false;
      browser.root.hidden = false;
      hints.root.hidden = false;
      router.setMode("menu");
      throw e;
    }
    // Resolved on /launch ack — actual exit comes via the SSE
    // subscription which calls exitToMenu() when MAME quits.
  }

  browser.getWheel().onSelect((game) => {
    if (launching || playing || missingBios || bridgeRunning) return;
    launching = true;
    void (async () => {
      try {
        const rec = await db.get(game.id);
        if (!rec) {
          toast.show("error", `ROM "${game.id}" is missing from storage`);
          return;
        }
        if (bridgeAvailable) {
          await launchViaBridge(game, rec);
          return;
        }
        const screen = await PlayingScreen.create(app!, {
          game,
          romBuffer: rec.zipData,
          romDb: db,
          latencyHint: audioLatencyToHint(settings.get().audio.latency),
        });
        // Stats bookkeeping shouldn't be able to abort a launch — if the
        // IndexedDB write fails (transient quota, profile corruption,
        // browser kiosk restrictions) we'd rather lose the play count
        // than refuse to start a game that's already loaded.
        db.markPlayed(game.id).catch((err) => {
          console.warn(`[arcade] markPlayed(${game.id}) failed:`, err);
        });
        browser.root.hidden = true;
        // Stop the ArcadeDB preview so it doesn't keep decoding frames
        // or playing audio behind the live emulator.
        browser.getPreview().pauseVideo();
        // Chrome-free playing surface — the in-game hints bar is hidden
        // so the canvas fills the viewport. Pause overlay brings its
        // own hints strip back when opened.
        hints.root.hidden = true;
        playing = screen;
        playing.start();
        const runner = playing.getRunner();
        // Apply the current master volume right away so the new run
        // honours whatever the user has already picked in Settings.
        runner.setVolume?.(settings.get().audio.masterVolume / 100);
        saveController = new SaveStateController({
          emulator: runner,
          db: saveDb,
          gameId: game.id,
          toast,
        });
        overlay = new PauseOverlay(app!, {
          emulator: runner,
          settings,
          onResume: () => closePauseOverlay(),
          onQuit: () => exitToMenu(),
          onSaveState: () => {
            closePauseOverlay();
            void saveController?.save();
          },
          onLoadState: () => {
            closePauseOverlay();
            void saveController?.load();
          },
        });
        router.setMode("emu");
        stateSync.setState({
          screen: "playing",
          game: game.id,
          title: game.title,
          paused: false,
          volume: settings.get().audio.masterVolume,
        });
      } catch (e) {
        if (e instanceof MissingBiosError) {
          missingBios = new MissingBiosDialog(app!, {
            system: e.system,
            biosId: e.biosId,
            onClose: () => {
              missingBios = null;
              router.setMode("menu");
            },
          });
          router.setMode("menu");
        } else {
          toast.show("error", `Could not launch: ${describeLaunchError(e)}`);
        }
      } finally {
        launching = false;
      }
    })();
  });

  router.onCoinHold(() => {
    // Contextual arcade semantics: in-game → pause overlay toggles,
    // on the browser → Settings opens. Same long-press, same gesture.
    if (playing && overlay) {
      if (overlay.isOpen()) closePauseOverlay();
      else openPauseOverlay();
      return;
    }
    if (!settingsScreen && !contextMenu && !missingBios) openSettings();
  });

  // Phase 3.7 phone remote: route 'cmd' messages coming off any
  // connected phone's RemoteTab into the same local controllers that
  // the gamepad + overlay already drive.
  host.onCommand((cmd) => {
    // Native bridge mode: MAME owns the screen and the inputs, so
    // local PauseOverlay / saveController don't exist. Forward the
    // remote action as a synthesized keystroke; the bridge takes care
    // of injecting it via uinput so MAME sees a real key event.
    if (bridgeRunning) {
      switch (cmd.action) {
        case "pause":   void bridge.sendInput("pause").catch(() => {}); return;
        case "resume":  void bridge.sendInput("pause").catch(() => {}); return; // P toggles
        case "save":    void bridge.sendInput("save").catch(() => {}); return;
        case "load":    void bridge.sendInput("load").catch(() => {}); return;
        case "quit":    void bridge.sendInput("quit").catch(() => {}); return;
        case "volume": {
          const level = (cmd.payload as { level?: number } | undefined)?.level;
          if (typeof level !== "number") return;
          // No way to set an absolute volume via MAME hotkeys — pulse
          // the - / = keys just enough times to nudge perception.
          // Replace later with mixer-level control if exact volume is
          // required from the phone slider.
          settings.update({ audio: { masterVolume: level } });
          return;
        }
      }
      return;
    }
    switch (cmd.action) {
      case "pause":
        openPauseOverlay();
        return;
      case "resume":
        closePauseOverlay();
        return;
      case "save": {
        if (!saveController) return;
        const slot = (cmd.payload as { slot?: number } | undefined)?.slot;
        void saveController.save(typeof slot === "number" ? slot : undefined);
        return;
      }
      case "load": {
        if (!saveController) return;
        const slot = (cmd.payload as { slot?: number } | undefined)?.slot;
        void saveController.load(typeof slot === "number" ? slot : undefined);
        return;
      }
      case "quit":
        if (playing) exitToMenu();
        return;
      case "volume": {
        const level = (cmd.payload as { level?: number } | undefined)?.level;
        if (typeof level === "number") {
          settings.update({ audio: { masterVolume: level } });
        }
        return;
      }
    }
  });

  router.onNavAction((action) => {
    if (missingBios) {
      missingBios.handleNavAction(action);
      return;
    }
    if (settingsScreen) {
      if (settingsScreen.handleNavAction(action)) return;
      return;
    }
    if (overlay?.isOpen()) {
      overlay.handleNavAction(action);
      return;
    }
    if (contextMenu) {
      contextMenu.handleNavAction(action);
      return;
    }
    if (action === "context-menu") {
      openContextMenuForSelection();
      return;
    }
    if (action === "start") {
      // Arcade Start = secondary Launch on the browser; in-game it's
      // already consumed by the engine's InputManager via emu mode.
      browser.handleNavAction("confirm");
      return;
    }
    browser.handleNavAction(action);
  });

  function openSettings(): void {
    browser.root.hidden = true;
    settingsScreen = new SettingsScreen(app!, {
      settings,
      version: __APP_VERSION__,
      controls: {
        getMapping: () => loadMapping(),
        onReset: () => {
          clearMapping();
          settingsScreen?.unmount();
          settingsScreen = null;
          browser.root.hidden = true;
          // Stop the gamepad nav during the re-mapping flow so the
          // *old* bindings can't fire actions while the user is
          // pressing the new buttons. Without this, emitting 'coin-hold'
          // (previously bound to Settings) would kick the MappingScreen
          // out of the DOM while the user is mapping the same button.
          gamepad?.stop();
          void showMappingFlow(0).then(() => {
            window.location.reload();
          });
        },
        onRemapPlayer: (player) => {
          settingsScreen?.unmount();
          settingsScreen = null;
          browser.root.hidden = true;
          gamepad?.stop();
          void showMappingFlow(player).then(() => {
            // Reload so the new mapping re-seeds GamepadNav bindings,
            // InputManager defaults, and any cached projection.
            window.location.reload();
          });
        },
      },
      network: {
        getRoomId: () => host.roomId,
        isOpen: () => host.isOpen(),
        onRegenerate: () => {
          try { localStorage.removeItem("sprixe.roomId"); } catch { /* ignore */ }
          window.location.reload();
        },
      },
      storage: {
        listRoms: () => db.list(),
        deleteRom: async (id) => {
          await db.delete(id);
          const refreshed = (await db.list()).map(romRecordToGameEntry);
          browser.setGames(refreshed);
          syncHomeVisibility();
          toast.show("success", `Deleted ${id}`);
        },
        estimate: async () => {
          if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
            return { usage: 0, quota: 0 };
          }
          const e = await navigator.storage.estimate();
          return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
        },
      },
      system: {
        reloadUI: () => {
          // Hard reload — picks up a new dist/ if Vercel has shipped
          // a build since the kiosk page first opened. Vite's hashed
          // asset URLs make a cache-busting query unnecessary.
          window.location.reload();
        },
        // Reboot / shutdown only show up when the bridge is reachable;
        // the SettingsScreen disables the buttons when these are
        // omitted, so web-only deployments don't tease an action that
        // can't work.
        ...(bridgeAvailable ? {
          reboot: async () => {
            toast.show("success", "Rebooting…");
            try { await bridge.reboot(); } catch (e) {
              toast.show("error", `Reboot failed: ${describeLaunchError(e)}`);
            }
          },
          shutdown: async () => {
            toast.show("success", "Shutting down…");
            try { await bridge.poweroff(); } catch (e) {
              toast.show("error", `Shutdown failed: ${describeLaunchError(e)}`);
            }
          },
        } : {}),
      },
      onClose: () => {
        settingsScreen = null;
        browser.root.hidden = false;
        syncHomeVisibility();
      },
    });
  }

  // Apply the first-boot mapping (coin / start / up / down / confirm /
  // back, either button or axis) so menu navigation uses the buttons
  // the user actually picked. The other nav actions (left / right /
  // favorite / bumpers) fall back to the Gamepad standard defaults.
  gamepad = new GamepadNav({ bindings: mappingToGamepadNavBindings(loadMapping()) });
  gamepad.onAction((action) => router.feedAction(action));
  gamepad.start();

  // Keyboard-driven menu nav. Both players' key bindings (custom +
  // engine defaults when the player picked keyboard) are projected
  // onto the same NavAction surface — whoever reaches the kiosk first
  // can drive it with their own keys.
  const keyboardNav = new KeyboardNav(computeKeyboardNavBindings(loadMapping()));
  keyboardNav.onAction((action) => router.feedAction(action));
  keyboardNav.start();

  const pipeline = new RomPipeline({ db });
  host.onFile(async (file, conn) => {
    try {
      const { record } = await pipeline.process(file);
      const refreshed = (await db.list()).map(romRecordToGameEntry);
      browser.setGames(refreshed);
      syncHomeVisibility();
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
  // Retry host.start() with exponential backoff. PeerJS Cloud rate-
  // limits and transient signaling failures would otherwise leave the
  // kiosk unable to accept any phone connection with zero UI feedback.
  const hostReady = startHostWithRetry(host, (err, attempt, remaining) => {
    console.warn(`[arcade] PeerHost start failed (attempt ${attempt + 1}, ${remaining} left):`, err);
  });
  hostReady.catch((err) => {
    console.error("[arcade] PeerHost start exhausted retries:", err);
    toast.show("error", "Phone pairing server unreachable — try again later");
  });

  let { games, source } = await loadCatalogue(db);

  // Dev-only: auto-import the sibling sprixe-edit ROM catalogue on
  // first boot so the browser has something to display without the
  // phone-upload dance. The vite middleware serves the manifest only
  // in dev; in production the fetch 404s and this becomes a no-op.
  const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (source === "empty" && isDev) {
    const imported = await bootstrapDevRoms(new RomPipeline({ db }), toast);
    if (imported.length > 0) {
      games = imported.map(romRecordToGameEntry);
      source = "idb";
    }
  }

  if (source === "empty") {
    const empty = new EmptyState(app!);
    await empty.setRoomId(host.roomId);
    // If start() exhausted its retries, replace the QR with a "server
    // unreachable" panel so the user knows the scan won't work until
    // they press Retry.
    const showServerDown = (err: unknown): void => {
      const message = err instanceof Error ? err.message : String(err);
      empty.setServerDown(message, () => {
        empty.clearServerDown();
        void startHostWithRetry(host).catch(showServerDown);
      });
    };
    hostReady.catch(showServerDown);
    // When a ROM lands, swap the empty state for the real browser.
    // The unsubscribe is captured so the empty-state handler dies the
    // moment startBrowser takes over — otherwise it keeps firing on
    // every subsequent upload, spawning duplicate BrowserScreens and
    // re-running pipeline.process for nothing.
    const pipeline = new RomPipeline({ db });
    const unsubscribe = host.onFile(async (file, conn) => {
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
          unsubscribe();
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

function describeLaunchError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}

const match = SEND_PATH_RE.exec(window.location.pathname);
if (match) {
  bootPhone(match[1]!);
} else {
  bootKiosk().catch((e) => console.error("[arcade] boot failed:", e));
}
