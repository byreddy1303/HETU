import {
  GATE_2027_SUBJECTS,
  gate2027BankTopicStatus,
  type Gate2027Coverage
} from '@/lib/gate-2027';
import { canonicalSubjectLabel, type CanonicalSubjectLabel, type SubjectId } from '@/lib/subjects';

// Detailed evidence tags used by Journal and quick tagging. This vocabulary
// intentionally retains useful supporting/historical concepts; it is not the
// authoritative list of official GATE 2027 leaves. The official tracker list
// is derived separately from the versioned registry below.

export interface SubtopicSpec {
  value: string;
  /** Related subjects this subtopic often crosses into. */
  relatedSubjects?: string[];
}

export interface TopicEvidenceAlias {
  subject: string;
  topic: string;
}

export interface Official2027TopicSpec {
  id: string;
  value: string;
  subjectId: SubjectId;
  subject: CanonicalSubjectLabel;
  bankCoverage: Gate2027Coverage;
  /** Every audited bank mapping, including rows still awaiting review. */
  bankTopicKeys: readonly string[];
  /** Only current-scope keys may feed learner evidence automatically. */
  evidenceBankTopicKeys: readonly string[];
  /** Canonical label plus uniquely-owned bank/legacy labels for attempt evidence. */
  evidenceAliases: readonly TopicEvidenceAlias[];
  /** Exact historical spellings which may read or clear this leaf's completion. */
  completionAliases: readonly TopicEvidenceAlias[];
}

/**
 * Base evidence tags per subject. Order is roughly a useful study path; the
 * list is deliberately broader and more granular than the official syllabus.
 */
