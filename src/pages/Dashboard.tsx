// Dashboard proper (F3.4): due today, weekly fix, mistake-surface trend,
// last-session outcome distribution. All numbers are derived from Dexie and
// mirror the SQL semantics of analysis.ts.
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ArrowRight, BookOpenCheck } from 'lucide-react';
import type { Outcome } from '@/types';
import HeroCard from '@/components/dashboard/HeroCard';
import LearningTips from '@/components/dashboard/LearningTips';
import WelcomeOverlay from '@/components/dashboard/WelcomeOverlay';
import OutcomeLegend from '@/components/dashboard/OutcomeLegend';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Empty } from '@/components/ui/Empty';
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
import { EXAM_DATE_DEFAULT, OUTCOMES, OUTCOME_BY_CODE } from '@/lib/constants';
import { subjectInk } from '@/lib/subjectInk';
import { buildLearningTips } from '@/lib/learning-tips';
import { allSessions, pruneEmptyFinishedSessions } from '@/lib/sessions';
import { PYQ_BANK_QUESTION_COUNT } from '@/lib/pyq';
import {
  dueTodayCount,
  latestSession,
  mistakeSurfaceMovement,
  mistakeSurfaceOpen,
  outcomeDistribution
} from '@/lib/analysis';

const TONE_BG: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'bg-success',
  slow: 'bg-warn',
  guess: 'bg-guess',
  wrong: 'bg-danger'
};

const TONE_TEXT: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'text-success',
  slow: 'text-warn',
  guess: 'text-guess',
  wrong: 'text-danger'
};

