import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSkillDiagnosisDraft } from '@/hooks/useSkillDiagnosisDraft';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { prepareLocalLearningActivity } from '@/lib/local-learning-engine';
import { memoryRepairHref } from '@/lib/study-memory-practice';
import { memoryString, type StudyMemoryEntry } from '@/lib/study-memory';
import { todayISOInTimeZone } from '@/lib/utils';
import { backendConfig } from '@/lib/backend-config';
import {
  confirmDiagnosis,
  loadDiagnosis,
  loadSkills,
  reconcileSkills,
  saveSkillConditions,
  startDiagnosis,
  type Skill,
  type SkillDiagnosis,
  type SkillOverview
} from '@/lib/skill-coach';

const field = 'w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text';
const causes = [
  ['uncertain', 'Still uncertain'],
  ['recall', 'I did not know or recall the rule'],
  ['recognition', 'I missed the condition'],
  ['method', 'I chose the wrong method'],
  ['execution', 'I made a calculation or tracing slip'],
  ['time', 'I ran out of time'],
  ['none', 'I do not see a difficulty here']
];

export function SkillEvidence({ skill }: { skill: Skill }) {
  const e = skill.evidence;
  return (
    <dl className="study-skill__evidence grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-text-muted">Fresh application</dt>
        <dd>
          {e.fresh_checks
            ? `${e.accurate_fresh_checks}/${e.fresh_checks} checks accurate`
            : 'Not established'}
        </dd>
      </div>
      <div>
        <dt className="text-text-muted">Delayed application</dt>
        <dd>
          {e.delayed_checks
            ? `${e.accurate_delayed_checks}/${e.delayed_checks} checks accurate`
            : 'Not established'}
        </dd>
      </div>
      <div>
        <dt className="text-text-muted">Pace / confidence calibration</dt>
        <dd>Not established</dd>
      </div>
    </dl>
  );
}

