// F5.2 — Weakness heatmap. Subject × subtopic × root_cause; cell color scales
// with count of not-clean questions in the window. Click any cell to open the
// journal pre-filtered on that intersection.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RootCause } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Empty } from '@/components/ui/Empty';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import {
  addDaysISO,
  calendarDateInTimeZone,
  cn,
  plural,
  todayISOInTimeZone
} from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { ROOT_CAUSES } from '@/lib/constants';
import { heatmapCells, heatmapRowTotals } from '@/lib/analysis';

type CauseKey = RootCause | 'unspecified';

const CAUSE_COLUMNS: { key: CauseKey; label: string }[] = [
  ...ROOT_CAUSES.map((rc) => ({ key: rc.value as CauseKey, label: rc.label })),
  { key: 'unspecified', label: 'Unspecified' }
];

/** Perceptually-graded warm scale so louder cells shout. Zero cells stay muted. */
function cellColor(intensity: number): { bg: string; text: string } {
  // intensity ∈ [0, 1]
  if (intensity === 0) return { bg: 'bg-bg-overlay/30', text: 'text-text-faint' };
  if (intensity < 0.15) return { bg: 'bg-warn/15', text: 'text-warn' };
  if (intensity < 0.35) return { bg: 'bg-warn/35', text: 'text-warn' };
  if (intensity < 0.6) return { bg: 'bg-danger/30', text: 'text-danger' };
  if (intensity < 0.85) return { bg: 'bg-danger/55', text: 'text-white' };
  return { bg: 'bg-danger/80', text: 'text-white' };
}

