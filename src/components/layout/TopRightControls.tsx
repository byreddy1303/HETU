import { Link } from 'react-router-dom';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { usePrefsStore } from '@/stores/prefs';
import { EXAM_DATE_DEFAULT } from '@/lib/constants';
import ThemeToggle from '@/components/shared/ThemeToggle';
import OfflineBadge from '@/components/shared/OfflineBadge';

export default function TopRightControls({ className }: { className?: string }) {
  const { profile } = useAuth();
  const showCountdown = usePrefsStore((s) => s.showCountdown);
  const daysLeft = differenceInCalendarDays(
    parseISO(profile?.exam_date ?? EXAM_DATE_DEFAULT),
    new Date()
  );

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <OfflineBadge />
      {showCountdown && (
        <Link
          to="/planner"
          className="u-num inline-flex items-center rounded-full bg-accent-faint border border-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/15 transition-colors"
          title={`GATE Exam in ${daysLeft} days (click to view planner)`}
        >
          T−{daysLeft}d
        </Link>
      )}
      <ThemeToggle className="h-9 w-9 shrink-0" />
    </div>
  );
}
