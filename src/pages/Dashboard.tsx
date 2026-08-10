import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowRight, BookOpenCheck, CalendarRange, Target } from 'lucide-react';
import HeroCard from '@/components/dashboard/HeroCard';
import LearningTips from '@/components/dashboard/LearningTips';
import OutcomeDonut from '@/components/dashboard/OutcomeDonut';
import OutcomeLegend from '@/components/dashboard/OutcomeLegend';
import SurfaceTrendChart from '@/components/dashboard/SurfaceTrendChart';
import WelcomeOverlay from '@/components/dashboard/WelcomeOverlay';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { usePrefsStore } from '@/stores/prefs';
import {
  calendarDateInTimeZone,
  cn,
  formatDate,
  plural,
  todayISOInTimeZone,
  weekStartISO
} from '@/lib/utils';
import { EXAM_DATE_DEFAULT, OUTCOMES } from '@/lib/constants';
import { subjectInk } from '@/lib/subjectInk';
import { buildLearningTips } from '@/lib/learning-tips';
import {
  allSessions,
  practiceQuestionCount,
  pruneEmptyFinishedSessions,
  reconcilePyqPracticeSessions
} from '@/lib/sessions';
import { PYQ_BANK_QUESTION_COUNT } from '@/lib/pyq';
import { buildDoNowQueue } from '@/lib/do-now';
import { loadDayPlan } from '@/lib/planner-storage';
import {
  dueTodayCount,
  latestSession,
  mistakeSurfaceMovement,
  mistakeSurfaceOpen,
  mistakeSurfaceSeries,
  outcomeDistribution
} from '@/lib/analysis';

function TargetMeter({ label, done, target }: { label: string; done: number; target: number }) {
  const progress = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const remaining = Math.max(0, target - done);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-text">{label}</span>
        <span className="u-num text-[12px] text-text-muted">
          <span className="font-semibold text-text">{done}</span> / {target}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-overlay"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(done, target)}
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-1.5 text-[10.5px] text-text-faint">
        {remaining === 0 ? 'Target met. More is optional.' : `${remaining} remaining at your current setting.`}
      </p>
    </div>
  );
}

