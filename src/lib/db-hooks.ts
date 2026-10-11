import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getTableSnapshot, subscribeDb, type SyncedTableName } from '@/lib/db';

/** Synchronous, table-scoped reads; unrelated writes never rerun the selector. */
export function useTableRows<Name extends SyncedTableName>(name: Name) {
  const subscribe = useCallback((listener: () => void) => subscribeDb(listener, [name]), [name]);
  const getSnapshot = useCallback(() => getTableSnapshot(name), [name]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type UseLiveQueryResult<T> = T | undefined;

/**
 * Dexie-compatible `useLiveQuery` drop-in. Runs the querier once, then
 * re-runs it whenever the in-memory repository bumps its revision (any
 * hydration or completed write). Queries hit RAM only — never the network.
 */
export function useLiveQuery<T>(querier: () => T | Promise<T>, deps?: readonly unknown[]): T | undefined;
export function useLiveQuery<T, TDefault>(querier: () => T | Promise<T>, deps: readonly unknown[], defaultResult: TDefault): T | TDefault;
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
          if (!cancelled) {
            setValue((prev) => {
              if (Array.isArray(prev) && Array.isArray(result)) {
                if (
                  prev.length === result.length &&
                  prev.every((item, idx) => item === result[idx])
                ) {
                  return prev;
                }
              }
              return result;
            });
          }
        })
        .catch((error) => {
          console.error('[db] live query failed:', error);
          if (!cancelled) setValue(defaultResult);
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
