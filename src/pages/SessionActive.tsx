// Active session (F2.2): count-up timer per question; Next opens the 4-step
// tag flow; saving a tag writes the question, reconciles the pattern count,
// and schedules a re-attempt for RBS/RBG/W-* — all local-first.
//
// State that must survive mid-session navigation (or a hard reload) lives in
// the persisted session store: sessionId, plannedCount, questionStartedAt,
// mode (solve/tag), and the elapsed seconds captured on tag-open. Local
// useState is reserved for things that can safely restart.
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { parseISO } from 'date-fns';
import type { QuestionRow } from '@/types';
import { db } from '@/lib/db';
import { deleteLocal, writeLocal } from '@/lib/sync';
import { needsReattempt, scheduleReattempt } from '@/lib/reattempt';
import {
  DEFAULT_TARGET_TIME_SEC,
  buildSourceRef,
  targetTimeSecForMarks
} from '@/lib/constants';
import { cn, uuid, nowISO, secondsToClock } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { useAuth } from '@/hooks/useAuth';
import { useTimer } from '@/hooks/useTimer';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useVisibilityChange } from '@/hooks/useVisibilityChange';
import { useSessionStore } from '@/stores/session';
import LoadingScreen from '@/components/shared/LoadingScreen';
import Timer from '@/components/shared/Timer';
import TagFlow, { type TagDraft } from '@/components/tags/TagFlow';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { Empty } from '@/components/ui/Empty';
import { updatePlannerBlockExecution } from '@/lib/planner-execution';

