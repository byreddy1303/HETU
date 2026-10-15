# HETU Local Desktop: Supercharged Component Blueprint & Architecture

**Document Version**: 1.0.0  
**Target Goal**: GATE CSE 2027 AIR < 100  
**Execution Context**: 100% Self-Contained Local Desktop Application (macOS / Electron / SQLite WAL / Python FastAPI / Local MCP)

---

## 1. The Local-First Desktop Paradigm Shift

When transitioning from a cloud SaaS (Vercel Edge, Neon Singapore, Upstash Redis, Clerk OAuth) to a **100% local desktop architecture**, traditional web constraints disappear completely.

| Dimension | Cloud SaaS (Old) | 100% Local Desktop (New) |
|---|---|---|
| **Query Latency** | 50ms – 250ms per roundtrip | **0.2ms – 1.0ms** (NVMe SSD SQLite WAL) |
| **Storage Limits** | Tier caps, thumbnail compression, AWS S3 bills | **Unlimited local disk** (high-res screenshots, PDFs, audio notes, full raw canvas vector strokes) |
| **Data Safety & Privacy** | Multi-tenant auth, public cloud leak risks | **100% air-gapped**; all data stays on user's machine |
| **Operating System Access** | Sandboxed in browser tab | **Global hotkeys**, system tray/menubar, clipboard listeners, native filesystem watch |
| **Compute & AI** | Expensive API tokens, rate limits, edge timeouts | **Zero-cost local pipelines**: OpenCV cropping, local OCR, sentence-transformers, local Whisper, stdio MCP |
| **Offline Reliability** | Breaks without internet connection | **100% functional offline** anywhere, anytime |

---

## 2. Tiny Components: Atomic Precision & Ergonomics

Tiny components are the high-frequency touchpoints where seconds and cognitive load accumulate. Making them hyper-detailed and functional transforms HETU into an extension of the aspirant's reflexes.

### 2.1 1:1 TCS iON Scientific Calculator (Native Floating Component)
*GATE is notoriously unforgiving with arithmetic and unit conversions. Practicing with standard OS calculators breeds fatal exam-day habits.*
* **Exact Interface**: Exact pixel layout and button arrangement of the official GATE TCS iON virtual calculator.
* **Full Keyboard Numpad Binding**:
  * Number keys `0-9`, `.`, `+`, `-`, `*`, `/`, `Enter` (`=`), `Backspace`.
  * Dedicated hotkeys for common GATE functions: `s` for $\sin$, `c` for $\cos$, `l` for $\ln$, `g` for $\log_{10}$, `p` for $\pi$, `e` for Euler's $e$.
* **Deg / Rad Mode Visual Guard**: High-contrast warning banner when in Radian mode to prevent degree-trigonometry blunders.
* **Calculation Audit History**: Keeps a chronological scroll of all calculations performed during the current question attempt, allowing immediate post-mortem detection of where an arithmetic slip occurred.
* **Persistent Memory Display**: Dedicated badges showing `M+`, `M-`, and current `MR` value.

### 2.2 Question Answer Input & Hesitation Tracker
* **MCQ Mode**:
  * Keyboard navigation: `1` / `2` / `3` / `4` or `A` / `B` / `C` / `D` to toggle options.
  * `C` to clear selection immediately.
* **MSQ Mode (Multiple Select Question)**:
  * Checkbox matrix with partial confidence tagging: Aspirant can mark an option as *Confident* vs *Tentative* during solving.
  * Prevents "all-or-nothing" panic by visually tracking which options are derived vs guessed.
* **NAT Mode (Numerical Answer Type)**:
  * On-screen virtual keypad + physical keyboard support.
  * Unit display chip (e.g. `ns`, `KB`, `cycles`, `decimal places`).
  * Boundary preview: Displays integer vs decimal format expectations without spoiling the solution.
