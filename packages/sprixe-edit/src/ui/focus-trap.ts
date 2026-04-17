/**
 * Minimal focus trap for modals.
 *
 * Returns a keydown handler that traps Tab within the container,
 * and a cleanup function to remove it.
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function enableFocusTrap(container: HTMLElement): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  };

  container.addEventListener('keydown', handler);

  // Focus first focusable element
  const first = container.querySelector<HTMLElement>(FOCUSABLE);
  first?.focus();

  return () => container.removeEventListener('keydown', handler);
}
