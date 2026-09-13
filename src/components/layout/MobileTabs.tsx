import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
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
  Zap,
  Ellipsis,
  LogOut
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import { useSessionStore } from '@/stores/session';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { haptic } from '@/lib/native';

type Item = { to: string; label: string; icon: LucideIcon };
const TABS: Item[] = [
  { to: '/', label: 'Home', icon: Gauge },
  { to: '/log', label: 'Manual logging', icon: PenLine },
  { to: '/planner', label: 'Planner', icon: CalendarDays }
];
const MORE_GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Study',
    items: [
      { to: '/today', label: 'Do now', icon: ClipboardList },
      { to: '/pyq', label: 'PYQ practice', icon: LibraryBig },
      { to: '/mocks', label: 'Mock tests', icon: FileCheck2 },
      { to: '/buddy', label: 'Buddy', icon: Users }
    ]
  },
  {
    label: 'Reflect',
    items: [
      { to: '/journal', label: 'Journal', icon: NotebookText },
      { to: '/reattempts', label: 'Re-attempts', icon: RotateCcw },
      { to: '/weekly-review', label: 'Weekly review', icon: CalendarCheck },
      { to: '/heatmap', label: 'Heatmap', icon: Grid3x3 },
      { to: '/calibration', label: 'Calibration', icon: Target },
      { to: '/readiness', label: 'Readiness', icon: Compass },
      { to: '/patterns', label: 'Patterns', icon: Shapes }
    ]
  },
  {
    label: 'Library',
    items: [
      { to: '/topper-notes', label: 'Topper notes', icon: BookOpen },
      { to: '/revision-pack', label: 'Revision pack', icon: ClipboardList },
      { to: '/syllabus', label: 'Syllabus tracker', icon: ListChecks },
      { to: '/trigger-drill', label: 'Trigger drill', icon: Zap },
      { to: '/formulas', label: 'Formulas', icon: Sigma }
    ]
  }
];

export default function MobileTabs() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDialogElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const signOut = useAuthStore((s) => s.signOut);
  const pushToast = useUiStore((s) => s.pushToast);
  const storedSessionId = useSessionStore((s) => s.sessionId);
  const liveSessionId = useLiveQuery(async () => {
    if (!storedSessionId) return null;
    const row = await db.sessions.get(storedSessionId);
    return row && row.actual_duration_min === null ? storedSessionId : null;
  }, [storedSessionId]);
  const fabTo = liveSessionId ? `/session/${liveSessionId}/solve` : '/session/new';
  const fabLabel = liveSessionId ? 'Resume session' : 'Start session';
  const moreActive = MORE_GROUPS.flatMap((group) => group.items)
    .concat({ to: '/settings', label: 'Settings', icon: Settings })
    .some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 500, damping: 38 };
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!moreOpen || !sheet) return;
    const returnFocus = moreButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    sheet.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (desktop.matches && !document.documentElement.hasAttribute('data-native'))
        setMoreOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      sheet.close();
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [moreOpen]);

  const [signingOut, setSigningOut] = useState(false);
  const [forceReady, setForceReady] = useState(false);
  const signOutInFlightRef = useRef(false);
  async function handleSignOut(force = false) {
    if (signOutInFlightRef.current) return;
    const shouldForce = force || forceReady;
    signOutInFlightRef.current = true;
    setSigningOut(true);
    try {
      const result = await signOut({ force: shouldForce });
      if (result.error && !shouldForce) {
        setForceReady(true);
        pushToast(`${result.error} Tap 'Force sign out' to exit immediately.`, 'danger');
      } else if (result.error) {
        pushToast(result.error, 'danger');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Sign-out failed.';
      pushToast(detail, 'danger');
      setForceReady(true);
    } finally {
      signOutInFlightRef.current = false;
      setSigningOut(false);
    }
  }
  function tab(item: Item) {
    const Icon = item.icon;
    const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        onClick={() => haptic('selection')}
        className={cn('workspace-dock-tab native-bottom-tab', active && 'is-active')}
      >
        {active && (
          <motion.span
            className="workspace-dock-indicator"
            layoutId={reduceMotion ? undefined : 'workspace-dock-active'}
            transition={transition}
            aria-hidden
          />
        )}
        <Icon size={20} strokeWidth={1.7} aria-hidden />
        <span>{item.label}</span>
      </NavLink>
    );
  }
  return (
    <>
      <dialog
        ref={sheetRef}
        id="workspace-mobile-menu"
        className="workspace-menu native-more-sheet"
        aria-labelledby="workspace-menu-title"
        onCancel={() => setMoreOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMoreOpen(false);
        }}
      >
        <div className="workspace-menu__panel">
          <header className="workspace-menu__header">
            <div>
              <h2 id="workspace-menu-title">All sections</h2>
              <p>Your space to study, reflect, and grow.</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="workspace-icon-button"
              onClick={() => setMoreOpen(false)}
              aria-label="Close"
            >
              <X size={19} aria-hidden />
            </button>
          </header>
          <nav className="workspace-menu__groups" aria-label="All sections">
            {MORE_GROUPS.map((group) => (
              <section key={group.label}>
                <h3>{group.label}</h3>
                <div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => {
                          haptic('selection');
                          setMoreOpen(false);
                        }}
                        className={({ isActive }) =>
                          cn('workspace-menu__link', isActive && 'is-active')
                        }
                      >
                        <Icon size={18} strokeWidth={1.7} aria-hidden />
                        <span>{item.label}</span>
                        <ChevronRight size={13} aria-hidden />
                      </NavLink>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
          <footer className="workspace-menu__footer">
            <NavLink to="/settings" onClick={() => setMoreOpen(false)}>
              <Settings size={17} aria-hidden />
              <span>Settings</span>
            </NavLink>
            <div>
              {forceReady ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForceReady(false)}
                    disabled={signingOut}
                    className="text-[11px] text-text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSignOut(true)}
                    disabled={signingOut}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-danger"
                    aria-label="Force sign out"
                  >
                    <LogOut size={14} aria-hidden className={signingOut ? 'animate-spin' : undefined} />
                    {signingOut ? 'Signing out…' : 'Force sign out'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  aria-label="Sign out"
                >
                  <LogOut size={16} aria-hidden className={signingOut ? 'animate-spin' : undefined} />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              )}
            </div>
          </footer>
        </div>
      </dialog>
      <nav className="workspace-dock native-bottom-nav" aria-label="Primary navigation">
        {TABS.slice(0, 2).map(tab)}
        <div className="workspace-dock-center">
          <NavLink
            to={fabTo}
            onClick={() => haptic('firm')}
            aria-label={fabLabel}
            className="workspace-dock-session"
          >
            {liveSessionId ? <Play size={22} aria-hidden /> : <Plus size={25} aria-hidden />}
          </NavLink>
        </div>
        {TABS.slice(2).map(tab)}
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => {
            haptic('selection');
            setMoreOpen((open) => !open);
          }}
          aria-expanded={moreOpen}
          aria-controls="workspace-mobile-menu"
          aria-haspopup="dialog"
          aria-label="More sections"
          className={cn(
            'workspace-dock-tab native-bottom-tab',
            (moreOpen || moreActive) && 'is-active'
          )}
        >
          {(moreOpen || moreActive) && (
            <motion.span
              className="workspace-dock-indicator"
              layoutId={reduceMotion ? undefined : 'workspace-dock-active'}
              transition={transition}
              aria-hidden
            />
          )}
          <Ellipsis size={21} aria-hidden />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
