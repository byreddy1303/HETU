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

export interface TopicEvidenceQueryItem {
  id: string;
  subject: string;
  topic: string;
  studiedAt?: string | null;
  /** Safe current-scope labels retained from older tracker/tag vocabularies. */
  topicAliases?: readonly TopicEvidenceAlias[];
  /** Audited immutable-bank keys which may feed this official leaf. */
  bankTopicKeys?: readonly string[];
  /** Safe legacy evidence on a conservatively mapped leaf cannot claim strong mastery. */
  allowStrong?: boolean;
}

export function buildBatchTopicEvidence(args: {
  topics: readonly TopicEvidenceQueryItem[];
  questions: QuestionRow[];
  attempts: PyqAttemptRow[];
  reattempts: ReattemptRow[];
  today: string;
}): Map<string, TopicEvidence> {
  const result = new Map<string, TopicEvidence>();
  if (args.topics.length === 0) return result;

  const todayParsed = new Date(`${args.today}T12:00:00Z`).getTime();
  const getDaysSince = (value: string) =>
    Math.max(0, Math.floor((todayParsed - new Date(value).getTime()) / 86_400_000));

  const attemptsById = new Map(args.attempts.map((attempt) => [attempt.id, attempt]));
  const normalizedLedger = normalizeAttemptEvidence({
    attempts: args.attempts,
    questions: args.questions
  });

  // Pre-index events
  const eventsByBankKey = new Map<string, typeof normalizedLedger.events>();
  const eventsByAliasKey = new Map<string, typeof normalizedLedger.events>();

  for (const event of normalizedLedger.events) {
    const bankTopicKey = event.attemptId
      ? attemptBankTopicKey(attemptsById.get(event.attemptId))
      : null;
    if (bankTopicKey !== null) {
      let list = eventsByBankKey.get(bankTopicKey);
      if (!list) {
        list = [];
        eventsByBankKey.set(bankTopicKey, list);
      }
      list.push(event);
    } else {
      const canonicalSub = canonicalSubjectLabel(event.subject);
      const topKey = topicLookupKey(event.topic);
      const aliasKey = `${canonicalSub}::${topKey}`;
      let list = eventsByAliasKey.get(aliasKey);
      if (!list) {
        list = [];
        eventsByAliasKey.set(aliasKey, list);
      }
      list.push(event);
    }
  }

  // Pre-index questions
  const questionsByBankKey = new Map<string, QuestionRow[]>();
  const questionsByAliasKey = new Map<string, QuestionRow[]>();

  for (const question of args.questions) {
    const sourceAttempt = question.source_pyq_attempt_id
      ? attemptsById.get(question.source_pyq_attempt_id)
      : undefined;
    const bankTopicKey = attemptBankTopicKey(sourceAttempt);
    if (bankTopicKey !== null) {
      let list = questionsByBankKey.get(bankTopicKey);
      if (!list) {
        list = [];
        questionsByBankKey.set(bankTopicKey, list);
      }
      list.push(question);
    } else {
      const canonicalSub = canonicalSubjectLabel(question.subject);
      const topKey = topicLookupKey(question.subtopic);
      const aliasKey = `${canonicalSub}::${topKey}`;
      let list = questionsByAliasKey.get(aliasKey);
      if (!list) {
        list = [];
        questionsByAliasKey.set(aliasKey, list);
      }
      list.push(question);
    }
  }

  // Pre-index reattempts by question_id
  const unmasteredMistakesByQuestionId = new Map<string, number>();
  for (const row of args.reattempts) {
    if (row.stage !== 'MASTERED') {
      unmasteredMistakesByQuestionId.set(
        row.question_id,
        (unmasteredMistakesByQuestionId.get(row.question_id) ?? 0) + 1
      );
    }
  }

  for (const item of args.topics) {
    const allowedBankTopicKeys = new Set(
      (item.bankTopicKeys ?? []).map((k) => k.trim().toLocaleLowerCase())
    );
    const aliases: TopicEvidenceAlias[] = [
      { subject: item.subject, topic: item.topic },
      ...(item.topicAliases ?? [])
    ];

    // Collect matched events
    const matchedEvents: typeof normalizedLedger.events = [];
    if (allowedBankTopicKeys.size > 0) {
      for (const bankKey of allowedBankTopicKeys) {
        const list = eventsByBankKey.get(bankKey);
        if (list) matchedEvents.push(...list);
      }
    }
    const seenAliasKeys = new Set<string>();
    for (const alias of aliases) {
      const canonicalSub = canonicalSubjectLabel(alias.subject);
      const topKey = topicLookupKey(alias.topic);
      const aliasKey = `${canonicalSub}::${topKey}`;
      if (!seenAliasKeys.has(aliasKey)) {
        seenAliasKeys.add(aliasKey);
        const list = eventsByAliasKey.get(aliasKey);
        if (list) matchedEvents.push(...list);
      }
    }

    // Collect matched questions
    const matchedQuestions: QuestionRow[] = [];
    if (allowedBankTopicKeys.size > 0) {
      for (const bankKey of allowedBankTopicKeys) {
        const list = questionsByBankKey.get(bankKey);
        if (list) matchedQuestions.push(...list);
      }
    }
    seenAliasKeys.clear();
    for (const alias of aliases) {
      const canonicalSub = canonicalSubjectLabel(alias.subject);
      const topKey = topicLookupKey(alias.topic);
      const aliasKey = `${canonicalSub}::${topKey}`;
      if (!seenAliasKeys.has(aliasKey)) {
        seenAliasKeys.add(aliasKey);
        const list = questionsByAliasKey.get(aliasKey);
        if (list) matchedQuestions.push(...list);
      }
    }

    let judged = 0;
    let correct = 0;
    let lastPracticed: string | null = null;
    for (const event of matchedEvents) {
      if (event.outcome === 'correct' || event.outcome === 'wrong') judged += 1;
      if (event.outcome === 'correct') correct += 1;
      if (!lastPracticed || event.occurredAt > lastPracticed) {
        lastPracticed = event.occurredAt;
      }
    }
    const accuracy = judged > 0 ? correct / judged : null;

    let openMistakes = 0;
    const seenQuestionIds = new Set<string>();
    for (const q of matchedQuestions) {
      if (!seenQuestionIds.has(q.id)) {
        seenQuestionIds.add(q.id);
        openMistakes += unmasteredMistakesByQuestionId.get(q.id) ?? 0;
      }
    }

    const practiced = matchedEvents.length;
    let status: TopicEvidenceStatus;
    if (practiced === 0) status = item.studiedAt ? 'studied' : 'not-started';
    else if (
      openMistakes > 0 ||
      (judged >= 3 && accuracy !== null && accuracy < 0.6) ||
      (lastPracticed !== null && getDaysSince(lastPracticed) > 45)
    ) {
      status = 'needs-revision';
    } else if (
      judged >= 5 &&
      accuracy !== null &&
      accuracy >= 0.75 &&
      lastPracticed !== null &&
      getDaysSince(lastPracticed) <= 30
    ) {
      status = 'strong';
    } else {
      status = 'active';
    }
    if (status === 'strong' && item.allowStrong === false) status = 'active';

    result.set(item.id, {
      status,
      practiced,
      judged,
      correct,
      accuracy,
      openMistakes,
      lastPracticed
    });
  }

  return result;
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
  const map = buildBatchTopicEvidence({
    topics: [
      {
        id: 'single',
        subject: args.subject,
        topic: args.topic,
        studiedAt: args.studiedAt,
        topicAliases: args.topicAliases,
        bankTopicKeys: args.bankTopicKeys,
        allowStrong: args.allowStrong
      }
    ],
    questions: args.questions,
    attempts: args.attempts,
    reattempts: args.reattempts,
    today: args.today
  });
  return map.get('single')!;
}
