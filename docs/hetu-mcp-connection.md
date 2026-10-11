# HETU MCP connection and section actions

The Python service exposes authenticated MCP at `/mcp` when the resource URL,
Clerk OAuth issuer and approved client IDs are configured. The local plugin
package still targets `http://localhost:8000/mcp`; it is a development package.

## Current live status — 2026-10-11

The production app uses Clerk and Neon; its migration and independent restore
evidence is recorded in [PRODUCTION.md](../backends/python/docs/PRODUCTION.md).
That historical verification does not establish current service availability.
The Python deployment for implementation commit `d7dbed6` reached Vercel `READY`
and was assigned `hetu-python-api.vercel.app`. Public connection checks still
failed after that deployment.

The live `/health/ready` returned 503. Vercel runtime logs reported an
`asyncpg.exceptions.InsufficientResourcesError` with the database provider's
message: “Your account or project has exceeded the quota. Upgrade your plan to
increase limits.” The logs do not identify which quota was exceeded. Restore
database capacity before testing an authenticated connection.

The production MCP metadata URL returned 404, and the Vercel environment list
did not contain `MCP_RESOURCE_URL`, `CLERK_OAUTH_ISSUER` or
`MCP_ALLOWED_CLIENT_IDS`. The existing production Clerk instance has no custom
OAuth scopes or applications; CIMD publication and resource audience inclusion
are disabled. PKCE is enabled and opaque OAuth access tokens are selected.
No live ChatGPT grant, save, reload or reconnect has been verified.

## Production configuration

Use the existing production Clerk application and its mapped HETU accounts.
Do not create a replacement login application or remap owner IDs.

Configure these server variables on the Python Vercel project:

```dotenv
MCP_RESOURCE_URL=https://hetu-python-api.vercel.app/mcp
CLERK_OAUTH_ISSUER=https://hetu-app.vercel.app/__clerk
MCP_ALLOWED_CLIENT_IDS=https://chatgpt.com/oauth/client.json
APP_URL=https://hetu-app.vercel.app
```

Keep the existing server-only Clerk credentials and restricted database role.
The backend verifies the OAuth client, scope, mapped subject, expiry and exact
resource audience. A website session token is not an MCP OAuth grant.

For Clerk OAuth configuration:

1. Add the custom `hetu:read` and `hetu:write` scopes.
2. Pre-register the ChatGPT public client from
   `https://chatgpt.com/oauth/client.json`, with callback
   `https://chatgpt.com/connector_platform_oauth_redirect` and the required HETU
   scopes. Allow `offline_access` for reconnects; do not request account metadata
   scopes for HETU study operations.
3. Publish Client ID Metadata Documents (CIMD) and restrict authorization to
   pre-registered clients. Keep PKCE required and opaque access tokens enabled.
4. Enable resource audience inclusion and the learner consent flow. The audience
   must equal `https://hetu-python-api.vercel.app/mcp`.
5. Verify the issuer's public discovery document after saving settings, then
   deploy the Python configuration and code. Preserve the existing data-safety
   gates and maintenance policy.

Run this read-only check from `backends/python`:

```bash
.venv/bin/python scripts/verify_mcp_connection.py \
  --resource-url https://hetu-python-api.vercel.app/mcp \
  --issuer https://hetu-app.vercel.app/__clerk
```

It checks database readiness, protected-resource discovery, supported read/write
scopes, exact issuer/audience, S256, public-client authentication, CIMD and the
unauthenticated MCP challenge. It exits with status 1 if any check fails.
Passing establishes public configuration only. The final verification requires
the real account's ChatGPT OAuth consent, a saved discussion, retrieval in the
app, an edit with preserved history, and retrieval after reconnecting.

## New shared actions

The same typed Python domain serves `POST /v1/study-actions` and these MCP tools:

| Tool | Behavior | Existing evidence preserved |
| --- | --- | --- |
| `save_formula` | Create or revise a named formula and expression | Review count and review schedule |
| `save_recognition_cue` | Save a cue and concept; optionally link owned Journal questions | Measured reflex time |
| `update_journal_analysis` | Annotate an existing question with provenance; optionally complete linked PYQ analysis | Actual answer, outcome, score and timing |
| `set_syllabus_progress` | Mark reported study coverage or reopen a topic | Historical revisions; no mastery award |
| `save_weekly_review` | Save a reflection and concrete fix for a Monday week | Existing record identity and history |
| `edit_planner_day` | Add, edit, split, remove or reorder unstarted blocks | Existing commitments and execution metadata |

Read the current section record before editing. Supply `expected_version` for
section records and `expected_revision` for a Planner day; use 0 only for
creation. A successful result includes the persisted record, a receipt and an
app link. The account comes from the authenticated subject, not tool input.

Each write requires an `idempotency_key` and `hetu:write`. Retry an uncertain
request with the same key and unchanged payload. A replay returns the original
operation's snapshot even after later edits. Reusing a key with different content
fails with 409. Read the section again to obtain its latest state.

Planner uses the app's existing DayPlan shape and requires known available
minutes and a protected buffer for a new day. It rejects capacity overflow,
overlapping times, blocks outside recorded availability, stale edits and changes
to started work. Split a block by editing the original and adding the remaining
blocks in one action. Tool errors retain the conflict details needed to replan.

Journal analysis explicitly labels `learner_reported` or
`assistant_hypothesis`. Formula saves, cues, weekly reflections and syllabus
coverage do not fabricate exam attempts, successful drills or mastery.

These actions extend the existing Library, workflows, concept review, PYQ,
recovery and revision-pack tools. Whole-app operation remains incomplete: timed
PYQ sets, question-level mock analysis, Buddy sharing, owner administration and
other domain actions are still tracked in the implementation checklist.
