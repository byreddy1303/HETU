import { describe, expect, it } from 'vitest';
import {
  buildStudySessionSynthesis,
  createSessionRepairDraft
} from '@/lib/study-session-synthesis';
import { scoreGateOutcome } from '@/lib/gate-scoring';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import type { StudyMemoryEntry } from '@/lib/study-memory';

function session(questionUids = ['q1', 'q2']): PyqSessionRow {
  return {
    id: 'session-1',
    user_id: 'owner',
    bank_version: 'test',
    config: {
      mode: 'practice',
      subjectSlug: 'algorithms',
      fromYear: 2020,
      toYear: 2026,
      type: 'all',
      order: 'unseen',
      count: '15'
    },
    question_uids: questionUids,
    completed_question_uids: [],
    current_index: 0,
    completed_count: 0,
    elapsed_sec: 1571,
    status: 'completed',
    current_question_uid: null,
    current_question_started_at: null,
    started_at: '2026-10-16T09:00:00.000Z',
    updated_at: '2026-10-17T09:00:00.000Z',
    completed_at: '2026-10-17T09:00:00.000Z'
  };
}

function attempt(questionUid: string, overrides: Partial<PyqAttemptRow> = {}): PyqAttemptRow {
  const row: PyqAttemptRow = {
    id: `attempt-${questionUid}`,
    user_id: 'owner',
    pyq_session_id: 'session-1',
    question_uid: questionUid,
    subject: 'Algorithms',
    year: 2026,
    attempt_number: 1,
    selected_answer: 'A',
    correct_answer: 'B',
    capture_version: 3,
    question_snapshot: {
      question_uid: questionUid,
      year: 2026,
      set: 1,
      number: questionUid,
      paper_label: 'GATE CSE 2026',
      subject: 'Algorithms',
      subject_slug: 'algorithms',
      topic: 'Shortest paths',
      topic_slug: 'shortest-path',
      subtopics: [],
      marks: 1,
      type: 'MCQ',
      tolerance: null,
      answer_status: 'available',
      answer_source: null,
      html: '<p>Question</p>',
      source_url: 'https://example.com/question'
    },
    answer_status: 'available',
    screenshot_url: null,
    mark_decision: 'MARK',
    mark_correct: false,
    confidence: 'high',
    question_started_at: '2026-10-17T09:00:00.000Z',
    time_spent_ms: 72000,
    time_spent_sec: 72,
    bank_version: 'test',
    attempted_at: '2026-10-17T09:01:12.000Z',
    question_type: 'MCQ',
    question_marks: 1,
    score_thirds: -1,
    scoring_status: 'scored',
    scoring_version: 1,
    ...overrides
  };
  const score = scoreGateOutcome({
    questionType: row.question_type,
    marks: row.question_marks,
    answerStatus: row.answer_status,
    decision: row.mark_decision,
    correctness: row.mark_correct
  });
  if (!('score_thirds' in overrides)) row.score_thirds = score.scoreThirds;
  if (!('scoring_status' in overrides)) row.scoring_status = score.status;
  return row;
}

