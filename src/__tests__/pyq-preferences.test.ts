import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_PYQ_PREFERENCES,
  normalizePyqPreferencesSnapshot,
  usePyqPreferencesStore,
  type PyqSavedPrescription
} from '@/stores/pyq-preferences';

function prescription(id: string): PyqSavedPrescription {
  return {
    id,
    name: `Prescription ${id}`,
    preset: 'repair',
    selectionSeed: `seed-${id}`,
    config: {
      bookSlug: 'gate-cse',
      subjectSlug: 'algorithms',
      topicSlug: 'graphs',
      fromYear: 1990,
      toYear: 2026,
      type: 'all',
      order: 'random',
      count: '10',
      history: 'incorrect',
      mode: 'practice'
    },
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  };
}

describe('PYQ preference persistence boundary', () => {
  beforeEach(() => {
    usePyqPreferencesStore.setState({ ...EMPTY_PYQ_PREFERENCES });
  });

  it('normalizes remote/local payloads and never restores active answer checkpoints', () => {
    const normalized = normalizePyqPreferencesSnapshot({
      data: {
        lastPreset: 'repair',
        selectionSeed: ' proof-seed ',
        lastConfig: {
          subjectSlug: ' algorithms ',
          subjectSlugs: [' c-programming ', 'data-structure', 'c-programming', 42],
          topicSlug: 'graphs',
          fromYear: 2026,
          toYear: 1990,
          type: 'MCQ',
          order: 'random',
          count: '10',
          history: 'incorrect',
          mode: 'exam',
          examState: { responses: { secret: 'A' } },
          practiceDraft: { selected_answer: 'B' }
        },
        savedPrescriptions: []
      }
    });

    expect(normalized).toMatchObject({
      lastPreset: 'repair',
      selectionSeed: 'proof-seed',
      lastConfig: {
        subjectSlug: 'algorithms',
        subjectSlugs: ['c-programming', 'data-structure'],
        fromYear: 1990,
        toYear: 2026,
        mode: 'exam'
      }
    });
    expect(normalized.lastConfig).not.toHaveProperty('examState');
    expect(normalized.lastConfig).not.toHaveProperty('practiceDraft');
  });

  it('deduplicates named prescriptions, bounds the ledger, and resets cleanly', () => {
    const store = usePyqPreferencesStore.getState();
    for (let index = 0; index < 35; index += 1) {
      store.savePrescription(prescription(String(index)));
    }
    expect(usePyqPreferencesStore.getState().savedPrescriptions).toHaveLength(30);
    store.savePrescription({ ...prescription('34'), name: 'Updated 34' });
    expect(usePyqPreferencesStore.getState().savedPrescriptions).toHaveLength(30);
    expect(usePyqPreferencesStore.getState().savedPrescriptions[0].name).toBe('Updated 34');
    store.deletePrescription('34');
    expect(usePyqPreferencesStore.getState().savedPrescriptions).toHaveLength(29);
    store.reset();
    expect(usePyqPreferencesStore.getState()).toMatchObject(EMPTY_PYQ_PREFERENCES);
  });
});
