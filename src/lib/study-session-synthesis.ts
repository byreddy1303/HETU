import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import { buildPyqSessionSummary } from '@/lib/pyq-summary';
import { targetTimeSecForMarks } from '@/lib/constants';
import { getPyqPracticeDraft } from '@/lib/pyq-session';
import { uuidFromString } from '@/lib/utils';
import type { MemoryActivity, StudyMemoryEntry } from '@/lib/study-memory';

export interface SessionTimeConcentration {
  questionUid: string;
  attemptId: string | null;
  seconds: number;
  source: 'measured' | 'reported' | 'draft';
  sharePercent: number;
}

export interface SessionTopicEvidence {
  subject: string;
  topic: string;
  submittedCount: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  bonusCount: number;
  unscorableCount: number;
  highConfidenceWrongCount: number;
  uncertainCorrectCount: number;
  slowCorrectCount: number;
  questionUids: string[];
  sourceAttemptIds: string[];
  measuredSeconds: number;
  reportedSeconds: number;
  unknownTimeCount: number;
  scoreThirds: number;
  maxThirds: number;
  scoringCoveredCount: number;
}

export interface SessionRepairAction {
  id: string;
  title: string;
  activity: MemoryActivity;
  target: string;
  reason: string;
  successCriteria: string;
  questionUids: string[];
  sourceAttemptIds: string[];
  sourceEntryIds: string[];
  allowSeen: boolean;
  durationMin: number;
  exposureNote: string;
  subject: string | null;
  topic: string | null;
}

