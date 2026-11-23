/**
 * Study signals: one pure answer to "where do I stand, and what do I do today?"
 *
 * Everything is derived from local records and the bundled PYQ bank. Nothing is
 * scored by guesswork:
 * - coverage = in-scope GATE CSE PYQs attempted at least once;
 * - accuracy = right on the first attempt (skips excluded);
 * - weight = average marks the subject carried in the latest complete papers.
 * The plan uses three phases before the exam: Cover, Consolidate, Simulate.
 */
import { differenceInCalendarDays, getDay, parseISO } from 'date-fns';
import { GATE_2027_BANK_TAXONOMY, gate2027BankTopicStatus } from '@/lib/gate-2027';
import { pyqBookSlugForQuestion, type PyqQuestion } from '@/lib/pyq';
import {
  CANONICAL_SUBJECT_IDS,
  canonicalSubjectId,
  subjectById,
  type SubjectId
} from '@/lib/subjects';
import { SUBTOPICS_BY_SUBJECT } from '@/lib/subtopics';
import { addDaysISO, calendarDateInTimeZone } from '@/lib/utils';
import type {
  LearningEventRow,
  LearningItemRow,
  MockTestRow,
  PyqAttemptRow,
  PyqHistoryFilter,
  PyqSessionRow
} from '@/types';

/** PYQs from this year on are the paced core set (online, NAT-era papers). */
export const PACE_FROM_YEAR = 2015;
/** Last stretch before the exam: full mocks and retrieval only. */
export const SIMULATE_DAYS = 19;
/** Mixed practice and twice-weekly mocks before the final stretch. */
export const CONSOLIDATE_DAYS = 28;
const WEIGHT_PAPER_COUNT = 10;
const MIN_ACCURACY_SAMPLE = 3;
const MIN_DAILY_APTITUDE = 5;
const MAX_DAILY_NEW = 60;
const PRACTICE_COUNTS = [5, 10, 15, 25, 50] as const;
export const APTITUDE_ID: SubjectId = 'general-aptitude';

/** Average marks per paper in GATE CSE 2021-2026 (10 papers); used before the bank loads. */
export const FALLBACK_SUBJECT_WEIGHTS: Record<SubjectId, number> = {
  'general-aptitude': 15,
  'programming-data-structures': 9.8,
  'operating-systems': 8.4,
  'computer-networks': 8.3,
  algorithms: 8.1,
  coa: 7.7,
  'engineering-mathematics': 7.4,
  'theory-of-computation': 7.4,
  'discrete-mathematics': 7.3,
  'compiler-design': 6.9,
  databases: 6.9,
  'digital-logic': 6.8
};

const SHORT_LABELS: Record<SubjectId, string> = {
  'discrete-mathematics': 'Discrete Maths',
  'engineering-mathematics': 'Engg Maths',
  'digital-logic': 'Digital Logic',
  coa: 'COA',
  'programming-data-structures': 'C & DS',
  algorithms: 'Algorithms',
  'theory-of-computation': 'TOC',
  'compiler-design': 'Compilers',
  'operating-systems': 'OS',
  databases: 'DBMS',
  'computer-networks': 'Networks',
  'general-aptitude': 'Aptitude'
};

export function shortSubjectLabel(subjectId: SubjectId): string {
  return SHORT_LABELS[subjectId];
}

const BANK_SLUGS_BY_SUBJECT = new Map<SubjectId, string[]>();
const SUBJECT_BY_BANK_SLUG = new Map<string, SubjectId>();
for (const scope of GATE_2027_BANK_TAXONOMY) {
  if (!scope.canonicalSubjectId) continue;
  SUBJECT_BY_BANK_SLUG.set(scope.bankSubjectSlug, scope.canonicalSubjectId);
  const slugs = BANK_SLUGS_BY_SUBJECT.get(scope.canonicalSubjectId) ?? [];
  slugs.push(scope.bankSubjectSlug);
  BANK_SLUGS_BY_SUBJECT.set(scope.canonicalSubjectId, slugs);
}

