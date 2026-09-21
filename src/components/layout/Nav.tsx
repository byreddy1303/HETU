import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Gauge,
  NotebookText,
  PenLine,
  Shapes,
  RotateCcw,
  CalendarCheck,
  CalendarDays,
  Grid3x3,
  Target,
  Compass,
  Zap,
  Sigma,
  ChevronDown,
  Users,
  Settings,
  LogOut,
  LibraryBig,
  ListChecks,
  BookOpen,
  ClipboardList,
  FileCheck2,
  PanelLeftClose
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';
import Brand from '@/components/shared/Brand';

type Item = { to: string; label: string; icon: LucideIcon };
const REFLECT: Item[] = [
  { to: '/journal', label: 'Journal', icon: NotebookText },
  { to: '/patterns', label: 'Patterns', icon: Shapes },
  { to: '/reattempts', label: 'Re-attempts', icon: RotateCcw },
  { to: '/weekly-review', label: 'Weekly', icon: CalendarCheck },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3x3 },
  { to: '/calibration', label: 'Calibration', icon: Target },
  { to: '/readiness', label: 'Readiness', icon: Compass }
];
const LIBRARY: Item[] = [
  { to: '/topper-notes', label: 'Topper notes', icon: BookOpen },
  { to: '/revision-pack', label: 'Revision pack', icon: ClipboardList },
  { to: '/syllabus', label: 'Syllabus tracker', icon: ListChecks },
  { to: '/trigger-drill', label: 'Trigger drill', icon: Zap },
  { to: '/formulas', label: 'Formulas', icon: Sigma }
];
function NavItem({ item }: { item: Item }) {
  const Icon = item.icon;
  const reduced = useReducedMotion();
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => cn('workspace-nav-link', isActive && 'is-active')}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              className="workspace-nav-indicator"
              layoutId={reduced ? undefined : 'workspace-nav-active'}
              transition={
                reduced ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 37 }
              }
              aria-hidden
            />
          )}
          <Icon size={16} strokeWidth={1.65} aria-hidden />
          <span>{item.label}</span>
          {isActive && <span className="workspace-nav-dot" aria-hidden />}
        </>
      )}
    </NavLink>
  );
}
function Group({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className="workspace-nav-group">
      <p>{label}</p>
      {items.map((item) => (
        <NavItem key={item.to} item={item} />
      ))}
    </div>
  );
}

function CollapsibleGroup({ label, items }: { label: string; items: Item[] }) {
  const { pathname } = useLocation();
  const contentId = useId();
  const active = items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [pathname, active]);
  return (
    <div className="workspace-nav-group">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className={cn('workspace-nav-group-toggle', open && 'is-open')}
      >
        <p>{label}</p>
        <ChevronDown size={13} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div id={contentId} className="workspace-nav-group-items">
          {items.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const { profile, sandbox } = useAuth();
  const signOut = useAuthStore((s) => s.signOut);
  const navCollapsed = useUiStore((s) => s.navCollapsed);
  const setNavCollapsed = useUiStore((s) => s.setNavCollapsed);
  const pushToast = useUiStore((s) => s.pushToast);
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
        pushToast(`${result.error} Click sign out again to force exit.`, 'danger');
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
  const study: Item[] = [
    { to: '/today', label: 'Do now', icon: ClipboardList },
    { to: '/pyq', label: 'PYQ practice', icon: LibraryBig },
    { to: '/log', label: 'Manual logging', icon: PenLine },
    { to: '/planner', label: 'Planner', icon: CalendarDays },
    { to: '/mocks', label: 'Mock tests', icon: FileCheck2 },
    { to: '/buddy', label: 'Buddy', icon: Users }
  ];
  // Unmounting collapsed navigation keeps its links out of the keyboard order.
  if (navCollapsed) return null;
  return (
    <aside className="workspace-sidebar native-side-nav">
      <div className="workspace-sidebar__brand">
        <Brand />
        <button
          type="button"
          onClick={() => setNavCollapsed(true)}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (Ctrl+B)"
          className="workspace-sidebar__collapse"
        >
          <PanelLeftClose size={17} strokeWidth={1.7} aria-hidden />
        </button>
      </div>
      <div className="workspace-sidebar__intro">
        <span aria-hidden />
        <p>Your learning observatory</p>
      </div>
      <nav className="workspace-sidebar__navigation" aria-label="Main navigation">
        <NavItem item={{ to: '/', label: 'Dashboard', icon: Gauge }} />
        <Group label="Study" items={study} />
        <CollapsibleGroup label="Reflect" items={REFLECT} />
        <CollapsibleGroup label="Library" items={LIBRARY} />
      </nav>
      <div className="workspace-sidebar__footer">
        <NavItem item={{ to: '/settings', label: 'Settings', icon: Settings }} />
        <div className="workspace-profile">
          <span className="workspace-profile__avatar">
            {(profile?.name?.trim() || 'S')[0].toUpperCase()}
          </span>
          <div>
            <p>{profile?.name ?? 'Your workspace'}</p>
            <span>{sandbox ? 'Local sandbox' : (profile?.email ?? 'GATE preparation')}</span>
          </div>
          {forceReady ? (
            <div className="flex flex-col items-end gap-1.5">
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
                aria-label="Force sign out"
                title={signingOut ? 'Signing out…' : 'Force sign out — exit immediately even if pending sync cannot finish'}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-danger"
              >
                <LogOut size={14} strokeWidth={1.7} aria-hidden className={signingOut ? 'animate-spin' : undefined} />
                {signingOut ? 'Signing out…' : 'Force sign out'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              aria-label="Sign out"
              title={signingOut ? 'Signing out…' : 'Sign out'}
            >
              <LogOut size={16} strokeWidth={1.7} aria-hidden className={signingOut ? 'animate-spin' : undefined} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
