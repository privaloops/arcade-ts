/**
 * Beta gate — client-side password screen for /play/ beta access.
 * Stores access in sessionStorage (once per session).
 */

const BETA_KEY = 'beta_access';
const BETA_HASH = '877429c0';

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

export function checkBetaAccess(): void {
  if (sessionStorage.getItem(BETA_KEY) === BETA_HASH) return;

  const overlay = document.createElement('div');
  overlay.id = 'beta-gate';
  overlay.innerHTML = `
    <div class="beta-box">
      <h2>Beta Access</h2>
      <p>This project is in private beta.</p>
      <form autocomplete="off">
        <input type="password" placeholder="Password" autocomplete="off" />
        <button type="submit">Enter</button>
      </form>
      <p class="beta-error" hidden>Wrong password</p>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #beta-gate {
      position: fixed; inset: 0; z-index: 99999;
      background: #0a0a0c;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .beta-box {
      text-align: center; color: #e0e0e0;
      max-width: 320px; width: 100%; padding: 0 24px;
    }
    .beta-box h2 { font-size: 1.4rem; margin-bottom: 8px; }
    .beta-box p { color: #888; font-size: 0.9rem; margin-bottom: 24px; }
    .beta-box form { display: flex; gap: 8px; }
    .beta-box input {
      flex: 1; padding: 10px 14px; border-radius: 8px;
      border: 1px solid #333; background: #1a1a1e; color: #e0e0e0;
      font-size: 0.95rem; outline: none;
    }
    .beta-box input:focus { border-color: #6366f1; }
    .beta-box button {
      padding: 10px 20px; border-radius: 8px; border: none;
      background: #6366f1; color: #fff; font-weight: 600;
      cursor: pointer; font-size: 0.95rem;
    }
    .beta-box button:hover { background: #4f46e5; }
    .beta-error { color: #ef4444 !important; font-size: 0.85rem !important; margin-top: 12px !important; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const form = overlay.querySelector('form')!;
  const input = overlay.querySelector('input')!;
  const error = overlay.querySelector('.beta-error') as HTMLElement;

  // Block all keyboard events from reaching the emulator
  overlay.addEventListener('keydown', (e) => e.stopPropagation());
  overlay.addEventListener('keyup', (e) => e.stopPropagation());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (simpleHash(input.value) === BETA_HASH) {
      sessionStorage.setItem(BETA_KEY, BETA_HASH);
      overlay.remove();
      style.remove();
      document.body.style.overflow = '';
    } else {
      error.hidden = false;
      input.value = '';
      input.focus();
    }
  });
}
