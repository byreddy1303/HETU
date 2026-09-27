# HETU ChatGPT plugin: product and behavior specification

Status: design specification; no plugin, MCP endpoint, or new app feature has been implemented by this document.
Date: 2026-09-27.
Implementation handoff: [hetu-chatgpt-plugin-handoff.md](hetu-chatgpt-plugin-handoff.md).

## 1. User intent and agreed direction

The user wants ChatGPT to operate HETU competently across the entire application.
They should describe an outcome in ordinary language, including a vague statement,
and ChatGPT should determine the relevant context, use the appropriate sections,
carry out the necessary actions, and check the result. The user should not need to
name sections, tools, database fields, or intermediate steps.

The user's central requirement is: "anything related to hetu it should be able to
do it for me efficiently in every section" and "without losing the main context."
The request includes identifying overlooked needs and using multiple sections
intelligently. Maximum capability means completing the intended outcome well;
it does not mean performing the maximum number of actions.

Agreed product decisions:

- Cover all HETU sections, with reads and meaningful writes wherever applicable.
- Support any learning subject. Include the existing GATE taxonomy and allow
  custom subjects, topics, and concepts without forcing them into that taxonomy.
- Make "Save to HETU" the default conversation-capture phrase. Equivalent natural
  language works too; exact wording is not required.
- Save on an explicit save request and return an editable receipt with links.
- Provide concise initial views with expandable, substantial explanations.
- Support connected account workflows and user-supplied exports or materials.
- Infer reasonable details, use existing preferences, and avoid routine approval
  loops or making the user design the workflow.
- Complete design and a durable handoff before implementation with the user's
  chosen GPT-5.6 model. Do not interpret this document as a request to change models.

## 2. Operating behavior

For a request, the assistant should:

1. Identify the desired outcome, explicit constraints, relevant prior conversation,
   and any corrections the user has made.
2. Retrieve the account context needed to interpret the request. Inspect actual
   records when a summary is insufficient, including freshness and completeness.
3. Form a compact task brief: intended outcome, relevant constraints, assumptions,
   affected concepts or records, and a definition of success.
4. Choose the smallest complete workflow across the required HETU sections.
5. Execute actions in dependency order. Retrieve independent data together when
   useful; avoid concurrent conflicting writes.
6. Check for missing prerequisites, conflicting records, duplicate notes, unrealistic
   capacity, stale information, and unresolved uncertainty relevant to this task.
7. Verify durable results and their linked effects, not merely tool-call success.
8. Give a concise receipt: what changed, why it serves the request, links, and any
   unresolved item. Offer details without requiring the user to read a tool log.

The task brief records user-facing intent and decisions, not private model reasoning.
User corrections update it; they do not get lost beneath the original plan. Existing
constraints persist across tool calls and resumed work. The assistant may revise
its approach when evidence changes while preserving the original objective.

### Ambiguous requests

Use the conversation, saved learning records, recent activity, goals, and preferences
to infer what the user means. Prefer reversible, useful steps when a detail is minor.
State consequential assumptions briefly rather than asking about every parameter.

Ask a focused question only when unresolved ambiguity would materially change the
outcome, affect a different person, cause an irreversible action, or require facts
the assistant cannot obtain. Continue independent useful work while waiting.

Do not invent records, capacity, deadlines, understanding, or evidence to fill gaps.
When multiple interpretations are plausible, distinguish the supported interpretation
from a tentative hypothesis. A vague request is not permission for unrelated actions.

Examples of intended behavior:

| User request | Intelligent workflow |
| --- | --- |
| "I keep forgetting OS." | Inspect OS coverage, mistakes, saved explanations, and retrieval history; identify the likely weak concepts; prepare targeted recall and fit appropriate work into known capacity when planning is part of the request. Do not dump all OS notes. |
| "Make tomorrow useful." | Use tomorrow's known availability, due reviews, incomplete work, and priorities; save a coherent plan using established preferences; surface a material missing constraint only if needed. |
| "I finally get it. Save this." | Resolve what "it" refers to from the available conversation; save the insight, the reasoning change, and a useful retrieval cue; extend the matching concept; do not mark mastery from that statement alone. |
| "Fix my probability mess." | Inspect organization, duplicates, contradictions, and relevant performance evidence; improve reversible organization and explanations; target the identified gaps without rewriting unrelated subjects. |
| "Continue where we left off." | Retrieve the relevant saved workflow and learning context, identify completed and pending steps, and resume without repeating completed writes. Ask only if several prior tasks are equally plausible. |

