// EditorDraft shape + helpers, split from QuestionEditor.tsx so the component
// file exports only a component (keeps React Fast Refresh happy).
import type { MarkDecision, Outcome, QuestionRow, RootCause } from '@/types';
import {
  MARKS_TARGET_SEC,
  PYQ_TWO_SETS_FROM,
  QUESTION_FORMATS,
  SOURCE_KINDS,
  SOURCE_KIND_BY_VALUE,
  buildSourceRef,
  examYears,
  targetTimeSecForMarks,
  type QuestionFormat,
  type SourceKind
} from '@/lib/constants';

const GATE_PYQ_YEARS = examYears(SOURCE_KIND_BY_VALUE.pyq);

export interface EditorDraft {
  subject: string;
  subtopic: string | null;
  sourceKind: SourceKind;
  sourceYear: number | null;
  sourceSet: 1 | 2 | null;
  questionNumber: string | null;
  format: QuestionFormat | null;
  /** Manual entry offers 1/2 marks; an audited legacy PYQ may carry a larger value. */
  marks: number | null;
  questionText: string | null;
  answerText: string | null;
  imageDataUrl: string | null;
  outcome: Outcome;
  patternName: string | null;
  triggerSentence: string | null;
  rootCause: RootCause | null;
  markDecision: MarkDecision | null;
  markCorrect: boolean | null;
  timeSpentSec: number;
  createdDate: string; // yyyy-mm-dd
}

function detectSource(row: Pick<QuestionRow, 'source_ref' | 'source_year'>): {
  kind: SourceKind;
  set: 1 | 2 | null;
  questionNumber: string | null;
  format: QuestionFormat | null;
} {
  const ref = row.source_ref ?? '';
  let kind: SourceKind = 'other';
  for (const s of SOURCE_KINDS) {
    if (ref === s.refPrefix || ref.startsWith(`${s.refPrefix} · `)) {
      kind = s.value;
      break;
    }
  }
  let set: 1 | 2 | null = null;
  const setMatch = ref.match(/Set (1|2)/);
  if (setMatch) set = Number(setMatch[1]) as 1 | 2;
  let format: QuestionFormat | null = null;
  for (const qf of QUESTION_FORMATS) {
    if (ref === qf.value || ref.endsWith(` · ${qf.value}`)) {
      format = qf.value;
      break;
    }
  }
  const segments = ref.split(' · ').slice(1);
  let questionNumber: string | null = null;
  for (const seg of segments) {
    if (seg.match(/^\d{4}( Set [12])?$/)) continue;
    if (QUESTION_FORMATS.some((q) => q.value === seg)) continue;
    questionNumber = seg;
    break;
  }
  return { kind, set, questionNumber, format };
}

export function draftFromRow(row: QuestionRow): EditorDraft {
  const src = detectSource(row);
  let marks: number | null = null;
  if (row.target_time_sec === MARKS_TARGET_SEC[1]) marks = 1;
  else if (row.target_time_sec === MARKS_TARGET_SEC[2]) marks = 2;
  else if (
    src.kind === 'pyq' &&
    Number.isFinite(row.target_time_sec) &&
    row.target_time_sec > 0 &&
    row.target_time_sec % MARKS_TARGET_SEC[1] === 0
  ) {
    marks = row.target_time_sec / MARKS_TARGET_SEC[1];
  }
  return {
    subject: row.subject,
    subtopic: row.subtopic,
    sourceKind: src.kind,
    sourceYear: row.source_year,
    sourceSet: src.set,
    questionNumber: src.questionNumber,
    format: src.format,
    marks,
    questionText: row.question_text,
    answerText: row.answer_text,
    imageDataUrl: row.image_url,
    outcome: row.outcome,
    patternName: row.pattern_name,
    triggerSentence: row.trigger_sentence,
    rootCause: row.root_cause,
    markDecision: row.mark_decision,
    markCorrect: row.mark_correct,
    timeSpentSec: row.time_spent_sec,
    createdDate: row.created_at.slice(0, 10)
  };
}

export function emptyDraft(subject: string, today: string): EditorDraft {
  const defaultYear = GATE_PYQ_YEARS[0] ?? null;
  return {
    subject,
    subtopic: null,
    sourceKind: 'pyq',
    sourceYear: defaultYear,
    sourceSet: defaultYear != null && defaultYear >= PYQ_TWO_SETS_FROM ? 1 : null,
    questionNumber: null,
    format: null,
    marks: null,
    questionText: null,
    answerText: null,
    imageDataUrl: null,
    outcome: 'R',
    patternName: null,
    triggerSentence: null,
    rootCause: null,
    markDecision: null,
    markCorrect: null,
    timeSpentSec: 0,
    createdDate: today
  };
}

export function applyDraftToRow(row: QuestionRow, draft: EditorDraft): QuestionRow {
  const originalTime = row.created_at.slice(10);
  const created_at = originalTime.startsWith('T')
    ? `${draft.createdDate}${originalTime}`
    : `${draft.createdDate}T00:00:00.000Z`;
  const target = targetTimeSecForMarks(draft.marks);
  const spec = SOURCE_KIND_BY_VALUE[draft.sourceKind];
  const isYearBased = !!spec.hasYear;
  const isPyq = draft.sourceKind === 'pyq';
  return {
    ...row,
    subject: draft.subject,
    subtopic: draft.subtopic,
    source_year: isYearBased ? draft.sourceYear : null,
    source_ref: buildSourceRef(
      draft.sourceKind,
      isYearBased ? draft.sourceYear : null,
      isPyq && (draft.sourceYear ?? 0) >= PYQ_TWO_SETS_FROM ? draft.sourceSet : null,
      draft.questionNumber,
      draft.format
    ),
    question_text: draft.questionText?.trim() || null,
    answer_text: draft.answerText?.trim() || null,
    image_url: draft.imageDataUrl,
    time_spent_sec: draft.timeSpentSec,
    target_time_sec: target,
    outcome: draft.outcome,
    pattern_name: draft.patternName?.trim() || null,
    trigger_sentence: draft.triggerSentence?.trim() || null,
    root_cause: draft.rootCause,
    mark_decision: draft.markDecision,
    mark_correct: draft.markDecision === 'SKIP' ? null : draft.markCorrect,
    created_at
  };
}
