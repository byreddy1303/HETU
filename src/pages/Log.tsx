// Standalone logging page with three states, driven by the persisted log store:
//
//   idle   → landing card asks "single question or multi-question batch?"
//   single → one-shot entry, saves and returns to landing
//   multi  → sticky batch entry: subject / source / marks preserved between
//            saves, all rows share one session_id, "End log session" closes
//            the batch and returns to landing.
//
// State survives navigation and reloads; leaving mid-flow does not lose the
// in-progress draft. Multi-mode also creates a real SessionRow (with
// target_duration_min = 0 — a marker for "log-only session") so the group
// appears in the Journal's Recent-sessions strip.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { CheckCircle2, Pencil, PenLine, PlayCircle, StopCircle } from 'lucide-react';
import type { QuestionRow, SessionRow } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { db } from '@/lib/db';
import { writeLocal, deleteLocal } from '@/lib/sync';
import { needsReattempt, scheduleReattempt } from '@/lib/reattempt';
import { useAuth } from '@/hooks/useAuth';
import { useLogStore } from '@/stores/log';
import { OUTCOME_BY_CODE } from '@/lib/constants';
import { cn, formatDate, nowISO, plural, secondsToClock, todayISO, uuid } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import QuestionEditor, { DeleteBar } from '@/components/shared/QuestionEditor';
import AnswerReveal from '@/components/shared/AnswerReveal';
import {
  applyDraftToRow,
  draftFromRow,
  emptyDraft,
  type EditorDraft
} from '@/components/shared/questionDraft';

const DEFAULT_SUBJECT = 'Discrete Mathematics';

async function reconcilePattern(userId: string, subject: string, name: string) {
  const count = await db.questions.where('[user_id+pattern_name]').equals([userId, name]).count();
  const existing = await db.patterns.where('[user_id+name]').equals([userId, name]).first();
  if (existing) {
    await writeLocal('patterns', { ...existing, count });
  } else {
    await writeLocal('patterns', {
      id: uuid(),
      user_id: userId,
      name,
      subject,
      count,
      is_reflexed: false,
      mastery_level: 0,
      first_seen_at: nowISO()
    });
  }
}

