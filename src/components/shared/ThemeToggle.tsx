import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { haptic } from '@/lib/native';
import { applyTheme, resolveTheme, type ResolvedTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { usePrefsStore } from '@/stores/prefs';

export default function ThemeToggle({ className }: { className?: string }) {
  const colorTheme = usePrefsStore((state) => state.colorTheme);
  const setPreference = usePrefsStore((state) => state.set);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const resolved = resolveTheme(colorTheme, systemDark);
  const dark = resolved === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  function switchTheme() {
    haptic('selection');
    const nextTheme: ResolvedTheme = dark ? 'light' : 'dark';

    // Apply the DOM theme before persisting it so the visual response occurs
    // in the same input frame, without a full-page View Transition snapshot.
    applyTheme(nextTheme);
    setPreference('colorTheme', nextTheme);
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={dark}
      title={label}
      onClick={switchTheme}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-bg-raised text-text-muted shadow-sm',
        'transition-colors hover:border-border-hover hover:bg-bg-overlay hover:text-text active:scale-95',
        className
      )}
    >
      {dark ? (
        <Sun size={16} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={16} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
