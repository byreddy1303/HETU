// Session review (F2.4): outcome summary, patterns hit, time distribution,
// and a single-sentence insight. Skipping the insight is allowed and silent;
// finishing without one gets a soft nudge, never a block.
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { Pencil } from 'lucide-react';
import type { Outcome, QuestionRow } from '@/types';
import { db } from '@/lib/db';
import { writeLocal, deleteLocal } from '@/lib/sync';
import { OUTCOMES, OUTCOME_BY_CODE } from '@/lib/constants';
import { cn, formatDate, secondsToClock } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import LoadingScreen from '@/components/shared/LoadingScreen';
import AnswerReveal from '@/components/shared/AnswerReveal';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Kbd } from '@/components/ui/Kbd';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { Dialog } from '@/components/ui/Dialog';
import QuestionEditor, { DeleteBar } from '@/components/shared/QuestionEditor';
import SessionEditor from '@/components/shared/SessionEditor';
import { applyDraftToRow, draftFromRow, type EditorDraft } from '@/components/shared/questionDraft';

const TONE_BG: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'bg-success',
  slow: 'bg-warn',
  guess: 'bg-guess',
  wrong: 'bg-danger'
};

const TONE_TEXT: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'text-success',
  slow: 'text-warn',
  guess: 'text-guess',
  wrong: 'text-danger'
};

