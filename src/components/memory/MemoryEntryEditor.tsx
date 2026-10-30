import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMemoryDraft } from '@/hooks/useStudyMemoryDraft';
import { Button } from '@/components/ui/Button';
import MathText from '@/components/shared/MathText';
import { MEMORY_ACTIVITIES, getMemoryEntry, getMemoryRepairData, memoryString, memoryStrings, newMemoryEntry, saveMemoryEntry, type StudyMemoryEntry } from '@/lib/study-memory';
import { addMemoryRepairToPlanner, completeMemoryRepair, loadMemoryQuestions, memoryRepairHref } from '@/lib/study-memory-practice';
import { db } from '@/lib/db';
import { addDaysISO, todayISOInTimeZone, uuid } from '@/lib/utils';

const field = 'w-full rounded border border-border bg-bg px-3 py-2 text-sm font-normal text-text';
const conceptFields = [['conditions', 'Conditions and limits'], ['prerequisites', 'Prerequisites'], ['examples', 'Examples'], ['counterexamples', 'Counterexamples and contrasts'], ['recall_prompt', 'Closed-book recall question'], ['guidance', 'Evaluation guidance']] as const;

export default function MemoryEntryEditor({ initial, onChanged, onCheckStateChange }: { initial: StudyMemoryEntry; onChanged: () => void; onCheckStateChange?: (checking: boolean) => void }) {
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const draft = useStudyMemoryDraft(initial);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState('');
  const [checking, setChecking] = useState(false);
  const [started, setStarted] = useState(0);
  const [assisted, setAssisted] = useState(false);
  const [evaluation, setEvaluation] = useState('ungraded');
  const [history, setHistory] = useState<StudyMemoryEntry[]>([]);
  const entry = draft.entry;
  const data = entry.data;
  const repair = getMemoryRepairData(entry);
  const timeZone = profile?.timezone || 'Asia/Kolkata';
  const immutable = entry.kind === 'verification' && entry.version > 0;
  const setData = (key: string, value: unknown) => draft.update({ data: { ...data, [key]: value } });

  useEffect(() => {
    onCheckStateChange?.(checking);
    return () => onCheckStateChange?.(false);
  }, [checking, onCheckStateChange]);

  useEffect(() => {
    if (!entry.version) return;
    let active = true;
    void getMemoryEntry(entry.id).then((result) => { if (active) setHistory(result.history ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, [entry.id, entry.version]);

  useEffect(() => {
    const check = data.check_draft;
    if (!check || typeof check !== 'object' || Array.isArray(check)) return;
    const saved = check as Record<string, unknown>;
    if (saved.active === true) {
      setChecking(true);
      setStarted(typeof saved.started_ms === 'number' ? saved.started_ms : Date.now());
      setResponse(typeof saved.response === 'string' ? saved.response : '');
      setAssisted(saved.assisted === true);
      setEvaluation(typeof saved.evaluation === 'string' ? saved.evaluation : 'ungraded');
    }
  }, [data.check_draft]);

  function updateCheck(patch: Record<string, unknown>) {
    const old = data.check_draft && typeof data.check_draft === 'object' && !Array.isArray(data.check_draft) ? data.check_draft as Record<string, unknown> : {};
    setData('check_draft', { ...old, ...patch });
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true); setNotice('');
    try { await draft.flush(); await action(); onChanged(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The action could not finish.'); }
    finally { setBusy(false); }
  }

  async function selectQuestions() {
    const questions = await loadMemoryQuestions(entry, userId!);
    if (!questions.length) { setNotice('No eligible questions were found. Choose a bank subject and topic, or allow familiar questions for retry practice. Sealed papers stay protected.'); return; }
    await draft.save({ ...entry, data: { ...data, question_uids: questions.map((question) => question.id) } });
    setNotice(`${questions.length} eligible questions selected. Topic matching is recorded; a shared cognitive trap has not been independently verified.`);
  }

  async function createRepair() {
    const next = newMemoryEntry('repair', uuid(), `Repair: ${entry.topic || entry.title}`, {
      user_id: userId || '', subject: entry.subject, topic: entry.topic, state: 'open', content: entry.content,
      data: { target: memoryString(data, 'mechanism') || entry.title, reason: `Follow-up to ${entry.title}`, activity: 'concept-repair',
        success_criteria: memoryString(data, 'corrected_rule') || 'Apply the corrected principle independently.', duration_min: 20,
        due_date: todayISOInTimeZone(timeZone), requested_count: 3, allow_seen: false, question_uids: [], source_entry_ids: [entry.id], source_attempt_ids: entry.attempt_id ? [entry.attempt_id] : [] }
    });
    await saveMemoryEntry(next); navigate(`/memory/${next.id}`);
  }

  async function recordCheck() {
    const check = data.check_draft as Record<string, unknown> | undefined;
    const now = typeof check?.submitted_at === 'string' ? check.submitted_at : new Date().toISOString();
    const checkId = typeof check?.id === 'string' ? check.id : uuid();
    const completedCheck = { ...check, id: checkId, submitted_at: now, response, evaluation, assisted };
    await draft.save({ ...entry, data: { ...data, check_draft: completedCheck } });
    await saveMemoryEntry(newMemoryEntry('verification', checkId, `Recall check: ${entry.title}`, {
      user_id: userId || '', subject: entry.subject, topic: entry.topic, state: 'completed', evidence_kind: 'learner',
      content: response, data: { source_entry_ids: [entry.id], prompt: memoryString(data, 'recall_prompt'), evaluation,
        evaluated_by: 'self', hint_used: assisted, elapsed_wall_sec: Math.max(0, Math.round((Date.parse(now) - started) / 1000)),
        recorded_at: now, independent_transfer: false, mastery_claim: false }
    }));
    await draft.save({ ...entry, data: { ...data, check_draft: { ...completedCheck, active: false }, last_check_at: now, last_check_evaluation: evaluation,
      next_review_on: addDaysISO(todayISOInTimeZone(timeZone), evaluation === 'correct' && !assisted ? 7 : 3) } });
    setChecking(false); setResponse(''); setNotice('Response recorded as your self-assessment. A later recall check is scheduled; concept mastery has not been inferred.');
  }

  return <article className="min-w-0 space-y-5" aria-label="Memory record">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <p className="text-sm text-text-muted">{entry.kind.replace('_', ' ')} · {entry.evidence_kind === 'learner' ? 'Recorded by you' : entry.evidence_kind === 'rule' ? 'Rule-derived observation' : entry.evidence_kind === 'model' ? 'Model interpretation' : 'Recorded event'}</p>
      <span role="status" className="text-xs text-text-muted">{draft.saving ? 'Saving…' : draft.error ? 'Save needs attention' : draft.entry.version ? `Saved · version ${draft.entry.version}` : 'New record'}</span>
    </div>
    {draft.error && <div role="alert" className="rounded border border-danger/30 p-3 text-sm text-danger">{draft.error}<div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void draft.save().catch(() => undefined)} disabled={immutable}>Retry save</Button><Button size="sm" onClick={() => void draft.reload()}>Reload saved version</Button></div></div>}
    <fieldset hidden={checking} disabled={!draft.ready || immutable || busy} className="space-y-4 disabled:opacity-75">
      <label className="grid gap-1.5 text-sm font-medium">Title<input className={field} value={entry.title} onChange={(event) => draft.update({ title: event.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">Subject<input className={field} value={entry.subject || ''} onChange={(event) => draft.update({ subject: event.target.value || null })} placeholder="Use the question-bank subject name for practice" /></label>
        <label className="grid gap-1 text-sm font-medium">Topic<input className={field} value={entry.topic || ''} onChange={(event) => draft.update({ topic: event.target.value || null })} /></label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">{entry.kind === 'concept' ? 'Explanation in your own words' : entry.kind === 'finding' ? 'Observation, interpretation, and evidence' : 'Record'}<textarea className={`${field} min-h-36`} value={entry.content} onChange={(event) => draft.update({ content: event.target.value })} /></label>
      <label className="grid gap-1 text-sm font-medium">Status<select aria-label="Status" className={field} value={entry.state} onChange={(event) => draft.update({ state: event.target.value as StudyMemoryEntry['state'] })}><option value="draft">Draft</option><option value="open">Open / needs follow-up</option><option value="deferred">Deferred</option><option value="completed">Completed activity</option><option value="superseded">Superseded interpretation</option></select></label>
      {entry.kind === 'concept' && <div className="space-y-3">{conceptFields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm font-medium">{label}<textarea className={field} value={memoryString(data, key)} onChange={(event) => setData(key, event.target.value)} /></label>)}<p className="text-xs text-text-muted">Recall, recognition, execution, transfer, retention, and speed require their own evidence. Saving an explanation does not certify these abilities.</p></div>}
      {entry.kind === 'finding' && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Evidence status<select className={field} value={memoryString(data, 'evidence_status') || 'suspected'} onChange={(event) => setData('evidence_status', event.target.value)}><option value="suspected">Suspected</option><option value="investigating">Investigating</option><option value="supported">Supported by linked evidence</option><option value="contradicted">Contradicted</option><option value="superseded">Superseded</option></select></label><label className="grid gap-1 text-sm font-medium">Next question to resolve<input className={field} value={memoryString(data, 'next_check')} onChange={(event) => setData('next_check', event.target.value)} /></label></div>}
      {entry.kind === 'repair' && <div className="space-y-3">
        <label className="grid gap-1 text-sm font-medium">Target skill<input className={field} value={repair.target} onChange={(event) => setData('target', event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium">Activity<select aria-label="Activity" className={field} value={repair.activity} onChange={(event) => setData('activity', event.target.value)}>{MEMORY_ACTIVITIES.map((activity) => <option value={activity.id} key={activity.id}>{activity.label}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-medium">Due date<input type="date" className={field} value={repair.due_date || ''} onChange={(event) => setData('due_date', event.target.value)} /></label><label className="grid gap-1 text-sm font-medium">Minutes<input type="number" min={5} max={120} className={field} value={repair.duration_min} onChange={(event) => setData('duration_min', Number(event.target.value))} /></label><label className="grid gap-1 text-sm font-medium">Questions<input type="number" min={1} max={50} className={field} value={repair.requested_count} onChange={(event) => setData('requested_count', Number(event.target.value))} /></label></div>
        <label className="grid gap-1 text-sm font-medium">Why this work?<textarea className={field} value={repair.reason} onChange={(event) => setData('reason', event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium">Success criterion<textarea className={field} value={repair.success_criteria} onChange={(event) => setData('success_criteria', event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={repair.allow_seen} disabled={repair.activity === 'transfer'} onChange={(event) => setData('allow_seen', event.target.checked)} />Allow familiar questions for practice; fresh transfer always excludes them</label>
        <p className="text-sm text-text-muted">{repair.question_uids.length ? `${repair.question_uids.length} selected bank questions` : 'Select eligible questions before starting question practice.'}</p>
      </div>}
    </fieldset>
    <div className={checking ? "hidden" : "flex flex-wrap gap-2"}>
      {!immutable && <Button disabled={!draft.ready || busy} onClick={() => void perform(async () => { await draft.save(); setNotice('Record saved.'); })}>Save record</Button>}
      {entry.kind !== 'repair' && entry.kind !== 'verification' && <Button disabled={!entry.version || busy} onClick={() => void perform(createRepair)}>Create focused repair</Button>}
      {entry.kind === 'repair' && <><Button disabled={!entry.version || busy} onClick={() => void perform(selectQuestions)}>Select eligible questions</Button>{repair.question_uids.length > 0 && <Link className="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast" to={memoryRepairHref(entry)}>Start selected practice</Link>}<Button disabled={!entry.version || busy} onClick={() => void perform(async () => { await addMemoryRepairToPlanner(entry, userId!, timeZone); setNotice('Saved to Planner. Check the day’s capacity before adding more work.'); })}>Add to Planner</Button>{typeof data.active_session_id === 'string' && <Button disabled={busy || entry.state === 'completed'} onClick={() => void perform(async () => { const attempts = await db.pyq_attempts.where('pyq_session_id').equals(data.active_session_id).toArray(); await completeMemoryRepair(entry, attempts, String(data.active_session_id), timeZone); await draft.reload(); setNotice('Practice results linked and a follow-up candidate prepared.'); })}>Record linked practice result</Button>}</>}
      {entry.kind === 'concept' && <Button disabled={!entry.version || !memoryString(data, 'recall_prompt') || busy} onClick={() => { const startedMs = Date.now(); setChecking(true); setStarted(startedMs); setAssisted(false); setResponse(''); setEvaluation('ungraded'); setData('check_draft', { active: true, id: uuid(), started_ms: startedMs, response: '', assisted: false, evaluation: 'ungraded' }); }}>Start closed-book check</Button>}
    </div>
    {checking && <section className="space-y-3 border-t border-border pt-4" aria-label="Independent concept check"><h3 className="font-display text-lg"><MathText>{memoryString(data, 'recall_prompt')}</MathText></h3><textarea className={`${field} min-h-28`} aria-label="Your recall response" value={response} onChange={(event) => { setResponse(event.target.value); updateCheck({ response: event.target.value }); }} /><Button size="sm" onClick={() => { setAssisted(true); updateCheck({ assisted: true }); }} disabled={assisted}>Show evaluation guidance</Button>{assisted && <MathText display className="whitespace-pre-wrap rounded bg-bg-overlay p-3 text-sm">{memoryString(data, 'guidance') || entry.content}</MathText>}<label className="grid gap-1 text-sm">Your assessment<select aria-label="Your assessment" className={field} value={evaluation} onChange={(event) => { setEvaluation(event.target.value); updateCheck({ evaluation: event.target.value }); }}><option value="ungraded">Not graded</option><option value="correct">Correct</option><option value="partial">Partly correct</option><option value="incorrect">Incorrect</option></select></label><p className="text-xs text-text-muted">Your draft is saved as you work. Time records elapsed wall time, including any interruption.</p><Button disabled={!response.trim() || busy} onClick={() => void perform(recordCheck)}>Record response and next review</Button></section>}
    {notice && <p role="status" className="rounded border border-border bg-bg p-3 text-sm">{notice}</p>}
    {typeof data.next_review_on === 'string' && <p className="text-sm text-text-muted">Next recall check: {data.next_review_on}. It will be available to the daily planner when due.</p>}
    {typeof data.next_review_entry_id === 'string' && <Link className="inline-block text-sm font-medium text-accent underline" to={`/memory/${data.next_review_entry_id}`}>Open the next verification activity</Link>}
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
      {entry.session_id && <Link className="text-accent underline" to={`/session/${entry.session_id}/review${entry.attempt_id ? `?attempt=${entry.attempt_id}` : ''}`}>Open original session{entry.attempt_id ? ' and attempt' : ''}</Link>}
      {entry.concept_id && <Link className="text-accent underline" to={`/learning-library/${entry.concept_id}`}>Open source concept</Link>}
      {entry.repair_id && <Link className="text-accent underline" to={`/memory/${entry.repair_id}`}>Open related repair</Link>}
      {typeof data.active_session_id === 'string' && <Link className="text-accent underline" to={`/session/${data.active_session_id}/review`}>Open linked practice</Link>}
      {memoryStrings(data, 'source_entry_ids').map((id, index) => <Link key={id} className="text-accent underline" to={`/memory/${id}`}>Source memory {index + 1}</Link>)}
    </div>
    {!checking && Object.keys(data).length > 0 && <details><summary className="cursor-pointer text-sm">Recorded details and evidence</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-3 text-xs">{JSON.stringify(data, null, 2)}</pre></details>}
    {!checking && history.length > 0 && <details><summary className="cursor-pointer text-sm">Revision history ({history.length})</summary><div className="mt-2 space-y-3">{history.map((version, index) => <div className="border-l-2 border-border pl-3 text-sm" key={version.version || index}><p className="font-medium">Version {version.version || index + 1}</p><MathText display className="whitespace-pre-wrap text-text-muted">{version.content}</MathText></div>)}</div></details>}
  </article>;
}
