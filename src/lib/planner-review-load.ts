import type { ReattemptRow } from '@/types';
import { addDaysISO, todayISO } from '@/lib/utils';
import type { PlannerRecoveryDebt } from '@/lib/planner-compiler';

/** A re-attempt row may carry a better estimate supplied by future analytics. */
export type PlannerReviewLoadItem = Pick<ReattemptRow, 'id' | 'scheduled_date' | 'stage'> & {
  estimatedMin?: number;
};

export interface ReviewLoadForecastDay {
  date: string;
  /** Reviews already due before this date and carried into the first day. */
  carriedDebtCount: number;
  /** Reviews whose saved due date is exactly this date. */
  scheduledCount: number;
  dueCount: number;
  estimatedMin: number;
  itemIds: string[];
}

export interface ReviewLoadForecast {
  asOfDate: string;
  throughDate: string;
  horizonDays: number;
  backlogCount: number;
  todayDueCount: number;
  scheduledCount: number;
  totalCount: number;
  totalEstimatedMin: number;
  peakDay: ReviewLoadForecastDay | null;
  excludedCount: number;
  days: ReviewLoadForecastDay[];
}

export interface ReviewLoadWindows {
  next7Days: ReviewLoadForecast;
  next30Days: ReviewLoadForecast;
}

export interface ReviewLoadForecastOptions {
  asOfDate?: string;
  horizonDays: number;
  defaultMinutesPerReview?: number;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function boundedMinutes(value: number | undefined, fallback: number): number {
  const minutes = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(180, Math.round(minutes)));
}

/**
 * Forecast open spaced reviews over an inclusive calendar window.
 *
 * Missed reviews are counted once, on the first day, because the queue carries
 * them forward until answered. Future reviews appear on their saved due date.
 */
export function forecastReviewLoad(
  rows: readonly PlannerReviewLoadItem[],
  options: ReviewLoadForecastOptions
): ReviewLoadForecast {
  const asOfDate = options.asOfDate ?? todayISO();
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays)));
  const throughDate = addDaysISO(asOfDate, horizonDays - 1);
  const fallbackMinutes = boundedMinutes(options.defaultMinutesPerReview, 4);
  const days = Array.from({ length: horizonDays }, (_, index): ReviewLoadForecastDay => ({
    date: addDaysISO(asOfDate, index),
    carriedDebtCount: 0,
    scheduledCount: 0,
    dueCount: 0,
    estimatedMin: 0,
    itemIds: []
  }));
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  let backlogCount = 0;
  let todayDueCount = 0;
  let scheduledCount = 0;
  let excludedCount = 0;

  for (const row of rows) {
    if (row.stage === 'MASTERED') continue;
    if (!isCalendarDate(row.scheduled_date)) {
      excludedCount += 1;
      continue;
    }
    const minutes = boundedMinutes(row.estimatedMin, fallbackMinutes);
    if (row.scheduled_date <= asOfDate) {
      const today = days[0];
      today.itemIds.push(row.id);
      today.estimatedMin += minutes;
      todayDueCount += 1;
      if (row.scheduled_date < asOfDate) {
        today.carriedDebtCount += 1;
        backlogCount += 1;
      } else {
        today.scheduledCount += 1;
      }
      continue;
    }
    if (row.scheduled_date > throughDate) continue;
    const day = dayByDate.get(row.scheduled_date);
    if (!day) continue;
    day.itemIds.push(row.id);
    day.estimatedMin += minutes;
    day.scheduledCount += 1;
    scheduledCount += 1;
  }

  for (const day of days) {
    day.dueCount = day.carriedDebtCount + day.scheduledCount;
  }
  const peakDay = days.reduce<ReviewLoadForecastDay | null>((peak, day) => {
    if (!peak || day.estimatedMin > peak.estimatedMin) return day;
    return peak;
  }, null);
  const totalEstimatedMin = days.reduce((sum, day) => sum + day.estimatedMin, 0);

  return {
    asOfDate,
    throughDate,
    horizonDays,
    backlogCount,
    todayDueCount,
    scheduledCount,
    totalCount: todayDueCount + scheduledCount,
    totalEstimatedMin,
    peakDay: peakDay?.dueCount ? peakDay : null,
    excludedCount,
    days
  };
}

/** Build the two review horizons used by Planner without reading or mutating storage. */
export function forecastReviewLoadWindows(
  rows: readonly PlannerReviewLoadItem[],
  options: Omit<ReviewLoadForecastOptions, 'horizonDays'> = {}
): ReviewLoadWindows {
  return {
    next7Days: forecastReviewLoad(rows, { ...options, horizonDays: 7 }),
    next30Days: forecastReviewLoad(rows, { ...options, horizonDays: 30 })
  };
}

/** Adapt today's carried review load into the compiler's first-claim reservation. */
export function plannerRecoveryDebtFromForecast(
  forecast: ReviewLoadForecast
): PlannerRecoveryDebt {
  return {
    estimatedMin: forecast.days[0]?.estimatedMin ?? 0,
    count: forecast.todayDueCount,
    title: 'Clear due re-attempts',
    detail:
      forecast.backlogCount > 0
        ? `${forecast.backlogCount} overdue · ${forecast.todayDueCount} due now`
        : `${forecast.todayDueCount} due now`,
    href: '/reattempts?open=first'
  };
}
