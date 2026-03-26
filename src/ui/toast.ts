/**
 * Toast notification — brief non-interactive popup at the bottom of the screen.
 */

export function showToast(message: string, success: boolean): void {
  const toast = document.createElement('div');
  toast.className = `smp-toast ${success ? 'success' : 'error'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
