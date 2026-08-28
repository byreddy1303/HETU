/** Pure parsing helpers for source-archive mark metadata. */

export const VERIFIED_PDF_MARK_POLICY_VERSION = 'pdf-answer-key-marks-v1';
export const GATE_PAPER_PATTERN_MARK_POLICY_VERSION = 'gate-paper-allocation-marks-v2';

const SECTIONED_GATE_CSE_YEARS = new Set([1995, 1996, 1999, 2000, 2001, 2002]);

// The 1994 mirror preserves the paper but not a marks column beside every
// sub-question. These allocations are cross-checked against the archived paper
// structure and the question-level ExamSIDE records that reproduce its marks.
const GATE_CSE_1994_QUESTION_ONE_MARKS = new Set([1, 4, 5, 6, 9, 12, 19, 21]);
const GATE_CSE_1994_QUESTION_TWO_MARKS = new Set([
  2, 3, 7, 8, 10, 11, 13, 14, 15, 16, 17, 18, 20, 22, 23, 24
]);
const GATE_CSE_1994_QUESTION_THREE_ONE_MARKS = new Set([1, 2, 3, 6, 7, 8, 9, 11, 12]);
const GATE_CSE_1994_QUESTION_THREE_TWO_MARKS = new Set([4, 5, 10, 13]);

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

/** Preserve any finite, positive mark allocation published by an archive. */
export function normalizedSourceMark(value) {
  const marks = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof marks !== 'number' || !Number.isFinite(marks) || marks <= 0 || marks > 100) {
    return null;
  }
  return marks;
}

/**
 * ExamSIDE publishes the allocation both as structured metadata and in its
 * canonical URL (`...-marks-5-...`). Prefer the structured value, retaining the
 * URL parser as a reproducible fallback for legacy snapshots.
 */
