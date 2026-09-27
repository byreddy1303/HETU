import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPyqAutoGradable, pyqMarksLabel, type PyqManifest, type PyqQuestion } from '@/lib/pyq';
import {
  guardPyqQuestionIntegrity,
  PYQ_CONFLICTING_KEY_IDS,
  pyqContentIdentity,
  uniquePyqPracticeQuestions
} from '@/lib/pyq-integrity';
import { pyqPracticeChoices } from '@/components/pyq/pyqPracticeQuestion';
import { recommendPyqSelection } from '@/lib/pyq-recommended-selection';

const manifest = JSON.parse(readFileSync('public/pyq/manifest.json', 'utf8')) as PyqManifest;
const questions = manifest.subjects.flatMap(
  (subject) => JSON.parse(readFileSync(`public${subject.file}`, 'utf8')).questions
) as PyqQuestion[];

describe('bundled practice integrity', () => {
  it('does not admit newly introduced conflicting duplicate keys', () => {
    const groups = new Map<string, PyqQuestion[]>();
    for (const question of questions) {
      const key = pyqContentIdentity(question);
      groups.set(key, [...(groups.get(key) ?? []), question]);
    }
    for (const group of groups.values()) {
      const keys = new Set(
        group.map((question) =>
          JSON.stringify([question.type, question.answer, question.tolerance])
        )
      );
      if (keys.size <= 1) continue;
      for (const question of group)
        expect(PYQ_CONFLICTING_KEY_IDS.has(question.id), question.id).toBe(true);
    }
  });

  it('makes every nonstandard objective answer selectable in the answer pad', () => {
    for (const question of questions.filter(isPyqAutoGradable)) {
      if (question.type === 'NAT') continue;
      const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
      if (
        !question.choices &&
        answers.every((answer) => ['A', 'B', 'C', 'D'].includes(String(answer)))
      )
        continue;
      for (const answer of Array.isArray(question.answer) ? question.answer : [question.answer]) {
        expect(pyqPracticeChoices(question), question.id).toContain(String(answer));
      }
    }
  });
  it('quarantines both sides of conflicting keys, including in saved sessions', () => {
    for (const id of PYQ_CONFLICTING_KEY_IDS) {
      const question = questions.find((row) => row.id === id)!;
      expect(question).toBeDefined();
      expect(isPyqAutoGradable(question)).toBe(false);
      expect(guardPyqQuestionIntegrity(question)).toMatchObject({
        answer: null,
        answerStatus: 'ambiguous'
      });
    }
  });
  it('excludes subjective and unkeyed archive entries from new recommended sets', () => {
    const sample = questions.find((row) => row.type === 'SUBJECTIVE')!;
    const valid = questions.find((row) => row.type === 'MCQ' && isPyqAutoGradable(row))!;
    const selection = recommendPyqSelection({
      questions: [sample, valid],
      attempts: [],
      preset: 'learn',
      seed: 'integrity',
      requestedCount: 10
    });
    expect(selection.questions.map((row) => row.id)).toEqual([valid.id]);
  });
  it('removes same-content aliases while retaining distinct diagrams and option order', () => {
    const aliases = questions.filter((row) =>
      ['es:gate-cse:cSKl4EFy2RmrDF0x', 'es:gate-cse:nTk8JawFHJogRfme'].includes(row.id)
    );
    expect(aliases).toHaveLength(2);
    expect(uniquePyqPracticeQuestions(aliases)).toHaveLength(1);
    const first = aliases[0];
    expect(
      uniquePyqPracticeQuestions([
        first,
        { ...first, id: 'different-diagram', html: first.html + '<img src="/other.png">' }
      ])
    ).toHaveLength(2);
    const selection = recommendPyqSelection({
      questions: aliases,
      attempts: [],
      preset: 'learn',
      seed: 'duplicates',
      requestedCount: 10
    });
    expect(selection.questions).toHaveLength(1);
  });
  it('always gives a marks label without inventing an allocation', () => {
    expect(pyqMarksLabel({ marks: null })).toBe('Marks unavailable');
    expect(pyqMarksLabel({ marks: 1 })).toBe('1 mark');
    expect(pyqMarksLabel({ marks: 5 })).toBe('5 marks');
  });
});
