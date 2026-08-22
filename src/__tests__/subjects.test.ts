import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SUBJECT_IDS,
  CANONICAL_SUBJECT_LABELS,
  canonicalSubjectId,
  canonicalSubjectLabel,
  normalizeSubjectIdentity,
  SUBJECT_DEFINITIONS
} from '@/lib/subjects';
import { normalizePreferencePatch } from '@/stores/prefs';

describe('canonical subject registry', () => {
  it('has one stable id for each of the twelve GATE CS subject buckets', () => {
    expect(SUBJECT_DEFINITIONS).toHaveLength(12);
    expect(new Set(CANONICAL_SUBJECT_IDS).size).toBe(12);
    expect(new Set(CANONICAL_SUBJECT_LABELS).size).toBe(12);
  });

  it.each([
    ['Computer Organization', 'coa', 'COA'],
    ['C Programming', 'programming-data-structures', 'Programming & DS'],
    ['Data Structure', 'programming-data-structures', 'Programming & DS'],
    ['Database Management System', 'databases', 'Databases'],
    ['DBMS', 'databases', 'Databases'],
    ['Computer Network', 'computer-networks', 'Computer Networks']
  ] as const)('normalizes %s to %s / %s', (alias, id, label) => {
    expect(canonicalSubjectId(alias)).toBe(id);
    expect(canonicalSubjectLabel(alias)).toBe(label);
  });

  it('accepts canonical and retired slugs case-insensitively', () => {
    expect(canonicalSubjectId('COMPUTER_NETWORKS')).toBe('computer-networks');
    expect(canonicalSubjectId('c-programming')).toBe('programming-data-structures');
  });

  it('preserves unknown historical labels instead of coercing or dropping them', () => {
    expect(canonicalSubjectId('Software Engineering')).toBeNull();
    expect(canonicalSubjectLabel('  Software Engineering  ')).toBe('Software Engineering');
    expect(normalizeSubjectIdentity('Pascal')).toEqual({ id: null, label: 'Pascal' });
  });

  it('normalizes new and migrated preference defaults as an id/label pair', () => {
    expect(normalizePreferencePatch({ defaultSubject: 'DBMS' })).toMatchObject({
      defaultSubject: 'Databases',
      defaultSubjectId: 'databases'
    });
    expect(normalizePreferencePatch({ defaultSubject: 'Legacy Elective' })).toMatchObject({
      defaultSubject: 'Legacy Elective',
      defaultSubjectId: null
    });
  });
});
