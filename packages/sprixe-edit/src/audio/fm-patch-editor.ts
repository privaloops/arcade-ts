/**
 * FM Patch Editor — macro-style UI for editing YM2151 instruments.
 *
 * 8 controls total: Algorithm, Feedback, Volume, Brightness, Attack, Decay, Sustain, Release.
 * Each macro targets the right operators (carriers vs modulators) based on the current algorithm.
 */

import type { Emulator } from '@sprixe/engine/emulator';
import {
  parseSoundDriver,
  readPatch,
  writePatch,
  patchToRegisters,
  VOICE_SIZE,
  type FmPatch,
  type FmOperator,
  type SoundDriverInfo,
} from '@sprixe/engine/audio/cps1-sound-driver';

// ── Algorithm info ───────────────────────────────────────────────────────────

const ALGO_DESCRIPTIONS: readonly string[] = [
  'Serial',           // 0
  'Branch',           // 1
  'Warm',             // 2
  'Bright',           // 3
  'Dual',             // 4
  'Organ',            // 5
  'Wide',             // 6
  'Additive',         // 7
];

/** Carrier operator indices for each algorithm */
const ALGO_CARRIERS: readonly number[][] = [
  [3], [3], [3], [3],       // 0-3: OP4 only
  [1, 3],                    // 4: OP2 + OP4
  [1, 2, 3],                 // 5: OP2 + OP3 + OP4
  [1, 2, 3],                 // 6: OP2 + OP3 + OP4
  [0, 1, 2, 3],              // 7: all
];

/** Modulator indices = all ops that are NOT carriers */
function getModulators(algo: number): number[] {
  const carriers = ALGO_CARRIERS[algo] ?? [3];
  return [0, 1, 2, 3].filter(i => !carriers.includes(i));
}

// ── Macro definitions ────────────────────────────────────────────────────────

interface MacroDef {
  id: string;
  label: string;
  min: number;
  max: number;
  /** Read the macro value from a patch */
  read(patch: FmPatch): number;
  /** Write the macro value to a patch */
  write(patch: FmPatch, value: number): void;
}

