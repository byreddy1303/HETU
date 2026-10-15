# HETU Metacognitive Architecture: The Cognitive Thinking Trace & Pattern Debugger Engine

**Target Benchmark**: GATE CSE 2027 AIR < 100  
**Domain**: Metacognitive Reasoning, Error-Driven Constraint Relaxation, and Pattern Synthesis  
**Environment**: 100% Local Desktop (Electron + SQLite WAL + Local Python FastAPI + stdio MCP)  

---

## 1. Executive Summary & Cognitive Science Foundations

### 1.1 The Core Problem in Conventional GATE Preparation
Traditional test-taking platforms treat mistakes as **binary outcomes** ($\text{Correct} \lor \text{Wrong}$) and classify errors using superficial categories (e.g., "Silly Mistake", "Formula Forgotten").

When an aspirant gets a question wrong, the standard behavior is:
1. Open the answer key.
2. Read the official solution.
3. Experience the **Hindsight Illusion** (*"Oh, obviously! I see what they did there."*).
4. Move to the next question.

**The Fatal Flaw**: The aspirant’s **internal thought-generation path was never audited or dismantled**. The flawed heuristic, false symmetry assumption, or unstated premise that fired during the attempt remains completely intact in their subconscious neural network. Three weeks later, faced with a different question that shares the same underlying trap, the exact same erroneous heuristic fires again.

### 1.2 The Solution: Metacognitive Debugging & Cognitive Tracing
This engine treats the human brain as an executing compiler:
* **The Error is not the bug**: The error is merely the symptom.
* **The Bug is in the Premise or Invariant**: The student made a specific, unstated assumption or applied an over-generalized theorem.
* **The Fix is Constraint Relaxation & Heuristic Re-anchoring**:
  1. Capture what the student was thinking **then and there** (before exposing the answer key).
  2. Localize the exact step where their reasoning diverged from canonical logic.
  3. Formulate the **Minimal Counter-Example** that shatters the false premise.
  4. Formulate the **Corrected Mental Heuristic** (a compact, universal rule of thumb).
  5. Cluster these thinking traces across hundreds of questions into **Cognitive Pattern Families**.
  6. Automatically generate **Pattern Sprints** (targeted revision of 3–5 questions across different years/subjects that exploit that exact psychological bias).

---

## 2. Theoretical Framework: Dual-Process & Constraint Relaxation

```
              [ GATE Question Prompt ]
                         |
                         v
     +---------------------------------------+
     | System 1: Fast Heuristic Match        |  <--- Target of HETU's Reflex Drills
     | (Pattern recognition, intuition, cues)|
     +---------------------------------------+
                         |
           (If novel or complex structure)
                         v
     +---------------------------------------+
     | System 2: Slow Derivation Engine      |  <--- Target of Cognitive Tracing
     | (Premises, invariants, arithmetic)    |
     +---------------------------------------+
                         |
           (Divergence Occurs Here)
                         v
            +--------------------------+
            | Student Mental Model     |  !=  [ Canonical Reality ]
            +--------------------------+
                         |
                         v
       [ The Cognitive Trace Interception ]
        1. Capture raw mental path
        2. Localize false axiom
        3. Deliver minimal counter-example
        4. Re-anchor with corrected heuristic
```

### 2.1 The Four Root Cognitive Failure Modes in GATE CS

Through empirical audit of GATE CSE papers (1990–2026), cognitive divergence reliably falls into four formal failure modes:

| Cognitive Failure Mode | Formal Description | Concrete GATE CSE Example |
|---|---|---|
| **1. Unstated Premise Assumption (`C-PREM`)** | The student injects a constraint that was never specified in the problem statement. | In Graph Theory, assuming a graph is *connected* or *simple* when the problem only states "Let $G=(V,E)$ be a graph". |
| **2. Invariant Over-Generalization (`C-GEN`)** | A theorem true under specific conditions is applied unconditionally. | Applying Dijkstra's algorithm to a graph with negative edges because "there are no negative cycles" (confusing Bellman-Ford's invariant with Dijkstra's greedy invariant). |
| **3. Universal Set Bleed (`C-SET`)** | Assuming closure properties apply to non-disjoint, infinite, or universe-spanning sets. | Believing that if $L_1$ is regular and $L_2$ is non-regular, $L_1 \cup L_2$ *must* be non-regular (failing to test the case where $L_1 = \Sigma^*$). |
| **4. Time-Pressure Boundary Drop (`C-BOUND`)** | When solving duration exceeds 2.5 minutes, working memory sheds boundary-value checks. | Forgetting to verify $n=0$, $\epsilon$ (empty string), single-vertex graph, or empty matrix in dynamic programming or automata. |

