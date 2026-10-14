# Architecture Handoff: Migrating HETU from Cloud SaaS to a 100% Local Desktop App (macOS & Windows)

**Date**: 2026-10-14  
**Project**: HETU (High-Efficiency Test Understanding & Spaced Retrieval System for GATE CS)  
**Target Audience**: Astra (Senior Systems & Desktop Architect)  
**Objective**: Review the current cloud architecture and design the optimal transition to a completely local, zero-cloud desktop application for 1–2 users (Mac & Windows) with native Local Storage and full Model Context Protocol (MCP) support.

---

## 1. Executive Summary & Why We Are Pivoting

HETU is an active study workspace built specifically for GATE Computer Science preparation. It tracks question attempts, mistake DNA (conceptual, calculation, misread, formula, strategy), spaced retrieval schedules (Day 3 / Day 7 re-attempts), syllabus progress, and daily study planning.

### The Problem with the Current Cloud SaaS Stack
1. **Extreme Over-Engineering for 2 Users**:
   * The app is only used by the primary author (macOS) and their friend (macOS/Windows).
   * It currently relies on a distributed multi-tenant cloud architecture:
     * Frontend: Vercel Edge (`hetu-app.vercel.app`)
     * Backend: FastAPI on Vercel Serverless in Singapore (`sin1`)
     * Database: Neon Lakebase Serverless PostgreSQL (AWS `ap-southeast-1`)
     * Cache & PubSub: Upstash Redis
     * Authentication: Clerk OAuth 2.0 with opaque bearer tokens (`oat_...`)
2. **Latency & Micro-Delays**:
   * Every interaction (loading PYQ sets, checking off syllabus nodes, viewing attempt history, opening question review) required roundtrips across multiple cloud vendors.
   * Cold starts, database connection pooling, and Vercel lambda execution limits (10s–60s) created noticeable click friction.
3. **Storage Quotas & Screenshot Friction**:
   * Test screenshots (from online test series like Made Easy, ACE, etc.) had to be compressed below 650 KiB and serialized into database rows due to serverless upload limits.
4. **Cloud MCP Frustrations**:
   * ChatGPT/Claude connecting to MCP over public HTTPS required Clerk OAuth 2.0 handshake validation, redirect URI matching, and token expiration handling.

