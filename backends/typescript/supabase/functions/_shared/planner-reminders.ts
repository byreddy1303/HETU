/** The unified DayPlan is the only source of remaining planner work. */
export function openPlannerSessions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const execution = item.execution;
    const completedAt = execution && typeof execution === 'object' ? execution.completedAt : null;
    // Malformed completion metadata must not silently hide unfinished work.
    return !(typeof completedAt === 'string' && Number.isFinite(Date.parse(completedAt)));
  });
}
