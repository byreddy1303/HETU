import { describe, expect, it } from 'vitest';
import { JOURNAL_TEMPLATES, journalResurfaceStatus } from '@/lib/journal-linking';

describe('JOURNAL_TEMPLATES', () => {
  it('covers all five entry kinds with prompts', () => {
    expect(JOURNAL_TEMPLATES.map((template) => template.kind)).toEqual([
      'postmortem',
      'concept',
      'fear',
      'revision',
      'win'
    ]);
    for (const template of JOURNAL_TEMPLATES) {
      expect(template.triggerPrompt.length).toBeGreaterThan(0);
      expect(template.notePrompt.length).toBeGreaterThan(0);
    }
  });
});

describe('journalResurfaceStatus', () => {
  it('marks mastered links as fixed', () => {
    expect(
      journalResurfaceStatus({ created_at: '2024-01-01T00:00:00.000Z' }, 'MASTERED', Date.parse('2024-06-01T00:00:00.000Z'))
    ).toBe('fixed');
  });

  it('flags week-old untouched entries for reread', () => {
    expect(
      journalResurfaceStatus({ created_at: '2024-01-01T00:00:00.000Z' }, 'D10', Date.parse('2024-06-01T00:00:00.000Z'))
    ).toBe('reread');
  });

  it('keeps fresh entries open', () => {
    expect(
      journalResurfaceStatus({ created_at: '2024-05-30T00:00:00.000Z' }, 'D3', Date.parse('2024-06-01T00:00:00.000Z'))
    ).toBe('open');
  });
});
