import { describe, expect, it } from 'vitest';
import { CANONICAL_SUBJECT_IDS } from '@/lib/subjects';
import {
  GATE_2027,
  GATE_2027_BLUEPRINT,
  GATE_2027_OFFICIAL_TOPIC_LEAVES,
  GATE_2027_SUBJECTS,
  gate2027BankTopicStatus,
  gate2027Subject
} from '@/lib/gate-2027';
import { official2027TopicsFor, subtopicsFor } from '@/lib/subtopics';

describe('official GATE 2027 registry', () => {
  it('locks the official CS paper blueprint without invented subject weights', () => {
    expect(GATE_2027_BLUEPRINT).toMatchObject({
      durationMinutes: 180,
      questionCount: 65,
      totalMarks: 100,
      sectionMarks: {
        generalAptitude: 15,
        engineeringMathematics: 13,
        coreSubject: 72
      }
    });
    expect(Object.values(GATE_2027_BLUEPRINT.sectionMarks).reduce((a, b) => a + b, 0)).toBe(100);
    expect(GATE_2027_BLUEPRINT).not.toHaveProperty('subjectWeights');
  });

  it('has exactly one official scope for every canonical subject', () => {
    expect(GATE_2027_SUBJECTS.map((subject) => subject.id)).toEqual(CANONICAL_SUBJECT_IDS);
    expect(new Set(GATE_2027_SUBJECTS.map((subject) => subject.id))).toHaveLength(12);
    expect(GATE_2027_SUBJECTS.every((subject) => subject.officialCurrent.length > 0)).toBe(true);
  });

  it('exposes current leaves and non-current scope metadata separately', () => {
    expect(GATE_2027_OFFICIAL_TOPIC_LEAVES.length).toBeGreaterThan(60);
    expect(
      gate2027Subject('operating-systems').officialCurrent.find((topic) => topic.id === 'ipc')
    ).toMatchObject({ bankCoverage: 'missing' });
    expect(gate2027Subject('computer-networks').historical).toContainEqual(
      expect.objectContaining({ id: 'network-security' })
    );
    expect(gate2027Subject('coa').supporting).toContainEqual(
      expect.objectContaining({ id: 'secondary-storage' })
    );
  });

  it('contains only official IIT Madras source URLs', () => {
    for (const source of Object.values(GATE_2027.sources)) {
      expect(new URL(source).hostname).toBe('gate2027.iitm.ac.in');
    }
  });

  it('drives the tracker from only the 69 official leaves', () => {
    const trackerLeaves = GATE_2027_SUBJECTS.flatMap((subject) =>
      official2027TopicsFor(subject.label)
    );
    expect(trackerLeaves).toHaveLength(69);
    expect(trackerLeaves.map((topic) => `${topic.subjectId}/${topic.id}`)).toEqual(
      GATE_2027_OFFICIAL_TOPIC_LEAVES.map((topic) => `${topic.subjectId}/${topic.id}`)
    );

    const networkLeaves = official2027TopicsFor('Computer Network').map((topic) => topic.value);
    expect(networkLeaves).not.toEqual(
      expect.arrayContaining(['Physical-layer detail', 'Network security'])
    );
    expect(subtopicsFor('Computer Network').map((topic) => topic.value)).toEqual(
      expect.arrayContaining(['Physical Layer & Encoding', 'Security — Symmetric & Public-Key'])
    );
  });

  it('keeps review-required bank rows out of automatic official evidence', () => {
    const searchSortHash = official2027TopicsFor('Algorithms').find(
      (topic) => topic.id === 'search-sort-hash'
    );
    expect(searchSortHash?.bankTopicKeys).toContain('data-structure/hashing');
    expect(gate2027BankTopicStatus('data-structure/hashing')).toBe('reviewRequired');
    expect(searchSortHash?.evidenceBankTopicKeys).not.toContain('data-structure/hashing');
    expect(searchSortHash?.evidenceAliases).toContainEqual({
      subject: 'Programming & DS',
      topic: 'Hash Tables'
    });
  });

  it('keeps every broad or multi-leaf bank mapping diagnostic-only', () => {
    const leaves = GATE_2027_SUBJECTS.flatMap((subject) =>
      official2027TopicsFor(subject.label).map((topic) => ({
        owner: `${subject.id}/${topic.id}`,
        topic
      }))
    );
    const ownersByBankKey = new Map<string, Set<string>>();
    for (const { owner, topic } of leaves) {
      for (const key of topic.bankTopicKeys) {
        const owners = ownersByBankKey.get(key) ?? new Set<string>();
        owners.add(owner);
        ownersByBankKey.set(key, owners);
      }
    }

    const multiLeafKeys = [...ownersByBankKey]
      .filter(([, owners]) => owners.size > 1)
      .map(([key]) => key);
    expect(multiLeafKeys).toHaveLength(10);
    expect(multiLeafKeys).toContain('general-aptitude/general-aptitude');
    expect(multiLeafKeys.filter((key) => key !== 'general-aptitude/general-aptitude')).toHaveLength(
      9
    );

    for (const { topic } of leaves) {
      if (topic.bankCoverage !== 'explicit') expect(topic.evidenceBankTopicKeys).toEqual([]);
      for (const key of topic.evidenceBankTopicKeys) {
        expect(gate2027BankTopicStatus(key)).toBe('current');
        expect(ownersByBankKey.get(key)?.size).toBe(1);
        expect(multiLeafKeys).not.toContain(key);
      }
    }
  });

  it('retains exact legacy completion spellings without assigning shared aliases', () => {
    const leaves = GATE_2027_SUBJECTS.flatMap((subject) => official2027TopicsFor(subject.label));
    const erModel = official2027TopicsFor('Databases').find((topic) => topic.id === 'er-model');
    expect(erModel?.completionAliases).toEqual(
      expect.arrayContaining([
        { subject: 'Databases', topic: 'ER model' },
        { subject: 'Databases', topic: 'ER Model' }
      ])
    );

    const normalizedOwners = new Map<string, Set<string>>();
    for (const topic of leaves) {
      for (const alias of topic.completionAliases) {
        const key = `${alias.subject.toLocaleLowerCase()}::${alias.topic
          .toLocaleLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()}`;
        const owners = normalizedOwners.get(key) ?? new Set<string>();
        owners.add(`${topic.subjectId}/${topic.id}`);
        normalizedOwners.set(key, owners);
      }
    }
    expect([...normalizedOwners.values()].every((owners) => owners.size === 1)).toBe(true);
    expect(normalizedOwners.has('general aptitude::general aptitude')).toBe(false);
    expect(normalizedOwners.has('databases::file system')).toBe(false);
  });

  it('normalizes subject aliases for the retained detailed tagging vocabulary', () => {
    expect(subtopicsFor('DBMS')).toEqual(subtopicsFor('Databases'));
    expect(subtopicsFor('C Programming')).toEqual(subtopicsFor('Programming & DS'));
  });
});
