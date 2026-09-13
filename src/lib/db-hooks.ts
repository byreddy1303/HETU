import { useEffect, useState } from 'react';
import { subscribeDb } from '@/lib/db';

export type UseLiveQueryResult<T> = T | undefined;

/**
 * Dexie-compatible `useLiveQuery` drop-in. Runs the querier once, then
 * re-runs it whenever the in-memory repository bumps its revision (any
 * hydration or completed write). Queries hit RAM only — never the network.
 */
export function useLiveQuery<T, TDefault = never>(
  querier: () => T | Promise<T>,
  deps: readonly unknown[] = [],
  defaultResult?: TDefault
): T | TDefault | undefined {
  const [value, setValue] = useState<T | TDefault | undefined>(defaultResult);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      Promise.resolve()
        .then(querier)
        .then((result) => {
          if (!cancelled) setValue(result);
        })
        .catch((error) => {
          console.error('[db] live query failed:', error);
          if (!cancelled) setValue(undefined);
        });
    };
    run();
    const unsubscribe = subscribeDb(() => {
      if (!cancelled) run();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Queries re-run on every repository revision independently of deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}