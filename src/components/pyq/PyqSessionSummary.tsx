import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileQuestion,
  ListChecks,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sparkles,
  XCircle,
  type LucideIcon
} from 'lucide-react';
import type {
  PyqAttemptRow,
  PyqExamValidityReason,
  PyqSelectedAnswer,
  PyqSessionRow
} from '@/types';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import {
  buildPyqSessionSummary,
  type PyqQuestionSummary,
  type PyqSummaryOutcome
} from '@/lib/pyq-summary';
import { cn, secondsToClock } from '@/lib/utils';

type ChartOrder = 'question' | 'attempt';
type ChartMetric = 'marks' | 'time';
type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn' | 'guess';

const MARKS_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const OUTCOME_META: Record<
  PyqSummaryOutcome,
  { label: string; shortLabel: string; tone: BadgeTone; barClass: string; icon: LucideIcon }
> = {
  correct: {
    label: 'Correct',
    shortLabel: 'Correct',
    tone: 'success',
    barClass: 'bg-success',
    icon: CheckCircle2
  },
  wrong: {
    label: 'Incorrect',
    shortLabel: 'Wrong',
    tone: 'danger',
    barClass: 'bg-danger',
    icon: XCircle
  },
  skipped: {
    label: 'Left blank',
    shortLabel: 'Skipped',
    tone: 'warn',
    barClass: 'bg-warn',
    icon: CircleDashed
  },
  bonus: {
    label: 'Marks awarded to all',
    shortLabel: 'Bonus',
    tone: 'accent',
    barClass: 'bg-accent',
    icon: Sparkles
  },
  unscorable: {
    label: 'Not scorable',
    shortLabel: 'Unscored',
    tone: 'guess',
    barClass: 'bg-guess',
    icon: CircleHelp
  },
  'not-submitted': {
    label: 'Not submitted',
    shortLabel: 'No receipt',
    tone: 'neutral',
    barClass: 'bg-text-faint',
    icon: FileQuestion
  }
};

const VALIDITY_REASON_LABELS: Record<PyqExamValidityReason, string> = {
  'not-full-paper': 'Timed set, not a full paper',
  'prior-exposure': 'Paper was not fully unseen',
  paused: 'Timer was paused',
  'closed-book-unconfirmed': 'Closed-book conditions were not confirmed',
  'incomplete-visit-coverage': 'Not all 65 questions were visited',
  'low-active-time': 'Active time was below the credibility threshold',
  'incomplete-scoring': 'Exact scoring did not cover all 100 marks',
  'nonstandard-paper': 'Paper identity or structure was nonstandard'
};

function formatMarks(value: number, signed = false): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const rendered = MARKS_FORMATTER.format(Math.abs(normalized));
  if (normalized < 0) return `−${rendered}`;
  if (signed && normalized > 0) return `+${rendered}`;
  return rendered;
}

function formatAnswer(value: PyqSelectedAnswer): string {
  if (value == null) return 'No answer captured';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'No answer captured';
  const rendered = String(value).trim();
  return rendered || 'No answer captured';
}

function learnerAnswer(attempt: PyqAttemptRow | null): string {
  if (!attempt) return 'Not submitted';
  if (attempt.capture_version < 2) return 'Not verifiably captured in this legacy receipt';
  if (attempt.mark_decision === 'SKIP') return 'Left blank';
  return formatAnswer(attempt.selected_answer);
}

function correctAnswer(attempt: PyqAttemptRow | null): string {
  if (!attempt) return 'No submitted receipt';
  if (attempt.capture_version < 2) return 'Not verifiably captured in this legacy receipt';
  if (attempt.answer_status === 'marks-to-all') return 'Marks awarded to all';
  if (attempt.answer_status === 'ambiguous') return 'Official key is ambiguous';
  if (attempt.answer_status === 'unsupported') return 'Official key could not be normalized';
  return formatAnswer(attempt.correct_answer);
}

