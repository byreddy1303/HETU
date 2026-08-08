import { cn } from '@/lib/utils';

type BrandSize = 'sm' | 'md' | 'lg';

const MARK_SIZE: Record<BrandSize, string> = {
  sm: 'h-7 w-auto',
  md: 'h-9 w-auto',
  lg: 'h-14 w-auto'
};

const WORD_SIZE: Record<BrandSize, string> = {
  sm: 'text-[15px]',
  md: 'text-[19px]',
  lg: 'text-[28px]'
};

export function BrandMark({
  className,
  decorative = false
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src="/brand/hetu-mark.png"
      alt={decorative ? '' : 'HETU logo'}
      aria-hidden={decorative || undefined}
      width={1118}
      height={805}
      decoding="async"
      draggable={false}
      className={cn('block shrink-0 select-none', className)}
    />
  );
}

export default function Brand({
  size = 'md',
  className
}: {
  size?: BrandSize;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} aria-label="HETU">
      <BrandMark className={MARK_SIZE[size]} decorative />
      <span
        aria-hidden="true"
        className={cn(
          'font-sans font-semibold uppercase leading-none tracking-[0.18em] text-text',
          WORD_SIZE[size]
        )}
      >
        HETU
      </span>
    </span>
  );
}
