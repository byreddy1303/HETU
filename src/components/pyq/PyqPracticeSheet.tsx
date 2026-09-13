import type { ReactNode } from 'react';
import type { PyqQuestion } from '@/lib/pyq';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import { getPyqPracticeDraft } from '@/lib/pyq-session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import PyqQuestionContent from './PyqQuestionContent';
import PyqPracticeAnswer from './PyqPracticeAnswer';
import { cn } from '@/lib/utils';

export default function PyqPracticeSheet({
  questions,
  index,
  session,
  attempts,
  disabled,
  onNavigate,
  onChoices,
  activeQuestion
}: {
  questions: PyqQuestion[];
  index: number;
  session: PyqSessionRow;
  attempts: PyqAttemptRow[];
  disabled: boolean;
  onNavigate: (index: number) => void;
  onChoices: (index: number, choices: string[]) => void;
  activeQuestion: ReactNode;
}) {
  const latest = new Map(attempts.map((attempt) => [attempt.question_uid, attempt]));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav
        aria-label="Practice question navigator"
        className="rounded-lg border border-border bg-bg-raised p-3 sm:p-4"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-text">Your question sheet</p>
          <span className="text-[12px] text-text-muted">
            {latest.size} of {questions.length} committed
          </span>
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
          Select an option on any question, then choose your confidence. Each question keeps its own
          draft and active time.
        </p>
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
          {questions.map((question, questionIndex) => {
            const attempt = latest.get(question.id);
            const status = attempt
              ? attempt.mark_decision === 'SKIP'
                ? 'Skipped'
                : 'Committed'
              : getPyqPracticeDraft(session, question.id)
                ? 'Draft'
                : 'Not answered';
            return (
              <button
                key={question.id}
                type="button"
                aria-label={`Go to question ${questionIndex + 1}: ${status}`}
                aria-current={index === questionIndex ? 'step' : undefined}
                disabled={disabled}
                onClick={() => onNavigate(questionIndex)}
                className={cn(
                  'min-h-10 min-w-10 rounded border px-2 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50',
                  index === questionIndex
                    ? 'border-accent bg-accent text-accent-contrast'
                    : attempt
                      ? 'border-success/35 bg-success-faint text-success'
                      : status === 'Draft'
                        ? 'border-accent/35 bg-accent-faint text-accent'
                        : 'border-border text-text-muted hover:border-accent'
                )}
              >
                {questionIndex + 1}
              </button>
            );
          })}
        </div>
      </nav>
      {questions.map((question, questionIndex) => {
        const active = index === questionIndex;
        const attempt = latest.get(question.id);
        const committed = attempt && attempt.mark_decision !== 'SKIP';
        const savedAnswer = committed
          ? attempt.selected_answer
          : getPyqPracticeDraft(session, question.id)?.selected_answer;
        const savedChoices = Array.isArray(savedAnswer)
          ? savedAnswer.map(String)
          : typeof savedAnswer === 'string'
            ? [savedAnswer]
            : [];
        return (
          <article
            key={question.id}
            id={`practice-question-${questionIndex}`}
            aria-label={`Question ${questionIndex + 1}`}
            tabIndex={-1}
            className={cn(
              'min-w-0 scroll-mt-6 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active && 'ring-2 ring-accent/40'
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <h2 className="text-[13px] font-semibold text-text">Question {questionIndex + 1}</h2>
              <Badge tone={active ? 'accent' : 'neutral'}>
                {active
                  ? 'Working here'
                  : committed
                    ? 'Committed'
                    : attempt
                      ? 'Skipped'
                      : getPyqPracticeDraft(session, question.id)
                        ? 'Draft saved'
                        : 'Not answered'}
              </Badge>
            </div>
            {active ? (
              activeQuestion
            ) : (
              <Card className="overflow-hidden">
                <CardHeader
                  title={`${question.paperLabel} / Q ${question.number}`}
                  aside={
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{question.type}</Badge>
                      {question.marks ? (
                        <Badge>
                          {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
                        </Badge>
                      ) : null}
                    </div>
                  }
                />
                <CardBody className="p-5 sm:p-7">
                  {question.type === 'NAT' ? (
                    <PyqQuestionContent html={question.html} />
                  ) : (
                    <PyqPracticeAnswer
                      question={question}
                      choices={savedChoices}
                      numeric=""
                      disabled={disabled || !!committed}
                      onChoices={(nextChoices) => onChoices(questionIndex, nextChoices)}
                      onNumeric={() => {}}
                    />
                  )}
                  <div className="mt-5 border-t border-border pt-4">
                    <Button disabled={disabled} onClick={() => onNavigate(questionIndex)}>
                      {committed ? 'Review' : 'Work on'} question {questionIndex + 1}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}
          </article>
        );
      })}
    </div>
  );
}