function ResultConditions({
  result,
  condition,
  refresh
}: {
  result: StudyMemoryEntry;
  condition?: StudyMemoryEntry;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function record(assisted: boolean) {
    if (!result.session_id || busy) return;
    setBusy(true);
    setError('');
    try {
      await saveSkillConditions(result.session_id, assisted, condition?.version ?? 0);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Conditions could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {String(result.data.reliable_correct ?? 0)}/{String(result.data.planned ?? 0)} selected
        questions correct ·{' '}
        {result.data.fresh_question_check ? 'No prior recorded attempts' : 'Practice evidence'}
      </p>
      <p className="text-xs text-text-muted">
        {condition
          ? condition.data.assisted
            ? 'You reported using help.'
            : 'You reported answering without hints or notes.'
          : 'Whether you used help has not been recorded.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void record(false)}>
          Answered without help
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void record(true)}>
          Used hints or notes
        </Button>
        <Link className="self-center text-sm text-accent underline" to={`/memory/${result.id}`}>
          View evidence
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function DiagnosisForm({ initial }: { initial: SkillDiagnosis }) {
  const navigate = useNavigate();
  const localDraft = useSkillDiagnosisDraft(initial);
  const {
    result,
    draft: { answers, reasoning, confidence, assisted }
  } = localDraft;
  const [cause, setCause] = useState(
    memoryString(initial.entry.data, 'confirmed_cause') || 'uncertain'
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const completed = result.entry.state === 'completed';
  const dirty = !completed && (localDraft.dirty || localDraft.saving);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  async function save(submit: boolean, close = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await localDraft.save(submit);
      setMessage(
        submit
          ? 'Responses committed. Compare the conditions below.'
          : 'Draft saved in your local workspace.'
      );
      if (close) navigate('/skills');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your responses could not be saved.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await confirmDiagnosis(result.entry, cause);
      localDraft.accept(saved.diagnosis);
      setMessage(
        'Your assessment is saved. The linked practice uses the existing recovery schedule.'
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The follow-up could not be prepared.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const repairId = memoryString(result.entry.data, 'repair_entry_id');
  return (
    <div className="space-y-5">
      <PageHeader
        compact
        title={result.skill.title}
        description="Commit both answers before comparing the changed condition. These are rebuild teaching exercises."
      />
      <p className="text-sm text-text-muted">
        {result.skill.subject} · {result.skill.topic}
      </p>
      <fieldset disabled={busy || completed} className="space-y-5">
        {result.skill.probes.map((probe, index) => (
          <fieldset key={probe.id} className="space-y-3 rounded border border-border p-4">
            <legend className="px-1 font-semibold">Case {index + 1}</legend>
            <p>{probe.prompt}</p>
            <div className="flex flex-wrap gap-4">
              {probe.choices.map((choice, i) => (
                <label key={i} className="flex min-h-10 items-center gap-2">
                  <input
                    type="radio"
                    name={probe.id}
                    checked={answers[probe.id] === i}
                    onChange={() => localDraft.update({ answers: { ...answers, [probe.id]: i } })}
                  />
                  {choice}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="grid gap-2 text-sm">
          Which condition changed your reasoning?{' '}
          <textarea
            className={field}
            rows={3}
            maxLength={4000}
            value={reasoning}
            onChange={(event) => localDraft.update({ reasoning: event.target.value })}
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="grid gap-2 text-sm">
            Confidence before feedback
            <select
              className={field}
              value={confidence}
              onChange={(event) => localDraft.update({ confidence: event.target.value })}
            >
              <option value="unknown">Not recorded</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={assisted}
              onChange={(event) => localDraft.update({ assisted: event.target.checked })}
            />
            I used notes or help
          </label>
        </div>
      </fieldset>
      {(error || localDraft.error) && (
        <p role="alert" className="text-sm text-danger">
          {error || localDraft.error} Your current responses remain here.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {!completed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={busy || result.skill.probes.some((p) => answers[p.id] === undefined)}
            onClick={() => void save(true)}
          >
            Commit and compare
          </Button>
          <Button disabled={busy} onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button disabled={busy} onClick={() => void save(false, true)}>
            Save and return
          </Button>
          <span className="text-xs text-text-muted">
            {localDraft.saving
              ? 'Saving locally…'
              : localDraft.error
                ? 'Save needs attention'
                : dirty
                  ? 'Unsaved changes'
                  : 'Saved locally'}
          </span>
        </div>
      ) : (
        <>
          <section
            className="space-y-3 rounded border border-border p-4"
            aria-label="Contrast feedback"
          >
            <h2 className="font-display text-xl font-semibold">
              {String(result.entry.data.correct)}/{String(result.entry.data.total)} answers correct
            </h2>
            {result.skill.probes.map((probe, index) => (
              <p key={probe.id}>
                <strong>Case {index + 1}:</strong> {probe.explanation}
              </p>
            ))}
            <p>{result.skill.contrast}</p>
            <p>{result.skill.principle}</p>
            <p className="text-sm text-text-muted">
              This short check records current performance. It does not establish retention or a
              cause of difficulty.
            </p>
          </section>
          <label className="grid gap-2 text-sm">
            Your assessment
            <select
              className={field}
              value={cause}
              disabled={busy || !!repairId}
              onChange={(event) => setCause(event.target.value)}
            >
              {causes.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            {repairId ? (
              <Link to="/skills" className="text-accent underline">
                Open linked practice and progress
              </Link>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => void confirm()}>
                Save assessment and prepare practice
              </Button>
            )}
            <Link to="/skills" className="self-center text-sm text-accent underline">
              Back to skills
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function SkillStudio() {
  const { diagnosisId } = useParams();
  const [params] = useSearchParams();
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<SkillOverview | null>(null);
  const [diagnosis, setDiagnosis] = useState<SkillDiagnosis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const starting = useRef(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((old) => old + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setDiagnosis(null);
    if (!backendConfig.isLocal) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        if (diagnosisId) {
          const value = await loadDiagnosis(diagnosisId, controller.signal);
          if (!controller.signal.aborted) setDiagnosis(value);
        } else {
          await reconcileSkills();
          const value = await loadSkills(controller.signal);
          if (!controller.signal.aborted) setOverview(value);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Skill evidence could not load.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [diagnosisId, userId, revision]);
  async function start(skill: Skill) {
    if (starting.current) return;
    starting.current = true;
    setBusy(skill.id);
    setError('');
    try {
      const value = await startDiagnosis(skill.id, params.get('attempt') || undefined);
      navigate(`/skills/diagnoses/${encodeURIComponent(value.entry.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The check could not start.');
    } finally {
      starting.current = false;
      setBusy('');
    }
  }
  async function practice(repair: StudyMemoryEntry) {
    if (starting.current) return;
    starting.current = true;
    setBusy(repair.id);
    setError('');
    try {
      const session = memoryString(repair.data, 'active_session_id');
      navigate(
        session
          ? `/pyq?resumeSession=${encodeURIComponent(session)}`
          : memoryRepairHref(await prepareLocalLearningActivity(repair.id))
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Practice could not start.');
    } finally {
      starting.current = false;
      setBusy('');
    }
  }
  if (!backendConfig.isLocal)
    return <p>Skill coaching is available in the local desktop workspace.</p>;
  if (loading) return <p role="status">Loading your skill evidence…</p>;
  if (diagnosis) return <DiagnosisForm key={diagnosis.entry.id} initial={diagnosis} />;
  const today = todayISOInTimeZone(profile?.timezone ?? 'Asia/Kolkata');
  const question = params.get('question');
  const skills =
    overview?.items.filter((skill) => !question || skill.question_uids.includes(question)) ?? [];
  return (
    <div className="space-y-5">
      <PageHeader
        compact
        title="Skill practice and evidence"
        description="Check a distinction, choose a targeted repair, and follow the result over time."
        actions={<Button onClick={refresh}>Refresh evidence</Button>}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!overview?.complete && overview && (
        <p className="text-sm text-text-muted">
          This is a partial history. Open Learning Memory for older records.
        </p>
      )}
      <p className="study-evidence-note">
        Three reviewed skill areas. Application counts require no prior recorded attempts and your
        report of answering without help. No mastery or rank is inferred.
      </p>
      {question && skills.length === 0 && !error && (
        <p>
          No reviewed skill mapping is available for this question yet. Your existing reflection and
          recovery remain available.
        </p>
      )}
      {skills.map((skill) => (
        <section key={skill.id} className="study-skill space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">{skill.title}</h2>
              <p className="text-sm text-text-muted">
                {skill.subject} · {skill.mapped_count} mapped questions
              </p>
            </div>
            <Button disabled={!!busy} onClick={() => void start(skill)}>
              {skill.diagnostics.some((d) => d.state === 'draft')
                ? 'Resume contrast check'
                : 'Start contrast check'}
            </Button>
          </div>
          {skill.mapped_count < skill.mapping_count && (
            <p className="text-sm text-warning">
              Some bank questions changed and need mapping review before selection.
            </p>
          )}
          <SkillEvidence skill={skill} />
          <div className="space-y-3">
            {skill.repairs
              .filter((r) => r.state === 'open' || r.state === 'deferred')
              .map((repair) => {
                const due = memoryString(repair.data, 'due_date');
                const session = memoryString(repair.data, 'active_session_id');
                return (
                  <div
                    key={repair.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
                  >
                    <div>
                      <p className="font-medium">
                        {repair.data.activity === 'retry'
                          ? 'Retry remaining questions'
                          : 'Application check'}
                      </p>
                      <p className="text-sm text-text-muted">
                        {due && due > today ? `Scheduled ${due}` : 'Due now'} · about{' '}
                        {String(repair.data.duration_min ?? 20)} minutes
                      </p>
                    </div>
                    <Button
                      disabled={!!busy || (!!due && due > today && !session)}
                      onClick={() => void practice(repair)}
                    >
                      {session ? 'Resume practice' : 'Start selected practice'}
                    </Button>
                  </div>
                );
              })}
          </div>
          {skill.results.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Results and study conditions ({skill.results.length})
              </summary>
              <div className="mt-3 space-y-4">
                {skill.results.map((result) => (
                  <ResultConditions
                    key={result.id}
                    result={result}
                    condition={skill.conditions.find((c) => c.session_id === result.session_id)}
                    refresh={refresh}
                  />
                ))}
              </div>
            </details>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-text-muted">
              Prerequisites, source, and previous checks
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <p>Prerequisites: {skill.prerequisites.join('; ')}.</p>
              <p>{skill.review.scope}</p>
              {skill.diagnostics.map((d) => (
                <Link
                  className="block text-accent underline"
                  key={d.id}
                  to={`/skills/diagnoses/${encodeURIComponent(d.id)}`}
                >
                  {d.state === 'draft' ? 'Unfinished check' : 'Submitted check'} ·{' '}
                  {d.created_at.slice(0, 10)}
                </Link>
              ))}
            </div>
          </details>
        </section>
      ))}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/memory" className="text-accent underline">
          Learning history
        </Link>
        <Link to="/readiness" className="text-accent underline">
          Exam readiness
        </Link>
        <Link to="/planner" className="text-accent underline">
          Planner
        </Link>
      </div>
    </div>
  );
}
