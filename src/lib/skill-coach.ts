import { apiRequest } from '@/lib/fastapi-client';
import type { StudyMemoryEntry } from '@/lib/study-memory';

export interface SkillProbe {
  id: string;
  prompt: string;
  choices: string[];
  answer?: number;
  explanation?: string;
}
export interface Skill {
  id: string;
  title: string;
  subject: string;
  topic: string;
  prerequisites: string[];
  mapped_count: number;
  mapping_count: number;
  question_uids: string[];
  review: { kind: string; date: string; scope: string };
  probes: SkillProbe[];
  principle?: string;
  contrast?: string;
  diagnostics: StudyMemoryEntry[];
  repairs: StudyMemoryEntry[];
  results: StudyMemoryEntry[];
  conditions: StudyMemoryEntry[];
  evidence: {
    fresh_checks: number;
    accurate_fresh_checks: number;
    delayed_checks: number;
    accurate_delayed_checks: number;
    conditions_unknown: number;
    pace: string;
    calibration: string;
  };
}
export interface SkillOverview {
  items: Skill[];
  complete: boolean;
  curriculum_version: number;
}
export interface SkillDiagnosis {
  entry: StudyMemoryEntry;
  skill: Skill;
}
export function notifySkillChange() {
  window.dispatchEvent(new Event('hetu:memory-saved'));
}
export const loadSkills = (signal?: AbortSignal) =>
  apiRequest<SkillOverview>('/v1/skill-coach', { signal });
export const loadDiagnosis = (id: string, signal?: AbortSignal) =>
  apiRequest<SkillDiagnosis>(`/v1/skill-coach/diagnoses/${encodeURIComponent(id)}`, { signal });
export async function startDiagnosis(skillId: string, attemptId?: string) {
  const result = await apiRequest<SkillDiagnosis>(`/v1/skill-coach/${skillId}/diagnoses`, {
    method: 'POST',
    body: JSON.stringify({ request_id: crypto.randomUUID(), attempt_id: attemptId || null })
  });
  notifySkillChange();
  return result;
}
export async function saveDiagnosis(
  entry: StudyMemoryEntry,
  draft: {
    answers: Record<string, number>;
    reasoning: string;
    confidence: string;
    assisted: boolean;
    submit: boolean;
  }
) {
  const saved = await apiRequest<SkillDiagnosis>(
    `/v1/skill-coach/diagnoses/${encodeURIComponent(entry.id)}`,
    { method: 'PUT', body: JSON.stringify({ ...draft, expected_version: entry.version }) }
  );
  notifySkillChange();
  return saved;
}
export async function confirmDiagnosis(entry: StudyMemoryEntry, cause: string) {
  const saved = await apiRequest<{ diagnosis: SkillDiagnosis; repair: StudyMemoryEntry }>(
    `/v1/skill-coach/diagnoses/${encodeURIComponent(entry.id)}/confirm`,
    { method: 'POST', body: JSON.stringify({ cause, expected_version: entry.version }) }
  );
  notifySkillChange();
  return saved;
}
export async function reconcileSkills() {
  return apiRequest<{ reconciled: number }>('/v1/skill-coach/reconcile', { method: 'POST' });
}
export async function saveSkillConditions(sessionId: string, assisted: boolean, version: number) {
  const saved = await apiRequest<StudyMemoryEntry>(
    `/v1/skill-coach/sessions/${encodeURIComponent(sessionId)}/conditions`,
    { method: 'PUT', body: JSON.stringify({ assisted, expected_version: version }) }
  );
  notifySkillChange();
  return saved;
}
