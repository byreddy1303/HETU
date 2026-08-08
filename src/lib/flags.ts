/** After this date, only `fix:` commits may touch UI. */
export const FREEZE_DATE = '2026-10-31';

export function isFrozen(today: Date = new Date()): boolean {
  return today.getTime() > new Date(`${FREEZE_DATE}T23:59:59`).getTime();
}