* **Pace & Hesitation Split Timer**:
  * Tracks three distinct split phases for every question:
    1. *Reading & Parse Time*: From question load until first scratchpad stroke or option interaction.
    2. *Computation Time*: Active solving and calculation phase.
    3. *Review & Verification Time*: Time spent verifying the answer before final lock.
  * Visual Pace Indicator: Subtle border color transition if time on a 1-mark question exceeds 2.5 minutes or 2-mark question exceeds 4.5 minutes.
* **Cognitive State Selector (Post-Answer Tagging)**:
  * One-tap tags:
    * 🟢 *Rock Solid* (Instant deductive proof)
    * 🟡 *50-50 / Elimination* (Eliminated two choices, picked between remaining)
    * 🟠 *Instinct / Pattern Match* (Felt correct without formal proof)
    * 🔴 *Hesitant / Time Sink* (Struggled, took excessive time)

### 2.3 The Infinite Dark-Mode Scratchpad / Canvas
*GATE provides physical scribble pads. A digital equivalent must feel immediate and zero-friction.*
* **Instant Toggle**: Press `Cmd + E` or click scratchpad pill to slide in a canvas overlay beside or over the question.
* **Hardware Acceleration**: Smooth 120Hz canvas rendering with Apple Pencil / stylus tablet / trackpad support.
* **Layer Persistence**: The canvas drawing is serialized to vector paths/PNG and permanently attached to that specific attempt record in SQLite.
* **Quick Tools**: Pen, highlighter, straight-line ruler (crucial for DAGs, tree structures, and timing diagrams), grid/ruled background toggle, 1-click erase.

