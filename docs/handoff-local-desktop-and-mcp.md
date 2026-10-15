# Handoff: 100% Local Desktop App & Native MCP Integration

**Date**: 2026-10-15  
**Latest Commits**: 
- `bf43398`: feat(desktop): package standalone macOS desktop app with SQLite WAL and zero-auth engine
- `23893dc`: fix(desktop): fix backend startup crash, auth bypass, and route matching
- `e227252`: feat(mcp): add local stdio mcp server for desktop and chatgpt integration
**Branch**: `main` (synchronized with `origin/main`)  
**Artifacts Built**: `release/mac-arm64/HETU.app`, `release/HETU-0.1.0-arm64.dmg`

---

## 1. What Shipped & Why

HETU was originally architected as a distributed cloud SaaS (Vercel Edge, Neon Serverless Postgres in Singapore, Upstash Redis, Clerk OAuth 2.0). For a single learner preparing for GATE CS, this caused unnecessary latency, cold starts, screenshot upload limits, and complex OAuth handshakes for MCP.

We successfully transformed HETU into a **100% self-contained local desktop application** with **native Model Context Protocol (MCP)** support for ChatGPT Plus and other AI agents:

1. **Instant Desktop App**: Built on Electron with embedded Python backend child process and SQLite WAL. Click the app icon, and it launches immediately with zero server management or terminal commands required.
2. **Local SQLite Engine**: Stored at `~/Library/Application Support/hetu/hetu.db`. Reads and writes take < 1ms on NVMe SSD. Zero cloud bills.
3. **Native MCP Server (`stdio`)**: Built on the open MCP standard (`backends/python/app/mcp_local.py`). Connects directly to the ChatGPT macOS app, Claude Desktop, Cursor, or ChatGPT Web without manual data entry.
4. **Automated Test Question Ingestion**: AI automatically analyzes test screenshots, crops out answer keys/spoilers, catalogs the error type (`W-C`, `W-E`, `W-R`, `RBS`, `RBG`), logs questions into the Journal, and queues them for Day 3 and Day 7 spaced re-attempts.

---

## 2. Key Components & Architecture

### 2.1 File Map
| Component | File | Purpose |
|---|---|---|
| **Electron Main Process** | `electron/main.cjs` | Spawns Python backend, manages window lifecycle, checks `http://127.0.0.1:8765/health`, handles graceful shutdown. |
| **Electron Preload** | `electron/preload.cjs` | Secure context bridge exposing platform, version, and desktop flags to renderer. |
| **Frontend Router** | `src/router.tsx` | Dual-mode router: uses `createHashRouter` when running from `file://` in Electron, `createBrowserRouter` during Vite dev. Eliminates routing errors in packaged builds. |
| **FastAPI Backend** | `backends/python/app/main.py` | Serves REST endpoints, runs in `ENVIRONMENT=local` mode with SQLite WAL and auto-provisioned `local_user`. |
| **Local MCP Server** | `backends/python/app/mcp_local.py` | Standalone stdio MCP server for ChatGPT / Claude Desktop with local single-user bypass (`local_user`). |
| **Test MCP Tools** | `backends/python/app/mcp_test_tools.py` | Implements `save_test_analysis`, `list_test_analyses`, `get_test_analysis` with automated bounding box cropping. |
| **Study MCP Tools** | `backends/python/app/mcp_study_tools.py` | Implements `save_question`, `get_journal_question`, `update_journal_analysis`, `save_formula`, `save_recognition_cue`, `set_syllabus_progress`, `save_weekly_review`, `edit_planner_day`, `get_planner_day`. |
| **Packaging Config** | `package.json` | Bundles `backends/python` and `.venv` inside `extraResources`, configures `electron-builder` for macOS arm64. |

### 2.2 Local Storage & SQLite WAL
* **Database path**: `~/Library/Application Support/hetu/hetu.db` (macOS)
* **Mode**: Write-Ahead Logging (`WAL`) enabled for high-concurrency between Electron app reads and MCP server writes.
* **Identity**: `local_user` (bypasses Clerk authentication entirely).

---