export const SUBTOPICS_BY_SUBJECT: Record<string, SubtopicSpec[]> = {
  'Discrete Mathematics': [
    { value: 'Propositional Logic' },
    { value: 'First-Order Logic', relatedSubjects: ['Theory of Computation'] },
    { value: 'Sets' },
    { value: 'Relations' },
    { value: 'Functions' },
    { value: 'Partial Orders & Lattices' },
    { value: 'Combinatorics — Counting' },
    { value: 'Combinatorics — Recurrences' },
    { value: 'Combinatorics — Pigeonhole' },
    { value: 'Combinatorics — Generating Functions' },
    { value: 'Graph Theory — Basic' },
    { value: 'Graph Theory — Trees' },
    { value: 'Graph Theory — Coloring & Matching' },
    { value: 'Groups' },
    { value: 'Rings & Fields' }
  ],
  'Engineering Mathematics': [
    { value: 'Linear Algebra — Matrices' },
    { value: 'Linear Algebra — Eigenvalues & Eigenvectors' },
    { value: 'Linear Algebra — Vector Spaces' },
    { value: 'Linear Algebra — LU / QR / SVD' },
    { value: 'Calculus — Limits & Continuity' },
    { value: 'Calculus — Differentiation' },
    { value: 'Calculus — Integration' },
    { value: 'Calculus — Series & Convergence' },
    { value: 'Calculus — Multivariable' },
    { value: 'Probability — Basics' },
    { value: 'Probability — Discrete Distributions' },
    { value: 'Probability — Continuous Distributions' },
    { value: 'Probability — Bayes' },
    { value: 'Probability — Expectation & Variance' },
    { value: 'Statistics — Descriptive' },
    { value: 'Statistics — Estimation & Hypothesis' }
  ],
  'Digital Logic': [
    { value: 'Number Systems' },
    { value: 'Boolean Algebra' },
    { value: 'K-Maps & Minimization' },
    { value: 'Combinational — Adders' },
    { value: 'Combinational — Multiplexers' },
    { value: 'Combinational — Decoders' },
    { value: 'Combinational — Encoders' },
    { value: 'Combinational — Comparators' },
    { value: 'Sequential — Latches' },
    { value: 'Sequential — Flip-Flops' },
    { value: 'Sequential — Registers' },
    { value: 'Sequential — Counters' },
    { value: 'FSMs — Mealy & Moore' },
    { value: 'Timing & Hazards' },
    { value: 'Memory — SRAM/DRAM/ROM' }
  ],
  COA: [
    { value: 'Number Representation & IEEE-754' },
    { value: 'Floating Point Arithmetic' },
    { value: 'Instruction Formats' },
    { value: 'Addressing Modes' },
    { value: 'Datapath & Control Unit' },
    { value: 'Pipelining — Basics' },
    { value: 'Pipelining — Hazards & Forwarding' },
    { value: 'Cache — Direct/Set-Associative/Fully Associative' },
    { value: 'Cache — Replacement Policies (LRU/FIFO/Optimal)' },
    { value: 'Cache — Write Policies' },
    { value: 'Memory Hierarchy' },
    { value: 'Virtual Memory & TLB', relatedSubjects: ['Operating Systems'] },
    { value: 'I/O — DMA & Interrupts' },
    { value: 'Peripheral Interfacing' }
  ],
  'Programming & DS': [
    { value: 'C — Pointers' },
    { value: 'C — Arrays & Strings' },
    { value: 'C — Structures & Unions' },
    { value: 'Recursion & Recursion Tree' },
    { value: 'Arrays' },
    { value: 'Linked Lists' },
    { value: 'Stacks' },
    { value: 'Queues & Deques' },
    { value: 'Hash Tables' },
    { value: 'Trees — BST' },
    { value: 'Trees — AVL / Red-Black' },
    { value: 'Trees — B / B+ Trees', relatedSubjects: ['Databases'] },
    { value: 'Heaps & Priority Queues' },
    { value: 'Graphs — Representations' },
    { value: 'Graphs — Traversal (BFS/DFS)' }
  ],
  Algorithms: [
    { value: 'Asymptotic Analysis' },
    { value: 'Recurrences & Master Theorem' },
    { value: 'Sorting — Comparison-Based' },
    { value: 'Sorting — Linear-Time' },
    { value: 'Searching — Binary Search Patterns' },
    { value: 'Divide & Conquer' },
    { value: 'Greedy — Interval / Scheduling' },
    { value: 'Greedy — Huffman / MST' },
    { value: 'Dynamic Programming — 1D' },
    { value: 'Dynamic Programming — 2D & Grids' },
    { value: 'Dynamic Programming — Interval / Tree' },
    { value: 'Graphs — Shortest Path' },
    { value: 'Graphs — MST (Prim / Kruskal)' },
    { value: 'Graphs — Topological Sort & DAGs' },
    { value: 'Graphs — SCC / Articulation / Bridges' },
    { value: 'Complexity Classes — P / NP / NPC' }
  ],
  'Theory of Computation': [
    { value: 'Alphabets & Languages' },
    { value: 'Regular Expressions' },
    { value: 'DFA / NFA' },
    { value: 'DFA Minimization' },
    { value: 'Closure Properties — Regular' },
    { value: 'Pumping Lemma — Regular' },
    { value: 'Context-Free Grammars' },
    { value: 'PDA — Deterministic / Non-Deterministic' },
    { value: 'Closure Properties — CFL' },
    { value: 'Pumping Lemma — CFL' },
    { value: 'Turing Machines' },
    { value: 'Decidability & Semi-Decidability' },
    { value: 'Reducibility' },
    { value: "Rice's Theorem" },
    { value: 'Ambiguity & Parsing', relatedSubjects: ['Compiler Design'] }
  ],
  'Compiler Design': [
    { value: 'Lexical Analysis' },
    { value: 'Regular Expressions → DFA', relatedSubjects: ['Theory of Computation'] },
    { value: 'Top-Down Parsing (LL)' },
    { value: 'Bottom-Up Parsing (LR / SLR / LALR / CLR)' },
    { value: 'Ambiguity & Grammar Transformation' },
    { value: 'Syntax Directed Translation' },
    { value: 'Intermediate Code Generation' },
    { value: 'Symbol Table' },
    { value: 'Runtime Environment & Activation Records' },
    { value: 'Code Optimization — Local' },
    { value: 'Code Optimization — Loop' },
    { value: 'Code Generation & Register Allocation' }
  ],
  'Operating Systems': [
    { value: 'Processes & PCB' },
    { value: 'Threads & Concurrency' },
    { value: 'CPU Scheduling — FCFS / SJF / RR / MLFQ' },
    { value: 'Synchronization — Semaphores' },
    { value: 'Synchronization — Monitors & Condition Variables' },
    { value: 'Classical Problems (Producer/Reader/Philosophers)' },
    { value: 'Deadlocks — Detection' },
    { value: 'Deadlocks — Avoidance (Banker)' },
    { value: 'Memory — Contiguous Allocation' },
    { value: 'Memory — Paging' },
    { value: 'Memory — Segmentation' },
    { value: 'Virtual Memory & Page Replacement' },
    { value: 'File Systems & Allocation' },
    { value: 'Disk Scheduling' },
    { value: 'I/O Systems' }
  ],
  Databases: [
    { value: 'ER Model' },
    { value: 'Relational Model' },
    { value: 'Relational Algebra' },
    { value: 'Tuple / Domain Calculus' },
    { value: 'SQL — DDL / DML' },
    { value: 'SQL — Joins & Subqueries' },
    { value: 'SQL — Aggregation & GROUP BY' },
    { value: 'Functional Dependencies' },
    { value: 'Normalization — 1NF/2NF/3NF' },
    { value: 'Normalization — BCNF / 4NF' },
    { value: 'Transactions — ACID' },
    { value: 'Concurrency Control — 2PL' },
    { value: 'Concurrency Control — Timestamp / MVCC' },
    { value: 'Recovery — Logging & Checkpoints' },
    { value: 'Indexing — B+ Trees', relatedSubjects: ['Programming & DS'] },
    { value: 'Indexing — Hashing' }
  ],
  'Computer Networks': [
    { value: 'OSI vs TCP/IP Layering' },
    { value: 'Physical Layer & Encoding' },
    { value: 'Data Link — Framing & Error Detection' },
    { value: 'Data Link — Sliding Window (GBN/SR)' },
    { value: 'MAC — CSMA/CD & CSMA/CA' },
    { value: 'Ethernet & Switching' },
    { value: 'Network Layer — IPv4 Addressing & Subnetting' },
    { value: 'Network Layer — CIDR & VLSM' },
    { value: 'Network Layer — Routing (Distance-Vector / Link-State)' },
    { value: 'Transport Layer — UDP' },
    { value: 'Transport Layer — TCP Connection & Flow' },
    { value: 'Transport Layer — TCP Congestion Control' },
    { value: 'Application — DNS' },
    { value: 'Application — HTTP' },
    { value: 'Application — SMTP / POP3 / IMAP' },
    { value: 'Security — Symmetric & Public-Key' },
    { value: 'Security — Digital Signatures & Certificates' }
  ],
  'General Aptitude': [
    { value: 'Verbal — Vocabulary & Analogies' },
    { value: 'Verbal — Reading Comprehension' },
    { value: 'Verbal — Grammar & Sentence Correction' },
    { value: 'Quant — Numerical Computation' },
    { value: 'Quant — Ratios / Percentages / Averages' },
    { value: 'Quant — Time-Speed-Distance / Work' },
    { value: 'Quant — Mensuration & Geometry' },
    { value: 'Data Interpretation — Tables' },
    { value: 'Data Interpretation — Charts & Graphs' },
    { value: 'Logical Reasoning — Sequences & Puzzles' },
    { value: 'Logical Reasoning — Analytical' },
    { value: 'Spatial Reasoning' }
  ]
};

