// Journal (F3.1): every tagged question, filterable six ways, fuzzy trigger
// search, expandable rows, 50/page.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, ExternalLink, Pencil } from 'lucide-react';
import type { PyqAttemptRow, PyqSelectedAnswer, QuestionRow, SessionRow } from '@/types';
import { db } from '@/lib/db';
import { writeLocal, deleteLocal } from '@/lib/sync';
import {
  pruneEmptyFinishedSessions,
  allSessions,
  recentSessions,
  reconcilePyqPracticeSessions
} from '@/lib/sessions';
import {
  OUTCOMES,
  OUTCOME_BY_CODE,
  ROOT_CAUSES,
  MARK_DECISIONS,
  SUBJECTS,
  SOURCE_KINDS,
  SOURCE_KIND_BY_VALUE,
  QUESTION_FORMATS,
  type SourceKind,
  type QuestionFormat
} from '@/lib/constants';
import { cn, formatDate, levenshtein, secondsToClock, plural } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Empty } from '@/components/ui/Empty';
import { ImagePreview } from '@/components/shared/ImagePreview';
import AnswerReveal from '@/components/shared/AnswerReveal';
import { Dialog } from '@/components/ui/Dialog';
import QuestionEditor, { DeleteBar } from '@/components/shared/QuestionEditor';
import SessionEditor from '@/components/shared/SessionEditor';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import { applyDraftToRow, draftFromRow, type EditorDraft } from '@/components/shared/questionDraft';
import { subtopicsFor } from '@/lib/subtopics';
import { pyqSourceAttemptForJournalQuestion } from '@/lib/pyq-session';

const PAGE_SIZE = 50;

const TONE_BADGE: Record<
  'ok' | 'slow' | 'guess' | 'wrong',
  'success' | 'warn' | 'guess' | 'danger'
> = {
  ok: 'success',
  slow: 'warn',
  guess: 'guess',
  wrong: 'danger'
};

/** Substring, or every query word within edit distance 2 of some target word. */
function fuzzy(query: string, target: string): boolean {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  const words = t.split(/\s+/);
  return q.split(/\s+/).every((qw) => words.some((w) => w.includes(qw) || levenshtein(qw, w) <= 2));
}

interface Filters {
  trigger: string;
  pattern: string;
  subject: string;
  subtopic: string;
  outcome: string;
  cause: string;
  mark: string;
  source: string;
  format: string;
  session: string; // session id, or "" for all, or "standalone" for session_id IS NULL
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  trigger: '',
  pattern: '',
  subject: '',
  subtopic: '',
  outcome: '',
  cause: '',
  mark: '',
  source: '',
  format: '',
  session: '',
  from: '',
  to: ''
};

/** Extract the source-kind key from a canonical source_ref (prefix match). */
function detectSourceKind(ref: string | null): SourceKind | null {
  if (!ref) return null;
  for (const s of SOURCE_KINDS) {
    if (ref === s.refPrefix || ref.startsWith(`${s.refPrefix} · `)) return s.value;
  }
  return null;
}

/** Extract question format if it was appended as the last segment of source_ref. */
function detectFormat(ref: string | null): QuestionFormat | null {
  if (!ref) return null;
  for (const qf of QUESTION_FORMATS) {
    if (ref === qf.value || ref.endsWith(` · ${qf.value}`)) return qf.value;
  }
  return null;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="u-label">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}