export function bankSlugsForSubject(subjectId: SubjectId): string[] {
  return [...(BANK_SLUGS_BY_SUBJECT.get(subjectId) ?? [])].sort();
}

// ---------------------------------------------------------------------------
// Bank

export interface SubjectBankStats {
  subjectId: SubjectId;
  label: string;
  /** Average marks per paper across the reference papers. */
  weight: number;
  /** In-scope GATE CSE questions from PACE_FROM_YEAR onward. */
  paceIds: ReadonlySet<string>;
  /** Every in-scope GATE CSE question, any year. */
  allIds: ReadonlySet<string>;
}

export interface BankStats {
  /** False while the fallback weights stand in for the loaded bank. */
  loaded: boolean;
  subjects: SubjectBankStats[];
  /** Papers whose marks set the weights, newest first. */
  referencePapers: string[];
  /** In-scope question uid -> canonical subject. */
  subjectOf: ReadonlyMap<string, SubjectId>;
  paceIdSet: ReadonlySet<string>;
  /** Newest paper year in the loaded bank; null before it loads. */
  lastYear: number | null;
  /** Newest year inside the paced set (sealed mock papers excluded). */
  paceLastYear: number | null;
  /** Questions kept out of daily practice because their papers are sealed for mocks. */
  reservedCount: number;
}

function inScope(question: PyqQuestion): boolean {
  try {
    const status = gate2027BankTopicStatus(`${question.subjectSlug}/${question.topicSlug}`);
    return status === 'current' || status === 'supporting';
  } catch {
    return false;
  }
}

/**
 * Weights and question sets from the GATE CSE book of the bundled bank.
 * `reservedIds` are questions from papers sealed for the final mocks; they never
 * count towards daily coverage, so the paced target can actually reach zero.
 */
export function buildBankStats(
  questions: readonly PyqQuestion[],
  reservedIds: ReadonlySet<string> = new Set()
): BankStats {
  const gate = questions.filter((question) => pyqBookSlugForQuestion(question) === 'gate-cse');
  const papers = new Map<string, PyqQuestion[]>();
  for (const question of gate) {
    const rows = papers.get(question.paperLabel) ?? [];
    rows.push(question);
    papers.set(question.paperLabel, rows);
  }
  const reference = [...papers.entries()]
    .filter(
      ([, rows]) =>
        rows.length === 65 && rows.reduce((sum, row) => sum + (row.marks ?? 0), 0) === 100
    )
    .sort(([leftLabel, left], [rightLabel, right]) => {
      const yearGap = (right[0]?.year ?? 0) - (left[0]?.year ?? 0);
      return yearGap || rightLabel.localeCompare(leftLabel);
    })
    .slice(0, WEIGHT_PAPER_COUNT);
  const marks = new Map<SubjectId, number>();
  for (const [, rows] of reference) {
    for (const row of rows) {
      const subjectId = SUBJECT_BY_BANK_SLUG.get(row.subjectSlug);
      if (subjectId) marks.set(subjectId, (marks.get(subjectId) ?? 0) + (row.marks ?? 0));
    }
  }
  const pace = new Map<SubjectId, Set<string>>();
  const all = new Map<SubjectId, Set<string>>();
  const subjectOf = new Map<string, SubjectId>();
  const paceIdSet = new Set<string>();
  let lastYear = 0;
  let paceLastYear = 0;
  let reservedCount = 0;
  for (const question of gate) {
    const subjectId = SUBJECT_BY_BANK_SLUG.get(question.subjectSlug);
    if (!subjectId || !inScope(question)) continue;
    lastYear = Math.max(lastYear, question.year);
    if (reservedIds.has(question.id)) {
      reservedCount += 1;
      continue;
    }
    subjectOf.set(question.id, subjectId);
    if (!all.has(subjectId)) all.set(subjectId, new Set());
    all.get(subjectId)!.add(question.id);
    if (question.year >= PACE_FROM_YEAR) {
      if (!pace.has(subjectId)) pace.set(subjectId, new Set());
      pace.get(subjectId)!.add(question.id);
      paceIdSet.add(question.id);
      paceLastYear = Math.max(paceLastYear, question.year);
    }
  }
  const loaded = gate.length > 0;
  return {
    loaded,
    referencePapers: reference.map(([label]) => label),
    subjects: CANONICAL_SUBJECT_IDS.map((subjectId) => ({
      subjectId,
      label: subjectById(subjectId).label,
      weight:
        reference.length > 0
          ? Math.round(((marks.get(subjectId) ?? 0) / reference.length) * 10) / 10
          : FALLBACK_SUBJECT_WEIGHTS[subjectId],
      paceIds: pace.get(subjectId) ?? new Set(),
      allIds: all.get(subjectId) ?? new Set()
    })),
    subjectOf,
    paceIdSet,
    lastYear: lastYear || null,
    paceLastYear: paceLastYear || null,
    reservedCount
  };
}

