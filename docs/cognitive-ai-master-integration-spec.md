# HETU Cognitive AI Master Integration Specification
## Metacognitive Thinking Tracing, Pattern Debugging, and Prescriptive Revision Engine

**Document Status**: Official Architecture & Integration Blueprint  
**Target Milestone**: GATE CSE 2027 AIR < 100  
**Runtime Architecture**: 100% Self-Contained Local Desktop (macOS / Electron / SQLite WAL / Python 3.12 / Native stdio MCP)  
**Creation Date**: 2026-10-15  

---

## 1. The Core Idea & The User's Vision

### 1.1 The User's Thesis
> *"If I had an AI integrated into my local app that asks me: **'What were you thinking about when you were solving this question?'**, analyses my thinking approach, corrects me then and there, and records it... Then, after several hundreds of questions across multiple subjects, it could derive deep insights to fix those minor recurring errors. It could tell me **what, when, and how to revise**, recording both what my approach was and what the corrected approach is for that pattern. That way, I can look up and drill those pattern problems again, fully interlinked into a complex yet seamless, fully functional local system."*

### 1.2 The Transformative Shift: Debugging the "Thought Generator"
Standard exam preparation treats mistakes as **knowledge gaps** (*"I didn't know the formula"*) or **execution slips** (*"I made a calculation error"*). 

In reality, top rankers ($< \text{AIR } 100$) understand that mistakes are almost always **cognitive premise errors**:
* The student applied a theorem outside its valid domain.
* The student subconsciously assumed an unstated constraint (e.g. assuming a graph is connected or that a set is non-empty).
* The student's intuition fell into a psychological trap set deliberately by the GATE committee.

When an aspirant merely reads the official solution, they experience the **Hindsight Illusion** (*"Oh, I get it now"*). **Their flawed subconscious intuition was never uninstalled.** Three weeks later, in a different question that shares the same hidden cognitive trap, the exact same flawed intuition fires again.

This system introduces **Metacognitive Debugging**: actively intercepting the student's thinking process, locating the exact point of divergence, shattering the false premise with a minimal counter-example, installing a universal corrected heuristic, clustering these patterns across subjects, and scheduling far-transfer revision sprints.

---

## 2. Theoretical Framework: Dual-Process Cognitive Architecture

```
                    [ GATE Question Presented ]
                                 |
                                 v
             +---------------------------------------+
             | System 1: Fast Heuristic Intuition    |  <--- Trained by Reflex Recognition Drills
             | (Pattern recognition, instinctive cues|
             +---------------------------------------+
                                 |
                   (If non-trivial / analytical)
                                 v
             +---------------------------------------+
             | System 2: Slow Derivation Engine      |  <--- Audited by Cognitive Thinking Traces
             | (Axioms, invariants, algebra, steps)  |
             +---------------------------------------+
                                 |
                     (Cognitive Divergence Point)
                                 v
                    +--------------------------+
                    | Student's Mental Path    |  !=  [ Canonical Mathematical Reality ]
                    +--------------------------+
                                 |
                                 v
             =========================================
             THE REAL-TIME SOCRATIC INTERCEPTION (THEN & THERE)
             1. Answer key is strictly MASKED.
             2. Student declares their working premise.
             3. AI compares [Student Path] vs [Canonical Truth].
             4. AI delivers the Minimal Counter-Example (15s drill).
             5. AI formulates the 1-line Corrected Heuristic.
             6. System registers pattern into the Local Cognitive Graph.
             =========================================
```

### 2.1 The Four Canonical GATE Cognitive Failure Modes

| Failure Mode Code | Name | Formal Definition | Concrete GATE CSE Example |
|---|---|---|---|
| **`C-PREM`** | **Unstated Premise Injection** | Subconsciously injecting a constraint not stated in the problem. | Assuming a graph is **connected** or **simple** when the question only says: *"Let $G=(V,E)$ be a graph"*. |
| **`C-GEN`** | **Invariant Over-Generalization** | Applying a theorem outside its precondition boundaries. | Using Dijkstra's algorithm on a graph with negative edge weights because *"there are no negative cycles"* (confusing Bellman-Ford's invariant with Dijkstra's greedy invariant). |
| **`C-SET`** | **Universal Set Absorption Bleed** | Assuming closure or undecidability is infectious under set operations. | Concluding $L_1 \text{ (regular)} \cup L_2 \text{ (non-regular)}$ *must* be non-regular (missing $L_1 = \Sigma^*$). |
| **`C-BOUND`** | **Time-Pressure Boundary Drop** | Working memory shedding boundary/corner checks after 2.5 minutes of solving. | Failing to test $n=0$, empty string $\epsilon$, single-vertex tree, or disconnected components under exam stress. |

