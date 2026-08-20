// Active session (F2.2): count-up timer per question; Next opens the 4-step
// tag flow; saving a tag writes the question, reconciles the pattern count,
// and schedules a re-attempt for RBS/RBG/W-* — all local-first.
//
// State that must survive mid-session navigation (or a hard reload) lives in
// the persisted session store: sessionId, plannedCount, questionStartedAt,
// mode (solve/tag), and the elapsed seconds captured on tag-open. Local
// useState is reserved for things that can safely restart.
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { parseISO } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, CircleDotDashed } from 'lucide-react';
import type { QuestionRow } from '@/types';
import { db } from '@/lib/db';
import { deleteLocal, writeLocal } from '@/lib/sync';
import { needsReattempt, scheduleReattempt } from '@/lib/reattempt';
import {
  DEFAULT_TARGET_TIME_SEC,
  MARKS_TARGET_SEC,
  OUTCOME_BY_CODE,
  buildSourceRef
} from '@/lib/constants';
import { cn, uuid, nowISO, secondsToClock } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';
import { haptic } from '@/lib/native';
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

const RECEIPT_TONE: Record<'ok' | 'slow' | 'guess' | 'wrong', string> = {
  ok: 'border-success/30 bg-success-faint/65 text-success',
  slow: 'border-warn/30 bg-warn-faint/65 text-warn',
  guess: 'border-guess/30 bg-guess-faint/65 text-guess',
  wrong: 'border-danger/30 bg-danger-faint/65 text-danger'
};

interface EvidenceReceipt {
  id: string;
  questionIndex: number;
  questionLabel: string;
  outcome: QuestionRow['outcome'];
}

export default function SessionActive() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { userId } = useAuth();
  const store = useSessionStore();
  const reduceMotion = useReducedMotion();
  const [savedReceipt, setSavedReceipt] = useState<EvidenceReceipt | null>(null);

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
  const displayedQuestionIndex = savedReceipt?.questionIndex ?? qIndex;

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
    const target = source.marks != null ? MARKS_TARGET_SEC[source.marks] : DEFAULT_TARGET_TIME_SEC;
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

    // Source details can be taller than the viewport. Reset the study surface
    // before the receipt appears so the next question never begins mid-page.
    window.scrollTo({ top: 0, behavior: 'auto' });
    setSavedReceipt({
      id: q.id,
      questionIndex: qIndex,
      questionLabel: `Q ${String(qIndex).padStart(2, '0')}`,
      outcome: draft.outcome
    });
    haptic('success');

    if (!reduceMotion) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, MOTION_DURATION.evidenceHold * 1000);
      });
    }

    if (planned && taggedCount + 1 >= planned) {
      await finish();
      return;
    }
    setSavedReceipt(null);
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
        <span className="u-num flex items-center text-[12px] text-text-muted">
          Q&nbsp;
          <span className="relative inline-grid h-[1.25em] min-w-[2ch] overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={displayedQuestionIndex}
                className="col-start-1 row-start-1"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{
                  duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.control,
                  ease: MOTION_EASE
                }}
              >
                {String(displayedQuestionIndex).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          </span>
          {planned ? (
            <span className="text-text-faint">/{String(planned).padStart(2, '0')}</span>
          ) : null}
          <span className="ml-3 text-text-faint">{secondsToClock(sessionSeconds)} total</span>
        </span>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {savedReceipt ? (
          <motion.div
            key={`receipt-${savedReceipt.id}`}
            className="flex min-h-[62vh] flex-1 items-center justify-center py-12"
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.965 }}
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.evidence,
              ease: MOTION_EASE
            }}
          >
            <motion.div
              role="status"
              aria-live="polite"
              className={cn(
                'relative w-full max-w-[430px] overflow-hidden rounded-lg border px-5 py-4 shadow-card',
                RECEIPT_TONE[OUTCOME_BY_CODE[savedReceipt.outcome].tone]
              )}
              initial={reduceMotion ? false : { clipPath: 'inset(0 48% 0 48% round 8px)' }}
              animate={{ clipPath: 'inset(0 0% 0 0% round 8px)' }}
              transition={{
                duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
                ease: MOTION_EASE
              }}
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-current/65" aria-hidden />
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current/25 bg-bg-raised/75">
                  <CircleDotDashed className="absolute opacity-25" size={27} strokeWidth={1.4} />
                  <Check size={17} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="u-label text-current/75">Evidence captured</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-[17px] font-semibold text-text">
                    <span>{savedReceipt.questionLabel}</span>
                    <span className="u-num text-[12px] font-semibold text-current">
                      {savedReceipt.outcome}
                    </span>
                  </p>
                </div>
                <span className="u-label shrink-0 text-current/70">saved locally</span>
              </div>
            </motion.div>
          </motion.div>
        ) : mode === 'solve' ? (
          <motion.div
            key="solve"
            className="flex flex-1 flex-col"
            initial={reduceMotion ? false : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
              ease: MOTION_EASE
            }}
          >
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
          </motion.div>
        ) : (
          <motion.div
            key="tag"
            className="py-6"
            initial={reduceMotion ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
              ease: MOTION_EASE
            }}
          >
            <TagFlow
              subject={session.subject}
              patterns={patterns}
              questionLabel={`Q ${String(qIndex).padStart(2, '0')}`}
              timeSpentSec={timeSpent}
              onSave={saveTag}
              onCancel={() => store.cancelTag()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
