import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { practiceApi, practiceError, type PracticeOverview } from '@/lib/practice-coach';

export default function NotebookHistory({ batch }: { batch: PracticeOverview['batches'][number] }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function openPhoto() {
    setBusy(true);
    setError('');
    try {
      const saved = await practiceApi<{ attachment: string | null }>(`/batches/${batch.id}`);
      setPhoto(saved.attachment);
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border border-border bg-bg-raised p-4">
      <summary className="cursor-pointer text-sm font-medium">
        {batch.source} · {batch.studied_on} · {batch.items.length} questions
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-text-muted">
        {batch.items.map((item) => (
          <li key={item.number}>
            Q{item.number}: {item.outcome}
            {item.flagged ? ' · revisit' : ''}
            {item.note ? ` — ${item.note}` : ''}
          </li>
        ))}
      </ul>
      {batch.has_attachment && !photo && (
        <Button size="sm" className="mt-3" disabled={busy} onClick={() => void openPhoto()}>
          {busy ? 'Opening…' : 'Open notebook photo'}
        </Button>
      )}
      {photo && (
        <img
          src={photo}
          alt={`Notebook page for ${batch.source}, ${batch.studied_on}`}
          className="mt-3 max-h-[640px] max-w-full rounded object-contain"
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </details>
  );
}