const MACROS: readonly MacroDef[] = [
  {
    id: 'volume', label: 'Volume', min: 0, max: 127,
    read(p) {
      // Average carrier TL, inverted (127 = loud)
      const carriers = ALGO_CARRIERS[p.algorithm] ?? [3];
      let sum = 0;
      for (const c of carriers) sum += (p.operators[c] as FmOperator).tl;
      return 127 - Math.round(sum / carriers.length);
    },
    write(p, v) {
      const tl = 127 - v;
      const carriers = ALGO_CARRIERS[p.algorithm] ?? [3];
      for (const c of carriers) (p.operators[c] as FmOperator).tl = tl;
    },
  },
  {
    id: 'brightness', label: 'Brightness', min: 0, max: 127,
    read(p) {
      const mods = getModulators(p.algorithm);
      if (mods.length === 0) return 0;
      let sum = 0;
      for (const m of mods) sum += (p.operators[m] as FmOperator).tl;
      return 127 - Math.round(sum / mods.length);
    },
    write(p, v) {
      const tl = 127 - v;
      for (const m of getModulators(p.algorithm)) (p.operators[m] as FmOperator).tl = tl;
    },
  },
  {
    id: 'attack', label: 'Attack', min: 0, max: 31,
    read(p) {
      const carriers = ALGO_CARRIERS[p.algorithm] ?? [3];
      return (p.operators[carriers[0]!] as FmOperator).ar;
    },
    write(p, v) {
      for (const c of (ALGO_CARRIERS[p.algorithm] ?? [3])) (p.operators[c] as FmOperator).ar = v;
    },
  },
  {
    id: 'decay', label: 'Decay', min: 0, max: 31,
    read(p) {
      const carriers = ALGO_CARRIERS[p.algorithm] ?? [3];
      return (p.operators[carriers[0]!] as FmOperator).d1r;
    },
    write(p, v) {
      for (const c of (ALGO_CARRIERS[p.algorithm] ?? [3])) (p.operators[c] as FmOperator).d1r = v;
    },
  },
  {
    id: 'sustain', label: 'Sustain', min: 0, max: 15,
    read(p) {
      const carriers = ALGO_CARRIERS[p.algorithm] ?? [3];
      return (p.operators[carriers[0]!] as FmOperator).d1l;
    },
    write(p, v) {
      for (const c of (ALGO_CARRIERS[p.algorithm] ?? [3])) (p.operators[c] as FmOperator).d1l = v;
    },
  },
  {
    id: 'release', label: 'Release', min: 0, max: 15,
    read(p) {
      const carriers = ALGO_CARRIERS[p.algorithm] ?? [3];
      return (p.operators[carriers[0]!] as FmOperator).rr;
    },
    write(p, v) {
      for (const c of (ALGO_CARRIERS[p.algorithm] ?? [3])) (p.operators[c] as FmOperator).rr = v;
    },
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export class FmPatchEditor {
  private readonly emulator: Emulator;
  private readonly container: HTMLDivElement;

  private driverInfo: SoundDriverInfo | null = null;
  private currentPatchIndex = 0;
  private currentPatch: FmPatch | null = null;
  private clipboardPatch: FmPatch | null = null;
  private previewChannel = 0;
  private lastRomName = '';

  // DOM
  private channelLabel: HTMLSpanElement | null = null;
  private patchNumEl: HTMLSpanElement | null = null;
  private patchCountEl: HTMLSpanElement | null = null;
  private modifiedEl: HTMLSpanElement | null = null;
  private algoButtons: HTMLButtonElement[] = [];
  private fbSlider: HTMLInputElement | null = null;
  private fbValue: HTMLSpanElement | null = null;
  private macroSliders = new Map<string, HTMLInputElement>();
  private macroValues = new Map<string, HTMLSpanElement>();

  constructor(emulator: Emulator) {
    this.emulator = emulator;
    this.container = document.createElement('div');
    this.container.className = 'synth-editor';
    this.buildDOM();
  }

  getElement(): HTMLDivElement { return this.container; }
  onDeactivate(): void { /* nothing to clean up */ }

  onGameChange(): void {
    const store = this.emulator.getRomStore();
    const romName = store?.name ?? '';
    if (romName === this.lastRomName && this.driverInfo) return;
    this.lastRomName = romName;
    this.driverInfo = null;
    this.currentPatchIndex = 0;
    this.currentPatch = null;
    this.tryParseDriver();
  }

  editChannel(channel: number): void {
    this.onGameChange();
    if (!this.driverInfo) return;
    this.previewChannel = channel;
    if (this.channelLabel) this.channelLabel.textContent = `FM${channel + 1}`;

    const store = this.emulator.getRomStore();
    if (!store) return;

    const viz = this.emulator.getVizReader();
    if (!viz) { this.loadPatch(0); return; }

    const fm = viz.getFm(channel);
    const channelFbAlg = fm.connect;
    const channelAlg = channelFbAlg & 7;
    const channelFb = (channelFbAlg >> 3) & 7;

    let exactMatch = -1;
    let algMatch = -1;
    for (let i = 0; i < this.driverInfo.patchCount; i++) {
      const patch = readPatch(store.audioRom, this.driverInfo, i);
      if (patch.algorithm === channelAlg && patch.feedback === channelFb && exactMatch < 0) exactMatch = i;
      if (patch.algorithm === channelAlg && algMatch < 0) algMatch = i;
    }
    this.loadPatch(exactMatch >= 0 ? exactMatch : (algMatch >= 0 ? algMatch : 0));
  }

  // ── DOM ─────────────────────────────────────────────────────────────────

  private buildDOM(): void {
    const c = this.container;
    c.innerHTML = '';

    // Nav: FM2 — ◀ 07 / 100 ▶
    const nav = el('div', 'synth-nav');
    this.channelLabel = el('span', 'synth-channel-label') as HTMLSpanElement;
    this.channelLabel.textContent = 'FM1';
    const instrLabel = el('span', 'synth-nav-sep');
    instrLabel.textContent = 'Instrument';
    const prevBtn = el('button', 'synth-nav-btn') as HTMLButtonElement;
    prevBtn.textContent = '\u25C0';
    prevBtn.addEventListener('click', () => this.navigatePatch(-1));
    const nextBtn = el('button', 'synth-nav-btn') as HTMLButtonElement;
    nextBtn.textContent = '\u25B6';
    nextBtn.addEventListener('click', () => this.navigatePatch(1));
    this.patchNumEl = el('span', 'synth-patch-num') as HTMLSpanElement;
    this.patchNumEl.textContent = '00';
    this.patchCountEl = el('span', 'synth-patch-count') as HTMLSpanElement;
    this.patchCountEl.textContent = '/ 0';
    this.modifiedEl = el('span', 'synth-modified') as HTMLSpanElement;
    nav.append(this.channelLabel, instrLabel, prevBtn, this.patchNumEl, this.patchCountEl, nextBtn, this.modifiedEl);
    c.appendChild(nav);

    // Preset: algorithm buttons
    const algoRow = el('div', 'synth-algo-row');
    const presetLabel = el('span', 'synth-label');
    presetLabel.textContent = 'Preset';
    algoRow.appendChild(presetLabel);
    for (let a = 0; a < 8; a++) {
      const btn = el('button', 'synth-algo-btn') as HTMLButtonElement;
      btn.textContent = String(a);
      btn.title = ALGO_DESCRIPTIONS[a]!;
      btn.addEventListener('click', () => this.setAlgorithm(a));
      this.algoButtons.push(btn);
      algoRow.appendChild(btn);
    }
    c.appendChild(algoRow);

    // Feedback slider
    const fbRow = this.buildSliderRow('Feedback', 0, 7);
    this.fbSlider = fbRow.slider;
    this.fbValue = fbRow.valueEl;
    this.fbSlider.addEventListener('input', () => this.onFeedbackChange());
    c.appendChild(fbRow.row);

    // Macro sliders
    for (const macro of MACROS) {
      const { row, slider, valueEl } = this.buildSliderRow(macro.label, macro.min, macro.max);
      slider.addEventListener('input', () => this.onMacroChange(macro, slider));
      this.macroSliders.set(macro.id, slider);
      this.macroValues.set(macro.id, valueEl);
      c.appendChild(row);
    }

    // Actions
    const actions = el('div', 'synth-actions');
    const testBtn = el('button', 'ctrl-btn synth-action-btn synth-test-btn') as HTMLButtonElement;
    testBtn.textContent = '\u25B6 Test';
    testBtn.addEventListener('click', () => this.playTestNote());
    const resetBtn = el('button', 'ctrl-btn synth-action-btn') as HTMLButtonElement;
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.resetPatch());
    const exportBtn = el('button', 'ctrl-btn synth-action-btn') as HTMLButtonElement;
    exportBtn.textContent = 'Export ROM';
    exportBtn.addEventListener('click', () => this.exportRom());
    actions.append(testBtn, resetBtn, exportBtn);
    c.appendChild(actions);

    // Placeholder
    const ph = el('div', 'synth-placeholder');
    ph.id = 'synth-placeholder';
    ph.textContent = 'Load a ROM to use the FM Patch Editor';
    c.appendChild(ph);
  }

  private buildSliderRow(label: string, min: number, max: number): { row: HTMLElement; slider: HTMLInputElement; valueEl: HTMLSpanElement } {
    const row = el('div', 'synth-param-row');
    const lbl = el('span', 'synth-label');
    lbl.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = '0';
    slider.className = 'synth-slider';
    const valueEl = el('span', 'synth-value') as HTMLSpanElement;
    valueEl.textContent = '0';
    row.append(lbl, slider, valueEl);
    return { row, slider, valueEl };
  }

  // ── Driver ──────────────────────────────────────────────────────────────

  private tryParseDriver(): void {
    const store = this.emulator.getRomStore();
    if (!store) { this.showPlaceholder(true); return; }
    try {
      this.driverInfo = parseSoundDriver(store.audioRom);
      this.showPlaceholder(false);
      this.patchCountEl!.textContent = `/ ${this.driverInfo.patchCount}`;
      this.loadPatch(0);
    } catch {
      this.showPlaceholder(true, 'No FM patches found in this ROM');
    }
  }

  private showPlaceholder(show: boolean, message?: string): void {
    const ph = this.container.querySelector('#synth-placeholder') as HTMLElement | null;
    if (ph) {
      ph.style.display = show ? '' : 'none';
      if (message) ph.textContent = message;
    }
    const sections = this.container.querySelectorAll('.synth-nav, .synth-algo-row, .synth-param-row, .synth-actions');
    sections.forEach(s => (s as HTMLElement).style.display = show ? 'none' : '');
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  private navigatePatch(delta: number): void {
    if (!this.driverInfo) return;
    const next = this.currentPatchIndex + delta;
    if (next < 0 || next >= this.driverInfo.patchCount) return;
    this.loadPatch(next);
  }

  private loadPatch(index: number): void {
    const store = this.emulator.getRomStore();
    if (!store || !this.driverInfo) return;
    this.currentPatchIndex = index;
    this.currentPatch = readPatch(store.audioRom, this.driverInfo, index);
    this.patchNumEl!.textContent = String(index).padStart(2, '0');
    this.syncUI();
    this.updateModifiedIndicator();
  }

  // ── UI sync ─────────────────────────────────────────────────────────────

  private syncUI(): void {
    if (!this.currentPatch) return;
    const p = this.currentPatch;

    for (let a = 0; a < 8; a++) {
      this.algoButtons[a]?.classList.toggle('active', a === p.algorithm);
    }

    if (this.fbSlider) this.fbSlider.value = String(p.feedback);
    if (this.fbValue) this.fbValue.textContent = String(p.feedback);

    for (const macro of MACROS) {
      const val = macro.read(p);
      const slider = this.macroSliders.get(macro.id);
      const valueEl = this.macroValues.get(macro.id);
      if (slider) slider.value = String(val);
      if (valueEl) valueEl.textContent = String(val);
    }
  }

  // ── Changes ─────────────────────────────────────────────────────────────

  private setAlgorithm(algo: number): void {
    if (!this.currentPatch) return;
    this.currentPatch.algorithm = algo;
    this.syncUI();
    this.commitPatch();
  }

  private onFeedbackChange(): void {
    if (!this.currentPatch || !this.fbSlider) return;
    const val = parseInt(this.fbSlider.value, 10);
    this.currentPatch.feedback = val;
    if (this.fbValue) this.fbValue.textContent = String(val);
    this.commitPatch();
  }

  private onMacroChange(macro: MacroDef, slider: HTMLInputElement): void {
    if (!this.currentPatch) return;
    const val = parseInt(slider.value, 10);
    macro.write(this.currentPatch, val);
    const valueEl = this.macroValues.get(macro.id);
    if (valueEl) valueEl.textContent = String(val);
    this.commitPatch();
  }

  private commitPatch(): void {
    const store = this.emulator.getRomStore();
    if (!store || !this.driverInfo || !this.currentPatch) return;
    writePatch(store.audioRom, this.driverInfo, this.currentPatchIndex, this.currentPatch);
    const offset = this.driverInfo.patchTableOffset + this.currentPatchIndex * this.driverInfo.patchSize;
    this.emulator.syncAudioRom(offset, store.audioRom.subarray(offset, offset + VOICE_SIZE));
    this.updateModifiedIndicator();
  }

  private updateModifiedIndicator(): void {
    if (!this.modifiedEl) return;
    const store = this.emulator.getRomStore();
    if (store && store.isModified('audio')) {
      this.modifiedEl.textContent = '\u2022 modified';
      this.modifiedEl.style.display = '';
    } else {
      this.modifiedEl.style.display = 'none';
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  private playTestNote(): void {
    if (!this.currentPatch) return;
    const ch = this.previewChannel;

    // Suspend Z80 so it can't interfere
    this.emulator.suspendAudio();

    // Set all patch registers + trigger note
    const writes = patchToRegisters(this.currentPatch, ch);
    writes.push({ register: 0x08, value: ch });           // key-off first
    writes.push({ register: 0x28 + ch, value: 0x4E });    // C4
    writes.push({ register: 0x30 + ch, value: 0x00 });    // KF=0
    writes.push({ register: 0x08, value: 0x78 | ch });    // key-on
    this.emulator.postFmOverride(writes);

    // Stop after 600ms and resume game audio
    setTimeout(() => {
      this.emulator.postFmOverride([{ register: 0x08, value: ch }]);
      this.emulator.resumeAudio();
    }, 600);
  }

  private resetPatch(): void {
    const store = this.emulator.getRomStore();
    if (!store || !this.driverInfo) return;
    const original = store.getOriginal('audio');
    const pristine = readPatch(original, this.driverInfo, this.currentPatchIndex);
    writePatch(store.audioRom, this.driverInfo, this.currentPatchIndex, pristine);
    const offset = this.driverInfo.patchTableOffset + this.currentPatchIndex * this.driverInfo.patchSize;
    this.emulator.syncAudioRom(offset, store.audioRom.subarray(offset, offset + VOICE_SIZE));
    this.loadPatch(this.currentPatchIndex);
  }

  private async exportRom(): Promise<void> {
    const store = this.emulator.getRomStore();
    if (!store) return;
    const blob = await store.exportZip();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.name}_modified.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
