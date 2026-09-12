import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileQuestion,
  LibraryBig,
  LockKeyhole,
  Pause,
  Route,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  XCircle
} from 'lucide-react';
import type {
  MarkDecision,
  Outcome,
  PyqAttemptRow,
  PyqExamConfidence,
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
import ScientificCalculator, { CalculatorTrigger } from '@/components/shared/ScientificCalculator';
import PyqExamWorkspace from '@/components/pyq/PyqExamWorkspace';
import PyqPracticeViewControl from '@/components/pyq/PyqPracticeViewControl';
import PyqPracticeSheet from '@/components/pyq/PyqPracticeSheet';
import PyqImprovementInsights from '@/components/pyq/PyqImprovementInsights';
import PyqEvidenceLedger from '@/components/pyq/PyqEvidenceLedger';
import PyqRecommendedSetup from '@/components/pyq/PyqRecommendedSetup';
import PyqQuestionContent from '@/components/pyq/PyqQuestionContent';
import PyqSessionHistory from '@/components/pyq/PyqSessionHistory';
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
import { targetTimeSecForMarks } from '@/lib/constants';
import {
  answerFreePyqImageUrl,
  firstPyqImage,
  formatPyqAnswer,
  inferPyqBookSlug,
  inferPyqDirectOutcome,
  pyqQuestionSnapshotDataUrl,
  resolvePyqJournalImageUrl,
  loadPyqManifest,
  loadPyqQuestions,
  matchesPyqBookScope,
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
  getPyqPracticeDraft,
  navigatePyqPracticeQuestion,
  pausePyqPracticeSession,
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
import { cn, plural, secondsToClock, todayISOInTimeZone, uuid } from '@/lib/utils';
import { analyzedAttemptIds, filterPyqByHistory, PYQ_HISTORY_OPTIONS } from '@/lib/pyq-history';
import { attachPlannerPyqSession, reconcilePlannerExecutions } from '@/lib/planner-execution';
import { loadDayPlan } from '@/lib/planner-storage';
import { queuePlannerCloudWrite } from '@/lib/planner-cloud';
import {
  checkpointPyqExamSession,
  createPyqExamConfig,
  finalizePyqExam,
  isPyqExamAnswerPresent,
  pausePyqExamSession,
  pyqExamPaletteCounts,
  pyqExamRemainingSeconds,
  resumePyqExamSession,
  setPyqExamConfidence,
  setPyqExamResponse,
  setPyqExamReviewMark
} from '@/lib/pyq-exam';
import { pyqBenchmarkPaperExposure, type PyqBenchmarkPaper } from '@/lib/pyq-benchmark';
import { mockTestFromFinalizedPyqExam } from '@/lib/pyq-mock-evidence';
import { buildPyqSessionSummary } from '@/lib/pyq-summary';
import {
  captureWeakPyqAttempt,
  markLearningAnalysisCompleted,
  needsRecoveryCapture
} from '@/lib/learning-recovery';
import {
  recommendPyqSelection,
  type PyqRecommendationCohort,
  type PyqRecommendationPriorityEvidence,
  type RecommendedPyqSelection
} from '@/lib/pyq-recommended-selection';
import {
  usePyqPreferencesStore,
  type PyqPresetPreference,
  type PyqSavedPrescription
} from '@/stores/pyq-preferences';
import { buildPyqEvidenceInsights, type PyqEvidenceInsights } from '@/lib/pyq-evidence-insights';

type Order = 'unseen' | 'random' | 'newest' | 'oldest';
type CountChoice = '5' | '10' | '15' | '25' | '50' | 'all';
type TypeFilter = PyqSessionConfig['type'];
type AttemptConfig = PyqSessionConfig & { bookSlug?: string };

const RECOMMENDATION_PRESETS: readonly PyqPresetPreference[] = [
  'custom',
  'learn',
  'diagnose',
  'repair',
  'speed',
  'transfer',
  'mixed-gate',
  'full-paper'
];
const RECOMMENDATION_COHORTS: readonly PyqRecommendationCohort[] = [
  'all',
  'unseen',
  'wrong',
  'high-confidence-wrong',
  'guessed-correct',
  'slow-correct',
  'due',
  'transfer',
  'exact-uid'
];

function recommendedPresetParam(value: string | null): PyqPresetPreference | null {
  return RECOMMENDATION_PRESETS.includes(value as PyqPresetPreference)
    ? (value as PyqPresetPreference)
    : null;
}

function recommendationCohortParam(value: string | null): PyqRecommendationCohort | null {
  return RECOMMENDATION_COHORTS.includes(value as PyqRecommendationCohort)
    ? (value as PyqRecommendationCohort)
    : null;
}

const DEFAULT_CHOICES = ['A', 'B', 'C', 'D'] as const;
const PRACTICE_MODE_FEATURES = [
  'Feedback after each answer',
  'No overall time limit',
  'Confidence tracking',
  'Pause with your draft saved'
];
const EXAM_MODE_FEATURES = [
  'Timed set or full paper',
  'Free question navigation',
  'Confidence + review marks',
  'Validity receipt at submit'
];

function countForRecommendation(config: AttemptConfig): number | 'all' {
  return config.count === 'all' ? 'all' : Number(config.count);
}

function deterministicQuestionOrder(rows: readonly PyqQuestion[], seed: string): PyqQuestion[] {
  function hash(value: string): number {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
  }
  return [...rows].sort(
    (left, right) =>
      hash(`${seed}\u0000${left.id}`) - hash(`${seed}\u0000${right.id}`) ||
      left.id.localeCompare(right.id)
  );
}

function recommendationConfig(
  preset: PyqPresetPreference,
  current: AttemptConfig,
  manifest: PyqManifest
): AttemptConfig {
  const common: AttemptConfig = {
    ...current,
    recommendationPreset: preset,
    examState: undefined,
    practiceDraft: undefined,
    practiceDrafts: undefined
  };
  if (preset === 'custom') return common;
  if (preset === 'full-paper') {
    const paper =
      manifest.benchmarkPapers.find((candidate) => candidate.id === current.benchmarkPaperId) ??
      manifest.benchmarkPapers.find(
        (candidate) => pyqBenchmarkPaperExposure(candidate, []).sealed
      ) ??
      manifest.benchmarkPapers[0];
    return {
      ...common,
      mode: 'exam',
      examKind: 'full-paper',
      benchmarkPaperId: paper?.id,
      bookSlug: paper?.bookSlug ?? manifest.defaultBookSlug,
      subjectSlug: 'all',
      subjectSlugs: undefined,
      topicSlug: 'all',
      fromYear: paper?.year ?? manifest.firstYear,
      toYear: paper?.year ?? manifest.lastYear,
      type: 'all',
      history: 'all',
      order: 'oldest',
      count: 'all'
    };
  }
  const count = preset === 'diagnose' || preset === 'mixed-gate' ? '15' : '10';
  return {
    ...common,
    mode: 'practice',
    examKind: undefined,
    benchmarkPaperId: undefined,
    bookSlug: 'gate-cse',
    subjectSlug: preset === 'diagnose' || preset === 'mixed-gate' ? 'all' : current.subjectSlug,
    subjectSlugs:
      preset === 'diagnose' || preset === 'mixed-gate' ? undefined : current.subjectSlugs,
    topicSlug: preset === 'diagnose' || preset === 'mixed-gate' ? 'all' : current.topicSlug,
    history:
      preset === 'learn'
        ? 'unseen'
        : preset === 'speed'
          ? 'slow'
          : preset === 'repair'
            ? 'incorrect'
            : 'all',
    order: preset === 'learn' ? 'unseen' : 'random',
    count
  };
}

function commaSeparatedQuestionUids(searchParams: URLSearchParams): string[] {
  const raw =
    searchParams.get('questionUids') ??
    searchParams.get('question_uids') ??
    searchParams.get('uids') ??
    '';
  return [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ];
}

function pauseStoredPyqSession(session: PyqSessionRow): PyqSessionRow {
  if (session.config.mode === 'exam') return pausePyqExamSession(session);
  if (!session.current_question_uid) return pausePyqSession(session);
  const savedDraft = getPyqPracticeDraft(session, session.current_question_uid);
  if (!savedDraft && session.completed_question_uids.includes(session.current_question_uid)) {
    return pausePyqSession(session);
  }
  return pausePyqPracticeSession(session, {
    questionUid: session.current_question_uid,
    selectedAnswer:
      savedDraft?.question_uid === session.current_question_uid ? savedDraft.selected_answer : null,
    markDecision:
      savedDraft?.question_uid === session.current_question_uid ? savedDraft.mark_decision : null,
    confidence:
      savedDraft?.question_uid === session.current_question_uid ? savedDraft.confidence : null
  });
}

function savedPracticeElapsedSeconds(session: PyqSessionRow): number {
  const drafts = { ...session.config.practiceDrafts };
  if (session.config.practiceDraft)
    drafts[session.config.practiceDraft.question_uid] = session.config.practiceDraft;
  return (
    session.elapsed_sec +
    Math.ceil(
      Object.values(drafts).reduce((total, draft) => total + Math.max(0, draft.elapsed_ms), 0) /
        1000
    )
  );
}

function latestQuestionAttempt(
  attempts: PyqAttemptRow[],
  questionUid: string
): PyqAttemptRow | null {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index].question_uid === questionUid) return attempts[index];
  }
  return null;
}

