import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/native';

export type TagTone = 'ok' | 'slow' | 'guess' | 'wrong' | 'neutral';

const TONES: Record<TagTone, { bar: string; selected: string }> = {
  ok: { bar: 'before:bg-success', selected: 'border-success bg-success-faint' },
  slow: { bar: 'before:bg-warn', selected: 'border-warn bg-warn-faint' },
  guess: { bar: 'before:bg-guess', selected: 'border-guess bg-guess-faint' },
  wrong: { bar: 'before:bg-danger', selected: 'border-danger bg-danger-faint' },
  neutral: { bar: 'before:bg-text-faint', selected: 'border-text-muted bg-bg-overlay' }
};

/** One keyboard-selectable card in a tag step. */
export default function TagOption({
  kbd,
  label,
  hint,
  tone = 'neutral',
  selected = false,
  onSelect
}: {
  kbd: string;
  label: string;
  hint?: string;
  tone?: TagTone;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        haptic('selection');
        onSelect();
      }}
      className={cn(
        'u-tag-option relative flex w-full items-center gap-3 rounded border bg-bg-raised px-4 py-3 text-left shadow-sm transition-all duration-150',
        'before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:opacity-0 before:transition-opacity',
        TONES[tone].bar,
        selected
          ? cn('scale-[0.98] before:opacity-100', TONES[tone].selected)
          : 'border-border hover:-translate-y-px hover:border-border-hover hover:shadow-card hover:before:opacity-100 active:translate-y-0 active:scale-[0.98] active:shadow-none'
      )}
    >
      <Kbd className="shrink-0">{kbd}</Kbd>
      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="truncate text-[12px] text-text-faint">{hint}</span>}
      </span>
    </button>
  );
}
