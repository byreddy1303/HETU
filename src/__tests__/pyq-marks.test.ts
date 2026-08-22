import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isMarksMetadataTag,
  marksFromQuestionMetadata,
  marksFromTags,
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
});
