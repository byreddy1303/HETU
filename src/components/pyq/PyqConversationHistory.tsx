import { useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import type { PyqAttemptRow, PyqSelectedAnswer } from '@/types';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';

function answerLabel(answer: PyqSelectedAnswer): string {
  if (answer == null) return 'Skipped';
  if (Array.isArray(answer)) return answer.join(', ');
  return String(answer);
}

function resultLabel(attempt: PyqAttemptRow): string {
  if (attempt.scoring_status === 'unscorable') return 'Score unavailable';
  if (attempt.scoring_status === 'bonus') return 'Marks awarded to all';
  if (attempt.mark_decision === 'SKIP') return 'Skipped';
  if (attempt.mark_correct === true) return 'Correct';
  if (attempt.mark_correct === false) return 'Incorrect';
  return 'Outcome unavailable';
}

/** The app view for answers committed through HETU's ChatGPT connection. */
export default function PyqConversationHistory({ attempts }: { attempts: readonly PyqAttemptRow[] }) {
  const conversationAttempts = useMemo(
    () =>
      attempts
        .filter((attempt) => attempt.capture_origin === 'chatgpt')
        .sort((left, right) => right.attempted_at.localeCompare(left.attempted_at)),
    [attempts]
  );
  if (conversationAttempts.length === 0) return null;

  return (
    <section aria-labelledby="chatgpt-pyq-history" className="rounded-xl border border-border bg-bg-raised p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-accent-faint p-2 text-accent" aria-hidden="true">
          <MessageCircle size={19} />
        </span>
        <div>
          <h2 id="chatgpt-pyq-history" className="font-display text-[17px] font-semibold text-text">
            Practice recorded with ChatGPT
          </h2>
          <p className="mt-1 text-[12px] text-text-muted">
            {conversationAttempts.length} answer{conversationAttempts.length === 1 ? '' : 's'} scored from the saved PYQ bank. Open a receipt to check the question, answer, and source.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {conversationAttempts.slice(0, 20).map((attempt) => {
          const snapshot = attempt.question_snapshot;
          return (
            <details key={attempt.id} className="group rounded-lg border border-border bg-bg-overlay/20">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-3 text-[12px] marker:hidden sm:px-4">
                <span className="font-medium text-text">
                  {snapshot?.subject ?? attempt.subject} · {snapshot?.topic ?? attempt.question_uid}
                </span>
                <span className="text-text-muted">
                  {resultLabel(attempt)} · {new Date(attempt.attempted_at).toLocaleDateString()}
                </span>
              </summary>
              <div className="border-t border-border px-3 py-4 text-[12px] sm:px-4">
                {snapshot ? <PyqQuestionContent html={snapshot.html} /> : <p>Question snapshot unavailable.</p>}
                <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-text-faint">Your answer</dt><dd className="font-medium text-text">{answerLabel(attempt.selected_answer)}</dd></div>
                  <div><dt className="text-text-faint">Recorded result</dt><dd className="font-medium text-text">{resultLabel(attempt)}</dd></div>
                  <div><dt className="text-text-faint">Official key</dt><dd className="font-medium text-text">{attempt.answer_status === 'available' ? answerLabel(attempt.correct_answer) : 'Unavailable or disputed'}</dd></div>
                  <div><dt className="text-text-faint">Time</dt><dd className="font-medium text-text">{attempt.duration_source === 'unknown' ? 'Not measured' : attempt.time_spent_ms == null ? 'Not recorded' : `${Math.ceil(attempt.time_spent_ms / 1000)} seconds (${attempt.duration_source ?? 'measured'})`}</dd></div>
                </dl>
                {snapshot?.source_url ? (
                  <a className="mt-4 inline-block text-accent underline-offset-2 hover:underline" href={snapshot.source_url} target="_blank" rel="noreferrer">
                    View question source
                  </a>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
      {conversationAttempts.length > 20 ? <p className="mt-3 text-[11px] text-text-faint">Showing the 20 most recent receipts.</p> : null}
    </section>
  );
}
