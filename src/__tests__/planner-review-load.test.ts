import { describe, expect, it } from 'vitest';
import {
  forecastReviewLoad,
  forecastReviewLoadWindows,
  type PlannerReviewLoadItem
} from '@/lib/planner-review-load';

function review(
  id: string,
  scheduledDate: string,
  estimatedMin?: number,
  stage: PlannerReviewLoadItem['stage'] = 'D3'
): PlannerReviewLoadItem {
  return { id, scheduled_date: scheduledDate, stage, ...(estimatedMin ? { estimatedMin } : {}) };
}

describe('Planner review-load forecast', () => {
  it('carries overdue reviews once and buckets future reviews on their due dates', () => {
    const rows = [
      review('overdue', '2026-08-29', 6),
      review('today', '2026-08-31'),
      review('tomorrow', '2026-09-01', 10),
      review('day-seven', '2026-09-06', 3),
      review('outside-seven', '2026-09-07', 8),
      review('mastered', '2026-08-28', 20, 'MASTERED'),
      review('invalid', 'tomorrow')
    ];
    const before = JSON.stringify(rows);

    const forecast = forecastReviewLoad(rows, {
      asOfDate: '2026-08-31',
      horizonDays: 7,
      defaultMinutesPerReview: 4
    });

    expect(forecast.throughDate).toBe('2026-09-06');
    expect(forecast.backlogCount).toBe(1);
    expect(forecast.todayDueCount).toBe(2);
    expect(forecast.scheduledCount).toBe(2);
    expect(forecast.totalCount).toBe(4);
    expect(forecast.totalEstimatedMin).toBe(23);
    expect(forecast.days[0]).toMatchObject({
      date: '2026-08-31',
      carriedDebtCount: 1,
      scheduledCount: 1,
      dueCount: 2,
      estimatedMin: 10
    });
    expect(forecast.days.at(-1)).toMatchObject({ date: '2026-09-06', dueCount: 1 });
    expect(forecast.peakDay?.date).toBe('2026-08-31');
    expect(forecast.excludedCount).toBe(1);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('builds consistent seven- and thirty-day horizons', () => {
    const rows = [review('day-eight', '2026-09-07', 8)];

    const windows = forecastReviewLoadWindows(rows, { asOfDate: '2026-08-31' });

    expect(windows.next7Days.horizonDays).toBe(7);
    expect(windows.next7Days.totalCount).toBe(0);
    expect(windows.next30Days.horizonDays).toBe(30);
    expect(windows.next30Days.totalCount).toBe(1);
    expect(windows.next30Days.throughDate).toBe('2026-09-29');
  });
});
