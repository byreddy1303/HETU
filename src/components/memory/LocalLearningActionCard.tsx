import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { prepareLocalLearningActivity } from '@/lib/local-learning-engine';
import {
  getMemoryRepairData,
  memoryString,
  type MemoryActivity,
  type StudyMemoryEntry
} from '@/lib/study-memory';
import { memoryRepairHref } from '@/lib/study-memory-practice';
import { dateLabel } from '@/lib/local-learning-display';

const activityLabels: Record<MemoryActivity, string> = {
  'concept-repair': 'Concept practice',
  recall: 'Recall check',
  recognition: 'Method recognition',
  execution: 'Step-by-step practice',
  retry: 'Retry original questions',
  transfer: 'Fresh application',
  speed: 'Timed practice',
  mixed: 'Mixed practice'
};
const secondaryLink =
  'text-accent underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The activity could not be prepared.';
}

export default function LocalLearningActionCard({
  entry,
  today,
  timeZone
}: {
  entry: StudyMemoryEntry;
  today: string;
  timeZone: string;
}) {
  const navigate = useNavigate();
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState('');
  const alive = useRef(true);
  const starting = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function prepare() {
    if (starting.current) return;
    starting.current = true;
    setPreparing(true);
    setStartError('');
    try {
      const current = await prepareLocalLearningActivity(entry.id);
      if (alive.current) navigate(memoryRepairHref(current));
    } catch (cause) {
      if (alive.current) setStartError(errorMessage(cause));
    } finally {
      starting.current = false;
      if (alive.current) setPreparing(false);
    }
  }
  const repair = getMemoryRepairData(entry);
  const waiting = Boolean(repair.due_date && repair.due_date > today);
  const completed = entry.state === 'completed';
  const sessionId = entry.session_id || memoryString(entry.data, 'source_session_id');
  const attemptId = entry.attempt_id || repair.source_attempt_ids[0];
  const sourceEntryId = repair.source_entry_ids[0];
  const sourceHref = sessionId
    ? `/session/${encodeURIComponent(sessionId)}/review${attemptId ? `?attempt=${encodeURIComponent(attemptId)}` : ''}`
    : sourceEntryId
      ? `/memory/${encodeURIComponent(sourceEntryId)}`
      : null;
  const resultId = memoryString(entry.data, 'result_entry_id');
  const nextId = memoryString(entry.data, 'next_review_entry_id');
  const activeSessionId = memoryString(entry.data, 'active_session_id');
  const conceptReviewId = memoryString(entry.data, 'concept_review_id');
  const count = repair.question_uids.length || repair.requested_count;
  const activity = activityLabels[repair.activity];
  const subject = [entry.subject, entry.topic].filter(Boolean).join(': ');
  const dueLabel = completed
    ? 'Completed'
    : activeSessionId
      ? 'In progress'
      : waiting
        ? `Scheduled ${dateLabel(repair.due_date, timeZone)}`
        : repair.due_date && repair.due_date < today
          ? `Due ${dateLabel(repair.due_date, timeZone)}`
          : 'Ready today';

  return (
    <li className="min-w-0 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-text">{activity}</h3>
          {subject && <p className="mt-1 break-words text-sm text-text-muted">{subject}</p>}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            <div>
              <dt className="sr-only">Duration</dt>
              <dd>{repair.duration_min} min</dd>
            </div>
            <div>
              <dt className="sr-only">Questions</dt>
              <dd>
                {repair.question_uids.length ? '' : 'Up to '}
                {count} {count === 1 ? 'question' : 'questions'}
              </dd>
            </div>
            <div>
              <dt className="sr-only">Schedule</dt>
              <dd>{dueLabel}</dd>
            </div>
          </dl>
        </div>
        <div className="w-full shrink-0 sm:w-auto">
          {completed || activeSessionId ? (
            <Link
              className="inline-flex min-h-10 w-full items-center justify-center rounded border border-border px-4 py-2 text-sm font-semibold text-text hover:border-border-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
              to={
                activeSessionId && !completed
                  ? `/pyq?resumeSession=${encodeURIComponent(activeSessionId)}`
                  : `/memory/${encodeURIComponent(resultId || entry.id)}`
              }
            >
              {completed ? 'View result' : 'Resume practice'}
            </Link>
          ) : (
            <Button
              className="w-full sm:w-auto"
              variant="primary"
              disabled={preparing || waiting}
              onClick={() => void prepare()}
            >
              {preparing
                ? 'Checking questions…'
                : waiting
                  ? 'Scheduled'
                  : repair.question_uids.length
                    ? 'Start practice'
                    : 'Prepare practice'}
            </Button>
          )}
        </div>
      </div>
      {startError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {startError}
        </p>
      )}
      <details className="mt-3 text-xs text-text-muted">
        <summary className="w-fit cursor-pointer rounded py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Details and source
          <span className="sr-only">
            {' '}
            for {activity}
            {subject ? `: ${subject}` : ''}
          </span>
        </summary>
        <div className="mt-2 max-w-prose space-y-3 border-l-2 border-border pl-3 leading-relaxed">
          <p>
            {repair.source_attempt_ids.length
              ? `Based on ${repair.source_attempt_ids.length} saved ${repair.source_attempt_ids.length === 1 ? 'attempt' : 'attempts'}. `
              : ''}
            {entry.evidence_kind === 'model'
              ? 'Prepared from your study records by the local model; the outcome is still to be checked.'
              : 'Linked to your saved study records.'}
          </p>
          {!completed && (
            <p>
              Earlier answers and explanations stay hidden here. Source records may reveal them.
            </p>
          )}
          {completed && (
            <>
              {repair.reason && <p>{repair.reason}</p>}
              {repair.success_criteria && <p>Practice goal: {repair.success_criteria}</p>}
            </>
          )}
          <nav aria-label={`Sources for ${activity}`} className="flex flex-wrap gap-x-4 gap-y-2">
            <Link className={secondaryLink} to={`/memory/${encodeURIComponent(entry.id)}`}>
              Activity record
            </Link>
            {sourceHref && (
              <Link className={secondaryLink} to={sourceHref}>
                Original evidence
              </Link>
            )}
            {conceptReviewId && (
              <Link
                className={secondaryLink}
                to={`/concept-review/${encodeURIComponent(conceptReviewId)}`}
              >
                Recall check
              </Link>
            )}
            {nextId && (
              <Link className={secondaryLink} to={`/memory/${encodeURIComponent(nextId)}`}>
                Next review
              </Link>
            )}
          </nav>
        </div>
      </details>
    </li>
  );
}
