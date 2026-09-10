import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PyqSessionConfig } from '@/types';

export type PyqPresetPreference =
  'custom' | 'learn' | 'diagnose' | 'repair' | 'speed' | 'transfer' | 'mixed-gate' | 'full-paper';

export interface PyqSavedPrescription {
  id: string;
  name: string;
  preset: PyqPresetPreference;
  config: PyqSessionConfig;
  selectionSeed: string;
  createdAt: string;
  updatedAt: string;
}

export interface PyqPreferencesSnapshot {
  lastConfig: PyqSessionConfig | null;
  lastPreset: PyqPresetPreference;
  selectionSeed: string;
  savedPrescriptions: PyqSavedPrescription[];
}

interface PyqPreferencesActions {
  remember: (config: PyqSessionConfig, preset: PyqPresetPreference, selectionSeed: string) => void;
  savePrescription: (prescription: PyqSavedPrescription) => void;
  deletePrescription: (id: string) => void;
  reset: () => void;
}

export type PyqPreferencesState = PyqPreferencesSnapshot & PyqPreferencesActions;

const PRESET_VALUES = new Set<PyqPresetPreference>([
  'custom',
  'learn',
  'diagnose',
  'repair',
  'speed',
  'transfer',
  'mixed-gate',
  'full-paper'
]);
const TYPE_VALUES = new Set<PyqSessionConfig['type']>(['all', 'MCQ', 'MSQ', 'NAT']);
const ORDER_VALUES = new Set<PyqSessionConfig['order']>(['unseen', 'random', 'newest', 'oldest']);
const COUNT_VALUES = new Set<PyqSessionConfig['count']>(['5', '10', '15', '25', '50', 'all']);
const HISTORY_VALUES = new Set<NonNullable<PyqSessionConfig['history']>>([
  'all',
  'unseen',
  'incorrect',
  'guessed',
  'slow',
  'skipped',
  'unanalyzed',
  'repeated'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return isRecord(value.data) ? value.data : value;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, fallback: T): T {
  return typeof value === 'string' && values.has(value as T) ? (value as T) : fallback;
}

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function optionalBoundedString(value: unknown, maxLength: number): string | undefined {
  const normalized = boundedString(value, maxLength);
  return normalized || undefined;
}

function boundedStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((entry) => boundedString(entry, maxLength)).filter(Boolean))
  ].slice(0, maxItems);
}

function validYear(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 1950 && (value as number) <= 3000
    ? (value as number)
    : fallback;
}

function validTimestamp(value: unknown, fallback: string): string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

/**
 * Keep one validation boundary for both localStorage hydration and Supabase
 * account-state hydration. Transient answer/checkpoint fields are deliberately
 * omitted: this store remembers setup prescriptions, never an active attempt.
 */
export function normalizePyqPreferenceConfig(value: unknown): PyqSessionConfig | null {
  if (!isRecord(value)) return null;
  const subjectSlug = boundedString(value.subjectSlug, 120);
  if (!subjectSlug) return null;

  const currentYear = new Date().getUTCFullYear();
  const rawFromYear = validYear(value.fromYear, currentYear);
  const rawToYear = validYear(value.toYear, rawFromYear);
  const fromYear = Math.min(rawFromYear, rawToYear);
  const toYear = Math.max(rawFromYear, rawToYear);
  const recommendationReasons = Array.isArray(value.recommendationReasons)
    ? value.recommendationReasons
        .map((reason) => boundedString(reason, 160))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const subjectSlugs = boundedStringArray(value.subjectSlugs, 20, 120);

  return {
    bookSlug: optionalBoundedString(value.bookSlug, 120),
    subjectSlug,
    ...(subjectSlugs.length > 0 ? { subjectSlugs } : {}),
    topicSlug: optionalBoundedString(value.topicSlug, 120) ?? 'all',
    fromYear,
    toYear,
    type: enumValue(value.type, TYPE_VALUES, 'all'),
    order: enumValue(value.order, ORDER_VALUES, 'unseen'),
    count: enumValue(value.count, COUNT_VALUES, '10'),
    history: enumValue(value.history, HISTORY_VALUES, 'all'),
    mode: value.mode === 'exam' ? 'exam' : 'practice',
    examKind:
      value.examKind === 'full-paper' || value.examKind === 'timed-set'
        ? value.examKind
        : undefined,
    benchmarkPaperId: optionalBoundedString(value.benchmarkPaperId, 160),
    recommendationPreset: enumValue(value.recommendationPreset, PRESET_VALUES, 'custom'),
    selectionSeed: optionalBoundedString(value.selectionSeed, 200),
    recommendationReasons,
    savedPrescriptionId: optionalBoundedString(value.savedPrescriptionId, 160),
    savedPrescriptionName: optionalBoundedString(value.savedPrescriptionName, 80)
  };
}

