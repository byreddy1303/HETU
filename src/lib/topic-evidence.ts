import type { PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';
import { normalizeAttemptEvidence } from '@/lib/attempt-evidence';
import { canonicalSubjectLabel } from '@/lib/subjects';

export type TopicEvidenceStatus =
  'not-started' | 'studied' | 'active' | 'needs-revision' | 'strong';

export interface TopicEvidence {
  status: TopicEvidenceStatus;
  practiced: number;
  judged: number;
  correct: number;
  accuracy: number | null;
  openMistakes: number;
  lastPracticed: string | null;
}

function same(value: string | null | undefined, expected: string): boolean {
  return value?.trim().toLocaleLowerCase() === expected.trim().toLocaleLowerCase();
}

function daysSince(value: string, today: string): number {
  return Math.max(
    0,
    Math.floor((new Date(`${today}T12:00:00Z`).getTime() - new Date(value).getTime()) / 86_400_000)
  );
}

export function buildTopicEvidence(args: {
  subject: string;
  topic: string;
  studiedAt: string | null;
  questions: QuestionRow[];
  attempts: PyqAttemptRow[];
  reattempts: ReattemptRow[];
  today: string;
}): TopicEvidence {
  const events = normalizeAttemptEvidence({ attempts: args.attempts, questions: args.questions })
    .events.filter(
      (event) =>
        canonicalSubjectLabel(event.subject) === canonicalSubjectLabel(args.subject) &&
        same(event.topic, args.topic)
    );
  const questions = args.questions.filter(
    (question) =>
      canonicalSubjectLabel(question.subject) === canonicalSubjectLabel(args.subject) &&
      same(question.subtopic, args.topic)
  );
  const judged = events.filter(
    (event) => event.outcome === 'correct' || event.outcome === 'wrong'
  ).length;
  const correct = events.filter((event) => event.outcome === 'correct').length;
  const accuracy = judged > 0 ? correct / judged : null;
  const relevantQuestionIds = new Set(questions.map((question) => question.id));
  const openMistakes = args.reattempts.filter(
    (row) => row.stage !== 'MASTERED' && relevantQuestionIds.has(row.question_id)
  ).length;
  const practiced = events.length;
  const timestamps = events.map((event) => event.occurredAt).sort();
  const lastPracticed = timestamps.at(-1) ?? null;
  let status: TopicEvidenceStatus;
  if (practiced === 0) status = args.studiedAt ? 'studied' : 'not-started';
  else if (
    openMistakes > 0 ||
    (judged >= 3 && accuracy !== null && accuracy < 0.6) ||
    (lastPracticed !== null && daysSince(lastPracticed, args.today) > 45)
  ) {
    status = 'needs-revision';
  } else if (
    judged >= 5 &&
    accuracy !== null &&
    accuracy >= 0.75 &&
    lastPracticed !== null &&
    daysSince(lastPracticed, args.today) <= 30
  ) {
    status = 'strong';
  } else {
    status = 'active';
  }
  return { status, practiced, judged, correct, accuracy, openMistakes, lastPracticed };
}
