import { useId, useMemo, type ReactNode } from 'react';
import { ChevronDown, Lightbulb, TimerReset } from 'lucide-react';
import type { PyqQuestionSummary } from '@/lib/pyq-summary';
import { buildPyqImprovementInsights } from '@/lib/pyq-improvement-insights';

const PERCENT_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

function formatDuration(value: number): string {
  const seconds = value > 0 ? Math.max(1, Math.round(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    remainder > 0 || (hours === 0 && minutes === 0) ? `${remainder}s` : null
  ]
    .filter(Boolean)
    .join(' ');
}

function formatExactMarks(value: number): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const absolute = Math.abs(normalized).toFixed(2);
  return normalized < 0 ? `−${absolute}` : absolute;
}

function marksReceipt(question: PyqQuestionSummary): string {
  if (!question.scoringCovered || question.scoreThirds == null || question.maxThirds == null) {
    return 'Not scorable';
  }
  return `${formatExactMarks(question.scoreThirds / 3)} / ${formatExactMarks(question.maxThirds / 3)}`;
}

function questionDurationSec(question: PyqQuestionSummary): number {
  if (
    question.timeSpentMs != null &&
    Number.isFinite(question.timeSpentMs) &&
    question.timeSpentMs > 0
  ) {
    return question.timeSpentMs / 1000;
  }
  return question.timeSpentSec;
}

function percentage(count: number, total: number): string {
  return total > 0 ? PERCENT_FORMATTER.format((count / total) * 100) : '—';
}

function pluralizedQuestions(count: number): string {
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

function InsightLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="text-[12.5px] leading-[1.7] text-text-muted sm:text-[13px]">
      <strong className="font-display font-bold text-text">{label}:</strong> {children}
    </p>
  );
}