export const EMPTY_BANK_STATS: BankStats = buildBankStats([]);

// ---------------------------------------------------------------------------
// Phase

export type StudyPhaseId = 'cover' | 'consolidate' | 'simulate' | 'exam' | 'done';

export interface StudyPhase {
  id: StudyPhaseId;
  label: string;
  focus: string;
  daysToExam: number;
  /** First and last day of the current phase, when it has a span. */
  startsOn: string | null;
  endsOn: string | null;
  dayOfPhase: number | null;
  phaseLength: number | null;
  next: { id: StudyPhaseId; label: string; startsOn: string; inDays: number } | null;
  consolidateStartsOn: string;
  simulateStartsOn: string;
  examDate: string;
}

const PHASE_COPY: Record<StudyPhaseId, { label: string; focus: string }> = {
  cover: {
    label: 'Cover',
    focus: 'Finish the syllabus and every PYQ from 2015, one subject at a time.'
  },
  consolidate: {
    label: 'Consolidate',
    focus: 'Mixed-subject sets, older PYQs for weak subjects, and two full mocks a week.'
  },
  simulate: {
    label: 'Simulate',
    focus: 'Full mocks on schedule, re-attempts and formula revision. No new topics.'
  },
  exam: { label: 'Exam day', focus: 'A light warm-up at most. Eat, hydrate and arrive early.' },
  done: { label: 'After the exam', focus: 'Check your responses once the answer key is out.' }
};

export function studyPhase(today: string, examDate: string): StudyPhase {
  const daysToExam = differenceInCalendarDays(parseISO(examDate), parseISO(today));
  const simulateStartsOn = addDaysISO(examDate, -SIMULATE_DAYS);
  const consolidateStartsOn = addDaysISO(simulateStartsOn, -CONSOLIDATE_DAYS);
  const id: StudyPhaseId =
    daysToExam < 0
      ? 'done'
      : daysToExam === 0
        ? 'exam'
        : today >= simulateStartsOn
          ? 'simulate'
          : today >= consolidateStartsOn
            ? 'consolidate'
            : 'cover';
  const span = (
    startsOn: string | null,
    endsOn: string
  ): Pick<StudyPhase, 'startsOn' | 'endsOn' | 'dayOfPhase' | 'phaseLength'> => ({
    startsOn,
    endsOn,
    dayOfPhase: startsOn ? differenceInCalendarDays(parseISO(today), parseISO(startsOn)) + 1 : null,
    phaseLength: startsOn
      ? differenceInCalendarDays(parseISO(endsOn), parseISO(startsOn)) + 1
      : null
  });
  const nextOf = (nextId: StudyPhaseId, startsOn: string) => ({
    id: nextId,
    label: PHASE_COPY[nextId].label,
    startsOn,
    inDays: differenceInCalendarDays(parseISO(startsOn), parseISO(today))
  });
  const base = {
    id,
    ...PHASE_COPY[id],
    daysToExam,
    consolidateStartsOn,
    simulateStartsOn,
    examDate
  };
  if (id === 'cover')
    return {
      ...base,
      ...span(null, addDaysISO(consolidateStartsOn, -1)),
      next: nextOf('consolidate', consolidateStartsOn)
    };
  if (id === 'consolidate')
    return {
      ...base,
      ...span(consolidateStartsOn, addDaysISO(simulateStartsOn, -1)),
      next: nextOf('simulate', simulateStartsOn)
    };
  if (id === 'simulate')
    return {
      ...base,
      ...span(simulateStartsOn, addDaysISO(examDate, -1)),
      next: nextOf('exam', examDate)
    };
  return { ...base, startsOn: null, endsOn: null, dayOfPhase: null, phaseLength: null, next: null };
}

