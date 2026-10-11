import { useEffect, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import {
  createLabStorage, labPage, loadLabValues, saveLabValue,
  type LabSaveStatus, type LabStorage
} from '@/lib/lab-storage';

export default function LinearAlgebraLab() {
  const { userId } = useAuth();
  const [params] = useSearchParams();
  const [lab, setLab] = useState<{ userId: string; store: LabStorage } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<LabSaveStatus>({ pending: 0, error: null });
  const [retry, setRetry] = useState(0);
  const blocker = useBlocker(() => lab?.store.hasPending() ?? false);

  useEffect(() => {
    if (blocker.state === 'blocked' && !lab?.store.hasPending()) blocker.proceed();
  }, [blocker, lab, status.pending]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let store: LabStorage | undefined;
    setLoadError(null);
    setLab(null);
    void loadLabValues(userId).then((values) => {
      if (!active) return;
      store = createLabStorage(values, (key, value) => saveLabValue(userId, key, value),
        (next) => { if (active) setStatus(next); });
      setStatus({ pending: 0, error: null });
      setLab({ userId, store });
    }).catch((cause) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : 'Unable to load lab progress.');
    });
    return () => { active = false; store?.dispose(); };
  }, [userId, retry]);

  useEffect(() => {
    if (!lab) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!lab.store.hasPending()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const reconnect = () => { void lab.store.flush(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('online', reconnect);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', reconnect);
    };
  }, [lab]);

  return (
    <section className="flex min-h-[80dvh] flex-col gap-3" aria-label="Linear Algebra Mastery Lab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">Linear Algebra Mastery Lab</h1>
        <Link to="/topper-notes" className="text-sm text-accent underline">
          Back to notes
        </Link>
      </div>
      {loadError ? <div role="alert">
        <p>Could not load your online lab progress: {loadError}</p>
        <Button className="mt-2" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
      </div> : !lab || lab.userId !== userId ? <p role="status">Loading your online lab progress…</p> : <>
        <div role={status.error ? 'alert' : 'status'} className="text-sm text-text-muted">
          {status.error
            ? `Progress has not been saved: ${status.error}. Keep this page open and retry.`
            : status.pending ? 'Saving lab progress to your account…' : 'Lab progress is saved to your online account.'}
          {status.error && <Button className="ml-3" onClick={() => { void lab.store.flush(); }}>Retry saving</Button>}
        </div>
        {blocker.state === 'blocked' && <p role="status">Finishing your save before leaving the lab…</p>}
        <iframe title="Linear Algebra lessons and practice"
          ref={(frame) => { if (frame) Object.assign(frame, { hetuLabStorage: lab.store.storage }); }}
          src={`/gate-topper-notes/linear-algebra-lab/${labPage(params.get('module'))}?storage=online-v1`}
          className="min-h-[75dvh] flex-1 rounded-lg border border-border bg-bg" />
      </>}
    </section>
  );
}
