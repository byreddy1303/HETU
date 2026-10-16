import { loadPyqManifest, loadPyqQuestions, type PyqQuestion } from '@/lib/pyq';
import { db } from '@/lib/db';
import { pyqBenchmarkPaperExposure } from '@/lib/pyq-benchmark';
import { exportMemory, getMemoryRepairData, getMemoryEntry, saveMemoryEntry, memoryEntryId, newMemoryEntry, type StudyMemoryEntry } from '@/lib/study-memory';
import type { PyqAttemptRow } from '@/types';
import { addDaysISO, todayISOInTimeZone } from '@/lib/utils';
import { emptyDayPlan, loadDayPlan, saveDayPlan } from '@/lib/planner-storage';
import { loadCloudDayPlan, queuePlannerCloudWrite } from '@/lib/planner-cloud';

export function selectMemoryQuestions(entry: StudyMemoryEntry, questions: readonly PyqQuestion[], attempts: readonly PyqAttemptRow[], reserved: ReadonlySet<string>): PyqQuestion[] {
  const repair = getMemoryRepairData(entry);
  const seen = new Set(attempts.map((attempt) => attempt.question_uid));
  const exact = new Set(repair.question_uids);
  const fresh = repair.activity === 'transfer' || !repair.allow_seen;
  return questions.filter((question) => !reserved.has(question.id)
    && (!question.bookSlug || question.bookSlug === 'gate-cse')
    && question.answerStatus === 'available' && ['MCQ', 'MSQ', 'NAT'].includes(question.type)
    && (!entry.subject || question.subject.toLowerCase() === entry.subject.toLowerCase())
    && (!entry.topic || question.topic.toLowerCase() === entry.topic.toLowerCase())
    && (!exact.size || exact.has(question.id))
    && (!fresh || !seen.has(question.id)))
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, repair.requested_count);
}

export async function loadMemoryQuestions(entry: StudyMemoryEntry, userId: string) {
  const manifest = await loadPyqManifest();
  const subjects = manifest.subjects.filter((subject) => !entry.subject || subject.label.toLowerCase() === entry.subject.toLowerCase() || subject.slug === entry.subject);
  if (!subjects.length) throw new Error('Choose a subject matching the question bank before selecting questions.');
  const [questions, attempts] = await Promise.all([loadPyqQuestions(subjects, manifest.bankVersion), db.pyq_attempts.where('user_id').equals(userId).toArray()]);
  const reserved = new Set(manifest.benchmarkPapers.filter((paper) => pyqBenchmarkPaperExposure(paper, attempts).sealed).flatMap((paper) => paper.questionUids));
  return selectMemoryQuestions(entry, questions, attempts, reserved);
}

export function memoryRepairHref(entry: StudyMemoryEntry): string {
  const repair = getMemoryRepairData(entry);
  if (!repair.question_uids.length) return `/memory/${entry.id}`;
  const params = new URLSearchParams({ questionUids: repair.question_uids.join(','), memoryRepairId: entry.id, count: 'all', order: 'random', mode: 'practice' });
  return `/pyq?${params}`;
}

export async function addMemoryRepairToPlanner(entry: StudyMemoryEntry, userId: string, timeZone: string): Promise<void> {
  const repair = getMemoryRepairData(entry);
  const date = repair.due_date || todayISOInTimeZone(timeZone);
  const durable = await loadCloudDayPlan(userId, date);
  if (durable.error) throw new Error(durable.error);
  const plan = durable.plan ?? loadDayPlan(date) ?? emptyDayPlan(date);
  const id = `memory-repair:${entry.id}`;
  const next = saveDayPlan({ ...plan, sessions: [...plan.sessions.filter((session) => session.id !== id), {
    id, subject: entry.subject || 'Mixed', durationMin: repair.duration_min, mode: 'Problem Solving', priority: 'P2 High',
    target: repair.target, resource: memoryRepairHref(entry), actionHref: memoryRepairHref(entry)
  }] });
  const error = await queuePlannerCloudWrite(userId, next);
  if (error) throw new Error(error);
}

export async function attachMemoryRepairSession(repairId: string, sessionId: string): Promise<void> {
  const { entry } = await getMemoryEntry(repairId);
  if (entry.kind !== 'repair') throw new Error('The selected memory is not a repair activity.');
  await saveMemoryEntry({ ...entry, data: { ...entry.data, active_session_id: sessionId }, state: 'open' });
}