function aliases(subject: string, ...topics: string[]): TopicEvidenceAlias[] {
  return topics.map((topic) => ({ subject, topic }));
}

/**
 * Old tracker labels that are safely attributable to one current official
 * leaf. Ambiguous/supporting labels are intentionally absent so they remain
 * readable history without inflating official coverage.
 */
const LEGACY_CURRENT_TOPIC_ALIASES: Readonly<Record<string, readonly TopicEvidenceAlias[]>> = {
  'discrete-mathematics/logic': aliases(
    'Discrete Mathematics',
    'Propositional Logic',
    'First-Order Logic'
  ),
  'discrete-mathematics/sets-relations-functions': aliases(
    'Discrete Mathematics',
    'Sets',
    'Relations',
    'Functions'
  ),
  'discrete-mathematics/partial-orders-lattices': aliases(
    'Discrete Mathematics',
    'Partial Orders & Lattices'
  ),
  'discrete-mathematics/monoids-groups': aliases('Discrete Mathematics', 'Groups'),
  'discrete-mathematics/graphs': aliases(
    'Discrete Mathematics',
    'Graph Theory — Basic',
    'Graph Theory — Trees',
    'Graph Theory — Coloring & Matching'
  ),
  'discrete-mathematics/combinatorics': aliases(
    'Discrete Mathematics',
    'Combinatorics — Counting',
    'Combinatorics — Recurrences',
    'Combinatorics — Pigeonhole',
    'Combinatorics — Generating Functions'
  ),
  'engineering-mathematics/linear-algebra': aliases(
    'Engineering Mathematics',
    'Linear Algebra — Matrices',
    'Linear Algebra — Eigenvalues & Eigenvectors'
  ),
  'engineering-mathematics/calculus': aliases(
    'Engineering Mathematics',
    'Calculus — Limits & Continuity',
    'Calculus — Differentiation',
    'Calculus — Integration'
  ),
  'engineering-mathematics/probability-distributions': aliases(
    'Engineering Mathematics',
    'Probability — Basics',
    'Probability — Discrete Distributions',
    'Probability — Continuous Distributions'
  ),
  'engineering-mathematics/statistics-and-bayes': aliases(
    'Engineering Mathematics',
    'Probability — Bayes',
    'Statistics — Descriptive'
  ),
  'digital-logic/boolean-minimization': aliases(
    'Digital Logic',
    'Boolean Algebra',
    'K-Maps & Minimization'
  ),
  'digital-logic/combinational-sequential': aliases(
    'Digital Logic',
    'Combinational — Adders',
    'Combinational — Multiplexers',
    'Combinational — Decoders',
    'Combinational — Encoders',
    'Combinational — Comparators',
    'Sequential — Latches',
    'Sequential — Flip-Flops',
    'Sequential — Registers',
    'Sequential — Counters',
    'FSMs — Mealy & Moore'
  ),
  'digital-logic/number-representation-arithmetic': aliases('Digital Logic', 'Number Systems'),
  'coa/instruction-set-addressing': aliases('COA', 'Instruction Formats', 'Addressing Modes'),
  'coa/control-unit': aliases('COA', 'Datapath & Control Unit'),
  'coa/memory': aliases(
    'COA',
    'Cache — Direct/Set-Associative/Fully Associative',
    'Cache — Replacement Policies (LRU/FIFO/Optimal)',
    'Cache — Write Policies',
    'Memory Hierarchy'
  ),
  'coa/io-interface': aliases('COA', 'I/O — DMA & Interrupts', 'Peripheral Interfacing'),
  'coa/pipelining': aliases('COA', 'Pipelining — Basics', 'Pipelining — Hazards & Forwarding'),
  'programming-data-structures/c-programming': aliases(
    'Programming & DS',
    'C — Pointers',
    'C — Arrays & Strings',
    'C — Structures & Unions'
  ),
  'programming-data-structures/recursion': aliases(
    'Programming & DS',
    'Recursion & Recursion Tree'
  ),
  'programming-data-structures/data-structures': aliases(
    'Programming & DS',
    'Arrays',
    'Linked Lists',
    'Stacks',
    'Queues & Deques',
    'Trees — BST',
    'Heaps & Priority Queues',
    'Graphs — Representations'
  ),
  'algorithms/search-sort-hash': [
    ...aliases(
      'Algorithms',
      'Sorting — Comparison-Based',
      'Sorting — Linear-Time',
      'Searching — Binary Search Patterns'
    ),
    ...aliases('Programming & DS', 'Hash Tables')
  ],
  'algorithms/complexity': aliases('Algorithms', 'Asymptotic Analysis'),
  'algorithms/design-techniques': aliases(
    'Algorithms',
    'Divide & Conquer',
    'Greedy — Interval / Scheduling',
    'Greedy — Huffman / MST',
    'Dynamic Programming — 1D',
    'Dynamic Programming — 2D & Grids',
    'Dynamic Programming — Interval / Tree'
  ),
  'algorithms/graph-algorithms': [
    ...aliases(
      'Algorithms',
      'Graphs — Shortest Path',
      'Graphs — MST (Prim / Kruskal)',
      'Graphs — Topological Sort & DAGs',
      'Graphs — SCC / Articulation / Bridges'
    ),
    ...aliases('Programming & DS', 'Graphs — Traversal (BFS/DFS)')
  ],
  'theory-of-computation/regular-expressions-automata': aliases(
    'Theory of Computation',
    'Regular Expressions',
    'DFA / NFA',
    'DFA Minimization'
  ),
  'theory-of-computation/cfg-pda': aliases(
    'Theory of Computation',
    'Context-Free Grammars',
    'PDA — Deterministic / Non-Deterministic'
  ),
  'theory-of-computation/language-classes': aliases(
    'Theory of Computation',
    'Alphabets & Languages',
    'Closure Properties — Regular',
    'Closure Properties — CFL'
  ),
  'theory-of-computation/pumping-lemma': aliases(
    'Theory of Computation',
    'Pumping Lemma — Regular',
    'Pumping Lemma — CFL'
  ),
  'theory-of-computation/turing-undecidability': aliases(
    'Theory of Computation',
    'Turing Machines',
    'Decidability & Semi-Decidability',
    'Reducibility',
    "Rice's Theorem"
  ),
  'compiler-design/lexical-analysis': aliases(
    'Compiler Design',
    'Lexical Analysis',
    'Regular Expressions → DFA'
  ),
  'compiler-design/parsing': aliases(
    'Compiler Design',
    'Top-Down Parsing (LL)',
    'Bottom-Up Parsing (LR / SLR / LALR / CLR)',
    'Ambiguity & Grammar Transformation'
  ),
  'compiler-design/syntax-directed-translation': aliases(
    'Compiler Design',
    'Syntax Directed Translation'
  ),
  'compiler-design/runtime-environments': aliases(
    'Compiler Design',
    'Runtime Environment & Activation Records'
  ),
  'compiler-design/intermediate-code': aliases('Compiler Design', 'Intermediate Code Generation'),
  'compiler-design/local-optimisation': aliases('Compiler Design', 'Code Optimization — Local'),
  'operating-systems/processes-threads': aliases(
    'Operating Systems',
    'Processes & PCB',
    'Threads & Concurrency'
  ),
  'operating-systems/concurrency-synchronization': aliases(
    'Operating Systems',
    'Synchronization — Semaphores',
    'Synchronization — Monitors & Condition Variables',
    'Classical Problems (Producer/Reader/Philosophers)'
  ),
  'operating-systems/deadlock': aliases(
    'Operating Systems',
    'Deadlocks — Detection',
    'Deadlocks — Avoidance (Banker)'
  ),
  'operating-systems/scheduling': aliases(
    'Operating Systems',
    'CPU Scheduling — FCFS / SJF / RR / MLFQ',
    'Disk Scheduling'
  ),
  'operating-systems/memory': aliases(
    'Operating Systems',
    'Memory — Contiguous Allocation',
    'Memory — Paging',
    'Memory — Segmentation',
    'Virtual Memory & Page Replacement'
  ),
  'operating-systems/file-systems': aliases('Operating Systems', 'File Systems & Allocation'),
  'databases/er-model': aliases('Databases', 'ER Model'),
  'databases/relational-model': aliases(
    'Databases',
    'Relational Model',
    'Relational Algebra',
    'Tuple / Domain Calculus',
    'SQL — DDL / DML',
    'SQL — Joins & Subqueries',
    'SQL — Aggregation & GROUP BY'
  ),
  'databases/integrity-normal-forms': aliases(
    'Databases',
    'Functional Dependencies',
    'Normalization — 1NF/2NF/3NF',
    'Normalization — BCNF / 4NF'
  ),
  'databases/indexing': aliases('Databases', 'Indexing — B+ Trees'),
  'databases/transactions-concurrency': aliases(
    'Databases',
    'Transactions — ACID',
    'Concurrency Control — 2PL'
  ),
  'computer-networks/layering': aliases('Computer Networks', 'OSI vs TCP/IP Layering'),
  'computer-networks/data-link': aliases(
    'Computer Networks',
    'Data Link — Framing & Error Detection',
    'Data Link — Sliding Window (GBN/SR)',
    'MAC — CSMA/CD & CSMA/CA',
    'Ethernet & Switching'
  ),
  'computer-networks/routing': aliases(
    'Computer Networks',
    'Network Layer — Routing (Distance-Vector / Link-State)'
  ),
  'computer-networks/ipv4': aliases(
    'Computer Networks',
    'Network Layer — IPv4 Addressing & Subnetting',
    'Network Layer — CIDR & VLSM'
  ),
  'computer-networks/tcp': aliases(
    'Computer Networks',
    'Transport Layer — TCP Connection & Flow',
    'Transport Layer — TCP Congestion Control'
  ),
  'computer-networks/dns-http': aliases(
    'Computer Networks',
    'Application — DNS',
    'Application — HTTP'
  ),
  'general-aptitude/reading-sequencing': aliases(
    'General Aptitude',
    'Verbal — Reading Comprehension'
  ),
  'general-aptitude/data-interpretation': aliases(
    'General Aptitude',
    'Data Interpretation — Tables',
    'Data Interpretation — Charts & Graphs'
  ),
  'general-aptitude/numerical-computation': aliases(
    'General Aptitude',
    'Quant — Numerical Computation',
    'Quant — Ratios / Percentages / Averages',
    'Quant — Time-Speed-Distance / Work'
  ),
  'general-aptitude/geometry-statistics': aliases(
    'General Aptitude',
    'Quant — Mensuration & Geometry'
  ),
  'general-aptitude/logic': aliases(
    'General Aptitude',
    'Logical Reasoning — Sequences & Puzzles',
    'Logical Reasoning — Analytical'
  ),
  'general-aptitude/spatial-patterns': aliases('General Aptitude', 'Spatial Reasoning')
};

