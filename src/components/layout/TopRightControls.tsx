import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePrefsStore } from '@/stores/prefs';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import ThemeToggle from '@/components/shared/ThemeToggle';
import OfflineBadge from '@/components/shared/OfflineBadge';
import SyncStatusBadge from '@/components/shared/SyncStatusBadge';
import { cn } from '@/lib/utils';

export function ExamCountdown({ className }: { className?: string }) {
  const { profile } = useAuth();
  const showCountdown = usePrefsStore((s) => s.showCountdown);
  const daysLeft = differenceInCalendarDays(
    parseISO(profile?.exam_date ?? EXAM_DATE_DEFAULT),
    new Date()
  );
  if (!showCountdown) return null;
  const label =
    daysLeft > 0
      ? `${daysLeft} days to GATE`
      : daysLeft === 0
        ? 'GATE exam today'
        : 'Exam date passed';
  return (
    <Link
      to="/planner"
      className={cn('workspace-countdown', className)}
      aria-label={`${label}. Open planner`}
      title={`${label}. Open planner`}
    >
      <CalendarDays size={14} aria-hidden />
      <span>
        {daysLeft > 0 ? (
          <>
            <strong>{daysLeft}</strong>
            <span className="workspace-countdown__full"> days to GATE</span>
            <span className="workspace-countdown__short">d</span>
          </>
        ) : daysLeft === 0 ? (
          'Exam day'
        ) : (
          'Exam passed'
        )}
      </span>
    </Link>
  );
}

export default function TopRightControls({ className }: { className?: string }) {
  return (
    <div className={cn('workspace-controls', className)}>
      <OfflineBadge />
      <SyncStatusBadge />
      <ExamCountdown />
      <ThemeToggle className="workspace-theme-toggle" />
    </div>
  );
}