---

## 3. Micro-to-Macro Component Blueprint

Every component in this system is designed to eliminate friction, prevent cognitive bias, and maintain sub-millisecond local speed.

### 3.1 Tiny / Atomic Components (Micro-Ergonomics)

1. **The Answer Mask Shield**:
   - When a question attempt is submitted as Incorrect, Hesitant ($> 3.5\text{ min}$), or Flagged as *Lucky Guess (`RBG`)*, the official solution is **strictly blurred and masked**.
   - A high-contrast banner reads: *"Lock your thinking approach before revealing the key."*
   - Eliminates the Hindsight Bias before it can form.

2. **One-Tap Socratic Micro-Prompts**:
   - For moments when the student is fatigued and doesn't want to type a paragraph, provide 1-tap prompt starters:
     - *"I assumed the property held for all $n$, but it failed at..."*
     - *"I debated between Option B and Option C because..."*
     - *"I thought the algorithm was greedy, but..."*
     - *"I missed the keyword [NOT / AT LEAST / DISTINCT]."*

3. **Sub-Second Voice Dictation (Local Speech-to-Text)**:
   - Microphone button directly in the prompt drawer.
   - Leverages native macOS SpeechRecognition API or local Whisper model running on Apple Silicon GPU.
   - The student holds `Space` or clicks the mic, speaks for 8 seconds: *"I thought strict alternation prevented starvation because they take turns."* -> Instantly transcribed with zero cloud latency.

4. **Attempt Artifact Binding (Scratchpad & Calculator Tape)**:
   - The vector strokes from the digital scratchpad (`Cmd+E`) and the chronological calculation tape from the TCS iON calculator are **automatically attached** to the cognitive trace row in SQLite.
   - When reviewing weeks later, you see not just what you said, but what you wrote and calculated.

5. **Split-Phase Hesitation Telemetry**:
   - Split 1: *Reading Time* (Load $\to$ First interaction).
   - Split 2: *Derivation Time* (Active scratchpad/calculator work).
   - Split 3: *Sanity Verification Time* (Time spent hesitating on the selected option).
   - If Split 3 exceeds 90 seconds, the AI specifically investigates **Second-Guessing Bias**.

---

### 3.2 Medium Components (Composite Functional Workspaces)

1. **The "Then-and-There" Socratic Debrief Drawer (`CognitiveDebriefDrawer.tsx`)**:
   - Slides smoothly from the right side of the screen upon attempt submission.
   - Three distinct collapsible panels:
     - **Panel A: Your Raw Thinking**: Displays your transcribed/typed reasoning.
     - **Panel B: The Cognitive Contrast Diff**:
       - *Your Mental Premise*: "Strict alternation guarantees progress."
       - *Canonical Reality*: "Progress requires that an uninterested process cannot block an interested one."
       - *The Point of Divergence*: Confusing deadlock-freedom with progress.
     - **Panel C: The Minimal Counter-Example**: A 2-process code snippet demonstrating starvation.

2. **The 15-Second Instant Reflex Drill**:
   - Right beneath the counter-example, the AI generates a 1-question micro-drill testing the exact invariant:
     - *"If process $P_0$ enters a non-terminating loop in its non-critical section, can $P_1$ enter? (Yes/No)"*
   - Immediate feedback solidifies the newly rewired neural pathway.

3. **The Universal Corrected Heuristic Pill**:
   - A memorable, imperatively-phrased rule of thumb (maximum 15 words) tagged to the question:
     > **Rule**: *"Progress Check: If process A dies outside the critical section, does process B starve? If yes $\implies$ NO PROGRESS."*
   - Stored in the student's personal heuristic dictionary.

