// F5.3 — exam-day readiness score. Composite of four subscores; each is a
// [0..1] fraction, then weighted per §5.3. Pure math so the same function
// runs client-side (for immediate feedback) and inside compute-readiness.
import type { PatternRow, PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';
import { normalizeAttemptEvidence, type AttemptEvidenceEvent } from '@/lib/attempt-evidence';
import { canonicalSubjectLabel } from '@/lib/subjects';
import { todayISO } from '@/lib/utils';

export const READINESS_CALCULATION_VERSION = 2 as const;

export const TARGET_PATTERN_LIBRARY = 400;
export const BASELINE_OPEN_SURFACE = 50;

export const WEIGHTS = {
  coverage: 0.3,
  retention: 0.25,
  calibration: 0.25,
  surface: 0.2
} as const;

export interface ReadinessInputs {
  questions: QuestionRow[];
  /** Immutable answer receipts. Optional only for old callers/backups. */
  pyqAttempts?: PyqAttemptRow[];
  reattempts: ReattemptRow[];
  patterns: PatternRow[];
  /** Calendar date in the learner/profile timezone (YYYY-MM-DD). */
  asOfDate?: string;
}

export interface ReadinessBreakdown {
  score: number; // 0..100 rounded
  coverage: number; // 0..1
  retention: number; // 0..1
  calibration: number; // 0..1
  surface: number; // 0..1
  confidence: 'early' | 'developing' | 'grounded';
  counts: {
    questions: number;
    attempts: number;
    correct: number;
    wrong: number;
    skipped: number;
    ungraded: number;
    uncertain: number;
    legacyJournalAttempts: number;
    patterns: number;
    totalReattempts: number;
    eligibleReattempts: number;
    stabilised: number; // D30 + MASTERED
    openReattempts: number;
    markedDecisions: number;
    markedCorrect: number;
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Coverage: how much of the target library has been *encountered* at all. */
export function coverage(patternCount: number): number {
  return clamp01(patternCount / TARGET_PATTERN_LIBRARY);
}

/** Retention: fraction of re-attempts that reached D30 or MASTERED. */
export function retention(reattempts: ReattemptRow[]): number {
  if (reattempts.length === 0) return 0;
  const stabilised = reattempts.filter((r) => r.stage === 'D30' || r.stage === 'MASTERED').length;
  return clamp01(stabilised / reattempts.length);
}

/** Calibration: correctness among answered events. Uncertain answers are
 * included; uncertainty is an orthogonal signal, not a discarded outcome. */
export function calibration(events: AttemptEvidenceEvent[]): number {
  const answered = events.filter(
    (event) => event.outcome === 'correct' || event.outcome === 'wrong'
  );
  if (answered.length === 0) return 0;
  const correct = answered.filter((event) => event.outcome === 'correct').length;
  return clamp01(correct / answered.length);
}

/** Surface: inverse of open re-attempts against a baseline. Small surface → high score. */
export function surface(openReattemptCount: number): number {
  return clamp01(1 - openReattemptCount / BASELINE_OPEN_SURFACE);
}

export function computeReadiness(inputs: ReadinessInputs): ReadinessBreakdown {
  const asOf = inputs.asOfDate ?? todayISO();
  const ledger = normalizeAttemptEvidence({
    attempts: inputs.pyqAttempts ?? [],
    questions: inputs.questions
  });
  const answered = ledger.counts.correct + ledger.counts.wrong;
  const eligibleReattempts = inputs.reattempts.filter(
    (r) => r.history.length > 0 || r.scheduled_date <= asOf
  );
  const cov = coverage(inputs.patterns.length);
  // Early samples are deliberately conservative: one correct answer or one
  // empty queue must not move a quarter of the composite score.
  const ret = retention(eligibleReattempts) * clamp01(eligibleReattempts.length / 8);
  const cal = calibration(ledger.events) * clamp01(answered / 10);
  const openReattempts = inputs.reattempts.filter((r) => r.stage !== 'MASTERED').length;
  const surf = surface(openReattempts) * clamp01(ledger.events.length / 20);
  const score = Math.round(
    (cov * WEIGHTS.coverage +
      ret * WEIGHTS.retention +
      cal * WEIGHTS.calibration +
      surf * WEIGHTS.surface) *
      100
  );
  const confidence =
    ledger.events.length >= 50 && answered >= 15 && eligibleReattempts.length >= 12
      ? 'grounded'
      : ledger.events.length >= 20 && (answered >= 5 || eligibleReattempts.length >= 5)
        ? 'developing'
        : 'early';
  return {
    score,
    coverage: cov,
    retention: ret,
    calibration: cal,
    surface: surf,
    confidence,
    counts: {
      questions: inputs.questions.length,
      attempts: ledger.counts.total,
      correct: ledger.counts.correct,
      wrong: ledger.counts.wrong,
      skipped: ledger.counts.skipped,
      ungraded: ledger.counts.ungraded,
      uncertain: ledger.counts.uncertain,
      legacyJournalAttempts: ledger.counts.legacyJournal,
      patterns: inputs.patterns.length,
      totalReattempts: inputs.reattempts.length,
      eligibleReattempts: eligibleReattempts.length,
      // Keep the displayed/snapshotted numerator on the same eligible cohort
      // used by retention (and by the weekly edge scorer). A future, untouched
      // row must not appear in the numerator before it is due.
      stabilised: eligibleReattempts.filter((r) => r.stage === 'D30' || r.stage === 'MASTERED')
        .length,
      openReattempts,
      markedDecisions: answered,
      markedCorrect: ledger.counts.correct
    }
  };
}

export type ReadinessComponentKey = 'coverage' | 'retention' | 'calibration' | 'surface';

export interface ReadinessComponent {
  key: ReadinessComponentKey;
  label: string;
  hint: string;
  weight: number;
  value: number;
  contribution: number; // rounded to nearest int
}

export function readinessComponents(b: ReadinessBreakdown): ReadinessComponent[] {
  return [
    {
      key: 'coverage',
      label: 'Coverage',
      hint: `${b.counts.patterns} / ${TARGET_PATTERN_LIBRARY} patterns encountered`,
      weight: WEIGHTS.coverage,
      value: b.coverage,
      contribution: Math.round(b.coverage * WEIGHTS.coverage * 100)
    },
    {
      key: 'retention',
      label: 'Retention',
      hint: `${b.counts.stabilised} of ${b.counts.eligibleReattempts} due or attempted rows at D30 / mastered`,
      weight: WEIGHTS.retention,
      value: b.retention,
      contribution: Math.round(b.retention * WEIGHTS.retention * 100)
    },
    {
      key: 'calibration',
      label: 'Calibration',
      hint:
        b.counts.markedDecisions === 0
          ? 'no graded answer receipts yet'
          : `${b.counts.markedCorrect} / ${b.counts.markedDecisions} graded answers were right; ${b.counts.uncertain} answers were uncertain`,
      weight: WEIGHTS.calibration,
      value: b.calibration,
      contribution: Math.round(b.calibration * WEIGHTS.calibration * 100)
    },
    {
      key: 'surface',
      label: 'Mistake surface',
      hint: `${b.counts.openReattempts} open across ${b.counts.attempts} exact-once attempt events`,
      weight: WEIGHTS.surface,
      value: b.surface,
      contribution: Math.round(b.surface * WEIGHTS.surface * 100)
    }
  ];
}

/** Full component description (tooltip content) — 1 sentence what + 1 sentence
 *  the concrete action to lift it. Kept as data so the UI just renders. */
export const COMPONENT_TOOLTIPS: Record<
  ReadinessComponentKey,
  { what: string; lift: string; healthy: string }
> = {
  coverage: {
    what: `Fraction of the ${TARGET_PATTERN_LIBRARY}-pattern target library you have named at least once.`,
    lift: 'Log more sessions and name the reusable trick each time you tag a question.',
    healthy: '≥ 60% by T−90.'
  },
  retention: {
    what: 'Fraction of due or previously attempted re-attempts that reached D30 or mastered, tempered while the sample is small.',
    lift: 'Clear open D3/D10 re-attempts before starting fresh material.',
    healthy: '≥ 55%.'
  },
  calibration: {
    what: 'Accuracy across graded immutable answer receipts, including 50-50 decisions, tempered until ten answers are logged.',
    lift: "Tighten your MARK/SKIP threshold in /calibration and stop gambling on rows you can't justify.",
    healthy: '≥ 65%.'
  },
  surface: {
    what: `Inverse of your open re-attempt count (baseline ${BASELINE_OPEN_SURFACE}), tempered until twenty questions are logged.`,
    lift: 'Do a re-attempt sweep — pick the oldest 10 open rows and clear or master them.',
    healthy: '≥ 60%.'
  }
};

/* --------------------------------------------------------------------------
 * Per-subject breakdown.
 *
 * Same math, sliced by subject. patterns/questions/reattempts are grouped
 * by their `subject` field. The per-subject coverage denominator is scaled
 * down from the full library (400) proportional to the subject's expected
 * weight in the exam (equal weight fallback if we don't know better).
 * ------------------------------------------------------------------------ */

/** IITM publishes 15/13/72 section marks, not fixed marks for each technical
 * subject. Per-subject library coverage therefore uses a transparent neutral
 * product denominator and is never presented as an official exam weight. */
function subjectLibraryTarget(_subject: string, subjectCount: number): number {
  return Math.max(4, Math.round(TARGET_PATTERN_LIBRARY / Math.max(1, subjectCount)));
}

export interface SubjectReadiness extends ReadinessBreakdown {
  subject: string;
  targetPatterns: number;
  /** null if the subject has no signal at all — treat as "hasn't started". */
  hasSignal: boolean;
}

/** Slice inputs by subject and run computeReadiness on each. */
export function computeReadinessBySubject(
  inputs: ReadinessInputs,
  subjects: readonly string[]
): SubjectReadiness[] {
  const asOf = inputs.asOfDate ?? todayISO();
  const events = normalizeAttemptEvidence({
    attempts: inputs.pyqAttempts ?? [],
    questions: inputs.questions
  }).events;
  const eBySubj = new Map<string, AttemptEvidenceEvent[]>();
  const questionById = new Map<string, QuestionRow>();
  const pBySubj = new Map<string, PatternRow[]>();
  const rBySubj = new Map<string, ReattemptRow[]>();
  for (const q of inputs.questions) {
    questionById.set(q.id, q);
  }
  for (const event of events) {
    const subject = canonicalSubjectLabel(event.subject);
    const list = eBySubj.get(subject) ?? [];
    list.push(event);
    eBySubj.set(subject, list);
  }
  for (const p of inputs.patterns) {
    const subject = canonicalSubjectLabel(p.subject);
    const list = pBySubj.get(subject) ?? [];
    list.push(p);
    pBySubj.set(subject, list);
  }
  for (const r of inputs.reattempts) {
    // Re-attempts don't carry subject directly; join via the question row.
    const q = questionById.get(r.question_id);
    if (!q) continue;
    const subject = canonicalSubjectLabel(q.subject);
    const list = rBySubj.get(subject) ?? [];
    list.push(r);
    rBySubj.set(subject, list);
  }
  return subjects.map((rawSubject) => {
    const subject = canonicalSubjectLabel(rawSubject);
    const subjectEvents = eBySubj.get(subject) ?? [];
    const ps = pBySubj.get(subject) ?? [];
    const rs = rBySubj.get(subject) ?? [];
    const target = subjectLibraryTarget(subject, subjects.length);
    const cov = clamp01(ps.length / target);
    const eligible = rs.filter((r) => r.history.length > 0 || r.scheduled_date <= asOf);
    const correct = subjectEvents.filter((event) => event.outcome === 'correct').length;
    const wrong = subjectEvents.filter((event) => event.outcome === 'wrong').length;
    const answered = correct + wrong;
    const ret = retention(eligible) * clamp01(eligible.length / 4);
    const cal = calibration(subjectEvents) * clamp01(answered / 5);
    const openReattempts = rs.filter((r) => r.stage !== 'MASTERED').length;
    const perSubjBaseline = Math.max(4, Math.round(BASELINE_OPEN_SURFACE / subjects.length));
    const surf = clamp01(1 - openReattempts / perSubjBaseline) * clamp01(subjectEvents.length / 10);
    const score = Math.round(
      (cov * WEIGHTS.coverage +
        ret * WEIGHTS.retention +
        cal * WEIGHTS.calibration +
        surf * WEIGHTS.surface) *
        100
    );
    const confidence =
      subjectEvents.length >= 25 && answered >= 8 && eligible.length >= 6
        ? 'grounded'
        : subjectEvents.length >= 10 && (answered >= 3 || eligible.length >= 3)
          ? 'developing'
          : 'early';
    return {
      subject,
      targetPatterns: target,
      hasSignal: subjectEvents.length + ps.length + rs.length > 0,
      score,
      coverage: cov,
      retention: ret,
      calibration: cal,
      surface: surf,
      confidence,
      counts: {
        questions: inputs.questions.filter(
          (question) => canonicalSubjectLabel(question.subject) === subject
        ).length,
        attempts: subjectEvents.length,
        correct,
        wrong,
        skipped: subjectEvents.filter((event) => event.outcome === 'skipped').length,
        ungraded: subjectEvents.filter((event) => event.outcome === 'ungraded').length,
        uncertain: subjectEvents.filter((event) => event.uncertain).length,
        legacyJournalAttempts: subjectEvents.filter((event) => event.source === 'legacy-journal')
          .length,
        patterns: ps.length,
        totalReattempts: rs.length,
        eligibleReattempts: eligible.length,
        stabilised: eligible.filter((r) => r.stage === 'D30' || r.stage === 'MASTERED').length,
        openReattempts,
        markedDecisions: answered,
        markedCorrect: correct
      }
    };
  });
}

/* --------------------------------------------------------------------------
 * "Next moves" — rule-based recommendations from the per-subject matrix
 * plus the overall breakdown. The calculation is deterministic.
 * ------------------------------------------------------------------------ */

export type MoveKind = 'calibrate' | 'reattempts' | 'cover' | 'stabilise' | 'diagnose';

export interface NextMove {
  kind: MoveKind;
  subject?: string;
  title: string;
  why: string;
  action: string;
  href?: string;
  urgency: 'high' | 'medium' | 'low';
}

const HIGH_RETENTION_MIN = 0.4;
const OPEN_REATTEMPT_ALERT = 8;
const LOW_COVERAGE_MAX = 0.15;

/** Return up to 3 concrete next moves, prioritised by urgency. */
export function nextMoves(overall: ReadinessBreakdown, perSubject: SubjectReadiness[]): NextMove[] {
  const moves: NextMove[] = [];

  for (const s of perSubject) {
    if (!s.hasSignal) continue;
    const answerAccuracy =
      s.counts.markedDecisions === 0 ? null : s.counts.markedCorrect / s.counts.markedDecisions;
    if (s.counts.markedDecisions >= 5 && answerAccuracy != null && answerAccuracy < 0.25) {
      moves.push({
        kind: 'calibrate',
        subject: s.subject,
        title: `Recalibrate ${s.subject}`,
        why: `${Math.round(answerAccuracy * 100)}% accuracy on ${s.counts.markedDecisions} graded answers — confidence needs work before increasing attempts.`,
        action: 'Open Calibration, raise the confidence threshold for this subject, and skip more.',
        href: '/calibration',
        urgency: 'high'
      });
    }
    if (s.counts.openReattempts >= OPEN_REATTEMPT_ALERT) {
      moves.push({
        kind: 'reattempts',
        subject: s.subject,
        title: `Clear open re-attempts in ${s.subject}`,
        why: `${s.counts.openReattempts} rows stuck at D3/D10.`,
        action: 'Open Re-attempts and clear the oldest questions first.',
        href: '/reattempts',
        urgency: s.counts.openReattempts >= 15 ? 'high' : 'medium'
      });
    }
    if (s.coverage < LOW_COVERAGE_MAX && s.counts.totalReattempts < 4) {
      moves.push({
        kind: 'cover',
        subject: s.subject,
        title: `Unlock ${s.subject}`,
        why: `Only ${s.counts.patterns} patterns named in this subject; you haven't started this material.`,
        action: 'Run one 60-min session tagged for this subject to seed a baseline.',
        href: '/session/new',
        urgency: 'medium'
      });
    }
  }

  if (overall.retention < HIGH_RETENTION_MIN && overall.counts.totalReattempts >= 10) {
    moves.push({
      kind: 'stabilise',
      title: 'Do a D30 cleanup pass',
      why: `Only ${Math.round(overall.retention * 100)}% of your re-attempts have stabilised — the ladder is leaking.`,
      action: 'Skip new material for a day. Sweep Re-attempts to push D3s and D10s upward.',
      href: '/reattempts',
      urgency: 'high'
    });
  }
  if (perSubject.every((s) => !s.hasSignal)) {
    moves.push({
      kind: 'diagnose',
      title: 'Log a session',
      why: 'No subject has enough signal to score yet.',
      action: 'Run /session/new for any subject and tag every question.',
      href: '/session/new',
      urgency: 'medium'
    });
  }

  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  return moves.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]).slice(0, 3);
}
