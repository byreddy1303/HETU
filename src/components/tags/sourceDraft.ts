// Shared source-draft type + factory used by SourceStep and TagFlow.
// Split from SourceStep.tsx so the component file only exports its component
// (keeps React Fast Refresh happy).
import {
  PYQ_TWO_SETS_FROM,
  SOURCE_KIND_BY_VALUE,
  examYears,
  type QuestionFormat,
  type SourceKind
} from '@/lib/constants';

export interface SourceDraft {
  subject: string;
  subtopic: string | null;
  kind: SourceKind;
  year: number | null;
  set: 1 | 2 | null;
  questionNumber: string | null;
  /** Manual entry offers modern 1/2-mark choices; locked PYQs may carry a legacy allocation. */
  marks: number | null;
  format: QuestionFormat | null;
  questionText: string | null;
  answerText: string | null;
  imageDataUrl: string | null;
}

export function makeInitialSource(subject: string): SourceDraft {
  const years = examYears(SOURCE_KIND_BY_VALUE.pyq);
  const defaultYear = years[0] ?? null;
  return {
    subject,
    subtopic: null,
    kind: 'pyq',
    year: defaultYear,
    set: defaultYear != null && defaultYear >= PYQ_TWO_SETS_FROM ? 1 : null,
    questionNumber: null,
    marks: null,
    format: null,
    questionText: null,
    answerText: null,
    imageDataUrl: null
  };
}