## 3. Registered MCP Tools (17 Tools)

| Tool Name | Type | Description |
|---|---|---|
| `save_test_analysis` | Write | Atomic ingestion of test screenshots; crops questions, logs to Journal, schedules D3 re-attempts. |
| `list_test_analyses` | Read | Lists historical test analyses and incomplete screenshot records. |
| `get_test_analysis` | Read | Retrieves test analysis details, scores, and questions. |
| `save_question` | Write | Ingests standalone questions, answers, options, and error tags (`W-C`, `W-E`, etc.). |
| `get_journal_question` | Read | Reads a question from the Journal by ID. |
| `update_journal_analysis`| Write | Annotates existing Journal questions with deeper root cause reflections. |
| `save_formula` | Write | Creates or revises formulas in the Formulas catalog. |
| `save_recognition_cue` | Write | Saves reflex recognition cues and trigger drills. |
| `set_syllabus_progress`| Write | Toggles chapter and topic completion in the Syllabus. |
| `save_weekly_review` | Write | Saves weekly performance metrics and Monday focus commitments. |
| `get_planner_day` | Read | Retrieves the study plan and blocks for a given date. |
| `edit_planner_day` | Write | Adds, edits, splits, or removes study blocks. |
| `search_knowledge` | Read | Searches concepts and notes by query or subject. |
| `get_concept` | Read | Retrieves full explanation and prerequisite links for a concept. |
| `save_to_hetu` | Write | Saves ideas and notes from conversations into HETU knowledge. |
| `get_profile` | Read | Returns the active local user profile (`local_user`). |
| `get_capabilities` | Read | Returns supported schema versions and operational capabilities. |

---

## 4. Verification & Testing

1. **Local MCP Protocol**:
   - Tested MCP initialization (`2024-11-05`), JSON-RPC over `stdio`, and tool listing.
   - Tested direct tool invocation via pytest in `backends/python/tests/test_mcp_local.py` (passed).
2. **Backend Engine**:
   - Verified FastAPI startup without Clerk dependencies in `local` mode.
   - Verified threadpool static asset delivery and dual routing.
3. **App Packaging**:
   - `npm run desktop:build` completed successfully.
   - Verified standalone `.app` and `.dmg` created in `release/`.

---

## 5. How to Run & Use

### Running the Desktop App
```bash
# Launch packaged app
open release/mac-arm64/HETU.app

# Or run in development mode
npm run desktop
```

### Connecting to ChatGPT Plus (macOS Desktop App)
Create `~/Library/Application Support/OpenAI/ChatGPT/mcp_servers.json`:
```json
{
  "mcpServers": {
    "hetu": {
      "command": "/Users/bkalyankrishnareddy/Desktop/hetu/backends/python/.venv/bin/python",
      "args": ["-m", "app.mcp_local"],
      "cwd": "/Users/bkalyankrishnareddy/Desktop/hetu/backends/python",
      "env": {
        "ENVIRONMENT": "local",
        "DATABASE_URL": "sqlite+aiosqlite:////Users/bkalyankrishnareddy/Library/Application Support/hetu/hetu.db"
      }
    }
  }
}
```
Restart ChatGPT for Mac (`Cmd + Q`). The 17 HETU tools will appear under the tools icon.

### Connecting to ChatGPT Web (`chatgpt.com`)
1. Keep the HETU desktop app running (API on `http://127.0.0.1:8765`).
2. Run tunnel:
   ```bash
   npx cloudflared tunnel --url http://127.0.0.1:8765
   ```
3. In ChatGPT Web, create a Custom GPT with Action using `https://<tunnel-url>/openapi.json`.

---

## 6. Known Items / Next Slices

1. **Automated SQLite Backups**: Add a periodic snapshot cron or iCloud Drive / Google Drive symlink to keep `~/Library/Application Support/hetu/hetu.db` backed up off-device.
2. **Windows Packaging**: When building on Windows, execute `npm run desktop:build:win` with the bundled Python Windows virtualenv.
3. **In-App MCP Status Badge**: Add a small indicator dot in HETU's top navigation bar that turns green when the local backend/MCP server receives writes.
