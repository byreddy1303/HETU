# Connected learning workspace

Built 2026-10-19. The dashboard, Workflows, Concept Review, Learning Memory and Do now now read the same saved learning activities and results.

## Dashboard

The dashboard starts with a real prepared action, its evidence, the recall question connected to it, and an unfinished practice set when one exists. Upcoming checks keep their dates and appear separately from work due now. The side panels show the due recall queue and links to learning workflows and saved assistant task briefs. Recent practice evidence appears when available. Existing practice statistics, saved discussions and the minimal core-only account view remain available.

Loading and service failures have distinct states; failed requests do not become zero counts or a claim that all work is complete. Queue counts are labelled as partial when the bounded backend queue is incomplete. Background learning updates refresh the page, with bounded polling while analysis is running.

## Learning workflows

Workflows now leads with study work: saved evidence, the focused activity, a recorded practice result where present, and the next dated check. Ready/due and upcoming filters separate the schedule. Start practice rechecks current question eligibility; paused linked practice resumes its saved session. Each workflow links to its activity and durable recall question. The latest ten automatic practice verifications are shown separately, with actual judged/submitted/skip counts and next-review links.

Existing assistant task briefs retain their goal, corrections, pending/completed steps, version checks and write receipts. Study-workflow progress comes from the persisted learning records rather than a second checklist that could disagree with practice.

## Durable concept recall

An eligible open local-engine repair automatically produces a source capture, an assistant-hypothesis insight/concept page, and a recall question in the existing concept/recovery store. The engine catches up existing activities before preparing new work and connects newly generated activities after applying them. An explicit **Prepare recall from activities** control supports retrying catch-up.

The prompt asks the learner to explain the saved study target, when its method applies, and how to check it. It is constructed from the model's target; it is not a new verified lesson or a canonical answer key. Suggested evaluation guidance is labelled unverified and is withheld from the queue/detail response until help has been recorded. The question links back to the original activity.

One originating repair family owns one recall question. Later practice follow-ups reuse it without resetting answers, guidance-use evidence, edits, or the recall schedule. An archived question is not automatically recreated. Source receipts must be owned, completed, reliably scored and in their session's selected questions. Active/paused exams hold recall preparation and the queue. Completed exam sources require answer reveal or completed independent review. Changed or unavailable source receipts are held for inspection.

Concept Review separates due and upcoming questions. Saving a response gives explicit confirmation and its next due date. The existing recovery scheduler, sprint validation, response idempotency and assistance tracking still apply. Ratings are explicitly self-assessments; neither an unaided answer nor a correct rating certifies mastery. This milestone does not add model grading of free-text answers.

## Verification

Staged source passed 132 frontend tests across 24 suites and 77 backend tests. TypeScript, targeted ESLint, Ruff and macOS desktop packaging passed. Packaged acceptance used the bundled Python runtime/backend and compiled UI against an isolated copy of the workspace database. It verified automatic creation of three recall questions, dashboard and workflow links, current practice eligibility, an unaided response, assistance after guidance, changed next-review dates, and replay without duplicates. All three pages passed a 390px overflow check with no browser errors or server failures.

The learner's real attempts and reflections were not used for synthetic answer submissions. Acceptance responses remain only in the isolated test database.

The rebuilt app was activated in the local workspace on 2026-10-19. Catch-up prepared three recall questions (page replacement, context switching and MMU responsibilities), each with zero submitted recall responses. Original attempt and reflection rows matched the pre-activation backup, the paused practice was retained, and SQLite's quick integrity check returned `ok`. A mobile header specificity fix keeps the alternate logo hidden at 390px and correctly bounded to 39px at 340px.

Related implementation: [local learning engine](local-learning-engine.md), [Learning Memory foundation](study-memory-build.md).
