import type { PyqQuestionSummary } from '@/lib/pyq-summary';

export interface PyqImprovementInsightsData {
  timedQuestionCount: number;
  medianPaceSec: number | null;
  incorrectTimeSec: number;
  incorrectTimedCount: number;
  correctCount: number;
  incorrectCount: number;
  gradedAttemptCount: number;
  fastIncorrectQuestions: PyqQuestionSummary[];
  slowLowReturnQuestions: PyqQuestionSummary[];
  reviewFirstQuestion: PyqQuestionSummary | null;
}

function questionOrder(left: PyqQuestionSummary, right: PyqQuestionSummary): number {
  return (
    left.questionNumber - right.questionNumber || left.questionUid.localeCompare(right.questionUid)
  );
}

function recordedQuestionTime(question: PyqQuestionSummary): number | null {
  if (!question.visited) {
    return null;
  }
  if (
    question.timeSpentMs != null &&
    Number.isFinite(question.timeSpentMs) &&
    question.timeSpentMs > 0
  ) {
    return question.timeSpentMs / 1000;
  }
  if (!Number.isFinite(question.timeSpentSec) || question.timeSpentSec <= 0) return null;
  return question.timeSpentSec;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

/**
 * Derive next-attempt guidance from the canonical, latest-per-question session
 * summary. Timing claims require a positive recorded duration; mark-return
 * claims require an exactly validated score receipt.
 */
export function buildPyqImprovementInsights(
  questions: readonly PyqQuestionSummary[]
): PyqImprovementInsightsData {
  const timedQuestions = questions.flatMap((question) => {
    const timeSpentSec = recordedQuestionTime(question);
    return timeSpentSec == null ? [] : [{ question, timeSpentSec }];
  });
  const medianPaceSec = median(timedQuestions.map(({ timeSpentSec }) => timeSpentSec));
  const correctCount = questions.filter((question) => question.outcome === 'correct').length;
  const incorrectQuestions = questions.filter((question) => question.outcome === 'wrong');
  const incorrectTimedQuestions = incorrectQuestions.flatMap((question) => {
    const timeSpentSec = recordedQuestionTime(question);
    return timeSpentSec == null ? [] : [{ question, timeSpentSec }];
  });
  const incorrectCount = incorrectQuestions.length;

  const fastIncorrectQuestions =
    medianPaceSec == null
      ? []
      : timedQuestions
          .filter(
            ({ question, timeSpentSec }) =>
              question.outcome === 'wrong' && timeSpentSec < medianPaceSec / 2
          )
          .map(({ question }) => question)
          .sort(questionOrder);

  const slowLowReturnQuestions =
    medianPaceSec == null
      ? []
      : timedQuestions
          .filter(
            ({ question, timeSpentSec }) =>
              timeSpentSec > medianPaceSec &&
              question.scoringCovered &&
              question.scoreThirds != null &&
              question.scoreThirds <= 0
          )
          .map(({ question }) => question)
          .sort(questionOrder);

  const reviewFirstQuestion =
    [...slowLowReturnQuestions]
      .filter((question) => question.scoreThirds != null && question.scoreThirds < 0)
      .sort(
        (left, right) =>
          (recordedQuestionTime(right) ?? 0) - (recordedQuestionTime(left) ?? 0) ||
          (left.scoreThirds ?? 0) - (right.scoreThirds ?? 0) ||
          questionOrder(left, right)
      )[0] ?? null;

  return {
    timedQuestionCount: timedQuestions.length,
    medianPaceSec,
    incorrectTimeSec: incorrectTimedQuestions.reduce(
      (total, { timeSpentSec }) => total + timeSpentSec,
      0
    ),
    incorrectTimedCount: incorrectTimedQuestions.length,
    correctCount,
    incorrectCount,
    gradedAttemptCount: correctCount + incorrectCount,
    fastIncorrectQuestions,
    slowLowReturnQuestions,
    reviewFirstQuestion
  };
}