## 3. Coverage across every section

This is the target coverage, not a claim of existing MCP tools. Each implementation
phase must publish accurate supported capabilities. New sections should join the
same coverage contract rather than remaining permanently UI-only.

| Section | Read, reason, and act |
| --- | --- |
| Dashboard | Retrieve summaries and underlying records; explain changes; investigate apparent improvement; follow recommendations through to the relevant actions. |
| Do now | Inspect the queue, time, due work, and priorities; select and initiate a suitable activity; reflect real completion or deferral. |
| Planner | Create, modify, split, move, remove, template, and reschedule blocks; account for capacity, buffer, prerequisites, review debt, and existing commitments; reconcile execution. |
| Sessions, manual logging, quick capture | Create and resume supported sessions; record actual answers or reported activity; attach notes and sources; distinguish measured from self-reported duration. |
| PYQ practice | Search and inspect bank questions and metadata; assemble sets; explain and tutor; accept answers; record actual attempts through canonical scoring; link misconceptions and recovery work. |
| Mock tests | Launch supported exams, import results, inspect individual outcomes, diagnose pace and decisions, and create follow-up work. Preserve the actual test conditions and answer provenance. |
| Journal | Read and update question-linked analysis, reflections, causes, and triggers; link conversation insights; correct analysis while preserving underlying attempt evidence. |
| Patterns | Find and explain recurring reasoning problems with supporting examples; create, revise, combine, or retire pattern descriptions; distinguish suspected causes from observed recurrence. |
| Re-attempts and recovery | Run retrieval, record actual responses and hints, grade supported answers, reschedule, reopen, remediate, and assign transfer practice; extend to concept retrieval. |
| Weekly review | Compare plans and actual work, include saved conversations, identify a useful upstream fix, save reflections, and carry requested actions into planning. |
| Heatmap | Retrieve the evidence behind cells; distinguish low coverage, mistakes, slow work, and forgetting; drill into causes and initiate appropriate learning work. |
| Calibration | Compare confidence, answer/skip decisions, correctness, and pace; identify observed decision habits; create targeted exercises and reflection. |
| Readiness | Explain and recompute app calculations from evidence; inspect qualification and missing evidence; evaluate priorities; preserve uncertainty and avoid invented rank predictions. |
| Topper notes and references | Find and retrieve accessible source content, explain it, attach personal annotations, track reading, and connect material to concepts and practice. Preserve source attribution and distinguish annotations from source content. |
| Revision pack | Assemble brief or detailed packs across notes, formulas, patterns, questions, and due concepts; tailor to a topic, timeframe, or time budget; export supported formats. |
| Syllabus tracker | Read and update coverage, map learning to topics, identify prerequisites, and connect notes and evidence; distinguish studied, practised, and demonstrated understanding. |
| Trigger drill | Create and revise recognition cues, run mixed drills, record responses, and connect cues to concepts, formulas, and situations in which they fail. |
| Formulas | Create, read, edit, organize, archive, and review formulas with variable definitions, units, assumptions, derivations, intuition, examples, and exceptions. |
| Learning Library (new) | Capture, retrieve, edit, link, merge, split, archive, and restore insights; inspect source captures and revision history; preserve the learner's evolving understanding. |
| Topic pages (new) | Maintain a coherent explanation from linked insights, prerequisites, examples, open questions, and evidence; support connections across subjects without duplicate copies. |
| Buddy | Read accessible conversations and shared items; prepare explanations, share selected content, and send messages when requested; respect relationship access. |
| Settings and notifications | Read and change supported preferences, goals, timezone, defaults, and reminder settings; expose connection state; identify device steps that remote tools cannot complete. |
| Exports, imports, and recovery | Export supported data, analyse supplied exports, import with duplicate/conflict handling, inspect revision history, and restore supported records with explicit results. |
| Account administration | Expose invitations, access requests, and other supported owner operations to an authenticated owner; manage and revoke the plugin connection. |

