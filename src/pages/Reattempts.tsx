// Question-first spaced re-attempt queue. Each due item launches a dedicated
// test session instead of expanding inside the queue.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock3,
  PencilLine,
  Play,
  RotateCcw,
  ScanSearch,
  ZoomIn
} from 'lucide-react';
import type { QuestionRow, ReattemptRow, ReattemptStage } from '@/types';
import { db } from '@/lib/db';
import { buildReattemptQueue, recordReattemptResult } from '@/lib/reattempt';
import { writeLocal } from '@/lib/sync';
import { OUTCOME_BY_CODE } from '@/lib/constants';
import { cn, formatDate, plural, secondsToClock, todayISO } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { useAuth } from '@/hooks/useAuth';
import { useTimer } from '@/hooks/useTimer';
import { useUiStore } from '@/stores/ui';
import PageHeader from '@/components/layout/PageHeader';
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

interface AttemptState {
  rowId: string;
  startedAt: number | null;
  elapsed: number | null;
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

function ReattemptSession({
  row,
  question,
  today,
  position,
  total,
  attempt,
  onExit,
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
  onExit: () => void;
  onStart: () => void;
  onFinish: (seconds: number) => void;
  onRestart: () => void;
  onResult: (result: 'clean' | 'fail', elapsed: number) => Promise<void>;
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
  const [imageOpen, setImageOpen] = useState(false);
  const currentAttempt = attempt?.rowId === row.id ? attempt : null;
  const targetSec = question?.target_time_sec ?? 120;
  const hasText = !!question?.question_text?.trim();
  const hasImage = !!question?.image_url;
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
      await onResult(result, currentAttempt.elapsed);
    } finally {
      setReporting(false);
    }
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
            <p className="whitespace-pre-wrap text-[15.5px] leading-[1.75] text-text">
              {question?.question_text}
            </p>
          ) : null}

          {hasImage ? (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="reattempt-session-photo group relative overflow-hidden rounded-xl border border-border bg-white text-left shadow-card focus:outline-none focus:ring-4 focus:ring-accent-faint"
              aria-label="Open question image full screen"
            >
              <img
                src={question?.image_url ?? ''}
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
        <RunningTimer
          startedAt={currentAttempt.startedAt}
          targetSec={targetSec}
          onFinish={onFinish}
        />
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
            <Button variant="ghost" size="sm" onClick={onRestart}>
              <RotateCcw size={14} strokeWidth={1.8} className="mr-1.5" />
              Try again
            </Button>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <AnswerReveal
              answer={question?.answer_text}
              onAdd={question ? () => setEditingAnswer(true) : undefined}
            />
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
            <p className="text-[13px] font-medium text-text">How did it go?</p>
            <p className="mt-1 text-[12px] text-text-muted">
              Clean means the final answer and method were correct without help. Time is recorded
              separately.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="danger"
                onClick={() => void report('fail')}
                disabled={reporting}
              >
                Failed — reset to D3
              </Button>
              <Button onClick={() => void report('clean')} disabled={reporting}>
                Clean — answer + method
              </Button>
            </div>
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
            Start timer
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
        src={question?.image_url ?? null}
        caption={question?.source_ref ?? question?.pattern_name ?? 'Question to re-attempt'}
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      />
    </div>
  );
}

