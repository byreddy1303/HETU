# HETU Local Desktop: Supercharged Roadmap & Agent Execution Log

**Current Status**: Learning Memory, connected history, and local-model study follow-ups implemented; broader phases remain in progress
**Target**: GATE CSE 2027 AIR < 100  
**Architecture**: 100% Local Desktop (Electron + SQLite WAL + Python 3.12 + Native stdio MCP)  
**Last Updated**: 2026-10-19

> **Note for Future Agents**:  
> Always consult this document before starting a task. When you complete a sub-task or phase, update its checkbox (`[x]`), record the commit hash in the Progress Log below, and commit this file to `main` before finalizing your turn.

---

## 1. AI Integration Architecture: The "Ultimate Master Coach"

To make an AI act as a true master coach (identifying root weaknesses, predicting rank impact, and prescribing exact daily interventions) rather than a generic chatbot, HETU requires four core pillars:

```
+-----------------------------------------------------------------------------------+
|                            HETU Local Architecture                                |
|                                                                                   |
|  1. Flight Recorder Telemetry         2. SQLite Engine Aggregator                 |
|  - Reading / Solving / Review Splits  - Negative mark hemorrhage calculation      |
|  - Calculator audit tape              - Forgetting curve & D3/D7 review debt      |
|  - Confidence tags (Solid/Guess)      - Syllabus prerequisite graph traversal     |
|  - Error codes (W-C, W-E, W-R)        - Topic decay metrics                       |
|                   \                       /                                       |
|                    v                     v                                        |
|              +----------------------------------+                                 |
|              |  Aspirant Diagnostic Dossier     |  (Structured 2KB JSON snapshot) |
|              +----------------------------------+                                 |
|                                |                                                  |
|                                v                                                  |
|         +---------------------------------------------+                           |
|         | Master AI Engine (Claude / GPT / Local)    |                           |
|         | - Analyzes cognitive gaps                   |                           |
|         | - Identifies upstream syllabus bottlenecks  |                           |
|         | - Conducts Socratic post-mortem debriefs    |                           |
|         +---------------------------------------------+                           |
|                                |                                                  |
|                                v  (Tool Invocations via MCP / In-App API)         |
|         +---------------------------------------------+                           |
|         | Prescriptive Actions Executed in HETU       |                           |
|         | - Injects targeted blocks into Planner      |                           |
|         | - Generates 3 custom reflex trigger drills  |                           |
|         | - Adjusts FSRS spacing for fragile topics   |                           |
|         +---------------------------------------------+                           |
+-----------------------------------------------------------------------------------+
```

### Necessary App Features to Power the AI:
1. **Granular Telemetry**: Recording reading vs solving times, calculator usage count, and initial vs final option toggles.
2. **Deterministic Diagnostic Dossier Endpoint**: A dedicated SQLite view/endpoint (`/api/ai/diagnostic-dossier`) that computes exact stats (negative mark hemorrhage, error code distribution, syllabus decay) so the LLM receives facts instead of doing mental arithmetic.
3. **Syllabus Prerequisite Map**: Knowledge DAG connecting topics (e.g. Cache Mapping $\to$ Digital Logic Addressing) so the AI can diagnose *upstream* causes when a downstream question fails.
4. **Bi-directional MCP/API Tool Execution**: Giving the AI direct tools to adjust study plans, save flashcards, and schedule focused micro-sessions.

---

## 2. Master Execution Roadmap

### Local model study loop (2026-10-18)
- [x] Ollama and local OpenAI-compatible model discovery, connection controls, and explicit failure states.
- [x] Source-validated local analysis of completed PYQ evidence, with active exam and independent review protection.
- [x] Automatic activities in Learning Memory and Do now, eligibility rechecks, result reconciliation, and dated follow-ups.
- [x] Accuracy/pace follow-ups after repeated accurate checks; transparent 3/7/14/30-day rules.
- [x] Bounded practice history and local reconsideration of unsuccessful follow-ups without duplicating tasks or changing review dates.
- See [local-learning-engine.md](local-learning-engine.md) for verification, scope, and remaining semantic retrieval/skill mapping work.

