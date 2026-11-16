import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import DrillPlayer from '@/components/practice/DrillPlayer';
import NotebookBatch from '@/components/practice/NotebookBatch';
import NotebookHistory from '@/components/practice/NotebookHistory';
import TrapEditor from '@/components/practice/TrapEditor';
import PracticeWrapUp from '@/components/practice/PracticeWrapUp';
import { practiceApi, practiceError, type PracticeOverview } from '@/lib/practice-coach';
import ExamStrategy from '@/components/practice/ExamStrategy';
import RepairFocus from '@/components/practice/RepairFocus';
import { useAuth } from '@/hooks/useAuth';

export default function PracticeLab() {
  const { userId } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'repairs';
  const activePack = params.get('pack');
  const [view, setView] = useState<PracticeOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [mixed, setMixed] = useState<string[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    setError('');
    void practiceApi<PracticeOverview>('', 'GET', undefined, abort.signal)
      .then(setView)
      .catch((e) => {
        if (!abort.signal.aborted) setError(practiceError(e));
      });
    return () => abort.abort();
  }, [userId, revision]);
  async function prepare() {
    setBusy(true);
    setError('');
    try {
      const result = await practiceApi<{ created: string[]; uncovered: unknown[] }>(
        '/prepare',
        'POST'
      );
      setNotice(
        result.created.length
          ? `${result.created.length} repair packs prepared from your log.`
          : 'Your existing repair packs are ready. No duplicates added.'
      );
      if (result.uncovered.length)
        setNotice(
          (n) =>
            `${n} ${result.uncovered.length} groups need individually authored exercises; their source records remain visible below.`
        );
      setRevision((n) => n + 1);
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  const due = view?.packs.filter((p) => p.due && !p.done) || [];
  const stats = view?.evidence;
  return (
    <div className="space-y-5">
      <PageHeader
        compact
        title="Practice that learns with you"
        description="Keep solving. Return to a few useful mistakes, then check what sticks."
        actions={
          <Button disabled={busy} onClick={() => void prepare()}>
            {busy ? 'Preparing…' : 'Prepare from my mistakes'}
          </Button>
        }
      />
      <nav aria-label="Practice tools" className="flex flex-wrap gap-2">
        {[
          ['repairs', 'Mistake repairs'],
          ['reviews', 'Short reviews'],
          ['traps', 'My principles'],
          ['progress', 'Evidence'],
          ['notebook', 'Notebook session']
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMixed([]);
              setParams(value === 'repairs' ? {} : { tab: value });
            }}
            aria-current={tab === value ? 'page' : undefined}
            className={`rounded-full border px-3 py-2 text-sm ${tab === value ? 'border-accent bg-accent-faint text-accent' : 'border-border text-text-muted'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="rounded border border-danger/30 p-3 text-sm text-danger">
          {error}{' '}
          <Button size="sm" onClick={() => setRevision((n) => n + 1)}>
            Retry
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-text-muted">
          {notice}
        </p>
      )}
      {view && !view.complete && (
        <p className="text-xs text-warn">
          This view uses a bounded recent history. It does not establish lifetime totals or exposure
          outside HETU.
        </p>
      )}
      {!view && !error && <p role="status">Reading your saved practice…</p>}
      {tab === 'repairs' && (
        <>
          {mixed.length > 0 ? (
            <DrillPlayer
              key={mixed[0]}
              id={mixed[0]}
              mixed
              onAnswered={() => {
                setMixed((old) => old.slice(1));
                setRevision((n) => n + 1);
              }}
            />
          ) : activePack ? (
            <DrillPlayer
              key={activePack}
              id={activePack}
              onAnswered={() => setRevision((n) => n + 1)}
            />
          ) : (
            <>
              {view?.focus && <RepairFocus view={view} onSaved={setView} />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-muted">
                  Three short problems per mistake family. Choose one pack; the rest can wait.
                </p>
                <Button
                  disabled={due.length < 2}
                  onClick={() => setMixed(due.slice(0, 6).map((p) => p.id))}
                >
                  Mix methods
                </Button>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-accent">
                  All repair packs ({view?.packs.length ?? 0})
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {view?.packs.map((pack) => (
                    <Link
                      key={pack.id}
                      to={`/practice-lab?pack=${pack.id}`}
                      className="rounded-xl border border-border bg-bg-raised p-5 transition-colors hover:border-accent"
                    >
                      <p className="text-xs text-accent">
                        {pack.done
                          ? pack.due
                            ? 'Due check'
                            : `Next check ${pack.due_date}`
                          : 'Ready to practise'}
                      </p>
                      <h2 className="mt-2 text-base font-semibold">{pack.title}</h2>
                      <p className="mt-2 text-xs text-text-muted">
                        {pack.questions.length} original problems · {pack.source_count} linked
                        observations
                      </p>
                    </Link>
                  ))}
                </div>
              </details>
              {view && !view.packs.length && (
                <p className="rounded-xl border border-border p-5 text-sm text-text-muted">
                  Prepare exercises from your saved mistakes. If there are no recorded errors yet,
                  start a practice set or log a notebook session.
                </p>
              )}
              {view?.groups
                .filter((g) => !view.packs.some((p) => p.group_id === g.id))
                .map((g) => (
                  <div key={g.id} className="rounded border border-border p-4 text-sm">
                    <strong>{g.title}</strong>
                    <p className="mt-1 text-text-muted">
                      {g.source_ids.length} observations saved. This group needs a reviewed exercise
                      set; no generic diagnosis has been substituted.
                    </p>
                  </div>
                ))}
            </>
          )}
        </>
      )}
      {tab === 'reviews' && (
        <div className="space-y-3">
          {params.get('session') ? (
            <PracticeWrapUp sessionId={params.get('session')!} />
          ) : (
            <>
              {view?.recent_sessions.map((session) => (
                <Link
                  key={session.id}
                  to={`/practice-lab?tab=reviews&session=${session.id}`}
                  className="block rounded-lg border border-border bg-bg-raised p-4 text-sm text-accent"
                >
                  {session.title}
                </Link>
              ))}
              {view && !view.recent_sessions.length && (
                <p className="text-sm text-text-muted">
                  Finish or pause a practice set to see its short review.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {tab === 'traps' && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Keep one clear principle linked to its evidence. Proposed exercise explanations appear
            after you finish the pack.
          </p>
          {view?.groups.map((group) => (
            <TrapEditor
              key={group.id}
              group={group}
              pack={view.packs.find((p) => p.group_id === group.id)}
            />
          ))}
        </div>
      )}
      {tab === 'progress' && stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                'Recorded exercise answers',
                stats.answers ? `${stats.correct}/${stats.answers}` : 'Not checked yet',
                'Correct across original micro-exercises.'
              ],
              [
                'New exercises, without reported help',
                stats.fresh ? `${stats.fresh_correct}/${stats.fresh}` : 'Not checked yet',
                'First recorded exposure to this exact exercise in this workspace.'
              ],
              [
                'Checks after at least three days',
                stats.delayed ? `${stats.delayed_correct}/${stats.delayed}` : 'Not checked yet',
                'Without reported help; may include familiar exercises.'
              ]
            ].map(([label, value, description]) => (
              <div key={label} className="rounded-xl border border-border bg-bg-raised p-5">
                <p className="text-sm font-medium">{label}</p>
                <p className="my-3 font-display text-3xl font-semibold text-accent">{value}</p>
                <p className="text-xs text-text-muted">{description}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-text-muted">
            {stats.helped ?? 0} answers used reported help. {stats.conditions_unknown} answers have
            unreported assistance. These counts do not certify mastery or a rank. Exercise novelty,
            bank application, and delayed retention are separate evidence.
          </p>
          <Link to="/skills" className="inline-block text-sm text-accent underline">
            Inspect fresh and delayed bank application
          </Link>
          <section aria-label="Linked bank application" className="space-y-3">
            <h2 className="font-display text-xl font-semibold">Application on bank questions</h2>
            <p className="text-xs text-text-muted">
              First attempts on new questions, with no reported help. Topic matching is approximate.
              Delayed counts additionally require the scheduled interval of at least three days.
            </p>
            {!view.applications?.items.length && (
              <p className="text-sm text-text-muted">
                Not checked yet. Finish an independent repair round, then open its linked fresh
                application.
              </p>
            )}
            {view.applications?.complete === false && (
              <p className="text-xs text-warn">
                History is incomplete; fresh application is not qualified from this partial scan.
              </p>
            )}
            {view.applications?.items.map((item) => (
              <div key={item.session_id} className="space-y-2 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold">
                  {view.packs.find((pack) => pack.id === item.pack_id)?.title ?? 'Linked repair'}
                </h3>
                <p className="text-sm text-text-muted">
                  {item.submitted}/{item.planned} selected questions submitted · fresh without help:{' '}
                  {item.fresh_count
                    ? `${item.fresh_correct}/${item.fresh_count}`
                    : 'Not established'}{' '}
                  · after a delay:{' '}
                  {item.delayed_count
                    ? `${item.delayed_correct}/${item.delayed_count}`
                    : 'Not checked yet'}
                </p>
                <Link
                  className="inline-block text-sm text-accent underline"
                  to={`/session/${encodeURIComponent(item.session_id)}/review`}
                >
                  {item.assistance === 'unreported'
                    ? 'Report application conditions'
                    : 'Inspect saved answers and conditions'}
                </Link>
                {item.next_review_id && (
                  <Link
                    className="ml-4 inline-block text-sm text-accent underline"
                    to={`/memory/${encodeURIComponent(item.next_review_id)}`}
                  >
                    Open next check
                  </Link>
                )}
              </div>
            ))}
          </section>
          <section aria-label="Mistake family evidence" className="space-y-3">
            <h2 className="font-display text-xl font-semibold">What keeps coming back?</h2>
            <p className="text-xs text-text-muted">
              Recent and previous answer counts show practice history, not matched difficulty. Pace
              uses correct, new exercises answered without reported help; it measures only the
              latest foreground interval, not time before a reload.
            </p>
            {view.group_progress.map((group) => (
              <div
                key={group.group_id}
                className="rounded-lg border border-border bg-bg-raised p-4"
              >
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="mt-2 text-sm text-text-muted">
                  {group.observations} linked mistake observations · latest {group.recent_correct}/
                  {group.recent_count} correct
                  {group.previous_count > 0 &&
                    ` · previous ${group.previous_correct}/${group.previous_count}`}
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  Fresh without help:{' '}
                  {group.fresh_count
                    ? `${group.fresh_correct}/${group.fresh_count}`
                    : 'Not checked yet'}
                  {' · '}After a delay without help:{' '}
                  {group.delayed_count
                    ? `${group.delayed_correct}/${group.delayed_count}`
                    : 'Not checked yet'}
                </p>
                {group.median_seconds !== null && (
                  <p className="mt-1 text-xs text-text-muted">
                    Median active interval: {Math.round(group.median_seconds)}s across{' '}
                    {group.timed_count} eligible answers.
                  </p>
                )}
              </div>
            ))}
          </section>
          <ExamStrategy />
        </>
      )}
      {tab === 'notebook' && (
        <>
          <NotebookBatch onSaved={() => setRevision((n) => n + 1)} />
          <div className="space-y-3">
            {view?.batches.map((batch) => (
              <NotebookHistory key={batch.id} batch={batch} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
