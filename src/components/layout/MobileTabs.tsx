import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Camera,
  ChevronRight,
  ClipboardList,
  Compass,
  FileCheck2,
  Gauge,
  Grid3x3,
  LibraryBig,
  ListChecks,
  NotebookText,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Shapes,
  Sigma,
  Target,
  Users,
  X,
  Zap
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import { useSessionStore } from '@/stores/session';
import { haptic } from '@/lib/native';

/* ─── Primary tabs (4 only) ─────────────────────────────────── */
interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  match: string[];
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: Gauge, match: ['/'] },
  { to: '/log', label: 'Log', icon: PenLine, match: ['/log'] },
  { to: '/planner', label: 'Planner', icon: CalendarDays, match: ['/planner'] }
];

/* ─── More sheet groups ──────────────────────────────────────── */
interface MoreItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const MORE_GROUPS: { label: string; items: MoreItem[] }[] = [
  {
    label: 'Study',
    items: [
      { to: '/journal', label: 'Journal', icon: NotebookText },
      { to: '/today', label: 'Do now', icon: ClipboardList },
      { to: '/pyq', label: 'PYQ practice', icon: LibraryBig },
      { to: '/revision-pack', label: 'Revision pack', icon: ClipboardList }
    ]
  },
  {
    label: 'Practice',
    items: [
      { to: '/capture', label: 'Quick capture', icon: Camera },
      { to: '/mocks', label: 'Mock tests', icon: FileCheck2 },
      { to: '/reattempts', label: 'Re-attempts', icon: RotateCcw }
    ]
  },
  {
    label: 'Analysis',
    items: [
      { to: '/weekly-review', label: 'Weekly review', icon: CalendarCheck },
      { to: '/heatmap', label: 'Heatmap', icon: Grid3x3 },
      { to: '/calibration', label: 'Calibration', icon: Target },
      { to: '/readiness', label: 'Readiness', icon: Compass },
      { to: '/patterns', label: 'Patterns', icon: Shapes }
    ]
  },
  {
    label: 'Learn',
    items: [
      { to: '/topper-notes', label: 'Topper notes', icon: BookOpen },
      { to: '/syllabus', label: 'Syllabus tracker', icon: ListChecks },
      { to: '/trigger-drill', label: 'Trigger drill', icon: Zap },
      { to: '/formulas', label: 'Formulas', icon: Sigma }
    ]
  },
  {
    label: 'Community',
    items: [{ to: '/buddy', label: 'Buddy', icon: Users }]
  }
];

const SETTINGS_ITEM: MoreItem = { to: '/settings', label: 'Settings', icon: Settings };