### Connected learning workspace (2026-10-19)
- [x] Dashboard led by prepared work, due recall, upcoming checks and actual results, with unfinished practice kept visible.
- [x] Learning workflows connected to evidence, current practice, results and dated follow-ups; assistant task briefs retained.
- [x] Durable source-linked recall questions prepared automatically from eligible activities, reused across each follow-up family.
- [x] Concept Review due/upcoming queues, guidance provenance and saved-response next dates using the existing recovery scheduler.
- See [connected-learning-workspace.md](connected-learning-workspace.md) for scope and verification.

### Learning Memory foundation (usable without a paid AI API)
- [x] Versioned, searchable memory with source links, owner isolation, and evidence export.
- [x] Durable thinking capture after practice and independently resumable exam post-mortems.
- [x] Concept recall checks with saved responses, guidance-use records, and due review candidates.
- [x] Focused repairs with actual bank selection, Planner persistence, result receipts, and follow-up candidates.
- [x] Recurring learner-confirmed difficulties create a 20-minute Pattern Sprint for tomorrow.
- [x] Atomic exam submission and canonical repair result aggregation.

Implementation, verification, and remaining limits are recorded in [study-memory-build.md](study-memory-build.md).

### Connected history and session evidence
- [x] Read-only history across ten existing study source types, with bounded source inspection and owner-scoped search.
- [x] Session-wide coverage, frozen-score, confidence, topic, and timing synthesis with source-linked repair drafts.
- [x] Separate explicit skips from unsubmitted work in both the synthesis and existing detailed report.
- [x] Correct official GATE 2025 CS2 Q47 to MSQ/D for future attempts, preserving historical receipts.

Details and limitations: [study-history-and-session-evidence.md](study-history-and-session-evidence.md).

### Phase 1: High-Frequency UI & Input Precision (Current Phase)
- [ ] **1.1 Full Keyboard Navigation in Question Workspace**:
  - `1-4` or `A-D` for instant option selection.
  - `C` to clear response.
  - `Space` to toggle "Mark for Review".
  - `Enter` to lock answer and advance.
  - Target files: `src/components/pyq/PyqExamWorkspace.tsx`, `src/components/pyq/PyqPracticeAnswer.tsx`.
- [ ] **1.2 1:1 TCS iON Virtual Scientific Calculator**:
  - Authentic button layout matching GATE CBT.
  - Full physical numpad integration (`0-9`, `.`, `+`, `-`, `*`, `/`, `Enter`).
  - High-contrast visual warning banner when in Radian mode.
  - Chronological calculation audit tape to trace arithmetic slips.
  - Draggable & floating window component.
- [ ] **1.3 Question Pace & Hesitation Split Timer**:
  - Split tracking: Reading Time $\to$ Derivation Time $\to$ Sanity Check Time.
  - Subtle visual amber pulse when lingering > 2.5m (1-mark) or > 4.5m (2-mark).
- [ ] **1.4 Infinite Dark-Mode Scratchpad Overlay**:
  - Slide-over canvas (`Cmd + E`) with pen, highlighter, straight-edge ruler.
  - Vector stroke persistence saved directly to attempt record in SQLite.

### Phase 2: The Master AI Coach Engine
- [ ] **2.1 Granular Telemetry Persistence**:
  - Store split timings, calculator operations, and confidence states in SQLite schema.
- [ ] **2.2 Diagnostic Dossier Generator (`/api/ai/diagnostic-dossier`)**:
  - High-performance SQLite query aggregating:
    - Top 3 negative mark leak areas.
    - Error code ratios (`W-C` vs `W-E` vs `W-R`).
    - D3/D7/D21 spaced review debt.
    - Topic decay rates based on days since last practice.
- [ ] **2.3 In-App AI Coach Interface**:
  - Settings panel to configure AI provider (OpenAI / Anthropic / Gemini / local Ollama).
  - Floating "Coach" drawer providing:
    - 1-Click "Diagnose My Weaknesses".
    - "Generate Today's Action Plan".
    - "Socratic Mistake Audit" during question review.

