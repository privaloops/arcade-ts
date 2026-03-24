/**
 * Modal overlay helpers — show/hide overlays, handle fullscreen reparenting.
 */

export function showOverlay(
  overlay: HTMLElement,
  canvasWrapper: HTMLElement,
  appEl: HTMLElement,
): void {
  if (document.fullscreenElement === canvasWrapper) {
    canvasWrapper.appendChild(overlay);
  }
  overlay.classList.add("open");
}

export function hideOverlay(
  overlay: HTMLElement,
  canvasWrapper: HTMLElement,
  appEl: HTMLElement,
): void {
  overlay.classList.remove("open");
  // Move back to #app if it was moved to canvasWrapper
  if (overlay.parentElement === canvasWrapper) {
    appEl.appendChild(overlay);
  }
}