function pyqAttemptBookSlug(attempt: PyqAttemptRow): string {
  const snapshot = attempt.question_snapshot as
    (NonNullable<PyqAttemptRow['question_snapshot']> & { book_slug?: string }) | null;
  return snapshot?.book_slug ?? inferPyqBookSlug(snapshot?.paper_label ?? 'GATE CSE');
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

function benchmarkFreshnessLabel(paper: PyqBenchmarkPaper): string {
  if (paper.freshness === 'unseen') return 'Sealed · unseen';
  if (paper.freshness === 'repeated') return 'Fully exposed';
  return `${paper.priorExposureCount} of ${paper.questionCount} seen`;
}

function FullPaperSetup({
  papers,
  selectedPaperId,
  closedBookConfirmed,
  loading,
  error,
  onSelectPaper,
  onClosedBookConfirmed,
  onStart
}: {
  papers: PyqBenchmarkPaper[];
  selectedPaperId: string | null;
  closedBookConfirmed: boolean;
  loading: boolean;
  error: string | null;
  onSelectPaper: (paper: PyqBenchmarkPaper) => void;
  onClosedBookConfirmed: (confirmed: boolean) => void;
  onStart: () => void;
}) {
  const selectedPaper = papers.find((paper) => paper.id === selectedPaperId) ?? null;
  const canQualify = selectedPaper?.sealed === true && closedBookConfirmed;

  return (
    <Card className="overflow-hidden border-ink-violet/25">
      <div className="border-b border-border bg-guess-faint/55 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="u-label text-ink-violet">Step 2 · Select an official paper</p>
            <h2 className="mt-1 font-display text-[20px] font-bold tracking-tight text-text">
              Open one sealed benchmark
            </h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-text-muted">
              The complete paper opens in official order with one 180-minute countdown. Answer keys
              stay hidden until final submission.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded border border-ink-violet/20 bg-ink-violet/20 text-center">
            {[
              ['65', 'questions'],
              ['100', 'marks'],
              ['180', 'minutes']
            ].map(([value, label]) => (
              <div key={label} className="min-w-[68px] bg-bg-raised px-2 py-2">
                <p className="u-num text-[17px] font-bold text-text">{value}</p>
                <p className="text-[9px] uppercase tracking-wide text-text-faint">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CardBody className="flex flex-col gap-5 p-4 sm:p-5">
        {papers.length === 0 ? (
          <div className="rounded border border-warn/30 bg-warn-faint p-4">
            <p className="text-[13px] font-semibold text-text">No qualified paper in this bank</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
              A paper appears here only when all 65 questions, all 100 marks, supported answer
              types, and official keys are present.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {papers.map((paper) => {
              const selected = paper.id === selectedPaperId;
              return (
                <button
                  key={paper.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectPaper(paper)}
                  className={cn(
                    'group relative min-h-[150px] rounded border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-guess-faint',
                    selected
                      ? 'border-ink-violet/55 bg-guess-faint shadow-card'
                      : 'border-border bg-bg-raised hover:-translate-y-0.5 hover:border-border-hover'
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg border',
                        paper.sealed
                          ? 'border-success/25 bg-success-faint text-success'
                          : 'border-warn/25 bg-warn-faint text-warn'
                      )}
                    >
                      {paper.sealed ? <ShieldCheck size={19} /> : <ShieldAlert size={19} />}
                    </span>
                    <Badge tone={paper.sealed ? 'success' : 'warn'}>
                      {benchmarkFreshnessLabel(paper)}
                    </Badge>
                  </span>
                  <span className="mt-4 block font-display text-[17px] font-bold text-text">
                    {paper.paperLabel}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-text-muted">
                    {paper.sealed
                      ? 'No prior answer receipt touches this paper. Eligible for unseen evidence.'
                      : 'You can retake this paper, but the outcome will remain supporting evidence.'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded border border-border bg-bg-overlay/30 p-3.5">
          <input
            type="checkbox"
            checked={closedBookConfirmed}
            onChange={(event) => onClosedBookConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          <span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
              <LockKeyhole size={14} className="text-ink-violet" /> Closed-book conditions
            </span>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-text-muted">
              I will use no notes, answer keys, search, or outside help. Pausing later is allowed
              for recovery, but it changes this run to supporting evidence.
            </span>
          </span>
        </label>

        <div className="rounded border border-border bg-bg-overlay/20 p-3">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-text">
            {canQualify ? (
              <ShieldCheck size={15} className="text-success" />
            ) : (
              <ShieldAlert size={15} className="text-warn" />
            )}
            {canQualify
              ? 'Eligible to become qualified evidence'
              : 'This start is supporting evidence'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
            Qualification is decided again at submission from exposure, pause history, visit
            coverage, active time, and exact scoring coverage. A label is never inferred from the
            score alone.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          className="w-full sm:self-end sm:w-auto"
          onClick={onStart}
          disabled={loading || !selectedPaper}
        >
          <Clock3 size={17} />
          {loading ? 'Opening official paper…' : 'Start 3-hour full paper'}
        </Button>
      </CardBody>
    </Card>
  );
}

function PracticeSetup({
  manifest,
  attempts,
  activeSession,
  savedSessions,
  completedSessions,
  evidenceInsights,
  config,
  setConfig,
  recommendationPreset,
  recommendedSelection,
  recommendationLoading,
  recommendationError,
  selectionSeed,
  savedPrescriptions,
  includeReservedBenchmarkQuestions,
  closedBookConfirmed,
  loading,
  error,
  onResume,
  onSave,
  onDiscard,
  onReview,
  onIncludeReservedBenchmarkQuestions,
  onClosedBookConfirmed,
  onRecommendationPreset,
  onSelectionSeed,
  onRegenerateSeed,
  onSavePrescription,
  onLoadPrescription,
  onDeletePrescription,
  onPracticeEvidenceSubset,
  onAddEvidenceToRecovery,
  onAnalyzeEvidenceFirst,
  onPlanEvidenceRepair,
  onTryEvidenceTransfer,
  onStart
}: {
  manifest: PyqManifest;
  attempts: PyqAttemptRow[];
  activeSession: PyqSessionRow | null;
  savedSessions: PyqSessionRow[];
  completedSessions: PyqSessionRow[];
  evidenceInsights: PyqEvidenceInsights;
  config: AttemptConfig;
  setConfig: (next: AttemptConfig) => void;
  recommendationPreset: PyqPresetPreference;
  recommendedSelection: RecommendedPyqSelection | null;
  recommendationLoading: boolean;
  recommendationError: string | null;
  selectionSeed: string;
  savedPrescriptions: PyqSavedPrescription[];
  includeReservedBenchmarkQuestions: boolean;
  closedBookConfirmed: boolean;
  loading: boolean;
  error: string | null;
  onResume: (session: PyqSessionRow) => void;
  onSave: (session: PyqSessionRow) => void;
  onDiscard: (session: PyqSessionRow) => void;
  onReview: (session: PyqSessionRow) => void;
  onIncludeReservedBenchmarkQuestions: (included: boolean) => void;
  onClosedBookConfirmed: (confirmed: boolean) => void;
  onRecommendationPreset: (preset: PyqPresetPreference) => void;
  onSelectionSeed: (seed: string) => void;
  onRegenerateSeed: () => void;
  onSavePrescription: (name: string) => void;
  onLoadPrescription: (prescription: PyqSavedPrescription) => void;
  onDeletePrescription: (id: string) => void;
  onPracticeEvidenceSubset: (questionUids: string[]) => void;
  onAddEvidenceToRecovery: (questionUids: string[]) => void;
  onAnalyzeEvidenceFirst: (questionUid: string) => void;
  onPlanEvidenceRepair: (questionUids: string[]) => void;
  onTryEvidenceTransfer: (questionUids: string[]) => void;
  onStart: () => void;
}) {
  const selectedBookSlug = 'gate-cse';
  const selectedBook = manifest.books.find((book) => book.slug === selectedBookSlug);
  const catalogSubjects = selectedBook?.subjects ?? manifest.subjects;
  const catalogYears = selectedBook?.years ?? manifest.years;
  const catalogQuestionCount = selectedBook?.count ?? manifest.questionCount;
  const benchmarkPapers = useMemo(
    () =>
      manifest.benchmarkPapers.map((paper) => ({
        ...paper,
        ...pyqBenchmarkPaperExposure(paper, attempts)
      })),
    [attempts, manifest.benchmarkPapers]
  );
  const selectedBenchmarkPaper =
    benchmarkPapers.find((paper) => paper.id === config.benchmarkPaperId) ??
    benchmarkPapers.find((paper) => paper.sealed) ??
    benchmarkPapers[0] ??
    null;
  const fullPaperSelected = config.mode === 'exam' && config.examKind === 'full-paper';
  const sealedBenchmarkCount = benchmarkPapers.filter((paper) => paper.sealed).length;
  const attemptedIds = useMemo(
    () =>
      new Set(
        attempts
          .filter((attempt) => pyqAttemptBookSlug(attempt) === selectedBookSlug)
          .map((attempt) => attempt.question_uid)
      ),
    [attempts, selectedBookSlug]
  );
  const seenBySubject = useMemo(() => {
    const ids = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      if (pyqAttemptBookSlug(attempt) !== selectedBookSlug) continue;
      const subjectSlug =
        attempt.question_snapshot?.subject_slug ??
        manifest.subjects.find((subject) => subject.label === attempt.subject)?.slug ??
        attempt.subject;
      const subjectIds = ids.get(subjectSlug) ?? new Set<string>();
      subjectIds.add(attempt.question_uid);
      ids.set(subjectSlug, subjectIds);
    }
    return new Map([...ids].map(([subject, subjectIds]) => [subject, subjectIds.size]));
  }, [attempts, manifest.subjects, selectedBookSlug]);
  const selectedSubject = catalogSubjects.find((subject) => subject.slug === config.subjectSlug);
  const selectedTopics = selectedSubject?.topics ?? [];
  const selectedTopicSlug = config.topicSlug ?? 'all';
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="GATE PYQs"
        description={`${catalogQuestionCount.toLocaleString()} GATE CSE Core questions for focused practice and exam sessions.`}
        showMobileMark={false}
      />

      {activeSession && (
        <Card className="border-accent/30">
          <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-display text-[16px] font-semibold text-text">
                {activeSession.config.mode === 'exam'
                  ? 'Exam currently open'
                  : 'Practice session currently open'}
              </p>
              <p className="mt-1 text-[12px] text-text-muted">
                {activeSession.completed_count} of {activeSession.question_uids.length}{' '}
                {activeSession.config.mode === 'exam' ? 'answered' : 'submitted'} ·{' '}
                {activeSession.config.mode === 'exam' && activeSession.config.examState
                  ? `${secondsToClock(pyqExamRemainingSeconds(activeSession))} remaining`
                  : `${secondsToClock(savedPracticeElapsedSeconds(activeSession))} active work saved`}
              </p>
              {error && (
                <p role="alert" className="mt-2 text-[12px] text-danger">
                  {error}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onResume(activeSession)} disabled={loading}>
                {activeSession.config.mode === 'exam' ? 'Resume exam' : 'Resume practice'}
              </Button>
              <Button
                onClick={() => onSave(activeSession)}
                disabled={loading}
                title="Pause this session so you can return to it later"
              >
                <Pause size={14} />
                {activeSession.config.mode === 'exam' ? 'Pause exam' : 'Pause practice'}
              </Button>
              <Button variant="danger" onClick={() => onDiscard(activeSession)} disabled={loading}>
                Discard session
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {savedSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-text-faint">
            Paused sessions
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
                      <Badge tone={session.config.mode === 'exam' ? 'guess' : 'accent'}>
                        {session.config.mode === 'exam' ? 'Exam' : 'Practice'}
                      </Badge>
                      {session.config.subjectSlug === 'all'
                        ? session.config.subjectSlugs?.length
                          ? session.config.subjectSlugs
                              .map(
                                (slug) =>
                                  manifest.subjects.find((subject) => subject.slug === slug)
                                    ?.label ?? slug
                              )
                              .join(' + ')
                          : 'Mixed subjects'
                        : (manifest.subjects.find((s) => s.slug === session.config.subjectSlug)
                            ?.label ?? session.config.subjectSlug)}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-text-faint">
                      {session.completed_count} / {session.question_uids.length}{' '}
                      {session.config.mode === 'exam' ? 'answered' : 'done'} ·{' '}
                      {session.config.mode === 'exam' && session.config.examState
                        ? `${secondsToClock(pyqExamRemainingSeconds(session))} left`
                        : `${secondsToClock(savedPracticeElapsedSeconds(session))} active work saved`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => onResume(session)} disabled={loading}>
                    {session.config.mode === 'exam' ? 'Resume exam' : 'Resume practice'}
                  </Button>
                  <Button variant="danger" onClick={() => onDiscard(session)} disabled={loading}>
                    Discard session
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden border-accent/25">
        <PyqRecommendedSetup
          preset={recommendationPreset}
          selection={recommendedSelection}
          loading={recommendationLoading}
          error={recommendationError}
          seed={selectionSeed}
          savedPrescriptions={savedPrescriptions}
          onPreset={onRecommendationPreset}
          onSeed={onSelectionSeed}
          onRegenerate={onRegenerateSeed}
          onSavePrescription={onSavePrescription}
          onLoadPrescription={onLoadPrescription}
          onDeletePrescription={onDeletePrescription}
        />
      </Card>

      <section aria-labelledby="pyq-mode-heading">
        <Card className="overflow-hidden border-border-hover">
          <CardBody className="p-0">
            <div className="flex flex-col gap-3 border-b border-border bg-bg-overlay/25 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <p className="u-label">Step 1 · Choose a mode</p>
                <h2
                  id="pyq-mode-heading"
                  className="mt-1 font-display text-[20px] font-bold tracking-tight text-text sm:text-[23px]"
                >
                  Choose how you want to work
                </h2>
                <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-text-muted">
                  Learn with feedback in Practice mode, or simulate test conditions in Exam mode.
                  Both can be paused and resumed.
                </p>
              </div>
              <Badge tone={config.mode === 'exam' ? 'guess' : 'accent'} className="self-start">
                {config.mode === 'exam' ? 'Exam selected' : 'Practice selected'}
              </Badge>
            </div>

            <div className="grid md:grid-cols-2">
              <button
                type="button"
                aria-pressed={(config.mode ?? 'practice') === 'practice'}
                onClick={() =>
                  setConfig({
                    ...config,
                    mode: 'practice',
                    examKind: undefined,
                    benchmarkPaperId: undefined,
                    examState: undefined,
                    practiceDraft: undefined,
                    practiceDrafts: undefined
                  })
                }
                className={cn(
                  'group relative min-h-[230px] overflow-hidden border-b border-border p-5 text-left transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint md:border-b-0 md:border-r sm:p-6',
                  (config.mode ?? 'practice') === 'practice'
                    ? 'bg-accent-faint/70 shadow-[inset_5px_0_0_rgb(var(--color-accent))]'
                    : 'bg-bg-raised hover:bg-accent-faint/35'
                )}
              >
                <span className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent/25 bg-bg-raised text-accent shadow-sm">
                    <BookOpenCheck size={21} aria-hidden="true" />
                  </span>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                      (config.mode ?? 'practice') === 'practice'
                        ? 'border-accent bg-accent text-accent-contrast'
                        : 'border-border-hover text-transparent'
                    )}
                    aria-hidden="true"
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                </span>
                <span className="mt-4 block font-display text-[19px] font-bold text-text">
                  Practice mode
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-text-muted">
                  Use a focused view or a question sheet, with the answer key and result revealed after
                  each committed response.
                </span>
                <span className="mt-4 grid gap-2 text-[11.5px] text-text-muted sm:grid-cols-2">
                  {PRACTICE_MODE_FEATURES.map((item) => (
                    <span key={item} className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="shrink-0 text-accent" />
                      {item}
                    </span>
                  ))}
                </span>
              </button>

              <button
                type="button"
                aria-pressed={config.mode === 'exam'}
                onClick={() =>
                  setConfig({
                    ...config,
                    mode: 'exam',
                    examKind: config.examKind ?? 'timed-set',
                    count: config.count === 'all' ? '15' : config.count,
                    examState: undefined,
                    practiceDraft: undefined,
                    practiceDrafts: undefined
                  })
                }
                className={cn(
                  'group relative min-h-[230px] overflow-hidden p-5 text-left transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-guess-faint sm:p-6',
                  config.mode === 'exam'
                    ? 'bg-guess-faint/75 shadow-[inset_5px_0_0_rgb(var(--color-ink-violet))]'
                    : 'bg-bg-raised hover:bg-guess-faint/35'
                )}
              >
                <span className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-ink-violet/25 bg-bg-raised text-ink-violet shadow-sm">
                    <Clock3 size={21} aria-hidden="true" />
                  </span>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                      config.mode === 'exam'
                        ? 'border-ink-violet bg-ink-violet text-white'
                        : 'border-border-hover text-transparent'
                    )}
                    aria-hidden="true"
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                </span>
                <span className="mt-4 block font-display text-[19px] font-bold text-text">
                  Exam mode
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-text-muted">
                  Use one countdown, move freely between questions, and see answer keys only after
                  final submission.
                </span>
                <span className="mt-4 grid gap-2 text-[11.5px] text-text-muted sm:grid-cols-2">
                  {EXAM_MODE_FEATURES.map((item) => (
                    <span key={item} className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="shrink-0 text-ink-violet" />
                      {item}
                    </span>
                  ))}
                </span>
              </button>
            </div>
          </CardBody>
        </Card>
      </section>

      {(config.mode ?? 'practice') === 'practice' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-raised p-4">
          <div>
            <p className="text-[13px] font-semibold text-text">Practice view</p>
            <p className="mt-1 text-[12px] text-text-muted">
              Focus on one question or browse the set together. You can switch during practice.
            </p>
          </div>
          <PyqPracticeViewControl
            value={config.practiceView}
            onChange={(practiceView) => setConfig({ ...config, practiceView })}
          />
        </div>
      )}

      {config.mode === 'exam' && (
        <Card className="overflow-hidden">
          <CardHeader title="Step 2 · Choose the exam format" />
          <CardBody className="grid gap-2 p-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={(config.examKind ?? 'timed-set') === 'timed-set'}
              onClick={() =>
                setConfig({
                  ...config,
                  examKind: 'timed-set',
                  benchmarkPaperId: undefined,
                  count: config.count === 'all' ? '15' : config.count
                })
              }
              className={cn(
                'rounded border p-3 text-left transition-all',
                (config.examKind ?? 'timed-set') === 'timed-set'
                  ? 'border-accent/45 bg-accent-faint shadow-sm'
                  : 'border-border bg-bg-raised hover:border-border-hover'
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-text">Timed set</span>
                <Badge tone="accent">3 min / question</Badge>
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-text-muted">
                Build a shorter diagnostic set from subjects, years, type, and history filters.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={config.examKind === 'full-paper'}
              onClick={() => {
                const paper = selectedBenchmarkPaper;
                setConfig({
                  ...config,
                  mode: 'exam',
                  examKind: 'full-paper',
                  benchmarkPaperId: paper?.id,
                  bookSlug: paper?.bookSlug ?? 'gate-cse',
                  subjectSlug: 'all',
                  subjectSlugs: undefined,
                  topicSlug: 'all',
                  fromYear: paper?.year ?? config.fromYear,
                  toYear: paper?.year ?? config.toYear,
                  type: 'all',
                  history: 'all',
                  order: 'oldest',
                  count: 'all'
                });
              }}
              className={cn(
                'rounded border p-3 text-left transition-all',
                config.examKind === 'full-paper'
                  ? 'border-ink-violet/45 bg-guess-faint shadow-sm'
                  : 'border-border bg-bg-raised hover:border-border-hover'
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold text-text">Official full paper</span>
                <Badge tone="guess">65Q · 100M · 180m</Badge>
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-text-muted">
                Take a verified GATE CSE paper and receive an explicit evidence-validity receipt.
              </span>
            </button>
          </CardBody>
        </Card>
      )}

      {fullPaperSelected ? (
        <FullPaperSetup
          papers={benchmarkPapers}
          selectedPaperId={selectedBenchmarkPaper?.id ?? null}
          closedBookConfirmed={closedBookConfirmed}
          loading={loading}
          error={!activeSession ? error : null}
          onSelectPaper={(paper) =>
            setConfig({
              ...config,
              benchmarkPaperId: paper.id,
              bookSlug: paper.bookSlug,
              subjectSlug: 'all',
              subjectSlugs: undefined,
              topicSlug: 'all',
              fromYear: paper.year,
              toYear: paper.year,
              type: 'all',
              history: 'all',
              order: 'oldest',
              count: 'all'
            })
          }
          onClosedBookConfirmed={onClosedBookConfirmed}
          onStart={onStart}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-border bg-bg-overlay/25 p-4 sm:p-5">
              <p className="u-label">Step 2 · Configure the set</p>
              <h2 className="font-display text-[18px] font-bold text-text">
                {config.mode === 'exam' ? 'Build your timed exam' : 'Build your practice session'}
              </h2>
              <p className="text-[12px] text-text-muted">
                GATE CSE Core · Choose your subject and filters, then start your session.
              </p>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
              <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="u-label">Choose a subject</p>
                    <p className="mt-1 text-[13px] text-text-muted">
                      Each stack is scoped to the selected question book.
                    </p>
                  </div>
                  <span className="u-num text-[12px] text-text-faint">
                    {attemptedIds.size.toLocaleString()} / {catalogQuestionCount.toLocaleString()}{' '}
                    seen
                  </span>
                </div>
                <label className="block text-[12px] font-medium text-text-muted sm:hidden">
                  Subject
                  <Select
                    className="mt-1"
                    value={config.subjectSlug}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        subjectSlug: event.target.value,
                        subjectSlugs: undefined,
                        topicSlug: 'all'
                      })
                    }
                  >
                    <option value="all">Mixed subjects — {catalogQuestionCount} questions</option>
                    {catalogSubjects.map((subject) => (
                      <option key={subject.slug} value={subject.slug}>
                        {subject.label} — {subject.count}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="hidden grid-cols-1 gap-2 sm:grid sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        subjectSlug: 'all',
                        subjectSlugs: undefined,
                        topicSlug: 'all'
                      })
                    }
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
                        {catalogQuestionCount.toLocaleString()} questions
                      </span>
                    </span>
                  </button>
                  {catalogSubjects.map((subject) => {
                    const active = config.subjectSlug === subject.slug;
                    const seen = seenBySubject.get(subject.slug) ?? 0;
                    return (
                      <button
                        key={subject.slug}
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            subjectSlug: subject.slug,
                            subjectSlugs: undefined,
                            topicSlug: 'all'
                          })
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
                          className={cn(
                            'mt-0.5 shrink-0',
                            active ? 'text-accent' : 'text-text-faint'
                          )}
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
                        const activeList =
                          selectedTopicSlug === 'all' ? [] : selectedTopicSlug.split(',');
                        const active = activeList.includes(topic.slug);
                        return (
                          <button
                            key={topic.slug}
                            type="button"
                            onClick={() => {
                              let newList: string[];
                              if (selectedTopicSlug === 'all') {
                                newList = [topic.slug];
                              } else {
                                if (active) {
                                  newList = activeList.filter((t) => t !== topic.slug);
                                } else {
                                  newList = [...activeList, topic.slug];
                                }
                              }
                              setConfig({
                                ...config,
                                topicSlug: newList.length > 0 ? newList.join(',') : 'all'
                              });
                            }}
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
                <div
                  className={cn(
                    'rounded border px-3 py-2.5',
                    config.mode === 'exam'
                      ? 'border-ink-violet/20 bg-guess-faint'
                      : 'border-accent/20 bg-accent-faint'
                  )}
                >
                  <p className="u-label">
                    {config.mode === 'exam' ? 'Exam rules' : 'Practice rules'}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
                    {config.mode === 'exam'
                      ? '3 minutes per question feed one shared countdown. Keys stay hidden until submission.'
                      : 'There is no overall timer. Commit each response to reveal its key before moving on.'}
                  </p>
                </div>
                {sealedBenchmarkCount > 0 && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded border border-success/20 bg-success-faint/50 p-2.5">
                    <input
                      type="checkbox"
                      checked={includeReservedBenchmarkQuestions}
                      onChange={(event) =>
                        onIncludeReservedBenchmarkQuestions(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="text-[11px] leading-relaxed text-text-muted">
                      <span className="block font-semibold text-text">
                        Allow sealed benchmark questions in this regular set
                      </span>
                      Off by default. {sealedBenchmarkCount} unseen full-paper
                      {sealedBenchmarkCount === 1 ? ' reserve stays' : ' reserves stay'} intact for
                      a future authentic attempt.
                    </span>
                  </label>
                )}
                <p className="u-label mt-5">
                  {config.mode === 'exam' ? 'Exam settings' : 'Practice settings'}
                </p>
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
                      {catalogYears
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
                      onChange={(event) =>
                        setConfig({ ...config, toYear: Number(event.target.value) })
                      }
                    >
                      {catalogYears.map(({ year }) => (
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
                    Question history
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
                      onChange={(event) =>
                        setConfig({ ...config, order: event.target.value as Order })
                      }
                    >
                      <option value="unseen">Unseen first</option>
                      <option value="random">Random</option>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </Select>
                  </label>
                </div>
                <div className="mt-auto pt-6">
                  {error && !activeSession && (
                    <p role="alert" className="mb-3 text-[12px] text-danger">
                      {error}
                    </p>
                  )}
                  <Button variant="primary" className="w-full" onClick={onStart} disabled={loading}>
                    <BookOpenCheck size={17} />
                    {loading
                      ? 'Opening question bank…'
                      : config.mode === 'exam'
                        ? 'Start timed exam'
                        : 'Start practice set'}
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
        </>
      )}

      {completedSessions.length > 0 ? (
        <PyqSessionHistory
          sessions={completedSessions}
          attempts={attempts}
          subjectLabels={Object.fromEntries(
            manifest.subjects.map((subject) => [subject.slug, subject.label])
          )}
          onReview={onReview}
        />
      ) : null}

      {attempts.length > 0 ? (
        <PyqEvidenceLedger
          insights={evidenceInsights}
          onPractice={onPracticeEvidenceSubset}
          onAddToRecovery={onAddEvidenceToRecovery}
          onAnalyzeFirst={onAnalyzeEvidenceFirst}
          onPlanRepair={onPlanEvidenceRepair}
          onTryTransfer={onTryEvidenceTransfer}
        />
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
  const answerChoices = question.choices?.length ? question.choices : DEFAULT_CHOICES;
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
      <div
        className={cn(
          'grid gap-2',
          answerChoices.length > 4 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-4'
        )}
      >
        {answerChoices.map((choice) => {
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

function PracticeConfidenceButtons({
  confidence,
  decision,
  disabled,
  onChange
}: {
  confidence: PyqExamConfidence | null;
  decision: MarkDecision | null;
  disabled: boolean;
  onChange: (confidence: PyqExamConfidence | null, decision: MarkDecision) => void;
}) {
  const options: {
    confidence: PyqExamConfidence | null;
    decision: MarkDecision;
    label: string;
    hint: string;
    ariaLabel: string;
    tone: 'success' | 'guess' | 'neutral';
  }[] = [
    {
      confidence: 'high',
      decision: 'MARK',
      label: 'High',
      hint: 'Answered',
      ariaLabel: 'Answered: committed',
      tone: 'success'
    },
    {
      confidence: 'medium',
      decision: 'FIFTY_FIFTY',
      label: 'Medium',
      hint: '50/50',
      ariaLabel: 'Guessed 50/50: uncertain',
      tone: 'guess'
    },
    {
      confidence: 'low',
      decision: 'FIFTY_FIFTY',
      label: 'Low',
      hint: 'Guessed',
      ariaLabel: 'Guessed: uncertain',
      tone: 'guess'
    },
    {
      confidence: null,
      decision: 'SKIP',
      label: 'Skip',
      hint: 'Left blank',
      ariaLabel: 'Left blank: skipped',
      tone: 'neutral'
    }
  ];
  return (
    <fieldset disabled={disabled}>
      <legend className="text-[13px] font-semibold text-text">How confident do you feel?</legend>
      <p className="mt-0.5 text-[11.5px] text-text-faint">Record how certain you feel.</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {options.map((option) => {
          const isSelected =
            option.decision === 'SKIP'
              ? decision === 'SKIP'
              : decision !== 'SKIP' &&
                (confidence === option.confidence ||
                  (confidence === null && option.confidence === 'high' && decision === 'MARK') ||
                  (confidence === null &&
                    option.confidence === 'medium' &&
                    decision === 'FIFTY_FIFTY'));

          return (
            <button
              key={option.label}
              type="button"
              aria-label={option.ariaLabel}
              aria-pressed={isSelected}
              onClick={() => onChange(option.confidence, option.decision)}
              className={cn(
                'flex flex-col items-center justify-center rounded border p-2 text-center transition-all',
                isSelected
                  ? option.tone === 'success'
                    ? 'border-accent bg-accent-faint text-accent shadow-sm font-semibold'
                    : option.tone === 'guess'
                      ? 'border-ink-violet/50 bg-guess-faint text-ink-violet shadow-sm font-semibold'
                      : 'border-border-hover bg-bg-overlay text-text shadow-sm font-semibold'
                  : 'border-border bg-bg-raised text-text-muted hover:border-border-hover hover:text-text'
              )}
            >
              <span className="text-[13px] font-semibold">{option.label}</span>
              <span className="mt-0.5 text-[10.5px] text-text-faint">{option.hint}</span>
            </button>
          );
        })}
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
  const effectiveConfidence =
    attempt.confidence ??
    (attempt.mark_decision === 'MARK'
      ? 'high'
      : attempt.mark_decision === 'FIFTY_FIFTY'
        ? 'medium'
        : null);
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
            {score.covered && <Badge tone="accent">{score.label}</Badge>}
            {effectiveConfidence && (
              <Badge tone={effectiveConfidence === 'high' ? 'success' : 'guess'}>
                {effectiveConfidence[0].toUpperCase() + effectiveConfidence.slice(1)} confidence
              </Badge>
            )}
            {score.covered && <span className="text-[11px] text-text-faint">{score.detail}</span>}
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
  const { userId, profile, sandbox } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const timeZone = profile?.timezone ?? 'Asia/Kolkata';
  const [manifest, setManifest] = useState<PyqManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [config, setConfig] = useState<AttemptConfig>(() => ({
    bookSlug: 'gate-cse',
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
  const storedLastConfig = usePyqPreferencesStore((state) => state.lastConfig);
  const storedLastPreset = usePyqPreferencesStore((state) => state.lastPreset);
  const storedSelectionSeed = usePyqPreferencesStore((state) => state.selectionSeed);
  const savedPrescriptions = usePyqPreferencesStore((state) => state.savedPrescriptions);
  const rememberPyqPreferences = usePyqPreferencesStore((state) => state.remember);
  const savePyqPrescription = usePyqPreferencesStore((state) => state.savePrescription);
  const deletePyqPrescription = usePyqPreferencesStore((state) => state.deletePrescription);
  const [recommendationPreset, setRecommendationPreset] = useState<PyqPresetPreference>(
    () => usePyqPreferencesStore.getState().lastPreset
  );
  const [selectionSeed, setSelectionSeed] = useState(
    () => usePyqPreferencesStore.getState().selectionSeed || `pyq-${todayISOInTimeZone(timeZone)}`
  );
  const [recommendedSelection, setRecommendedSelection] = useState<RecommendedPyqSelection | null>(
    null
  );
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [includeReservedBenchmarkQuestions, setIncludeReservedBenchmarkQuestions] = useState(false);
  const [closedBookConfirmed, setClosedBookConfirmed] = useState(false);
  const [questions, setQuestions] = useState<PyqQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [numeric, setNumeric] = useState('');
  const [decision, setDecision] = useState<MarkDecision | null>(null);
  const [confidence, setConfidence] = useState<PyqExamConfidence | null>(null);
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
  const [calcOpen, setCalcOpen] = useState(false);
  const questionCaptureRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const pausingSessionRef = useRef(false);
  const startingRef = useRef(false);
  const questionStartRef = useRef<{ questionUid: string; startedAtMs: number } | null>(null);
  const completedRef = useRef(completed);
  const loadedSessionRef = useRef<PyqSessionRow | null>(loadedSession);
  const examWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const finalizeExamRef = useRef<(reason: 'manual' | 'time-expired') => Promise<void>>(
    async () => {}
  );
  const resumeSessionRef = useRef<(session: PyqSessionRow) => Promise<void>>(async () => {});
  const appliedPreferenceSignatureRef = useRef<string | null>(null);
  const autoResumeHandledRef = useRef<string | null>(null);
  completedRef.current = completed;
  loadedSessionRef.current = loadedSession;

  async function reconcileLinkedPlannerReceipt(
    plannerDate: string | null,
    plannerBlockId: string | null
  ) {
    if (!userId || !plannerDate || !plannerBlockId) return;
    const changed = await reconcilePlannerExecutions(userId);
    if (changed <= 0 || sandbox) return;
    const plan = loadDayPlan(plannerDate);
    if (plan) void queuePlannerCloudWrite(userId, plan);
  }

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
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
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
  const learningItems = useLiveQuery(
    async () => (userId ? db.learning_items.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const learningEvents = useLiveQuery(
    async () => (userId ? db.learning_events.where('user_id').equals(userId).toArray() : []),
    [userId],
    []
  );
  const currentWeeklyReview = useLiveQuery(
    async () => {
      if (!userId) return null;
      const rows = await db.weekly_reviews.where('user_id').equals(userId).toArray();
      const today = todayISOInTimeZone(timeZone);
      return (
        rows
          .filter((row) => row.week_start <= today)
          .sort((left, right) => right.week_start.localeCompare(left.week_start))[0] ?? null
      );
    },
    [timeZone, userId],
    null
  );
  const pyqEvidenceInsights = useMemo(
    () =>
      buildPyqEvidenceInsights({
        attempts,
        analyzedAttemptIds: analyzedAttemptIds(journalQuestions, attempts)
      }),
    [attempts, journalQuestions]
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
          const defaultBook = value.books.find((book) => book.slug === 'gate-cse');
          const defaultSubjects = defaultBook?.subjects ?? value.subjects;
          const requestedSubject = searchParams.get('subject');
          const requested = requestedSubject
            ? defaultSubjects.find(
                (subject) =>
                  subject.label.toLocaleLowerCase() === requestedSubject.toLocaleLowerCase()
              )
            : null;
          const currentSubjectSlugs = (current.subjectSlugs ?? []).filter((slug) =>
            defaultSubjects.some((subject) => subject.slug === slug)
          );
          return {
            ...current,
            bookSlug: 'gate-cse',
            subjectSlug:
              requested?.slug ??
              (defaultSubjects.some((subject) => subject.slug === current.subjectSlug)
                ? current.subjectSlug
                : 'all'),
            subjectSlugs:
              requested || currentSubjectSlugs.length === 0 ? undefined : currentSubjectSlugs,
            topicSlug: 'all',
            fromYear: defaultBook?.firstYear ?? value.firstYear,
            toYear: defaultBook?.lastYear ?? value.lastYear
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

  useEffect(() => {
    if (!manifest || !userId) return;
    const preferenceSignature = `${userId}\u0000${searchParams.toString()}`;
    if (appliedPreferenceSignatureRef.current === preferenceSignature) return;
    const explicitKeys = [
      'plannerDate',
      'plannerBlock',
      'book',
      'subject',
      'subjectSlug',
      'subjectSlugs',
      'topic',
      'fromYear',
      'toYear',
      'type',
      'order',
      'count',
      'history',
      'preset',
      'cohort',
      'seed',
      'mode',
      'examKind',
      'protectSealed',
      'plannerPrescription',
      'duration',
      'questionUids',
      'question_uids',
      'uids'
    ];
    const hasExplicitPrescription = explicitKeys.some((key) => searchParams.has(key));
    const plannerLinked = searchParams.has('plannerDate') && searchParams.has('plannerBlock');

    setConfig((current) => {
      const remembered =
        !hasExplicitPrescription && storedLastConfig
          ? ({
              ...storedLastConfig,
              examState: undefined,
              practiceDraft: undefined,
              practiceDrafts: undefined
            } as AttemptConfig)
          : current;
      const selectedBook = manifest.books.find((book) => book.slug === 'gate-cse');
      const catalogSubjects = selectedBook?.subjects ?? manifest.subjects;
      const requestedSubjectSlug = searchParams.get('subjectSlug');
      const requestedSubjectSlugsParam = searchParams.get('subjectSlugs');
      const requestedSubjectSlugs = [
        ...new Set(
          (requestedSubjectSlugsParam ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => catalogSubjects.some((subject) => subject.slug === value))
        )
      ];
      const rememberedSubjectSlugs = (remembered.subjectSlugs ?? []).filter((value) =>
        catalogSubjects.some((subject) => subject.slug === value)
      );
      const requestedSubjectLabel = searchParams.get('subject');
      const requestedSubject = catalogSubjects.find(
        (subject) =>
          subject.slug === requestedSubjectSlug ||
          subject.label.toLocaleLowerCase() === requestedSubjectLabel?.toLocaleLowerCase()
      );
      const requestedTopic = searchParams.get('topic');
      const subjectSlug =
        requestedSubjectSlugs.length > 1
          ? 'all'
          : (requestedSubjectSlugs[0] ??
            requestedSubject?.slug ??
            (catalogSubjects.some((subject) => subject.slug === remembered.subjectSlug)
              ? remembered.subjectSlug
              : 'all'));
      const subjectSlugs =
        subjectSlug === 'all'
          ? requestedSubjectSlugsParam !== null
            ? requestedSubjectSlugs
            : rememberedSubjectSlugs
          : [];
      const subject = catalogSubjects.find((candidate) => candidate.slug === subjectSlug);
      const topicSlug =
        requestedTopic === 'all' || subject?.topics.some((topic) => topic.slug === requestedTopic)
          ? (requestedTopic ?? remembered.topicSlug ?? 'all')
          : (remembered.topicSlug ?? 'all');
      const fromYearParam = searchParams.get('fromYear');
      const toYearParam = searchParams.get('toYear');
      const fromYear = fromYearParam == null ? Number.NaN : Number(fromYearParam);
      const toYear = toYearParam == null ? Number.NaN : Number(toYearParam);
      const type = searchParams.get('type');
      const order = searchParams.get('order');
      const count = searchParams.get('count');
      const history = searchParams.get('history');
      const requestedMode = searchParams.get('mode');
      const requestedExamKind = searchParams.get('examKind');
      const requestedDuration = Number(searchParams.get('duration'));
      return {
        ...remembered,
        bookSlug: 'gate-cse',
        subjectSlug,
        subjectSlugs: subjectSlugs.length > 0 ? subjectSlugs : undefined,
        topicSlug,
        fromYear: Number.isInteger(fromYear)
          ? fromYear
          : (remembered.fromYear ?? selectedBook?.firstYear ?? manifest.firstYear),
        toYear: Number.isInteger(toYear)
          ? toYear
          : (remembered.toYear ?? selectedBook?.lastYear ?? manifest.lastYear),
        type: ['all', 'MCQ', 'MSQ', 'NAT'].includes(type ?? '')
          ? (type as AttemptConfig['type'])
          : remembered.type,
        order: ['unseen', 'random', 'newest', 'oldest'].includes(order ?? '')
          ? (order as AttemptConfig['order'])
          : remembered.order,
        count: ['5', '10', '15', '25', '50', 'all'].includes(count ?? '')
          ? (count as CountChoice)
          : remembered.count,
        history: PYQ_HISTORY_OPTIONS.some((option) => option.value === history)
          ? (history as PyqHistoryFilter)
          : (remembered.history ?? 'all'),
        mode:
          requestedMode === 'practice' || requestedMode === 'exam'
            ? requestedMode
            : (remembered.mode ?? 'practice'),
        examKind:
          requestedMode === 'exam' &&
          (requestedExamKind === 'timed-set' || requestedExamKind === 'full-paper')
            ? requestedExamKind
            : requestedMode === 'exam'
              ? 'timed-set'
              : undefined,
        plannerPrescriptionId: searchParams.get('plannerPrescription') ?? undefined,
        plannerTimeBudgetMin:
          Number.isFinite(requestedDuration) && requestedDuration > 0
            ? Math.max(5, Math.min(480, Math.round(requestedDuration)))
            : undefined
      };
    });
    const requestedPreset = recommendedPresetParam(searchParams.get('preset'));
    setRecommendationPreset(
      requestedPreset ??
        (plannerLinked
          ? searchParams.get('history') === 'unseen'
            ? 'learn'
            : 'diagnose'
          : storedLastPreset)
    );
    setSelectionSeed(
      searchParams.get('seed') ||
        storedSelectionSeed ||
        `${plannerLinked ? `planner-${searchParams.get('plannerDate')}-${searchParams.get('plannerBlock')}` : 'pyq'}-${todayISOInTimeZone(timeZone)}`
    );
    setIncludeReservedBenchmarkQuestions(searchParams.get('protectSealed') === '0');
    appliedPreferenceSignatureRef.current = preferenceSignature;
    setPreferencesReady(true);
  }, [
    manifest,
    searchParams,
    storedLastConfig,
    storedLastPreset,
    storedSelectionSeed,
    timeZone,
    userId
  ]);

  useEffect(() => {
    if (!preferencesReady || !userId) return;
    rememberPyqPreferences(
      {
        ...config,
        examState: undefined,
        practiceDraft: undefined,
        practiceDrafts: undefined,
        selectionSeed,
        recommendationPreset
      },
      recommendationPreset,
      selectionSeed
    );
  }, [
    config,
    preferencesReady,
    recommendationPreset,
    rememberPyqPreferences,
    selectionSeed,
    userId
  ]);

  useEffect(() => {
    if (!manifest || recommendationPreset === 'custom' || recommendationPreset === 'full-paper') {
      setRecommendedSelection(null);
      setRecommendationLoading(false);
      setRecommendationError(null);
      return;
    }
    let active = true;
    setRecommendationLoading(true);
    setRecommendationError(null);

    const resolve = async () => {
      const restrictedSubjectSlugs =
        config.subjectSlug === 'all' && config.subjectSlugs?.length
          ? new Set(config.subjectSlugs)
          : null;
      const selectedSubjects = restrictedSubjectSlugs
        ? manifest.subjects.filter((subject) => restrictedSubjectSlugs.has(subject.slug))
        : config.subjectSlug === 'all'
          ? manifest.subjects
          : manifest.subjects.filter((subject) => subject.slug === config.subjectSlug);
      const bankRows = await loadPyqQuestions(
        selectedSubjects.length > 0 ? selectedSubjects : manifest.subjects,
        manifest.bankVersion
      );
      const today = todayISOInTimeZone(timeZone);
      const dueQuestionUids = learningItems.flatMap((item) =>
        item.question_uid &&
        !item.mastered_at &&
        item.scheduled_date != null &&
        item.scheduled_date <= today
          ? [item.question_uid]
          : []
      );
      const pendingTransfers = new Map<string, string>();
      for (const event of [...learningEvents].sort(
        (left, right) =>
          left.occurred_at.localeCompare(right.occurred_at) || left.id.localeCompare(right.id)
      )) {
        if (event.event_type === 'transfer_assigned') {
          const uid = event.metadata['transfer_question_uid'];
          if (typeof uid === 'string' && uid.trim()) {
            pendingTransfers.set(event.learning_item_id, uid);
          }
        } else if (
          event.event_type === 'transfer_passed' ||
          event.event_type === 'transfer_failed'
        ) {
          pendingTransfers.delete(event.learning_item_id);
        }
      }
      const latestAttemptByUid = new Map<string, PyqAttemptRow>();
      for (const attempt of attempts) {
        const currentAttempt = latestAttemptByUid.get(attempt.question_uid);
        if (!currentAttempt || attempt.attempted_at > currentAttempt.attempted_at) {
          latestAttemptByUid.set(attempt.question_uid, attempt);
        }
      }
      const itemByUid = new Map(
        learningItems.flatMap((item) => (item.question_uid ? [[item.question_uid, item]] : []))
      );
      const weeklyFocus =
        `${currentWeeklyReview?.weakest_concept ?? ''} ${currentWeeklyReview?.this_weeks_fix ?? ''}`
          .trim()
          .toLocaleLowerCase();
      const plannerLinked = searchParams.has('plannerDate') && searchParams.has('plannerBlock');
      const plannerQuestionUids = commaSeparatedQuestionUids(searchParams);
      const requestedCohort = recommendationCohortParam(searchParams.get('cohort'));
      const plannerQuestionUidSet = new Set(plannerQuestionUids);
      const priorityByQuestionUid: Record<string, PyqRecommendationPriorityEvidence> = {};
      for (const question of bankRows) {
        const item = itemByUid.get(question.id);
        const latestAttempt = latestAttemptByUid.get(question.id);
        const flags = new Set(item?.reason_flags ?? []);
        const weakness =
          flags.has('wrong') || flags.has('high-confidence-wrong')
            ? 1
            : flags.has('skipped') || flags.has('low-confidence')
              ? 0.85
              : flags.has('guessed-correct') || flags.has('slow-correct')
                ? 0.65
                : latestAttempt?.mark_correct === false
                  ? 0.75
                  : 0;
        const daysSinceAttempt = latestAttempt
          ? Math.max(
              0,
              Math.floor((Date.now() - Date.parse(latestAttempt.attempted_at)) / 86_400_000)
            )
          : 0;
        const focusTerms = [
          question.subject,
          question.subjectSlug,
          question.topic,
          question.topicSlug
        ]
          .map((value) => value.trim().toLocaleLowerCase())
          .filter((value) => value.length >= 4);
        const isWeeklyFocus =
          weeklyFocus.length > 0 && focusTerms.some((term) => weeklyFocus.includes(term));
        const plannerPriority = plannerQuestionUidSet.has(question.id)
          ? 100
          : plannerLinked
            ? 60
            : 0;
        if (
          weakness > 0 ||
          (item?.lapse_count ?? 0) > 0 ||
          daysSinceAttempt > 0 ||
          isWeeklyFocus ||
          plannerPriority > 0
        ) {
          priorityByQuestionUid[question.id] = {
            weakness,
            lapseCount: item?.lapse_count ?? 0,
            daysSinceAttempt,
            weeklyFocus: isWeeklyFocus,
            plannerPriority
          };
        }
      }
      const topicSlugs =
        (config.topicSlug ?? 'all') === 'all'
          ? undefined
          : config.topicSlug
              ?.split(',')
              .map((topic) => topic.trim())
              .filter(Boolean);
      return recommendPyqSelection({
        questions: bankRows,
        attempts,
        preset: recommendationPreset,
        cohorts:
          plannerQuestionUids.length > 0
            ? ['exact-uid']
            : requestedCohort
              ? [requestedCohort]
              : undefined,
        requestedCount: countForRecommendation(config),
        seed: selectionSeed,
        scope: {
          subjectSlugs:
            config.subjectSlug === 'all'
              ? config.subjectSlugs?.length
                ? config.subjectSlugs
                : undefined
              : [config.subjectSlug],
          topicSlugs,
          fromYear: Math.min(config.fromYear, config.toYear),
          toYear: Math.max(config.fromYear, config.toYear),
          bookSlugs: ['gate-cse'],
          types: config.type === 'all' ? undefined : [config.type]
        },
        dueQuestionUids,
        transferQuestionUids:
          pendingTransfers.size > 0
            ? [...new Set(pendingTransfers.values())]
            : bankRows
                .filter(
                  (question) =>
                    matchesPyqBookScope(question, { bookSlug: 'gate-cse' }) &&
                    !latestAttemptByUid.has(question.id)
                )
                .map((question) => question.id),
        exactQuestionUids: plannerQuestionUids.length > 0 ? plannerQuestionUids : undefined,
        primaryBookSlug: manifest.defaultBookSlug,
        benchmarkPapers: manifest.benchmarkPapers,
        reserve: {
          protectSealedPapers: searchParams.get('protectSealed') !== '0',
          includeReserved: includeReservedBenchmarkQuestions
        },
        priorityByQuestionUid
      });
    };

    void resolve()
      .then((selection) => {
        if (active) setRecommendedSelection(selection);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRecommendedSelection(null);
        setRecommendationError(
          error instanceof Error ? error.message : 'Could not calculate the recommended set.'
        );
      })
      .finally(() => {
        if (active) setRecommendationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    attempts,
    config,
    currentWeeklyReview,
    includeReservedBenchmarkQuestions,
    learningEvents,
    learningItems,
    manifest,
    recommendationPreset,
    searchParams,
    selectionSeed,
    timeZone
  ]);

  const current = questions[index] ?? null;
  const currentId = current?.id ?? null;
  const latestCurrentAttempt = currentId ? latestQuestionAttempt(completed, currentId) : null;
  useEffect(() => {
    if (!currentId) return;
    const openSession = loadedSessionRef.current;
    if (openSession?.config.practiceView === 'multiple' && openSession.config.mode !== 'exam') {
      const article = document.getElementById(`practice-question-${index}`);
      article?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
      article?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
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
      setConfidence(null);
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
    const practiceDraft =
      !lockedAttempt && openSession && openSession.config.mode !== 'exam'
        ? getPyqPracticeDraft(openSession, currentId)
        : null;
    const persistedStart = questionStartRef.current;
    setStartedAt(
      lockedAttempt
        ? null
        : persistedStart?.questionUid === currentId
          ? persistedStart.startedAtMs
          : Date.now()
    );
    questionStartRef.current = null;
    const savedAnswer = lockedAttempt?.selected_answer ?? practiceDraft?.selected_answer;
    setChoices(
      Array.isArray(savedAnswer)
        ? savedAnswer.map(String)
        : typeof savedAnswer === 'string' && answerInputType(questions[index]) !== 'NAT'
          ? [savedAnswer]
          : []
    );
    setNumeric(answerInputType(questions[index]) === 'NAT' ? String(savedAnswer ?? '') : '');
    const savedDecision = lockedAttempt?.mark_decision ?? practiceDraft?.mark_decision ?? null;
    const savedConfidence =
      lockedAttempt?.confidence ??
      practiceDraft?.confidence ??
      (savedDecision === 'MARK' ? 'high' : savedDecision === 'FIFTY_FIFTY' ? 'medium' : null);
    setDecision(savedDecision);
    setConfidence(savedConfidence);
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
  const practiceDraftElapsedSec =
    !submitted && loadedSession && currentId
      ? Math.floor((getPyqPracticeDraft(loadedSession, currentId)?.elapsed_ms ?? 0) / 1000)
      : 0;
  const shownSeconds = submitted?.time_spent_sec ?? practiceDraftElapsedSec + liveSeconds;
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
    if (
      !timedExamActive ||
      examRemainingSec > 0 ||
      submittingRef.current ||
      pausingSessionRef.current
    ) {
      return;
    }
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
          await writeLocal('pyq_sessions', pauseStoredPyqSession(activeRow));
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
      const savedPracticeQuestionUid = isExam
        ? null
        : (session.current_question_uid ?? session.config.practiceDraft?.question_uid ?? null);
      const hasResumablePracticeQuestion =
        savedPracticeQuestionUid !== null &&
        rows.some((question) => question.id === savedPracticeQuestionUid);
      const exhausted =
        !isExam &&
        rows.every((question) => session.completed_question_uids.includes(question.id)) &&
        !hasResumablePracticeQuestion;
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
      const resumablePracticeQuestionUid = isExam
        ? null
        : (durableSession.current_question_uid ??
          durableSession.config.practiceDraft?.question_uid ??
          null);
      const resumablePracticeIndex = resumablePracticeQuestionUid
        ? rows.findIndex((question) => question.id === resumablePracticeQuestionUid)
        : -1;
      const nextIndex =
        resumablePracticeIndex >= 0
          ? resumablePracticeIndex
          : isExam
            ? Math.min(durableSession.current_index, Math.max(0, rows.length - 1))
            : Math.max(
                0,
                rows.findIndex(
                  (question) => !durableSession.completed_question_uids.includes(question.id)
                )
              );
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
      const resumedConfig = resumedSession.config as AttemptConfig;
      setConfig({
        ...resumedConfig,
        bookSlug: resumedConfig.bookSlug ?? 'all',
        topicSlug: resumedConfig.topicSlug ?? 'all',
        history: resumedConfig.history ?? 'all'
      });
      setClosedBookConfirmed(resumedSession.config.examState?.closed_book_confirmed === true);
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

  resumeSessionRef.current = resumeSession;

  useEffect(() => {
    const requestedSessionId = searchParams.get('resumeSession');
    if (
      !manifest ||
      !userId ||
      !requestedSessionId ||
      loading ||
      autoResumeHandledRef.current === requestedSessionId
    ) {
      return;
    }
    autoResumeHandledRef.current = requestedSessionId;
    let active = true;
    void db.pyq_sessions
      .get(requestedSessionId)
      .then(async (session) => {
        if (!active) return;
        if (!session || session.user_id !== userId) {
          throw new Error('That planned PYQ session is unavailable for this account.');
        }
        if (session.status !== 'active' && session.status !== 'paused') {
          throw new Error('That planned PYQ session is already closed.');
        }
        await resumeSessionRef.current(session);
      })
      .catch((error: unknown) => {
        if (!active) return;
        autoResumeHandledRef.current = null;
        setStartError(
          error instanceof Error ? error.message : 'Could not resume the planned PYQ session.'
        );
      });
    return () => {
      active = false;
    };
  }, [loading, manifest, searchParams, userId]);

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
    const pausingExam = session.config.mode === 'exam';
    const pausingOpenSession = pyqSessionId === session.id && questions.length > 0;
    let pauseFailed = false;
    if (loading || pausingSessionRef.current || submittingRef.current) return;
    pausingSessionRef.current = true;
    if (pausingExam) {
      setSubmitting(true);
    }
    setLoading(true);
    if (pausingOpenSession) setSubmitError(null);
    else setStartError(null);
    try {
      await examWriteQueueRef.current.catch(() => undefined);
      const persistedSession = await db.pyq_sessions.get(session.id);
      const currentSession =
        persistedSession ??
        (loadedSessionRef.current?.id === session.id ? loadedSessionRef.current : session);
      const pauseNowMs = Date.now();
      const visiblePracticeQuestion =
        currentSession.config.mode !== 'exam' && current && !submitted ? current : null;
      const practicePauseTarget =
        visiblePracticeQuestion &&
        currentSession.current_question_uid !== visiblePracticeQuestion.id
          ? {
              ...currentSession,
              current_question_uid: visiblePracticeQuestion.id,
              current_question_started_at: new Date(
                Math.min(startedAt ?? pauseNowMs, pauseNowMs)
              ).toISOString()
            }
          : currentSession;
      const savedDraft = practicePauseTarget.current_question_uid
        ? getPyqPracticeDraft(practicePauseTarget, practicePauseTarget.current_question_uid)
        : undefined;
      const reviewingCommitted = pausingOpenSession && !!submitted;
      const paused =
        currentSession.config.mode === 'exam'
          ? pausePyqExamSession(currentSession, pauseNowMs)
          : practicePauseTarget.current_question_uid && !reviewingCommitted
            ? pausePyqPracticeSession(
                practicePauseTarget,
                {
                  questionUid: practicePauseTarget.current_question_uid,
                  selectedAnswer:
                    visiblePracticeQuestion?.id === practicePauseTarget.current_question_uid
                      ? selectedAnswer(visiblePracticeQuestion)
                      : (savedDraft?.selected_answer ?? null),
                  markDecision:
                    visiblePracticeQuestion?.id === practicePauseTarget.current_question_uid
                      ? decision
                      : (savedDraft?.mark_decision ?? null),
                  confidence:
                    visiblePracticeQuestion?.id === practicePauseTarget.current_question_uid
                      ? confidence
                      : (savedDraft?.confidence ?? null)
                },
                pauseNowMs
              )
            : pausePyqSession(practicePauseTarget, new Date(pauseNowMs).toISOString());
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
      pauseFailed = true;
      const message = error instanceof Error ? error.message : 'Could not pause that PYQ session.';
      const pauseMessage = pausingExam ? `Exam was not paused: ${message}` : message;
      if (pausingOpenSession) setSubmitError(pauseMessage);
      else setStartError(pauseMessage);
    } finally {
      if (pausingExam) {
        setSubmitting(false);
      }
      pausingSessionRef.current = false;
      setLoading(false);
      const resumableExam = loadedSessionRef.current;
      if (
        pausingExam &&
        pauseFailed &&
        resumableExam?.config.mode === 'exam' &&
        resumableExam.status === 'active' &&
        pyqExamRemainingSeconds(resumableExam) <= 0
      ) {
        void finalizeExamRef.current('time-expired');
      }
    }
  }

  function selectRecommendationPreset(preset: PyqPresetPreference) {
    if (!manifest) return;
    setRecommendationPreset(preset);
    setStartError(null);
    setConfig((current) => recommendationConfig(preset, current, manifest));
  }

  function regenerateSelectionSeed() {
    setSelectionSeed(
      `${recommendationPreset}-${todayISOInTimeZone(timeZone)}-${uuid().slice(0, 8)}`
    );
  }

  function savePrescription(name: string) {
    const now = new Date().toISOString();
    const id = uuid();
    const prescription: PyqSavedPrescription = {
      id,
      name: name.trim(),
      preset: recommendationPreset,
      config: {
        ...config,
        recommendationPreset,
        selectionSeed,
        savedPrescriptionId: id,
        savedPrescriptionName: name.trim(),
        examState: undefined,
        practiceDraft: undefined,
        practiceDrafts: undefined
      },
      selectionSeed,
      createdAt: now,
      updatedAt: now
    };
    savePyqPrescription(prescription);
    setConfig((current) => ({
      ...current,
      savedPrescriptionId: id,
      savedPrescriptionName: prescription.name
    }));
  }

  function loadPrescription(prescription: PyqSavedPrescription) {
    setRecommendationPreset(prescription.preset);
    setSelectionSeed(prescription.selectionSeed);
    setConfig({
      ...(prescription.config as AttemptConfig),
      bookSlug: 'gate-cse',
      recommendationPreset: prescription.preset,
      selectionSeed: prescription.selectionSeed,
      savedPrescriptionId: prescription.id,
      savedPrescriptionName: prescription.name,
      examState: undefined,
      practiceDraft: undefined,
      practiceDrafts: undefined
    });
    setStartError(null);
  }

  function latestEvidenceAttempts(questionUids: readonly string[]): PyqAttemptRow[] {
    const requested = new Set(questionUids);
    const latest = new Map<string, PyqAttemptRow>();
    for (const attempt of attempts) {
      if (!requested.has(attempt.question_uid)) continue;
      const currentAttempt = latest.get(attempt.question_uid);
      if (
        !currentAttempt ||
        attempt.attempted_at > currentAttempt.attempted_at ||
        (attempt.attempted_at === currentAttempt.attempted_at &&
          attempt.attempt_number > currentAttempt.attempt_number)
      ) {
        latest.set(attempt.question_uid, attempt);
      }
    }
    return [...latest.values()];
  }

  function practiceEvidenceSubset(questionUids: string[]) {
    if (!manifest || questionUids.length === 0) return;
    const seed = `repair-${todayISOInTimeZone(timeZone)}-${uuid().slice(0, 8)}`;
    setRecommendationPreset('repair');
    setSelectionSeed(seed);
    setConfig((current) => ({
      ...current,
      bookSlug: 'gate-cse',
      subjectSlug: 'all',
      subjectSlugs: undefined,
      topicSlug: 'all',
      fromYear: manifest.firstYear,
      toYear: manifest.lastYear,
      type: 'all',
      history: 'all',
      order: 'random',
      count: questionUids.length <= 5 ? '5' : questionUids.length <= 10 ? '10' : 'all',
      mode: 'practice',
      recommendationPreset: 'repair',
      selectionSeed: seed,
      examKind: undefined,
      benchmarkPaperId: undefined,
      examState: undefined,
      practiceDraft: undefined,
      practiceDrafts: undefined
    }));
    navigate(`/pyq?questionUids=${encodeURIComponent(questionUids.join(','))}`);
  }

  async function addEvidenceToRecovery(questionUids: string[]) {
    const rows = latestEvidenceAttempts(questionUids);
    for (const attempt of rows) {
      await captureWeakPyqAttempt({ attempt, timeZone });
    }
    navigate('/reattempts');
  }

  function analyzeEvidenceFirst(questionUid: string) {
    const attempt = latestEvidenceAttempts([questionUid])[0];
    if (!attempt) return;
    navigate(`/journal?sourceAttempt=${encodeURIComponent(attempt.id)}`);
  }

  function planEvidenceRepair(questionUids: string[]) {
    if (questionUids.length === 0) return;
    const params = new URLSearchParams({
      date: todayISOInTimeZone(timeZone),
      addPyqRepair: '1',
      questionUids: questionUids.join(','),
      duration: String(Math.max(15, Math.ceil(questionUids.length * 3)))
    });
    navigate(`/planner?${params.toString()}`);
  }

  function tryEvidenceTransfer(questionUids: string[]) {
    if (!manifest || questionUids.length === 0) return;
    const sourceAttempts = latestEvidenceAttempts(questionUids);
    const subjectSlugs = new Set(
      sourceAttempts
        .map((attempt) => attempt.question_snapshot?.subject_slug)
        .filter((value): value is string => Boolean(value))
    );
    const topicSlugs = new Set(
      sourceAttempts
        .map((attempt) => attempt.question_snapshot?.topic_slug)
        .filter((value): value is string => Boolean(value))
    );
    const seed = `transfer-${todayISOInTimeZone(timeZone)}-${uuid().slice(0, 8)}`;
    setRecommendationPreset('transfer');
    setSelectionSeed(seed);
    setConfig((current) => ({
      ...current,
      bookSlug: 'gate-cse',
      subjectSlug: subjectSlugs.size === 1 ? [...subjectSlugs][0] : 'all',
      subjectSlugs: undefined,
      topicSlug: topicSlugs.size === 1 ? [...topicSlugs][0] : 'all',
      fromYear: manifest.firstYear,
      toYear: manifest.lastYear,
      type: 'all',
      history: 'unseen',
      order: 'random',
      count: questionUids.length <= 5 ? '5' : '10',
      mode: 'practice',
      recommendationPreset: 'transfer',
      selectionSeed: seed,
      examKind: undefined,
      benchmarkPaperId: undefined,
      examState: undefined,
      practiceDraft: undefined,
      practiceDrafts: undefined
    }));
    navigate('/pyq?job=transfer');
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
        await writeLocal('pyq_sessions', pauseStoredPyqSession(activeRow));
      }
      if (pyqSessionId && activeRows.some((r) => r.id === pyqSessionId)) {
        setQuestions([]);
        setFinished(false);
        setIndex(0);
        setPyqSessionId(null);
      }
      const attemptedIds = new Set(attempts.map((attempt) => attempt.question_uid));
      const isFullPaper = config.mode === 'exam' && config.examKind === 'full-paper';
      let rows: PyqQuestion[];
      let sessionConfig: AttemptConfig;

      if (isFullPaper) {
        const paper = manifest.benchmarkPapers.find(
          (candidate) => candidate.id === config.benchmarkPaperId
        );
        if (!paper) throw new Error('Select a verified full paper before starting.');
        const paperBook = manifest.books.find((book) => book.slug === paper.bookSlug);
        if (!paperBook) throw new Error('The selected paper book is unavailable in this bank.');
        const paperRows = await loadPyqQuestions(paperBook.subjects, manifest.bankVersion);
        const byId = new Map(paperRows.map((question) => [question.id, question]));
        rows = paper.questionUids.flatMap((questionUid) => {
          const question = byId.get(questionUid);
          return question ? [question] : [];
        });
        const maxMarks = rows.reduce(
          (sum, question) =>
            sum + (question.marks === 1 || question.marks === 2 ? question.marks : 0),
          0
        );
        const exactPaper =
          rows.length === paper.questionCount &&
          new Set(rows.map((question) => question.id)).size === paper.questionCount &&
          maxMarks === paper.maxMarks &&
          rows.every(
            (question) =>
              matchesPyqBookScope(question, { bookSlug: paper.bookSlug }) &&
              question.paperLabel === paper.paperLabel &&
              question.year === paper.year &&
              question.set === paper.set &&
              ['MCQ', 'MSQ', 'NAT'].includes(question.type) &&
              question.answerStatus === 'available'
          );
        if (!exactPaper) {
          throw new Error(
            'This benchmark no longer resolves to the verified 65-question, 100-mark paper. Refresh the local question bank before starting.'
          );
        }
        sessionConfig = createPyqExamConfig(
          {
            ...config,
            bookSlug: paper.bookSlug,
            subjectSlug: 'all',
            subjectSlugs: undefined,
            topicSlug: 'all',
            fromYear: paper.year,
            toYear: paper.year,
            type: 'all',
            history: 'all',
            order: 'oldest',
            count: 'all',
            recommendationPreset: 'full-paper',
            selectionSeed,
            recommendationReasons: ['Full Paper preset', 'Official paper order'],
            examKind: 'full-paper',
            benchmarkPaperId: paper.id,
            practiceDraft: undefined,
            practiceDrafts: undefined
          },
          paper.questionUids,
          {
            paperMetadata: {
              questionCount: paper.questionCount,
              maxMarks: paper.maxMarks
            },
            priorExposureQuestionUids: paper.questionUids.filter((questionUid) =>
              attemptedIds.has(questionUid)
            ),
            closedBookConfirmed
          }
        );
      } else if (recommendationPreset !== 'custom') {
        if (recommendationLoading) {
          throw new Error(
            'The exact recommended set is still being calculated. Try again once the preflight settles.'
          );
        }
        if (!recommendedSelection || recommendedSelection.questions.length === 0) {
          throw new Error(
            recommendationError ??
              'No questions are available for this recommended job. Widen the scope or choose Custom.'
          );
        }
        rows = recommendedSelection.questions.filter((question) =>
          matchesPyqBookScope(question, { bookSlug: 'gate-cse' })
        );
        if (rows.length === 0)
          throw new Error(
            'No GATE CSE Core questions match this setup. Choose another subject or filter.'
          );
        const recommendationReasons = [
          ...recommendedSelection.preflight.reasonChips.map((reason) => reason.label),
          ...rows.flatMap(
            (question) => recommendedSelection.priorityReasonsByQuestionUid[question.id] ?? []
          )
        ].filter((reason, reasonIndex, reasons) => reasons.indexOf(reason) === reasonIndex);
        const recommendedConfig: AttemptConfig = {
          ...config,
          recommendationPreset,
          selectionSeed,
          recommendationReasons,
          examKind: config.mode === 'exam' ? 'timed-set' : undefined,
          benchmarkPaperId: undefined,
          examState: undefined,
          practiceDraft: undefined,
          practiceDrafts: undefined
        };
        sessionConfig =
          config.mode === 'exam'
            ? createPyqExamConfig(
                recommendedConfig,
                rows.map((question) => question.id)
              )
            : recommendedConfig;
      } else {
        const selectedBook = manifest.books.find((book) => book.slug === 'gate-cse');
        const catalogSubjects = selectedBook?.subjects ?? manifest.subjects;
        const restrictedSubjectSlugs =
          config.subjectSlug === 'all' && config.subjectSlugs?.length
            ? new Set(config.subjectSlugs)
            : null;
        const subjects = restrictedSubjectSlugs
          ? catalogSubjects.filter((subject) => restrictedSubjectSlugs.has(subject.slug))
          : config.subjectSlug === 'all'
            ? catalogSubjects
            : catalogSubjects.filter((subject) => subject.slug === config.subjectSlug);
        const low = Math.min(config.fromYear, config.toYear);
        const high = Math.max(config.fromYear, config.toYear);
        rows = (await loadPyqQuestions(subjects, manifest.bankVersion)).filter(
          (question) =>
            matchesPyqBookScope(question, { bookSlug: 'gate-cse' }) &&
            matchesPyqTopicScope(question, config) &&
            question.year >= low &&
            question.year <= high &&
            (config.type === 'all' || question.type === config.type)
        );
        if (!includeReservedBenchmarkQuestions) {
          const reservedQuestionUids = new Set(
            manifest.benchmarkPapers
              .filter((paper) => pyqBenchmarkPaperExposure(paper, attempts).sealed)
              .flatMap((paper) => paper.questionUids)
          );
          rows = rows.filter((question) => !reservedQuestionUids.has(question.id));
        }
        rows = filterPyqByHistory(rows, config.history ?? 'all', attempts, journalQuestions);
        if (config.order === 'random') rows = deterministicQuestionOrder(rows, selectionSeed);
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
        if (rows.length === 0) {
          throw new Error(
            includeReservedBenchmarkQuestions
              ? 'No questions match those filters. Widen the subject, year, type, or history filter.'
              : 'No non-reserved questions match those filters. Widen the filters or explicitly allow sealed benchmark questions.'
          );
        }
        sessionConfig =
          config.mode === 'exam'
            ? createPyqExamConfig(
                {
                  ...config,
                  examKind: 'timed-set',
                  benchmarkPaperId: undefined,
                  practiceDraft: undefined,
                  practiceDrafts: undefined
                },
                rows.map((question) => question.id)
              )
            : {
                ...config,
                recommendationPreset: 'custom',
                selectionSeed,
                mode: 'practice',
                examKind: undefined,
                benchmarkPaperId: undefined,
                examState: undefined,
                practiceDraft: undefined,
                practiceDrafts: undefined
              };
      }
      sessionConfig = { ...sessionConfig, bookSlug: 'gate-cse' };
      const session = createPyqSessionRow(userId!, manifest.bankVersion, sessionConfig, rows);
      const plannerDate = searchParams.get('plannerDate');
      const plannerBlockId = searchParams.get('plannerBlock');
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
      if (plannerDate && plannerBlockId) {
        const linkedPlan = attachPlannerPyqSession({
          plannerDate,
          plannerBlockId,
          prescriptionId: session.config.plannerPrescriptionId,
          pyqSessionId: session.id,
          resolvedQuestionUids: session.question_uids,
          startedAt: session.started_at
        });
        if (linkedPlan && !sandbox) void queuePlannerCloudWrite(userId, linkedPlan);
      }
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
        await writeLocal('pyq_sessions', pauseStoredPyqSession(activeRow));
      }
      let repeatedConfig: AttemptConfig;
      if (config.mode === 'exam' && config.examKind === 'full-paper') {
        const paper = manifest.benchmarkPapers.find(
          (candidate) => candidate.id === config.benchmarkPaperId
        );
        if (!paper) throw new Error('The original benchmark paper is no longer available.');
        const exposed = new Set([...attempts, ...completed].map((attempt) => attempt.question_uid));
        repeatedConfig = createPyqExamConfig(
          { ...config, practiceDraft: undefined, practiceDrafts: undefined },
          questions.map((question) => question.id),
          {
            paperMetadata: {
              questionCount: paper.questionCount,
              maxMarks: paper.maxMarks
            },
            priorExposureQuestionUids: paper.questionUids.filter((questionUid) =>
              exposed.has(questionUid)
            ),
            closedBookConfirmed
          }
        );
      } else if (config.mode === 'exam') {
        repeatedConfig = createPyqExamConfig(
          {
            ...config,
            examKind: 'timed-set',
            benchmarkPaperId: undefined,
            practiceDraft: undefined,
            practiceDrafts: undefined
          },
          questions.map((question) => question.id)
        );
      } else {
        repeatedConfig = {
          ...config,
          mode: 'practice',
          examKind: undefined,
          benchmarkPaperId: undefined,
          examState: undefined,
          practiceDraft: undefined,
          practiceDrafts: undefined
        };
      }
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
      // Replace the array even when the repeated set has one question so the
      // per-question hydration effect cannot retain the completed receipt.
      setQuestions([...questions]);
      setIndex(0);
      setCompleted([]);
      setChoices([]);
      setNumeric('');
      setDecision(null);
      setConfidence(null);
      setSubmitted(null);
      setSubmitError(null);
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
    imageUrl: string | null,
    sourceQuestion: PyqQuestion | null = current
  ): QuestionRow {
    if (!sourceQuestion) throw new Error('No active question');
    const outcome =
      draft?.outcome ??
      (attempt.mark_correct === true
        ? inferPyqDirectOutcome(sourceQuestion, attempt.mark_decision, attempt.time_spent_sec)
        : 'W-C');
    return {
      id: uuid(),
      user_id: attempt.user_id,
      session_id: attempt.pyq_session_id,
      subject: attempt.subject,
      subject_id: attempt.subject_id ?? null,
      subtopic: sourceQuestion.topic,
      source_year: sourceQuestion.year,
      source_ref: pyqSourceRef(sourceQuestion),
      question_text: pyqPlainText(sourceQuestion.html),
      answer_text: answerText(sourceQuestion),
      image_url: imageUrl,
      time_spent_sec: attempt.time_spent_sec,
      target_time_sec: targetTimeSecForMarks(sourceQuestion.marks),
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
    if (submittingRef.current || pausingSessionRef.current) return;
    setChoices(nextChoices);
    const session = loadedSessionRef.current;
    if (!current || !session || session.config.mode !== 'exam') return;
    const answer = answerInputType(current) === 'MSQ' ? nextChoices : nextChoices[0];
    setLoadedExamSession(setPyqExamResponse(session, current, answer));
  }

  function changeExamNumeric(value: string) {
    if (submittingRef.current || pausingSessionRef.current) return;
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

  function changeExamConfidence(confidence: PyqExamConfidence) {
    const session = loadedSessionRef.current;
    if (
      !current ||
      !session ||
      session.config.mode !== 'exam' ||
      submittingRef.current ||
      pausingSessionRef.current
    ) {
      return;
    }
    setLoadedExamSession(setPyqExamConfidence(session, current.id, confidence));
  }

  function navigateExam(nextIndex: number) {
    const session = loadedSessionRef.current;
    if (
      !session ||
      session.config.mode !== 'exam' ||
      submittingRef.current ||
      pausingSessionRef.current
    ) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(nextIndex, questions.length - 1));
    const nextQuestion = questions[boundedIndex];
    if (!nextQuestion) return;
    const nextSession = checkpointPyqExamSession(session, nextQuestion.id);
    setLoadedExamSession(nextSession);
    setIndex(boundedIndex);
  }

  function markExamForReviewAndNext() {
    const session = loadedSessionRef.current;
    if (
      !current ||
      !session ||
      session.config.mode !== 'exam' ||
      submittingRef.current ||
      pausingSessionRef.current
    ) {
      return;
    }
    const marked = setPyqExamReviewMark(session, current.id, true);
    const nextIndex = Math.min(index + 1, questions.length - 1);
    const nextQuestion = questions[nextIndex];
    const nextSession = nextQuestion ? checkpointPyqExamSession(marked, nextQuestion.id) : marked;
    setLoadedExamSession(nextSession);
    if (nextIndex !== index) setIndex(nextIndex);
  }

  function clearExamResponse() {
    const session = loadedSessionRef.current;
    if (
      !current ||
      !session ||
      session.config.mode !== 'exam' ||
      submittingRef.current ||
      pausingSessionRef.current
    ) {
      return;
    }
    setChoices([]);
    setNumeric('');
    const cleared = setPyqExamResponse(session, current, undefined);
    setLoadedExamSession(setPyqExamConfidence(cleared, current.id, null));
  }

  function saveExamAndNext() {
    if (submittingRef.current || pausingSessionRef.current) return;
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
      submittingRef.current ||
      pausingSessionRef.current
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
      const mockTest = mockTestFromFinalizedPyqExam({
        session: finalized.session,
        attempts: finalized.attempts,
        timeZone
      });
      const existingCanonical = await db.sessions.get(session.id);
      await writeLocalBatch([
        ...finalized.attempts.map((attempt) => ({ name: 'pyq_attempts' as const, row: attempt })),
        { name: 'pyq_sessions', row: finalized.session },
        ...(mockTest ? ([{ name: 'mock_tests', row: mockTest }] as const) : []),
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
      for (const attempt of finalized.attempts) {
        if (!needsRecoveryCapture(attempt)) continue;
        const sourceQuestion = questions.find((question) => question.id === attempt.question_uid);
        if (!sourceQuestion) continue;
        const compatibilityQuestion = {
          ...questionRowFromAttempt(attempt, undefined, attempt.screenshot_url, sourceQuestion),
          id: pyqJournalQuestionId(attempt.id)
        };
        try {
          await captureWeakPyqAttempt({ attempt, timeZone, compatibilityQuestion });
        } catch (captureError) {
          // The immutable exam receipt is already safe. Login/resume backfill
          // retries recovery capture without making the whole paper look lost.
          console.warn('[air] Exam recovery capture is waiting to retry.', captureError);
        }
      }
      const finalizedCanonical = await db.sessions.get(finalized.session.id);
      await reconcileLinkedPlannerReceipt(
        finalizedCanonical?.planner_date ?? null,
        finalizedCanonical?.planner_block_id ?? null
      );
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
      submittingRef.current ||
      pausingSessionRef.current
    )
      return;
    const selected = selectedAnswer(current);
    if (
      decision !== 'SKIP' &&
      (selected == null ||
        (Array.isArray(selected) && selected.length === 0) ||
        (typeof selected === 'number' && !Number.isFinite(selected)))
    ) {
      return;
    }
    const committedAtMs = Date.now();
    const activeSegmentStartedAtMs = Math.min(startedAt ?? committedAtMs, committedAtMs);
    setSubmitError(null);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const session = pyqSessionId ? await db.pyq_sessions.get(pyqSessionId) : null;
      if (!session) {
        setSubmitError('The active set could not be found. Return to PYQ setup and resume it.');
        return;
      }
      const practiceDraft =
        session.config.mode !== 'exam' ? getPyqPracticeDraft(session, current.id) : null;
      const firstStartedAtMs = Date.parse(practiceDraft?.first_started_at ?? '');
      const questionStartedAtMs = Number.isFinite(firstStartedAtMs)
        ? Math.min(firstStartedAtMs, committedAtMs)
        : activeSegmentStartedAtMs;
      const timeSpentMs = practiceDraft
        ? practiceDraft.elapsed_ms + Math.max(0, committedAtMs - activeSegmentStartedAtMs)
        : undefined;
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
        confidence,
        bankVersion: manifest.bankVersion,
        questionStartedAtMs,
        committedAtMs,
        timeSpentMs,
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
      const recoveryNeeded = needsRecoveryCapture(attempt);
      let autoJournalSaved = false;
      let compatibilityQuestion: QuestionRow | null = null;
      if (attempt.mark_correct === true || recoveryNeeded) {
        const row = {
          ...questionRowFromAttempt(attempt, undefined, await safeQuestionImageUrl()),
          id: pyqJournalQuestionId(attempt.id)
        };
        writes.push({ name: 'questions', row });
        compatibilityQuestion = row;
        // Weak receipts are safely captured, but remain explicitly pending
        // analysis so the learner can still open TagFlow.
        autoJournalSaved = attempt.mark_correct === true && !recoveryNeeded;
      }
      await writeLocalBatch(writes);
      if (compatibilityQuestion && recoveryNeeded) {
        try {
          await captureWeakPyqAttempt({ attempt, timeZone, compatibilityQuestion });
        } catch (captureError) {
          // The answer receipt remains committed; account bootstrap retries
          // this idempotent recovery write after refresh or reconnection.
          console.warn('[air] Practice recovery capture is waiting to retry.', captureError);
        }
      }
      loadedSessionRef.current = nextSession;
      setLoadedSession(nextSession);
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
    await markLearningAnalysisCompleted({
      userId,
      sourceAttemptId: submitted.id,
      timeZone
    });
    setJournalOpen(false);
  }

  async function markSessionComplete() {
    if (!pyqSessionId) throw new Error('The active Practice session could not be found.');
    const session = await db.pyq_sessions.get(pyqSessionId);
    if (!session) throw new Error('The active Practice session could not be found.');
    if (session.status === 'completed') return;
    if (session.status !== 'active') {
      throw new Error('This Practice session is no longer active. Resume it before finishing.');
    }
    if (!session.question_uids.every((uid) => session.completed_question_uids.includes(uid))) {
      throw new Error('Answer or explicitly skip every question before finishing the set.');
    }
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
    await reconcileLinkedPlannerReceipt(
      existingCanonical?.planner_date ?? null,
      existingCanonical?.planner_block_id ?? null
    );
    loadedSessionRef.current = completedSession;
    setLoadedSession(completedSession);
  }

  async function navigatePractice(nextIndex: number) {
    if (
      nextIndex < 0 ||
      nextIndex >= questions.length ||
      loading ||
      submittingRef.current ||
      pausingSessionRef.current
    )
      return;
    if (nextIndex === index) {
      document.getElementById(`practice-question-${index}`)?.scrollIntoView?.({ block: 'start' });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const session = pyqSessionId ? await db.pyq_sessions.get(pyqSessionId) : null;
      if (!session || !current) throw new Error('The active practice set could not be found.');
      const nowMs = Date.now();
      const outgoing = !submitted
        ? {
            questionUid: current.id,
            selectedAnswer: selectedAnswer(current),
            markDecision: decision,
            confidence
          }
        : null;
      const alignedSession = outgoing
        ? {
            ...session,
            current_question_uid: current.id,
            current_question_started_at: new Date(Math.min(startedAt ?? nowMs, nowMs)).toISOString()
          }
        : session;
      const next = navigatePyqPracticeQuestion(
        alignedSession,
        questions[nextIndex].id,
        outgoing,
        nowMs
      );
      await writeLocal('pyq_sessions', next);
      loadedSessionRef.current = next;
      setLoadedSession(next);
      questionStartRef.current = { questionUid: questions[nextIndex].id, startedAtMs: nowMs };
      setIndex(nextIndex);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? `Could not change questions: ${error.message}`
          : 'Could not change questions. Your draft is still here.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function changePracticeView(practiceView: 'single' | 'multiple') {
    if (!pyqSessionId || loading || submittingRef.current || pausingSessionRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const session = await db.pyq_sessions.get(pyqSessionId);
      if (!session) throw new Error('The active practice set could not be found.');
      const next = {
        ...session,
        config: { ...session.config, practiceView },
        updated_at: new Date().toISOString()
      };
      await writeLocal('pyq_sessions', next);
      loadedSessionRef.current = next;
      setLoadedSession(next);
      setConfig((currentConfig) => ({ ...currentConfig, practiceView }));
      setSubmitError(null);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Could not save the practice view. Try again.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function goNext() {
    if (loading || submittingRef.current || pausingSessionRef.current) return;
    const allCompleted = questions.every((question) =>
      completed.some((attempt) => attempt.question_uid === question.id)
    );
    if (
      index + 1 < questions.length &&
      !(loadedSession?.config.practiceView === 'multiple' && allCompleted)
    ) {
      await navigatePractice(index + 1);
      return;
    }
    const unansweredIndex = questions.findIndex(
      (question) => !completed.some((attempt) => attempt.question_uid === question.id)
    );
    if (unansweredIndex >= 0) {
      await navigatePractice(unansweredIndex);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await markSessionComplete();
      window.scrollTo({ top: 0, behavior: 'auto' });
      setFinished(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? `Could not continue this practice set: ${error.message}` : 'Could not finish this practice set. Try again.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function goPrevious() {
    void navigatePractice(index - 1);
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
        evidenceInsights={pyqEvidenceInsights}
        config={config}
        setConfig={setConfig}
        recommendationPreset={recommendationPreset}
        recommendedSelection={recommendedSelection}
        recommendationLoading={recommendationLoading}
        recommendationError={recommendationError}
        selectionSeed={selectionSeed}
        savedPrescriptions={savedPrescriptions}
        includeReservedBenchmarkQuestions={includeReservedBenchmarkQuestions}
        closedBookConfirmed={closedBookConfirmed}
        loading={loading}
        error={startError}
        onResume={(session) => void resumeSession(session)}
        onSave={(session) => void saveSession(session)}
        onDiscard={(session) => void discardSession(session)}
        onReview={(session) => navigate(`/session/${session.id}/review`)}
        onIncludeReservedBenchmarkQuestions={setIncludeReservedBenchmarkQuestions}
        onClosedBookConfirmed={setClosedBookConfirmed}
        onRecommendationPreset={selectRecommendationPreset}
        onSelectionSeed={setSelectionSeed}
        onRegenerateSeed={regenerateSelectionSeed}
        onSavePrescription={savePrescription}
        onLoadPrescription={loadPrescription}
        onDeletePrescription={deletePyqPrescription}
        onPracticeEvidenceSubset={practiceEvidenceSubset}
        onAddEvidenceToRecovery={(questionUids) => void addEvidenceToRecovery(questionUids)}
        onAnalyzeEvidenceFirst={analyzeEvidenceFirst}
        onPlanEvidenceRepair={planEvidenceRepair}
        onTryEvidenceTransfer={tryEvidenceTransfer}
        onStart={() => void startPractice()}
      />
    );
  }

  if (finished) {
    const graded = completed.filter((attempt) => attempt.mark_correct != null);
    const correct = graded.filter((attempt) => attempt.mark_correct).length;
    const skipped = completed.filter((attempt) => attempt.mark_decision === 'SKIP').length;
    const exactScores = aggregatePyqAttemptScores(completed);
    const completionSummary = loadedSession
      ? buildPyqSessionSummary(loadedSession, completed)
      : null;
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
          </CardBody>
        </Card>

        {completionSummary ? (
          <PyqImprovementInsights questions={completionSummary.questions} />
        ) : null}

        <Card>
          <CardBody className="p-6 sm:p-8">
            <section aria-labelledby="practice-next-step">
              <h3 id="practice-next-step" className="font-display text-[17px] font-bold text-text">
                What would you like to do next?
              </h3>
              <p className="mt-1 text-[12px] text-text-muted">
                This session is already saved. Choose the destination that matches your next task.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {pyqSessionId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/session/${pyqSessionId}/review`)}
                    className="group flex min-h-[92px] items-start gap-3 rounded border border-accent bg-accent p-4 text-left text-accent-contrast shadow-key transition-all hover:-translate-y-px hover:bg-accent-hover hover:shadow-key-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint"
                  >
                    <BarChart3 size={19} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-[13.5px] font-semibold">
                        View detailed report
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed opacity-85">
                        Review your score, timing, and every submitted answer.
                      </span>
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    tryEvidenceTransfer(completed.map((attempt) => attempt.question_uid))
                  }
                  className="group flex min-h-[92px] items-start gap-3 rounded border border-success bg-success-faint p-4 text-left text-text shadow-sm transition-all hover:-translate-y-px hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-success-faint"
                >
                  <Route size={18} className="mt-0.5 shrink-0 text-success" />
                  <span>
                    <span className="u-label block text-success">Recommended next</span>
                    <span className="mt-1 block text-[13.5px] font-semibold">
                      Try fresh transfer questions
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-text-muted">
                      Test the same concepts on unseen questions—the stronger evidence of learning.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void startPractice()}
                  disabled={loading}
                  className="group flex min-h-[92px] items-start gap-3 rounded border border-border bg-bg-raised p-4 text-left text-text shadow-sm transition-all hover:-translate-y-px hover:border-border-hover hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint disabled:cursor-wait disabled:opacity-50"
                >
                  <Shuffle size={18} className="mt-0.5 shrink-0 text-ink-violet" />
                  <span>
                    <span className="block text-[13.5px] font-semibold">
                      Start a new set with the same filters
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-text-muted">
                      Pull another batch from the same subject, years, type, and history.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={exitSet}
                  className="group flex min-h-[92px] items-start gap-3 rounded border border-border bg-bg-overlay/25 p-4 text-left text-text transition-all hover:-translate-y-px hover:border-border-hover hover:bg-bg-overlay/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint"
                >
                  <SlidersHorizontal size={18} className="mt-0.5 shrink-0 text-text-muted" />
                  <span>
                    <span className="block text-[13.5px] font-semibold">
                      Choose a different set
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-text-muted">
                      Return to setup to change the mode, subject, or filters.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void repeatCurrentSet()}
                  disabled={loading}
                  className="group flex min-h-[76px] items-start gap-3 rounded border border-border bg-bg-overlay/20 p-4 text-left text-text-muted transition-colors hover:border-border-hover hover:bg-bg-overlay/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-faint disabled:cursor-wait disabled:opacity-50 sm:col-span-2"
                >
                  <RotateCcw size={17} className="mt-0.5 shrink-0 text-text-faint" />
                  <span>
                    <span className="block text-[12.5px] font-semibold text-text">
                      Repeat this exact set · secondary drill
                    </span>
                    <span className="mt-1 block text-[10.5px] leading-relaxed text-text-faint">
                      Useful for mechanics, but repetition alone does not count as transfer or
                      durable mastery.
                    </span>
                  </span>
                </button>
              </div>
            </section>
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
  const canSubmit = !!decision && (decision === 'SKIP' || hasAnswer) && !submitting && !loading;
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
          onConfidence={changeExamConfidence}
          onNavigate={navigateExam}
          onMarkAndNext={markExamForReviewAndNext}
          onClear={clearExamResponse}
          onSaveAndNext={saveExamAndNext}
          onPrevious={() => navigateExam(index - 1)}
          onSubmit={() => setExamSubmitOpen(true)}
          onPause={() => void saveSession(loadedSession)}
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
              ['Answered', paletteCounts.answered],
              ['Answered & marked for review', paletteCounts.answeredAndMarked],
              ['Not answered', paletteCounts.notAnswered],
              ['Marked for review', paletteCounts.markedForReview],
              ['Not visited', paletteCounts.notVisited]
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
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setJournalOpen(false)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text"
          >
            <ArrowLeft size={14} /> Back to answer
          </button>
          <div className="flex flex-col items-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || submitting || !loadedSession}
              onClick={() => {
                if (loadedSession) void saveSession(loadedSession);
              }}
              aria-label="Pause practice"
              aria-describedby="pyq-analysis-pause-hint"
              className="-mr-2 whitespace-nowrap"
            >
              <Pause size={14} />
              {loading ? 'Pausing…' : 'Pause practice'}
            </Button>
            <span id="pyq-analysis-pause-hint" className="text-[9.5px] text-text-faint">
              Session progress is saved
            </span>
          </div>
        </div>
        {submitError ? (
          <p role="alert" className="mb-3 text-[12px] leading-relaxed text-danger">
            {submitError}
          </p>
        ) : null}
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

  const activeQuestionWorkspace = (
    <div className="flex min-w-0 flex-col gap-4">
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
                {current.marks && (
                  <Badge>
                    {current.marks} mark{current.marks === 1 ? '' : 's'}
                  </Badge>
                )}
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
            disabled={!!submitted || submitting || loading}
            onChoices={(nextChoices) => {
              setChoices(nextChoices);
              if (nextChoices.length > 0 && (decision === null || decision === 'SKIP')) {
                setDecision('MARK');
                setConfidence('high');
              }
            }}
            onNumeric={(nextNumeric) => {
              setNumeric(nextNumeric);
              if (nextNumeric.trim().length > 0 && (decision === null || decision === 'SKIP')) {
                setDecision('MARK');
                setConfidence('high');
              }
            }}
          />
          <div className="flex flex-col gap-4 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <PracticeConfidenceButtons
              confidence={confidence}
              decision={decision}
              disabled={!!submitted || submitting || loading}
              onChange={(newConfidence, newDecision) => {
                setConfidence(newConfidence);
                setDecision(newDecision);
                if (newDecision === 'SKIP') {
                  setChoices([]);
                  setNumeric('');
                }
              }}
            />
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
                    <Button onClick={goPrevious} disabled={submitting || loading}>
                      <ArrowLeft size={15} /> Previous question
                    </Button>
                  ) : null}
                  {previouslySkipped ? (
                    <Button onClick={() => void goNext()} disabled={submitting || loading}>
                      Keep skipped & next <ArrowRight size={15} />
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <ResultPanel question={current} attempt={submitted} />
                <div className="flex flex-wrap gap-2">
                  {index > 0 ? (
                    <Button onClick={goPrevious} disabled={loading || submitting}>
                      <ArrowLeft size={15} /> Previous question
                    </Button>
                  ) : null}
                  <Button variant="primary" onClick={goNext} disabled={loading || submitting}>
                    {loadedSession?.config.practiceView === 'multiple' &&
                    questions.every((question) =>
                      completed.some((attempt) => attempt.question_uid === question.id)
                    )
                      ? 'Finish set'
                      : index + 1 === questions.length
                        ? questions.every((question) =>
                            completed.some((attempt) => attempt.question_uid === question.id)
                          )
                          ? 'Finish set'
                          : 'Next unanswered question'
                        : 'Next question'}
                    <ArrowRight size={15} />
                  </Button>
                  {journalSaved ? (
                    <Badge tone="success" className="self-center">
                      Saved to journal
                    </Badge>
                  ) : submitted.mark_correct === false ? (
                    <Button onClick={() => setJournalOpen(true)} disabled={loading || submitting}>
                      Continue analysis
                    </Button>
                  ) : (
                    <Button onClick={() => setJournalOpen(true)} disabled={loading || submitting}>
                      Analyze in Journal
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-col items-start">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || submitting || !loadedSession}
            onClick={() => {
              if (loadedSession) void saveSession(loadedSession);
            }}
            aria-label="Pause practice"
            aria-describedby="pyq-practice-pause-hint"
            className="-ml-2 whitespace-nowrap"
          >
            <Pause size={14} />
            {loading ? 'Pausing…' : 'Pause practice'}
          </Button>
          <span
            id="pyq-practice-pause-hint"
            className="hidden pl-1 text-[9.5px] text-text-faint sm:block"
          >
            Draft and active time are saved
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="u-num text-[12px] text-text-muted">
            Q {index + 1}/{questions.length}
          </span>
          <span
            role="timer"
            aria-label={`${secondsToClock(shownSeconds)} active time on this question`}
            aria-atomic="true"
            className="inline-flex items-center gap-1 font-mono text-[12px] text-text-faint"
          >
            <Clock3 size={13} />
            {secondsToClock(shownSeconds)}
          </span>
          <CalculatorTrigger onClick={() => setCalcOpen((v) => !v)} active={calcOpen} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PyqPracticeViewControl
          value={loadedSession?.config.practiceView}
          onChange={(view) => void changePracticeView(view)}
          disabled={loading || submitting}
        />
        <span className="text-[12px] text-text-muted">Feedback after each committed answer</span>
      </div>

      {submitError ? (
        <p
          role="alert"
          className="rounded border border-danger/25 bg-danger-faint px-3 py-2 text-[12px] leading-relaxed text-danger"
        >
          {submitError}
        </p>
      ) : null}

      {loadedSession?.config.practiceView === 'multiple' ? (
        <PyqPracticeSheet
          questions={questions}
          index={index}
          session={loadedSession}
          attempts={completed}
          disabled={loading || submitting}
          onNavigate={(nextIndex) => void navigatePractice(nextIndex)}
          activeQuestion={activeQuestionWorkspace}
        />
      ) : (
        activeQuestionWorkspace
      )}

      <ScientificCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />
    </div>
  );
}
