import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
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
import type { MarkDecision, PyqAttemptRow, PyqSelectedAnswer, QuestionRow } from '@/types';
import type { SourceDraft } from '@/components/tags/sourceDraft';
import type { TagDraft } from '@/components/tags/TagFlow';
import PageHeader from '@/components/layout/PageHeader';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import TagFlow from '@/components/tags/TagFlow';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useTimer } from '@/hooks/useTimer';
import { writeLocal } from '@/lib/sync';
import { needsReattempt, scheduleReattempt } from '@/lib/reattempt';
import { reconcileQuestionPattern } from '@/lib/patterns';
import { DEFAULT_TARGET_TIME_SEC, MARKS_TARGET_SEC } from '@/lib/constants';
import {
  evaluatePyqAnswer,
  firstPyqImage,
  formatPyqAnswer,
  loadPyqManifest,
  loadPyqQuestions,
  pyqPlainText,
  pyqSourceRef,
  type PyqManifest,
  type PyqQuestion
} from '@/lib/pyq';
import { cn, nowISO, plural, secondsToClock, uuid } from '@/lib/utils';

type Order = 'unseen' | 'random' | 'newest' | 'oldest';
type CountChoice = '5' | '10' | '25' | '50' | 'all';
type TypeFilter = 'all' | 'MCQ' | 'MSQ' | 'NAT';

interface AttemptConfig {
  subjectSlug: string;
  fromYear: number;
  toYear: number;
  type: TypeFilter;
  order: Order;
  count: CountChoice;
}

const CHOICES = ['A', 'B', 'C', 'D'];

function answerInputType(question: PyqQuestion): 'MCQ' | 'MSQ' | 'NAT' {
  if (question.type === 'MSQ' || question.type === 'NAT') return question.type;
  return 'MCQ';
}

function answerText(question: PyqQuestion): string {
  const formatted = formatPyqAnswer(question);
  return question.answerStatus === 'available' ? `Answer key: ${formatted}` : formatted;
}

function sourceDraft(question: PyqQuestion): SourceDraft {
  const format = ['MCQ', 'MSQ', 'NAT'].includes(question.type)
    ? (question.type as 'MCQ' | 'MSQ' | 'NAT')
    : null;
  return {
    subject: question.subject,
    subtopic: question.subtopics[0] ?? null,
    kind: 'pyq',
    year: question.year,
    set: question.set === 1 || question.set === 2 ? question.set : null,
    questionNumber: question.number,
    marks: question.marks,
    format,
    questionText: pyqPlainText(question.html),
    answerText: answerText(question),
    imageDataUrl: firstPyqImage(question.html)
  };
}

