/**
 * Stable subject identities shared by every HETU evidence and planning surface.
 *
 * Display labels can evolve, but the ids in this file are durable storage and
 * analytics keys. Aliases are accepted only at boundaries; new data should
 * always store both the canonical id and label. Unknown labels are deliberately
 * preserved so historical/imported evidence is never silently discarded.
 */

export const CANONICAL_SUBJECT_IDS = [
  'discrete-mathematics',
  'engineering-mathematics',
  'digital-logic',
  'coa',
  'programming-data-structures',
  'algorithms',
  'theory-of-computation',
  'compiler-design',
  'operating-systems',
  'databases',
  'computer-networks',
  'general-aptitude'
] as const;

export type SubjectId = (typeof CANONICAL_SUBJECT_IDS)[number];

export const CANONICAL_SUBJECT_LABELS = [
  'Discrete Mathematics',
  'Engineering Mathematics',
  'Digital Logic',
  'COA',
  'Programming & DS',
  'Algorithms',
  'Theory of Computation',
  'Compiler Design',
  'Operating Systems',
  'Databases',
  'Computer Networks',
  'General Aptitude'
] as const;

export type CanonicalSubjectLabel = (typeof CANONICAL_SUBJECT_LABELS)[number];

export interface SubjectDefinition {
  id: SubjectId;
  label: CanonicalSubjectLabel;
  /** Historical labels, common abbreviations, and retired PYQ slugs. */
  aliases: readonly string[];
}

export const SUBJECT_DEFINITIONS = [
  {
    id: 'discrete-mathematics',
    label: 'Discrete Mathematics',
    aliases: ['Discrete Math', 'DM']
  },
  {
    id: 'engineering-mathematics',
    label: 'Engineering Mathematics',
    aliases: [
      'Engineering Math',
      'Engineering Maths',
      'Linear Algebra',
      'Probability & Statistics',
      'Probability and Statistics'
    ]
  },
  {
    id: 'digital-logic',
    label: 'Digital Logic',
    aliases: ['Digital Electronics', 'DL']
  },
  {
    id: 'coa',
    label: 'COA',
    aliases: [
      'Computer Organization',
      'Computer Organisation',
      'Computer Organization and Architecture',
      'Computer Organisation and Architecture',
      'Computer Organization & Architecture',
      'Computer Architecture'
    ]
  },
  {
    id: 'programming-data-structures',
    label: 'Programming & DS',
    aliases: [
      'Programming and DS',
      'Programming and Data Structures',
      'Programming & Data Structures',
      'Programming Data Structures',
      'C Programming',
      'C Programming + Data Structure',
      'C Programming and Data Structure',
      'Data Structure',
      'Data Structures',
      'c-programming',
      'data-structure'
    ]
  },
  {
    id: 'algorithms',
    label: 'Algorithms',
    aliases: ['Algorithm', 'Algo']
  },
  {
    id: 'theory-of-computation',
    label: 'Theory of Computation',
    aliases: ['Theory Of Computation', 'TOC', 'Automata Theory']
  },
  {
    id: 'compiler-design',
    label: 'Compiler Design',
    aliases: ['Compilers', 'Compiler', 'CD']
  },
  {
    id: 'operating-systems',
    label: 'Operating Systems',
    aliases: ['Operating System', 'OS']
  },
  {
    id: 'databases',
    label: 'Databases',
    aliases: ['Database', 'Database Management System', 'Database Management Systems', 'DBMS']
  },
  {
    id: 'computer-networks',
    label: 'Computer Networks',
    aliases: ['Computer Network', 'Networking', 'CN']
  },
  {
    id: 'general-aptitude',
    label: 'General Aptitude',
    aliases: ['Aptitude', 'Aptitude & Reasoning', 'Aptitude and Reasoning', 'GA']
  }
] as const satisfies readonly SubjectDefinition[];

const SUBJECT_BY_ID = new Map<SubjectId, SubjectDefinition>(
  SUBJECT_DEFINITIONS.map((subject) => [subject.id, subject])
);

function lookupKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/&|\+/g, ' and ')
    .replace(/[_/.-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const SUBJECT_BY_ALIAS = new Map<string, SubjectDefinition>();
for (const subject of SUBJECT_DEFINITIONS) {
  for (const alias of [subject.id, subject.label, ...subject.aliases]) {
    const key = lookupKey(alias);
    const existing = SUBJECT_BY_ALIAS.get(key);
    if (existing && existing.id !== subject.id) {
      throw new Error(`Subject alias ${alias} maps to both ${existing.id} and ${subject.id}.`);
    }
    SUBJECT_BY_ALIAS.set(key, subject);
  }
}

export function isSubjectId(value: unknown): value is SubjectId {
  return typeof value === 'string' && SUBJECT_BY_ID.has(value as SubjectId);
}

export function subjectById(value: SubjectId): SubjectDefinition {
  return SUBJECT_BY_ID.get(value)!;
}

export function subjectDefinition(value: unknown): SubjectDefinition | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SUBJECT_BY_ALIAS.get(lookupKey(trimmed)) ?? null;
}

/** Return a stable id for a known label/alias/slug; unknowns remain unclassified. */
export function canonicalSubjectId(value: unknown): SubjectId | null {
  return subjectDefinition(value)?.id ?? null;
}

/**
 * Canonicalize known values while preserving an unknown historical/custom
 * label verbatim apart from surrounding whitespace.
 */
export function canonicalSubjectLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return subjectDefinition(trimmed)?.label ?? trimmed;
}

export interface SubjectIdentity {
  id: SubjectId | null;
  label: string;
}

/**
 * Resolve a stored pair. A recognizable label wins over a stale id; an id is
 * used only when the label is blank. This prevents a corrupt id from replacing
 * meaningful imported text.
 */
export function normalizeSubjectIdentity(label: unknown, storedId?: unknown): SubjectIdentity {
  const canonical = subjectDefinition(label);
  if (canonical) return { id: canonical.id, label: canonical.label };

  const preserved = canonicalSubjectLabel(label);
  if (preserved) return { id: null, label: preserved };

  if (isSubjectId(storedId)) {
    const fromId = subjectById(storedId);
    return { id: fromId.id, label: fromId.label };
  }

  return { id: null, label: '' };
}
