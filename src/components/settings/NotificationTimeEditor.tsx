import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const hourOptions = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: String(hour).padStart(2, '0')
}));

const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({
  value: minute,
  label: String(minute).padStart(2, '0')
}));

interface Props {
  idPrefix: string;
  label: string;
  hour: number;
  minute: number;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  onSave: (hour: number, minute: number) => Promise<boolean>;
}

export default function NotificationTimeEditor({
  idPrefix,
  label,
  hour,
  minute,
  disabled = false,
  compact = false,
  className,
  onSave
}: Props) {
  const [draftHour, setDraftHour] = useState(hour);
  const [draftMinute, setDraftMinute] = useState(minute);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftHour(hour);
    setDraftMinute(minute);
  }, [hour, minute]);

  const changed = draftHour !== hour || draftMinute !== minute;

  async function save() {
    if (!changed || disabled || saving) return;
    setSaving(true);
    try {
      const saved = await onSave(draftHour, draftMinute);
      if (!saved) {
        setDraftHour(hour);
        setDraftMinute(minute);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectClassName = cn(
    'block w-full rounded border bg-bg-raised font-mono text-text outline-none',
    'border-border focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    compact ? 'h-9 px-2 text-[12px]' : 'h-11 px-3 text-[14px]'
  );

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2',
        className
      )}
    >
      <label className="min-w-0" htmlFor={`${idPrefix}-hour`}>
        <span className={cn('mb-1 block text-text-faint', compact ? 'sr-only' : 'text-[11px]')}>
          Hour
        </span>
        <select
          id={`${idPrefix}-hour`}
          aria-label={`${label} hour`}
          value={draftHour}
          onChange={(event) => setDraftHour(Number(event.target.value))}
          disabled={disabled || saving}
          className={selectClassName}
        >
          {hourOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <span
        aria-hidden="true"
        className={cn(
          'font-mono font-semibold text-text-muted',
          compact ? 'pb-1.5 text-[14px]' : 'pb-2.5 text-[16px]'
        )}
      >
        :
      </span>

      <label className="min-w-0" htmlFor={`${idPrefix}-minute`}>
        <span className={cn('mb-1 block text-text-faint', compact ? 'sr-only' : 'text-[11px]')}>
          Minute
        </span>
        <select
          id={`${idPrefix}-minute`}
          aria-label={`${label} minute`}
          value={draftMinute}
          onChange={(event) => setDraftMinute(Number(event.target.value))}
          disabled={disabled || saving}
          className={selectClassName}
        >
          {minuteOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <Button
        size="sm"
        variant={changed ? 'primary' : 'secondary'}
        className={cn(compact ? 'w-10 px-0' : 'min-w-[74px]')}
        onClick={() => void save()}
        disabled={disabled || saving || !changed}
        aria-label={`Save ${label} time`}
      >
        {saving ? (
          <Loader2 size={13} className="animate-spin" />
        ) : compact ? (
          <Check size={13} />
        ) : (
          'Save'
        )}
      </Button>
    </div>
  );
}
