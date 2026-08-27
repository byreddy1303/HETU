export const PYQ_BENCHMARK_QUESTION_COUNT = 65;
export const PYQ_BENCHMARK_MAX_MARKS = 100;

const ELIGIBLE_QUESTION_TYPES = new Set(['MCQ', 'MSQ', 'NAT']);
const GATE_CSE_PAPER_LABEL = /^GATE CSE (?<year>\d{4})(?: Set (?<set>\d+))?$/i;

/** The compact, answer-free paper catalog stored in the public PYQ manifest. */
export interface PyqBenchmarkPaperManifest {
  id: string;
  bookSlug: 'gate-cse';
  paperLabel: string;
  year: number;
  set: number | null;
  questionCount: number;
  maxMarks: number;
  /** Official exam order: General Aptitude first, then the technical section. */
  questionUids: string[];
}

/** Fields added to the normalized PYQ manifest by the benchmark catalog. */
export interface PyqBenchmarkManifestFields {
  benchmarkPapers: PyqBenchmarkPaperManifest[];
  /** Mark-inference policy used when the catalog was built. */
  gatePaperPatternMarkPolicyVersion?: string;
}

/** Structural input keeps catalog derivation independent of app/database row types. */
export interface PyqBenchmarkQuestionInput {
  id: string;
  bookSlug?: string;
  paperLabel: string;
  year: number;
  set: number | null;
  number: string;
  subjectSlug: string;
  marks: 1 | 2 | null;
  type: string;
  answerStatus: string;
}

export interface PyqBenchmarkAttemptInput {
  question_uid: string;
}

export type PyqBenchmarkFreshness = 'unseen' | 'partially_seen' | 'repeated';

export interface PyqBenchmarkExposure {
  /** Number of distinct questions in this paper with at least one prior receipt. */
  priorExposureCount: number;
  freshness: PyqBenchmarkFreshness;
  /** A sealed benchmark is eligible for an honest unseen-paper attempt. */
  sealed: boolean;
}

export interface PyqBenchmarkPaper extends PyqBenchmarkPaperManifest, PyqBenchmarkExposure {}

interface PaperIdentity {
  paperLabel: string;
  year: number;
  set: number | null;
}

function normalizedPaperIdentity(question: PyqBenchmarkQuestionInput): PaperIdentity | null {
  const paperLabel = question.paperLabel.replace(/\s+/g, ' ').trim();
  const match = paperLabel.match(GATE_CSE_PAPER_LABEL);
  if (!match?.groups) return null;

  const year = Number(match.groups.year);
  const set = match.groups.set == null ? null : Number(match.groups.set);
  const inferredBookSlug = question.bookSlug?.trim() || 'gate-cse';

  if (
    inferredBookSlug !== 'gate-cse' ||
    !Number.isInteger(question.year) ||
    question.year !== year ||
    question.set !== set
  ) {
    return null;
  }

  return { paperLabel, year, set };
}

function paperKey(identity: PaperIdentity): string {
  return `${identity.year}\u0000${identity.set ?? ''}\u0000${identity.paperLabel}`;
}

function benchmarkPaperId(identity: PaperIdentity): string {
  return identity.paperLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function numericQuestionNumber(number: string): number {
  const match = number.trim().match(/^(?:GA[-_\s]*)?(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isGeneralAptitude(question: PyqBenchmarkQuestionInput): boolean {
  return (
    question.subjectSlug.trim().toLowerCase() === 'general-aptitude' ||
    /^GA[-_\s]*\d+/i.test(question.number.trim())
  );
}

function compareBenchmarkQuestions(
  left: PyqBenchmarkQuestionInput,
  right: PyqBenchmarkQuestionInput
): number {
  const sectionOrder = Number(isGeneralAptitude(right)) - Number(isGeneralAptitude(left));
  return (
    sectionOrder ||
    numericQuestionNumber(left.number) - numericQuestionNumber(right.number) ||
    left.number.localeCompare(right.number, undefined, { numeric: true }) ||
    left.id.localeCompare(right.id)
  );
}

function isCompleteBenchmarkPaper(questions: readonly PyqBenchmarkQuestionInput[]): boolean {
  return (
    questions.length === PYQ_BENCHMARK_QUESTION_COUNT &&
    questions.every((question) => question.marks === 1 || question.marks === 2) &&
    questions.reduce((sum, question) => sum + (question.marks ?? 0), 0) ===
      PYQ_BENCHMARK_MAX_MARKS &&
    questions.every((question) => ELIGIBLE_QUESTION_TYPES.has(question.type)) &&
    questions.every((question) => question.answerStatus === 'available')
  );
}

/**
 * Derive only intact, fully scorable GATE CSE papers. The function intentionally
 * admits no partial paper and emits no answer/key material into the manifest.
 */
export function derivePyqBenchmarkPaperManifests(
  questions: readonly PyqBenchmarkQuestionInput[]
): PyqBenchmarkPaperManifest[] {
  const groups = new Map<
    string,
    { identity: PaperIdentity; questionsByUid: Map<string, PyqBenchmarkQuestionInput> }
  >();

  for (const question of questions) {
    const identity = normalizedPaperIdentity(question);
    if (!identity || !question.id.trim()) continue;

    const key = paperKey(identity);
    let group = groups.get(key);
    if (!group) {
      group = { identity, questionsByUid: new Map() };
      groups.set(key, group);
    }
    group.questionsByUid.set(question.id, question);
  }

  return [...groups.values()]
    .flatMap(({ identity, questionsByUid }) => {
      const paperQuestions = [...questionsByUid.values()];
      if (!isCompleteBenchmarkPaper(paperQuestions)) return [];

      return [
        {
          id: benchmarkPaperId(identity),
          bookSlug: 'gate-cse' as const,
          paperLabel: identity.paperLabel,
          year: identity.year,
          set: identity.set,
          questionCount: PYQ_BENCHMARK_QUESTION_COUNT,
          maxMarks: PYQ_BENCHMARK_MAX_MARKS,
          questionUids: paperQuestions
            .sort(compareBenchmarkQuestions)
            .map((question) => question.id)
        }
      ];
    })
    .sort(
      (left, right) =>
        right.year - left.year ||
        (left.set ?? 0) - (right.set ?? 0) ||
        left.paperLabel.localeCompare(right.paperLabel)
    );
}

export function pyqBenchmarkPaperExposure(
  paper: Pick<PyqBenchmarkPaperManifest, 'questionUids' | 'questionCount'>,
  attempts: readonly PyqBenchmarkAttemptInput[]
): PyqBenchmarkExposure {
  const paperQuestionUids = new Set(paper.questionUids);
  const exposedQuestionUids = new Set(
    attempts
      .map((attempt) => attempt.question_uid)
      .filter((questionUid) => paperQuestionUids.has(questionUid))
  );
  const priorExposureCount = exposedQuestionUids.size;

  return {
    priorExposureCount,
    freshness:
      priorExposureCount === 0
        ? 'unseen'
        : priorExposureCount >= paper.questionCount
          ? 'repeated'
          : 'partially_seen',
    sealed: priorExposureCount === 0
  };
}

/** Derive the catalog and annotate each paper with user-specific exposure. */
export function derivePyqBenchmarkPapers(
  questions: readonly PyqBenchmarkQuestionInput[],
  attempts: readonly PyqBenchmarkAttemptInput[] = []
): PyqBenchmarkPaper[] {
  return derivePyqBenchmarkPaperManifests(questions).map((paper) => ({
    ...paper,
    ...pyqBenchmarkPaperExposure(paper, attempts)
  }));
}
