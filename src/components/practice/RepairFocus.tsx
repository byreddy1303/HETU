import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  practiceApi,
  practiceError,
  type DrillPack,
  type PracticeOverview
} from '@/lib/practice-coach';

function nextStep(pack: DrillPack) {
  if (!pack.done)
    return Object.keys(pack.selections).length
      ? 'Resume your saved check'
      : 'Start the three-question check';
  if (pack.due) return 'Return for your scheduled check';
  if (pack.round_outcome === 'needs-independent-check')
    return `Independent check on ${pack.due_date}`;
  if (pack.round_outcome === 'needs-repair')
    return `Revisit the correction; retry on ${pack.due_date}`;
  return pack.transfer_id
    ? `Apply to fresh questions; next recall ${pack.due_date}`
    : `Next recall ${pack.due_date}; no linked bank application is available yet`;
}

export default function RepairFocus({
  view,
  onSaved
}: {
  view: PracticeOverview;
  onSaved: (view: PracticeOverview) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const focus = view.focus;
  const packs = focus.pack_ids.flatMap((id) => view.packs.find((p) => p.id === id) ?? []);
  async function toggle(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    const ids = focus.pack_ids.includes(id)
      ? focus.pack_ids.filter((key) => key !== id)
      : [...focus.pack_ids, id];
    try {
      onSaved(
        await practiceApi<PracticeOverview>('/focus', 'PUT', {
          expected_version: focus.version,
          pack_ids: ids
        })
      );
    } catch (cause) {
      setError(practiceError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Your repair focus"
      className="space-y-4 rounded-xl border border-accent/25 bg-bg-raised p-5"
    >
      <div>
        <h2 className="font-display text-xl font-semibold">Your repair focus</h2>
        <p className="mt-1 text-sm text-text-muted">
          Keep up to three targets in view. Start one; the other packs keep their dates.
        </p>
        {focus.suggested && (
          <p className="mt-1 text-xs text-text-muted">
            Suggested from unfinished checks, due dates, and linked observations. You can change
            these.
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {packs.map((pack) => (
          <div key={pack.id} className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">
              <Link to={`/practice-lab?pack=${encodeURIComponent(pack.id)}`}>{pack.title}</Link>
            </h3>
            <p className="text-xs text-text-muted">{nextStep(pack)}</p>
            <p className="text-xs text-text-muted">
              Independent rounds: {pack.independent_rounds ?? 0} · after a delay:{' '}
              {pack.independent_delayed_rounds ?? 0}
            </p>
            <Link
              className="inline-block text-sm font-semibold text-accent underline"
              to={`/practice-lab?pack=${encodeURIComponent(pack.id)}`}
            >
              {!pack.done
                ? 'Open repair'
                : pack.due
                  ? 'Open due check'
                  : 'See result and next step'}
            </Link>
            {pack.done && pack.transfer_id && (
              <Link
                className="block text-xs text-accent underline"
                to={`/memory/${encodeURIComponent(pack.transfer_id)}`}
              >
                Open linked application and follow-up
              </Link>
            )}
            {view.applications?.items
              .filter((item) => item.pack_id === pack.id && item.assistance === 'unreported')
              .slice(0, 1)
              .map((item) => (
                <Link
                  key={item.session_id}
                  className="block text-xs text-accent underline"
                  to={`/session/${encodeURIComponent(item.session_id)}/review`}
                >
                  Report conditions for saved application
                </Link>
              ))}
          </div>
        ))}
      </div>
      {!packs.length && (
        <p className="text-sm text-text-muted">
          Choose a target below when you want to work on a repair.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-accent">
          Choose focus targets ({packs.length}/3)
        </summary>
        <div className="mt-3 space-y-2">
          {view.packs.map((pack) => (
            <label key={pack.id} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={focus.pack_ids.includes(pack.id)}
                disabled={busy || (!focus.pack_ids.includes(pack.id) && packs.length >= 3)}
                onChange={() => void toggle(pack.id)}
              />
              {pack.title}
            </label>
          ))}
        </div>
      </details>
      <p className="text-xs text-text-muted">
        These counts describe recorded checks. Fresh bank application and lasting retention need
        their own evidence.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}{' '}
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload saved focus
          </Button>
        </p>
      )}
    </section>
  );
}
