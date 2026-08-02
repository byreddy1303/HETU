// Pattern library (F3.2): counts are aggregated live from questions so the
// number always matches the journal; the patterns table supplies metadata.
// Merge suggestions (edit distance ≤ 3) are advisory — the user confirms.
//
// UX (2026-07-19): grouped by subject. Landing view lists subjects with
// count badges; clicking a subject drills down to that subject's patterns.
// A "Back to subjects" button returns to the overview.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowRight, GitMerge, RotateCcw } from 'lucide-react';
import type { PatternRow, QuestionRow } from '@/types';
import { db } from '@/lib/db';
import { writeLocal, deleteLocal } from '@/lib/sync';
import { calendarDateInTimeZone, cn, formatDate, levenshtein, plural } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Empty } from '@/components/ui/Empty';

interface Entry {
  row: PatternRow;
  liveCount: number;
  notCleanCount: number;
  openReattempts: number;
  lastSeenAt: string | null;
}

interface MergePair {
  from: Entry;
  into: Entry;
}

interface SubjectGroup {
  subject: string;
  entries: Entry[];
  totalHits: number;
  notClean: number;
  openReattempts: number;
  reflexed: number;
}

interface MergeUndo {
  from: PatternRow;
  into: PatternRow;
  affected: QuestionRow[];
}