For derived views such as Heatmap and Readiness, the write action is an appropriate
change to the underlying records followed by recomputation, not an arbitrary edit
of the displayed number. Historical evidence corrections need an explicit correction
trail; a discussion must not fabricate an exam result or a completed study session.

## 4. Conversation capture and knowledge depth

"Save to HETU" instructs the assistant to preserve useful learning from the current
available conversation. It should resolve references such as "this explanation"
from context. Capture one coherent insight per concept or meaningful reasoning
change, linking related insights from the same discussion.

Candidate content, included only when useful and supported:

- Core point and the question or problem it answers.
- The learner's explicitly stated prior reasoning.
- The precise assumption, missing condition, or step that failed.
- The improved reasoning method and why it works.
- Intuition, analogy, mental model, derivation, or useful diagram.
- Conditions, limitations, exceptions, and counterexamples.
- Recognition cues and connections to other concepts.
- An example and a retrieval or transfer question with evaluation guidance.
- Unresolved questions or conflicting claims.
- Source references, relevant excerpts, capture time, and available conversation ID.

Do not force every insight into every field. Asking a question is not evidence of
a misconception. Clearly distinguish observed learner reasoning, tentative diagnosis,
general pitfalls, and new material supplied by the assistant. Preserve correct
reasoning and useful approaches, not only mistakes.

Use three depth layers:

1. Quick recall: core idea, important correction, and recognition cue.
2. Full understanding: substantial explanation, proof/derivation, examples,
   assumptions, connections, and accessible attachments where needed.
3. Evidence and history: relevant source material, previous versions, and later
   retrieval outcomes.

The initial display can be concise without truncating the stored explanation.
Support mathematical notation, code, tables, source excerpts, and attachments.
Full transcripts are optional rather than the default representation of learning.
Do not claim access to historical chats or truncated conversation content that is
not available to the active ChatGPT task or an authorized retrieval capability.

### Organization and consolidation

Use stable subject, topic, and concept identities. Match existing aliases before
creating entries. Support custom subjects and provisional classification when the
topic is uncertain. Place an insight in one primary location and link related topics.

Separate the source capture from the current concept explanation. A later discussion
can add detail, correct a claim, or improve an example without losing earlier context.
Repeated saves should not duplicate records; similar discussions should extend
the matching concept when warranted. Conflicts remain inspectable until resolved.

"Save to HETU" may update the Library and relevant linked learning artifacts as
one coherent operation. Appropriate review items can follow the established review
policy and available capacity. The latest user direction does not require another
fixed choice between manual and automatic scheduling: infer appropriate follow-through
from the request and existing preferences. Preserve the distinction between saving
knowledge, scheduling future work, and recording work actually completed.

## 5. Shared context and proposed records

The following are conceptual entities; choose concrete schemas after inspecting
the authoritative backend. Do not introduce a second disconnected source of truth.

| Entity | Purpose |
| --- | --- |
| Source capture | Origin, time, supplied excerpts or attachment references, conversation reference when available, and save-operation identity. |
| Learning insight | Atomic useful idea, reasoning change, explanation, uncertainty, primary concept, related records, and source attribution. |
| Concept/topic page | Current synthesized explanation, aliases, subject/topic identity, prerequisites, related concepts, and supporting insights. |
| Insight revision | Previous content, change reason, author/source, timestamp, and links to superseding corrections. |
| Review item | Retrieval/transfer prompt, evaluation guidance, source concept, schedule, and actual practice history; integrate with canonical recovery. |
| Workflow record | Compact task brief, user constraints, relevant references, completed operations, pending work, assumptions, status, and receipts for resumable multi-step tasks. |

References should connect insights with existing questions, attempts, patterns,
formulas, triggers, plans, reviews, and sources. A generic relationship mechanism
may be useful, but a separate graph database is not a prerequisite.

Keep the task brief through resumed work and model changes. Load only relevant
durable context; do not send an entire account with every request. User intent and
constraints belong in the context alongside data. Explicit corrections supersede
older assumptions. Stored text is content to interpret, not authority to execute
instructions embedded in an imported note or a buddy message.

