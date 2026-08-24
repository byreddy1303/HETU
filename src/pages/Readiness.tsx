// F5.3 — exam-day readiness. Evidence and next actions stay primary; rough
// projections remain available in a clearly labelled secondary disclosure.
//
// The score math still lives in lib/readiness.ts (pure); this page composes
// the pieces. Peer median is the only non-local piece — it round-trips to
// the readiness_median_for_band() RPC when the user is signed in.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Compass,
  HelpCircle,
  History,
  Rocket,
  TrendingUp,
  Users2
} from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Empty } from '@/components/ui/Empty';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import {
  computeReadiness,
  computeReadinessBySubject,
  COMPONENT_TOOLTIPS,
  nextMoves,
  readinessComponents,
  type NextMove,
  type ReadinessComponentKey,
  type SubjectReadiness
} from '@/lib/readiness';
import {
  DEBT_LABEL,
  READINESS_CALCULATION_VERSION,
  loadDebt,
  loadSnapshots,
  projectToExam,
  updateDebt,
  upsertSnapshot,
  weeklyDelta,
  type DebtEntry,
  type ReadinessSnapshot
} from '@/lib/readiness-snapshots';
import { EXAM_DATE_DEFAULT, SUBJECTS } from '@/lib/constants';
import { mockScorePercent } from '@/lib/mocks';
import { GATE_2027_BLUEPRINT, GATE_2027_OFFICIAL_SOURCES } from '@/lib/gate-2027';
import { cn, todayISOInTimeZone, weekStartISO } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';

const ACCENT_BY_KEY: Record<ReadinessComponentKey, string> = {
  coverage: 'bg-ink-cobalt/10 text-ink-cobalt',
  retention: 'bg-ink-teal/10 text-ink-teal',
  calibration: 'bg-ink-violet/10 text-ink-violet',
  surface: 'bg-ink-rose/10 text-ink-rose'
};

const BAR_BY_KEY: Record<ReadinessComponentKey, string> = {
  coverage: 'bg-ink-cobalt',
  retention: 'bg-ink-teal',
  calibration: 'bg-ink-violet',
  surface: 'bg-ink-rose'
};

function scoreBand(score: number): { label: string; tone: string } {
  if (score >= 75) return { label: 'strong', tone: 'text-success' };
  if (score >= 55) return { label: 'building', tone: 'text-accent' };
  if (score >= 35) return { label: 'forming', tone: 'text-warn' };
  return { label: 'foundation', tone: 'text-text-muted' };
}

/* ------------------------------- gauge ------------------------------- */

function Gauge({ score }: { score: number }) {
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const capped = Math.max(0, Math.min(100, score));
  const dash = (capped / 100) * circumference;
  const band = scoreBand(score);
  return (
    <div className="relative flex flex-col items-center">
      <svg
        width="180"
        height="180"
        viewBox="0 0 180 180"
        className="overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          className="stroke-bg-overlay"
          strokeWidth="12"
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          className="stroke-accent"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={circumference / 4}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="u-num text-[42px] font-bold text-text">{Math.round(score)}</span>
        <span className={`u-label ${band.tone}`}>{band.label}</span>
      </div>
    </div>
  );
}

/* ------------------------------ page --------------------------------- */

