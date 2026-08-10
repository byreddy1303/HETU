import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate } from '@/lib/utils';

function greeting(hour: number, firstName: string): string {
  const who = firstName.trim() || 'friend';
  if (hour < 5) return `Late night, ${who}`;
  if (hour < 12) return `Good morning, ${who}`;
  if (hour < 17) return `Good afternoon, ${who}`;
  if (hour < 21) return `Good evening, ${who}`;
  return `Late night, ${who}`;
}

export interface HeroCardProps {
  name: string | null | undefined;
  today: string;
  showCountdown: boolean;
  daysLeft: number;
  due: number;
  overdue: number;
  action: ReactNode;
}

export default function HeroCard({
  name,
  today,
  showCountdown,
  daysLeft,
  due,
  overdue,
  action
}: HeroCardProps) {
  const firstName = (name ?? '').split(/\s+/)[0] ?? '';
  const title = due > 0 ? 'Close the loop before adding more.' : 'The queue is clear. Build fresh evidence.';
  const description =
    due > 0
      ? 'A re-attempt is clean only when the answer and method both hold without help.'
      : 'Start one focused block. Today’s tags will decide what deserves another look.';

  return (
    <section
      className="u-panel relative overflow-hidden"
      aria-labelledby="dashboard-next-move"
    >
      <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-accent/50" aria-hidden />
      <div className="grid md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="px-4 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="u-label text-accent">Today’s next move</p>
            <span className="hidden h-1 w-1 rounded-full bg-border-hover sm:block" aria-hidden />
            <p className="text-[12px] text-text-faint">{greeting(new Date().getHours(), firstName)}</p>
          </div>
          <h1
            id="dashboard-next-move"
            className="mt-3 max-w-[620px] font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-text sm:text-[38px] sm:leading-[1.08]"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-[600px] text-[13.5px] leading-relaxed text-text-muted sm:text-[14px]">
            {description}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {action}
            {due > 0 && (
              <span className="text-[11.5px] text-text-faint">
                {overdue > 0 ? `${overdue} carried forward` : 'All scheduled for today'}
              </span>
            )}
          </div>
        </div>

        <div className="relative flex min-h-[156px] flex-col justify-between border-t border-border bg-accent-faint/45 px-4 py-4 sm:min-h-[168px] sm:px-6 sm:py-6 md:border-l md:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <span className="u-label text-accent">Due now</span>
            <CalendarDays size={17} strokeWidth={1.75} className="text-accent" aria-hidden />
          </div>
          <div>
            <span className="u-num block text-[52px] font-semibold leading-none tracking-[-0.06em] text-text sm:text-[58px]">
              {due}
            </span>
            <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
              {due > 0 ? 'ready for retrieval' : 'nothing waiting'}
            </p>
          </div>
          <p className="mt-5 border-t border-border/80 pt-3 text-[11px] text-text-faint">
            {formatDate(today, 'EEEE, dd MMM')}
            {showCountdown ? (
              <>
                {' · '}
                <span className="u-num">T−{daysLeft}d</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}