// ---------------------------------------------------------------------------
// Attempts

interface QuestionHistory {
  first: PyqAttemptRow;
  count: number;
}

function historyByQuestion(attempts: readonly PyqAttemptRow[]): Map<string, QuestionHistory> {
  const byQuestion = new Map<string, QuestionHistory>();
  for (const attempt of attempts) {
    const current = byQuestion.get(attempt.question_uid);
    if (!current) byQuestion.set(attempt.question_uid, { first: attempt, count: 1 });
    else {
      current.count += 1;
      if (attempt.attempted_at < current.first.attempted_at) current.first = attempt;
    }
  }
  return byQuestion;
}

function isFirstAttemptRow(attempt: PyqAttemptRow, history: Map<string, QuestionHistory>) {
  return history.get(attempt.question_uid)?.first.id === attempt.id;
}

// ---------------------------------------------------------------------------
// Syllabus

export interface SyllabusProgress {
  done: number;
  total: number;
  /** First topic in study order not yet marked studied. */
  nextTopic: string | null;
}

/** Topics marked studied in the Syllabus tracker, per subject, in its study order. */
export function syllabusBySubject(
  isDone: (subjectLabel: string, topic: string) => boolean
): Map<SubjectId, SyllabusProgress> {
  const progress = new Map<SubjectId, SyllabusProgress>();
  for (const subjectId of CANONICAL_SUBJECT_IDS) {
    const label = subjectById(subjectId).label;
    const topics = (SUBTOPICS_BY_SUBJECT[label] ?? []).map((topic) => topic.value);
    const open = topics.filter((topic) => !isDone(label, topic));
    progress.set(subjectId, {
      done: topics.length - open.length,
      total: topics.length,
      nextTopic: open[0] ?? null
    });
  }
  return progress;
}

// ---------------------------------------------------------------------------
// Coverage

export interface SubjectSignal {
  subjectId: SubjectId;
  label: string;
  shortLabel: string;
  weight: number;
  paceTotal: number;
  paceAttempted: number;
  allTotal: number;
  allAttempted: number;
  /** Share of the paced set attempted at least once. */
  coverage: number;
  firstTries: number;
  /** Right on the first attempt without marking it 50/50. */
  firstTryCorrect: number;
  /** First-try accuracy once at least three answered questions exist. */
  accuracy: number | null;
  openReattempts: number;
  dueReattempts: number;
  /** Marks per paper not yet backed by correct practice (coverage x smoothed accuracy). */
  openMarks: number;
  syllabus: SyllabusProgress | null;
  /**
   * learn: under half the syllabus marked studied and little PYQ work yet;
   * practise: ready for new PYQs; maintain: most PYQs done at a sound first-try rate.
   */
  stage: SubjectStage;
}

export type SubjectStage = 'learn' | 'practise' | 'maintain';

function stageFor(
  subjectId: SubjectId,
  coverage: number,
  accuracy: number | null,
  syllabus: SyllabusProgress | null
): SubjectStage {
  if (coverage >= 0.6 && accuracy !== null && accuracy >= 0.6) return 'maintain';
  const syllabusShare = syllabus && syllabus.total ? syllabus.done / syllabus.total : null;
  if (subjectId !== APTITUDE_ID && syllabusShare !== null && syllabusShare < 0.5 && coverage < 0.2)
    return 'learn';
  return 'practise';
}

const OPEN_STATES = new Set(['active', 'remediation', 'transfer']);

