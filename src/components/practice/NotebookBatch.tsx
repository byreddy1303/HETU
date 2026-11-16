import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { practiceApi, practiceError } from '@/lib/practice-coach';
import { todayISOInTimeZone } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface Item {
  number: string;
  outcome: string;
  flagged: boolean;
  note: string;
}
export default function NotebookBatch({ onSaved }: { onSaved: () => void }) {
  const { profile } = useAuth();
  const requestId = useRef(crypto.randomUUID());
  const [source, setSource] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [studiedOn, setStudiedOn] = useState(
    todayISOInTimeZone(profile?.timezone || 'Asia/Kolkata')
  );
  const [numbers, setNumbers] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const input = 'w-full rounded border border-border bg-bg-raised p-2 text-sm';
  function add() {
    const unique = [
      ...new Set(
        numbers
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ].filter((n) => !items.some((i) => i.number === n));
    if (items.length + unique.length > 100) {
      setError('Use at most 100 questions in one session.');
      return;
    }
    setItems((old) => [
      ...old,
      ...unique.map((number) => ({ number, outcome: 'unknown', flagged: false, note: '' }))
    ]);
    setNumbers('');
  }
  async function picture(file?: File) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10_000_000)
        throw new Error('Choose a PNG, JPEG or WebP photo under 10 MB.');
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This photo could not be opened.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const encoded = canvas.toDataURL('image/jpeg', 0.7);
        if (encoded.length > 700_000)
          throw new Error('This photo is still too large. Choose a smaller crop.');
        setAttachment(encoded);
      } finally {
        bitmap.close();
      }
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await practiceApi<{ count: number }>('/batches', 'POST', {
        request_id: requestId.current,
        source,
        subject,
        topic,
        studied_on: studiedOn,
        items,
        attachment
      });
      setSuccess(
        `${result.count} questions saved together. Timing and confidence were left unknown.`
      );
      setItems([]);
      setAttachment(null);
      requestId.current = crypto.randomUUID();
      onSaved();
    } catch (e) {
      setError(practiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-bg-raised p-5"
      aria-label="Notebook session logging"
    >
      <h2 className="font-display text-xl font-semibold">One entry for the whole session</h2>
      <p className="text-sm text-text-muted">
        Practised in a book or notebook? Save question numbers and outcomes together. Notes and a
        photo are optional.
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            Book or source
            <input
              className={input}
              maxLength={300}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Subject
            <input
              className={input}
              maxLength={160}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Topic (optional)
            <input
              className={input}
              maxLength={300}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Study date
            <input
              type="date"
              className={input}
              value={studiedOn}
              onChange={(e) => setStudiedOn(e.target.value)}
            />
          </label>
        </div>
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs">
            Question numbers, separated by spaces
            <input
              className={input}
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              placeholder="12 13 14 18"
            />
          </label>
          <Button disabled={!numbers.trim()} onClick={add}>
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={item.number}
              className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[60px_150px_1fr_auto]"
            >
              <span className="self-center text-sm font-medium">Q{item.number}</span>
              <label className="sr-only" htmlFor={`batch-outcome-${index}`}>
                Outcome for question {item.number}
              </label>
              <select
                id={`batch-outcome-${index}`}
                className={input}
                value={item.outcome}
                onChange={(e) =>
                  setItems((old) =>
                    old.map((v, i) => (i === index ? { ...v, outcome: e.target.value } : v))
                  )
                }
              >
                {['unknown', 'correct', 'wrong', 'skipped'].map((v) => (
                  <option key={v} value={v}>
                    {v === 'unknown' ? 'Not recorded' : v}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Note for question ${item.number}`}
                className={input}
                maxLength={1000}
                value={item.note}
                placeholder="Optional note or question text"
                onChange={(e) =>
                  setItems((old) =>
                    old.map((v, i) => (i === index ? { ...v, note: e.target.value } : v))
                  )
                }
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={item.flagged}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((v, i) => (i === index ? { ...v, flagged: e.target.checked } : v))
                    )
                  }
                />
                Revisit
              </label>
            </div>
          ))}
        </div>
        <label className="grid gap-2 text-xs">
          Attach notebook photo (optional; stored locally)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void picture(e.target.files?.[0])}
          />
        </label>
        {attachment && (
          <div>
            <img
              src={attachment}
              alt="Notebook page to attach"
              className="max-h-48 rounded border border-border"
            />
            <button
              type="button"
              className="mt-2 text-xs text-accent underline"
              onClick={() => setAttachment(null)}
            >
              Remove attachment
            </button>
          </div>
        )}
        <Button
          variant="primary"
          disabled={!source.trim() || !subject.trim() || !studiedOn || !items.length}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : `Save ${items.length || ''} questions together`}
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-success">
          {success}
        </p>
      )}
    </section>
  );
}
