import { useCallback, useEffect, useRef, useState } from 'react';
import { getMemoryEntry, queueMemorySave, type StudyMemoryEntry } from '@/lib/study-memory';

/** Drafts are acknowledged by the backend; a failed save is never shown as saved. */
export function useStudyMemoryDraft(initial: StudyMemoryEntry) {
  const [entry, setEntry] = useState(initial);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(initial);
  const generation = useRef(0);
  const lastSave = useRef<Promise<StudyMemoryEntry> | null>(null);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const invalidate = useCallback(() => { generation.current++; }, []);

  const reload = useCallback(async () => {
    const token = ++generation.current;
    const value = initialRef.current;
    setReady(false);
    setError(null);
    try {
      const result = await getMemoryEntry(value.id);
      if (token !== generation.current) return;
      current.current = result.entry;
      setEntry(result.entry);
      setReady(true);
    } catch (cause) {
      if (token !== generation.current) return;
      // The client preserves HTTP status in error text; only a missing record
      // permits creating a draft. An unreachable database must not look empty.
      const message = cause instanceof Error ? cause.message : String(cause);
      if ((cause as { status?: number })?.status === 404 || /Memory entry not found/i.test(message)) {
        current.current = value;
        setEntry(value);
        setReady(true);
      } else setError(message);
    }
  }, []);

  useEffect(() => {
    void reload();
    return invalidate;
  }, [initial.id, initial.user_id, reload, invalidate]);

  const save = useCallback((value: StudyMemoryEntry = current.current) => {
    const token = generation.current;
    value = { ...value, version: Math.max(value.version, current.current.version) };
    current.current = value;
    setEntry(value);
    setPending((count) => count + 1);
    setError(null);
    const operation = queueMemorySave(value).then((saved) => {
      if (token === generation.current) {
        const next = { ...current.current, version: saved.version, created_at: saved.created_at, updated_at: saved.updated_at };
        current.current = next;
        setEntry(next);
      }
      return saved;
    }).catch((cause: unknown) => {
      if (token === generation.current) setError(cause instanceof Error ? cause.message : 'The draft could not be saved.');
      throw cause;
    }).finally(() => { if (token === generation.current) setPending((count) => Math.max(0, count - 1)); });
    lastSave.current = operation;
    return operation;
  }, []);

  const update = useCallback((patch: Partial<StudyMemoryEntry>) => {
    const value = { ...current.current, ...patch };
    void save(value).catch(() => undefined);
  }, [save]);

  return { entry, ready, saving: pending > 0, error, update, save, reload,
    flush: () => lastSave.current ?? Promise.resolve(current.current) };
}
