import type { PyqAttemptRow, QuestionRow, ReattemptRow } from '@/types';
import { normalizeAttemptEvidence } from '@/lib/attempt-evidence';
import { canonicalSubjectLabel } from '@/lib/subjects';
import type { TopicEvidenceAlias } from '@/lib/subtopics';

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

function topicLookupKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sameTopic(value: string | null | undefined, expected: string): boolean {
  const actualKey = topicLookupKey(value);
  return actualKey.length > 0 && actualKey === topicLookupKey(expected);
}

function matchesAlias(
  subject: string,
  topic: string | null | undefined,
  aliases: readonly TopicEvidenceAlias[]
): boolean {
  const canonicalSubject = canonicalSubjectLabel(subject);
  return aliases.some(
    (alias) =>
      canonicalSubjectLabel(alias.subject) === canonicalSubject && sameTopic(topic, alias.topic)
  );
}

function attemptBankTopicKey(attempt: PyqAttemptRow | undefined): string | null {
  const snapshot = attempt?.question_snapshot;
  if (!snapshot?.subject_slug?.trim() || !snapshot.topic_slug?.trim()) return null;
  return `${snapshot.subject_slug.trim().toLocaleLowerCase()}/${snapshot.topic_slug
    .trim()
    .toLocaleLowerCase()}`;
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
  /** Safe current-scope labels retained from older tracker/tag vocabularies. */
  topicAliases?: readonly TopicEvidenceAlias[];
  /** Audited immutable-bank keys which may feed this official leaf. */
  bankTopicKeys?: readonly string[];
  /** Safe legacy evidence on a conservatively mapped leaf cannot claim strong mastery. */
  allowStrong?: boolean;
}): TopicEvidence {
  const aliases: TopicEvidenceAlias[] = [
    { subject: args.subject, topic: args.topic },
    ...(args.topicAliases ?? [])
  ];
  const allowedBankTopicKeys = new Set(
    (args.bankTopicKeys ?? []).map((key) => key.trim().toLocaleLowerCase())
  );
  const attemptsById = new Map(args.attempts.map((attempt) => [attempt.id, attempt]));
  const events = normalizeAttemptEvidence({
    attempts: args.attempts,
    questions: args.questions
  }).events.filter((event) => {
    const bankTopicKey = event.attemptId
      ? attemptBankTopicKey(attemptsById.get(event.attemptId))
      : null;
    // Immutable-bank identity is authoritative when present. Do not let a
    // broad/shared/review-required key fall through to a coincidentally
    // matching display label and become leaf-level practice evidence.
    if (bankTopicKey !== null) return allowedBankTopicKeys.has(bankTopicKey);
    return matchesAlias(event.subject, event.topic, aliases);
  });
  const questions = args.questions.filter((question) => {
    const sourceAttempt = question.source_pyq_attempt_id
      ? attemptsById.get(question.source_pyq_attempt_id)
      : undefined;
    const bankTopicKey = attemptBankTopicKey(sourceAttempt);
    if (bankTopicKey !== null) return allowedBankTopicKeys.has(bankTopicKey);
    return matchesAlias(question.subject, question.subtopic, aliases);
  });
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
  if (status === 'strong' && args.allowStrong === false) status = 'active';
  return { status, practiced, judged, correct, accuracy, openMistakes, lastPracticed };
}
