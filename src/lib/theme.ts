export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#F1F5F0',
  dark: '#0F1216'
};

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/** Apply the resolved theme to CSS, native form controls, and PWA chrome. */
export function applyTheme(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColor?.setAttribute('content', THEME_COLORS[theme]);
}
