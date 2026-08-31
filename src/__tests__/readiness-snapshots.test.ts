import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheRemoteSnapshotHistory,
  dedupeSnapshotsByDate,
  loadSnapshots,
  projectToExam,
  readinessSnapshotFromDatabaseRow,
  snapshotMigrationRows,
  upsertSnapshot,
  weeklyDelta,
  type ReadinessSnapshotDatabaseRow,
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
    expect(weeklyDelta([snapshot('2026-07-06', 40), snapshot('2026-07-13', 47)])).toBe(7);
    expect(weeklyDelta([snapshot('2026-06-01', 40), snapshot('2026-07-13', 47)])).toBeNull();
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

  it('maps database component evidence instead of replacing it with zeroes', () => {
    const row: ReadinessSnapshotDatabaseRow = {
      user_id: 'user-a',
      on_date: '2026-07-27',
      score: 68,
      days_to_exam: 195,
      calculation_version: 2,
      evidence_counts: {
        attempts: 50,
        correct: 32,
        wrong: 12,
        skipped: 4,
        ungraded: 2,
        uncertain: 1
      },
      components: {
        coverage: 0.72,
        retention: 0.64,
        calibration: 0.58,
        surface: 0.79
      }
    };

    expect(readinessSnapshotFromDatabaseRow(row)).toMatchObject({
      coverage: 0.72,
      retention: 0.64,
      calibration: 0.58,
      surface: 0.79,
      evidenceCounts: { attempts: 50, uncertain: 1 }
    });
  });

  it('dedupes the remote primary key by date and never migrates over a newer methodology', () => {
    const legacy = { ...snapshot('2026-07-06', 41), calculationVersion: 1 };
    const corrected = snapshot('2026-07-06', 62);
    expect(dedupeSnapshotsByDate([corrected, legacy])).toEqual([corrected]);

    const nextWeek = snapshot('2026-07-13', 66);
    const rows = snapshotMigrationRows(
      'user-a',
      [legacy, nextWeek],
      [corrected, { ...nextWeek, score: 60, calculationVersion: 1 }]
    );
    expect(rows.map((row) => [row.on_date, row.calculation_version, row.score])).toEqual([
      ['2026-07-13', 2, 66]
    ]);
  });

  it('does not let a transient empty pre-pull calculation overwrite richer evidence', () => {
    const established = {
      ...snapshot('2026-07-13', 66),
      evidenceCounts: { attempts: 24 }
    };
    const emptyRender = {
      ...snapshot('2026-07-13', 0),
      evidenceCounts: { attempts: 0 }
    };

    upsertSnapshot('user-a', established);
    expect(upsertSnapshot('user-a', emptyRender)).toEqual([established]);
    expect(snapshotMigrationRows('user-a', [emptyRender], [established])).toEqual([]);
  });

  it('prepares every local history row up to the 180-row retention limit', () => {
    const history = Array.from({ length: 180 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1 + index));
      return snapshot(date.toISOString().slice(0, 10), 40 + (index % 20));
    });
    const rows = snapshotMigrationRows('user-a', history, []);
    expect(rows).toHaveLength(180);
    expect(rows[0].user_id).toBe('user-a');
    expect(rows.at(-1)?.on_date).toBe('2026-06-29');
  });

  it('caches confirmed account history for subsequent local rehydration', () => {
    const confirmed = {
      ...snapshot('2026-07-27', 68),
      coverage: 0.72,
      retention: 0.64,
      calibration: 0.58,
      surface: 0.79
    };
    cacheRemoteSnapshotHistory('user-a', [confirmed], 2);
    expect(loadSnapshots('user-a')).toEqual([confirmed]);
  });
});