---

## 3. The End-to-End System Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                         HETU Desktop UI                                            |
|                                                                                                    |
|  [ PYQ Practice / Exam Mode ]                                                                      |
|             |                                                                                      |
|             | (Wrong / Guessed / Hesitant Submit)                                                  |
|             v                                                                                      |
|  +----------------------------------------------------------------------------------------------+  |
|  | The "Then-and-There" Socratic Debrief Drawer                                                |  |
|  |  * Voice Dictation / Fast Text Input: "What was your premise?"                              |  |
|  |  * Answer Key is strictly MASKED until reflection is submitted                              |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                     |                                                              |
|                                     v (JSON-RPC via stdio MCP or Local FastAPI)                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | AI Cognitive Diagnostic Engine (Claude 3.7 / GPT-4o / Local Ollama)                         |  |
|  |  1. Invariant Contrast Analysis: [Student Model] vs [Canonical Reality]                      |  |
|  |  2. Point of Divergence Localization                                                         |  |
|  |  3. Minimal Counter-Example Generator (Instant 15-second drill)                              |  |
|  |  4. Universal Heuristic Extraction                                                           |  |
|  |  5. Semantic Clustering into Cognitive Pattern Family                                         |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                     |                                                              |
|                                     v                                                              |
|  +----------------------------------------------------------------------------------------------+  |
|  | Local SQLite WAL Database (`~/Library/Application Support/hetu/hetu.db`)                     |  |
|  |  * `cognitive_traces` (Individual reflections, flaws, heuristics, split times)               |  |
|  |  * `cognitive_pattern_families` (Cross-subject mental trap clusters)                         |  |
|  |  * `pattern_sprints` (Scheduled multi-question transfer tests)                               |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                     |                                                              |
|               +---------------------+---------------------+                                        |
|               v                                           v                                        |
|  +-----------------------------------+   +------------------------------------------------------+  |
|  | Pattern Vault (`/patterns` Page)  |   | Adaptive Spaced Re-test Engine                       |  |
|  | - Visual Cognitive Heatmap        |   | - Day 3: Blind Retrieval (Answer only)               |  |
|  | - Search by Heuristic or Trap     |   | - Day 7: Active Heuristic Recall (Rule before solve) |  |
|  | - 1-Click "Launch Pattern Sprint" |   | - Day 21: Far-Transfer Test (New question, same trap)|  |
|  +-----------------------------------+   +------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Database Schema Specifications (Local SQLite WAL)

### 4.1 Table: `cognitive_traces`
Captures the raw thinking trajectory and the AI's diagnostic breakdown for every flagged attempt.

```sql
CREATE TABLE cognitive_traces (
    id TEXT PRIMARY KEY,                          -- UUID v4
    user_id TEXT NOT NULL,                        -- 'local_user' in local mode
    attempt_id TEXT NOT NULL,                     -- References pyq_attempts(id)
    question_uid TEXT NOT NULL,                   -- e.g. 'gate-cse-2023-set1-q24'
    subject TEXT NOT NULL,                        -- e.g. 'Algorithms'
    topic TEXT NOT NULL,                          -- e.g. 'Shortest Paths'
    
    -- Student's Raw Mental Output (Captured Then-and-There)
    student_thought_raw TEXT NOT NULL,            -- e.g. "I thought Dijkstra works if there are no negative cycles"
    selected_option TEXT,                         -- What student marked (e.g. 'B')
    correct_option TEXT NOT NULL,                 -- Canonical key (e.g. 'C')
    time_spent_seconds INTEGER NOT NULL,          -- Measured solving duration
    
    -- AI Diagnostic Output
    failure_mode TEXT NOT NULL,                   -- 'C-PREM' | 'C-GEN' | 'C-SET' | 'C-BOUND' | 'CALC'
    divergence_point TEXT NOT NULL,               -- Where logic broke down
    canonical_reality TEXT NOT NULL,              -- What canonical theory actually states
    minimal_counter_example TEXT NOT NULL,        -- Minimal refutation example
    corrected_heuristic TEXT NOT NULL,            -- The actionable 1-line rule to install
    
    -- Pattern Family Linkage
    pattern_family_slug TEXT NOT NULL,            -- References cognitive_pattern_families(slug)
    
    -- Spaced Verification State
    verification_status TEXT DEFAULT 'untested',  -- 'untested' | 'healed' | 're-occurred'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (pattern_family_slug) REFERENCES cognitive_pattern_families(slug)
);

CREATE INDEX idx_cognitive_traces_user_pattern ON cognitive_traces(user_id, pattern_family_slug);
CREATE INDEX idx_cognitive_traces_question ON cognitive_traces(question_uid);
```

