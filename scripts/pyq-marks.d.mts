export function markValueFromTag(rawTag: unknown): 1 | 2 | null;
export function isMarksMetadataTag(rawTag: unknown): boolean;
export function marksFromTags(tags: readonly unknown[] | null | undefined): 1 | 2 | null;
export const VERIFIED_PDF_MARK_POLICY_VERSION: 'pdf-answer-key-marks-v1';
export const GATE_PAPER_PATTERN_MARK_POLICY_VERSION: 'gate-paper-pattern-marks-v1';
export function verifiedPdfAnswerKeyMark(answerSource: unknown): 1 | 2 | null;
export function marksFromQuestionMetadata(
  tags: readonly unknown[] | null | undefined,
  answerSource: unknown
): 1 | 2 | null;
export function marksFromGateQuestionNumber(question: {
  bookSlug?: unknown;
  year?: unknown;
  number?: unknown;
  subjectSlug?: unknown;
}): 1 | 2 | null;
export function marksFromQuestionContext(
  question: {
    bookSlug?: unknown;
    year?: unknown;
    number?: unknown;
    subjectSlug?: unknown;
  },
  tags: readonly unknown[] | null | undefined,
  answerSource: unknown
): 1 | 2 | null;
