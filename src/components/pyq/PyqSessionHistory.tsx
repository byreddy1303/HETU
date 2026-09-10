import { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { secondsToClock } from '@/lib/utils';

const PAGE_SIZE = 10;

function latestAttempts(
  session: PyqSessionRow,
  attempts: readonly PyqAttemptRow[]
): PyqAttemptRow[] {
  const latest = new Map<string, PyqAttemptRow>();
  for (const attempt of attempts) {
    if (attempt.pyq_session_id !== session.id) continue;
    const previous = latest.get(attempt.question_uid);
    if (
      !previous ||
      attempt.attempt_number > previous.attempt_number ||
      (attempt.attempt_number === previous.attempt_number &&
        attempt.attempted_at > previous.attempted_at)
    ) {
      latest.set(attempt.question_uid, attempt);
    }
  }
  return [...latest.values()];
}

function searchableText(
  session: PyqSessionRow,
  subjectLabels: Readonly<Record<string, string>>
): string {
  return [
    session.id,
    session.bank_version,
    session.config.subjectSlug,
    subjectLabels[session.config.subjectSlug],
    session.config.subjectSlugs?.join(' '),
    session.config.subjectSlugs?.map((slug) => subjectLabels[slug]).join(' '),
    session.config.topicSlug,
    session.config.recommendationPreset,
    session.config.savedPrescriptionName,
    session.config.recommendationReasons?.join(' '),
    session.completed_at,
    session.updated_at
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export default function PyqSessionHistory({
  sessions,
  attempts,
  subjectLabels,
  onReview
}: {
  sessions: readonly PyqSessionRow[];
  attempts: readonly PyqAttemptRow[];
  subjectLabels: Readonly<Record<string, string>>;
  onReview: (session: PyqSessionRow) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'practice' | 'exam'>('all');
  const [preset, setPreset] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const presetOptions = useMemo(
    () =>
      [...new Set(sessions.map((session) => session.config.recommendationPreset ?? 'custom'))]
        .filter(Boolean)
        .sort(),
    [sessions]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      sessions.filter((session) => {
        const sessionMode = session.config.mode === 'exam' ? 'exam' : 'practice';
        const sessionPreset = session.config.recommendationPreset ?? 'custom';
        return (
          (mode === 'all' || sessionMode === mode) &&
          (preset === 'all' || sessionPreset === preset) &&
          (!normalizedQuery || searchableText(session, subjectLabels).includes(normalizedQuery))
        );
      }),
    [mode, normalizedQuery, preset, sessions, subjectLabels]
  );
  const visible = filtered.slice(0, visibleCount);

  return (
    <section aria-labelledby="pyq-session-history" className="pt-2">
      <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p id="pyq-session-history" className="u-label">
            Complete session history
          </p>
          <p className="mt-1 text-[12px] text-text-faint">
            Search every saved report by subject, topic, preset, prescription, date, or session ID.
          </p>
        </div>
        <Badge>
          {filtered.length} of {sessions.length}
        </Badge>
      </div>

      <div className="mb-3 grid gap-2 rounded border border-border bg-bg-overlay/20 p-3 sm:grid-cols-[minmax(0,1fr)_150px_170px]">
        <label className="relative">
          <span className="sr-only">Search PYQ session history</span>
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className="pl-9"
            placeholder="Search sessions"
          />
        </label>
        <label>
          <span className="sr-only">Filter PYQ sessions by mode</span>
          <Select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="all">All modes</option>
            <option value="practice">Practice</option>
            <option value="exam">Exam</option>
          </Select>
        </label>
        <label>
          <span className="sr-only">Filter PYQ sessions by preset</span>
          <Select
            value={preset}
            onChange={(event) => {
              setPreset(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="all">All prescriptions</option>
            {presetOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('-', ' ')}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardBody className="p-6 text-center text-[12px] text-text-faint">
            No saved session matches this search. Clear the filters to return to the full ledger.
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-2">
          {visible.map((session) => {
            const sessionAttempts = latestAttempts(session, attempts);
            const correct = sessionAttempts.filter(
              (attempt) => attempt.mark_correct === true
            ).length;
            const wrong = sessionAttempts.filter(
              (attempt) => attempt.mark_correct === false
            ).length;
            const skipped = sessionAttempts.filter(
              (attempt) => attempt.mark_decision === 'SKIP'
            ).length;
            const subject =
              session.config.subjectSlug === 'all'
                ? session.config.subjectSlugs?.length
                  ? session.config.subjectSlugs
                      .map((slug) => subjectLabels[slug] ?? slug)
                      .join(' + ')
                  : 'Mixed subjects'
                : (subjectLabels[session.config.subjectSlug] ?? session.config.subjectSlug);
            const sessionPreset = session.config.recommendationPreset ?? 'custom';
            return (
              <Card key={session.id}>
                <CardBody className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={session.config.mode === 'exam' ? 'guess' : 'neutral'}>
                        {session.config.mode === 'exam' ? 'Exam' : 'Practice'}
                      </Badge>
                      <Badge tone="accent">{sessionPreset.replaceAll('-', ' ')}</Badge>
                      <span className="u-num text-[10px] text-text-faint">
                        {new Date(session.completed_at ?? session.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-[13px] font-semibold text-text">
                      {session.config.savedPrescriptionName
                        ? `${session.config.savedPrescriptionName} · ${subject}`
                        : subject}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-faint">
                      {correct} correct · {wrong} wrong · {skipped} skipped ·{' '}
                      {session.question_uids.length} selected ·{' '}
                      {secondsToClock(session.elapsed_sec)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => onReview(session)}>
                    View report <ArrowRight size={13} />
                  </Button>
                </CardBody>
              </Card>
            );
          })}
          {visible.length < filtered.length ? (
            <Button
              variant="ghost"
              className="justify-center"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