4. **The Cognitive History Diff Viewer**:
   - When you re-attempt a question on Day 3 or Day 7, the scrubber displays:
     - *Attempt 1 (Day 0)*: Raw thought + Flawed Premise (`C-GEN`) + Time: 210s.
     - *Attempt 2 (Day 3)*: Stated Corrected Heuristic + Correct Derivation + Time: 75s.
   - Proves genuine mastery rather than rote answer memorization.

---

### 3.3 Large Components (Operating Systems & Analytics)

1. **The Cognitive Pattern Vault (`/patterns` Page Overhaul)**:
   - An interactive, visual control center clustering hundreds of thinking traces into **Pattern Families**:
     - Visualizes your **Cognitive Error Fingerprint**: Pie/Donut breakdown of `C-PREM`, `C-GEN`, `C-SET`, `C-BOUND`.
     - **Hemorrhage Counter**: Shows exact marks lost to each specific thinking bias across mocks (e.g. *"-16.33 marks lost to Unstated Graph Connectivity assumptions"*).
     - **Cross-Subject Matrix**: Shows how a single thinking bias manifests in Discrete Math, Algorithms, Operating Systems, and Networks simultaneously.

2. **The Far-Transfer "Pattern Sprint" Engine**:
   - Rather than merely repeating the same question you already saw, the system prescribes a **Pattern Sprint**:
     - Scans the 4,334 PYQ database for 3 to 5 questions across different years/subjects that share the **exact same cognitive trap**.
     - Example: If you fell into the *Universal Set Absorption* trap in TOC, the sprint tests the same mathematical phenomenon in *Computer Networks Subnetting Masks* and *Relational Algebra Selection Predicates*!
     - Successfully completing a Pattern Sprint marks the pattern family as **IMMUNIZED**.

3. **Post-Exam Diagnostic Review Suite (Mock Protection Mode)**:
   - During an authentic 3-hour, 65-question mock exam, the Socratic Debrief Drawer is **strictly disabled** to maintain exam timing integrity.
   - When the exam is submitted, HETU automatically populates a **Post-Mortem Queue**:
     - Orders missed and hesitant questions by maximum mark impact.
     - Allows conducting the Socratic debrief session question-by-question during the evening post-mortem.

---

## 4. Deep AI Implementation & Engineering Specs

### 4.1 Model Routing & Dual Execution Architecture
HETU supports two complementary AI execution pathways, both maintaining local single-user sovereignty:

```
+-----------------------------------------------------------------------------------------+
|                                    AI ROUTING MATRIX                                    |
|                                                                                         |
|  [ Pathway A: Native stdio MCP Server ]         [ Pathway B: In-App Direct Engine ]      |
|  - Zero extra API cost.                         - Built directly into HETU UI.          |
|  - Connects to ChatGPT macOS App, Claude        - User enters API Key (OpenAI, Claude,  |
|    Desktop, or Cursor.                            Gemini, DeepSeek) OR points to local  |
|  - AI invokes `log_cognitive_trace`,              offline Ollama (`qwen2.5-coder`).     |
|    `prescribe_pattern_sprint` over stdio.       - Fast 1-click debrief inside drawer.   |
+-----------------------------------------------------------------------------------------+
```

### 4.2 Structured Output Schema (Pydantic / SQLite)
The AI is strictly constrained to return structured JSON. No conversational fluff or hallucinations:

```python
from pydantic import BaseModel, Field
from typing import Literal

class CognitiveDiagnosis(BaseModel):
    failure_mode: Literal["C-PREM", "C-GEN", "C-SET", "C-BOUND", "CALC", "CLEAN"] = Field(
        description="Formal failure mode classification"
    )
    divergence_point: str = Field(
        description="Exact step or premise where the student's thought diverged from truth"
    )
    canonical_reality: str = Field(
        description="The formal theorem, invariant, or property that actually governs this question"
    )
    minimal_counter_example: str = Field(
        description="The smallest concrete counter-example that refutes the student's false premise"
    )
    corrected_heuristic: str = Field(
        description="A crisp, memorable, imperatively-phrased rule of thumb (max 15 words)"
    )
    pattern_family_slug: str = Field(
        description="Kebab-case slug representing the universal thinking trap"
    )
    pattern_family_name: str = Field(
        description="Human-readable title for this cognitive pattern family"
    )
    trap_signature: str = Field(
        description="How this trap typically disguises itself in GATE questions"
    )
    immediate_test_question: str = Field(
        description="A 1-sentence micro-question testing the counter-example right now"
    )
    immediate_test_answer: str = Field(
        description="Correct answer to the micro-question"
    )
```