export default function Reattempts() {
  const { userId } = useAuth();
  const pushToast = useUiStore((state) => state.pushToast);
  const navigate = useNavigate();
  const { reattemptId } = useParams<{ reattemptId: string }>();
  const [searchParams] = useSearchParams();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const today = todayISO();

  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId]
  );

  const questionIds = useMemo(
    () => [...new Set((reattempts ?? []).map((row) => row.question_id))],
    [reattempts]
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

  const { due, upcoming, mastered } = useMemo(
    () => buildReattemptQueue(reattempts ?? [], today),
    [reattempts, today]
  );
  const upcomingGroups = useMemo(() => {
    const groups = new Map<string, { count: number; subjects: Set<string> }>();
    for (const row of upcoming) {
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
  }, [upcoming, qById]);
  const activeRow = reattemptId ? due.find((row) => row.id === reattemptId) : undefined;

  useEffect(() => {
    if (reattemptId || searchParams.get('open') !== 'first' || due.length === 0) return;
    navigate(`/reattempts/${encodeURIComponent(due[0].id)}`, { replace: true });
  }, [due, navigate, reattemptId, searchParams]);

  useEffect(() => {
    if (!activeRow) return;
    setAttempt((current) => {
      if (current?.rowId === activeRow.id) return current;
      if (current && current.rowId !== activeRow.id) return current;
      return { rowId: activeRow.id, startedAt: Date.now(), elapsed: null };
    });
  }, [activeRow]);

  function openSession(rowId: string) {
    if (attempt && attempt.rowId !== rowId) {
      pushToast(
        attempt.startedAt
          ? 'Finish the running attempt before opening another question.'
          : 'Record the finished attempt before opening another question.',
        'neutral'
      );
      return;
    }
    navigate(`/reattempts/${encodeURIComponent(rowId)}`);
  }

  async function onResult(row: ReattemptRow, result: 'clean' | 'fail', elapsed: number) {
    const updated = await recordReattemptResult(row, result, today, elapsed);
    const remaining = due.filter((candidate) => candidate.id !== row.id).length;
    setAttempt(null);
    navigate('/reattempts', { replace: true });
    if (updated.stage === 'MASTERED') {
      pushToast(
        remaining > 0 ? `Mastered — ${remaining} due remaining.` : 'Mastered — queue cleared.',
        'success'
      );
    } else if (result === 'clean') {
      pushToast(
        `Clean. Next rung ${formatDate(updated.scheduled_date, 'dd MMM')}.${remaining > 0 ? ` ${remaining} due remaining.` : ''}`,
        'success'
      );
    } else {
      pushToast(
        `Reset to D3 — back ${formatDate(updated.scheduled_date, 'dd MMM')}.${remaining > 0 ? ` ${remaining} due remaining.` : ''}`,
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

  if (reattemptId && reattempts !== undefined && !activeRow) {
    return (
      <Empty
        title="Re-attempt unavailable"
        hint="This question is no longer due, or the session link is out of date."
        action={<Button onClick={() => navigate('/reattempts')}>Back to re-attempts</Button>}
      />
    );
  }

  if (activeRow) {
    return (
      <ReattemptSession
        row={activeRow}
        question={qById.get(activeRow.question_id)}
        today={today}
        position={Math.max(1, due.findIndex((row) => row.id === activeRow.id) + 1)}
        total={due.length}
        attempt={attempt}
        onExit={() => navigate('/reattempts')}
        onStart={() =>
          setAttempt({ rowId: activeRow.id, startedAt: Date.now(), elapsed: null })
        }
        onFinish={(seconds) =>
          setAttempt({ rowId: activeRow.id, startedAt: null, elapsed: seconds })
        }
        onRestart={() =>
          setAttempt({ rowId: activeRow.id, startedAt: Date.now(), elapsed: null })
        }
        onResult={(result, elapsed) => onResult(activeRow, result, elapsed)}
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
          reattempts === undefined
            ? 'Loading…'
            : `${due.length} due · ${upcoming.length} upcoming · ${mastered} mastered`
        }
      />

      {due.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Questions due now">
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <p className="u-label text-accent">Due now</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                Choose a question to launch its own timed test session. Photos open full-screen and
                support pinch or button zoom.
              </p>
            </div>
            <span className="u-num text-[12px] text-text-faint">{due.length}</span>
          </div>
          {due.map((row) => (
            <QueueCard
              key={row.id}
              row={row}
              question={qById.get(row.question_id)}
              today={today}
              attempt={attempt}
              onOpen={() => openSession(row.id)}
            />
          ))}
        </section>
      ) : (
        <Empty
          title="Nothing due"
          hint="The queue fills as you tag RBS, RBG and W-* questions. First rung lands 3 days after the mistake."
        />
      )}

      {upcoming.length > 0 ? (
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