function Row({
  q,
  onImage,
  onEdit
}: {
  q: QuestionRow;
  onImage: (src: string, caption: string) => void;
  onEdit: (row: QuestionRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const spec = OUTCOME_BY_CODE[q.outcome];
  const ink = subjectInk(q.subject);
  const over = q.time_spent_sec > q.target_time_sec;
  const sourceKind = detectSourceKind(q.source_ref);
  const format = detectFormat(q.source_ref);
  const sourceLabel = sourceKind ? SOURCE_KIND_BY_VALUE[sourceKind].label : null;
  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-bg-overlay/40"
        onClick={() => setOpen((o) => !o)}
      >
        <td
          data-label="Date"
          className="u-num w-[86px] whitespace-nowrap px-3 py-2 text-[11px] text-text-faint"
        >
          {formatDate(q.created_at.slice(0, 10), 'dd MMM yy')}
        </td>
        <td
          data-label="Subject"
          data-mobile-primary
          className="min-w-[140px] max-w-[180px] px-3 py-2"
        >
          <span className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ink.dot)} />
            <span className="truncate text-[12px] text-text-muted">{q.subject}</span>
          </span>
        </td>
        <td
          data-label="Subtopic"
          className="hidden max-w-[180px] px-3 py-2 text-[12px] text-text-muted sm:table-cell"
        >
          <span className="truncate">
            {q.subtopic ?? <span className="text-text-faint">—</span>}
          </span>
        </td>
        <td data-label="Outcome" className="hidden px-3 py-2 sm:table-cell">
          <Badge tone={TONE_BADGE[spec.tone]}>{q.outcome}</Badge>
        </td>
        <td
          data-label="Source"
          className="hidden max-w-[220px] px-3 py-2 text-[12px] text-text-muted md:table-cell"
        >
          <span className="truncate">
            {sourceLabel ?? '—'}
            {format && <span className="ml-1 font-mono text-text-faint">· {format}</span>}
          </span>
        </td>
        <td data-label="Pattern" data-mobile-wide className="min-w-0 max-w-[280px] px-3 py-2">
          <span className="truncate text-[13px]">
            {q.pattern_name ?? <span className="text-text-faint">no pattern</span>}
          </span>
        </td>
        <td data-label="Photo" className="w-[52px] px-3 py-2">
          {q.image_url ? (
            <button
              type="button"
              aria-label="View photo"
              onClick={(e) => {
                e.stopPropagation();
                onImage(q.image_url as string, q.source_ref ?? sourceLabel ?? 'Question');
              }}
              className="group block h-9 w-9 overflow-hidden rounded border border-border shadow-sm transition-transform hover:-translate-y-px hover:shadow-card"
            >
              <img
                src={q.image_url}
                alt="thumb"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
              />
            </button>
          ) : (
            <span className="text-text-faint">—</span>
          )}
        </td>
        <td
          data-label="Time"
          className={cn(
            'u-num hidden px-3 py-2 text-right text-[12px] sm:table-cell',
            over ? 'text-warn' : 'text-text-faint'
          )}
        >
          {secondsToClock(q.time_spent_sec)}
        </td>
        <td data-label="Actions" className="w-[88px] px-3 py-2 text-right">
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="Edit"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(q);
              }}
              className="rounded p-1 text-text-faint transition-colors hover:bg-bg-overlay hover:text-accent"
            >
              <Pencil size={13} strokeWidth={1.75} />
            </button>
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className={cn('text-text-faint transition-transform', open && 'rotate-180')}
            />
          </span>
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {open && (
          <motion.tr
            className="u-mobile-detail-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            <td colSpan={9} className="border-b border-border bg-bg-overlay/40 px-4 py-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="trigger">
                  {q.trigger_sentence ? (
                    <span className="u-highlight">{q.trigger_sentence}</span>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </Detail>
                <Detail label="root cause">
                  {q.root_cause ? (
                    ROOT_CAUSES.find((rc) => rc.value === q.root_cause)?.label
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </Detail>
                {q.capture_note && (
                  <Detail label="quick note">
                    <span className="whitespace-pre-wrap">{q.capture_note}</span>
                  </Detail>
                )}
                <Detail label="time vs target">
                  <span className="u-num">{secondsToClock(q.time_spent_sec)}</span>
                  <span className="text-text-faint"> of </span>
                  <span className="u-num">{secondsToClock(q.target_time_sec)}</span>
                  {over && <span className="ml-1 text-warn">over</span>}
                </Detail>
                <Detail label="source">
                  {q.source_ref || q.image_url ? (
                    <div className="flex flex-col gap-1.5">
                      {q.source_ref && <span>{q.source_ref}</span>}
                      {q.image_url && (
                        <button
                          type="button"
                          onClick={() =>
                            onImage(
                              q.image_url as string,
                              q.source_ref ?? sourceLabel ?? 'Question'
                            )
                          }
                          className="group relative h-16 w-16 overflow-hidden rounded border border-border shadow-sm transition-transform hover:-translate-y-px hover:shadow-card"
                          aria-label="View full-size image"
                        >
                          <img
                            src={q.image_url}
                            alt="question scan thumbnail"
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </Detail>
                {q.mark_decision && (
                  <Detail label="mark decision">
                    {MARK_DECISIONS.find((m) => m.value === q.mark_decision)?.label}
                    {q.mark_correct !== null && (
                      <span
                        className={cn('ml-1.5', q.mark_correct ? 'text-success' : 'text-danger')}
                      >
                        {q.mark_correct ? 'paid off' : 'did not'}
                      </span>
                    )}
                  </Detail>
                )}
              </div>
              <AnswerReveal answer={q.answer_text} onAdd={() => onEdit(q)} className="mt-4" />
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

function formatAttemptAnswer(value: PyqSelectedAnswer): string {
  if (value == null) return 'Unavailable';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Unavailable';
  return String(value);
}

function officialAnswer(attempt: PyqAttemptRow): string {
  if (attempt.answer_status === 'available') return formatAttemptAnswer(attempt.correct_answer);
  if (attempt.answer_status === 'marks-to-all') return 'Marks awarded to all';
  if (attempt.answer_status === 'ambiguous') return 'Official key is ambiguous';
  return 'Official key is unavailable';
}

function attemptResult(attempt: PyqAttemptRow): {
  label: string;
  tone: 'success' | 'danger' | 'warn';
  border: string;
} {
  if (attempt.mark_decision === 'SKIP') {
    return { label: 'Skipped', tone: 'warn', border: 'border-l-warn' };
  }
  if (attempt.mark_correct === true) {
    return { label: 'Correct', tone: 'success', border: 'border-l-success' };
  }
  if (attempt.mark_correct === false) {
    return { label: 'Incorrect', tone: 'danger', border: 'border-l-danger' };
  }
  return { label: 'Key unavailable', tone: 'warn', border: 'border-l-warn' };
}

function PyqAttemptDetail({
  attempt,
  position,
  journal,
  onImage,
  onEdit
}: {
  attempt: PyqAttemptRow;
  position: number;
  journal: QuestionRow | null;
  onImage: (src: string, caption: string) => void;
  onEdit: (row: QuestionRow) => void;
}) {
  const snapshot = attempt.question_snapshot;
  const result = attemptResult(attempt);
  const decision = MARK_DECISIONS.find((item) => item.value === attempt.mark_decision)?.label;
  const questionNumber = snapshot?.number ?? String(position);
  const source = snapshot?.paper_label ?? journal?.source_ref ?? `GATE ${attempt.year}`;
  const learnerAnswer =
    attempt.capture_version === 2
      ? attempt.mark_decision === 'SKIP'
        ? 'Left blank'
        : formatAttemptAnswer(attempt.selected_answer)
      : 'Legacy attempt — response not verified';

  return (
    <li className="border-t border-border first:border-t-0">
      <article
        aria-label={`PYQ question ${position} details`}
        className={cn('grid border-l-[3px] sm:grid-cols-[74px_minmax(0,1fr)]', result.border)}
      >
        <div className="flex items-center gap-2 border-b border-border bg-bg-overlay/55 px-4 py-3 sm:flex-col sm:items-start sm:gap-1 sm:border-b-0 sm:border-r sm:px-3 sm:py-4">
          <span className="u-label">Question</span>
          <span className="u-num text-[20px] font-semibold leading-none text-text">
            {String(position).padStart(2, '0')}
          </span>
          {attempt.attempt_number > 1 && (
            <span className="u-num ml-auto text-[10px] text-text-faint sm:ml-0">
              try {attempt.attempt_number}
            </span>
          )}
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
            <div className="min-w-0">
              <p className="font-display text-[16px] font-semibold leading-snug text-text">
                {source} · Q{questionNumber}
              </p>
              <p className="mt-1 text-[12px] text-text-muted">
                {snapshot?.topic ?? journal?.subtopic ?? attempt.subject}
                {snapshot?.subtopics.length ? ` · ${snapshot.subtopics.join(' · ')}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={result.tone}>{result.label}</Badge>
              {snapshot?.type && <Badge>{snapshot.type}</Badge>}
              {snapshot?.marks && <Badge>{snapshot.marks} mark</Badge>}
            </div>
          </div>

          <div className="py-4">
            {snapshot?.html ? (
              <PyqQuestionContent html={snapshot.html} />
            ) : journal?.question_text ? (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">
                {journal.question_text}
              </p>
            ) : (
              <p className="text-[13px] text-text-faint">
                The full prompt was not captured for this legacy attempt.
              </p>
            )}
          </div>

          <dl className="grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-bg-raised p-3">
              <dt className="u-label">Your answer</dt>
              <dd className="u-num mt-1.5 text-[13px] font-semibold text-text">{learnerAnswer}</dd>
            </div>
            <div className="bg-bg-raised p-3">
              <dt className="u-label">Official answer</dt>
              <dd className="u-num mt-1.5 text-[13px] font-semibold text-text">
                {officialAnswer(attempt)}
              </dd>
            </div>
            <div className="bg-bg-raised p-3">
              <dt className="u-label">Exam decision</dt>
              <dd className="mt-1.5 text-[13px] font-medium text-text">{decision ?? '—'}</dd>
            </div>
            <div className="bg-bg-raised p-3">
              <dt className="u-label">Time</dt>
              <dd className="u-num mt-1.5 text-[13px] font-semibold text-text">
                {secondsToClock(attempt.time_spent_sec)}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-faint">
            <span className="u-num">
              Submitted {formatDate(attempt.attempted_at, 'dd MMM yy · HH:mm')}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {attempt.screenshot_url && (
                <button
                  type="button"
                  onClick={() =>
                    onImage(attempt.screenshot_url as string, `${source} · Q${questionNumber}`)
                  }
                  className="font-medium text-accent hover:underline"
                >
                  View captured question
                </button>
              )}
              {snapshot?.source_url && (
                <a
                  href={snapshot.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                >
                  Open source <ExternalLink size={11} />
                </a>
              )}
            </span>
          </div>

          {journal ? (
            <section
              aria-label={`Journal analysis for question ${position}`}
              className="mt-4 rounded border border-accent/20 bg-accent-faint/30 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="u-label text-accent">Journal analysis</span>
                  <Badge tone={TONE_BADGE[OUTCOME_BY_CODE[journal.outcome].tone]}>
                    {journal.outcome}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => onEdit(journal)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-bg-overlay hover:text-accent"
                >
                  <Pencil size={11} strokeWidth={1.75} />
                  Edit analysis
                </button>
              </div>
              <div className="mt-3 grid gap-3 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="pattern">
                  {journal.pattern_name ?? <span className="text-text-faint">—</span>}
                </Detail>
                <Detail label="root cause">
                  {journal.root_cause ? (
                    ROOT_CAUSES.find((cause) => cause.value === journal.root_cause)?.label
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </Detail>
                <Detail label="trigger">
                  {journal.trigger_sentence ?? <span className="text-text-faint">—</span>}
                </Detail>
                <Detail label="quick note">
                  {journal.capture_note ?? <span className="text-text-faint">—</span>}
                </Detail>
              </div>
            </section>
          ) : (
            <p className="mt-4 border-l-2 border-border pl-3 text-[12px] text-text-faint">
              No separate journal analysis was added for this question. Its complete attempt receipt
              is still preserved above.
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

function PyqSessionDetails({
  attempts,
  journalsByAttempt,
  onImage,
  onEdit
}: {
  attempts: PyqAttemptRow[];
  journalsByAttempt: Map<string, QuestionRow>;
  onImage: (src: string, caption: string) => void;
  onEdit: (row: QuestionRow) => void;
}) {
  const skipped = attempts.filter((attempt) => attempt.mark_decision === 'SKIP').length;
  const correct = attempts.filter(
    (attempt) => attempt.mark_decision !== 'SKIP' && attempt.mark_correct === true
  ).length;
  const incorrect = attempts.filter(
    (attempt) => attempt.mark_decision !== 'SKIP' && attempt.mark_correct === false
  ).length;

  return (
    <Card>
      <CardHeader
        title="PYQ question details"
        aside={
          <span className="u-num text-[11px] text-text-faint">
            {attempts.length} {plural(attempts.length, 'submission')}
          </span>
        }
      />
      {attempts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
            {[
              ['Correct', correct, 'text-success'],
              ['Incorrect', incorrect, 'text-danger'],
              ['Skipped', skipped, 'text-warn'],
              ['Analyzed', journalsByAttempt.size, 'text-accent']
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="bg-bg-raised px-4 py-3">
                <p className={cn('u-num text-[18px] font-semibold leading-none', tone)}>{value}</p>
                <p className="u-label mt-1.5">{label}</p>
              </div>
            ))}
          </div>
          <ol>
            {attempts.map((attempt, index) => (
              <PyqAttemptDetail
                key={attempt.id}
                attempt={attempt}
                position={index + 1}
                journal={journalsByAttempt.get(attempt.id) ?? null}
                onImage={onImage}
                onEdit={onEdit}
              />
            ))}
          </ol>
        </>
      ) : (
        <Empty
          title="No submitted PYQs"
          hint="This session does not contain a saved attempt receipt yet."
          className="border-0 py-10"
        />
      )}
    </Card>
  );
}

export default function Journal() {
  const { userId, profile } = useAuth();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    pattern: params.get('pattern') ?? '',
    subject: params.get('subject') ?? '',
    subtopic: params.get('subtopic') ?? '',
    cause: params.get('cause') ?? '',
    session: params.get('session') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? ''
  }));
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<{ src: string; caption: string } | null>(null);
  const [editRow, setEditRow] = useState<QuestionRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditorDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editSession, setEditSession] = useState<SessionRow | null>(null);

  // One-shot housekeeping: nuke finished sessions with zero tagged questions
  // (from before the auto-delete-on-finish landed).
  useEffect(() => {
    if (!userId) return;
    void reconcilePyqPracticeSessions(userId, timeZone).then(() =>
      pruneEmptyFinishedSessions(userId)
    );
  }, [userId, timeZone]);

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
    } finally {
      setDeleting(false);
    }
  }

  const questions = useLiveQuery(async () => {
    if (!userId) return [];
    const rows = await db.questions.where('user_id').equals(userId).sortBy('created_at');
    return rows.reverse();
  }, [userId]);

  const pyqAttempts = useLiveQuery(
    async () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  // Newest-first past sessions for the strip below the filter bar.
  const recent = useLiveQuery(
    async () => (userId ? recentSessions(userId, 6, timeZone) : []),
    [userId, timeZone],
    []
  );
  // All sessions for the filter Select — the user can jump to any old session
  // even if it isn't in the top-6 strip.
  const sessionsAll = useLiveQuery(
    async () => (userId ? allSessions(userId, timeZone) : []),
    [userId, timeZone],
    []
  );

  // Per-session tagged counts (used by the sessions strip subtitle).
  const questionCountBySession = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions ?? []) {
      if (q.session_id) map.set(q.session_id, (map.get(q.session_id) ?? 0) + 1);
    }
    const pyqCounts = new Map<string, number>();
    for (const attempt of pyqAttempts) {
      if (!attempt.pyq_session_id) continue;
      pyqCounts.set(attempt.pyq_session_id, (pyqCounts.get(attempt.pyq_session_id) ?? 0) + 1);
    }
    for (const [sessionId, count] of pyqCounts) map.set(sessionId, count);
    return map;
  }, [questions, pyqAttempts]);

  const filtered = useMemo(() => {
    let rows = questions ?? [];
    if (f.session === 'standalone') rows = rows.filter((q) => q.session_id === null);
    else if (f.session) rows = rows.filter((q) => q.session_id === f.session);
    if (f.subject) rows = rows.filter((q) => q.subject === f.subject);
    if (f.subtopic) rows = rows.filter((q) => q.subtopic === f.subtopic);
    if (f.outcome) rows = rows.filter((q) => q.outcome === f.outcome);
    if (f.cause === 'unspecified') rows = rows.filter((q) => q.root_cause === null);
    else if (f.cause) rows = rows.filter((q) => q.root_cause === f.cause);
    if (f.mark) rows = rows.filter((q) => q.mark_decision === f.mark);
    if (f.source) rows = rows.filter((q) => detectSourceKind(q.source_ref) === f.source);
    if (f.format) rows = rows.filter((q) => detectFormat(q.source_ref) === f.format);
    if (f.from) rows = rows.filter((q) => q.created_at.slice(0, 10) >= f.from);
    if (f.to) rows = rows.filter((q) => q.created_at.slice(0, 10) <= f.to);
    if (f.pattern.trim())
      rows = rows.filter((q) => q.pattern_name && fuzzy(f.pattern, q.pattern_name));
    if (f.trigger.trim())
      rows = rows.filter((q) => q.trigger_sentence && fuzzy(f.trigger, q.trigger_sentence));
    return rows;
  }, [questions, f]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const filtersActive = Object.values(f).some((v) => v !== '');
  // The journal is a question log first. Standalone and imported questions do
  // not have a recent-session card, so hiding this table until a filter is set
  // makes valid entries appear to be missing.
  const showQuestionsTable = true;
  const selectedSession =
    f.session && f.session !== 'standalone'
      ? (sessionsAll.find((s) => s.id === f.session) ?? null)
      : null;
  const selectedPyqAttempts = useMemo(() => {
    if (selectedSession?.kind !== 'pyq') return [];
    return pyqAttempts
      .filter((attempt) => attempt.pyq_session_id === selectedSession.id)
      .sort(
        (a, b) =>
          a.attempted_at.localeCompare(b.attempted_at) || a.attempt_number - b.attempt_number
      );
  }, [pyqAttempts, selectedSession]);
  const pyqJournalsByAttempt = useMemo(() => {
    const map = new Map<string, QuestionRow>();
    if (selectedPyqAttempts.length === 0) return map;
    for (const question of questions ?? []) {
      const attempt = pyqSourceAttemptForJournalQuestion(question, selectedPyqAttempts);
      if (attempt) map.set(attempt.id, question);
    }
    return map;
  }, [questions, selectedPyqAttempts]);

  function set<K extends keyof Filters>(key: K, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Journal"
        description={
          selectedSession?.kind === 'pyq'
            ? `${selectedPyqAttempts.length} ${plural(selectedPyqAttempts.length, 'submission')} in this PYQ session`
            : questions === undefined
              ? 'Loading…'
              : `${filtered.length} of ${questions.length} ${plural(questions.length, 'entry', 'entries')}`
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={f.trigger}
              onChange={(e) => set('trigger', e.target.value)}
              placeholder="Search trigger phrases (fuzzy)…"
              aria-label="Search trigger phrases"
              className="min-w-[220px] flex-1"
            />
            <Input
              value={f.pattern}
              onChange={(e) => set('pattern', e.target.value)}
              placeholder="Pattern name…"
              aria-label="Filter by pattern"
              className="min-w-[160px] flex-1 sm:max-w-[220px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={f.subject}
              onChange={(e) => {
                set('subject', e.target.value);
                // Reset subtopic when subject changes — subtopic list is subject-scoped.
                if (f.subtopic) set('subtopic', '');
              }}
              aria-label="Filter by subject"
              className="w-[180px]"
            >
              <option value="">All subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {f.subject && subtopicsFor(f.subject).length > 0 && (
              <Select
                value={f.subtopic}
                onChange={(e) => set('subtopic', e.target.value)}
                aria-label="Filter by subtopic"
                className="w-[220px]"
              >
                <option value="">All subtopics</option>
                {subtopicsFor(f.subject).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value}
                  </option>
                ))}
              </Select>
            )}
            <Select
              value={f.outcome}
              onChange={(e) => set('outcome', e.target.value)}
              aria-label="Filter by outcome"
              className="w-[130px]"
            >
              <option value="">All outcomes</option>
              {OUTCOMES.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.code}
                </option>
              ))}
            </Select>
            <Select
              value={f.cause}
              onChange={(e) => set('cause', e.target.value)}
              aria-label="Filter by root cause"
              className="w-[140px]"
            >
              <option value="">All causes</option>
              <option value="unspecified">Unspecified</option>
              {ROOT_CAUSES.map((rc) => (
                <option key={rc.value} value={rc.value}>
                  {rc.label}
                </option>
              ))}
            </Select>
            <Select
              value={f.mark}
              onChange={(e) => set('mark', e.target.value)}
              aria-label="Filter by mark decision"
              className="w-[130px]"
            >
              <option value="">All marks</option>
              {MARK_DECISIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Select
              value={f.source}
              onChange={(e) => set('source', e.target.value)}
              aria-label="Filter by source"
              className="w-[170px]"
            >
              <option value="">All sources</option>
              {SOURCE_KINDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select
              value={f.session}
              onChange={(e) => set('session', e.target.value)}
              aria-label="Filter by session"
              className="w-[220px]"
            >
              <option value="">All sessions</option>
              <option value="standalone">Standalone (Log) entries</option>
              {sessionsAll.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.date, 'dd MMM yy')} · {s.kind === 'pyq' ? 'PYQ · ' : ''}
                  {s.subject}
                </option>
              ))}
            </Select>
            <Select
              value={f.format}
              onChange={(e) => set('format', e.target.value)}
              aria-label="Filter by question format"
              className="w-[130px]"
            >
              <option value="">All formats</option>
              {QUESTION_FORMATS.map((qf) => (
                <option key={qf.value} value={qf.value}>
                  {qf.label}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={f.from}
              onChange={(e) => set('from', e.target.value)}
              aria-label="From date"
              className="w-[150px]"
              mono
            />
            <span className="text-[12px] text-text-faint">to</span>
            <Input
              type="date"
              value={f.to}
              onChange={(e) => set('to', e.target.value)}
              aria-label="To date"
              className="w-[150px]"
              mono
            />
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setF(EMPTY_FILTERS);
                  setPage(0);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <RecentSessionsCard
        sessions={recent}
        countsBySession={questionCountBySession}
        selectedId={f.session}
        onSelect={(id) => set('session', id)}
        onEdit={(s) => setEditSession(s)}
        onOpenReview={(s) => navigate(`/session/${s.id}/review`)}
      />

      {selectedSession && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px]">
              <span
                className={cn('h-1.5 w-1.5 rounded-full', subjectInk(selectedSession.subject).dot)}
              />
              <span className="font-medium">{selectedSession.subject}</span>
              <span className="text-text-faint">
                · {formatDate(selectedSession.date, 'EEE dd MMM yy')} ·{' '}
                <span className="u-num">{questionCountBySession.get(selectedSession.id) ?? 0}</span>{' '}
                {plural(
                  questionCountBySession.get(selectedSession.id) ?? 0,
                  selectedSession.kind === 'pyq' ? 'submission' : 'question'
                )}
                {selectedSession.actual_duration_min != null && (
                  <>
                    {' · '}
                    <span className="u-num">{selectedSession.actual_duration_min}</span>m
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/session/${selectedSession.id}/review`)}
              >
                Open review
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditSession(selectedSession)}>
                <Pencil size={13} strokeWidth={1.75} className="mr-1" />
                Edit session
              </Button>
              <Button variant="ghost" size="sm" onClick={() => set('session', '')}>
                Clear
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {selectedSession?.kind === 'pyq' ? (
        <PyqSessionDetails
          attempts={selectedPyqAttempts}
          journalsByAttempt={pyqJournalsByAttempt}
          onImage={(src, caption) => setPreview({ src, caption })}
          onEdit={openEdit}
        />
      ) : showQuestionsTable ? (
        <Card>
          {pageRows.length > 0 ? (
            <>
              <div className="u-mobile-cards-wrap u-table-wrap">
                <table className="u-data-table u-mobile-cards min-w-[780px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
                      <th className="px-3 py-2 font-mono">Date</th>
                      <th className="px-3 py-2 font-mono">Subject</th>
                      <th className="hidden px-3 py-2 font-mono sm:table-cell">Subtopic</th>
                      <th className="hidden px-3 py-2 font-mono sm:table-cell">Outcome</th>
                      <th className="hidden px-3 py-2 font-mono md:table-cell">Source</th>
                      <th className="px-3 py-2 font-mono">Pattern</th>
                      <th className="px-3 py-2 font-mono">Photo</th>
                      <th className="hidden px-3 py-2 text-right font-mono sm:table-cell">Time</th>
                      <th className="w-[88px] px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((q) => (
                      <Row
                        key={q.id}
                        q={q}
                        onImage={(src, caption) => setPreview({ src, caption })}
                        onEdit={openEdit}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={current === 0}
                    onClick={() => setPage(current - 1)}
                  >
                    Prev
                  </Button>
                  <span className="u-num text-[12px] text-text-muted">
                    page {current + 1} of {pages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={current >= pages - 1}
                    onClick={() => setPage(current + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Empty
              title="No entries match"
              hint="Loosen a filter or clear them all."
              className="border-0 py-10"
            />
          )}
        </Card>
      ) : null}

      <ImagePreview
        src={preview?.src ?? null}
        caption={preview?.caption}
        open={!!preview}
        onClose={() => setPreview(null)}
      />

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
        open={!!editSession}
        onClose={() => setEditSession(null)}
        title="Edit session"
        className="max-w-lg"
      >
        {editSession && (
          <SessionEditor
            session={editSession}
            onSaved={() => setEditSession(null)}
            onDeleted={() => {
              // If the deleted session was the current filter, clear it.
              if (f.session === editSession.id) set('session', '');
              setEditSession(null);
            }}
            onCancel={() => setEditSession(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function RecentSessionsCard({
  sessions,
  countsBySession,
  selectedId,
  onSelect,
  onEdit,
  onOpenReview
}: {
  sessions: SessionRow[];
  countsBySession: Map<string, number>;
  selectedId: string;
  onSelect: (id: string) => void;
  onEdit: (s: SessionRow) => void;
  onOpenReview: (s: SessionRow) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <Card>
      <CardBody className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="u-label">Recent sessions</span>
          <span className="u-num text-[11px] text-text-faint">last {sessions.length}</span>
        </div>
        <ul className="divide-y divide-border">
          {sessions.map((s) => {
            const ink = subjectInk(s.subject);
            const count = countsBySession.get(s.id) ?? 0;
            const active = selectedId === s.id;
            return (
              <li
                key={s.id}
                className={cn(
                  'flex flex-col gap-2.5 px-4 py-3 transition-colors hover:bg-bg-overlay/40 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5',
                  active && 'bg-accent-faint/40'
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="grid w-full min-w-0 flex-1 grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 text-left sm:flex sm:gap-3"
                >
                  <ChevronRight
                    size={14}
                    strokeWidth={1.75}
                    className={cn(
                      'row-span-2 shrink-0 transition-colors sm:row-auto',
                      active ? 'text-accent' : 'text-text-faint'
                    )}
                  />
                  <span className="u-num col-start-2 row-start-1 shrink-0 text-[10.5px] text-text-faint sm:w-[74px] sm:text-[11px]">
                    {formatDate(s.date, 'dd MMM yy')}
                  </span>
                  <span className="col-start-2 row-start-2 flex min-w-0 flex-1 items-center gap-1.5 sm:col-auto sm:row-auto">
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ink.dot)} />
                    <span className="truncate text-[13px] font-medium">{s.subject}</span>
                    {s.kind === 'pyq' && <Badge tone="accent">PYQ</Badge>}
                  </span>
                  <span className="u-num col-start-3 row-span-2 row-start-1 shrink-0 self-center text-right text-[10.5px] leading-snug text-text-muted sm:col-auto sm:row-auto sm:text-[11px]">
                    {count} {plural(count, s.kind === 'pyq' ? 'submission' : 'question')}
                  </span>
                  {s.actual_duration_min != null && (
                    <span className="u-num hidden shrink-0 text-[11px] text-text-faint sm:inline">
                      · {s.actual_duration_min}m
                      {s.kind === 'pyq' ? '' : ` of ${s.target_duration_min}m`}
                    </span>
                  )}
                </button>
                <span className="flex w-full shrink-0 items-center justify-between border-t border-border/70 pl-[22px] pt-2 sm:w-auto sm:justify-start sm:border-0 sm:p-0">
                  <span className="u-num text-[10px] text-text-faint sm:hidden">
                    {s.actual_duration_min != null
                      ? s.kind === 'pyq'
                        ? `${s.actual_duration_min}m logged`
                        : `${s.actual_duration_min}m of ${s.target_duration_min}m`
                      : `${s.target_duration_min}m target`}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Edit session"
                      onClick={() => onEdit(s)}
                      className="flex min-h-8 min-w-8 items-center justify-center rounded text-text-faint transition-colors hover:bg-bg-overlay hover:text-accent"
                    >
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReview(s)}
                      className="min-h-8 rounded px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-bg-overlay hover:text-text"
                    >
                      Review
                    </button>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
