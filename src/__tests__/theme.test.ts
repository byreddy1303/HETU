import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { applyTheme, resolveTheme, THEME_COLORS } from '@/lib/theme';
import { DEFAULT_PREFERENCES, usePrefsStore } from '@/stores/prefs';

beforeEach(() => {
  usePrefsStore.setState({ ...DEFAULT_PREFERENCES, colorTheme: 'light' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  });
});

describe('theme resolution', () => {
  it('keeps an explicit light or dark preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the device only in system mode', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });
});

describe('theme application', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('updates semantic CSS mode and browser chrome together', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);

    applyTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(meta.content).toBe(THEME_COLORS.dark);
  });
});

describe('theme toggle', () => {
  it('switches directly between the resolved light and dark modes', () => {
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(usePrefsStore.getState().colorTheme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