function humanizeSlug(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sessionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function AccuracyDial({ percent }: { percent: number | null }) {
  const circumference = 2 * Math.PI * 50;
  const filled = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const dashOffset = circumference * (1 - filled / 100);
  const label = percent == null ? 'Accuracy unavailable' : `${percent}% graded accuracy`;

  return (
    <div
      role="img"
      aria-label={label}
      className="relative flex h-36 w-36 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-bg-overlay"
        />
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="text-accent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="u-num text-[28px] font-bold leading-none text-text">
          {percent == null ? '—' : `${percent}%`}
        </span>
        <span className="u-label mt-1">accuracy</span>
      </div>
    </div>
  );
}

function HeadlineStat({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: 'success' | 'danger' | 'warn' | 'accent';
}) {
  const toneClass = {
    success: 'text-success',
    danger: 'text-danger',
    warn: 'text-warn',
    accent: 'text-accent'
  }[tone];

  return (
    <div className="min-w-0 rounded border border-border bg-bg-overlay/30 px-3 py-3">
      <div className={cn('flex items-center gap-1.5', toneClass)}>
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        <span className="u-num text-[20px] font-semibold leading-none sm:text-[22px]">{value}</span>
      </div>
      <p className="u-label mt-1.5 truncate">{label}</p>
    </div>
  );
}

interface LedgerItem {
  label: string;
  value: ReactNode;
  detail?: string;
  valueClass?: string;
}

function LedgerCard({
  title,
  icon: Icon,
  items
}: {
  title: string;
  icon: LucideIcon;
  items: LedgerItem[];
}) {
  return (
    <section className="rounded border border-border bg-bg-raised shadow-sm" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={15} className="text-accent" aria-hidden="true" />
        <h3 className="u-label text-text-muted">{title}</h3>
      </div>
      <dl className="divide-y divide-border px-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex min-h-[58px] items-center justify-between gap-4 py-3"
          >
            <dt className="min-w-0 text-[12.5px] font-medium text-text-muted">
              {item.label}
              {item.detail ? (
                <span className="mt-0.5 block text-[10.5px] font-normal leading-snug text-text-faint">
                  {item.detail}
                </span>
              ) : null}
            </dt>
            <dd
              className={cn(
                'u-num shrink-0 text-right text-[20px] font-semibold leading-none text-text',
                item.valueClass
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ExamEvidenceReceipt({ session }: { session: PyqSessionRow }) {
  if (session.config.mode !== 'exam') return null;
  const state = session.config.examState;
  const qualified = state?.validity_status === 'qualified';
  const reasons = state?.validity_reasons ?? ['not-full-paper'];
  const metrics = state?.validity_metrics;
  const fullPaper = session.config.examKind === 'full-paper';

  return (
    <aside
      aria-label="Exam evidence validity"
      className={cn(
        'overflow-hidden rounded border shadow-sm',
        qualified ? 'border-success/35 bg-success-faint' : 'border-warn/35 bg-warn-faint'
      )}
    >
      <div className="flex flex-col gap-3 border-b border-current/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-bg-raised',
              qualified ? 'border-success/30 text-success' : 'border-warn/30 text-warn'
            )}
          >
            {qualified ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}
          </span>
          <div>
            <p className="u-label">Readiness evidence receipt</p>
            <h3 className="mt-1 font-display text-[18px] font-bold text-text">
              {qualified ? 'Qualified benchmark evidence' : 'Supporting evidence only'}
            </h3>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-text-muted">
              {qualified
                ? 'This outcome may enter the qualified mock range because every recorded validity condition passed.'
                : 'The score remains useful for diagnosis, but it does not enter the qualified readiness range.'}
            </p>
          </div>
        </div>
        {fullPaper ? (
          <div className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded border border-border bg-border text-center">
            {[
              ['65', 'questions'],
              ['100', 'marks'],
              ['180', 'minutes']
            ].map(([value, label]) => (
              <div key={label} className="min-w-[64px] bg-bg-raised px-2 py-2">
                <p className="u-num text-[16px] font-bold text-text">{value}</p>
                <p className="text-[8.5px] uppercase tracking-wide text-text-faint">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <Badge tone="warn">Timed diagnostic</Badge>
        )}
      </div>

      {metrics ? (
        <dl className="grid grid-cols-2 gap-px bg-border/70 sm:grid-cols-5">
          {[
            ['Visited', `${metrics.visited_question_count}/${metrics.question_count}`],
            ['Scored', `${metrics.scorable_marks}/${metrics.total_marks} marks`],
            ['Active time', secondsToClock(metrics.active_time_sec)],
            ['Prior exposure', metrics.prior_exposure_count ?? 'Unknown'],
            [
              'Conditions',
              `${metrics.closed_book_confirmed ? 'Closed book' : 'Unconfirmed'} · ${metrics.pause_count ?? 'Unknown'} pause${metrics.pause_count === 1 ? '' : 's'}`
            ]
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-bg-raised px-3 py-3">
              <dt className="u-label">{label}</dt>
              <dd className="mt-1 text-[11.5px] font-semibold leading-snug text-text">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!qualified ? (
        <div className="px-4 py-3 sm:px-5">
          <p className="u-label mb-2">Why it did not qualify</p>
          <ul className="flex flex-wrap gap-1.5">
            {reasons.map((reason) => (
              <li key={reason}>
                <Badge tone="warn">{VALIDITY_REASON_LABELS[reason]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 text-[11.5px] font-medium text-success sm:px-5">
          <LockKeyhole size={14} /> Fresh paper · closed book · single sitting · complete scoring
        </div>
      )}
    </aside>
  );
}

function QuestionChart({ questions }: { questions: PyqQuestionSummary[] }) {
  const [order, setOrder] = useState<ChartOrder>('question');
  const [metric, setMetric] = useState<ChartMetric>('marks');
  const orderId = useId();
  const metricId = useId();
  const orderedQuestions = useMemo(() => {
    const next = [...questions];
    if (order === 'attempt') {
      next.sort(
        (left, right) =>
          left.attemptOrder - right.attemptOrder || left.questionNumber - right.questionNumber
      );
    } else {
      next.sort((left, right) => left.questionNumber - right.questionNumber);
    }
    return next;
  }, [order, questions]);
  const values = orderedQuestions.map((question) =>
    metric === 'marks'
      ? question.scoringCovered && question.scoreThirds != null
        ? question.scoreThirds / 3
        : null
      : question.timeSpentSec
  );
  const maxMagnitude = Math.max(1 / 3, ...values.map((value) => Math.abs(value ?? 0)));
  const maxTime = Math.max(1, ...values.map((value) => value ?? 0));

  return (
    <Card>
      <CardHeader
        title="Individual question statistics"
        aside={
          <span className="u-num hidden text-[11px] text-text-faint sm:inline">
            {questions.length} questions
          </span>
        }
      />
      <CardBody className="p-0">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xl text-[12px] leading-relaxed text-text-muted">
            Compare exact stored marks or time spent. A dashed marker means the receipt does not
            contain enough frozen scoring evidence.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <label htmlFor={orderId} className="block">
              <span className="u-label mb-1 block">Order</span>
              <Select
                id={orderId}
                value={order}
                onChange={(event) => setOrder(event.target.value as ChartOrder)}
                className="min-w-0 sm:w-40"
                aria-label="Chart order"
              >
                <option value="question">Question order</option>
                <option value="attempt">Attempt order</option>
              </Select>
            </label>
            <label htmlFor={metricId} className="block">
              <span className="u-label mb-1 block">Metric</span>
              <Select
                id={metricId}
                value={metric}
                onChange={(event) => setMetric(event.target.value as ChartMetric)}
                className="min-w-0 sm:w-40"
                aria-label="Chart metric"
              >
                <option value="marks">Marks obtained</option>
                <option value="time">Time spent</option>
              </Select>
            </label>
          </div>
        </div>

        {orderedQuestions.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileQuestion size={24} className="mx-auto text-text-faint" aria-hidden="true" />
            <p className="mt-2 text-[13px] font-medium text-text">No question rows were captured</p>
            <p className="mt-1 text-[12px] text-text-faint">
              This session can still keep its timing receipt, but there is nothing to chart.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto px-4 pb-4 pt-5">
            <ol
              aria-label={`${metric === 'marks' ? 'Marks' : 'Time'} by question in ${order} order`}
              className="grid h-[236px] items-stretch gap-1"
              style={{
                minWidth: `${Math.max(500, orderedQuestions.length * 48)}px`,
                gridTemplateColumns: `repeat(${orderedQuestions.length}, minmax(38px, 1fr))`
              }}
            >
              {orderedQuestions.map((question, displayIndex) => {
                const value = values[displayIndex];
                const outcome = OUTCOME_META[question.outcome];
                const valueLabel =
                  metric === 'marks'
                    ? value == null
                      ? 'not scored'
                      : `${formatMarks(value, true)} marks`
                    : secondsToClock(value ?? 0);
                const primaryLabel =
                  order === 'attempt' && question.attempt
                    ? `A${String(displayIndex + 1).padStart(2, '0')}`
                    : `Q${String(question.questionNumber).padStart(2, '0')}`;
                const secondaryLabel =
                  order === 'attempt'
                    ? `Q${String(question.questionNumber).padStart(2, '0')}`
                    : null;

                return (
                  <li
                    key={question.questionUid}
                    className="flex min-w-0 flex-col text-center"
                    aria-label={`Question ${question.questionNumber}: ${outcome.label}, ${valueLabel}`}
                    title={`Q${question.questionNumber} · ${outcome.label} · ${valueLabel}`}
                  >
                    <div className="u-num h-5 truncate text-[9px] text-text-faint">
                      {metric === 'marks'
                        ? value == null
                          ? '—'
                          : formatMarks(value, true)
                        : secondsToClock(value ?? 0)}
                    </div>
                    <div className="relative mt-1 h-40 border-b border-border">
                      {metric === 'marks' ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 top-1/2 border-t border-dashed border-border"
                          />
                          {value == null ? (
                            <span
                              aria-hidden="true"
                              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-text-faint bg-bg-raised"
                            />
                          ) : value === 0 ? (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 rounded-full',
                                outcome.barClass
                              )}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute inset-x-1 rounded-sm opacity-90',
                                value > 0 ? 'bottom-1/2' : 'top-1/2',
                                outcome.barClass
                              )}
                              style={{
                                height: `${Math.max(5, (Math.abs(value) / maxMagnitude) * 46)}%`
                              }}
                            />
                          )}
                        </>
                      ) : (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute inset-x-1 bottom-0 rounded-t-sm opacity-90',
                            outcome.barClass
                          )}
                          style={{
                            height: `${value === 0 ? 2 : Math.max(5, ((value ?? 0) / maxTime) * 94)}%`
                          }}
                        />
                      )}
                    </div>
                    <span className="u-num mt-2 truncate text-[10px] font-semibold text-text-muted">
                      {primaryLabel}
                    </span>
                    {secondaryLabel ? (
                      <span className="u-num truncate text-[8px] text-text-faint">
                        {secondaryLabel}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function questionTitle(question: PyqQuestionSummary): string {
  const snapshot = question.attempt?.question_snapshot;
  if (snapshot) return `${snapshot.paper_label} · Q ${snapshot.number}`;
  if (question.attempt) return `GATE ${question.attempt.year} · archived question`;
  return `Question ${question.questionNumber}`;
}

function ResponseCard({
  question,
  defaultOpen
}: {
  question: PyqQuestionSummary;
  defaultOpen: boolean;
}) {
  const { attempt } = question;
  const snapshot =
    attempt && attempt.capture_version >= 2 ? (attempt.question_snapshot ?? null) : null;
  const outcome = OUTCOME_META[question.outcome];
  const OutcomeIcon = outcome.icon;
  const scoreLabel =
    question.scoringCovered && question.scoreThirds != null
      ? `${formatMarks(question.scoreThirds / 3, true)} marks`
      : 'Score excluded';
  const type = snapshot?.type ?? attempt?.question_type ?? 'Type unavailable';
  const marks = snapshot?.marks ?? attempt?.question_marks ?? null;
  const topic = snapshot?.topic ?? 'Topic unavailable';
  const captureIsFrozen = !!snapshot && !!attempt && attempt.capture_version >= 2;

  return (
    <details
      className="group overflow-hidden rounded border border-border bg-bg-raised shadow-sm open:shadow-card"
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-[74px] cursor-pointer list-none items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-bg-overlay/45 focus-visible:bg-accent-faint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-4 [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            'u-num flex h-10 w-10 shrink-0 items-center justify-center rounded border text-[11px] font-semibold',
            question.outcome === 'correct'
              ? 'border-success/30 bg-success-faint text-success'
              : question.outcome === 'wrong'
                ? 'border-danger/30 bg-danger-faint text-danger'
                : question.outcome === 'bonus'
                  ? 'border-accent/30 bg-accent-faint text-accent'
                  : 'border-border bg-bg-overlay text-text-muted'
          )}
        >
          Q{String(question.questionNumber).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-display text-[14px] font-semibold text-text sm:text-[15px]">
              {questionTitle(question)}
            </span>
            <Badge tone={outcome.tone}>
              <OutcomeIcon size={11} aria-hidden="true" /> {outcome.shortLabel}
            </Badge>
            {question.markedForReview ? (
              <Badge tone="guess">
                <Bookmark size={10} aria-hidden="true" /> Review
              </Badge>
            ) : null}
            {question.confidence ? (
              <Badge tone={question.confidence === 'high' ? 'success' : 'guess'}>
                {question.confidence[0].toUpperCase() + question.confidence.slice(1)} confidence
              </Badge>
            ) : null}
            {!question.visited ? <Badge>Not visited</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-text-faint">
            <span>{topic}</span>
            <span className="u-num">{scoreLabel}</span>
            <span className="u-num">{secondsToClock(question.timeSpentSec)}</span>
          </div>
        </div>
        <ChevronDown
          size={17}
          className="shrink-0 text-text-faint transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-border">
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-bg-overlay/25 px-4 py-3">
          {snapshot ? <Badge tone="accent">{snapshot.subject}</Badge> : null}
          <Badge>{type}</Badge>
          {marks != null && (
            <Badge>
              {marks} mark{marks === 1 ? '' : 's'}
            </Badge>
          )}
          <Badge>{topic}</Badge>
          <Badge tone={question.visited ? 'neutral' : 'warn'}>
            {question.visited ? 'Visited' : 'Not visited'}
          </Badge>
          {question.markedForReview ? <Badge tone="guess">Marked for review</Badge> : null}
        </div>

        <div className="p-4 sm:p-5">
          {snapshot?.html ? (
            <div className="overflow-x-auto rounded border border-border bg-bg p-4 sm:p-5">
              <PyqQuestionContent html={snapshot.html} />
            </div>
          ) : (
            <div className="rounded border border-dashed border-warn/40 bg-warn-faint px-4 py-4">
              <div className="flex items-start gap-2.5">
                <FileQuestion size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
                <div>
                  <p className="text-[13px] font-semibold text-text">Frozen question unavailable</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                    {attempt
                      ? 'This legacy receipt predates immutable question snapshots, so the report does not reconstruct question text from the current bank.'
                      : 'No submitted receipt exists for this question, so its exact wording and answer key cannot be shown here.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-border bg-bg-overlay/30 p-3">
              <dt className="u-label">Your answer</dt>
              <dd className="mt-1 break-words font-mono text-[13px] font-semibold text-text">
                {learnerAnswer(attempt)}
              </dd>
            </div>
            <div className="rounded border border-border bg-bg-overlay/30 p-3">
              <dt className="u-label">Correct answer</dt>
              <dd className="mt-1 break-words font-mono text-[13px] font-semibold text-text">
                {correctAnswer(attempt)}
              </dd>
            </div>
          </dl>

          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-4">
            {[
              ['Outcome', outcome.label],
              ['Score', scoreLabel],
              ['Time', secondsToClock(question.timeSpentSec)],
              [
                'Confidence',
                question.confidence
                  ? question.confidence[0].toUpperCase() + question.confidence.slice(1)
                  : 'Not recorded'
              ]
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 bg-bg-raised p-3">
                <dt className="u-label">{label}</dt>
                <dd className="mt-1 text-[12px] font-semibold leading-snug text-text">{value}</dd>
              </div>
            ))}
          </dl>

          {!question.scoringCovered ? (
            <p className="mt-3 rounded border border-warn/30 bg-warn-faint px-3 py-2 text-[11px] leading-relaxed text-text-muted">
              This question is excluded from score totals because its stored scoring version, type,
              marks, answer status, or result is missing or inconsistent. No score was inferred.
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-[11px] text-text-faint sm:flex-row sm:items-center sm:justify-between">
            <p>
              {attempt ? (
                <>
                  Receipt attempt <span className="u-num">#{attempt.attempt_number}</span> ·{' '}
                  {captureIsFrozen
                    ? 'frozen question + answer'
                    : `legacy capture v${attempt.capture_version}`}
                </>
              ) : (
                'No attempt receipt'
              )}
            </p>
            {snapshot?.source_url ? (
              <a
                href={snapshot.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1 font-medium text-accent hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Open official source <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : (
              <span>Source link not captured</span>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

export interface PyqSessionSummaryProps {
  session: PyqSessionRow;
  attempts: PyqAttemptRow[];
}

export default function PyqSessionSummary({ session, attempts }: PyqSessionSummaryProps) {
  const summary = useMemo(() => buildPyqSessionSummary(session, attempts), [attempts, session]);
  const responseHeadingId = useId();
  const firstSnapshot = summary.questions
    .map((question) => question.attempt)
    .find(
      (attempt) => attempt && attempt.capture_version >= 2 && attempt.question_snapshot
    )?.question_snapshot;
  const subject = firstSnapshot?.subject ?? humanizeSlug(session.config.subjectSlug);
  const fullPaper = session.config.mode === 'exam' && session.config.examKind === 'full-paper';
  const reportTitle = fullPaper
    ? (firstSnapshot?.paper_label ?? humanizeSlug(session.config.benchmarkPaperId ?? 'Full paper'))
    : subject;
  const isMultiTopic = session.config.topicSlug && session.config.topicSlug.includes(',');
  const topic = fullPaper
    ? 'Official full paper'
    : session.config.topicSlug && session.config.topicSlug !== 'all'
      ? isMultiTopic
        ? 'Multiple topics'
        : (firstSnapshot?.topic ?? humanizeSlug(session.config.topicSlug))
      : 'Mixed topics';
  const frozenSnapshotCount = summary.questions.filter(
    (question) =>
      question.attempt &&
      question.attempt.capture_version >= 2 &&
      question.attempt.question_snapshot
  ).length;
  const knownMarkCount = summary.oneMarkQuestions + summary.twoMarkQuestions;
  const exactScoreCoverage =
    summary.totalQuestions > 0 && summary.scoringCoverageCount === summary.totalQuestions;
  const exactSnapshotCoverage =
    summary.totalQuestions > 0 && frozenSnapshotCount === summary.totalQuestions;
  const durationLabel =
    summary.durationSec == null ? 'Untimed' : secondsToClock(summary.durationSec);
  const modeLabel = fullPaper
    ? 'Full-paper exam'
    : session.config.mode === 'exam'
      ? 'Timed-set exam'
      : 'Practice mode';
  const yearRange =
    session.config.fromYear === session.config.toYear
      ? String(session.config.fromYear)
      : `${session.config.fromYear}–${session.config.toYear}`;
  const submittedByTimer =
    session.config.mode === 'exam' &&
    session.config.examState?.submission_reason === 'time-expired';
  const responseSegments = [
    { label: 'Correct', count: summary.correct, className: 'bg-success' },
    { label: 'Incorrect', count: summary.wrong, className: 'bg-danger' },
    { label: 'Bonus', count: summary.bonus, className: 'bg-accent' },
    { label: 'Unscored', count: summary.unscorable, className: 'bg-guess' },
    { label: 'Skipped', count: summary.skipped, className: 'bg-text-faint' }
  ].filter((segment) => segment.count > 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="h-1 bg-accent" />
        <CardBody className="p-0">
          <header className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="u-margin-line min-w-0">
                <p className="u-label text-accent">PYQ session report</p>
                <h2 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-tight text-text sm:text-[30px]">
                  {reportTitle}
                </h2>
                <p className="mt-1 text-[12.5px] text-text-muted">
                  {topic} · {yearRange} · {sessionDate(session.started_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{modeLabel}</Badge>
                <Badge>{session.status}</Badge>
                {submittedByTimer ? <Badge tone="warn">Time expired</Badge> : null}
              </div>
            </div>
          </header>

          <section
            aria-label="Score and accuracy"
            className="grid gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="u-num text-[46px] font-bold leading-none tracking-[-0.055em] text-text sm:text-[58px]">
                  {formatMarks(summary.resultantMarks)}
                </span>
                <span className="mb-1.5 text-[13px] text-text-muted">
                  / {formatMarks(summary.coveredMaxMarks)} verified marks
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-text-faint">
                {exactScoreCoverage ? 'Official GATE-rule score' : 'Verified partial score'} from{' '}
                <span className="u-num text-text-muted">{summary.scoringCoverageCount}</span> of{' '}
                <span className="u-num text-text-muted">{summary.totalQuestions}</span> questions.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:max-w-2xl sm:grid-cols-4">
                <HeadlineStat
                  icon={CheckCircle2}
                  label="correct"
                  value={summary.correct}
                  tone="success"
                />
                <HeadlineStat icon={XCircle} label="wrong" value={summary.wrong} tone="danger" />
                <HeadlineStat
                  icon={CircleDashed}
                  label="skipped"
                  value={summary.skipped}
                  tone="warn"
                />
                <HeadlineStat
                  icon={Clock3}
                  label="time taken"
                  value={secondsToClock(summary.elapsedSec)}
                  tone="accent"
                />
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <AccuracyDial percent={summary.gradedAccuracyPercent} />
            </div>
          </section>

          <div className="border-t border-border bg-bg-overlay/30 px-4 py-3 sm:px-6">
            <div
              className="flex h-2 overflow-hidden rounded-full bg-bg-overlay"
              role="img"
              aria-label={`${summary.correct} correct, ${summary.wrong} incorrect, ${summary.skipped} skipped, ${summary.bonus} bonus, ${summary.unscorable} unscored`}
            >
              {responseSegments.map((segment) => (
                <span
                  key={segment.label}
                  className={segment.className}
                  style={{
                    width: `${(segment.count / Math.max(1, summary.totalQuestions)) * 100}%`
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {responseSegments.map((segment) => (
                <span
                  key={segment.label}
                  className="inline-flex items-center gap-1.5 text-[10.5px] text-text-faint"
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', segment.className)}
                    aria-hidden="true"
                  />
                  {segment.label} <span className="u-num text-text-muted">{segment.count}</span>
                </span>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <ExamEvidenceReceipt session={session} />

      <section aria-label="Session ledgers" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <LedgerCard
          title="Response ledger"
          icon={ListChecks}
          items={[
            { label: 'Questions attempted', value: summary.answered },
            { label: 'Correct attempts', value: summary.correct, valueClass: 'text-success' },
            { label: 'Incorrect attempts', value: summary.wrong, valueClass: 'text-danger' },
            { label: 'Left blank / no receipt', value: summary.skipped }
          ]}
        />
        <LedgerCard
          title="Marks ledger"
          icon={Sigma}
          items={[
            {
              label: 'Correct marks',
              value: formatMarks(summary.correctMarks, true),
              detail: summary.bonus > 0 ? 'Includes marks awarded to all' : undefined,
              valueClass: 'text-success'
            },
            {
              label: 'Penalty marks',
              value: summary.penaltyMarks > 0 ? `−${formatMarks(summary.penaltyMarks)}` : '0',
              valueClass: summary.penaltyMarks > 0 ? 'text-danger' : 'text-text'
            },
            {
              label: 'Resultant marks',
              value: formatMarks(summary.resultantMarks, true),
              detail: exactScoreCoverage ? 'Complete verified total' : 'Verified questions only',
              valueClass: summary.resultantMarks < 0 ? 'text-danger' : 'text-accent'
            }
          ]}
        />
        <LedgerCard
          title="Paper ledger"
          icon={FileQuestion}
          items={[
            { label: 'Total questions', value: summary.totalQuestions },
            {
              label: 'Total marks',
              value: knownMarkCount > 0 ? formatMarks(summary.knownMaxMarks) : '—',
              detail:
                knownMarkCount < summary.totalQuestions
                  ? `${knownMarkCount} of ${summary.totalQuestions} question values known`
                  : undefined
            },
            { label: 'Exam duration', value: durationLabel },
            { label: 'Time taken', value: secondsToClock(summary.elapsedSec) }
          ]}
        />
        {session.config.mode === 'exam' ? (
          <LedgerCard
            title="Confidence ledger"
            icon={CircleHelp}
            items={[
              {
                label: 'High confidence',
                value: summary.confidence.high,
                valueClass: 'text-success'
              },
              {
                label: 'Medium confidence',
                value: summary.confidence.medium,
                valueClass: 'text-guess'
              },
              { label: 'Low confidence', value: summary.confidence.low, valueClass: 'text-guess' },
              { label: 'Not recorded', value: summary.confidence.unset }
            ]}
          />
        ) : null}
      </section>

      {!exactScoreCoverage ||
      !exactSnapshotCoverage ||
      summary.rawReceiptCount > summary.totalQuestions ? (
        <aside
          className="rounded border border-warn/30 bg-warn-faint px-4 py-3"
          aria-label="Evidence coverage note"
        >
          <p className="text-[12px] font-semibold text-text">Evidence coverage</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
            Exact scoring is available for {summary.scoringCoverageCount} of{' '}
            {summary.totalQuestions} questions; frozen question text is available for{' '}
            {frozenSnapshotCount} of {summary.totalQuestions}. The report uses the latest receipt
            for each question
            {summary.rawReceiptCount > summary.totalQuestions
              ? ` (${summary.rawReceiptCount} receipts preserved in total)`
              : ''}
            . Missing facts are labeled and excluded, never reconstructed from the current bank.
          </p>
        </aside>
      ) : null}

      <QuestionChart questions={summary.questions} />

      <section aria-labelledby={responseHeadingId} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="u-label text-accent">Exam response</p>
            <h2
              id={responseHeadingId}
              className="mt-1 font-display text-[22px] font-bold tracking-tight text-text"
            >
              Question-by-question review
            </h2>
          </div>
          <p className="text-[11px] text-text-faint">
            Expand any row to inspect its frozen receipt and official source.
          </p>
        </div>

        {summary.questions.length > 0 ? (
          summary.questions.map((question, index) => (
            <ResponseCard
              key={question.questionUid}
              question={question}
              defaultOpen={index === 0}
            />
          ))
        ) : (
          <Card>
            <CardBody className="py-10 text-center">
              <FileQuestion size={24} className="mx-auto text-text-faint" aria-hidden="true" />
              <p className="mt-2 text-[13px] font-medium text-text">No question receipts</p>
              <p className="mt-1 text-[12px] text-text-faint">
                This session does not contain questions that can be reviewed.
              </p>
            </CardBody>
          </Card>
        )}
      </section>
    </div>
  );
}
