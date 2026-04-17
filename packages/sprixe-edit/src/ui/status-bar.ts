/**
 * Status bar — single contextual hint line at the bottom of the editor panel.
 *
 * Shows tool-dependent hints, modal state info, and transient messages.
 */

let barEl: HTMLDivElement | null = null;

/**
 * Create the status bar element. Call once, append the returned element to the panel.
 */
export function createStatusBar(): HTMLDivElement {
  barEl = document.createElement('div');
  barEl.className = 'edit-status-bar';
  barEl.style.display = 'none'; // hidden until setStatus is called with text
  return barEl;
}

/**
 * Update the status bar text.
 */
export function setStatus(text: string): void {
  if (barEl) {
    barEl.textContent = text;
    barEl.style.display = text ? '' : 'none';
  }
}

/**
 * Get current status bar text (for testing).
 */
export function getStatus(): string {
  return barEl?.textContent ?? '';
}
