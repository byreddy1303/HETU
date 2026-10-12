# HETU MCP connection and section actions

The Python service exposes authenticated MCP at `/mcp` when the resource URL,
Clerk OAuth issuer and approved client IDs are configured. The local plugin
package still targets `http://localhost:8000/mcp`; it is a development package.

## Current connection checks — 2026-10-12

Public checks now return HTTP 200 for `/health/ready` (database and Redis `ok`)
and `/.well-known/oauth-protected-resource/mcp`. The resource document advertises
the production MCP audience, the proxied Clerk issuer and both HETU scopes. The
issuer's `/__clerk/.well-known/oauth-authorization-server` advertises CIMD,
S256 and public-client token authentication. CIMD is advertised in OAuth
authorization-server metadata; it need not appear in OIDC discovery.

For ChatGPT's **Add custom MCP server** form, use:

- Server URL: `https://hetu-python-api.vercel.app/mcp`.
- Authentication: OAuth with Client ID Metadata Documents (CIMD).
- Scopes: `hetu:read hetu:write offline_access`.
- Client ID/secret: leave manual credentials empty when using CIMD.

In the production Clerk application's **Paths → Component paths**, select
application-domain pages and save these URLs:

| Field | URL |
| --- | --- |
| Sign-in | `https://hetu-app.vercel.app/auth` |
| Sign-up | `https://hetu-app.vercel.app/signup` |
| Signing out | `https://hetu-app.vercel.app/auth` |
| OAuth consent | `https://hetu-app.vercel.app/oauth-consent` |

The form supplies `https://` itself. Leaving sign-in unset can send an OAuth
request to the unavailable `accounts.hetu-app.vercel.app` account portal.

### An app-styled 404 at `/__clerk/oauth/authorize`

The previous production PWA worker treated Clerk authorization navigations as
app routes. It served cached `index.html`, and React rendered HETU's 404 even
though the server correctly returned an OAuth redirect. Clerk and discovery
paths must bypass both the PWA navigation fallback and the SPA rewrite. Sign-in
must preserve Clerk's `redirect_url`, and a server continuation requires a full
document navigation. The consent route also retains its original query if a
signed-out user must sign in first; return destinations are restricted to
same-origin OAuth paths.

After building, verify the actual generated service worker in Chromium:

```sh
npm run build
node scripts/verify-pwa-auth-routing.mjs
```

This uses a local server and synthetic OAuth parameters without granting
account access. It checks that authorization and discovery reach the server,
while sign-in and consent keep the app fallback and query parameters. After a
release, reopen the website to receive the updated worker, close the failed
OAuth window, and start **Authenticate** again in ChatGPT. A private browser
window can also test without a previously cached worker.

These public and browser routing checks do not verify a real user's completed
ChatGPT grant, save or reconnect. Those still require the final account flow.

### A JSON parsing error on the Clerk consent screen

An error such as “Unexpected non-whitespace character after JSON at position 4”
can result from Clerk returning plain-text `404 page not found` for a malformed
consent API path. ChatGPT's CIMD client ID is a URL. Its slashes must remain
percent-encoded in `/v1/me/oauth/consent/{client_id}`. The Python proxy forwards
the original ASGI `raw_path` and query bytes instead of rebuilding the path
from FastAPI's decoded route parameter. This applies to both fetching the
consent information and submitting the user's decision. Regression tests are
in `backends/python/tests/test_clerk_proxy_paths.py`.

## Historical live status — 2026-10-11

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

For a completed test analyzed from screenshots, use `save_test_analysis` to
coordinate every-question Journal logging and repeat practice, sourced saved
discussions, formulas, cues, recall prompts, a test revision pack and a resumable
Workflow. Retrieve it using `list_test_analyses` and `get_test_analysis`; the app
shows **Mocks → Saved test analyses**. Screenshot files are persisted as cropped
question images with answers kept separate. See
[the test handoff guide](test-analysis-handoff.md) for retries and later batches.

These actions extend the existing Library, workflows, concept review, PYQ,
recovery and revision-pack tools. Whole-app operation remains incomplete: timed
PYQ sets, Buddy sharing, owner administration and other domain actions are still
tracked in the implementation checklist.
