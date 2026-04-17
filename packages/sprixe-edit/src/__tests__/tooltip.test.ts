/**
 * Tooltip tests — setTooltip, removeTooltip.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setTooltip, removeTooltip } from '../ui/tooltip';

describe('Tooltip', () => {
  let btn: HTMLButtonElement;

  beforeEach(() => {
    btn = document.createElement('button');
    btn.title = 'Old native title';
    document.body.appendChild(btn);
  });

  it('removes native title attribute', () => {
    setTooltip(btn, 'Custom tooltip');
    expect(btn.hasAttribute('title')).toBe(false);
  });

  it('sets data-tt attribute with tooltip text', () => {
    setTooltip(btn, 'Custom tooltip');
    expect(btn.dataset['tt']).toBe('Custom tooltip');
  });

  it('marks element as bound (data-tt-bound)', () => {
    setTooltip(btn, 'Custom tooltip');
    expect(btn.dataset['ttBound']).toBe('1');
  });

  it('updates text on subsequent calls', () => {
    setTooltip(btn, 'First');
    setTooltip(btn, 'Second');
    expect(btn.dataset['tt']).toBe('Second');
  });

  it('does not double-bind listeners', () => {
    setTooltip(btn, 'First');
    setTooltip(btn, 'Second');
    expect(btn.dataset['ttBound']).toBe('1');
  });

  it('removeTooltip clears data attributes', () => {
    setTooltip(btn, 'Custom tooltip');
    removeTooltip(btn);
    expect(btn.dataset['tt']).toBeUndefined();
    expect(btn.dataset['ttBound']).toBeUndefined();
  });

  it('creates tooltip DOM element with role=tooltip', () => {
    setTooltip(btn, 'Test');
    const ttEl = document.querySelector('.tt');
    expect(ttEl).toBeTruthy();
    expect(ttEl?.getAttribute('role')).toBe('tooltip');
  });

  it('works with multiple elements', () => {
    const btn2 = document.createElement('button');
    document.body.appendChild(btn2);
    setTooltip(btn, 'Tooltip 1');
    setTooltip(btn2, 'Tooltip 2');
    expect(btn.dataset['tt']).toBe('Tooltip 1');
    expect(btn2.dataset['tt']).toBe('Tooltip 2');
  });
});
