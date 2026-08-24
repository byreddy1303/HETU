import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileQuestion,
  LibraryBig,
  Shuffle,
  XCircle
} from 'lucide-react';
import type {
  MarkDecision,
  Outcome,
  PyqAttemptRow,
  PyqHistoryFilter,
  PyqSelectedAnswer,
  PyqSessionConfig,
  PyqSessionRow,
  QuestionRow,
  SessionRow
} from '@/types';
import type { SourceDraft } from '@/components/tags/sourceDraft';
import type { TagDraft } from '@/components/tags/TagFlow';
import PageHeader from '@/components/layout/PageHeader';
import PyqExamWorkspace from '@/components/pyq/PyqExamWorkspace';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import TagFlow from '@/components/tags/TagFlow';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useTimer } from '@/hooks/useTimer';
import { writeLocal, writeLocalBatch } from '@/lib/sync';
import { createReattemptRow, needsReattempt } from '@/lib/reattempt';
import { reconcileQuestionPattern } from '@/lib/patterns';
import { DEFAULT_TARGET_TIME_SEC, MARKS_TARGET_SEC } from '@/lib/constants';
import {
  answerFreePyqImageUrl,
  firstPyqImage,
  formatPyqAnswer,
  inferPyqDirectOutcome,
  pyqQuestionSnapshotDataUrl,
  resolvePyqJournalImageUrl,
  loadPyqManifest,
  loadPyqQuestions,
  matchesPyqTopicScope,
  pyqPlainText,
  pyqSourceRef,
  type PyqManifest,
  type PyqQuestion
} from '@/lib/pyq';
import {
  abandonPyqSession,
  advancePyqSessionProgress,
  completePyqSession,
  createPyqAttemptRow,
  aggregatePyqAttemptScores,
  createPyqSessionRow,
  nextPyqAttemptNumber,
  pausePyqSession,
  pyqAttemptScorePresentation,
  pyqAttemptId,
  pyqJournalQuestionId,
  pyqPracticeSessionRow,
  pyqPracticeSubject,
  startPyqSessionQuestion
} from '@/lib/pyq-session';
import { reconcilePyqPracticeSessions } from '@/lib/sessions';
import { captureElementToDataUrl } from '@/lib/image';
import { cn, plural, secondsToClock, uuid } from '@/lib/utils';
import { filterPyqByHistory, PYQ_HISTORY_OPTIONS } from '@/lib/pyq-history';
import { markPlannerBlockStarted } from '@/lib/planner-execution';
import {
  checkpointPyqExamSession,
  createPyqExamConfig,
  finalizePyqExam,
  isPyqExamAnswerPresent,
  pausePyqExamSession,
  pyqExamPaletteCounts,
  pyqExamRemainingSeconds,
  resumePyqExamSession,
  setPyqExamResponse,
  setPyqExamReviewMark
} from '@/lib/pyq-exam';

type Order = 'unseen' | 'random' | 'newest' | 'oldest';
type CountChoice = '5' | '10' | '15' | '25' | '50' | 'all';
type TypeFilter = PyqSessionConfig['type'];
type AttemptConfig = PyqSessionConfig;

const CHOICES = ['A', 'B', 'C', 'D'];

function latestQuestionAttempt(
  attempts: PyqAttemptRow[],
  questionUid: string
): PyqAttemptRow | null {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index].question_uid === questionUid) return attempts[index];
  }
  return null;
}

function answerInputType(question: PyqQuestion): 'MCQ' | 'MSQ' | 'NAT' {
  if (question.type === 'MSQ' || question.type === 'NAT') return question.type;
  return 'MCQ';
}

function answerText(question: PyqQuestion): string {
  const formatted = formatPyqAnswer(question);
  return question.answerStatus === 'available' ? `Answer key: ${formatted}` : formatted;
}

function sourceDraft(question: PyqQuestion, screenshot: string | null): SourceDraft {
  const format = ['MCQ', 'MSQ', 'NAT'].includes(question.type)
    ? (question.type as 'MCQ' | 'MSQ' | 'NAT')
    : null;
  return {
    subject: question.subject,
    subtopic: question.topic,
    kind: 'pyq',
    year: question.year,
    set: question.set === 1 || question.set === 2 ? question.set : null,
    questionNumber: question.number,
    marks: question.marks,
    format,
    questionText: pyqPlainText(question.html),
    answerText: answerText(question),
    imageDataUrl: screenshot ?? firstPyqImage(question.html)
  };
}