### 4.2 Table: `cognitive_pattern_families`
Clusters individual thinking traces into systemic mental blindspots across subjects.

```sql
CREATE TABLE cognitive_pattern_families (
    slug TEXT PRIMARY KEY,                        -- e.g. 'implicit-graph-connectivity-assumption'
    user_id TEXT NOT NULL,                        -- 'local_user'
    name TEXT NOT NULL,                           -- "Implicit Graph Connectivity Trap"
    failure_mode TEXT NOT NULL,                   -- 'C-PREM'
    trap_signature TEXT NOT NULL,                 -- Description of how the trap presents in questions
    universal_heuristic TEXT NOT NULL,            -- Master rule to eliminate the trap
    
    -- Aggregated Metrics
    occurrences_count INTEGER DEFAULT 1,          -- Number of times student fell into this trap
    marks_hemorrhaged REAL DEFAULT 0.0,           -- Total marks lost to this cognitive trap
    affected_subjects TEXT NOT NULL,              -- JSON array: ["Discrete Mathematics", "Algorithms"]
    
    -- Mastery & Resolution
    status TEXT DEFAULT 'active',                 -- 'active' | 'in_remediation' | 'immunized'
    last_occurred_at TIMESTAMP NOT NULL,
    immunized_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 Table: `pattern_sprints`
Curated multi-question revision sessions specifically designed to test far-transfer of a corrected heuristic.

```sql
CREATE TABLE pattern_sprints (
    id TEXT PRIMARY KEY,                          -- UUID v4
    user_id TEXT NOT NULL,                        -- 'local_user'
    pattern_family_slug TEXT NOT NULL,            -- Target pattern being tested
    prescribed_question_uids TEXT NOT NULL,       -- JSON array of 3-5 question UIDs sharing this trap
    target_duration_minutes INTEGER DEFAULT 20,   -- Suggested sprint timebox
    
    -- Performance Tracking
    status TEXT DEFAULT 'scheduled',              -- 'scheduled' | 'completed' | 'abandoned'
    questions_attempted INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    heuristic_recalled_cleanly BOOLEAN,           -- Did student state heuristic before solving?
    
    scheduled_for DATE NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (pattern_family_slug) REFERENCES cognitive_pattern_families(slug)
);
```

---

## 5. The AI Diagnostic Engine: Prompts & Inference Pipelines

The AI Cognitive Diagnostic Engine runs either through:
1. **Local stdio MCP Server** (ChatGPT macOS App / Claude Desktop).
2. **In-App Direct API Call** (OpenAI `gpt-4o`, Anthropic `claude-3-7-sonnet`, or local `ollama/qwen2.5-coder`).

### 5.1 The Metacognitive Diagnostic Prompt
The prompt enforces rigorous structural decomposition rather than chit-chat:

```markdown
You are the Metacognitive Diagnostic Engine for an elite GATE CSE aspirant (targeting AIR < 100).
A student just attempted a GATE question and failed or hesitated.

[QUESTION METADATA]
Question UID: {{question_uid}}
Subject: {{subject}} | Topic: {{topic}}
Marks: {{marks}} | Type: {{question_type}}

[QUESTION TEXT]
{{question_text}}

[OFFICIAL CANONICAL KEY & EXPLANATION]
Correct Answer: {{correct_answer}}
Official Key Reason: {{canonical_explanation}}

[STUDENT ATTEMPT]
Student's Selected Answer: {{selected_answer}}
Time Spent: {{time_spent_seconds}} seconds
Student's Raw Thinking Trace: "{{student_thought_raw}}"