/* ─── Component ─────────────────────────────────────────────── */
export default function MobileTabs() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);

  const storedSessionId = useSessionStore((s) => s.sessionId);
  const liveSessionId = useLiveQuery(async () => {
    if (!storedSessionId) return null;
    const row = await db.sessions.get(storedSessionId);
    return row && row.actual_duration_min === null ? storedSessionId : null;
  }, [storedSessionId]);

  // FAB target: resume live session or start a new one
  const fabTo = liveSessionId ? `/session/${liveSessionId}/solve` : '/session/new';
  const fabLabel = liveSessionId ? 'Resume session' : 'Start session';

  const moreActive = MORE_GROUPS.flatMap((g) => g.items)
    .concat(SETTINGS_ITEM)
    .some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
  const moreHighlighted = moreOpen || moreActive;

  // Close sheet on navigation
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Keyboard close
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moreOpen]);

  return (
    <>
      {/* ── More sheet overlay ── */}
      {moreOpen && (
        <div className="native-nav-overlay latency-overlay-enter fixed inset-0 z-40 md:hidden">
          {/* Scrim */}
          <button
            type="button"
            className="absolute inset-0 bg-scrim/50"
            aria-label="Close navigation menu"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <section
            ref={sheetRef}
            className="native-more-sheet latency-sheet-enter absolute inset-x-3 bottom-[calc(4.5rem+var(--safe-bottom))] overflow-hidden rounded-xl border border-border bg-bg-raised shadow-lift"
            aria-label="All sections"
            role="dialog"
            aria-modal="true"
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-[13px] font-semibold text-text">All sections</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-overlay text-text-faint transition-colors hover:text-text"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable groups */}
            <div
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: 'calc(75dvh - var(--safe-top) - var(--safe-bottom))' }}
            >
              {MORE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-text-faint font-mono">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => haptic('selection')}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 transition-colors active:bg-bg-overlay',
                          active
                            ? 'text-accent bg-accent-faint/60'
                            : 'text-text-muted hover:bg-bg-overlay'
                        )}
                      >
                        <Icon size={17} strokeWidth={1.75} className="shrink-0" />
                        <span className="flex-1 text-[13.5px] font-medium">{item.label}</span>
                        <ChevronRight size={14} className="shrink-0 text-text-faint/60" />
                      </NavLink>
                    );
                  })}
                </div>
              ))}

              {/* Settings — separated */}
              <div className="border-t border-border mt-1 pb-2">
                <NavLink
                  to={SETTINGS_ITEM.to}
                  onClick={() => haptic('selection')}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors active:bg-bg-overlay',
                    pathname === SETTINGS_ITEM.to
                      ? 'text-accent bg-accent-faint/60'
                      : 'text-text-muted hover:bg-bg-overlay'
                  )}
                >
                  <Settings size={17} strokeWidth={1.75} className="shrink-0" />
                  <span className="flex-1 text-[13.5px] font-medium">Settings</span>
                  <ChevronRight size={14} className="shrink-0 text-text-faint/60" />
                </NavLink>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Bottom nav bar ── */}
      <nav
        className="native-bottom-nav fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-border bg-bg-raised pb-[var(--safe-bottom)] shadow-nav md:hidden"
        aria-label="Primary navigation"
      >
        {/* First 2 tabs: Home, Log */}
        {TABS.slice(0, 2).map((tab) => (
          <TabButton key={tab.to} tab={tab} pathname={pathname} showIndicator={!moreOpen} />
        ))}

        {/* FAB — centre */}
        <div className="flex flex-1 items-center justify-center">
          <NavLink
            to={fabTo}
            onClick={() => haptic('firm')}
            aria-label={fabLabel}
            className={({ isActive }) =>
              cn(
                'relative flex h-12 w-12 items-center justify-center rounded-full shadow-lift transition-all duration-150',
                'active:scale-90',
                isActive
                  ? 'bg-accent-hover text-accent-contrast'
                  : 'bg-accent text-accent-contrast hover:bg-accent-hover'
              )
            }
          >
            {liveSessionId ? (
              <Play size={20} strokeWidth={2} className="translate-x-px" />
            ) : (
              <Plus size={22} strokeWidth={2.25} />
            )}
          </NavLink>
        </div>

        {/* Last tab: Planner */}
        {TABS.slice(2).map((tab) => (
          <TabButton key={tab.to} tab={tab} pathname={pathname} showIndicator={!moreOpen} />
        ))}

        {/* More button */}
        <button
          type="button"
          onClick={() => {
            haptic('selection');
            setMoreOpen((o) => !o);
          }}
          aria-expanded={moreOpen}
          aria-label="More sections"
          className={cn(
            'native-bottom-tab relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors active:scale-95',
            moreHighlighted ? 'text-accent' : 'text-text-faint'
          )}
        >
          {moreHighlighted ? (
            <span className="absolute inset-x-3 top-0 h-[2.5px] rounded-b-full bg-accent" />
          ) : null}
          <span
            className="inline-flex transition-transform duration-100"
            style={{ transform: moreOpen ? 'rotate(90deg)' : undefined }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 19 19"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="4" cy="9.5" r="1.5" fill="currentColor" />
              <circle cx="9.5" cy="9.5" r="1.5" fill="currentColor" />
              <circle cx="15" cy="9.5" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="text-[9.5px] font-semibold tracking-tight">More</span>
        </button>
      </nav>
    </>
  );
}

/* ─── TabButton sub-component ───────────────────────────────── */
function TabButton({
  tab,
  pathname,
  showIndicator
}: {
  tab: Tab;
  pathname: string;
  showIndicator: boolean;
}) {
  const Icon = tab.icon;
  const active =
    tab.to === '/'
      ? pathname === '/'
      : tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <NavLink
      to={tab.to}
      end={tab.to === '/'}
      onClick={() => haptic('selection')}
      className={cn(
        'native-bottom-tab relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors active:scale-95',
        active ? 'text-accent' : 'text-text-faint'
      )}
    >
      {active && showIndicator ? (
        <span className="absolute inset-x-3 top-0 h-[2.5px] rounded-b-full bg-accent" />
      ) : null}
      <Icon size={19} strokeWidth={1.75} />
      <span className="text-[9.5px] font-semibold tracking-tight">{tab.label}</span>
    </NavLink>
  );
}
