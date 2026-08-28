import type { Outcome, RootCause, MarkDecision } from '@/types';
export { CANONICAL_SUBJECT_LABELS as SUBJECTS } from '@/lib/subjects';

export interface OutcomeSpec {
  code: Outcome;
  key: string;
  label: string;
  hint: string;
  /** semantic tone used by badges: ok | slow | guess | wrong */
  tone: 'ok' | 'slow' | 'guess' | 'wrong';
  /** outcomes that feed the re-attempt ladder */
  needsReattempt: boolean;
}

export const OUTCOMES: OutcomeSpec[] = [
  {
    code: 'R',
    key: 'r',
    label: 'Right',
    hint: 'Clean solve, in time',
    tone: 'ok',
    needsReattempt: false
  },
  {
    code: 'RBS',
    key: 's',
    label: 'Right, but slow',
    hint: 'Correct — over target time',
    tone: 'slow',
    needsReattempt: true
  },
  {
    code: 'RBG',
    key: 'g',
    label: 'Right, by guess',
    hint: 'Correct — could not justify',
    tone: 'guess',
    needsReattempt: true
  },
  {
    code: 'W-C',
    key: '1',
    label: 'Wrong — concept',
    hint: 'Did not know / misunderstood',
    tone: 'wrong',
    needsReattempt: true
  },
  {
    code: 'W-E',
    key: '2',
    label: 'Wrong — execution',
    hint: 'Knew it, botched the steps',
    tone: 'wrong',
    needsReattempt: true
  },
  {
    code: 'W-R',
    key: '3',
    label: 'Wrong — reading',
    hint: 'Misread the question',
    tone: 'wrong',
    needsReattempt: true
  }
];

export const OUTCOME_BY_CODE: Record<Outcome, OutcomeSpec> = Object.fromEntries(
  OUTCOMES.map((o) => [o.code, o])
) as Record<Outcome, OutcomeSpec>;

/** Keyboard mapping for the outcome step. */
export const OUTCOME_KEYS: Record<string, Outcome> = Object.fromEntries(
  OUTCOMES.map((o) => [o.key, o.code])
);

export interface RootCauseSpec {
  value: RootCause;
  key: string;
  label: string;
  hint: string;
}

export const ROOT_CAUSES: RootCauseSpec[] = [
  { value: 'concept', key: '1', label: 'Concept', hint: 'The idea itself was missing or wrong' },
  { value: 'formula', key: '2', label: 'Formula', hint: 'Forgot or misremembered a formula' },
  { value: 'reading', key: '3', label: 'Reading', hint: 'Misread the statement or constraints' },
  { value: 'computation', key: '4', label: 'Computation', hint: 'Arithmetic / algebra slip' },
  { value: 'strategy', key: '5', label: 'Strategy', hint: 'Wrong approach, time sink, bad triage' }
];

export const MARK_DECISIONS: { value: MarkDecision; label: string }[] = [
  { value: 'MARK', label: 'Mark' },
  { value: 'SKIP', label: 'Skip' },
  { value: 'FIFTY_FIFTY', label: '50-50' }
];

export type SourceKind =
  | 'pyq'
  | 'isro'
  | 'barc'
  | 'drdo'
  | 'nielit'
  | 'tifr'
  | 'isi'
  | 'cmi'
  | 'go_quiz'
  | 'go_dpp'
  | 'go_weekly'
  | 'gate_overflow'
  | 'other';

export interface SourceKindSpec {
  value: SourceKind;
  key: string;
  label: string;
  /** Canonical string prefix stored in `questions.source_ref`. */
  refPrefix: string;
  /** Whether the source is a year-based exam (surfaces a Year picker in the tag flow). */
  hasYear?: boolean;
  /** Earliest useful year for the year dropdown (default: current − 35). */
  earliestYear?: number;
}

// GATE PYQ + prestige CS exams the same aspirants also prepare for. All year-
// tagged; only GATE has Set 1 / Set 2 (from 2014).
export const SOURCE_KINDS: SourceKindSpec[] = [
  { value: 'pyq', key: '1', label: 'GATE PYQ', refPrefix: 'GATE PYQ', hasYear: true, earliestYear: 1991 },
  { value: 'isro', key: '2', label: 'ISRO Scientist/Engineer', refPrefix: 'ISRO', hasYear: true, earliestYear: 2007 },
  { value: 'barc', key: '3', label: 'BARC OCES/DGFS', refPrefix: 'BARC', hasYear: true, earliestYear: 2005 },
  { value: 'drdo', key: '4', label: 'DRDO CEPTAM', refPrefix: 'DRDO', hasYear: true, earliestYear: 2008 },
  { value: 'nielit', key: '5', label: 'NIELIT Scientist-B', refPrefix: 'NIELIT', hasYear: true, earliestYear: 2015 },
  { value: 'tifr', key: '6', label: 'TIFR GS (Computer Science)', refPrefix: 'TIFR', hasYear: true, earliestYear: 2005 },
  { value: 'isi', key: '7', label: 'ISI JRF (Computer Science)', refPrefix: 'ISI', hasYear: true, earliestYear: 2005 },
  { value: 'cmi', key: '8', label: 'CMI MSc CS Entrance', refPrefix: 'CMI', hasYear: true, earliestYear: 2010 },
  { value: 'go_quiz', key: '9', label: 'Go Classes Quiz', refPrefix: 'Go Classes Quiz' },
  { value: 'go_dpp', key: '0', label: 'Go Classes DPP', refPrefix: 'Go Classes DPP' },
  { value: 'go_weekly', key: 'w', label: 'Go Classes Weekly Quiz', refPrefix: 'Go Classes Weekly Quiz' },
  { value: 'gate_overflow', key: 'o', label: 'GATE Overflow', refPrefix: 'GATE Overflow' },
  { value: 'other', key: '.', label: 'Other', refPrefix: 'Other' }
];

