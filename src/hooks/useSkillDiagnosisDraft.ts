import { useEffect, useRef, useState } from 'react';
import { saveDiagnosis, type SkillDiagnosis } from '@/lib/skill-coach';
import { memoryString } from '@/lib/study-memory';

export interface ContrastDraft {
  answers: Record<string, number>;
  reasoning: string;
  confidence: string;
  assisted: boolean;
}
function fields(value: SkillDiagnosis): ContrastDraft {
  return {
    answers: (value.entry.data.answers as Record<string, number>) ?? {},
    reasoning: value.entry.content,
    confidence: memoryString(value.entry.data, 'confidence') || 'unknown',
    assisted: value.entry.data.assisted === true
  };
}

/** Debounced local drafts serialize behind acknowledged revisions; submission flushes them first. */
export function useSkillDiagnosisDraft(initial: SkillDiagnosis) {
  const [result, setResult] = useState(initial);
  const [draft, setDraft] = useState<ContrastDraft>(() => fields(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(initial);
  const latest = useRef(draft);
  const saved = useRef(JSON.stringify(draft));
  const chain = useRef(Promise.resolve(initial));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);
  const pending = useRef(0);
  const failed = useRef(false);

  function enqueue(value: ContrastDraft, submit: boolean): Promise<SkillDiagnosis> {
    const snapshot = structuredClone(value);
    pending.current++;
    if (alive.current) {
      setSaving(true);
      setError('');
    }
    const next = chain.current
      .then(async () => {
        if (!submit && JSON.stringify(snapshot) === saved.current) return current.current;
        const response = await saveDiagnosis(current.current.entry, { ...snapshot, submit });
        current.current = response;
        saved.current = JSON.stringify(snapshot);
        if (alive.current) setResult(response);
        return response;
      })
      .catch((cause: unknown) => {
        failed.current = true;
        if (alive.current)
          setError(cause instanceof Error ? cause.message : 'Your responses could not be saved.');
        throw cause;
      })
      .finally(() => {
        pending.current--;
        if (alive.current) setSaving(pending.current > 0);
      });
    chain.current = next;
    return next;
  }
  // Keep an up-to-date writer without making lifecycle cleanup depend on each keystroke.
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (
      !failed.current &&
      current.current.entry.state !== 'completed' &&
      JSON.stringify(latest.current) !== saved.current
    )
      void enqueue(latest.current, false).catch(() => undefined);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      flushRef.current();
    };
  }, []);
  function update(patch: Partial<ContrastDraft>) {
    latest.current = { ...latest.current, ...patch };
    setDraft(latest.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 500);
  }
  async function save(submit: boolean) {
    clearTimeout(timer.current);
    // A failed response may have committed. Replaying the same payload is safe;
    // changed stale drafts still conflict instead of overwriting newer evidence.
    if (failed.current) {
      chain.current = Promise.resolve(current.current);
      failed.current = false;
    }
    return enqueue(latest.current, submit);
  }
  function accept(value: SkillDiagnosis) {
    current.current = value;
    setResult(value);
  }
  return {
    result,
    draft,
    update,
    save,
    accept,
    saving,
    error,
    dirty: JSON.stringify(draft) !== saved.current
  };
}
