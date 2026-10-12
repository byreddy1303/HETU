// Journal linking (spec §4): entries stop being a dead notepad by linking to
// attempts and resurfacing. Templates kill blank-page dread; resurface status
// turns old entries into due work instead of archive.
import type { QuestionRow, ReattemptStage } from '@/types';

export type JournalKind = 'postmortem' | 'concept' | 'fear' | 'revision' | 'win';
export type JournalResurface = 'fixed' | 'open' | 'reread';

export interface JournalTemplate {
  kind: JournalKind;
  title: string;
  triggerPrompt: string;
  notePrompt: string;
}

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    kind: 'postmortem',
    title: 'Mistake post-mortem',
    triggerPrompt: 'What I picked and why felt right in the moment',
    notePrompt: 'Correct logic in one line. Next time I will…'
  },
  {
    kind: 'concept',
    title: 'Concept I finally got',
    triggerPrompt: 'Old mental model → new mental model',
    notePrompt: 'One example that proves I own it now'
  },
  {
    kind: 'fear',
    title: 'Exam fear',
    triggerPrompt: 'The fear, stated plainly',
    notePrompt: 'Evidence against it + one reframe'
  },
  {
    kind: 'revision',
    title: 'Revision note',
    triggerPrompt: 'Three bullets I must not forget',
    notePrompt: 'Test me on… (creates a reattempt pack)'
  },
  {
    kind: 'win',
    title: 'Win',
    triggerPrompt: 'What clicked after the misses',
    notePrompt: 'The trigger I will reuse under pressure'
  }
];

const RESURFACE_AFTER_DAYS = 7;

/**
 * Resurface status for a journal row: linked reattempt MASTERED means the
 * lesson stuck (fixed); an untouched entry older than a week wants a reread;
 * everything else is open work.
 */
export function journalResurfaceStatus(
  question: Pick<QuestionRow, 'created_at'>,
  linkedStage: ReattemptStage | null | undefined,
  nowMs: number = Date.now()
): JournalResurface {
  if (linkedStage === 'MASTERED') return 'fixed';
  const createdMs = Date.parse(question.created_at);
  if (!Number.isFinite(createdMs)) return 'open';
  const ageDays = (nowMs - createdMs) / (24 * 60 * 60 * 1000);
  return ageDays >= RESURFACE_AFTER_DAYS ? 'reread' : 'open';
}
