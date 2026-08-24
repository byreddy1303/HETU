import { useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePrefsStore } from '@/stores/prefs';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import ThemeToggle from '@/components/shared/ThemeToggle';
import OfflineBadge from '@/components/shared/OfflineBadge';
import { cn } from '@/lib/utils';

export function ExamCountdown({ className }: { className?: string }) {
  const { profile } = useAuth();
  const showCountdown = usePrefsStore((s) => s.showCountdown);
  const daysLeft = differenceInCalendarDays(
    parseISO(profile?.exam_date ?? EXAM_DATE_DEFAULT),
    new Date()
  );

  if (!showCountdown) return null;

  return (
    <Link
      to="/planner"
      className={cn(
        'u-num inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-full border border-accent/20 bg-accent-faint px-3 py-1.5 text-[11px] font-semibold leading-none text-accent transition-colors hover:bg-accent/15',
        className
      )}
      title={`GATE Exam in ${daysLeft} days (click to view planner)`}
    >
      T−{daysLeft}d
    </Link>
  );
}

export default function TopRightControls({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Collapsible tray: syncing + countdown + theme toggle */}
      <div
        className={cn(
          'flex items-center gap-2 overflow-hidden transition-all duration-200 ease-in-out',
          expanded ? 'max-w-[220px] opacity-100' : 'max-w-0 opacity-0 pointer-events-none'
        )}
      >
        <OfflineBadge />
        <ExamCountdown />
        <ThemeToggle className="h-9 w-9 shrink-0" />
      </div>

      {/* Arrow toggle — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Hide controls' : 'Show controls'}
        title={expanded ? 'Hide controls' : 'Show controls'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent-faint text-accent transition-colors hover:bg-accent/15"
      >
        {expanded ? (
          <ChevronRight size={14} strokeWidth={2.5} />
        ) : (
          <ChevronLeft size={14} strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
}
