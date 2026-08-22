export function markValueFromTag(rawTag: unknown): 1 | 2 | null;
export function isMarksMetadataTag(rawTag: unknown): boolean;
export function marksFromTags(tags: readonly unknown[] | null | undefined): 1 | 2 | null;
export const VERIFIED_PDF_MARK_POLICY_VERSION: 'pdf-answer-key-marks-v1';
export function verifiedPdfAnswerKeyMark(answerSource: unknown): 1 | 2 | null;
export function marksFromQuestionMetadata(
  tags: readonly unknown[] | null | undefined,
  answerSource: unknown
): 1 | 2 | null;
