# Practice with less administration

Implemented 2026-11-15 for the local desktop workspace. This extends the existing
PYQ, Learning Memory, skill, recall, and follow-up systems without a model account.

## Daily use

- Commit an answer and continue. The attempt, response, outcome, and active time
  still save automatically. Confidence is optional; an answer no longer implies
  high confidence. Optional quick flags record uncertainty, a difficult step,
  useful reasoning, or help after the answer is revealed.
- Finish a set for a short review of at most three moments. Save one assessment
  or note, leave it for later, and return through **Review → Mistake repairs →
  Short reviews**. The detailed thinking review remains available.
- **Knowledge → Notebook session** saves source, question numbers, outcomes,
  optional notes, and one optional photo together. Self-reported paper outcomes
  stay distinct from server-graded PYQs. Unreported timing and confidence remain
  unknown. Saved photos open on demand in the session history.
- **Review → Mistake repairs** prepares three original exercises per supported
  mistake group. Draft selections survive reopening. Keys and explanations stay
  hidden until submission; submitted answers are immutable and retry-safe.
- A fully correct round schedules a check after 3, 7, 14, then 30 days; an
  unresolved round returns the next day. The schedule is a transparent heuristic.
  Where eligible bank questions exist, a successful round prepares a linked
  fresh application activity using the existing repair pipeline. Topic matching
  is approximate. **Mix methods** takes one unfinished question from each of up
  to six ready packs and hides the family cue until feedback.
- **My principles** keeps a learner-confirmed rule, its conditions, and a boundary
  case linked to the source observations. Proposed explanations appear after
  completing a pack; they are not a diagnosis of the learner's reasoning.
- **Today → Build a balanced session** allocates 10–60 minutes across retrieval,
  one repair, fresh mixed bank questions, and a short review. Allocations sum to
  the chosen budget. Completed steps persist; missed days do not multiply tasks.
  Durations are planning estimates, and completion checks are learner reports.
- **Progress → Practice evidence** separates new exercises answered without
  reported help, delayed checks, unknown assistance, recent family outcomes, and
  qualified timing samples. Existing skill evidence remains the source for
  reviewed bank application. Exam strategy experiments save a first-pass
  checkpoint and review reserve, show a quiet reminder in the timed workspace,
  and display completed-exam aggregates without changing answers or auto-skipping.

## Each future HETU chat visit

The user explicitly requested a standing local mistake-log check. The repository
and current task workspace `AGENTS.md` record that request. Run:

```sh
python3 scripts/practice-visit.py --include-context
```

The helper verifies loopback local storage, reads the log, prepares supported
packs, and reports uncovered groups. It retains existing packs, drafts, and due
dates. `--inspect-only` performs no writes. This runs when an assistant actively
handles a HETU visit; it is not a background chat-open trigger.

The initial catalog covers address translation, page faults/replacement, MMU
permissions, context switches, Hamming distance, CRC, Ethernet backoff, window
protocols, stop-and-wait throughput, and regular-language witnesses. Exercises
are original and assistant-reviewed, never represented as official PYQs. Fixed
recognition cases recur; numeric variants repeat after seven rounds. Exact
exercise fingerprints prevent those repetitions counting as new exposures.

For uncovered groups, inspect source attempts/reflections through the local API,
solve and check two or three original exercises, and submit this shape to
`POST http://127.0.0.1:8765/v1/practice-coach/authored-packs`:

```json
{
  "group_id": "group ID returned by the local overview",
  "questions": [
    {
      "prompt": "A complete original problem with explicit assumptions",
      "choices": ["First choice", "Second choice"],
      "answer": 0,
      "explanation": "Checked reasoning for the zero-indexed correct choice",
      "kind": "recognition"
    },
    {
      "prompt": "An original application or boundary case",
      "choices": ["First choice", "Second choice"],
      "answer": 1,
      "explanation": "Checked reasoning for this case",
      "kind": "boundary"
    }
  ],
  "principle": "The distinction these exercises practise",
  "conditions": "When the rule applies",
  "counterexample": "A case outside those conditions",
  "source_url": "",
  "provenance": "Assistant-authored original practice; not official PYQs"
}
```

Never submit answers on the learner's behalf. The endpoint cannot replace an
existing pending pack. Individually authored questions are retained across later
rounds rather than silently replaced with catalog questions. Source association,
learner assessment, and an assistant's hypothesis must remain distinct.

## Data and boundaries

`practice_coach_private` is owner-scoped and inaccessible through the generic
records API. Domain routes validate drafts, stale versions, immutable answers,
and replay identities. Keys are redacted in pack responses. Photos live in
separate private records and are excluded from routine history reads. Long-lived
packs/principles remain available beyond the bounded recent receipt window.

Coaching and pack preparation stop during active or paused exams. Unrevealed
completed-exam questions do not seed mistake exercises. Notebook observations
and after-answer flags never rewrite historical PYQ receipts. The existing
SQLite backup/recovery workflow includes the new private records.

The recent-history window is bounded at 2,500 records per collection and reports
incompleteness. It cannot establish exposure outside HETU. Micro-drill timing is
the current foreground interval, excluding hidden-tab time; reloading starts a
new interval. Assistance is self-reported. Counts do not certify mastery, compare
matched difficulty, establish learning gains, or predict a rank. Unmapped mistake
families require individually checked content rather than a fabricated diagnosis.

## Verification

Frontend, backend, desktop, responsive browser, and packaged-app results are
recorded with the release in `supercharged-local-roadmap.md`. The browser flow
uses an isolated temporary database. Real-workspace verification preserves the
original study records and leaves all newly prepared drills unanswered.
