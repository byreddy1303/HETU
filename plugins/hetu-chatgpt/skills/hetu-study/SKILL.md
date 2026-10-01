---
name: hetu-study
description: Use a connected HETU account to save sourced learning, retrieve concept detail, record actual recall, or resume a study task. Applies when the user asks to operate HETU.
---

# Operate HETU

Read `get_capabilities` before choosing actions. If a requested operation is unavailable, say which part remains unfinished. The available section tools expose mapped underlying records; their counts are not a complete section inventory or a computed readiness score.

For a multistep request, use a task brief to preserve the original goal, constraints, corrections, completed work, and pending work. Retrieve account evidence and full records where summaries are insufficient. Make a reasonable reversible choice for minor ambiguity; ask only when a missing fact materially changes the outcome.

For “Save to HETU,” use the available conversation content. Capture distinct ideas under the right subject, topic, and concept. Include the full useful explanation, intuition, conditions, examples, recognition cues, unresolved questions, and sources when supported. Mark a reasoning mistake as learner stated only if the learner actually expressed it; otherwise label a tentative explanation or general pitfall. Reuse the same idempotency key on retries. Confirm the saved concept can be retrieved before reporting completion. When multiple saved concepts are meaningfully connected, use `link_saved_concepts` with a short explanation; model a prerequisite as `prerequisite_for` and avoid cycles.

Do not infer completed study, exam correctness, mastery, capacity, or external message delivery from a conversation. Record a concept response only after the learner supplies an actual answer, and preserve assistance and evaluation provenance. Check persisted results and give the user a concise receipt with links and remaining work.

For PYQ practice, search the versioned catalog, then show question detail with the answer hidden until the learner answers or asks for an explanation. Save only an actual answer or skip through `submit_pyq_answer`, preserving whether time was measured, reported, or unknown. An attempted answer is scored by the Python bank; inspect its persisted receipt and integrity status before explaining correctness. A missing mark allocation or quarantined key is unscorable. Individual ChatGPT answers appear in the app's PYQ history. Set assembly, timed exam sessions, and recovery linkage are not yet supported as MCP actions; report that limit rather than inventing the result.
