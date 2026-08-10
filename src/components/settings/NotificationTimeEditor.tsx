import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { isNativeApp } from '@/lib/native';

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

  function updateNativeValue(value: number, max: number, update: (next: number) => void) {
    if (!Number.isFinite(value)) return;
    update(Math.min(max, Math.max(0, Math.trunc(value))));
  }

  function timeControl({
    id,
    ariaLabel,
    value,
    max,
    options,
    onChange,
    enterKeyHint
  }: {
    id: string;
    ariaLabel: string;
    value: number;
    max: number;
    options: typeof hourOptions;
    onChange: (next: number) => void;
    enterKeyHint: 'next' | 'done';
  }) {
    if (isNativeApp) {
      return (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => updateNativeValue(event.currentTarget.valueAsNumber, max, onChange)}
          enterKeyHint={enterKeyHint}
          autoComplete="off"
          aria-label={ariaLabel}
          disabled={disabled || saving}
          className={cn(selectClassName, 'text-center text-[16px] tabular-nums')}
        />
      );
    }

    return (
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled || saving}
        className={selectClassName}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

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
        {timeControl({
          id: `${idPrefix}-hour`,
          ariaLabel: `${label} hour`,
          value: draftHour,
          max: 23,
          options: hourOptions,
          onChange: setDraftHour,
          enterKeyHint: 'next'
        })}
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
        {timeControl({
          id: `${idPrefix}-minute`,
          ariaLabel: `${label} minute`,
          value: draftMinute,
          max: 59,
          options: minuteOptions,
          onChange: setDraftMinute,
          enterKeyHint: 'done'
        })}
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