export const SOURCE_KIND_BY_VALUE: Record<SourceKind, SourceKindSpec> = Object.fromEntries(
  SOURCE_KINDS.map((s) => [s.value, s])
) as Record<SourceKind, SourceKindSpec>;

/** GATE CS started running two sets in 2014. */
export const PYQ_TWO_SETS_FROM = 2014;

/** Descending year list for a given exam source (defaults to GATE PYQ range). */
export function examYears(
  spec?: SourceKindSpec | null,
  now: Date = new Date()
): number[] {
  const currentYear = now.getFullYear();
  const lastExamYear =
    now.getMonth() > 1 || (now.getMonth() === 1 && now.getDate() >= 10)
      ? currentYear
      : currentYear - 1;
  const earliest = spec?.earliestYear ?? lastExamYear - 35;
  const out: number[] = [];
  for (let y = lastExamYear; y >= earliest; y--) out.push(y);
  return out;
}

/** Descending list of GATE PYQ years — kept for backward-compat callers. */
export function pyqYears(now: Date = new Date()): number[] {
  return examYears(SOURCE_KINDS.find((s) => s.value === 'pyq'), now);
}

/** Build a canonical `source_ref` string from parsed pieces. */
export function buildSourceRef(
  kind: SourceKind,
  year: number | null,
  set: 1 | 2 | null,
  questionNumber: string | null,
  format: 'MCQ' | 'MSQ' | 'NAT' | null = null
): string {
  const spec = SOURCE_KIND_BY_VALUE[kind];
  const parts: string[] = [spec.refPrefix];
  if (spec.hasYear && year != null) {
    // Set 1/Set 2 only applies to GATE PYQ from 2014 onward.
    const yearPart =
      kind === 'pyq' && set != null && year >= PYQ_TWO_SETS_FROM ? `${year} Set ${set}` : `${year}`;
    parts.push(yearPart);
  }
  if (questionNumber && questionNumber.trim()) parts.push(questionNumber.trim());
  if (format) parts.push(format);
  return parts.join(' · ');
}

/** Modern GATE marks a question at 1 or 2 marks; target time roughly tracks that. */
export const MARKS_TARGET_SEC: Record<1 | 2, number> = {
  1: 90,
  2: 180
};

export const DEFAULT_TARGET_TIME_SEC = 120;

/**
 * Return a solve-time target for modern and legacy GATE mark allocations.
 *
 * Modern 1/2-mark questions retain their established targets. Older papers
 * also contain larger positive allocations, for which the same 90 seconds per
 * mark scale provides a deterministic target. Missing or malformed metadata
 * keeps the neutral default instead of inventing a mark value.
 */
export function targetTimeSecForMarks(marks: number | null | undefined): number {
  if (marks === 1 || marks === 2) return MARKS_TARGET_SEC[marks];
  if (typeof marks === 'number' && Number.isFinite(marks) && marks > 0) {
    return Math.round(marks * MARKS_TARGET_SEC[1]);
  }
  return DEFAULT_TARGET_TIME_SEC;
}

/** GATE question format. MCQ = single-choice, MSQ = multi-select (no negatives), NAT = numeric. */
export type QuestionFormat = 'MCQ' | 'MSQ' | 'NAT';

export interface QuestionFormatSpec {
  value: QuestionFormat;
  label: string;
  hint: string;
}

export const QUESTION_FORMATS: QuestionFormatSpec[] = [
  { value: 'MCQ', label: 'MCQ', hint: 'One correct choice — negative marks apply' },
  { value: 'MSQ', label: 'MSQ', hint: 'Multiple correct — no negative marks' },
  { value: 'NAT', label: 'NAT', hint: 'Numeric answer — no negative marks' }
];

export const TARGET_DURATIONS_MIN = [30, 60, 90, 120] as const;

export const QUESTION_COUNT_CHOICES: { value: number; label: string }[] = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 20, label: '20' },
  { value: 65, label: 'Full paper' }
];

/** First re-attempt is always scheduled +3 days (ladder D3 → D10 → D30). */
export const REATTEMPT_FIRST_DELAY_DAYS = 3;


export const EXAM_DATE_DEFAULT = '2027-02-06';

/** Common IANA zones — enough for the Indian aspirant base + expats. */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'Asia / Kolkata (IST, UTC+5:30)' },
  { value: 'Asia/Colombo', label: 'Asia / Colombo (UTC+5:30)' },
  { value: 'Asia/Kathmandu', label: 'Asia / Kathmandu (UTC+5:45)' },
  { value: 'Asia/Dhaka', label: 'Asia / Dhaka (UTC+6)' },
  { value: 'Asia/Dubai', label: 'Asia / Dubai (UTC+4)' },
  { value: 'Asia/Singapore', label: 'Asia / Singapore (UTC+8)' },
  { value: 'Europe/London', label: 'Europe / London (UTC±0)' },
  { value: 'Europe/Berlin', label: 'Europe / Berlin (UTC+1)' },
  { value: 'America/New_York', label: 'America / New York (UTC−5)' },
  { value: 'America/Chicago', label: 'America / Chicago (UTC−6)' },
  { value: 'America/Los_Angeles', label: 'America / Los Angeles (UTC−8)' },
  { value: 'UTC', label: 'UTC (no offset)' }
];

/** Invite tokens live for a week; the server uses the same value. */
export const INVITE_TTL_DAYS = 7;

/** Days after which the D3/D10/D30 formula review ladder rolls forward. */
export const FORMULA_REVIEW_INTERVALS = [3, 10, 30] as const;