export interface StudySessionSynthesis {
  sessionId: string;
  plannedCount: number;
  submittedCount: number;
  notSubmittedCount: number;
  submissionCoveragePercent: number | null;
  plannedQuestionUids: string[];
  submittedQuestionUids: string[];
  notSubmittedQuestionUids: string[];
  draftQuestionUids: string[];
  sourceAttemptIds: string[];
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  bonusCount: number;
  unscorableCount: number;
  highConfidenceWrongCount: number;
  uncertainCorrectCount: number;
  slowCorrectCount: number;
  wrongAttemptIds: string[];
  highConfidenceWrongAttemptIds: string[];
  uncertainCorrectAttemptIds: string[];
  slowCorrectAttemptIds: string[];
  /** Persisted active-work ledger, never the difference between wall-clock dates. */
  sessionElapsedSeconds: number | null;
  score: {
    scoreThirds: number;
    maxThirds: number;
    coveredCount: number;
    submittedCount: number;
    coveragePercent: number | null;
    /** Denominator is only the maximum marks of exact, covered receipts. */
    scorePercent: number | null;
    penaltyThirds: number;
  };
  timing: {
    measuredSeconds: number;
    reportedSeconds: number;
    measuredCount: number;
    reportedCount: number;
    unknownCount: number;
    /** Measured + reported submitted time; excludes ungraded checkpoints. */
    recordedSeconds: number;
    draftSeconds: number;
    draftTimedCount: number;
    largestConcentrations: SessionTimeConcentration[];
  };
  topics: SessionTopicEvidence[];
  /** Learner statements remain attributed and separate from rule observations. */
  mechanisms: Array<{
    entryId: string;
    attemptId: string;
    questionUid: string;
    stage: string;
    mechanism: string;
    state: StudyMemoryEntry['state'];
  }>;
  actions: SessionRepairAction[];
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function recordedTime(
  attempt: PyqAttemptRow
): { seconds: number; source: 'measured' | 'reported' } | null {
  if (attempt.time_spent_ms != null && !nonnegative(attempt.time_spent_ms)) return null;
  const seconds = nonnegative(attempt.time_spent_ms)
    ? attempt.time_spent_ms / 1000
    : nonnegative(attempt.time_spent_sec)
      ? attempt.time_spent_sec
      : null;
  if (seconds === null || attempt.duration_source === 'unknown') return null;
  if (attempt.duration_source === 'reported') return { seconds, source: 'reported' };
  if (attempt.duration_source === 'measured') return { seconds, source: 'measured' };
  // The native v2/v3 receipt constructor predates duration_source. Its frozen
  // millisecond ledger and valid start distinguish it from legacy/imported time.
  if (
    attempt.capture_origin !== 'chatgpt' &&
    attempt.capture_version >= 2 &&
    nonnegative(attempt.time_spent_ms) &&
    attempt.question_started_at &&
    Number.isFinite(Date.parse(attempt.question_started_at))
  ) {
    return { seconds, source: 'measured' };
  }
  return null;
}

function uniqueScopedReceipts(
  session: PyqSessionRow,
  attempts: readonly PyqAttemptRow[]
): PyqAttemptRow[] {
  const selected = new Set(session.question_uids);
  const byId = new Map<string, PyqAttemptRow>();
  for (const attempt of attempts) {
    if (
      attempt.user_id !== session.user_id ||
      attempt.pyq_session_id !== session.id ||
      !selected.has(attempt.question_uid)
    )
      continue;
    const current = byId.get(attempt.id);
    if (!current || attempt.attempted_at > current.attempted_at) byId.set(attempt.id, attempt);
  }
  return [...byId.values()].sort(
    (a, b) => a.attempted_at.localeCompare(b.attempted_at) || a.id.localeCompare(b.id)
  );
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Observation-only synthesis. It neither changes source records nor diagnoses a cause. */
export function buildStudySessionSynthesis(
  session: PyqSessionRow,
  attempts: readonly PyqAttemptRow[],
  reflections: readonly StudyMemoryEntry[] = []
): StudySessionSynthesis {
  const plannedQuestionUids = [...new Set(session.question_uids)];
  const receipts = uniqueScopedReceipts(session, attempts);
  const base = buildPyqSessionSummary({ ...session, question_uids: plannedQuestionUids }, receipts);
  const submitted = base.questions.filter((question) => question.attempt !== null);
  const latestById = new Map(submitted.map((question) => [question.attempt!.id, question]));
  const notSubmittedQuestionUids = base.questions
    .filter((question) => !question.attempt)
    .map((question) => question.questionUid);
  const missingDrafts = notSubmittedQuestionUids.flatMap((questionUid) => {
    const draft =
      session.config.mode === 'exam' ? undefined : getPyqPracticeDraft(session, questionUid);
    return draft ? [draft] : [];
  });
  const distinctReflections = new Map<string, StudyMemoryEntry>();
  for (const entry of reflections) {
    if (entry.user_id !== session.user_id) continue;
    const existing = distinctReflections.get(entry.id);
    if (!existing || entry.version > existing.version) distinctReflections.set(entry.id, entry);
  }
  const mechanisms = [...distinctReflections.values()]
    .filter(
      (entry) =>
        entry.kind === 'reflection' &&
        entry.user_id === session.user_id &&
        entry.session_id === session.id &&
        entry.attempt_id &&
        latestById.has(entry.attempt_id) &&
        (!entry.question_uid ||
          entry.question_uid === latestById.get(entry.attempt_id)?.questionUid) &&
        text(entry.data.mechanism)
    )
    .map((entry) => ({
      entryId: entry.id,
      attemptId: entry.attempt_id!,
      questionUid: latestById.get(entry.attempt_id!)!.questionUid,
      stage: text(entry.data.failure_stage) || 'uncertain',
      mechanism: text(entry.data.mechanism),
      state: entry.state
    }));
  const wrongAttemptIds: string[] = [];
  const highConfidenceWrongAttemptIds: string[] = [];
  const uncertainCorrectAttemptIds: string[] = [];
  const slowCorrectAttemptIds: string[] = [];
  const topics = new Map<string, SessionTopicEvidence>();
  const timing: StudySessionSynthesis['timing'] = {
    measuredSeconds: 0,
    reportedSeconds: 0,
    measuredCount: 0,
    reportedCount: 0,
    unknownCount: 0,
    recordedSeconds: 0,
    draftSeconds: 0,
    draftTimedCount: 0,
    largestConcentrations: []
  };
  const score: StudySessionSynthesis['score'] = {
    scoreThirds: 0,
    maxThirds: 0,
    coveredCount: 0,
    submittedCount: submitted.length,
    coveragePercent: null,
    scorePercent: null,
    penaltyThirds: 0
  };
  const counts = {
    correctCount: 0,
    wrongCount: 0,
    skippedCount: 0,
    bonusCount: 0,
    unscorableCount: 0
  };
  for (const question of submitted) {
    const attempt = question.attempt!;
    const subject = attempt.subject || 'Unclassified';
    const topic = text(attempt.question_snapshot?.topic) || 'Unclassified';
    const key = JSON.stringify([subject, topic]);
    const group = topics.get(key) ?? {
      subject,
      topic,
      submittedCount: 0,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      bonusCount: 0,
      unscorableCount: 0,
      highConfidenceWrongCount: 0,
      uncertainCorrectCount: 0,
      slowCorrectCount: 0,
      questionUids: [],
      sourceAttemptIds: [],
      measuredSeconds: 0,
      reportedSeconds: 0,
      unknownTimeCount: 0,
      scoreThirds: 0,
      maxThirds: 0,
      scoringCoveredCount: 0
    };
    topics.set(key, group);
    group.submittedCount += 1;
    group.questionUids.push(question.questionUid);
    group.sourceAttemptIds.push(attempt.id);
    // Ambiguous/unavailable keys and inconsistent bonus metadata never supply
    // evidence of failure, even when an old row contains a false correctness.
    const outcome =
      attempt.mark_decision === 'SKIP'
        ? 'skipped'
        : (question.outcome === 'bonus' && !question.scoringCovered) ||
            (attempt.answer_status !== 'available' &&
              !(question.scoringCovered && question.outcome === 'bonus'))
          ? 'unscorable'
          : question.outcome;
    const countKey =
      outcome === 'correct'
        ? 'correctCount'
        : outcome === 'wrong'
          ? 'wrongCount'
          : outcome === 'bonus'
            ? 'bonusCount'
            : outcome === 'skipped'
              ? 'skippedCount'
              : 'unscorableCount';
    counts[countKey] += 1;
    group[countKey] += 1;
    if (outcome === 'wrong') {
      wrongAttemptIds.push(attempt.id);
      if (attempt.confidence === 'high') {
        highConfidenceWrongAttemptIds.push(attempt.id);
        group.highConfidenceWrongCount += 1;
      }
    }
    const time = recordedTime(attempt);
    if (outcome === 'correct') {
      if (
        attempt.mark_decision === 'FIFTY_FIFTY' ||
        attempt.confidence === 'medium' ||
        attempt.confidence === 'low'
      ) {
        uncertainCorrectAttemptIds.push(attempt.id);
        group.uncertainCorrectCount += 1;
      }
      const marks = attempt.question_marks ?? attempt.question_snapshot?.marks;
      if (
        time &&
        typeof marks === 'number' &&
        Number.isFinite(marks) &&
        marks > 0 &&
        time.seconds > targetTimeSecForMarks(marks)
      ) {
        slowCorrectAttemptIds.push(attempt.id);
        group.slowCorrectCount += 1;
      }
    }
    if (question.scoringCovered && question.scoreThirds !== null && question.maxThirds !== null) {
      score.scoreThirds += question.scoreThirds;
      score.maxThirds += question.maxThirds;
      score.penaltyThirds += Math.abs(Math.min(0, question.scoreThirds));
      score.coveredCount += 1;
      group.scoreThirds += question.scoreThirds;
      group.maxThirds += question.maxThirds;
      group.scoringCoveredCount += 1;
    }
  }
  // Time is a work ledger: retain distinct earlier retries without counting a
  // duplicate receipt twice. Performance above uses only the latest receipt.
  for (const attempt of receipts) {
    const time = recordedTime(attempt);
    const group = topics.get(
      JSON.stringify([
        attempt.subject || 'Unclassified',
        text(attempt.question_snapshot?.topic) || 'Unclassified'
      ])
    );
    if (!time) {
      timing.unknownCount += 1;
      if (group) group.unknownTimeCount += 1;
      continue;
    }
    timing[time.source === 'measured' ? 'measuredSeconds' : 'reportedSeconds'] += time.seconds;
    timing[time.source === 'measured' ? 'measuredCount' : 'reportedCount'] += 1;
    if (group)
      group[time.source === 'measured' ? 'measuredSeconds' : 'reportedSeconds'] += time.seconds;
    const existing = timing.largestConcentrations.find(
      (row) => row.questionUid === attempt.question_uid && row.source === time.source
    );
    if (existing) existing.seconds += time.seconds;
    else
      timing.largestConcentrations.push({
        questionUid: attempt.question_uid,
        attemptId: attempt.id,
        seconds: time.seconds,
        source: time.source,
        sharePercent: 0
      });
  }
  for (const draft of missingDrafts) {
    if (!nonnegative(draft.elapsed_ms)) continue;
    const seconds = draft.elapsed_ms / 1000;
    timing.draftSeconds += seconds;
    timing.draftTimedCount += 1;
    timing.largestConcentrations.push({
      questionUid: draft.question_uid,
      attemptId: null,
      seconds,
      source: 'draft',
      sharePercent: 0
    });
  }
  timing.recordedSeconds = timing.measuredSeconds + timing.reportedSeconds;
  const observedSeconds = timing.recordedSeconds + timing.draftSeconds;
  timing.largestConcentrations = timing.largestConcentrations
    .map((row) => ({
      ...row,
      sharePercent: observedSeconds > 0 ? Math.round((row.seconds / observedSeconds) * 100) : 0
    }))
    .sort((a, b) => b.seconds - a.seconds || a.questionUid.localeCompare(b.questionUid))
    .slice(0, 5);
  score.coveragePercent = submitted.length
    ? Math.round((score.coveredCount / submitted.length) * 100)
    : null;
  score.scorePercent = score.maxThirds
    ? Math.round((score.scoreThirds / score.maxThirds) * 100)
    : null;
  const synthesis: StudySessionSynthesis = {
    sessionId: session.id,
    plannedCount: plannedQuestionUids.length,
    submittedCount: submitted.length,
    notSubmittedCount: notSubmittedQuestionUids.length,
    submissionCoveragePercent: plannedQuestionUids.length
      ? Math.round((submitted.length / plannedQuestionUids.length) * 100)
      : null,
    plannedQuestionUids,
    submittedQuestionUids: submitted.map((question) => question.questionUid),
    notSubmittedQuestionUids,
    draftQuestionUids: missingDrafts.map((draft) => draft.question_uid),
    sourceAttemptIds: submitted.map((question) => question.attempt!.id),
    ...counts,
    highConfidenceWrongCount: highConfidenceWrongAttemptIds.length,
    uncertainCorrectCount: uncertainCorrectAttemptIds.length,
    slowCorrectCount: slowCorrectAttemptIds.length,
    wrongAttemptIds,
    highConfidenceWrongAttemptIds,
    uncertainCorrectAttemptIds,
    slowCorrectAttemptIds,
    sessionElapsedSeconds: nonnegative(session.elapsed_sec) ? session.elapsed_sec : null,
    score,
    timing,
    topics: [...topics.values()],
    mechanisms,
    actions: []
  };
  function action(
    id: string,
    selectedIds: string[],
    details: Omit<
      SessionRepairAction,
      'id' | 'sourceAttemptIds' | 'sourceEntryIds' | 'subject' | 'topic'
    >
  ) {
    const selected = selectedIds.flatMap((attemptId) => {
      const question = latestById.get(attemptId);
      return question?.attempt ? [question.attempt] : [];
    });
    const subjects = new Set(selected.map((attempt) => attempt.subject));
    const topicNames = new Set(
      selected.map((attempt) => text(attempt.question_snapshot?.topic)).filter(Boolean)
    );
    synthesis.actions.push({
      ...details,
      id,
      sourceAttemptIds: selectedIds,
      sourceEntryIds: mechanisms
        .filter((item) => selectedIds.includes(item.attemptId))
        .map((item) => item.entryId),
      subject: subjects.size === 1 ? [...subjects][0] : null,
      topic: topicNames.size === 1 ? [...topicNames][0] : null
    });
  }
  const investigate = submitted.filter(
    (question) => wrongAttemptIds.includes(question.attempt!.id) || question.outcome === 'skipped'
  );
  if (investigate.length)
    action(
      'investigate-recorded-errors',
      investigate.map((question) => question.attempt!.id),
      {
        title: 'Investigate the recorded errors and skips',
        activity: 'retry',
        target: 'Explain the reasoning, then retry the recorded errors and explicit skips',
        reason: `${wrongAttemptIds.length} incorrect answer${wrongAttemptIds.length === 1 ? '' : 's'} and ${counts.skippedCount} explicit skip${counts.skippedCount === 1 ? '' : 's'} were submitted. Their causes are not established.`,
        successCriteria:
          'Write why each original response failed or stopped, solve again without the key, and record any assistance. A later fresh check is still needed.',
        questionUids: investigate.map((question) => question.questionUid),
        allowSeen: true,
        durationMin: 20,
        exposureNote:
          'Original submitted questions; this is familiar-question repair, not fresh transfer.'
      }
    );
  if (notSubmittedQuestionUids.length)
    action('complete-unsubmitted-questions', [], {
      title: 'Complete the questions without submitted results',
      activity: 'retry',
      target: 'Obtain submitted evidence for the remaining selected questions',
      reason: `${notSubmittedQuestionUids.length} selected question${notSubmittedQuestionUids.length === 1 ? ' has' : 's have'} no submitted receipt. Saved drafts are ungraded work.`,
      successCriteria:
        'Submit an answer or explicit skip, record confidence and time, and mark any answer-key or solution exposure before interpreting the result.',
      questionUids: notSubmittedQuestionUids,
      allowSeen: true,
      durationMin: 20,
      exposureNote:
        'No submitted receipt does not prove a question is unseen. Drafts or earlier exposure may exist.'
    });
  if (uncertainCorrectAttemptIds.length)
    action('check-uncertain-correct-answers', uncertainCorrectAttemptIds, {
      title: 'Justify the correct answers recorded with uncertainty',
      activity: 'retry',
      target: 'Explain why the method and answer work without consulting the key',
      reason: `${uncertainCorrectAttemptIds.length} correct answer${uncertainCorrectAttemptIds.length === 1 ? ' was' : 's were'} recorded with low/medium confidence or a fifty-fifty decision.`,
      successCriteria:
        'Give a complete justification and check its conditions. Record hints or solution use; correctness alone does not establish independent understanding.',
      questionUids: submitted
        .filter((question) => uncertainCorrectAttemptIds.includes(question.attempt!.id))
        .map((question) => question.questionUid),
      allowSeen: true,
      durationMin: 15,
      exposureNote:
        'Original correct questions are familiar; use a later fresh question to check transfer.'
    });
  if (synthesis.actions.length < 3 && slowCorrectAttemptIds.length)
    action('investigate-recorded-pace', slowCorrectAttemptIds, {
      title: 'Check the steps behind the longer correct solutions',
      activity: 'speed',
      target: 'Keep solutions accurate while checking method choice and step efficiency',
      reason: `${slowCorrectAttemptIds.length} correct response${slowCorrectAttemptIds.length === 1 ? '' : 's'} exceeded the existing marks-based target (${targetTimeSecForMarks(1)} seconds per one-mark question; ${targetTimeSecForMarks(2)} per two-mark question). Timing does not identify the cause.`,
      successCriteria:
        'Choose eligible fresh questions, record assistance and active time, and compare correct solutions against their own marks-based target. Do not trade accuracy for speed.',
      questionUids: [],
      allowSeen: false,
      durationMin: 20,
      exposureNote:
        'Select fresh eligible questions before launching. These observations do not prove independent speed or mastery.'
    });
  synthesis.actions = synthesis.actions.slice(0, 3);
  return synthesis;
}

/** Produces a reviewable draft only. The caller controls saving and scheduling. */
export function createSessionRepairDraft(
  session: PyqSessionRow,
  synthesis: StudySessionSynthesis,
  actionId: string,
  ownerId: string,
  date: string
): StudyMemoryEntry | null {
  if (
    session.user_id !== ownerId ||
    synthesis.sessionId !== session.id ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
  )
    return null;
  const action = synthesis.actions.find((candidate) => candidate.id === actionId);
  if (!action) return null;
  return {
    id: uuidFromString(
      `study-memory:repair:session-synthesis:${ownerId}:${session.id}:${action.id}`
    ),
    user_id: ownerId,
    kind: 'repair',
    title: action.title,
    subject: action.subject,
    topic: action.topic,
    session_id: session.id,
    attempt_id: null,
    question_uid: null,
    concept_id: null,
    pattern_slug: null,
    repair_id: null,
    content: action.reason,
    data: {
      activity: action.activity,
      target: action.target,
      reason: action.reason,
      success_criteria: action.successCriteria,
      due_date: date,
      duration_min: action.durationMin,
      question_uids: [...action.questionUids],
      requested_count: Math.max(1, action.questionUids.length || 3),
      allow_seen: action.activity === 'retry' && action.allowSeen,
      source_attempt_ids: [...action.sourceAttemptIds],
      source_entry_ids: [...action.sourceEntryIds],
      source_session_id: session.id,
      synthesis_action_id: action.id,
      exposure_note: action.exposureNote,
      synthesis_version: 1
    },
    state: 'draft',
    evidence_kind: 'rule',
    version: 0,
    created_at: '',
    updated_at: ''
  };
}