export default function Readiness() {
  const { userId, sandbox, profile } = useAuth();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const today = todayISOInTimeZone(timeZone);

  const questions = useLiveQuery(
    () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const patterns = useLiveQuery(
    () => (userId ? db.patterns.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const pyqAttempts = useLiveQuery(
    () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const mocks = useLiveQuery(
    () => (userId ? db.mock_tests.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  const breakdown = useMemo(
    () => computeReadiness({ questions, pyqAttempts, reattempts, patterns, asOfDate: today }),
    [questions, pyqAttempts, reattempts, patterns, today]
  );

  const perSubject = useMemo(
    () =>
      computeReadinessBySubject(
        { questions, pyqAttempts, reattempts, patterns, asOfDate: today },
        SUBJECTS
      ),
    [questions, pyqAttempts, reattempts, patterns, today]
  );

  const components = useMemo(() => readinessComponents(breakdown), [breakdown]);

  const daysLeft = Math.max(
    0,
    differenceInCalendarDays(parseISO(profile?.exam_date ?? EXAM_DATE_DEFAULT), parseISO(today))
  );

  const moves = useMemo(() => nextMoves(breakdown, perSubject), [breakdown, perSubject]);
  const mockSignal = useMemo(() => {
    const recent = [...mocks]
      .sort((left, right) => left.test_date.localeCompare(right.test_date))
      .slice(-5);
    const normalized = recent.map(mockScorePercent);
    return {
      recent,
      latest: recent.at(-1) ?? null,
      low: normalized.length > 0 ? Math.min(...normalized) : null,
      high: normalized.length > 0 ? Math.max(...normalized) : null
    };
  }, [mocks]);

  /* -------- weekly snapshots + watchlist (per-user localStorage) -------- */

  const [snapshots, setSnapshots] = useState<ReadinessSnapshot[]>([]);
  const [cloudSnapshots, setCloudSnapshots] = useState<ReadinessSnapshot[]>([]);
  const [watchlist, setWatchlist] = useState<DebtEntry[]>([]);

  useEffect(() => {
    if (!userId) {
      setSnapshots([]);
      setCloudSnapshots([]);
      setWatchlist([]);
      return;
    }
    setSnapshots(loadSnapshots(userId));
    setWatchlist(loadDebt(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const snapshotWeek = weekStartISO(today);
    const next: ReadinessSnapshot = {
      date: snapshotWeek,
      score: breakdown.score,
      coverage: breakdown.coverage,
      retention: breakdown.retention,
      calibration: breakdown.calibration,
      surface: breakdown.surface,
      daysToExam: daysLeft,
      calculationVersion: READINESS_CALCULATION_VERSION,
      evidenceCounts: {
        attempts: breakdown.counts.attempts,
        correct: breakdown.counts.correct,
        wrong: breakdown.counts.wrong,
        skipped: breakdown.counts.skipped,
        ungraded: breakdown.counts.ungraded,
        uncertain: breakdown.counts.uncertain
      }
    };
    setSnapshots(upsertSnapshot(userId, next));
    setWatchlist(updateDebt(userId, snapshotWeek, breakdown, perSubject));
  }, [userId, today, breakdown, perSubject, daysLeft]);

  const trendSnapshots = useMemo(() => {
    const byDate = new Map(cloudSnapshots.map((snapshot) => [snapshot.date, snapshot]));
    for (const snapshot of snapshots) byDate.set(snapshot.date, snapshot);
    return [...byDate.values()]
      .filter((snapshot) => snapshot.calculationVersion === READINESS_CALCULATION_VERSION)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cloudSnapshots, snapshots]);

  const delta = useMemo(() => weeklyDelta(trendSnapshots), [trendSnapshots]);
  const projection = useMemo(
    () => projectToExam(trendSnapshots, daysLeft),
    [trendSnapshots, daysLeft]
  );

  /* -------- peer median (Supabase) -------- */

  const [peer, setPeer] = useState<{ median: number | null; sampleSize: number } | null>(null);
  useEffect(() => {
    if (sandbox || !supabaseConfigured || !userId) return;
    let cancelled = false;
    void (async () => {
      // Persist today's snapshot to the DB so the median RPC has data to work
      // with. Idempotent — the (user_id, on_date) PK dedupes.
      await supabase.from('readiness_snapshots').upsert(
        {
          user_id: userId,
          on_date: weekStartISO(today),
          score: breakdown.score,
          days_to_exam: daysLeft,
          calculation_version: READINESS_CALCULATION_VERSION,
          evidence_counts: {
            attempts: breakdown.counts.attempts,
            correct: breakdown.counts.correct,
            wrong: breakdown.counts.wrong,
            skipped: breakdown.counts.skipped,
            ungraded: breakdown.counts.ungraded,
            uncertain: breakdown.counts.uncertain
          },
          components: {
            coverage: breakdown.coverage,
            retention: breakdown.retention,
            calibration: breakdown.calibration,
            surface: breakdown.surface
          }
        },
        { onConflict: 'user_id,on_date' }
      );
      const [historyResult, medianResult] = await Promise.all([
        supabase
          .from('readiness_snapshots')
          .select('on_date, score, days_to_exam, calculation_version, evidence_counts')
          .eq('calculation_version', READINESS_CALCULATION_VERSION)
          .order('on_date', { ascending: true })
          .limit(180),
        supabase.rpc('readiness_median_for_band', { band_width_days: 7 })
      ]);
      if (cancelled) return;
      if (!historyResult.error) {
        setCloudSnapshots(
          (historyResult.data ?? []).map((snapshot) => ({
            date: snapshot.on_date,
            score: snapshot.score,
            coverage: 0,
            retention: 0,
            calibration: 0,
            surface: 0,
            daysToExam: snapshot.days_to_exam,
            calculationVersion: snapshot.calculation_version ?? 1,
            evidenceCounts:
              snapshot.evidence_counts && typeof snapshot.evidence_counts === 'object'
                ? (snapshot.evidence_counts as Record<string, number>)
                : undefined
          }))
        );
      }
      if (medianResult.error) return;
      const data = medianResult.data;
      const row = Array.isArray(data) ? data[0] : data;
      const median =
        row && typeof row.median === 'number'
          ? row.median
          : row && typeof row.median === 'string'
            ? Number(row.median)
            : null;
      const sampleSize = row && typeof row.sample_size === 'number' ? row.sample_size : 0;
      setPeer({ median, sampleSize });
    })();
    return () => {
      cancelled = true;
    };
  }, [sandbox, userId, breakdown, daysLeft, today]);

  const anyData =
    questions.length + pyqAttempts.length + reattempts.length + patterns.length + mocks.length > 0;
  const confidenceCopy =
    breakdown.confidence === 'grounded'
      ? 'Grounded signal — the component samples are large enough to use this as a planning measure.'
      : breakdown.confidence === 'developing'
        ? 'Developing signal — useful for direction, but individual sessions can still move it.'
        : 'Early signal — small samples are deliberately tempered so one answer or an empty queue cannot dominate the score.';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Readiness"
        description="What to work on next, and how much runway you have."
      />

      {!anyData ? (
        <Empty
          title="Nothing to score yet"
          hint="Log a session or a couple of questions and the number will appear. The score is deterministic and traceable to your own data."
        />
      ) : (
        <>
          {/* --- Outcome evidence and official blueprint --- */}
          <Card className="order-1">
            <CardHeader
              title="Recorded mock outcomes"
              aside={
                <a
                  href={GATE_2027_OFFICIAL_SOURCES.pattern}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-text-faint hover:text-accent"
                >
                  official 2027 pattern · {GATE_2027_BLUEPRINT.totalMarks} marks
                </a>
              }
            />
            <CardBody className="flex flex-col gap-4">
              {mockSignal.latest ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded border border-border bg-bg-overlay/40 p-3">
                    <p className="u-label">Latest recorded mock</p>
                    <p className="mt-1 font-display text-[24px] font-bold text-text">
                      <span className="u-num">{mockSignal.latest.total_marks}</span>
                      <span className="text-[13px] font-normal text-text-muted">
                        {' '}
                        / {mockSignal.latest.max_marks}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-text-faint">
                      {mockSignal.latest.name} · {mockSignal.latest.test_date}
                    </p>
                  </div>
                  <div className="rounded border border-border bg-bg-overlay/40 p-3">
                    <p className="u-label">Recent normalized range</p>
                    <p className="u-num mt-1 text-[24px] font-bold text-text">
                      {mockSignal.low}–{mockSignal.high}%
                    </p>
                    <p className="mt-1 text-[11px] text-text-faint">
                      last {mockSignal.recent.length} recorded mock
                      {mockSignal.recent.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="rounded border border-border bg-bg-overlay/40 p-3">
                    <p className="u-label">Official paper blueprint</p>
                    <p className="u-num mt-1 text-[16px] font-semibold text-text">
                      {GATE_2027_BLUEPRINT.durationMinutes} min ·{' '}
                      {GATE_2027_BLUEPRINT.questionCount} questions
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
                      GA {GATE_2027_BLUEPRINT.sectionMarks.generalAptitude} · Engineering
                      Mathematics {GATE_2027_BLUEPRINT.sectionMarks.engineeringMathematics} · CS{' '}
                      {GATE_2027_BLUEPRINT.sectionMarks.coreSubject}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-border bg-bg-overlay/40 p-3 text-[12.5px] text-text-muted">
                  No mock has been recorded yet.{' '}
                  <Link to="/mocks" className="text-accent hover:text-accent-hover">
                    Record one
                  </Link>{' '}
                  to make marks—the closest available outcome signal—lead this page.
                </div>
              )}
              <div className="rounded border border-warn/30 bg-warn/5 p-3 text-[12px] leading-relaxed text-text-muted">
                Recorded mocks are manually entered; unseen-paper, full-length, and validity flags
                are not captured yet. AIR modelling is not prospectively validated, so no numeric
                rank estimate is shown.
              </div>
            </CardBody>
          </Card>

          {/* --- Evidence-adjusted gauge --- */}
          <Card className="order-2">
            <CardBody className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[auto_1fr]">
              <Gauge score={breakdown.score} />
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-faint px-2.5 py-0.5 text-[12px] font-semibold capitalize text-accent">
                    {breakdown.confidence} signal
                  </span>
                  {delta !== null && <DeltaChip delta={delta} />}
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-raised px-2.5 py-0.5 text-[12px] text-text-muted">
                    <TrendingUp size={11} strokeWidth={1.75} className="text-accent" />
                    T−<span className="u-num text-text">{daysLeft}</span>d
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-text-muted">{confidenceCopy}</p>
                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[12px] text-text-muted">
                  <span>
                    <span className="u-num text-text">{breakdown.counts.patterns}</span> patterns
                    encountered
                  </span>
                  <span>
                    <span className="u-num text-text">{breakdown.counts.openReattempts}</span> open
                    re-attempts
                  </span>
                  <span>
                    <span className="u-num text-success">{breakdown.counts.correct}</span> correct ·{' '}
                    <span className="u-num text-danger">{breakdown.counts.wrong}</span> wrong ·{' '}
                    <span className="u-num text-text">{breakdown.counts.skipped}</span> skipped
                  </span>
                  <span>
                    <span className="u-num text-text">{breakdown.counts.uncertain}</span> uncertain
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* --- Next moves --- */}
          {moves.length > 0 && (
            <Card className="order-1">
              <CardHeader
                title="Next 3 moves"
                aside={
                  <span className="text-[11px] text-text-faint">rule-based and inspectable</span>
                }
              />
              <ul className="divide-y divide-border">
                {moves.map((m, i) => (
                  <MoveRow key={`${m.kind}-${m.subject ?? 'all'}-${i}`} move={m} />
                ))}
              </ul>
            </Card>
          )}

          {/* --- Trend chart + projection --- */}
          <details className="order-5 rounded-lg border border-border bg-bg-raised shadow-card">
            <summary className="cursor-pointer px-4 py-3 font-display text-[14px] font-semibold text-text">
              Weekly trend and long-range projection
            </summary>
            <Card className="border-0 shadow-none">
              <CardHeader
                title="Trend & projection"
                aside={
                  projection ? (
                    <span className="text-[11px] text-text-faint">
                      slope{' '}
                      <span
                        className={cn(
                          'u-num',
                          projection.slopePerDay > 0
                            ? 'text-success'
                            : projection.slopePerDay < 0
                              ? 'text-danger'
                              : 'text-text-muted'
                        )}
                      >
                        {projection.slopePerDay >= 0 ? '+' : ''}
                        {projection.slopePerDay}/day
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-text-faint">
                      needs 4 weekly snapshots across 21+ days
                    </span>
                  )
                }
              />
              <CardBody>
                <Sparkline
                  snapshots={trendSnapshots}
                  projectedScore={projection?.projectedScore ?? null}
                  daysToExam={daysLeft}
                />
                {projection && (
                  <p className="mt-3 text-[12.5px] text-text-muted">
                    At the current pace you land on{' '}
                    <span
                      className={cn(
                        'u-num font-semibold',
                        projection.projectedScore >= breakdown.score
                          ? 'text-success'
                          : 'text-danger'
                      )}
                    >
                      {projection.projectedScore}
                    </span>{' '}
                    readiness points by exam day (T−{daysLeft}). This is a simple product-score
                    trend—not expected GATE marks or AIR—and is based on the last{' '}
                    <span className="u-num">{projection.sampleDays}</span> snapshots.
                  </p>
                )}
              </CardBody>
            </Card>
          </details>

          {/* --- Components with tooltips --- */}
          <Card className="order-3">
            <CardHeader
              title="Components"
              aside={
                <span className="text-[11px] text-text-faint">
                  evidence-adjusted · hover for detail
                </span>
              }
            />
            <div className="flex flex-col divide-y divide-border">
              {components.map((c) => {
                const pct = Math.round(c.value * 100);
                const contribPct = Math.round(c.contribution);
                const tip = COMPONENT_TOOLTIPS[c.key];
                return (
                  <div key={c.key} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
                            ACCENT_BY_KEY[c.key]
                          )}
                        >
                          {c.key}
                        </span>
                        <span className="font-display text-[14px] font-semibold text-text">
                          {c.label}
                        </span>
                        <span
                          className="group relative inline-flex text-text-faint hover:text-text"
                          tabIndex={0}
                          aria-label={`${c.label} explanation`}
                        >
                          <HelpCircle size={12} strokeWidth={1.75} />
                          <span className="pointer-events-none absolute left-4 top-full z-30 mt-1 hidden w-64 rounded-lg border border-border bg-bg-raised p-3 text-left text-[11.5px] leading-relaxed text-text shadow-lift group-hover:block group-focus:block">
                            <span className="block text-text-muted">{tip.what}</span>
                            <span className="mt-1 block text-text">
                              <span className="u-label">Lift it:</span> {tip.lift}
                            </span>
                            <span className="mt-1 block text-text-faint">
                              Healthy: {tip.healthy}
                            </span>
                          </span>
                        </span>
                      </div>
                      <div className="u-num text-[12px] text-text-faint">
                        <span className="text-text">{pct}%</span> ·{' '}
                        <span className="text-text-muted">
                          contributes {contribPct} pts (of {Math.round(c.weight * 100)})
                        </span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-bg-overlay">
                      <div
                        className={cn('h-2 rounded', BAR_BY_KEY[c.key])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[12px] text-text-muted">{c.hint}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* --- Per-subject matrix --- */}
          <Card className="order-4">
            <CardHeader
              title="Per-subject matrix"
              aside={<span className="text-[11px] text-text-faint">weak cells highlighted</span>}
            />
            <CardBody className="p-0">
              <SubjectMatrix rows={perSubject} />
            </CardBody>
          </Card>

          {/* --- Persistent evidence watchlist + optional peer context --- */}
          <div className="order-1 grid grid-cols-1 gap-4 md:grid-cols-2">
            <details className="order-2 rounded-lg border border-border bg-bg-raised shadow-card">
              <summary className="cursor-pointer px-4 py-3 font-display text-[14px] font-semibold text-text">
                Optional peer context
              </summary>
              <Card className="border-0 shadow-none">
                <CardHeader
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      <Users2 size={13} strokeWidth={1.75} /> Peer band
                    </span>
                  }
                />
                <CardBody>
                  {sandbox || !supabaseConfigured ? (
                    <p className="text-[12.5px] text-text-muted">
                      Sign in to compare against peers in the same T− window.
                    </p>
                  ) : peer === null ? (
                    <p className="text-[12.5px] text-text-faint">Loading peer data…</p>
                  ) : peer.median === null || peer.sampleSize < 3 ? (
                    <p className="text-[12.5px] text-text-muted">
                      Not enough peers in your T−{daysLeft}±7 band yet
                      {peer.sampleSize > 0 ? ` (${peer.sampleSize} logged).` : '.'} Median is hidden
                      until at least 3 people have snapshots — no single peer's number ever leaks.
                    </p>
                  ) : (
                    <div>
                      <p className="text-[12.5px] text-text-muted">
                        Median across <span className="u-num text-text">{peer.sampleSize}</span>{' '}
                        peers in T−{daysLeft}±7 days:
                      </p>
                      <p className="mt-1 u-num text-[32px] font-bold text-text">
                        {Math.round(peer.median)}
                      </p>
                      <p className="text-[12px] text-text-muted">
                        You are{' '}
                        <span
                          className={cn(
                            'font-semibold',
                            breakdown.score > peer.median
                              ? 'text-success'
                              : breakdown.score < peer.median
                                ? 'text-danger'
                                : 'text-text'
                          )}
                        >
                          {breakdown.score - Math.round(peer.median) >= 0 ? '+' : ''}
                          {breakdown.score - Math.round(peer.median)}
                        </span>{' '}
                        vs. median.
                      </p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </details>

            <Card className="order-1">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <History size={13} strokeWidth={1.75} /> Persistent weak spots
                  </span>
                }
                aside={
                  watchlist.length > 0 && (
                    <span className="text-[11px] text-text-faint">{watchlist.length} observed</span>
                  )
                }
              />
              <CardBody className="p-0">
                {watchlist.length === 0 ? (
                  <p className="p-4 text-[12.5px] text-text-muted">
                    No component has remained below its healthy threshold.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {watchlist.slice(0, 5).map((d) => (
                      <li key={d.key} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase',
                            ACCENT_BY_KEY[d.component]
                          )}
                        >
                          {d.component}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-text">
                          {d.subject ? d.subject : 'Overall'}{' '}
                          <span className="text-text-muted">· {DEBT_LABEL[d.component]}</span>
                        </span>
                        <span className="u-num text-text-faint">
                          {d.weeksHeld === 0 ? 'new' : `${d.weeksHeld}w`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ delta chip ---------------------------- */

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-raised px-2.5 py-0.5 text-[12px] text-text-muted">
        <ArrowRight size={11} strokeWidth={1.75} />
        flat vs. last week
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
        up
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-danger/40 bg-danger/10 text-danger'
      )}
    >
      {up ? <ArrowUp size={11} strokeWidth={2} /> : <ArrowDown size={11} strokeWidth={2} />}
      {up ? '+' : ''}
      {delta} vs. last week
    </span>
  );
}

/* ------------------------------- moves ------------------------------- */

function MoveRow({ move }: { move: NextMove }) {
  const urgencyTone =
    move.urgency === 'high'
      ? 'text-danger'
      : move.urgency === 'medium'
        ? 'text-warn'
        : 'text-text-muted';
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <Rocket size={12} strokeWidth={1.75} className={urgencyTone} />
        <p className="font-display text-[14px] font-semibold text-text">{move.title}</p>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide',
            move.urgency === 'high' && 'border-danger/40 bg-danger-faint/50 text-danger',
            move.urgency === 'medium' && 'border-warn/40 bg-warn/5 text-warn',
            move.urgency === 'low' && 'border-border bg-bg-overlay text-text-muted'
          )}
        >
          {move.urgency}
        </span>
      </div>
      <p className="text-[12.5px] text-text-muted">{move.why}</p>
      <p className="text-[12.5px] text-text">
        {move.action}
        {move.href && (
          <>
            {' '}
            <Link
              to={move.href}
              className="inline-flex items-center gap-0.5 text-accent hover:text-accent-hover"
            >
              <Compass size={11} strokeWidth={1.75} />
              open
            </Link>
          </>
        )}
      </p>
    </li>
  );
}

/* ---------------------------- sparkline ---------------------------- */

function Sparkline({
  snapshots,
  projectedScore,
  daysToExam
}: {
  snapshots: ReadinessSnapshot[];
  projectedScore: number | null;
  daysToExam: number;
}) {
  const width = 640;
  const height = 140;
  const paddingX = 8;
  const paddingY = 12;

  if (snapshots.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-[12px] text-text-faint">
        Snapshots will start appearing after your first Readiness visit.
      </div>
    );
  }

  const recent = snapshots.slice(-60);
  const n = recent.length;
  const usable = width - paddingX * 2;
  const usableY = height - paddingY * 2;

  const points = recent.map((s, i) => {
    const x = paddingX + (i / Math.max(1, n - 1)) * usable * 0.7;
    const y = paddingY + (1 - s.score / 100) * usableY;
    return { x, y, score: s.score, date: s.date };
  });

  const lastReal = points[points.length - 1];
  let projected: { x: number; y: number } | null = null;
  if (projectedScore !== null && daysToExam > 0) {
    projected = {
      x: paddingX + usable,
      y: paddingY + (1 - projectedScore / 100) * usableY
    };
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      role="img"
      aria-label="Readiness score trend"
      viewBox={`0 0 ${width} ${height}`}
      className="h-[140px] w-full"
      preserveAspectRatio="none"
    >
      <line
        x1={paddingX}
        x2={width - paddingX}
        y1={paddingY + usableY * 0.4}
        y2={paddingY + usableY * 0.4}
        className="stroke-border/60"
        strokeDasharray="2 3"
      />
      <line
        x1={paddingX}
        x2={width - paddingX}
        y1={paddingY + usableY * 0.7}
        y2={paddingY + usableY * 0.7}
        className="stroke-border/40"
        strokeDasharray="2 3"
      />
      <path
        d={linePath}
        className="stroke-accent"
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle
          key={`${p.date}-${i}`}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 3 : 1.5}
          className="fill-accent"
        />
      ))}
      {projected && (
        <>
          <line
            x1={lastReal.x}
            y1={lastReal.y}
            x2={projected.x}
            y2={projected.y}
            className="stroke-text-faint"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <circle
            cx={projected.x}
            cy={projected.y}
            r={4}
            className="fill-bg-raised stroke-text-muted"
            strokeWidth={1.5}
          />
        </>
      )}
      <text x={paddingX} y={paddingY - 2} className="fill-text-faint" fontSize="9">
        100
      </text>
      <text x={paddingX} y={height - 2} className="fill-text-faint" fontSize="9">
        0
      </text>
      {projected && (
        <text x={projected.x - 34} y={projected.y - 6} className="fill-text-muted" fontSize="10">
          exam day
        </text>
      )}
    </svg>
  );
}

/* --------------------------- subject matrix --------------------------- */

const CELL_THRESHOLDS: Record<ReadinessComponentKey, [number, number]> = {
  coverage: [0.6, 0.4],
  retention: [0.55, 0.35],
  calibration: [0.65, 0.4],
  surface: [0.6, 0.4]
};

function cellTone(key: ReadinessComponentKey, v: number, hasSignal: boolean): string {
  if (!hasSignal) return 'text-text-faint';
  const [good, ok] = CELL_THRESHOLDS[key];
  if (v >= good) return 'text-success';
  if (v >= ok) return 'text-warn';
  return 'text-danger font-semibold';
}

function SubjectMatrix({ rows }: { rows: SubjectReadiness[] }) {
  const shown = [...rows].sort((a, b) => {
    if (a.hasSignal !== b.hasSignal) return a.hasSignal ? -1 : 1;
    if (!a.hasSignal && !b.hasSignal) return a.subject.localeCompare(b.subject);
    return a.score - b.score || a.subject.localeCompare(b.subject);
  });
  return (
    <div className="u-mobile-cards-wrap u-table-wrap">
      <table className="u-data-table u-mobile-cards min-w-[680px] text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
            <th className="px-4 py-2 font-mono">Subject</th>
            <th className="px-2 py-2 text-right font-mono">Score</th>
            <th className="px-2 py-2 text-right font-mono">Coverage</th>
            <th className="px-2 py-2 text-right font-mono">Retention</th>
            <th className="px-2 py-2 text-right font-mono">Calibration</th>
            <th className="px-2 py-2 text-right font-mono">Surface</th>
            <th className="px-4 py-2 font-mono">Signal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((r) => {
            const ink = subjectInk(r.subject);
            return (
              <tr key={r.subject}>
                <td data-label="Subject" data-mobile-primary className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-1.5 w-1.5 rounded-full', ink.dot)} />
                    <span className="font-medium text-text">{r.subject}</span>
                  </span>
                </td>
                <td
                  data-label="Score"
                  className="u-num px-2 py-2 text-right font-semibold text-text"
                >
                  {r.hasSignal ? r.score : '—'}
                </td>
                <td
                  data-label="Coverage"
                  className={cn(
                    'u-num px-2 py-2 text-right',
                    cellTone('coverage', r.coverage, r.hasSignal)
                  )}
                >
                  {r.hasSignal ? `${Math.round(r.coverage * 100)}%` : '—'}
                </td>
                <td
                  data-label="Retention"
                  className={cn(
                    'u-num px-2 py-2 text-right',
                    cellTone('retention', r.retention, r.hasSignal)
                  )}
                >
                  {r.hasSignal ? `${Math.round(r.retention * 100)}%` : '—'}
                </td>
                <td
                  data-label="Calibration"
                  className={cn(
                    'u-num px-2 py-2 text-right',
                    cellTone('calibration', r.calibration, r.hasSignal)
                  )}
                >
                  {r.hasSignal ? `${Math.round(r.calibration * 100)}%` : '—'}
                </td>
                <td
                  data-label="Surface"
                  className={cn(
                    'u-num px-2 py-2 text-right',
                    cellTone('surface', r.surface, r.hasSignal)
                  )}
                >
                  {r.hasSignal ? `${Math.round(r.surface * 100)}%` : '—'}
                </td>
                <td
                  data-label="Signal"
                  data-mobile-wide
                  className="px-4 py-2 text-[11px] text-text-faint"
                >
                  {r.hasSignal
                    ? `${r.counts.attempts}a · ${r.counts.patterns}p · ${r.counts.eligibleReattempts}r · ${r.counts.uncertain} uncertain`
                    : 'no data yet'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
