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
import type { InputMapping, MappingRole } from "../../input/mapping-store";
import type { RomRecord } from "../../storage/rom-db";

type TabId = "display" | "audio" | "controls" | "network" | "storage" | "about";

interface TabDef {
  id: TabId;
  label: string;
  render: (root: HTMLElement) => void;
}

/** Controls tab — displays the saved mapping + resets it. */
export interface ControlsBinding {
  getMapping: () => InputMapping | null;
  onReset: () => void;
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
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "af-settings-back";
    backBtn.setAttribute("data-testid", "settings-back");
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", () => this.close());
    header.appendChild(backBtn);
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
      { id: "network",  label: "Network",  render: (r) => this.renderNetwork(r) },
      { id: "storage",  label: "Storage",  render: (r) => this.renderStorage(r) },
      { id: "about",    label: "About",    render: (r) => this.renderAbout(r) },
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
  }

  handleNavAction(action: NavAction): boolean {
    switch (action) {
      case "back":
      case "coin-hold":
        this.close();
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
      default:
        return false;
    }
  }

  private close(): void {
    this.unmount();
    this.onClose();
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
    intro.textContent = mapping
      ? `Current mapping: ${mapping.type}`
      : "No mapping saved yet.";
    wrap.appendChild(intro);

    if (mapping) {
      const list = document.createElement("dl");
      list.className = "af-settings-mapping-list";
      for (const [role, binding] of Object.entries(mapping.p1) as [MappingRole, InputMapping["p1"][MappingRole]][]) {
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
      wrap.appendChild(list);
    }

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "af-settings-btn af-settings-btn--danger";
    resetBtn.setAttribute("data-testid", "settings-controls-reset");
    resetBtn.textContent = "Reset mapping";
    resetBtn.addEventListener("click", () => this.controls!.onReset());
    wrap.appendChild(resetBtn);

    root.appendChild(wrap);
  }

  // ── Network tab ────────────────────────────────────────────────
  private renderNetwork(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-network";
    wrap.setAttribute("data-testid", "settings-network");
    if (!this.network) {
      wrap.appendChild(this.makePlaceholder("Network binding not configured."));
      root.appendChild(wrap);
      return;
    }
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
    const regen = document.createElement("button");
    regen.type = "button";
    regen.className = "af-settings-btn af-settings-btn--danger";
    regen.setAttribute("data-testid", "settings-network-regenerate");
    regen.textContent = "Regenerate Room ID";
    regen.addEventListener("click", () => this.network!.onRegenerate());
    wrap.appendChild(regen);

    root.appendChild(wrap);
  }

  // ── Storage tab ────────────────────────────────────────────────
  private renderStorage(root: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "af-settings-storage";
    wrap.setAttribute("data-testid", "settings-storage");
    if (!this.storage) {
      wrap.appendChild(this.makePlaceholder("Storage binding not configured."));
      root.appendChild(wrap);
      return;
    }

    const quotaRow = document.createElement("div");
    quotaRow.className = "af-settings-row";
    quotaRow.setAttribute("data-testid", "settings-storage-quota");
    quotaRow.textContent = "Usage: computing…";
    wrap.appendChild(quotaRow);

    const listWrap = document.createElement("div");
    listWrap.className = "af-settings-rom-list";
    listWrap.setAttribute("data-testid", "settings-storage-list");
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
    let roms: RomRecord[] = [];
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
      del.addEventListener("click", async () => {
        try {
          await this.storage!.deleteRom(rom.id);
          row.remove();
        } catch {
          info.textContent += " · delete failed";
        }
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
