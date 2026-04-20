/**
 * SettingsScreen — full-screen Settings modal (§2.8).
 *
 * Left tab strip (Display / Audio / About) + right content panel
 * bound to the SettingsStore. Phase 4b.1 ships the three headline
 * tabs; Controls / Network / Storage are punt to a 4b.1c polish
 * PR once their upstream data is in place (mapping remap flow,
 * RomDB size report, CDN sync status).
 *
 * Gamepad nav: Tab / Shift+Tab cycle the tabs; within a tab the
 * controls respond to native keyboard focus + gamepad NavActions
 * via handleNavAction (plumbed by main.ts).
 */

import type { SettingsStore, SettingsV1, AspectRatio, AudioLatency } from "./settings-store";
import type { NavAction } from "../../input/gamepad-nav";
import type { InputBinding, InputMapping, MappingRole } from "../../input/mapping-store";
import { MAPPING_ROLES } from "../../input/mapping-store";
import type { RomRecord } from "../../storage/rom-db";
import { QrCode, resolvePhoneBaseUrl } from "../../ui/qr-code";
import { AUTOFIRE_BUTTONS, loadAutofire, toggleAutofire, type AutofireButton, type PlayerIndex } from "../../input/autofire-store";
import {
  loadPlayerAssignment,
  savePlayerAssignment,
  listConnectedGamepads,
  prettyGamepadName,
  type PlayerAssignment,
} from "../../input/player-assignments";
import {
  DEFAULT_P1_MAPPING,
  DEFAULT_P2_MAPPING,
  DEFAULT_GP_MAPPING,
  type KeyMapping,
  type GamepadMapping,
} from "@sprixe/engine/input/input";

type TabId = "display" | "audio" | "controls" | "wifi" | "roms" | "about" | "back";

interface TabDef {
  id: TabId;
  label: string;
  render: (root: HTMLElement) => void;
}

/** Controls tab — displays the saved mapping + resets it. */
export interface ControlsBinding {
  getMapping: () => InputMapping | null;
  onReset: () => void;
  /**
   * Launch the remap flow for a specific player. The Settings screen
   * will have been unmounted by the caller before the mapping screen
   * takes over.
   */
  onRemapPlayer?: (player: PlayerIndex) => void;
}

/** Network tab — peer room id + signal status. */
export interface NetworkBinding {
  getRoomId: () => string;
  isOpen: () => boolean;
  onRegenerate: () => void;
}

/** Storage tab — quota usage + per-ROM delete. */
export interface StorageBinding {
  listRoms: () => Promise<RomRecord[]>;
  deleteRom: (id: string) => Promise<void>;
  estimate: () => Promise<{ usage: number; quota: number }>;
}

export interface SettingsScreenOptions {
  settings: SettingsStore;
  /** Fired when the user presses Back or picks 'Close'. */
  onClose: () => void;
  /** Arcade version string displayed in the About tab. */
  version?: string;
  controls?: ControlsBinding;
  network?: NetworkBinding;
  storage?: StorageBinding;
}

export class SettingsScreen {
  readonly root: HTMLDivElement;

  private readonly settings: SettingsStore;
  private readonly onClose: () => void;
  private readonly version: string;
  private readonly controls: ControlsBinding | undefined;
  private readonly network: NetworkBinding | undefined;
  private readonly storage: StorageBinding | undefined;
  private readonly tabs: TabDef[];
  private readonly tabNav: HTMLDivElement;
  private readonly tabContent: HTMLDivElement;
  private activeTab: TabId = "display";
  private unsubSettings: (() => void) | null = null;

