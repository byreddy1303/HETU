import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  FileCheck2,
  History,
  Plus,
  Settings2,
  ScanLine
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { todayISOInTimeZone, formatDate } from '@/lib/utils';
import DailyPracticePlan from '@/components/practice/DailyPracticePlan';
import TodayActions from '@/components/dashboard/TodayActions';
import PageHeader from '@/components/layout/PageHeader';
import CoverageMap from '@/components/progress/CoverageMap';
import MissionBoard from '@/components/progress/MissionBoard';
import { useStudySignals } from '@/hooks/useStudySignals';

const directions = [
  {
    href: '/pyq',
    title: 'Practice',
    description: 'A fresh set of questions, at your own pace.',
    icon: BookOpen
  },
  {
    href: '/skills',
    title: 'Check a skill',
    description: 'Find the distinction that makes it click.',
    icon: ScanLine
  },
  {
    href: '/mocks',
    title: 'Review a mock',
    description: 'Reflect on a test. Choose what comes next.',
    icon: FileCheck2
  }
];

export default function LocalStudyDesk() {
  const { userId, profile } = useAuth();
  const today = todayISOInTimeZone(profile?.timezone ?? 'Asia/Kolkata');
  const { signals, bank, bankError, retryBank } = useStudySignals();
  return (
    <div className="study-desk">
      <PageHeader
        compact
        title="Today"
        description={formatDate(today, 'EEEE, dd MMMM')}
        actions={
          <Link
            to="/planner"
            className="u-button inline-flex items-center gap-2 rounded border border-border bg-bg-raised px-3 py-2 text-sm font-medium text-text-muted hover:border-border-hover hover:text-text"
          >
            <CalendarDays size={15} aria-hidden /> Plan your day
          </Link>
        }
      />
      {userId && (
        <MissionBoard
          signals={signals}
          today={today}
          bankLoaded={bank.loaded}
          bankError={bankError}
          lastYear={bank.lastYear}
          onRetryBank={retryBank}
        />
      )}
      {userId && <TodayActions key={`${userId}:${today}`} userId={userId} today={today} />}
      {signals && (
        <CoverageMap
          subjects={signals.subjects}
          bankLoaded={bank.loaded}
          lastYear={bank.lastYear}
          includeAptitude={false}
          limit={4}
          moreHref="/progress"
        />
      )}
      <details className="rounded-xl border border-border bg-bg-raised p-4">
        <summary className="cursor-pointer text-sm font-medium">Build a balanced session</summary>
        <div className="mt-4">
          <DailyPracticePlan />
        </div>
      </details>
      <Link
        to="/practice-lab"
        className="inline-flex items-center gap-2 text-sm font-medium text-accent"
      >
        Mistake repairs and short reviews <ArrowUpRight size={15} />
      </Link>
      <section className="study-directions" aria-label="Choose your study direction">
        <h2 className="study-section-label">Keep learning</h2>
        <div className="study-directions__grid">
          {directions.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} to={href} className="study-direction">
              <div className="study-direction__top">
                <span className="study-direction__icon">
                  <Icon size={17} strokeWidth={1.6} aria-hidden />
                </span>
                <ArrowUpRight size={15} strokeWidth={1.6} aria-hidden />
              </div>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <nav className="study-shortcuts" aria-label="Workspace shortcuts">
        <Link to="/capture">
          <Plus size={14} aria-hidden />
          Capture a question
        </Link>
        <Link to="/memory">
          <History size={14} aria-hidden />
          Study history
        </Link>
        <Link to="/settings">
          <Settings2 size={14} aria-hidden />
          Local settings
        </Link>
      </nav>
    </div>
  );
}
