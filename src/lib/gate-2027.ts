import registryJson from '@/data/gate-2027.json';
import {
  CANONICAL_SUBJECT_IDS,
  SUBJECT_DEFINITIONS,
  type SubjectDefinition,
  type SubjectId
} from '@/lib/subjects';

export type Gate2027Coverage = 'explicit' | 'broad' | 'missing' | 'review-required';
export type Gate2027TaxonomyStatus = 'current' | 'supporting' | 'historical' | 'reviewRequired';

export interface Gate2027OfficialTopicLeaf {
  id: string;
  label: string;
  bankCoverage: Gate2027Coverage;
  /** Existing-bank keys use the stable `<bank-subject-slug>/<topic-slug>` form. */
  bankTopicKeys: string[];
}

export interface Gate2027NonCurrentTopic {
  id: string;
  label: string;
  bankTopicKeys: string[];
  reason: string;
}

export interface Gate2027SubjectScope {
  subjectId: SubjectId;
  officialCurrent: Gate2027OfficialTopicLeaf[];
  supporting: Gate2027NonCurrentTopic[];
  historical: Gate2027NonCurrentTopic[];
}

export interface Gate2027BankTaxonomyScope {
  bankSubjectSlug: string;
  canonicalSubjectId: SubjectId | null;
  current: string[];
  supporting: string[];
  historical: string[];
  reviewRequired: string[];
}

export interface Gate2027Blueprint {
  durationMinutes: 180;
  questionCount: 65;
  totalMarks: 100;
  sectionMarks: {
    generalAptitude: 15;
    engineeringMathematics: 13;
    coreSubject: 72;
  };
  questionMarks: [1, 2];
  questionTypes: ['MCQ', 'MSQ', 'NAT'];
  scoring: {
    mcqWrongPenalty: 'one-third-of-question-marks';
    msqWrongPenaltyMarks: 0;
    natWrongPenaltyMarks: 0;
    msqPartialCredit: false;
  };
}

export interface Gate2027OfficialSources {
  pattern: string;
  syllabusIndex: string;
  computerScienceSyllabus: string;
  generalAptitudeSyllabus: string;
}

interface Gate2027RegistryData {
  version: string;
  retrievedOn: string;
  paperCode: 'CS';
  sources: Gate2027OfficialSources;
  blueprint: Gate2027Blueprint;
  subjectScopes: Gate2027SubjectScope[];
  bankTaxonomy: Gate2027BankTaxonomyScope[];
  auditPolicy: Record<string, string>;
}

export interface Gate2027Subject extends SubjectDefinition, Gate2027SubjectScope {}

const registry = registryJson as unknown as Gate2027RegistryData;

function validateRegistry(): void {
  const expected = new Set<SubjectId>(CANONICAL_SUBJECT_IDS);
  const seen = new Set<SubjectId>();
  for (const scope of registry.subjectScopes) {
    if (!expected.has(scope.subjectId)) {
      throw new Error(`Unknown GATE 2027 registry subject: ${scope.subjectId}`);
    }
    if (seen.has(scope.subjectId)) {
      throw new Error(`Duplicate GATE 2027 registry subject: ${scope.subjectId}`);
    }
    seen.add(scope.subjectId);

    const leafIds = new Set<string>();
    for (const leaf of scope.officialCurrent) {
      if (!leaf.id || leafIds.has(leaf.id)) {
        throw new Error(`Duplicate/blank official topic in ${scope.subjectId}: ${leaf.id}`);
      }
      leafIds.add(leaf.id);
    }
  }

  const missing = CANONICAL_SUBJECT_IDS.filter((subjectId) => !seen.has(subjectId));
  if (missing.length > 0) {
    throw new Error(`GATE 2027 registry is missing subjects: ${missing.join(', ')}`);
  }

  const sectionTotal = Object.values(registry.blueprint.sectionMarks).reduce(
    (sum, marks) => sum + marks,
    0
  );
  if (sectionTotal !== registry.blueprint.totalMarks) {
    throw new Error(
      `GATE 2027 blueprint sections total ${sectionTotal}, not ${registry.blueprint.totalMarks}`
    );
  }
}

validateRegistry();

const scopeBySubject = new Map<SubjectId, Gate2027SubjectScope>(
  registry.subjectScopes.map((scope) => [scope.subjectId, scope])
);

export const GATE_2027_REGISTRY_VERSION = registry.version;
export const GATE_2027_RETRIEVED_ON = registry.retrievedOn;
export const GATE_2027_OFFICIAL_SOURCES = registry.sources;
export const GATE_2027_BLUEPRINT = registry.blueprint;
export const GATE_2027_BANK_TAXONOMY = registry.bankTaxonomy;
export const GATE_2027_AUDIT_POLICY = registry.auditPolicy;

export const GATE_2027_SUBJECTS: readonly Gate2027Subject[] = SUBJECT_DEFINITIONS.map((subject) => {
  const scope = scopeBySubject.get(subject.id);
  if (!scope) throw new Error(`Missing GATE 2027 scope for ${subject.id}`);
  return { ...subject, ...scope };
});

export const GATE_2027_OFFICIAL_TOPIC_LEAVES = GATE_2027_SUBJECTS.flatMap((subject) =>
  subject.officialCurrent.map((topic) => ({ ...topic, subjectId: subject.id }))
);

export function gate2027Subject(subjectId: SubjectId): Gate2027Subject {
  return GATE_2027_SUBJECTS.find((subject) => subject.id === subjectId)!;
}

/** Complete versioned registry for exports, diagnostics, and readiness UI copy. */
export const GATE_2027 = {
  version: GATE_2027_REGISTRY_VERSION,
  retrievedOn: GATE_2027_RETRIEVED_ON,
  paperCode: registry.paperCode,
  sources: GATE_2027_OFFICIAL_SOURCES,
  blueprint: GATE_2027_BLUEPRINT,
  subjects: GATE_2027_SUBJECTS,
  bankTaxonomy: GATE_2027_BANK_TAXONOMY,
  auditPolicy: GATE_2027_AUDIT_POLICY
} as const;
