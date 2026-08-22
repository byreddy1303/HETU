import { describe, expect, it } from 'vitest';
import { CANONICAL_SUBJECT_IDS } from '@/lib/subjects';
import {
  GATE_2027,
  GATE_2027_BLUEPRINT,
  GATE_2027_OFFICIAL_TOPIC_LEAVES,
  GATE_2027_SUBJECTS,
  gate2027Subject
} from '@/lib/gate-2027';

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
});
