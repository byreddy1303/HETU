import { db } from '@/lib/db';
import { writeLocal } from '@/lib/sync';
import { nowISO, uuid } from '@/lib/utils';

/** Recount after a question is saved, then create or update its pattern row. */
export async function reconcileQuestionPattern(
  userId: string,
  subject: string,
  name: string
): Promise<void> {
  const count = await db.questions.where('[user_id+pattern_name]').equals([userId, name]).count();
  const existing = await db.patterns.where('[user_id+name]').equals([userId, name]).first();
  if (existing) {
    await writeLocal('patterns', { ...existing, count });
    return;
  }
  await writeLocal('patterns', {
    id: uuid(),
    user_id: userId,
    name,
    subject,
    count,
    is_reflexed: false,
    mastery_level: 0,
    first_seen_at: nowISO()
  });
}
