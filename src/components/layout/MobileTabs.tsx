import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  CalendarCheck,
  CalendarDays,
  Compass,
  Gauge,
  Grid3x3,
  Menu,
  NotebookText,
  PenLine,
  Play,
  RotateCcw,
  Settings,
  Shapes,
  Sigma,
  Target,
  Users,
  X,
  Zap,
  LibraryBig
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import { useSessionStore } from '@/stores/session';
import { haptic } from '@/lib/native';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Route prefixes that light this tab up. */
  match: string[];
  active: string;
  bar: string;
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: Gauge, match: ['/'], active: 'text-accent', bar: 'bg-accent' },
  {
    to: '/log',
    label: 'Log',
    icon: PenLine,
    match: ['/log'],
    active: 'text-ink-rose',
    bar: 'bg-ink-rose'
  },
  {
    to: '/session/new',
    label: 'Sessions',
    icon: Play,
    match: ['/session'],
    active: 'text-ink-teal',
    bar: 'bg-ink-teal'
  },
  {
    to: '/journal',
    label: 'Journal',
    icon: NotebookText,
    match: ['/journal'],
    active: 'text-ink-cobalt',
    bar: 'bg-ink-cobalt'
  },
  {
    to: '/planner',
    label: 'Planner',
    icon: CalendarDays,
    match: ['/planner'],
    active: 'text-ink-marigold',
    bar: 'bg-ink-marigold'
  }
];

const MORE_ITEMS = [
  { to: '/pyq', label: 'PYQ practice', icon: LibraryBig },
  { to: '/patterns', label: 'Patterns', icon: Shapes },
  { to: '/reattempts', label: 'Re-attempts', icon: RotateCcw },
  { to: '/weekly-review', label: 'Weekly review', icon: CalendarCheck },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3x3 },
  { to: '/calibration', label: 'Calibration', icon: Target },
  { to: '/readiness', label: 'Readiness', icon: Compass },
  { to: '/buddy', label: 'Buddy', icon: Users },
  { to: '/trigger-drill', label: 'Trigger drill', icon: Zap },
  { to: '/formulas', label: 'Formulas', icon: Sigma },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export default function MobileTabs() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const storedSessionId = useSessionStore((s) => s.sessionId);
  const liveSessionId = useLiveQuery(async () => {
    if (!storedSessionId) return null;
    const row = await db.sessions.get(storedSessionId);
    return row && row.actual_duration_min === null ? storedSessionId : null;
  }, [storedSessionId]);
  const tabs = TABS.map((t) =>
    t.match.includes('/session') && liveSessionId
      ? { ...t, to: `/session/${liveSessionId}/solve`, label: 'Resume' }
      : t
  );
  const moreActive = MORE_ITEMS.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
  const moreHighlighted = moreOpen || moreActive;

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="native-nav-overlay fixed inset-0 z-40 md:hidden"
          >
            <motion.button
              type="button"
              className="absolute inset-0 bg-text/20 backdrop-blur-[1px]"
              aria-label="Close navigation directory"
              onClick={() => setMoreOpen(false)}
            />
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="native-more-sheet absolute inset-x-3 bottom-[calc(4rem+var(--safe-bottom))] rounded-lg border border-border bg-bg-raised p-3 shadow-xl"
              aria-label="More destinations"
              role="dialog"
              aria-modal="true"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <p className="u-label">All sections</p>
                  <p className="mt-1 text-[12px] text-text-faint">
                    Analysis, learning tools, buddy, and settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="rounded p-1.5 text-text-faint hover:bg-bg-overlay hover:text-text"
                  aria-label="Close"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => haptic('selection')}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-12 items-center gap-2.5 rounded border px-3 text-[13px] font-semibold',
                          isActive
                            ? 'border-accent/30 bg-accent-faint text-accent'
                            : 'border-border/70 bg-bg text-text-muted'
                        )
                      }
                    >
                      <Icon size={17} strokeWidth={1.75} />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        className="native-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-border bg-bg-raised/95 pb-[var(--safe-bottom)] shadow-nav backdrop-blur md:hidden"
        aria-label="Primary"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.to === '/'
              ? pathname === '/'
              : tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              onClick={() => haptic('selection')}
              className={cn(
                'native-bottom-tab relative flex h-14 flex-col items-center justify-center gap-1 transition-colors active:scale-95',
                active ? tab.active : 'text-text-faint'
              )}
            >
              {active && !moreOpen && (
                <motion.span
                  layoutId="mobile-primary-indicator"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  className={cn('absolute inset-x-4 top-0 h-[3px] rounded-b-full', tab.bar)}
                />
              )}
              <Icon size={19} strokeWidth={1.75} />
              <span className="text-[9px] font-semibold">{tab.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => {
            haptic('selection');
            setMoreOpen((open) => !open);
          }}
          aria-expanded={moreOpen}
          className={cn(
            'native-bottom-tab relative flex h-14 flex-col items-center justify-center gap-1 transition-colors active:scale-95',
            moreHighlighted ? 'text-ink-rose' : 'text-text-faint'
          )}
        >
          {moreHighlighted && (
            <motion.span
              layoutId="mobile-primary-indicator"
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              className="absolute inset-x-4 top-0 h-[3px] rounded-b-full bg-ink-rose"
            />
          )}
          <Menu size={19} strokeWidth={1.75} />
          <span className="text-[9px] font-semibold">More</span>
        </button>
      </nav>
    </>
  );
}
