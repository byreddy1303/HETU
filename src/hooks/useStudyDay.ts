import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/fastapi-client';
import { TODAY_BUDGETS, type TodayBudget } from '@/lib/today-actions';

export interface StudyDayChoices {
  version: number;
  budget: TodayBudget;
  parked_action_ids: string[];
}
const initial: StudyDayChoices = { version: 0, budget: 20, parked_action_ids: [] };

/** Personal day preferences are saved in the same local workspace as study evidence. */
export function useStudyDay(userId: string, day: string) {
  const [value, setValue] = useState<StudyDayChoices>(initial);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    setReady(false);
    setSaving(false);
    setError('');
    void apiRequest<StudyDayChoices>(`/v1/skill-coach/day/${day}`, { signal: controller.signal })
      .then((saved) => {
        if (
          !Number.isInteger(saved.version) ||
          !TODAY_BUDGETS.includes(saved.budget) ||
          !Array.isArray(saved.parked_action_ids)
        )
          throw new Error('Your saved study choices could not be read. Retry loading them.');
        if (generation.current === request) {
          setValue(saved);
          setReady(true);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && generation.current === request)
          setError(cause instanceof Error ? cause.message : 'Study choices could not load.');
      });
    return () => {
      controller.abort();
      generation.current = request + 1;
    };
  }, [userId, day, revision]);
  async function save(changes: Partial<Pick<StudyDayChoices, 'budget' | 'parked_action_ids'>>) {
    if (!ready || inFlight.current) return;
    const request = generation.current;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await apiRequest<StudyDayChoices>(`/v1/skill-coach/day/${day}`, {
        method: 'PUT',
        body: JSON.stringify({
          expected_version: value.version,
          budget: value.budget,
          parked_action_ids: value.parked_action_ids,
          ...changes
        })
      });
      if (request === generation.current) setValue(saved);
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error ? cause.message : 'Your choices were not saved. Retry or reload.'
        );
    } finally {
      inFlight.current = false;
      if (request === generation.current) setSaving(false);
    }
  }
  return { value, ready, saving, error, save, reload };
}
