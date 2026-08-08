export type GateTipTone = 'cobalt' | 'teal' | 'violet' | 'rose' | 'marigold' | 'slate';

export interface ContextualGateTip {
  id: string;
  context: string;
  title: string;
  body: string;
  tone: GateTipTone;
}

const FALLBACK_TIP: ContextualGateTip = {
  id: 'retrieval-first',
  context: 'Study principle',
  title: 'Retrieve before you review',
  body: 'Spend two minutes writing what you remember before opening notes. The gaps you expose are the study plan.',
  tone: 'cobalt'
};

const TIPS: Record<string, ContextualGateTip> = {
  newSession: {
    id: 'session-scope',
    context: 'Session setup',
    title: 'Make the block narrow enough to finish',
    body: 'Choose one subject and a realistic question count. A completed, fully tagged block improves GATE preparation more than a broad session left half-analysed.',
    tone: 'teal'
  },
  activeSession: {
    id: 'session-exam-rhythm',
    context: 'Timed practice',
    title: 'Protect exam rhythm',
    body: 'Solve on paper without checking notes. If the opening move is still unclear after a deliberate attempt, move on and diagnose the block while tagging.',
    tone: 'teal'
  },
  sessionReview: {
    id: 'session-review-conversion',
    context: 'Session review',
    title: 'Convert every miss into a future cue',
    body: 'Record the earliest clue you overlooked, the method it should trigger, and one check that would catch the same error under exam pressure.',
    tone: 'violet'
  },
  journal: {
    id: 'journal-patterns',
    context: 'Error journal',
    title: 'Search for repeated causes, not repeated chapters',
    body: 'Two mistakes from different subjects can share one cause—reading, recall, or execution. Fix that shared process before adding more notes.',
    tone: 'cobalt'
  },
  log: {
    id: 'log-fresh-evidence',
    context: 'Question logging',
    title: 'Tag while the reasoning is still fresh',
    body: 'Capture the outcome and root cause immediately. Later reconstruction tends to hide hesitation, guesses, and the exact point where your method broke.',
    tone: 'rose'
  },
  patterns: {
    id: 'pattern-trigger',
    context: 'Pattern library',
    title: 'Attach each pattern to a visible trigger',
    body: 'Name the phrase, structure, or constraint that should make the method come to mind. A pattern without a trigger is difficult to retrieve in the exam.',
    tone: 'violet'
  },
  pyq: {
    id: 'pyq-diagnostic',
    context: 'PYQ practice',
    title: 'Use PYQs as diagnostics, not a completion counter',
    body: 'Attempt the question cold, justify your option, and study why the distractors fail. The explanation is more valuable than merely marking another year complete.',
    tone: 'teal'
  },
  planner: {
    id: 'planner-output',
    context: 'Daily planning',
    title: 'Plan an observable output',
    body: 'Write “solve 15 paging PYQs and re-attempt misses,” not “study OS.” A countable output makes the plan easier to start and honestly review.',
    tone: 'marigold'
  },
  reattempts: {
    id: 'reattempt-cold',
    context: 'Spaced re-attempts',
    title: 'Re-solve cold before revealing anything',
    body: 'Recreate the key step from memory and commit to an answer first. Recognition after seeing old work is not the same as exam-ready recall.',
    tone: 'rose'
  },
  weeklyReview: {
    id: 'weekly-constraint',
    context: 'Weekly review',
    title: 'Choose one constraint for the next seven days',
    body: 'Pick the recurring issue that costs the most marks, then define one behavior you can repeat daily. One enforced fix beats a long weak-topic list.',
    tone: 'marigold'
  },
  heatmap: {
    id: 'heatmap-priority',
    context: 'Weakness heatmap',
    title: 'Prioritise dense and recent cells',
    body: 'A loud cell deserves a short diagnostic set. Split conceptual misses from avoidable slips before deciding whether the remedy is revision or timed practice.',
    tone: 'slate'
  },
  calibration: {
    id: 'calibration-confidence',
    context: 'Answer calibration',
    title: 'Train the decision, not only the solution',
    body: 'Before checking the key, record whether you would answer, guess, or skip under negative marking. Honest confidence data improves exam-day selection.',
    tone: 'teal'
  },
  readiness: {
    id: 'readiness-direction',
    context: 'Readiness',
    title: 'Treat the score as direction, not destiny',
    body: 'Work on the weakest underlying component, then look for movement across several sessions. A single readiness number is a signal, not a rank prediction.',
    tone: 'marigold'
  },
  triggerDrill: {
    id: 'trigger-reflex',
    context: 'Trigger drill',
    title: 'Train the first move to become automatic',
    body: 'Keep the cue short and answer with the method or concept it should trigger. Fast recognition preserves working time for the actual derivation.',
    tone: 'marigold'
  },
  formulas: {
    id: 'formula-boundaries',
    context: 'Formula recall',
    title: 'Recall the boundary with the formula',
    body: 'State the assumptions, units, and one case where the expression does not apply. GATE options often test the boundary rather than direct substitution.',
    tone: 'teal'
  },
  buddy: {
    id: 'buddy-teach-back',
    context: 'Buddy study',
    title: 'Explain without borrowing the answer',
    body: 'Share the cue and your reasoning before the final result. If your buddy cannot reproduce the method from that explanation, tighten the explanation together.',
    tone: 'rose'
  },
  settings: {
    id: 'settings-sustainable-targets',
    context: 'Study system',
    title: 'Set targets you can sustain on a bad day',
    body: 'A modest daily floor protects consistency; stronger days can exceed it. Review targets weekly using completed sessions, not aspiration alone.',
    tone: 'slate'
  }
};

/** Resolve the coaching note for the screen the learner is currently using. */
export function contextualGateTipForPath(pathname: string): ContextualGateTip {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (path === '/session/new') return TIPS.newSession;
  if (/^\/session\/[^/]+\/solve$/.test(path)) return TIPS.activeSession;
  if (/^\/session\/[^/]+\/review$/.test(path)) return TIPS.sessionReview;
  if (path === '/journal') return TIPS.journal;
  if (path === '/log') return TIPS.log;
  if (path === '/patterns') return TIPS.patterns;
  if (path === '/pyq') return TIPS.pyq;
  if (path === '/planner') return TIPS.planner;
  if (path === '/reattempts') return TIPS.reattempts;
  if (path === '/weekly-review') return TIPS.weeklyReview;
  if (path === '/heatmap') return TIPS.heatmap;
  if (path === '/calibration') return TIPS.calibration;
  if (path === '/readiness') return TIPS.readiness;
  if (path === '/trigger-drill') return TIPS.triggerDrill;
  if (path === '/formulas') return TIPS.formulas;
  if (path === '/buddy') return TIPS.buddy;
  if (path === '/settings') return TIPS.settings;
  return FALLBACK_TIP;
}
