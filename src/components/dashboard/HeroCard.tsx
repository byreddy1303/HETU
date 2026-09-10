import { useState, type ReactNode } from 'react';
import { CalendarDays, Pause, Play } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import LearningSculpture from '@/components/shared/LearningSculpture';
import { formatDate } from '@/lib/utils';
import './dashboard-hero.css';

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
  const reducedMotion = useReducedMotion();
  const [motionPaused, setMotionPaused] = useState(false);
  const firstName = (name ?? '').split(/\s+/)[0] ?? '';
  const title =
    queueCount > 0 ? 'Your next step, in clear focus.' : 'A clear queue. A fresh starting point.';
  const description =
    queueCount > 0
      ? 'Your reviews, unfinished analysis, recall work, and today’s plan. All ordered, so you can give the next step your full attention.'
      : 'Begin a focused study block. Capture what you learn, and turn the questions that challenge you into your next insight.';

  return (
    <section className="dashboard-hero" aria-labelledby="dashboard-next-move">
      <div className="dashboard-hero__body">
        <div className="dashboard-hero__content">
          <p className="dashboard-hero__greeting">
            <span className="dashboard-hero__greeting-mark" aria-hidden />
            {greeting(new Date().getHours(), firstName)}
          </p>
          <h1 id="dashboard-next-move" className="dashboard-hero__title font-display">
            {title}
          </h1>
          <p className="dashboard-hero__description">{description}</p>
          <div className="dashboard-hero__action">{action}</div>
        </div>

        <div className="dashboard-hero__visual">
          {!reducedMotion && (
            <button
              type="button"
              className="dashboard-hero__motion"
              onClick={() => setMotionPaused((paused) => !paused)}
              aria-label={motionPaused ? 'Resume sculpture motion' : 'Pause sculpture motion'}
              aria-pressed={motionPaused}
            >
              {motionPaused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
              {motionPaused ? 'Resume motion' : 'Pause motion'}
            </button>
          )}
          <LearningSculpture
            className="dashboard-hero__sculpture"
            paused={motionPaused || Boolean(reducedMotion)}
            compact
          />
          <div className="dashboard-hero__queue">
            <span className="dashboard-hero__queue-number font-display">{queueCount}</span>
            <div className="dashboard-hero__queue-copy">
              <span>{queueCount === 1 ? 'next action' : 'next actions'}</span>
              <span>{queueCount > 0 ? 'Ready when you are' : 'Space to start something new'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-hero__footer">
        <dl className="dashboard-hero__review-stats">
          <div>
            <dt>Review due</dt>
            <dd>{due}</dd>
          </div>
          <div>
            <dt>Carried forward</dt>
            <dd>{overdue}</dd>
          </div>
        </dl>
        <div className="dashboard-hero__calendar">
          <CalendarDays size={16} strokeWidth={1.6} aria-hidden />
          <p>
            <time dateTime={today}>{formatDate(today, 'EEEE, dd MMM')}</time>
            {showCountdown && (
              <span>
                {daysLeft > 0
                  ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to exam`
                  : daysLeft === 0
                    ? 'Exam day'
                    : 'Exam date passed'}
              </span>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
