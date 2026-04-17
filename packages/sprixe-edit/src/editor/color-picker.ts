/**
 * Color Picker Dialog — extracted from SpriteEditorUI.
 *
 * Builds a palette color editing dialog with hue shift, saturation,
 * transparency toggle, and reset. Attaches to a container element.
 */

import type { SpriteEditor } from './sprite-editor';
import { rgbToHsl, hslToRgb } from './palette-editor';
import { setTooltip } from '../ui/tooltip';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a color picker dialog for a palette color index.
 * Builds DOM elements and attaches them to `container`.
 */
export function openColorPicker(
  editor: SpriteEditor,
  container: HTMLDivElement,
  colorIndex: number,
  nuanceGroup: Set<number>,
): void {
  const palette = editor.getCurrentPalette();
  const [r, g, b] = palette[colorIndex] ?? [0, 0, 0];
  const isTransparent = colorIndex === 15;

  // Remove any existing color dialog
  container.querySelector('.edit-color-dialog')?.remove();

  const dialog = el('div', 'edit-color-dialog') as HTMLDivElement;

  // Color input
  const input = document.createElement('input');
  input.type = 'color';
  input.value = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  input.className = 'edit-color-input';

  // Transparent checkbox
  const transLabel = el('label', 'edit-color-trans-label') as HTMLLabelElement;
  const transCb = document.createElement('input');
  transCb.type = 'checkbox';
  transCb.checked = isTransparent;
  transLabel.append(transCb, ' Transparent');
  setTooltip(transLabel, 'Mark this color index as transparent');

  // Nuances checkbox (hue shift similar colors)
  const nuancesLabel = el('label', 'edit-color-trans-label') as HTMLLabelElement;
  const nuancesCb = document.createElement('input');
  nuancesCb.type = 'checkbox';
  nuancesCb.checked = false;
  nuancesLabel.append(nuancesCb, ' Nuances');
  setTooltip(nuancesLabel, 'Hue-shift all similar colors together (or selected nuance group)');

  // Reset button
  const resetBtn = el('button', 'edit-color-reset-btn') as HTMLButtonElement;
  resetBtn.textContent = 'Reset';
  setTooltip(resetBtn, 'Reset palette to original ROM colors');

  // Saturation slider
  const satLabel = el('label', 'edit-color-sat-label') as HTMLLabelElement;
  satLabel.textContent = 'Saturation';
  const satSlider = document.createElement('input');
  satSlider.type = 'range';
  satSlider.min = '0';
  satSlider.max = '200';
  satSlider.value = '100';
  satSlider.className = 'edit-color-sat-slider';
  satLabel.appendChild(satSlider);

  satLabel.appendChild(resetBtn);
  dialog.append(input, transLabel, nuancesLabel, satLabel);
  container.appendChild(dialog);

  // Snapshot original RGB for reset
  const origRgb = palette.map(([cr, cg, cb]) => [cr, cg, cb] as [number, number, number]);

  // Store original palette HSL for hue shift calculation
  const origHsl = palette.map(([cr, cg, cb]) => rgbToHsl(cr, cg, cb));
  const [origH] = origHsl[colorIndex] ?? [0, 0, 0];
  const HUE_TOLERANCE = 30 / 360; // ±30°

  /** Update swatch background colors in-place */
  const updateSwatches = (): void => {
    const updatedPalette = editor.getCurrentPalette();
    const swatches = container.querySelectorAll('.edit-swatch');
    for (let i = 0; i < Math.min(swatches.length, 15); i++) {
      const sw = swatches[i] as HTMLDivElement;
      const [ur, ug, ub] = updatedPalette[i] ?? [0, 0, 0];
      sw.style.backgroundColor = `rgb(${ur},${ug},${ub})`;
    }
  };

  input.addEventListener('input', () => {
    const hex = input.value;
    const nr = parseInt(hex.slice(1, 3), 16);
    const ng = parseInt(hex.slice(3, 5), 16);
    const nb = parseInt(hex.slice(5, 7), 16);

    if (nuancesCb.checked) {
      const [newH] = rgbToHsl(nr, ng, nb);
      const hueShift = newH - origH;

      // Use manually selected nuance group if any, otherwise auto-detect by hue
      const targets = nuanceGroup.size > 0
        ? nuanceGroup
        : new Set(Array.from({ length: 15 }, (_, i) => i).filter(i => {
            const [h, s] = origHsl[i] ?? [0, 0, 0];
            if (s < 0.05) return false;
            const dist = Math.min(Math.abs(h - origH), 1 - Math.abs(h - origH));
            return dist <= HUE_TOLERANCE;
          }));

      for (const i of targets) {
        const [h, s, l] = origHsl[i] ?? [0, 0, 0];
        const shiftedH = ((h + hueShift) % 1 + 1) % 1;
        const [sr, sg, sb] = hslToRgb(shiftedH, s, l);
        editor.editPaletteColor(i, sr, sg, sb);
      }
    } else {
      editor.editPaletteColor(colorIndex, nr, ng, nb);
    }

    updateSwatches();
  });

  transCb.addEventListener('change', () => {
    if (transCb.checked) {
      editor.replaceColorWithTransparent(colorIndex);
    } else {
      editor.replaceTransparentWithColor(colorIndex);
    }
    // Rebuild palette swatches, then re-attach dialog
    container.querySelector('.edit-color-dialog')?.remove();
    container.appendChild(dialog);
    transCb.checked = transCb.checked; // preserve state
  });

  satSlider.addEventListener('input', () => {
    const factor = parseInt(satSlider.value, 10) / 100;

    const targets = nuanceGroup.size > 0
      ? nuanceGroup
      : new Set(Array.from({ length: 15 }, (_, i) => i));

    for (const i of targets) {
      const [h, s, l] = origHsl[i] ?? [0, 0, 0];
      const newS = Math.min(1, s * factor);
      const [sr, sg, sb] = hslToRgb(h, newS, l);
      editor.editPaletteColor(i, sr, sg, sb);
    }

    updateSwatches();
  });

  resetBtn.addEventListener('click', () => {
    satSlider.value = '100';
    for (let i = 0; i < 15; i++) {
      const [or, og, ob] = origRgb[i] ?? [0, 0, 0];
      editor.editPaletteColor(i, or, og, ob);
    }
    updateSwatches();
    const [or, og, ob] = origRgb[colorIndex] ?? [0, 0, 0];
    input.value = `#${hex2(or)}${hex2(og)}${hex2(ob)}`;
  });
}
