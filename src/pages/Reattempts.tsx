// Question-first spaced re-attempt queue. Each due item launches a dedicated
// test session instead of expanding inside the queue.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileQuestion,
  PencilLine,
  Play,
  RotateCcw,
  ScanSearch,
  XCircle,
  ZoomIn
} from 'lucide-react';
import type {
  MarkDecision,
  PyqAttemptRow,
  PyqSelectedAnswer,
  QuestionRow,
  ReattemptRow,
  ReattemptStage
} from '@/types';
import { db } from '@/lib/db';
import {
  buildReattemptQueue,
  evaluateLoggedReattemptAnswer,
  recordReattemptResult,
  type ReattemptAnswerEvidence
} from '@/lib/reattempt';
import { writeLocal } from '@/lib/sync';
import { OUTCOME_BY_CODE, type QuestionFormat } from '@/lib/constants';
import { cn, formatDate, plural, secondsToClock, todayISO } from '@/lib/utils';
import { loadPyqQuestionByUid, type PyqQuestion } from '@/lib/pyq';
import {
  createPyqReattemptAttemptRow,
  pyqQuestionFromAttempt,
  pyqReattemptAttemptId,
  pyqSourceAttemptForJournalQuestion
} from '@/lib/pyq-session';
import { captureElementToDataUrl } from '@/lib/image';
import { subjectInk } from '@/lib/subjectInk';
import { useAuth } from '@/hooks/useAuth';
import { useTimer } from '@/hooks/useTimer';
import { useUiStore } from '@/stores/ui';
import PageHeader from '@/components/layout/PageHeader';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import { draftFromRow } from '@/components/shared/questionDraft';
import AnswerReveal from '@/components/shared/AnswerReveal';
import { ImagePreview } from '@/components/shared/ImagePreview';
import Timer from '@/components/shared/Timer';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Textarea } from '@/components/ui/Textarea';
import '@/reattempt.css';

const TONE_BADGE: Record<
  'ok' | 'slow' | 'guess' | 'wrong',
  'success' | 'warn' | 'guess' | 'danger'
> = {
  ok: 'success',
  slow: 'warn',
  guess: 'guess',
  wrong: 'danger'
};

const RUNGS: ReattemptStage[] = ['D3', 'D10', 'D30'];
const PYQ_CHOICES = ['A', 'B', 'C', 'D'];

function plainTextQuestionHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

interface AttemptState {
  rowId: string;
  startedAt: number | null;
  elapsed: number | null;
  selectedAnswer?: PyqSelectedAnswer;
  decision?: MarkDecision;
}

interface ReattemptNavigationState {
  queueIds: string[];
  roundById: Record<string, number>;
  completedIds: string[];
  attemptsById: Record<string, AttemptState>;
  lastIndex: number;
}

function navigationState(value: unknown): ReattemptNavigationState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ReattemptNavigationState>;
  if (
    !Array.isArray(candidate.queueIds) ||
    !candidate.queueIds.every((id) => typeof id === 'string')
  ) {
    return null;
  }
  return {
    queueIds: candidate.queueIds,
    roundById: candidate.roundById ?? {},
    completedIds: candidate.completedIds ?? [],
    attemptsById: candidate.attemptsById ?? {},
    lastIndex: typeof candidate.lastIndex === 'number' ? candidate.lastIndex : -1
  };
}

function Ladder({ stage }: { stage: ReattemptStage }) {
  const idx = RUNGS.indexOf(stage);
  return (
    <span className="flex items-center gap-1" title="Ladder: D3 → D10 → D30 → mastered">
      {RUNGS.map((rung, index) => (
        <span
          key={rung}
          className={cn(
            'u-num rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            rung === stage
              ? 'bg-accent text-accent-contrast'
              : index < idx || stage === 'MASTERED'
                ? 'bg-success-faint text-success'
                : 'bg-bg-overlay text-text-faint'
          )}
        >
          {rung}
        </span>
      ))}
    </span>
  );
}

function RunningTimer({
  startedAt,
  targetSec,
  onFinish
}: {
  startedAt: number;
  targetSec: number;
  onFinish: (seconds: number) => void;
}) {
  const seconds = useTimer(startedAt);
  return (
    <div className="reattempt-running flex flex-col items-center gap-6 rounded-[18px] border border-ink-teal/20 bg-ink-teal/5 px-4 py-7">
      <div className="text-center">
        <p className="u-label text-ink-teal">Attempt running</p>
        <p className="mt-1 text-[12px] text-text-muted">Solve without opening notes.</p>
      </div>
      <Timer seconds={seconds} targetSec={targetSec} />
      <Button variant="primary" onClick={() => onFinish(seconds)}>
        Finish attempt
      </Button>
    </div>
  );
}

function QueueCard({
  row,
  question,
  today,
  attempt,
  onOpen
}: {
  row: ReattemptRow;
  question?: QuestionRow;
  today: string;
  attempt: AttemptState | null;
  onOpen: () => void;
}) {
  const ink = question ? subjectInk(question.subject) : null;
  const carriedForward = row.scheduled_date < today;
  const currentAttempt = attempt?.rowId === row.id ? attempt : null;
  const action = currentAttempt?.startedAt
    ? 'Resume running attempt'
    : currentAttempt?.elapsed != null
      ? 'Record result'
      : 'Start re-attempt';

  return (
    <article className="reattempt-card overflow-hidden rounded-[20px] border border-border bg-bg-raised shadow-card transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="reattempt-card-trigger flex w-full flex-col gap-3 p-4 text-left sm:p-5"
        aria-label={`${action}: ${question?.pattern_name ?? question?.source_ref ?? 'untitled mistake'}`}
      >
        <span className="flex w-full flex-wrap items-center gap-2">
          {question && ink ? (
            <span className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', ink.dot)} />
              <span className={cn('text-[12px] font-medium', ink.text)}>{question.subject}</span>
            </span>
          ) : null}
          {question ? (
            <Badge tone={TONE_BADGE[OUTCOME_BY_CODE[question.outcome].tone]}>
              {question.outcome}
            </Badge>
          ) : null}
          {carriedForward ? <Badge tone="warn">carried forward</Badge> : null}
          {currentAttempt ? <Badge tone="accent">session open</Badge> : null}
          <span className="ml-auto">
            <Ladder stage={row.stage} />
          </span>
        </span>

        <span className="flex w-full items-end justify-between gap-4">
          <span className="min-w-0">
            <span className="u-label">Pattern to revisit</span>
            <span className="reattempt-pattern mt-1 block font-display text-[18px] font-semibold leading-snug text-text">
              {question?.pattern_name ? (
                <span className="u-highlight">{question.pattern_name}</span>
              ) : (
                'Untitled mistake'
              )}
            </span>
            <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent">
              {action} <ArrowRight size={13} />
            </span>
          </span>
          <span className="reattempt-due-date shrink-0 text-right text-[11.5px] text-text-faint">
            {carriedForward ? 'carried from' : 'due'} {formatDate(row.scheduled_date, 'dd MMM')}
          </span>
        </span>
      </button>
    </article>
  );
}

