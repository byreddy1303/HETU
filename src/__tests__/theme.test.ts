import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  Reflect.deleteProperty(document.documentElement, 'animate');
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

  it('reveals the next theme from the toggle when view transitions are available', async () => {
    const animate = vi.fn().mockReturnValue({
      finished: Promise.resolve()
    } as unknown as Animation);
    Object.defineProperty(document.documentElement, 'animate', {
      configurable: true,
      value: animate
    });
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn()
      } as unknown as ViewTransition;
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition
    });

    render(createElement(ThemeToggle));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(usePrefsStore.getState().colorTheme).toBe('dark');
    await waitFor(() => expect(animate).toHaveBeenCalledOnce());
    expect(animate.mock.calls[0]?.[1]).toMatchObject({
      pseudoElement: '::view-transition-new(root)',
      fill: 'both'
    });
  });
});
