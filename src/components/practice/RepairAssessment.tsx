import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  practiceApi,
  practiceError,
  REPAIR_APPROACHES,
  type DrillPack,
  type RepairDifficulty
} from '@/lib/practice-coach';

export default function RepairAssessment({
  pack,
  onSaved
}: {
  pack: DrillPack;
  onSaved: (pack: DrillPack) => void;
}) {
  const [difficulty, setDifficulty] = useState<RepairDifficulty>(
    pack.assessment?.difficulty ?? 'uncertain'
  );
  const [action, setAction] = useState(pack.assessment?.next_action ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      onSaved(
        await practiceApi<DrillPack>(`/packs/${pack.id}/assessment`, 'PUT', {
          expected_version: pack.version,
          difficulty,
          next_action: action
        })
      );
      setSaved(true);
    } catch (cause) {
      setError(practiceError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="rounded-lg border border-border p-4"
      open={(pack.unsuccessful_rounds ?? 0) >= 2 ? true : undefined}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Choose what to try next (optional)
      </summary>
      <div className="mt-3 space-y-3">
        {(pack.unsuccessful_rounds ?? 0) >= 2 && (
          <p className="text-sm text-text-muted">
            This repair has needed more than one retry. Choose a different approach before repeating
            it.
          </p>
        )}
        <label className="block text-sm">
          What needs attention?
          <select
            className="mt-2 block w-full rounded border border-border bg-bg-raised p-2"
            value={difficulty}
            disabled={busy}
            onChange={(e) => {
              setDifficulty(e.target.value as RepairDifficulty);
              setSaved(false);
            }}
          >
            {Object.entries(REPAIR_APPROACHES).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-text-muted">{REPAIR_APPROACHES[difficulty].action}</p>
        <label className="block text-sm">
          One action for the next attempt (optional)
          <input
            className="mt-2 block w-full rounded border border-border bg-bg-raised p-2"
            value={action}
            maxLength={500}
            placeholder="For example: check the assumptions before calculating"
            disabled={busy}
            onChange={(e) => {
              setAction(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save my next action'}
        </Button>
        <p className="text-xs text-text-muted">
          This is your assessment. Uncertainty is useful; no cause is inferred from your score.
        </p>
        {saved && (
          <p role="status" className="text-sm text-accent">
            Your next action is saved with this repair.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
