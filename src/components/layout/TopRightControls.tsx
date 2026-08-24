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
  const [expanded, setExpanded] = useState(false);
  const daysLeft = differenceInCalendarDays(
    parseISO(profile?.exam_date ?? EXAM_DATE_DEFAULT),
    new Date()
  );

  if (!showCountdown) return null;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Toggle arrow button */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'Hide exam countdown' : 'Show exam countdown'}
        title={expanded ? 'Hide exam countdown' : `GATE Exam in ${daysLeft} days`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/20 bg-accent-faint text-accent transition-colors hover:bg-accent/15"
      >
        {expanded ? (
          <ChevronRight size={14} strokeWidth={2.5} />
        ) : (
          <ChevronLeft size={14} strokeWidth={2.5} />
        )}
      </button>

      {/* Collapsible countdown badge */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          expanded ? 'max-w-[80px] opacity-100' : 'max-w-0 opacity-0'
        )}
      >
        <Link
          to="/planner"
          className="u-num inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-full border border-accent/20 bg-accent-faint px-3 py-1.5 text-[11px] font-semibold leading-none text-accent transition-colors hover:bg-accent/15"
          title={`GATE Exam in ${daysLeft} days (click to view planner)`}
          tabIndex={expanded ? 0 : -1}
        >
          T−{daysLeft}d
        </Link>
      </div>
    </div>
  );
}

export default function TopRightControls({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <OfflineBadge />
      <ExamCountdown />
      <ThemeToggle className="h-9 w-9 shrink-0" />
    </div>
  );
}