### 2.4 Error Taxonomy Micro-Pills
*Instant categorization of mistakes without breaking flow.*
* **Taxonomy Codes**:
  * `W-C`: Conceptual Gap (didn't know theorem/definition)
  * `W-E`: Execution / Calculation Error (arithmetic slip, formula misapplication)
  * `W-R`: Reading Slip (missed "NOT", "FALSE", "distinct", "minimum", "at least")
  * `RBS`: Right by Sound Reasoning (verified correct logic)
  * `RBG`: Right by Guess (lucky correct — treated as a mistake requiring review!)
* **Micro-Prompt Field**: One-line prompt: *"What single keyword or constraint did you miss?"*.

### 2.5 Spaced Repetition (FSRS / SM-2) Rating Bar
* **Four Tactile Buttons**:
  * `Again` (1 Day) — Complete blackout or conceptual failure.
  * `Hard` (3 Days) — Struggled, correct only after hints or excessive time.
  * `Good` (7 Days) — Solved with standard effort and correct logic.
  * `Easy` (21 Days) — Instant reflex recall; zero hesitation.
* **Dynamic Date Previews**: Hovering over each button displays the exact calendar date of the next scheduled appearance.

### 2.6 Inline KaTeX / Mathematical Symbol Bar
* **Instant Chip Insertion**: Quick-insert buttons for discrete math, algorithms, and theory of computation:
  * Set Theory: $\in, \notin, \subseteq, \cup, \cap, \emptyset$
  * Logic: $\forall, \exists, \neg, \land, \lor, \implies, \iff$
  * Asymptotics: $\mathcal{O}, \Omega, \Theta, o, \omega$
  * Automata: $\Sigma, \epsilon, \delta, \to, \vdash$
  * Linear Algebra: $\lambda, \det(A), A^T, \text{rank}(A)$

---

## 3. Medium Components: Cohesive Functional Blocks

Medium components connect atomic inputs into complete feedback loops.

### 3.1 Multi-Attempt Diff & Evolution Timeline
*Understanding how your reasoning evolves across attempts is critical to avoiding recurring traps.*
* **Horizontal Attempt Scrubber**:
  * Visualizes every previous attempt on the question: Date, Time Taken, Selected Option, Outcome (Correct/Wrong), Error Code.
* **Attempt Comparison Diff**:
  * Side-by-side comparison of:
    * Attempt 1 (e.g. Day 0: Wrong, `W-R`, selected B, took 210s)
    * Attempt 2 (e.g. Day 3: Correct, selected D, took 85s)
  * Displays saved scratchpads side-by-side to verify if derivation speed improved.

### 3.2 15-Second Reflex & Recognition Cue Flashcards
*GATE rankers solve 1-mark theory questions in under 30 seconds by instinct.*
* **Format**: Split-second micro-prompts testing boundary conditions and counter-examples.
  * *Example Front*: "If language $L$ is context-free, is $L^*$ always context-free?"
  * *Example Back*: "YES. Context-free languages are closed under Kleene star."
  * *Example Front*: "Can Dijkstra's algorithm handle negative edge weights without negative cycles?"
  * *Example Back*: "NO. Even with no negative cycles, Dijkstra can produce wrong shortest paths."
* **Rapid-Fire Blitz Mode**: 20 cues in 5 minutes with keyboard flip (`Space`) and pass/fail (`1`/`2`).

### 3.3 Test Series Screenshot & PDF Auto-Ingestion Studio
*A major time sink is manually typing or clipping questions from Made Easy / Ace test series.*
* **Drag-and-Drop Ingestion**:
  * Drag any test result PDF or screenshot folder into the app window.
* **Automated Python Processing (`OpenCV` + Local OCR)**:
  1. Detects question bounding boxes and splits multi-column layouts.
  2. Masks out answer keys and score summaries to preserve blind reattempts.
  3. Extracts question text, options, and question number via local OCR.
  4. Automatically stores cropped image files in `~/Library/Application Support/hetu/screenshots/`.
  5. Populates the Journal queue ready for review.

### 3.4 Dynamic Daily Planner & Spaced Debt Injector
* **Available Capacity Slider**: Set available hours for today (e.g. 4.5 hours).
* **Automated Debt Estimation**:
  * Scans SQLite for questions due today (D3, D7, D21).
  * Calculates exact estimated time: e.g. "8 reattempts due = ~28 minutes".
* **One-Click Buffer Injection**: Automatically slots reattempt blocks into the morning schedule before new topic learning.
* **Adaptive Rollover**: If an evening block was missed yesterday, it flags the backlog and offers an optimized catch-up schedule.

### 3.5 Formula & Counter-Example Vault
*Standard formula sheets are insufficient; GATE tests counter-examples and edge cases.*
* **Dual Card Structure**:
  * *Formula / Theorem Side*: Mathematical statement and parameter constraints.
  * *Counter-Example / Trap Side*: The classic false-generalization that GATE questions exploit.
* **Active Recall Testing**: "Blur Mode" where variables or boundary conditions are blacked out until clicked.

---

## 4. Large Components: Dedicated Workspaces & Operating Engines

Large components provide complete operational environments for practice, diagnosis, and scheduling.

### 4.1 Authentic TCS iON Exam Simulator (Official GATE Environment)
*Complete environmental conditioning for the real exam.*
* **Pixel-Accurate Interface**:
  * Candidate info panel and countdown timer in top right (HH:MM:SS with color warnings).
  * 65 Questions, 100 Marks, 180 Minutes.
  * Section Blueprint:
    * General Aptitude (10 Questions, 15 Marks: Q1-Q5 1-mark, Q6-Q10 2-mark)
    * Core CS + Engg Mathematics (55 Questions, 85 Marks: Q11-Q35 1-mark, Q36-Q65 2-mark)
* **Standard Navigation States**:
  * 🔘 Not Visited (Grey)
  * 🔴 Not Answered (Red)
  * 🟢 Answered (Green)
  * 🟣 Marked for Review (Purple)
  * 🟣🟢 Answered & Marked for Review (Purple with small green badge — scored by GATE rules)
* **Sealed Benchmark Papers**:
  * GATE CSE 2026 Set 1 and Set 2 papers locked and protected from practice sessions.
  * Accessible only as authentic uncompromised mock runs.
* **Kiosk Distraction-Free Lock**: Full-screen mode disabling notifications and distractions during mock execution.

### 4.2 Syllabus Dependency DAG & Empirical Mastery Graph
*Replaces static checklists with an interactive prerequisite knowledge network.*
* **Interactive Node DAG (SVG/Canvas)**:
  * Nodes represent Subjects $\to$ Units $\to$ Topics.
  * Directed edges show hard prerequisites (e.g., *Digital Logic: Number Systems* $\to$ *COA: Data Representation* $\to$ *COA: ALU*).
* **Color Coding by Empirical Evidence**:
  * 🟢 **Mastered** (>85% first-attempt accuracy, at least 15 PYQs attempted)
  * 🟡 **Solid / In Practice** (70% - 85% accuracy)
  * 🔴 **Vulnerable Surface** (<70% accuracy or multiple `W-C` tags)
  * ⚪ **Unattempted**
* **Instant Drill Launch**: Clicking any node opens a filtered PYQ practice session for that exact topic.

### 4.3 Post-Mortem Test Diagnostics & Negative Hemorrhage Analyzer
*Scores alone don't explain rank; mistake surface analysis does.*
* **Negative Mark Hemorrhage Calculation**:
  * Quantifies exact marks lost to negative penalties:
    $$\text{Hemorrhage} = \text{Negative Marks Deducted} + \text{Potential Marks Missed}$$
  * Generates actionable insight: *"Eliminating reading slips (`W-R`) on this paper would elevate your score from 62.33 to 71.66 (AIR ~180 to AIR ~45)."*
* **Cognitive Error Distribution**: Pie/Donut breakdown of `W-C`, `W-E`, `W-R`, `RBS`, and `RBG`.
* **Question Weight Vulnerability Matrix**: 1-mark vs 2-mark accuracy split across subjects.

### 4.4 Global Quick-Capture Overlay (`Cmd + Shift + H`)
*A native desktop superpower: capture learning moments from any PDF or browser without switching windows.*
* **Spotlight-Style Floating Window**: Press `Cmd + Shift + H` anywhere in macOS.
* **Features**:
  * Take immediate screenshot snip of screen.
  * Paste copied question text or formula.
  * Assign quick subject tag and error code.
  * Hit `Enter` to save directly to local SQLite database in under 200ms.
  * Seamless return to reading.

### 4.5 Local MCP Command Center & Socratic Agent Co-Pilot
*Connects ChatGPT, Claude Desktop, Cursor, or local LLMs (Ollama) to your local HETU engine.*
* **Socratic Post-Mortem Debrief**:
  * When a question is logged as wrong, local AI doesn't give away the solution.
  * Prompts: *"What premise did you assume regarding cycle detection in directed vs undirected graphs?"*
* **Automated Trigger Drill Generation**:
  * AI creates 3 custom reflex flashcards specifically targeting your identified `W-R` or `W-C` mistakes.
* **Local In-App Status Monitor**: Visual status dot in the header indicating local MCP tool executions and health.

---

## 5. Technical Architecture & Local Integration Matrix

```
+------------------------------------------------------------------------------------+
|                                macOS Desktop                                       |
|                                                                                    |
|  +------------------------+   Global Hotkey   +---------------------------------+  |
|  | Menu Bar / Tray Widget | <---------------+ | Quick Capture Modal             |  |
|  | (Focus Block, Reviews) |  (Cmd+Shift+H)    | (Screen Snip, Instant Log)      |  |
|  +------------------------+                   +---------------------------------+  |
|              ^                                                 |                   |
|              |                                                 v                   |
|  +-------------------------------------------------------------------------------+ |
|  | Electron Desktop App (Renderer: React 18 + Tailwind CSS + Lucide + KaTeX)     | |
|  |                                                                               | |
|  |  +--------------------+  +--------------------+  +-------------------------+  | |
|  |  | TCS iON Simulator  |  | 4,334 PYQ Matrix   |  | Interactive Scratchpad  |  | |
|  |  | (65Q/180m/100M)    |  | (Sub-ms FTS5/Tags) |  | (Apple Pencil / 120Hz)  |  | |
|  |  +--------------------+  +--------------------+  +-------------------------+  | |
|  |  +--------------------+  +--------------------+  +-------------------------+  | |
|  |  | Journal & FSRS     |  | Syllabus DAG Graph |  | Post-Mortem Diagnostics |  | |
|  |  | (D3/D7/D21 Queue)  |  | (Prerequisite Map) |  | (Hemorrhage Calculator) |  | |
|  |  +--------------------+  +--------------------+  +-------------------------+  | |
|  +-------------------------------------------------------------------------------+ |
|                                       | (IPC / localhost:8765)                     |
|                                       v                                            |
|  +-------------------------------------------------------------------------------+ |
|  | Python 3.12 Backend Engine (FastAPI + Pydantic + aiosqlite + Pillow/OpenCV)   | |
|  |  - Auto-crop test screenshots & local OCR processing                          | |
|  |  - Full FSRS Spaced Repetition Scheduling Algorithm                           | |
|  |  - Sub-millisecond JSON query & sync pipelines                                | |
|  +-------------------------------------------------------------------------------+ |
|                     |                                         ^                    |
|                     v                                         | (stdio JSON-RPC)   |
|  +---------------------------------------+   +-----------------------------------+ |
|  | Local SQLite WAL Database             |   | Local stdio MCP Server            | |
|  | `~/Library/Application Support/hetu/` |   | (`mcp_local.py`)                  | |
|  |  - `hetu.db` (Write-Ahead Logging)    |   |  - ChatGPT Mac App                | |
|  |  - Automatic hourly local rotation    |   |  - Claude Desktop                 | |
|  |  - Full FTS5 search index             |   |  - Cursor / Local LLM (Ollama)    | |
|  +---------------------------------------+   +-----------------------------------+ |
+------------------------------------------------------------------------------------+
```

---

## 6. Implementation Prioritization Roadmap

### Phase 1: High-Frequency UI & Input Precision (Immediate Impact)
1. **Full Keyboard Navigation in PYQ Workspace**:
   * Add `1-4` / `A-D` option selection, `C` to clear, `Space` to flag, `Enter` to advance.
2. **Integrated TCS iON Scientific Calculator Component**:
   * Build floating, draggable, 1:1 replica with full physical numpad binding and Radian warning.
3. **Pace & Hesitation Split Timer**:
   * Add split-phase tracking (Reading vs Solving vs Verifying) into `PyqExamWorkspace` and `PyqPracticeSheet`.
4. **Instant In-App Scratchpad Overlay**:
   * Implement canvas overlay with pen/eraser and attempt-level persistence.

### Phase 2: Closed-Loop Mistake Reduction & Ingestion
1. **Reflex Recognition Cue Drills**:
   * Add 15-second rapid-fire flashcard blitz mode into `TriggerDrill.tsx`.
2. **Screenshot & PDF Auto-Ingest Studio**:
   * Integrate Python OpenCV auto-cropping endpoint to slice test question screenshots directly into Journal cards.
3. **Multi-Attempt History & Diff Viewer**:
   * Surface prior attempts, timing diffs, and previous scratchpad notes when re-attempting a question.

### Phase 3: Desktop Native Ergonomics
1. **Electron Global Quick-Capture (`Cmd+Shift+H`)**:
   * Register global hotkey to summon borderless capture window for instant clipping.
2. **System Tray / Menu Bar Focus Applet**:
   * Add live countdown for current Pomodoro/study block and count of due reattempts in the macOS menu bar.
3. **In-App Local MCP Status Indicator**:
   * Add glowing green pulse indicator in `Nav.tsx` confirming local MCP and SQLite WAL health.
