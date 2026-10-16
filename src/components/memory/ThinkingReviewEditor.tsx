import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PyqAttemptRow } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMemoryDraft } from '@/hooks/useStudyMemoryDraft';
import { FAILURE_STAGES, memoryEntryId, memoryString, newMemoryEntry } from '@/lib/study-memory';
import { Button } from '@/components/ui/Button';
import { ensureRecurringPatternRepair } from '@/lib/study-memory-practice';

const field = 'w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text';

export default function ThinkingReviewEditor({ attempt, revealState = 'unknown', onSaved }: {
  attempt: PyqAttemptRow;
  revealState?: 'before' | 'after' | 'unknown';
  onSaved?: (state: 'completed' | 'deferred') => void;
}) {
  const { userId, profile } = useAuth();
  const initial = useMemo(() => newMemoryEntry('reflection', memoryEntryId('reflection', attempt.id),
    `Thinking: ${attempt.question_snapshot?.topic || attempt.subject}`, {
      user_id: userId ?? '', attempt_id: attempt.id, session_id: attempt.pyq_session_id,
      question_uid: attempt.question_uid, subject: attempt.subject,
      topic: attempt.question_snapshot?.topic ?? null,
      data: { failure_stage: 'uncertain', reveal_state: revealState, recorded_at: new Date().toISOString() }
    }), [attempt.id, attempt.pyq_session_id, attempt.question_uid, attempt.subject, attempt.question_snapshot?.topic, userId, revealState]);
  const draft = useStudyMemoryDraft(initial);
  const [message, setMessage] = useState('');
  const [finishing, setFinishing] = useState(false);
  const data = draft.entry.data;
  const updateData = (key: string, value: unknown) => draft.update({ data: { ...data, ...(!draft.entry.version ? { reveal_state: revealState } : {}), [key]: value } });

  async function finish(state: 'completed' | 'deferred') {
    setFinishing(true);
    setMessage('');
    try {
      await draft.flush();
      const saved = await draft.save({ ...draft.entry, state });
      if (state === 'completed' && saved.data.failure_stage !== 'uncertain' && saved.data.mechanism) {
        try {
          const scheduled = await ensureRecurringPatternRepair(saved, profile?.timezone || 'Asia/Kolkata');
          if (scheduled) setMessage('Review saved. Three matching reviewed attempts created a 20-minute Pattern Sprint for tomorrow.');
        } catch (cause) {
          setMessage(`Your thinking is saved. Automatic follow-up needs attention: ${cause instanceof Error ? cause.message : 'open Learning Memory to create the repair.'}`);
          return;
        }
      }
      setMessage(state === 'completed' ? 'Review recorded. Your assessment remains linked to this attempt.' : 'Saved for later. Open it from Learning Memory.');
      onSaved?.(state);
    } catch { /* the draft displays the acknowledged failure */ }
    finally { setFinishing(false); }
  }

  return <section className="space-y-4" aria-label="Your thinking record">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-text-muted">Record your reasoning. No API key is needed.</p>
      <span role="status" className="text-xs text-text-muted">{!draft.ready ? 'Loading saved thinking…' : draft.saving ? 'Saving…' : draft.error ? 'Save needs attention' : draft.entry.version ? 'Saved on this workspace' : 'Ready to record'}</span>
    </div>
    {draft.error && <div role="alert" className="rounded border border-danger/30 bg-danger-faint p-3 text-sm text-danger">
      {draft.error}<div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void draft.save().catch(() => undefined)} disabled={!draft.ready || draft.saving}>Retry save</Button><Button size="sm" onClick={() => void draft.reload()}>Reload saved version</Button></div>
    </div>}
    <fieldset disabled={!draft.ready || finishing} className="space-y-4 disabled:opacity-60">
      <label className="grid gap-1.5 text-sm font-medium">What were you thinking?
        <textarea className={`${field} min-h-28`} value={draft.entry.content} onChange={(event) => draft.update({ content: event.target.value, state: 'draft', ...(!draft.entry.version && !draft.entry.content ? { data: { ...data, reveal_state: revealState } } : {}) })} placeholder="The idea you used, what you assumed, or the step where you got stuck." />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Your assessment of the difficult step
          <select className={field} value={memoryString(data, 'failure_stage') || 'uncertain'} onChange={(event) => updateData('failure_stage', event.target.value)}>
            {FAILURE_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">When was this explanation captured?
          <select className={field} value={!draft.entry.version && !draft.entry.content ? revealState : memoryString(data, 'reveal_state') || 'unknown'} onChange={(event) => updateData('reveal_state', event.target.value)}>
            <option value="before">Before seeing the answer</option><option value="after">After seeing the answer</option><option value="unknown">Not recorded / unsure</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Specific mistake or unresolved question
        <input className={field} value={memoryString(data, 'mechanism')} onChange={(event) => updateData('mechanism', event.target.value)} placeholder="For example: confused a necessary condition with a sufficient one." />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Corrected principle and when it applies
        <textarea className={field} value={memoryString(data, 'corrected_rule')} onChange={(event) => updateData('corrected_rule', event.target.value)} placeholder="Leave this open if you have not established the correction yet." />
      </label>
      <details className="rounded border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Record a diagnostic check or blind retry</summary>
        <div className="mt-3 space-y-3">
          <label className="grid gap-1 text-sm">Prompt or retry goal<textarea className={field} value={memoryString(data, 'probe_prompt')} onChange={(event) => updateData('probe_prompt', event.target.value)} /></label>
          <label className="grid gap-1 text-sm">Your response before feedback<textarea className={field} value={memoryString(data, 'probe_answer')} onChange={(event) => updateData('probe_answer', event.target.value)} /></label>
          <label className="grid gap-1 text-sm">Your assessment<select className={field} value={memoryString(data, 'probe_evaluation') || 'ungraded'} onChange={(event) => updateData('probe_evaluation', event.target.value)}><option value="ungraded">Not graded</option><option value="correct">Correct, by my assessment</option><option value="partial">Partly correct, by my assessment</option><option value="incorrect">Incorrect, by my assessment</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.probe_hint_used === true} onChange={(event) => updateData('probe_hint_used', event.target.checked)} />I used a hint or saw guidance</label>
          <p className="text-xs text-text-muted">Your response and self-assessment are saved. Free-text answers are not automatically graded.</p>
        </div>
      </details>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" disabled={!draft.ready || finishing || !draft.entry.content.trim()} onClick={() => void finish('completed')}>Finish this review</Button>
      <Button disabled={!draft.ready || finishing} onClick={() => void finish('deferred')}>Save for later</Button>
      {draft.entry.version > 0 && <Link className="self-center px-2 text-sm font-medium text-accent underline" to={`/memory/${draft.entry.id}`}>Open thinking and plan a repair</Link>}
    </div>
    {message && <p role="status" className="text-sm text-success">{message}</p>}
  </section>;
}
