import type {
  FormulaRow,
  QuestionRow,
  ReattemptRow,
  TriggerPhraseRow,
  WeeklyReviewRow
} from '@/types';

export interface RevisionPattern {
  name: string;
  subject: string;
  count: number;
}

export interface RevisionPack {
  weeklyFix: string | null;
  dueFormulas: FormulaRow[];
  triggers: TriggerPhraseRow[];
  repeatedMistakes: RevisionPattern[];
  priorityQuestions: QuestionRow[];
}

export function buildRevisionPack(args: {
  today: string;
  weeklyReviews: WeeklyReviewRow[];
  formulas: FormulaRow[];
  triggers: TriggerPhraseRow[];
  questions: QuestionRow[];
  reattempts: ReattemptRow[];
}): RevisionPack {
  const latestReview = [...args.weeklyReviews]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .at(-1);
  const dueFormulas = args.formulas
    .filter((formula) => formula.next_review <= args.today)
    .sort((a, b) => a.next_review.localeCompare(b.next_review));
  const triggers = [...args.triggers]
    .sort((a, b) => {
      const aUnseen = a.reflex_time_ms === null ? 0 : 1;
      const bUnseen = b.reflex_time_ms === null ? 0 : 1;
      return aUnseen - bUnseen || (b.reflex_time_ms ?? 0) - (a.reflex_time_ms ?? 0);
    })
    .slice(0, 10);
  const patternCounts = new Map<string, RevisionPattern>();
  for (const question of args.questions) {
    if (question.outcome === 'R' || !question.pattern_name) continue;
    const key = `${question.subject}::${question.pattern_name.toLocaleLowerCase()}`;
    const current = patternCounts.get(key) ?? {
      name: question.pattern_name,
      subject: question.subject,
      count: 0
    };
    current.count += 1;
    patternCounts.set(key, current);
  }
  const repeatedMistakes = [...patternCounts.values()]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
  const questionById = new Map(args.questions.map((question) => [question.id, question]));
  const dueQuestionIds = args.reattempts
    .filter((row) => row.stage !== 'MASTERED' && row.scheduled_date <= args.today)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .map((row) => row.question_id);
  const dueQuestions = dueQuestionIds.flatMap((id) => {
    const question = questionById.get(id);
    return question ? [question] : [];
  });
  const recentMistakes = [...args.questions]
    .filter((question) => question.outcome !== 'R' && !dueQuestionIds.includes(question.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    weeklyFix: latestReview?.this_weeks_fix?.trim() || null,
    dueFormulas,
    triggers,
    repeatedMistakes,
    priorityQuestions: [...dueQuestions, ...recentMistakes].slice(0, 10)
  };
}

export function revisionPackText(pack: RevisionPack): string {
  const lines = ['HETU REVISION PACK', ''];
  if (pack.weeklyFix) lines.push('THIS WEEK', pack.weeklyFix, '');
  lines.push('DUE FORMULAS');
  lines.push(
    ...(pack.dueFormulas.length
      ? pack.dueFormulas.map((row) => `- ${row.subject}: ${row.name} — ${row.expression}`)
      : ['- None due'])
  );
  lines.push('', 'TRIGGER PHRASES');
  lines.push(
    ...(pack.triggers.length
      ? pack.triggers.map((row) => `- ${row.phrase} → ${row.concept}`)
      : ['- No triggers saved'])
  );
  lines.push('', 'REPEATED MISTAKES');
  lines.push(
    ...(pack.repeatedMistakes.length
      ? pack.repeatedMistakes.map((row) => `- ${row.subject}: ${row.name} (${row.count}×)`)
      : ['- No repeated pattern yet'])
  );
  lines.push('', 'PRIORITY QUESTIONS');
  lines.push(
    ...(pack.priorityQuestions.length
      ? pack.priorityQuestions.map(
          (row, index) =>
            `${index + 1}. ${row.subject}${row.subtopic ? ` · ${row.subtopic}` : ''}${row.source_ref ? ` · ${row.source_ref}` : ''}`
        )
      : ['- Queue clear'])
  );
  return lines.join('\n');
}
