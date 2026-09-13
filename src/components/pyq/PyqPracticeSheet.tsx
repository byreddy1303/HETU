import { useState, useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PyqQuestion } from '@/lib/pyq';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import { getPyqPracticeDraft } from '@/lib/pyq-session';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import PyqQuestionContent from './PyqQuestionContent';
import PyqPracticeAnswer from './PyqPracticeAnswer';
import { cn } from '@/lib/utils';

const QUESTIONS_PER_PAGE = 10;

function PageSelector({
  currentPage,
  totalPages,
  onPageChange,
  ariaLabel
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        disabled={currentPage === 0}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="Previous page"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded border text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          currentPage === 0
            ? 'border-border text-text-faint cursor-not-allowed opacity-50'
            : 'border-border text-text-muted hover:border-accent hover:text-accent'
        )}
      >
        <ChevronLeft size={15} />
      </button>
      {Array.from({ length: totalPages }, (_, pageIndex) => (
        <button
          key={pageIndex}
          type="button"
          onClick={() => onPageChange(pageIndex)}
          aria-label={`Page ${pageIndex + 1}`}
          aria-current={currentPage === pageIndex ? 'page' : undefined}
          className={cn(
            'flex h-9 min-w-9 items-center justify-center rounded border px-2 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            currentPage === pageIndex
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-border text-text-muted hover:border-accent hover:text-accent'
          )}
        >
          {pageIndex + 1}
        </button>
      ))}
      <button
        type="button"
        disabled={currentPage === totalPages - 1}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="Next page"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded border text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          currentPage === totalPages - 1
            ? 'border-border text-text-faint cursor-not-allowed opacity-50'
            : 'border-border text-text-muted hover:border-accent hover:text-accent'
        )}
      >
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}

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
  const totalPages = Math.max(1, Math.ceil(questions.length / QUESTIONS_PER_PAGE));
  const activeQuestionPage = Math.floor(index / QUESTIONS_PER_PAGE);

  const [currentPage, setCurrentPage] = useState(activeQuestionPage);

  // Auto-follow: when the active question changes (e.g. via the navigator),
  // switch to the page containing that question.
  useEffect(() => {
    setCurrentPage(activeQuestionPage);
  }, [activeQuestionPage]);

  const pageStart = currentPage * QUESTIONS_PER_PAGE;
  const pageEnd = Math.min(pageStart + QUESTIONS_PER_PAGE, questions.length);
  const pageQuestions = questions.slice(pageStart, pageEnd);

  const latest = new Map(attempts.map((attempt) => [attempt.question_uid, attempt]));

  function handlePageChange(page: number) {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

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
        {totalPages > 1 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-center text-[11px] text-text-faint">
              Page {currentPage + 1} of {totalPages} · Showing questions {pageStart + 1}–{pageEnd}
            </p>
            <PageSelector
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              ariaLabel="Question pages (top)"
            />
          </div>
        )}
      </nav>
      {pageQuestions.map((question, pageLocalIndex) => {
        const questionIndex = pageStart + pageLocalIndex;
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
      {totalPages > 1 && (
        <div className="rounded-lg border border-border bg-bg-raised p-3 sm:p-4">
          <p className="mb-2 text-center text-[11px] text-text-faint">
            Page {currentPage + 1} of {totalPages} · Showing questions {pageStart + 1}–{pageEnd}
          </p>
          <PageSelector
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            ariaLabel="Question pages (bottom)"
          />
        </div>
      )}
    </div>
  );
}
