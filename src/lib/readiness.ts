// F5.3 — exam-day readiness score. Composite of four subscores; each is a
// [0..1] fraction, then weighted per §5.3. Pure math so the same function
// runs client-side (for immediate feedback) and inside compute-readiness.
import type { PatternRow, QuestionRow, ReattemptRow } from '@/types';
import { todayISO } from '@/lib/utils';

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
  reattempts: ReattemptRow[];
  patterns: PatternRow[];
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
  const stabilised = reattempts.filter(
    (r) => r.stage === 'D30' || r.stage === 'MASTERED'
  ).length;
  return clamp01(stabilised / reattempts.length);
}

/** Calibration: accuracy of MARK decisions (only counts questions actually MARK'd). */
export function calibration(questions: QuestionRow[]): number {
  const marked = questions.filter((q) => q.mark_decision === 'MARK');
  if (marked.length === 0) return 0;
  const correct = marked.filter((q) => q.mark_correct === true).length;
  return clamp01(correct / marked.length);
}

/** Surface: inverse of open re-attempts against a baseline. Small surface → high score. */
export function surface(openReattemptCount: number): number {
  return clamp01(1 - openReattemptCount / BASELINE_OPEN_SURFACE);
}

export function computeReadiness(inputs: ReadinessInputs): ReadinessBreakdown {
  const asOf = todayISO();
  const eligibleReattempts = inputs.reattempts.filter(
    (r) => r.history.length > 0 || r.scheduled_date <= asOf
  );
  const cov = coverage(inputs.patterns.length);
  const marked = inputs.questions.filter((q) => q.mark_decision === 'MARK');
  // Early samples are deliberately conservative: one correct answer or one
  // empty queue must not move a quarter of the composite score.
  const ret = retention(eligibleReattempts) * clamp01(eligibleReattempts.length / 8);
  const cal = calibration(inputs.questions) * clamp01(marked.length / 10);
  const openReattempts = inputs.reattempts.filter((r) => r.stage !== 'MASTERED').length;
  const surf = surface(openReattempts) * clamp01(inputs.questions.length / 20);
  const score = Math.round(
    (cov * WEIGHTS.coverage +
      ret * WEIGHTS.retention +
      cal * WEIGHTS.calibration +
      surf * WEIGHTS.surface) *
      100
  );
  const confidence =
    inputs.questions.length >= 50 && marked.length >= 15 && eligibleReattempts.length >= 12
      ? 'grounded'
      : inputs.questions.length >= 20 &&
          (marked.length >= 5 || eligibleReattempts.length >= 5)
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
      patterns: inputs.patterns.length,
      totalReattempts: inputs.reattempts.length,
      eligibleReattempts: eligibleReattempts.length,
      stabilised: inputs.reattempts.filter((r) => r.stage === 'D30' || r.stage === 'MASTERED').length,
      openReattempts,
      markedDecisions: marked.length,
      markedCorrect: marked.filter((q) => q.mark_correct === true).length
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
          ? 'no MARK decisions logged yet'
          : `${b.counts.markedCorrect} / ${b.counts.markedDecisions} answered decisions were right`,
      weight: WEIGHTS.calibration,
      value: b.calibration,
      contribution: Math.round(b.calibration * WEIGHTS.calibration * 100)
    },
    {
      key: 'surface',
      label: 'Mistake surface',
      hint: `${b.counts.openReattempts} open across ${b.counts.questions} logged questions`,
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
    what: 'Accuracy of your "I answered it" decisions under −⅓ negative marking, tempered until ten decisions are logged.',
    lift: 'Tighten your MARK/SKIP threshold in /calibration and stop gambling on rows you can\'t justify.',
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

/** Per-subject expected weight, roughly matching the GATE CS blueprint.
 *  Not authoritative — the exam allocation moves year to year; these are
 *  reasonable defaults so per-subject coverage denominators aren't uniform. */
export const SUBJECT_LIBRARY_WEIGHT: Record<string, number> = {
  'Discrete Mathematics': 0.11,
  'Engineering Mathematics': 0.1,
  'Digital Logic': 0.06,
  COA: 0.09,
  'Programming & DS': 0.12,
  Algorithms: 0.1,
  'Theory of Computation': 0.09,
  'Compiler Design': 0.05,
  'Operating Systems': 0.09,
  Databases: 0.08,
  'Computer Networks': 0.08,
  'General Aptitude': 0.03
};

function subjectLibraryTarget(subject: string): number {
  const w = SUBJECT_LIBRARY_WEIGHT[subject] ?? 1 / 12;
  return Math.max(4, Math.round(w * TARGET_PATTERN_LIBRARY));
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
  const qBySubj = new Map<string, QuestionRow[]>();
  const questionById = new Map<string, QuestionRow>();
  const pBySubj = new Map<string, PatternRow[]>();
  const rBySubj = new Map<string, ReattemptRow[]>();
  for (const q of inputs.questions) {
    questionById.set(q.id, q);
    const list = qBySubj.get(q.subject) ?? [];
    list.push(q);
    qBySubj.set(q.subject, list);
  }
  for (const p of inputs.patterns) {
    const list = pBySubj.get(p.subject) ?? [];
    list.push(p);
    pBySubj.set(p.subject, list);
  }
  for (const r of inputs.reattempts) {
    // Re-attempts don't carry subject directly; join via the question row.
    const q = questionById.get(r.question_id);
    if (!q) continue;
    const list = rBySubj.get(q.subject) ?? [];
    list.push(r);
    rBySubj.set(q.subject, list);
  }
  return subjects.map((subject) => {
    const qs = qBySubj.get(subject) ?? [];
    const ps = pBySubj.get(subject) ?? [];
    const rs = rBySubj.get(subject) ?? [];
    const target = subjectLibraryTarget(subject);
    const cov = clamp01(ps.length / target);
    const eligible = rs.filter((r) => r.history.length > 0 || r.scheduled_date <= todayISO());
    const marked = qs.filter((q) => q.mark_decision === 'MARK');
    const ret = retention(eligible) * clamp01(eligible.length / 4);
    const cal = calibration(qs) * clamp01(marked.length / 5);
    const openReattempts = rs.filter((r) => r.stage !== 'MASTERED').length;
    // Per-subject surface baseline scales with the subject's weight.
    const perSubjBaseline = Math.max(
      4,
      Math.round(
        (SUBJECT_LIBRARY_WEIGHT[subject] ?? 1 / 12) * BASELINE_OPEN_SURFACE
      )
    );
    const surf =
      clamp01(1 - openReattempts / perSubjBaseline) * clamp01(qs.length / 10);
    const score = Math.round(
      (cov * WEIGHTS.coverage +
        ret * WEIGHTS.retention +
        cal * WEIGHTS.calibration +
        surf * WEIGHTS.surface) *
        100
    );
    const confidence =
      qs.length >= 25 && marked.length >= 8 && eligible.length >= 6
        ? 'grounded'
        : qs.length >= 10 && (marked.length >= 3 || eligible.length >= 3)
          ? 'developing'
          : 'early';
    return {
      subject,
      targetPatterns: target,
      hasSignal: qs.length + ps.length + rs.length > 0,
      score,
      coverage: cov,
      retention: ret,
      calibration: cal,
      surface: surf,
      confidence,
      counts: {
        questions: qs.length,
        patterns: ps.length,
        totalReattempts: rs.length,
        eligibleReattempts: eligible.length,
        stabilised: rs.filter((r) => r.stage === 'D30' || r.stage === 'MASTERED').length,
        openReattempts,
        markedDecisions: marked.length,
        markedCorrect: marked.filter((q) => q.mark_correct === true).length
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
export function nextMoves(
  overall: ReadinessBreakdown,
  perSubject: SubjectReadiness[]
): NextMove[] {
  const moves: NextMove[] = [];

  for (const s of perSubject) {
    if (!s.hasSignal) continue;
    const answerAccuracy =
      s.counts.markedDecisions === 0
        ? null
        : s.counts.markedCorrect / s.counts.markedDecisions;
    if (
      s.counts.markedDecisions >= 5 &&
      answerAccuracy != null &&
      answerAccuracy < 0.25
    ) {
      moves.push({
        kind: 'calibrate',
        subject: s.subject,
        title: `Recalibrate ${s.subject}`,
        why: `${Math.round(answerAccuracy * 100)}% accuracy on ${s.counts.markedDecisions} answered decisions — below the −⅓ break-even.`,
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
  return moves
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
    .slice(0, 3);
}

/* --------------------------------------------------------------------------
 * Rough AIR band predictor — score + days-to-exam → expected AIR range.
 * Coarse lookup; tune once you have real cohort data. Callers should show
 * this as a rough band, not a precise number.
 * ------------------------------------------------------------------------ */

export interface AIRBand {
  low: number;
  high: number;
  label: string;
  caveat: string;
}

export function estimateAIRBand(score: number, daysToExam: number): AIRBand {
  // A tiny linear penalty for time remaining: less time → less room to climb.
  // Fully absent for score >= 80 (already contest-strong).
  const adj = Math.max(0, 60 - daysToExam) * 0.05;
  const s = Math.max(0, score - adj);

  if (s >= 82)
    return {
      low: 1,
      high: 100,
      label: 'AIR < 100 (top 0.05%)',
      caveat: 'Strong signal across all four components. Hold and taper — don\'t break it.'
    };
  if (s >= 72)
    return {
      low: 100,
      high: 500,
      label: 'AIR 100–500 (top 0.3%)',
      caveat: 'Calibration is the last mile. One weak subject can drop you 200 ranks.'
    };
  if (s >= 60)
    return {
      low: 500,
      high: 2000,
      label: 'AIR 500–2000 (top 1%)',
      caveat: 'Coverage and retention both matter. Fix your weakest subject before adding new ones.'
    };
  if (s >= 48)
    return {
      low: 2000,
      high: 5000,
      label: 'AIR 2000–5000',
      caveat: 'You have base. Push retention to 60%+ and clear the mistake surface.'
    };
  if (s >= 36)
    return {
      low: 5000,
      high: 10000,
      label: 'AIR 5000–10000',
      caveat: 'Diagnostic phase. Log more sessions before benchmarking against toppers.'
    };
  return {
    low: 10000,
    high: 999999,
    label: 'AIR > 10000',
    caveat: 'Not enough signal to predict. Run 10 sessions across 4 subjects and re-check.'
  };
}

/* --------------------------------------------------------------------------
 * Exam-day simulator — Monte Carlo over per-subject calibration.
 *
 * Simplified: each subject contributes a fixed mark budget scaled by its
 * weight. Marks per question = 2 (approx MSQ/NAT mix). Probability of
 * getting each answered question correct = subject accuracy. Skipped
 * questions score 0. Wrong = −⅔ (2 * ⅓).
 * ------------------------------------------------------------------------ */

export interface SimulatorRun {
  totalMarks: number;
  perSubject: { subject: string; marks: number }[];
}

export interface SimulatorResult {
  runs: number;
  p10: number;
  p50: number;
  p90: number;
  meanTotal: number;
}

const SUBJECT_MARK_BUDGET = 8; // per subject — ~ questions attempted per subject
const TECH_MARK_PER_Q = 2;
const NEG_MARK_PER_Q = TECH_MARK_PER_Q / 3;

function simulateOnce(
  perSubject: SubjectReadiness[],
  random: () => number
): SimulatorRun {
  const perSubjMarks: SimulatorRun['perSubject'] = [];
  let total = 0;
  for (const s of perSubject) {
    if (!s.hasSignal) {
      perSubjMarks.push({ subject: s.subject, marks: 0 });
      continue;
    }
    // Attempt half the budget if calibration is unknown; otherwise scale
    // by (calibration + coverage) / 2 — how much of the subject you engage with.
    const engagement = Math.max(0.1, (s.calibration + s.coverage) / 2);
    const attempts = Math.round(SUBJECT_MARK_BUDGET * engagement);
    let subjMarks = 0;
    for (let i = 0; i < attempts; i++) {
      if (random() < s.calibration) subjMarks += TECH_MARK_PER_Q;
      else subjMarks -= NEG_MARK_PER_Q;
    }
    perSubjMarks.push({ subject: s.subject, marks: subjMarks });
    total += subjMarks;
  }
  return { totalMarks: Math.round(total * 10) / 10, perSubject: perSubjMarks };
}

export function examDaySimulator(
  perSubject: SubjectReadiness[],
  runs: number = 500,
  seed?: number
): SimulatorResult {
  const derivedSeed =
    seed ??
    perSubject.reduce(
      (value, subject, index) =>
        (value * 31 + Math.round(subject.score * 10) + subject.counts.questions + index) >>> 0,
      2166136261
    );
  let state = derivedSeed || 1;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = next + Math.imul(next ^ (next >>> 7), 61 | next) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
  const totals: number[] = [];
  for (let i = 0; i < runs; i++) {
    totals.push(simulateOnce(perSubject, random).totalMarks);
  }
  totals.sort((a, b) => a - b);
  const pick = (frac: number) => totals[Math.floor(totals.length * frac)] ?? 0;
  const mean = totals.reduce((s, x) => s + x, 0) / (totals.length || 1);
  return {
    runs,
    p10: pick(0.1),
    p50: pick(0.5),
    p90: pick(0.9),
    meanTotal: Math.round(mean * 10) / 10
  };
}