export default function Heatmap() {
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const today = todayISOInTimeZone(timeZone);
  const defaultFrom = addDaysISO(today, -30);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today);
  const [groupBySubtopic, setGroupBySubtopic] = useState(true);

  const questions = useLiveQuery(
    async () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  const cells = useMemo(
    () =>
      from > to
        ? []
        : heatmapCells(questions, { from, to, groupBySubtopic, timeZone }),
    [questions, from, to, groupBySubtopic, timeZone]
  );
  const invalidRange = from > to;

  // Row keys in original order of appearance (already sorted by cell count desc).
  const unsortedRowKeys: { subject: string; subtopic: string | null }[] = useMemo(() => {
    const seen = new Set<string>();
    const rows: { subject: string; subtopic: string | null }[] = [];
    for (const c of cells) {
      const key = `${c.subject}||${c.subtopic ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ subject: c.subject, subtopic: c.subtopic });
    }
    return rows;
  }, [cells]);

  const cellByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) {
      m.set(`${c.subject}||${c.subtopic ?? ''}||${c.rootCause}`, c.count);
    }
    return m;
  }, [cells]);

  const rowTotals = useMemo(() => heatmapRowTotals(cells), [cells]);
  const rowKeys = useMemo(
    () =>
      [...unsortedRowKeys].sort((a, b) => {
        const aKey = `${a.subject}||${a.subtopic ?? ''}`;
        const bKey = `${b.subject}||${b.subtopic ?? ''}`;
        return (rowTotals.get(bKey) ?? 0) - (rowTotals.get(aKey) ?? 0);
      }),
    [unsortedRowKeys, rowTotals]
  );
  const attemptsByRow = useMemo(() => {
    const counts = new Map<string, number>();
    if (invalidRange) return counts;
    for (const question of questions) {
      const day = calendarDateInTimeZone(question.created_at, timeZone);
      if (day < from || day > to) continue;
      const key = `${question.subject}||${groupBySubtopic ? question.subtopic ?? '' : ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [questions, from, to, groupBySubtopic, timeZone, invalidRange]);
  const rowMax = useMemo(() => {
    let max = 0;
    for (const c of cells) if (c.count > max) max = c.count;
    return Math.max(1, max);
  }, [cells]);

  const rowsShown = rowKeys.slice(0, 40);
  const rowTotalMax = Math.max(1, ...rowTotals.values());

  function openJournalForCell(
    subject: string,
    subtopic: string | null,
    cause: CauseKey
  ) {
    const params = new URLSearchParams();
    params.set('subject', subject);
    if (subtopic) params.set('subtopic', subtopic);
    params.set('cause', cause);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    navigate(`/journal?${params.toString()}`);
  }

  return (
    <div className="native-heatmap-page flex flex-col gap-4">
      <PageHeader
        title="Weakness heatmap"
        description="Where mistakes concentrate. Loud cells are targets. Click a cell to open the journal there."
      />

      <Card className="native-heatmap-filters">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="u-label">From</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} mono className="w-[160px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="u-label">Window</span>
            <div className="inline-flex divide-x divide-border overflow-hidden rounded border border-border bg-bg-raised shadow-sm">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setFrom(addDaysISO(today, -(days - 1)));
                    setTo(today);
                  }}
                  className="h-9 px-2.5 text-[12px] text-text-muted transition-colors hover:bg-bg-overlay hover:text-text"
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="u-label">To</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} mono className="w-[160px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="u-label">Granularity</span>
            <div className="inline-flex divide-x divide-border overflow-hidden rounded border border-border bg-bg-raised shadow-sm">
              <button
                type="button"
                onClick={() => setGroupBySubtopic(false)}
                className={cn(
                  'h-9 px-3 text-[12px] transition-colors active:scale-95',
                  !groupBySubtopic
                    ? 'bg-accent-faint font-semibold text-accent'
                    : 'text-text-muted hover:bg-bg-overlay hover:text-text'
                )}
              >
                Subject
              </button>
              <button
                type="button"
                onClick={() => setGroupBySubtopic(true)}
                className={cn(
                  'h-9 px-3 text-[12px] transition-colors active:scale-95',
                  groupBySubtopic
                    ? 'bg-accent-faint font-semibold text-accent'
                    : 'text-text-muted hover:bg-bg-overlay hover:text-text'
                )}
              >
                Subject × subtopic
              </button>
            </div>
          </div>
          <div className="ml-auto flex flex-col gap-0.5 text-[12px] text-text-faint">
            <span className="u-label">Evidence</span>
            <span className="u-num">
              {cells.reduce((n, c) => n + c.count, 0)} mistakes across{' '}
              {rowKeys.length} {plural(rowKeys.length, 'row')}
            </span>
          </div>
        </CardBody>
        {invalidRange && (
          <p className="border-t border-danger/25 bg-danger-faint/40 px-4 py-2 text-[12px] text-danger">
            The start date must be on or before the end date.
          </p>
        )}
      </Card>

      {invalidRange ? null : rowsShown.length === 0 ? (
        <Card>
          <Empty
            title="No mistakes in this window"
            hint="Widen the date range or tag more questions."
            className="border-0 py-10"
          />
        </Card>
      ) : (
        <Card className="native-heatmap-card overflow-hidden">
          <div className="native-heatmap-list hidden" aria-label="Weakness heatmap by subject">
            <div className="native-heatmap-list-intro">
              <p className="u-label text-accent">Mistake concentration</p>
              <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                Darker cells need more attention. Tap any numbered cause to open those questions.
              </p>
            </div>
            {rowsShown.map((row) => {
              const ink = subjectInk(row.subject);
              const rowKey = `${row.subject}||${row.subtopic ?? ''}`;
              const rowTotal = rowTotals.get(rowKey) ?? 0;
              const attempts = attemptsByRow.get(rowKey) ?? 0;
              return (
                <article key={rowKey} className="native-heatmap-row-card">
                  <header className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-2.5">
                      <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', ink.dot)} />
                      <span className="min-w-0">
                        <span className="block font-display text-[17px] font-semibold leading-snug text-text">
                          {row.subject}
                        </span>
                        {row.subtopic ? (
                          <span className="mt-1 block text-[12px] leading-relaxed text-text-muted">
                            {row.subtopic}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="native-heatmap-total shrink-0">
                      <span className="u-num text-[17px] font-semibold">{rowTotal}</span>
                      <span className="text-[9px] uppercase tracking-[0.08em]">
                        of {attempts}
                      </span>
                    </span>
                  </header>

                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    {CAUSE_COLUMNS.filter(
                      (cause) => (cellByKey.get(`${rowKey}||${cause.key}`) ?? 0) > 0
                    ).map((cause) => {
                      const count = cellByKey.get(`${rowKey}||${cause.key}`) ?? 0;
                      const intensity = count === 0 ? 0 : count / rowMax;
                      const { bg, text } = cellColor(intensity);
                      const label = `${count} ${plural(count, 'mistake')} in ${row.subject}${row.subtopic ? ` · ${row.subtopic}` : ''} · ${cause.label}`;
                      return (
                        <button
                          key={cause.key}
                          type="button"
                          disabled={count === 0}
                          onClick={() => openJournalForCell(row.subject, row.subtopic, cause.key)}
                          aria-label={label}
                          className={cn(
                            'native-heatmap-cause flex min-h-[62px] items-center justify-between gap-2 rounded-xl border px-3 text-left transition-transform',
                            bg,
                            text,
                            count > 0
                              ? 'border-current/10 active:scale-[0.98]'
                              : 'cursor-default border-border/55'
                          )}
                        >
                          <span className="min-w-0 text-[11px] font-semibold leading-tight">
                            {cause.label}
                          </span>
                          <span className="u-num text-[19px] font-semibold">
                            {count === 0 ? '·' : count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="native-heatmap-desktop u-table-wrap">
            <table className="heatmap-matrix u-matrix-table min-w-[720px] text-[12px]">
              <thead>
                <tr>
                  <th className="heatmap-row-heading sticky left-0 z-20 bg-bg-raised px-3 py-2 text-left font-semibold text-text-muted">
                    Subject{groupBySubtopic ? ' · Subtopic' : ''}
                  </th>
                  {CAUSE_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className="px-2 py-2 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted"
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-text-muted">Row Σ</th>
                </tr>
              </thead>
              <tbody>
                {rowsShown.map((r, i) => {
                  const ink = subjectInk(r.subject);
                  const rowKey = `${r.subject}||${r.subtopic ?? ''}`;
                  const rowTotal = rowTotals.get(rowKey) ?? 0;
                  const attempts = attemptsByRow.get(rowKey) ?? 0;
                  return (
                    <tr key={rowKey} className={cn(i % 2 === 1 && 'bg-bg-overlay/25')}>
                      <td className="heatmap-row-label sticky left-0 z-10 border-r border-border bg-bg-raised px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ink.dot)} />
                          <span className="min-w-0">
                            <span className="block font-medium text-text">{r.subject}</span>
                            {r.subtopic && (
                              <span className="heatmap-subtopic mt-0.5 block truncate text-[11px] text-text-muted">
                                {r.subtopic}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      {CAUSE_COLUMNS.map((c) => {
                        const count = cellByKey.get(`${rowKey}||${c.key}`) ?? 0;
                        const intensity = count === 0 ? 0 : count / rowMax;
                        const { bg, text } = cellColor(intensity);
                        const label = `${count} ${plural(count, 'mistake')} in ${r.subject}${r.subtopic ? ` · ${r.subtopic}` : ''} · ${c.label}`;
                        const disabled = count === 0;
                        return (
                          <td key={c.key} className="p-1 text-center">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => openJournalForCell(r.subject, r.subtopic, c.key)}
                              aria-label={label}
                              title={label}
                              className={cn(
                                'h-9 w-full rounded font-mono text-[12px] transition-transform',
                                bg,
                                text,
                                !disabled &&
                                  'hover:-translate-y-px hover:shadow-card active:translate-y-0',
                                disabled && 'cursor-default'
                              )}
                            >
                              {count === 0 ? '·' : count}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-l border-border px-3 py-2 text-right">
                        <span
                          className={cn(
                            'u-num inline-block rounded px-2 py-0.5',
                            rowTotal / rowTotalMax > 0.6
                              ? 'bg-danger/20 text-danger'
                              : rowTotal / rowTotalMax > 0.3
                                ? 'bg-warn/25 text-warn'
                                : 'text-text-muted'
                          )}
                        >
                          {rowTotal}
                        </span>
                        <span className="ml-1 text-[10px] text-text-faint">/{attempts}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rowKeys.length > rowsShown.length && (
            <div className="border-t border-border px-4 py-2 text-[12px] text-text-faint">
              Showing top 40 rows by mistake total — narrow the window or granularity to see less.
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-4 text-[12px] text-text-muted">
          <span className="u-label">legend</span>
          {[
            { step: 0, label: 'none' },
            { step: 0.15, label: 'light' },
            { step: 0.35, label: 'medium' },
            { step: 0.6, label: 'high' },
            { step: 0.85, label: 'loudest' }
          ].map(({ step, label }) => {
            const { bg } = cellColor(step);
            return (
              <span key={step} className="flex items-center gap-1.5">
                <span className={cn('inline-block h-3 w-6 rounded', bg)} />
                <span className="text-text-faint">
                  {label}
                </span>
              </span>
            );
          })}
          <span className="ml-auto text-[12px] text-text-faint">
            Relative to the loudest cell in this window. Row total shows mistakes / attempts.
          </span>
        </CardBody>
      </Card>
    </div>
  );
}
