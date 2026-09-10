import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_PLANNER_TEMPLATES,
  MAX_PLANNER_TEMPLATES,
  normalizePlannerTemplatesSnapshot,
  usePlannerTemplatesStore,
  type PlannerTemplateInput
} from '@/stores/planner-templates';

function template(id: string): PlannerTemplateInput {
  return {
    id,
    name: `Template ${id}`,
    block: {
      subject: 'Algorithms',
      subjectId: 'algorithms',
      customSubject: null,
      durationMin: 60,
      mode: 'Problem Solving',
      priority: 'P2 High',
      target: 'Solve graph problems',
      resource: 'Practice bank',
      startAt: '07:30'
    },
    recurrence: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  };
}

describe('Planner template persistence boundary', () => {
  beforeEach(() => {
    usePlannerTemplatesStore.setState({ ...EMPTY_PLANNER_TEMPLATES });
  });

  it('normalizes reusable fields and strips dated execution contracts', () => {
    const normalized = normalizePlannerTemplatesSnapshot({
      data: {
        templates: [
          {
            id: ' template-1 ',
            name: ' DB review ',
            block: {
              id: 'dated-block-id',
              subject: ' DBMS ',
              subjectId: 'algorithms',
              customSubject: 'discard me',
              durationMin: 10_000,
              mode: 'not-a-mode',
              priority: 'not-a-priority',
              target: ' Review normalization ',
              resource: ' Notes ',
              startAt: '99:90',
              launch: { kind: 'pyq', prescription: { id: 'must-not-survive' } },
              result: { kind: 'pyq', receipt: { id: 'must-not-survive' } },
              execution: { sessionId: 'must-not-survive' }
            },
            recurrence: {
              kind: 'custom',
              interval: 2,
              weekdays: [5, 1, 5, -1, 8],
              startDate: '2026-09-05',
              endDate: '2026-09-01',
              maxOccurrences: 8
            },
            createdAt: '2026-09-01T10:00:00.000Z',
            updatedAt: '2026-09-02T10:00:00.000Z'
          }
        ]
      }
    });

    expect(normalized.templates).toHaveLength(1);
    expect(normalized.templates[0]).toEqual({
      id: 'template-1',
      name: 'DB review',
      block: {
        subject: 'Databases',
        subjectId: 'databases',
        customSubject: null,
        durationMin: 60,
        mode: 'Deep Study',
        priority: 'P2 High',
        target: 'Review normalization',
        resource: 'Notes',
        startAt: null
      },
      recurrence: {
        kind: 'custom',
        interval: 2,
        weekdays: [1, 5],
        startDate: '2026-09-05',
        endDate: null,
        maxOccurrences: 8
      },
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z'
    });
    expect(normalized.templates[0].block).not.toHaveProperty('id');
    expect(normalized.templates[0].block).not.toHaveProperty('launch');
    expect(normalized.templates[0].block).not.toHaveProperty('result');
    expect(normalized.templates[0].block).not.toHaveProperty('execution');
  });

  it('fails closed for invalid recurrence and normalizes weekday rules', () => {
    const [unknown, weekdays] = normalizePlannerTemplatesSnapshot({
      templates: [
        {
          ...template('unknown'),
          recurrence: {
            kind: 'monthly',
            interval: 1,
            weekdays: [],
            startDate: '2026-09-01'
          }
        },
        {
          ...template('weekdays'),
          recurrence: {
            kind: 'weekdays',
            interval: 500,
            weekdays: [0, 6],
            startDate: '2026-09-01',
            endDate: '2026-10-01',
            maxOccurrences: 900
          }
        }
      ]
    }).templates;

    expect(unknown.recurrence).toBeNull();
    expect(weekdays.recurrence).toEqual({
      kind: 'weekdays',
      interval: 1,
      weekdays: [1, 2, 3, 4, 5],
      startDate: '2026-09-01',
      endDate: '2026-10-01',
      maxOccurrences: null
    });
  });

  it('deduplicates, bounds, updates, deletes, and resets the account ledger', () => {
    const store = usePlannerTemplatesStore.getState();
    for (let index = 0; index < MAX_PLANNER_TEMPLATES + 5; index += 1) {
      expect(store.saveTemplate(template(String(index)))).not.toBeNull();
    }

    expect(usePlannerTemplatesStore.getState().templates).toHaveLength(MAX_PLANNER_TEMPLATES);
    const beforeUpdate = usePlannerTemplatesStore.getState().templates[0];
    expect(beforeUpdate.id).toBe(String(MAX_PLANNER_TEMPLATES + 4));

    store.saveTemplate({ ...template(beforeUpdate.id), name: 'Updated template' });
    expect(usePlannerTemplatesStore.getState().templates).toHaveLength(MAX_PLANNER_TEMPLATES);
    expect(usePlannerTemplatesStore.getState().templates[0]).toMatchObject({
      id: beforeUpdate.id,
      name: 'Updated template',
      createdAt: beforeUpdate.createdAt
    });

    expect(store.saveTemplate({ ...template('invalid'), name: '   ' })).toBeNull();
    expect(usePlannerTemplatesStore.getState().templates).toHaveLength(MAX_PLANNER_TEMPLATES);

    store.deleteTemplate(beforeUpdate.id);
    expect(usePlannerTemplatesStore.getState().templates).toHaveLength(MAX_PLANNER_TEMPLATES - 1);
    store.reset();
    expect(usePlannerTemplatesStore.getState()).toMatchObject(EMPTY_PLANNER_TEMPLATES);
  });
});