function PracticeSetup({
  manifest,
  attempts,
  activeSession,
  savedSessions,
  completedSessions,
  config,
  setConfig,
  loading,
  error,
  onResume,
  onSave,
  onDiscard,
  onReview,
  onStart
}: {
  manifest: PyqManifest;
  attempts: PyqAttemptRow[];
  activeSession: PyqSessionRow | null;
  savedSessions: PyqSessionRow[];
  completedSessions: PyqSessionRow[];
  config: AttemptConfig;
  setConfig: (next: AttemptConfig) => void;
  loading: boolean;
  error: string | null;
  onResume: (session: PyqSessionRow) => void;
  onSave: (session: PyqSessionRow) => void;
  onDiscard: (session: PyqSessionRow) => void;
  onReview: (session: PyqSessionRow) => void;
  onStart: () => void;
}) {
  const attemptedIds = useMemo(
    () => new Set(attempts.map((attempt) => attempt.question_uid)),
    [attempts]
  );
  const seenBySubject = useMemo(() => {
    const ids = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      const subjectSlug =
        attempt.question_snapshot?.subject_slug ??
        manifest.subjects.find((subject) => subject.label === attempt.subject)?.slug ??
        attempt.subject;
      const subjectIds = ids.get(subjectSlug) ?? new Set<string>();
      subjectIds.add(attempt.question_uid);
      ids.set(subjectSlug, subjectIds);
    }
    return new Map([...ids].map(([subject, subjectIds]) => [subject, subjectIds.size]));
  }, [attempts, manifest.subjects]);
  const selectedSubject = manifest.subjects.find((subject) => subject.slug === config.subjectSlug);
  const selectedTopics = selectedSubject?.topics ?? [];
  const selectedTopicSlug = config.topicSlug ?? 'all';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GATE PYQs"
        description="CSE papers from 1990–2026, plus in-syllabus ECE and EE Digital Logic."
        showMobileMark={false}
      />

      {activeSession && (
        <Card className="border-accent/30">
          <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-display text-[16px] font-semibold text-text">
                {activeSession.config.mode === 'exam'
                  ? 'Timed exam in progress'
                  : 'Unfinished PYQ set'}
              </p>
              <p className="mt-1 text-[12px] text-text-muted">
                {activeSession.completed_count} of {activeSession.question_uids.length}{' '}
                {activeSession.config.mode === 'exam' ? 'answered' : 'submitted'} ·{' '}
                {activeSession.config.mode === 'exam' && activeSession.config.examState
                  ? `${secondsToClock(pyqExamRemainingSeconds(activeSession))} remaining`
                  : `${secondsToClock(activeSession.elapsed_sec)} logged`}
              </p>
              {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onResume(activeSession)} disabled={loading}>
                Resume set
              </Button>
              <Button
                onClick={() => onSave(activeSession)}
                disabled={loading}
                title="Save this set so you can start a fresh one and come back later"
              >
                <Bookmark size={14} />
                Save set
              </Button>
              <Button onClick={() => onDiscard(activeSession)} disabled={loading}>
                Discard
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {savedSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-text-faint">
            Saved sets
          </p>
          {savedSessions.map((session) => (
            <Card key={session.id}>
              <CardBody className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-bg-overlay text-text-faint">
                    <Bookmark size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-[13.5px] font-semibold text-text">
                      {session.config.mode === 'exam' ? <Badge tone="guess">Exam</Badge> : null}
                      {session.config.subjectSlug === 'all'
                        ? 'Mixed subjects'
                        : (manifest.subjects.find((s) => s.slug === session.config.subjectSlug)
                            ?.label ?? session.config.subjectSlug)}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-text-faint">
                      {session.completed_count} / {session.question_uids.length}{' '}
                      {session.config.mode === 'exam' ? 'answered' : 'done'} ·{' '}
                      {session.config.mode === 'exam' && session.config.examState
                        ? `${secondsToClock(pyqExamRemainingSeconds(session))} left`
                        : secondsToClock(session.elapsed_sec)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => onResume(session)} disabled={loading}>
                    Resume
                  </Button>
                  <Button onClick={() => onDiscard(session)} disabled={loading}>
                    Discard
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="u-label">Choose a subject</p>
                <p className="mt-1 text-[13px] text-text-muted">
                  Each stack is a complete subject archive.
                </p>
              </div>
              <span className="u-num text-[12px] text-text-faint">
                {attemptedIds.size.toLocaleString()} / {manifest.questionCount.toLocaleString()}{' '}
                seen
              </span>
            </div>
            <label className="block text-[12px] font-medium text-text-muted sm:hidden">
              Subject
              <Select
                className="mt-1"
                value={config.subjectSlug}
                onChange={(event) =>
                  setConfig({ ...config, subjectSlug: event.target.value, topicSlug: 'all' })
                }
              >
                <option value="all">Mixed subjects — {manifest.questionCount} questions</option>
                {manifest.subjects.map((subject) => (
                  <option key={subject.slug} value={subject.slug}>
                    {subject.label} — {subject.count}
                  </option>
                ))}
              </Select>
            </label>
            <div className="hidden grid-cols-1 gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, subjectSlug: 'all', topicSlug: 'all' })}
                aria-pressed={config.subjectSlug === 'all'}
                className={cn(
                  'group flex min-h-[78px] items-start gap-3 rounded border p-3 text-left transition-all',
                  config.subjectSlug === 'all'
                    ? 'border-accent/50 bg-accent-faint shadow-sm'
                    : 'border-border bg-bg-raised hover:-translate-y-0.5 hover:border-border-hover'
                )}
              >
                <Shuffle size={17} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="block text-[13.5px] font-semibold text-text">
                    Mixed subjects
                  </span>
                  <span className="u-num mt-1 block text-[11px] text-text-faint">
                    {manifest.questionCount.toLocaleString()} questions
                  </span>
                </span>
              </button>
              {manifest.subjects.map((subject) => {
                const active = config.subjectSlug === subject.slug;
                const seen = seenBySubject.get(subject.slug) ?? 0;
                return (
                  <button
                    key={subject.slug}
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, subjectSlug: subject.slug, topicSlug: 'all' })
                    }
                    aria-pressed={active}
                    className={cn(
                      'group flex min-h-[78px] items-start gap-3 rounded border p-3 text-left transition-all',
                      active
                        ? 'border-accent/50 bg-accent-faint shadow-sm'
                        : 'border-border bg-bg-raised hover:-translate-y-0.5 hover:border-border-hover'
                    )}
                  >
                    <LibraryBig
                      size={17}
                      className={cn('mt-0.5 shrink-0', active ? 'text-accent' : 'text-text-faint')}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold leading-snug text-text">
                        {subject.label}
                      </span>
                      <span className="u-num mt-1 block text-[11px] text-text-faint">
                        {seen}/{subject.count} seen
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedSubject && selectedTopics.length > 1 && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="u-label">Choose a topic</p>
                    <p className="mt-1 text-[13px] text-text-muted">
                      Pick one topic, or keep the complete subject selected.
                    </p>
                  </div>
                  <span className="u-num text-[11px] text-text-faint">
                    {selectedTopics.length} topics
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, topicSlug: 'all' })}
                    aria-pressed={selectedTopicSlug === 'all'}
                    className={cn(
                      'flex min-h-[56px] items-center justify-between gap-3 rounded border px-3 py-2 text-left transition-all',
                      selectedTopicSlug === 'all'
                        ? 'border-accent/50 bg-accent-faint shadow-sm'
                        : 'border-border bg-bg-raised hover:border-border-hover'
                    )}
                  >
                    <span className="text-[13px] font-semibold text-text">
                      All {selectedSubject.label}
                    </span>
                    <span className="u-num shrink-0 text-[11px] text-text-faint">
                      {selectedSubject.count}
                    </span>
                  </button>
                  {selectedTopics.map((topic) => {
                    const active = selectedTopicSlug === topic.slug;
                    return (
                      <button
                        key={topic.slug}
                        type="button"
                        onClick={() => setConfig({ ...config, topicSlug: topic.slug })}
                        aria-pressed={active}
                        className={cn(
                          'flex min-h-[56px] items-center justify-between gap-3 rounded border px-3 py-2 text-left transition-all',
                          active
                            ? 'border-accent/50 bg-accent-faint shadow-sm'
                            : 'border-border bg-bg-raised hover:border-border-hover'
                        )}
                      >
                        <span className="text-[13px] font-medium leading-snug text-text">
                          {topic.label}
                        </span>
                        <span className="u-num shrink-0 text-[11px] text-text-faint">
                          {topic.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col bg-bg-overlay/25 p-4">
            <p className="u-label">Choose a session mode</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={(config.mode ?? 'practice') === 'practice'}
                onClick={() => setConfig({ ...config, mode: 'practice', examState: undefined })}
                className={cn(
                  'rounded border p-3 text-left transition-colors',
                  (config.mode ?? 'practice') === 'practice'
                    ? 'border-accent/45 bg-accent-faint'
                    : 'border-border bg-bg-raised hover:border-border-hover'
                )}
              >
                <span className="block text-[13px] font-semibold text-text">Practice</span>
                <span className="mt-1 block text-[11px] leading-snug text-text-faint">
                  Reveal each key after committing.
                </span>
              </button>
              <button
                type="button"
                aria-pressed={config.mode === 'exam'}
                onClick={() =>
                  setConfig({
                    ...config,
                    mode: 'exam',
                    count: config.count === 'all' ? '15' : config.count,
                    examState: undefined
                  })
                }
                className={cn(
                  'rounded border p-3 text-left transition-colors',
                  config.mode === 'exam'
                    ? 'border-ink-violet/45 bg-guess-faint'
                    : 'border-border bg-bg-raised hover:border-border-hover'
                )}
              >
                <span className="block text-[13px] font-semibold text-text">Exam mode</span>
                <span className="mt-1 block text-[11px] leading-snug text-text-faint">
                  One clock, free navigation, keys after submit.
                </span>
              </button>
            </div>
            {config.mode === 'exam' ? (
              <p className="mt-3 rounded border border-ink-violet/20 bg-guess-faint px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                The clock allows 3 minutes per question. Draft responses and review flags are saved
                locally until you submit.
              </p>
            ) : null}
            <p className="u-label mt-5">Build this set</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-[12px] font-medium text-text-muted">
                From year
                <Select
                  className="mt-1"
                  value={config.fromYear}
                  onChange={(event) =>
                    setConfig({ ...config, fromYear: Number(event.target.value) })
                  }
                >
                  {manifest.years
                    .slice()
                    .reverse()
                    .map(({ year }) => (
                      <option key={year}>{year}</option>
                    ))}
                </Select>
              </label>
              <label className="text-[12px] font-medium text-text-muted">
                To year
                <Select
                  className="mt-1"
                  value={config.toYear}
                  onChange={(event) => setConfig({ ...config, toYear: Number(event.target.value) })}
                >
                  {manifest.years.map(({ year }) => (
                    <option key={year}>{year}</option>
                  ))}
                </Select>
              </label>
              <label className="text-[12px] font-medium text-text-muted">
                Question type
                <Select
                  className="mt-1"
                  value={config.type}
                  onChange={(event) =>
                    setConfig({ ...config, type: event.target.value as TypeFilter })
                  }
                >
                  <option value="all">All types</option>
                  <option value="MCQ">MCQ</option>
                  <option value="MSQ">MSQ</option>
                  <option value="NAT">NAT</option>
                </Select>
              </label>
              <label className="text-[12px] font-medium text-text-muted">
                Questions
                <Select
                  className="mt-1"
                  value={config.count}
                  onChange={(event) =>
                    setConfig({ ...config, count: event.target.value as CountChoice })
                  }
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="15">15</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  {config.mode !== 'exam' ? <option value="all">All matching</option> : null}
                </Select>
              </label>
              <label className="col-span-2 text-[12px] font-medium text-text-muted">
                Practice history
                <Select
                  className="mt-1"
                  value={config.history ?? 'all'}
                  onChange={(event) =>
                    setConfig({ ...config, history: event.target.value as PyqHistoryFilter })
                  }
                >
                  {PYQ_HISTORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="col-span-2 text-[12px] font-medium text-text-muted">
                Order
                <Select
                  className="mt-1"
                  value={config.order}
                  onChange={(event) => setConfig({ ...config, order: event.target.value as Order })}
                >
                  <option value="unseen">Unseen first</option>
                  <option value="random">Random</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </Select>
              </label>
            </div>
            <div className="mt-auto pt-6">
              {error && !activeSession && <p className="mb-3 text-[12px] text-danger">{error}</p>}
              <Button variant="primary" className="w-full" onClick={onStart} disabled={loading}>
                <BookOpenCheck size={17} />
                {loading
                  ? 'Opening question bank…'
                  : config.mode === 'exam'
                    ? 'Start timed exam'
                    : 'Start fresh set'}
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-text-faint">
                {config.mode === 'exam'
                  ? 'No answer key or correctness is shown before final submission.'
                  : 'Questions and diagrams are bundled locally. Your answer stays hidden until you commit.'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {completedSessions.length > 0 ? (
        <section aria-labelledby="pyq-session-history" className="pt-2">
          <div className="mb-2 flex items-end justify-between gap-3 px-1">
            <div>
              <p id="pyq-session-history" className="u-label">
                Session reports
              </p>
              <p className="mt-1 text-[12px] text-text-faint">
                Reopen the full score, timing chart, and every response.
              </p>
            </div>
            <span className="u-num text-[11px] text-text-faint">
              {completedSessions.length} recent
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {completedSessions.map((session) => {
              const sessionAttempts = attempts.filter(
                (attempt) => attempt.pyq_session_id === session.id
              );
              const latestByQuestion = new Map<string, PyqAttemptRow>();
              for (const attempt of sessionAttempts) {
                const previous = latestByQuestion.get(attempt.question_uid);
                if (!previous || attempt.attempt_number >= previous.attempt_number) {
                  latestByQuestion.set(attempt.question_uid, attempt);
                }
              }
              const correct = [...latestByQuestion.values()].filter(
                (attempt) => attempt.mark_correct === true
              ).length;
              return (
                <Card key={session.id}>
                  <CardBody className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={session.config.mode === 'exam' ? 'guess' : 'neutral'}>
                          {session.config.mode === 'exam' ? 'Exam' : 'Practice'}
                        </Badge>
                        <span className="u-num text-[10px] text-text-faint">
                          {new Date(
                            session.completed_at ?? session.updated_at
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[13px] font-semibold text-text">
                        {session.config.subjectSlug === 'all'
                          ? 'Mixed subjects'
                          : (manifest.subjects.find(
                              (subject) => subject.slug === session.config.subjectSlug
                            )?.label ?? session.config.subjectSlug)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-faint">
                        {correct}/{session.question_uids.length} correct ·{' '}
                        {secondsToClock(session.elapsed_sec)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => onReview(session)}>
                      View report <ArrowRight size={13} />
                    </Button>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AnswerPad({
  question,
  choices,
  numeric,
  disabled,
  onChoices,
  onNumeric
}: {
  question: PyqQuestion;
  choices: string[];
  numeric: string;
  disabled: boolean;
  onChoices: (choices: string[]) => void;
  onNumeric: (value: string) => void;
}) {
  const inputType = answerInputType(question);
  if (inputType === 'NAT') {
    return (
      <label className="block text-[12px] font-medium text-text-muted">
        Your numeric answer
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={numeric}
          disabled={disabled}
          onChange={(event) => onNumeric(event.target.value)}
          placeholder="Enter a number"
          className="u-control mt-1 h-12 w-full rounded border border-border bg-bg-raised px-3 font-mono text-[16px] text-text shadow-sm focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-faint"
        />
      </label>
    );
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="u-label mb-2">
        Your answer {inputType === 'MSQ' ? '— select all that apply' : ''}
      </legend>
      <div className="grid grid-cols-4 gap-2">
        {CHOICES.map((choice) => {
          const active = choices.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (inputType === 'MCQ') onChoices([choice]);
                else
                  onChoices(
                    active ? choices.filter((item) => item !== choice) : [...choices, choice]
                  );
              }}
              className={cn(
                'h-12 rounded border font-mono text-[15px] font-semibold transition-all',
                active
                  ? 'border-accent bg-accent text-accent-contrast shadow-key'
                  : 'border-border bg-bg-raised text-text-muted hover:-translate-y-px hover:border-accent/40 hover:text-text'
              )}
            >
              {choice}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function DecisionButtons({
  value,
  disabled,
  onChange
}: {
  value: MarkDecision | null;
  disabled: boolean;
  onChange: (value: MarkDecision) => void;
}) {
  const options: { value: MarkDecision; label: string; hint: string }[] = [
    { value: 'MARK', label: 'Answered', hint: 'committed' },
    { value: 'FIFTY_FIFTY', label: 'Guessed 50/50', hint: 'uncertain' },
    { value: 'SKIP', label: 'Left blank', hint: 'skipped' }
  ];
  return (
    <fieldset disabled={disabled}>
      <legend className="u-label mb-2">Exam decision</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={`${option.label}: ${option.hint}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded border px-3 py-2.5 text-left transition-colors',
              value === option.value
                ? 'border-ink-violet/40 bg-ink-violet/10 text-ink-violet'
                : 'border-border bg-bg-raised text-text-muted hover:border-border-hover'
            )}
          >
            <span className="block text-[12.5px] font-semibold">{option.label}</span>
            <span className="u-label mt-0.5 block">{option.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ResultPanel({ question, attempt }: { question: PyqQuestion; attempt: PyqAttemptRow }) {
  const skipped = attempt.mark_decision === 'SKIP';
  const available = question.answerStatus === 'available';
  const tone =
    skipped || attempt.mark_correct == null ? 'warn' : attempt.mark_correct ? 'success' : 'danger';
  const title = skipped
    ? 'Left blank'
    : !available
      ? 'No definitive key'
      : attempt.mark_correct
        ? 'Correct'
        : 'Not correct';
  const Icon =
    skipped || attempt.mark_correct == null
      ? FileQuestion
      : attempt.mark_correct
        ? CheckCircle2
        : XCircle;
  const learnerAnswer =
    attempt.capture_version === 2 || attempt.capture_version === 3
      ? attempt.mark_decision === 'SKIP'
        ? 'Left blank'
        : formatAttemptAnswer(attempt.selected_answer)
      : 'Legacy attempt — learner response not verified';
  const capturedKey =
    attempt.answer_status === 'available'
      ? formatAttemptAnswer(attempt.correct_answer)
      : answerText(question).replace(/^Answer key:\s*/i, '');
  const score = pyqAttemptScorePresentation(attempt);
  return (
    <section
      aria-label="PYQ attempt receipt"
      className={cn(
        'rounded border p-4',
        tone === 'success'
          ? 'border-success/30 bg-success-faint'
          : tone === 'danger'
            ? 'border-danger/30 bg-danger-faint'
            : 'border-warn/30 bg-warn-faint'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={20}
          className={cn(
            'mt-0.5 shrink-0',
            tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-warn'
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-[17px] font-semibold text-text">{title}</p>
            <span className="u-num text-[11px] text-text-faint">
              {secondsToClock(attempt.time_spent_sec)}
            </span>
          </div>
          <dl className="mt-2 grid gap-1.5 text-[12px] sm:grid-cols-2">
            <div>
              <dt className="u-label">Your answer</dt>
              <dd className="mt-0.5 font-mono font-semibold text-text">{learnerAnswer}</dd>
            </div>
            <div>
              <dt className="u-label">Correct answer</dt>
              <dd className="mt-0.5 font-mono font-semibold text-text">{capturedKey}</dd>
            </div>
          </dl>
          {question.type === 'NAT' &&
            question.tolerance?.abs != null &&
            question.tolerance.abs > 0 && (
              <p className="mt-1 text-[11px] text-text-faint">
                Accepted tolerance: ±{question.tolerance.abs}
              </p>
            )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={score.covered ? 'accent' : 'warn'}>{score.label}</Badge>
            <span className="text-[11px] text-text-faint">{score.detail}</span>
          </div>
          <p className="mt-2 text-[11px] text-text-faint">
            Committed {new Date(attempt.attempted_at).toLocaleString()} ·{' '}
            {attempt.time_spent_ms == null
              ? secondsToClock(attempt.time_spent_sec)
              : `${(attempt.time_spent_ms / 1000).toFixed(1)}s exact`}
          </p>
          <a
            href={question.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
          >
            Open source question <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </section>
  );
}

function formatAttemptAnswer(value: PyqSelectedAnswer): string {
  if (value == null) return 'Unavailable';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export default function Pyq() {
  const { userId, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const [manifest, setManifest] = useState<PyqManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [config, setConfig] = useState<AttemptConfig>(() => ({
    subjectSlug: 'discrete-mathematics',
    topicSlug: 'all',
    fromYear: 1990,
    toYear: 2026,
    type: 'all',
    order: 'unseen',
    count: (['5', '10', '15', '25', '50', 'all'].includes(searchParams.get('count') ?? '')
      ? searchParams.get('count')
      : '10') as CountChoice,
    history: (PYQ_HISTORY_OPTIONS.some((option) => option.value === searchParams.get('history'))
      ? searchParams.get('history')
      : 'all') as PyqHistoryFilter,
    mode: 'practice'
  }));
  const [questions, setQuestions] = useState<PyqQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [numeric, setNumeric] = useState('');
  const [decision, setDecision] = useState<MarkDecision | null>(null);
  const [submitted, setSubmitted] = useState<PyqAttemptRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<PyqAttemptRow[]>([]);
  const [finished, setFinished] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalSaved, setJournalSaved] = useState(false);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [questionScreenshot, setQuestionScreenshot] = useState<string | null>(null);
  const [pyqSessionId, setPyqSessionId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<PyqSessionRow | null>(null);
  const [examSubmitOpen, setExamSubmitOpen] = useState(false);
  const questionCaptureRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const startingRef = useRef(false);
  const questionStartRef = useRef<{ questionUid: string; startedAtMs: number } | null>(null);
  const completedRef = useRef(completed);
  const loadedSessionRef = useRef<PyqSessionRow | null>(loadedSession);
  const examWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const finalizeExamRef = useRef<(reason: 'manual' | 'time-expired') => Promise<void>>(
    async () => {}
  );
  completedRef.current = completed;
  loadedSessionRef.current = loadedSession;

  const attempts = useLiveQuery(
    async () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const activePyqSession = useLiveQuery(
    async () => {
      if (!userId) return null;
      const rows = await db.pyq_sessions
        .where('[user_id+status]')
        .equals([userId, 'active'])
        .toArray();
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
    },
    [userId],
    null
  );
  const pausedPyqSessions = useLiveQuery(
    async () => {
      if (!userId) return [];
      const rows = await db.pyq_sessions
        .where('[user_id+status]')
        .equals([userId, 'paused'])
        .toArray();
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    [userId],
    []
  );
  const completedPyqSessions = useLiveQuery(
    async () => {
      if (!userId) return [];
      const rows = await db.pyq_sessions
        .where('[user_id+status]')
        .equals([userId, 'completed'])
        .toArray();
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
    },
    [userId],
    []
  );
  const patterns = useLiveQuery(
    async () => (userId ? db.patterns.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const journalQuestions = useLiveQuery(
    async () => (userId ? db.questions.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  useEffect(() => {
    if (!userId) return;
    void reconcilePyqPracticeSessions(userId, timeZone);
  }, [userId, timeZone]);

  useEffect(() => {
    let active = true;
    loadPyqManifest()
      .then((value) => {
        if (!active) return;
        setManifest(value);
        setConfig((current) => {
          const requestedSubject = searchParams.get('subject');
          const requested = requestedSubject
            ? value.subjects.find(
                (subject) =>
                  subject.label.toLocaleLowerCase() === requestedSubject.toLocaleLowerCase()
              )
            : null;
          return {
            ...current,
            subjectSlug: requested?.slug ?? current.subjectSlug,
            topicSlug: 'all',
            fromYear: value.firstYear,
            toYear: value.lastYear
          };
        });
      })
      .catch((error: unknown) => {
        if (active)
          setManifestError(
            error instanceof Error ? error.message : 'Could not open the question bank.'
          );
      });
    return () => {
      active = false;
    };
  }, [searchParams]);

  const current = questions[index] ?? null;
  const currentId = current?.id ?? null;
  const latestCurrentAttempt = currentId ? latestQuestionAttempt(completed, currentId) : null;
  useEffect(() => {
    if (!currentId) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    const openSession = loadedSessionRef.current;
    if (openSession?.config.mode === 'exam' && openSession.config.examState) {
      const savedAnswer = openSession.config.examState.responses[currentId];
      setStartedAt(null);
      setChoices(
        Array.isArray(savedAnswer)
          ? savedAnswer.map(String)
          : typeof savedAnswer === 'string' && answerInputType(questions[index]) !== 'NAT'
            ? [savedAnswer]
            : []
      );
      setNumeric(
        answerInputType(questions[index]) === 'NAT' && savedAnswer != null
          ? String(savedAnswer)
          : ''
      );
      setDecision(null);
      setSubmitted(null);
      setSubmitting(false);
      setJournalOpen(false);
      setJournalSaved(false);
      setQuestionScreenshot(firstPyqImage(questions[index].html));
      setSubmitError(null);
      return;
    }
    const priorAttempt = latestQuestionAttempt(completedRef.current, currentId);
    const lockedAttempt = priorAttempt?.mark_decision === 'SKIP' ? null : priorAttempt;
    const persistedStart = questionStartRef.current;
    setStartedAt(
      lockedAttempt
        ? null
        : persistedStart?.questionUid === currentId
          ? persistedStart.startedAtMs
          : Date.now()
    );
    questionStartRef.current = null;
    const savedAnswer = lockedAttempt?.selected_answer;
    setChoices(
      Array.isArray(savedAnswer)
        ? savedAnswer.map(String)
        : typeof savedAnswer === 'string' && answerInputType(questions[index]) !== 'NAT'
          ? [savedAnswer]
          : []
    );
    setNumeric(
      lockedAttempt && answerInputType(questions[index]) === 'NAT' ? String(savedAnswer ?? '') : ''
    );
    setDecision(lockedAttempt?.mark_decision ?? null);
    setSubmitted(lockedAttempt ?? null);
    setSubmitting(false);
    setJournalOpen(false);
    setJournalSaved(false);
    setQuestionScreenshot(
      firstPyqImage(questions[index].html) ??
        answerFreePyqImageUrl(lockedAttempt?.screenshot_url) ??
        null
    );
    setSubmitError(null);
  }, [currentId, index, questions]);

  useEffect(() => {
    if (journalOpen) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [journalOpen]);

  const liveSeconds = useTimer(submitted ? null : startedAt);
  const shownSeconds = submitted?.time_spent_sec ?? liveSeconds;
  const timedExamActive =
    loadedSession?.config.mode === 'exam' &&
    loadedSession.status === 'active' &&
    questions.length > 0 &&
    !finished;
  const examStartedMs = timedExamActive
    ? Date.parse(loadedSession.current_question_started_at ?? '')
    : Number.NaN;
  useTimer(Number.isFinite(examStartedMs) ? examStartedMs : null);
  const examRemainingSec =
    timedExamActive && loadedSession ? pyqExamRemainingSeconds(loadedSession) : 0;

  useEffect(() => {
    if (!timedExamActive || examRemainingSec > 0 || submittingRef.current) return;
    void finalizeExamRef.current('time-expired');
  }, [examRemainingSec, timedExamActive]);

  function setLoadedExamSession(next: PyqSessionRow, persist = true) {
    loadedSessionRef.current = next;
    setLoadedSession(next);
    if (!persist) return;
    const queued = examWriteQueueRef.current
      .catch(() => undefined)
      .then(() => writeLocal('pyq_sessions', next));
    examWriteQueueRef.current = queued;
    void queued.catch((error: unknown) => {
      setSubmitError(
        error instanceof Error
          ? `Exam draft was not saved: ${error.message}`
          : 'Exam draft was not saved. Try the action again.'
      );
    });
  }

  async function questionsForSession(session: PyqSessionRow): Promise<PyqQuestion[]> {
    if (!manifest) return [];
    const rows = await loadPyqQuestions(manifest.subjects, manifest.bankVersion);
    const byId = new Map(rows.map((question) => [question.id, question]));
    return session.question_uids.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    });
  }

  async function resumeSession(session: PyqSessionRow) {
    if (!manifest || loading) return;
    setLoading(true);
    setStartError(null);
    try {
      // If resuming a paused set, auto-pause the currently active set first
      if (session.status === 'paused' && userId) {
        const activeRows = await db.pyq_sessions
          .where('[user_id+status]')
          .equals([userId, 'active'])
          .toArray();
        for (const activeRow of activeRows) {
          await writeLocal(
            'pyq_sessions',
            activeRow.config.mode === 'exam'
              ? pausePyqExamSession(activeRow)
              : pausePyqSession(activeRow)
          );
        }
        if (pyqSessionId && activeRows.some((r) => r.id === pyqSessionId)) {
          setQuestions([]);
          setFinished(false);
          setIndex(0);
          setPyqSessionId(null);
        }
      }

      const rows = await questionsForSession(session);
      if (rows.length !== session.question_uids.length) {
        throw new Error(
          'This saved set no longer matches the local question bank. Discard it before continuing.'
        );
      }
      const isExam = session.config.mode === 'exam';
      const exhausted = !isExam && session.current_index >= rows.length;
      // Bank rebuilds can add coverage or correct taxonomy without removing a
      // saved set's questions. Once every durable question ID resolves, move
      // the set to the current version instead of stranding it permanently.
      const compatibleSession =
        session.bank_version === manifest.bankVersion
          ? session
          : {
              ...session,
              bank_version: manifest.bankVersion,
              updated_at: new Date().toISOString()
            };
      // Reactivate paused sessions
      const activatedSession: PyqSessionRow = isExam
        ? compatibleSession.status === 'paused'
          ? resumePyqExamSession(compatibleSession)
          : compatibleSession
        : compatibleSession.status !== 'active'
          ? { ...compatibleSession, status: 'active', updated_at: new Date().toISOString() }
          : compatibleSession;
      const durableSession = exhausted ? completePyqSession(activatedSession) : activatedSession;
      const savedAttempts = (
        await db.pyq_attempts.where('user_id').equals(session.user_id).toArray()
      )
        .filter((attempt) => attempt.pyq_session_id === session.id)
        .sort((a, b) => a.attempted_at.localeCompare(b.attempted_at));
      const existingCanonical = await db.sessions.get(session.id);
      const canonical = pyqPracticeSessionRow(
        durableSession,
        pyqPracticeSubject(rows),
        timeZone,
        existingCanonical
      );
      await writeLocalBatch([
        ...(durableSession !== session
          ? ([{ name: 'pyq_sessions', row: durableSession }] as const)
          : []),
        { name: 'sessions', row: canonical }
      ]);
      const nextIndex = Math.min(durableSession.current_index, Math.max(0, rows.length - 1));
      let resumedSession = durableSession;
      if (!exhausted) {
        resumedSession = isExam
          ? durableSession.current_question_uid
            ? durableSession
            : checkpointPyqExamSession(durableSession, rows[nextIndex].id)
          : startPyqSessionQuestion(durableSession, rows[nextIndex].id);
        if (resumedSession !== durableSession) await writeLocal('pyq_sessions', resumedSession);
        if (!isExam) {
          const resumedAt = Date.parse(resumedSession.current_question_started_at ?? '');
          questionStartRef.current = {
            questionUid: rows[nextIndex].id,
            startedAtMs: Number.isFinite(resumedAt) ? resumedAt : Date.now()
          };
        }
      }
      setConfig({
        ...resumedSession.config,
        topicSlug: resumedSession.config.topicSlug ?? 'all',
        history: resumedSession.config.history ?? 'all'
      });
      setQuestions(rows);
      setIndex(nextIndex);
      setCompleted(savedAttempts);
      setFinished(exhausted);
      setAnalyzedCount(0);
      setPyqSessionId(session.id);
      loadedSessionRef.current = resumedSession;
      setLoadedSession(resumedSession);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not resume that PYQ set.');
    } finally {
      setLoading(false);
    }
  }

  async function discardSession(session: PyqSessionRow) {
    if (loading) return;
    setLoading(true);
    setStartError(null);
    try {
      const abandoned = abandonPyqSession(session);
      const sessionAttempts = (
        await db.pyq_attempts.where('user_id').equals(session.user_id).toArray()
      ).filter((attempt) => attempt.pyq_session_id === session.id);
      const existingCanonical = await db.sessions.get(session.id);
      await writeLocalBatch([
        { name: 'pyq_sessions', row: abandoned },
        {
          name: 'sessions',
          row: pyqPracticeSessionRow(
            abandoned,
            sessionAttempts.length > 0
              ? pyqPracticeSubject(sessionAttempts)
              : (existingCanonical?.subject ?? 'PYQ practice'),
            timeZone,
            existingCanonical
          )
        }
      ]);
      if (pyqSessionId === session.id) {
        setQuestions([]);
        setFinished(false);
        setIndex(0);
        setPyqSessionId(null);
        loadedSessionRef.current = null;
        setLoadedSession(null);
      }
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not discard that PYQ set.');
    } finally {
      setLoading(false);
    }
  }

  async function saveSession(session: PyqSessionRow) {
    if (loading) return;
    setLoading(true);
    setStartError(null);
    try {
      await examWriteQueueRef.current.catch(() => undefined);
      const currentSession =
        loadedSessionRef.current?.id === session.id ? loadedSessionRef.current : session;
      const paused =
        currentSession.config.mode === 'exam'
          ? pausePyqExamSession(currentSession)
          : pausePyqSession(currentSession);
      await writeLocal('pyq_sessions', paused);
      if (pyqSessionId === session.id) {
        setQuestions([]);
        setFinished(false);
        setIndex(0);
        setPyqSessionId(null);
        loadedSessionRef.current = null;
        setLoadedSession(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save that PYQ set.';
      if (session.config.mode === 'exam') setSubmitError(`Exam was not saved: ${message}`);
      else setStartError(message);
    } finally {
      setLoading(false);
    }
  }

  async function startPractice() {
    if (!manifest || loading || !userId || startingRef.current) return;
    startingRef.current = true;
    setLoading(true);
    setStartError(null);
    try {
      // Auto-pause any active set so the user can start a fresh one
      const activeRows = await db.pyq_sessions
        .where('[user_id+status]')
        .equals([userId, 'active'])
        .toArray();
      for (const activeRow of activeRows) {
        await writeLocal(
          'pyq_sessions',
          activeRow.config.mode === 'exam'
            ? pausePyqExamSession(activeRow)
            : pausePyqSession(activeRow)
        );
      }
      if (pyqSessionId && activeRows.some((r) => r.id === pyqSessionId)) {
        setQuestions([]);
        setFinished(false);
        setIndex(0);
        setPyqSessionId(null);
      }
      const subjects =
        config.subjectSlug === 'all'
          ? manifest.subjects
          : manifest.subjects.filter((subject) => subject.slug === config.subjectSlug);
      const low = Math.min(config.fromYear, config.toYear);
      const high = Math.max(config.fromYear, config.toYear);
      let rows = (await loadPyqQuestions(subjects, manifest.bankVersion)).filter(
        (question) =>
          matchesPyqTopicScope(question, config) &&
          question.year >= low &&
          question.year <= high &&
          (config.type === 'all' || question.type === config.type)
      );
      rows = filterPyqByHistory(rows, config.history ?? 'all', attempts, journalQuestions);
      const attemptedIds = new Set(attempts.map((attempt) => attempt.question_uid));
      if (config.order === 'random') rows = rows.slice().sort(() => Math.random() - 0.5);
      else if (config.order === 'oldest')
        rows = rows
          .slice()
          .sort(
            (a, b) =>
              a.year - b.year || a.number.localeCompare(b.number, undefined, { numeric: true })
          );
      else if (config.order === 'newest')
        rows = rows
          .slice()
          .sort(
            (a, b) =>
              b.year - a.year || a.number.localeCompare(b.number, undefined, { numeric: true })
          );
      else
        rows = rows
          .slice()
          .sort(
            (a, b) =>
              Number(attemptedIds.has(a.id)) - Number(attemptedIds.has(b.id)) || b.year - a.year
          );
      if (config.count !== 'all') rows = rows.slice(0, Number(config.count));
      if (rows.length === 0)
        throw new Error(
          'No questions match those filters. Widen the subject, year, type, or history filter.'
        );
      const sessionConfig =
        config.mode === 'exam'
          ? createPyqExamConfig(
              config,
              rows.map((question) => question.id)
            )
          : { ...config, mode: 'practice' as const, examState: undefined };
      const session = createPyqSessionRow(userId!, manifest.bankVersion, sessionConfig, rows);
      const plannerDate = searchParams.get('plannerDate');
      const plannerBlockId = searchParams.get('plannerBlock');
      if (plannerDate && plannerBlockId) markPlannerBlockStarted(plannerDate, plannerBlockId);
      const canonical: SessionRow = {
        ...pyqPracticeSessionRow(session, pyqPracticeSubject(rows), timeZone),
        planner_date: plannerDate,
        planner_block_id: plannerBlockId
      };
      await writeLocalBatch([
        { name: 'pyq_sessions', row: session },
        {
          name: 'sessions',
          row: canonical
        }
      ]);
      if (session.config.mode !== 'exam') {
        const firstStartedAt = Date.parse(session.current_question_started_at ?? '');
        questionStartRef.current = {
          questionUid: rows[0].id,
          startedAtMs: Number.isFinite(firstStartedAt) ? firstStartedAt : Date.now()
        };
      }
      setConfig(sessionConfig);
      setPyqSessionId(session.id);
      loadedSessionRef.current = session;
      setLoadedSession(session);
      setQuestions(rows);
      setIndex(0);
      setCompleted([]);
      setFinished(false);
      setAnalyzedCount(0);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not build this practice set.');
    } finally {
      startingRef.current = false;
      setLoading(false);
    }
  }

  async function repeatCurrentSet() {
    if (!manifest || !userId || loading || questions.length === 0 || startingRef.current) return;
    startingRef.current = true;
    setLoading(true);
    setStartError(null);
    try {
      const activeRows = await db.pyq_sessions
        .where('[user_id+status]')
        .equals([userId, 'active'])
        .toArray();
      for (const activeRow of activeRows) {
        await writeLocal(
          'pyq_sessions',
          activeRow.config.mode === 'exam'
            ? pausePyqExamSession(activeRow)
            : pausePyqSession(activeRow)
        );
      }
      const repeatedConfig =
        config.mode === 'exam'
          ? createPyqExamConfig(
              config,
              questions.map((question) => question.id)
            )
          : { ...config, mode: 'practice' as const, examState: undefined };
      const session = createPyqSessionRow(userId, manifest.bankVersion, repeatedConfig, questions);
      await writeLocalBatch([
        { name: 'pyq_sessions', row: session },
        {
          name: 'sessions',
          row: pyqPracticeSessionRow(session, pyqPracticeSubject(questions), timeZone)
        }
      ]);
      if (session.config.mode !== 'exam') {
        const firstStartedAt = Date.parse(session.current_question_started_at ?? '');
        questionStartRef.current = {
          questionUid: questions[0].id,
          startedAtMs: Number.isFinite(firstStartedAt) ? firstStartedAt : Date.now()
        };
      }
      setConfig(repeatedConfig);
      setPyqSessionId(session.id);
      loadedSessionRef.current = session;
      setLoadedSession(session);
      setIndex(0);
      setCompleted([]);
      setFinished(false);
      setAnalyzedCount(0);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not repeat that exact set.');
    } finally {
      startingRef.current = false;
      setLoading(false);
    }
  }

  function questionRowFromAttempt(
    attempt: PyqAttemptRow,
    draft: TagDraft | undefined,
    imageUrl: string | null
  ): QuestionRow {
    if (!current) throw new Error('No active question');
    const outcome =
      draft?.outcome ??
      inferPyqDirectOutcome(current, attempt.mark_decision, attempt.time_spent_sec);
    return {
      id: uuid(),
      user_id: userId!,
      session_id: attempt.pyq_session_id,
      subject: attempt.subject,
      subject_id: attempt.subject_id ?? null,
      subtopic: current.topic,
      source_year: current.year,
      source_ref: pyqSourceRef(current),
      question_text: pyqPlainText(current.html),
      answer_text: answerText(current),
      image_url: imageUrl,
      time_spent_sec: attempt.time_spent_sec,
      target_time_sec: current.marks ? MARKS_TARGET_SEC[current.marks] : DEFAULT_TARGET_TIME_SEC,
      outcome,
      pattern_name: draft?.pattern_name ?? null,
      trigger_sentence: draft?.trigger_sentence ?? null,
      root_cause: draft?.root_cause ?? null,
      mark_decision: attempt.mark_decision,
      mark_correct: attempt.mark_correct,
      source_pyq_attempt_id: attempt.id,
      created_at: attempt.attempted_at
    };
  }

  async function safeQuestionImageUrl(): Promise<string | null> {
    if (!current) return null;
    return resolvePyqJournalImageUrl(current.html).catch(() => firstPyqImage(current.html));
  }

  async function persistJournalRow(row: QuestionRow, patternName: string | null, outcome: Outcome) {
    const writes: Parameters<typeof writeLocalBatch>[0] = [{ name: 'questions', row }];
    if (needsReattempt(outcome)) {
      const existing = await db.reattempts.where('question_id').equals(row.id).first();
      if (!existing || existing.stage === 'MASTERED') {
        writes.push({ name: 'reattempts', row: createReattemptRow(userId!, row.id) });
      }
    }
    await writeLocalBatch(writes);
    if (patternName) await reconcileQuestionPattern(userId!, row.subject, patternName);
    setJournalSaved(true);
    setAnalyzedCount((count) => count + 1);
  }

  async function captureQuestionSnapshot(): Promise<string> {
    if (!current) throw new Error('No active question to capture.');
    try {
      const captured = questionCaptureRef.current
        ? await captureElementToDataUrl(questionCaptureRef.current, { theme: 'light' })
        : null;
      if (captured) return captured;
    } catch {
      // A rasterization failure must not block the attempt log.
    }
    const embedded = await resolvePyqJournalImageUrl(current.html).catch(() => null);
    // Every committed PYQ must carry an image into its attempt/journal log,
    // even on browsers where DOM rasterization or a bundled figure fails.
    return embedded ?? pyqQuestionSnapshotDataUrl(current);
  }

  async function journalImageUrl(
    draft?: TagDraft,
    screenshot: string | null = questionScreenshot
  ): Promise<string | null> {
    if (screenshot) return screenshot;
    if (!current) return null;
    const embedded = await resolvePyqJournalImageUrl(
      current.html,
      draft?.source.imageDataUrl ?? null
    ).catch(() => null);
    return embedded ?? pyqQuestionSnapshotDataUrl(current);
  }

  function selectedAnswer(question: PyqQuestion): PyqSelectedAnswer {
    if (decision === 'SKIP') return null;
    const inputType = answerInputType(question);
    if (inputType === 'NAT') return numeric.trim() === '' ? null : numeric.trim();
    if (inputType === 'MSQ') return choices.slice().sort();
    return choices[0] ?? null;
  }

  function changeExamChoices(nextChoices: string[]) {
    setChoices(nextChoices);
    const session = loadedSessionRef.current;
    if (!current || !session || session.config.mode !== 'exam') return;
    const answer = answerInputType(current) === 'MSQ' ? nextChoices : nextChoices[0];
    setLoadedExamSession(setPyqExamResponse(session, current, answer));
  }

  function changeExamNumeric(value: string) {
    setNumeric(value);
    const session = loadedSessionRef.current;
    if (!current || !session || session.config.mode !== 'exam') return;
    setLoadedExamSession(
      setPyqExamResponse(
        session,
        current,
        value.trim() !== '' && Number.isFinite(Number(value)) ? value.trim() : undefined
      )
    );
  }

  function navigateExam(nextIndex: number) {
    const session = loadedSessionRef.current;
    if (!session || session.config.mode !== 'exam' || submittingRef.current) return;
    const boundedIndex = Math.max(0, Math.min(nextIndex, questions.length - 1));
    const nextQuestion = questions[boundedIndex];
    if (!nextQuestion) return;
    const nextSession = checkpointPyqExamSession(session, nextQuestion.id);
    setLoadedExamSession(nextSession);
    setIndex(boundedIndex);
  }

  function markExamForReviewAndNext() {
    const session = loadedSessionRef.current;
    if (!current || !session || session.config.mode !== 'exam' || submittingRef.current) return;
    const marked = setPyqExamReviewMark(session, current.id, true);
    const nextIndex = Math.min(index + 1, questions.length - 1);
    const nextQuestion = questions[nextIndex];
    const nextSession = nextQuestion ? checkpointPyqExamSession(marked, nextQuestion.id) : marked;
    setLoadedExamSession(nextSession);
    if (nextIndex !== index) setIndex(nextIndex);
  }

  function clearExamResponse() {
    const session = loadedSessionRef.current;
    if (!current || !session || session.config.mode !== 'exam' || submittingRef.current) return;
    setChoices([]);
    setNumeric('');
    setLoadedExamSession(setPyqExamResponse(session, current, undefined));
  }

  function saveExamAndNext() {
    if (index + 1 >= questions.length) {
      setExamSubmitOpen(true);
      return;
    }
    navigateExam(index + 1);
  }

  async function submitExam(reason: 'manual' | 'time-expired') {
    const session = loadedSessionRef.current;
    if (
      !manifest ||
      !userId ||
      !session ||
      session.config.mode !== 'exam' ||
      session.status !== 'active' ||
      questions.length === 0 ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setExamSubmitOpen(false);
    setSubmitError(null);
    try {
      await examWriteQueueRef.current.catch(() => undefined);
      const finalized = finalizePyqExam({
        userId,
        session: loadedSessionRef.current ?? session,
        questions,
        bankVersion: manifest.bankVersion,
        reason
      });
      const existingCanonical = await db.sessions.get(session.id);
      await writeLocalBatch([
        ...finalized.attempts.map((attempt) => ({ name: 'pyq_attempts' as const, row: attempt })),
        { name: 'pyq_sessions', row: finalized.session },
        {
          name: 'sessions',
          row: pyqPracticeSessionRow(
            finalized.session,
            pyqPracticeSubject(questions),
            timeZone,
            existingCanonical
          )
        }
      ]);
      loadedSessionRef.current = finalized.session;
      setLoadedSession(finalized.session);
      setCompleted(finalized.attempts);
      setFinished(true);
      navigate(`/session/${session.id}/review`);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? `Exam was not submitted: ${error.message}`
          : 'Exam was not submitted. Your saved responses are still available.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  finalizeExamRef.current = submitExam;

  async function submitAnswer() {
    if (
      !current ||
      !userId ||
      !manifest ||
      !decision ||
      submitted ||
      submitting ||
      submittingRef.current
    )
      return;
    const committedAtMs = Date.now();
    const questionStartedAtMs = Math.min(startedAt ?? committedAtMs, committedAtMs);
    setSubmitError(null);
    const session = pyqSessionId ? await db.pyq_sessions.get(pyqSessionId) : null;
    if (!session) {
      setSubmitError('The active set could not be found. Return to PYQ setup and resume it.');
      return;
    }
    const selected = selectedAnswer(current);
    if (
      decision !== 'SKIP' &&
      (selected == null ||
        (Array.isArray(selected) && selected.length === 0) ||
        (typeof selected === 'number' && !Number.isFinite(selected)))
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const questionAttempts = await db.pyq_attempts
        .where('[pyq_session_id+question_uid]')
        .equals([session.id, current.id])
        .toArray();
      const priorAttempt = latestQuestionAttempt(questionAttempts, current.id);
      const attemptNumber = nextPyqAttemptNumber(questionAttempts, session.id, current.id);
      const id = pyqAttemptId(session.id, current.id, attemptNumber);
      const existing = await db.pyq_attempts.get(id);
      if (existing) {
        setQuestionScreenshot(existing.screenshot_url);
        setSubmitted(existing);
        setCompleted((rows) =>
          rows.some((row) => row.id === existing.id) ? rows : [...rows, existing]
        );
        return;
      }
      const screenshot = await captureQuestionSnapshot();
      setQuestionScreenshot(screenshot);
      const attempt = createPyqAttemptRow({
        userId,
        session,
        question: current,
        selectedAnswer: selected,
        decision,
        bankVersion: manifest.bankVersion,
        questionStartedAtMs,
        committedAtMs,
        screenshotUrl: screenshot,
        attemptNumber,
        retryingSkippedAttempt: priorAttempt?.mark_decision === 'SKIP'
      });
      const nextSession = advancePyqSessionProgress(
        session,
        current.id,
        index + 1,
        attempt.time_spent_sec,
        attempt.attempted_at
      );
      const writes: Parameters<typeof writeLocalBatch>[0] = [
        { name: 'pyq_attempts', row: attempt },
        { name: 'pyq_sessions', row: nextSession }
      ];
      let autoJournalSaved = false;
      if (attempt.mark_correct === true) {
        const row = {
          ...questionRowFromAttempt(attempt, undefined, await safeQuestionImageUrl()),
          id: pyqJournalQuestionId(attempt.id)
        };
        writes.push({ name: 'questions', row });
        if (needsReattempt(row.outcome)) {
          const existingReattempt = await db.reattempts.where('question_id').equals(row.id).first();
          if (!existingReattempt || existingReattempt.stage === 'MASTERED') {
            writes.push({ name: 'reattempts', row: createReattemptRow(userId, row.id) });
          }
        }
        autoJournalSaved = true;
      }
      await writeLocalBatch(writes);
      setSubmitted(attempt);
      setCompleted((rows) =>
        rows.some((row) => row.id === attempt.id)
          ? rows.map((row) => (row.id === attempt.id ? attempt : row))
          : [...rows, attempt]
      );
      if (autoJournalSaved) {
        setJournalSaved(true);
        setAnalyzedCount((count) => count + 1);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? `Answer was not committed: ${error.message}`
          : 'Answer was not committed. Your selection is still here; try again.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function saveJournalAnalysis(draft: TagDraft) {
    if (!current || !submitted || !userId) return;
    const imageUrl = (await safeQuestionImageUrl()) ?? (await journalImageUrl(draft));
    const row = {
      ...questionRowFromAttempt(submitted, draft, imageUrl),
      id: pyqJournalQuestionId(submitted.id)
    };
    await persistJournalRow(row, draft.pattern_name, draft.outcome);
    setJournalOpen(false);
  }

  async function markSessionComplete() {
    const session = pyqSessionId ? await db.pyq_sessions.get(pyqSessionId) : null;
    if (session && session.status === 'active') {
      const completedSession = completePyqSession(session);
      const existingCanonical = await db.sessions.get(session.id);
      await writeLocalBatch([
        { name: 'pyq_sessions', row: completedSession },
        {
          name: 'sessions',
          row: pyqPracticeSessionRow(
            completedSession,
            pyqPracticeSubject(questions),
            timeZone,
            existingCanonical
          )
        }
      ]);
    }
  }

  async function goNext() {
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) {
      await markSessionComplete();
      window.scrollTo({ top: 0, behavior: 'auto' });
      setFinished(true);
      return;
    }
    const session = pyqSessionId ? await db.pyq_sessions.get(pyqSessionId) : null;
    if (!session) {
      setSubmitError('The active set could not be found. Return to PYQ setup and resume it.');
      return;
    }
    const startedSession = startPyqSessionQuestion(session, questions[nextIndex].id);
    if (startedSession !== session) await writeLocal('pyq_sessions', startedSession);
    const nextStartedAt = Date.parse(startedSession.current_question_started_at ?? '');
    questionStartRef.current = {
      questionUid: questions[nextIndex].id,
      startedAtMs: Number.isFinite(nextStartedAt) ? nextStartedAt : Date.now()
    };
    setIndex(nextIndex);
  }

  function goPrevious() {
    if (index <= 0) return;
    setIndex(index - 1);
  }

  function exitSet() {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setQuestions([]);
    setFinished(false);
    setIndex(0);
    setPyqSessionId(null);
    loadedSessionRef.current = null;
    setLoadedSession(null);
  }

  if (!manifest) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="GATE PYQs" description="Opening the local question bank…" />
        <Card>
          <CardBody className="py-12 text-center text-[13px] text-text-faint">
            {manifestError ?? 'Checking 37 years of papers…'}
          </CardBody>
        </Card>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <PracticeSetup
        manifest={manifest}
        attempts={attempts}
        activeSession={activePyqSession ?? null}
        savedSessions={pausedPyqSessions ?? []}
        completedSessions={completedPyqSessions ?? []}
        config={config}
        setConfig={setConfig}
        loading={loading}
        error={startError}
        onResume={(session) => void resumeSession(session)}
        onSave={(session) => void saveSession(session)}
        onDiscard={(session) => void discardSession(session)}
        onReview={(session) => navigate(`/session/${session.id}/review`)}
        onStart={() => void startPractice()}
      />
    );
  }

  if (finished) {
    const graded = completed.filter((attempt) => attempt.mark_correct != null);
    const correct = graded.filter((attempt) => attempt.mark_correct).length;
    const skipped = completed.filter((attempt) => attempt.mark_decision === 'SKIP').length;
    const exactScores = aggregatePyqAttemptScores(completed);
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <PageHeader
          title="Practice set complete"
          description={`${completed.length} immutable ${plural(completed.length, 'attempt')} saved without exposing a key early.`}
        />
        <Card>
          <CardBody className="p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-faint text-success">
                <Check size={23} />
              </span>
              <div>
                <p className="font-display text-[21px] font-bold text-text">Set closed cleanly</p>
                <p className="text-[13px] text-text-muted">
                  Attempts are saved locally and queued for sync.
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Submitted', completed.length],
                ['Correct', correct],
                ['Left blank', skipped],
                ['Analyzed', analyzedCount]
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded border border-border bg-bg-overlay/35 p-3"
                >
                  <p className="u-label">{label}</p>
                  <p className="u-num mt-1 text-[24px] font-semibold text-text">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-text-faint">
              Graded accuracy:{' '}
              {graded.length
                ? `${Math.round((correct / graded.length) * 100)}% across ${graded.length} answered questions`
                : 'no graded answers in this set'}
              .
            </p>
            <p className="mt-2 text-[12px] text-text-muted">
              GATE-rule score from stored metadata:{' '}
              <span className="u-num font-semibold text-text">
                {exactScores.scoreMarks.toFixed(2).replace(/\.00$/, '')} /{' '}
                {exactScores.maxMarks.toFixed(2).replace(/\.00$/, '')}
              </span>{' '}
              marks across {exactScores.coveredCount} of {completed.length} receipts
              {exactScores.coveredCount < completed.length
                ? '; the rest are excluded because stored type/marks metadata is incomplete or inconsistent.'
                : '.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {pyqSessionId ? (
                <Button
                  variant="primary"
                  onClick={() => navigate(`/session/${pyqSessionId}/review`)}
                >
                  Open detailed report
                </Button>
              ) : null}
              <Button onClick={() => void repeatCurrentSet()} disabled={loading}>
                Repeat this exact set
              </Button>
              <Button onClick={() => void startPractice()} disabled={loading}>
                Repeat these filters
              </Button>
              <Button onClick={exitSet}>Change filters</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!current) return null;
  const inputType = answerInputType(current);
  const hasAnswer =
    inputType === 'NAT'
      ? numeric.trim() !== '' && Number.isFinite(Number(numeric))
      : choices.length > 0;
  const canSubmit = !!decision && (decision === 'SKIP' || hasAnswer) && !submitting;
  const previouslySkipped = latestCurrentAttempt?.mark_decision === 'SKIP' && !submitted;

  if (
    loadedSession?.config.mode === 'exam' &&
    loadedSession.config.examState &&
    loadedSession.status === 'active'
  ) {
    const paletteCounts = pyqExamPaletteCounts(loadedSession, questions);
    const currentHasAnswer = isPyqExamAnswerPresent(
      current,
      loadedSession.config.examState.responses[current.id]
    );
    return (
      <>
        <PyqExamWorkspace
          session={loadedSession}
          questions={questions}
          index={index}
          choices={choices}
          numeric={numeric}
          remainingSec={examRemainingSec}
          submitting={submitting}
          error={submitError}
          onChoices={changeExamChoices}
          onNumeric={changeExamNumeric}
          onNavigate={navigateExam}
          onMarkAndNext={markExamForReviewAndNext}
          onClear={clearExamResponse}
          onSaveAndNext={saveExamAndNext}
          onPrevious={() => navigateExam(index - 1)}
          onSubmit={() => setExamSubmitOpen(true)}
          onSaveAndExit={() => void saveSession(loadedSession)}
        />
        <Dialog
          open={examSubmitOpen}
          onClose={() => {
            if (!submitting) setExamSubmitOpen(false);
          }}
          title="Submit timed exam?"
          className="max-w-xl"
        >
          <p className="text-[13px] leading-relaxed text-text-muted">
            Submission locks every response and reveals the answer keys in your detailed report. You
            cannot edit this exam afterward.
          </p>
          <div className="mt-4 overflow-hidden rounded border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_70px] border-b border-border bg-bg-overlay/45 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
              <span>Status</span>
              <span className="text-right">Questions</span>
            </div>
            {[
              ['Answered', paletteCounts.answered + paletteCounts.answeredAndMarked],
              ['Not answered', paletteCounts.notAnswered + paletteCounts.markedForReview],
              ['Not visited', paletteCounts.notVisited],
              ['Marked for review', paletteCounts.markedForReview + paletteCounts.answeredAndMarked]
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="grid grid-cols-[minmax(0,1fr)_70px] border-b border-border/70 px-3 py-2.5 text-[13px] last:border-b-0"
              >
                <span className="text-text-muted">{label}</span>
                <span className="u-num text-right font-semibold text-text">{value}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
            Question {index + 1} is {currentHasAnswer ? 'answered' : 'currently blank'}. You have{' '}
            <span className="u-num font-semibold text-text">
              {secondsToClock(examRemainingSec)}
            </span>{' '}
            remaining.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button onClick={() => setExamSubmitOpen(false)} disabled={submitting}>
              Return to exam
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitExam('manual')}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit exam'}
            </Button>
          </div>
        </Dialog>
      </>
    );
  }

  if (journalOpen && submitted) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <button
          type="button"
          onClick={() => setJournalOpen(false)}
          className="mb-4 inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text"
        >
          <ArrowLeft size={14} /> Back to answer
        </button>
        <Card>
          <CardBody className="p-5 sm:p-6">
            <TagFlow
              subject={current.subject}
              patterns={patterns}
              questionLabel={`${current.paperLabel} · Q ${current.number}`}
              timeSpentSec={submitted.time_spent_sec}
              initialSource={sourceDraft(current, questionScreenshot)}
              sourceLocked
              onSave={saveJournalAnalysis}
              onCancel={() => setJournalOpen(false)}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <button
          type="button"
          onClick={exitSet}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text"
        >
          <ArrowLeft size={14} /> Exit set
        </button>
        <div className="flex items-center gap-3">
          <span className="u-num text-[12px] text-text-muted">
            Q {index + 1}/{questions.length}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-faint">
            <Clock3 size={13} />
            {secondsToClock(shownSeconds)}
          </span>
        </div>
      </div>

      <div ref={questionCaptureRef}>
        <Card className="overflow-hidden">
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span>{current.paperLabel}</span>
                <span className="text-border-hover">/</span>
                <span>Q {current.number}</span>
              </span>
            }
            aside={
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{current.subject}</Badge>
                <Badge>{current.type}</Badge>
                {current.marks && <Badge>{current.marks} mark</Badge>}
              </div>
            }
          />
          <CardBody className="p-5 sm:p-7">
            <PyqQuestionContent html={current.html} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(310px,0.7fr)]">
          <AnswerPad
            question={current}
            choices={choices}
            numeric={numeric}
            disabled={!!submitted}
            onChoices={setChoices}
            onNumeric={setNumeric}
          />
          <div className="flex flex-col gap-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <DecisionButtons value={decision} disabled={!!submitted} onChange={setDecision} />
            {!submitted ? (
              <div>
                {previouslySkipped ? (
                  <p className="mb-3 rounded border border-warn/25 bg-warn-faint px-3 py-2 text-[12px] leading-relaxed text-text-muted">
                    Previously skipped — you can answer it now. Once committed, the answer is
                    locked.
                  </p>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => void submitAnswer()}
                  disabled={!canSubmit}
                  className="w-full"
                >
                  Commit & reveal key
                </Button>
                <div className="mt-3 flex flex-wrap gap-2">
                  {index > 0 ? (
                    <Button onClick={goPrevious} disabled={submitting}>
                      <ArrowLeft size={15} /> Previous question
                    </Button>
                  ) : null}
                  {previouslySkipped ? (
                    <Button onClick={() => void goNext()} disabled={submitting}>
                      Keep skipped & next <ArrowRight size={15} />
                    </Button>
                  ) : null}
                </div>
                {submitError && (
                  <p role="alert" className="mt-2 text-[12px] leading-relaxed text-danger">
                    {submitError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <ResultPanel question={current} attempt={submitted} />
                <div className="flex flex-wrap gap-2">
                  {index > 0 ? (
                    <Button onClick={goPrevious}>
                      <ArrowLeft size={15} /> Previous question
                    </Button>
                  ) : null}
                  <Button variant="primary" onClick={goNext}>
                    {index + 1 === questions.length ? 'Finish set' : 'Next question'}
                    <ArrowRight size={15} />
                  </Button>
                  {journalSaved ? (
                    <Badge tone="success" className="self-center">
                      Saved to journal
                    </Badge>
                  ) : submitted.mark_correct === false ? (
                    <Button onClick={() => setJournalOpen(true)}>Continue analysis</Button>
                  ) : (
                    <Button onClick={() => setJournalOpen(true)}>Analyze in Journal</Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