export default function Log() {
  const { userId } = useAuth();
  const today = todayISO();

  const {
    mode,
    sessionId,
    startedAt,
    loggedCount,
    draft: persistedDraft,
    beginSingle,
    beginMulti,
    bumpLogged,
    setDraft,
    end
  } = useLogStore();

  // Local mirror of the persisted draft: keeps typing responsive while the
  // debounced setDraft call writes to localStorage.
  const [draft, setLocalDraft] = useState<EditorDraft>(
    () => persistedDraft ?? emptyDraft(DEFAULT_SUBJECT, today)
  );

  // Sync local ⇢ store on any keystroke (small enough to not need debounce).
  useEffect(() => {
    if (mode === 'idle') return;
    setDraft(draft);
  }, [draft, mode, setDraft]);

  // Rehydrate on mount: if there's a persisted draft, prefer it over the
  // freshly-generated blank one.
  useEffect(() => {
    if (persistedDraft) setLocalDraft(persistedDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Edit dialog for the "just logged" table.
  const [editRow, setEditRow] = useState<QuestionRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditorDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeSession = useLiveQuery(
    async () => (sessionId ? ((await db.sessions.get(sessionId)) ?? null) : null),
    [sessionId],
    null
  );

  // Recent standalone rows plus the current multi-batch rows.
  const recent = useLiveQuery(
    async () => {
      if (!userId) return [] as QuestionRow[];
      const rows = await db.questions
        .where('user_id')
        .equals(userId)
        .filter((q) => q.session_id === null || q.session_id === sessionId)
        .sortBy('created_at');
      return rows.reverse().slice(0, 25);
    },
    [userId, sessionId],
    []
  );

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of recent) {
      const day = q.created_at.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [recent]);

  const canSave = !!draft.subject;

  async function startMulti() {
    if (!userId) return;
    const row: SessionRow = {
      id: uuid(),
      user_id: userId,
      date: today,
      subject: draft.subject || DEFAULT_SUBJECT,
      target_duration_min: 0, // marker for "log batch" (no timer)
      actual_duration_min: null,
      insight: null,
      sadhana_done: false,
      interruptions_count: 0,
      created_at: nowISO()
    };
    await writeLocal('sessions', row);
    beginMulti(row.id);
    setLocalDraft(emptyDraft(row.subject, today));
  }

  async function save() {
    if (!userId || !canSave || saving) return;
    setSaving(true);
    try {
      const skeleton: QuestionRow = {
        id: uuid(),
        user_id: userId,
        session_id: mode === 'multi' ? sessionId : null,
        subject: draft.subject,
        subtopic: null,
        source_year: null,
        source_ref: null,
        question_text: null,
        answer_text: null,
        image_url: null,
        time_spent_sec: 0,
        target_time_sec: 120,
        outcome: 'R',
        pattern_name: null,
        trigger_sentence: null,
        root_cause: null,
        mark_decision: null,
        mark_correct: null,
        created_at: `${draft.createdDate}T${nowISO().slice(11)}`
      };
      const row = applyDraftToRow(skeleton, draft);
      await writeLocal('questions', row);
      if (row.pattern_name) await reconcilePattern(userId, row.subject, row.pattern_name);
      if (needsReattempt(row.outcome)) await scheduleReattempt(userId, row.id);
      setFlash(row.id);
      setTimeout(() => setFlash(null), 2200);

      if (mode === 'multi') {
        bumpLogged();
        // Sticky context — keep subject/source/marks/format, blank the rest.
        setLocalDraft({
          ...emptyDraft(draft.subject, today),
          sourceKind: draft.sourceKind,
          sourceYear: draft.sourceYear,
          sourceSet: draft.sourceSet,
          format: draft.format,
          marks: draft.marks
        });
      } else {
        // Single mode → close the entry and return to landing.
        end();
        setLocalDraft(emptyDraft(DEFAULT_SUBJECT, today));
      }
    } finally {
      setSaving(false);
    }
  }

  async function endMulti() {
    if (!userId || !sessionId) return;
    const row = await db.sessions.get(sessionId);
    if (row) {
      const tagged = await db.questions.where('session_id').equals(sessionId).count();
      if (tagged === 0) {
        await deleteLocal('sessions', sessionId);
      } else {
        const mins =
          startedAt != null ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) : 1;
        await writeLocal('sessions', { ...row, actual_duration_min: mins });
      }
    }
    end();
    setLocalDraft(emptyDraft(DEFAULT_SUBJECT, today));
  }

  function openEdit(row: QuestionRow) {
    setEditRow(row);
    setEditDraft(draftFromRow(row));
  }

  async function saveEdit() {
    if (!editRow || !editDraft) return;
    setEditSaving(true);
    try {
      const merged = applyDraftToRow(editRow, editDraft);
      await writeLocal('questions', merged);
      setEditRow(null);
      setEditDraft(null);
    } finally {
      setEditSaving(false);
    }
  }

  async function removeRow() {
    if (!editRow) return;
    setDeleting(true);
    try {
      await deleteLocal('questions', editRow.id);
      setEditRow(null);
      setEditDraft(null);
    } finally {
      setDeleting(false);
    }
  }

  const showEntry = mode !== 'idle';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Log a question"
        description={
          mode === 'multi' ? (
            <>
              Batch session — <span className="u-num">{loggedCount}</span>{' '}
              {plural(loggedCount, 'logged')}
              {startedAt && (
                <>
                  {' '}
                  ·{' '}
                  <span className="u-num">
                    {secondsToClock(Math.round((Date.now() - startedAt) / 1000))}
                  </span>{' '}
                  elapsed
                </>
              )}
            </>
          ) : mode === 'single' ? (
            <>Single entry — saves once, then returns here.</>
          ) : (
            <>
              One-off entries outside a timed session. Same fields as Journal — subject and outcome
              are enough.
            </>
          )
        }
      />

      {mode === 'idle' && (
        <Card>
          <CardHeader title="How are you logging?" />
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={beginSingle}
              className="flex flex-col items-start gap-2 rounded border border-border bg-bg-raised px-4 py-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-border-hover hover:shadow-card active:translate-y-0"
            >
              <span className="flex items-center gap-2 font-display text-[15px] font-semibold text-text">
                <PenLine size={16} strokeWidth={1.75} className="text-accent" />
                Single question
              </span>
              <span className="text-[12px] text-text-muted">
                One entry, saves, back to this page.
              </span>
            </button>
            <button
              type="button"
              onClick={() => void startMulti()}
              className="flex flex-col items-start gap-2 rounded border border-border bg-bg-raised px-4 py-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-border-hover hover:shadow-card active:translate-y-0"
            >
              <span className="flex items-center gap-2 font-display text-[15px] font-semibold text-text">
                <PlayCircle size={16} strokeWidth={1.75} className="text-ink-teal" />
                Batch (multiple questions)
              </span>
              <span className="text-[12px] text-text-muted">
                Sticky subject / source across saves. Group is stored as a session — end when you're
                done. Progress survives navigation.
              </span>
            </button>
          </CardBody>
        </Card>
      )}

      {showEntry && (
        <Card>
          <CardHeader
            title={mode === 'multi' ? 'New entry (batch)' : 'New entry'}
            aside={
              flash ? (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 text-[12px] text-success"
                >
                  <CheckCircle2 size={12} strokeWidth={2} />
                  saved
                </motion.span>
              ) : (
                <span className="u-num text-[11px] text-text-faint">date defaults to today</span>
              )
            }
          />
          <CardBody className="flex flex-col gap-4">
            <QuestionEditor draft={draft} onChange={setLocalDraft} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              {mode === 'multi' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void endMulti()}
                  disabled={saving}
                  className="text-danger hover:text-danger"
                >
                  <StopCircle size={14} strokeWidth={1.75} className="mr-1" />
                  End log session
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    end();
                    setLocalDraft(emptyDraft(DEFAULT_SUBJECT, today));
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              )}
              <Button variant="primary" onClick={() => void save()} disabled={!canSave || saving}>
                {saving ? 'Saving…' : mode === 'multi' ? 'Save & next' : 'Save entry'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {mode === 'multi' && activeSession && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className={cn('h-1.5 w-1.5 rounded-full', subjectInk(activeSession.subject).dot)}
              />
              <span className="font-medium">{activeSession.subject}</span>
            </span>
            <span className="text-text-faint">
              · session id {activeSession.id.slice(0, 8)} · started{' '}
              {formatDate(activeSession.date, 'dd MMM')}
            </span>
            <span className="ml-auto text-text-faint">
              Leave and come back — this batch stays open until you end it.
            </span>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title={mode === 'multi' ? 'Logged in this batch + recent' : 'Just logged'}
          aside={
            recent.length > 0 ? (
              <span className="u-num text-[12px] text-text-faint">
                {recent.length} recent · {dayCounts.size} {plural(dayCounts.size, 'day')}
              </span>
            ) : undefined
          }
        />
        {recent.length === 0 ? (
          <Empty
            title="Nothing yet"
            hint="Entries appear here and in the Journal — filter by Standalone or by the session id above."
            className="border-0 py-8"
          />
        ) : (
          <div className="u-table-wrap">
            <table className="u-data-table min-w-[940px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  <th className="px-3 py-2 font-mono">Date</th>
                  <th className="px-3 py-2 font-mono">Subject</th>
                  <th className="hidden px-3 py-2 font-mono sm:table-cell">Subtopic</th>
                  <th className="px-3 py-2 font-mono">Outcome</th>
                  <th className="hidden px-3 py-2 font-mono md:table-cell">Source</th>
                  <th className="px-3 py-2 font-mono">Pattern</th>
                  <th className="min-w-[220px] px-3 py-2 font-mono">Answer</th>
                  <th className="hidden px-3 py-2 text-right font-mono sm:table-cell">Time</th>
                  <th className="w-[64px] px-3 py-2 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((q) => {
                  const spec = OUTCOME_BY_CODE[q.outcome];
                  const ink = subjectInk(q.subject);
                  const over = q.time_spent_sec > q.target_time_sec;
                  const inBatch = mode === 'multi' && q.session_id === sessionId;
                  return (
                    <tr
                      key={q.id}
                      className={cn('hover:bg-bg-overlay/40', inBatch && 'bg-accent-faint/25')}
                    >
                      <td className="u-num whitespace-nowrap px-3 py-2 text-[11px] text-text-faint">
                        {formatDate(q.created_at.slice(0, 10), 'dd MMM yy')}
                      </td>
                      <td className="max-w-[180px] px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ink.dot)} />
                          <span className="truncate text-[12px] text-text-muted">{q.subject}</span>
                        </span>
                      </td>
                      <td className="hidden max-w-[180px] px-3 py-2 text-[12px] text-text-muted sm:table-cell">
                        <span className="truncate">
                          {q.subtopic ?? <span className="text-text-faint">—</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2">
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
                      <td className="hidden max-w-[220px] px-3 py-2 text-[12px] text-text-muted md:table-cell">
                        <span className="truncate">
                          {q.source_ref ?? <span className="text-text-faint">—</span>}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-3 py-2">
                        <span className="truncate">
                          {q.pattern_name ?? <span className="text-text-faint">no pattern</span>}
                        </span>
                      </td>
                      <td className="min-w-[220px] px-3 py-2">
                        <AnswerReveal answer={q.answer_text} onAdd={() => openEdit(q)} compact />
                      </td>
                      <td
                        className={cn(
                          'u-num hidden px-3 py-2 text-right text-[12px] sm:table-cell',
                          over ? 'text-warn' : 'text-text-muted'
                        )}
                      >
                        {secondsToClock(q.time_spent_sec)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(q)}
                          aria-label="Edit entry"
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
        )}
      </Card>

      <Dialog
        open={!!editRow && !!editDraft}
        onClose={() => {
          if (editSaving || deleting) return;
          setEditRow(null);
          setEditDraft(null);
        }}
        title="Edit entry"
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
                disabled={editSaving || deleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void saveEdit()}
                disabled={editSaving || deleting}
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

    </div>
  );
}
