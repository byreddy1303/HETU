import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadSnapshots,
  projectToExam,
  upsertSnapshot,
  weeklyDelta,
  type ReadinessSnapshot
} from '@/lib/readiness-snapshots';

function snapshot(date: string, score: number): ReadinessSnapshot {
  return {
    date,
    score,
    coverage: score / 100,
    retention: score / 100,
    calibration: score / 100,
    surface: score / 100,
    daysToExam: 100,
    calculationVersion: 2
  };
}

describe('readiness snapshots', () => {
  beforeEach(() => localStorage.clear());

  it('isolates snapshot history by account', () => {
    upsertSnapshot('user-a', snapshot('2026-07-06', 42));
    upsertSnapshot('user-b', snapshot('2026-07-06', 71));
    expect(loadSnapshots('user-a').map((row) => row.score)).toEqual([42]);
    expect(loadSnapshots('user-b').map((row) => row.score)).toEqual([71]);
  });

  it('only calls a comparison weekly when a nearby prior-week snapshot exists', () => {
    expect(
      weeklyDelta([snapshot('2026-07-06', 40), snapshot('2026-07-13', 47)])
    ).toBe(7);
    expect(
      weeklyDelta([snapshot('2026-06-01', 40), snapshot('2026-07-13', 47)])
    ).toBeNull();
  });

  it('withholds projection until four snapshots span at least three weeks', () => {
    expect(
      projectToExam(
        [
          snapshot('2026-07-01', 40),
          snapshot('2026-07-02', 41),
          snapshot('2026-07-03', 42),
          snapshot('2026-07-04', 43)
        ],
        100
      )
    ).toBeNull();
    expect(
      projectToExam(
        [
          snapshot('2026-07-06', 40),
          snapshot('2026-07-13', 42),
          snapshot('2026-07-20', 44),
          snapshot('2026-07-27', 46)
        ],
        100
      )
    ).not.toBeNull();
  });

  it('never mixes the legacy Journal-only series into version-2 trends', () => {
    const legacy = { ...snapshot('2026-07-06', 99), calculationVersion: 1 };
    const current = snapshot('2026-07-13', 47);
    expect(weeklyDelta([legacy, current])).toBeNull();
    expect(
      projectToExam(
        [
          legacy,
          snapshot('2026-07-13', 42),
          snapshot('2026-07-20', 44),
          snapshot('2026-07-27', 46)
        ],
        100
      )
    ).toBeNull();
  });
});
