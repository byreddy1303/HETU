import type { PyqQuestion } from './pyq';
import keyConflicts from '@/data/pyq-key-conflicts.json';

// Identical question + option text carries conflicting keys in these archive
// rows. Keep the IDs for old sessions, but withhold grading until reconciled
// against the original paper/key. See docs/pyq-practice-audit.md.
export const PYQ_CONFLICTING_KEY_IDS = new Set(keyConflicts.flatMap((conflict) => conflict.ids));

export function guardPyqQuestionIntegrity(question: PyqQuestion): PyqQuestion {
  if (!PYQ_CONFLICTING_KEY_IDS.has(question.id)) return question;
  return { ...question, answer: null, answerStatus: 'ambiguous' };
}

/** Include option order and diagrams; similar stems are not duplicates. */
export function pyqContentIdentity(question: Pick<PyqQuestion, 'html'>): string {
  // Preserve markup boundaries, option order, diagrams, and whitespace inside
  // code/math. Flattening text can falsely equate distinct answer choices.
  return question.html.trim();
}

export function uniquePyqPracticeQuestions(questions: readonly PyqQuestion[]): PyqQuestion[] {
  const ids = new Set<string>();
  const content = new Set<string>();
  return questions.filter((question) => {
    const identity = pyqContentIdentity(question);
    if (ids.has(question.id) || content.has(identity)) return false;
    ids.add(question.id);
    content.add(identity);
    return true;
  });
}
