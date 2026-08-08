// Canonical GATE CS syllabus subtopics per subject, plus a few "related"
// cross-links so the SourceStep can nudge the user toward the right label
// even when the question sits on a boundary (e.g. a Databases question that
// really pivots on Discrete Mathematics closure). Non-exhaustive on purpose
// — keeps the picker under 30 seconds.

export interface SubtopicSpec {
  value: string;
  /** Related subjects this subtopic often crosses into. */
  relatedSubjects?: string[];
}

/**
 * Base subtopics per subject. Order is roughly syllabus order (easier
 * → harder) so the dropdown reads like a study path.
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
    { value: 'Rice\'s Theorem' },
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

export function subtopicsFor(subject: string): SubtopicSpec[] {
  return SUBTOPICS_BY_SUBJECT[subject] ?? [];
}
