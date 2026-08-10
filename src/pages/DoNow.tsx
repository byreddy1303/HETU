import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
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
          queue.length > 0
            ? `${queue.length} ordered ${queue.length === 1 ? 'step' : 'steps'}. Start at the top.`
            : 'Nothing is waiting. Create fresh evidence or capture a question.'
        }
      />

      {queue.length > 0 ? (
        <>
          <Card className="overflow-hidden border-accent/35">
            <CardBody className="flex flex-wrap items-center gap-4 bg-accent-faint/35">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/25 bg-bg-raised text-accent">
                <ListChecks size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="u-label text-accent">First action</p>
                <p className="mt-1 font-display text-[19px] font-semibold text-text">
                  {queue[0].title}
                </p>
              </div>
              <Button variant="primary" onClick={() => start(queue[0])}>
                Start next <ArrowRight size={15} />
              </Button>
            </CardBody>
          </Card>

          <ol className="overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card">
            {queue.map((item, index) => (
              <li
                key={item.id}
                className="grid grid-cols-[54px_minmax(0,1fr)] border-b border-border last:border-b-0"
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
              </li>
            ))}
          </ol>
        </>
      ) : (
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
      )}

      <div className="flex items-center gap-2 text-[11px] text-text-faint">
        <CheckCircle2 size={13} className="text-success" />
        Completed planner blocks disappear automatically after their linked session or mock is
        saved.
      </div>
    </div>
  );
}