  constructor(container: HTMLElement, options: SettingsScreenOptions) {
    this.settings = options.settings;
    this.onClose = options.onClose;
    this.version = options.version ?? "dev";
    this.controls = options.controls;
    this.network = options.network;
    this.storage = options.storage;

    this.root = document.createElement("div");
    this.root.className = "af-settings-screen";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Settings");
    this.root.setAttribute("data-testid", "settings-screen");

    const header = document.createElement("div");
    header.className = "af-settings-header";
    const title = document.createElement("h1");
    title.className = "af-settings-title";
    title.textContent = "SETTINGS";
    header.appendChild(title);
    this.root.appendChild(header);

    const body = document.createElement("div");
    body.className = "af-settings-body";
    this.root.appendChild(body);

    this.tabNav = document.createElement("div");
    this.tabNav.className = "af-settings-tabs";
    this.tabNav.setAttribute("role", "tablist");
    body.appendChild(this.tabNav);

    this.tabContent = document.createElement("div");
    this.tabContent.className = "af-settings-content";
    this.tabContent.setAttribute("data-testid", "settings-content");
    body.appendChild(this.tabContent);

    this.tabs = [
      { id: "display",  label: "Display",  render: (r) => this.renderDisplay(r) },
      { id: "audio",    label: "Audio",    render: (r) => this.renderAudio(r) },
      { id: "controls", label: "Controls", render: (r) => this.renderControls(r) },
      { id: "wifi",     label: "Wifi",     render: (r) => this.renderWifi(r) },
      { id: "roms",     label: "ROMs",     render: (r) => this.renderRoms(r) },
      { id: "about",    label: "About",    render: (r) => this.renderAbout(r) },
      // Discoverable exit — gamepad users get a visible "Back" entry
      // they can land on with left/right and press confirm. Click from
      // mouse/touch works too.
      { id: "back",     label: "← Back",   render: (r) => this.renderBackTab(r) },
    ];
    for (const tab of this.tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "af-settings-tab";
      btn.dataset.tabId = tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-testid", `settings-tab-${tab.id}`);
      btn.textContent = tab.label;
      btn.addEventListener("click", () => this.setActiveTab(tab.id));
      this.tabNav.appendChild(btn);
    }

    container.appendChild(this.root);
    this.unsubSettings = this.settings.onChange(() => this.rerender());
    this.setActiveTab("display");
  }

  unmount(): void {
    this.unsubSettings?.();
    this.unsubSettings = null;
    this.root.remove();
  }

  getActiveTab(): TabId {
    return this.activeTab;
  }

