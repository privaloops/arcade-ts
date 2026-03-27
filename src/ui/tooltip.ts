/**
 * Custom tooltip system — replaces native title attributes.
 *
 * - 600ms delay before showing
 * - Instant hide on mouse move / mouse down
 * - Suppressed while any mouse button is held (painting)
 * - Styled dark popup, max-width 250px
 */

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let tooltipEl: HTMLDivElement | null = null;
let showTimer = 0;
let currentTarget: HTMLElement | null = null;
let mouseDown = false;

// ---------------------------------------------------------------------------
// Init (called once, creates the DOM element + global listeners)
// ---------------------------------------------------------------------------

function ensureInit(): void {
  if (tooltipEl) return;

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tt';
  tooltipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltipEl);

  // Track mouse button state globally to suppress tooltips during painting
  window.addEventListener('mousedown', () => { mouseDown = true; hide(); }, true);
  window.addEventListener('mouseup', () => { mouseDown = false; }, true);
}

// ---------------------------------------------------------------------------
// Show / hide
// ---------------------------------------------------------------------------

function show(target: HTMLElement, x: number, y: number): void {
  if (!tooltipEl) return;
  const text = target.dataset['tt'];
  if (!text) return;

  tooltipEl.textContent = text;
  tooltipEl.style.display = 'block';

  // Position: above cursor, centered horizontally
  const rect = tooltipEl.getBoundingClientRect();
  const pad = 8;
  let left = x - rect.width / 2;
  let top = y - rect.height - pad;

  // Clamp to viewport
  if (left < pad) left = pad;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - pad - rect.width;
  if (top < pad) { top = y + 20; } // flip below if no room above

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  currentTarget = target;
}

function hide(): void {
  clearTimeout(showTimer);
  if (tooltipEl) tooltipEl.style.display = 'none';
  currentTarget = null;
}

// ---------------------------------------------------------------------------
// Event handlers (delegated)
// ---------------------------------------------------------------------------

function onMouseEnter(this: HTMLElement, e: MouseEvent): void {
  if (mouseDown) return;
  const target = this;
  clearTimeout(showTimer);
  showTimer = window.setTimeout(() => {
    if (!mouseDown) show(target, e.clientX, e.clientY);
  }, 600);
}

function onMouseMove(this: HTMLElement, e: MouseEvent): void {
  if (currentTarget === this && tooltipEl?.style.display === 'block') {
    // Reposition while visible
    const rect = tooltipEl.getBoundingClientRect();
    const pad = 8;
    let left = e.clientX - rect.width / 2;
    let top = e.clientY - rect.height - pad;
    if (left < pad) left = pad;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - pad - rect.width;
    if (top < pad) top = e.clientY + 20;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  } else {
    // Not yet shown — restart timer with new position
    hide();
    if (!mouseDown) {
      const target = this;
      showTimer = window.setTimeout(() => {
        if (!mouseDown) show(target, e.clientX, e.clientY);
      }, 600);
    }
  }
}

function onMouseLeave(): void {
  hide();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach a tooltip to an element. Replaces any native `title` attribute.
 * Call multiple times to update the text.
 */
export function setTooltip(element: HTMLElement, text: string): void {
  ensureInit();

  // Remove native title to prevent double tooltip
  element.removeAttribute('title');

  // Store text in data attribute
  element.dataset['tt'] = text;

  // Only attach listeners once (check via marker)
  if (!element.dataset['ttBound']) {
    element.dataset['ttBound'] = '1';
    element.addEventListener('mouseenter', onMouseEnter);
    element.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mouseleave', onMouseLeave);
  }
}

/**
 * Remove tooltip from an element.
 */
export function removeTooltip(element: HTMLElement): void {
  delete element.dataset['tt'];
  delete element.dataset['ttBound'];
  element.removeEventListener('mouseenter', onMouseEnter);
  element.removeEventListener('mousemove', onMouseMove);
  element.removeEventListener('mouseleave', onMouseLeave);
  if (currentTarget === element) hide();
}
