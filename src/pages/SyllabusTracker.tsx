import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, CircleCheckBig, Search, Sparkles, Target } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import PageHeader from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { useAuth } from '@/hooks/useAuth';
import { SUBJECTS } from '@/lib/constants';
import { haptic } from '@/lib/native';
import { subjectInk } from '@/lib/subjectInk';
import { SUBTOPICS_BY_SUBJECT } from '@/lib/subtopics';
import { cn, formatDate, plural } from '@/lib/utils';
import { todayISOInTimeZone } from '@/lib/utils';
import { db } from '@/lib/db';
import {
  buildTopicEvidence,
  type TopicEvidence,
  type TopicEvidenceStatus
} from '@/lib/topic-evidence';
import { currentUserId } from '@/stores/auth';
import {
  completionsFromTopicRows,
  selectCompletionsForUser,
  syncTopicProgressFromDb,
  topicProgressId,
  useTopicProgressStore,
  type TopicCompletions
} from '@/stores/topic-progress';
import { useUiStore } from '@/stores/ui';

type SubjectFilter = 'all' | 'in-progress' | 'not-started' | 'complete';
type Subject = (typeof SUBJECTS)[number];

interface SubjectSummary {
  subject: Subject;
  topics: string[];
  completed: number;
  percent: number;
  status: Exclude<SubjectFilter, 'all'>;
}

const FILTERS: { value: SubjectFilter; label: string }[] = [
  { value: 'all', label: 'All subjects' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'not-started', label: 'Not started' },
  { value: 'complete', label: 'All studied' }
];

const ORBIT_COLORS = [
  'rgb(var(--color-ink-violet))',
  'rgb(var(--color-ink-cobalt))',
  'rgb(var(--color-ink-teal))',
  'rgb(var(--color-ink-slate))',
  'rgb(var(--color-ink-rose))',
  'rgb(var(--color-ink-marigold))'
];

function summariesFor(completions: TopicCompletions): SubjectSummary[] {
  return SUBJECTS.map((subject) => {
    const topics = (SUBTOPICS_BY_SUBJECT[subject] ?? []).map((topic) => topic.value);
    const completed = topics.filter(
      (topic) => completions[topicProgressId(subject, topic)]
    ).length;
    const percent = topics.length ? Math.round((completed / topics.length) * 100) : 0;
    const status =
      completed === topics.length ? 'complete' : completed > 0 ? 'in-progress' : 'not-started';
    return { subject, topics, completed, percent, status };
  });
}

function nextTopicFrom(
  summaries: SubjectSummary[],
  completions: TopicCompletions
): { subject: Subject; topic: string } | null {
  const active = summaries.find((summary) => summary.status === 'in-progress');
  const subject = active ?? summaries.find((summary) => summary.status === 'not-started');
  if (!subject) return null;
  const topic = subject.topics.find(
    (candidate) => !completions[topicProgressId(subject.subject, candidate)]
  );
  if (!topic) return null;
  return {
    subject: subject.subject,
    topic
  };
}