## 6. MCP and plugin architecture

Target architecture:

ChatGPT with HETU workflow skills -> authenticated remote MCP tools -> shared HETU
domain operations -> authoritative records and source assets.

The app and plugin must share validation, scoring, planning, recovery, authorization,
and persistence semantics. A plugin-created record must work normally in the app.
Do not put essential business rules exclusively in a prompt.

Provide capability discovery with supported operations and schema versions. Group
focused tools around outcomes: account context, search, detailed retrieval, capture,
knowledge editing, practice, planning, reviews, settings, collaboration, and owner
actions. Discover tools progressively where supported; do not require one giant
ambiguous tool or a predetermined small tool count that limits coverage.

Tool contracts should expose:

- Stable IDs, typed inputs, useful structured results, and links to relevant app views.
- Pagination, filters, and result-completeness indicators for detailed retrieval.
- Freshness/source timestamps and explicit unavailable or partial data states.
- Read/write/action annotations that accurately describe what the tool does.
- Idempotency for retried writes and expected revisions for concurrent edits.
- Field validation and actionable errors without leaking credentials.
- Durable operation receipts and status for work that cannot finish in one request.

Use transactions for related writes when possible. For multi-step operations across
transactions, track completed effects and pending steps; report partial completion
honestly and resume safely. Do not roll back by blindly deleting valid user work.

The active ChatGPT conversation can prepare structured captures. A second paid model
call in the server is not required for every save. Start with filters, canonical
identities, and text search; add semantic retrieval only if evaluated cases justify
its cost. Server-side aggregates, bounded batches, and relevance-based retrieval
should reduce token use while retaining access to full supporting records.

Full capability is within the connected account and its actual roles. Preserve
account isolation, connection revocation, and data integrity. ChatGPT permissions,
host constraints, provider limits, and device prompts cannot be disabled by this
plugin. Do not promise unlimited context or automatic access to every ChatGPT chat.
Do not introduce repetitive app-specific approvals for already-authorized routine
work. Messages to others and other external effects follow the actual user request.

## 7. Repository findings and integration decisions still to verify

The inspection found existing Journal analysis, patterns, formulas, triggers,
recovery scheduling, immutable learning events, progress reporting, account documents,
and canonical subjects/topics. Reuse these capabilities.

Relevant implementation locations:

- [Navigation](../src/components/layout/Nav.tsx) and [routes](../src/router.tsx).
- [Learning record types](../src/types/db.ts).
- [Current record repository](../src/lib/db.ts) and [write boundary](../src/lib/sync.ts).
- [Subjects](../src/lib/subjects.ts) and [topics](../src/lib/subtopics.ts).
- [Planner storage](../src/lib/planner-storage.ts) and [cloud writes](../src/lib/planner-cloud.ts).
- [Revision packs](../src/lib/revision-pack.ts), [recovery](../src/lib/recovery-engine.ts),
  and [longitudinal learning](../src/lib/longitudinal-learning.ts).
- [Account state](../src/lib/account-state.ts) and [account documents](../src/lib/account-documents.ts).
- [Exports](../src/lib/progress-export.ts) and [backup handling](../src/lib/backup.ts).
- [Backend status](../backends/README.md) and [Python release gates](../backends/python/docs/DATA_SAFETY.md).

Important correction to the older README's local-first description: inspected
`src/lib/db.ts` describes a RAM cache with write-through durable database storage,
despite its Dexie-shaped API. Inspect each store rather than assuming all data is
in IndexedDB or all account documents have identical persistence behavior.

At inspection, backend documentation says production uses the legacy backend and
Python is not cleared for cutover. The working tree also contains pre-existing
uncommitted FastAPI/Clerk adapter work. Verify actual runtime state before choosing
where to add the MCP boundary. Do not commit that unrelated work, migrate accounts,
or enable an incomplete backend just to make the plugin reachable.

Outstanding engineering decisions are backend placement, compatible OAuth connection,
exact schemas, source-content extraction, and environment/deployment configuration.
These are implementation investigations, not reasons to reduce the agreed coverage.

