# Save a test analysis from ChatGPT into Hetu

The authenticated Python MCP exposes `save_test_analysis`, `list_test_analyses`
and `get_test_analysis`. The same domain serves `/v1/test-analyses` in the app.
The learner can ask in the conversation that contains their test screenshots:

> Save this test to Hetu. Log every question, save the concepts we discussed,
> formulas and recognition cues, and add every question to Re-attempts with a
> question-only screenshot. Keep the analysis and next steps together.

Open **Mocks → Saved test analyses** in Hetu to continue the review.

## What is saved

| App destination | Test handoff |
| --- | --- |
| Log / Journal | Every captured question, original answer and outcome provenance, analysis, test date and question image |
| Re-attempts / Do now | One recovery item and repeatable D3 entry per question, including correct and ungraded questions |
| Saved discussions | Full concept explanations, conversation sources and links to related questions and study evidence |
| Concept review | Pending recall prompts with empty response histories |
| Formulas | Reusable expressions linked to their saved discussions |
| Trigger drill | Recognition cues and their question and discussion links |
| Patterns | Supported recurring mistake patterns; existing mastery is preserved |
| Mocks | Reported score and consistent totals, with exam-condition evidence preserved |
| Revision Pack | Saved snapshot scoped to the test's study artifacts |
| Workflows | Resumable review steps, unresolved questions, missing details and save receipt |
| Planner / Weekly review / Syllabus | Optional validated follow-up actions when current versions and relevant facts are available |
| Heatmap / Calibration / Readiness | Existing views derive results from actual stored evidence |

Correct or ungraded questions remain practice work without inflating the mistake
surface. A failed retrieval makes that practice entry count as recovery work.
Unknown original outcomes are stored as `U` and do not become wrong answers.
Unknown question timing is labelled unknown, and the original test date is used
in the Journal and weekly evidence. Saved notes do not establish mastery.

## Screenshot input and answer concealment

The MCP tool declares `_meta["openai/fileParams"] = ["screenshots"]`. ChatGPT
supplies file objects containing `download_url`, `file_id`, and optional
`mime_type` and `file_name`, following the
[OpenAI file-parameter reference](https://developers.openai.com/plugins/reference).
This is a top-level file parameter alongside the structured `draft`.

Each question identifies its file using zero-based `screenshot_index`. A
`question_crop` has normalized `x`, `y`, `width` and `height` between zero and
one, measured in the orientation-corrected screenshot. Several question crops
may use the same file. For a clean original, `image_is_question_only=true` can
replace the crop. An uncropped image without this confirmation is rejected.

The tool downloads a trusted HTTPS ChatGPT file, validates its image content,
crops and compresses it, and persists the JPEG in the existing question record.
It does not store the expiring URL. Downloads are bounded to 10 MiB, supported
PNG/JPEG/WebP images to 20 megapixels, and stored images to 650 KiB.

Cropping removes an answer panel only when it lies outside the selected
question rectangle. It cannot safely undo highlighted correct options or
selected answers embedded inside the question. Use an unmarked original for
those cases. If a clean image is unavailable, save the transcribed question for
text practice and keep the missing screenshot visible in the report.

Saved-test lists and detail responses omit image bytes. The app fetches an
individual image through an authenticated, owner-scoped endpoint when its
question opens. The re-attempt prompt omits `answer_text` and `learner_answer`.
The app conceals saved solutions until the learner explicitly reveals them.
Every real retrieval gets its own history entry; the original test result stays
unchanged. A definitive MCQ/MSQ/NAT key can be checked; freeform explanations
and missing keys require an explicit learner self-check.

## Retries, later batches and persistence

Use one stable `test_key` and local refs such as `Q7`, `cache-offset`,
`offset-bits` and `byte-addressed-cache`. Creation uses `expected_version=0`.
After a successful save, read the report before adding another batch. Supply
its current `expected_version`; existing question, formula, cue or mock edits
also require their current versions. Previously saved artifacts remain linked.

Each batch requires an `idempotency_key`. A retry with the same key and content
returns the original receipt, even after later edits. Refreshed signed URLs are
accepted for the same file IDs. Reusing the key for different content fails
with 409. A repeated initial import with identical content and the same test
identity also replays instead of duplicating the test. Concurrent imports are
serialized by the owner's existing recovery lock.

All artifact writes, history, follow-up actions, report, revision pack and the
durable receipt commit in one database transaction. A failed crop, stale
version, invalid reference or overfilled Planner action rolls back the batch.
After commit, a scoped sync broadcast refreshes existing app tables without
broadcasting screenshot bytes. Ownership comes from the authenticated account;
neither the tool nor the request chooses another owner.

## Verification boundary

Domain, authenticated HTTP/MCP, UI, screenshot and PostgreSQL concurrency tests
cover persistence, retries, ownership, cropped image bytes, answer concealment,
repeated retrievals and test-scoped packs. Public MCP configuration is checked
with `backends/python/scripts/verify_mcp_connection.py`.

A real ChatGPT OAuth grant and screenshot save require the learner's connected
account. Local transport tests and passing discovery checks do not establish
that the learner has completed that account flow. See
[MCP connection instructions](hetu-mcp-connection.md).