function PracticeSetup({
  manifest,
  attempts,
  config,
  setConfig,
  loading,
  error,
  onStart
}: {
  manifest: PyqManifest;
  attempts: PyqAttemptRow[];
  config: AttemptConfig;
  setConfig: (next: AttemptConfig) => void;
  loading: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const attemptedIds = useMemo(
    () => new Set(attempts.map((attempt) => attempt.question_uid)),
    [attempts]
  );
  const seenBySubject = useMemo(() => {
    const ids = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      const subjectIds = ids.get(attempt.subject) ?? new Set<string>();
      subjectIds.add(attempt.question_uid);
      ids.set(attempt.subject, subjectIds);
    }
    return new Map([...ids].map(([subject, subjectIds]) => [subject, subjectIds.size]));
  }, [attempts]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GATE CSE PYQs"
        description="Every question from 2002–2026, separated by subject and ready to solve here."
        showMobileMark={false}
      />

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
                onChange={(event) => setConfig({ ...config, subjectSlug: event.target.value })}
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
                onClick={() => setConfig({ ...config, subjectSlug: 'all' })}
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
                const seen = seenBySubject.get(subject.label) ?? 0;
                return (
                  <button
                    key={subject.slug}
                    type="button"
                    onClick={() => setConfig({ ...config, subjectSlug: subject.slug })}
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
          </div>

          <div className="flex flex-col bg-bg-overlay/25 p-4">
            <p className="u-label">Build this practice set</p>
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
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="all">All matching</option>
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
              {error && <p className="mb-3 text-[12px] text-danger">{error}</p>}
              <Button variant="primary" className="w-full" onClick={onStart} disabled={loading}>
                <BookOpenCheck size={17} />
                {loading ? 'Opening question bank…' : 'Start practice'}
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-text-faint">
                Questions and diagrams are bundled locally. Your answer stays hidden until you
                commit.
              </p>
            </div>
          </div>
        </div>
      </Card>
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
                  ? 'border-accent bg-accent text-white shadow-[0_2px_0_#a5311b]'
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
  return (
    <div
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
          <p className="mt-1 text-[13px] font-medium text-text">{answerText(question)}</p>
          {question.type === 'NAT' &&
            question.tolerance?.abs != null &&
            question.tolerance.abs > 0 && (
              <p className="mt-1 text-[11px] text-text-faint">
                Accepted tolerance: ±{question.tolerance.abs}
              </p>
            )}
          <a
            href={question.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
          >
            Open source discussion <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Pyq() {
  const { userId } = useAuth();
  const [manifest, setManifest] = useState<PyqManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [config, setConfig] = useState<AttemptConfig>({
    subjectSlug: 'discrete-mathematics',
    fromYear: 2002,
    toYear: 2026,
    type: 'all',
    order: 'unseen',
    count: '10'
  });
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

  const attempts = useLiveQuery(
    async () => (userId ? db.pyq_attempts.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const patterns = useLiveQuery(
    async () => (userId ? db.patterns.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );

  useEffect(() => {
    let active = true;
    loadPyqManifest()
      .then((value) => {
        if (!active) return;
        setManifest(value);
        setConfig((current) => ({ ...current, fromYear: value.firstYear, toYear: value.lastYear }));
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
  }, []);

  const current = questions[index] ?? null;
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    setStartedAt(Date.now());
    setChoices([]);
    setNumeric('');
    setDecision(null);
    setSubmitted(null);
    setSubmitting(false);
    setJournalOpen(false);
    setJournalSaved(false);
  }, [currentId]);

  useEffect(() => {
    if (journalOpen) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [journalOpen]);

  const liveSeconds = useTimer(submitted ? null : startedAt);
  const shownSeconds = submitted?.time_spent_sec ?? liveSeconds;

  async function startPractice() {
    if (!manifest || loading) return;
    setLoading(true);
    setStartError(null);
    try {
      const subjects =
        config.subjectSlug === 'all'
          ? manifest.subjects
          : manifest.subjects.filter((subject) => subject.slug === config.subjectSlug);
      const low = Math.min(config.fromYear, config.toYear);
      const high = Math.max(config.fromYear, config.toYear);
      let rows = (await loadPyqQuestions(subjects)).filter(
        (question) =>
          question.year >= low &&
          question.year <= high &&
          (config.type === 'all' || question.type === config.type)
      );
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
        throw new Error('No questions match those filters. Widen the year or type filter.');
      setQuestions(rows);
      setIndex(0);
      setCompleted([]);
      setFinished(false);
      setAnalyzedCount(0);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Could not build this practice set.');
    } finally {
      setLoading(false);
    }
  }

  function selectedAnswer(question: PyqQuestion): PyqSelectedAnswer {
    if (decision === 'SKIP') return null;
    const inputType = answerInputType(question);
    if (inputType === 'NAT') return numeric.trim() === '' ? null : Number(numeric);
    if (inputType === 'MSQ') return choices.slice().sort();
    return choices[0] ?? null;
  }

  async function submitAnswer() {
    if (!current || !userId || !manifest || !decision || submitted || submitting) return;
    const selected = selectedAnswer(current);
    if (
      decision !== 'SKIP' &&
      (selected == null ||
        (Array.isArray(selected) && selected.length === 0) ||
        (typeof selected === 'number' && !Number.isFinite(selected)))
    )
      return;
    setSubmitting(true);
    const attempt: PyqAttemptRow = {
      id: uuid(),
      user_id: userId,
      question_uid: current.id,
      subject: current.subject,
      year: current.year,
      selected_answer: selected,
      mark_decision: decision,
      mark_correct: evaluatePyqAnswer(current, selected, decision),
      time_spent_sec: Math.max(1, liveSeconds),
      bank_version: manifest.bankVersion,
      attempted_at: nowISO()
    };
    await writeLocal('pyq_attempts', attempt);
    setSubmitted(attempt);
    setCompleted((rows) => [...rows, attempt]);
    setSubmitting(false);
  }

  async function saveJournalAnalysis(draft: TagDraft) {
    if (!current || !submitted || !userId) return;
    const row: QuestionRow = {
      id: uuid(),
      user_id: userId,
      session_id: null,
      subject: current.subject,
      subtopic: current.subtopics[0] ?? null,
      source_year: current.year,
      source_ref: pyqSourceRef(current),
      question_text: pyqPlainText(current.html),
      answer_text: answerText(current),
      image_url: firstPyqImage(current.html),
      time_spent_sec: submitted.time_spent_sec,
      target_time_sec: current.marks ? MARKS_TARGET_SEC[current.marks] : DEFAULT_TARGET_TIME_SEC,
      outcome: draft.outcome,
      pattern_name: draft.pattern_name,
      trigger_sentence: draft.trigger_sentence,
      root_cause: draft.root_cause,
      mark_decision: submitted.mark_decision,
      mark_correct: submitted.mark_correct,
      created_at: submitted.attempted_at
    };
    await writeLocal('questions', row);
    if (draft.pattern_name)
      await reconcileQuestionPattern(userId, current.subject, draft.pattern_name);
    if (needsReattempt(draft.outcome)) await scheduleReattempt(userId, row.id);
    setJournalOpen(false);
    setJournalSaved(true);
    setAnalyzedCount((count) => count + 1);
  }

  function goNext() {
    if (index + 1 >= questions.length) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
  }

  function exitSet() {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setQuestions([]);
    setFinished(false);
    setIndex(0);
  }

  if (!manifest) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="GATE CSE PYQs" description="Opening the local question bank…" />
        <Card>
          <CardBody className="py-12 text-center text-[13px] text-text-faint">
            {manifestError ?? 'Checking 25 years of papers…'}
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
        config={config}
        setConfig={setConfig}
        loading={loading}
        error={startError}
        onStart={() => void startPractice()}
      />
    );
  }

  if (finished) {
    const graded = completed.filter((attempt) => attempt.mark_correct != null);
    const correct = graded.filter((attempt) => attempt.mark_correct).length;
    const skipped = completed.filter((attempt) => attempt.mark_decision === 'SKIP').length;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <PageHeader
          title="Practice set complete"
          description={`${completed.length} ${plural(completed.length, 'question')} submitted without exposing a key early.`}
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
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void startPractice()}>
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
              initialSource={sourceDraft(current)}
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
              <Button
                variant="primary"
                onClick={() => void submitAnswer()}
                disabled={!canSubmit}
                className="w-full"
              >
                Commit & reveal key
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <ResultPanel question={current} attempt={submitted} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={goNext}>
                    {index + 1 === questions.length ? 'Finish set' : 'Next question'}
                    <ArrowRight size={15} />
                  </Button>
                  {!journalSaved ? (
                    <Button onClick={() => setJournalOpen(true)}>Analyze in Journal</Button>
                  ) : (
                    <Badge tone="success" className="self-center">
                      Saved to analysis
                    </Badge>
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
