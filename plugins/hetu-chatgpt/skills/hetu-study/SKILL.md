---
name: hetu-study
description: Use a connected HETU account to save sourced learning, retrieve concept detail, record actual recall, or resume a study task. Applies when the user asks to operate HETU.
---

# Operate HETU

Read `get_capabilities` before choosing actions. If a requested operation is unavailable, say which part remains unfinished. The available section tools expose mapped underlying records; their counts are not a complete section inventory or a computed readiness score.

For a multistep request, use a task brief to preserve the original goal, constraints, corrections, completed work, and pending work. Retrieve account evidence and full records where summaries are insufficient. Make a reasonable reversible choice for minor ambiguity; ask only when a missing fact materially changes the outcome.

For “Save to HETU,” use the available conversation content. Capture distinct ideas under the right subject, topic, and concept. Include the full useful explanation, intuition, conditions, examples, recognition cues, unresolved questions, and sources when supported. Mark a reasoning mistake as learner stated only if the learner actually expressed it; otherwise label a tentative explanation or general pitfall. Reuse the same idempotency key on retries. Confirm the saved concept can be retrieved before reporting completion. When multiple saved concepts are meaningfully connected, use `link_saved_concepts` with a short explanation; model a prerequisite as `prerequisite_for` and avoid cycles.

Do not infer completed study, exam correctness, mastery, capacity, or external message delivery from a conversation. Record a concept response only after the learner supplies an actual answer, and preserve assistance and evaluation provenance. Check persisted results and give the user a concise receipt with links and remaining work.

For PYQ practice, search the versioned catalog, then show question detail with the answer hidden until the learner answers or asks for an explanation. Save only an actual answer or skip through `submit_pyq_answer`, preserving whether time was measured, reported, or unknown. An attempted answer is scored by the Python bank; inspect its persisted receipt and integrity status before explaining correctness. A missing mark allocation or quarantined key is unscorable. Individual ChatGPT answers appear in the app's PYQ history. Use recovery tools for follow-through from actual attempts. Set assembly and timed exam sessions remain unavailable as MCP actions.

When a saved discussion explains an existing mistake or study artifact, use `search_study_evidence` to find the relevant owner-scoped record and `get_study_evidence` for full context. Connect it using `link_study_evidence` with a supported rationale; retry with the same key and provide `expected_version` for edits or deactivation. Read the saved concept again to verify its evidence links. A connection records relevance and does not establish recall or mastery.

Use `save_formula`, `save_recognition_cue`, `update_journal_analysis`, `set_syllabus_progress`, and `save_weekly_review` for their named sections. Inspect existing records and versions before editing. Use expected version 0 only for a new record. Label journal analysis as learner reported or an assistant hypothesis; preserve the actual outcome, answer and timing. Mark syllabus coverage only from reported study; do not equate coverage with mastery. Saving a formula or cue does not record a successful review or drill.

Use `edit_planner_day` to add, edit, split, remove or reorder unstarted blocks. Read the complete existing day, its revision, availability and commitments first. A new day requires known available minutes and a protected buffer; obtain those from the learner when absent. Split by editing the original block and adding the remaining blocks in one action. An overlap, overfilled day or stale revision is an unresolved conflict; revise the plan using current facts. Keep the same idempotency key and payload for uncertain retries. After a confirmed edit, read the current planner day to verify it; an old replay receipt is the original operation's snapshot, not the latest day.

For recall and recovery, use persisted sessions and checkpoints. Record assistance before displaying a hint or solution. Submit only an actual learner response, and retain self/assistant assessment provenance. A reading session, early review, hinted answer or repeated example does not establish unaided delayed recall or unseen transfer.
