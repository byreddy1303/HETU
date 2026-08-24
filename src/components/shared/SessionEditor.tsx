// Edit / delete an existing session row. Same shape everywhere it's used
// (Journal session strip, Session Review header) so the fields stay consistent.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { SessionRow } from '@/types';
import { db } from '@/lib/db';
import { deleteLocal, writeLocal } from '@/lib/sync';
import { SUBJECTS, TARGET_DURATIONS_MIN } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';

export interface SessionEditorProps {
  session: SessionRow;
  onSaved: () => void;
  onDeleted: () => void;
  onCancel: () => void;
}

export default function SessionEditor({
  session,
  onSaved,
  onDeleted,
  onCancel
}: SessionEditorProps) {
  const isPyq = session.kind === 'pyq';
  const [subject, setSubject] = useState(session.subject);
  const [date, setDate] = useState(session.date);
  const [target, setTarget] = useState<number>(session.target_duration_min);
  const [actual, setActual] = useState<number | null>(session.actual_duration_min);
  const [insight, setInsight] = useState(session.insight ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await writeLocal('sessions', {
        ...session,
        subject,
        date,
        target_duration_min: target,
        actual_duration_min: actual,
        insight: insight.trim() ? insight.trim() : null
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    setDeleting(true);
    try {
      // Orphan the questions rather than destroy them — they become standalone
      // /log entries the user can still see in the journal.
      const orphans = await db.questions.where('session_id').equals(session.id).toArray();
      for (const q of orphans) {
        await writeLocal('questions', { ...q, session_id: null });
      }
      await deleteLocal('sessions', session.id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Subject">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isPyq}>
            {!SUBJECTS.includes(subject as (typeof SUBJECTS)[number]) && (
              <option value={subject}>{subject}</option>
            )}
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} mono />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Target duration (minutes)">
          <Select
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            disabled={isPyq}
          >
            {isPyq ? (
              <option value={target}>
                {target > 0 ? `Timed PYQ exam — ${target}m` : 'Untimed PYQ set'}
              </option>
            ) : (
              TARGET_DURATIONS_MIN.map((m) => (
                <option key={m} value={m}>
                  {m}m
                </option>
              ))
            )}
          </Select>
        </Field>
        <Field label="Actual duration (minutes)">
          <Input
            type="number"
            min={0}
            value={actual ?? ''}
            onChange={(e) =>
              setActual(e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))
            }
            placeholder="Blank = in progress"
            mono
            disabled={isPyq}
          />
        </Field>
      </div>
      <Field label="Insight (optional)">
        <Textarea
          rows={2}
          value={insight}
          onChange={(e) => setInsight(e.target.value)}
          placeholder="One sentence — the takeaway from this session."
        />
      </Field>
      <div className="flex items-center justify-between border-t border-danger/25 pt-3">
        {isPyq ? (
          <span className="text-[12px] text-text-faint">
            PYQ session lifecycle and duration come from its audited practice set.
          </span>
        ) : confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-danger">
              Questions in this session will become standalone entries.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void del()}
              disabled={deleting}
              className="text-danger hover:text-danger"
            >
              {deleting ? 'Deleting…' : 'Confirm delete'}
            </Button>
          </div>
        ) : (
          <>
            <span className="text-[12px] text-text-faint">Deleting keeps question data.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              className="text-danger hover:text-danger"
            >
              <Trash2 size={14} strokeWidth={1.75} className="mr-1" />
              Delete session
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={onCancel} disabled={saving || deleting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving || deleting}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="u-label">{label}</span>
      {children}
    </div>
  );
}