export default function Patterns() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<MergePair | null>(null);
  const [merging, setMerging] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [mergeUndo, setMergeUndo] = useState<MergeUndo | null>(null);

  const patterns = useLiveQuery(
    () => (userId ? db.patterns.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const questions = useLiveQuery(
    () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId]
  );
  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId]
  );

  const entries = useMemo<Entry[]>(() => {
    const stats = new Map<
      string,
      { total: number; notClean: number; lastSeenAt: string | null }
    >();
    const patternByQuestion = new Map<string, string>();
    for (const q of questions ?? []) {
      if (!q.pattern_name) continue;
      const current = stats.get(q.pattern_name) ?? {
        total: 0,
        notClean: 0,
        lastSeenAt: null
      };
      current.total += 1;
      if (q.outcome !== 'R') current.notClean += 1;
      if (!current.lastSeenAt || q.created_at > current.lastSeenAt) {
        current.lastSeenAt = q.created_at;
      }
      stats.set(q.pattern_name, current);
      patternByQuestion.set(q.id, q.pattern_name);
    }
    const openByPattern = new Map<string, number>();
    for (const row of reattempts ?? []) {
      if (row.stage === 'MASTERED') continue;
      const name = patternByQuestion.get(row.question_id);
      if (name) openByPattern.set(name, (openByPattern.get(name) ?? 0) + 1);
    }
    return (patterns ?? [])
      .map((row) => {
        const current = stats.get(row.name);
        return {
          row,
          liveCount: current?.total ?? 0,
          notCleanCount: current?.notClean ?? 0,
          openReattempts: openByPattern.get(row.name) ?? 0,
          lastSeenAt: current?.lastSeenAt ?? null
        };
      })
      .sort(
        (a, b) =>
          b.openReattempts - a.openReattempts ||
          b.notCleanCount - a.notCleanCount ||
          b.liveCount - a.liveCount ||
          a.row.name.localeCompare(b.row.name)
      );
  }, [patterns, questions, reattempts]);

  const groups = useMemo<SubjectGroup[]>(() => {
    const bySubject = new Map<string, Entry[]>();
    for (const e of entries) {
      const arr = bySubject.get(e.row.subject) ?? [];
      arr.push(e);
      bySubject.set(e.row.subject, arr);
    }
    const list: SubjectGroup[] = [];
    for (const [subject, arr] of bySubject) {
      list.push({
        subject,
        entries: arr,
        totalHits: arr.reduce((s, x) => s + x.liveCount, 0),
        notClean: arr.reduce((s, x) => s + x.notCleanCount, 0),
        openReattempts: arr.reduce((s, x) => s + x.openReattempts, 0),
        reflexed: arr.filter((x) => x.row.is_reflexed).length
      });
    }
    return list.sort(
      (a, b) =>
        b.openReattempts - a.openReattempts ||
        b.notClean - a.notClean ||
        b.totalHits - a.totalHits ||
        a.subject.localeCompare(b.subject)
    );
  }, [entries]);

  // Merge suggestions are scoped to the currently selected subject when we're
  // drilled in, and hidden on the subject overview to keep the landing scannable.
  const scopedEntries = useMemo(() => {
    if (!selectedSubject) return [];
    return entries.filter((e) => e.row.subject === selectedSubject);
  }, [entries, selectedSubject]);

  const suggestions = useMemo(() => {
    if (!selectedSubject) return [];
    const pool = scopedEntries;
    const pairs: MergePair[] = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        if (levenshtein(a.row.name, b.row.name) <= 3) {
          pairs.push(
            a.liveCount >= b.liveCount ? { from: b, into: a } : { from: a, into: b }
          );
        }
      }
    }
    return pairs.slice(0, 5);
  }, [scopedEntries, selectedSubject]);

  async function merge({ from, into }: MergePair) {
    if (!userId || merging) return;
    setMerging(true);
    try {
      const qs = await db.questions
        .where('[user_id+pattern_name]')
        .equals([userId, from.row.name])
        .toArray();
      for (const q of qs) {
        await writeLocal('questions', { ...q, pattern_name: into.row.name });
      }
      const total = await db.questions
        .where('[user_id+pattern_name]')
        .equals([userId, into.row.name])
        .count();
      await writeLocal('patterns', { ...into.row, count: total });
      await deleteLocal('patterns', from.row.id);
      setMergeUndo({ from: from.row, into: into.row, affected: qs });
      setConfirm(null);
    } finally {
      setMerging(false);
    }
  }

  async function undoMerge() {
    if (!mergeUndo || merging) return;
    setMerging(true);
    try {
      await writeLocal('patterns', mergeUndo.from);
      for (const question of mergeUndo.affected) {
        const current = await db.questions.get(question.id);
        if (current?.pattern_name === mergeUndo.into.name) {
          await writeLocal('questions', { ...current, pattern_name: mergeUndo.from.name });
        }
      }
      const intoCount = await db.questions
        .where('[user_id+pattern_name]')
        .equals([userId as string, mergeUndo.into.name])
        .count();
      await writeLocal('patterns', { ...mergeUndo.into, count: intoCount });
      setMergeUndo(null);
    } finally {
      setMerging(false);
    }
  }

  const loading = patterns === undefined || questions === undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Patterns"
        description={
          loading
            ? 'Loading…'
            : selectedSubject
              ? `${scopedEntries.length} named ${plural(scopedEntries.length, 'pattern')} in ${selectedSubject}`
              : `${entries.length} reusable ${plural(entries.length, 'pattern')} across ${groups.length} ${plural(groups.length, 'subject')}`
        }
      />

      {mergeUndo && (
        <Card className="border-success/35 bg-success-faint/35">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-text-muted">
              Merged <span className="font-medium text-text">{mergeUndo.from.name}</span> into{' '}
              <span className="font-medium text-text">{mergeUndo.into.name}</span>.
            </p>
            <Button size="sm" variant="ghost" disabled={merging} onClick={() => void undoMerge()}>
              <RotateCcw size={13} strokeWidth={1.8} /> Undo merge
            </Button>
          </CardBody>
        </Card>
      )}

      {selectedSubject && (
        <div>
          <button
            type="button"
            onClick={() => setSelectedSubject(null)}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-bg-raised px-3 py-1.5 text-[12.5px] text-text-muted transition-colors hover:border-border-hover hover:text-text"
          >
            <ArrowLeft size={12} strokeWidth={1.75} />
            All subjects
          </button>
        </div>
      )}

      {selectedSubject && suggestions.length > 0 && (
        <Card>
          <CardHeader
            title="Possible duplicates in this subject"
            aside={
              <span className="u-label text-text-faint">
                advisory — nothing happens without you
              </span>
            }
          />
          <CardBody className="flex flex-col gap-2">
            {suggestions.map((p) => (
              <div
                key={`${p.from.row.id}-${p.into.row.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-bg-raised px-3 py-2 shadow-sm"
              >
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
                  <span className="truncate font-medium">{p.from.row.name}</span>
                  <span className="u-num text-[11px] text-text-faint">
                    ×{p.from.liveCount}
                  </span>
                  <ArrowRight
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 text-text-faint"
                  />
                  <span className="truncate font-medium">{p.into.row.name}</span>
                  <span className="u-num text-[11px] text-text-faint">
                    ×{p.into.liveCount}
                  </span>
                </p>
                <Button size="sm" onClick={() => setConfirm(p)}>
                  <GitMerge size={13} strokeWidth={1.75} />
                  Merge
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {!selectedSubject ? (
        <Card>
          {groups.length > 0 ? (
            <div>
              {groups.map((g) => {
                const ink = subjectInk(g.subject);
                return (
                  <button
                    key={g.subject}
                    type="button"
                    onClick={() => setSelectedSubject(g.subject)}
                    className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-overlay/50"
                  >
                    <span className={cn('h-2 w-2 rounded-full', ink.dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-text">
                        {g.subject}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
                        <span>
                          {g.entries.length}{' '}
                          {plural(g.entries.length, 'pattern')}
                        </span>
                        <span className="text-text-faint">·</span>
                        <span>
                          {g.totalHits} tagged{' '}
                          {plural(g.totalHits, 'question')}
                        </span>
                        <span className="text-text-faint">·</span>
                        <span>{g.notClean} not clean</span>
                        {g.openReattempts > 0 && (
                          <>
                            <span className="text-text-faint">·</span>
                            <span className="text-accent">{g.openReattempts} open</span>
                          </>
                        )}
                        {g.reflexed > 0 && (
                          <>
                            <span className="text-text-faint">·</span>
                            <span>{g.reflexed} reflex</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="u-num rounded-full bg-accent-faint px-2 py-0.5 text-[11px] font-semibold text-accent">
                      ×{g.totalHits}
                    </span>
                    <ArrowRight
                      size={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-text-faint"
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty
              title={loading ? 'Loading…' : 'No patterns yet'}
              hint="Name the reusable trick while tagging and it starts counting here."
              className="border-0 py-10"
            />
          )}
        </Card>
      ) : (
        <Card>
          {scopedEntries.length > 0 ? (
            <div>
              {scopedEntries.map(({ row, liveCount, notCleanCount, openReattempts, lastSeenAt }) => {
                const ink = subjectInk(row.subject);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() =>
                      navigate(`/journal?pattern=${encodeURIComponent(row.name)}`)
                    }
                    className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-overlay/50"
                  >
                    <span
                      className={cn(
                        'u-num w-10 shrink-0 text-[17px] font-semibold',
                        liveCount > 0 ? 'text-text' : 'text-text-faint'
                      )}
                    >
                      ×{liveCount}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">
                        {row.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full', ink.dot)} />
                        <span className="text-[11.5px] text-text-muted">
                          {row.subject}
                        </span>
                        <span className="text-[11.5px] text-text-faint">·</span>
                        <span className="text-[11.5px] text-text-muted">
                          {notCleanCount}/{liveCount} not clean
                        </span>
                        {lastSeenAt && (
                          <span className="text-[11.5px] text-text-faint">
                            · last seen{' '}
                            {formatDate(calendarDateInTimeZone(lastSeenAt), 'dd MMM')}
                          </span>
                        )}
                      </span>
                    </span>
                    {openReattempts > 0 && <Badge tone="warn">{openReattempts} open</Badge>}
                    {row.is_reflexed && <Badge tone="success">reflex</Badge>}
                    <ArrowRight
                      size={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-text-faint"
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty
              title="No patterns for this subject yet"
              hint="Name a trick while tagging a question in this subject to start counting."
              className="border-0 py-10"
            />
          )}
        </Card>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => !merging && setConfirm(null)}
        title="Merge patterns"
      >
        {confirm && (
          <div className="flex flex-col gap-4">
            <p className="text-[13.5px] leading-relaxed text-text-muted">
              Retag <span className="u-num text-text">{confirm.from.liveCount}</span>{' '}
              {plural(confirm.from.liveCount, 'question')} from{' '}
              <span className="font-medium text-text">
                “{confirm.from.row.name}”
              </span>{' '}
              to{' '}
              <span className="u-highlight font-medium text-text">
                “{confirm.into.row.name}”
              </span>{' '}
              and drop the old name. An undo remains available until you leave this page.
            </p>
            {(() => {
              const affected = (questions ?? []).filter(
                (question) => question.pattern_name === confirm.from.row.name
              );
              if (affected.length === 0) return null;
              return (
                <div className="rounded border border-border bg-bg-overlay/35 p-3">
                  <p className="u-label mb-2">Questions that will be retagged</p>
                  <ul className="flex flex-col gap-1.5 text-[12px] text-text-muted">
                    {affected.slice(0, 3).map((question) => (
                      <li key={question.id} className="truncate">
                        {question.source_ref ?? question.question_text ?? 'Saved question'}
                      </li>
                    ))}
                  </ul>
                  {affected.length > 3 && (
                    <p className="mt-2 text-[11px] text-text-faint">
                      +{affected.length - 3} more
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={merging}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={merging}
                onClick={() => void merge(confirm)}
              >
                {merging ? 'Merging…' : 'Merge'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
