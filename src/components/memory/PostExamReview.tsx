import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useStudyMemoryDraft } from '@/hooks/useStudyMemoryDraft';
import { buildExamReviewQueue, memoryEntryId, memoryString, memoryStrings, newMemoryEntry } from '@/lib/study-memory';
import type { PyqAttemptRow, PyqSessionRow } from '@/types';
import { Button } from '@/components/ui/Button';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import ThinkingReviewEditor from '@/components/memory/ThinkingReviewEditor';

export default function PostExamReview({ session, attempts, answersAlreadyVisible = false }: { session: PyqSessionRow; attempts: PyqAttemptRow[]; answersAlreadyVisible?: boolean }) {
  const { userId } = useAuth();
  const [params] = useSearchParams();
  const queue = useMemo(() => buildExamReviewQueue(attempts), [attempts]);
  const initial = useMemo(() => newMemoryEntry('exam_review', memoryEntryId('exam_review', session.id), 'Exam post-mortem', {
    user_id: userId ?? '', session_id: session.id, state: 'open',
    data: { reviewed_attempt_ids: [], current_attempt_id: queue[0]?.attempt.id ?? null }
  }), [session.id, userId, queue]);
  const draft = useStudyMemoryDraft(initial);
  const { ready, update } = draft;
  const reviewData = draft.entry.data;
  const [localSelected, setLocalSelected] = useState<string | null>(params.get('attempt'));
  const revealedIds = useMemo(() => memoryStrings(reviewData, 'revealed_attempt_ids'), [reviewData]);
  const revealed = new Set(revealedIds);
  const reviewed = memoryStrings(draft.entry.data, 'reviewed_attempt_ids');
  const selectedId = localSelected || memoryString(draft.entry.data, 'current_attempt_id');
  const selected = queue.find((item) => item.attempt.id === selectedId) ?? queue[0];

  useEffect(() => {
    if (!ready || !answersAlreadyVisible) return;
    const ids = queue.map((item) => item.attempt.id);
    if (ids.every((id) => revealedIds.includes(id))) return;
    update({ data: { ...reviewData, revealed_attempt_ids: [...new Set([...revealedIds, ...ids])], answer_report_seen_at: new Date().toISOString() } });
  }, [answersAlreadyVisible, ready, reviewData, update, queue, revealedIds]);

  function select(id: string) {
    setLocalSelected(id);
    draft.update({ data: { ...draft.entry.data, current_attempt_id: id } });
  }
  function complete(id: string) {
    const nextReviewed = [...new Set([...reviewed, id])];
    const next = queue.find((item) => !nextReviewed.includes(item.attempt.id));
    draft.update({ state: next ? 'open' : 'completed', data: { ...draft.entry.data, reviewed_attempt_ids: nextReviewed, current_attempt_id: next?.attempt.id ?? id } });
    if (next) setLocalSelected(next.attempt.id);
  }

  return <section className="rounded-lg border border-border bg-bg-raised" aria-label="Guided exam review">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
      <div><h2 className="font-display text-xl font-semibold">Make this exam useful</h2><p className="mt-1 text-sm text-text-muted">Record what happened, investigate the important questions, and plan the next check.</p></div>
      <span role="status" className="text-sm text-text-muted">{reviewed.length}/{queue.length} reviewed · {draft.saving ? 'Saving…' : draft.entry.version ? 'Progress saved' : 'Not started'}</span>
    </div>
    {draft.error && <p role="alert" className="m-4 rounded border border-danger/30 p-3 text-sm text-danger">{draft.error} <Button size="sm" onClick={() => void draft.reload()}>Retry loading review</Button></p>}
    <div className="border-b border-border p-4 sm:p-5">
      <label className="grid gap-2 text-sm font-medium">What do you remember about this exam?
        <textarea disabled={!draft.ready} value={draft.entry.content} onChange={(event) => draft.update({ content: event.target.value })} className="min-h-24 rounded border border-border bg-bg p-3 font-normal" placeholder="Where did time disappear? Which answers felt uncertain? What would you like to investigate?" />
      </label>
      <Link className="mt-2 inline-block text-sm font-medium text-accent underline" to={`/memory/${draft.entry.id}`}>Open this exam’s memory</Link>
    </div>
    <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Exam review questions" className="max-h-[36rem] overflow-y-auto border-b border-border p-3 md:border-b-0 md:border-r">
        {queue.map((item, index) => <button key={item.attempt.id} disabled={!draft.ready} onClick={() => select(item.attempt.id)} className={`mb-1 w-full rounded px-3 py-2 text-left text-sm ${selected?.attempt.id === item.attempt.id ? 'bg-accent-faint text-accent' : 'hover:bg-bg-overlay'}`}>
          <span className="font-medium">Question {item.attempt.question_snapshot?.number || index + 1}</span><span className="ml-2 text-xs">{reviewed.includes(item.attempt.id) ? 'Reviewed' : item.category.replaceAll('-', ' ')}</span>
        </button>)}
      </nav>
      <div className="min-w-0 p-4 sm:p-5">
        {selected ? <div className="space-y-4">
          <p className="text-sm text-text-muted">{selected.reasons.join(' ')}</p>
          {selected.attempt.question_snapshot?.html ? <PyqQuestionContent html={selected.attempt.question_snapshot.html} /> : <p>Question text is unavailable on this older receipt. Open the original source to review it.</p>}
          <p className="text-sm">Your submitted answer: <strong>{selected.attempt.selected_answer == null ? 'Left blank' : String(selected.attempt.selected_answer)}</strong> · {selected.attempt.time_spent_sec}s recorded</p>
          <div>
            <Button size="sm" onClick={() => draft.update({ data: { ...draft.entry.data, revealed_attempt_ids: [...new Set([...revealedIds, selected.attempt.id])], last_answer_revealed_at: new Date().toISOString() } })} disabled={!draft.ready || revealed.has(selected.attempt.id)}>Reveal recorded answer key</Button>
            {revealed.has(selected.attempt.id) && <p className="mt-2 text-sm">Recorded key: <strong>{String(selected.attempt.correct_answer ?? 'Unavailable')}</strong>. This key alone does not establish the solution method.</p>}
          </div>
          <ThinkingReviewEditor key={selected.attempt.id} attempt={selected.attempt} revealState={revealed.has(selected.attempt.id) || answersAlreadyVisible ? 'after' : 'before'} onSaved={(state) => { if (state === 'completed') complete(selected.attempt.id); }} />
        </div> : <p>No submitted question receipts are available for this review.</p>}
      </div>
    </div>
  </section>;
}