### 4.3 Anti-Hallucination & Canonical Grounding Pipeline
To ensure the AI never invents false GATE rules or hallucinated solutions:
1. **Official Key Anchor**: The prompt always injects the verified official GATE answer key, marking metadata, and stored textbook explanation from HETU's verified catalog.
2. **Deterministic Pre-Checks**: If the student's selected answer matches the official key, the failure mode defaults to `CLEAN` unless the attempt was tagged as `RBG` (Lucky Guess).
3. **Student Override Control**: Every AI diagnostic output features a subtle `"Disagree / Edit Heuristic"` button. If the aspirant feels the AI misdiagnosed their thought, they can adjust the heuristic in one click.

---

## 5. Local Database Schema & Synchronisation

All data is stored in the local SQLite database at `~/Library/Application Support/hetu/hetu.db` with Write-Ahead Logging (`WAL`) enabled.

### 5.1 Tables Definition

```sql
-- 1. Individual Cognitive Thinking Traces
CREATE TABLE IF NOT EXISTS cognitive_traces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'local_user',
    attempt_id TEXT NOT NULL,
    question_uid TEXT NOT NULL,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    
    -- Student Reflection Data
    student_thought_raw TEXT NOT NULL,
    selected_option TEXT,
    correct_option TEXT NOT NULL,
    time_spent_seconds INTEGER NOT NULL,
    scratchpad_snapshot_url TEXT,
    calculator_operations_count INTEGER DEFAULT 0,
    
    -- AI Diagnostics
    failure_mode TEXT NOT NULL,
    divergence_point TEXT NOT NULL,
    canonical_reality TEXT NOT NULL,
    minimal_counter_example TEXT NOT NULL,
    corrected_heuristic TEXT NOT NULL,
    immediate_test_question TEXT,
    immediate_test_answer TEXT,
    
    -- Pattern Family Linkage
    pattern_family_slug TEXT NOT NULL,
    
    -- Spaced Verification State
    verification_stage TEXT DEFAULT 'untested', -- 'untested' | 'd3_passed' | 'd7_passed' | 'immunized'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Clustered Cognitive Pattern Families
CREATE TABLE IF NOT EXISTS cognitive_pattern_families (
    slug TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'local_user',
    name TEXT NOT NULL,
    failure_mode TEXT NOT NULL,
    trap_signature TEXT NOT NULL,
    universal_heuristic TEXT NOT NULL,
    occurrences_count INTEGER DEFAULT 1,
    marks_hemorrhaged REAL DEFAULT 0.0,
    affected_subjects TEXT NOT NULL, -- JSON array
    status TEXT DEFAULT 'active',    -- 'active' | 'in_remediation' | 'immunized'
    last_occurred_at TIMESTAMP NOT NULL,
    immunized_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Scheduled Pattern Transfer Sprints
CREATE TABLE IF NOT EXISTS pattern_sprints (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'local_user',
    pattern_family_slug TEXT NOT NULL,
    prescribed_question_uids TEXT NOT NULL, -- JSON array of 3-5 questions
    target_duration_minutes INTEGER DEFAULT 20,
    status TEXT DEFAULT 'scheduled',        -- 'scheduled' | 'completed' | 'abandoned'
    questions_attempted INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    heuristic_recalled_cleanly BOOLEAN,
    scheduled_for DATE NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pattern_family_slug) REFERENCES cognitive_pattern_families(slug)
);
```

---

## 6. Edge Cases, Failure Modes & Comprehensive Solutions

Every complex system faces edge cases. Here is how each potential issue is proactively resolved:

### Problem 1: User Fatigue & Friction (The "I'm Too Tired to Type" Problem)
* **The Risk**: After a grueling 2-hour practice session, asking the student to type detailed essays about their thoughts causes burnout and abandonment.
* **The Solution**:
  1. **Voice Dictation**: Tap or hold space to speak for 8 seconds.
  2. **1-Tap Chips**: Quick selectable cards (*"Misread NOT"*, *"Thought graph was connected"*, *"Arithmetic overflow"*).
  3. **"Debrief in Evening Queue" Button**: A single click defers the un-debriefed questions into a relaxed evening queue, letting you finish your practice set unhindered.

