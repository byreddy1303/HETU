import { useId, useMemo } from 'react';
import type { PyqQuestion } from '@/lib/pyq';
import { cn } from '@/lib/utils';
import PyqQuestionContent from './PyqQuestionContent';
import { DEFAULT_PRACTICE_CHOICES, splitPyqPracticeQuestion } from './pyqPracticeQuestion';

export default function PyqPracticeAnswer({
  question,
  choices,
  numeric,
  disabled,
  showStem = true,
  onChoices,
  onNumeric
}: {
  question: PyqQuestion;
  choices: string[];
  numeric: string;
  disabled: boolean;
  showStem?: boolean;
  onChoices: (choices: string[]) => void;
  onNumeric: (value: string) => void;
}) {
  const id = useId();
  const inputType = question.type === 'MSQ' || question.type === 'NAT' ? question.type : 'MCQ';
  const answerChoices = question.choices?.length ? question.choices : DEFAULT_PRACTICE_CHOICES;
  const content = useMemo(
    () =>
      inputType === 'NAT'
        ? { stem: question.html, options: null }
        : splitPyqPracticeQuestion(question.html, answerChoices),
    [question.html, answerChoices, inputType]
  );

  return (
    <div className="min-w-0">
      {showStem ? <PyqQuestionContent html={content.stem} /> : null}
      <div className={cn(showStem ? 'mt-5 border-t border-border pt-4' : 'pt-0')}>
        {inputType === 'NAT' ? (
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
        ) : (
          <fieldset disabled={disabled}>
            <legend className="u-label mb-2">
              Your answer {inputType === 'MSQ' ? '— select all that apply' : ''}
            </legend>
            <div
              className={cn(
                'grid gap-2',
                !content.options &&
                  (answerChoices.length > 4 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-4')
              )}
            >
              {answerChoices.map((choice, index) => {
                const selected = choices.includes(choice);
                const optionHtml = content.options?.[index];
                return (
                  <button
                    key={choice}
                    type="button"
                    aria-label={choice}
                    aria-pressed={selected}
                    aria-describedby={
                      optionHtml !== undefined ? `${id}-option-${index}` : undefined
                    }
                    onClick={() =>
                      onChoices(
                        inputType === 'MCQ'
                          ? [choice]
                          : selected
                            ? choices.filter((item) => item !== choice)
                            : [...choices, choice]
                      )
                    }
                    className={cn(
                      'min-h-12 rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
                      optionHtml !== undefined
                        ? 'flex min-w-0 items-start gap-3 p-3 text-left sm:p-4'
                        : 'font-mono text-[15px] font-semibold',
                      selected
                        ? 'border-accent bg-accent-faint text-text shadow-sm'
                        : 'border-border bg-bg-raised text-text-muted enabled:hover:border-accent/40 enabled:hover:text-text'
                    )}
                  >
                    <span
                      className={cn(
                        'font-mono text-[15px] font-semibold',
                        optionHtml !== undefined &&
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded border',
                        selected && 'border-accent bg-accent text-accent-contrast'
                      )}
                    >
                      {choice}
                    </span>
                    {optionHtml !== undefined ? (
                      <div id={`${id}-option-${index}`} className="min-w-0 flex-1">
                        <PyqQuestionContent html={optionHtml} />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}