function pyqAnswerInputType(question: PyqQuestion): 'MCQ' | 'MSQ' | 'NAT' {
  if (question.type === 'MSQ' || question.type === 'NAT') return question.type;
  return 'MCQ';
}

function formatAttemptAnswer(value: PyqSelectedAnswer): string {
  if (value == null) return 'Unavailable';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function savedAttemptAnswer(attempt: PyqAttemptRow): string {
  if (attempt.capture_version !== 2) return 'Legacy attempt — learner answer not verified';
  if (attempt.mark_decision === 'SKIP') return 'Left blank';
  return formatAttemptAnswer(attempt.selected_answer);
}

function formatDecisionAnswer(value: PyqSelectedAnswer, decision?: MarkDecision): string {
  return decision === 'SKIP' ? 'Left blank' : formatAttemptAnswer(value);
}

function ExamAnswerPad({
  inputType,
  choices,
  numeric,
  disabled,
  onChoices,
  onNumeric
}: {
  inputType: QuestionFormat;
  choices: string[];
  numeric: string;
  disabled: boolean;
  onChoices: (choices: string[]) => void;
  onNumeric: (value: string) => void;
}) {
  if (inputType === 'NAT') {
    return (
      <label className="block text-[12px] font-medium text-text-muted">
        Your numeric answer
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={numeric}
          disabled={disabled}
          onChange={(event) => onNumeric(event.target.value)}
          placeholder="Enter a number"
          className="u-control mt-1 h-12 w-full rounded border border-border bg-bg-raised px-3 font-mono text-[16px] text-text shadow-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-faint"
        />
      </label>
    );
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="u-label mb-2">
        Your answer {inputType === 'MSQ' ? '— select all that apply' : ''}
      </legend>
      <div className="grid grid-cols-4 gap-2">
        {PYQ_CHOICES.map((choice) => {
          const active = choices.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (inputType === 'MCQ') onChoices([choice]);
                else
                  onChoices(
                    active ? choices.filter((item) => item !== choice) : [...choices, choice]
                  );
              }}
              className={cn(
                'h-12 rounded border font-mono text-[15px] font-semibold transition-all',
                active
                  ? 'border-accent bg-accent text-accent-contrast shadow-key'
                  : 'border-border bg-bg-raised text-text-muted hover:-translate-y-px hover:border-accent/40 hover:text-text'
              )}
            >
              {choice}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ExamDecisionButtons({
  value,
  disabled,
  onChange
}: {
  value: MarkDecision | null;
  disabled: boolean;
  onChange: (value: MarkDecision) => void;
}) {
  const options: { value: MarkDecision; label: string; hint: string }[] = [
    { value: 'MARK', label: 'Answered', hint: 'committed' },
    { value: 'FIFTY_FIFTY', label: 'Guessed 50/50', hint: 'uncertain' },
    { value: 'SKIP', label: 'Left blank', hint: 'skipped' }
  ];
  return (
    <fieldset disabled={disabled}>
      <legend className="u-label mb-2">Exam decision</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={`${option.label}: ${option.hint}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded border px-3 py-2.5 text-left transition-colors',
              value === option.value
                ? 'border-ink-violet/40 bg-ink-violet/10 text-ink-violet'
                : 'border-border bg-bg-raised text-text-muted hover:border-border-hover'
            )}
          >
            <span className="block text-[12.5px] font-semibold">{option.label}</span>
            <span className="u-label mt-0.5 block">{option.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PyqAnswerHistory({
  question,
  attempts,
  currentAttempt
}: {
  question: PyqQuestion;
  attempts: PyqAttemptRow[];
  currentAttempt: PyqAttemptRow;
}) {
  const ordered = [
    ...attempts.filter((attempt) => attempt.id !== currentAttempt.id),
    currentAttempt
  ].sort((a, b) => a.attempted_at.localeCompare(b.attempted_at));
  const skipped = currentAttempt.mark_decision === 'SKIP';
  const available = question.answerStatus === 'available';
  const tone =
    skipped || currentAttempt.mark_correct == null
      ? 'warn'
      : currentAttempt.mark_correct
        ? 'success'
        : 'danger';
  const title = skipped
    ? 'Left blank'
    : !available
      ? 'No definitive key'
      : currentAttempt.mark_correct
        ? 'Correct'
        : 'Not correct';
  const Icon =
    skipped || currentAttempt.mark_correct == null
      ? FileQuestion
      : currentAttempt.mark_correct
        ? CheckCircle2
        : XCircle;

  return (
    <section
      aria-label="PYQ answer history"
      className={cn(
        'rounded border p-4',
        tone === 'success'
          ? 'border-success/30 bg-success-faint'
          : tone === 'danger'
            ? 'border-danger/30 bg-danger-faint'
            : 'border-warn/30 bg-warn-faint'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={20}
          className={cn(
            'mt-0.5 shrink-0',
            tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-warn'
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[17px] font-semibold text-text">{title}</p>
            <span className="u-num text-[11px] text-text-faint">
              {secondsToClock(currentAttempt.time_spent_sec)}
            </span>
          </div>
          <dl className="mt-3 grid gap-3 text-[12px] sm:grid-cols-3">
            {ordered
              .map((attempt, index) => ({ attempt, number: index + 1 }))
              .reverse()
              .map(({ attempt, number }) => (
                <div key={attempt.id}>
                  <dt className="u-label">Attempt {number} answer</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-text">
                    {savedAttemptAnswer(attempt)}
                  </dd>
                </div>
              ))}
            <div>
              <dt className="u-label">Actual answer</dt>
              <dd className="mt-0.5 font-mono font-semibold text-text">
                {formatAttemptAnswer(currentAttempt.correct_answer)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

function LoggedQuestionAnswerHistory({
  row,
  question,
  selectedAnswer,
  decision,
  elapsed
}: {
  row: ReattemptRow;
  question: QuestionRow;
  selectedAnswer: PyqSelectedAnswer;
  decision: MarkDecision;
  elapsed: number;
}) {
  const recordedAttempts = row.history
    .map((entry, index) => ({ entry, number: index + 2 }))
    .filter(({ entry }) => entry.selectedAnswer !== undefined)
    .reverse();
  const firstAttemptAnswer =
    question.mark_decision === 'SKIP' ? 'Left blank' : 'Not captured in the original log';

  return (
    <section
      aria-label="Re-attempt answer history"
      className="rounded border border-accent/25 bg-accent-faint p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[17px] font-semibold text-text">Answer committed</p>
        <span className="u-num text-[11px] text-text-faint">{secondsToClock(elapsed)}</span>
      </div>
      <dl className="mt-3 grid gap-3 text-[12px] sm:grid-cols-3">
        <div>
          <dt className="u-label">Attempt {row.history.length + 2} answer</dt>
          <dd className="mt-0.5 font-mono font-semibold text-text">
            {formatDecisionAnswer(selectedAnswer, decision)}
          </dd>
        </div>
        {recordedAttempts.map(({ entry, number }) => (
          <div key={`${number}-${entry.date}`}>
            <dt className="u-label">Attempt {number} answer</dt>
            <dd className="mt-0.5 font-mono font-semibold text-text">
              {formatDecisionAnswer(entry.selectedAnswer ?? null, entry.markDecision)}
            </dd>
          </div>
        ))}
        <div>
          <dt className="u-label">Attempt 1 answer</dt>
          <dd className="mt-0.5 font-mono font-semibold text-text">{firstAttemptAnswer}</dd>
        </div>
        <div>
          <dt className="u-label">Actual answer</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-semibold text-text">
            {question.answer_text?.trim() || 'Not saved in the original log'}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function PyqReattemptSession({
  userId,
  row,
  question,
  sourceAttempt,
  attempts,
  existingAttempt,
  position,
  total,
  readOnly,
  onExit,
  onPrevious,
  onNext,
  onSkip,
  onResult
}: {
  userId: string;
  row: ReattemptRow;
  question: PyqQuestion;
  sourceAttempt: PyqAttemptRow;
  attempts: PyqAttemptRow[];
  existingAttempt: PyqAttemptRow | null;
  position: number;
  total: number;
  readOnly: boolean;
  onExit: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSkip: () => void;
  onResult: (
    result: 'clean' | 'fail',
    elapsed: number,
    answer: ReattemptAnswerEvidence
  ) => Promise<void>;
}) {
  const existingAnswer = existingAttempt?.mark_decision === 'SKIP' ? null : existingAttempt;
  const initialAnswer = existingAnswer?.selected_answer;
  const [choices, setChoices] = useState<string[]>(() =>
    Array.isArray(initialAnswer)
      ? initialAnswer.map(String)
      : typeof initialAnswer === 'string' && pyqAnswerInputType(question) !== 'NAT'
        ? [initialAnswer]
        : []
  );
  const [numeric, setNumeric] = useState(() =>
    existingAnswer && pyqAnswerInputType(question) === 'NAT'
      ? String(existingAnswer.selected_answer ?? '')
      : ''
  );
  const [decision, setDecision] = useState<MarkDecision | null>(
    existingAnswer?.mark_decision ?? null
  );
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    existingAnswer ? null : Date.now()
  );
  const [localAttempt, setLocalAttempt] = useState<PyqAttemptRow | null>(existingAnswer);
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const autoReportedAttempt = useRef<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const submitted = localAttempt ?? existingAnswer;
  const liveSeconds = useTimer(submitted ? null : startedAt);
  const shownSeconds = submitted?.time_spent_sec ?? liveSeconds;
  const inputType = pyqAnswerInputType(question);
  const hasAnswer =
    inputType === 'NAT'
      ? numeric.trim() !== '' && Number.isFinite(Number(numeric))
      : choices.length > 0;
  const canSubmit = !!decision && (decision === 'SKIP' || hasAnswer) && !submitting;

  useEffect(() => {
    if (!existingAttempt) return;
    if (existingAttempt.mark_decision === 'SKIP') return;
    const selected = existingAttempt.selected_answer;
    setChoices(
      Array.isArray(selected)
        ? selected.map(String)
        : typeof selected === 'string' && inputType !== 'NAT'
          ? [selected]
          : []
    );
    setNumeric(inputType === 'NAT' ? String(selected ?? '') : '');
    setDecision(existingAttempt.mark_decision);
    setLocalAttempt(existingAttempt);
    setStartedAt(null);
  }, [existingAttempt, inputType]);

  function selectedAnswer(): PyqSelectedAnswer {
    if (decision === 'SKIP') return null;
    if (inputType === 'NAT') return numeric.trim() === '' ? null : numeric.trim();
    if (inputType === 'MSQ') return choices.slice().sort();
    return choices[0] ?? null;
  }

  async function submitAnswer() {
    if (!decision || !canSubmit || submitted || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const roundAttemptId = pyqReattemptAttemptId(row.id, row.history.length);
      const alreadySaved = await db.pyq_attempts.get(roundAttemptId);
      if (alreadySaved && alreadySaved.mark_decision !== 'SKIP') {
        setLocalAttempt(alreadySaved);
        return;
      }
      if (alreadySaved && decision === 'SKIP') {
        setLocalAttempt(alreadySaved);
        return;
      }
      const committedAtMs = Date.now();
      const questionStartedAtMs = Math.min(startedAt ?? committedAtMs, committedAtMs);
      let screenshotUrl = sourceAttempt.screenshot_url;
      try {
        screenshotUrl = captureRef.current
          ? await captureElementToDataUrl(captureRef.current, { theme: 'light' })
          : screenshotUrl;
      } catch {
        // The immutable HTML snapshot still keeps the exact question auditable.
      }
      const attempt = createPyqReattemptAttemptRow({
        userId,
        reattemptId: row.id,
        completedRoundCount: row.history.length,
        sourceAttempt,
        question,
        selectedAnswer: selectedAnswer(),
        decision,
        questionStartedAtMs,
        committedAtMs,
        screenshotUrl,
        attemptNumber: alreadySaved?.attempt_number ?? attempts.length + 1
      });
      await writeLocal('pyq_attempts', attempt);
      setLocalAttempt(attempt);
      setStartedAt(null);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? `Answer was not committed: ${error.message}`
          : 'Answer was not committed. Your selection is still here; try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!submitted || autoReportedAttempt.current === submitted.id) return;
    autoReportedAttempt.current = submitted.id;
    if (submitted.mark_decision === 'SKIP') {
      onSkip();
      return;
    }
    if (readOnly) return;
    setReporting(true);
    setSubmitError(null);
    void onResult(submitted.mark_correct === true ? 'clean' : 'fail', submitted.time_spent_sec, {
      selectedAnswer: submitted.selected_answer,
      correctAnswer: submitted.correct_answer,
      markDecision: submitted.mark_decision
    })
      .catch((error) => {
        setSubmitError(
          error instanceof Error
            ? `The answer was checked, but the phase could not be updated: ${error.message}`
            : 'The answer was checked, but the phase could not be updated.'
        );
      })
      .finally(() => setReporting(false));
  }, [onResult, onSkip, readOnly, submitted]);

  function retryAutomaticUpdate() {
    if (!submitted) return;
    autoReportedAttempt.current = null;
    setLocalAttempt({ ...submitted });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text"
        >
          <ArrowLeft size={14} /> Exit test
        </button>
        <div className="flex items-center gap-3">
          <span className="u-num text-[12px] text-text-muted">
            Q {position}/{total}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-faint">
            <Clock3 size={13} />
            {secondsToClock(shownSeconds)}
          </span>
        </div>
      </div>

      {onPrevious || (readOnly && onNext) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {onPrevious ? (
              <Button onClick={onPrevious}>
                <ArrowLeft size={15} /> Previous question
              </Button>
            ) : null}
          </div>
          {readOnly && onNext ? (
            <Button onClick={onNext}>
              Next question <ArrowRight size={15} />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div ref={captureRef}>
        <Card className="overflow-hidden">
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span>{question.paperLabel}</span>
                <span className="text-border-hover">/</span>
                <span>Q {question.number}</span>
              </span>
            }
            aside={
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{question.subject}</Badge>
                <Badge>{question.type}</Badge>
                {question.marks ? <Badge>{question.marks} mark</Badge> : null}
              </div>
            }
          />
          <CardBody className="p-5 sm:p-7">
            <PyqQuestionContent html={question.html} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(310px,0.7fr)]">
          <ExamAnswerPad
            inputType={inputType}
            choices={choices}
            numeric={numeric}
            disabled={!!submitted}
            onChoices={setChoices}
            onNumeric={setNumeric}
          />
          <div className="flex flex-col gap-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <ExamDecisionButtons value={decision} disabled={!!submitted} onChange={setDecision} />
            {!submitted ? (
              <div>
                <Button
                  variant="primary"
                  onClick={() => void submitAnswer()}
                  disabled={!canSubmit}
                  className="w-full"
                >
                  Commit & reveal key
                </Button>
                {submitError ? (
                  <p role="alert" className="mt-2 text-[12px] leading-relaxed text-danger">
                    {submitError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <PyqAnswerHistory
                  question={question}
                  attempts={attempts}
                  currentAttempt={submitted}
                />
                <p className="text-[12px] leading-relaxed text-text-muted">
                  {readOnly
                    ? 'Answer locked — submitted answers can be reviewed but not changed.'
                    : submitted.mark_correct === true
                      ? 'Correct — moving this question to the next phase.'
                      : 'Not correct — moving this question back one phase.'}
                </p>
                {reporting ? (
                  <p role="status" className="u-label text-accent">
                    Updating review phase…
                  </p>
                ) : null}
                {submitError ? (
                  <div>
                    <p role="alert" className="text-[12px] leading-relaxed text-danger">
                      {submitError}
                    </p>
                    <Button className="mt-2" onClick={retryAutomaticUpdate}>
                      Retry phase update
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ReattemptSession({
  row,
  question,
  today,
  position,
  total,
  attempt,
  readOnly,
  onExit,
  onPrevious,
  onNext,
  onSkip,
  onStart,
  onFinish,
  onRestart,
  onResult,
  onSavePrompt,
  onSaveAnswer
}: {
  row: ReattemptRow;
  question?: QuestionRow;
  today: string;
  position: number;
  total: number;
  attempt: AttemptState | null;
  readOnly: boolean;
  onExit: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSkip: () => void;
  onStart: () => void;
  onFinish: (seconds: number, selectedAnswer?: PyqSelectedAnswer, decision?: MarkDecision) => void;
  onRestart: () => void;
  onResult: (
    result: 'clean' | 'fail',
    elapsed: number,
    answer?: ReattemptAnswerEvidence
  ) => Promise<void>;
  onSavePrompt: (question: QuestionRow, prompt: string) => Promise<void>;
  onSaveAnswer: (question: QuestionRow, answer: string) => Promise<void>;
}) {
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState(question?.question_text ?? '');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answerDraft, setAnswerDraft] = useState(question?.answer_text ?? '');
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [autoRetryVersion, setAutoRetryVersion] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);
  const autoReportedAttempt = useRef(false);
  const currentAttempt = attempt?.rowId === row.id ? attempt : null;
  const inputType = question ? draftFromRow(question).format : null;
  const [choices, setChoices] = useState<string[]>([]);
  const [numeric, setNumeric] = useState('');
  const [decision, setDecision] = useState<MarkDecision | null>(null);
  const liveSeconds = useTimer(currentAttempt?.startedAt ?? null);
  const targetSec = question?.target_time_sec ?? 120;
  const hasText = !!question?.question_text?.trim();
  const hasImage = !!question?.image_url;
  const carriedForward = row.scheduled_date < today;
  const priorTimes = row.history
    .flatMap((entry) => (typeof entry.timeSpent === 'number' ? [entry.timeSpent] : []))
    .slice(-3);

  useEffect(() => {
    setPromptDraft(question?.question_text ?? '');
  }, [question?.question_text]);

  useEffect(() => {
    setAnswerDraft(question?.answer_text ?? '');
  }, [question?.answer_text]);

  useEffect(() => {
    const savedAnswer = currentAttempt?.selectedAnswer;
    setChoices(
      Array.isArray(savedAnswer)
        ? savedAnswer.map(String)
        : typeof savedAnswer === 'string' && inputType !== 'NAT'
          ? [savedAnswer]
          : []
    );
    setNumeric(inputType === 'NAT' && savedAnswer != null ? String(savedAnswer) : '');
    setDecision(currentAttempt?.decision ?? null);
  }, [
    currentAttempt?.decision,
    currentAttempt?.elapsed,
    currentAttempt?.selectedAnswer,
    inputType,
    row.id
  ]);

  const hasAnswer =
    inputType === 'NAT'
      ? numeric.trim() !== '' && Number.isFinite(Number(numeric))
      : choices.length > 0;
  const canCommit = !!inputType && !!decision && (decision === 'SKIP' || hasAnswer);
  const hasCommittedAnswer =
    !!inputType &&
    currentAttempt?.elapsed != null &&
    currentAttempt.selectedAnswer !== undefined &&
    !!currentAttempt.decision;
  const automaticVerdict = hasCommittedAnswer
    ? evaluateLoggedReattemptAnswer(
        inputType!,
        currentAttempt.selectedAnswer!,
        question?.answer_text ?? null,
        currentAttempt.decision!
      )
    : null;

  function selectedAnswer(): PyqSelectedAnswer {
    if (decision === 'SKIP') return null;
    if (inputType === 'NAT') return numeric.trim() === '' ? null : numeric.trim();
    if (inputType === 'MSQ') return choices.slice().sort();
    return choices[0] ?? null;
  }

  function commitAnswer() {
    if (!decision || !canCommit) return;
    onFinish(liveSeconds, selectedAnswer(), decision);
  }

  function restart() {
    setChoices([]);
    setNumeric('');
    setDecision(null);
    onRestart();
  }

  async function savePrompt() {
    if (!question || !promptDraft.trim() || savingPrompt) return;
    setSavingPrompt(true);
    try {
      await onSavePrompt(question, promptDraft.trim());
      setEditingPrompt(false);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function saveAnswer() {
    if (!question || !answerDraft.trim() || savingAnswer) return;
    setSavingAnswer(true);
    try {
      await onSaveAnswer(question, answerDraft.trim());
      setEditingAnswer(false);
    } finally {
      setSavingAnswer(false);
    }
  }

  async function report(result: 'clean' | 'fail') {
    if (currentAttempt?.elapsed == null || reporting) return;
    setReporting(true);
    try {
      const answer =
        currentAttempt.selectedAnswer !== undefined && currentAttempt.decision
          ? {
              selectedAnswer: currentAttempt.selectedAnswer,
              correctAnswer: question?.answer_text?.trim() || null,
              markDecision: currentAttempt.decision
            }
          : undefined;
      await onResult(result, currentAttempt.elapsed, answer);
    } finally {
      setReporting(false);
    }
  }

  useEffect(() => {
    if (
      !hasCommittedAnswer ||
      autoReportedAttempt.current ||
      currentAttempt?.elapsed == null ||
      currentAttempt.selectedAnswer === undefined ||
      !currentAttempt.decision
    ) {
      return;
    }
    if (readOnly) return;
    if (currentAttempt.decision === 'SKIP') {
      autoReportedAttempt.current = true;
      onSkip();
      return;
    }
    if (automaticVerdict == null) return;
    autoReportedAttempt.current = true;
    setReporting(true);
    setResultError(null);
    void onResult(automaticVerdict ? 'clean' : 'fail', currentAttempt.elapsed, {
      selectedAnswer: currentAttempt.selectedAnswer,
      correctAnswer: question?.answer_text?.trim() || null,
      markDecision: currentAttempt.decision
    })
      .catch((error) => {
        setResultError(
          error instanceof Error
            ? `The answer was checked, but the phase could not be updated: ${error.message}`
            : 'The answer was checked, but the phase could not be updated.'
        );
      })
      .finally(() => setReporting(false));
  }, [
    automaticVerdict,
    autoRetryVersion,
    currentAttempt?.decision,
    currentAttempt?.elapsed,
    currentAttempt?.selectedAnswer,
    hasCommittedAnswer,
    onSkip,
    onResult,
    question?.answer_text,
    readOnly
  ]);

  function retryAutomaticUpdate() {
    autoReportedAttempt.current = false;
    setResultError(null);
    setAutoRetryVersion((value) => value + 1);
  }

  return (
    <div className="reattempt-session mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text"
        >
          <ArrowLeft size={14} /> Exit session
        </button>
        <div className="flex items-center gap-3">
          <span className="u-num text-[12px] text-text-muted">
            Re-attempt {position}/{total}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-faint">
            <Clock3 size={13} /> target {secondsToClock(targetSec)}
          </span>
        </div>
      </div>

      {onPrevious || (readOnly && onNext) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {onPrevious ? (
              <Button onClick={onPrevious}>
                <ArrowLeft size={15} /> Previous question
              </Button>
            ) : null}
          </div>
          {readOnly && onNext ? (
            <Button onClick={onNext}>
              Next question <ArrowRight size={15} />
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card className="reattempt-question-sheet overflow-hidden">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <BookOpen size={15} className="text-accent" />
              <span>{question?.source_ref ?? 'Question to re-solve'}</span>
            </span>
          }
          aside={
            <div className="flex flex-wrap gap-1.5">
              {question ? <Badge tone="accent">{question.subject}</Badge> : null}
              {question ? (
                <Badge tone={TONE_BADGE[OUTCOME_BY_CODE[question.outcome].tone]}>
                  {question.outcome}
                </Badge>
              ) : null}
              {carriedForward ? <Badge tone="warn">carried forward</Badge> : null}
            </div>
          }
        />
        <CardBody className="flex flex-col gap-5 p-5 sm:p-7">
          {question?.pattern_name || question?.trigger_sentence ? (
            <div className="grid gap-3 rounded-xl border border-accent/15 bg-accent-faint/50 p-3 sm:grid-cols-2">
              {question?.pattern_name ? (
                <div>
                  <p className="u-label">Pattern to revisit</p>
                  <p className="u-highlight mt-1 text-[13px] font-medium text-text">
                    {question.pattern_name}
                  </p>
                </div>
              ) : null}
              {question?.trigger_sentence ? (
                <div>
                  <p className="u-label">Opening trigger</p>
                  <p className="mt-1 text-[13px] text-text">{question.trigger_sentence}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {hasText ? (
            <PyqQuestionContent html={plainTextQuestionHtml(question?.question_text ?? '')} />
          ) : null}

          {hasImage ? (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="reattempt-session-photo group relative overflow-hidden rounded-xl border border-border bg-white text-left shadow-card focus:outline-none focus:ring-4 focus:ring-accent-faint"
              aria-label="Open question image full screen"
            >
              <img
                src={question?.image_url ?? ''}
                alt="Question to re-attempt"
                className="mx-auto max-h-[62dvh] w-full object-contain transition-transform duration-200 group-hover:scale-[1.01]"
              />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-text/85 px-3 py-2 text-[11px] font-semibold text-bg-raised shadow-lift backdrop-blur">
                <ZoomIn size={14} /> Open & zoom
              </span>
            </button>
          ) : null}

          {!hasText && !hasImage ? (
            <div className="rounded-xl border border-dashed border-warn/35 bg-warn/5 p-4">
              <div className="flex gap-3">
                <ScanSearch size={19} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-[13px] font-medium text-text">
                    The original prompt was not saved.
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                    {question?.source_ref
                      ? 'Use the source reference above to locate it, or add the prompt here so future attempts are self-contained.'
                      : 'Add the question text now so this re-attempt is self-contained.'}
                  </p>
                  {!editingPrompt && question ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => setEditingPrompt(true)}
                    >
                      <PencilLine size={14} strokeWidth={1.8} className="mr-1.5" />
                      Add question text
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {editingPrompt && question ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-overlay/30 p-3">
              <Textarea
                rows={6}
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                placeholder="Paste the complete question prompt…"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingPrompt(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void savePrompt()}
                  disabled={!promptDraft.trim() || savingPrompt}
                >
                  {savingPrompt ? 'Saving…' : 'Save question'}
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {currentAttempt?.startedAt ? (
        inputType ? (
          <Card>
            <CardBody className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(310px,0.7fr)]">
              <ExamAnswerPad
                inputType={inputType}
                choices={choices}
                numeric={numeric}
                disabled={false}
                onChoices={setChoices}
                onNumeric={setNumeric}
              />
              <div className="flex flex-col gap-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <ExamDecisionButtons value={decision} disabled={false} onChange={setDecision} />
                <div>
                  <Button
                    variant="primary"
                    onClick={commitAnswer}
                    disabled={!canCommit}
                    className="w-full"
                  >
                    Commit & reveal answer
                  </Button>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-text-faint">
                    Elapsed {secondsToClock(liveSeconds)} · target {secondsToClock(targetSec)}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        ) : (
          <RunningTimer
            startedAt={currentAttempt.startedAt}
            targetSec={targetSec}
            onFinish={(seconds) => onFinish(seconds)}
          />
        )
      ) : currentAttempt?.elapsed != null ? (
        <section className="reattempt-result rounded-[18px] border border-border bg-bg-raised p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="u-label">Attempt complete</p>
              <p className="mt-1 font-display text-[22px] font-semibold text-text">
                {secondsToClock(currentAttempt.elapsed)}
              </p>
              <p
                className={cn(
                  'mt-1 text-[11.5px]',
                  currentAttempt.elapsed <= targetSec ? 'text-success' : 'text-warn'
                )}
              >
                {currentAttempt.elapsed <= targetSec
                  ? `${secondsToClock(targetSec - currentAttempt.elapsed)} inside target`
                  : `${secondsToClock(currentAttempt.elapsed - targetSec)} over target`}
              </p>
            </div>
            {currentAttempt.decision === 'SKIP' || currentAttempt.decision === undefined ? (
              <Button variant="ghost" size="sm" onClick={restart}>
                <RotateCcw size={14} strokeWidth={1.8} className="mr-1.5" />
                {currentAttempt.decision === 'SKIP' ? 'Answer now' : 'Try again'}
              </Button>
            ) : null}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            {question &&
            inputType &&
            currentAttempt.selectedAnswer !== undefined &&
            currentAttempt.decision ? (
              <>
                <LoggedQuestionAnswerHistory
                  row={row}
                  question={question}
                  selectedAnswer={currentAttempt.selectedAnswer}
                  decision={currentAttempt.decision}
                  elapsed={currentAttempt.elapsed}
                />
                {automaticVerdict == null && !editingAnswer ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => setEditingAnswer(true)}
                  >
                    <PencilLine size={14} strokeWidth={1.8} className="mr-1.5" />
                    {question.answer_text?.trim() ? 'Update actual answer' : 'Add actual answer'}
                  </Button>
                ) : null}
              </>
            ) : (
              <AnswerReveal
                answer={question?.answer_text}
                onAdd={question ? () => setEditingAnswer(true) : undefined}
              />
            )}
            {editingAnswer && question ? (
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-bg-overlay/30 p-3">
                <Textarea
                  rows={4}
                  value={answerDraft}
                  onChange={(event) => setAnswerDraft(event.target.value)}
                  placeholder="Add the final answer and the key method…"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingAnswer(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void saveAnswer()}
                    disabled={!answerDraft.trim() || savingAnswer}
                  >
                    {savingAnswer ? 'Saving…' : 'Save answer'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            {readOnly ? (
              <p className="text-[13px] font-medium text-text-muted">
                Answer locked — submitted answers can be reviewed but not changed.
              </p>
            ) : hasCommittedAnswer ? (
              automaticVerdict == null ? (
                <div>
                  <p className="text-[13px] font-medium text-warn">Add a checkable actual answer</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                    Save the correct option for MCQ/MSQ (for example B or A, C) or the exact number
                    for NAT. The app will then grade this answer and update its phase automatically.
                  </p>
                </div>
              ) : (
                <div>
                  <p
                    className={cn(
                      'text-[13px] font-medium',
                      automaticVerdict ? 'text-success' : 'text-danger'
                    )}
                  >
                    {automaticVerdict
                      ? 'Correct — moving to the next phase.'
                      : 'Not correct — moving back one phase.'}
                  </p>
                  {reporting ? (
                    <p role="status" className="u-label mt-2 text-accent">
                      Updating review phase…
                    </p>
                  ) : null}
                  {resultError ? (
                    <div className="mt-2">
                      <p role="alert" className="text-[12px] leading-relaxed text-danger">
                        {resultError}
                      </p>
                      <Button className="mt-2" onClick={retryAutomaticUpdate}>
                        Retry phase update
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              <>
                <p className="text-[13px] font-medium text-text">How did it go?</p>
                <p className="mt-1 text-[12px] text-text-muted">
                  This timer-only question has no answer format to check automatically.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="danger" onClick={() => void report('fail')} disabled={reporting}>
                    Failed — move back
                  </Button>
                  <Button onClick={() => void report('clean')} disabled={reporting}>
                    Clean — move forward
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="reattempt-start flex flex-col items-center gap-4 rounded-[18px] border border-ink-teal/20 bg-ink-teal/5 px-4 py-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-teal/10 text-ink-teal">
            <Clock3 size={21} strokeWidth={1.7} />
          </span>
          <div>
            <p className="font-display text-[17px] font-semibold text-text">Ready to re-solve?</p>
            <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-text-muted">
              Start when the question and your rough-work page are ready.
            </p>
          </div>
          <Button variant="primary" onClick={onStart}>
            <Play size={15} strokeWidth={2} className="mr-1.5" />
            {inputType ? 'Start test' : 'Start timer'}
          </Button>
        </div>
      )}

      <p className="px-1 text-[11.5px] leading-relaxed text-text-faint">
        Tagged {question ? formatDate(question.created_at.slice(0, 10), 'dd MMM') : '—'}
        {row.history.length > 0
          ? ` · ${row.history.length} prior ${plural(row.history.length, 'attempt')}`
          : ''}
        {priorTimes.length > 0
          ? ` · recent times ${priorTimes.map(secondsToClock).join(', ')}`
          : ''}
      </p>

      <ImagePreview
        src={question?.image_url ?? null}
        caption={question?.source_ref ?? question?.pattern_name ?? 'Question to re-attempt'}
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </div>
  );
}

export default function Reattempts() {
  const { userId } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const navigate = useNavigate();
  const location = useLocation();
  const { reattemptId } = useParams<{ reattemptId: string }>();
  const [searchParams] = useSearchParams();
  const routeNavigation = navigationState(location.state);
  const [attemptsByRowId, setAttemptsByRowId] = useState<Record<string, AttemptState>>(
    () => routeNavigation?.attemptsById ?? {}
  );
  const today = todayISO();

  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const pyqAttempts = useLiveQuery(
    () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId]
  );

  const questionIds = useMemo(
    () => [...new Set((reattempts ?? []).map((row) => row.question_id))],
    [reattempts]
  );
  const questionIdsKey = questionIds.join('|');
  const questions = useLiveQuery(
    () => (userId && questionIds.length > 0 ? db.questions.bulkGet(questionIds) : []),
    [userId, questionIdsKey],
    []
  );
  const qById = useMemo(() => {
    const byId = new Map<string, QuestionRow>();
    for (const question of questions) {
      if (question) byId.set(question.id, question);
    }
    return byId;
  }, [questions]);
  const pyqSourceByQuestionId = useMemo(() => {
    const byQuestionId = new Map<string, PyqAttemptRow>();
    for (const questionId of questionIds) {
      const source = pyqSourceAttemptForJournalQuestion(
        qById.get(questionId) ?? questionId,
        pyqAttempts ?? []
      );
      if (source) byQuestionId.set(questionId, source);
    }
    return byQuestionId;
  }, [pyqAttempts, qById, questionIds]);

  const { due, upcoming, mastered } = useMemo(
    () => buildReattemptQueue(reattempts ?? [], today),
    [reattempts, today]
  );
  const upcomingGroups = useMemo(() => {
    const groups = new Map<string, { count: number; subjects: Set<string> }>();
    for (const row of upcoming) {
      const group = groups.get(row.scheduled_date) ?? { count: 0, subjects: new Set<string>() };
      group.count += 1;
      const subject = qById.get(row.question_id)?.subject;
      if (subject) group.subjects.add(subject);
      groups.set(row.scheduled_date, group);
    }
    return [...groups.entries()].map(([date, group]) => ({
      date,
      count: group.count,
      subjects: [...group.subjects]
    }));
  }, [upcoming, qById]);
  const defaultQueueIds = due.map((row) => row.id);
  const queueIds = routeNavigation?.queueIds.length ? routeNavigation.queueIds : defaultQueueIds;
  const roundById =
    routeNavigation?.roundById ??
    Object.fromEntries(due.map((row) => [row.id, row.history.length]));
  const completedIds = routeNavigation?.completedIds ?? [];
  const activeRow = reattemptId
    ? (due.find((row) => row.id === reattemptId) ??
      (queueIds.includes(reattemptId)
        ? reattempts?.find((row) => row.id === reattemptId)
        : undefined))
    : undefined;
  const activePosition = activeRow ? queueIds.indexOf(activeRow.id) : -1;
  const activePyqSource = activeRow
    ? (pyqSourceByQuestionId.get(activeRow.question_id) ?? null)
    : null;
  const snapshotPyqQuestion = useMemo(
    () => (activePyqSource ? pyqQuestionFromAttempt(activePyqSource) : null),
    [activePyqSource]
  );
  const [legacyPyqRestore, setLegacyPyqRestore] = useState<{
    sourceAttemptId: string;
    loading: boolean;
    question: PyqQuestion | null;
  } | null>(null);
  const matchingLegacyRestore =
    activePyqSource && legacyPyqRestore?.sourceAttemptId === activePyqSource.id
      ? legacyPyqRestore
      : null;
  const legacyPyqLoading =
    !!activePyqSource &&
    !snapshotPyqQuestion &&
    (!matchingLegacyRestore || matchingLegacyRestore.loading);
  const activePyqQuestion = snapshotPyqQuestion ?? matchingLegacyRestore?.question ?? null;
  const activePyqAttempts = activePyqSource
    ? (pyqAttempts ?? [])
        .filter((candidate) => candidate.question_uid === activePyqSource.question_uid)
        .sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))
    : [];
  const existingRoundAttempt = activeRow
    ? ((pyqAttempts ?? []).find(
        (candidate) =>
          candidate.id ===
          pyqReattemptAttemptId(activeRow.id, roundById[activeRow.id] ?? activeRow.history.length)
      ) ?? null)
    : null;

  useEffect(() => {
    if (!activePyqSource || snapshotPyqQuestion) return;
    let cancelled = false;
    setLegacyPyqRestore({
      sourceAttemptId: activePyqSource.id,
      loading: true,
      question: null
    });
    void loadPyqQuestionByUid(activePyqSource.question_uid, activePyqSource.subject)
      .then((question) => {
        if (!cancelled) {
          setLegacyPyqRestore({
            sourceAttemptId: activePyqSource.id,
            loading: false,
            question
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLegacyPyqRestore({
            sourceAttemptId: activePyqSource.id,
            loading: false,
            question: null
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePyqSource, snapshotPyqQuestion]);

  useEffect(() => {
    if (reattemptId || searchParams.get('open') !== 'first' || due.length === 0) return;
    navigate(`/reattempts/${encodeURIComponent(due[0].id)}`, { replace: true });
  }, [due, navigate, reattemptId, searchParams]);

  useEffect(() => {
    if (!activeRow) return;
    if (activePyqSource) {
      return;
    }
    setAttemptsByRowId((current) => {
      if (current[activeRow.id]) return current;
      return {
        ...current,
        [activeRow.id]: { rowId: activeRow.id, startedAt: Date.now(), elapsed: null }
      };
    });
  }, [activePyqSource, activeRow]);

  function openSession(rowId: string) {
    const runningAttempt = Object.values(attemptsByRowId).find((attempt) => attempt.startedAt);
    if (runningAttempt && runningAttempt.rowId !== rowId) {
      pushToast('Finish the running attempt before opening another question.', 'neutral');
      return;
    }
    const nextQueueIds = due.map((row) => row.id);
    const nextNavigation: ReattemptNavigationState = {
      queueIds: nextQueueIds,
      roundById: Object.fromEntries(due.map((row) => [row.id, row.history.length])),
      completedIds: [],
      attemptsById: {},
      lastIndex: nextQueueIds.indexOf(rowId)
    };
    setAttemptsByRowId({});
    navigate(`/reattempts/${encodeURIComponent(rowId)}`, { state: nextNavigation });
  }

  function currentNavigation(
    overrides: Partial<ReattemptNavigationState> = {}
  ): ReattemptNavigationState {
    return {
      queueIds,
      roundById,
      completedIds,
      attemptsById: attemptsByRowId,
      lastIndex: activePosition,
      ...overrides
    };
  }

  function moveWithinSession(targetIndex: number) {
    const targetId = queueIds[targetIndex];
    if (!targetId) return;
    const nextAttempts = { ...attemptsByRowId };
    const targetAttempt = nextAttempts[targetId];
    if (targetAttempt?.decision === 'SKIP') {
      nextAttempts[targetId] = {
        rowId: targetId,
        startedAt: Date.now(),
        elapsed: null
      };
      setAttemptsByRowId(nextAttempts);
    }
    navigate(`/reattempts/${encodeURIComponent(targetId)}`, {
      state: currentNavigation({ attemptsById: nextAttempts, lastIndex: targetIndex })
    });
  }

  function advanceAfterSkip(row: ReattemptRow) {
    const currentIndex = queueIds.indexOf(row.id);
    const nextIndex = queueIds.findIndex(
      (id, index) => index > currentIndex && !completedIds.includes(id)
    );
    const nextNavigation = currentNavigation({ lastIndex: currentIndex });
    navigate(
      nextIndex >= 0 ? `/reattempts/${encodeURIComponent(queueIds[nextIndex])}` : '/reattempts',
      { replace: true, state: nextNavigation }
    );
    pushToast(
      'Skipped for now — use Previous question to answer it before leaving the test.',
      'neutral'
    );
  }

  async function onResult(
    row: ReattemptRow,
    result: 'clean' | 'fail',
    elapsed: number,
    answer?: ReattemptAnswerEvidence
  ) {
    const updated = await recordReattemptResult(row, result, today, elapsed, answer);
    const nextCompletedIds = Array.from(new Set([...completedIds, row.id]));
    const currentIndex = queueIds.indexOf(row.id);
    const nextIndex = queueIds.findIndex(
      (id, index) => index > currentIndex && !nextCompletedIds.includes(id)
    );
    const remaining = queueIds.filter((id) => !nextCompletedIds.includes(id)).length;
    navigate(
      nextIndex >= 0 ? `/reattempts/${encodeURIComponent(queueIds[nextIndex])}` : '/reattempts',
      {
        replace: true,
        state: currentNavigation({ completedIds: nextCompletedIds, lastIndex: currentIndex })
      }
    );
    if (updated.stage === 'MASTERED') {
      pushToast(
        remaining > 0 ? `Mastered — ${remaining} due remaining.` : 'Mastered — queue cleared.',
        'success'
      );
    } else if (result === 'clean') {
      pushToast(
        `Correct. Next phase ${updated.stage} on ${formatDate(updated.scheduled_date, 'dd MMM')}.${remaining > 0 ? ` ${remaining} due remaining.` : ''}`,
        'success'
      );
    } else {
      const phaseMessage =
        updated.stage === row.stage ? `Stays at ${updated.stage}` : `Back to ${updated.stage}`;
      pushToast(
        `Not correct. ${phaseMessage} on ${formatDate(updated.scheduled_date, 'dd MMM')}.${remaining > 0 ? ` ${remaining} due remaining.` : ''}`,
        'neutral'
      );
    }
  }

  async function savePrompt(question: QuestionRow, prompt: string) {
    await writeLocal('questions', { ...question, question_text: prompt });
    pushToast('Question text saved for future attempts.', 'success');
  }

  async function saveAnswer(question: QuestionRow, answer: string) {
    await writeLocal('questions', { ...question, answer_text: answer });
    pushToast('Answer saved and kept concealed.', 'success');
  }

  if (reattemptId && reattempts !== undefined && !activeRow) {
    return (
      <Empty
        title="Re-attempt unavailable"
        hint="This question is no longer due, or the session link is out of date."
        action={<Button onClick={() => navigate('/reattempts')}>Back to re-attempts</Button>}
      />
    );
  }

  if (activeRow && pyqAttempts === undefined) {
    return (
      <Card>
        <CardBody className="py-12 text-center text-[13px] text-text-faint">
          Opening due test…
        </CardBody>
      </Card>
    );
  }

  if (activeRow && activePyqSource && legacyPyqLoading) {
    return (
      <Card>
        <CardBody className="py-12 text-center text-[13px] text-text-faint">
          Restoring the original PYQ and answer choices…
        </CardBody>
      </Card>
    );
  }

  if (activeRow) {
    if (userId && activePyqSource && activePyqQuestion) {
      return (
        <PyqReattemptSession
          key={activeRow.id}
          userId={userId}
          row={activeRow}
          question={activePyqQuestion}
          sourceAttempt={activePyqSource}
          attempts={activePyqAttempts}
          existingAttempt={existingRoundAttempt}
          position={Math.max(1, activePosition + 1)}
          total={queueIds.length}
          readOnly={completedIds.includes(activeRow.id)}
          onExit={() => navigate('/reattempts')}
          onPrevious={activePosition > 0 ? () => moveWithinSession(activePosition - 1) : undefined}
          onNext={
            activePosition + 1 < queueIds.length
              ? () => moveWithinSession(activePosition + 1)
              : undefined
          }
          onSkip={() => advanceAfterSkip(activeRow)}
          onResult={(result, elapsed, answer) => onResult(activeRow, result, elapsed, answer)}
        />
      );
    }
    return (
      <ReattemptSession
        key={activeRow.id}
        row={activeRow}
        question={qById.get(activeRow.question_id)}
        today={today}
        position={Math.max(1, activePosition + 1)}
        total={queueIds.length}
        attempt={attemptsByRowId[activeRow.id] ?? null}
        readOnly={completedIds.includes(activeRow.id)}
        onExit={() => navigate('/reattempts')}
        onPrevious={activePosition > 0 ? () => moveWithinSession(activePosition - 1) : undefined}
        onNext={
          activePosition + 1 < queueIds.length
            ? () => moveWithinSession(activePosition + 1)
            : undefined
        }
        onSkip={() => advanceAfterSkip(activeRow)}
        onStart={() =>
          setAttemptsByRowId((current) => ({
            ...current,
            [activeRow.id]: { rowId: activeRow.id, startedAt: Date.now(), elapsed: null }
          }))
        }
        onFinish={(seconds, selectedAnswer, decision) =>
          setAttemptsByRowId((current) => ({
            ...current,
            [activeRow.id]: {
              rowId: activeRow.id,
              startedAt: null,
              elapsed: seconds,
              selectedAnswer,
              decision
            }
          }))
        }
        onRestart={() =>
          setAttemptsByRowId((current) => ({
            ...current,
            [activeRow.id]: { rowId: activeRow.id, startedAt: Date.now(), elapsed: null }
          }))
        }
        onResult={(result, elapsed, answer) => onResult(activeRow, result, elapsed, answer)}
        onSavePrompt={savePrompt}
        onSaveAnswer={saveAnswer}
      />
    );
  }

  return (
    <div className="reattempt-page native-reattempt-page flex flex-col gap-4">
      <PageHeader
        title="Re-attempts"
        description={
          reattempts === undefined
            ? 'Loading…'
            : `${due.length} due · ${upcoming.length} upcoming · ${mastered} mastered`
        }
      />

      {routeNavigation && routeNavigation.lastIndex >= 0 ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[13px] font-semibold text-text">Review this re-attempt test</p>
              <p className="mt-1 text-[12px] text-text-muted">
                Answered questions stay locked. Skipped questions can still be answered.
              </p>
            </div>
            <Button onClick={() => moveWithinSession(routeNavigation.lastIndex)}>
              <ArrowLeft size={15} /> Previous question
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {due.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Questions due now">
          <div className="flex flex-wrap items-end justify-between gap-4 px-1">
            <div>
              <p className="u-label text-accent">Due now</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                Start the due test with the original PYQ options, timer, and answer logging.
                Manually captured questions keep their saved prompt or photo.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="u-num text-[12px] text-text-faint">{due.length}</span>
              <Button variant="primary" onClick={() => openSession(due[0].id)}>
                <Play size={15} /> Start test
              </Button>
            </div>
          </div>
          {due.map((row) => (
            <QueueCard
              key={row.id}
              row={row}
              question={qById.get(row.question_id)}
              today={today}
              attempt={attemptsByRowId[row.id] ?? null}
              onOpen={() => openSession(row.id)}
            />
          ))}
        </section>
      ) : (
        <Empty
          title="Nothing due"
          hint="The queue fills as you tag RBS, RBG and W-* questions. First rung lands 3 days after the mistake."
        />
      )}

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader title="Upcoming" />
          <div>
            {upcomingGroups.map(({ date, count, subjects }) => (
              <div
                key={date}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="u-num w-[64px] shrink-0 text-[11px] text-text-muted">
                  {formatDate(date, 'dd MMM')}
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] text-text-muted">
                  {count} {plural(count, 'question')} · {subjects.join(', ')}
                </span>
                <span className="u-num rounded-full bg-bg-overlay px-2 py-0.5 text-[11px] text-text">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