export async function completeMemoryRepair(entry: StudyMemoryEntry, attempts: readonly PyqAttemptRow[], sessionId: string, timeZone = 'Asia/Kolkata') {
  const linked = attempts.filter((attempt) => attempt.pyq_session_id === sessionId);
  if (!linked.length) throw new Error('No submitted attempts belong to this repair session yet.');
  const scored = linked.filter((attempt) => attempt.mark_correct !== null && attempt.mark_decision !== 'SKIP');
  const correct = scored.filter((attempt) => attempt.mark_correct).length;
  const history = await db.pyq_attempts.where('user_id').equals(entry.user_id).toArray();
  const repeated = linked.filter((attempt) => history.some((prior) => prior.id !== attempt.id && prior.question_uid === attempt.question_uid && prior.attempted_at < attempt.attempted_at)).length;
  const result = newMemoryEntry('verification', memoryEntryId('verification', `${entry.id}:${sessionId}`), `Practice result: ${entry.title}`, {
    user_id: entry.user_id, repair_id: entry.id, session_id: sessionId, subject: entry.subject, topic: entry.topic,
    state: 'completed', evidence_kind: 'observed', content: `${correct}/${scored.length} judged answers correct. Review accuracy and pace separately.`,
    data: { attempt_ids: linked.map((attempt) => attempt.id), correct, judged: scored.length, skipped: linked.filter((attempt) => attempt.mark_decision === 'SKIP').length,
      active_time_sec: linked.reduce((sum, attempt) => sum + attempt.time_spent_sec, 0), recorded_prior_exposure_count: repeated,
      activity: getMemoryRepairData(entry).activity, mastery_claim: false }
  });
  await saveMemoryEntry(result);
  const clean = correct === scored.length && scored.length === linked.length;
  const original = getMemoryRepairData(entry);
  const next = newMemoryEntry('repair', memoryEntryId('repair', `follow-up:${entry.id}:${sessionId}`), `${clean ? 'Delayed check' : 'Investigate remaining errors'}: ${entry.topic || entry.title}`, {
    user_id: entry.user_id, subject: entry.subject, topic: entry.topic, repair_id: entry.id, state: 'open', evidence_kind: 'rule',
    content: clean ? 'The activity was completed accurately. Verify the skill later with fresh questions; assistance and independent mastery remain unverified.' : 'Review the submitted attempts before deciding whether the remaining issue concerns knowledge, method, execution, or timing.',
    data: { activity: clean ? original.activity === 'retry' ? 'transfer' : 'mixed' : 'concept-repair', target: original.target,
      reason: clean ? 'Delayed verification after accurate practice' : 'Unresolved errors or skips in the linked practice',
      success_criteria: clean ? 'Apply the skill accurately on fresh questions without guidance.' : 'Identify the first unsupported step and demonstrate the correction.',
      due_date: addDaysISO(todayISOInTimeZone(timeZone), clean ? 7 : 1), duration_min: clean ? 15 : 20, requested_count: 3,
      question_uids: [], allow_seen: false, source_entry_ids: [entry.id, result.id], source_attempt_ids: linked.map((attempt) => attempt.id) }
  });
  // The follow-up remains a candidate until the learner schedules it. Its
  // identity is stable so retrying a result cannot create duplicate work.
  try { await getMemoryEntry(next.id); }
  catch (cause) {
    if ((cause as { status?: number })?.status !== 404) throw cause;
    await saveMemoryEntry(next);
  }
  return saveMemoryEntry({ ...entry, state: 'completed', data: { ...entry.data, completed_session_id: sessionId, result_entry_id: result.id, next_review_entry_id: next.id } });
}

/** The locked trigger uses distinct learner-confirmed attempts, never model guesses. */
export function recurringReflectionGroup(reflection: StudyMemoryEntry, entries: readonly StudyMemoryEntry[]) {
  const mechanism = String(reflection.data.mechanism || '').trim().toLowerCase();
  if (!mechanism || reflection.data.failure_stage === 'uncertain') return [];
  return [...new Map(entries.filter((entry) => entry.kind === 'reflection' && entry.state === 'completed'
    && entry.subject === reflection.subject && entry.topic === reflection.topic
    && entry.data.failure_stage === reflection.data.failure_stage
    && String(entry.data.mechanism || '').trim().toLowerCase() === mechanism && entry.attempt_id)
    .map((entry) => [entry.attempt_id, entry])).values()];
}

export function patternRepairDraft(reflection: StudyMemoryEntry, occurrences: readonly StudyMemoryEntry[], timeZone: string) {
  const identity = [reflection.user_id, reflection.subject, reflection.topic, reflection.data.failure_stage, String(reflection.data.mechanism).trim().toLowerCase()].join(':');
  return newMemoryEntry('repair', memoryEntryId('repair', `recurring:${identity}:${Math.floor(occurrences.length / 3)}`), `Pattern Sprint: ${reflection.topic || reflection.subject}`, {
    user_id: reflection.user_id, subject: reflection.subject, topic: reflection.topic, state: 'open', evidence_kind: 'rule',
    content: 'Three distinct reviewed attempts share your stated mechanism. Practise the relevant skill and verify it on fresh questions.',
    data: { activity: 'recognition', target: reflection.data.mechanism, reason: 'Recurring learner-assessed difficulty',
      success_criteria: 'Explain the corrected condition and apply it independently on the selected questions.', duration_min: 20,
      due_date: addDaysISO(todayISOInTimeZone(timeZone), 1), question_uids: [], requested_count: 3, allow_seen: false,
      pattern_identity: identity, source_attempt_ids: occurrences.map((entry) => entry.attempt_id), source_entry_ids: occurrences.map((entry) => entry.id) }
  });
}

export async function ensureRecurringPatternRepair(reflection: StudyMemoryEntry, timeZone: string): Promise<boolean> {
  const reflections = await exportMemory({ kind: 'reflection', subject: reflection.subject || undefined });
  const occurrences = recurringReflectionGroup(reflection, reflections);
  if (occurrences.length < 3) return false;
  const proposed = patternRepairDraft(reflection, occurrences, timeZone);
  const existing = await exportMemory({ kind: 'repair', subject: reflection.subject || undefined });
  const matching = existing.find((entry) => entry.id === proposed.id || (entry.data.pattern_identity === proposed.data.pattern_identity && ['open', 'deferred'].includes(entry.state)));
  if (matching) {
    // A previous save may have succeeded before its Planner write failed.
    // Retrying the review must finish that write without creating another repair.
    if (['open', 'deferred'].includes(matching.state)) await addMemoryRepairToPlanner(matching, reflection.user_id, timeZone);
    return false;
  }
  const selected = await loadMemoryQuestions(proposed, reflection.user_id);
  const saved = await saveMemoryEntry({ ...proposed, data: { ...proposed.data, question_uids: selected.map((question) => question.id),
    selection_status: selected.length ? 'topic-matched' : 'insufficient-eligible-questions' } });
  await addMemoryRepairToPlanner(saved, reflection.user_id, timeZone);
  return true;
}