export default function SessionReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const questions = useLiveQuery(
    () => db.questions.where('session_id').equals(id).sortBy('created_at'),
    [id]
  );
  const pyqAttempts = useLiveQuery(
    () => db.pyq_attempts.where('pyq_session_id').equals(id).sortBy('attempted_at'),
    [id]
  );

  const [draft, setDraft] = useState<string>();
  const [nudged, setNudged] = useState(false);
  const [editRow, setEditRow] = useState<QuestionRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditorDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editSessionOpen, setEditSessionOpen] = useState(false);

  function openEdit(row: QuestionRow) {
    setEditRow(row);
    setEditDraft(draftFromRow(row));
  }

  async function saveEdit() {
    if (!editRow || !editDraft) return;
    setSaving(true);
    try {
      const merged = applyDraftToRow(editRow, editDraft);
      await writeLocal('questions', merged);
      setEditRow(null);
      setEditDraft(null);
    } finally {
      setSaving(false);
    }
  }

  async function removeRow() {
    if (!editRow) return;
    setDeleting(true);
    try {
      await deleteLocal('questions', editRow.id);
      setEditRow(null);
      setEditDraft(null);
      const remaining = await db.questions.where('session_id').equals(id).count();
      if (remaining === 0 && session && session.kind !== 'pyq') {
        await deleteLocal('sessions', session.id);
        navigate('/');
      }
    } finally {
      setDeleting(false);
    }
  }

  const stats = useMemo(() => {
    const qs = questions ?? [];
    const byOutcome = new Map<Outcome, number>();
    const patterns = new Map<string, number>();
    let totalSec = 0;
    let over = 0;
    let maxSec = 1;
    for (const q of qs) {
      byOutcome.set(q.outcome, (byOutcome.get(q.outcome) ?? 0) + 1);
      if (q.pattern_name) patterns.set(q.pattern_name, (patterns.get(q.pattern_name) ?? 0) + 1);
      totalSec += q.time_spent_sec;
      if (q.time_spent_sec > q.target_time_sec) over += 1;
      maxSec = Math.max(maxSec, q.time_spent_sec, q.target_time_sec);
    }
    return {
      byOutcome,
      patterns: [...patterns.entries()].sort((a, b) => b[1] - a[1]),
      totalSec,
      over,
      maxSec
    };
  }, [questions]);

  if (session === undefined || questions === undefined || pyqAttempts === undefined)
    return <LoadingScreen />;
  if (session === null)
    return (
      <Empty
        title="Session not found"
        hint="It may have been deleted on another device."
        action={<Button onClick={() => navigate('/')}>Dashboard</Button>}
      />
    );
  if (session.actual_duration_min === null) return <Navigate to={`/session/${id}/solve`} replace />;

  const ink = subjectInk(session.subject);
  const value = draft ?? session.insight ?? '';

  const finish = async () => {
    const text = value.trim();
    if (text) {
      await writeLocal('sessions', { ...session, insight: text });
      navigate('/');
      return;
    }
    if (!nudged) {
      setNudged(true);
      return;
    }
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-2">
        <div className="u-margin-line">
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">
            Session logged
          </h1>
          <p className="mt-0.5 text-[13.5px] text-text-muted">
            <span className={cn('font-medium', ink.text)}>{session.subject}</span>
            {' · '}
            {formatDate(session.date)} ·{' '}
            {session.kind === 'pyq' ? (
              <>
                <span className="u-num">{pyqAttempts.length}</span> submitted ·{' '}
                <span className="u-num">{questions.length}</span> analyzed ·{' '}
                <span className="u-num">{session.actual_duration_min}</span>m
              </>
            ) : (
              <>
                <span className="u-num">{questions.length}</span> tagged ·{' '}
                <span className="u-num">{session.actual_duration_min}</span>m of{' '}
                <span className="u-num">{session.target_duration_min}</span>m target
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditSessionOpen(true)}>
            Edit session
          </Button>
          <motion.span
            className="u-stamp"
            initial={{ opacity: 0, scale: 1.7, rotate: 6 }}
            animate={{ opacity: 1, scale: 1, rotate: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 19, delay: 0.15 }}
          >
            logged
          </motion.span>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Outcomes"
          aside={
            session.interruptions_count > 0 ? (
              <span className="u-num text-[12px] text-text-faint">
                {session.interruptions_count} interruption
                {session.interruptions_count === 1 ? '' : 's'}
              </span>
            ) : undefined
          }
        />
        <CardBody className="flex flex-col gap-4">
          {session.kind === 'pyq' && questions.length < pyqAttempts.length && (
            <p className="text-[12px] text-text-faint">
              Outcome analysis covers {questions.length} of {pyqAttempts.length} submitted PYQs. The
              remaining attempt receipts are still preserved in PYQ practice.
            </p>
          )}
          {questions.length > 0 && (
            <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-overlay">
              {OUTCOMES.filter((o) => stats.byOutcome.get(o.code)).map((o) => (
                <motion.div
                  key={o.code}
                  className={TONE_BG[o.tone]}
                  initial={{ width: '0%' }}
                  animate={{
                    width: `${((stats.byOutcome.get(o.code) ?? 0) / questions.length) * 100}%`
                  }}
                  transition={{ type: 'spring', stiffness: 120, damping: 24, delay: 0.2 }}
                />
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {OUTCOMES.map((o) => {
              const n = stats.byOutcome.get(o.code) ?? 0;
              return (
                <div
                  key={o.code}
                  title={o.label}
                  className={cn(
                    'rounded border px-2.5 py-2',
                    n > 0
                      ? 'border-border bg-bg-raised shadow-sm'
                      : 'border-transparent bg-bg-overlay/50'
                  )}
                >
                  <p
                    className={cn(
                      'u-num text-[20px] font-semibold leading-none',
                      n > 0 ? TONE_TEXT[o.tone] : 'text-text-faint'
                    )}
                  >
                    {n}
                  </p>
                  <p className="u-label mt-1.5">{o.code}</p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {stats.patterns.length > 0 && (
        <Card>
          <CardHeader title="Patterns hit" />
          <CardBody className="flex flex-wrap gap-2">
            {stats.patterns.map(([name, n]) => (
              <span
                key={name}
                className="flex items-center gap-1.5 rounded-full border border-border bg-bg-raised py-1 pl-3 pr-1.5 text-[13px] font-medium shadow-sm"
              >
                {name}
                <span className="u-num rounded-full bg-bg-overlay px-1.5 text-[11px] text-text-muted">
                  ×{n}
                </span>
              </span>
            ))}
          </CardBody>
        </Card>
      )}

      {questions.length > 0 && (
        <Card>
          <CardHeader
            title="Time per question"
            aside={
              <span className="u-num text-[12px] text-text-muted">
                {secondsToClock(stats.totalSec)} total
              </span>
            }
          />
          <CardBody className="flex flex-col gap-3">
            <div className="flex h-24 items-end gap-1">
              {questions.map((q, i) => (
                <motion.div
                  key={q.id}
                  title={`Q${String(i + 1).padStart(2, '0')} · ${secondsToClock(q.time_spent_sec)} · ${q.outcome}`}
                  className={cn(
                    'max-w-[28px] flex-1 rounded-t',
                    TONE_BG[OUTCOME_BY_CODE[q.outcome].tone]
                  )}
                  initial={{ height: '0%' }}
                  animate={{ height: `${Math.max(8, (q.time_spent_sec / stats.maxSec) * 100)}%` }}
                  transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 26,
                    delay: Math.min(0.15 + i * 0.02, 0.9)
                  }}
                />
              ))}
            </div>
            <p className="text-[12px] text-text-faint">
              avg{' '}
              <span className="u-num">
                {secondsToClock(Math.round(stats.totalSec / questions.length))}
              </span>{' '}
              per question · <span className="u-num">{stats.over}</span> over target
            </p>
          </CardBody>
        </Card>
      )}

      {questions.length > 0 && (
        <Card>
          <CardHeader
            title="Tagged questions"
            aside={
              <span className="u-num text-[12px] text-text-faint">
                edit anything before you finish
              </span>
            }
          />
          <div className="u-mobile-cards-wrap u-table-wrap">
            <table className="u-data-table u-mobile-cards min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-3 py-2 font-mono">#</th>
                  <th className="px-3 py-2 font-mono">Outcome</th>
                  <th className="px-3 py-2 font-mono">Pattern</th>
                  <th className="hidden px-3 py-2 font-mono sm:table-cell">Source</th>
                  <th className="px-3 py-2 text-right font-mono">Time</th>
                  <th className="min-w-[220px] px-3 py-2 font-mono">Answer</th>
                  <th className="w-[64px] px-3 py-2 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {questions.map((q, i) => {
                  const spec = OUTCOME_BY_CODE[q.outcome];
                  const over = q.time_spent_sec > q.target_time_sec;
                  return (
                    <tr key={q.id} className="hover:bg-bg-overlay/40">
                      <td
                        data-label="Question"
                        className="u-num px-3 py-2 text-[11px] text-text-faint"
                      >
                        Q{String(i + 1).padStart(2, '0')}
                      </td>
                      <td data-label="Outcome" className="px-3 py-2">
                        <Badge
                          tone={
                            spec.tone === 'ok'
                              ? 'success'
                              : spec.tone === 'slow'
                                ? 'warn'
                                : spec.tone === 'guess'
                                  ? 'guess'
                                  : 'danger'
                          }
                        >
                          {q.outcome}
                        </Badge>
                      </td>
                      <td data-label="Pattern" data-mobile-primary className="px-3 py-2">
                        <span className="truncate text-text">
                          {q.pattern_name ?? <span className="text-text-faint">no pattern</span>}
                        </span>
                      </td>
                      <td
                        data-label="Source"
                        className="hidden max-w-[240px] px-3 py-2 text-[12px] text-text-muted sm:table-cell"
                      >
                        <span className="truncate">
                          {q.source_ref ?? <span className="text-text-faint">—</span>}
                        </span>
                      </td>
                      <td
                        data-label="Time"
                        className={cn(
                          'u-num px-3 py-2 text-right text-[12px]',
                          over ? 'text-warn' : 'text-text-muted'
                        )}
                      >
                        {secondsToClock(q.time_spent_sec)}
                      </td>
                      <td data-label="Answer" data-mobile-wide className="min-w-[220px] px-3 py-2">
                        <AnswerReveal answer={q.answer_text} onAdd={() => openEdit(q)} compact />
                      </td>
                      <td data-label="Actions" className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(q)}
                          aria-label={`Edit Q${i + 1}`}
                          className="rounded p-1 text-text-faint transition-colors hover:bg-bg-overlay hover:text-accent"
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Biggest insight" aside={<span className="u-label">optional</span>} />
        <CardBody className="flex flex-col gap-3">
          <Input
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void finish();
              }
            }}
            placeholder="One sentence — what will you do differently next time?"
            aria-label="Biggest insight"
          />
          {nudged && !value.trim() && (
            <p className="text-[12px] text-warn">
              One sentence locks the lesson in — or press Finish again to leave without it.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-text-faint">
              <Kbd>Enter</Kbd> <span className="ml-1">saves to the session log.</span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => navigate('/')}>
                Skip
              </Button>
              <Button variant="primary" onClick={() => void finish()}>
                {value.trim() ? 'Save & finish' : 'Finish'}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={!!editRow && !!editDraft}
        onClose={() => {
          if (saving || deleting) return;
          setEditRow(null);
          setEditDraft(null);
        }}
        title="Edit question"
        className="max-w-2xl"
      >
        {editDraft && (
          <div className="flex flex-col gap-4">
            <QuestionEditor draft={editDraft} onChange={setEditDraft} />
            <DeleteBar onDelete={() => void removeRow()} />
            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditRow(null);
                  setEditDraft(null);
                }}
                disabled={saving || deleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void saveEdit()}
                disabled={saving || deleting}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={editSessionOpen}
        onClose={() => setEditSessionOpen(false)}
        title="Edit session"
        className="max-w-lg"
      >
        {session && (
          <SessionEditor
            session={session}
            onSaved={() => setEditSessionOpen(false)}
            onDeleted={() => navigate('/')}
            onCancel={() => setEditSessionOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
