import { NavLink } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  Gauge,
  Play,
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
  Users,
  Settings,
  LogOut,
  LibraryBig,
  ListChecks
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { useSessionStore } from '@/stores/session';
import { usePrefsStore } from '@/stores/prefs';
import { db } from '@/lib/db';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import { cn } from '@/lib/utils';
import Brand from '@/components/shared/Brand';
import ThemeToggle from '@/components/shared/ThemeToggle';

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Active-state ink. Static classes — Tailwind needs to see them whole. */
  active: string;
}

const JOURNAL_ITEM: Item = {
  to: '/journal',
  label: 'Journal',
  icon: NotebookText,
  active: 'bg-ink-cobalt/10 text-ink-cobalt'
};

const LOG_ITEM: Item = {
  to: '/log',
  label: 'Log',
  icon: PenLine,
  active: 'bg-ink-rose/10 text-ink-rose'
};

const PLANNER_ITEM: Item = {
  to: '/planner',
  label: 'Planner',
  icon: CalendarDays,
  active: 'bg-ink-marigold/10 text-ink-marigold'
};

const BUDDY_ITEM: Item = {
  to: '/buddy',
  label: 'Buddy',
  icon: Users,
  active: 'bg-ink-rose/10 text-ink-rose'
};

const ANALYSIS: Item[] = [
  { to: '/pyq', label: 'PYQ practice', icon: LibraryBig, active: 'bg-accent-faint text-accent' },
  { to: '/patterns', label: 'Patterns', icon: Shapes, active: 'bg-ink-violet/10 text-ink-violet' },
  {
    to: '/reattempts',
    label: 'Re-attempts',
    icon: RotateCcw,
    active: 'bg-ink-rose/10 text-ink-rose'
  },
  {
    to: '/weekly-review',
    label: 'Weekly',
    icon: CalendarCheck,
    active: 'bg-ink-marigold/10 text-ink-marigold'
  },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3x3, active: 'bg-ink-slate/10 text-ink-slate' },
  {
    to: '/calibration',
    label: 'Calibration',
    icon: Target,
    active: 'bg-ink-teal/10 text-ink-teal'
  },
  {
    to: '/readiness',
    label: 'Readiness',
    icon: Compass,
    active: 'bg-ink-marigold/10 text-ink-marigold'
  }
];

const LEARN: Item[] = [
  {
    to: '/syllabus',
    label: 'Syllabus tracker',
    icon: ListChecks,
    active: 'bg-ink-cobalt/10 text-ink-cobalt'
  },
  {
    to: '/trigger-drill',
    label: 'Trigger drill',
    icon: Zap,
    active: 'bg-ink-marigold/10 text-ink-marigold'
  },
  { to: '/formulas', label: 'Formulas', icon: Sigma, active: 'bg-ink-teal/10 text-ink-teal' }
];

const SETTINGS_ITEM: Item = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  active: 'bg-ink-slate/10 text-ink-slate'
};

function NavItem({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex h-9 items-center gap-3 rounded px-3 text-[13.5px] transition-all duration-150',
          isActive
            ? cn('font-semibold', item.active)
            : 'font-medium text-text-muted hover:translate-x-0.5 hover:bg-bg-overlay/70 hover:text-text'
        )
      }
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      {item.label}
    </NavLink>
  );
}

function Group({ label, items }: { label?: string; items: Item[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {label && <p className="u-label px-3 pb-1 pt-4">{label}</p>}
      {items.map((i) => (
        <NavItem key={i.to} item={i} />
      ))}
    </div>
  );
}

export default function Nav() {
  const { profile, sandbox } = useAuth();
  const signOut = useAuthStore((s) => s.signOut);
  const showCountdown = usePrefsStore((s) => s.showCountdown);
  const daysLeft = differenceInCalendarDays(
    parseISO(profile?.exam_date ?? EXAM_DATE_DEFAULT),
    new Date()
  );
  const storedSessionId = useSessionStore((s) => s.sessionId);
  // Confirm the stored session is still live (row exists, unfinished) — a
  // stale localStorage entry after a "finish" that crashed shouldn't hijack
  // the Session tab. useLiveQuery re-evaluates as Dexie changes.
  const liveSessionId = useLiveQuery(async () => {
    if (!storedSessionId) return null;
    const row = await db.sessions.get(storedSessionId);
    return row && row.actual_duration_min === null ? storedSessionId : null;
  }, [storedSessionId]);
  const main: Item[] = [
    { to: '/', label: 'Dashboard', icon: Gauge, active: 'bg-accent-faint text-accent' },
    LOG_ITEM,
    liveSessionId
      ? {
          to: `/session/${liveSessionId}/solve`,
          label: 'Resume session',
          icon: Play,
          active: 'bg-ink-teal/10 text-ink-teal'
        }
      : {
          to: '/session/new',
          label: 'Session',
          icon: Play,
          active: 'bg-ink-teal/10 text-ink-teal'
        },
    JOURNAL_ITEM,
    PLANNER_ITEM,
    BUDDY_ITEM
  ];

  return (
    <aside className="native-side-nav fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-border bg-bg md:flex">
      <div className="flex items-center justify-between px-4 pb-4 pt-4">
        <Brand />
        <div className="flex items-center gap-2">
          {showCountdown && (
            <span
              className="u-num rounded-full bg-accent-faint px-2 py-0.5 text-[11px] font-semibold text-accent"
              title="Days to GATE"
            >
              T−{daysLeft}d
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        <Group items={main} />
        <Group label="Analysis" items={ANALYSIS} />
        <Group label="Learn" items={LEARN} />
        <Group items={[SETTINGS_ITEM]} />
      </nav>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-cobalt/15 font-display text-[13px] font-bold text-ink-cobalt">
              {(profile?.name ?? 'S')[0].toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-text">{profile?.name ?? '—'}</p>
              <p className="u-num truncate text-[10px] text-text-faint">
                {sandbox ? 'local sandbox' : (profile?.email ?? '')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 rounded-full p-1.5 text-text-faint transition-colors hover:bg-danger-faint hover:text-danger"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
}
