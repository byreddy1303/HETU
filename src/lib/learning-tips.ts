import type { QuestionRow } from '@/types';

export interface LearningTip {
  id: string;
  title: string;
  body: string;
  actionLabel?: string;
  href?: string;
  tone: 'accent' | 'rose' | 'teal' | 'marigold';
}

export interface LearningTipContext {
  due: number;
  weeklyFix?: string | null;
  lastSessionQuestions: QuestionRow[];
  sessionsThisWeek: number;
  questionsToday: number;
}

/** Small, deterministic coaching rules based only on the learner's own data. */
export function buildLearningTips(context: LearningTipContext): LearningTip[] {
  const tips: LearningTip[] = [];
  const questions = context.lastSessionQuestions;
  const has = (predicate: (question: QuestionRow) => boolean) => questions.some(predicate);

  if (has((question) => question.outcome === 'W-R' || question.root_cause === 'reading')) {
    tips.push({
      id: 'reading-errors',
      title: 'Circle the qualifier',
      body: 'Your last session contains a reading miss. Before touching the options, underline NOT, EXCEPT, always, and only; then restate the ask in your own words.',
      tone: 'marigold'
    });
  }

  if (has((question) => question.outcome === 'W-E' || question.root_cause === 'computation')) {
    tips.push({
      id: 'execution-errors',
      title: 'Make one checkpoint visible',
      body: 'For the next calculation, write units or an intermediate invariant beside the working. One explicit checkpoint catches more slips than rechecking everything.',
      tone: 'teal'
    });
  }

  if (has((question) => question.outcome === 'W-C' || question.root_cause === 'concept' || question.root_cause === 'formula')) {
    tips.push({
      id: 'concept-errors',
      title: 'Reconstruct, then compare',
      body: 'Close the notes and write the definition, its boundary condition, and one counterexample. Only then compare your version with the source.',
      tone: 'accent'
    });
  }

  if (has((question) => question.outcome === 'RBG')) {
    tips.push({
      id: 'guess-errors',
      title: 'Audit the rejected options',
      body: 'Redo one guessed-correct question without looking at the choices. Then explain why each rejected option fails; this separates knowledge from luck.',
      tone: 'rose'
    });
  }

  if (has((question) => question.outcome === 'RBS')) {
    tips.push({
      id: 'slow-errors',
      title: 'Compress the first 30 seconds',
      body: 'On one slow-correct question, rehearse only the opening move: identify the pattern, write the governing relation, and stop. Fast starts reduce total time.',
      tone: 'marigold'
    });
  }

  if (context.questionsToday === 0) {
    tips.push({
      id: 'start-small',
      title: 'Use a five-question ignition set',
      body: 'Begin with five PYQs from one narrow subtopic. Tag every outcome immediately; momentum should come from evidence, not a long plan.',
      actionLabel: 'Start a session',
      href: '/session/new',
      tone: 'teal'
    });
  }

  if (context.sessionsThisWeek > 0 && questions.length > 0) {
    tips.push({
      id: 'teach-back',
      title: 'End with a 60-second teach-back',
      body: 'Without notes, explain the hardest question aloud: cue, method, trap, and check. Any sentence you cannot finish is tomorrow’s first retrieval prompt.',
      tone: 'teal'
    });
  }

  if (tips.length === 0) {
    tips.push({
      id: 'default-retrieval',
      title: 'Test memory before adding input',
      body: 'Write what you remember about today’s topic for two minutes before reading. The gaps you expose tell you exactly what to study.',
      actionLabel: 'Start a session',
      href: '/session/new',
      tone: 'accent'
    });
  }

  // Dashboard priorities already show due work and the weekly fix. Keep this
  // surface to one complementary coaching note so it never becomes a second
  // queue or a carousel the learner has to manage.
  return tips.slice(0, 1);
}