export default function SyllabusTracker() {
  const { userId, profile } = useAuth();
  const reduceMotion = useReducedMotion();
  const byUser = useTopicProgressStore((state) => state.byUser);
  const setCompleted = useTopicProgressStore((state) => state.setCompleted);
  const pushToast = useUiStore((state) => state.pushToast);

  const effectiveUserId = userId ?? currentUserId();
  const today = todayISOInTimeZone(profile?.timezone ?? 'Asia/Kolkata');
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
  const reattempts = useLiveQuery(
    () => (userId ? db.reattempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const topicProgressRows = useLiveQuery(
    () =>
      effectiveUserId ? db.topic_progress.where('user_id').equals(effectiveUserId).toArray() : [],
    [effectiveUserId],
    []
  );

  useEffect(() => {
    if (!effectiveUserId) return;
    void syncTopicProgressFromDb(effectiveUserId).catch((error: unknown) => {
      console.warn(error);
      pushToast('Syllabus progress is safe on this device; database sync will retry.', 'neutral');
    });
  }, [effectiveUserId, pushToast]);

  const completions = useMemo(() => {
    const cached = selectCompletionsForUser(byUser, effectiveUserId);
    const rows = completionsFromTopicRows(topicProgressRows);
    const merged = { ...cached };
    for (const [id, completedAt] of Object.entries(rows)) {
      if (!merged[id] || merged[id] < completedAt) merged[id] = completedAt;
    }
    return merged;
  }, [byUser, effectiveUserId, topicProgressRows]);
  const summaries = useMemo(() => summariesFor(completions), [completions]);
  const evidenceByTopic = useMemo(() => {
    const map = new Map<string, TopicEvidence>();
    for (const subject of SUBJECTS) {
      const topics = SUBTOPICS_BY_SUBJECT[subject] ?? [];
      for (const topic of topics) {
        const id = topicProgressId(subject, topic.value);
        map.set(
          id,
          buildTopicEvidence({
            subject,
            topic: topic.value,
            studiedAt: completions[id] ?? null,
            questions,
            attempts,
            reattempts,
            today
          })
        );
      }
    }
    return map;
  }, [attempts, completions, questions, reattempts, today]);

  const nextTopic = useMemo(() => nextTopicFrom(summaries, completions), [summaries, completions]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SubjectFilter>('all');
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(
    () => new Set(nextTopic ? [nextTopic.subject] : [SUBJECTS[0]])
  );

  const totalTopics = summaries.reduce((sum, summary) => sum + summary.topics.length, 0);
  const totalCompleted = summaries.reduce((sum, summary) => sum + summary.completed, 0);
  const overallPercent = totalTopics ? Math.round((totalCompleted / totalTopics) * 100) : 0;
  const completedSubjects = summaries.filter((summary) => summary.status === 'complete').length;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleSummaries = summaries.filter((summary) => {
    const matchesFilter = filter === 'all' || summary.status === filter;
    const matchesQuery =
      !normalizedQuery ||
      summary.subject.toLocaleLowerCase().includes(normalizedQuery) ||
      summary.topics.some((topic) => topic.toLocaleLowerCase().includes(normalizedQuery));
    return matchesFilter && matchesQuery;
  });

  const matchingTopicCount = normalizedQuery
    ? visibleSummaries.reduce(
        (sum, summary) =>
          sum +
          summary.topics.filter(
            (topic) =>
              summary.subject.toLocaleLowerCase().includes(normalizedQuery) ||
              topic.toLocaleLowerCase().includes(normalizedQuery)
          ).length,
        0
      )
    : null;

  const recent = summaries
    .flatMap((summary) =>
      summary.topics.flatMap((topic) => {
        const completedAt = completions[topicProgressId(summary.subject, topic)];
        return completedAt ? [{ subject: summary.subject, topic, completedAt }] : [];
      })
    )
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 3);

  function toggleSubject(subject: string) {
    setOpenSubjects((current) => {
      const next = new Set(current);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  }

  async function toggleTopic(subject: string, topic: string, completed: boolean) {
    if (!effectiveUserId) {
      pushToast('Sign in before changing syllabus progress.', 'neutral');
      return;
    }
    try {
      await setCompleted(effectiveUserId, topicProgressId(subject, topic), completed);
      haptic(completed ? 'success' : 'selection');
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : 'Saved on this device; database sync will retry automatically.',
        'neutral'
      );
    }
  }

  function openRecommended() {
    if (!nextTopic) return;
    setOpenSubjects((current) => new Set([...current, nextTopic.subject]));
    setFilter('all');
    setQuery('');
    requestAnimationFrame(() => {
      document.getElementById(`subject-${SUBJECTS.indexOf(nextTopic.subject)}`)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Syllabus tracker"
        description="Track topic coverage across the complete GATE CSE syllabus with verified practice evidence."
      />

      <section className="relative overflow-hidden rounded-lg border border-border bg-bg-raised shadow-card">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgb(var(--color-ink-violet)),rgb(var(--color-ink-cobalt)),rgb(var(--color-ink-teal)),rgb(var(--color-ink-marigold)))]" />
        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
          <SyllabusOrbit summaries={summaries} percent={overallPercent} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={overallPercent === 100 ? 'success' : 'accent'}>
                {overallPercent === 100 ? <CircleCheckBig size={12} /> : <Target size={12} />}
                {overallPercent === 100 ? 'Syllabus complete' : 'GATE CSE scope'}
              </Badge>
              <span className="u-num text-[11px] text-text-faint">
                {completedSubjects}/{SUBJECTS.length} subjects complete
              </span>
            </div>

            {nextTopic ? (
              <div className="mt-4">
                <p className="u-label flex items-center gap-1.5">
                  <Sparkles size={12} className="text-ink-marigold" />
                  Smart next step
                </p>
                <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-text">
                  {nextTopic.topic}
                </h2>
                <p className="mt-0.5 text-[13px] text-text-muted">Continue {nextTopic.subject}</p>
                <button
                  type="button"
                  onClick={openRecommended}
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded border border-accent/30 bg-accent-faint px-3 text-[13px] font-semibold text-accent transition-colors hover:border-accent hover:bg-accent/15"
                >
                  Open topic list
                  <ChevronDown size={14} />
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <p className="u-label">First study pass complete</p>
                <h2 className="mt-1 font-display text-xl font-bold text-success">
                  Every topic is marked studied.
                </h2>
                <p className="mt-1 text-[13px] text-text-muted">
                  Keep the edge by pairing this with PYQs, re-attempts, and timed mocks.
                </p>
              </div>
            )}

            {recent.length > 0 && (
              <div className="mt-5 border-t border-border/70 pt-3">
                <p className="u-label mb-2">Recently studied</p>
                <div className="flex flex-wrap gap-2">
                  {recent.map((item) => (
                    <span
                      key={`${item.subject}-${item.topic}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-success-faint px-2.5 py-1 text-[11.5px] text-success"
                      title={`${item.subject} · ${formatDate(item.completedAt, 'dd MMM, h:mm a')}`}
                    >
                      <Check size={11} strokeWidth={2.5} />
                      <span className="truncate">{item.topic}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="sticky top-[calc(56px+var(--safe-top))] z-20 rounded-lg border border-border bg-bg-raised/95 p-3 shadow-sm backdrop-blur md:top-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search
              size={16}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a topic or subject…"
              className="pl-9"
              aria-label="Search syllabus topics"
            />
          </label>
          <div
            className="grid grid-cols-2 gap-1 sm:flex sm:overflow-x-auto sm:pb-0.5"
            aria-label="Filter subjects"
          >
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={cn(
                  'h-8 w-full shrink-0 rounded-full px-3 text-[11.5px] font-semibold transition-colors sm:w-auto',
                  filter === item.value
                    ? 'bg-text text-bg-raised'
                    : 'bg-bg-overlay text-text-muted hover:text-text'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-[11px] text-text-faint">
          <span>
            {matchingTopicCount === null
              ? `${visibleSummaries.length} ${plural(visibleSummaries.length, 'subject')}`
              : `${matchingTopicCount} matching ${plural(matchingTopicCount, 'topic')}`}
          </span>
          <span className="u-num">
            {totalCompleted}/{totalTopics} topics
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {visibleSummaries.map((summary) => {
          const matchingTopics = normalizedQuery
            ? summary.topics.filter(
                (topic) =>
                  summary.subject.toLocaleLowerCase().includes(normalizedQuery) ||
                  topic.toLocaleLowerCase().includes(normalizedQuery)
              )
            : summary.topics;
          const isOpen = normalizedQuery ? true : openSubjects.has(summary.subject);
          return (
            <SubjectLedger
              key={summary.subject}
              index={SUBJECTS.indexOf(summary.subject)}
              summary={summary}
              topics={matchingTopics}
              completions={completions}
              evidence={evidenceByTopic}
              open={isOpen}
              onToggle={() => toggleSubject(summary.subject)}
              onTopicChange={toggleTopic}
            />
          );
        })}
      </div>

      {visibleSummaries.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-bg-raised px-4 py-12 text-center">
          <Search size={24} className="mx-auto text-text-faint" />
          <h2 className="mt-3 font-display font-semibold text-text">No topics found</h2>
          <p className="mt-1 text-[13px] text-text-muted">
            Try another search or switch the subject filter.
          </p>
        </div>
      )}
    </div>
  );
}

function SyllabusOrbit({ summaries, percent }: { summaries: SubjectSummary[]; percent: number }) {
  const radius = 54;
  const segment = 6.45;
  const step = 100 / summaries.length;

  return (
    <div
      className="mx-auto flex w-[190px] flex-col items-center lg:mx-0"
      aria-label={`${percent}% of syllabus complete`}
    >
      <div className="relative h-[180px] w-[180px]">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
          {summaries.map((summary, index) => (
            <circle
              key={`base-${summary.subject}`}
              cx="64"
              cy="64"
              r={radius}
              pathLength="100"
              fill="none"
              stroke={ORBIT_COLORS[index % ORBIT_COLORS.length]}
              strokeOpacity="0.13"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${segment} ${100 - segment}`}
              strokeDashoffset={-index * step}
            />
          ))}
          {summaries.map((summary, index) => {
            const filled = segment * (summary.percent / 100);
            if (filled === 0) return null;
            return (
              <circle
                key={`fill-${summary.subject}`}
                cx="64"
                cy="64"
                r={radius}
                pathLength="100"
                fill="none"
                stroke={ORBIT_COLORS[index % ORBIT_COLORS.length]}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${filled} ${100 - filled}`}
                strokeDashoffset={-index * step}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="u-num text-4xl font-bold leading-none text-text">{percent}%</span>
          <span className="u-label mt-2">topics studied</span>
        </div>
      </div>
      <p className="-mt-1 text-center text-[11px] leading-relaxed text-text-faint">
        One segment per subject
      </p>
    </div>
  );
}

function SubjectLedger({
  index,
  summary,
  topics,
  completions,
  evidence,
  open,
  onToggle,
  onTopicChange
}: {
  index: number;
  summary: SubjectSummary;
  topics: string[];
  completions: TopicCompletions;
  evidence: Map<string, TopicEvidence>;
  open: boolean;
  onToggle: () => void;
  onTopicChange: (subject: string, topic: string, completed: boolean) => void;
}) {
  const ink = subjectInk(summary.subject);
  return (
    <section
      id={`subject-${index}`}
      className="scroll-mt-40 overflow-hidden rounded-lg border border-border bg-bg-raised shadow-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="group grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left sm:px-4"
      >
        <span
          className={cn(
            'u-num flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold',
            summary.status === 'complete'
              ? 'bg-success-faint text-success'
              : 'bg-bg-overlay text-text-faint'
          )}
        >
          {summary.status === 'complete' ? (
            <Check size={14} strokeWidth={2.5} />
          ) : (
            String(index + 1).padStart(2, '0')
          )}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('font-display text-[15px] font-bold text-text', ink.text)}>
              {summary.subject}
            </span>
            <span className="u-num text-[10px] text-text-faint">
              {summary.completed}/{summary.topics.length}
            </span>
          </span>
          <Progress
            value={summary.completed}
            max={summary.topics.length}
            tone={summary.status === 'complete' ? 'success' : 'accent'}
            className="mt-2 max-w-[360px]"
          />
        </span>
        <span className="flex items-center gap-3">
          <span
            className={cn(
              'hidden rounded-full px-2 py-0.5 text-[10.5px] font-medium sm:inline',
              summary.status === 'complete'
                ? 'bg-success-faint text-success'
                : summary.status === 'in-progress'
                  ? 'bg-accent-faint text-accent'
                  : 'bg-bg-overlay text-text-faint'
            )}
          >
            {summary.status === 'complete'
              ? 'All studied'
              : summary.status === 'in-progress'
                ? `${summary.percent}% done`
                : 'Not started'}
          </span>
          <ChevronDown
            size={17}
            className={cn(
              'text-text-faint transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-bg/40 p-2 sm:p-3">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {topics.map((topic) => {
              const id = topicProgressId(summary.subject, topic);
              const completedAt = completions[id];
              const completed = Boolean(completedAt);
              const topicEvidence = evidence.get(id);
              return (
                <label
                  key={topic}
                  className={cn(
                    'group/topic flex min-h-12 cursor-pointer items-start gap-3 rounded border px-3 py-2.5 transition-[border-color,background-color,transform]',
                    completed
                      ? 'border-success/25 bg-success-faint/45'
                      : 'border-transparent bg-bg-raised hover:border-border-hover hover:-translate-y-px'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={(event) =>
                      onTopicChange(summary.subject, topic, event.target.checked)
                    }
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                      completed
                        ? 'border-success bg-success text-success-contrast'
                        : 'border-border-hover bg-bg-raised group-hover/topic:border-accent'
                    )}
                    aria-hidden="true"
                  >
                    {completed && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-[13px] font-medium leading-snug',
                        completed ? 'text-text-muted' : 'text-text'
                      )}
                    >
                      {topic}
                    </span>
                    <TopicEvidenceLine evidence={topicEvidence} completedAt={completedAt} />
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

const EVIDENCE_LABEL: Record<TopicEvidenceStatus, string> = {
  'not-started': 'Not started',
  studied: 'Studied · no PYQ evidence',
  active: 'Active',
  'needs-revision': 'Needs revision',
  strong: 'Strong'
};

function TopicEvidenceLine({
  evidence,
  completedAt
}: {
  evidence: TopicEvidence | undefined;
  completedAt: string | undefined;
}) {
  if (!evidence) return null;
  const tone =
    evidence.status === 'strong'
      ? 'text-success'
      : evidence.status === 'needs-revision'
        ? 'text-danger'
        : evidence.status === 'active'
          ? 'text-accent'
          : 'text-text-faint';
  const facts = [
    evidence.practiced > 0 ? `${evidence.practiced} practiced` : null,
    evidence.accuracy !== null ? `${Math.round(evidence.accuracy * 100)}%` : null,
    evidence.openMistakes > 0 ? `${evidence.openMistakes} open` : null,
    evidence.lastPracticed ? `last ${formatDate(evidence.lastPracticed, 'dd MMM')}` : null
  ].filter(Boolean);
  return (
    <span className="mt-1 block text-[9.5px] leading-relaxed">
      <span className={cn('font-semibold', tone)}>{EVIDENCE_LABEL[evidence.status]}</span>
      {facts.length > 0 ? (
        <span className="u-num text-text-faint"> · {facts.join(' · ')}</span>
      ) : null}
      {completedAt && evidence.practiced === 0 ? (
        <span className="u-num text-text-faint"> · marked {formatDate(completedAt, 'dd MMM')}</span>
      ) : null}
    </span>
  );
}
