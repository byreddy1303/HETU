import { useEffect, useState } from 'react';

/** Seconds elapsed since `startedAtMs` (epoch ms). Derived from the clock, so it never drifts. */
export function useTimer(startedAtMs: number | null): number {
  const [seconds, setSeconds] = useState(() =>
    startedAtMs === null ? 0 : Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
  );
  useEffect(() => {
    if (startedAtMs === null) {
      setSeconds(0);
      return;
    }

    let timeout = 0;
    const tick = () => {
      const elapsedMs = Math.max(0, Date.now() - startedAtMs);
      setSeconds(Math.floor(elapsedMs / 1000));
      // Align the next update to the next displayed second. The old 500 ms
      // interval woke React twice for every visible timer change.
      timeout = window.setTimeout(tick, 1000 - (elapsedMs % 1000) + 16);
    };
    tick();
    return () => window.clearTimeout(timeout);
  }, [startedAtMs]);
  return seconds;
}
