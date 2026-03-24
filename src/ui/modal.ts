/**
 * Modal overlay helpers — show/hide overlays, handle fullscreen reparenting,
 * focus trap, and focus restore.
 */

import { enableFocusTrap } from "./focus-trap";

let activeTrapCleanup: (() => void) | null = null;
let previousFocus: HTMLElement | null = null;

export function showOverlay(
  overlay: HTMLElement,
  canvasWrapper: HTMLElement,
  appEl: HTMLElement,
): void {
  previousFocus = document.activeElement as HTMLElement | null;
  if (document.fullscreenElement === canvasWrapper) {
    canvasWrapper.appendChild(overlay);
  }
  overlay.classList.add("open");
  activeTrapCleanup = enableFocusTrap(overlay);
}

export function hideOverlay(
  overlay: HTMLElement,
  canvasWrapper: HTMLElement,
  appEl: HTMLElement,
): void {
  overlay.classList.remove("open");
  if (overlay.parentElement === canvasWrapper) {
    appEl.appendChild(overlay);
  }
  activeTrapCleanup?.();
  activeTrapCleanup = null;
  previousFocus?.focus();
  previousFocus = null;
}
