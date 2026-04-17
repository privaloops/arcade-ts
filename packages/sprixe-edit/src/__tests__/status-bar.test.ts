/**
 * Status bar tests — createStatusBar, setStatus, getStatus.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStatusBar, setStatus, getStatus } from '../ui/status-bar';

describe('StatusBar', () => {
  beforeEach(() => {
    // createStatusBar returns a fresh div each time; the module tracks the last one
    document.body.innerHTML = '';
    const bar = createStatusBar();
    document.body.appendChild(bar);
  });

  it('creates a div with correct class', () => {
    const bar = document.querySelector('.edit-status-bar');
    expect(bar).toBeTruthy();
  });

  it('setStatus updates text content', () => {
    setStatus('Click to draw');
    expect(getStatus()).toBe('Click to draw');
  });

  it('setStatus overwrites previous text', () => {
    setStatus('First message');
    setStatus('Second message');
    expect(getStatus()).toBe('Second message');
  });

  it('setStatus with empty string clears bar', () => {
    setStatus('Something');
    setStatus('');
    expect(getStatus()).toBe('');
  });

  it('getStatus returns empty string before any setStatus', () => {
    // createStatusBar was called in beforeEach, but no setStatus yet
    expect(getStatus()).toBe('');
  });
});