export function subjectSignals(
  stats: BankStats,
  attempts: readonly PyqAttemptRow[],
  items: readonly LearningItemRow[],
  today: string,
  syllabus: ReadonlyMap<SubjectId, SyllabusProgress> | null = null
): SubjectSignal[] {
  const history = historyByQuestion(attempts);
  const openBySubject = new Map<SubjectId, { open: number; due: number }>();
  for (const item of items) {
    if (!OPEN_STATES.has(item.recovery_state)) continue;
    const subjectId = canonicalSubjectId(item.subject);
    if (!subjectId) continue;
    const entry = openBySubject.get(subjectId) ?? { open: 0, due: 0 };
    entry.open += 1;
    if (item.scheduled_date && item.scheduled_date <= today) entry.due += 1;
    openBySubject.set(subjectId, entry);
  }
  return stats.subjects
    .map((subject) => {
      let paceAttempted = 0;
      for (const id of subject.paceIds) if (history.has(id)) paceAttempted += 1;
      let allAttempted = 0;
      let firstTries = 0;
      let firstTryCorrect = 0;
      for (const id of subject.allIds) {
        const entry = history.get(id);
        if (!entry) continue;
        allAttempted += 1;
        if (entry.first.mark_decision === 'SKIP' || entry.first.mark_correct === null) continue;
        firstTries += 1;
        // A 50/50 that happened to land is not knowledge yet; it stays on the re-attempt ladder.
        if (entry.first.mark_correct && entry.first.mark_decision !== 'FIFTY_FIFTY')
          firstTryCorrect += 1;
      }
      const paceTotal = subject.paceIds.size;
      const coverage = paceTotal ? paceAttempted / paceTotal : 0;
      // Laplace-smoothed so one lucky answer does not read as a secured subject.
      const accuracyEstimate = (firstTryCorrect + 1) / (firstTries + 2);
      const reattempts = openBySubject.get(subject.subjectId) ?? { open: 0, due: 0 };
      const accuracy = firstTries >= MIN_ACCURACY_SAMPLE ? firstTryCorrect / firstTries : null;
      const subjectSyllabus = syllabus?.get(subject.subjectId) ?? null;
      return {
        subjectId: subject.subjectId,
        label: subject.label,
        shortLabel: shortSubjectLabel(subject.subjectId),
        weight: subject.weight,
        paceTotal,
        paceAttempted,
        allTotal: subject.allIds.size,
        allAttempted,
        coverage,
        firstTries,
        firstTryCorrect,
        accuracy,
        openReattempts: reattempts.open,
        dueReattempts: reattempts.due,
        openMarks: Math.round(subject.weight * (1 - coverage * accuracyEstimate) * 10) / 10,
        syllabus: subjectSyllabus,
        stage: stageFor(subject.subjectId, coverage, accuracy, subjectSyllabus)
      };
    })
    .sort(
      (left, right) =>
        right.openMarks - left.openMarks ||
        right.weight - left.weight ||
        left.label.localeCompare(right.label)
    );
}

// ---------------------------------------------------------------------------
// Daily targets

export interface PaceTarget {
  total: number;
  attempted: number;
  remaining: number;
  /** First attempts today on paced questions. */
  doneToday: number;
  /** First attempts today on older in-scope questions (still progress, outside the pace set). */
  olderToday: number;
  /** Today's target: the pace, or 0 on a mock day; null once pacing ends. */
  dailyTarget: number | null;
  /** Questions per practice day that clear the paced set before the deadline. */
  pace: number | null;
  deadline: string;
  /** Practice days left before the deadline (mock days excluded for core PYQs). */
  daysLeft: number;
  /** Today is a scheduled full-mock day, so no new core PYQs are expected. */
  mockDay: boolean;
}

export interface DailyPlan {
  core: PaceTarget;
  aptitude: PaceTarget;
  /** When the saved daily goal would clear the remaining paced PYQs. */
  savedGoal: {
    perDay: number;
    finishesOn: string;
    afterDeadline: boolean;
    afterExam: boolean;
  } | null;
}

