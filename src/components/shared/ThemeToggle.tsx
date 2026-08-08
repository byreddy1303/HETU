import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { haptic } from '@/lib/native';
import { resolveTheme } from '@/lib/theme';
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
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const resolved = resolveTheme(colorTheme, systemDark);
  const dark = resolved === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={dark}
      title={label}
      onClick={() => {
        haptic('selection');
        setPreference('colorTheme', dark ? 'light' : 'dark');
      }}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-bg-raised text-text-muted shadow-sm',
        'transition-[color,background-color,border-color,transform] hover:border-border-hover hover:bg-bg-overlay hover:text-text active:scale-95',
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
