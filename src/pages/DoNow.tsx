import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, BookOpenCheck, Camera, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/db';
import { buildDoNowQueue, type DoNowItem } from '@/lib/do-now';
import { loadDayPlan } from '@/lib/planner-storage';
import { markPlannerBlockStarted, reconcilePlannerExecutions } from '@/lib/planner-execution';
import { todayISOInTimeZone } from '@/lib/utils';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';

const KIND_LABEL: Record<DoNowItem['kind'], string> = {
  reattempt: 'Retrieval',
  analysis: 'Close the loop',
  guess: 'Uncertain knowledge',
  slow: 'Speed',
  formula: 'Recall',
  planned: 'Planned block'
};

export default function DoNow() {
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const today = todayISOInTimeZone(profile?.timezone ?? 'Asia/Kolkata');
  const [planRevision, setPlanRevision] = useState(0);
  const reduceMotion = useReducedMotion();
  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const questions = useLiveQuery(
    () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const attempts = useLiveQuery(
    () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const formulas = useLiveQuery(
    () => (userId ? db.formulas.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  useEffect(() => {
    if (!userId) return;
    void reconcilePlannerExecutions(userId)
      .then((changed) => {
        if (changed > 0) setPlanRevision((value) => value + 1);
      })
      .catch(() => undefined);
  }, [userId]);

  const plan = useMemo(() => {
    void planRevision;
    return loadDayPlan(today);
  }, [planRevision, today]);
  const queue = useMemo(
    () => buildDoNowQueue({ today, reattempts, questions, pyqAttempts: attempts, formulas, plan }),
    [today, reattempts, questions, attempts, formulas, plan]
  );

  function start(item: DoNowItem) {
    if (item.kind === 'planned' && plan) {
      const blockId = item.id.slice('plan-'.length);
      markPlannerBlockStarted(plan.date, blockId);
    }
    navigate(item.href);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Do now"
        description={
          queue.length > 0 ? (
            <>
              <span className="relative inline-grid min-w-[1ch] overflow-hidden align-bottom">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={queue.length}
                    className="col-start-1 row-start-1"
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{
                      duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.control,
                      ease: MOTION_EASE
                    }}
                  >
                    {queue.length}
                  </motion.span>
                </AnimatePresence>
              </span>{' '}
              ordered {queue.length === 1 ? 'step' : 'steps'}. Start at the top.
            </>
          ) : (
            'Nothing is waiting. Create fresh evidence or capture a question.'
          )
        }
      />

      <AnimatePresence initial mode="wait">
        {queue.length > 0 ? (
          <motion.div
            key="ordered-queue"
            className="flex flex-col gap-4"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
              ease: MOTION_EASE
            }}
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
                ease: MOTION_EASE
              }}
            >
              <Card className="overflow-hidden border-accent/35">
                <CardBody className="flex flex-wrap items-center gap-4 bg-accent-faint/35">
                  <motion.span
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/25 bg-bg-raised text-accent"
                    animate={reduceMotion ? undefined : { rotate: [0, -3, 0], scale: [1, 1.04, 1] }}
                    transition={{ duration: 0.42, ease: MOTION_EASE }}
                  >
                    <ListChecks size={20} />
                  </motion.span>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={queue[0].id}
                      className="min-w-0 flex-1"
                      initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                      transition={{
                        duration: reduceMotion
                          ? MOTION_DURATION.immediate
                          : MOTION_DURATION.control,
                        ease: MOTION_EASE
                      }}
                    >
                      <p className="u-label text-accent">First action</p>
                      <p className="mt-1 font-display text-[19px] font-semibold text-text">
                        {queue[0].title}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                  <Button variant="primary" onClick={() => start(queue[0])}>
                    Start next <ArrowRight size={15} />
                  </Button>
                </CardBody>
              </Card>
            </motion.div>

            <motion.ol className="overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card">
              <AnimatePresence initial mode="popLayout">
                {queue.map((item, index) => (
                  <motion.li
                    key={item.id}
                    initial={
                      reduceMotion || index >= 6 ? false : { opacity: 0, y: 8, scale: 0.992 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, height: 0, x: -10, transition: { duration: 0.18 } }
                    }
                    transition={{
                      opacity: {
                        duration: reduceMotion
                          ? MOTION_DURATION.immediate
                          : MOTION_DURATION.content,
                        delay: reduceMotion ? 0 : Math.min(index, 5) * 0.032
                      },
                      y: {
                        duration: reduceMotion
                          ? MOTION_DURATION.immediate
                          : MOTION_DURATION.content,
                        delay: reduceMotion ? 0 : Math.min(index, 5) * 0.032,
                        ease: MOTION_EASE
                      }
                    }}
                    className="grid grid-cols-[54px_minmax(0,1fr)] overflow-hidden border-b border-border last:border-b-0"
                  >
                    <div className="flex items-start justify-center border-r border-border bg-bg-overlay/35 pt-4">
                      <span className="u-num text-[13px] font-semibold text-text-muted">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                      <div className="min-w-[220px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-[15px] font-semibold text-text">
                            {item.title}
                          </p>
                          <span className="rounded-full bg-bg-overlay px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                            {KIND_LABEL[item.kind]}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-text-faint">
                          {item.detail}
                        </p>
                      </div>
                      <span className="u-num inline-flex items-center gap-1 text-[12px] text-text-muted">
                        <Clock3 size={12} /> {item.count}
                      </span>
                      <Button size="sm" onClick={() => start(item)}>
                        Open <ArrowRight size={13} />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ol>
          </motion.div>
        ) : (
          <motion.div
            key="clear-queue"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{
              duration: reduceMotion ? MOTION_DURATION.immediate : MOTION_DURATION.content,
              ease: MOTION_EASE
            }}
          >
            <Empty
              title="The queue is clear"
              hint="Nothing is overdue, unanalyzed, due for formula review, or left in today’s plan."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={() => navigate('/pyq?history=unseen')}>
                    <BookOpenCheck size={15} /> Start unseen PYQs
                  </Button>
                  <Button onClick={() => navigate('/capture')}>
                    <Camera size={15} /> Quick capture
                  </Button>
                </div>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 text-[11px] text-text-faint">
        <CheckCircle2 size={13} className="text-success" />
        Completed planner blocks disappear automatically after their linked session or mock is
        saved.
      </div>
    </div>
  );
}
