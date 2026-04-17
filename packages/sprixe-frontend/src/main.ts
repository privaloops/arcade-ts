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
import { GamepadNav } from "./input/gamepad-nav";
import { BrowserScreen } from "./screens/browser/browser-screen";

const app = document.getElementById("app");
if (!app) throw new Error("#app container missing");

const browser = new BrowserScreen(app, { initialGames: MOCK_GAMES });

const gamepad = new GamepadNav();
gamepad.onAction((action) => {
  browser.handleNavAction(action);
});
gamepad.start();

// Signal that the app finished booting — used by the splash screen
// (Phase 1.8) and by p1-boot-splash.spec.ts.
window.dispatchEvent(new CustomEvent("app-ready"));
