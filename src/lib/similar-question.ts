import { isPyqAutoGradable, pyqBookSlugForQuestion, type PyqQuestion } from '@/lib/pyq';

/** PYQs from this year on follow the current paper pattern. */
const MODERN_FROM_YEAR = 2015;

/**
 * An unseen PYQ that tests the same idea as one just missed: same subject and
 * topic, never attempted, auto-gradable, and outside any excluded set (the current
 * practice set, papers sealed for mocks). Solving it straight after reading the
 * solution practises the corrected method on a problem whose answer is not known.
 */
export function similarUnseenQuestion(
  missed: PyqQuestion,
  bank: readonly PyqQuestion[],
  options: { attempted: ReadonlySet<string>; exclude: ReadonlySet<string> }
): PyqQuestion | null {
  const shared = new Set(missed.subtopics);
  const overlap = (question: PyqQuestion) =>
    question.subtopics.filter((subtopic) => shared.has(subtopic)).length;
  const gate = (question: PyqQuestion) => pyqBookSlugForQuestion(question) === 'gate-cse';
  const modern = (question: PyqQuestion) => question.year >= MODERN_FROM_YEAR;
  const candidates = bank.filter(
    (question) =>
      question.id !== missed.id &&
      question.subjectSlug === missed.subjectSlug &&
      question.topicSlug === missed.topicSlug &&
      isPyqAutoGradable(question) &&
      !options.attempted.has(question.id) &&
      !options.exclude.has(question.id)
  );
  return (
    candidates.sort(
      (left, right) =>
        Number(gate(right)) - Number(gate(left)) ||
        overlap(right) - overlap(left) ||
        Number(modern(right)) - Number(modern(left)) ||
        Math.abs(left.year - missed.year) - Math.abs(right.year - missed.year) ||
        left.id.localeCompare(right.id)
    )[0] ?? null
  );
}
