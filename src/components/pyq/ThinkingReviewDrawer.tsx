import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import type { PyqAttemptRow } from '@/types';
import ThinkingReviewEditor from '@/components/memory/ThinkingReviewEditor';
import { Button } from '@/components/ui/Button';

export interface DebriefContext {
  attemptId: string;
  questionUid: string;
  subject: string;
  topic?: string | null;
  selectedOption?: string | null;
  correctOption: string;
  timeSpentSeconds: number;
}

export default function ThinkingReviewDrawer({ ctx, open, onClose }: {
  ctx: DebriefContext | null; open: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState<PyqAttemptRow | null>(null);
  const attemptId = ctx?.attemptId;
  useEffect(() => {
    let active = true;
    if (!open || !attemptId) return;
    setAttempt(null);
    void db.pyq_attempts.get(attemptId).then((row) => { if (active) setAttempt(row ?? null); });
    return () => { active = false; };
  }, [attemptId, open]);
  useEffect(() => {
    if (open && ctx && !dialog.current?.open) dialog.current?.showModal();
    if (!open) dialog.current?.close();
  }, [open, ctx]);
  return <dialog ref={dialog} onCancel={onClose} className="m-auto max-h-[90vh] w-[min(760px,96vw)] overflow-y-auto rounded-lg border border-border bg-bg-raised p-0 text-text shadow-lift backdrop:bg-black/40">
    <div className="flex items-center justify-between gap-3 border-b border-border p-4">
      <div><h2 className="font-display text-xl font-semibold">Capture your thinking</h2><p className="text-sm text-text-muted">{ctx?.subject} · {ctx?.topic || 'Question review'}</p></div>
      <Button size="sm" onClick={onClose}>Close</Button>
    </div>
    <div className="p-4 sm:p-6">{attempt ? <ThinkingReviewEditor key={attempt.id} attempt={attempt} revealState="after" onSaved={onClose} /> : <p role="status">Loading the saved attempt…</p>}</div>
  </dialog>;
}
