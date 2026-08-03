import type { MarkDecision, Outcome, PyqSelectedAnswer } from '@/types';
import { DEFAULT_TARGET_TIME_SEC, MARKS_TARGET_SEC } from '@/lib/constants';

export const PYQ_BANK_QUESTION_COUNT = 2388;

export type PyqQuestionType = 'MCQ' | 'MSQ' | 'NAT' | 'AMBIGUOUS' | 'MARKS_TO_ALL' | 'UNSUPPORTED';
export type PyqAnswerStatus = 'available' | 'ambiguous' | 'marks-to-all' | 'unsupported';

export interface PyqSubjectManifest {
  slug: string;
  label: string;
  count: number;
  file: string;
}

export interface PyqManifest {
  bankVersion: string;
  generatedAt: string;
  source: string;
  sourceUrl: string;
  firstYear: number;
  lastYear: number;
  questionCount: number;
  imageCount: number;
  answerStatuses: Record<PyqAnswerStatus, number>;
  years: { year: number; count: number }[];
  subjects: PyqSubjectManifest[];
}

export interface PyqQuestion {
  id: string;
  year: number;
  set: number | null;
  number: string;
  paperLabel: string;
  subject: string;
  subjectSlug: string;
  subtopics: string[];
  marks: 1 | 2 | null;
  type: PyqQuestionType;
  answer: string | number | (string | number)[] | null;
  tolerance: { abs?: number } | null;
  answerStatus: PyqAnswerStatus;
  html: string;
  sourceUrl: string;
  answerSource: unknown;
}

interface SubjectPayload {
  bankVersion: string;
  subject: string;
  questions: PyqQuestion[];
}

const subjectCache = new Map<string, Promise<SubjectPayload>>();
let manifestPromise: Promise<PyqManifest> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Question bank request failed (${response.status})`);
  return (await response.json()) as T;
}

export function loadPyqManifest(): Promise<PyqManifest> {
  manifestPromise ??= fetchJson<PyqManifest>('/pyq/manifest.json');
  return manifestPromise;
}

export async function loadPyqQuestions(subjects: PyqSubjectManifest[]): Promise<PyqQuestion[]> {
  const payloads = await Promise.all(
    subjects.map((subject) => {
      let request = subjectCache.get(subject.slug);
      if (!request) {
        request = fetchJson<SubjectPayload>(subject.file);
        subjectCache.set(subject.slug, request);
      }
      return request;
    })
  );
  return payloads.flatMap((payload) => payload.questions);
}

function normalizedChoices(value: PyqSelectedAnswer): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [String(value)];
  return raw
    .map(String)
    .map((choice) => choice.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

export function evaluatePyqAnswer(
  question: PyqQuestion,
  selected: PyqSelectedAnswer,
  decision: MarkDecision
): boolean | null {
  if (question.answerStatus !== 'available' || decision === 'SKIP' || selected == null) return null;

  if (question.type === 'MCQ') {
    return normalizedChoices(selected)[0] === String(question.answer).trim().toUpperCase();
  }

  if (question.type === 'MSQ') {
    return (
      normalizedChoices(selected).join('|') ===
      normalizedChoices(question.answer as string[]).join('|')
    );
  }

  if (question.type === 'NAT') {
    const numeric = typeof selected === 'number' ? selected : Number(selected);
    if (!Number.isFinite(numeric)) return false;
    const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
    const tolerance = Math.max(0, question.tolerance?.abs ?? 0);
    return accepted.some((answer) => {
      const expected = Number(answer);
      return (
        Number.isFinite(expected) && Math.abs(numeric - expected) <= tolerance + Number.EPSILON
      );
    });
  }

  return null;
}

export function formatPyqAnswer(question: PyqQuestion): string {
  if (question.answerStatus === 'ambiguous')
    return 'Official status: ambiguous; no definitive key.';
  if (question.answerStatus === 'marks-to-all') return 'Official status: marks awarded to all.';
  if (question.answerStatus === 'unsupported')
    return 'Paper defect: no valid listed option; no key invented.';
  if (Array.isArray(question.answer)) {
    const separator = question.type === 'NAT' ? ' or ' : ', ';
    return question.answer.map(String).join(separator);
  }
  return String(question.answer ?? 'Key unavailable');
}

export function pyqSourceRef(question: PyqQuestion): string {
  return [
    'GATE PYQ',
    `${question.year}${question.set ? ` Set ${question.set}` : ''}`,
    `Q ${question.number}`,
    question.type
  ].join(' · ');
}

export function pyqPlainText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function firstPyqImage(html: string): string | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.querySelector('img')?.getAttribute('src') ?? null;
}

/** Human-readable label for the learner's committed answer. */
export function formatPyqSelectedAnswer(
  question: PyqQuestion,
  selected: PyqSelectedAnswer
): string | null {
  if (selected == null) return null;
  if (question.type === 'NAT') {
    const numeric = typeof selected === 'number' ? selected : Number(selected);
    return Number.isFinite(numeric) ? String(numeric) : null;
  }
  const choices = normalizedChoices(selected);
  return choices.length ? choices.join(', ') : null;
}

/** Journal `answer_text`: learner attempt plus official key when available. */
export function buildPyqJournalAnswerText(
  question: PyqQuestion,
  selected: PyqSelectedAnswer
): string {
  const mine = formatPyqSelectedAnswer(question, selected);
  const key = formatPyqAnswer(question);
  if (mine) return `My answer: ${mine}\n${key}`;
  return key;
}

/** Outcome for a graded-correct PYQ when the learner skips full TagFlow analysis. */
export function inferPyqDirectOutcome(
  question: PyqQuestion,
  markDecision: MarkDecision,
  timeSpentSec: number
): Outcome {
  if (markDecision === 'FIFTY_FIFTY') return 'RBG';
  const target = question.marks ? MARKS_TARGET_SEC[question.marks] : DEFAULT_TARGET_TIME_SEC;
  if (timeSpentSec > target) return 'RBS';
  return 'R';
}
