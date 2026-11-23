import { describe, expect, it } from 'vitest';
import type { PyqQuestion } from '@/lib/pyq';
import { similarUnseenQuestion } from '@/lib/similar-question';

function question(id: string, fields: Partial<PyqQuestion> = {}): PyqQuestion {
  return {
    id,
    year: 2019,
    set: null,
    number: '1',
    paperLabel: `GATE CSE ${fields.year ?? 2019}`,
    subject: 'Operating Systems',
    subjectSlug: 'operating-systems',
    topic: 'Deadlock',
    topicSlug: 'deadlock',
    subtopics: [],
    marks: 2,
    type: 'MCQ',
    answer: 'A',
    tolerance: null,
    answerStatus: 'available',
    html: '',
    sourceUrl: '',
    answerSource: null,
    ...fields
  };
}

const none = { attempted: new Set<string>(), exclude: new Set<string>() };

describe('similarUnseenQuestion', () => {
  const missed = question('missed', { year: 2016, subtopics: ['bankers-algorithm'] });

  it('stays on the same subject and topic and skips anything seen or excluded', () => {
    const bank = [
      missed,
      question('other-topic', { topicSlug: 'paging', topic: 'Paging' }),
      question('other-subject', { subjectSlug: 'algorithms' }),
      question('seen'),
      question('in-set'),
      question('ungradable', { answerStatus: 'ambiguous' }),
      question('fresh')
    ];
    const pick = similarUnseenQuestion(missed, bank, {
      attempted: new Set(['seen']),
      exclude: new Set(['in-set'])
    });
    expect(pick?.id).toBe('fresh');
  });

  it('prefers GATE CSE, a shared subtopic, then a modern paper close in year', () => {
    const bank = [
      question('isro', { paperLabel: 'ISRO 2018', subtopics: ['bankers-algorithm'] }),
      question('old-match', { year: 2004, subtopics: ['bankers-algorithm'] }),
      question('modern-match', { year: 2018, subtopics: ['bankers-algorithm'] }),
      question('modern-nomatch', { year: 2016 })
    ];
    expect(similarUnseenQuestion(missed, bank, none)?.id).toBe('modern-match');
    expect(
      similarUnseenQuestion(
        missed,
        bank.filter((row) => row.id !== 'modern-match'),
        none
      )?.id
    ).toBe('old-match');
  });

  it('returns null when the topic has nothing unseen left', () => {
    expect(
      similarUnseenQuestion(missed, [missed, question('seen')], {
        attempted: new Set(['seen']),
        exclude: new Set()
      })
    ).toBeNull();
  });
});