function paceTarget(
  ids: readonly string[],
  stats: BankStats,
  history: Map<string, QuestionHistory>,
  attempts: readonly PyqAttemptRow[],
  today: string,
  timeZone: string,
  phase: StudyPhase,
  minimum: number,
  include: (subjectId: SubjectId) => boolean,
  skipMockDays: boolean
): PaceTarget {
  let attempted = 0;
  for (const id of ids) if (history.has(id)) attempted += 1;
  let doneToday = 0;
  let olderToday = 0;
  for (const attempt of attempts) {
    const subjectId = stats.subjectOf.get(attempt.question_uid);
    if (!subjectId || !include(subjectId) || !isFirstAttemptRow(attempt, history)) continue;
    if (calendarDateInTimeZone(attempt.attempted_at, timeZone) !== today) continue;
    if (stats.paceIdSet.has(attempt.question_uid)) doneToday += 1;
    else olderToday += 1;
  }
  const total = ids.length;
  const remaining = total - attempted;
  const deadline = phase.simulateStartsOn;
  const calendarDays = Math.max(0, differenceInCalendarDays(parseISO(deadline), parseISO(today)));
  let daysLeft = calendarDays;
  if (skipMockDays)
    for (let offset = 0; offset < calendarDays; offset += 1)
      if (isMockDay(addDaysISO(today, offset), phase)) daysLeft -= 1;
  const pacing = phase.id === 'cover' || phase.id === 'consolidate';
  const mockDay = skipMockDays && pacing && isMockDay(today, phase);
  // Count today's work back in so the target stays fixed through the day.
  const openAtDayStart = remaining + doneToday;
  const pace =
    !pacing || calendarDays === 0
      ? null
      : openAtDayStart === 0
        ? 0
        : Math.min(
            MAX_DAILY_NEW,
            Math.max(minimum, Math.ceil(openAtDayStart / Math.max(1, daysLeft))),
            openAtDayStart
          );
  const dailyTarget = pace === null ? null : mockDay ? 0 : pace;
  return {
    total,
    attempted,
    remaining,
    doneToday,
    olderToday,
    dailyTarget,
    pace,
    deadline,
    daysLeft,
    mockDay
  };
}

export function dailyPlan(
  stats: BankStats,
  attempts: readonly PyqAttemptRow[],
  today: string,
  timeZone: string,
  phase: StudyPhase,
  savedDailyGoal: number | null
): DailyPlan {
  const history = historyByQuestion(attempts);
  const coreIds = stats.subjects
    .filter((subject) => subject.subjectId !== APTITUDE_ID)
    .flatMap((subject) => [...subject.paceIds]);
  const aptitudeIds = [
    ...(stats.subjects.find((subject) => subject.subjectId === APTITUDE_ID)?.paceIds ?? [])
  ];
  const core = paceTarget(
    coreIds,
    stats,
    history,
    attempts,
    today,
    timeZone,
    phase,
    1,
    (id) => id !== APTITUDE_ID,
    true
  );
  const aptitude = paceTarget(
    aptitudeIds,
    stats,
    history,
    attempts,
    today,
    timeZone,
    phase,
    MIN_DAILY_APTITUDE,
    (id) => id === APTITUDE_ID,
    false
  );
  const remaining = core.remaining + aptitude.remaining;
  const savedGoal =
    savedDailyGoal && savedDailyGoal > 0 && stats.loaded
      ? (() => {
          const finishesOn =
            remaining === 0 ? today : addDaysISO(today, Math.ceil(remaining / savedDailyGoal) - 1);
          return {
            perDay: savedDailyGoal,
            finishesOn,
            afterDeadline: finishesOn >= core.deadline,
            afterExam: finishesOn >= phase.examDate
          };
        })()
      : null;
  return { core, aptitude, savedGoal };
}

// ---------------------------------------------------------------------------
// Re-attempts

export interface ReattemptProgress {
  doneToday: number;
  dueNow: number;
  /** Earliest future due date among open questions, when nothing is due now. */
  nextDueOn: string | null;
}

function isGradedRetrieval(event: Pick<LearningEventRow, 'event_type'>): boolean {
  return event.event_type.startsWith('retrieval_') && event.event_type !== 'retrieval_started';
}

