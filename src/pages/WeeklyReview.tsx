// Weekly review: inspect the data, name the cause, isolate the weakest concept,
// and commit to one concrete fix.
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import type { WeeklyReviewRow } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Empty';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { writeLocal } from '@/lib/sync';
import {
  summarizeWeek,
  weeklyDraftFingerprint,
  type WeeklyDataSummary,
  type WeeklyDraft
} from '@/lib/analysis';
import {
  cn,
  formatDate,
  nowISO,
  todayISOInTimeZone,
  uuid,
  weekStartISO
} from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { ROOT_CAUSES } from '@/lib/constants';

export type WeeklyStep = 1 | 2 | 3 | 4;

const STEP_LABELS: { id: WeeklyStep; label: string }[] = [
  { id: 1, label: 'this week' },
  { id: 2, label: 'root cause' },
  { id: 3, label: 'weakest concept' },
  { id: 4, label: 'the fix' }
];

type Draft = WeeklyDraft;

const EMPTY_DRAFT: Draft = {
  root_cause_summary: '',
  weakest_concept: '',
  this_weeks_fix: ''
};

export default function WeeklyReview() {
  const { userId, profile } = useAuth();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const weekStart = weekStartISO(todayISOInTimeZone(timeZone));

  const questions = useLiveQuery(
    async () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  const existing = useLiveQuery(
    async () => {
      if (!userId) return null;
      const row = await db.weekly_reviews
        .where('[user_id+week_start]')
        .equals([userId, weekStart])
        .first();
      return row ?? null;
    },
    [userId, weekStart],
    undefined
  );

  const [step, setStep] = useState<WeeklyStep>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing === undefined) return;
    if (existing) {
      const hydrated: Draft = {
        root_cause_summary: existing.root_cause_summary ?? '',
        weakest_concept: existing.weakest_concept ?? '',
        this_weeks_fix: existing.this_weeks_fix ?? ''
      };
      setDraft(hydrated);
      setSavedFingerprint(weeklyDraftFingerprint(hydrated));
    }
  }, [existing]);

  const summary: WeeklyDataSummary = useMemo(
    () => summarizeWeek(questions, weekStart, timeZone),
    [questions, weekStart, timeZone]
  );

  const currentDirty = weeklyDraftFingerprint(draft) !== savedFingerprint;

  function requireOnStep(): string | null {
    if (step === 2 && !draft.root_cause_summary.trim())
      return 'Write one sentence naming the pattern behind this week\'s misses.';
    if (step === 3 && !draft.weakest_concept.trim())
      return 'Name the single weakest concept — the one you\'d hate to see on the paper.';
    if (step === 4 && !draft.this_weeks_fix.trim())
      return 'Commit to ONE concrete action for the coming week.';
    return null;
  }

  function goNext() {
    setError(null);
    if (step === 4) return;
    if (step >= 2 && step <= 3) {
      const problem = requireOnStep();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setStep((s) => (Math.min(4, s + 1) as WeeklyStep));
  }

  function goBack() {
    setError(null);
    if (step === 1) return;
    setStep((s) => (Math.max(1, s - 1) as WeeklyStep));
  }

  async function save() {
    if (!userId) return;
    const problem =
      (!draft.root_cause_summary.trim() && 'root cause') ||
      (!draft.weakest_concept.trim() && 'weakest concept') ||
      (!draft.this_weeks_fix.trim() && 'this week\'s fix');
    if (problem) {
      setError(`Fill in ${problem} before saving.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = nowISO();
      const row: WeeklyReviewRow = existing
        ? {
            ...existing,
            root_cause_summary: draft.root_cause_summary.trim(),
            weakest_concept: draft.weakest_concept.trim(),
            this_weeks_fix: draft.this_weeks_fix.trim()
          }
        : {
            id: uuid(),
            user_id: userId,
            week_start: weekStart,
            root_cause_summary: draft.root_cause_summary.trim(),
            weakest_concept: draft.weakest_concept.trim(),
            this_weeks_fix: draft.this_weeks_fix.trim(),
            created_at: now
          };
      await writeLocal('weekly_reviews', row);
      setSavedFingerprint(weeklyDraftFingerprint(draft));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Weekly review"
        description={
          <>
            Week of <span className="u-num">{formatDate(weekStart, 'dd MMM')}</span> —{' '}
            <span className="u-num">{formatDate(summary.weekEnd, 'dd MMM yy')}</span>
            {savedFingerprint && (
              <Badge tone="success" className="ml-2 align-middle">
                Saved
              </Badge>
            )}
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <ol className="flex flex-wrap items-center gap-1.5">
            {STEP_LABELS.map((s, i) => {
              const done =
                s.id === 1 ||
                (s.id === 2 && draft.root_cause_summary.trim().length > 0) ||
                (s.id === 3 && draft.weakest_concept.trim().length > 0) ||
                (s.id === 4 && draft.this_weeks_fix.trim().length > 0);
              const active = s.id === step;
              return (
                <li key={s.id} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={cn('h-px w-3', done || active ? 'bg-accent/40' : 'bg-border')}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(s.id)}
                    className={cn(
                      'flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors',
                      active
                        ? 'bg-accent text-accent-contrast'
                        : done
                          ? 'bg-accent-faint text-accent'
                          : 'bg-bg-overlay text-text-faint'
                    )}
                  >
                    <span>{s.id}.</span> {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        {step === 1 && <DataStep summary={summary} />}
        {step === 2 && (
          <NarrativeStep
            label="Root cause of this week's misses"
            hint="One sentence. The pattern behind the mistakes — not what the concept was, but why the wrong answer felt right."
            multiline
            value={draft.root_cause_summary}
            onChange={(v) => setDraft((d) => ({ ...d, root_cause_summary: v }))}
            placeholder="e.g. I keep confusing weak-entity keys with foreign keys — I reach for FK by reflex whenever I see 'depends on'."
            causeSuggestions
          />
        )}
        {step === 3 && (
          <NarrativeStep
            label="Weakest concept"
            hint="The single node you'd hate to see on the paper. Concept, not chapter."
            value={draft.weakest_concept}
            onChange={(v) => setDraft((d) => ({ ...d, weakest_concept: v }))}
            placeholder="e.g. Cache line replacement policies under set-associative mapping"
          />
        )}
        {step === 4 && (
          <NarrativeStep
            label="This week's ONE fix"
            hint="Actionable, testable. Not 'study harder'. Something you can point at on Sunday and say done/not done."
            value={draft.this_weeks_fix}
            onChange={(v) => setDraft((d) => ({ ...d, this_weeks_fix: v }))}
            placeholder="e.g. Re-derive LRU vs. FIFO vs. optimal for the three GATE 2020 cache questions, timed."
          />
        )}
      </motion.div>

      {step === 4 && savedFingerprint && !currentDirty && (
        <Card className="border-success/35 bg-success-faint/35">
          <CardBody>
            <p className="u-label text-success">Committed for this week</p>
            <p className="mt-2 font-display text-[17px] font-semibold leading-relaxed text-text">
              <span className="u-highlight">{draft.this_weeks_fix}</span>
            </p>
            <p className="mt-2 text-[11.5px] text-text-muted">
              This is the same fix shown on the Dashboard.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex flex-col gap-2">
          {error && (
            <p className="flex items-center gap-1.5 text-[12px] text-danger">
              <AlertCircle size={12} strokeWidth={2} />
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 1}>
              <ArrowLeft size={14} strokeWidth={1.75} className="mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {step === 4 && (
                <Button
                  variant="primary"
                  onClick={() => void save()}
                  disabled={saving || !currentDirty}
                >
                  {saving ? 'Saving…' : currentDirty ? 'Save review' : 'Saved'}
                </Button>
              )}
              {step !== 4 && (
                <Button variant="primary" onClick={goNext}>
                  Next
                  <ArrowRight size={14} strokeWidth={1.75} className="ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function DataStep({ summary }: { summary: WeeklyDataSummary }) {
  if (summary.totalQ === 0) {
    return (
      <Empty
        title="No questions logged this week"
        hint="Weekly review looks at what you tagged Mon–Sun. Solve, tag, come back."
      />
    );
  }
  const notClean = summary.totalQ - summary.clean;
  const cleanRate = summary.totalQ === 0 ? 0 : Math.round((summary.clean / summary.totalQ) * 100);
  const volumeLeader = summary.bySubject[0];
  const rateLeader = [...summary.bySubject]
    .filter((subject) => subject.count >= 3)
    .sort(
      (a, b) =>
        b.wrongish / b.count - a.wrongish / a.count || b.wrongish - a.wrongish
    )[0];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="This week's data" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DataCell label="Total Q" value={summary.totalQ} color="text-text" />
            <DataCell label="Not clean" value={notClean} color="text-danger" />
            <DataCell label="Clean" value={summary.clean} color="text-success" />
            <DataCell label="Clean rate" value={cleanRate} color="text-ink-teal" suffix="%" />
          </div>
          <p className="mt-3 text-[12px] text-text-muted">
            Outcome mix:{' '}
            <span className="u-num text-warn">{summary.slow} slow</span> ·{' '}
            <span className="u-num text-guess">{summary.guess} guessed</span> ·{' '}
            <span className="u-num text-danger">{summary.wrong} wrong</span>
            <span className="text-text-faint">
              {' '}({summary.byOutcome['W-C']} concept, {summary.byOutcome['W-E']} execution,{' '}
              {summary.byOutcome['W-R']} reading)
            </span>
          </p>
        </CardBody>
      </Card>

      {(volumeLeader || rateLeader) && (
        <Card>
          <CardHeader title="What the week is saying" />
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {volumeLeader && (
              <div className="rounded border border-border bg-bg-overlay/35 p-3">
                <p className="u-label">Most misses by volume</p>
                <p className="mt-1 font-display text-[15px] font-semibold text-text">
                  {volumeLeader.subject}
                </p>
                <p className="mt-1 text-[12px] text-text-muted">
                  {volumeLeader.wrongish} of {volumeLeader.count} not clean
                </p>
              </div>
            )}
            {rateLeader && (
              <div className="rounded border border-border bg-bg-overlay/35 p-3">
                <p className="u-label">Highest miss rate</p>
                <p className="mt-1 font-display text-[15px] font-semibold text-text">
                  {rateLeader.subject}
                </p>
                <p className="mt-1 text-[12px] text-text-muted">
                  {Math.round((rateLeader.wrongish / rateLeader.count) * 100)}% not clean across{' '}
                  {rateLeader.count} questions
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Subjects — where the misses landed" />
        <CardBody>
          {summary.bySubject.length === 0 ? (
            <p className="text-[13px] text-text-faint">No subjects tagged this week.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {summary.bySubject.map((s) => {
                const ink = subjectInk(s.subject);
                const wrongPct =
                  s.count === 0 ? 0 : Math.round((s.wrongish / s.count) * 100);
                return (
                  <li key={s.subject} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span className={cn('h-1.5 w-1.5 rounded-full', ink.dot)} />
                      {s.subject}
                    </span>
                    <span className="u-num text-[12px] text-text-muted">
                      {s.wrongish}/{s.count} not clean
                      <span className="ml-2 text-text-faint">({wrongPct}%)</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {summary.topPatterns.some((pattern) => pattern.count > 0) && (
        <Card>
          <CardHeader title="Recurring patterns" />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {summary.topPatterns.filter((pattern) => pattern.count > 0).map((p) => (
                <Badge key={p.name} tone="neutral">
                  {p.name} · {p.count}/{p.total} not clean
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {Object.keys(summary.byRootCause).length > 0 && (
        <Card>
          <CardHeader title="Root causes chosen" />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {ROOT_CAUSES.filter((rc) => (summary.byRootCause[rc.value] ?? 0) > 0).map((rc) => (
                <Badge key={rc.value} tone="neutral">
                  {rc.label} ×{summary.byRootCause[rc.value]}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function DataCell({
  label,
  value,
  color,
  muted = false,
  suffix = ''
}: {
  label: string;
  value: number;
  color: string;
  muted?: boolean;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-bg-overlay/40 px-3 py-2">
      <span className="u-label">{label}</span>
      <span
        className={cn(
          'u-num text-[20px] font-semibold leading-none',
          value > 0 ? color : 'text-text-faint',
          muted && 'text-[16px]'
        )}
      >
        {value}{suffix}
      </span>
    </div>
  );
}

function NarrativeStep({
  label,
  hint,
  placeholder,
  value,
  onChange,
  multiline = false,
  causeSuggestions = false
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  causeSuggestions?: boolean;
}) {
  return (
    <Card>
      <CardHeader title={label} />
      <CardBody className="flex flex-col gap-3">
        <p className="text-[12px] text-text-faint">{hint}</p>
        {multiline ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={4}
            autoFocus
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        )}
        {causeSuggestions && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="u-label text-text-faint">frame it as</span>
            {ROOT_CAUSES.map((rc) => (
              <Badge key={rc.value} tone="neutral">
                {rc.label}
              </Badge>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
