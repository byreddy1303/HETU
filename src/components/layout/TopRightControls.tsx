import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
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
        'u-num inline-flex min-h-8 items-center justify-center rounded-full border border-accent/20 bg-accent-faint px-3 py-1.5 text-[11px] font-semibold leading-none text-accent transition-colors hover:bg-accent/15',
        className
      )}
      title={`GATE Exam in ${daysLeft} days (click to view planner)`}
    >
      T−{daysLeft}d
    </Link>
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