  setActiveTab(id: TabId): void {
    this.activeTab = id;
    for (const btn of Array.from(this.tabNav.querySelectorAll<HTMLElement>(".af-settings-tab"))) {
      const selected = btn.dataset.tabId === id;
      btn.classList.toggle("active", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    }
    this.rerender();
    // Land focus on the first interactive control of the new tab so
    // gamepad confirm/adjust targets something sensible right away.
    const first = this.getFocusables()[0];
    first?.focus({ preventScroll: true });
  }

  handleNavAction(action: NavAction): boolean {
    switch (action) {
      case "back":
      case "coin-hold":
        this.close();
        return true;
      case "up":
        this.moveFocus(-1);
        return true;
      case "down":
        this.moveFocus(1);
        return true;
      case "left":
        // Only adjusts a focused slider / select; tab switching goes
        // through the dedicated bumper actions so a focused range
        // control can own left/right without conflict.
        this.adjustFocused(-1);
        return true;
      case "right":
        this.adjustFocused(1);
        return true;
      case "bumper-right": {
        const idx = this.tabs.findIndex((t) => t.id === this.activeTab);
        this.setActiveTab(this.tabs[(idx + 1) % this.tabs.length]!.id);
        return true;
      }
      case "bumper-left": {
        const idx = this.tabs.findIndex((t) => t.id === this.activeTab);
        const n = this.tabs.length;
        this.setActiveTab(this.tabs[(idx - 1 + n) % n]!.id);
        return true;
      }
      case "confirm":
        this.activateFocused();
        return true;
      default:
        return false;
    }
  }

  // ── Gamepad navigation for controls in the active tab ─────────────

  private getFocusables(): HTMLElement[] {
    return Array.from(
      this.tabContent.querySelectorAll<HTMLElement>(
        "button, input, select, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => !(el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled);
  }

  private moveFocus(direction: -1 | 1): void {
    const controls = this.getFocusables();
    if (controls.length === 0) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = current < 0
      ? (direction > 0 ? 0 : controls.length - 1)
      : (current + direction + controls.length) % controls.length;
    controls[next]!.focus({ preventScroll: true });
    controls[next]!.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  private activateFocused(): void {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !this.tabContent.contains(el)) {
      // Nothing focused yet — grab the first control so the next confirm acts.
      this.moveFocus(1);
      return;
    }
    if (el instanceof HTMLButtonElement) {
      el.click();
      return;
    }
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox") {
        el.checked = !el.checked;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (el.type === "range") {
        // confirm on a slider is a no-op — left/right adjust the value.
      } else {
        el.click();
      }
      return;
    }
    if (el instanceof HTMLSelectElement) {
      el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /**
   * Left / right on a focused slider or select adjusts its value.
   * Returns `true` when the direction was consumed so the caller can
   * fall back to tab-switching when it wasn't.
   */
  private adjustFocused(direction: -1 | 1): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !this.tabContent.contains(el)) return false;
    if (el instanceof HTMLInputElement && el.type === "range") {
      const step = el.step ? Number(el.step) || 1 : 1;
      const min = el.min ? Number(el.min) : 0;
      const max = el.max ? Number(el.max) : 100;
      const current = Number(el.value) || 0;
      const next = Math.max(min, Math.min(max, current + direction * step));
      if (next === current) return true;
      el.value = String(next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (el instanceof HTMLSelectElement) {
      const next = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + direction));
      if (next === el.selectedIndex) return true;
      el.selectedIndex = next;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  private close(): void {
    this.unmount();
    this.onClose();
  }

  /**
   * Renders a single "Back to games" button — the gamepad users'
   * discoverable exit. Mirrors the old header Back button. Clicking
   * (or gamepad confirm on the focused element) closes the screen.
   */
  private renderBackTab(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-back-pane";
    wrap.setAttribute("data-testid", "settings-back-pane");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "af-settings-btn";
    btn.setAttribute("data-testid", "settings-back");
    btn.textContent = "← Back to games";
    btn.addEventListener("click", () => this.close());
    wrap.appendChild(btn);
    root.appendChild(wrap);
  }

  private rerender(): void {
    this.tabContent.textContent = "";
    const tab = this.tabs.find((t) => t.id === this.activeTab);
    if (tab) tab.render(this.tabContent);
  }

  // ── Display tab ────────────────────────────────────────────────
  private renderDisplay(root: HTMLElement): void {
    const s = this.settings.get();
    root.appendChild(this.makeCheckboxRow("CRT Filter", s.display.crtFilter, (v) =>
      this.settings.update({ display: { crtFilter: v } })
    ));
    root.appendChild(this.makeSelectRow(
      "Aspect Ratio",
      s.display.aspectRatio,
      [
        { value: "4:3", label: "4:3" },
        { value: "16:9", label: "16:9" },
        { value: "stretch", label: "Stretch" },
      ],
      (v) => this.settings.update({ display: { aspectRatio: v as AspectRatio } }),
      "setting-aspect-ratio"
    ));
    root.appendChild(this.makeCheckboxRow("Integer Scaling", s.display.integerScaling, (v) =>
      this.settings.update({ display: { integerScaling: v } })
    , "setting-integer-scaling"));
    root.appendChild(this.makeSliderRow(
      "Scanline Opacity",
      Math.round(s.display.scanlineOpacity * 100),
      0,
      100,
      (v) => this.settings.update({ display: { scanlineOpacity: v / 100 } })
    ));
    root.appendChild(this.makeCheckboxRow("TATE (vertical)", s.display.tate, (v) =>
      this.settings.update({ display: { tate: v } })
    ));
  }

  // ── Audio tab ──────────────────────────────────────────────────
  private renderAudio(root: HTMLElement): void {
    const s = this.settings.get();
    root.appendChild(this.makeSliderRow(
      "Master Volume",
      s.audio.masterVolume,
      0,
      100,
      (v) => this.settings.update({ audio: { masterVolume: v } }),
      "setting-volume"
    ));
    root.appendChild(this.makeSelectRow(
      "Audio Latency",
      s.audio.latency,
      [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      (v) => this.settings.update({ audio: { latency: v as AudioLatency } }),
      "setting-latency"
    ));
  }

  // ── Controls tab ───────────────────────────────────────────────
  private renderControls(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-controls";
    wrap.setAttribute("data-testid", "settings-controls");
    if (!this.controls) {
      wrap.appendChild(this.makePlaceholder("Controls binding not configured."));
      root.appendChild(wrap);
      return;
    }
    const mapping = this.controls.getMapping();
    const intro = document.createElement("p");
    intro.className = "af-settings-intro";
    intro.textContent = "Pick a device for each player, then toggle autofire per button.";
    wrap.appendChild(intro);

    const grid = document.createElement("div");
    grid.className = "af-settings-players";
    wrap.appendChild(grid);

    this.appendPlayerColumn(grid, 0, mapping);
    this.appendPlayerColumn(grid, 1, mapping);

    root.appendChild(wrap);
  }

  /** One column per player: device selector + Remap button + mapping list + autofire. */
  private appendPlayerColumn(grid: HTMLElement, player: PlayerIndex, mapping: InputMapping | null): void {
    const col = document.createElement("div");
    col.className = "af-settings-player";
    col.setAttribute("data-testid", `settings-player-${player + 1}`);

    const title = document.createElement("h3");
    title.className = "af-settings-autofire-title";
    title.textContent = `Player ${player + 1}`;
    col.appendChild(title);

    this.appendDeviceSelector(col, player);
    this.appendRemapButton(col, player);
    this.appendBindingsList(col, player, mapping);

    this.appendAutofireSection(col, player);

    grid.appendChild(col);
  }

  /**
   * Render the active bindings for a player — custom if the user ran
   * the remap flow, else the engine defaults (keyboard or gamepad
   * depending on device assignment). Previously we only listed P1's
   * custom mapping, leaving P2 and default P1 invisible.
   */
  private appendBindingsList(col: HTMLElement, player: PlayerIndex, mapping: InputMapping | null): void {
    const bindings = effectiveBindings(player, mapping);
    const list = document.createElement("dl");
    list.className = "af-settings-mapping-list";
    list.setAttribute("data-testid", `settings-bindings-p${player + 1}`);
    for (const role of MAPPING_ROLES) {
      const binding = bindings[role];
      if (!binding) continue;
      const dt = document.createElement("dt");
      dt.className = "af-settings-mapping-role";
      dt.textContent = role;
      const dd = document.createElement("dd");
      dd.className = "af-settings-mapping-binding";
      dd.textContent = formatBinding(binding);
      list.appendChild(dt);
      list.appendChild(dd);
    }
    col.appendChild(list);
  }

  private appendRemapButton(col: HTMLElement, player: PlayerIndex): void {
    if (!this.controls?.onRemapPlayer) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "af-settings-btn";
    btn.setAttribute("data-testid", `settings-remap-p${player + 1}`);
    btn.textContent = `Remap controls`;
    btn.addEventListener("click", () => this.controls!.onRemapPlayer!(player));
    col.appendChild(btn);
  }

  private appendDeviceSelector(col: HTMLElement, player: PlayerIndex): void {
    const row = document.createElement("label");
    row.className = "af-settings-row";
    const span = document.createElement("span");
    span.className = "af-settings-label";
    span.textContent = "Device";
    row.appendChild(span);

    const select = document.createElement("select");
    select.className = "af-settings-select";
    select.setAttribute("data-testid", `settings-device-p${player + 1}`);

    const kbOpt = document.createElement("option");
    kbOpt.value = "keyboard";
    kbOpt.textContent = "Keyboard";
    select.appendChild(kbOpt);

    const gamepads = listConnectedGamepads();
    const current = loadPlayerAssignment(player);
    // If the saved id is offline, still offer it so the selector
    // reflects the saved choice — the engine will reconnect on plug-in.
    const knownIds = new Set(gamepads.map((g) => g.id));
    if (current.kind === "gamepad" && current.gamepadId && !knownIds.has(current.gamepadId)) {
      gamepads.push({ index: -1, id: current.gamepadId });
    }

    for (const gp of gamepads) {
      const opt = document.createElement("option");
      opt.value = `gp:${gp.id}`;
      const connected = gp.index >= 0 ? "" : " (offline)";
      opt.textContent = `${prettyGamepadName(gp.id)}${connected}`;
      select.appendChild(opt);
    }

    select.value = current.kind === "gamepad" && current.gamepadId ? `gp:${current.gamepadId}` : "keyboard";

    select.addEventListener("change", () => {
      const v = select.value;
      if (v === "keyboard") {
        savePlayerAssignment(player, { kind: "keyboard", gamepadId: null });
      } else if (v.startsWith("gp:")) {
        savePlayerAssignment(player, { kind: "gamepad", gamepadId: v.slice(3) });
      }
      // Rerender so both columns update if we reassigned a shared pad.
      this.rerender();
    });

    row.appendChild(select);
    col.appendChild(row);
  }

  /**
   * Per-player autofire toggles. Writes to `cps1-autofire-p1` or
   * `cps1-autofire-p2`; the engine re-reads the key at InputManager
   * construction, so changes apply on the next game launch.
   */
  private appendAutofireSection(col: HTMLElement, player: PlayerIndex): void {
    const section = document.createElement("div");
    section.className = "af-settings-autofire";
    section.setAttribute("data-testid", `settings-autofire-p${player + 1}`);

    const title = document.createElement("h4");
    title.className = "af-settings-autofire-title";
    title.textContent = "Autofire";
    section.appendChild(title);

    const labels: Record<AutofireButton, string> = {
      button1: "Btn 1 (LP)",
      button2: "Btn 2 (MP)",
      button3: "Btn 3 (HP)",
      button4: "Btn 4 (LK)",
      button5: "Btn 5 (MK)",
      button6: "Btn 6 (HK)",
    };
    const current = loadAutofire(player);
    for (const key of AUTOFIRE_BUTTONS) {
      const row = document.createElement("label");
      row.className = "af-settings-row af-settings-autofire-row";
      const span = document.createElement("span");
      span.className = "af-settings-label";
      span.textContent = labels[key];
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "af-settings-toggle";
      cb.setAttribute("data-testid", `autofire-p${player + 1}-${key}`);
      cb.checked = current.has(key);
      cb.addEventListener("change", () => {
        toggleAutofire(player, key, cb.checked);
      });
      row.appendChild(span);
      row.appendChild(cb);
      section.appendChild(row);
    }

    col.appendChild(section);
  }

  // ── Wifi tab ───────────────────────────────────────────────────
  private renderWifi(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-network";
    wrap.setAttribute("data-testid", "settings-wifi");
    wrap.appendChild(this.makePlaceholder("Wifi setup — coming soon."));
    root.appendChild(wrap);
  }

  // ── ROMs tab ───────────────────────────────────────────────────
  private renderRoms(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-storage";
    wrap.setAttribute("data-testid", "settings-roms");

    // Phone-upload section: Room ID + signal status + QR + regenerate.
    // Moved from the old Network tab because it's really "how to push a
    // new ROM from the phone", which belongs next to the ROM list.
    if (this.network) {
      const addHeading = document.createElement("h3");
      addHeading.className = "af-settings-section-title";
      addHeading.textContent = "Add a ROM with your phone or your computer";
      wrap.appendChild(addHeading);

      const rows: Array<[string, string]> = [
        ["Room ID", this.network.getRoomId()],
        ["Signal", this.network.isOpen() ? "Open (waiting)" : "Closed"],
      ];
      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "af-settings-row";
        const l = document.createElement("span");
        l.className = "af-settings-label";
        l.textContent = label;
        const v = document.createElement("span");
        v.className = "af-settings-value";
        v.textContent = value;
        row.appendChild(l);
        row.appendChild(v);
        wrap.appendChild(row);
      }

      const qrWrap = document.createElement("div");
      qrWrap.className = "af-settings-qr";
      qrWrap.setAttribute("data-testid", "settings-roms-qr");
      const qr = new QrCode(qrWrap, { size: 200, baseUrl: resolvePhoneBaseUrl() });
      qr.setRoomId(this.network.getRoomId()).catch(() => { /* jsdom: no canvas */ });
      wrap.appendChild(qrWrap);

      const hint = document.createElement("p");
      hint.className = "af-settings-hint";
      hint.textContent = "Scan with your phone to upload ROMs or open the remote.";
      wrap.appendChild(hint);

      const regen = document.createElement("button");
      regen.type = "button";
      regen.className = "af-settings-btn af-settings-btn--danger";
      regen.setAttribute("data-testid", "settings-roms-regenerate");
      regen.textContent = "Regenerate Room ID";
      regen.addEventListener("click", () => this.network!.onRegenerate());
      wrap.appendChild(regen);
    }

    if (!this.storage) {
      wrap.appendChild(this.makePlaceholder("Storage binding not configured."));
      root.appendChild(wrap);
      return;
    }

    const usageHeading = document.createElement("h3");
    usageHeading.className = "af-settings-section-title";
    usageHeading.textContent = "ROMs usage";
    wrap.appendChild(usageHeading);

    const quotaRow = document.createElement("div");
    quotaRow.className = "af-settings-row";
    quotaRow.setAttribute("data-testid", "settings-roms-quota");
    quotaRow.textContent = "Usage: computing…";
    wrap.appendChild(quotaRow);

    const listWrap = document.createElement("div");
    listWrap.className = "af-settings-rom-list";
    listWrap.setAttribute("data-testid", "settings-roms-list");
    listWrap.textContent = "Loading ROMs…";
    wrap.appendChild(listWrap);

    root.appendChild(wrap);

    // Async refresh — tab re-renders completely when setActiveTab fires,
    // so we're guaranteed a fresh snapshot on every visit.
    void this.refreshStorage(quotaRow, listWrap);
  }

  private async refreshStorage(quotaRow: HTMLElement, listWrap: HTMLElement): Promise<void> {
    if (!this.storage) return;
    try {
      const estimate = await this.storage.estimate();
      quotaRow.textContent = `Usage: ${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`;
    } catch {
      quotaRow.textContent = "Usage: unavailable";
    }
    let roms: RomRecord[];
    try {
      roms = await this.storage.listRoms();
    } catch {
      listWrap.textContent = "Failed to load ROMs.";
      return;
    }
    listWrap.textContent = "";
    if (roms.length === 0) {
      listWrap.appendChild(this.makePlaceholder("No ROMs installed."));
      return;
    }
    for (const rom of roms) {
      const row = document.createElement("div");
      row.className = "af-settings-rom-row";
      row.setAttribute("data-testid", `settings-storage-rom-${rom.id}`);

      const info = document.createElement("span");
      info.className = "af-settings-rom-info";
      info.textContent = `${rom.id} · ${rom.system} · ${formatBytes(rom.size)}`;
      row.appendChild(info);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "af-settings-btn af-settings-btn--danger";
      del.setAttribute("data-testid", `settings-storage-delete-${rom.id}`);
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        void (async () => {
          try {
            await this.storage!.deleteRom(rom.id);
            row.remove();
          } catch {
            info.textContent += " · delete failed";
          }
        })();
      });
      row.appendChild(del);

      listWrap.appendChild(row);
    }
  }

  private makePlaceholder(text: string): HTMLElement {
    const p = document.createElement("p");
    p.className = "af-settings-placeholder";
    p.textContent = text;
    return p;
  }

  // ── About tab ──────────────────────────────────────────────────
  private renderAbout(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-about";
    wrap.setAttribute("data-testid", "settings-about");
    const items: Array<[string, string]> = [
      ["Version", this.version],
      ["Platform", "Sprixe Arcade"],
      ["Engine", "@sprixe/engine"],
    ];
    for (const [label, value] of items) {
      const row = document.createElement("div");
      row.className = "af-settings-row";
      const l = document.createElement("span");
      l.className = "af-settings-label";
      l.textContent = label;
      const v = document.createElement("span");
      v.className = "af-settings-value";
      v.textContent = value;
      row.appendChild(l);
      row.appendChild(v);
      wrap.appendChild(row);
    }
    root.appendChild(wrap);
  }

  // ── Row helpers ────────────────────────────────────────────────
  private makeCheckboxRow(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    testId?: string
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "af-settings-row";
    if (testId) row.setAttribute("data-testid", testId);
    const l = document.createElement("span");
    l.className = "af-settings-label";
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "af-settings-toggle";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    row.appendChild(l);
    row.appendChild(input);
    return row;
  }

  private makeSelectRow(
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    onChange: (v: string) => void,
    testId?: string
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "af-settings-row";
    if (testId) row.setAttribute("data-testid", testId);
    const l = document.createElement("span");
    l.className = "af-settings-label";
    l.textContent = label;
    const select = document.createElement("select");
    select.className = "af-settings-select";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("change", () => onChange(select.value));
    row.appendChild(l);
    row.appendChild(select);
    return row;
  }

  private makeSliderRow(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    testId?: string
  ): HTMLElement {
    const row = document.createElement("label");
    row.className = "af-settings-row";
    if (testId) row.setAttribute("data-testid", testId);
    const l = document.createElement("span");
    l.className = "af-settings-label";
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.className = "af-settings-slider";
    const readout = document.createElement("span");
    readout.className = "af-settings-readout";
    readout.textContent = String(value);
    input.addEventListener("input", () => {
      readout.textContent = input.value;
    });
    input.addEventListener("change", () => onChange(Number(input.value)));
    row.appendChild(l);
    row.appendChild(input);
    row.appendChild(readout);
    return row;
  }
}

function formatBinding(binding: InputMapping["p1"][MappingRole]): string {
  if (!binding) return "—";
  if (binding.kind === "button") return `Button ${binding.index}`;
  if (binding.kind === "axis") return `Axis ${binding.index} ${binding.dir > 0 ? "+" : "-"}`;
  return `Key ${binding.code}`;
}

/**
 * Build the active binding set for a player:
 *   - if the user captured a custom slot, use it verbatim
 *   - else project the engine defaults based on the device assigned
 *     (keyboard → DEFAULT_P{n}_MAPPING, gamepad → DEFAULT_GP_MAPPING)
 * So the Controls tab always shows what the game will actually see.
 */
function effectiveBindings(
  player: PlayerIndex,
  mapping: InputMapping | null,
): Partial<Record<MappingRole, InputBinding>> {
  const custom = player === 0 ? mapping?.p1 : mapping?.p2;
  if (custom && Object.keys(custom).length > 0) return custom;

  const assignment = loadPlayerAssignment(player);
  if (assignment.kind === "gamepad") {
    return projectGamepadDefaults(DEFAULT_GP_MAPPING);
  }
  const keyDefaults = player === 0 ? DEFAULT_P1_MAPPING : DEFAULT_P2_MAPPING;
  return projectKeyDefaults(keyDefaults);
}

function projectKeyDefaults(defaults: KeyMapping): Partial<Record<MappingRole, InputBinding>> {
  const out: Partial<Record<MappingRole, InputBinding>> = {};
  for (const role of MAPPING_ROLES) {
    const code = defaults[role];
    if (code) out[role] = { kind: "key", code };
  }
  return out;
}

function projectGamepadDefaults(defaults: GamepadMapping): Partial<Record<MappingRole, InputBinding>> {
  const out: Partial<Record<MappingRole, InputBinding>> = {};
  for (const role of MAPPING_ROLES) {
    const index = defaults[role];
    if (typeof index === "number") out[role] = { kind: "button", index };
  }
  return out;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

export type { SettingsV1 };