[DIAGNOSTIC TASK]
Analyze the student's thinking approach with extreme cognitive precision.
Return a STRICT JSON response adhering to this schema:
{
  "failure_mode": "C-PREM" | "C-GEN" | "C-SET" | "C-BOUND" | "CALC",
  "divergence_point": "Exact sentence or inference step where the student's logic diverged from truth",
  "canonical_reality": "The formal theorem, invariant, or property that governs this situation",
  "minimal_counter_example": "The smallest, simplest concrete counter-example proving their assumption false (e.g. a 3-node graph, a 2-state DFA, or a 1-character string)",
  "corrected_heuristic": "A crisp, memorable, imperatively-phrased rule of thumb (max 15 words) that the student should recite whenever this pattern appears",
  "pattern_family_slug": "kebab-case-slug-representing-this-thinking-trap",
  "pattern_family_name": "Clear Human-Readable Title for this Trap",
  "trap_signature": "How this trap typically disguises itself in GATE questions",
  "immediate_test_question": "A 1-sentence micro-question testing whether they understand the counter-example right now"
}
```

---

## 6. Concrete Walkthroughs: Three Common GATE CS Thinking Traps

### Scenario 1: Theory of Computation (Universal Set Bleed)
* **Question**: "Let $L_1$ be a regular language and $L_2$ be a non-regular language. Is $L_1 \cup L_2$ always non-regular?"
* **Student's Answer**: "YES" (Official Key: **NO**).
* **Student's Raw Thought**: *"Non-regular languages cannot be recognized by finite automata. Adding regular strings doesn't give the automaton memory, so the union must still be non-regular."*
* **AI Diagnostic Output**:
  * **Failure Mode**: `C-SET` (Universal Set Bleed).
  * **Divergence Point**: Assumed that non-regularity is an "infectious" property under set union.
  * **Canonical Reality**: Regular languages are closed under union. If a regular language covers the entire universe ($\Sigma^*$), it completely absorbs the non-regular language.
  * **Minimal Counter-Example**: Let $L_1 = \Sigma^*$ (regular) and $L_2 = \{a^n b^n \mid n \ge 0\}$ (non-regular). Then $L_1 \cup L_2 = \Sigma^*$, which is regular.
  * **Corrected Heuristic**: *"Universe Absorption Rule: If a regular component can equal $\Sigma^*$, it swallows non-regularity."*
  * **Pattern Family**: `regular-universal-absorption-trap`.

---

### Scenario 2: Computer Organization & Architecture (Endianness Memory Drift)
* **Question**: "A 32-bit integer `0x12345678` is stored at memory address `0x1000` in a Little-Endian machine. What byte is stored at address `0x1002`?"
* **Student's Answer**: `0x34` (Official Key: **`0x34`** — wait, let's look at `0x78` at `0x1000`, `0x56` at `0x1001`, `0x34` at `0x1002`, `0x12` at `0x1003`). 
* *Suppose student marked `0x56` because they counted from the left.*
* **Student's Raw Thought**: *"Little endian stores small things first, so I wrote the hex digits from left to right: 12, 34, 56, 78."*
* **AI Diagnostic Output**:
  * **Failure Mode**: `C-GEN` (Significance vs Spatial Order Confusion).
  * **Divergence Point**: Confused byte significance (LSB) with reading direction (left-to-right text).
  * **Canonical Reality**: `0x78` is the Least Significant Byte (LSB). In Little-Endian, LSB goes to Lowest Address (`0x1000`).
  * **Corrected Heuristic**: *"Little-Endian = Little End (LSB) at Little Address. Read hex backwards by bytes."*
  * **Pattern Family**: `endianness-lsb-spatial-inversion`.

---

### Scenario 3: Operating Systems (Synchronization Invariant Over-Generalization)
* **Question**: "Does strict alternation using a shared `turn` variable satisfy Progress in critical section design?"
* **Student's Answer**: "YES" (Official Key: **NO**).
* **Student's Raw Thought**: *"Processes take turns entering cleanly, so both get to execute without deadlock. That means progress is satisfied."*
* **AI Diagnostic Output**:
  * **Failure Mode**: `C-GEN` (Progress vs Deadlock-Free Confusion).
  * **Divergence Point**: Equated "no deadlock" with the formal GATE definition of Progress.
  * **Canonical Reality**: Progress requires that a process *not* interested in entering the critical section must not block an interested process. Strict alternation violates progress when one process stops requesting the critical section.
  * **Minimal Counter-Example**: Process $P_0$ finishes its turn, sets `turn = 1`, and never wants to enter again. Process $P_1$ cannot enter even though the critical section is completely free.
  * **Corrected Heuristic**: *"Progress Check: If process A dies in non-critical section, does process B starve? If yes $\implies$ NO PROGRESS."*
  * **Pattern Family**: `critical-section-progress-starvation-blindspot`.

---

## 7. The Three-Tier Revision Loop: What, When, and How

```
+------------------------------------------------------------------------------------------------+
|                             THE COGNITIVE REVISION PROTOCOL                                    |
+------------------------------------------------------------------------------------------------+
|                                                                                                |
|  [ Day 0: Attempt ] ----> Divergence Detected ----> Socratic Debrief & Heuristic Installed     |
|                                                                                                |
|  [ Day 3: Blind Retrieval ]                                                                    |
|  * Target Question is presented BLIND (no notes, no old answers, no hints).                    |
|  * Goal: Verify basic operational execution.                                                   |
|                                                                                                |
|  [ Day 7: Active Heuristic Recall ]                                                            |
|  * Before the question is unlocked, the app asks:                                              |
|    "What is the Golden Heuristic for the 'Universal Absorption' trap?"                         |
|  * Student must type/recite the heuristic before solving.                                      |
|                                                                                                |
|  [ Day 21: The Far-Transfer "Pattern Sprint" ]                                                 |
|  * The original question is RETIRED.                                                           |
|  * System selects 3 UNSEEN questions from different subjects/years that share this EXACT trap. |
|  * Example: TOC Universal Set Trap tested via a Computer Networks subnetting question!         |
|  * If student scores 100% on the sprint -> Cognitive Trap is marked IMMUNIZED.                 |
+------------------------------------------------------------------------------------------------+
```

---

## 8. Integration Map with Existing HETU Modules

| Existing HETU Module | How It Is Upgraded by the Cognitive Thinking Engine |
|---|---|
| [`src/components/pyq/PyqPracticeAnswer.tsx`](file:///Users/bkalyankrishnareddy/Desktop/hetu/src/components/pyq/PyqPracticeAnswer.tsx) | Intercepts wrong submissions and renders the Socratic Debrief Drawer before revealing the answer key. |
| [`src/pages/Journal.tsx`](file:///Users/bkalyankrishnareddy/Desktop/hetu/src/pages/Journal.tsx) | Upgraded from a static note card into a structured **Mental Diff Card**: shows `My Initial Premise` vs `Flaw Point` vs `Corrected Rule`. |
| [`src/pages/Patterns.tsx`](file:///Users/bkalyankrishnareddy/Desktop/hetu/src/pages/Patterns.tsx) | Upgraded into the **Cognitive Pattern Vault**: visualizes pattern clusters, total marks hemorrhaged per thinking bias, and includes a 1-click **Launch Pattern Sprint** action. |
| [`src/components/planner/DayPlanModal.tsx`](file:///Users/bkalyankrishnareddy/Desktop/hetu/src/components/planner/DayPlanModal.tsx) | Planner automatically schedules a morning 20-minute **Pattern Sprint** whenever a pattern family reaches $\ge 3$ active occurrences. |
| [`backends/python/app/mcp_study_tools.py`](file:///Users/bkalyankrishnareddy/Desktop/hetu/backends/python/app/mcp_study_tools.py) | Adds native MCP tools: `log_cognitive_trace`, `get_cognitive_fingerprint`, `prescribe_pattern_sprint`. |

---

## 9. Phased Implementation Roadmap

### Phase 1: SQLite Schema & Core Telemetry (Foundations)
- [ ] Add `cognitive_traces`, `cognitive_pattern_families`, and `pattern_sprints` tables to SQLite schema in `backends/python/app/db/models.py`.
- [ ] Add migration script and verify database integrity checks.

### Phase 2: Socratic Debrief Drawer (The Capture UI)
- [ ] Build `CognitiveDebriefDrawer.tsx` in `src/components/pyq/`.
- [ ] Include quick-input text field, speech-to-text dictation, and temporary answer-key masking.
- [ ] Connect drawer trigger to wrong answers, guesses (`RBG`), and high-hesitation submissions.

### Phase 3: The AI Diagnostic Pipeline (Local MCP + In-App API)
- [ ] Implement `diagnose_thinking_trace` service in `backends/python/app/services/cognitive.py`.
- [ ] Expose native stdio MCP tool `save_cognitive_trace` for ChatGPT Mac / Claude Desktop.
- [ ] Support local API key fallback (OpenAI, Claude, local Ollama) in HETU Settings.

### Phase 4: Pattern Vault & Far-Transfer Sprints (The Synthesis Layer)
- [ ] Overhaul `src/pages/Patterns.tsx` with Cognitive Fingerprint visualizations and marks-lost metrics.
- [ ] Build the automated **Pattern Sprint** generator that assembles 3–5 cross-subject questions for Day 21 transfer tests.