function Stat({
  label,
  value,
  color,
  dot,
  hint,
  onClick,
  actionLabel
}: {
  label: string;
  value: number;
  color: string;
  dot: string;
  hint?: React.ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const content = (
    <>
      <span className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
        <span className="u-label">{label}</span>
      </span>
      <span
        className={cn(
          'u-num text-[28px] font-semibold leading-none',
          value > 0 ? color : 'text-text-faint'
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[12px] text-text-faint">{hint}</span>}
      {onClick && actionLabel ? (
        <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent">
          {actionLabel}
          <ArrowRight size={13} strokeWidth={2} />
        </span>
      ) : null}
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[104px] w-full flex-col gap-1.5 px-4 py-4 text-left transition-colors hover:bg-accent-faint/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      aria-label={`${label}: ${value}. ${actionLabel ?? 'Open'}`}
    >
      {content}
    </button>
  ) : (
    <div className="flex min-h-[104px] flex-col gap-1.5 px-4 py-4">{content}</div>
  );
}

function ProgressBlock({
  label,
  done,
  target,
  tone
}: {
  label: string;
  done: number;
  target: number;
  tone: 'accent' | 'teal';
}) {
  const pct = target > 0 ? Math.min(1, done / target) : 0;
  const bar = tone === 'accent' ? 'bg-accent' : 'bg-ink-teal';
  const met = done >= target;
  return (
    <div className="rounded border border-border/70 bg-bg-overlay/30 px-3 py-3">
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="u-label">{label}</span>
        <span className="u-num text-text-muted">
          <span className={cn('text-text', met && 'text-success')}>{done}</span>
          <span className="text-text-faint"> / {target}</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-bg-overlay">
        <div
          className={cn('h-2 transition-all', bar)}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-text-faint">
        {met ? 'On target for today.' : `${target - done} to go.`}
      </p>
    </div>
  );
}

function SurfaceMovement({ opened, mastered }: { opened: number; mastered: number }) {
  return (
    <span className="text-[12px] text-text-faint">
      <span className="u-num text-text-muted">{opened}</span> opened ·{' '}
      <span className="u-num text-success">{mastered}</span> mastered in 7 days
    </span>
  );
}

function OutcomeBar({
  distribution,
  total
}: {
  distribution: Record<Outcome, number>;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-bg-overlay">
        {OUTCOMES.map((o) => {
          const n = distribution[o.code];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <div
              key={o.code}
              className={cn('h-full', TONE_BG[o.tone])}
              style={{ width: `${pct}%` }}
              aria-label={`${o.code}: ${n}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        {OUTCOMES.map((o) => (
          <span key={o.code} className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', TONE_BG[o.tone])} />
            <span className="text-text-muted">{o.code}</span>
            <span
              className={cn(
                'u-num',
                distribution[o.code] > 0 ? TONE_TEXT[o.tone] : 'text-text-faint'
              )}
            >
              {distribution[o.code]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const today = todayISOInTimeZone(timeZone);
  const currentWeek = weekStartISO(today);
  const dailyQuestionTarget = usePrefsStore((s) => s.dailyQuestionTarget);
  const weeklySessionTarget = usePrefsStore((s) => s.weeklySessionTarget);
  const showCountdown = usePrefsStore((s) => s.showCountdown);

  const reattempts = useLiveQuery(
    async () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  const sessions = useLiveQuery(async () => (userId ? allSessions(userId) : []), [userId], []);

  const pyqAttempts = useLiveQuery(
    async () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const uniquePyqsSeen = useMemo(
    () => new Set(pyqAttempts.map((attempt) => attempt.question_uid)).size,
    [pyqAttempts]
  );

  // Remove legacy empty completions while the filtered query above prevents
  // them from ever flashing as the Last session or affecting counts.
  useEffect(() => {
    if (!userId) return;
    void pruneEmptyFinishedSessions(userId);
  }, [userId]);

  const weeklyFixRow = useLiveQuery(async () => {
    if (!userId) return undefined;
    const rows = await db.weekly_reviews.where('user_id').equals(userId).sortBy('week_start');
    return rows.at(-1);
  }, [userId]);
  const weeklyFix = weeklyFixRow?.this_weeks_fix;
  const weeklyFixCurrent = weeklyFixRow?.week_start === currentWeek;

  const last = useMemo(() => latestSession(sessions), [sessions]);

  const lastSessionQuestions = useLiveQuery(
    async () => {
      if (!last) return [];
      return db.questions.where('session_id').equals(last.id).toArray();
    },
    [last?.id],
    []
  );

  const surface = useMemo(() => mistakeSurfaceOpen(reattempts), [reattempts]);
  const movement = useMemo(
    () => mistakeSurfaceMovement(reattempts, new Date(), timeZone),
    [reattempts, timeZone]
  );
  const due = useMemo(() => dueTodayCount(reattempts, today), [reattempts, today]);
  const overdue = useMemo(
    () => reattempts.filter((row) => row.stage !== 'MASTERED' && row.scheduled_date < today).length,
    [reattempts, today]
  );
  const dist = useMemo(() => outcomeDistribution(lastSessionQuestions), [lastSessionQuestions]);

  // Today's tagged questions across ALL sessions and standalone /log entries.
  const questionsToday = useLiveQuery(
    async () => {
      if (!userId) return 0;
      const rows = await db.questions.where('user_id').equals(userId).toArray();
      return rows.filter(
        (question) => calendarDateInTimeZone(question.created_at, timeZone) === today
      ).length;
    },
    [userId, today, timeZone],
    0
  );

  const sessionsThisWeek = useMemo(() => {
    return sessions.filter((session) => session.date >= currentWeek && session.date <= today)
      .length;
  }, [sessions, currentWeek, today]);

  const examDate = profile?.exam_date ?? EXAM_DATE_DEFAULT;
  const daysLeft = differenceInCalendarDays(parseISO(examDate), new Date());
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

  return (
    <div className="flex flex-col gap-4">
      <WelcomeOverlay />
      <HeroCard
        name={profile?.name}
        userId={userId}
        showCountdown={showCountdown}
        daysLeft={daysLeft}
        action={
          <Button
            variant="primary"
            onClick={() => navigate(due > 0 ? '/reattempts?open=first' : '/session/new')}
          >
            {due > 0 ? 'Start re-attempts' : 'New session'}
          </Button>
        }
      />

      <LearningTips tips={learningTips} />

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => navigate('/pyq')}
          className="group flex w-full flex-col gap-4 p-4 text-left transition-colors hover:bg-accent-faint/35 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent-faint text-accent">
              <BookOpenCheck size={20} strokeWidth={1.8} />
            </span>
            <span>
              <span className="font-display text-[16px] font-semibold text-text">
                Practice GATE CSE PYQs
              </span>
              <span className="mt-0.5 block text-[12px] text-text-muted">
                {PYQ_BANK_QUESTION_COUNT.toLocaleString()} full questions · options, diagrams, and
                keys · 2002–2026
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-right">
              <span className="u-num block text-[14px] font-semibold text-text">
                {uniquePyqsSeen.toLocaleString()} seen
              </span>
              <span className="u-label block">{pyqAttempts.length.toLocaleString()} attempts</span>
            </span>
            <ArrowRight
              size={17}
              className="text-accent transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </button>
      </Card>

      <Card>
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <Stat
            label="Due now"
            value={due}
            color="text-accent"
            dot="bg-accent"
            onClick={due > 0 ? () => navigate('/reattempts?open=first') : undefined}
            hint={overdue > 0 ? `${overdue} carried forward` : 'ready when scheduled'}
            actionLabel="Start review"
          />
          <Stat
            label="Mistake surface"
            value={surface}
            color="text-ink-violet"
            dot="bg-ink-violet"
            hint={<SurfaceMovement opened={movement.opened} mastered={movement.mastered} />}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Today's plan"
          aside={<span className="text-[11px] text-text-faint">calm targets from Settings</span>}
        />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProgressBlock
            label="Questions today"
            done={questionsToday}
            target={dailyQuestionTarget}
            tone="accent"
          />
          <ProgressBlock
            label="Sessions this week"
            done={sessionsThisWeek}
            target={weeklySessionTarget}
            tone="teal"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={weeklyFixCurrent ? "This week's fix" : 'Most recent weekly fix'}
          aside={
            <Button size="sm" variant="ghost" onClick={() => navigate('/weekly-review')}>
              Open review
            </Button>
          }
        />
        <CardBody>
          {weeklyFix ? (
            <div>
              <p className="text-[15px] leading-relaxed">
                <span className={cn('font-medium', weeklyFixCurrent && 'u-highlight')}>
                  {weeklyFix}
                </span>
              </p>
              {!weeklyFixCurrent && weeklyFixRow && (
                <p className="mt-2 text-[11.5px] text-text-faint">
                  Set for the week of {formatDate(weeklyFixRow.week_start, 'dd MMM')}. Review this
                  week before treating it as current.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-text-faint">
              No weekly review yet. Your ONE fix for the week appears here after your first review.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Last session"
          aside={
            <div className="flex items-center gap-2">
              {last && lastSessionQuestions.length > 0 && <OutcomeLegend />}
              {last && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/session/${last.id}/review`)}
                >
                  Open review
                </Button>
              )}
            </div>
          }
        />
        <CardBody className="flex flex-col gap-4">
          {last ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm">
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', subjectInk(last.subject).dot)}
                    />
                    <span className="font-medium">{last.subject}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-faint">
                    {formatDate(last.date)} ·{' '}
                    {last.actual_duration_min != null ? (
                      <>
                        <span className="u-num">{last.actual_duration_min}</span> of{' '}
                        <span className="u-num">{last.target_duration_min}</span> min
                      </>
                    ) : (
                      <>
                        target <span className="u-num">{last.target_duration_min}</span> min · in
                        progress
                      </>
                    )}
                    {' · '}
                    <span className="u-num">{lastSessionQuestions.length}</span>{' '}
                    {plural(lastSessionQuestions.length, 'question')}
                  </p>
                </div>
              </div>
              {lastSessionQuestions.length > 0 ? (
                <OutcomeBar distribution={dist} total={lastSessionQuestions.length} />
              ) : (
                <p className="text-[12px] text-text-faint">
                  No questions tagged in this session yet.
                </p>
              )}
              {lastSessionQuestions.length > 0 && (
                <p className="text-[12px] text-text-faint">
                  {(() => {
                    const clean = dist['R'];
                    const notClean = lastSessionQuestions.length - clean;
                    if (notClean > 0) return `${notClean} not clean · ${clean} clean.`;
                    return `Clean session — nothing queued.`;
                  })()}
                  {OUTCOMES.find((o) => o.code === 'RBS' && dist[o.code] > 0) &&
                    ` ${OUTCOME_BY_CODE['RBS'].label} means the target time was blown.`}
                </p>
              )}
            </>
          ) : (
            <Empty
              title="No sessions yet"
              hint="Start a timed session, tag every question, and this page starts earning its keep."
              action={<Button onClick={() => navigate('/session/new')}>Start first session</Button>}
              className="border-0 py-8"
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