## 8. Implementation sequence

Deliver vertical workflows with visible coverage status. Phases are delivery order,
not permanent restrictions on the plugin.

1. **Establish the integration boundary.** Inspect authoritative persistence and
   current changes; inventory section operations; choose a backend seam; define
   authentication, shared domain APIs, migration strategy, and capability reporting.
2. **Complete capture and retrieval.** Implement the Learning Library, source and
   revision handling, topic organization, searching, structured capture, and a real
   authenticated MCP connection. Prove save -> app display -> new-chat retrieval.
3. **Complete the learning loop.** Connect insights to Journal, patterns, formulas,
   triggers, revision packs, practice, and recovery; evaluate reasoning extraction
   and maintain distinct content, activity, and performance evidence.
4. **Complete planning and diagnosis.** Cover Planner, Do now, sessions, mocks,
   weekly review, syllabus, heatmap, calibration, readiness, and multi-section tasks.
5. **Complete the remaining app operations.** Cover Buddy, settings, reminders,
   imports/exports, supported restoration, and owner administration; verify every
   section against the capability inventory.
6. **Package and validate across intended surfaces.** Install the plugin, verify
   authentication and reconnection, test in ChatGPT Work, document actual limits,
   and prepare distribution appropriate to the user's account.

Do not label the overall plugin complete when only capture works. Each phase should
leave a precise list of shipped, tested, and outstanding operations.

## 9. Acceptance criteria

Evaluate outcomes and durable records, not only whether the assistant chose a tool.

| Scenario | Required result |
| --- | --- |
| Vague request | Uses relevant evidence and preferences to choose useful actions; asks only about a consequential unresolved ambiguity. |
| Cross-section request | Completes necessary operations across sections with consistent links and a unified receipt. |
| Context preservation | Keeps time limits, subject, learner goal, and user corrections through multiple calls and resumption. |
| Ordinary conversation save | Saves meaningful ideas, reasoning corrections, intuition, and sources under appropriate topics with working links. |
| Long explanation | Preserves essential derivations/examples beyond a brief summary and retrieves full details on demand. |
| Learner asks a question | Does not label the question itself as a demonstrated misconception. |
| Repeated save/retry | Produces no duplicate captures, schedules, or plan blocks for the same operation. |
| Later improved understanding | Updates the current explanation while keeping prior sources and revision history. |
| Contradictory sources | Exposes the conflict and uncertainty rather than silently asserting one claim as established. |
| Multi-topic discussion | Splits coherent insights, assigns primary locations, and links related topics without redundant copies. |
| Custom subject | Saves and retrieves material outside the GATE syllabus. |
| Retrieval and transfer | Records actual responses, assistance, and outcomes; explanation capture alone does not award mastery. |
| Capacity-aware follow-through | Integrates requested review/practice with known commitments and flags infeasible capacity. |
| Data completeness | Distinguishes no records from unavailable, stale, or partially retrieved records. |
| Concurrent app edit | Detects a stale revision and reconciles or requests a meaningful decision without overwriting newer work. |
| Interrupted multi-step write | Reports completed and pending effects and resumes without repeating completed mutations. |
| Account boundary | Two-account tests establish that private data and owner-only operations do not leak across accounts. |
| Requested buddy message | Sends the requested content to the resolved recipient and records actual delivery status; a normal save does not send messages. |
| Export/import | Preserves supported records, links, and revisions; detects duplicates and reports unsupported content. |
| Whole-app coverage | Every section has an explicit tested capability entry, including derived views and their legitimate underlying writes. |

Synthetic fixtures belong in tests. The delivered connected workflows must use real
provisioned integrations and report actual persistence. A mock demo is not completion.

## 10. Official integration references

Checked during design on 2026-09-27; recheck current contracts during implementation.

- [Plugin quickstart](https://developers.openai.com/plugins/quickstart).
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server).
- [Authenticate users](https://developers.openai.com/plugins/build/auth).
- [Define focused tools](https://developers.openai.com/plugins/plan/tools).
- [Package a plugin](https://developers.openai.com/plugins/build/plugins).
- [ChatGPT Work permissions](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security).
