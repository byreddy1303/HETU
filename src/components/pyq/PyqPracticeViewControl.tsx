import { List, Square } from 'lucide-react';
import type { PyqSessionConfig } from '@/types';
import { cn } from '@/lib/utils';

export default function PyqPracticeViewControl({
  value = 'single',
  onChange,
  disabled = false
}: {
  value?: PyqSessionConfig['practiceView'];
  onChange: (value: 'single' | 'multiple') => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Practice view"
      className="flex flex-wrap gap-1 rounded-lg border border-border bg-bg-overlay/30 p-1"
    >
      {(
        [
          ['single', 'One question', Square],
          ['multiple', 'Multiple questions', List]
        ] as const
      ).map(([view, label, Icon]) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          disabled={disabled}
          className={cn(
            'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 sm:flex-none',
            value === view ? 'bg-accent text-accent-contrast' : 'text-text-muted hover:bg-bg-raised'
          )}
        >
          <Icon size={15} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
