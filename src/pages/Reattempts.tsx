// Question-first spaced re-attempt queue. Each due item launches a dedicated
// test session instead of expanding inside the queue.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Lightbulb,
  PauseCircle,
  PencilLine,
  Play,
  RotateCcw,
  ScanSearch,
  XCircle,
  ZoomIn
} from 'lucide-react';
import type {
  LearningItemRow,
  MarkDecision,
  PyqExamConfidence,
  PyqAttemptRow,
  PyqSelectedAnswer,
  QuestionRow,
  RecoverySessionMode,
  RecoverySessionRow,
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
import {
  OUTCOME_BY_CODE,
  targetTimeSecForMarks,
  type QuestionFormat
} from '@/lib/constants';
import {
  cn,
  formatDate,
  plural,
  secondsToClock,
  todayISOInTimeZone
} from '@/lib/utils';
import {
  answerFreePyqImageUrl,
  firstPyqImage,
  loadPyqQuestionByUid,
  loadPyqManifest,
  loadPyqQuestions,
  type PyqQuestion
} from '@/lib/pyq';
import { pyqBenchmarkPaperExposure } from '@/lib/pyq-benchmark';
import {
  createPyqReattemptAttemptRow,
  nextReattemptRoundAttemptNumber,
  pyqAttemptScorePresentation,
  pyqQuestionFromAttempt,
  pyqReattemptAttemptId,
  pyqSourceAttemptForJournalQuestion
} from '@/lib/pyq-session';
import { captureElementToDataUrl } from '@/lib/image';
import { subjectInk } from '@/lib/subjectInk';
import { useAuth } from '@/hooks/useAuth';
import { useTimer } from '@/hooks/useTimer';
import { useUiStore } from '@/stores/ui';
import {
  buildRecoverySprint,
  forecastRecoveryLoad,
  type RecoveryCandidate,
  type RecoveryGradeDecision
} from '@/lib/recovery-engine';
import {
  checkpointRecoverySession,
  deferRecoveryItem,
  interruptRecoverySession,
  latestResumableRecoverySession,
  recordRecoveryRetrieval,
  revealRecoveryHint,
  startRecoverySession
} from '@/lib/recovery-session';
import {
  assignRecoveryTransfer,
  completeRecoveryRemediation,
  selectExactTopicTransferQuestion,
  transferAssignmentFromEvents
} from '@/lib/recovery-workflows';
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
const DEFAULT_PYQ_CHOICES = ['A', 'B', 'C', 'D'] as const;

function plainTextQuestionHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

function subjectSlugHint(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

interface RecoveryAnswerDraft {
  itemId: string;
  choices: string[];
  numeric: string;
  confidence: PyqExamConfidence | null;
}

interface RecoverySelfCheck {
  answer: PyqSelectedAnswer;
  confidence: PyqExamConfidence;
  elapsedSec: number;
  correctAnswer: PyqSelectedAnswer;
  sourcePyqAttemptId: string | null;
}

interface RecoveryFeedback {
  itemId: string;
  session: RecoverySessionRow;
  grade: RecoveryGradeDecision;
  explanation: string;
  answer: PyqSelectedAnswer;
  correctAnswer: PyqSelectedAnswer;
  elapsedSec: number;
  wasTransfer: boolean;
}

const RECOVERY_SPRINT_OPTIONS: Array<{
  mode: RecoverySessionMode;
  label: string;
  shortLabel: string;
}> = [
  { mode: 'minutes-10', label: '10-minute sprint', shortLabel: '10 min' },
  { mode: 'minutes-20', label: '20-minute sprint', shortLabel: '20 min' },
  { mode: 'minutes-30', label: '30-minute sprint', shortLabel: '30 min' },
  { mode: 'questions-5', label: '5-question sprint', shortLabel: '5 questions' },
  { mode: 'all', label: 'All due questions', shortLabel: 'All due' }
];

function recoveryDraft(value: unknown, itemId: string): RecoveryAnswerDraft {
  if (!value || typeof value !== 'object') {
    return { itemId, choices: [], numeric: '', confidence: null };
  }
  const candidate = value as Partial<RecoveryAnswerDraft>;
  if (candidate.itemId !== itemId) {
    return { itemId, choices: [], numeric: '', confidence: null };
  }
  const confidence =
    candidate.confidence === 'high' ||
    candidate.confidence === 'medium' ||
    candidate.confidence === 'low'
      ? candidate.confidence
      : null;
  return {
    itemId,
    choices: Array.isArray(candidate.choices)
      ? candidate.choices.filter((choice): choice is string => typeof choice === 'string')
      : [],
    numeric: typeof candidate.numeric === 'string' ? candidate.numeric : '',
    confidence
  };
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
  if (attempt.capture_version !== 2 && attempt.capture_version !== 3) {
    return 'Legacy attempt — learner answer not verified';
  }
  if (attempt.mark_decision === 'SKIP') return 'Left blank';
  return formatAttemptAnswer(attempt.selected_answer);
}

function formatDecisionAnswer(value: PyqSelectedAnswer, decision?: MarkDecision): string {
  return decision === 'SKIP' ? 'Left blank' : formatAttemptAnswer(value);
}

function ExamAnswerPad({
  inputType,
  availableChoices = DEFAULT_PYQ_CHOICES,
  choices,
  numeric,
  disabled,
  onChoices,
  onNumeric
}: {
  inputType: QuestionFormat;
  availableChoices?: readonly string[];
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
      <div
        className={cn(
          'grid gap-2',
          availableChoices.length > 4 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-4'
        )}
      >
        {availableChoices.map((choice) => {
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
  const score = pyqAttemptScorePresentation(currentAttempt);

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
          {score.covered && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{score.label}</Badge>
              <span className="text-[11px] text-text-faint">{score.detail}</span>
            </div>
          )}
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

function RecoveryConfidencePicker({
  value,
  disabled,
  onChange
}: {
  value: PyqExamConfidence | null;
  disabled: boolean;
  onChange: (value: PyqExamConfidence) => void;
}) {
  const options: Array<{ value: PyqExamConfidence; label: string; hint: string }> = [
    { value: 'high', label: 'High confidence', hint: 'I can justify the method' },
    { value: 'medium', label: 'Medium confidence', hint: 'Mostly certain' },
    { value: 'low', label: 'Low confidence', hint: 'Unsure or guessing' }
  ];
  return (
    <fieldset disabled={disabled}>
      <legend className="u-label mb-2">Recall confidence</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
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

function RecoveryRevealedContext({
  question,
  answer,
  correctAnswer
}: {
  question: QuestionRow | null;
  answer: PyqSelectedAnswer;
  correctAnswer: PyqSelectedAnswer;
}) {
  return (
    <section aria-label="Recovery evidence revealed" className="rounded border border-border p-4">
      <p className="u-label">Post-attempt review</p>
      <dl className="mt-3 grid gap-3 text-[12px] sm:grid-cols-2">
        <div>
          <dt className="u-label">Your answer</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-mono font-semibold text-text">
            {answer == null ? "I don't know" : formatAttemptAnswer(answer)}
          </dd>
        </div>
        <div>
          <dt className="u-label">Actual answer</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-semibold text-text">
            {correctAnswer == null || String(correctAnswer).trim() === ''
              ? 'No checkable answer was stored'
              : formatAttemptAnswer(correctAnswer)}
          </dd>
        </div>
        {question?.pattern_name ? (
          <div>
            <dt className="u-label">Pattern</dt>
            <dd className="u-highlight mt-0.5 font-semibold text-text">{question.pattern_name}</dd>
          </div>
        ) : null}
        {question?.trigger_sentence ? (
          <div>
            <dt className="u-label">Opening trigger</dt>
            <dd className="mt-0.5 text-text">{question.trigger_sentence}</dd>
          </div>
        ) : null}
        {question ? (
          <div>
            <dt className="u-label">Prior outcome</dt>
            <dd className="mt-0.5 font-semibold text-text">{question.outcome}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function RecoveryResultPanel({
  feedback,
  question,
  hasNext,
  onContinue,
  transferAction
}: {
  feedback: RecoveryFeedback;
  question: QuestionRow | null;
  hasNext: boolean;
  onContinue: () => void;
  transferAction?: ReactNode;
}) {
  const gradeLabel = `${feedback.grade.grade[0].toUpperCase()}${feedback.grade.grade.slice(1)}`;
  const tone =
    feedback.grade.grade === 'again'
      ? 'danger'
      : feedback.grade.grade === 'hard'
        ? 'warn'
        : 'success';
  return (
    <section
      aria-label="Recovery grade result"
      className={cn(
        'rounded-[18px] border p-4 shadow-card sm:p-5',
        feedback.grade.grade === 'again'
          ? 'border-danger/30 bg-danger-faint'
          : feedback.grade.grade === 'hard'
            ? 'border-warn/30 bg-warn-faint'
            : 'border-success/30 bg-success-faint'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="u-label">Retrieval grade</p>
          <p className="mt-1 font-display text-[24px] font-semibold text-text">{gradeLabel}</p>
        </div>
        <Badge tone={tone}>{secondsToClock(feedback.elapsedSec)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Grade reasons">
        {feedback.grade.reasons.map((reason) => (
          <Badge key={reason}>{reason}</Badge>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-text-muted">{feedback.explanation}</p>
      <div className="mt-4">
        <RecoveryRevealedContext
          question={question}
          answer={feedback.answer}
          correctAnswer={feedback.correctAnswer}
        />
      </div>
      <Button className="mt-4 w-full sm:w-auto" onClick={onContinue}>
        {hasNext ? (
          <>
            Next question <ArrowRight size={15} />
          </>
        ) : (
          'Finish sprint'
        )}
      </Button>
      {transferAction ? <div className="mt-3">{transferAction}</div> : null}
    </section>
  );
}

function RecoveryRemediationPanel({
  session,
  item,
  today,
  timeZone,
  onCompleted
}: {
  session: RecoverySessionRow;
  item: LearningItemRow;
  today: string;
  timeZone: string;
  onCompleted: (session: RecoverySessionRow | null) => void;
}) {
  const [openingMove, setOpeningMove] = useState('');
  const [focusedPlan, setFocusedPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await completeRecoveryRemediation({
        item,
        correctedOpeningMove: openingMove,
        focusedPlan,
        today,
        timeZone,
        session
      });
      onCompleted(result.session);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The remediation plan could not be saved.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-warn/30 bg-warn-faint/30">
      <CardHeader
        title="Focused remediation required"
        aside={<Badge tone="warn">{item.lapse_count} lapses</Badge>}
      />
      <CardBody className="grid gap-4 p-4 sm:p-5">
        <p className="text-[13px] leading-relaxed text-text-muted">
          Repeating the same prompt is no longer useful evidence. Correct the first move and choose
          one bounded repair action; the next blind retrieval will be scheduled three days later.
        </p>
        <label className="text-[12px] font-medium text-text-muted">
          Corrected opening move
          <Textarea
            className="mt-1"
            rows={3}
            value={openingMove}
            onChange={(event) => setOpeningMove(event.target.value)}
            placeholder="When I see …, I will first … because …"
          />
        </label>
        <label className="text-[12px] font-medium text-text-muted">
          One focused remediation action
          <Textarea
            className="mt-1"
            rows={3}
            value={focusedPlan}
            onChange={(event) => setFocusedPlan(event.target.value)}
            placeholder="Solve three counterexamples without notes, then explain the invariant."
          />
        </label>
        {error ? (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        ) : null}
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving remediation…' : 'Save repair & schedule blind check'}
        </Button>
      </CardBody>
    </Card>
  );
}

function CanonicalRecoverySession({
  session,
  item,
  row,
  question,
  pyqQuestion,
  sourceAttempt,
  attempts,
  today,
  timeZone,
  feedback,
  onFeedback,
  onContinue,
  onDeferred,
  onInterrupted,
  onRemediated,
  transferAction
}: {
  session: RecoverySessionRow;
  item: LearningItemRow;
  row: ReattemptRow | null;
  question: QuestionRow | null;
  pyqQuestion: PyqQuestion | null;
  sourceAttempt: PyqAttemptRow | null;
  attempts: PyqAttemptRow[];
  today: string;
  timeZone: string;
  feedback: RecoveryFeedback | null;
  onFeedback: (feedback: RecoveryFeedback) => void;
  onContinue: () => void;
  onDeferred: () => void;
  onInterrupted: () => void;
  onRemediated: (session: RecoverySessionRow | null) => void;
  transferAction?: ReactNode;
}) {
  const initialDraft = recoveryDraft(session.draft_answer, item.id);
  const [choices, setChoices] = useState<string[]>(initialDraft.choices);
  const [numeric, setNumeric] = useState(initialDraft.numeric);
  const [confidence, setConfidence] = useState<PyqExamConfidence | null>(
    initialDraft.confidence
  );
  const [selfCheck, setSelfCheck] = useState<RecoverySelfCheck | null>(null);
  const [cueRevealed, setCueRevealed] = useState(
    session.hinted_item_ids.includes(item.id)
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const sessionWriteRef = useRef<Promise<RecoverySessionRow>>(Promise.resolve(session));
  const inputType = pyqQuestion
    ? pyqAnswerInputType(pyqQuestion)
    : question
      ? draftFromRow(question).format
      : null;
  const availableChoices = pyqQuestion?.choices ?? DEFAULT_PYQ_CHOICES;
  const targetSec = pyqQuestion
    ? targetTimeSecForMarks(pyqQuestion.marks)
    : (question?.target_time_sec ?? 120);
  const startedAtMs = session.current_item_started_at
    ? Date.parse(session.current_item_started_at)
    : Number.NaN;
  const liveSeconds = useTimer(
    feedback || selfCheck || !Number.isFinite(startedAtMs) ? null : startedAtMs
  );
  const elapsedSec = Math.max(
    0,
    Math.ceil((session.elapsed_by_item_ms[item.id] ?? 0) / 1000) + liveSeconds
  );
  const openingCue = question?.trigger_sentence?.trim() || question?.pattern_name?.trim() || '';
  const questionImageUrl = answerFreePyqImageUrl(question?.image_url);
  const revealed = !!feedback || !!selfCheck;
  const selected: PyqSelectedAnswer =
    inputType === 'NAT'
      ? numeric.trim() || null
      : inputType === 'MSQ'
        ? choices.slice().sort()
        : (choices[0] ?? null);
  const hasAnswer =
    inputType === 'NAT'
      ? numeric.trim() !== '' && Number.isFinite(Number(numeric))
      : inputType === 'MCQ' || inputType === 'MSQ'
        ? choices.length > 0
        : false;
  const canCommit = !!confidence && !!inputType && hasAnswer && !working;
  const position = Math.min(session.item_ids.length, session.current_index + 1);

  if (item.recovery_state === 'remediation') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="border-b border-border pb-3">
          <p className="u-label text-warn">
            Recovery remediation · {position}/{session.item_ids.length}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-text">
            {item.subject}
            {item.topic ? ` · ${item.topic}` : ''}
          </p>
        </div>
        <RecoveryRemediationPanel
          session={session}
          item={item}
          today={today}
          timeZone={timeZone}
          onCompleted={onRemediated}
        />
      </div>
    );
  }

  function persistDraft(next: RecoveryAnswerDraft) {
    sessionWriteRef.current = sessionWriteRef.current
      .then((current) => checkpointRecoverySession(current, { draft_answer: next }))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'The answer draft could not be saved.');
        return session;
      });
  }

  function updateChoices(next: string[]) {
    setChoices(next);
    persistDraft({ itemId: item.id, choices: next, numeric, confidence });
  }

  function updateNumeric(next: string) {
    setNumeric(next);
    persistDraft({ itemId: item.id, choices, numeric: next, confidence });
  }

  function updateConfidence(next: PyqExamConfidence) {
    setConfidence(next);
    persistDraft({ itemId: item.id, choices, numeric, confidence: next });
  }

  async function revealCue() {
    if (!openingCue || cueRevealed || working) return;
    setWorking(true);
    setError(null);
    try {
      const current = await sessionWriteRef.current;
      const updated = await revealRecoveryHint({
        session: current,
        item,
        timeZone
      });
      sessionWriteRef.current = Promise.resolve(updated);
      setCueRevealed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The opening cue could not be recorded.');
    } finally {
      setWorking(false);
    }
  }

  async function createRecoveryPyqReceipt(
    answer: PyqSelectedAnswer,
    decision: MarkDecision,
    recordedConfidence: PyqExamConfidence | null,
    seconds: number
  ): Promise<PyqAttemptRow | null> {
    if (!pyqQuestion || !sourceAttempt) return null;
    const receiptOriginId = row?.id ?? item.id;
    const reattemptRound = item.successful_retrieval_count + item.lapse_count;
    const roundAttemptNumber = nextReattemptRoundAttemptNumber(
      attempts,
      receiptOriginId,
      reattemptRound
    );
    const receiptId = pyqReattemptAttemptId(
      receiptOriginId,
      reattemptRound,
      roundAttemptNumber
    );
    const alreadySaved = await db.pyq_attempts.get(receiptId);
    if (alreadySaved) return alreadySaved;
    const committedAtMs = Date.now();
    const attempt = createPyqReattemptAttemptRow({
      userId: item.user_id,
      reattemptId: receiptOriginId,
      reattemptRound,
      roundAttemptNumber,
      sourceAttempt,
      question: pyqQuestion,
      selectedAnswer: answer,
      decision,
      questionStartedAtMs: Math.max(0, committedAtMs - Math.max(1, seconds) * 1000),
      committedAtMs,
      screenshotUrl: answerFreePyqImageUrl(
        firstPyqImage(pyqQuestion.html) ?? sourceAttempt.screenshot_url
      ),
      attemptNumber:
        attempts.reduce((highest, candidate) => Math.max(highest, candidate.attempt_number), 0) + 1
    });
    const withConfidence: PyqAttemptRow = { ...attempt, confidence: recordedConfidence };
    await writeLocal('pyq_attempts', withConfidence);
    return withConfidence;
  }

  async function recordRetrieval(args: {
    correct: boolean;
    blank?: boolean;
    answer: PyqSelectedAnswer;
    correctAnswer: PyqSelectedAnswer;
    confidence: PyqExamConfidence;
    seconds: number;
    sourcePyqAttemptId?: string | null;
  }) {
    const current = await sessionWriteRef.current;
    const result = await recordRecoveryRetrieval({
      session: current,
      item,
      evidence: {
        correct: args.correct,
        blank: args.blank,
        timeSpentSec: Math.max(1, args.seconds),
        targetTimeSec: targetSec,
        confidence: args.confidence,
        hintUsed: cueRevealed || current.hinted_item_ids.includes(item.id),
        priorSuccessfulRetrievals: item.successful_retrieval_count
      },
      answer: args.answer,
      sourcePyqAttemptId: args.sourcePyqAttemptId,
      timeZone,
      today
    });
    sessionWriteRef.current = Promise.resolve(result.session);
    onFeedback({
      itemId: item.id,
      session: result.session,
      grade: result.grade,
      explanation: result.explanation,
      answer: args.answer,
      correctAnswer: args.correctAnswer,
      elapsedSec: Math.max(1, args.seconds),
      wasTransfer: item.stage === 'TRANSFER'
    });
  }

  async function commitAnswer() {
    if (!canCommit || !confidence) return;
    setWorking(true);
    setError(null);
    try {
      const seconds = Math.max(1, elapsedSec);
      if (pyqQuestion && sourceAttempt) {
        const receipt = await createRecoveryPyqReceipt(selected, 'MARK', confidence, seconds);
        if (receipt?.mark_correct == null) {
          setSelfCheck({
            answer: selected,
            confidence,
            elapsedSec: seconds,
            correctAnswer: receipt?.correct_answer ?? null,
            sourcePyqAttemptId: receipt?.id ?? null
          });
          return;
        }
        await recordRetrieval({
          correct: receipt.mark_correct,
          answer: receipt.selected_answer,
          correctAnswer: receipt.correct_answer,
          confidence,
          seconds,
          sourcePyqAttemptId: receipt.id
        });
        return;
      }

      const verdict =
        question && inputType
          ? evaluateLoggedReattemptAnswer(
              inputType,
              selected,
              question.answer_text,
              'MARK',
              {
                toleranceAbs: question.nat_tolerance_abs,
                acceptedMin: question.nat_accepted_min,
                acceptedMax: question.nat_accepted_max
              }
            )
          : null;
      const correctAnswer = question?.answer_text ?? null;
      if (verdict == null) {
        setSelfCheck({
          answer: selected,
          confidence,
          elapsedSec: seconds,
          correctAnswer,
          sourcePyqAttemptId: null
        });
        return;
      }
      await recordRetrieval({
        correct: verdict,
        answer: selected,
        correctAnswer,
        confidence,
        seconds,
        sourcePyqAttemptId: null
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The retrieval result could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  async function recordDontKnow() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const seconds = Math.max(1, elapsedSec);
      const receipt = await createRecoveryPyqReceipt(null, 'SKIP', null, seconds);
      await recordRetrieval({
        correct: false,
        blank: true,
        answer: null,
        correctAnswer: receipt?.correct_answer ?? question?.answer_text ?? null,
        confidence: 'low',
        seconds,
        sourcePyqAttemptId: receipt?.id ?? null
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The failed recall could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  async function recordSelfCheck(correct: boolean) {
    if (!selfCheck || working) return;
    setWorking(true);
    setError(null);
    try {
      await recordRetrieval({
        correct,
        answer: selfCheck.answer,
        correctAnswer: selfCheck.correctAnswer,
        confidence: selfCheck.confidence,
        seconds: selfCheck.elapsedSec,
        sourcePyqAttemptId: selfCheck.sourcePyqAttemptId
      });
      setSelfCheck(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The self-check could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  async function defer() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const current = await sessionWriteRef.current;
      const result = await deferRecoveryItem({
        session: current,
        item,
        today,
        timeZone,
        reason: 'learner chose Not now'
      });
      sessionWriteRef.current = Promise.resolve(result.session);
      onDeferred();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This question could not be deferred.');
    } finally {
      setWorking(false);
    }
  }

  async function interrupt() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const current = await sessionWriteRef.current;
      const updated = await interruptRecoverySession({
        session: current,
        item,
        timeZone,
        reason: 'learner paused the recovery sprint',
        elapsedMs: Math.max(0, elapsedSec * 1000)
      });
      sessionWriteRef.current = Promise.resolve(updated);
      onInterrupted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The sprint could not be paused.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => void interrupt()}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text"
        >
          <PauseCircle size={14} /> Pause & exit
        </button>
        <div className="flex items-center gap-3">
          <span className="u-num text-[12px] text-text-muted">
            Recovery {position}/{session.item_ids.length}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-faint">
            <Clock3 size={13} /> {secondsToClock(feedback?.elapsedSec ?? elapsedSec)}
          </span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <BrainCircuit size={16} className="text-accent" />
              {pyqQuestion
                ? `${pyqQuestion.paperLabel} · Q ${pyqQuestion.number}`
                : (question?.source_ref ?? 'Blind retrieval')}
            </span>
          }
          aside={
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="accent">{item.subject}</Badge>
              <Badge>{item.stage === 'D30' ? 'D30 check pending' : item.stage}</Badge>
            </div>
          }
        />
        <CardBody className="flex flex-col gap-5 p-5 sm:p-7">
          {pyqQuestion ? <PyqQuestionContent html={pyqQuestion.html} /> : null}
          {!pyqQuestion && question?.question_text?.trim() ? (
            <PyqQuestionContent html={plainTextQuestionHtml(question.question_text)} />
          ) : null}
          {questionImageUrl ? (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              aria-label="Open question image full screen"
              className="overflow-hidden rounded-xl border border-border bg-white"
            >
              <img
                src={questionImageUrl}
                alt="Question to recover"
                className="mx-auto max-h-[62dvh] w-full object-contain"
              />
            </button>
          ) : null}
          {!pyqQuestion && !question?.question_text?.trim() && !questionImageUrl ? (
            <p className="rounded-xl border border-dashed border-warn/35 bg-warn/5 p-4 text-[13px] text-text-muted">
              The prompt is not available on this device. Use the source reference above before
              grading the retrieval.
            </p>
          ) : null}

          {!revealed && openingCue ? (
            <div className="rounded-xl border border-accent/20 bg-accent-faint/40 p-3">
              {cueRevealed ? (
                <div>
                  <p className="u-label">Opening cue revealed · grade capped at Hard</p>
                  <p className="mt-1 text-[13px] font-medium text-text">{openingCue}</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-text">Need one opening cue?</p>
                    <p className="mt-1 text-[11.5px] text-text-muted">
                      Revealing it is recorded and caps a correct retrieval at Hard.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void revealCue()} disabled={working}>
                    <Lightbulb size={14} /> Reveal opening cue
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {feedback ? (
        <RecoveryResultPanel
          feedback={feedback}
          question={question}
          hasNext={feedback.session.current_index < feedback.session.item_ids.length}
          onContinue={onContinue}
          transferAction={transferAction}
        />
      ) : selfCheck ? (
        <Card>
          <CardBody className="flex flex-col gap-4 p-4 sm:p-5">
            <RecoveryRevealedContext
              question={question}
              answer={selfCheck.answer}
              correctAnswer={selfCheck.correctAnswer}
            />
            <div>
              <p className="text-[13px] font-medium text-text">Did your result and method match?</p>
              <p className="mt-1 text-[12px] text-text-muted">
                This item has no definitive machine-checkable key, so record an honest self-check.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button variant="danger" onClick={() => void recordSelfCheck(false)} disabled={working}>
                  No — record Again
                </Button>
                <Button onClick={() => void recordSelfCheck(true)} disabled={working}>
                  Yes — grade retrieval
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <div>
              {inputType ? (
                <ExamAnswerPad
                  inputType={inputType}
                  availableChoices={availableChoices}
                  choices={choices}
                  numeric={numeric}
                  disabled={working}
                  onChoices={updateChoices}
                  onNumeric={updateNumeric}
                />
              ) : (
                <p className="text-[13px] text-text-muted">
                  The original answer controls are unavailable. Use “I don't know” or defer until
                  the source can be restored.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <RecoveryConfidencePicker
                value={confidence}
                disabled={working}
                onChange={updateConfidence}
              />
              <Button variant="primary" onClick={() => void commitAnswer()} disabled={!canCommit}>
                Commit & reveal
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="danger" onClick={() => void recordDontKnow()} disabled={working}>
                  I don't know
                </Button>
                <Button variant="ghost" onClick={() => void defer()} disabled={working}>
                  Not now
                </Button>
              </div>
              <p className="text-[11.5px] leading-relaxed text-text-faint">
                “I don't know” is failed recall and schedules recovery. “Not now” is a neutral,
                one-day defer. Pausing keeps this item and its elapsed work.
              </p>
              {error ? (
                <p role="alert" className="text-[12px] leading-relaxed text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          </CardBody>
        </Card>
      )}

      <ImagePreview
        src={questionImageUrl}
        caption={question?.source_ref ?? 'Question to recover'}
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </div>
  );
}

function PyqReattemptSession({
  userId,
  row,
  question,
  sourceAttempt,
  attempts,
  reattemptRound,
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
  reattemptRound: number;
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
      const roundAttemptNumber = nextReattemptRoundAttemptNumber(attempts, row.id, reattemptRound);
      const roundAttemptId = pyqReattemptAttemptId(row.id, reattemptRound, roundAttemptNumber);
      const alreadySaved = await db.pyq_attempts.get(roundAttemptId);
      if (alreadySaved) {
        setLocalAttempt(alreadySaved);
        return;
      }
      const committedAtMs = Date.now();
      const questionStartedAtMs = Math.min(startedAt ?? committedAtMs, committedAtMs);
      let screenshotUrl = answerFreePyqImageUrl(
        firstPyqImage(question.html) ?? sourceAttempt.screenshot_url
      );
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
        reattemptRound,
        roundAttemptNumber,
        sourceAttempt,
        question,
        selectedAnswer: selectedAnswer(),
        decision,
        questionStartedAtMs,
        committedAtMs,
        screenshotUrl,
        attemptNumber:
          attempts.reduce((highest, candidate) => Math.max(highest, candidate.attempt_number), 0) +
          1
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
                {question.marks ? (
                  <Badge>
                    {question.marks} mark{question.marks === 1 ? '' : 's'}
                  </Badge>
                ) : null}
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
            availableChoices={question.choices}
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
  const questionImageUrl = answerFreePyqImageUrl(question?.image_url);
  const hasImage = !!questionImageUrl;
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
        currentAttempt.decision!,
        {
          toleranceAbs: question?.nat_tolerance_abs,
          acceptedMin: question?.nat_accepted_min,
          acceptedMax: question?.nat_accepted_max
        }
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
                src={questionImageUrl ?? ''}
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
        src={questionImageUrl}
        caption={question?.source_ref ?? question?.pattern_name ?? 'Question to re-attempt'}
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </div>
  );
}

export default function Reattempts() {
  const { userId, profile } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const navigate = useNavigate();
  const location = useLocation();
  const { reattemptId } = useParams<{ reattemptId: string }>();
  const [searchParams] = useSearchParams();
  const routeNavigation = navigationState(location.state);
  const [attemptsByRowId, setAttemptsByRowId] = useState<Record<string, AttemptState>>(
    () => routeNavigation?.attemptsById ?? {}
  );
  const [recoveryFeedback, setRecoveryFeedback] = useState<RecoveryFeedback | null>(null);
  const [startingRecoveryMode, setStartingRecoveryMode] = useState<RecoverySessionMode | null>(null);
  const [assigningTransfer, setAssigningTransfer] = useState(false);
  const recoveryAutoStartRef = useRef(false);
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const today = todayISOInTimeZone(timeZone);

  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const pyqAttempts = useLiveQuery(
    () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const learningItems = useLiveQuery(
    () => (userId ? db.learning_items.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const learningEvents = useLiveQuery(
    () => (userId ? db.learning_events.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const resumableRecoverySession = useLiveQuery(
    () => (userId ? latestResumableRecoverySession(userId) : null),
    [userId],
    null
  );

  const questionIds = useMemo(
    () => [
      ...new Set([
        ...(reattempts ?? []).map((row) => row.question_id),
        ...(learningItems ?? []).flatMap((item) =>
          item.source_question_id ? [item.source_question_id] : []
        )
      ])
    ],
    [learningItems, reattempts]
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

  const learningItemById = useMemo(
    () => new Map((learningItems ?? []).map((item) => [item.id, item])),
    [learningItems]
  );
  const reattemptByLearningItemId = useMemo(() => {
    const byId = new Map<string, ReattemptRow>();
    for (const row of reattempts ?? []) {
      if (row.learning_item_id) byId.set(row.learning_item_id, row);
    }
    return byId;
  }, [reattempts]);
  const attemptById = useMemo(
    () => new Map((pyqAttempts ?? []).map((attempt) => [attempt.id, attempt])),
    [pyqAttempts]
  );
  const allRecoveryCandidates = useMemo<RecoveryCandidate[]>(
    () =>
      (learningItems ?? []).flatMap((item) => {
        if (
          !item.scheduled_date ||
          item.recovery_state === 'mastered' ||
          item.recovery_state === 'paused'
        ) {
          return [];
        }
        const sourceAttempt = item.latest_pyq_attempt_id
          ? attemptById.get(item.latest_pyq_attempt_id)
          : item.origin_pyq_attempt_id
            ? attemptById.get(item.origin_pyq_attempt_id)
            : null;
        const loggedQuestion = item.source_question_id
          ? qById.get(item.source_question_id)
          : reattemptByLearningItemId.get(item.id)
            ? qById.get(reattemptByLearningItemId.get(item.id)!.question_id)
            : null;
        const marks = sourceAttempt?.question_marks ?? sourceAttempt?.question_snapshot?.marks ?? null;
        return [
          {
            item,
            estimatedSeconds: loggedQuestion?.target_time_sec ?? targetTimeSecForMarks(marks),
            marks,
            confidenceSurprise: item.reason_flags.includes('high-confidence-wrong')
          }
        ];
      }),
    [attemptById, learningItems, qById, reattemptByLearningItemId]
  );
  const recoveryCandidates = useMemo(
    () =>
      allRecoveryCandidates.filter(
        (candidate) => (candidate.item.scheduled_date ?? '') <= today
      ),
    [allRecoveryCandidates, today]
  );
  const activeRecoverySession =
    recoveryFeedback?.session ??
    (resumableRecoverySession?.status === 'active' ? resumableRecoverySession : null);
  const recoveryItemId =
    recoveryFeedback?.itemId ??
    (activeRecoverySession
      ? (activeRecoverySession.item_ids[activeRecoverySession.current_index] ?? null)
      : null);
  const activeRecoveryItem = recoveryItemId ? (learningItemById.get(recoveryItemId) ?? null) : null;
  const activeRecoveryRow = activeRecoveryItem
    ? (reattemptByLearningItemId.get(activeRecoveryItem.id) ?? null)
    : null;
  const activeRecoveryQuestion = activeRecoveryItem
    ? (activeRecoveryItem.source_question_id
        ? qById.get(activeRecoveryItem.source_question_id)
        : activeRecoveryRow
          ? qById.get(activeRecoveryRow.question_id)
          : null) ?? null
    : null;
  const activeRecoverySource = activeRecoveryItem
    ? (activeRecoveryItem.latest_pyq_attempt_id
        ? attemptById.get(activeRecoveryItem.latest_pyq_attempt_id)
        : activeRecoveryItem.origin_pyq_attempt_id
          ? attemptById.get(activeRecoveryItem.origin_pyq_attempt_id)
          : null) ?? null
    : null;
  const activeTransferAssignment = activeRecoveryItem
    ? transferAssignmentFromEvents(learningEvents ?? [], activeRecoveryItem.id)
    : null;
  const activeRecoveryQuestionUid =
    activeRecoveryItem?.stage === 'TRANSFER' && activeTransferAssignment
      ? activeTransferAssignment.questionUid
      : (activeRecoverySource?.question_uid ?? activeRecoveryItem?.question_uid ?? null);
  const activeRecoveryAttempts = activeRecoveryQuestionUid
    ? (pyqAttempts ?? [])
        .filter((attempt) => attempt.question_uid === activeRecoveryQuestionUid)
        .sort((left, right) => left.attempted_at.localeCompare(right.attempted_at))
    : [];
  const recoverySnapshotQuestion = useMemo(
    () =>
      activeRecoverySource?.question_uid === activeRecoveryQuestionUid
        ? pyqQuestionFromAttempt(activeRecoverySource)
        : null,
    [activeRecoveryQuestionUid, activeRecoverySource]
  );
  const [recoveryPyqRestore, setRecoveryPyqRestore] = useState<{
    sourceKey: string;
    loading: boolean;
    question: PyqQuestion | null;
  } | null>(null);
  const recoveryRestoreKey =
    activeRecoverySource && activeRecoveryQuestionUid
      ? `${activeRecoverySource.id}:${activeRecoveryQuestionUid}`
      : null;
  const matchingRecoveryRestore =
    recoveryRestoreKey && recoveryPyqRestore?.sourceKey === recoveryRestoreKey
      ? recoveryPyqRestore
      : null;
  const recoveryPyqLoading =
    !!recoveryRestoreKey &&
    !recoverySnapshotQuestion &&
    (!matchingRecoveryRestore || matchingRecoveryRestore.loading);
  const activeRecoveryPyqQuestion =
    recoverySnapshotQuestion ?? matchingRecoveryRestore?.question ?? null;

  const { due, upcoming, mastered } = useMemo(
    () => buildReattemptQueue(reattempts ?? [], today),
    [reattempts, today]
  );
  const legacyDue = due.filter(
    (row) => !row.learning_item_id || !learningItemById.has(row.learning_item_id)
  );
  const legacyUpcoming = upcoming.filter(
    (row) => !row.learning_item_id || !learningItemById.has(row.learning_item_id)
  );
  const canonicalMastered = (learningItems ?? []).filter(
    (item) => item.recovery_state === 'mastered'
  ).length;
  const legacyMastered = (reattempts ?? []).filter(
    (row) =>
      row.stage === 'MASTERED' &&
      (!row.learning_item_id || !learningItemById.has(row.learning_item_id))
  ).length;
  const dueCount = recoveryCandidates.length + legacyDue.length;
  const upcomingCount =
    (learningItems ?? []).filter(
      (item) =>
        item.recovery_state !== 'mastered' &&
        item.recovery_state !== 'paused' &&
        item.scheduled_date != null &&
        item.scheduled_date > today
    ).length + legacyUpcoming.length;
  const masteredCount =
    learningItems === undefined ? mastered : canonicalMastered + legacyMastered;
  const recoveryPreviews = useMemo(
    () =>
      Object.fromEntries(
        RECOVERY_SPRINT_OPTIONS.map((option) => [
          option.mode,
          buildRecoverySprint(recoveryCandidates, option.mode, today)
        ])
      ) as Record<RecoverySessionMode, ReturnType<typeof buildRecoverySprint>>,
    [recoveryCandidates, today]
  );
  const recommendedRecoverySprint = recoveryPreviews['minutes-20'];
  const sevenDayRecoveryForecast = useMemo(
    () => forecastRecoveryLoad(allRecoveryCandidates, today, 7),
    [allRecoveryCandidates, today]
  );
  const thirtyDayRecoveryForecast = useMemo(
    () => forecastRecoveryLoad(allRecoveryCandidates, today, 30),
    [allRecoveryCandidates, today]
  );
  const thirtyDayRecoveryTotal = thirtyDayRecoveryForecast.reduce(
    (total, day) => total + day.itemCount,
    0
  );
  const upcomingGroups = useMemo(() => {
    const groups = new Map<string, { count: number; subjects: Set<string> }>();
    for (const item of learningItems ?? []) {
      if (
        !item.scheduled_date ||
        item.scheduled_date <= today ||
        item.recovery_state === 'mastered' ||
        item.recovery_state === 'paused'
      ) {
        continue;
      }
      const group = groups.get(item.scheduled_date) ?? { count: 0, subjects: new Set<string>() };
      group.count += 1;
      if (item.subject) group.subjects.add(item.subject);
      groups.set(item.scheduled_date, group);
    }
    for (const row of legacyUpcoming) {
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
  }, [learningItems, legacyUpcoming, qById, today]);
  const defaultQueueIds = legacyDue.map((row) => row.id);
  const queueIds = routeNavigation?.queueIds.length ? routeNavigation.queueIds : defaultQueueIds;
  const roundById =
    routeNavigation?.roundById ??
    Object.fromEntries(legacyDue.map((row) => [row.id, row.history.length]));
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
  const activeReattemptRound = activeRow
    ? (roundById[activeRow.id] ?? activeRow.history.length)
    : null;
  const existingRoundAttempt =
    activeRow && activeReattemptRound !== null
      ? ((pyqAttempts ?? [])
          .filter(
            (candidate) =>
              (candidate.reattempt_id === activeRow.id &&
                candidate.reattempt_round === activeReattemptRound) ||
              (candidate.reattempt_id == null &&
                candidate.id === pyqReattemptAttemptId(activeRow.id, activeReattemptRound))
          )
          .sort(
            (left, right) =>
              (left.round_attempt_number ?? 1) - (right.round_attempt_number ?? 1) ||
              left.attempted_at.localeCompare(right.attempted_at)
          )
          .at(-1) ?? null)
      : null;

  const beginRecoverySprint = useCallback(
    async (mode: RecoverySessionMode) => {
      if (!userId || recoveryCandidates.length === 0 || startingRecoveryMode) return;
      recoveryAutoStartRef.current = true;
      setStartingRecoveryMode(mode);
      setRecoveryFeedback(null);
      try {
        const result = await startRecoverySession({
          userId,
          mode,
          candidates: recoveryCandidates,
          today
        });
        pushToast(
          `${result.sprint.selected.length} ${plural(result.sprint.selected.length, 'question')} · about ${Math.max(1, Math.ceil(result.sprint.estimatedSeconds / 60))} min`,
          'success'
        );
      } catch (cause) {
        recoveryAutoStartRef.current = false;
        pushToast(
          cause instanceof Error ? cause.message : 'The recovery sprint could not be started.',
          'neutral'
        );
      } finally {
        setStartingRecoveryMode(null);
      }
    },
    [pushToast, recoveryCandidates, startingRecoveryMode, today, userId]
  );

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
    if (
      !activeRecoverySource ||
      !activeRecoveryQuestionUid ||
      !recoveryRestoreKey ||
      recoverySnapshotQuestion
    ) {
      return;
    }
    let cancelled = false;
    setRecoveryPyqRestore({
      sourceKey: recoveryRestoreKey,
      loading: true,
      question: null
    });
    void loadPyqQuestionByUid(activeRecoveryQuestionUid, activeRecoverySource.subject)
      .then((question) => {
        if (!cancelled) {
          setRecoveryPyqRestore({
            sourceKey: recoveryRestoreKey,
            loading: false,
            question
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecoveryPyqRestore({
            sourceKey: recoveryRestoreKey,
            loading: false,
            question: null
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeRecoveryQuestionUid,
    activeRecoverySource,
    recoveryRestoreKey,
    recoverySnapshotQuestion
  ]);

  useEffect(() => {
    if (
      reattemptId ||
      searchParams.get('open') !== 'first' ||
      activeRecoverySession ||
      startingRecoveryMode ||
      recoveryAutoStartRef.current
    ) {
      return;
    }
    if (recoveryCandidates.length > 0) {
      void beginRecoverySprint('due');
      return;
    }
    if (legacyDue.length > 0) {
      navigate(`/reattempts/${encodeURIComponent(legacyDue[0].id)}`, { replace: true });
    }
  }, [
    activeRecoverySession,
    beginRecoverySprint,
    legacyDue,
    navigate,
    reattemptId,
    recoveryCandidates,
    searchParams,
    startingRecoveryMode
  ]);

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

  async function resumeRecoverySession(session: RecoverySessionRow) {
    try {
      recoveryAutoStartRef.current = true;
      setRecoveryFeedback(null);
      await checkpointRecoverySession(session, {
        status: 'active',
        current_item_started_at: new Date().toISOString(),
        completed_at: null
      });
      pushToast('Recovery sprint resumed from the saved question.', 'success');
    } catch (cause) {
      pushToast(
        cause instanceof Error ? cause.message : 'The recovery sprint could not be resumed.',
        'neutral'
      );
    }
  }

  async function assignFreshTransfer(item: LearningItemRow) {
    if (!pyqAttempts || assigningTransfer) return;
    setAssigningTransfer(true);
    try {
      const manifest = await loadPyqManifest();
      const subjectHint = activeRecoveryPyqQuestion?.subjectSlug ?? subjectSlugHint(item.subject);
      const subject = manifest.subjects.find(
        (candidate) =>
          candidate.slug.toLocaleLowerCase('en') === subjectHint.toLocaleLowerCase('en') ||
          candidate.label.toLocaleLowerCase('en') === item.subject.toLocaleLowerCase('en')
      );
      if (!subject) throw new Error('The exact source subject is unavailable in this bank.');
      const questions = await loadPyqQuestions([subject], manifest.bankVersion);
      const reserved = new Set<string>();
      for (const paper of manifest.benchmarkPapers) {
        if (pyqBenchmarkPaperExposure(paper, pyqAttempts).sealed) {
          for (const questionUid of paper.questionUids) reserved.add(questionUid);
        }
      }
      const selection = selectExactTopicTransferQuestion({
        item,
        questions,
        attempts: pyqAttempts,
        reservedQuestionUids: reserved
      });
      if (!selection.question) {
        throw new Error(
          'No unseen, answerable same-topic transfer remains outside the sealed-paper reserve.'
        );
      }
      const assigned = await assignRecoveryTransfer({
        item,
        question: selection.question,
        today,
        timeZone
      });
      pushToast(
        `${selection.question.paperLabel} Q${selection.question.number} assigned for ${formatDate(assigned.scheduled_date!, 'dd MMM')} · exact same topic, unseen, reserve-safe.`,
        'success'
      );
    } catch (cause) {
      pushToast(
        cause instanceof Error ? cause.message : 'A fresh transfer could not be assigned.',
        'neutral'
      );
    } finally {
      setAssigningTransfer(false);
    }
  }

  function openSession(rowId: string) {
    const runningAttempt = Object.values(attemptsByRowId).find((attempt) => attempt.startedAt);
    if (runningAttempt && runningAttempt.rowId !== rowId) {
      pushToast('Finish the running attempt before opening another question.', 'neutral');
      return;
    }
    const nextQueueIds = legacyDue.map((row) => row.id);
    const nextNavigation: ReattemptNavigationState = {
      queueIds: nextQueueIds,
      roundById: Object.fromEntries(legacyDue.map((row) => [row.id, row.history.length])),
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

  function continueRecoverySession() {
    const completed = recoveryFeedback?.session.status === 'completed';
    setRecoveryFeedback(null);
    if (completed) {
      recoveryAutoStartRef.current = false;
      pushToast('Recovery sprint complete. Every result is saved as evidence.', 'success');
    }
  }

  function leaveRecoverySession(message: string) {
    setRecoveryFeedback(null);
    recoveryAutoStartRef.current = false;
    pushToast(message, 'neutral');
  }

  if (!reattemptId && activeRecoverySession) {
    if (learningItems === undefined || pyqAttempts === undefined || !activeRecoveryItem) {
      return (
        <Card>
          <CardBody className="py-12 text-center text-[13px] text-text-faint">
            Restoring the saved recovery sprint…
          </CardBody>
        </Card>
      );
    }
    if (activeRecoverySource && recoveryPyqLoading) {
      return (
        <Card>
          <CardBody className="py-12 text-center text-[13px] text-text-faint">
            Restoring the original PYQ without revealing its answer…
          </CardBody>
        </Card>
      );
    }
    return (
      <CanonicalRecoverySession
        key={`${activeRecoverySession.id}:${activeRecoveryItem.id}`}
        session={activeRecoverySession}
        item={activeRecoveryItem}
        row={activeRecoveryRow}
        question={activeRecoveryQuestion}
        pyqQuestion={activeRecoveryPyqQuestion}
        sourceAttempt={activeRecoverySource}
        attempts={activeRecoveryAttempts}
        today={today}
        timeZone={timeZone}
        feedback={
          recoveryFeedback?.itemId === activeRecoveryItem.id ? recoveryFeedback : null
        }
        onFeedback={setRecoveryFeedback}
        onContinue={continueRecoverySession}
        onDeferred={() => leaveRecoverySession('Not now recorded without a lapse.')}
        onInterrupted={() => leaveRecoverySession('Sprint paused at the saved question.')}
        onRemediated={(session) => {
          recoveryAutoStartRef.current = session?.status === 'active';
          setRecoveryFeedback(null);
          pushToast('Remediation saved. The blind D3 check is now scheduled.', 'success');
        }}
        transferAction={
          recoveryFeedback &&
          !recoveryFeedback.wasTransfer &&
          activeRecoveryItem.source_kind === 'pyq' &&
          activeRecoveryItem.stage !== 'TRANSFER' &&
          (recoveryFeedback.grade.grade === 'good' ||
            recoveryFeedback.grade.grade === 'easy') ? (
            <Button
              variant="ghost"
              onClick={() => void assignFreshTransfer(activeRecoveryItem)}
              disabled={assigningTransfer}
            >
              <ScanSearch size={15} />
              {assigningTransfer ? 'Finding exact-topic transfer…' : 'Try fresh transfer in 3 days'}
            </Button>
          ) : undefined
        }
      />
    );
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
          reattemptRound={activeReattemptRound ?? activeRow.history.length}
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
          reattempts === undefined || learningItems === undefined
            ? 'Loading…'
            : `${dueCount} due · ${upcomingCount} upcoming · ${masteredCount} mastered`
        }
      />

      {resumableRecoverySession && resumableRecoverySession.status !== 'active' ? (
        <Card className="border-ink-violet/25 bg-ink-violet/[0.04]">
          <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div>
              <p className="u-label text-ink-violet">Saved recovery sprint</p>
              <p className="mt-1 text-[14px] font-semibold text-text">
                Question {Math.min(
                  resumableRecoverySession.item_ids.length,
                  resumableRecoverySession.current_index + 1
                )}{' '}
                of {resumableRecoverySession.item_ids.length}
              </p>
              <p className="mt-1 text-[12px] text-text-muted">
                Draft, elapsed time, revealed cues, and position are preserved on this device and
                synced to your account.
              </p>
            </div>
            <Button onClick={() => void resumeRecoverySession(resumableRecoverySession)}>
              <Play size={15} /> Resume blind retrieval
            </Button>
          </CardBody>
        </Card>
      ) : null}

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

      {recoveryCandidates.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Canonical recovery due now">
          <Card className="overflow-hidden border-accent/25">
            <CardHeader
              title={
                <div>
                  <p>Must recover today</p>
                  <p className="mt-1 text-[11.5px] font-normal text-text-muted">
                    {recoveryCandidates.length} due · {recommendedRecoverySprint.selected.length}{' '}
                    fit a 20-minute sprint
                  </p>
                </div>
              }
            />
            <CardBody className="grid gap-4 p-4 sm:p-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {RECOVERY_SPRINT_OPTIONS.map((option) => {
                  const preview = recoveryPreviews[option.mode];
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      disabled={startingRecoveryMode !== null || preview.selected.length === 0}
                      onClick={() => void beginRecoverySprint(option.mode)}
                      className="rounded-xl border border-border bg-bg-raised px-3 py-3 text-left transition-colors hover:border-accent/35 hover:bg-accent-faint disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="block text-[12.5px] font-semibold text-text">
                        {option.shortLabel}
                      </span>
                      <span className="u-label mt-1 block">
                        {preview.selected.length} {plural(preview.selected.length, 'question')}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {recommendedRecoverySprint.mustRecoverToday.slice(0, 6).map((candidate) => (
                  <div
                    key={candidate.item.id}
                    className="rounded-xl border border-border bg-bg-raised px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[12.5px] font-semibold text-text">
                          {candidate.item.subject}
                          {candidate.item.topic ? ` · ${candidate.item.topic}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Priority reasons">
                          {candidate.reasons.map((reason) => (
                            <Badge key={reason}>{reason}</Badge>
                          ))}
                        </div>
                      </div>
                      <span className="u-num shrink-0 text-[11px] text-text-faint">
                        ~{Math.max(1, Math.ceil(candidate.estimatedSeconds / 60))}m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {recommendedRecoverySprint.ifTime.length > 0 ? (
                <p className="text-[12px] text-text-muted">
                  If time: {recommendedRecoverySprint.ifTime.length} more prioritized by overdue
                  age, lapses, marks, confidence surprise, and subject interleaving.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </section>
      ) : null}

      {allRecoveryCandidates.length > 0 ? (
        <Card>
          <CardHeader
            title="Recovery load forecast"
            aside={<span className="u-num text-[11px] text-text-faint">{thirtyDayRecoveryTotal} in 30d</span>}
          />
          <CardBody className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-7">
            {sevenDayRecoveryForecast.map((day, index) => (
              <div key={day.date} className="rounded-xl border border-border bg-bg-raised px-3 py-3">
                <p className="u-label">{index === 0 ? 'Today' : formatDate(day.date, 'EEE')}</p>
                <p className="mt-1 font-display text-[20px] font-semibold text-text">{day.itemCount}</p>
                <p className="mt-0.5 text-[11px] text-text-faint">
                  ~{day.estimatedMinutes}m{day.overdue > 0 ? ` · ${day.overdue} overdue` : ''}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {legacyDue.length > 0 ? (
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
              <span className="u-num text-[12px] text-text-faint">{legacyDue.length}</span>
              <Button variant="primary" onClick={() => openSession(legacyDue[0].id)}>
                <Play size={15} /> Start test
              </Button>
            </div>
          </div>
          {legacyDue.map((row) => (
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
      ) : recoveryCandidates.length === 0 ? (
        <Empty
          title="Nothing due"
          hint="The queue fills as you tag RBS, RBG and W-* questions. First rung lands 3 days after the mistake."
        />
      ) : null}

      {upcomingCount > 0 ? (
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