function InsightQuestionTable({
  label,
  questions
}: {
  label: string;
  questions: readonly PyqQuestionSummary[];
}) {
  return (
    <details
      open
      className="group overflow-hidden rounded border border-border bg-bg-raised shadow-sm open:shadow-card"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-bg-overlay/45 focus-visible:bg-accent-faint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-4 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[13px] font-bold text-text sm:text-[14px]">
          {label} <span className="u-num font-normal text-text-muted">({questions.length})</span>
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-text-faint transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="u-mobile-cards-wrap u-table-wrap border-t border-border">
        <table className="u-data-table u-mobile-cards min-w-[560px] text-[12.5px]">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="px-3 py-2 sm:px-4">
                Question
              </th>
              <th scope="col" className="px-3 py-2 sm:px-4">
                Time spent
              </th>
              <th scope="col" className="px-3 py-2 sm:px-4">
                Marks (obtained / total)
              </th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.questionUid}>
                <td data-label="Question" data-mobile-primary className="px-3 py-2.5 sm:px-4">
                  <span className="u-num font-semibold text-text">
                    Q{String(question.questionNumber).padStart(2, '0')}
                  </span>
                </td>
                <td data-label="Time spent" className="u-num px-3 py-2.5 text-text-muted sm:px-4">
                  {formatDuration(questionDurationSec(question))}
                </td>
                <td
                  data-label="Marks (obtained / total)"
                  className="u-num px-3 py-2.5 text-text-muted sm:px-4"
                >
                  {marksReceipt(question)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface PyqImprovementInsightsProps {
  questions: readonly PyqQuestionSummary[];
}

export default function PyqImprovementInsights({ questions }: PyqImprovementInsightsProps) {
  const headingId = useId();
  const insights = useMemo(() => buildPyqImprovementInsights(questions), [questions]);
  const medianLabel =
    insights.medianPaceSec == null ? null : formatDuration(insights.medianPaceSec);
  const reviewFirst = insights.reviewFirstQuestion;

  return (
    <section
      aria-labelledby={headingId}
      className="relative overflow-hidden rounded-lg border border-accent/30 border-l-[5px] border-l-accent bg-bg-raised shadow-card"
    >
      <header className="flex flex-col gap-3 border-b border-border bg-accent-faint/30 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-bg-raised text-accent shadow-sm">
            <Lightbulb size={18} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="u-label text-accent">Next-attempt diagnosis</p>
            <h2
              id={headingId}
              className="mt-1 font-display text-[21px] font-bold leading-tight text-text sm:text-[24px]"
            >
              Improvement insights
            </h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
              A focused review plan from this session’s recorded timing and scoring evidence.
            </p>
          </div>
        </div>
        <span className="u-num inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg-raised px-2.5 py-1.5 text-[10px] text-text-muted shadow-sm">
          <TimerReset size={12} className="text-accent" aria-hidden="true" />
          {insights.timedQuestionCount} timed{' '}
          {insights.timedQuestionCount === 1 ? 'question' : 'questions'}
        </span>
      </header>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-2.5">
          <InsightLine label="Median pace">
            {medianLabel ? (
              <>
                <span className="u-num text-text">{medianLabel}</span> per timed question. Keep
                difficult questions near this mark or park them for a later pass unless confidence
                is high.
              </>
            ) : (
              'Unavailable because this session has no positive per-question timing evidence.'
            )}
          </InsightLine>
          <InsightLine label="Time sink">
            {insights.incorrectTimedCount === insights.incorrectCount &&
            insights.incorrectCount > 0 ? (
              <>
                <span className="u-num text-text">{formatDuration(insights.incorrectTimeSec)}</span>{' '}
                spent across {pluralizedQuestions(insights.incorrectCount)} answered incorrectly.
              </>
            ) : insights.incorrectTimedCount > 0 ? (
              <>
                <span className="u-num text-text">{formatDuration(insights.incorrectTimeSec)}</span>{' '}
                recorded across {insights.incorrectTimedCount} of{' '}
                {pluralizedQuestions(insights.incorrectCount)} answered incorrectly; the remaining
                timing evidence is unavailable.
              </>
            ) : insights.incorrectCount > 0 ? (
              `Timing is unavailable for ${pluralizedQuestions(insights.incorrectCount)} answered incorrectly.`
            ) : (
              'No recorded time was spent on graded incorrect answers.'
            )}
          </InsightLine>
          <InsightLine label="Accuracy">
            {insights.gradedAttemptCount > 0 ? (
              <>
                <span className="u-num text-text">
                  {percentage(insights.correctCount, insights.gradedAttemptCount)}%
                </span>{' '}
                correct ({pluralizedQuestions(insights.correctCount)}),{' '}
                <span className="u-num text-text">
                  {percentage(insights.incorrectCount, insights.gradedAttemptCount)}%
                </span>{' '}
                incorrect ({pluralizedQuestions(insights.incorrectCount)}) across{' '}
                <span className="u-num text-text">{insights.gradedAttemptCount}</span> graded
                {insights.gradedAttemptCount === 1 ? ' attempt' : ' attempts'}.
              </>
            ) : (
              'Unavailable because no response in this session has a graded correct/incorrect outcome.'
            )}
          </InsightLine>
          <InsightLine label="Fast incorrect attempts">
            {insights.fastIncorrectQuestions.length > 0 && medianLabel ? (
              <>
                {pluralizedQuestions(insights.fastIncorrectQuestions.length)} finished in under half
                the <span className="u-num text-text">{medianLabel}</span> session median. Slow down
                briefly on the first pass to reduce avoidable negatives.
              </>
            ) : medianLabel ? (
              'None. No incorrect answer finished in under half the session median.'
            ) : (
              'Unavailable without a session median.'
            )}
          </InsightLine>
        </div>

        {insights.fastIncorrectQuestions.length > 0 ? (
          <div className="mt-4">
            <InsightQuestionTable
              label="Fast incorrect question details"
              questions={insights.fastIncorrectQuestions}
            />
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-4">
          <InsightLine label="Slow low-return questions">
            {insights.slowLowReturnQuestions.length > 0 && medianLabel ? (
              <>
                {pluralizedQuestions(insights.slowLowReturnQuestions.length)} took longer than the{' '}
                <span className="u-num text-text">{medianLabel}</span> median and returned zero or
                negative verified marks.
              </>
            ) : medianLabel ? (
              'None. No question combined above-median time with non-positive verified marks.'
            ) : (
              'Unavailable without a session median.'
            )}
          </InsightLine>
        </div>

        {insights.slowLowReturnQuestions.length > 0 ? (
          <div className="mt-3">
            <InsightQuestionTable
              label="Slow low-return question details"
              questions={insights.slowLowReturnQuestions}
            />
          </div>
        ) : null}

        <div className="mt-4 rounded border border-border bg-bg-overlay/35 px-3 py-3 sm:px-4">
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            <strong className="font-display font-bold text-text">
              Review first (high effort, negative marks):
            </strong>{' '}
            {reviewFirst ? (
              <>
                <span className="u-num font-semibold text-accent">
                  Q{String(reviewFirst.questionNumber).padStart(2, '0')}
                </span>{' '}
                <span className="u-num">
                  ({formatDuration(questionDurationSec(reviewFirst))}, {marksReceipt(reviewFirst)}{' '}
                  marks)
                </span>
              </>
            ) : (
              'No attempt matches both conditions in this session.'
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
