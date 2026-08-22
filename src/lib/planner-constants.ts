// Planner-only enums. Kept separate from lib/constants.ts (which is for the
// Log/Session/Journal side of HETU) so the planner can evolve alone.

import type {
  BreakPattern,
  DayType,
  EnergyForecast,
  Priority,
  StudyMode
} from '@/lib/planner-storage';
import { CANONICAL_SUBJECT_LABELS, canonicalSubjectLabel } from '@/lib/subjects';

/** GATE CS subjects only, plus a few workflow-oriented entries. */
export const PLANNER_SUBJECTS: readonly string[] = [
  ...CANONICAL_SUBJECT_LABELS,
  'Previous Year Questions',
  'Full Mock Test',
  'Topic-wise Mini Test',
  'Revision',
  'Personal Project Work',
  'Custom...'
] as const;

export const DURATIONS: readonly { value: number; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hr' },
  { value: 90, label: '1.5 hr' },
  { value: 120, label: '2 hr' },
  { value: 150, label: '2.5 hr' },
  { value: 180, label: '3 hr' },
  { value: -1, label: 'Custom' }
] as const;

export const STUDY_MODES: readonly StudyMode[] = [
  'Deep Study',
  'Revision',
  'Problem Solving',
  'PYQ Practice',
  'Mock Test',
  'Lecture Watch',
  'Note Making',
  'Doubt Clearing'
];

export const PRIORITIES: readonly Priority[] = ['P1 Critical', 'P2 High', 'P3 Medium', 'P4 Low'];

export const BREAK_PATTERNS: readonly { value: BreakPattern; label: string }[] = [
  { value: 'p25', label: 'Pomodoro 25/5' },
  { value: 'p50', label: 'Pomodoro 50/10' },
  { value: 'p90', label: 'Pomodoro 90/20' },
  { value: 'custom', label: 'Custom' },
  { value: 'flexible', label: 'Flexible' }
];

export const DAY_TYPES: readonly DayType[] = [
  'Full Study Day',
  'Half Day',
  'Light Day',
  'Mock Test Day',
  'Rest/Recovery Day',
  'Travel Day',
  'Exam Day'
];

export const ENERGY_FORECASTS: readonly {
  value: EnergyForecast;
  label: string;
}[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'recovery', label: 'Recovery Mode' }
];

export const MOOD_INTENTS: readonly string[] = [
  'Focused Grind',
  'Exploring/Learning',
  'Light Revision',
  'Intense Practice',
  'Balanced'
];

/** Storage-safe id → display label pairs for end-of-day mood. */
export const END_MOODS: readonly {
  value: 'drained' | 'flat' | 'ok' | 'strong' | 'fired_up';
  label: string;
}[] = [
  { value: 'drained', label: 'Drained' },
  { value: 'flat', label: 'Flat' },
  { value: 'ok', label: 'OK' },
  { value: 'strong', label: 'Strong' },
  { value: 'fired_up', label: 'Fired up' }
];

/** Deterministic ink chip color per subject — keeps the calendar readable. */
export function subjectChipInk(subject: string): { bg: string; text: string } {
  const palette = [
    { bg: 'bg-ink-cobalt/12', text: 'text-ink-cobalt' },
    { bg: 'bg-ink-teal/12', text: 'text-ink-teal' },
    { bg: 'bg-ink-violet/12', text: 'text-ink-violet' },
    { bg: 'bg-ink-rose/12', text: 'text-ink-rose' },
    { bg: 'bg-ink-marigold/15', text: 'text-ink-marigold' },
    { bg: 'bg-ink-slate/12', text: 'text-ink-slate' }
  ];
  const stableSubject = canonicalSubjectLabel(subject);
  let h = 0;
  for (let i = 0; i < stableSubject.length; i++) {
    h = (h * 31 + stableSubject.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(h) % palette.length];
}

/** July 2025 is the first allowed month. */
export const PLANNER_MIN_YEAR = 2025;
export const PLANNER_MIN_MONTH_INDEX = 6; // 0-indexed → July
