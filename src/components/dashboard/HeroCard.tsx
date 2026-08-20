import type { ReactNode } from 'react';
import { CalendarDays, Orbit, Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import MagneticAction from '@/components/immersive/MagneticAction';

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
  queueCount: number;
  action: ReactNode;
}

export default function HeroCard({
  name,
  today,
  showCountdown,
  daysLeft,
  due,
  overdue,
  queueCount,
  action
}: HeroCardProps) {
  const firstName = (name ?? '').split(/\s+/)[0] ?? '';
  const title =
    queueCount > 0
      ? 'Your work is ordered. Start at the top.'
      : 'The queue is clear. Build fresh evidence.';
  const description =
    queueCount > 0
      ? 'Due review, unfinished analysis, recall work, and today’s plan are in one list.'
      : 'Start one focused block. Today’s tags will decide what deserves another look.';

  return (
    <section
      className="u-panel immersive-dashboard-hero relative overflow-hidden"
      aria-labelledby="dashboard-next-move"
    >
      <div className="immersive-dashboard-hero__halo" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <span className="immersive-dashboard-hero__thread" aria-hidden />
      <div className="relative z-10 grid md:grid-cols-[minmax(0,1fr)_248px]">
        <div className="px-4 py-6 sm:px-7 sm:py-9 lg:px-9 lg:py-10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="u-label flex items-center gap-2 text-accent">
              <Sparkles size={12} strokeWidth={1.8} aria-hidden />
              Today’s next move
            </p>
            <span className="hidden h-1 w-1 rounded-full bg-border-hover sm:block" aria-hidden />
            <p className="text-[12px] text-text-faint">
              {greeting(new Date().getHours(), firstName)}
            </p>
            <span className="immersive-live-readout">
              <i /> evidence live
            </span>
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
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <MagneticAction>{action}</MagneticAction>
            {due > 0 && (
              <span className="immersive-inline-note text-[11.5px] text-text-faint">
                {overdue > 0 ? `${overdue} carried forward` : 'All scheduled for today'}
              </span>
            )}
          </div>
        </div>

        <div className="immersive-queue-orbit relative flex min-h-[188px] flex-col justify-between border-t border-border/70 px-5 py-5 sm:min-h-[196px] sm:px-6 sm:py-6 md:border-l md:border-t-0">
          <div className="immersive-queue-orbit__rings" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="u-label text-accent">Do now</span>
            <Orbit
              size={17}
              strokeWidth={1.75}
              className="immersive-orbit-icon text-accent"
              aria-hidden
            />
          </div>
          <div className="relative z-10">
            <span className="u-num block text-[52px] font-semibold leading-none tracking-[-0.06em] text-text sm:text-[58px]">
              {queueCount}
            </span>
            <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
              {queueCount > 0 ? 'ordered actions' : 'nothing waiting'}
            </p>
          </div>
          <p className="relative z-10 mt-5 flex items-center gap-2 border-t border-border/70 pt-3 text-[11px] text-text-faint">
            <CalendarDays size={12} strokeWidth={1.75} aria-hidden />
            <span>{formatDate(today, 'EEEE, dd MMM')}</span>
            {showCountdown ? (
              <>
                <span aria-hidden>·</span>
                <span className="u-num">T−{daysLeft}d</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}