export function normalizePyqSavedPrescription(value: unknown): PyqSavedPrescription | null {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id, 160);
  const name = boundedString(value.name, 80);
  const config = normalizePyqPreferenceConfig(value.config);
  if (!id || !name || !config) return null;

  const createdAt = validTimestamp(value.createdAt, new Date(0).toISOString());
  return {
    id,
    name,
    preset: enumValue(value.preset, PRESET_VALUES, 'custom'),
    config,
    selectionSeed: boundedString(value.selectionSeed, 200),
    createdAt,
    updatedAt: validTimestamp(value.updatedAt, createdAt)
  };
}

export function normalizePyqPreferencesSnapshot(value: unknown): PyqPreferencesSnapshot {
  const data = snapshotData(value);
  const savedPrescriptions: PyqSavedPrescription[] = [];
  const seenPrescriptionIds = new Set<string>();

  if (Array.isArray(data.savedPrescriptions)) {
    for (const candidate of data.savedPrescriptions) {
      const prescription = normalizePyqSavedPrescription(candidate);
      if (!prescription || seenPrescriptionIds.has(prescription.id)) continue;
      seenPrescriptionIds.add(prescription.id);
      savedPrescriptions.push(prescription);
      if (savedPrescriptions.length === 30) break;
    }
  }

  return {
    lastConfig: normalizePyqPreferenceConfig(data.lastConfig),
    lastPreset: enumValue(data.lastPreset, PRESET_VALUES, 'custom'),
    selectionSeed: boundedString(data.selectionSeed, 200),
    savedPrescriptions
  };
}

export const EMPTY_PYQ_PREFERENCES: PyqPreferencesSnapshot = {
  lastConfig: null,
  lastPreset: 'custom',
  selectionSeed: '',
  savedPrescriptions: []
};

export const usePyqPreferencesStore = create<PyqPreferencesState>()(
  persist(
    (set) => ({
      ...EMPTY_PYQ_PREFERENCES,
      remember: (lastConfig, lastPreset, selectionSeed) => {
        const normalized = normalizePyqPreferencesSnapshot({
          lastConfig,
          lastPreset,
          selectionSeed
        });
        set({
          lastConfig: normalized.lastConfig,
          lastPreset: normalized.lastPreset,
          selectionSeed: normalized.selectionSeed
        });
      },
      savePrescription: (prescription) => {
        const normalized = normalizePyqSavedPrescription(prescription);
        if (!normalized) return;
        set((state) => ({
          savedPrescriptions: [
            normalized,
            ...state.savedPrescriptions.filter((candidate) => candidate.id !== normalized.id)
          ].slice(0, 30)
        }));
      },
      deletePrescription: (id) =>
        set((state) => ({
          savedPrescriptions: state.savedPrescriptions.filter(
            (prescription) => prescription.id !== id
          )
        })),
      reset: () => set({ ...EMPTY_PYQ_PREFERENCES })
    }),
    {
      name: 'air.pyq-preferences',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lastConfig: state.lastConfig,
        lastPreset: state.lastPreset,
        selectionSeed: state.selectionSeed,
        savedPrescriptions: state.savedPrescriptions
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizePyqPreferencesSnapshot(persisted)
      })
    }
  )
);
