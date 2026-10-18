import { apiRequest } from '@/lib/fastapi-client';
import type { StudyMemoryEntry } from '@/lib/study-memory';

export type LocalModelProvider = 'ollama' | 'openai_compatible';

export interface LocalLearningEngineConfig {
  provider: LocalModelProvider;
  base_url: string;
  model: string;
  enabled: boolean;
  time_zone: string;
}

export interface LocalModelDiscovery {
  provider: LocalModelProvider;
  base_url: string;
  reachable: boolean;
  models: { id: string; name?: string }[];
  selected_model: string;
  selected_model_available: boolean;
  error_code?: string;
  message?: string;
}

export interface LocalLearningEngineStatus {
  state: 'disabled' | 'idle' | 'running' | 'error';
  message: string;
  last_run_at: string | null;
  model: string;
  processed_count: number;
  pending_count: number;
  last_error?: string | null;
}

export interface LocalLearningActions {
  items: StudyMemoryEntry[];
  latest_results: StudyMemoryEntry[];
}

const root = '/v1/study-memory/engine';
export const LEARNING_UPDATED_EVENT = 'hetu:local-learning-updated';

export function getLocalLearningConfig(): Promise<LocalLearningEngineConfig> {
  return apiRequest(`${root}/config`);
}

export function saveLocalLearningConfig(
  config: LocalLearningEngineConfig
): Promise<LocalLearningEngineConfig> {
  return apiRequest(`${root}/config`, { method: 'PUT', body: JSON.stringify(config) });
}

export function discoverLocalModels(
  config: LocalLearningEngineConfig
): Promise<LocalModelDiscovery> {
  return apiRequest(`${root}/models`, { method: 'POST', body: JSON.stringify(config) });
}

export function getLocalLearningStatus(): Promise<LocalLearningEngineStatus> {
  return apiRequest(`${root}/status`);
}

export function getLocalLearningActions(): Promise<LocalLearningActions> {
  return apiRequest(`${root}/actions`);
}

export function prepareLocalLearningActivity(id: string): Promise<StudyMemoryEntry> {
  return apiRequest(`${root}/actions/${encodeURIComponent(id)}/prepare`, { method: 'POST' });
}

export function runLocalLearningEngine(): Promise<LocalLearningEngineStatus> {
  return apiRequest(`${root}/run`, { method: 'POST', body: JSON.stringify({}) });
}

export function localModelDefaultUrl(provider: LocalModelProvider): string {
  return provider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1';
}
