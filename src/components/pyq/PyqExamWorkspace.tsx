import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Eraser,
  Flag,
  Pause,
  Send,
  Square
} from 'lucide-react';
import type { PyqExamConfidence, PyqSessionRow } from '@/types';
import type { PyqQuestion } from '@/lib/pyq';
import {
  getPyqExamConfidence,
  pyqExamPaletteCounts,
  pyqExamQuestionStatus,
  type PyqExamPaletteCounts,
  type PyqExamQuestionStatus
} from '@/lib/pyq-exam';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import ScientificCalculator, { CalculatorTrigger } from '@/components/shared/ScientificCalculator';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn, secondsToClock } from '@/lib/utils';

const ANSWER_CHOICES = ['A', 'B', 'C', 'D'] as const;

const STATUS_LABELS: Record<PyqExamQuestionStatus, string> = {
  answered: 'Answered',
  'not-answered': 'Not answered',
  'not-visited': 'Not visited',
  'marked-for-review': 'Marked for review',
  'answered-and-marked': 'Answered & marked for review'
};

const STATUS_BUTTON_CLASSES: Record<PyqExamQuestionStatus, string> = {
  answered: 'border-success/55 bg-success-faint text-success',
  'not-answered': 'border-danger/55 bg-danger-faint text-danger',
  'not-visited': 'border-border bg-bg-raised text-text-faint',
  'marked-for-review': 'border-guess/55 bg-guess-faint text-guess',
  'answered-and-marked':
    'border-success bg-success text-success-contrast shadow-[inset_0_-4px_0_rgb(var(--color-guess)/0.7)]'
};

interface PyqExamWorkspaceProps {
  session: PyqSessionRow;
  questions: PyqQuestion[];
  index: number;
  choices: string[];
  numeric: string;
  remainingSec: number;
  submitting: boolean;
  error: string | null;
  onChoices: (choices: string[]) => void;
  onNumeric: (value: string) => void;
  onNavigate: (index: number) => void;
  onMarkAndNext: () => void;
  onClear: () => void;
  onSaveAndNext: () => void;
  onPrevious: () => void;
  onSubmit: () => void;
  onPause: () => void;
  /** Optional while legacy callers are migrated; controls remain visible but disabled. */
  onConfidence?: (confidence: PyqExamConfidence) => void;
}

function answerInputType(question: PyqQuestion): 'MCQ' | 'MSQ' | 'NAT' {
  if (question.type === 'MSQ' || question.type === 'NAT') return question.type;
  return 'MCQ';
}

function statusCount(counts: PyqExamPaletteCounts, status: PyqExamQuestionStatus): number {
  if (status === 'answered') return counts.answered;
  if (status === 'not-answered') return counts.notAnswered;
  if (status === 'not-visited') return counts.notVisited;
  if (status === 'marked-for-review') return counts.markedForReview;
  return counts.answeredAndMarked;
}

function StatusGlyph({ status }: { status: PyqExamQuestionStatus }) {
  if (status === 'answered') return <Check size={11} strokeWidth={3} aria-hidden="true" />;
  if (status === 'marked-for-review') {
    return <Bookmark size={10} fill="currentColor" aria-hidden="true" />;
  }
  if (status === 'answered-and-marked') {
    return (
      <span className="relative flex h-3 w-3 items-center justify-center" aria-hidden="true">
        <Check size={11} strokeWidth={3} />
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-guess-contrast ring-1 ring-guess" />
      </span>
    );
  }
  if (status === 'not-answered') {
    return (
      <span className="font-mono text-[10px] font-black leading-none" aria-hidden="true">
        !
      </span>
    );
  }
  return <Square size={8} aria-hidden="true" />;
}