export function reattemptProgress(
  items: readonly LearningItemRow[],
  events: readonly LearningEventRow[],
  today: string
): ReattemptProgress {
  const done = new Set<string>();
  for (const event of events)
    if (event.local_date === today && isGradedRetrieval(event)) done.add(event.learning_item_id);
  let dueNow = 0;
  let nextDueOn: string | null = null;
  for (const item of items) {
    // Mastered questions carry a date only for their final-pass look before the exam.
    const scheduled = OPEN_STATES.has(item.recovery_state) || item.recovery_state === 'mastered';
    if (!scheduled || !item.scheduled_date) continue;
    if (item.scheduled_date <= today) dueNow += 1;
    else if (!nextDueOn || item.scheduled_date < nextDueOn) nextDueOn = item.scheduled_date;
  }
  return { doneToday: done.size, dueNow, nextDueOn };
}

export type PipelineStage = 'D3' | 'D10' | 'D30' | 'TRANSFER' | 'MASTERED';
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'D3',
  'D10',
  'D30',
  'TRANSFER',
  'MASTERED'
];

export interface ReattemptPipeline {
  stages: Record<PipelineStage, number>;
  /** Missed twice and waiting for a focused repair. */
  needsRepair: number;
  /** Parked, for example while an imported test result is unknown. */
  paused: number;
  total: number;
}

export function reattemptPipeline(items: readonly LearningItemRow[]): ReattemptPipeline {
  const stages: Record<PipelineStage, number> = { D3: 0, D10: 0, D30: 0, TRANSFER: 0, MASTERED: 0 };
  let needsRepair = 0;
  let paused = 0;
  for (const item of items) {
    if (item.recovery_state === 'mastered' || item.stage === 'MASTERED') stages.MASTERED += 1;
    else if (item.recovery_state === 'paused') paused += 1;
    else if (item.recovery_state === 'remediation') needsRepair += 1;
    else if (item.stage in stages) stages[item.stage] += 1;
  }
  return { stages, needsRepair, paused, total: items.length };
}

// ---------------------------------------------------------------------------
// Mocks

export interface MockPlan {
  /** Today is a scheduled mock day for the current phase. */
  scheduledToday: boolean;
  doneToday: boolean;
  nextOn: string | null;
  cadence: string;
}

const MOCK_WEEKDAYS: Partial<Record<StudyPhaseId, readonly number[]>> = {
  cover: [0],
  consolidate: [0, 3],
  simulate: [1, 3, 6]
};

function mockDayFor(date: string, phase: StudyPhaseId): boolean {
  return MOCK_WEEKDAYS[phase]?.includes(getDay(parseISO(date))) ?? false;
}

/** A scheduled full-mock day (none in the two days before the exam). */
export function isMockDay(date: string, phase: StudyPhase): boolean {
  if (date > addDaysISO(phase.examDate, -2)) return false;
  return mockDayFor(date, phaseIdOn(date, phase));
}

function phaseIdOn(date: string, phase: StudyPhase): StudyPhaseId {
  if (date >= phase.examDate) return date === phase.examDate ? 'exam' : 'done';
  if (date >= phase.simulateStartsOn) return 'simulate';
  if (date >= phase.consolidateStartsOn) return 'consolidate';
  return 'cover';
}

export function mockPlan(
  phase: StudyPhase,
  today: string,
  timeZone: string,
  sessions: readonly PyqSessionRow[],
  mocks: readonly MockTestRow[]
): MockPlan {
  const doneToday =
    sessions.some(
      (session) =>
        session.config?.mode === 'exam' &&
        calendarDateInTimeZone(session.started_at, timeZone) === today
    ) || mocks.some((mock) => mock.test_date === today);
  // No new mock in the two days before the exam.
  const lastMockDay = addDaysISO(phase.examDate, -2);
  let nextOn: string | null = null;
  for (let offset = 1; offset <= 14; offset += 1) {
    const date = addDaysISO(today, offset);
    if (date > lastMockDay) break;
    if (mockDayFor(date, phaseIdOn(date, phase))) {
      nextOn = date;
      break;
    }
  }
  const cadence =
    phase.id === 'cover'
      ? 'One full mock every Sunday'
      : phase.id === 'consolidate'
        ? 'Full mocks every Wednesday and Sunday'
        : phase.id === 'simulate'
          ? 'Full mocks on Monday, Wednesday and Saturday'
          : 'No more mocks before the exam';
  return {
    scheduledToday: today <= lastMockDay && mockDayFor(today, phase.id),
    doneToday,
    nextOn,
    cadence
  };
}