async function reconcilePattern(userId: string, subject: string, name: string) {
  const count = await db.questions.where('[user_id+pattern_name]').equals([userId, name]).count();
  const existing = await db.patterns.where('[user_id+name]').equals([userId, name]).first();
  if (existing) {
    await writeLocal('patterns', { ...existing, count });
  } else {
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
}

export default function SessionActive() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const store = useSessionStore();

  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const taggedCount =
    useLiveQuery(() => db.questions.where('session_id').equals(id).count(), [id]) ?? 0;
  const patterns =
    useLiveQuery(
      () => (userId ? db.patterns.where('user_id').equals(userId).toArray() : []),
      [userId]
    ) ?? [];

  const mode = store.sessionId === id ? store.mode : 'solve';
  const timeSpent =
    store.sessionId === id && store.pendingTimeSpent != null ? store.pendingTimeSpent : 0;

  // Recovery: only reinit when the store points at a different session.
  // If the store already matches this session id, its mode / questionStartedAt /
  // pendingTimeSpent survived the navigation or reload — leave them alone.
  const beginStore = useSessionStore((s) => s.begin);
  useEffect(() => {
    if (session && useSessionStore.getState().sessionId !== id) beginStore(id, 0);
  }, [session, id, beginStore]);

  const qSeconds = useTimer(mode === 'solve' ? store.questionStartedAt : null);
  const sessionSeconds = useTimer(session ? parseISO(session.created_at).getTime() : null);

  const planned = store.sessionId === id && store.plannedCount > 0 ? store.plannedCount : null;
  const qIndex = taggedCount + 1;

  function openTag() {
    store.enterTag(qSeconds);
  }

  async function finish() {
    if (!session) return;
    const savedQuestionCount = await db.questions.where('session_id').equals(id).count();
    // Zero-question sessions are noise. Drop the row instead of writing an
    // "empty session logged" — it will never show up in the journal, the
    // heatmap, or the weekly review.
    if (savedQuestionCount === 0) {
      await deleteLocal('sessions', id);
      store.end();
      navigate('/');
      return;
    }
    const mins = Math.max(
      1,
      Math.round((Date.now() - parseISO(session.created_at).getTime()) / 60_000)
    );
    await writeLocal('sessions', { ...session, actual_duration_min: mins });
    if (session.planner_date && session.planner_block_id) {
      updatePlannerBlockExecution(session.planner_date, session.planner_block_id, {
        sessionId: session.id,
        startedAt: session.created_at,
        completedAt: nowISO(),
        actualMin: mins,
        manual: false
      });
    }
    store.end();
    navigate(`/session/${id}/review`);
  }

  async function saveTag(draft: TagDraft) {
    if (!session || !userId) return;
    const { source } = draft;
    const target = targetTimeSecForMarks(source.marks);
    const q: QuestionRow = {
      id: uuid(),
      user_id: userId,
      session_id: id,
      subject: source.subject,
      subtopic: source.subtopic,
      source_year: source.year,
      source_ref: buildSourceRef(
        source.kind,
        source.year,
        source.set,
        source.questionNumber,
        source.format
      ),
      question_text: source.questionText,
      answer_text: source.answerText,
      image_url: source.imageDataUrl,
      time_spent_sec: timeSpent,
      target_time_sec: target,
      outcome: draft.outcome,
      pattern_name: draft.pattern_name,
      trigger_sentence: draft.trigger_sentence,
      root_cause: draft.root_cause,
      mark_decision: null,
      mark_correct: null,
      created_at: nowISO()
    };
    await writeLocal('questions', q);
    if (draft.pattern_name) await reconcilePattern(userId, source.subject, draft.pattern_name);
    if (needsReattempt(draft.outcome)) await scheduleReattempt(userId, q.id);
    if (planned && taggedCount + 1 >= planned) {
      await finish();
      return;
    }
    store.startQuestion();
  }

  useKeyboard({ enter: openTag, n: openTag }, mode === 'solve' && !!session);

  const sessionLive = !!session && session.actual_duration_min === null;
  useVisibilityChange(() => {
    void (async () => {
      if (!userId) return;
      const current = await db.sessions.get(id);
      if (!current || current.actual_duration_min !== null) return;
      await writeLocal('interruption_logs', {
        id: uuid(),
        user_id: userId,
        session_id: id,
        ts: nowISO(),
        kind: 'tab_switch' as const
      });
      await writeLocal('sessions', {
        ...current,
        interruptions_count: current.interruptions_count + 1
      });
    })();
  }, sessionLive);

  if (session === undefined) return <LoadingScreen />;
  if (session === null)
    return (
      <Empty
        title="Session not found"
        hint="It may have been deleted on another device."
        action={<Button onClick={() => navigate('/session/new')}>New session</Button>}
      />
    );
  if (session.actual_duration_min !== null)
    return <Navigate to={`/session/${id}/review`} replace />;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <span className="u-label">
          session · <span className={subjectInk(session.subject).text}>{session.subject}</span>
        </span>
        <span className="u-num text-[12px] text-text-muted">
          Q {String(qIndex).padStart(2, '0')}
          {planned && <span className="text-text-faint">/{String(planned).padStart(2, '0')}</span>}
          <span className="ml-3 text-text-faint">{secondsToClock(sessionSeconds)} total</span>
        </span>
      </div>

      {mode === 'solve' ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-10 py-12">
            <Timer seconds={qSeconds} targetSec={DEFAULT_TARGET_TIME_SEC} />
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={openTag}>
                Next — tag it
              </Button>
              <Kbd>N</Kbd>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className={cn('u-label text-text-faint')}>
              solve on paper · tag here
              {session.interruptions_count > 0 &&
                ` · ${session.interruptions_count} interruption${session.interruptions_count === 1 ? '' : 's'}`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void finish()}>
              End session
            </Button>
          </div>
        </>
      ) : (
        <div className="py-6">
          <TagFlow
            subject={session.subject}
            patterns={patterns}
            questionLabel={`Q ${String(qIndex).padStart(2, '0')}`}
            timeSpentSec={timeSpent}
            onSave={saveTag}
            onCancel={() => store.cancelTag()}
          />
        </div>
      )}
    </div>
  );
}