function StatusLegend({ counts }: { counts: PyqExamPaletteCounts }) {
  const statuses: PyqExamQuestionStatus[] = [
    'answered',
    'not-answered',
    'not-visited',
    'marked-for-review',
    'answered-and-marked'
  ];

  return (
    <ul className="grid gap-2" aria-label="Question status legend">
      {statuses.map((status) => (
        <li key={status} className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border',
              STATUS_BUTTON_CLASSES[status]
            )}
            aria-hidden="true"
          >
            <StatusGlyph status={status} />
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-tight text-text-muted">
            {STATUS_LABELS[status]}
          </span>
          <span className="u-num min-w-6 text-right text-[12px] font-semibold text-text">
            {statusCount(counts, status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function QuestionPalette({
  session,
  questions,
  index,
  submitting,
  onNavigate
}: {
  session: PyqSessionRow;
  questions: PyqQuestion[];
  index: number;
  submitting: boolean;
  onNavigate: (index: number) => void;
}) {
  return (
    <nav aria-label="Exam questions">
      <div className="grid grid-cols-5 gap-2">
        {questions.map((question, questionIndex) => {
          const status = pyqExamQuestionStatus(session, question);
          const current = questionIndex === index;
          return (
            <button
              key={question.id}
              type="button"
              disabled={submitting}
              onClick={() => onNavigate(questionIndex)}
              aria-label={`Question ${questionIndex + 1}: ${STATUS_LABELS[status]}${current ? ', current question' : ''}`}
              aria-current={current ? 'page' : undefined}
              aria-pressed={current}
              title={`Question ${questionIndex + 1} · ${STATUS_LABELS[status]}`}
              className={cn(
                'relative flex aspect-square min-h-9 min-w-0 items-center justify-center rounded-sm border font-mono text-[12px] font-bold tabular-nums',
                'transition-[transform,box-shadow,border-color] hover:-translate-y-px disabled:cursor-wait disabled:opacity-55',
                STATUS_BUTTON_CLASSES[status],
                current && 'z-10 ring-2 ring-accent ring-offset-2 ring-offset-bg-raised shadow-card'
              )}
            >
              <span>{questionIndex + 1}</span>
              <span className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center">
                <StatusGlyph status={status} />
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ResponsePad({
  question,
  status,
  choices,
  numeric,
  submitting,
  confidence,
  onChoices,
  onNumeric,
  onConfidence
}: {
  question: PyqQuestion;
  status: PyqExamQuestionStatus;
  choices: string[];
  numeric: string;
  submitting: boolean;
  confidence: PyqExamConfidence | null;
  onChoices: (choices: string[]) => void;
  onNumeric: (value: string) => void;
  onConfidence?: (confidence: PyqExamConfidence) => void;
}) {
  const inputType = answerInputType(question);
  const answerChoices = question.choices?.length ? question.choices : ANSWER_CHOICES;
  const statusTone =
    status === 'answered'
      ? 'success'
      : status === 'not-answered'
        ? 'danger'
        : status === 'not-visited'
          ? 'neutral'
          : 'guess';

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Response sheet"
        aside={<Badge tone={statusTone}>{STATUS_LABELS[status]}</Badge>}
      />
      <CardBody className="p-4 sm:p-5">
        {inputType === 'NAT' ? (
          <label className="block" htmlFor={`pyq-exam-numeric-${question.id}`}>
            <span className="text-[13px] font-semibold text-text">Your numeric answer</span>
            <span className="mt-0.5 block text-[11.5px] text-text-faint">
              Enter an integer or decimal value.
            </span>
            <input
              id={`pyq-exam-numeric-${question.id}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={numeric}
              disabled={submitting}
              onChange={(event) => onNumeric(event.target.value)}
              placeholder="Type your answer"
              autoComplete="off"
              className={cn(
                'u-control mt-3 h-12 w-full rounded border border-border bg-bg-raised px-3 font-mono text-[16px] text-text shadow-sm',
                'placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-faint',
                'disabled:cursor-wait disabled:opacity-55'
              )}
            />
          </label>
        ) : (
          <fieldset disabled={submitting}>
            <legend className="text-[13px] font-semibold text-text">
              {inputType === 'MSQ' ? 'Select every option that applies' : 'Select one option'}
            </legend>
            <p className="mt-0.5 text-[11.5px] text-text-faint">
              {inputType === 'MSQ'
                ? 'Multiple selections are allowed for this question.'
                : 'Choosing another option replaces your current response.'}
            </p>
            <div
              className={cn(
                'mt-3 grid gap-2',
                answerChoices.length > 4
                  ? 'grid-cols-2 sm:grid-cols-5'
                  : 'grid-cols-2 sm:grid-cols-4'
              )}
            >
              {answerChoices.map((choice) => {
                const selected = choices.includes(choice);
                return (
                  <label
                    key={choice}
                    className={cn(
                      'group flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded border px-3 transition-all',
                      selected
                        ? 'border-accent bg-accent-faint text-accent shadow-sm'
                        : 'border-border bg-bg-raised text-text-muted hover:-translate-y-px hover:border-border-hover hover:text-text',
                      submitting && 'cursor-wait opacity-55'
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type={inputType === 'MSQ' ? 'checkbox' : 'radio'}
                        name={`pyq-exam-choice-${question.id}`}
                        value={choice}
                        checked={selected}
                        onChange={() => {
                          if (inputType === 'MCQ') {
                            onChoices([choice]);
                            return;
                          }
                          onChoices(
                            selected
                              ? choices.filter((answer) => answer !== choice)
                              : [...choices, choice]
                          );
                        }}
                        aria-label={`Option ${choice}`}
                        className="sr-only"
                      />
                      <span className="font-mono text-[15px] font-bold">{choice}</span>
                    </span>
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center border transition-colors',
                        inputType === 'MSQ' ? 'rounded-sm' : 'rounded-full',
                        selected
                          ? 'border-accent bg-accent text-accent-contrast'
                          : 'border-border-hover bg-bg-raised group-hover:border-accent/50'
                      )}
                      aria-hidden="true"
                    >
                      {selected && <Check size={12} strokeWidth={3} />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <fieldset
          className="mt-5 border-t border-border pt-4"
          disabled={submitting || !onConfidence}
        >
          <legend className="text-[13px] font-semibold text-text">Answer confidence</legend>
          <p className="mt-0.5 text-[11.5px] text-text-faint">
            Record how certain you feel. The answer remains sealed until submission.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['high', 'medium', 'low'] as const).map((value) => {
              const selected = confidence === value;
              const label = value[0].toUpperCase() + value.slice(1);
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={`${label} confidence`}
                  aria-pressed={selected}
                  onClick={() => onConfidence?.(value)}
                  className={cn(
                    'min-h-10 rounded border px-2 text-[12px] font-semibold transition-colors',
                    selected
                      ? 'border-accent bg-accent-faint text-accent shadow-sm'
                      : 'border-border bg-bg-raised text-text-muted hover:border-border-hover hover:text-text',
                    (submitting || !onConfidence) && 'cursor-not-allowed opacity-55'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  );
}

function PalettePanel({
  session,
  questions,
  index,
  counts,
  submitting,
  onNavigate,
  onSubmit
}: {
  session: PyqSessionRow;
  questions: PyqQuestion[];
  index: number;
  counts: PyqExamPaletteCounts;
  submitting: boolean;
  onNavigate: (index: number) => void;
  onSubmit: () => void;
}) {
  const answered = counts.answered + counts.answeredAndMarked;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="u-label">Question ledger</p>
            <p className="mt-1 text-[12px] text-text-muted">Jump directly to any question.</p>
          </div>
          <span className="u-num text-[12px] font-semibold text-text">
            {answered}/{questions.length}
          </span>
        </div>
        <div className="mt-3">
          <QuestionPalette
            session={session}
            questions={questions}
            index={index}
            submitting={submitting}
            onNavigate={onNavigate}
          />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <p className="u-label mb-3">Status key</p>
        <StatusLegend counts={counts} />
      </div>

      <div className="border-t border-border pt-4">
        <Button
          variant="danger"
          className="w-full"
          disabled={submitting || questions.length === 0}
          onClick={onSubmit}
        >
          <Send size={15} />
          {submitting ? 'Submitting exam…' : 'Submit exam'}
        </Button>
        <p className="mt-2 text-center text-[10.5px] leading-relaxed text-text-faint">
          Review the ledger before final submission.
        </p>
      </div>
    </div>
  );
}

export default function PyqExamWorkspace({
  session,
  questions,
  index,
  choices,
  numeric,
  remainingSec,
  submitting,
  error,
  onChoices,
  onNumeric,
  onNavigate,
  onMarkAndNext,
  onClear,
  onSaveAndNext,
  onPrevious,
  onSubmit,
  onPause,
  onConfidence
}: PyqExamWorkspaceProps) {
  const current = questions[index];
  const counts = pyqExamPaletteCounts(session, questions);
  const urgent = remainingSec <= 5 * 60;
  const hasResponse = choices.length > 0 || numeric.trim().length > 0;
  const isLastQuestion = index >= questions.length - 1;
  const isFullPaper = session.config.examKind === 'full-paper';
  const [calcOpen, setCalcOpen] = useState(false);

  return (
    <>
    <section
      aria-label={`${isFullPaper ? 'Official full paper' : 'Timed PYQ exam'} workspace`}
      className="relative left-1/2 flex w-full -translate-x-1/2 flex-col gap-3 md:w-[min(1180px,calc(100vw-268px))]"
    >
      <header className="sticky top-[calc(56px+var(--safe-top))] z-20 rounded-lg border border-border bg-bg-raised/95 px-3 py-2 shadow-card backdrop-blur md:top-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-col items-start">
            <Button
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={onPause}
              aria-label="Pause exam"
              aria-describedby="pyq-exam-pause-hint"
              className="-ml-1 whitespace-nowrap"
            >
              <Pause size={14} />
              Pause exam
            </Button>
            <span
              id="pyq-exam-pause-hint"
              className="hidden pl-2 text-[9.5px] text-text-faint sm:block"
            >
              Progress saved · timer stops
            </span>
          </div>

          <div className="order-3 flex w-full items-center justify-between gap-3 border-t border-border pt-2.5 sm:order-none sm:w-auto sm:border-0 sm:pt-0">
            <div className="text-left sm:text-center">
              <p className="u-label">
                {isFullPaper ? 'Official full paper' : 'Timed PYQ exam'}
              </p>
              <p className="u-num mt-0.5 text-[12px] font-semibold text-text">
                Question {Math.min(index + 1, questions.length)} of {questions.length}
              </p>
            </div>
            <span className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
            <div className="text-right sm:hidden">
              <p className="u-label">Answered</p>
              <p className="u-num mt-0.5 text-[12px] font-semibold text-text">
                {counts.answered + counts.answeredAndMarked}/{questions.length}
              </p>
            </div>
          </div>

          <div
            role="timer"
            aria-label={`${secondsToClock(remainingSec)} remaining in this exam`}
            aria-atomic="true"
            className={cn(
              'flex min-w-[108px] items-center justify-center gap-2 rounded border px-3 py-2 font-mono text-[14px] font-bold tabular-nums',
              urgent
                ? 'border-danger/35 bg-danger-faint text-danger'
                : 'border-accent/25 bg-accent-faint text-accent'
            )}
          >
            <Clock3 size={15} aria-hidden="true" />
            {secondsToClock(remainingSec)}
          </div>
          <CalculatorTrigger
            onClick={() => setCalcOpen((v) => !v)}
            active={calcOpen}
          />
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded border border-danger/35 bg-danger-faint px-4 py-3 text-[12.5px] leading-relaxed text-danger"
        >
          {error}
        </div>
      )}

      {!current ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="font-display text-[17px] font-semibold text-text">
              This exam has no question at the selected position.
            </p>
            <p className="mt-1 text-[12.5px] text-text-muted">
              Pause the exam, then resume it to reload the saved question order.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_286px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <Card className="overflow-hidden">
              <div className="h-1 bg-accent" aria-hidden="true" />
              <CardHeader
                className="flex-col items-stretch gap-2.5 py-3 sm:flex-row sm:items-center"
                title={
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-display text-[15px] font-semibold normal-case tracking-normal text-text">
                      {current.paperLabel}
                    </span>
                    <span className="text-border-hover" aria-hidden="true">
                      /
                    </span>
                    <span className="font-mono text-[11px] text-text-muted">
                      Q {current.number}
                    </span>
                  </span>
                }
                aside={
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="accent">{current.subject}</Badge>
                    <Badge>{current.type}</Badge>
                    {current.marks && (
                      <Badge>
                        {current.marks} {current.marks === 1 ? 'mark' : 'marks'}
                      </Badge>
                    )}
                  </div>
                }
              />
              <CardBody className="min-h-[280px] p-5 sm:min-h-[360px] sm:p-7 lg:p-8">
                <PyqQuestionContent html={current.html} />
              </CardBody>
            </Card>

            <ResponsePad
              question={current}
              status={pyqExamQuestionStatus(session, current)}
              choices={choices}
              numeric={numeric}
              submitting={submitting}
              confidence={getPyqExamConfidence(session, current.id)}
              onChoices={onChoices}
              onNumeric={onNumeric}
              onConfidence={onConfidence}
            />
          </div>

          <aside
            aria-label="Question status and submission"
            className="sticky top-[92px] hidden max-h-[calc(100dvh-108px)] overflow-y-auto rounded-lg lg:block"
          >
            <Card className="overflow-hidden">
              <div className="border-l-4 border-accent p-4">
                <PalettePanel
                  session={session}
                  questions={questions}
                  index={index}
                  counts={counts}
                  submitting={submitting}
                  onNavigate={onNavigate}
                  onSubmit={onSubmit}
                />
              </div>
            </Card>
          </aside>
        </div>
      )}

      {current && (
        <details className="group overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Flag size={15} className="text-accent" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-text">Question palette</span>
              <span className="u-num rounded-full bg-bg-overlay px-2 py-0.5 text-[10px] text-text-muted">
                {counts.answered + counts.answeredAndMarked}/{questions.length} answered
              </span>
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 text-text-faint transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t border-border p-4">
            <PalettePanel
              session={session}
              questions={questions}
              index={index}
              counts={counts}
              submitting={submitting}
              onNavigate={onNavigate}
              onSubmit={onSubmit}
            />
          </div>
        </details>
      )}

      {current && (
        <div className="sticky bottom-[calc(4.5rem+var(--safe-bottom))] z-20 md:bottom-2">
          <Card className="overflow-hidden border-border-hover bg-bg-raised/95 shadow-lift backdrop-blur">
            <CardBody className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:p-3">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button variant="secondary" size="sm" disabled={submitting} onClick={onMarkAndNext}>
                  <Bookmark size={14} />
                  {isLastQuestion ? 'Mark for review' : 'Mark for review & next'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={submitting || !hasResponse}
                  onClick={onClear}
                >
                  <Eraser size={14} />
                  Clear response
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={submitting || index <= 0}
                  onClick={onPrevious}
                >
                  <ArrowLeft size={14} />
                  Previous
                </Button>
                <Button variant="primary" size="sm" disabled={submitting} onClick={onSaveAndNext}>
                  {isLastQuestion ? 'Review & submit' : 'Save & next'}
                  {isLastQuestion ? <Send size={14} /> : <ArrowRight size={14} />}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </section>

    <ScientificCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />
  </>);
}