// ---------------------------------------------------------------------------
// Activity

export interface ActivityDay {
  date: string;
  newPyqs: number;
  revisits: number;
}

export function activityByDay(
  attempts: readonly PyqAttemptRow[],
  events: readonly LearningEventRow[],
  today: string,
  timeZone: string,
  days = 14
): ActivityDay[] {
  const history = historyByQuestion(attempts);
  const window = Array.from({ length: days }, (_, index) => ({
    date: addDaysISO(today, index - days + 1),
    newPyqs: 0,
    revisits: 0
  }));
  const byDate = new Map(window.map((day) => [day.date, day]));
  for (const attempt of attempts) {
    const day = byDate.get(calendarDateInTimeZone(attempt.attempted_at, timeZone));
    if (!day) continue;
    if (isFirstAttemptRow(attempt, history)) day.newPyqs += 1;
    else day.revisits += 1;
  }
  // Retrievals answered inside a re-attempt session have no practice attempt row.
  for (const event of events) {
    if (event.source_pyq_attempt_id || !isGradedRetrieval(event)) continue;
    const day = byDate.get(event.local_date);
    if (day) day.revisits += 1;
  }
  return window;
}

/** Consecutive study days ending today, or yesterday when today is still empty. */
export function studyStreak(days: readonly ActivityDay[]): number {
  let index = days.length - 1;
  if (index >= 0 && days[index].newPyqs + days[index].revisits === 0) index -= 1;
  let streak = 0;
  while (index >= 0 && days[index].newPyqs + days[index].revisits > 0) {
    streak += 1;
    index -= 1;
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Links into Practice

export function practiceCount(target: number): (typeof PRACTICE_COUNTS)[number] {
  return PRACTICE_COUNTS.find((count) => count >= target) ?? 50;
}

export interface PracticeLink {
  subjectId?: SubjectId | null;
  /** Several subjects mixed in one set (interleaved practice). */
  subjectIds?: readonly SubjectId[];
  /** Hide subject and topic labels until each answer is committed. */
  hideTopics?: boolean;
  count: number;
  history?: PyqHistoryFilter;
  fromYear?: number;
  /** The bank's newest year; omitted while the bank is still loading. */
  toYear?: number | null;
  order?: 'unseen' | 'random' | 'newest' | 'oldest';
}

/** An exact, filter-driven Practice setup (the Custom preset keeps the filters literal). */
export function practiceHref({
  subjectId,
  subjectIds,
  hideTopics = false,
  count,
  history = 'unseen',
  fromYear = PACE_FROM_YEAR,
  toYear = null,
  order = 'newest'
}: PracticeLink): string {
  const params = new URLSearchParams({ preset: 'custom', mode: 'practice' });
  if (subjectIds && subjectIds.length > 0) {
    params.set('subjectSlugs', subjectIds.flatMap((id) => bankSlugsForSubject(id)).join(','));
  } else if (subjectId) {
    const slugs = bankSlugsForSubject(subjectId);
    if (slugs.length === 1) params.set('subjectSlug', slugs[0]);
    else params.set('subjectSlugs', slugs.join(','));
  } else {
    params.set(
      'subjectSlugs',
      CANONICAL_SUBJECT_IDS.filter((id) => id !== APTITUDE_ID)
        .flatMap((id) => bankSlugsForSubject(id))
        .join(',')
    );
  }
  params.set('topic', 'all');
  params.set('fromYear', String(fromYear));
  if (toYear) params.set('toYear', String(toYear));
  params.set('type', 'all');
  params.set('order', order);
  params.set('history', history);
  params.set('count', String(practiceCount(count)));
  if (hideTopics) params.set('hideTopics', '1');
  return `/pyq?${params.toString()}`;
}

export const FULL_MOCK_HREF = '/pyq?mode=exam&examKind=full-paper';
