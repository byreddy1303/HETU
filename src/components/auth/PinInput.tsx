// Segmented 6-digit PIN input. Six single-digit cells, auto-advance on entry,
// auto-back on empty backspace, one big paste target for autofill (e.g. iOS
// SMS auto-suggest). Renders as one focus-ring so screen readers see it as a
// single field.
import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PinInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
}

export default function PinInput({
  id,
  value,
  onChange,
  disabled,
  autoFocus,
  length = 6
}: PinInputProps) {
  const cells = useMemo(() => Array.from({ length }, (_, i) => value[i] ?? ''), [value, length]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function set(idx: number, digit: string) {
    const cleaned = digit.replace(/\D/g, '').slice(0, 1);
    const next = value.split('');
    next[idx] = cleaned;
    // pad the array so join works
    for (let i = 0; i < length; i++) if (next[i] === undefined) next[i] = '';
    const joined = next.join('').slice(0, length);
    onChange(joined);
    if (cleaned && idx < length - 1) refs.current[idx + 1]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === 'Backspace' && !cells[idx] && idx > 0) {
      // move back and clear the previous cell
      const next = value.split('');
      next[idx - 1] = '';
      onChange(next.join(''));
      refs.current[idx - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      refs.current[idx - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      refs.current[idx + 1]?.focus();
      e.preventDefault();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  }

  return (
    <div id={id} role="group" aria-label="6-digit PIN" className="grid w-full grid-cols-6 gap-2">
      {cells.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          onPaste={onPaste}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`PIN digit ${i + 1}`}
          className={cn(
            'h-12 min-w-0 w-full rounded-lg border border-border bg-bg-raised text-center font-mono text-[20px] font-semibold text-text shadow-sm',
            'transition-[border-color,box-shadow]',
            'hover:border-border-hover',
            'focus:border-accent focus:shadow-[0_0_0_3px_theme(colors.accent.faint)] focus:outline-none',
            'disabled:cursor-not-allowed disabled:bg-bg-overlay disabled:opacity-60'
          )}
        />
      ))}
    </div>
  );
}
