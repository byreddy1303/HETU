import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { todayISOInTimeZone, formatDate } from '@/lib/utils';
import TodayActions from '@/components/dashboard/TodayActions';
import PageHeader from '@/components/layout/PageHeader';

export default function LocalStudyDesk() {
  const { userId, profile } = useAuth();
  const today = todayISOInTimeZone(profile?.timezone ?? 'Asia/Kolkata');
  return (
    <div className="space-y-5">
      <PageHeader
        compact
        title="Today"
        description={formatDate(today, 'EEEE, dd MMMM')}
        actions={
          <Link to="/planner" className="text-sm font-medium text-accent underline">
            Plan your day
          </Link>
        }
      />
      {userId && <TodayActions key={`${userId}:${today}`} userId={userId} today={today} />}
      <section
        className="space-y-3 border-t border-border pt-4"
        aria-label="Choose your study direction"
      >
        <h2 className="font-display text-lg font-semibold">Choose your next direction</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['/pyq', 'Practice', 'Start a new set or continue your saved questions.'],
            ['/skills', 'Check a skill', 'Compare two conditions and follow a targeted repair.'],
            ['/mocks', 'Review a mock', 'Turn a completed test into a few useful next actions.']
          ].map(([href, title, description]) => (
            <Link
              key={href}
              to={href}
              className="rounded border border-border bg-bg-raised p-4 hover:border-accent"
            >
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-text-muted">{description}</p>
            </Link>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/capture" className="text-accent underline">
          Capture a question
        </Link>
        <Link to="/memory" className="text-accent underline">
          Study history
        </Link>
        <Link to="/settings" className="text-accent underline">
          Local settings
        </Link>
      </div>
    </div>
  );
}
