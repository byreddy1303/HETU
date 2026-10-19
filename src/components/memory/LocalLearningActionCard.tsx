import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { prepareLocalLearningActivity } from '@/lib/local-learning-engine';
import { getMemoryRepairData, memoryString, type StudyMemoryEntry } from '@/lib/study-memory';
import { memoryRepairHref } from '@/lib/study-memory-practice';
import { dateLabel } from '@/lib/local-learning-display';

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
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function prepare() {
    if (preparing) return;
    setPreparing(true);
    setStartError('');
    try {
      const current = await prepareLocalLearningActivity(entry.id);
      if (alive.current) navigate(memoryRepairHref(current));
    } catch (cause) {
      if (alive.current) setStartError(errorMessage(cause));
    } finally {
      if (alive.current) setPreparing(false);
    }
  }
  const repair = getMemoryRepairData(entry);
  const waiting = repair.due_date && repair.due_date > today;
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

  return (
    <li className="grid min-w-0 gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-semibold">
            {memoryString(entry.data, 'display_title') || entry.title}
          </h3>
          <span className="text-xs text-text-muted">
            {entry.state === 'completed'
              ? 'Activity completed'
              : activeSessionId
                ? 'Practice started'
                : waiting
                  ? `Review on ${dateLabel(repair.due_date, timeZone)}`
                  : 'Ready to practise'}
          </span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed">{repair.reason}</p>
        {repair.success_criteria && (
          <p className="max-w-prose text-sm text-text-muted">
            <span className="font-medium">What this checks: </span>
            {repair.success_criteria}
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <span>{repair.duration_min} minutes</span>
          {entry.subject && (
            <span>
              {entry.subject}
              {entry.topic ? `: ${entry.topic}` : ''}
            </span>
          )}
          {repair.source_attempt_ids.length > 0 && (
            <span>
              Based on {repair.source_attempt_ids.length} saved{' '}
              {repair.source_attempt_ids.length === 1 ? 'attempt' : 'attempts'}
            </span>
          )}
          {entry.evidence_kind === 'model' && (
            <span>Local model suggestion · needs a practice check</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {sourceHref && (
            <Link className="text-accent underline" to={sourceHref}>
              See original evidence
            </Link>
          )}
          <Link className="text-accent underline" to={`/memory/${entry.id}`}>
            Activity details
          </Link>
          {conceptReviewId && (
            <Link
              className="text-accent underline"
              to={`/concept-review/${encodeURIComponent(conceptReviewId)}`}
            >
              Recall check
            </Link>
          )}
          {resultId && (
            <Link className="text-accent underline" to={`/memory/${encodeURIComponent(resultId)}`}>
              Practice result
            </Link>
          )}
          {nextId && (
            <Link className="text-accent underline" to={`/memory/${encodeURIComponent(nextId)}`}>
              Next review
            </Link>
          )}
        </div>
      </div>
      <div className="self-start">
        {startError && (
          <p role="alert" className="mb-2 max-w-xs text-sm text-danger">
            {startError}
          </p>
        )}
        {entry.state !== 'completed' && (
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            to={
              activeSessionId
                ? `/pyq?resumeSession=${encodeURIComponent(activeSessionId)}`
                : memoryRepairHref(entry)
            }
            aria-disabled={preparing}
            onClick={(event) => {
              if (activeSessionId || event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              void prepare();
            }}
          >
            {preparing
              ? 'Checking questions…'
              : activeSessionId
                ? 'Resume practice'
                : repair.question_uids.length
                  ? 'Start practice'
                  : 'Open activity'}
          </Link>
        )}
      </div>
    </li>
  );
}
