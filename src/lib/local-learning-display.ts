export function dateLabel(
  value: string | null | undefined,
  timeZone: string,
  includeTime = false
): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
    timeZone
  }).format(date);
}