### Problem 2: Exam Simulation Integrity
* **The Risk**: Showing debrief modals during a timed full-length mock destroys authentic exam pressure and pacing.
* **The Solution**:
  * In **Exam Mode**, all debrief interventions are **100% suppressed**.
  * Upon final mock submission, the results page features a dedicated **"Post-Mortem Diagnostic Walkthrough"** button that walks through missed questions one by one.

### Problem 3: Cold-Start Problem (0 to 50 Questions Logged)
* **The Risk**: In the first two weeks, there are not enough attempts for the AI to cluster patterns.
* **The Solution**:
  * HETU ships with **40 Pre-Seeded GATE CS Trap Archetypes** compiled from 35 years of GATE papers (e.g., *Strict Alternation Starvation*, *CFL Universal Absorption*, *Dijkstra Negative Edge Greed*, *Little-Endian Memory Significance*).
  * The AI immediately maps your very first mistake onto these pre-seeded archetypes!

### Problem 4: AI Latency or Offline Operation
* **The Risk**: If the internet drops or an external LLM API is slow, question practice freezes.
* **The Solution**:
  * The debrief drawer saves your raw thought into SQLite **instantly ($< 1\text{ms}$)**.
  * If an API is unavailable or offline, the raw thought is marked `pending_diagnosis`.
  * As soon as an LLM connection is available (or via local Ollama / Claude Desktop MCP), background workers process the queue asynchronously without blocking your study flow.

### Problem 5: Accidental Deletion & Version Conflicts
* **The Risk**: In distributed or local sync, re-attempting or updating a deleted/archived pattern could cause 409 conflict errors (like the soft-delete bug recently resolved).
* **The Solution**:
  * All cognitive trace mutations use **idempotent upserts** that automatically restore soft-deleted records, incrementing versions safely without throwing 409 errors.

---

## 7. Phased Implementation Roadmap

```
+-----------------------------------------------------------------------------------------+
|                                  IMPLEMENTATION PHASES                                  |
|                                                                                         |
|  Phase 1: Foundations & Schema                                                          |
|  * Add `cognitive_traces`, `cognitive_pattern_families`, and `pattern_sprints` to       |
|    `backends/python/app/db/models.py`.                                                  |
|  * Add SQLite migration and verify tables with automated tests.                         |
|                                                                                         |
|  Phase 2: The Socratic Capture UI                                                       |
|  * Build `CognitiveDebriefDrawer.tsx` in `src/components/pyq/`.                          |
|  * Implement answer-masking shield, voice dictation, and defer-to-evening actions.      |
|                                                                                         |
|  Phase 3: The AI Diagnostic Service & stdio MCP Tools                                    |
|  * Implement `backends/python/app/services/cognitive.py`.                               |
|  * Register `log_cognitive_trace` and `get_cognitive_fingerprint` in `mcp_study_tools.py`.|
|  * Expose settings toggle for in-app LLM providers (OpenAI / Claude / local Ollama).    |
|                                                                                         |
|  Phase 4: The Pattern Vault & Far-Transfer Sprints                                      |
|  * Redesign `src/pages/Patterns.tsx` into the Cognitive Error Vault.                    |
|  * Build automated 3-question Pattern Sprint builder into the Daily Planner.            |
+-----------------------------------------------------------------------------------------+
```

---

## 8. Summary: What Makes This System Truly Unrivaled

By linking:
1. **Immediate Socratic Thought Capture** (preventing hindsight bias),
2. **Flaw Point Localization & Minimal Counter-Examples** (shattering false premises),
3. **Universal Heuristic Extraction** (installing actionable mental rules),
4. **Cross-Subject Cognitive Clustering** (identifying systemic thinking blindspots), and
5. **Far-Transfer Pattern Sprints** (verifying retention on unseen questions),

HETU transforms from a standard question-solving database into an **autonomous cognitive training simulator**, systematically engineering the mental reflexes required to score **AIR < 100 in GATE CSE 2027**.
