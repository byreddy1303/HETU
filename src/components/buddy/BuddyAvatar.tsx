import { cn } from '@/lib/utils';

const TONES = [
  'bg-ink-cobalt/15 text-ink-cobalt',
  'bg-ink-teal/15 text-ink-teal',
  'bg-ink-violet/15 text-ink-violet',
  'bg-ink-rose/15 text-ink-rose',
  'bg-ink-marigold/15 text-ink-marigold'
] as const;

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-[14px]',
  lg: 'h-11 w-11 text-[15px]'
} as const;

function toneFor(name: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length];
}

export function BuddyAvatar({
  name,
  size = 'md',
  online,
  className
}: {
  name: string;
  size?: keyof typeof SIZES;
  online?: boolean;
  className?: string;
}) {
  const initial = (name || '?').trim().replace(/^@/, '')[0]?.toUpperCase() ?? '?';
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden="true">
      <span
        className={cn(
          'flex items-center justify-center rounded-full font-display font-bold',
          SIZES[size],
          toneFor(name)
        )}
      >
        {initial}
      </span>
      {online !== undefined ? (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-bg-raised',
            online ? 'bg-success' : 'bg-border-hover'
          )}
        />
      ) : null}
    </span>
  );
}
