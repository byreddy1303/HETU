/** Pure parsing helpers for source-archive mark metadata. */

export const VERIFIED_PDF_MARK_POLICY_VERSION = 'pdf-answer-key-marks-v1';

function normalizedTag(rawTag) {
  return String(rawTag)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

export function markValueFromTag(rawTag) {
  const tag = normalizedTag(rawTag);
  if (/^(?:one|1)-marks?$/.test(tag)) return 1;
  if (/^(?:two|2)-marks?$/.test(tag)) return 2;
  return null;
}

export function isMarksMetadataTag(rawTag) {
  return markValueFromTag(rawTag) != null;
}

export function marksFromTags(tags) {
  const found = new Set();
  for (const rawTag of tags ?? []) {
    const marks = markValueFromTag(rawTag);
    if (marks != null) found.add(marks);
  }
  // Conflicting or absent source metadata must remain unknown; never guess.
  return found.size === 1 ? [...found][0] : null;
}

/**
 * Return a mark value only when it is carried by the structured PDF answer-key
 * provenance captured beside the answer. A bare tag is useful source metadata,
 * but it is not independent evidence when contradictory tags are present.
 */
export function verifiedPdfAnswerKeyMark(answerSource) {
  if (!answerSource || typeof answerSource !== 'object') return null;
  if (answerSource.kind !== 'pdf_answer_key') return null;
  if (answerSource.marks !== 1 && answerSource.marks !== 2) return null;
  if (!Number.isInteger(answerSource.year)) return null;
  if (!Number.isInteger(answerSource.question_no)) return null;
  if (typeof answerSource.pdf !== 'string' || !answerSource.pdf.trim()) return null;
  return answerSource.marks;
}

/** A verified PDF key outranks tag metadata; otherwise retain the safe parser. */
export function marksFromQuestionMetadata(tags, answerSource) {
  return verifiedPdfAnswerKeyMark(answerSource) ?? marksFromTags(tags);
}