### The New Vision: 100% Local Desktop Application
* **Zero Cloud Bills & Zero Infrastructure Ops**: No Vercel, Neon, Upstash, or Clerk accounts.
* **Instantaneous Latency**: Reads and writes to local SQLite on an NVMe SSD take **< 1ms**.
* **Direct File System Storage**: Full-resolution test screenshots saved locally in `~/Library/Application Support/Hetu/images/` (Mac) or `%APPDATA%\Hetu\images\` (Windows).
* **Native Local MCP**: Direct `stdio` pipe connection to Claude Desktop, Cursor, Antigravity, and local LLMs, plus a 1-command localhost tunnel for ChatGPT Web.
* **Data Ownership & Privacy**: A single SQLite file (`hetu.db`) that can be backed up to iCloud Drive, Google Drive, or a private GitHub repository.

---

## 2. Current Architecture (As-Is)

### 2.1 Repository Structure
```
hetu/
├── src/                          # Frontend (React 18, Vite, TypeScript, Tailwind CSS)
│   ├── components/               # UI components (pyq, journal, readiness, planner, etc.)
│   ├── lib/                      # Domain logic (attempt timeline, mistake DNA, sync, dexie db)
│   ├── pages/                    # Views (Pyq, Journal, Readiness, Reattempts, Planner, Syllabus)
│   └── stores/                   # State management (Zustand)
├── backends/python/              # Backend (Python 3.12, FastAPI, SQLAlchemy Async)
│   ├── app/
│   │   ├── api/routes/           # REST endpoints (/records, /sync, /test-analyses, /auth)
│   │   ├── db/                   # SQLAlchemy async engine, models (Record, RecordRevision, User)
│   │   ├── services/             # Core business logic:
│   │   │   ├── study_actions.py  # save_question, edit_planner_day, formulas, cues
│   │   │   ├── test_analysis.py  # save_test_analysis (screenshot ingest, question crops)
│   │   │   ├── recovery.py       # Spaced retrieval scheduling & re-attempt ladders
│   │   │   └── question_screenshots.py # Image download, crop, and compression
│   │   ├── mcp_server.py         # MCP server instance & OAuth verification
│   │   ├── mcp_transport.py      # Starlette HTTP transport + argument normalizer
│   │   ├── mcp_study_tools.py    # MCP study tools (save_question, edit_planner_day, etc.)
│   │   └── mcp_test_tools.py     # MCP test ingestion tools (save_test_analysis)
│   └── tests/                    # 137 unit and integration tests (pytest-asyncio)
└── docs/                         # Specifications and previous architectural handoffs
```

### 2.2 Current Data Model
The database currently uses an **Entity-Attribute-Value / Document Hybrid** table design on PostgreSQL:
* **`records` Table**:
  * `id`: UUID primary key
  * `owner_id`: User ID (from Clerk, e.g. `user_2...`)
  * `collection`: String collection name (`questions`, `planner_day_plans`, `test_analyses`, `patterns`, `formulas`, `trigger_phrases`, `weekly_reviews`, `topic_progress`, `learning_evidence`)
  * `external_id`: Stable identifier (e.g., date `2026-10-14` or question UID)
  * `version`: Monotonically increasing revision integer (for optimistic concurrency control)
  * `data`: JSONB payload containing all domain fields
  * `created_at`, `updated_at`, `deleted_at`: Timestamps
* **`record_revisions` Table**:
  * Append-only audit trail logging every change (`patch`, `before`, `after`, `created_at`, `created_by`).

### 2.3 Current MCP Capabilities
The MCP server exposes rich tools for AI models:
1. `save_question(draft)`: Ingests a single question, options, answer, outcome (`W-C`, `W-E`, `W-R`, `R`, `S`), root cause (`concept`, `computation`, `reading`, `formula`, `strategy`), pattern name, and reflex trigger sentence; automatically registers the pattern and schedules recovery.
2. `get_planner_day(plan_date)` & `edit_planner_day(draft)`: Day schedule inspection, capacity validation, non-overlapping block scheduling.
3. `save_test_analysis(draft, screenshots)`: Batch ingestion of full test screenshots, calculates `question_crop` [x, y, w, h] to strip out solution spoilers, logs all questions, generates revision packs, and schedules D3 re-attempts.
4. `update_journal_analysis(draft)`: Annotates existing questions with deeper root cause insights.

---

## 3. Key Architectural Decisions for Astra to Brainstorm

We need Astra to evaluate and propose the best concrete strategy across the following 5 dimensions:

### Dimension 1: Desktop Application Runtime & Shell
* **Option A: Tauri v2 (Rust + Native Webview + Python Sidecar)**
  * *Pros*: Tiny bundle (~15 MB), ultra-low memory usage, native macOS WebKit / Windows WebView2, fast startup.
  * *Cons*: Requires packaging Python runtime as a sidecar binary (or compiling backend logic into Rust / SQLite).
* **Option B: Electron (Node.js + Chromium + Python Child Process)**
  * *Pros*: Predictable Chromium rendering, established packaging tooling (`electron-builder`), easy integration with local Node.js or spawned Python.
  * *Cons*: Large bundle size (~120 MB), 150MB+ idle RAM.
* **Option C: Hybrid Local Service + PWA / Local Browser App**
  * *Pros*: Zero desktop framework overhead; run `hetu start` (or a double-clickable macOS `.command` / `.app` wrapper) that runs FastAPI + SQLite and opens the browser to `localhost`.
  * *Cons*: Doesn't feel like a standalone dock/taskbar app unless saved as a Chrome/Safari Web App (PWA).
* **Question for Astra**: Which packaging path provides the smoothest development, update, and multi-platform (Mac & Windows) experience for 2 users?

### Dimension 2: Local Database & Schema Transition
* Currently, the app uses PostgreSQL JSONB via async SQLAlchemy (`asyncpg` on cloud).
* SQLite has full JSON support via SQLite JSON1 functions.
* Can we switch directly to **SQLite (via `aiosqlite`)** or an embedded database like **DuckDB** or **PGlite** (embedded Postgres WASM/Node)?
* How should we store screenshot images?
  * *Recommendation*: Move away from storing base64 strings in the DB. Store original and cropped images as `.webp` files in the OS app data directory (`~/Library/Application Support/Hetu/images/`), storing only relative paths (`file_path`) in SQLite.

### Dimension 3: Local MCP Server Integration
* **For Claude Desktop / Cursor / Antigravity / Windsurf**:
  * Local MCP is natively supported via `stdio` (`python -m app.mcp_server`).
  * We can eliminate the Clerk OAuth verification layer completely when running in `stdio` or local mode (hardcode `owner_id = "local_user"`).
* **For ChatGPT Web**:
  * ChatGPT running in the web browser cannot directly reach `http://localhost`.
  * What is the cleanest, zero-friction bridge?
    * (a) Built-in Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:8000`) bundled with the app?
    * (b) ChatGPT macOS Desktop App local connector?
    * (c) Or a tiny free reverse proxy?

### Dimension 4: Authentication & Multi-User Model
* The cloud app currently uses Clerk (`user_id` mapping, OAuth tokens).
* In the local app:
  * Single user mode: Default to a default profile (`local_user`).
  * Switchable profiles: Allow switching between "User A" and "User B" in the UI settings without passwords or tokens.
  * How should we clean up the auth middleware so the frontend and backend run seamlessly without Clerk?

### Dimension 5: Data Sharing & Backup Between the Two Users
* The two users are friends studying for the same exam.
* Should they:
  1. Maintain completely independent local databases, with a 1-click **Export / Import Pack (`.hetupack` JSON + image zip)** to share question sets, mock tests, and revision notes?
  2. Or have an optional Git-based / folder-based sync (e.g., placing the SQLite file or export folder in iCloud Drive / Google Drive)?

---

## 4. Specific Deliverables Expected from Astra

Astra should review this handoff and provide:
1. **Target Architecture Specification**:
   - Chosen desktop shell and rationale.
   - Project structure for the desktop build.
   - Recommended database engine and migration plan from PostgreSQL to SQLite/local storage.
2. **Local MCP Setup Guide**:
   - Configuration files for Claude Desktop, Cursor, and ChatGPT.
   - How `stdio` transport and local HTTP transport will coexist.
3. **Phase-by-Phase Implementation Roadmap**:
   - **Phase 1: Local Backend & SQLite Decoupling** (Run local FastAPI + SQLite without Clerk or Vercel).
   - **Phase 2: Local Asset Storage** (Persist cropped screenshots to local disk instead of DB base64).
   - **Phase 3: Desktop Shell Packaging** (Bundle React frontend + backend into Mac `.dmg` and Windows `.exe`).
   - **Phase 4: Local MCP & One-Click Tunneling** (Local stdio + tunnel for ChatGPT).

---

## 5. Repository File Checklist for Astra's Inspection

* Core data models: `backends/python/app/db/models.py`
* Study actions & recovery: `backends/python/app/services/study_actions.py`
* Test analysis & question cropping: `backends/python/app/services/test_analysis.py` & `question_screenshots.py`
* MCP server & tools: `backends/python/app/mcp_server.py`, `mcp_study_tools.py`, `mcp_test_tools.py`, `mcp_transport.py`
* Frontend API client & sync: `src/lib/sync.ts`, `src/lib/api.ts`
* Frontend attempt history & timelines: `src/lib/question-attempt-timeline.ts`
