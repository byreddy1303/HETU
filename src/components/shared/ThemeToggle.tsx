import { useEffect, useState, type MouseEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { haptic } from '@/lib/native';
import { applyTheme, resolveTheme, type ResolvedTheme } from '@/lib/theme';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { usePrefsStore } from '@/stores/prefs';

function revealTheme(
  nextTheme: ResolvedTheme,
  origin: { x: number; y: number },
  commit: () => void
): void {
  if (typeof document.startViewTransition !== 'function') {
    commit();
    return;
  }

  const farthestX = Math.max(origin.x, window.innerWidth - origin.x);
  const farthestY = Math.max(origin.y, window.innerHeight - origin.y);
  const radius = Math.hypot(farthestX, farthestY);

  try {
    document.documentElement.dataset.themeTransition = nextTheme;
    const transition = document.startViewTransition(commit);
    void transition.ready
      .then(
        () =>
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${origin.x}px ${origin.y}px)`,
                `circle(${radius}px at ${origin.x}px ${origin.y}px)`
              ]
            },
            {
              duration: MOTION_DURATION.arrival * 1000,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              fill: 'both',
              pseudoElement: '::view-transition-new(root)'
            }
          ).finished
      )
      .catch(() => undefined);
    void transition.finished
      .finally(() => {
        delete document.documentElement.dataset.themeTransition;
      })
      .catch(() => undefined);
  } catch {
    delete document.documentElement.dataset.themeTransition;
    commit();
  }
}

export default function ThemeToggle({ className }: { className?: string }) {
  const colorTheme = usePrefsStore((state) => state.colorTheme);
  const setPreference = usePrefsStore((state) => state.set);
  const reduceMotion = useReducedMotion();
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

  function switchTheme(event: MouseEvent<HTMLButtonElement>) {
    haptic('selection');
    const nextTheme: ResolvedTheme = dark ? 'light' : 'dark';
    const bounds = event.currentTarget.getBoundingClientRect();
    const commit = () => {
      applyTheme(nextTheme);
      setPreference('colorTheme', nextTheme);
    };

    if (reduceMotion) {
      commit();
      return;
    }

    revealTheme(
      nextTheme,
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      commit
    );
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
        'transition-[color,background-color,border-color,transform] hover:border-border-hover hover:bg-bg-overlay hover:text-text active:scale-95',
        className
      )}
    >
      <span className="relative inline-grid h-4 w-4" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={dark ? 'sun' : 'moon'}
            className="col-start-1 row-start-1 inline-flex"
            initial={reduceMotion ? false : { opacity: 0, rotate: -55, scale: 0.55 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 55, scale: 0.55 }}
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.control,
              ease: MOTION_EASE
            }}
          >
            {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}
