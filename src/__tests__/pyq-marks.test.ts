import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isMarksMetadataTag,
  marksFromGateQuestionNumber,
  marksFromQuestionContext,
  marksFromQuestionMetadata,
  marksFromTags,
  sourceArchiveMark,
  verifiedPdfAnswerKeyMark
} from '../../scripts/pyq-marks.mjs';

describe('PYQ source mark tags', () => {
  it.each([
    ['one-mark', 1],
    ['one-marks', 1],
    ['1-mark', 1],
    ['1-marks', 1],
    ['ONE MARK', 1],
    ['two-mark', 2],
    ['two-marks', 2],
    ['2-mark', 2],
    ['2-marks', 2],
    ['TWO_MARKS', 2]
  ])('parses %s as %i mark metadata', (tag, marks) => {
    expect(marksFromTags(['gate', tag])).toBe(marks);
    expect(isMarksMetadataTag(tag)).toBe(true);
  });

  it('leaves absent or conflicting metadata unknown', () => {
    expect(marksFromTags(['gate', 'algorithms'])).toBeNull();
    expect(marksFromTags(['1-mark', 'two-marks'])).toBeNull();
    expect(isMarksMetadataTag('landmark')).toBe(false);
  });

  it('prefers a structured PDF answer-key mark over contradictory archive tags', () => {
    const source = {
      kind: 'pdf_answer_key',
      year: 2026,
      set: 2,
      pdf: 'keys2026/CS2_Keys.pdf',
      question_no: 6,
      marks: 2
    };
    expect(marksFromTags(['one-mark', 'two-marks'])).toBeNull();
    expect(verifiedPdfAnswerKeyMark(source)).toBe(2);
    expect(marksFromQuestionMetadata(['one-mark', 'two-marks'], source)).toBe(2);
  });

  it('does not elevate an unproven or malformed source over conflicting tags', () => {
    expect(
      marksFromQuestionMetadata(['one-mark', 'two-marks'], {
        kind: 'examside-key',
        year: 2026,
        pdf: 'not-a-pdf-key',
        question_no: 6,
        marks: 2
      })
    ).toBeNull();
    expect(
      marksFromQuestionMetadata(['one-mark', 'two-marks'], {
        kind: 'pdf_answer_key',
        year: 2026,
        pdf: '',
        question_no: 6,
        marks: 2
      })
    ).toBeNull();
  });

  it('preserves larger allocations published in legacy archive URLs', () => {
    expect(sourceArchiveMark(null, 'https://example.test/question-marks-5-example')).toBe(5);
    expect(sourceArchiveMark(null, 'https://example.test/question-marks-10-example')).toBe(10);
    expect(sourceArchiveMark(8, 'https://example.test/question-marks-1-example')).toBe(8);
    expect(sourceArchiveMark(-1, 'https://example.test/question-without-marks')).toBeNull();
  });

  it('applies the published descriptive-section allocations for legacy CSE papers', () => {
    expect(
      marksFromGateQuestionNumber({ bookSlug: 'gate-cse', year: 1993, number: '7.1,2,3' })
    ).toBe(6);
    expect(
      marksFromGateQuestionNumber({ bookSlug: 'gate-cse', year: 1994, number: '1.2' })
    ).toBe(2);
    expect(
      marksFromGateQuestionNumber({ bookSlug: 'gate-cse', year: 1994, number: '9' })
    ).toBe(5);
    expect(
      marksFromGateQuestionNumber({ bookSlug: 'gate-cse', year: 1997, number: '4.3' })
    ).toBe(2);
    expect(
      marksFromGateQuestionNumber({ bookSlug: 'gate-cse', year: 2000, number: '18' })
    ).toBe(5);
  });

  it('lets the published paper allocation repair a stale archive tag', () => {
    expect(
      marksFromQuestionContext(
        {
          bookSlug: 'gate-cse',
          year: 2025,
          number: '42',
          subjectSlug: 'algorithms'
        },
        ['one-mark'],
        null
      )
    ).toBe(2);
  });

  it('locks the shipped 2026 PDF-key rows to the official 60x1M/70x2M split', async () => {
    const root = process.cwd();
    const manifest = JSON.parse(
      await readFile(path.join(root, 'public', 'pyq', 'manifest.json'), 'utf8')
    ) as {
      verifiedPdfMarkMetadata: {
        questionCount: number;
        oneMarkCount: number;
        twoMarkCount: number;
      };
      subjects: { file: string }[];
    };
    const payloads = await Promise.all(
      manifest.subjects.map((subject) =>
        readFile(path.join(root, 'public', subject.file), 'utf8').then(JSON.parse)
      )
    );
    const verified = payloads
      .flatMap((payload) => payload.questions as Array<Record<string, unknown>>)
      .filter(
        (question) =>
          (question.answerSource as { kind?: unknown } | null)?.kind === 'pdf_answer_key'
      );

    expect(verified).toHaveLength(130);
    expect(verified.filter((question) => question.marks === 1)).toHaveLength(60);
    expect(verified.filter((question) => question.marks === 2)).toHaveLength(70);
    expect(
      verified.every(
        (question) =>
          question.marks ===
          verifiedPdfAnswerKeyMark(question.answerSource as Record<string, unknown>)
      )
    ).toBe(true);
    expect(manifest.verifiedPdfMarkMetadata).toMatchObject({
      questionCount: 130,
      oneMarkCount: 60,
      twoMarkCount: 70
    });
  });

  it('ships a complete, audited mark allocation for every GATE-derived row', async () => {
    const root = process.cwd();
    const audit = JSON.parse(
      await readFile(path.join(root, 'public', 'pyq', 'marks-audit.json'), 'utf8')
    ) as {
      schemaVersion: number;
      result: {
        gateQuestionCount: number;
        gateMissingBefore: number;
        gateNewlyAssigned: number;
        gateCorrectedExisting: number;
        gateMissingAfter: number;
      };
      modernCompletePaperChecks: Array<{
        questionCount: number;
        representedMarkSum: number;
      }>;
      markEvidenceByQuestionId: Record<string, string>;
    };

    expect(audit.schemaVersion).toBe(2);
    expect(audit.result).toMatchObject({
      gateQuestionCount: 4043,
      gateMissingBefore: 2722,
      gateNewlyAssigned: 2722,
      gateCorrectedExisting: 96,
      gateMissingAfter: 0
    });
    expect(audit.modernCompletePaperChecks).toHaveLength(6);
    expect(
      audit.modernCompletePaperChecks.every(
        (paper) => paper.questionCount === 65 && paper.representedMarkSum === 100
      )
    ).toBe(true);
    expect(Object.keys(audit.markEvidenceByQuestionId)).toHaveLength(4043);
    expect(Object.values(audit.markEvidenceByQuestionId).every(Boolean)).toBe(true);
  });
});
