import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play } from 'lucide-react';
import type { SessionRow } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { SUBJECTS, TARGET_DURATIONS_MIN, QUESTION_COUNT_CHOICES } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useSessionStore } from '@/stores/session';
import { usePrefsStore } from '@/stores/prefs';
import { writeLocal } from '@/lib/sync';
import { db } from '@/lib/db';
import { cn, uuid, todayISO, nowISO, formatDate } from '@/lib/utils';
import { subjectInk } from '@/lib/subjectInk';
import { updatePlannerBlockExecution } from '@/lib/planner-execution';

function Segmented({
  options,
  value,
  onChange
}: {
  options: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex divide-x divide-border overflow-hidden rounded border border-border bg-bg-raised shadow-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 px-4 font-mono text-[13px] transition-colors active:scale-95',
            value === o.value
              ? 'bg-accent-faint font-semibold text-accent'
              : 'text-text-muted hover:bg-bg-overlay hover:text-text'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SessionNew() {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const begin = useSessionStore((s) => s.begin);
  const storedSessionId = useSessionStore((s) => s.sessionId);
  const inProgress = useLiveQuery(async () => {
    if (!storedSessionId) return null;
    const row = await db.sessions.get(storedSessionId);
    if (!row || row.actual_duration_min !== null) return null;
    const tagged = await db.questions.where('session_id').equals(row.id).count();
    return { row, tagged };
  }, [storedSessionId]);
  const defaultSubject = usePrefsStore((s) => s.defaultSubject);
  const defaultDuration = usePrefsStore((s) => s.defaultDurationMin);
  const defaultCount = usePrefsStore((s) => s.defaultQuestionCount);
  const requestedSubject = searchParams.get('subject');
  const requestedDuration = Number(searchParams.get('duration'));
  const plannerDate = searchParams.get('plannerDate');
  const plannerBlockId = searchParams.get('plannerBlock');
  const [subject, setSubject] = useState<string | undefined>(() =>
    requestedSubject && SUBJECTS.includes(requestedSubject as (typeof SUBJECTS)[number])
      ? requestedSubject
      : defaultSubject ?? undefined
  );
  const [duration, setDuration] = useState<number>(() =>
    Number.isFinite(requestedDuration) && requestedDuration > 0
      ? Math.min(720, Math.round(requestedDuration))
      : defaultDuration
  );
  const [count, setCount] = useState<number>(defaultCount);
  const [starting, setStarting] = useState(false);

  async function start() {
    if (!subject || !userId || starting) return;
    setStarting(true);
    const row: SessionRow = {
      id: uuid(),
      user_id: userId,
      kind: 'focused',
      date: todayISO(),
      subject,
      target_duration_min: duration,
      actual_duration_min: null,
      insight: null,
      sadhana_done: false,
      interruptions_count: 0,
      planner_date: plannerDate,
      planner_block_id: plannerBlockId,
      created_at: nowISO()
    };
    await writeLocal('sessions', row);
    if (plannerDate && plannerBlockId) {
      updatePlannerBlockExecution(plannerDate, plannerBlockId, {
        sessionId: row.id,
        startedAt: row.created_at,
        completedAt: null,
        actualMin: null,
        manual: false
      });
    }
    begin(row.id, count);
    navigate(`/session/${row.id}/solve`);
  }

  useKeyboard({ enter: () => void start() }, !!subject);

  return (
    <div>
      <PageHeader
        title="New session"
        description="Pick the block, start the clock, tag every question as you go."
      />
      {inProgress && (
        <Card className="mb-4 border-ink-teal/40">
          <CardBody className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cn('h-1.5 w-1.5 rounded-full', subjectInk(inProgress.row.subject).dot)}
              />
              <span className="text-[13px]">
                <span className="font-medium">{inProgress.row.subject}</span>
                <span className="text-text-faint">
                  {' '}
                  · started {formatDate(inProgress.row.date, 'dd MMM')} · {inProgress.tagged}{' '}
                  tagged
                </span>
              </span>
            </span>
            <span className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/session/${inProgress.row.id}/review`)}
              >
                End & review
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/session/${inProgress.row.id}/solve`)}
              >
                <Play size={14} strokeWidth={2} className="mr-1" />
                Resume
              </Button>
            </span>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody className="flex flex-col gap-6">
          <div>
            <p className="u-label mb-2">Subject</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {SUBJECTS.map((s) => {
                const ink = subjectInk(s);
                const active = subject === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className={cn(
                      'flex items-center gap-2 rounded border px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-150 active:scale-[0.97]',
                      active
                        ? cn('shadow-sm', ink.selected)
                        : 'border-border bg-bg-raised text-text-muted hover:-translate-y-px hover:border-border-hover hover:text-text hover:shadow-card'
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full transition-opacity',
                        ink.dot,
                        active ? 'opacity-100' : 'opacity-40'
                      )}
                    />
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <p className="u-label mb-2">Target duration</p>
              <Segmented
                options={TARGET_DURATIONS_MIN.map((m) => ({ value: m, label: `${m}m` }))}
                value={duration}
                onChange={setDuration}
              />
            </div>
            <div>
              <p className="u-label mb-2">Questions</p>
              <Segmented options={QUESTION_COUNT_CHOICES} value={count} onChange={setCount} />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-[12px] text-text-faint">
              {subject ? (
                <>
                  <Kbd>Enter</Kbd> <span className="ml-1">starts the clock</span>
                </>
              ) : (
                'Pick a subject to arm the session.'
              )}
            </p>
            <Button variant="primary" disabled={!subject || starting} onClick={() => void start()}>
              Start session
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