function reflection(overrides: Partial<StudyMemoryEntry> = {}): StudyMemoryEntry {
  return {
    id: 'reflection-1',
    user_id: 'owner',
    kind: 'reflection',
    title: 'Thinking',
    subject: 'Algorithms',
    topic: 'Shortest paths',
    session_id: 'session-1',
    attempt_id: 'attempt-q1',
    question_uid: 'q1',
    concept_id: null,
    pattern_slug: null,
    repair_id: null,
    content: 'My response',
    data: { failure_stage: 'method', mechanism: 'I chose the wrong condition.' },
    state: 'completed',
    evidence_kind: 'learner',
    version: 1,
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

describe('study-session evidence synthesis', () => {
  it('keeps a completed 15-question set with six receipts separate from nine unsubmitted questions and a timed draft', () => {
    const source = session(Array.from({ length: 15 }, (_, index) => `q${index + 1}`));
    source.config.practiceDraft = {
      question_uid: 'q7',
      selected_answer: 'A',
      mark_decision: 'MARK',
      confidence: 'low',
      elapsed_ms: 1138000,
      first_started_at: '2026-10-16T09:00:00.000Z'
    };
    const receipts = Array.from({ length: 6 }, (_, index) =>
      attempt(`q${index + 1}`, {
        mark_correct: index < 2,
        confidence: index === 1 ? 'low' : 'high'
      })
    );
    const original = structuredClone({ source, receipts });
    const result = buildStudySessionSynthesis(source, receipts);
    expect(result).toMatchObject({
      plannedCount: 15,
      submittedCount: 6,
      notSubmittedCount: 9,
      submissionCoveragePercent: 40,
      correctCount: 2,
      wrongCount: 4,
      skippedCount: 0,
      sessionElapsedSeconds: 1571,
      draftQuestionUids: ['q7']
    });
    expect(result.notSubmittedQuestionUids).toEqual(source.question_uids.slice(6));
    expect(result.timing).toMatchObject({
      measuredSeconds: 432,
      draftSeconds: 1138,
      unknownCount: 0
    });
    expect(result.timing.largestConcentrations[0]).toMatchObject({
      questionUid: 'q7',
      attemptId: null,
      source: 'draft',
      seconds: 1138
    });
    expect(result.score).toMatchObject({
      scoreThirds: 2,
      maxThirds: 18,
      coveredCount: 6,
      submittedCount: 6,
      coveragePercent: 100
    });
    expect(result.actions.map((action) => action.id)).toEqual([
      'investigate-recorded-errors',
      'complete-unsubmitted-questions',
      'check-uncertain-correct-answers'
    ]);
    expect(result.actions[1].reason).toContain('no submitted receipt');
    expect(result.actions[1].exposureNote).toContain('does not prove');
    expect({ source, receipts }).toEqual(original);
  });

  it('uses the latest per-question outcome, counts each immutable receipt once for time, and filters owner/session/selection', () => {
    const first = attempt('q1');
    const later = attempt('q1', {
      id: 'retry-q1',
      attempt_number: 2,
      mark_correct: true,
      confidence: 'high'
    });
    const result = buildStudySessionSynthesis(session(['q1', 'q1', 'q2']), [
      first,
      first,
      later,
      attempt('q2', { user_id: 'someone-else' }),
      attempt('q2', { pyq_session_id: 'different-session' }),
      attempt('outside-selection')
    ]);
    expect(result).toMatchObject({
      plannedCount: 2,
      submittedCount: 1,
      correctCount: 1,
      wrongCount: 0
    });
    expect(result.sourceAttemptIds).toEqual(['retry-q1']);
    expect(result.timing).toMatchObject({
      measuredSeconds: 144,
      measuredCount: 2,
      unknownCount: 0
    });
    expect(result.score).toMatchObject({ scoreThirds: 3, coveredCount: 1 });
  });

  it('uses exact third-mark scoring, excludes inconsistent/legacy metadata, and preserves negative percentages', () => {
    const result = buildStudySessionSynthesis(session(['q1', 'q2', 'q3']), [
      attempt('q1'),
      attempt('q2', { capture_version: 2 }),
      attempt('q3', { score_thirds: 3 })
    ]);
    expect(result.score).toEqual({
      scoreThirds: -1,
      maxThirds: 3,
      coveredCount: 1,
      submittedCount: 3,
      coveragePercent: 33,
      scorePercent: -33,
      penaltyThirds: 1
    });
    expect(result.wrongCount).toBe(3);
  });

  it('does not invent negative marking for MSQ/NAT and does not grade bonus or ambiguous keys as failures', () => {
    const result = buildStudySessionSynthesis(session(['q1', 'q2', 'q3', 'q4', 'q5']), [
      attempt('q1', { question_type: 'MSQ', question_marks: 2 }),
      attempt('q2', { question_type: 'NAT', question_marks: 2 }),
      attempt('q3', {
        question_type: 'MARKS_TO_ALL',
        answer_status: 'marks-to-all',
        mark_correct: null,
        question_marks: 2
      }),
      attempt('q4', { answer_status: 'ambiguous', mark_correct: false }),
      attempt('q5', {
        question_type: 'MSQ',
        answer_status: 'available',
        scoring_status: 'bonus',
        score_thirds: 3,
        mark_correct: null
      })
    ]);
    expect(result).toMatchObject({ wrongCount: 2, bonusCount: 1, unscorableCount: 2 });
    expect(result.score).toMatchObject({
      scoreThirds: 6,
      maxThirds: 18,
      coveredCount: 3,
      penaltyThirds: 0
    });
    expect(result.wrongAttemptIds).toEqual(['attempt-q1', 'attempt-q2']);
  });

  it('counts only submitted explicit skips as skipped', () => {
    const result = buildStudySessionSynthesis(session(['q1', 'q2']), [
      attempt('q1', { mark_decision: 'SKIP', mark_correct: null, selected_answer: null })
    ]);
    expect(result).toMatchObject({ skippedCount: 1, notSubmittedCount: 1, wrongCount: 0 });
    expect(result.score).toMatchObject({ scoreThirds: 0, maxThirds: 3, coveredCount: 1 });
  });

  it('uses known marks thresholds only with known timing, separating reported and unknown sources', () => {
    const result = buildStudySessionSynthesis(session(['q1', 'q2', 'q3', 'q4']), [
      attempt('q1', { mark_correct: true, time_spent_ms: 91000, time_spent_sec: 91 }),
      attempt('q2', {
        mark_correct: true,
        time_spent_ms: 181000,
        time_spent_sec: 181,
        question_marks: 2,
        duration_source: 'reported'
      }),
      attempt('q3', {
        mark_correct: true,
        time_spent_ms: 999000,
        time_spent_sec: 999,
        duration_source: 'unknown'
      }),
      attempt('q4', {
        mark_correct: true,
        capture_version: 1,
        question_started_at: null,
        time_spent_ms: null,
        time_spent_sec: 999
      })
    ]);
    expect(result.slowCorrectAttemptIds).toEqual(['attempt-q1', 'attempt-q2']);
    expect(result.timing).toMatchObject({
      measuredSeconds: 91,
      reportedSeconds: 181,
      unknownCount: 2,
      recordedSeconds: 272
    });
    expect(result.actions[0]).toMatchObject({
      id: 'investigate-recorded-pace',
      activity: 'speed',
      allowSeen: false,
      questionUids: []
    });
    expect(result.actions[0].reason).toContain('Timing does not identify the cause');
  });

  it('does not infer measured timing for ChatGPT imports or unstarted rows', () => {
    const result = buildStudySessionSynthesis(session(), [
      attempt('q1', { capture_origin: 'chatgpt', mark_correct: true }),
      attempt('q2', { question_started_at: 'invalid-date', mark_correct: true })
    ]);
    expect(result.timing).toMatchObject({ measuredCount: 0, reportedCount: 0, unknownCount: 2 });
    expect(result.slowCorrectCount).toBe(0);
  });

  it('rejects nonfinite and negative duration fields instead of turning them into fast solutions', () => {
    const rows = [NaN, Infinity, -1000].map((time, index) =>
      attempt(`q${index + 1}`, {
        mark_correct: true,
        time_spent_ms: time,
        time_spent_sec: 999,
        duration_source: 'measured'
      })
    );
    const source = session(['q1', 'q2', 'q3', 'q4']);
    source.elapsed_sec = Infinity;
    source.config.practiceDraft = {
      question_uid: 'q4',
      selected_answer: null,
      mark_decision: null,
      elapsed_ms: NaN,
      first_started_at: '2026-10-17T09:00:00.000Z'
    };
    const result = buildStudySessionSynthesis(source, rows);
    expect(result.sessionElapsedSeconds).toBeNull();
    expect(result.timing).toMatchObject({
      recordedSeconds: 0,
      unknownCount: 3,
      draftSeconds: 0,
      draftTimedCount: 0
    });
    expect(result.slowCorrectCount).toBe(0);
    expect(result.timing.largestConcentrations).toEqual([]);
  });

  it('groups evidence by actual submitted topic and retains source IDs', () => {
    const second = attempt('q2', { mark_correct: true, confidence: 'medium' });
    second.question_snapshot = { ...second.question_snapshot!, topic: 'Sorting' };
    const result = buildStudySessionSynthesis(session(), [attempt('q1'), second]);
    expect(result.topics).toHaveLength(2);
    expect(result.topics[0]).toMatchObject({
      topic: 'Shortest paths',
      wrongCount: 1,
      highConfidenceWrongCount: 1,
      sourceAttemptIds: ['attempt-q1'],
      scoreThirds: -1
    });
    expect(result.topics[1]).toMatchObject({
      topic: 'Sorting',
      correctCount: 1,
      uncertainCorrectCount: 1,
      sourceAttemptIds: ['attempt-q2'],
      scoreThirds: 3
    });
  });

  it('keeps learner mechanisms distinct, scoped, attributed, and revision-deduplicated', () => {
    const result = buildStudySessionSynthesis(
      session(),
      [attempt('q1')],
      [
        reflection(),
        reflection({ version: 2, state: 'draft', data: { mechanism: 'My revised hypothesis.' } }),
        reflection({ id: 'other-owner', user_id: 'someone-else' }),
        reflection({ id: 'other-session', session_id: 'different-session' }),
        reflection({ id: 'other-question', question_uid: 'q2' }),
        reflection({ id: 'not-linked', attempt_id: 'not-in-session' })
      ]
    );
    expect(result.mechanisms).toEqual([
      {
        entryId: 'reflection-1',
        attemptId: 'attempt-q1',
        questionUid: 'q1',
        stage: 'uncertain',
        mechanism: 'My revised hypothesis.',
        state: 'draft'
      }
    ]);
    expect(result.actions[0].reason).toContain('causes are not established');
    expect(result.actions[0].sourceEntryIds).toEqual(['reflection-1']);
    expect(result.actions[0].sourceAttemptIds).toEqual(['attempt-q1']);
  });

  it('creates stable reviewable repair drafts with exact origins and validates the owner and calendar date', () => {
    const source = session();
    const synthesis = buildStudySessionSynthesis(source, [attempt('q1')], [reflection()]);
    const first = createSessionRepairDraft(
      source,
      synthesis,
      'investigate-recorded-errors',
      'owner',
      '2026-10-18'
    )!;
    const second = createSessionRepairDraft(
      source,
      synthesis,
      'investigate-recorded-errors',
      'owner',
      '2026-10-19'
    )!;
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      kind: 'repair',
      state: 'draft',
      evidence_kind: 'rule',
      version: 0,
      session_id: 'session-1',
      subject: 'Algorithms',
      topic: 'Shortest paths',
      data: {
        activity: 'retry',
        allow_seen: true,
        question_uids: ['q1'],
        source_attempt_ids: ['attempt-q1'],
        source_entry_ids: ['reflection-1'],
        due_date: '2026-10-18'
      }
    });
    expect(
      createSessionRepairDraft(source, synthesis, 'missing-action', 'owner', '2026-10-18')
    ).toBeNull();
    expect(
      createSessionRepairDraft(
        source,
        synthesis,
        first.data.synthesis_action_id as string,
        'different-owner',
        '2026-10-18'
      )
    ).toBeNull();
    expect(
      createSessionRepairDraft(
        source,
        synthesis,
        'investigate-recorded-errors',
        'owner',
        '2026-02-30'
      )
    ).toBeNull();
    expect(
      createSessionRepairDraft(
        source,
        { ...synthesis, sessionId: 'another' },
        'investigate-recorded-errors',
        'owner',
        '2026-10-18'
      )
    ).toBeNull();
  });

  it('does not invent failed mastery, speed concerns, or work for an empty evidence set', () => {
    const result = buildStudySessionSynthesis(session([]), []);
    expect(result).toMatchObject({
      plannedCount: 0,
      submittedCount: 0,
      notSubmittedCount: 0,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
      submissionCoveragePercent: null
    });
    expect(result.score.scorePercent).toBeNull();
    expect(result.score.coveragePercent).toBeNull();
    expect(result.actions).toEqual([]);
  });
});