### Phase 3: Closed-Loop Mistake Reduction & Ingestion
- [ ] **3.1 15-Second Reflex Recognition Cue Drills**:
  - Rapid-fire flashcard blitz mode testing boundary conditions and counter-examples.
  - Keyboard navigation (`Space` flip, `1`/`2` pass/fail).
- [ ] **3.2 Automated Test Screenshot & PDF Ingestion Studio**:
  - Python OpenCV pipeline for bounding-box detection and answer-key masking.
  - Drag-and-drop ingestion of Made Easy / Ace test papers directly into SQLite.
- [ ] **3.3 Multi-Attempt Thought Evolution Timeline**:
  - Interactive scrubber showing past attempts, time taken, and saved scratchpads side-by-side.

### Phase 4: Systems & Native Desktop Superpowers
- [ ] **4.1 Authentic TCS iON Exam Simulator (GATE 2027 Mode)**:
  - 65 questions, 100 marks, 180 minutes, official GATE CBT skin.
  - Sealed benchmark papers (GATE CSE 2026 Set 1 & 2).
  - Kiosk full-screen lock.
- [ ] **4.2 Interactive Syllabus Dependency DAG**:
  - Interactive SVG prerequisite graph color-coded by empirical accuracy.
- [ ] **4.3 Global Desktop Quick-Capture (`Cmd + Shift + H`)**:
  - Floating borderless window over any application for instant screenshot/text clipping into HETU.
- [ ] **4.4 macOS Menu Bar Focus Applet**:
  - Status bar widget showing current study block countdown and due reattempts count.

---

## 3. Progress Log

| Date | Phase | Task | Commit | Agent Summary |
|---|---|---|---|---|
| 2026-10-15 | Setup | Blueprint & Roadmap creation | `c8579cd` | Created component architecture spec and agent roadmap. |
| 2026-10-15 | Bugfix | Fix topic_progress 409 soft-delete restore error | `c0d29ed` | Allowed upsert_records to restore soft-deleted rows in mutable collections instead of throwing 409. |
| 2026-10-15 | Architecture | Cognitive AI Master Integration Specification | `c932245` | Detailed metacognitive thinking traces, pattern debugger, Socratic debrief, and schema in cognitive-ai-master-integration-spec.md. |
| 2026-10-16 | Learning foundation | Durable Learning Memory and repair practice loop | `5f840ec` | Added source-linked thinking, independent exam post-mortems, concept recall, executable repairs, Planner follow-ups, and atomic exam receipts without a paid model. Staged source: 44 frontend and 21 backend tests pass; isolated browser and packaged-runtime flows verified. See study-memory-build.md. |
| 2026-10-17 | Learning foundation | Connected source history and session evidence | `45daf10` | Connected ten original record types with search, filters, source inspection, and question/session links. Added coverage-first session synthesis and replay-safe repair drafts; separated unfinished questions from submitted skips; corrected the official CS2 Q47 bank type without rewriting attempts. Staged source: 96 frontend and 35 backend tests pass; isolated and packaged-runtime browser flows verified. See study-history-and-session-evidence.md. |
| 2026-10-18 | Local learning | Local models and automatic adaptive follow-ups | `ae8ce1f` | Added loopback Ollama/OpenAI-compatible inference, evidence-validated activities in Memory/Do now, automatic receipt reconciliation, bounded question history, and reconsideration of unsuccessful follow-ups. Passed 104 frontend and 69 backend tests plus real Qwen packaged acceptance. Rebuilt desktop app; Qwen selected locally; original attempts/reflections preserved. See local-learning-engine.md. |
| 2026-10-19 | Connected workspace | Dashboard, learning workflows and durable concept recall | `b9d98b9` | Connected prepared practice, source evidence, recall, results and next dates across the dashboard, Workflows and Concept Review. Reused one recall question per repair family while preserving answers and assistance. Staged source: 132 frontend and 77 backend tests pass; packaged recall/practice navigation and narrow layouts verified. Activated three unanswered recall checks in the local app; original evidence preserved. See connected-learning-workspace.md. |