function OutcomeKey({ distribution }: { distribution: ReturnType<typeof outcomeDistribution> }) {
  const dot: Record<(typeof OUTCOMES)[number]['tone'], string> = {
    ok: 'bg-success',
    slow: 'bg-warn',
    guess: 'bg-guess',
    wrong: 'bg-danger'
  };

  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-2">
      {OUTCOMES.map((outcome) => (
        <div key={outcome.code} className="flex items-center gap-1.5 text-[11px]">
          <span className={cn('h-1.5 w-1.5 rounded-full', dot[outcome.tone])} aria-hidden />
          <span className="text-text-muted">{outcome.code}</span>
          <span className="u-num ml-auto text-text">{distribution[outcome.code]}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const today = todayISOInTimeZone(timeZone);
  const currentWeek = weekStartISO(today);
  const dailyQuestionTarget = usePrefsStore((state) => state.dailyQuestionTarget);
  const weeklySessionTarget = usePrefsStore((state) => state.weeklySessionTarget);
  const showCountdown = usePrefsStore((state) => state.showCountdown);

  const reattempts = useLiveQuery(
    async () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const sessions = useLiveQuery(
    async () => (userId ? allSessions(userId, timeZone) : []),
    [userId, timeZone],
    []
  );
  const questions = useLiveQuery(
    async () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const pyqAttempts = useLiveQuery(
    async () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const formulas = useLiveQuery(
    async () => (userId ? db.formulas.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  useEffect(() => {
    if (!userId) return;
    void reconcilePyqPracticeSessions(userId, timeZone).then(() =>
      pruneEmptyFinishedSessions(userId)
    );
  }, [userId, timeZone]);

  const weeklyFixRow = useLiveQuery(async () => {
    if (!userId) return undefined;
    const rows = await db.weekly_reviews.where('user_id').equals(userId).sortBy('week_start');
    return rows.at(-1);
  }, [userId]);

  const weeklyFix = weeklyFixRow?.this_weeks_fix;
  const weeklyFixCurrent = weeklyFixRow?.week_start === currentWeek;
  const last = useMemo(() => latestSession(sessions), [sessions]);
  const lastSessionQuestions = useMemo(
    () => (last ? questions.filter((question) => question.session_id === last.id) : []),
    [last, questions]
  );
  const lastSessionPyqAttempts = useMemo(
    () =>
      last?.kind === 'pyq'
        ? pyqAttempts.filter((attempt) => attempt.pyq_session_id === last.id)
        : [],
    [last, pyqAttempts]
  );
  const lastSessionQuestionCount =
    last?.kind === 'pyq' ? lastSessionPyqAttempts.length : lastSessionQuestions.length;
  const distribution = useMemo(
    () => outcomeDistribution(lastSessionQuestions),
    [lastSessionQuestions]
  );

  const due = useMemo(() => dueTodayCount(reattempts, today), [reattempts, today]);
  const doNowQueue = useMemo(
    () =>
      buildDoNowQueue({
        today,
        reattempts,
        questions,
        pyqAttempts,
        formulas,
        plan: loadDayPlan(today)
      }),
    [formulas, pyqAttempts, questions, reattempts, today]
  );
  const overdue = useMemo(
    () => reattempts.filter((row) => row.stage !== 'MASTERED' && row.scheduled_date < today).length,
    [reattempts, today]
  );
  const surface = useMemo(() => mistakeSurfaceOpen(reattempts), [reattempts]);
  const movement = useMemo(
    () => mistakeSurfaceMovement(reattempts, new Date(), timeZone),
    [reattempts, timeZone]
  );
  const surfaceSeries = useMemo(
    () => mistakeSurfaceSeries(reattempts, new Date(), timeZone),
    [reattempts, timeZone]
  );
  const questionsToday = useMemo(() => {
    const journalRows = questions.filter(
      (question) => calendarDateInTimeZone(question.created_at, timeZone) === today
    );
    const attemptRows = pyqAttempts.filter(
      (attempt) => calendarDateInTimeZone(attempt.attempted_at, timeZone) === today
    );
    return practiceQuestionCount(journalRows, attemptRows);
  }, [questions, pyqAttempts, timeZone, today]);
  const sessionsThisWeek = useMemo(
    () => sessions.filter((session) => session.date >= currentWeek && session.date <= today).length,
    [sessions, currentWeek, today]
  );
  const uniquePyqsSeen = useMemo(
    () => new Set(pyqAttempts.map((attempt) => attempt.question_uid)).size,
    [pyqAttempts]
  );
  const learningTips = useMemo(
    () =>
      buildLearningTips({
        due,
        weeklyFix,
        lastSessionQuestions,
        sessionsThisWeek,
        questionsToday
      }),
    [due, weeklyFix, lastSessionQuestions, sessionsThisWeek, questionsToday]
  );

  const examDate = profile?.exam_date ?? EXAM_DATE_DEFAULT;
  const daysLeft = differenceInCalendarDays(parseISO(examDate), new Date());
  const netLabel = movement.net > 0 ? `+${movement.net}` : String(movement.net);
  const notClean = lastSessionQuestions.length - distribution.R;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <WelcomeOverlay />
      <HeroCard
        name={profile?.name}
        today={today}
        showCountdown={showCountdown}
        daysLeft={daysLeft}
        due={due}
        overdue={overdue}
        queueCount={doNowQueue.length}
        action={
          <Button
            variant="primary"
            onClick={() => navigate('/today')}
            aria-label={`${doNowQueue.length} ordered actions. Open Do now`}
          >
            Open Do now
            <ArrowRight size={15} strokeWidth={2} aria-hidden />
          </Button>
        }
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            title="Mistake surface"
            aside={<span className="u-label text-text-faint">7 local days</span>}
            className="flex-nowrap items-center [&>div]:w-auto [&>div]:shrink-0"
          />
          <CardBody>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="u-num text-[34px] font-semibold leading-none text-text">{surface}</p>
                <p className="mt-1.5 text-[11.5px] text-text-muted">open re-attempts now</p>
              </div>
              <div className="rounded-full border border-border bg-bg-overlay/50 px-3 py-1.5 text-[10.5px] text-text-muted">
                <span className="u-num font-semibold text-text">{netLabel}</span> net in seven days
              </div>
            </div>
            <div className="mt-2">
              <SurfaceTrendChart data={surfaceSeries} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border pt-3">
              <div className="pr-3 sm:pr-4">
                <p className="u-label">Opened</p>
                <p className="mt-1 text-[12px] text-text-muted">
                  <span className="u-num font-semibold text-text">{movement.opened}</span> added in 7 days
                </p>
              </div>
              <div className="pl-3 sm:pl-4">
                <p className="u-label">Mastered</p>
                <p className="mt-1 text-[12px] text-text-muted">
                  <span className="u-num font-semibold text-success">{movement.mastered}</span> closed in 7 days
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Practice pulse"
            aside={<Target size={14} className="text-accent" aria-hidden />}
            className="flex-nowrap items-center [&>div]:w-auto [&>div]:shrink-0"
          />
          <CardBody className="flex h-[calc(100%-41px)] flex-col gap-5">
            <TargetMeter label="Questions today" done={questionsToday} target={dailyQuestionTarget} />
            <TargetMeter label="Sessions this week" done={sessionsThisWeek} target={weeklySessionTarget} />
            <button
              type="button"
              onClick={() => navigate('/pyq')}
              className="u-tactile-tile group mt-auto w-full rounded-md p-3.5 text-left"
            >
              <span className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-accent/15 bg-accent-faint/55 text-accent shadow-sm">
                  <BookOpenCheck size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="font-display text-[14px] font-semibold leading-snug text-text">
                      PYQ practice bank
                    </span>
                    <ArrowRight
                      size={14}
                      className="mt-0.5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed text-text-faint">
                    <span>
                      <span className="u-num text-text-muted">{uniquePyqsSeen.toLocaleString()}</span> of{' '}
                      <span className="u-num text-text-muted">
                        {PYQ_BANK_QUESTION_COUNT.toLocaleString()}
                      </span>{' '}
                      seen
                    </span>
                    <span className="h-1 w-1 rounded-full bg-border-hover" aria-hidden />
                    <span>
                      <span className="u-num text-text-muted">
                        {pyqAttempts.length.toLocaleString()}
                      </span>{' '}
                      attempts
                    </span>
                  </span>
                </span>
              </span>
            </button>
          </CardBody>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Weekly focus"
            aside={<CalendarRange size={14} className="text-ink-marigold" aria-hidden />}
            className="flex-nowrap items-center [&>div]:w-auto [&>div]:shrink-0"
          />
          <CardBody className="flex min-h-[200px] flex-col sm:min-h-[220px] lg:min-h-[260px]">
            {weeklyFix ? (
              <>
                <p className="u-label text-text-muted">
                  {weeklyFixCurrent
                    ? 'Current constraint'
                    : `From ${formatDate(weeklyFixRow!.week_start, 'dd MMM')}`}
                </p>
                <p className="mt-3 font-display text-[22px] font-semibold leading-snug tracking-[-0.015em] text-text">
                  <span className={cn(weeklyFixCurrent && 'u-highlight')}>{weeklyFix}</span>
                </p>
                {!weeklyFixCurrent && (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-text-faint">
                    This focus is stale. Review this week’s evidence before treating it as current.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="u-label text-text-muted">No constraint set</p>
                <p className="mt-3 font-display text-[20px] font-semibold leading-snug text-text">
                  Turn the week’s evidence into one fix.
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-text-faint">
                  One specific change is easier to execute than a list of weak areas.
                </p>
              </>
            )}
            <div className="mt-auto pt-5">
              <Button size="sm" variant="ghost" onClick={() => navigate('/weekly-review')} className="-ml-3">
                {weeklyFix ? 'Open weekly review' : 'Set weekly focus'}
                <ArrowRight size={13} aria-hidden />
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            title="Last session"
            aside={lastSessionQuestions.length > 0 ? <OutcomeLegend /> : undefined}
            className="flex-nowrap items-center [&>div]:w-auto [&>div]:shrink-0"
          />
          <CardBody className="min-h-[192px] sm:min-h-[260px]">
            {last ? (
              <div className="flex h-full flex-col gap-4 sm:flex-row sm:items-center">
                {lastSessionQuestions.length > 0 ? (
                  <OutcomeDonut distribution={distribution} total={lastSessionQuestions.length} />
                ) : (
                  <div className="flex h-[130px] w-[130px] shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-bg-overlay/30 text-center">
                    <span className="u-label max-w-[80px]">No tagged questions</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', subjectInk(last.subject).dot)} aria-hidden />
                    <h2 className="font-display text-[19px] font-semibold text-text">{last.subject}</h2>
                  </div>
                  <p className="mt-1 text-[11.5px] text-text-faint">
                    {formatDate(last.date)} ·{' '}
                    <span className="u-num">{last.actual_duration_min ?? 0}</span> min ·{' '}
                    <span className="u-num">{lastSessionQuestionCount}</span>{' '}
                    {plural(lastSessionQuestionCount, last.kind === 'pyq' ? 'submission' : 'question')}
                  </p>
                  {lastSessionQuestions.length > 0 && (
                    <>
                      <div className="mt-4 max-w-[360px]">
                        <OutcomeKey distribution={distribution} />
                      </div>
                      <p className="mt-3 text-[11.5px] text-text-muted">
                        <span className="u-num font-semibold text-text">{distribution.R}</span> clean ·{' '}
                        <span className="u-num font-semibold text-danger">{notClean}</span> not clean
                      </p>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/session/${last.id}/review`)}
                    className="-ml-3 mt-3"
                  >
                    Open session review
                    <ArrowRight size={13} aria-hidden />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[160px] flex-col items-center justify-center text-center sm:min-h-[228px]">
                <p className="font-display text-[18px] font-semibold text-text">No session evidence yet</p>
                <p className="mt-2 max-w-[360px] text-[12.5px] leading-relaxed text-text-faint">
                  Finish a focused, log, or PYQ practice session and its outcome shape will appear here.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <LearningTips tips={learningTips} />
    </div>
  );
}