function bankTopicAlias(bankTopicKey: string): TopicEvidenceAlias | null {
  const divider = bankTopicKey.indexOf('/');
  if (divider <= 0 || divider === bankTopicKey.length - 1) return null;
  return {
    subject: canonicalSubjectLabel(bankTopicKey.slice(0, divider)),
    topic: bankTopicKey.slice(divider + 1).replace(/-/g, ' ')
  };
}

function normalizedAliasKey(alias: TopicEvidenceAlias): string {
  return `${canonicalSubjectLabel(alias.subject).toLocaleLowerCase()}::${alias.topic
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')}`;
}

function exactAliasKey(alias: TopicEvidenceAlias): string {
  return `${canonicalSubjectLabel(alias.subject)}::${alias.topic.trim()}`;
}

/**
 * Keep exact historical spellings (for example `ER Model` and `ER model`).
 * Topic evidence comparison is normalized later, while topic-progress storage
 * uses the exact string and therefore needs both spellings for migration.
 */
function uniqueExactAliases(values: readonly TopicEvidenceAlias[]): TopicEvidenceAlias[] {
  const seen = new Set<string>();
  return values.filter((alias) => {
    const key = exactAliasKey(alias);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface OfficialTopicCandidate extends Omit<
  Official2027TopicSpec,
  'evidenceAliases' | 'completionAliases'
> {
  topicKey: string;
  candidateAliases: readonly TopicEvidenceAlias[];
}

const bankTopicOwners = new Map<string, Set<string>>();
for (const subject of GATE_2027_SUBJECTS) {
  for (const topic of subject.officialCurrent) {
    const topicKey = `${subject.id}/${topic.id}`;
    for (const bankTopicKey of topic.bankTopicKeys) {
      const owners = bankTopicOwners.get(bankTopicKey) ?? new Set<string>();
      owners.add(topicKey);
      bankTopicOwners.set(bankTopicKey, owners);
    }
  }
}

const topicCandidates: OfficialTopicCandidate[] = GATE_2027_SUBJECTS.flatMap((subject) =>
  subject.officialCurrent.map((topic): OfficialTopicCandidate => {
    const topicKey = `${subject.id}/${topic.id}`;
    // A broad mapping is useful taxonomy diagnostics, not leaf-level learner
    // evidence. A key shared by multiple leaves is likewise never assigned to
    // any one leaf, even when one of those leaves is otherwise explicit.
    const evidenceBankTopicKeys = topic.bankTopicKeys.filter(
      (bankTopicKey) =>
        topic.bankCoverage === 'explicit' &&
        gate2027BankTopicStatus(bankTopicKey) === 'current' &&
        bankTopicOwners.get(bankTopicKey)?.size === 1
    );
    const bankAliases = evidenceBankTopicKeys
      .map(bankTopicAlias)
      .filter((alias): alias is TopicEvidenceAlias => alias !== null);
    return {
      id: topic.id,
      value: topic.label,
      subjectId: subject.id,
      subject: subject.label,
      bankCoverage: topic.bankCoverage,
      bankTopicKeys: topic.bankTopicKeys,
      evidenceBankTopicKeys,
      topicKey,
      candidateAliases: uniqueExactAliases([
        { subject: subject.label, topic: topic.label },
        ...bankAliases,
        ...(LEGACY_CURRENT_TOPIC_ALIASES[topicKey] ?? [])
      ])
    };
  })
);

const aliasOwners = new Map<string, Set<string>>();
for (const topic of topicCandidates) {
  for (const alias of topic.candidateAliases) {
    const key = normalizedAliasKey(alias);
    const owners = aliasOwners.get(key) ?? new Set<string>();
    owners.add(topic.topicKey);
    aliasOwners.set(key, owners);
  }
}

const finalizedTopics = topicCandidates.map((topic): Official2027TopicSpec => {
  const safeAliases = topic.candidateAliases.filter(
    (alias) => aliasOwners.get(normalizedAliasKey(alias))?.size === 1
  );
  return {
    id: topic.id,
    value: topic.value,
    subjectId: topic.subjectId,
    subject: topic.subject,
    bankCoverage: topic.bankCoverage,
    bankTopicKeys: topic.bankTopicKeys,
    evidenceBankTopicKeys: topic.evidenceBankTopicKeys,
    evidenceAliases: safeAliases,
    completionAliases: safeAliases
  };
});

export const OFFICIAL_2027_TOPICS_BY_SUBJECT = Object.fromEntries(
  GATE_2027_SUBJECTS.map((subject) => [
    subject.label,
    finalizedTopics.filter((topic) => topic.subjectId === subject.id)
  ])
) as Record<CanonicalSubjectLabel, Official2027TopicSpec[]>;

export function official2027TopicsFor(subject: string): Official2027TopicSpec[] {
  return (
    OFFICIAL_2027_TOPICS_BY_SUBJECT[canonicalSubjectLabel(subject) as CanonicalSubjectLabel] ?? []
  );
}

export function subtopicsFor(subject: string): SubtopicSpec[] {
  return SUBTOPICS_BY_SUBJECT[canonicalSubjectLabel(subject)] ?? [];
}