export function sourceArchiveMark(value, sourceUrl) {
  const direct = normalizedSourceMark(value);
  if (direct != null) return direct;
  const match = String(sourceUrl ?? '').match(/(?:^|[-_/])marks?-(\d+(?:\.\d+)?)(?:[-_/.]|$)/i);
  return normalizedSourceMark(match?.[1]);
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

function firstQuestionNumber(rawNumber) {
  const match = String(rawNumber ?? '').match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isInteger(value) ? value : null;
}

function isGateAptitudeQuestion(question) {
  const subjectSlug = String(question?.subjectSlug ?? '').toLowerCase();
  const number = String(question?.number ?? '').trim();
  return subjectSlug === 'general-aptitude' || /^ga[-_\s]?\d/i.test(number);
}

/**
 * Infer GATE's 1/2-mark value from the documented paper section numbering.
 *
 * This is intentionally narrower than generic mark inference:
 * - applies only to GATE CSE/IT rows used by this bank;
 * - preserves the larger allocations used by the pre-1998 descriptive papers;
 * - leaves non-GATE supplements and paper rows without a published allocation
 *   unknown instead of inventing a split.
 */
export function marksFromGateQuestionNumber(question) {
  const bookSlug = String(question?.bookSlug ?? '').toLowerCase();
  if (bookSlug !== 'gate-cse' && bookSlug !== 'gate-it') return null;

  const year = Number(question?.year);
  if (!Number.isInteger(year)) return null;

  const rawNumber = String(question?.number ?? '').trim();
  if (bookSlug === 'gate-cse' && SECTIONED_GATE_CSE_YEARS.has(year)) {
    const sectionMatch = rawNumber.match(/^0?([12])[.\-]\d+/);
    if (sectionMatch) return sectionMatch[1] === '1' ? 1 : 2;
  }

  const questionNo = firstQuestionNumber(rawNumber);
  if (questionNo == null) return null;

  // The legacy papers state allocations once per section. Preserve those
  // published section rules, including their descriptive 5-mark questions.
  if (bookSlug === 'gate-cse' && year === 1993) {
    // This archive row intentionally bundles official sub-questions 7.1, 7.2
    // and 7.3. The paper assigns 2 marks to each part, so the row represents 6.
    if (/^0?7\.1\s*,\s*2\s*,\s*3(?:\D|$)/.test(rawNumber)) return 6;
    const sectionMatch = rawNumber.match(/^0?([1-8])[.\-]/);
    if (sectionMatch) {
      const section = Number(sectionMatch[1]);
      if (section === 1 || section === 2) return 1;
      if (section >= 6 && section <= 8) return 2;
    }
    if (questionNo >= 9 && questionNo <= 28) return 5;
    return null;
  }

  if (bookSlug === 'gate-cse' && year === 1994) {
    const sectionMatch = rawNumber.match(/^0?([123])[.\-](\d+)/);
    if (sectionMatch?.[1] === '1') {
      const subQuestion = Number(sectionMatch[2]);
      if (GATE_CSE_1994_QUESTION_ONE_MARKS.has(subQuestion)) return 1;
      if (GATE_CSE_1994_QUESTION_TWO_MARKS.has(subQuestion)) return 2;
      return null;
    }
    if (sectionMatch?.[1] === '2') return 2;
    if (sectionMatch?.[1] === '3') {
      const subQuestion = Number(sectionMatch[2]);
      if (GATE_CSE_1994_QUESTION_THREE_ONE_MARKS.has(subQuestion)) return 1;
      if (GATE_CSE_1994_QUESTION_THREE_TWO_MARKS.has(subQuestion)) return 2;
      return null;
    }
    if (questionNo >= 9 && questionNo <= 28) return 5;
    return null;
  }

  if (bookSlug === 'gate-cse' && (year === 1995 || year === 1996)) {
    if (questionNo >= 3 && questionNo <= 27) return 5;
    return null;
  }

  if (bookSlug === 'gate-cse' && year === 1997) {
    const sectionMatch = rawNumber.match(/^0?([1-6])[.\-]/);
    if (sectionMatch) return Number(sectionMatch[1]) <= 3 ? 1 : 2;
    if (questionNo >= 7) return 5;
    return null;
  }

  if (bookSlug === 'gate-cse' && (year === 1999 || year === 2000 || year === 2002)) {
    if (questionNo >= 3) return 5;
    return null;
  }

  // Recent GATE CSE rows in this archive store GA and technical questions in
  // separate local numbering ranges. Official master papers still carry the
  // same split: GA Q1-Q5/Q6-Q10 and technical Q11-Q35/Q36-Q65.
  if (bookSlug === 'gate-cse' && year >= 2014 && year <= 2026) {
    if (isGateAptitudeQuestion(question)) {
      if (questionNo >= 1 && questionNo <= 5) return 1;
      if (questionNo >= 6 && questionNo <= 10) return 2;
      return null;
    }
    if (questionNo >= 1 && questionNo <= 25) return 1;
    if (questionNo >= 26 && questionNo <= 55) return 2;
    return null;
  }

  // GATE CSE 2010-2013 used a single 65-question master sequence with GA at
  // the end: Q1-Q25 and Q56-Q60 are one-mark; Q26-Q55 and Q61-Q65 are two-mark.
  if (bookSlug === 'gate-cse' && year >= 2010 && year <= 2013) {
    if ((questionNo >= 1 && questionNo <= 25) || (questionNo >= 56 && questionNo <= 60)) {
      return 1;
    }
    if ((questionNo >= 26 && questionNo <= 55) || (questionNo >= 61 && questionNo <= 65)) {
      return 2;
    }
    return null;
  }

  if (bookSlug === 'gate-cse' && year === 2009) {
    if (questionNo >= 1 && questionNo <= 20) return 1;
    if (questionNo >= 21 && questionNo <= 60) return 2;
    return null;
  }

  if (year >= 2006 && year <= 2008) {
    if (questionNo >= 1 && questionNo <= 20) return 1;
    if (questionNo >= 21 && questionNo <= 85) return 2;
    return null;
  }

  if (year >= 2003 && year <= 2005) {
    if (questionNo >= 1 && questionNo <= 30) return 1;
    if (questionNo >= 31 && questionNo <= 90) return 2;
    return null;
  }

  return null;
}

/**
 * Preserve the strict source-precedence order, then fall back to documented
 * GATE paper patterns for archive rows whose source metadata omitted marks.
 */
export function marksFromQuestionContext(question, tags, answerSource) {
  return (
    verifiedPdfAnswerKeyMark(answerSource) ??
    marksFromGateQuestionNumber(question) ??
    marksFromTags(tags)
  );
}
