import { useState } from 'react';
import { CalendarRange, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import MathText from '@/components/shared/MathText';
import { hydrateTables } from '@/lib/db';
import { BACKLOG_PER_DAY, needsTriage } from '@/lib/recovery-housekeeping';
import { rebalanceBacklogApi, triageItemApi, type TriageDecision } from '@/lib/recovery-api';
import type { LearningItemRow, QuestionRow } from '@/types';

const DECISIONS: { value: TriageDecision; label: string }[] = [
  { value: 'missed', label: 'Missed it' },
  { value: 'correct', label: 'Got it right' },
  { value: 'unsure', label: 'Not sure' }
];

/** Imported test questions with no result: ask once which ones were actually missed. */
export function TriageImportedQuestions({
  userId,
  items,
  questionById
}: {
  userId: string;
  items: LearningItemRow[];
  questionById: Map<string, QuestionRow>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [answered, setAnswered] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const questionFor = (item: LearningItemRow) =>
    item.source_question_id ? questionById.get(item.source_question_id) : undefined;
  // Grouped by test and question number, so it reads alongside the test's result sheet.
  const pending = items
    .filter((item) => needsTriage(item, questionFor(item)))
    .sort((left, right) =>
      (questionFor(left)?.source_ref ?? '').localeCompare(
        questionFor(right)?.source_ref ?? '',
        undefined,
        { numeric: true }
      )
    );
  if (pending.length === 0) return null;
  const visible = showAll ? pending : pending.slice(0, 5);

  async function decide(item: LearningItemRow, decision: TriageDecision) {
    setBusyId(item.id);
    setError('');
    try {
      await triageItemApi(userId, item, decision);
      setAnswered((count) => count + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'That answer could not be saved. Try again.'
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="border-warn/30">
      <CardBody className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ListChecks size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="text-[15px] font-semibold text-text">
              {pending.length} imported test{' '}
              {pending.length === 1 ? 'question has' : 'questions have'} no result yet
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
              Only the ones you missed belong in Re-attempts. Questions you got right leave the
              queue; anything you are unsure about stays. You answer this once per question.
              {answered > 0 ? ` ${answered} sorted so far.` : ''}
            </p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {visible.map((item) => {
            const question = item.source_question_id
              ? questionById.get(item.source_question_id)
              : undefined;
            const text = (question?.question_text ?? '').trim();
            return (
              <li key={item.id} className="rounded-lg border border-border p-3">
                <p className="text-[11.5px] font-medium text-text-muted">
                  {item.subject}
                  {item.topic ? ` · ${item.topic}` : ''}
                  {question?.source_ref ? ` · ${question.source_ref}` : ''}
                </p>
                <div className="mt-1 line-clamp-3 text-[13px] text-text">
                  <MathText>
                    {text.length > 360
                      ? `${text.slice(0, 360)}…`
                      : text || 'Question text unavailable'}
                  </MathText>
                </div>
                <div
                  className="mt-2 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Your test result"
                >
                  {DECISIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={option.value === 'missed' ? 'primary' : 'secondary'}
                      disabled={busyId !== null}
                      onClick={() => void decide(item, option.value)}
                    >
                      {busyId === item.id ? 'Saving…' : option.label}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        {pending.length > visible.length ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll(true)}>
            Show all {pending.length}
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** When too much is overdue, offer to spread it over the coming days, most urgent first. */
export function SpreadBacklog({ userId, overdueCount }: { userId: string; overdueCount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  if (done) {
    return (
      <p className="rounded border border-success/25 bg-success-faint px-3 py-2 text-[12.5px] text-text">
        {done}
      </p>
    );
  }
  if (overdueCount <= BACKLOG_PER_DAY + 2) return null;
  const days = Math.ceil(overdueCount / BACKLOG_PER_DAY);

  async function spread() {
    setBusy(true);
    setError('');
    try {
      const result = await rebalanceBacklogApi(userId, BACKLOG_PER_DAY);
      await hydrateTables(userId, ['learning_items', 'reattempts', 'learning_events']);
      setDone(
        `${result.due_today} re-attempts stay due today; ${result.moved.length} are spread over the next ${Math.max(1, result.days - 1)} days.`
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The backlog could not be spread. Try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CalendarRange size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="text-[15px] font-semibold text-text">
              {overdueCount} re-attempts are overdue
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
              Spread them over the next {days} days, {BACKLOG_PER_DAY} a day, most urgent first.
              Nothing is skipped or marked done; each question still has to be recalled.
            </p>
            {error ? (
              <p role="alert" className="mt-1 text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <Button variant="primary" onClick={() => void spread()} disabled={busy}>
          {busy ? 'Spreading…' : 'Spread the backlog'}
        </Button>
      </CardBody>
    </Card>
  );
}
